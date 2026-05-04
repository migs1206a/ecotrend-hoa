const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const auth = require('../middleware/auth');
const { requireAccess, requireOfficerModule, requireRoles } = require('../middleware/accessControl');
const {
  DOCUMENT_UPLOAD_MAX_BYTES,
  IMAGE_UPLOAD_MAX_BYTES
} = require('../utils/uploadLimits');
const {
  createFacility,
  getAllReservations,
  getMyReservations,
  getFacilitySettings,
  createReservation,
  deleteFacility,
  uploadReceipt,
  approveReservation,
  rejectReservation,
  updateFacility,
  verifyPayment,
  updateGcashQr,
  expireOldReservations
} = require('../controllers/facilityController');

const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: DOCUMENT_UPLOAD_MAX_BYTES },
  fileFilter(req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only image files (JPEG, PNG) and PDFs are allowed'));
  }
});

const qrUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMAGE_UPLOAD_MAX_BYTES },
  fileFilter(req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only image files (JPEG, PNG, GIF) are allowed'));
  }
});

const facilityPhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMAGE_UPLOAD_MAX_BYTES },
  fileFilter(req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only image files (JPEG, PNG, GIF) are allowed'));
  }
});

router.get('/settings', auth, getFacilitySettings);
router.put('/settings/gcash-qr', auth, requireOfficerModule('facilities'), qrUpload.single('gcashQr'), updateGcashQr);
router.post('/settings/facilities', auth, requireOfficerModule('facilities'), facilityPhotoUpload.single('photo'), createFacility);
router.put('/settings/facilities/:facilityId', auth, requireOfficerModule('facilities'), facilityPhotoUpload.single('photo'), updateFacility);
router.delete('/settings/facilities/:facilityId', auth, requireOfficerModule('facilities'), deleteFacility);
router.get('/my-reservations', auth, requireRoles('RESIDENT'), getMyReservations);
router.post('/reserve', auth, requireRoles('RESIDENT'), createReservation);
router.post('/:id/upload-receipt', auth, requireRoles('RESIDENT'), receiptUpload.single('receipt'), uploadReceipt);
router.get(
  '/all',
  auth,
  requireAccess({
    roles: ['GUARD'],
    modules: ['facilities']
  }),
  getAllReservations
);
router.patch('/:id/approve', auth, requireOfficerModule('facilities'), approveReservation);
router.patch('/:id/reject', auth, requireOfficerModule('facilities'), rejectReservation);
router.patch('/:id/verify-payment', auth, requireOfficerModule('facilities'), verifyPayment);
router.post('/expire-old', auth, requireOfficerModule('facilities'), expireOldReservations);

module.exports = router;
