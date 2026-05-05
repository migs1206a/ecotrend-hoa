const mongoose = require('mongoose');

const facilityReservationLockSchema = new mongoose.Schema({
  lockKey: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  owner: {
    type: String,
    required: true,
    trim: true
  },
  expiresAt: {
    type: Date,
    required: true
  }
}, {
  timestamps: true
});

facilityReservationLockSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('FacilityReservationLock', facilityReservationLockSchema);
