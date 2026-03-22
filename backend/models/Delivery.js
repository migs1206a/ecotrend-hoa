//backend/models/Delivery.js
const mongoose = require('mongoose');

const DeliverySchema = new mongoose.Schema({
  driverName: {
    type: String,
    required: [true, 'Driver name is required'],
    trim: true
  },
  contactNumber: {
    type: String,
    trim: true
  },
  deliveryAddress: {
    type: String,
    required: [true, 'Delivery address is required'],
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
  guardOnDuty: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Guard',
    required: true
  },
  entryTime: {
    type: Date,
    default: Date.now
  },
  exitTime: {
    type: Date
  },
  status: {
    type: String,
    enum: ['inside', 'exited'],
    default: 'inside'
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Delivery', DeliverySchema);