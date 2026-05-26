const mongoose = require('mongoose');

const pushDeviceSchema = new mongoose.Schema(
  {
    token: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
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
      uppercase: true,
      index: true
    },
    platform: {
      type: String,
      default: 'android',
      trim: true,
      lowercase: true
    },
    deviceLabel: {
      type: String,
      default: '',
      trim: true,
      maxlength: 160
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

pushDeviceSchema.index({ role: 1, lastSeenAt: -1 });
pushDeviceSchema.index({ userId: 1, lastSeenAt: -1 });

module.exports = mongoose.model('PushDevice', pushDeviceSchema);
