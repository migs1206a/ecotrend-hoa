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

const billingSettingSchema = new mongoose.Schema({
  key: {
    type: String,
    default: 'default',
    unique: true
  },
  yearlyDues: {
    type: Map,
    of: Number,
    default: () => ({})
  },
  yearlyRenterDues: {
    type: Map,
    of: Number,
    default: () => ({})
  },
  gcashQr: {
    type: storedFileSchema,
    default: () => ({})
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('BillingSetting', billingSettingSchema);
