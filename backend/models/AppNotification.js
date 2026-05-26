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
      maxlength: 500
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
      default: '',
      trim: true,
      maxlength: 80
    },
    entityId: {
      type: String,
      default: '',
      trim: true,
      maxlength: 120
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
