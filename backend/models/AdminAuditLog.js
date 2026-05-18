const mongoose = require('mongoose');

const actorSnapshotSchema = new mongoose.Schema({
  userId: { type: String, default: '' },
  username: { type: String, default: '' },
  firstName: { type: String, default: '' },
  fullName: { type: String, default: '' },
  role: { type: String, default: '' },
  accountType: { type: String, default: '' },
  position: { type: String, default: '' }
}, { _id: false });

const adminAuditLogSchema = new mongoose.Schema({
  actor: {
    type: actorSnapshotSchema,
    default: () => ({})
  },
  eventType: {
    type: String,
    enum: ['access', 'action'],
    default: 'action'
  },
  moduleKey: {
    type: String,
    required: true,
    trim: true
  },
  moduleLabel: {
    type: String,
    required: true,
    trim: true
  },
  action: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  method: {
    type: String,
    required: true,
    trim: true
  },
  endpoint: {
    type: String,
    required: true,
    trim: true
  },
  statusCode: {
    type: Number,
    default: 200
  },
  expiresAt: {
    type: Date,
    default: null
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: () => ({})
  }
}, {
  timestamps: true
});

adminAuditLogSchema.index({ createdAt: -1 });
adminAuditLogSchema.index({ moduleKey: 1, createdAt: -1 });
adminAuditLogSchema.index({ 'actor.userId': 1, createdAt: -1 });
adminAuditLogSchema.index({ eventType: 1, createdAt: -1 });
adminAuditLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('AdminAuditLog', adminAuditLogSchema);
