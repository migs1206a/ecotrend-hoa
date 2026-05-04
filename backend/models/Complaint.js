const mongoose = require('mongoose');

const storedFileSchema = new mongoose.Schema(
  {
    filename: String,
    originalName: String,
    mimetype: String,
    size: Number,
    path: String,
    storage: {
      type: String,
      enum: ['local', 'cloudinary']
    },
    publicId: String,
    resourceType: String,
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const ComplaintSchema = new mongoose.Schema(
  {
    complaintType: {
      type: String,
      enum: ['person', 'issue'],
      required: true
    },
    residentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    complainantName: {
      type: String,
      required: true,
      trim: true
    },
    complainantAddress: {
      type: String,
      required: true,
      trim: true
    },
    againstPersonName: {
      type: String,
      trim: true,
      default: ''
    },
    message: {
      type: String,
      trim: true,
      default: ''
    },
    subject: {
      type: String,
      trim: true,
      default: ''
    },
    location: {
      type: String,
      trim: true,
      default: ''
    },
    photo: storedFileSchema,
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'resolved'],
      default: 'pending'
    },
    adminResponse: {
      type: String,
      trim: true,
      default: ''
    },
    internalRemarks: {
      type: String,
      trim: true,
      default: ''
    },
    reviewedBy: {
      type: String,
      default: ''
    },
    reviewedAt: Date,
    isArchived: {
      type: Boolean,
      default: false
    },
    archivedAt: Date,
    archivedBy: {
      type: String,
      default: ''
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Complaint', ComplaintSchema);
