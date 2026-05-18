//backend/models/EntryLog.js
const mongoose = require('mongoose');

const EntryLogSchema = new mongoose.Schema({
  plateNumber: {
    type: String,
    required: [true, 'Plate number is required'],
    uppercase: true,
    trim: true,
    default: 'NO-VEHICLE' // Allow entries without vehicles
  },
  logType: {
    type: String,
    enum: ['entry', 'exit'],
    required: true
  },
  vehicleOwnerType: {
    type: String,
    enum: ['resident', 'visitor', 'delivery'],
    default: 'resident'
  },
  ownerName: {
    type: String,
    trim: true
  },
  // Resident information for visitors/deliveries
  residentId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  residentName: {
    type: String,
    trim: true
  },
  residentAddress: {
    type: String,
    trim: true
  },
  // For vehicle details
  vehicleType: {
    type: String,
    trim: true
  },
  vehicleColor: {
    type: String,
    trim: true
  },
  guardOnDuty: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Guard'
  },
  recordedBy: {
    type: String,
    trim: true,
    default: ''
  },
  recordedByName: {
    type: String,
    trim: true,
    default: ''
  },
  recordedByRole: {
    type: String,
    trim: true,
    default: ''
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  notes: {
    type: String,
    trim: true
  }
}, {
  timestamps: true
});

// Index for faster queries
EntryLogSchema.index({ plateNumber: 1 });
EntryLogSchema.index({ timestamp: -1 });
EntryLogSchema.index({ guardOnDuty: 1 });
EntryLogSchema.index({ recordedBy: 1, timestamp: -1 });
EntryLogSchema.index({ vehicleOwnerType: 1 });

module.exports = mongoose.model('EntryLog', EntryLogSchema);
