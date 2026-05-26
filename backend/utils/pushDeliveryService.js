const PushDevice = require('../models/PushDevice');
const { getFirebaseMessaging } = require('./firebaseAdmin');

const MAX_MULTICAST_TOKENS = 500;
const INVALID_TOKEN_CODES = new Set([
  'messaging/invalid-argument',
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token'
]);

const normalizeText = (value) => String(value || '').trim();
const normalizeRole = (value) => {
  const role = normalizeText(value).toUpperCase();
  return role === 'MASTER_ADMIN' ? 'ADMIN' : role;
};
const uniqueStrings = (values = []) =>
  [...new Set(values.map(normalizeText).filter(Boolean))];

async function registerPushDevice({ token, userId, role, platform, deviceLabel }) {
  const normalizedToken = normalizeText(token);
  const normalizedUserId = normalizeText(userId);
  const normalizedRole = normalizeRole(role);

  if (!normalizedToken || !normalizedUserId || !normalizedRole) {
    return null;
  }

  return PushDevice.findOneAndUpdate(
    { token: normalizedToken },
    {
      token: normalizedToken,
      userId: normalizedUserId,
      role: normalizedRole,
      platform: normalizeText(platform).toLowerCase() || 'android',
      deviceLabel: normalizeText(deviceLabel),
      lastSeenAt: new Date()
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function unregisterPushDevice({ token, userId, allDevices = false }) {
  const normalizedUserId = normalizeText(userId);
  if (!normalizedUserId) return { deletedCount: 0 };
  if (allDevices) return PushDevice.deleteMany({ userId: normalizedUserId });

  const normalizedToken = normalizeText(token);
  if (!normalizedToken) return { deletedCount: 0 };

  return PushDevice.deleteOne({ token: normalizedToken, userId: normalizedUserId });
}

async function publishPushNotification(notification) {
  const messaging = getFirebaseMessaging();
  if (!messaging || !notification) return;

  const targetRoles = uniqueStrings(notification.targetRoles || []).map(normalizeRole);
  const targetUserIds = uniqueStrings(notification.targetUserIds || []);
  const filters = [];
  if (targetRoles.length) filters.push({ role: { $in: targetRoles } });
  if (targetUserIds.length) filters.push({ userId: { $in: targetUserIds } });
  if (!filters.length) return;

  const devices = await PushDevice.find({ $or: filters }).select('token').lean();
  const tokens = uniqueStrings(devices.map((device) => device.token));

  for (let offset = 0; offset < tokens.length; offset += MAX_MULTICAST_TOKENS) {
    const batch = tokens.slice(offset, offset + MAX_MULTICAST_TOKENS);
    const response = await messaging.sendEachForMulticast({
      tokens: batch,
      notification: {
        title: normalizeText(notification.title) || 'EcoTrend HOA',
        body: normalizeText(notification.message) || 'You have a new notification.'
      },
      data: {
        notificationId: String(notification._id || ''),
        type: normalizeText(notification.type),
        title: normalizeText(notification.title),
        message: normalizeText(notification.message),
        entityType: normalizeText(notification.entityType),
        entityId: normalizeText(notification.entityId)
      },
      android: {
        priority: 'high',
        collapseKey: normalizeText(notification.type) || 'ecotrend_notification',
        notification: {
          channelId: 'ecotrend_notifications',
          priority: 'high',
          defaultSound: true,
          defaultVibrateTimings: true,
          clickAction: 'FLUTTER_NOTIFICATION_CLICK'
        }
      }
    });

    const invalidTokens = response.responses
      .map((result, index) => (
        result.error && INVALID_TOKEN_CODES.has(result.error.code)
          ? batch[index]
          : ''
      ))
      .filter(Boolean);

    if (invalidTokens.length) {
      await PushDevice.deleteMany({ token: { $in: invalidTokens } });
    }
  }
}

function publishPushNotificationSoon(notification) {
  setImmediate(() => {
    publishPushNotification(notification).catch((error) => {
      console.error('[push] Failed to deliver notification:', error.message);
    });
  });
}

module.exports = {
  registerPushDevice,
  unregisterPushDevice,
  publishPushNotificationSoon
};
