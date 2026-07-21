const Announcement = require('../models/Announcement');
const { parsePagination, sendPaginatedResponse } = require('../utils/pagination');
const { createNotificationAndDispatch } = require('../utils/notificationService');

const getAnnouncementTargetRoles = (targetAudience) => {
  const normalizedAudience = String(targetAudience || 'all').trim().toLowerCase();

  if (normalizedAudience === 'residents') {
    return ['RESIDENT'];
  }

  if (normalizedAudience === 'guards') {
    return ['GUARD'];
  }

  return ['ADMIN', 'GUARD', 'RESIDENT'];
};

// Get all announcements
const getAnnouncements = async (req, res) => {
  try {
    const pagination = parsePagination(req.query);
    const filter = {};
    const search = String(req.query.search || '').trim();
    const category = String(req.query.category || '').trim();
    const audience = String(req.query.audience || '').trim();
    const activeOnly = String(req.query.activeOnly || '').toLowerCase() === 'true';

    if (search) {
      const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { title: searchRegex },
        { content: searchRegex },
        { postedBy: searchRegex }
      ];
    }

    if (category && category !== 'all') {
      filter.category = category;
    }

    if (audience && audience !== 'all') {
      filter.targetAudience = { $in: ['all', audience] };
    }

    if (activeOnly) {
      filter.$and = [
        ...(filter.$and || []),
        {
          $or: [
            { expiryDate: { $exists: false } },
            { expiryDate: null },
            { expiryDate: { $gte: new Date() } }
          ]
        }
      ];
    }

    const query = Announcement.find(filter).sort({ createdAt: -1 });

    if (pagination.enabled) {
      const [announcements, total] = await Promise.all([
        query.clone().skip(pagination.skip).limit(pagination.limit),
        Announcement.countDocuments(filter)
      ]);

      return sendPaginatedResponse(res, pagination, announcements, total);
    }

    const announcements = await query;
    return res.json(announcements);
  } catch (error) {
    console.error('Error fetching announcements:', error);
    return res.status(500).json({ message: 'Error fetching announcements' });
  }
};

// Create new announcement
const createAnnouncement = async (req, res) => {
  try {
    const { title, content, category, targetAudience, expiryDate, postedBy } = req.body;

    if (!title || !content) {
      return res.status(400).json({ message: 'Title and content are required' });
    }

    const announcement = new Announcement({
      title,
      content,
      category: category || 'general',
      targetAudience: targetAudience || 'all',
      expiryDate: expiryDate || null,
      postedBy: postedBy || req.user?.fullName || req.user?.username || 'Admin'
    });

    const savedAnnouncement = await announcement.save();

    try {
      await createNotificationAndDispatch({
        type: 'announcement_created',
        title: savedAnnouncement.title,
        message: `New ${savedAnnouncement.category || 'general'} announcement from ${savedAnnouncement.postedBy || 'HOA Admin'}.`,
        targetRoles: getAnnouncementTargetRoles(savedAnnouncement.targetAudience),
        entityType: 'announcement',
        entityId: savedAnnouncement._id,
        metadata: {
          category: savedAnnouncement.category || 'general',
          targetAudience: savedAnnouncement.targetAudience || 'all'
        }
      });
    } catch (notificationError) {
      console.error('Announcement notification error:', notificationError);
    }
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

    try {
      await createNotificationAndDispatch({
        type: 'announcement_updated',
        title: announcement.title,
        message: `Announcement "${announcement.title}" has been updated by ${announcement.postedBy || 'HOA Admin'}.`,
        targetRoles: getAnnouncementTargetRoles(announcement.targetAudience),
        entityType: 'announcement',
        entityId: announcement._id,
        metadata: {
          category: announcement.category || 'general',
          targetAudience: announcement.targetAudience || 'all'
        }
      });
    } catch (notificationError) {
      console.error('Announcement update notification error:', notificationError);
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
