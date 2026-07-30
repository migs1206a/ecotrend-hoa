const AdminBillAuditLog = require('../models/AdminBillAuditLog');
const { parsePagination, sendPaginatedResponse } = require('../utils/pagination');
const { buildBrandedReportPdf } = require('../utils/brandedPdf');
const { buildDateRangeFilter, normalizeDateRange } = require('../utils/dateRange');
const { storeUploadedFile, deleteStoredFile } = require('../utils/fileStorage');

const buildActorSnapshot = (user = {}) => ({
  userId: String(user.userId || user.id || user._id || ''),
  username: String(user.username || '').trim(),
  fullName: String(user.fullName || '').trim(),
  role: String(user.role || '').trim(),
  position: String(user.position || '').trim()
});

const normalizePayload = (body = {}) => ({
  billName: String(body.billName || '').trim(),
  amount: Number(body.amount),
  billDate: body.billDate ? new Date(body.billDate) : new Date(),
  notes: String(body.notes || '').trim().slice(0, 500)
});

const validatePayload = ({ billName, amount, billDate }) => {
  if (!billName) {
    return 'Bill name is required';
  }

  if (billName.length > 120) {
    return 'Bill name must be 120 characters or fewer';
  }

  if (!Number.isFinite(amount) || amount < 0) {
    return 'Amount must be 0 or greater';
  }

  if (Number.isNaN(billDate.getTime())) {
    return 'A valid bill date is required';
  }

  return '';
};

const parseBooleanField = (value) => {
  if (value === true || value === 'true') {
    return true;
  }

  if (value === false || value === 'false') {
    return false;
  }

  return null;
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

const formatCurrency = (value) => {
  const amount = Number(value) || 0;
  return `PHP ${amount.toLocaleString('en-PH', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};

const formatDateForFileName = (value = new Date()) => {
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

const formatCoverageLabel = (coverage) => (
  coverage?.hasRange
    ? `${formatDateOnly(coverage.start)} to ${formatDateOnly(coverage.end)}`
    : 'All dates'
);

const getActorDisplayName = (actor = {}, fallback = 'Officer') =>
  String(actor.fullName || actor.username || fallback).trim() || fallback;

const buildBillAuditReportRows = (logs = []) =>
  logs.map((log) => ({
    billName: log.billName || '',
    billDate: formatDateOnly(log.billDate),
    amount: formatCurrency(log.amount),
    amountValue: Number(log.amount) || 0,
    paymentStatus: log.isPaid ? 'Paid' : 'Unpaid',
    paidDate: log.paidAt ? formatDateTime(log.paidAt) : '-',
    paidBy: log.isPaid ? getActorDisplayName(log.paidBy, 'Recorded as paid') : '-',
    receipt: log.receipt?.path ? 'Uploaded' : '-',
    recordedBy: getActorDisplayName(log.createdBy),
    lastUpdated: formatDateTime(log.updatedAt || log.createdAt),
    notes: log.notes || '-'
  }));

const buildBillAuditPdf = (logs = [], generatedBy = 'ADMIN', coverage = {}) => {
  const rows = buildBillAuditReportRows(logs);
  const paidCount = rows.filter((row) => row.paymentStatus === 'Paid').length;
  const totalAmountValue = rows.reduce((sum, row) => sum + (Number(row.amountValue) || 0), 0);
  const paidAmountValue = logs
    .filter((log) => log.isPaid)
    .reduce((sum, log) => sum + (Number(log.amount) || 0), 0);
  const generatedOn = new Date();
  const filename = `admin-bills-audit-logs-${formatDateForFileName(generatedOn)}.pdf`;

  const pdfContent = buildBrandedReportPdf({
    title: 'Admin Bills Audit Logs Report',
    generatedOn,
    generatedBy,
    filename,
    scope: coverage?.hasRange
      ? `Admin-side bill audit log records with bill dates from ${formatCoverageLabel(coverage)}.`
      : 'All admin-side bill audit log records currently stored in the HOA system.',
    columns: [
      { key: 'billName', label: 'Bill Name', width: 118 },
      { key: 'billDate', label: 'Bill Date', width: 74 },
      { key: 'amount', label: 'Amount', width: 72, align: 'right' },
      { key: 'paymentStatus', label: 'Status', width: 58, align: 'center' },
      { key: 'paidDate', label: 'Paid Date', width: 92 },
      { key: 'paidBy', label: 'Paid By', width: 90 },
      { key: 'receipt', label: 'Receipt', width: 58, align: 'center' },
      { key: 'recordedBy', label: 'Recorded By', width: 88 },
      { key: 'lastUpdated', label: 'Last Updated', width: 92 },
      { key: 'notes', label: 'Notes', width: 120 }
    ],
    rows,
    summaryItems: [
      { label: 'Total Logged Bills', value: String(rows.length) },
      { label: 'Paid Bills', value: String(paidCount) },
      { label: 'Unpaid Bills', value: String(rows.length - paidCount) },
      { label: 'Total Amount', value: formatCurrency(totalAmountValue) },
      { label: 'Paid Amount', value: formatCurrency(paidAmountValue) },
      { label: 'Outstanding Amount', value: formatCurrency(Math.max(0, totalAmountValue - paidAmountValue)) },
      { label: 'Coverage', value: formatCoverageLabel(coverage) }
    ],
    emptyMessage: 'No admin bill audit log records available.',
    pageSize: 'a4',
    orientation: 'landscape'
  });

  return {
    filename,
    pdfBuffer: Buffer.from(pdfContent, 'binary')
  };
};

const listAdminBillAuditLogs = async (req, res) => {
  try {
    const pagination = parsePagination(req.query);
    const coverage = normalizeDateRange(req.query, { label: 'bill audit log coverage' });

    if (coverage.error) {
      return res.status(400).json({ message: coverage.error });
    }

    const filter = {
      ...buildDateRangeFilter('billDate', coverage)
    };
    const query = AdminBillAuditLog.find(filter)
      .sort({ billDate: -1, updatedAt: -1, createdAt: -1 })
      .lean();

    if (pagination.enabled) {
      const [logs, total] = await Promise.all([
        query.clone().skip(pagination.skip).limit(pagination.limit),
        AdminBillAuditLog.countDocuments(filter)
      ]);

      return sendPaginatedResponse(res, pagination, logs, total);
    }

    const logs = await query;

    return res.json(logs);
  } catch (error) {
    console.error('listAdminBillAuditLogs error:', error);
    return res.status(500).json({ message: 'Failed to load bill audit logs' });
  }
};

const createAdminBillAuditLog = async (req, res) => {
  try {
    const payload = normalizePayload(req.body);
    const validationError = validatePayload(payload);

    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const actor = buildActorSnapshot(req.user);
    const log = await AdminBillAuditLog.create({
      ...payload,
      createdBy: actor,
      updatedBy: actor
    });

    return res.status(201).json(log);
  } catch (error) {
    console.error('createAdminBillAuditLog error:', error);
    return res.status(500).json({ message: 'Failed to create bill audit log' });
  }
};

const updateAdminBillAuditLog = async (req, res) => {
  try {
    const payload = normalizePayload(req.body);
    const validationError = validatePayload(payload);

    if (validationError) {
      return res.status(400).json({ message: validationError });
    }

    const log = await AdminBillAuditLog.findById(req.params.id);

    if (!log) {
      return res.status(404).json({ message: 'Bill audit log not found' });
    }

    log.billName = payload.billName;
    log.amount = payload.amount;
    log.billDate = payload.billDate;
    log.notes = payload.notes;
    log.updatedBy = buildActorSnapshot(req.user);
    await log.save();

    return res.json(log);
  } catch (error) {
    console.error('updateAdminBillAuditLog error:', error);
    return res.status(500).json({ message: 'Failed to update bill audit log' });
  }
};

const updateAdminBillAuditLogPaymentStatus = async (req, res) => {
  try {
    const paid = parseBooleanField(req.body?.paid);

    if (paid === null) {
      return res.status(400).json({ message: 'Paid status must be true or false' });
    }

    const log = await AdminBillAuditLog.findById(req.params.id);

    if (!log) {
      return res.status(404).json({ message: 'Bill audit log not found' });
    }

    const actor = buildActorSnapshot(req.user);
    log.isPaid = paid;
    log.updatedBy = actor;

    if (paid) {
      const paidAt = req.body?.paidAt ? new Date(req.body.paidAt) : new Date();

      if (Number.isNaN(paidAt.getTime())) {
        return res.status(400).json({ message: 'A valid paid date is required' });
      }

      log.paidAt = paidAt;
      log.paidBy = actor;
    } else {
      log.paidAt = null;
      log.paidBy = {};
      if (log.receipt?.path) {
        await deleteStoredFile(log.receipt);
      }
      log.receipt = {};
    }

    await log.save();
    return res.json(log);
  } catch (error) {
    console.error('updateAdminBillAuditLogPaymentStatus error:', error);
    return res.status(500).json({ message: 'Failed to update bill payment status' });
  }
};

const uploadAdminBillAuditReceipt = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'No receipt file uploaded' });
    }

    const log = await AdminBillAuditLog.findById(req.params.id);

    if (!log) {
      return res.status(404).json({ message: 'Bill audit log not found' });
    }

    if (!log.isPaid) {
      return res.status(400).json({ message: 'Mark this bill as paid before uploading a receipt' });
    }

    if (log.receipt?.path) {
      await deleteStoredFile(log.receipt);
    }

    const storedReceipt = await storeUploadedFile(req.file, {
      folder: 'ecotrend-hoa/admin-bill-receipts',
      localDir: 'uploads/admin-bill-receipts',
      prefix: 'admin-bill-receipt',
      resourceType: req.file.mimetype === 'application/pdf' ? 'raw' : 'auto'
    });

    log.receipt = storedReceipt;
    log.updatedBy = buildActorSnapshot(req.user);
    await log.save();

    return res.json(log);
  } catch (error) {
    console.error('uploadAdminBillAuditReceipt error:', error);
    return res.status(500).json({ message: 'Failed to upload bill receipt' });
  }
};

const deleteAdminBillAuditLog = async (req, res) => {
  try {
    const log = await AdminBillAuditLog.findByIdAndDelete(req.params.id);

    if (!log) {
      return res.status(404).json({ message: 'Bill audit log not found' });
    }

    if (log.receipt?.path) {
      await deleteStoredFile(log.receipt);
    }

    return res.json({ message: 'Bill audit log deleted successfully' });
  } catch (error) {
    console.error('deleteAdminBillAuditLog error:', error);
    return res.status(500).json({ message: 'Failed to delete bill audit log' });
  }
};

const downloadAdminBillAuditLogsPdf = async (req, res) => {
  try {
    const coverage = normalizeDateRange(req.query, { label: 'bill audit log PDF coverage' });

    if (coverage.error) {
      return res.status(400).json({ message: coverage.error });
    }

    const logs = await AdminBillAuditLog.find(buildDateRangeFilter('billDate', coverage))
      .sort({ billDate: -1, updatedAt: -1, createdAt: -1 })
      .lean();

    const generatedBy = String(
      req.user?.fullName ||
      req.user?.username ||
      req.user?.role ||
      'ADMIN'
    ).trim() || 'ADMIN';

    const { filename, pdfBuffer } = buildBillAuditPdf(logs, generatedBy, coverage);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(pdfBuffer);
  } catch (error) {
    console.error('downloadAdminBillAuditLogsPdf error:', error);
    return res.status(500).json({ message: 'Failed to generate bill audit log PDF' });
  }
};

module.exports = {
  listAdminBillAuditLogs,
  createAdminBillAuditLog,
  updateAdminBillAuditLog,
  updateAdminBillAuditLogPaymentStatus,
  uploadAdminBillAuditReceipt,
  deleteAdminBillAuditLog,
  downloadAdminBillAuditLogsPdf
};
