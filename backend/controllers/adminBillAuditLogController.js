const AdminBillAuditLog = require('../models/AdminBillAuditLog');
const { parsePagination, sendPaginatedResponse } = require('../utils/pagination');

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

const listAdminBillAuditLogs = async (req, res) => {
  try {
    const pagination = parsePagination(req.query);
    const query = AdminBillAuditLog.find({})
      .sort({ billDate: -1, updatedAt: -1, createdAt: -1 })
      .lean();

    if (pagination.enabled) {
      const [logs, total] = await Promise.all([
        query.clone().skip(pagination.skip).limit(pagination.limit),
        AdminBillAuditLog.countDocuments({})
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

const deleteAdminBillAuditLog = async (req, res) => {
  try {
    const log = await AdminBillAuditLog.findByIdAndDelete(req.params.id);

    if (!log) {
      return res.status(404).json({ message: 'Bill audit log not found' });
    }

    return res.json({ message: 'Bill audit log deleted successfully' });
  } catch (error) {
    console.error('deleteAdminBillAuditLog error:', error);
    return res.status(500).json({ message: 'Failed to delete bill audit log' });
  }
};

module.exports = {
  listAdminBillAuditLogs,
  createAdminBillAuditLog,
  updateAdminBillAuditLog,
  deleteAdminBillAuditLog
};
