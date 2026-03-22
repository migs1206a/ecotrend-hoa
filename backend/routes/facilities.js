const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const auth = require('../middleware/auth');
const {
  getAllReservations,
  getMyReservations,
  createReservation,
  uploadReceipt,
  approveReservation,
  rejectReservation,
  verifyPayment,
  expireOldReservations
} = require('../controllers/facilityController');

// Configure multer for receipt uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/receipts');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'receipt-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|pdf/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only image files (JPEG, PNG) and PDFs are allowed'));
  }
});

// Public/Resident routes
router.get('/my-reservations', auth, getMyReservations);
router.post('/reserve', auth, createReservation);
router.post('/:id/upload-receipt', auth, upload.single('receipt'), uploadReceipt);

// Admin routes
router.get('/all', auth, getAllReservations);
router.patch('/:id/approve', auth, approveReservation);
router.patch('/:id/reject', auth, rejectReservation);
router.patch('/:id/verify-payment', auth, verifyPayment);
router.post('/expire-old', auth, expireOldReservations);

module.exports = router;