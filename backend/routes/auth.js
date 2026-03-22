//backend/routes/auth.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const User = require('../models/User');
const bcrypt = require('bcryptjs');


// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Determine destination based on field name
    let uploadPath;
    
    if (file.fieldname === 'identificationDocument') {
      uploadPath = 'uploads/identification';
    } else if (file.fieldname.startsWith('vehiclePhoto_')) {
      uploadPath = 'uploads/vehicles';
    } else {
      uploadPath = 'uploads/temp';
    }
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    
    cb(null, uploadPath);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    
    if (file.fieldname === 'identificationDocument') {
      cb(null, 'id-' + uniqueSuffix + ext);
    } else if (file.fieldname.startsWith('vehiclePhoto_')) {
      cb(null, 'vehicle-' + uniqueSuffix + ext);
    } else {
      cb(null, 'file-' + uniqueSuffix + ext);
    }
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: function (req, file, cb) {
    // For identification document: accept images and PDFs
    if (file.fieldname === 'identificationDocument') {
      const allowedTypes = /jpeg|jpg|png|pdf/;
      const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
      const mimetype = allowedTypes.test(file.mimetype);

      if (mimetype && extname) {
        return cb(null, true);
      } else {
        return cb(new Error('Identification document must be JPG, PNG, or PDF'));
      }
    }
    // For vehicle photos: accept only images
    else if (file.fieldname.startsWith('vehiclePhoto_')) {
      const allowedTypes = /jpeg|jpg|png|gif/;
      const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
      const mimetype = allowedTypes.test(file.mimetype);

      if (mimetype && extname) {
        return cb(null, true);
      } else {
        return cb(new Error('Vehicle photos must be JPG, PNG, or GIF'));
      }
    }
    else {
      // Accept any other files (shouldn't happen, but just in case)
      cb(null, true);
    }
  }
});

// Dynamic multer fields for vehicle photos
const uploadFields = (req, res, next) => {
  // Parse the request to determine how many vehicle photos to expect
  let fields = [
    { name: 'identificationDocument', maxCount: 1 }
  ];
  
  // Add fields for vehicle photos (support up to 10 vehicles)
  for (let i = 0; i < 10; i++) {
    fields.push({ name: `vehiclePhoto_${i}`, maxCount: 1 });
  }
  
  const uploadHandler = upload.fields(fields);
  
  // Wrap the upload handler to catch multer errors
  uploadHandler(req, res, function(err) {
    if (err instanceof multer.MulterError) {
      // A Multer error occurred when uploading
      return res.status(400).json({ 
        message: 'File upload error', 
        error: err.message 
      });
    } else if (err) {
      // An unknown error occurred when uploading
      return res.status(400).json({ 
        message: err.message || 'File upload failed'
      });
    }
    // Everything went fine, proceed to next middleware
    next();
  });
};

// Configure email transporter (using Gmail as example)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER, // Your Gmail address
    pass: process.env.EMAIL_PASSWORD // Your Gmail App Password
  }
});

// ============================================
// 1. REQUEST PASSWORD RESET
// ============================================
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    // Find user by email
    const user = await User.findOne({ email });
    
    if (!user) {
      // Don't reveal if email exists or not (security best practice)
      return res.status(200).json({ 
        message: 'If that email exists, a password reset link has been sent.' 
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    // Save hashed token and expiry to user (expires in 1 hour)
    user.resetPasswordToken = resetTokenHash;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    // Create reset URL
    const resetUrl = `http://localhost:3000/reset-password/${resetToken}`;
    // For production, use: `${process.env.FRONTEND_URL}/reset-password/${resetToken}`

    // Email content
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
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
          
          <div style="background: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 25px 0; border-radius: 6px;">
            <p style="color: #92400e; font-size: 14px; margin: 0; font-weight: 600;">
              ⚠️ This link will expire in 1 hour.
            </p>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
            If you didn't request this password reset, please ignore this email and your password will remain unchanged.
          </p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">
            <strong>Ecotrend Homeowners Association</strong><br>
            This is an automated email, please do not reply.
          </p>
        </div>
      `
    };

    // Send email
    await transporter.sendMail(mailOptions);

    res.status(200).json({ 
      message: 'Password reset email sent successfully' 
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ 
      message: 'Error sending password reset email' 
    });
  }
});

// ============================================
// 2. VERIFY RESET TOKEN
// ============================================
router.get('/verify-reset-token/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // Hash the token from URL
    const resetTokenHash = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Find user with valid token
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

// ============================================
// 3. RESET PASSWORD
// ============================================
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    // Validate new password
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ 
        message: 'Password must be at least 8 characters long' 
      });
    }

    // Hash the token
    const resetTokenHash = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    // Find user with valid token
    const user = await User.findOne({
      resetPasswordToken: resetTokenHash,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ 
        message: 'Invalid or expired reset token' 
      });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(newPassword, salt);

    // Clear reset token fields
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();

    // Send confirmation email
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: user.email,
      subject: 'Password Changed Successfully - Ecotrend HOA',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h2 style="color: #10b981; margin-bottom: 10px;">✓ Password Changed Successfully</h2>
          </div>
          
          <p style="color: #374151; font-size: 16px;">Hello <strong>${user.username}</strong>,</p>
          
          <p style="color: #4b5563; font-size: 15px; line-height: 1.6;">
            Your password has been successfully changed.
          </p>
          
          <div style="background: #d1fae5; border-left: 4px solid #10b981; padding: 15px; margin: 25px 0; border-radius: 6px;">
            <p style="color: #065f46; font-size: 14px; margin: 0;">
              ✓ Your account is now secured with your new password.
            </p>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
            If you did not make this change, please contact us immediately at your earliest convenience.
          </p>
          
          <hr style="margin: 30px 0; border: none; border-top: 1px solid #e5e7eb;">
          
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">
            <strong>Ecotrend Homeowners Association</strong><br>
            This is an automated email, please do not reply.
          </p>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({ 
      message: 'Password reset successfully' 
    });

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ 
      message: 'Error resetting password' 
    });
  }
});

// Register route with file upload
router.post('/register', uploadFields, authController.register);

// Login route
router.post('/login', authController.login);





module.exports = router;