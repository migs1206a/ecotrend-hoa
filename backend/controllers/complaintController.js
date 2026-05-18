const Complaint = require('../models/Complaint');
const User = require('../models/User');
const { storeUploadedFile } = require('../utils/fileStorage');
const { parsePagination, sendPaginatedResponse } = require('../utils/pagination');

const isAdminRole = (role) => ['ADMIN', 'MASTER_ADMIN'].includes(role);
const lettersOnlyRegex = /^[A-Za-z\s]+$/;
const issueTextRegex = /^[A-Za-z0-9\s,.\-#()]+$/;
const COMPLAINT_CATEGORIES = new Set([
  'general',
  'noise_disturbance',
  'safety_security',
  'property_damage',
  'parking',
  'sanitation',
  'pets_animals',
  'harassment',
  'other'
]);
const COMPLAINT_URGENCY_LEVELS = new Set(['low', 'medium', 'high', 'urgent']);

const normalizeSpaces = (value) => String(value || '').trim().replace(/\s+/g, ' ');
const normalizeOption = (value) =>
  normalizeSpaces(value)
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

const validateLettersOnly = (value, fieldLabel, maxLength) => {
  const normalized = normalizeSpaces(value);
  if (!normalized) return `${fieldLabel} is required`;
  if (normalized.length > maxLength) return `${fieldLabel} must not exceed ${maxLength} characters`;
  if (!lettersOnlyRegex.test(normalized)) return `${fieldLabel} must contain letters and spaces only`;
  return '';
};

const validateIssueText = (value, fieldLabel, maxLength) => {
  const normalized = normalizeSpaces(value);
  if (!normalized) return `${fieldLabel} is required`;
  if (normalized.length > maxLength) return `${fieldLabel} must not exceed ${maxLength} characters`;
  if (!issueTextRegex.test(normalized)) return `${fieldLabel} contains invalid characters`;
  return '';
};

const getResidentProfile = async (userId) => {
  const resident = await User.findById(userId);
  if (!resident) return null;

  return {
    complainantName: resident.familyName,
    complainantAddress: `${resident.houseAddress}, ${resident.street}`
  };
};

const createComplaint = async (req, res) => {
  try {
    const residentId = req.user?.userId;
    const complaintType = normalizeSpaces(req.body.complaintType).toLowerCase();
    const category = normalizeOption(req.body.category) || 'general';
    const urgency = normalizeOption(req.body.urgency) || 'medium';

    if (!['person', 'issue'].includes(complaintType)) {
      return res.status(400).json({ message: 'Invalid complaint type' });
    }

    if (!COMPLAINT_CATEGORIES.has(category)) {
      return res.status(400).json({ message: 'Invalid complaint category' });
    }

    if (!COMPLAINT_URGENCY_LEVELS.has(urgency)) {
      return res.status(400).json({ message: 'Invalid complaint urgency' });
    }

    const residentProfile = await getResidentProfile(residentId);
    if (!residentProfile) {
      return res.status(404).json({ message: 'Resident not found' });
    }

    const payload = {
      complaintType,
      category,
      urgency,
      residentId,
      complainantName: residentProfile.complainantName,
      complainantAddress: residentProfile.complainantAddress
    };

    if (complaintType === 'person') {
      const againstPersonName = normalizeSpaces(req.body.againstPersonName);
      const message = normalizeSpaces(req.body.message);

      const againstError = validateLettersOnly(againstPersonName, 'Name of the person being complained against', 60);
      if (againstError) return res.status(400).json({ message: againstError });

      const messageError = validateLettersOnly(message, 'Complaint message', 300);
      if (messageError) return res.status(400).json({ message: messageError });

      payload.againstPersonName = againstPersonName;
      payload.message = message;
    }

    if (complaintType === 'issue') {
      const subject = normalizeSpaces(req.body.subject);
      const location = normalizeSpaces(req.body.location);

      const subjectError = validateIssueText(subject, 'Subject', 120);
      if (subjectError) return res.status(400).json({ message: subjectError });

      const locationError = validateIssueText(location, 'Location', 120);
      if (locationError) return res.status(400).json({ message: locationError });

      payload.subject = subject;
      payload.location = location;

      if (req.file) {
        payload.photo = await storeUploadedFile(req.file, {
          folder: 'ecotrend-hoa/complaints',
          localDir: 'uploads/complaints',
          prefix: 'complaint-photo',
          resourceType: 'image'
        });
      }
    }

    const complaint = await Complaint.create(payload);
    res.status(201).json(complaint);
  } catch (error) {
    console.error('Error creating complaint:', error);
    res.status(500).json({ message: 'Failed to create complaint' });
  }
};

const getMyComplaints = async (req, res) => {
  try {
    const pagination = parsePagination(req.query);
    const filter = { residentId: req.user?.userId };
    const query = Complaint.find(filter).sort({ createdAt: -1 });

    if (pagination.enabled) {
      const [items, total] = await Promise.all([
        query.clone().skip(pagination.skip).limit(pagination.limit),
        Complaint.countDocuments(filter)
      ]);
      return sendPaginatedResponse(res, pagination, items, total);
    }

    const complaints = await query;
    res.json(complaints);
  } catch (error) {
    console.error('Error fetching resident complaints:', error);
    res.status(500).json({ message: 'Failed to fetch complaints' });
  }
};

const getAllComplaints = async (req, res) => {
  try {
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({ message: 'Only admins can view all complaints' });
    }

    const includeArchived = req.query.archived === 'all';
    const filter = includeArchived ? {} : { isArchived: false };
    const pagination = parsePagination(req.query);
    const query = Complaint.find(filter).sort({ createdAt: -1 });

    if (pagination.enabled) {
      const [items, total] = await Promise.all([
        query.clone().skip(pagination.skip).limit(pagination.limit),
        Complaint.countDocuments(filter)
      ]);
      return sendPaginatedResponse(res, pagination, items, total);
    }

    const complaints = await query;
    res.json(complaints);
  } catch (error) {
    console.error('Error fetching all complaints:', error);
    res.status(500).json({ message: 'Failed to fetch complaints' });
  }
};

const updateComplaintStatus = async (req, res) => {
  try {
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({ message: 'Only admins can update complaint status' });
    }

    const { id } = req.params;
    const status = normalizeSpaces(req.body.status).toLowerCase();
    const adminResponse = normalizeSpaces(req.body.adminResponse);
    const internalRemarks = normalizeSpaces(req.body.internalRemarks);

    if (!['pending', 'in_progress', 'resolved'].includes(status)) {
      return res.status(400).json({ message: 'Invalid complaint status' });
    }

    if (adminResponse.length > 300) {
      return res.status(400).json({ message: 'Admin response must not exceed 300 characters' });
    }

    if (internalRemarks.length > 300) {
      return res.status(400).json({ message: 'Internal remarks must not exceed 300 characters' });
    }

    const complaint = await Complaint.findById(id);
    if (!complaint) {
      return res.status(404).json({ message: 'Complaint not found' });
    }

    complaint.status = status;
    complaint.adminResponse = adminResponse;
    complaint.internalRemarks = internalRemarks;
    complaint.reviewedBy = req.user?.role === 'MASTER_ADMIN' ? 'MASTER_ADMIN' : 'ADMIN';
    complaint.reviewedAt = new Date();

    await complaint.save();
    res.json(complaint);
  } catch (error) {
    console.error('Error updating complaint status:', error);
    res.status(500).json({ message: 'Failed to update complaint' });
  }
};

const archiveComplaint = async (req, res) => {
  try {
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({ message: 'Only admins can archive complaints' });
    }

    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) {
      return res.status(404).json({ message: 'Complaint not found' });
    }

    if (complaint.status !== 'resolved') {
      return res.status(400).json({ message: 'Only resolved complaints can be archived' });
    }

    complaint.isArchived = true;
    complaint.archivedAt = new Date();
    complaint.archivedBy = req.user?.role === 'MASTER_ADMIN' ? 'MASTER_ADMIN' : 'ADMIN';
    await complaint.save();

    res.json(complaint);
  } catch (error) {
    console.error('Error archiving complaint:', error);
    res.status(500).json({ message: 'Failed to archive complaint' });
  }
};

module.exports = {
  createComplaint,
  getMyComplaints,
  getAllComplaints,
  updateComplaintStatus,
  archiveComplaint
};
