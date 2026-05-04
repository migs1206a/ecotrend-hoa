const mongoose = require('mongoose');

const storedFileSchema = new mongoose.Schema({
  filename: String,
  originalName: String,
  mimetype: String,
  size: Number,
  path: String,
  storage: { type: String, enum: ['local', 'cloudinary'] },
  publicId: String,
  resourceType: String,
  uploadedAt: Date
}, { _id: false });

const facilityReservationSchema = new mongoose.Schema({
  facilityId: {
    type: mongoose.Schema.Types.ObjectId,
    default: null
  },
  facilityName: {
    type: String,
    required: true,
    trim: true
  },
  eventType: {
    type: String,
    required: true,
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
  durationHours: {
    type: Number,
    required: true,
    default: 1,
    min: 1,
    max: 12
  },
  endDateTime: {
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
  hourlyRate: {
    type: Number,
    default: 0
  },
  totalAmount: {
    type: Number,
    default: 0
  },
  paymentRequired: {
    type: Boolean,
    default: false
  },
  paymentMethod: {
    type: String,
    default: ''
  },
  paymentStatus: {
    type: String,
    enum: ['none', 'pending', 'verified', 'rejected'],
    default: 'none'
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
    type: storedFileSchema,
    default: () => ({})
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

facilityReservationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('FacilityReservation', facilityReservationSchema);
