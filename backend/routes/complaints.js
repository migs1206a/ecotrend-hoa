const express = require('express');
const multer = require('multer');
const path = require('path');
const auth = require('../middleware/auth');
const { requireOfficerModule, requireRoles } = require('../middleware/accessControl');
const {
  createComplaint,
  getMyComplaints,
  getAllComplaints,
  updateComplaintStatus,
  archiveComplaint
} = require('../controllers/complaintController');
const { IMAGE_UPLOAD_MAX_BYTES } = require('../utils/uploadLimits');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMAGE_UPLOAD_MAX_BYTES },
  fileFilter(req, file, cb) {
    const allowedTypes = /jpeg|jpg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    }

    cb(new Error('Only image files (JPEG, JPG, PNG) are allowed'));
  }
});

router.post('/', auth, requireRoles('RESIDENT'), upload.single('photo'), createComplaint);
router.get('/my', auth, requireRoles('RESIDENT'), getMyComplaints);
router.get('/all', auth, requireOfficerModule('complaints'), getAllComplaints);
router.patch('/:id/status', auth, requireOfficerModule('complaints'), updateComplaintStatus);
router.patch('/:id/archive', auth, requireOfficerModule('complaints'), archiveComplaint);

module.exports = router;
