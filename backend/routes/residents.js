const express = require('express');
const router = express.Router();
const residentController = require('../controllers/residentController');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for vehicle photo uploads
const vehicleStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadPath = 'uploads/vehicles';
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'vehicle-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const vehicleUpload = multer({
  storage: vehicleStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, GIF) are allowed!'));
    }
  }
});

// Get resident statistics (must be before /:id to avoid conflict)
router.get('/stats/summary', residentController.getResidentStats);

// Get all approved residents
router.get('/approved', residentController.getApprovedResidents);

// Get pending residents
router.get('/pending', residentController.getPendingResidents);

// Vehicle routes - must be before /:id route
// Vehicle routes
router.get('/:id/vehicles/deleted', residentController.getDeletedVehicles);           //(before /:vehicleId)
router.get('/:id/vehicles', residentController.getResidentVehicles);
router.post('/:id/vehicles', vehicleUpload.single('vehiclePhoto'), residentController.addVehicle);
router.put('/:id/vehicles/:vehicleId', vehicleUpload.single('vehiclePhoto'), residentController.updateVehicle);
router.patch('/:id/vehicles/:vehicleId/restore', residentController.restoreVehicle);   //(before /:vehicleId/photo)
router.delete('/:id/vehicles/:vehicleId/permanent', residentController.permanentDeleteVehicle); 
router.delete('/:id/vehicles/:vehicleId', residentController.deleteVehicle);           //para sa soft-deletes
router.get('/:id/vehicles/:vehicleId/photo', residentController.getVehiclePhoto);

// Get single resident by ID
router.get('/:id', residentController.getResidentById);

// Get resident identification document
router.get('/:id/identification', residentController.getResidentIdentification);

// Approve resident
router.patch('/:id/approve', residentController.approveResident);

// Update resident information
router.put('/:id', residentController.updateResident);

// Delete resident
router.delete('/:id', residentController.deleteResident);

module.exports = router;