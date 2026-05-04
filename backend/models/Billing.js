const mongoose = require('mongoose');

const storedFileSchema = new mongoose.Schema({
  filename: { type: String, default: '' },
  originalName: { type: String, default: '' },
  mimetype: { type: String, default: '' },
  size: { type: Number, default: 0 },
  path: { type: String, default: '' },
  storage: { type: String, enum: ['local', 'cloudinary'], default: 'local' },
  publicId: { type: String, default: '' },
  resourceType: { type: String, default: '' },
  uploadedAt: { type: Date, default: null }
}, { _id: false });

const monthRecordSchema = new mongoose.Schema({
  paid: { type: Boolean, default: false },
  orNumber: { type: String, default: '' },
  datePaid: { type: String, default: '' },
  remarks: { type: String, default: '' },
  paymentMethod: { type: String, default: '' },
  paymentStatus: {
    type: String,
    enum: ['none', 'pending', 'verified', 'rejected'],
    default: 'none'
  },
  receipt: { type: storedFileSchema, default: () => ({}) }
}, { _id: false });

const billingSchema = new mongoose.Schema({
  residentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  year: {
    type: Number,
    required: true
  },
  monthlyDue: {
    type: Number,
    default: 150
  },
  months: {
    JANUARY: { type: monthRecordSchema, default: () => ({}) },
    FEBRUARY: { type: monthRecordSchema, default: () => ({}) },
    MARCH: { type: monthRecordSchema, default: () => ({}) },
    APRIL: { type: monthRecordSchema, default: () => ({}) },
    MAY: { type: monthRecordSchema, default: () => ({}) },
    JUNE: { type: monthRecordSchema, default: () => ({}) },
    JULY: { type: monthRecordSchema, default: () => ({}) },
    AUGUST: { type: monthRecordSchema, default: () => ({}) },
    SEPTEMBER: { type: monthRecordSchema, default: () => ({}) },
    OCTOBER: { type: monthRecordSchema, default: () => ({}) },
    NOVEMBER: { type: monthRecordSchema, default: () => ({}) },
    DECEMBER: { type: monthRecordSchema, default: () => ({}) }
  }
}, {
  timestamps: true
});

billingSchema.index({ residentId: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('Billing', billingSchema);
