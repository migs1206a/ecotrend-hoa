const mongoose = require('mongoose');

const archiveActorSchema = new mongoose.Schema({
  userId: { type: String, default: '' },
  username: { type: String, default: '' },
  role: { type: String, default: '' }
}, { _id: false });

const adminAuditLogArchiveSchema = new mongoose.Schema({
  filename: {
    type: String,
    required: true,
    trim: true
  },
  filePath: {
    type: String,
    required: true,
    trim: true
  },
  fileSize: {
    type: Number,
    default: 0
  },
  logCount: {
    type: Number,
    default: 0
  },
  archivedBefore: {
    type: Date,
    default: null
  },
  oldestLogAt: {
    type: Date,
    default: null
  },
  newestLogAt: {
    type: Date,
    default: null
  },
  archivedBy: {
    type: archiveActorSchema,
    default: () => ({})
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('AdminAuditLogArchive', adminAuditLogArchiveSchema);
