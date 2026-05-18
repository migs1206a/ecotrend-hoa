const mongoose = require('mongoose');

const fileSchema = new mongoose.Schema({
  filename: { type: String, default: '' },
  originalName: { type: String, default: '' },
  mimetype: { type: String, default: '' },
  size: { type: Number, default: 0 },
  path: { type: String, default: '' },
  storage: { type: String, default: '' },
  publicId: { type: String, default: '' },
  resourceType: { type: String, default: '' },
  uploadedAt: { type: Date }
}, { _id: false });

const qrCheckpointSchema = new mongoose.Schema({
  checkpoint: {
    type: String,
    enum: ['gate_entry', 'home_arrival', 'home_exit', 'gate_exit'],
    required: true
  },
  label: { type: String, default: '' },
  memberIndex: { type: Number, default: 0 },
  memberLabel: { type: String, default: '' },
  usedAt: { type: Date },
  mode: {
    type: String,
    enum: ['scan', 'forgot'],
    default: 'scan'
  },
  recordedBy: { type: String, default: '' },
  recordedByName: { type: String, default: '' },
  recordedByRole: { type: String, default: '' }
}, { _id: false });

const VisitorSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Visitor name is required'],
    trim: true
  },
  contactNumber: {
    type: String,
    trim: true
  },
  entryType: {
    type: String,
    enum: ['visitor', 'delivery'],
    default: 'visitor'
  },
  relationshipToResident: {
    type: String,
    trim: true,
    default: ''
  },
  identificationNumber: {
    type: String,
    trim: true,
    default: ''
  },
  identificationDocument: {
    type: fileSchema,
    default: null
  },
  purpose: {
    type: String,
    required: [true, 'Purpose is required'],
    trim: true
  },
  hostResident: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Host resident is required']
  },
  hostResidentName: {
    type: String,
    required: true,
    trim: true
  },
  hostResidentAddress: {
    type: String,
    trim: true
  },
  vehiclePlateNumber: {
    type: String,
    trim: true,
    uppercase: true
  },
  vehicleType: {
    type: String,
    enum: ['car', 'motorcycle', 'suv', 'van', 'truck', ''],
    default: ''
  },
  vehicleColor: {
    type: String,
    trim: true
  },
  accompanyingVisitors: [{
    relationshipToResident: {
      type: String,
      required: true,
      trim: true
    },
    lastName: {
      type: String,
      required: true,
      trim: true
    },
    firstName: {
      type: String,
      required: true,
      trim: true
    },
    identification: {
      type: String,
      required: true,
      trim: true
    }
  }],
  guardOnDuty: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Guard'
  },
  expectedDate: {
    type: Date
  },
  entryTime: {
    type: Date
  },
  exitTime: {
    type: Date
  },
  status: {
    type: String,
    enum: ['pre-registered', 'inside', 'exited', 'rejected'],
    default: 'pre-registered'
  },
  reviewStatus: {
    type: String,
    enum: ['pending', 'approved', 'rejected'],
    default: 'approved'
  },
  reviewedBy: {
    type: String,
    default: ''
  },
  reviewedByName: {
    type: String,
    default: ''
  },
  reviewedByRole: {
    type: String,
    default: ''
  },
  reviewedAt: {
    type: Date
  },
  reviewNotes: {
    type: String,
    trim: true,
    default: ''
  },
  qrEntryEnabled: {
    type: Boolean,
    default: false
  },
  qrToken: {
    type: String,
    trim: true,
    default: undefined
  },
  qrManualCode: {
    type: String,
    trim: true,
    uppercase: true,
    default: undefined
  },
  qrCheckpoints: {
    type: [qrCheckpointSchema],
    default: []
  },
  preRegisteredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

VisitorSchema.index({ qrToken: 1 }, {
  unique: true,
  partialFilterExpression: { qrToken: { $type: 'string' } }
});
VisitorSchema.index({ qrManualCode: 1 }, {
  unique: true,
  partialFilterExpression: { qrManualCode: { $type: 'string' } }
});
VisitorSchema.index({ reviewStatus: 1, status: 1, expectedDate: 1 });

module.exports = mongoose.model('Visitor', VisitorSchema);
