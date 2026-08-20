const { applicationDefault, cert, getApps, initializeApp } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');
const AppNotification = require('../models/AppNotification');
const DeviceToken = require('../models/DeviceToken');

const INVALID_FCM_TOKEN_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
  'messaging/invalid-argument'
]);

const normalizeRole = (value) => String(value || '').trim().toUpperCase();
const normalizeText = (value) => String(value || '').trim();

const normalizeStringList = (values = []) => [
  ...new Set(
    (Array.isArray(values) ? values : [values])
      .map((value) => String(value || '').trim())
      .filter(Boolean)
  )
];

const chunkList = (values = [], size = 500) => {
  const chunks = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
};

const parseFirebaseServiceAccount = () => {
  const rawJson = String(process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '').trim();
  if (rawJson) {
    try {
      const parsed = JSON.parse(rawJson);
      if (parsed && parsed.project_id && parsed.client_email && parsed.private_key) {
        return {
          projectId: String(parsed.project_id).trim(),
          clientEmail: String(parsed.client_email).trim(),
          privateKey: String(parsed.private_key).replace(/\\n/g, '\n')
        };
      }
    } catch (error) {
      console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:', error.message);
    }
  }

  const base64Json = String(
    process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || ''
  ).trim();
  if (base64Json) {
    try {
      const parsed = JSON.parse(
        Buffer.from(base64Json, 'base64').toString('utf8')
      );
      if (parsed && parsed.project_id && parsed.client_email && parsed.private_key) {
        return {
          projectId: String(parsed.project_id).trim(),
          clientEmail: String(parsed.client_email).trim(),
          privateKey: String(parsed.private_key).replace(/\\n/g, '\n')
        };
      }
    } catch (error) {
      console.error(
        'Failed to parse FIREBASE_SERVICE_ACCOUNT_BASE64:',
        error.message
      );
    }
  }

  const projectId = String(process.env.FIREBASE_PROJECT_ID || '').trim();
  const clientEmail = String(process.env.FIREBASE_CLIENT_EMAIL || '').trim();
  const privateKey = String(process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n').trim();

  if (projectId && clientEmail && privateKey) {
    return {
      projectId,
      clientEmail,
      privateKey
    };
  }

  return null;
};

const getFirebaseApp = () => {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const serviceAccount = parseFirebaseServiceAccount();
  if (serviceAccount) {
    const app = initializeApp({
      credential: cert(serviceAccount)
    });
    console.log('[push] Firebase Admin initialized for notification delivery.');
    return app;
  }

  if (String(process.env.FIREBASE_USE_APPLICATION_DEFAULT || '').trim().toLowerCase() === 'true') {
    const app = initializeApp({
      credential: applicationDefault()
    });
    console.log('[push] Firebase Admin initialized with application default credentials.');
    return app;
  }

  return null;
};

const buildTargetMatch = ({ targetRoles = [], targetUserIds = [] }) => {
  const normalizedRoles = normalizeStringList(targetRoles).map(normalizeRole);
  const normalizedUserIds = normalizeStringList(targetUserIds);
  const filters = [];

  if (normalizedRoles.length > 0) {
    filters.push({ role: { $in: normalizedRoles } });
  }

  if (normalizedUserIds.length > 0) {
    filters.push({ userId: { $in: normalizedUserIds } });
  }

  if (filters.length === 0) {
    return null;
  }

  return filters.length === 1 ? filters[0] : { $or: filters };
};

const serializeMetadataValue = (value) => {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();

  try {
    return JSON.stringify(value);
  } catch (error) {
    return String(value);
  }
};

const rolesForAudience = (audience) => {
  switch (normalizeText(audience).toLowerCase()) {
    case 'residents':
      return ['RESIDENT'];
    case 'guards':
      return ['GUARD'];
    default:
      return ['ADMIN', 'GUARD', 'RESIDENT'];
  }
};

const buildPushPayloadData = (notification) => {
  const metadata = notification?.metadata && typeof notification.metadata === 'object'
    ? notification.metadata
    : {};

  return Object.entries({
    notificationId: String(notification?._id || ''),
    type: String(notification?.type || ''),
    title: String(notification?.title || ''),
    message: String(notification?.message || ''),
    entityType: String(notification?.entityType || ''),
    entityId: String(notification?.entityId || ''),
    ...metadata
  }).reduce((payload, [key, value]) => {
    const normalizedValue = serializeMetadataValue(value);
    if (normalizedValue) {
      payload[key] = normalizedValue;
    }
    return payload;
  }, {});
};

const deactivateInvalidTokens = async (tokens = []) => {
  const normalizedTokens = normalizeStringList(tokens);
  if (normalizedTokens.length === 0) {
    return;
  }

  await DeviceToken.updateMany(
    { token: { $in: normalizedTokens } },
    {
      $set: {
        isActive: false
      }
    }
  );
};

const dispatchPushNotification = async (notification) => {
  const targetMatch = buildTargetMatch({
    targetRoles: notification?.targetRoles,
    targetUserIds: notification?.targetUserIds
  });

  if (!targetMatch) {
    console.warn('[push] Delivery skipped: notification has no target audience.');
    return {
      enabled: false,
      reason: 'No target audience'
    };
  }

  const firebaseApp = getFirebaseApp();
  if (!firebaseApp) {
    console.warn('[push] Delivery skipped: Firebase Admin credentials are not configured.');
    return {
      enabled: false,
      reason: 'Firebase Admin is not configured'
    };
  }

  const deviceTokens = await DeviceToken.find({
    isActive: true,
    ...targetMatch
  })
    .select('token')
    .lean();

  const tokens = [
    ...new Set(
      deviceTokens
        .map((entry) => String(entry?.token || '').trim())
        .filter(Boolean)
    )
  ];

  if (tokens.length === 0) {
    console.warn('[push] Delivery skipped: no active device tokens matched the notification audience.');
    return {
      enabled: true,
      sent: 0,
      reason: 'No active device tokens'
    };
  }

  const payloadData = buildPushPayloadData(notification);
  const invalidTokens = [];
  const failureCodes = new Map();
  let successCount = 0;

  console.log(`[push] Attempting delivery to ${tokens.length} active device(s).`);

  for (const batch of chunkList(tokens, 500)) {
    const response = await getMessaging(firebaseApp).sendEachForMulticast({
      tokens: batch,
      notification: {
        title: String(notification.title || ''),
        body: String(notification.message || '')
      },
      data: payloadData,
      android: {
        priority: 'high',
        notification: {
          clickAction: 'FLUTTER_NOTIFICATION_CLICK'
        }
      }
    });

    successCount += Number(response.successCount || 0);

    response.responses.forEach((entry, index) => {
      if (entry.success) {
        return;
      }

      const errorCode = String(entry.error?.code || '').trim();
      if (errorCode) {
        failureCodes.set(errorCode, (failureCodes.get(errorCode) || 0) + 1);
      }
      if (INVALID_FCM_TOKEN_CODES.has(errorCode)) {
        invalidTokens.push(batch[index]);
      }
    });
  }

  if (invalidTokens.length > 0) {
    await deactivateInvalidTokens(invalidTokens);
  }

  const failedCount = tokens.length - successCount;
  const failureSummary = [...failureCodes.entries()]
    .map(([code, count]) => `${code}:${count}`)
    .join(', ');
  console.log(
    `[push] Delivery result: ${successCount} sent, ${failedCount} failed, ${invalidTokens.length} invalid token(s)` +
      (failureSummary ? `; errors ${failureSummary}` : ''),
  );

  return {
    enabled: true,
    sent: successCount,
    invalidTokenCount: invalidTokens.length
  };
};

const createNotificationAndDispatch = async ({
  type,
  title,
  message,
  targetRoles = [],
  targetUserIds = [],
  entityType = '',
  entityId = '',
  metadata = {}
}) => {
  const normalizedType = String(type || '').trim();
  const normalizedTitle = String(title || '').trim();
  const normalizedMessage = String(message || '').trim();
  const normalizedTargetRoles = normalizeStringList(targetRoles).map(normalizeRole);
  const normalizedTargetUserIds = normalizeStringList(targetUserIds);

  if (
    !normalizedType ||
    !normalizedTitle ||
    !normalizedMessage ||
    (normalizedTargetRoles.length === 0 && normalizedTargetUserIds.length === 0)
  ) {
    return null;
  }

  const notification = await AppNotification.create({
    type: normalizedType,
    title: normalizedTitle,
    message: normalizedMessage,
    targetRoles: normalizedTargetRoles,
    targetUserIds: normalizedTargetUserIds,
    entityType: String(entityType || '').trim(),
    entityId: String(entityId || '').trim(),
    metadata: metadata && typeof metadata === 'object' ? metadata : {}
  });

  try {
    await dispatchPushNotification(notification);
  } catch (error) {
    console.error('Push dispatch error:', error.message);
  }

  return notification;
};

const notifyAnnouncementCreated = (announcement) =>
  createNotificationAndDispatch({
    type: 'announcement_created',
    title: 'New announcement posted',
    message: `"${normalizeText(announcement?.title) || 'Announcement'}" is now available.`,
    targetRoles: rolesForAudience(announcement?.targetAudience),
    entityType: 'announcement',
    entityId: String(announcement?._id || ''),
    metadata: {
      announcementTitle: normalizeText(announcement?.title),
      targetAudience: normalizeText(announcement?.targetAudience),
      category: normalizeText(announcement?.category)
    }
  });

const notifyAnnouncementUpdated = (announcement) =>
  createNotificationAndDispatch({
    type: 'announcement_updated',
    title: 'Announcement updated',
    message: `"${normalizeText(announcement?.title) || 'Announcement'}" has been updated.`,
    targetRoles: rolesForAudience(announcement?.targetAudience),
    entityType: 'announcement',
    entityId: String(announcement?._id || ''),
    metadata: {
      announcementTitle: normalizeText(announcement?.title),
      targetAudience: normalizeText(announcement?.targetAudience),
      category: normalizeText(announcement?.category)
    }
  });

module.exports = {
  createNotificationAndDispatch,
  notifyAnnouncementCreated,
  notifyAnnouncementUpdated
};
