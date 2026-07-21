const mongoose = require('mongoose');

const appNotificationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000
    },
    targetRoles: {
      type: [String],
      default: []
    },
    targetUserIds: {
      type: [String],
      default: []
    },
    seenByUserIds: {
      type: [String],
      default: []
    },
    entityType: {
      type: String,
      trim: true,
      default: ''
    },
    entityId: {
      type: String,
      trim: true,
      default: ''
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    timestamps: true
  }
);

appNotificationSchema.index({ createdAt: -1 });
appNotificationSchema.index({ targetRoles: 1, createdAt: -1 });
appNotificationSchema.index({ targetUserIds: 1, createdAt: -1 });

module.exports = mongoose.model('AppNotification', appNotificationSchema);
