// models/MasterAdmin.js
const mongoose = require('mongoose');

const masterAdminSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    default: 'MASTER_ADMIN'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('MasterAdmin', masterAdminSchema);