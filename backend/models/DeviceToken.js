const mongoose = require('mongoose');

const deviceTokenSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    role: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    token: {
      type: String,
      required: true,
      trim: true,
      unique: true
    },
    platform: {
      type: String,
      trim: true,
      default: 'android'
    },
    deviceLabel: {
      type: String,
      trim: true,
      default: ''
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    lastSeenAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

deviceTokenSchema.index({ role: 1, isActive: 1, updatedAt: -1 });
deviceTokenSchema.index({ userId: 1, isActive: 1, updatedAt: -1 });

module.exports = mongoose.model('DeviceToken', deviceTokenSchema);
