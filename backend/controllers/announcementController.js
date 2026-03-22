const Announcement = require('../models/Announcement');

// Get all announcements
const getAnnouncements = async (req, res) => {
  try {
    const announcements = await Announcement.find().sort({ createdAt: -1 });
    res.json(announcements);
  } catch (error) {
    console.error('Error fetching announcements:', error);
    res.status(500).json({ message: 'Error fetching announcements' });
  }
};

// Create new announcement
const createAnnouncement = async (req, res) => {
  try {
    console.log('Creating announcement with data:', req.body);
    console.log('User from auth middleware:', req.user);
    
    const { title, content, category, targetAudience, expiryDate, postedBy } = req.body;

    // Validate required fields
    if (!title || !content) {
      console.log('Validation failed: Missing title or content');
      return res.status(400).json({ message: 'Title and content are required' });
    }

    // Create new announcement
    const announcement = new Announcement({
      title,
      content,
      category: category || 'general',
      targetAudience: targetAudience || 'all',
      expiryDate: expiryDate || null,
      postedBy: postedBy || 'Admin'
    });

    console.log('Saving announcement:', announcement);
    const savedAnnouncement = await announcement.save();
    console.log('Announcement saved successfully:', savedAnnouncement);
    
    res.status(201).json(savedAnnouncement);
  } catch (error) {
    console.error('Error creating announcement:', error);
    res.status(500).json({ message: 'Error creating announcement', error: error.message });
  }
};

// Update announcement
const updateAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, category, targetAudience, expiryDate } = req.body;

    // Validate required fields
    if (!title || !content) {
      return res.status(400).json({ message: 'Title and content are required' });
    }

    const announcement = await Announcement.findByIdAndUpdate(
      id,
      {
        title,
        content,
        category: category || 'general',
        targetAudience: targetAudience || 'all',
        expiryDate: expiryDate || null,
        updatedAt: Date.now()
      },
      { new: true, runValidators: true }
    );

    if (!announcement) {
      return res.status(404).json({ message: 'Announcement not found' });
    }

    res.json(announcement);
  } catch (error) {
    console.error('Error updating announcement:', error);
    res.status(500).json({ message: 'Error updating announcement', error: error.message });
  }
};

// Delete announcement
const deleteAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;

    const announcement = await Announcement.findByIdAndDelete(id);

    if (!announcement) {
      return res.status(404).json({ message: 'Announcement not found' });
    }

    res.json({ message: 'Announcement deleted successfully' });
  } catch (error) {
    console.error('Error deleting announcement:', error);
    res.status(500).json({ message: 'Error deleting announcement' });
  }
};

// Get single announcement
const getAnnouncement = async (req, res) => {
  try {
    const { id } = req.params;

    const announcement = await Announcement.findById(id);

    if (!announcement) {
      return res.status(404).json({ message: 'Announcement not found' });
    }

    res.json(announcement);
  } catch (error) {
    console.error('Error fetching announcement:', error);
    res.status(500).json({ message: 'Error fetching announcement' });
  }
};

module.exports = {
  getAnnouncements,
  createAnnouncement,
  updateAnnouncement,
  deleteAnnouncement,
  getAnnouncement
};
