const mongoose = require('mongoose');

const actorSnapshotSchema = new mongoose.Schema({
  userId: { type: String, default: '' },
  username: { type: String, default: '' },
  fullName: { type: String, default: '' },
  role: { type: String, default: '' },
  position: { type: String, default: '' }
}, { _id: false });

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

const adminBillAuditLogSchema = new mongoose.Schema({
  billName: {
    type: String,
    required: true,
    trim: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  billDate: {
    type: Date,
    default: Date.now
  },
  notes: {
    type: String,
    trim: true,
    default: ''
  },
  isPaid: {
    type: Boolean,
    default: false
  },
  paidAt: {
    type: Date,
    default: null
  },
  paidBy: {
    type: actorSnapshotSchema,
    default: () => ({})
  },
  receipt: {
    type: storedFileSchema,
    default: () => ({})
  },
  createdBy: {
    type: actorSnapshotSchema,
    default: () => ({})
  },
  updatedBy: {
    type: actorSnapshotSchema,
    default: () => ({})
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('AdminBillAuditLog', adminBillAuditLogSchema);
