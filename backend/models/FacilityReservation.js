const mongoose = require('mongoose');

const facilityReservationSchema = new mongoose.Schema({
  facilityName: {
    type: String,
    required: true,
    default: 'Basketball Court',
    trim: true
  },
  residentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  residentName: {
    type: String,
    required: true,
    trim: true
  },
  residentAddress: {
    type: String,
    required: true,
    trim: true
  },
  dateReserved: {
    type: Date,
    required: true
  },
  purpose: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  numberOfGuests: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'expired'],
    default: 'pending'
  },
  isPaid: {
    type: Boolean,
    default: false
  },
  paymentReceipt: {
    filename: String,
    originalName: String,
    mimetype: String,
    size: Number,
    path: String,
    uploadedAt: Date
  },
  expiresAt: {
    type: Date,
    required: true
  },
  approvedBy: {
    type: String,
    default: null
  },
  approvedAt: {
    type: Date,
    default: null
  },
  rejectionReason: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

// Index for automatic expiration
facilityReservationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('FacilityReservation', facilityReservationSchema);