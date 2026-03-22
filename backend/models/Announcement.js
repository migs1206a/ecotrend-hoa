const mongoose = require('mongoose');

const announcementSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 200
  },
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000
  },
  category: {
    type: String,
    enum: ['urgent', 'general', 'maintenance', 'events'],
    default: 'general'
  },
  targetAudience: {
    type: String,
    enum: ['all', 'residents', 'guards'],
    default: 'all'
  },
  expiryDate: {
    type: Date,
    default: null
  },
  postedBy: {
    type: String,
    required: true,
    default: 'Admin'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update the updatedAt field on save
announcementSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Announcement', announcementSchema);
