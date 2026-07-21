const mongoose = require('mongoose');

const cctvFeedSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80
    },
    location: {
      type: String,
      trim: true,
      maxlength: 120,
      default: ''
    },
    provider: {
      type: String,
      trim: true,
      maxlength: 40,
      default: 'Custom'
    },
    sourceType: {
      type: String,
      enum: ['browser', 'rtsp', 'onvif', 'hybrid'],
      default: 'browser'
    },
    ipAddress: {
      type: String,
      trim: true,
      maxlength: 120,
      default: ''
    },
    rtspPort: {
      type: Number,
      min: 1,
      max: 65535,
      default: 554
    },
    onvifPort: {
      type: Number,
      min: 1,
      max: 65535,
      default: 2020
    },
    streamPath: {
      type: String,
      trim: true,
      maxlength: 160,
      default: '/stream1'
    },
    cameraUsername: {
      type: String,
      trim: true,
      maxlength: 80,
      default: ''
    },
    cameraPassword: {
      type: String,
      trim: true,
      maxlength: 120,
      default: '',
      select: false
    },
    previewUrl: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: ''
    },
    openUrl: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: ''
    },
    streamUrl: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: ''
    },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      default: 'active'
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 250,
      default: ''
    }
  },
  {
    timestamps: true
  }
);

cctvFeedSchema.index({ name: 1 });
cctvFeedSchema.index({ status: 1 });
cctvFeedSchema.index({ provider: 1 });

module.exports = mongoose.model('CCTVFeed', cctvFeedSchema);
