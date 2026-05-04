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

const contactEntrySchema = new mongoose.Schema({
  label: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['mobile', 'landline', 'other'],
    default: 'mobile'
  },
  number: {
    type: String,
    required: true,
    trim: true
  }
}, {
  _id: true
});

const contactHOASettingSchema = new mongoose.Schema({
  key: {
    type: String,
    default: 'default',
    unique: true
  },
  hierarchyImage: {
    type: storedFileSchema,
    default: () => ({})
  },
  contacts: {
    type: [contactEntrySchema],
    default: []
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('ContactHOASetting', contactHOASettingSchema);
