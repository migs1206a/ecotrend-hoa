const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const User = require('../models/User');
const ResidentDocumentSubmission = require('../models/ResidentDocumentSubmission');
const { storeUploadedFile, deleteStoredFile } = require('../utils/fileStorage');
const { parsePagination, sendPaginatedResponse } = require('../utils/pagination');
const { buildBrandedTablePdf } = require('../utils/brandedPdf');

const isAdminRole = (role) => ['ADMIN', 'MASTER_ADMIN'].includes(role);
const BACKEND_ROOT = path.join(__dirname, '..');
const UPLOADS_ROOT = path.join(BACKEND_ROOT, 'uploads');

const DOCUMENT_TEMPLATES = [
  {
    key: 'visitor_report',
    title: 'Visitor Report Form',
    description: 'Printable reference form for visitor reporting and endorsement.'
  },
  {
    key: 'barangay_letter',
    title: 'Barangay Letter Request',
    description: 'Template for residents requesting official barangay-style letters.'
  },
  {
    key: 'certification_request',
    title: 'Certification Request Form',
    description: 'Template for certification requests and proof-of-residency processing.'
  },
  {
    key: 'incident_report',
    title: 'Incident Report Form',
    description: 'Template for documenting subdivision incidents and supporting details.'
  }
];

const normalizeSpaces = (value) => String(value || '').trim().replace(/\s+/g, ' ');
const sanitizeHeaderFilename = (value) =>
  String(value || 'resident-document')
    .replace(/["\\\r\n]/g, '')
    .trim() || 'resident-document';

const pipeRemoteFile = (fileUrl, res, redirectCount = 0) =>
  new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(new Error('Too many redirects while loading resident document'));
      return;
    }

    const client = fileUrl.startsWith('https:') ? https : http;
    const request = client.get(fileUrl, (remoteResponse) => {
      const { statusCode, headers } = remoteResponse;

      if ([301, 302, 303, 307, 308].includes(statusCode) && headers.location) {
        remoteResponse.resume();
        const nextUrl = new URL(headers.location, fileUrl).toString();
        pipeRemoteFile(nextUrl, res, redirectCount + 1).then(resolve).catch(reject);
        return;
      }

      if (statusCode < 200 || statusCode >= 300) {
        remoteResponse.resume();
        reject(new Error(`Remote resident document failed with status ${statusCode}`));
        return;
      }

      remoteResponse.on('error', reject);
      res.on('finish', resolve);
      remoteResponse.pipe(res);
    });

    request.on('error', reject);
  });

const streamStoredFileInline = async (file, res) => {
  const originalName = sanitizeHeaderFilename(file.originalName || file.filename);
  res.setHeader('Content-Type', file.mimetype || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${originalName}"`);
  res.setHeader('Cache-Control', 'private, no-store');

  if (file.storage === 'local' && file.path?.startsWith('/uploads/')) {
    const localPath = path.resolve(BACKEND_ROOT, file.path.replace(/^\//, ''));
    const uploadsRoot = path.resolve(UPLOADS_ROOT);

    if (!localPath.startsWith(`${uploadsRoot}${path.sep}`) || !fs.existsSync(localPath)) {
      return false;
    }

    res.sendFile(localPath);
    return true;
  }

  if (/^https?:\/\//i.test(file.path || '')) {
    await pipeRemoteFile(file.path, res);
    return true;
  }

  return false;
};

const getTemplateRows = () => [
  { cells: ['Resident Name', ''], minHeight: 36 },
  { cells: ['Address', ''], minHeight: 42 },
  { cells: ['Date', ''], minHeight: 36 },
  { cells: ['Subject', ''], minHeight: 42 },
  { cells: ['Details', ''], minHeight: 92 },
  { cells: ['Signature', ''], minHeight: 42 },
  { cells: ['Received By', 'Ecotrend HOA'], minHeight: 36 }
];

const getResidentProfile = async (userId) => {
  const resident = await User.findById(userId).lean();
  if (!resident) return null;
  return {
    residentId: resident._id,
    residentName: resident.familyName,
    residentAddress: `${resident.houseAddress}, ${resident.street}`
  };
};

exports.getTemplates = async (req, res) => {
  res.json(DOCUMENT_TEMPLATES);
};

exports.downloadTemplate = async (req, res) => {
  const template = DOCUMENT_TEMPLATES.find((item) => item.key === req.params.key);
  if (!template) {
    return res.status(404).json({ message: 'Template not found' });
  }

  const pdf = buildBrandedTablePdf({
    tableTitle: template.title,
    columns: [
      { label: 'Field', width: 160 },
      { label: 'Information', width: 344 }
    ],
    rows: getTemplateRows(),
    rowMinHeight: 36
  });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${template.key}.pdf"`);
  res.send(Buffer.from(pdf, 'binary'));
};

exports.createSubmission = async (req, res) => {
  try {
    const residentProfile = await getResidentProfile(req.user?.userId);
    if (!residentProfile) {
      return res.status(404).json({ message: 'Resident not found' });
    }

    const documentType = normalizeSpaces(req.body.documentType);
    const subject = normalizeSpaces(req.body.subject);
    const details = normalizeSpaces(req.body.details);

    if (!['Barangay Letter', 'Certification', 'Report', 'Visitors Report', 'Other'].includes(documentType)) {
      return res.status(400).json({ message: 'Invalid document type' });
    }
    if (!subject || subject.length > 120) {
      return res.status(400).json({ message: 'Subject is required and must not exceed 120 characters' });
    }
    if (!details || details.length > 600) {
      return res.status(400).json({ message: 'Details are required and must not exceed 600 characters' });
    }
    if (!req.file) {
      return res.status(400).json({ message: 'A document file is required' });
    }

    const storedFile = await storeUploadedFile(req.file, {
      folder: 'ecotrend-hoa/resident-documents',
      localDir: 'uploads/resident-documents',
      prefix: 'resident-document',
      resourceType: req.file.mimetype === 'application/pdf' ? 'raw' : 'auto'
    });

    const submission = await ResidentDocumentSubmission.create({
      ...residentProfile,
      documentType,
      subject,
      details,
      submissionFile: storedFile
    });

    res.status(201).json(submission);
  } catch (error) {
    console.error('Error creating document submission:', error);
    res.status(500).json({ message: 'Failed to submit document form' });
  }
};

exports.getMySubmissions = async (req, res) => {
  try {
    const pagination = parsePagination(req.query);
    const filter = { residentId: req.user?.userId };
    const query = ResidentDocumentSubmission.find(filter).sort({ createdAt: -1 });

    if (pagination.enabled) {
      const [items, total] = await Promise.all([
        query.clone().skip(pagination.skip).limit(pagination.limit),
        ResidentDocumentSubmission.countDocuments(filter)
      ]);
      return sendPaginatedResponse(res, pagination, items, total);
    }

    const submissions = await query;
    res.json(submissions);
  } catch (error) {
    console.error('Error fetching resident document submissions:', error);
    res.status(500).json({ message: 'Failed to fetch document submissions' });
  }
};

exports.viewSubmissionFile = async (req, res) => {
  try {
    const submission = await ResidentDocumentSubmission.findById(req.params.id);
    if (!submission) {
      return res.status(404).json({ message: 'Document submission not found' });
    }

    const isOwner = String(submission.residentId) === String(req.user?.userId);
    if (!isOwner && !isAdminRole(req.user?.role)) {
      return res.status(403).json({ message: 'You do not have access to this document' });
    }

    const streamed = await streamStoredFileInline(submission.submissionFile, res);
    if (!streamed && !res.headersSent) {
      return res.status(404).json({ message: 'Document file not found' });
    }
    return undefined;
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({ message: 'Failed to load document file', error: error.message });
    }
    return undefined;
  }
};

exports.updateSubmission = async (req, res) => {
  try {
    const submission = await ResidentDocumentSubmission.findOne({
      _id: req.params.id,
      residentId: req.user?.userId
    });

    if (!submission) {
      return res.status(404).json({ message: 'Document submission not found' });
    }

    if (submission.status === 'approved') {
      return res.status(400).json({ message: 'Approved submissions can no longer be updated' });
    }

    const documentType = normalizeSpaces(req.body.documentType);
    const subject = normalizeSpaces(req.body.subject);
    const details = normalizeSpaces(req.body.details);

    if (!['Barangay Letter', 'Certification', 'Report', 'Visitors Report', 'Other'].includes(documentType)) {
      return res.status(400).json({ message: 'Invalid document type' });
    }
    if (!subject || subject.length > 120) {
      return res.status(400).json({ message: 'Subject is required and must not exceed 120 characters' });
    }
    if (!details || details.length > 600) {
      return res.status(400).json({ message: 'Details are required and must not exceed 600 characters' });
    }

    submission.documentType = documentType;
    submission.subject = subject;
    submission.details = details;
    submission.status = 'pending';
    submission.adminRemarks = '';
    submission.reviewedBy = '';
    submission.reviewedAt = null;

    if (req.file) {
      await deleteStoredFile(submission.submissionFile);
      submission.submissionFile = await storeUploadedFile(req.file, {
        folder: 'ecotrend-hoa/resident-documents',
        localDir: 'uploads/resident-documents',
        prefix: 'resident-document',
        resourceType: req.file.mimetype === 'application/pdf' ? 'raw' : 'auto'
      });
    }

    await submission.save();
    res.json(submission);
  } catch (error) {
    console.error('Error updating document submission:', error);
    res.status(500).json({ message: 'Failed to update document submission' });
  }
};

exports.getAllSubmissions = async (req, res) => {
  try {
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({ message: 'Only admins can view resident documents' });
    }

    const filter = {};
    if (req.query.residentId) {
      filter.residentId = req.query.residentId;
    }

    const pagination = parsePagination(req.query);
    const query = ResidentDocumentSubmission.find(filter).sort({ createdAt: -1 });

    if (pagination.enabled) {
      const [items, total] = await Promise.all([
        query.clone().skip(pagination.skip).limit(pagination.limit),
        ResidentDocumentSubmission.countDocuments(filter)
      ]);
      return sendPaginatedResponse(res, pagination, items, total);
    }

    const submissions = await query;
    res.json(submissions);
  } catch (error) {
    console.error('Error fetching all document submissions:', error);
    res.status(500).json({ message: 'Failed to fetch document submissions' });
  }
};

exports.updateSubmissionStatus = async (req, res) => {
  try {
    if (!isAdminRole(req.user?.role)) {
      return res.status(403).json({ message: 'Only admins can review resident documents' });
    }

    const status = normalizeSpaces(req.body.status).toLowerCase();
    const adminRemarks = normalizeSpaces(req.body.adminRemarks);

    if (!['pending', 'in_review', 'approved', 'rejected'].includes(status)) {
      return res.status(400).json({ message: 'Invalid document status' });
    }
    if (adminRemarks.length > 300) {
      return res.status(400).json({ message: 'Admin remarks must not exceed 300 characters' });
    }

    const submission = await ResidentDocumentSubmission.findById(req.params.id);
    if (!submission) {
      return res.status(404).json({ message: 'Document submission not found' });
    }

    submission.status = status;
    submission.adminRemarks = adminRemarks;
    submission.reviewedBy = req.user?.role === 'MASTER_ADMIN' ? 'MASTER_ADMIN' : 'ADMIN';
    submission.reviewedAt = new Date();
    await submission.save();

    res.json(submission);
  } catch (error) {
    console.error('Error reviewing document submission:', error);
    res.status(500).json({ message: 'Failed to review document submission' });
  }
};

module.exports.DOCUMENT_TEMPLATES = DOCUMENT_TEMPLATES;
