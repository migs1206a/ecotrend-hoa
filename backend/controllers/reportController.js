const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const User = require('../models/User');
const Visitor = require('../models/Visitor');
const EntryLog = require('../models/EntryLog');
const Billing = require('../models/Billing');
const Complaint = require('../models/Complaint');
const FacilityReservation = require('../models/FacilityReservation');
const Admin = require('../models/Admin');
const MasterAdmin = require('../models/MasterAdmin');
const ReportArchive = require('../models/ReportArchive');
const { parsePagination, sendPaginatedResponse } = require('../utils/pagination');
const { storeUploadedFile } = require('../utils/fileStorage');
const { buildBrandedReportPdf } = require('../utils/brandedPdf');
const { buildDateRangeFilter, isWithinDateRange, normalizeDateRange } = require('../utils/dateRange');

const isAdminRole = (role) => ['ADMIN', 'MASTER_ADMIN'].includes(role);

const formatReportLabel = (header) =>
  String(header || '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^./, (letter) => letter.toUpperCase())
    .trim();

const buildReportPdf = (reportData, generatedByName, options = {}) =>
  buildBrandedReportPdf({
    title: reportData.title,
    generatedOn: options.generatedOn || new Date(),
    generatedBy: generatedByName || 'ADMIN',
    filename: options.filename || '',
    scope: reportData.scope,
    columns: reportData.columns || reportData.headers.map((header) => ({
      key: header,
      label: formatReportLabel(header),
      width: 100
    })),
    rows: reportData.rows,
    summaryItems: reportData.summaryItems,
    emptyMessage: 'No records available'
  });

const formatDateTime = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const formatDateOnly = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: '2-digit'
  });
};

const formatCurrency = (value) => {
  const amount = Number(value) || 0;
  return `PHP ${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};

const countByValue = (rows, key, expectedValue) => {
  const expected = String(expectedValue || '').toLowerCase();
  return rows.filter((row) => String(row[key] || '').toLowerCase() === expected).length;
};

const sumNumber = (rows, key) =>
  rows.reduce((total, row) => total + (Number(row[key]) || 0), 0);

const BILLING_MONTH_INDEX = Object.freeze({
  JANUARY: 0,
  FEBRUARY: 1,
  MARCH: 2,
  APRIL: 3,
  MAY: 4,
  JUNE: 5,
  JULY: 6,
  AUGUST: 7,
  SEPTEMBER: 8,
  OCTOBER: 9,
  NOVEMBER: 10,
  DECEMBER: 11
});

const formatDateForName = (value = new Date()) => {
  const date = new Date(value);
  const pad = (part) => String(part).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join('');
};

const formatCoverageLabel = (coverage = {}) => (
  coverage?.hasRange
    ? `${formatDateOnly(coverage.start)} to ${formatDateOnly(coverage.end)}`
    : 'All dates'
);

const buildCoverageScope = (baseScope, coverage = {}, dateLabel = 'record dates') => (
  coverage?.hasRange
    ? `${baseScope} Coverage by ${dateLabel}: ${formatCoverageLabel(coverage)}.`
    : baseScope
);

const buildStoredReportFile = async (filename, fileBase, pdfContent) => {
  const pdfBuffer = Buffer.from(pdfContent, 'binary');

  return storeUploadedFile(
    {
      originalname: filename,
      mimetype: 'application/pdf',
      size: pdfBuffer.length,
      buffer: pdfBuffer
    },
    {
      folder: 'ecotrend-hoa/report-archives',
      localDir: 'uploads/report-archives',
      prefix: fileBase,
      resourceType: 'raw'
    }
  );
};

const getLocalArchivePath = (archive) => {
  if (archive?.file?.storage === 'local' && archive.file.path?.startsWith('/uploads/')) {
    return path.join(__dirname, '..', archive.file.path.replace(/^\//, ''));
  }

  if (archive?.filePath) {
    return archive.filePath;
  }

  return '';
};

const downloadRemoteFile = (url, redirectCount = 0) =>
  new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(new Error('Too many redirects while downloading archived report'));
      return;
    }

    const client = String(url).startsWith('https:') ? https : http;

    const request = client.get(url, (response) => {
      const statusCode = response.statusCode || 0;

      if ([301, 302, 303, 307, 308].includes(statusCode) && response.headers.location) {
        response.resume();
        const nextUrl = new URL(response.headers.location, url).toString();
        resolve(downloadRemoteFile(nextUrl, redirectCount + 1));
        return;
      }

      if (statusCode < 200 || statusCode >= 300) {
        response.resume();
        reject(new Error(`Remote archive download failed with status ${statusCode}`));
        return;
      }

      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        resolve({
          buffer: Buffer.concat(chunks),
          contentType: response.headers['content-type'] || 'application/octet-stream'
        });
      });
    });

    request.on('error', reject);
  });

const resolveAdminName = async (userId, role) => {
  if (!userId) return role || 'ADMIN';

  if (role === 'MASTER_ADMIN') {
    const masterAdmin = await MasterAdmin.findById(userId).select('username').lean();
    return masterAdmin?.username || 'MASTER_ADMIN';
  }

  const admin = await Admin.findById(userId).select('username').lean();
  return admin?.username || role || 'ADMIN';
};

const buildResidentsReport = async (coverage = {}) => {
  const residents = (await User.find({ isApproved: true, deletedAt: null }).lean())
    .filter((resident) => isWithinDateRange(resident.createdAt, coverage));
  const headers = [
    'residentName',
    'username',
    'email',
    'address',
    'street',
    'phoneNumber',
    'familyMembersCount',
    'vehiclesCount',
    'joinedAt'
  ];

  const rows = residents.map((resident) => ({
    residentName: resident.familyName || '',
    username: resident.username || '',
    email: resident.email || '',
    address: resident.houseAddress || '',
    street: resident.street || '',
    phoneNumber: resident.phoneNumber || '',
    familyMembersCount: resident.familyMembers?.length || 0,
    vehiclesCount: resident.vehicles?.filter((vehicle) => !vehicle.deletedAt).length || 0,
    joinedAt: formatDateTime(resident.createdAt)
  }));
  const totalFamilyMembers = sumNumber(rows, 'familyMembersCount');
  const totalVehicles = sumNumber(rows, 'vehiclesCount');
  const streetsCovered = new Set(rows.map((row) => row.street).filter(Boolean)).size;

  return {
    title: 'Residents Report',
    scope: buildCoverageScope(
      'Approved resident accounts currently registered in the HOA system.',
      coverage,
      'join dates'
    ),
    headers,
    columns: [
      { key: 'residentName', label: 'Resident / Family', width: 130 },
      { key: 'address', label: 'House Address', width: 135 },
      { key: 'street', label: 'Street', width: 85 },
      { key: 'phoneNumber', label: 'Contact No.', width: 85 },
      { key: 'email', label: 'Email', width: 145 },
      { key: 'familyMembersCount', label: 'Family Members', width: 58, align: 'right' },
      { key: 'vehiclesCount', label: 'Vehicles', width: 50, align: 'right' },
      { key: 'joinedAt', label: 'Joined', width: 92 }
    ],
    rows,
    summaryItems: [
      { label: 'Approved Residents', value: String(rows.length) },
      { label: 'Family Members', value: String(totalFamilyMembers) },
      { label: 'Registered Vehicles', value: String(totalVehicles) },
      { label: 'Streets Covered', value: String(streetsCovered) },
      { label: 'Coverage', value: formatCoverageLabel(coverage) }
    ]
  };
};

const buildVisitorsReport = async (coverage = {}) => {
  const visitors = (await Visitor.find({}).sort({ createdAt: -1 }).lean())
    .filter((visitor) => isWithinDateRange(visitor.entryTime || visitor.expectedDate || visitor.createdAt, coverage));
  const headers = [
    'visitorName',
    'purpose',
    'hostResident',
    'hostAddress',
    'contactNumber',
    'vehiclePlateNumber',
    'vehicleType',
    'status',
    'expectedDate',
    'entryTime',
    'exitTime',
    'createdAt'
  ];

  const rows = visitors.map((visitor) => ({
    visitorName: visitor.name || '',
    purpose: visitor.purpose || '',
    hostResident: visitor.hostResidentName || '',
    hostAddress: visitor.hostResidentAddress || '',
    contactNumber: visitor.contactNumber || '',
    vehiclePlateNumber: visitor.vehiclePlateNumber || '',
    vehicleType: visitor.vehicleType || '',
    status: visitor.status || '',
    expectedDate: formatDateTime(visitor.expectedDate),
    entryTime: formatDateTime(visitor.entryTime),
    exitTime: formatDateTime(visitor.exitTime),
    createdAt: formatDateTime(visitor.createdAt)
  }));
  const enteredCount = rows.filter((row) => Boolean(row.entryTime)).length;
  const exitedCount = rows.filter((row) => Boolean(row.exitTime)).length;

  return {
    title: 'Visitors Report',
    scope: buildCoverageScope(
      'All visitor records, including scheduled, active, and completed visits.',
      coverage,
      'visit dates'
    ),
    headers,
    columns: [
      { key: 'visitorName', label: 'Visitor', width: 115 },
      { key: 'hostResident', label: 'Host Resident', width: 115 },
      { key: 'hostAddress', label: 'Host Address', width: 140 },
      { key: 'purpose', label: 'Purpose', width: 110 },
      { key: 'status', label: 'Status', width: 65 },
      { key: 'expectedDate', label: 'Expected', width: 90 },
      { key: 'entryTime', label: 'Entry Time', width: 90 },
      { key: 'exitTime', label: 'Exit Time', width: 90 },
      { key: 'vehiclePlateNumber', label: 'Plate No.', width: 70 }
    ],
    rows,
    summaryItems: [
      { label: 'Visitor Records', value: String(rows.length) },
      { label: 'With Entry Time', value: String(enteredCount) },
      { label: 'With Exit Time', value: String(exitedCount) },
      { label: 'Open Visits', value: String(Math.max(0, enteredCount - exitedCount)) },
      { label: 'Coverage', value: formatCoverageLabel(coverage) }
    ]
  };
};

const buildBillingReport = async (coverage = {}) => {
  const billings = await Billing.find({})
    .populate('residentId', 'familyName username houseAddress street phoneNumber')
    .lean();

  const headers = [
    'residentName',
    'username',
    'address',
    'year',
    'month',
    'monthlyDue',
    'paid',
    'paymentStatus',
    'paymentMethod',
    'orNumber',
    'datePaid',
    'remarks'
  ];

  const rows = [];

  billings.forEach((billing) => {
    const resident = billing.residentId || {};
    Object.entries(billing.months || {}).forEach(([month, monthRecord]) => {
      const monthIndex = BILLING_MONTH_INDEX[String(month || '').toUpperCase()];
      const billingLineDate = Number.isInteger(monthIndex)
        ? new Date(Number(billing.year) || 0, monthIndex, 1)
        : null;

      if (!isWithinDateRange(billingLineDate, coverage)) {
        return;
      }

      const monthlyDue = Number(billing.monthlyDue) || 0;
      rows.push({
        residentName: resident.familyName || '',
        username: resident.username || '',
        address: [resident.houseAddress, resident.street].filter(Boolean).join(', '),
        year: billing.year,
        month,
        monthlyDue: formatCurrency(monthlyDue),
        monthlyDueAmount: monthlyDue,
        paid: monthRecord?.paid ? 'Yes' : 'No',
        paymentStatus: monthRecord?.paymentStatus || 'none',
        paymentMethod: monthRecord?.paymentMethod || '',
        orNumber: monthRecord?.orNumber || '',
        datePaid: formatDateOnly(monthRecord?.datePaid),
        remarks: monthRecord?.remarks || ''
      });
    });
  });
  const paidCount = rows.filter((row) => row.paid === 'Yes').length;
  const totalExpected = sumNumber(rows, 'monthlyDueAmount');
  const totalCollected = rows
    .filter((row) => row.paid === 'Yes')
    .reduce((total, row) => total + (Number(row.monthlyDueAmount) || 0), 0);

  return {
    title: 'Billing Report',
    scope: buildCoverageScope(
      'Monthly HOA dues generated from all resident billing records.',
      coverage,
      'bill dates'
    ),
    headers,
    columns: [
      { key: 'residentName', label: 'Resident', width: 115 },
      { key: 'address', label: 'Address', width: 145 },
      { key: 'year', label: 'Year', width: 45, align: 'right' },
      { key: 'month', label: 'Month', width: 62 },
      { key: 'monthlyDue', label: 'Monthly Due', width: 78, align: 'right' },
      { key: 'paid', label: 'Paid', width: 45, align: 'center' },
      { key: 'paymentStatus', label: 'Status', width: 75 },
      { key: 'paymentMethod', label: 'Method', width: 75 },
      { key: 'orNumber', label: 'O.R. No.', width: 72 },
      { key: 'datePaid', label: 'Date Paid', width: 82 },
      { key: 'remarks', label: 'Remarks', width: 115 }
    ],
    rows,
    summaryItems: [
      { label: 'Billing Lines', value: String(rows.length) },
      { label: 'Paid Lines', value: String(paidCount) },
      { label: 'Unpaid Lines', value: String(rows.length - paidCount) },
      { label: 'Expected Amount', value: formatCurrency(totalExpected) },
      { label: 'Collected Amount', value: formatCurrency(totalCollected) },
      { label: 'Outstanding', value: formatCurrency(Math.max(0, totalExpected - totalCollected)) },
      { label: 'Coverage', value: formatCoverageLabel(coverage) }
    ]
  };
};

const buildEntryLogsReport = async (coverage = {}) => {
  const entryLogs = await EntryLog.find(buildDateRangeFilter('timestamp', coverage))
    .populate('guardOnDuty', 'username fullName')
    .populate('residentId', 'familyName houseAddress street phoneNumber')
    .sort({ timestamp: -1 })
    .lean();

  const headers = [
    'timestamp',
    'logType',
    'plateNumber',
    'vehicleOwnerType',
    'ownerName',
    'residentName',
    'residentAddress',
    'vehicleType',
    'vehicleColor',
    'guardOnDuty',
    'notes'
  ];

  const rows = entryLogs.map((log) => ({
    timestamp: formatDateTime(log.timestamp),
    logType: log.logType || '',
    plateNumber: log.plateNumber || '',
    vehicleOwnerType: log.vehicleOwnerType || '',
    ownerName: log.ownerName || '',
    residentName: log.residentName || log.residentId?.familyName || '',
    residentAddress:
      log.residentAddress ||
      [log.residentId?.houseAddress, log.residentId?.street].filter(Boolean).join(', '),
    vehicleType: log.vehicleType || '',
    vehicleColor: log.vehicleColor || '',
    guardOnDuty: log.guardOnDuty?.fullName || log.guardOnDuty?.username || '',
    notes: log.notes || ''
  }));
  const entryCount = rows.filter((row) => /entry/i.test(row.logType)).length;
  const exitCount = rows.filter((row) => /exit/i.test(row.logType)).length;

  return {
    title: 'Entry and Exit Logs Report',
    scope: buildCoverageScope(
      'Security gate entry and exit records sorted from newest to oldest.',
      coverage,
      'log dates'
    ),
    headers,
    columns: [
      { key: 'timestamp', label: 'Timestamp', width: 95 },
      { key: 'logType', label: 'Type', width: 55 },
      { key: 'plateNumber', label: 'Plate No.', width: 75 },
      { key: 'vehicleOwnerType', label: 'Owner Type', width: 78 },
      { key: 'ownerName', label: 'Owner / Driver', width: 105 },
      { key: 'residentName', label: 'Resident', width: 100 },
      { key: 'residentAddress', label: 'Resident Address', width: 135 },
      { key: 'vehicleType', label: 'Vehicle', width: 65 },
      { key: 'guardOnDuty', label: 'Guard', width: 95 },
      { key: 'notes', label: 'Notes', width: 115 }
    ],
    rows,
    summaryItems: [
      { label: 'Total Logs', value: String(rows.length) },
      { label: 'Entry Logs', value: String(entryCount) },
      { label: 'Exit Logs', value: String(exitCount) },
      { label: 'Unclassified Logs', value: String(Math.max(0, rows.length - entryCount - exitCount)) },
      { label: 'Coverage', value: formatCoverageLabel(coverage) }
    ]
  };
};

const buildComplaintsReport = async (coverage = {}) => {
  const complaints = await Complaint.find(buildDateRangeFilter('createdAt', coverage)).sort({ createdAt: -1 }).lean();
  const headers = [
    'complaintType',
    'category',
    'urgency',
    'complainantName',
    'complainantAddress',
    'againstPersonName',
    'subject',
    'location',
    'message',
    'status',
    'adminResponse',
    'internalRemarks',
    'hasPhoto',
    'isArchived',
    'submittedAt'
  ];

  const rows = complaints.map((complaint) => ({
    complaintType: complaint.complaintType || '',
    category: complaint.category || '',
    urgency: complaint.urgency || '',
    complainantName: complaint.complainantName || '',
    complainantAddress: complaint.complainantAddress || '',
    againstPersonName: complaint.againstPersonName || '',
    subject: complaint.subject || '',
    location: complaint.location || '',
    message: complaint.message || '',
    status: complaint.status || '',
    adminResponse: complaint.adminResponse || '',
    internalRemarks: complaint.internalRemarks || '',
    hasPhoto: complaint.photo?.path ? 'Yes' : 'No',
    isArchived: complaint.isArchived ? 'Yes' : 'No',
    submittedAt: formatDateTime(complaint.createdAt)
  }));
  const pendingCount = countByValue(rows, 'status', 'pending');
  const resolvedCount = countByValue(rows, 'status', 'resolved');
  const archivedCount = rows.filter((row) => row.isArchived === 'Yes').length;
  const highUrgencyCount = rows.filter((row) => /high|urgent|critical/i.test(row.urgency)).length;

  return {
    title: 'Complaints Report',
    scope: buildCoverageScope(
      'Resident complaint records, statuses, response indicators, and supporting evidence flags.',
      coverage,
      'submission dates'
    ),
    headers,
    columns: [
      { key: 'submittedAt', label: 'Submitted', width: 92 },
      { key: 'complaintType', label: 'Type', width: 78 },
      { key: 'category', label: 'Category', width: 78 },
      { key: 'urgency', label: 'Urgency', width: 62 },
      { key: 'complainantName', label: 'Complainant', width: 105 },
      { key: 'againstPersonName', label: 'Reported Person', width: 105 },
      { key: 'subject', label: 'Subject', width: 130 },
      { key: 'location', label: 'Location', width: 95 },
      { key: 'status', label: 'Status', width: 70 },
      { key: 'hasPhoto', label: 'Evidence', width: 58, align: 'center' },
      { key: 'isArchived', label: 'Archived', width: 58, align: 'center' }
    ],
    rows,
    summaryItems: [
      { label: 'Total Complaints', value: String(rows.length) },
      { label: 'Pending', value: String(pendingCount) },
      { label: 'Resolved', value: String(resolvedCount) },
      { label: 'High Urgency', value: String(highUrgencyCount) },
      { label: 'With Evidence', value: String(rows.filter((row) => row.hasPhoto === 'Yes').length) },
      { label: 'Archived', value: String(archivedCount) },
      { label: 'Coverage', value: formatCoverageLabel(coverage) }
    ]
  };
};

const buildFacilitiesReport = async (coverage = {}) => {
  const reservations = await FacilityReservation.find(buildDateRangeFilter('dateReserved', coverage))
    .sort({ createdAt: -1 })
    .lean();

  const headers = [
    'facilityName',
    'eventType',
    'residentName',
    'residentAddress',
    'dateReserved',
    'endDateTime',
    'durationHours',
    'numberOfGuests',
    'purpose',
    'hourlyRate',
    'totalAmount',
    'paymentRequired',
    'paymentMethod',
    'paymentStatus',
    'status',
    'isPaid',
    'approvedBy',
    'approvedAt',
    'rejectionReason',
    'createdAt'
  ];

  const rows = reservations.map((reservation) => ({
    facilityName: reservation.facilityName || '',
    eventType: reservation.eventType || '',
    residentName: reservation.residentName || '',
    residentAddress: reservation.residentAddress || '',
    dateReserved: formatDateTime(reservation.dateReserved),
    endDateTime: formatDateTime(reservation.endDateTime),
    durationHours: reservation.durationHours ?? '',
    numberOfGuests: reservation.numberOfGuests ?? '',
    purpose: reservation.purpose || '',
    hourlyRate: formatCurrency(reservation.hourlyRate),
    totalAmount: formatCurrency(reservation.totalAmount),
    totalAmountValue: Number(reservation.totalAmount) || 0,
    paymentRequired: reservation.paymentRequired ? 'Yes' : 'No',
    paymentMethod: reservation.paymentMethod || '',
    paymentStatus: reservation.paymentStatus || '',
    status: reservation.status || '',
    isPaid: reservation.isPaid ? 'Yes' : 'No',
    approvedBy: reservation.approvedBy || '',
    approvedAt: formatDateTime(reservation.approvedAt),
    rejectionReason: reservation.rejectionReason || '',
    createdAt: formatDateTime(reservation.createdAt)
  }));
  const approvedCount = countByValue(rows, 'status', 'approved');
  const pendingCount = countByValue(rows, 'status', 'pending');
  const paidCount = rows.filter((row) => row.isPaid === 'Yes').length;

  return {
    title: 'Facility Reservations Report',
    scope: buildCoverageScope(
      'All facility reservation requests, payment status, approval details, and event schedules.',
      coverage,
      'reservation dates'
    ),
    headers,
    columns: [
      { key: 'facilityName', label: 'Facility', width: 88 },
      { key: 'eventType', label: 'Event Type', width: 82 },
      { key: 'residentName', label: 'Resident', width: 105 },
      { key: 'residentAddress', label: 'Address', width: 125 },
      { key: 'dateReserved', label: 'Start', width: 92 },
      { key: 'endDateTime', label: 'End', width: 92 },
      { key: 'durationHours', label: 'Hours', width: 45, align: 'right' },
      { key: 'numberOfGuests', label: 'Guests', width: 48, align: 'right' },
      { key: 'totalAmount', label: 'Amount', width: 75, align: 'right' },
      { key: 'paymentStatus', label: 'Payment', width: 70 },
      { key: 'status', label: 'Status', width: 70 },
      { key: 'approvedBy', label: 'Approved By', width: 80 }
    ],
    rows,
    summaryItems: [
      { label: 'Reservations', value: String(rows.length) },
      { label: 'Approved', value: String(approvedCount) },
      { label: 'Pending', value: String(pendingCount) },
      { label: 'Paid', value: String(paidCount) },
      { label: 'Total Guests', value: String(sumNumber(rows, 'numberOfGuests')) },
      { label: 'Total Amount', value: formatCurrency(sumNumber(rows, 'totalAmountValue')) },
      { label: 'Coverage', value: formatCoverageLabel(coverage) }
    ]
  };
};

const reportBuilders = {
  residents: buildResidentsReport,
  visitors: buildVisitorsReport,
  entry_logs: buildEntryLogsReport,
  billing: buildBillingReport,
  complaints: buildComplaintsReport,
  facilities: buildFacilitiesReport
};

exports.getArchivedReports = async (req, res) => {
  try {
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({ message: 'Only admins can access archived reports' });
    }

    const reportType = req.query.type;
    const filter = reportType && reportBuilders[reportType] ? { reportType } : {};
    const pagination = parsePagination(req.query);
    const query = ReportArchive.find(filter).sort({ createdAt: -1 }).lean();

    if (pagination.enabled) {
      const [items, total] = await Promise.all([
        query.clone().skip(pagination.skip).limit(pagination.limit),
        ReportArchive.countDocuments(filter)
      ]);
      return sendPaginatedResponse(res, pagination, items, total);
    }

    const archives = await query;
    res.json(archives);
  } catch (error) {
    console.error('Error fetching archived reports:', error);
    res.status(500).json({ message: 'Failed to fetch archived reports' });
  }
};

exports.generateReport = async (req, res) => {
  try {
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({ message: 'Only admins can generate reports' });
    }

    const reportType = req.body?.reportType;
    const buildReport = reportBuilders[reportType];

    if (!buildReport) {
      return res.status(400).json({ message: 'Invalid report type' });
    }

    const coverage = normalizeDateRange(req.body, { label: 'report coverage' });
    if (coverage.error) {
      return res.status(400).json({ message: coverage.error });
    }

    const generatedOn = new Date();
    const reportData = await buildReport(coverage);
    const timestamp = formatDateForName(generatedOn);
    const coverageTag = coverage.hasRange
      ? `${coverage.start.toISOString().slice(0, 10)}_to_${coverage.end.toISOString().slice(0, 10)}`
      : 'all-dates';
    const fileBase = `${reportType}-report-${coverageTag}-${timestamp}`;
    const filename = `${fileBase}.pdf`;

    const generatedByName = await resolveAdminName(req.user?.userId, req.user?.role);
    const pdfContent = buildReportPdf(reportData, generatedByName, { generatedOn, filename });
    const storedReportFile = await buildStoredReportFile(filename, fileBase, pdfContent);

    const archive = await ReportArchive.create({
      reportType,
      format: 'pdf',
      title: reportData.title,
      filename,
      file: storedReportFile,
      recordCount: reportData.rows.length,
      generatedByRole: req.user?.role || 'ADMIN',
      generatedByName,
      notes: `Coverage: ${formatCoverageLabel(coverage)}`
    });

    res.status(201).json({
      message: 'Report generated successfully',
      archive
    });
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({ message: 'Failed to generate report' });
  }
};

exports.downloadReport = async (req, res) => {
  try {
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({ message: 'Only admins can download archived reports' });
    }

    const archive = await ReportArchive.findById(req.params.id).lean();
    if (!archive) {
      return res.status(404).json({ message: 'Report archive not found' });
    }

    const remoteArchiveUrl = archive.file?.storage === 'cloudinary' ? archive.file.path : '';
    if (remoteArchiveUrl) {
      const remoteFile = await downloadRemoteFile(remoteArchiveUrl);
      res.setHeader('Content-Type', archive.file?.mimetype || remoteFile.contentType || 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${archive.filename}"`);
      return res.send(remoteFile.buffer);
    }

    const localArchivePath = getLocalArchivePath(archive);
    if (!localArchivePath || !fs.existsSync(localArchivePath)) {
      return res.status(404).json({ message: 'Archived report file no longer exists' });
    }

    return res.download(localArchivePath, archive.filename);
  } catch (error) {
    console.error('Error downloading report:', error);
    res.status(500).json({ message: 'Failed to download report' });
  }
};
