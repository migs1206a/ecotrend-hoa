const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true
  },
  fullName: {
    type: String,
    default: '',
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  role: {
    type: String,
    default: 'ADMIN'
  },
  position: {
    type: String,
    default: '',
    trim: true
  },
  modules: {
    type: [String],
    default: undefined
  },
  deletedAt: {
    type: Date,
    default: null
  },
  purgeAfter: {
    type: Date,
    default: null
  },
  deletedBy: {
    userId: {
      type: String,
      default: ''
    },
    username: {
      type: String,
      default: ''
    },
    role: {
      type: String,
      default: ''
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

adminSchema.index({ purgeAfter: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Admin', adminSchema);
