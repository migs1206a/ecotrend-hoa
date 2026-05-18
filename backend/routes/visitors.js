//backend/routes/visitors.js 
const express = require('express');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const visitorController = require('../controllers/visitorController');
const auth = require('../middleware/auth');
const { requireAccess, requireRoles } = require('../middleware/accessControl');
const { IMAGE_UPLOAD_MAX_BYTES } = require('../utils/uploadLimits');

const identificationUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMAGE_UPLOAD_MAX_BYTES },
  fileFilter(req, file, cb) {
    const allowedTypes = /jpeg|jpg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (extname && mimetype) {
      return cb(null, true);
    }

    cb(new Error('Only JPG and PNG identification images are allowed'));
  }
});

router.use(auth);

// Get active visitors
router.get(
  '/active',
  requireAccess({
    roles: ['GUARD'],
    modules: ['visitors', 'overview', 'exit-log']
  }),
  visitorController.getActiveVisitors
);

// Get pre-registered visitors
router.get(
  '/pre-registered',
  requireAccess({
    roles: ['GUARD'],
    modules: ['visitors', 'pre-registered']
  }),
  visitorController.getPreRegisteredVisitors
);

// Get visitors by resident ID
router.get(
  '/resident/:residentId',
  requireAccess({
    roles: ['GUARD'],
    modules: ['visitors', 'pre-registered', 'exit-log'],
    allowResidentSelf: true,
    selfParam: 'residentId'
  }),
  visitorController.getVisitorsByResident
);

// Pre-register visitor (by resident)
router.post(
  '/pre-register',
  requireRoles('RESIDENT'),
  identificationUpload.single('identificationFile'),
  visitorController.preRegisterVisitor
);

router.post(
  '/qr/scan',
  requireAccess({
    roles: ['GUARD', 'RESIDENT'],
    modules: ['entry-log', 'exit-log', 'pre-registered']
  }),
  visitorController.scanVisitorQr
);

// Register new visitor (by guard - immediate entry)
router.post(
  '/',
  requireAccess({
    roles: ['GUARD'],
    modules: ['entry-log']
  }),
  visitorController.registerVisitor
);

// Get all visitors
router.get(
  '/',
  requireAccess({
    roles: ['GUARD'],
    modules: ['visitors', 'overview', 'activity']
  }),
  visitorController.getAllVisitors
);

// Convert pre-registered visitor to entry
router.get(
  '/:id/identification/file',
  requireAccess({
    roles: ['RESIDENT', 'GUARD', 'ADMIN', 'MASTER_ADMIN'],
    modules: ['visitors', 'pre-registered']
  }),
  visitorController.viewVisitorIdentification
);

router.patch(
  '/:id/review',
  requireAccess({
    roles: ['GUARD'],
    modules: ['visitors', 'pre-registered']
  }),
  visitorController.reviewPreRegisteredVisitor
);

router.post(
  '/:id/qr/forgot',
  requireAccess({
    roles: ['RESIDENT', 'GUARD'],
    modules: ['visitors', 'pre-registered', 'entry-log', 'exit-log']
  }),
  visitorController.markForgottenQrCheckpoint
);

// Convert pre-registered visitor to entry
router.patch(
  '/:id/entry',
  requireAccess({
    roles: ['GUARD'],
    modules: ['entry-log', 'pre-registered']
  }),
  visitorController.logPreRegisteredEntry
);

// Log visitor exit
router.patch(
  '/:id/exit',
  requireAccess({
    roles: ['GUARD'],
    modules: ['exit-log']
  }),
  visitorController.logVisitorExit
);

// Cancel pre-registered visitor
router.delete(
  '/:id/cancel',
  requireAccess({
    roles: ['GUARD', 'RESIDENT'],
    modules: ['pre-registered', 'exit-log']
  }),
  visitorController.cancelPreRegisteredVisitor
);

module.exports = router;
