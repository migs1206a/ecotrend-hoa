const mongoose = require('mongoose');

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
    enum: ['pre-registered', 'inside', 'exited'],
    default: 'pre-registered'
  },
  preRegisteredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Visitor', VisitorSchema);
