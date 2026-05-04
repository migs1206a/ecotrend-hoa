const express = require('express');
const multer = require('multer');
const path = require('path');
const auth = require('../middleware/auth');
const { requireOfficerModule, requireRoles } = require('../middleware/accessControl');
const { DOCUMENT_UPLOAD_MAX_BYTES } = require('../utils/uploadLimits');
const {
  getTemplates,
  downloadTemplate,
  createSubmission,
  getMySubmissions,
  viewSubmissionFile,
  updateSubmission,
  getAllSubmissions,
  updateSubmissionStatus
} = require('../controllers/documentController');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: DOCUMENT_UPLOAD_MAX_BYTES },
  fileFilter(req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = /(image\/jpeg|image\/jpg|image\/png|application\/pdf)/.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    }

    cb(new Error('Only JPEG, JPG, PNG, and PDF files are allowed'));
  }
});

router.get('/templates', auth, getTemplates);
router.get('/templates/:key/download', auth, downloadTemplate);
router.get('/my-submissions', auth, requireRoles('RESIDENT'), getMySubmissions);
router.get('/submissions/:id/file', auth, viewSubmissionFile);
router.post('/submit', auth, requireRoles('RESIDENT'), upload.single('documentFile'), createSubmission);
router.put('/:id', auth, requireRoles('RESIDENT'), upload.single('documentFile'), updateSubmission);
router.get('/all', auth, requireOfficerModule('documents'), getAllSubmissions);
router.patch('/:id/status', auth, requireOfficerModule('documents'), updateSubmissionStatus);

module.exports = router;
