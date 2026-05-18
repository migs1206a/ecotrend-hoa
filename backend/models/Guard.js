const mongoose = require('mongoose');

const guardSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true
  },
  password: {
    type: String,
    required: true
  },
  fullName: {
    type: String,
    required: true
  },
  role: {
    type: String,
    default: 'Guard'
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

guardSchema.index({ purgeAfter: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Guard', guardSchema);
