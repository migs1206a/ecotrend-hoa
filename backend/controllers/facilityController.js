const FacilityReservation = require('../models/FacilityReservation');
const User = require('../models/User');
const path = require('path');
const fs = require('fs');

// Get all reservations (Admin)
const getAllReservations = async (req, res) => {
  try {
    const reservations = await FacilityReservation.find()
      .sort({ createdAt: -1 })
      .populate('residentId', 'familyName email phoneNumber');
    
    res.json(reservations);
  } catch (error) {
    console.error('Error fetching reservations:', error);
    res.status(500).json({ message: 'Error fetching reservations' });
  }
};

// Get resident's own reservations
const getMyReservations = async (req, res) => {
  try {
    const userId = req.user?.id || req.user?._id || req.user?.userId;
    const reservations = await FacilityReservation.find({ 
      residentId: userId 
    }).sort({ createdAt: -1 });
    
    res.json(reservations);
  } catch (error) {
    console.error('Error fetching my reservations:', error);
    res.status(500).json({ message: 'Error fetching reservations' });
  }
};

// Create new reservation (Resident)
const createReservation = async (req, res) => {
  try {
    const { dateReserved, purpose, numberOfGuests } = req.body;
    
    if (!dateReserved || !purpose) {
      return res.status(400).json({ message: 'Date and purpose are required' });
    }

    // Get user ID from token - check multiple possible locations
    const userId = req.user?.id || req.user?._id || req.user?.userId;
    
    if (!userId) {
      console.log('User object from auth:', req.user);
      return res.status(401).json({ message: 'User ID not found in token' });
    }

    // Get resident info
    const resident = await User.findById(userId);
    
    if (!resident) {
      return res.status(404).json({ message: 'Resident not found' });
    }

    // Check if date is in the future
    const reservationDate = new Date(dateReserved);
    if (reservationDate < new Date()) {
      return res.status(400).json({ message: 'Cannot reserve past dates' });
    }

    // Check for existing reservation on same date
    const startOfDay = new Date(reservationDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(reservationDate);
    endOfDay.setHours(23, 59, 59, 999);
    
    const existingReservation = await FacilityReservation.findOne({
      dateReserved: {
        $gte: startOfDay,
        $lt: endOfDay
      },
      status: { $in: ['pending', 'approved'] }
    });

    if (existingReservation) {
      return res.status(400).json({ 
        message: 'Basketball Court is already reserved for this date' 
      });
    }

    // Set expiration to 12 hours from now
    const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000);

    const reservation = new FacilityReservation({
      facilityName: 'Basketball Court',
      residentId: userId,
      residentName: resident.familyName,
      residentAddress: `${resident.houseAddress}, ${resident.street}`,
      dateReserved,
      purpose,
      numberOfGuests: numberOfGuests || 0,
      expiresAt
    });

    const savedReservation = await reservation.save();
    res.status(201).json(savedReservation);
  } catch (error) {
    console.error('Error creating reservation:', error);
    res.status(500).json({ message: 'Error creating reservation', error: error.message });
  }
};

// Upload payment receipt (Resident)
const uploadReceipt = async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({ message: 'No receipt file uploaded' });
    }

    const userId = req.user?.id || req.user?._id || req.user?.userId;
    const reservation = await FacilityReservation.findOne({
      _id: id,
      residentId: userId
    });

    if (!reservation) {
      return res.status(404).json({ message: 'Reservation not found' });
    }

    if (reservation.status === 'expired' || reservation.status === 'rejected') {
      return res.status(400).json({ message: 'Cannot upload receipt for expired/rejected reservation' });
    }

    // Delete old receipt if exists
    if (reservation.paymentReceipt && reservation.paymentReceipt.path) {
      const oldPath = path.join(__dirname, '..', reservation.paymentReceipt.path);
      if (fs.existsSync(oldPath)) {
        fs.unlinkSync(oldPath);
      }
    }

    reservation.paymentReceipt = {
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      path: req.file.path,
      uploadedAt: new Date()
    };

    await reservation.save();
    res.json(reservation);
  } catch (error) {
    console.error('Error uploading receipt:', error);
    res.status(500).json({ message: 'Error uploading receipt' });
  }
};

// Approve reservation (Admin)
const approveReservation = async (req, res) => {
  try {
    const { id } = req.params;

    const reservation = await FacilityReservation.findById(id);
    if (!reservation) {
      return res.status(404).json({ message: 'Reservation not found' });
    }

    if (reservation.status === 'expired') {
      return res.status(400).json({ message: 'Cannot approve expired reservation' });
    }

    if (!reservation.isPaid) {
      return res.status(400).json({ message: 'Payment not verified yet' });
    }

    reservation.status = 'approved';
    reservation.approvedBy = req.user.username;
    reservation.approvedAt = new Date();

    await reservation.save();
    res.json(reservation);
  } catch (error) {
    console.error('Error approving reservation:', error);
    res.status(500).json({ message: 'Error approving reservation' });
  }
};

// Reject reservation (Admin)
const rejectReservation = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;

    const reservation = await FacilityReservation.findById(id);
    if (!reservation) {
      return res.status(404).json({ message: 'Reservation not found' });
    }

    reservation.status = 'rejected';
    reservation.rejectionReason = reason || 'No reason provided';
    reservation.approvedBy = req.user.username;

    await reservation.save();
    res.json(reservation);
  } catch (error) {
    console.error('Error rejecting reservation:', error);
    res.status(500).json({ message: 'Error rejecting reservation' });
  }
};

// Verify payment (Admin)
const verifyPayment = async (req, res) => {
  try {
    const { id } = req.params;

    const reservation = await FacilityReservation.findById(id);
    if (!reservation) {
      return res.status(404).json({ message: 'Reservation not found' });
    }

    if (!reservation.paymentReceipt) {
      return res.status(400).json({ message: 'No receipt uploaded yet' });
    }

    reservation.isPaid = true;
    await reservation.save();
    
    res.json(reservation);
  } catch (error) {
    console.error('Error verifying payment:', error);
    res.status(500).json({ message: 'Error verifying payment' });
  }
};

// Auto-expire reservations (called by cron or manually)
const expireOldReservations = async (req, res) => {
  try {
    const result = await FacilityReservation.updateMany(
      {
        status: 'pending',
        expiresAt: { $lt: new Date() }
      },
      {
        $set: { status: 'expired' }
      }
    );

    res.json({ message: `Expired ${result.modifiedCount} reservations` });
  } catch (error) {
    console.error('Error expiring reservations:', error);
    res.status(500).json({ message: 'Error expiring reservations' });
  }
};

module.exports = {
  getAllReservations,
  getMyReservations,
  createReservation,
  uploadReceipt,
  approveReservation,
  rejectReservation,
  verifyPayment,
  expireOldReservations
};