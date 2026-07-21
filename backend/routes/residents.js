const express = require('express');
const router = express.Router();
const residentController = require('../controllers/residentController');
const multer = require('multer');
const path = require('path');
const auth = require('../middleware/auth');
const { requireAccess, requireOfficerModule } = require('../middleware/accessControl');
const { IMAGE_UPLOAD_MAX_BYTES } = require('../utils/uploadLimits');

const vehicleUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: IMAGE_UPLOAD_MAX_BYTES
  },
  fileFilter(req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    }

    cb(new Error('Only image files (JPEG, PNG, GIF) are allowed!'));
  }
});

router.use(auth);

router.get('/stats/summary', requireOfficerModule('residents'), residentController.getResidentStats);
router.get(
  '/approved',
  requireAccess({
    roles: ['GUARD'],
    modules: ['residents', 'billing', 'documents', 'visitors', 'entry-log']
  }),
  residentController.getApprovedResidents
);
router.get('/pending', requireOfficerModule('residents'), residentController.getPendingResidents);
router.get('/vehicles/all', requireOfficerModule('vehicles'), residentController.getAllVehicles);

router.get(
  '/:id/vehicles/deleted',
  requireAccess({
    modules: ['vehicles'],
    allowResidentSelf: true,
    selfParam: 'id'
  }),
  residentController.getDeletedVehicles
);
router.get(
  '/:id/vehicles',
  requireAccess({
    modules: ['vehicles'],
    allowResidentSelf: true,
    selfParam: 'id'
  }),
  residentController.getResidentVehicles
);
router.post(
  '/:id/vehicles',
  requireAccess({
    modules: ['vehicles'],
    allowResidentSelf: true,
    selfParam: 'id'
  }),
  vehicleUpload.single('vehiclePhoto'),
  residentController.addVehicle
);
router.put(
  '/:id/vehicles/:vehicleId',
  requireAccess({
    modules: ['vehicles'],
    allowResidentSelf: true,
    selfParam: 'id'
  }),
  vehicleUpload.single('vehiclePhoto'),
  residentController.updateVehicle
);
router.patch(
  '/:id/vehicles/:vehicleId/restore',
  requireAccess({
    modules: ['vehicles'],
    allowResidentSelf: true,
    selfParam: 'id'
  }),
  residentController.restoreVehicle
);
router.delete(
  '/:id/vehicles/:vehicleId/permanent',
  requireAccess({
    modules: ['vehicles'],
    allowResidentSelf: true,
    selfParam: 'id'
  }),
  residentController.permanentDeleteVehicle
);
router.delete(
  '/:id/vehicles/:vehicleId',
  requireAccess({
    modules: ['vehicles'],
    allowResidentSelf: true,
    selfParam: 'id'
  }),
  residentController.deleteVehicle
);
router.get(
  '/:id/vehicles/:vehicleId/photo',
  requireAccess({
    modules: ['vehicles'],
    allowResidentSelf: true,
    selfParam: 'id'
  }),
  residentController.getVehiclePhoto
);
router.get(
  '/:id/vehicles/:vehicleId/photo/file',
  requireAccess({
    modules: ['vehicles'],
    allowResidentSelf: true,
    selfParam: 'id'
  }),
  residentController.viewVehiclePhoto
);

router.get(
  '/:id',
  requireAccess({
    modules: ['residents'],
    allowResidentSelf: true,
    selfParam: 'id',
    allowExpiredResidentSelf: true
  }),
  residentController.getResidentById
);
router.get(
  '/:id/identification',
  requireAccess({
    modules: ['residents'],
    allowResidentSelf: true,
    selfParam: 'id',
    allowExpiredResidentSelf: true
  }),
  residentController.getResidentIdentification
);
router.get(
  '/:id/identification/file',
  requireAccess({
    modules: ['residents'],
    allowResidentSelf: true,
    selfParam: 'id',
    allowExpiredResidentSelf: true
  }),
  residentController.viewResidentIdentification
);
router.patch('/:id/approve', requireOfficerModule('residents'), residentController.approveResident);
router.patch(
  '/:id/request-renewal',
  requireAccess({
    roles: ['RESIDENT'],
    allowExpiredResidentRole: true
  }),
  residentController.requestRenewal
);
router.patch('/:id/renewal/approve', requireOfficerModule('residents'), residentController.approveRenewal);
router.patch('/:id/renewal/reject', requireOfficerModule('residents'), residentController.rejectRenewal);
router.put(
  '/:id',
  requireAccess({
    modules: ['residents'],
    allowResidentSelf: true,
    selfParam: 'id',
    allowExpiredResidentSelf: true
  }),
  residentController.updateResident
);
router.delete('/:id', requireOfficerModule('residents'), residentController.deleteResident);

module.exports = router;
