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

const facilitySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: '',
    trim: true
  },
  hourlyRate: {
    type: Number,
    default: 0,
    min: 0
  },
  paymentRequired: {
    type: Boolean,
    default: false
  },
  eventTypes: {
    type: [String],
    default: []
  },
  mapPosition: {
    x: { type: Number, default: 0 },
    y: { type: Number, default: 0.55 },
    z: { type: Number, default: 0 }
  },
  photo: {
    type: storedFileSchema,
    default: () => ({})
  }
}, {
  _id: true
});

const facilitySettingSchema = new mongoose.Schema({
  key: {
    type: String,
    default: 'default',
    unique: true
  },
  gcashQr: {
    type: storedFileSchema,
    default: () => ({})
  },
  facilities: {
    type: [facilitySchema],
    default: []
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('FacilitySetting', facilitySettingSchema);
