const express = require('express');
const multer = require('multer');
const router = express.Router();
const {
  getBilling,
  getBillingDirectory,
  getMyBilling,
  updateMonth,
  getSummary,
  uploadBillingReceipt,
  reviewBillingReceipt,
  getBillingSettings,
  updateGcashQr,
  updateMonthlyDueSetting
} = require('../controllers/billingController');
const auth = require('../middleware/auth');
const { requireAccess, requireOfficerModule, requireRoles } = require('../middleware/accessControl');
const {
  DOCUMENT_UPLOAD_MAX_BYTES,
  IMAGE_UPLOAD_MAX_BYTES
} = require('../utils/uploadLimits');

const receiptUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: DOCUMENT_UPLOAD_MAX_BYTES },
  fileFilter(req, file, cb) {
    const allowed = /jpeg|jpg|png|pdf/;
    const extname = allowed.test((file.originalname.split('.').pop() || '').toLowerCase());
    const mimetype = allowed.test(file.mimetype);

    if (extname && mimetype) return cb(null, true);
    cb(new Error('Only JPG, PNG, and PDF files are allowed'));
  }
});

const qrUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMAGE_UPLOAD_MAX_BYTES },
  fileFilter(req, file, cb) {
    const allowed = /jpeg|jpg|png|gif/;
    const extname = allowed.test((file.originalname.split('.').pop() || '').toLowerCase());
    const mimetype = allowed.test(file.mimetype);

    if (extname && mimetype) return cb(null, true);
    cb(new Error('Only JPG, PNG, and GIF images are allowed'));
  }
});

router.get('/summary/:year', auth, requireOfficerModule('billing'), getSummary);
router.get('/directory/:year', auth, requireOfficerModule('billing'), getBillingDirectory);
router.get('/settings', auth, getBillingSettings);
router.put('/settings/monthly-due', auth, requireOfficerModule('billing'), updateMonthlyDueSetting);
router.put('/settings/gcash-qr', auth, requireOfficerModule('billing'), qrUpload.single('gcashQr'), updateGcashQr);
router.get('/my/:year', auth, requireRoles('RESIDENT'), getMyBilling);
router.get('/:residentId/:year', auth, requireOfficerModule('billing'), getBilling);
router.patch('/:residentId/:year/:month', auth, requireOfficerModule('billing'), updateMonth);
router.post(
  '/:residentId/:year/:month/receipt',
  auth,
  requireAccess({
    modules: ['billing'],
    allowResidentSelf: true,
    selfParam: 'residentId'
  }),
  receiptUpload.single('receipt'),
  uploadBillingReceipt
);
router.patch('/:residentId/:year/:month/review', auth, requireOfficerModule('billing'), reviewBillingReceipt);

module.exports = router;
