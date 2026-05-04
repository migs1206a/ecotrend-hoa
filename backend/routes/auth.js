const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const EmailVerification = require('../models/EmailVerification');
const bcrypt = require('bcryptjs');
const {
  DOCUMENT_UPLOAD_MAX_BYTES,
  getFileSizeLimitMessage
} = require('../utils/uploadLimits');
const {
  EMAIL_OTP_EXPIRY_MINUTES,
  EMAIL_OTP_LENGTH,
  EMAIL_OTP_RESEND_COOLDOWN_SECONDS,
  createEmailVerificationToken,
  generateEmailOtp,
  hashVerificationValue,
  normalizeEmail,
  validateResidentEmail
} = require('../utils/emailVerification');

const RESEND_EMAIL_API_URL = 'https://api.resend.com/emails';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: DOCUMENT_UPLOAD_MAX_BYTES
  },
  fileFilter(req, file, cb) {
    if (file.fieldname === 'identificationDocument') {
      const allowedTypes = /jpeg|jpg|png|pdf/;
      const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
      const mimetype = allowedTypes.test(file.mimetype);

      if (mimetype && extname) {
        return cb(null, true);
      }
      return cb(new Error('Identification document must be JPG, PNG, or PDF'));
    }

    if (file.fieldname.startsWith('vehiclePhoto_')) {
      const allowedTypes = /jpeg|jpg|png|gif/;
      const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
      const mimetype = allowedTypes.test(file.mimetype);

      if (mimetype && extname) {
        return cb(null, true);
      }
      return cb(new Error('Vehicle photos must be JPG, PNG, or GIF'));
    }

    cb(null, true);
  }
});

const uploadFields = (req, res, next) => {
  const fields = [{ name: 'identificationDocument', maxCount: 1 }];

  for (let i = 0; i < 10; i += 1) {
    fields.push({ name: `vehiclePhoto_${i}`, maxCount: 1 });
  }

  const uploadHandler = upload.fields(fields);

  uploadHandler(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          message: getFileSizeLimitMessage(DOCUMENT_UPLOAD_MAX_BYTES)
        });
      }

      return res.status(400).json({
        message: 'File upload error',
        error: err.message
      });
    }

    if (err) {
      return res.status(400).json({
        message: err.message || 'File upload failed'
      });
    }

    next();
  });
};

const getEmailAuthConfig = () => ({
  user: String(process.env.EMAIL_USER || '').trim(),
  pass: String(process.env.EMAIL_PASSWORD || '').trim()
});

const getResendConfig = () => ({
  apiKey: String(process.env.RESEND_API_KEY || '').trim(),
  from: String(
    process.env.EMAIL_FROM ||
      process.env.RESEND_FROM ||
      process.env.EMAIL_USER ||
      ''
  ).trim()
});

const hasResendConfig = () => Boolean(getResendConfig().apiKey);

const createTransporter = () =>
  nodemailer.createTransport({
    service: 'gmail',
    auth: getEmailAuthConfig()
  });

const getEmailServiceErrorMessage = (error) => {
  const { user, pass } = getEmailAuthConfig();
  const { apiKey, from } = getResendConfig();

  if (error?.provider === 'resend') {
    if (error.status === 401 || error.status === 403) {
      return 'Email API login failed. Check RESEND_API_KEY in Render.';
    }

    if (error.status === 422 || /domain|from/i.test(error.message || '')) {
      return 'Email sender is not verified. Verify your domain in Resend and set EMAIL_FROM, for example Ecotrend HOA <noreply@ecotrendhoa.com>.';
    }

    return 'Email API failed to send the message. Check Render logs and your Resend dashboard.';
  }

  if (apiKey && !from) {
    return 'Email sender is not configured. Add EMAIL_FROM in Render, for example Ecotrend HOA <noreply@ecotrendhoa.com>.';
  }

  if (!apiKey && (!user || !pass)) {
    return 'Email service is not configured. On Render Free, add RESEND_API_KEY and EMAIL_FROM. For local Gmail SMTP, add EMAIL_USER and EMAIL_PASSWORD.';
  }

  if (error?.code === 'EAUTH') {
    return 'Email login failed. Check EMAIL_USER and EMAIL_PASSWORD. If you use Gmail, use a Gmail App Password instead of your regular password.';
  }

  if (['ESOCKET', 'ECONNECTION', 'ETIMEDOUT', 'ENOTFOUND'].includes(error?.code)) {
    return 'Could not connect to the email service. Check your internet connection and email configuration.';
  }

  return 'Failed to send email. Check the backend server logs for more details.';
};

const sendEmailWithResend = async (mailOptions) => {
  const { apiKey, from } = getResendConfig();

  if (!from) {
    const configError = new Error(getEmailServiceErrorMessage());
    configError.isOperational = true;
    throw configError;
  }

  const response = await fetch(RESEND_EMAIL_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: mailOptions.from || from,
      to: mailOptions.to,
      subject: mailOptions.subject,
      html: mailOptions.html,
      text: mailOptions.text
    })
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data?.message || data?.error || 'Resend email API failed.');
    error.provider = 'resend';
    error.status = response.status;
    error.details = data;
    throw error;
  }

  return data;
};

const sendEmail = async (mailOptions) => {
  if (hasResendConfig()) {
    return sendEmailWithResend(mailOptions);
  }

  const { user, pass } = getEmailAuthConfig();

  if (!user || !pass) {
    const configError = new Error(getEmailServiceErrorMessage());
    configError.isOperational = true;
    throw configError;
  }

  const transporter = createTransporter();
  return transporter.sendMail({
    from: mailOptions.from || user,
    ...mailOptions
  });
};

const isValidEmailAddress = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));

const getPasswordValidationMessage = (password) => {
  const value = String(password || '');

  if (value.length < 8) {
    return 'Password must be at least 8 characters long';
  }
  if (!/[A-Z]/.test(value)) {
    return 'Password must contain at least one uppercase letter';
  }
  if (!/[a-z]/.test(value)) {
    return 'Password must contain at least one lowercase letter';
  }
  if (!/[0-9]/.test(value)) {
    return 'Password must contain at least one number';
  }
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(value)) {
    return 'Password must contain at least one special character';
  }

  return null;
};

const buildResetUrl = (resetToken) => {
  const fallbackUrl = `http://localhost:3000/?token=${encodeURIComponent(resetToken)}`;
  const configuredFrontendUrl = String(process.env.FRONTEND_URL || 'http://localhost:3000').trim();

  try {
    const url = new URL(configuredFrontendUrl);
    url.searchParams.set('token', resetToken);
    return url.toString();
  } catch (error) {
    return fallbackUrl;
  }
};

router.post('/email-verification/send-otp', async (req, res) => {
  try {
    const emailValidation = validateResidentEmail(req.body?.email);
    if (emailValidation.error) {
      return res.status(400).json({ message: emailValidation.error });
    }

    const email = normalizeEmail(emailValidation.value);
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email is already registered.' });
    }

    const existingVerification = await EmailVerification.findOne({ email });
    const now = new Date();

    if (existingVerification?.sentAt) {
      const elapsedSeconds = Math.floor((now.getTime() - new Date(existingVerification.sentAt).getTime()) / 1000);
      if (elapsedSeconds < EMAIL_OTP_RESEND_COOLDOWN_SECONDS) {
        return res.status(429).json({
          message: `Please wait ${EMAIL_OTP_RESEND_COOLDOWN_SECONDS - elapsedSeconds} seconds before requesting a new OTP.`,
          retryAfterSeconds: EMAIL_OTP_RESEND_COOLDOWN_SECONDS - elapsedSeconds
        });
      }
    }

    const otp = generateEmailOtp();
    const expiresAt = new Date(now.getTime() + EMAIL_OTP_EXPIRY_MINUTES * 60 * 1000);

    await EmailVerification.findOneAndUpdate(
      { email },
      {
        email,
        otpHash: hashVerificationValue(otp),
        expiresAt,
        sentAt: now,
        attempts: 0
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true
      }
    );

    try {
      await sendEmail({
        to: email,
        subject: 'Your Ecotrend HOA Email Verification Code',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 30px;">
              <h2 style="color: #10b981; margin-bottom: 10px;">Verify Your Email</h2>
            </div>
            <p style="color: #374151; font-size: 16px;">
              Use the verification code below to continue your resident registration.
            </p>
            <div style="text-align: center; margin: 30px 0;">
              <div style="display: inline-block; padding: 16px 28px; border-radius: 12px; background: #ecfdf5; border: 1px solid #a7f3d0; font-size: 30px; letter-spacing: 8px; font-weight: 700; color: #047857;">
                ${otp}
              </div>
            </div>
            <p style="color: #4b5563; font-size: 14px; line-height: 1.6;">
              This OTP expires in ${EMAIL_OTP_EXPIRY_MINUTES} minutes. If you did not request this code, you can safely ignore this email.
            </p>
          </div>
        `
      });
    } catch (mailError) {
      await EmailVerification.deleteOne({ email }).catch(() => {});
      throw mailError;
    }

    res.status(200).json({
      message: 'Verification OTP sent successfully.',
      expiresInSeconds: EMAIL_OTP_EXPIRY_MINUTES * 60,
      retryAfterSeconds: EMAIL_OTP_RESEND_COOLDOWN_SECONDS
    });
  } catch (error) {
    console.error('Send email verification OTP error:', error);
    res.status(500).json({
      message: getEmailServiceErrorMessage(error)
    });
  }
});

router.post('/email-verification/verify-otp', async (req, res) => {
  try {
    const emailValidation = validateResidentEmail(req.body?.email);
    if (emailValidation.error) {
      return res.status(400).json({ message: emailValidation.error });
    }

    const email = normalizeEmail(emailValidation.value);
    const otp = String(req.body?.otp || '').trim();

    if (!new RegExp(`^\\d{${EMAIL_OTP_LENGTH}}$`).test(otp)) {
      return res.status(400).json({ message: `OTP must be exactly ${EMAIL_OTP_LENGTH} digits.` });
    }

    const verification = await EmailVerification.findOne({ email });
    if (!verification) {
      return res.status(400).json({ message: 'No active OTP was found for this email. Please request a new code.' });
    }

    if (verification.expiresAt.getTime() < Date.now()) {
      await EmailVerification.deleteOne({ email }).catch(() => {});
      return res.status(400).json({ message: 'OTP has expired. Please request a new code.' });
    }

    if (verification.attempts >= 5) {
      return res.status(429).json({ message: 'Too many invalid OTP attempts. Please request a new code.' });
    }

    const otpHash = hashVerificationValue(otp);
    if (otpHash !== verification.otpHash) {
      verification.attempts += 1;
      await verification.save();

      return res.status(400).json({ message: 'Invalid OTP. Please try again.' });
    }

    const verificationToken = createEmailVerificationToken(email);
    await EmailVerification.deleteOne({ email }).catch(() => {});

    res.status(200).json({
      message: 'Email verified successfully.',
      verificationToken
    });
  } catch (error) {
    console.error('Verify email OTP error:', error);
    res.status(500).json({
      message: 'Failed to verify OTP.'
    });
  }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const normalizedEmail = normalizeEmail(req.body?.email);

    if (!isValidEmailAddress(normalizedEmail)) {
      return res.status(400).json({
        message: 'Please enter a valid email address.'
      });
    }

    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(200).json({
        message: 'If that email exists, a password reset link has been sent.'
      });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    user.resetPasswordToken = resetTokenHash;
    user.resetPasswordExpires = Date.now() + 3600000;
    await user.save({ validateBeforeSave: false });

    const resetUrl = buildResetUrl(resetToken);

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: normalizedEmail,
      subject: 'Password Reset Request - Ecotrend HOA',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h2 style="color: #10b981; margin-bottom: 10px;">Password Reset Request</h2>
          </div>
          <p style="color: #374151; font-size: 16px;">Hello <strong>${user.username}</strong>,</p>
          <p style="color: #4b5563; font-size: 15px; line-height: 1.6;">
            You requested to reset your password for your Ecotrend Homeowners Association account.
          </p>
          <p style="color: #4b5563; font-size: 15px; line-height: 1.6;">
            Click the button below to reset your password:
          </p>
          <div style="text-align: center; margin: 35px 0;">
            <a href="${resetUrl}"
               style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);
                      color: white;
                      padding: 14px 32px;
                      text-decoration: none;
                      border-radius: 10px;
                      display: inline-block;
                      font-weight: 600;
                      font-size: 16px;
                      box-shadow: 0 4px 15px rgba(16, 185, 129, 0.3);">
              Reset Password
            </a>
          </div>
          <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
            Or copy and paste this link into your browser:
          </p>
          <p style="color: #10b981; font-size: 14px; word-break: break-all; background: #f0fdf4; padding: 10px; border-radius: 8px;">
            ${resetUrl}
          </p>
          <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
            This link will expire in 1 hour. If you did not request a password reset, you can safely ignore this email.
          </p>
        </div>
      `
    };

    try {
      await sendEmail(mailOptions);
    } catch (mailError) {
      user.resetPasswordToken = undefined;
      user.resetPasswordExpires = undefined;
      await user.save({ validateBeforeSave: false }).catch(() => {});
      mailError.userMessage = getEmailServiceErrorMessage(mailError);
      throw mailError;
    }

    res.status(200).json({
      message: 'If that email exists, a password reset link has been sent.'
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({
      message: error.userMessage || 'Failed to process password reset request.'
    });
  }
});

router.get('/verify-reset-token/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      resetPasswordToken: resetTokenHash,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        message: 'Invalid or expired reset token'
      });
    }

    res.status(200).json({
      message: 'Token is valid'
    });
  } catch (error) {
    console.error('Verify token error:', error);
    res.status(500).json({
      message: 'Error verifying reset token'
    });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    const passwordValidationMessage = getPasswordValidationMessage(newPassword);
    if (passwordValidationMessage) {
      return res.status(400).json({
        message: passwordValidationMessage
      });
    }

    const resetTokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      resetPasswordToken: resetTokenHash,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        message: 'Invalid or expired reset token'
      });
    }

    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save({ validateBeforeSave: false });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: 'Password Changed Successfully - Ecotrend HOA',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h2 style="color: #10b981; margin-bottom: 10px;">Password Changed Successfully</h2>
          </div>
          <p style="color: #374151; font-size: 16px;">Hello <strong>${user.username}</strong>,</p>
          <p style="color: #4b5563; font-size: 15px; line-height: 1.6;">
            Your password has been successfully changed.
          </p>
        </div>
      `
    };

    try {
      await sendEmail(mailOptions);
    } catch (mailError) {
      console.error('Reset password confirmation email error:', mailError);
    }

    res.status(200).json({
      message: 'Password reset successfully'
    });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({
      message: 'Failed to reset password'
    });
  }
});

router.post('/register', uploadFields, authController.register);
router.post('/login', authController.login);
router.get('/me', auth, authController.me);

module.exports = router;
