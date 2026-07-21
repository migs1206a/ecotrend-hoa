const AppNotification = require('../models/AppNotification');
const DeviceToken = require('../models/DeviceToken');
const normalizeText = (value) => String(value || '').trim();
const normalizeRole = (value) => String(value || '').trim().toUpperCase();

const getEffectiveTargetRoles = (user = {}) => {
  const role = normalizeRole(user.role);
  if (role === 'MASTER_ADMIN') {
    return ['MASTER_ADMIN', 'ADMIN'];
  }

  return role ? [role] : [];
};

const buildNotificationAudienceFilter = (user = {}) => {
  const userId = String(user.userId || user.id || user._id || '').trim();
  const targetRoles = getEffectiveTargetRoles(user);
  const filters = [];

  if (userId) {
    filters.push({ targetUserIds: userId });
  }

  if (targetRoles.length > 0) {
    filters.push({ targetRoles: { $in: targetRoles } });
  }

  if (filters.length === 0) {
    return null;
  }

  return filters.length === 1 ? filters[0] : { $or: filters };
};

const clampLimit = (value) => {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return 20;
  return Math.max(1, Math.min(50, parsed));
};

const currentUserId = (req) =>
  normalizeText(req.user?.userId || req.user?.id || req.user?._id);

const getNotifications = async (req, res) => {
  try {
    const audienceFilter = buildNotificationAudienceFilter(req.user);
    const userId = currentUserId(req);

    if (!audienceFilter || !userId) {
      return res.status(401).json({ message: 'Authentication is required.' });
    }

    const unreadOnly = normalizeText(req.query?.unreadOnly).toLowerCase() !== 'false';
    const limit = clampLimit(req.query?.limit || 8);
    const filter = {
      ...audienceFilter,
      ...(unreadOnly ? { seenByUserIds: { $ne: userId } } : {})
    };

    const items = await AppNotification.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json({ items });
  } catch (error) {
    return res.status(500).json({ message: 'Error fetching notifications', error: error.message });
  }
};

const registerDeviceToken = async (req, res) => {
  try {
    const userId = currentUserId(req);
    const role = normalizeRole(req.user?.role);
    const token = normalizeText(req.body?.token);
    const platform = normalizeText(req.body?.platform || 'android').toLowerCase();
    const deviceLabel = normalizeText(req.body?.deviceLabel).slice(0, 120);

    if (!userId || !role) {
      return res.status(401).json({ message: 'Authentication is required.' });
    }

    if (!token || token.length < 32) {
      return res.status(400).json({ message: 'Push token is required.' });
    }

    const deviceToken = await DeviceToken.findOneAndUpdate(
      { token },
      {
        $set: {
          userId,
          role,
          token,
          platform,
          deviceLabel,
          isActive: true,
          lastSeenAt: new Date()
        }
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    );

    return res.json({
      message: 'Push device registered.',
      device: deviceToken
    });
  } catch (error) {
    return res.status(500).json({ message: 'Error registering push device.', error: error.message });
  }
};

const unregisterDeviceToken = async (req, res) => {
  try {
    const userId = currentUserId(req);
    const token = normalizeText(req.body?.token);
    const allDevices = req.body?.allDevices === true;

    if (!userId) {
      return res.status(401).json({ message: 'Authentication is required.' });
    }

    if (!allDevices && !token) {
      return res.status(400).json({ message: 'A device token is required.' });
    }

    const match = allDevices
      ? { userId }
      : { userId, token };

    await DeviceToken.updateMany(
      match,
      {
        $set: {
          isActive: false,
          lastSeenAt: new Date()
        }
      }
    );

    return res.json({
      message: 'Push device unregistered.'
    });
  } catch (error) {
    return res.status(500).json({ message: 'Error unregistering push device.', error: error.message });
  }
};

const listNotifications = async (req, res) => {
  return getNotifications(req, res);
};

const markNotificationSeen = async (req, res) => {
  try {
    const audienceFilter = buildNotificationAudienceFilter(req.user);
    const userId = currentUserId(req);

    if (!audienceFilter || !userId) {
      return res.status(401).json({ message: 'Authentication is required.' });
    }

    const notification = await AppNotification.findOneAndUpdate(
      {
        _id: req.params.id,
        ...audienceFilter
      },
      {
        $addToSet: {
          seenByUserIds: userId
        }
      },
      {
        new: true
      }
    );

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found.' });
    }
    return res.json(notification);
  } catch (error) {
    return res.status(500).json({ message: 'Error updating notification', error: error.message });
  }
};

module.exports = {
  getNotifications,
  listNotifications,
  markNotificationSeen,
  registerDevice: registerDeviceToken,
  registerDeviceToken,
  unregisterDevice: unregisterDeviceToken,
  unregisterDeviceToken
};
