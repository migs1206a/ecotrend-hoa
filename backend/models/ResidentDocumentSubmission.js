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

const residentDocumentSubmissionSchema = new mongoose.Schema(
  {
    residentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    residentName: {
      type: String,
      required: true,
      trim: true
    },
    residentAddress: {
      type: String,
      required: true,
      trim: true
    },
    documentType: {
      type: String,
      enum: ['Barangay Letter', 'Certification', 'Report', 'Visitors Report', 'Other'],
      required: true
    },
    subject: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    details: {
      type: String,
      required: true,
      trim: true,
      maxlength: 600
    },
    submissionFile: {
      type: storedFileSchema,
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'in_review', 'approved', 'rejected'],
      default: 'pending'
    },
    adminRemarks: {
      type: String,
      trim: true,
      default: ''
    },
    reviewedBy: {
      type: String,
      default: ''
    },
    reviewedAt: {
      type: Date,
      default: null
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('ResidentDocumentSubmission', residentDocumentSubmissionSchema);
