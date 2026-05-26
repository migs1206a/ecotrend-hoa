const AppNotification = require('../models/AppNotification');
const { publishPushNotificationSoon } = require('./pushDeliveryService');

const normalizeText = (value) => String(value || '').trim();

function rolesForAudience(audience) {
  switch (normalizeText(audience).toLowerCase()) {
    case 'residents':
      return ['RESIDENT'];
    case 'guards':
      return ['GUARD'];
    default:
      return ['ADMIN', 'GUARD', 'RESIDENT'];
  }
}

async function createNotification(payload) {
  const notification = await AppNotification.create(payload);
  publishPushNotificationSoon(notification);
  return notification;
}

function notificationForAnnouncement(announcement, type, verb) {
  const title = normalizeText(announcement?.title) || 'Announcement';
  return createNotification({
    type,
    title: type === 'announcement_created' ? 'New announcement posted' : 'Announcement updated',
    message: `"${title}" ${verb}.`,
    targetRoles: rolesForAudience(announcement?.targetAudience),
    entityType: 'announcement',
    entityId: String(announcement?._id || ''),
    metadata: {
      announcementTitle: title,
      targetAudience: normalizeText(announcement?.targetAudience),
      category: normalizeText(announcement?.category)
    }
  });
}

const notifyAnnouncementCreated = (announcement) =>
  notificationForAnnouncement(announcement, 'announcement_created', 'is now available');
const notifyAnnouncementUpdated = (announcement) =>
  notificationForAnnouncement(announcement, 'announcement_updated', 'has been updated');

module.exports = {
  createNotification,
  notifyAnnouncementCreated,
  notifyAnnouncementUpdated
};
