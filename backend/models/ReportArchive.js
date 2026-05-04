const mongoose = require('mongoose');

const storedFileSchema = new mongoose.Schema(
  {
    filename: { type: String, default: '' },
    originalName: { type: String, default: '' },
    mimetype: { type: String, default: '' },
    size: { type: Number, default: 0 },
    path: { type: String, default: '' },
    storage: { type: String, enum: ['local', 'cloudinary'], default: 'local' },
    publicId: { type: String, default: '' },
    resourceType: { type: String, default: '' },
    uploadedAt: { type: Date, default: null }
  },
  { _id: false }
);

const reportArchiveSchema = new mongoose.Schema(
  {
    reportType: {
      type: String,
      enum: ['residents', 'visitors', 'entry_logs', 'billing', 'complaints', 'facilities'],
      required: true
    },
    format: {
      type: String,
      enum: ['csv', 'pdf'],
      default: 'pdf'
    },
    title: {
      type: String,
      required: true,
      trim: true
    },
    filename: {
      type: String,
      required: true,
      trim: true
    },
    file: {
      type: storedFileSchema,
      default: () => ({})
    },
    filePath: {
      type: String,
      default: '',
      trim: true
    },
    recordCount: {
      type: Number,
      default: 0
    },
    generatedByRole: {
      type: String,
      default: ''
    },
    generatedByName: {
      type: String,
      default: ''
    },
    notes: {
      type: String,
      default: ''
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('ReportArchive', reportArchiveSchema);
