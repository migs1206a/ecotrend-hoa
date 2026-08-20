const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('./jwtSecret');

const VALID_EMAIL_PROVIDERS = [
  'gmail.com',
  'yahoo.com',
  'hotmail.com',
  'outlook.com',
  'icloud.com',
  'aol.com',
  'protonmail.com',
  'zoho.com'
];

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_OTP_LENGTH = 6;
const EMAIL_OTP_EXPIRY_MINUTES = 10;
const EMAIL_OTP_RESEND_COOLDOWN_SECONDS = 60;
const EMAIL_VERIFICATION_PURPOSE = 'resident-email-verification';
const EMAIL_VERIFICATION_TOKEN_TTL = '30m';
const EMAIL_VERIFICATION_SECRET = process.env.EMAIL_VERIFICATION_SECRET || getJwtSecret();

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

const validateResidentEmail = (email) => {
  const normalizedEmail = normalizeEmail(email);

  if (!EMAIL_REGEX.test(normalizedEmail)) {
    return { error: 'Please enter a valid email address.' };
  }

  const emailDomain = normalizedEmail.split('@')[1];
  if (!VALID_EMAIL_PROVIDERS.includes(emailDomain)) {
    return {
      error: 'Please use a valid email provider (Gmail, Yahoo, Hotmail, Outlook, iCloud, etc.).'
    };
  }

  return { value: normalizedEmail };
};

const generateEmailOtp = () => {
  const max = 10 ** EMAIL_OTP_LENGTH;
  const min = 10 ** (EMAIL_OTP_LENGTH - 1);
  return String(Math.floor(min + Math.random() * (max - min)));
};

const hashVerificationValue = (value) =>
  crypto.createHash('sha256').update(String(value || '')).digest('hex');

const createEmailVerificationToken = (email) =>
  jwt.sign(
    {
      purpose: EMAIL_VERIFICATION_PURPOSE,
      email: normalizeEmail(email)
    },
    EMAIL_VERIFICATION_SECRET,
    { expiresIn: EMAIL_VERIFICATION_TOKEN_TTL }
  );

const verifyEmailVerificationToken = (token, email) => {
  try {
    const payload = jwt.verify(String(token || ''), EMAIL_VERIFICATION_SECRET);
    return (
      payload?.purpose === EMAIL_VERIFICATION_PURPOSE &&
      payload?.email === normalizeEmail(email)
    );
  } catch (error) {
    return false;
  }
};

module.exports = {
  EMAIL_OTP_EXPIRY_MINUTES,
  EMAIL_OTP_LENGTH,
  EMAIL_OTP_RESEND_COOLDOWN_SECONDS,
  VALID_EMAIL_PROVIDERS,
  createEmailVerificationToken,
  generateEmailOtp,
  hashVerificationValue,
  normalizeEmail,
  validateResidentEmail,
  verifyEmailVerificationToken
};
