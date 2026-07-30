const Billing = require('../models/Billing');
const BillingSetting = require('../models/BillingSetting');
const User = require('../models/User');
const { storeUploadedFile, deleteStoredFile } = require('../utils/fileStorage');
const { hasAdminModuleAccess } = require('../utils/adminPermissions');
const { parsePagination, buildPaginatedPayload } = require('../utils/pagination');

const MONTHS = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
];
const DEFAULT_MONTHLY_DUE = 150;

const normalizeOccupancyType = (value) =>
  String(value || '').toLowerCase() === 'renter' ? 'renter' : 'permanent';

const getDueMapForOccupancyType = (settings, occupancyType) =>
  normalizeOccupancyType(occupancyType) === 'renter'
    ? settings?.yearlyRenterDues
    : settings?.yearlyDues;

const resolveMonthlyDueFromSettings = (settings, year, occupancyType = 'permanent') => {
  const dueMap = getDueMapForOccupancyType(settings, occupancyType);
  const configuredAmount = dueMap?.get?.(String(year)) ?? dueMap?.[String(year)];
  const parsedAmount = Number(configuredAmount);

  if (Number.isFinite(parsedAmount) && parsedAmount > 0) {
    return parsedAmount;
  }

  return DEFAULT_MONTHLY_DUE;
};

const getResidentBillingContext = async (residentId, year) => {
  const resident = await User.findById(residentId)
    .select('occupancyType')
    .lean();
  const occupancyType = normalizeOccupancyType(resident?.occupancyType);
  const settings = await getOrCreateSettings();

  return {
    occupancyType,
    monthlyDue: resolveMonthlyDueFromSettings(settings, year, occupancyType)
  };
};

const getOrCreate = async (residentId, year) => {
  const { monthlyDue } = await getResidentBillingContext(residentId, year);
  let doc = await Billing.findOne({ residentId, year });

  if (!doc) {
    doc = await Billing.create({ residentId, year, monthlyDue });
    return doc;
  }

  if (doc.monthlyDue !== monthlyDue) {
    doc.monthlyDue = monthlyDue;
    await doc.save();
  }

  return doc;
};

const getOrCreateSettings = async () => {
  let settings = await BillingSetting.findOne({ key: 'default' });
  if (!settings) settings = await BillingSetting.create({ key: 'default' });
  return settings;
};

const normalizeMonth = (month) => {
  const upperMonth = String(month || '').toUpperCase();
  if (!MONTHS.includes(upperMonth)) {
    return null;
  }
  return upperMonth;
};

const getBilling = async (req, res) => {
  try {
    const { residentId, year } = req.params;
    const doc = await getOrCreate(residentId, parseInt(year, 10));
    res.json(doc);
  } catch (err) {
    console.error('getBilling error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getMyBilling = async (req, res) => {
  try {
    const { year } = req.params;
    const residentId = req.user?.userId;
    const doc = await getOrCreate(residentId, parseInt(year, 10));
    res.json(doc);
  } catch (err) {
    console.error('getMyBilling error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

const updateMonth = async (req, res) => {
  try {
    const { residentId, year, month } = req.params;
    const parsedYear = parseInt(year, 10);
    const upperMonth = normalizeMonth(month);

    if (!upperMonth) {
      return res.status(400).json({ message: `Invalid month: ${month}` });
    }

    const { paid, orNumber, datePaid, remarks, paymentMethod, paymentStatus } = req.body;
    const doc = await getOrCreate(residentId, parsedYear);
    const monthRecord = doc.months[upperMonth];

    if (paid !== undefined) monthRecord.paid = paid;
    if (orNumber !== undefined) monthRecord.orNumber = orNumber;
    if (datePaid !== undefined) monthRecord.datePaid = datePaid;
    if (remarks !== undefined) monthRecord.remarks = remarks;
    if (paymentMethod !== undefined) monthRecord.paymentMethod = paymentMethod;
    if (paymentStatus !== undefined) monthRecord.paymentStatus = paymentStatus;
    if (
      (paid === false || ['none', 'pending', 'rejected'].includes(paymentStatus)) &&
      monthRecord.adminReceipt?.path
    ) {
      await deleteStoredFile(monthRecord.adminReceipt);
      monthRecord.adminReceipt = {};
    }

    doc.markModified(`months.${upperMonth}`);
    await doc.save();

    res.json(doc);
  } catch (err) {
    console.error('updateMonth error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getBillingDirectory = async (req, res) => {
  try {
    const parsedYear = parseInt(req.params.year, 10);

    if (!Number.isInteger(parsedYear)) {
      return res.status(400).json({ message: 'A valid year is required' });
    }

    const pagination = parsePagination(req.query);
    const search = String(req.query.search || '').trim();
    const phase = String(req.query.phase || '').trim();
    const occupancyType = normalizeOccupancyType(req.query.occupancyType);
    const searchRegex = search
      ? new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      : null;
    const baseResidentFilter = { isApproved: true };

    if (searchRegex) {
      baseResidentFilter.$or = [
        { familyName: searchRegex },
        { username: searchRegex },
        { houseAddress: searchRegex },
        { street: searchRegex }
      ];
    }

    if (/^[1-4]$/.test(phase)) {
      baseResidentFilter.phase = phase;
    }

    const occupancyFilter = occupancyType === 'renter'
      ? { occupancyType: 'renter' }
      : {
          $or: [
            { occupancyType: 'permanent' },
            { occupancyType: { $exists: false } },
            { occupancyType: null },
            { occupancyType: '' }
          ]
        };
    const residentFilter = {
      $and: [
        baseResidentFilter,
        occupancyFilter
      ]
    };

    const residentQuery = User.find(residentFilter)
      .select('familyName username houseAddress street phase occupancyType propertyType block lot buildingName unitNumber')
      .sort({ familyName: 1, phase: 1 })
      .collation({ locale: 'en', strength: 2 })
      .lean();

    const [settings, residents, totalResidents, permanentTotal, renterTotal, billingDocs] = await Promise.all([
      getOrCreateSettings(),
      pagination.enabled
        ? residentQuery.clone().skip(pagination.skip).limit(pagination.limit)
        : residentQuery,
      User.countDocuments(residentFilter),
      User.countDocuments({
        $and: [
          baseResidentFilter,
          {
            $or: [
              { occupancyType: 'permanent' },
              { occupancyType: { $exists: false } },
              { occupancyType: null },
              { occupancyType: '' }
            ]
          }
        ]
      }),
      User.countDocuments({ ...baseResidentFilter, occupancyType: 'renter' }),
      Billing.find({ year: parsedYear })
        .select('residentId monthlyDue months')
        .lean()
    ]);

    const billingByResidentId = new Map(
      billingDocs.map((doc) => [String(doc.residentId), doc])
    );

    const directory = residents
      .map((resident) => {
        const occupancyType = normalizeOccupancyType(resident.occupancyType);
        const billingDoc = billingByResidentId.get(String(resident._id));
        const paidCount = MONTHS.filter((month) => billingDoc?.months?.[month]?.paid).length;
        const pendingCount = MONTHS.filter(
          (month) => billingDoc?.months?.[month]?.paymentStatus === 'pending'
        ).length;

        return {
          ...resident,
          occupancyType,
          billing: {
            monthlyDue: Number(billingDoc?.monthlyDue) || resolveMonthlyDueFromSettings(settings, parsedYear, occupancyType),
            paidCount,
            pendingCount
          }
        };
      })
      .sort((a, b) => {
        const surnameComparison = String(a.familyName || '').localeCompare(
          String(b.familyName || ''),
          undefined,
          { sensitivity: 'base' }
        );

        if (surnameComparison !== 0) {
          return surnameComparison;
        }

        return String(a.phase || '').localeCompare(String(b.phase || ''), undefined, {
          sensitivity: 'base'
        });
      });

    if (pagination.enabled) {
      return res.json({
        ...buildPaginatedPayload({
          items: directory,
          total: totalResidents,
          page: pagination.page,
          limit: pagination.limit
        }),
        summary: {
          total: permanentTotal + renterTotal,
          permanentTotal,
          renterTotal
        }
      });
    }

    return res.json(directory);
  } catch (err) {
    console.error('getBillingDirectory error:', err);
    return res.status(500).json({ message: 'Server error' });
  }
};

const getSummary = async (req, res) => {
  try {
    const { year } = req.params;
    const docs = await Billing.find({ year: parseInt(year, 10) })
      .select('residentId months')
      .lean();

    const summary = docs.map((doc) => {
      const paidCount = MONTHS.filter((month) => doc.months?.[month]?.paid).length;
      const pendingCount = MONTHS.filter((month) => doc.months?.[month]?.paymentStatus === 'pending').length;
      return { residentId: doc.residentId, paidCount, pendingCount };
    });

    res.json(summary);
  } catch (err) {
    console.error('getSummary error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

const updateMonthlyDueSetting = async (req, res) => {
  try {
    if (!hasAdminModuleAccess(req.user, 'billing')) {
      return res.status(403).json({ message: 'Only admins can update monthly dues' });
    }

    const parsedYear = parseInt(req.body?.year, 10);
    const parsedAmount = Number(req.body?.amount);
    const occupancyType = normalizeOccupancyType(req.body?.occupancyType);

    if (!Number.isInteger(parsedYear)) {
      return res.status(400).json({ message: 'A valid year is required' });
    }

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ message: 'Monthly due must be greater than 0' });
    }

    const settings = await getOrCreateSettings();
    const duesKey = occupancyType === 'renter' ? 'yearlyRenterDues' : 'yearlyDues';
    settings[duesKey].set(String(parsedYear), parsedAmount);
    settings.markModified(duesKey);
    await settings.save();

    const residentFilter = occupancyType === 'renter'
      ? { occupancyType: 'renter' }
      : {
          $or: [
            { occupancyType: 'permanent' },
            { occupancyType: { $exists: false } },
            { occupancyType: null },
            { occupancyType: '' }
          ]
        };

    const residentIds = await User.find(residentFilter)
      .select('_id')
      .lean();
    const targetResidentIds = residentIds.map((resident) => resident._id);

    if (targetResidentIds.length > 0) {
      await Billing.updateMany(
        {
          year: parsedYear,
          residentId: { $in: targetResidentIds }
        },
        { $set: { monthlyDue: parsedAmount } }
      );
    }

    res.json(settings);
  } catch (err) {
    console.error('updateMonthlyDueSetting error:', err);
    res.status(500).json({ message: 'Failed to update monthly dues' });
  }
};

const uploadBillingReceipt = async (req, res) => {
  try {
    const { residentId, year, month } = req.params;
    const upperMonth = normalizeMonth(month);

    if (!upperMonth) {
      return res.status(400).json({ message: `Invalid month: ${month}` });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No receipt file uploaded' });
    }

    if (String(req.user?.userId) !== String(residentId) && !hasAdminModuleAccess(req.user, 'billing')) {
      return res.status(403).json({ message: 'Not allowed to upload for this resident' });
    }

    const doc = await getOrCreate(residentId, parseInt(year, 10));
    const existingReceipt = doc.months?.[upperMonth]?.receipt;
    if (existingReceipt?.path) {
      await deleteStoredFile(existingReceipt);
    }

    const storedReceipt = await storeUploadedFile(req.file, {
      folder: 'ecotrend-hoa/billing-receipts',
      localDir: 'uploads/billing-receipts',
      prefix: 'billing-receipt',
      resourceType: req.file.mimetype === 'application/pdf' ? 'raw' : 'auto'
    });

    doc.months[upperMonth].receipt = storedReceipt;
    doc.months[upperMonth].paymentMethod = 'GCASH';
    doc.months[upperMonth].paymentStatus = 'pending';
    doc.months[upperMonth].paid = false;
    if (doc.months[upperMonth].adminReceipt?.path) {
      await deleteStoredFile(doc.months[upperMonth].adminReceipt);
      doc.months[upperMonth].adminReceipt = {};
    }
    doc.markModified(`months.${upperMonth}`);
    await doc.save();

    res.json(doc);
  } catch (err) {
    console.error('uploadBillingReceipt error:', err);
    res.status(500).json({ message: 'Failed to upload receipt' });
  }
};

const uploadBillingAdminReceipt = async (req, res) => {
  try {
    if (!hasAdminModuleAccess(req.user, 'billing')) {
      return res.status(403).json({ message: 'Only admins can upload issued receipts' });
    }

    const { residentId, year, month } = req.params;
    const upperMonth = normalizeMonth(month);

    if (!upperMonth) {
      return res.status(400).json({ message: `Invalid month: ${month}` });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No issued receipt file uploaded' });
    }

    const doc = await getOrCreate(residentId, parseInt(year, 10));
    const monthRecord = doc.months[upperMonth];

    if (!monthRecord.paid && monthRecord.paymentStatus !== 'verified') {
      return res.status(400).json({ message: 'Payment must be verified before uploading the issued receipt' });
    }

    const existingReceipt = monthRecord.adminReceipt;
    if (existingReceipt?.path) {
      await deleteStoredFile(existingReceipt);
    }

    const storedReceipt = await storeUploadedFile(req.file, {
      folder: 'ecotrend-hoa/issued-billing-receipts',
      localDir: 'uploads/issued-billing-receipts',
      prefix: 'issued-billing-receipt',
      resourceType: req.file.mimetype === 'application/pdf' ? 'raw' : 'auto'
    });

    monthRecord.adminReceipt = storedReceipt;
    doc.markModified(`months.${upperMonth}`);
    await doc.save();

    return res.json(doc);
  } catch (err) {
    console.error('uploadBillingAdminReceipt error:', err);
    return res.status(500).json({ message: 'Failed to upload issued receipt' });
  }
};

const reviewBillingReceipt = async (req, res) => {
  try {
    if (!hasAdminModuleAccess(req.user, 'billing')) {
      return res.status(403).json({ message: 'Only admins can review receipts' });
    }

    const { residentId, year, month } = req.params;
    const upperMonth = normalizeMonth(month);
    const { paymentStatus, remarks, orNumber, datePaid } = req.body;

    if (!upperMonth) {
      return res.status(400).json({ message: `Invalid month: ${month}` });
    }

    if (!['pending', 'verified', 'rejected'].includes(paymentStatus)) {
      return res.status(400).json({ message: 'Invalid payment status' });
    }

    const doc = await getOrCreate(residentId, parseInt(year, 10));
    const monthRecord = doc.months[upperMonth];

    if (!monthRecord.receipt?.path) {
      return res.status(400).json({ message: 'No receipt uploaded for this month' });
    }

    monthRecord.paymentStatus = paymentStatus;
    if (remarks !== undefined) monthRecord.remarks = remarks;
    if (orNumber !== undefined) monthRecord.orNumber = orNumber;
    if (datePaid !== undefined) monthRecord.datePaid = datePaid;

    if (paymentStatus === 'verified') {
      monthRecord.paid = true;
      monthRecord.paymentMethod = monthRecord.paymentMethod || 'GCASH';
      if (!monthRecord.datePaid) {
        monthRecord.datePaid = new Date().toISOString().slice(0, 10);
      }
    }

    if (paymentStatus !== 'verified' && monthRecord.adminReceipt?.path) {
      await deleteStoredFile(monthRecord.adminReceipt);
      monthRecord.adminReceipt = {};
    }

    if (paymentStatus === 'rejected') {
      monthRecord.paid = false;
    }

    doc.markModified(`months.${upperMonth}`);
    await doc.save();

    res.json(doc);
  } catch (err) {
    console.error('reviewBillingReceipt error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

const getBillingSettings = async (req, res) => {
  try {
    const settings = await getOrCreateSettings();
    res.json(settings);
  } catch (err) {
    console.error('getBillingSettings error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

const updateGcashQr = async (req, res) => {
  try {
    if (!hasAdminModuleAccess(req.user, 'billing')) {
      return res.status(403).json({ message: 'Only admins can update the GCash QR code' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No QR code file uploaded' });
    }

    const settings = await getOrCreateSettings();
    if (settings.gcashQr?.path) {
      await deleteStoredFile(settings.gcashQr);
    }

    const storedQr = await storeUploadedFile(req.file, {
      folder: 'ecotrend-hoa/billing',
      localDir: 'uploads/billing',
      prefix: 'gcash-qr',
      resourceType: 'image'
    });

    settings.gcashQr = storedQr;
    await settings.save();

    res.json(settings);
  } catch (err) {
    console.error('updateGcashQr error:', err);
    res.status(500).json({ message: 'Failed to update GCash QR code' });
  }
};

module.exports = {
  getBilling,
  getBillingDirectory,
  getMyBilling,
  updateMonth,
  getSummary,
  uploadBillingReceipt,
  uploadBillingAdminReceipt,
  reviewBillingReceipt,
  getBillingSettings,
  updateGcashQr,
  updateMonthlyDueSetting
};
