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

module.exports = mongoose.model('CCTVFeed', cctvFeedSchema);
