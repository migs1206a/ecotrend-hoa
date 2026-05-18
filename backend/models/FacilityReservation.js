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

const facilityGuestQrScanEventSchema = new mongoose.Schema({
  checkpoint: {
    type: String,
    enum: ['gate_entry', 'gate_exit'],
    required: true
  },
  label: {
    type: String,
    default: ''
  },
  sequenceNumber: {
    type: Number,
    default: 0
  },
  mode: {
    type: String,
    enum: ['scan', 'forgot'],
    default: 'scan'
  },
  usedAt: {
    type: Date,
    default: Date.now
  },
  recordedBy: {
    type: String,
    default: ''
  },
  recordedByName: {
    type: String,
    default: ''
  },
  recordedByRole: {
    type: String,
    default: ''
  }
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
    default: null
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
  },
  guestQrEnabled: {
    type: Boolean,
    default: false
  },
  guestQrToken: {
    type: String,
    trim: true,
    default: undefined
  },
  guestQrManualCode: {
    type: String,
    trim: true,
    uppercase: true,
    default: undefined
  },
  guestQrEntryUsed: {
    type: Number,
    default: 0,
    min: 0
  },
  guestQrExitUsed: {
    type: Number,
    default: 0,
    min: 0
  },
  guestQrScanEvents: {
    type: [facilityGuestQrScanEventSchema],
    default: []
  }
}, {
  timestamps: true
});

facilityReservationSchema.index({ status: 1, expiresAt: 1 });
facilityReservationSchema.index({ facilityId: 1, dateReserved: 1, endDateTime: 1 });
facilityReservationSchema.index({ facilityName: 1, dateReserved: 1, endDateTime: 1 });
facilityReservationSchema.index({ guestQrToken: 1 }, {
  unique: true,
  partialFilterExpression: { guestQrToken: { $type: 'string' } }
});
facilityReservationSchema.index({ guestQrManualCode: 1 }, {
  unique: true,
  partialFilterExpression: { guestQrManualCode: { $type: 'string' } }
});

facilityReservationSchema.statics.dropLegacyExpirationIndex = async function dropLegacyExpirationIndex() {
  const indexes = await this.collection.indexes();
  const legacyIndex = indexes.find(
    (index) => index?.key?.expiresAt === 1 && index.expireAfterSeconds === 0
  );

  if (legacyIndex?.name) {
    await this.collection.dropIndex(legacyIndex.name);
    return legacyIndex.name;
  }

  return '';
};

module.exports = mongoose.model('FacilityReservation', facilityReservationSchema);
