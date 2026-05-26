const AppNotification = require('../models/AppNotification');
const {
  registerPushDevice,
  unregisterPushDevice
} = require('../utils/pushDeliveryService');

const normalizeText = (value) => String(value || '').trim();
const normalizeRole = (value) => {
  const role = normalizeText(value).toUpperCase();
  return role === 'MASTER_ADMIN' ? 'ADMIN' : role;
};
const currentUserId = (req) =>
  normalizeText(req.user?.userId || req.user?.id || req.user?._id);

function recipientFilter(req) {
  const role = normalizeRole(req.user?.role);
  const userId = currentUserId(req);
  const targets = [];
  if (role) targets.push({ targetRoles: role });
  if (userId) targets.push({ targetUserIds: userId });
  return targets.length ? { $or: targets } : null;
}

exports.getNotifications = async (req, res) => {
  try {
    const recipient = recipientFilter(req);
    const userId = currentUserId(req);
    if (!recipient || !userId) {
      return res.status(401).json({ message: 'Authentication is required.' });
    }

    const requestedLimit = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 20)
      : 8;
    const unreadOnly = normalizeText(req.query.unreadOnly).toLowerCase() !== 'false';
    const filter = {
      ...recipient,
      ...(unreadOnly ? { seenByUserIds: { $ne: userId } } : {})
    };
    const items = await AppNotification.find(filter).sort({ createdAt: -1 }).limit(limit);

    return res.json({ items });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return res.status(500).json({ message: 'Error fetching notifications' });
  }
};

exports.markNotificationSeen = async (req, res) => {
  try {
    const recipient = recipientFilter(req);
    const userId = currentUserId(req);
    const notification = await AppNotification.findOneAndUpdate(
      { _id: req.params.id, ...recipient },
      { $addToSet: { seenByUserIds: userId } },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ message: 'Notification not found.' });
    }
    return res.json(notification);
  } catch (error) {
    return res.status(500).json({ message: 'Error updating notification' });
  }
};

exports.registerDevice = async (req, res) => {
  try {
    const token = normalizeText(req.body.token);
    const userId = currentUserId(req);
    const role = normalizeRole(req.user?.role);

    if (!token) return res.status(400).json({ message: 'Push token is required.' });
    if (!userId || !role) return res.status(401).json({ message: 'Authentication is required.' });

    const device = await registerPushDevice({
      token,
      userId,
      role,
      platform: req.body.platform,
      deviceLabel: req.body.deviceLabel
    });
    return res.status(201).json({ message: 'Push device registered.', deviceId: device._id });
  } catch (error) {
    console.error('Error registering push device:', error);
    return res.status(500).json({ message: 'Error registering push device.' });
  }
};

exports.unregisterDevice = async (req, res) => {
  try {
    const result = await unregisterPushDevice({
      userId: currentUserId(req),
      token: req.body.token,
      allDevices: req.body.allDevices === true
    });
    return res.json({ message: 'Push device unregistered.', deletedCount: result.deletedCount || 0 });
  } catch (error) {
    return res.status(500).json({ message: 'Error unregistering push device.' });
  }
};
