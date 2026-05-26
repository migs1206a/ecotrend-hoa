const admin = require('firebase-admin');

let initializationAttempted = false;
let messagingInstance = null;

const normalizeText = (value) => String(value || '').trim();

function getFirebaseMessaging() {
  if (messagingInstance || initializationAttempted) {
    return messagingInstance;
  }

  initializationAttempted = true;

  try {
    const base64Json = normalizeText(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64);
    if (!base64Json) {
      console.warn('[push] FIREBASE_SERVICE_ACCOUNT_BASE64 is missing; push delivery is disabled.');
      return null;
    }

    const serviceAccount = JSON.parse(
      Buffer.from(base64Json, 'base64').toString('utf8')
    );
    const app = admin.apps[0] || admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });

    messagingInstance = admin.messaging(app);
    console.log('[push] Firebase Admin initialized');
    return messagingInstance;
  } catch (error) {
    console.error('[push] Firebase Admin initialization failed:', error.message);
    return null;
  }
}

module.exports = { getFirebaseMessaging };
