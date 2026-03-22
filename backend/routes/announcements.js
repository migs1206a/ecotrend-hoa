const express = require('express');
const router = express.Router();
const {
  getAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  getAnnouncement
} = require('../controllers/announcementController');

// Import auth middleware
const auth = require('../middleware/auth');

// GET /api/announcements - Get all announcements
router.get('/', getAnnouncements);

// GET /api/announcements/:id - Get single announcement
router.get('/:id', getAnnouncement);

// POST /api/announcements - Create new announcement (protected)
router.post('/', auth, createAnnouncement);

// PUT /api/announcements/:id - Update announcement (protected)
router.put('/:id', auth, updateAnnouncement);

// DELETE /api/announcements/:id - Delete announcement (protected)
router.delete('/:id', auth, deleteAnnouncement);

module.exports = router;
