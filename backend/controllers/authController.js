const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Admin = require('../models/Admin');
const Guard = require('../models/Guard');
const MasterAdmin = require('../models/MasterAdmin'); // ← ADD THIS LINE
const fs = require('fs');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

// @desc    Register new resident
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res) => {
  try {
    console.log('=== REGISTRATION REQUEST DEBUG ===');
    console.log('Body:', req.body);
    console.log('Files:', req.files);
    console.log('=================================');

    const { 
      email, 
      familyName, 
      username, 
      password, 
      houseAddress, 
      street, 
      phoneNumber,
      familyMembers,
      vehicles
    } = req.body;

    // Check if identification document was uploaded
    if (!req.files || !req.files.identificationDocument) {
      console.error('Missing identification document');
      return res.status(400).json({ message: 'Identification document is required' });
    }

    const identificationFile = req.files.identificationDocument[0];

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ message: 'Invalid email format' });
    }

    // Validate email provider
    const validProviders = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com', 'aol.com', 'protonmail.com', 'zoho.com'];
    const emailDomain = email.split('@')[1];
    if (!validProviders.includes(emailDomain)) {
      return res.status(400).json({ message: 'Please use a valid email provider (Gmail, Yahoo, Hotmail, etc.)' });
    }

    // Validate family name length
    if (familyName.length > 20) {
      return res.status(400).json({ message: 'Family name must not exceed 20 characters' });
    }

    // Validate username length and format
    if (username.length > 20) {
      return res.status(400).json({ message: 'Username must not exceed 20 characters' });
    }

    const usernameRegex = /^[a-zA-Z0-9_]+$/;
    if (!usernameRegex.test(username)) {
      return res.status(400).json({ message: 'Username can only contain letters, numbers, and underscores' });
    }

    // Validate password strength
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long' });
    }

    if (!/[A-Z]/.test(password)) {
      return res.status(400).json({ message: 'Password must contain at least one uppercase letter' });
    }

    if (!/[a-z]/.test(password)) {
      return res.status(400).json({ message: 'Password must contain at least one lowercase letter' });
    }

    if (!/[0-9]/.test(password)) {
      return res.status(400).json({ message: 'Password must contain at least one number' });
    }

    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      return res.status(400).json({ message: 'Password must contain at least one special character' });
    }

    // Validate house address format
    const addressRegex = /^Block\s+\d{1,2},?\s*Lot\s+\d{1,2},?\s*Phase\s+\d$/i;
    if (!addressRegex.test(houseAddress)) {
      return res.status(400).json({ message: 'House address must be in format: Block [1-99], Lot [1-99], Phase [1-9]' });
    }

    // Validate street length
    if (street.length > 15) {
      return res.status(400).json({ message: 'Street name must not exceed 15 characters' });
    }

    // Validate phone number format
    const phoneRegex = /^\+63[0-9]{10}$/;
    if (!phoneRegex.test(phoneNumber)) {
      return res.status(400).json({ message: 'Invalid phone number format. Must be +63 followed by 10 digits' });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ $or: [{ email }, { username }] });
    if (existingUser) {
      return res.status(400).json({ message: 'Email or username already exists' });
    }

    // Parse family members (it comes as a JSON string from FormData)
    let parsedFamilyMembers;
    try {
      parsedFamilyMembers = JSON.parse(familyMembers);
    } catch (e) {
      return res.status(400).json({ message: 'Invalid family members data' });
    }

    // Validate family members
    if (!parsedFamilyMembers || parsedFamilyMembers.length === 0) {
      return res.status(400).json({ message: 'At least one family member is required' });
    }

    // Validate each family member has all required fields
    for (let member of parsedFamilyMembers) {
      if (!member.lastName || !member.firstName || !member.middleName) {
        return res.status(400).json({ message: 'All family member fields are required' });
      }
    }

    // Parse vehicles (optional, comes as JSON string from FormData)
    let parsedVehicles = [];
    if (vehicles) {
      try {
        parsedVehicles = JSON.parse(vehicles);
        
        // Validate each vehicle has all required fields if vehicles are provided
        for (let vehicle of parsedVehicles) {
          if (!vehicle.plateNumber || !vehicle.vehicleType || !vehicle.brand || !vehicle.model || !vehicle.color) {
            return res.status(400).json({ message: 'All vehicle fields are required for registered vehicles' });
          }
        }

        // Attach vehicle photos to corresponding vehicles
        parsedVehicles = parsedVehicles.map((vehicle, index) => {
          const photoFieldName = `vehiclePhoto_${index}`;
          const vehicleWithPhoto = { ...vehicle };
          
          if (req.files[photoFieldName] && req.files[photoFieldName][0]) {
            const photoFile = req.files[photoFieldName][0];
            vehicleWithPhoto.photo = {
              filename: photoFile.filename,
              originalName: photoFile.originalname,
              mimetype: photoFile.mimetype,
              size: photoFile.size,
              path: photoFile.path
            };
          }
          
          return vehicleWithPhoto;
        });
      } catch (e) {
        return res.status(400).json({ message: 'Invalid vehicles data' });
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user (not approved by default)
    const newUser = new User({
      email,
      familyName,
      username,
      password: hashedPassword,
      houseAddress,
      street,
      phoneNumber,
      familyMembers: parsedFamilyMembers,
      vehicles: parsedVehicles,
      identificationDocument: {
        filename: identificationFile.filename,
        originalName: identificationFile.originalname,
        mimetype: identificationFile.mimetype,
        size: identificationFile.size,
        path: identificationFile.path
      },
      isApproved: false
    });

    await newUser.save();

    res.status(201).json({ 
      message: 'Registration successful! Please wait for admin approval.',
      userId: newUser._id 
    });
  } catch (error) {
    console.error('=== REGISTRATION ERROR ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('==========================');
    
    // If there's an error, delete all uploaded files
    if (req.files) {
      if (req.files.identificationDocument && req.files.identificationDocument[0]) {
        fs.unlink(req.files.identificationDocument[0].path, (err) => {
          if (err) console.error('Error deleting identification file:', err);
        });
      }
      
      Object.keys(req.files).forEach(fieldName => {
        if (fieldName.startsWith('vehiclePhoto_')) {
          req.files[fieldName].forEach(file => {
            fs.unlink(file.path, (err) => {
              if (err) console.error('Error deleting vehicle photo:', err);
            });
          });
        }
      });
    }
    
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Login user (MasterAdmin, Admin, Guard, or Resident)
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    // ── STEP 1: Check MasterAdmin FIRST ──────────────────────────────────
    // Must be checked before Admin so the master account is never misrouted
    let user = await MasterAdmin.findOne({ username });
    let role = 'MASTER_ADMIN';

    // ── STEP 2: Check Admin ───────────────────────────────────────────────
    if (!user) {
      user = await Admin.findOne({ username });
      role = 'ADMIN';
    }

    // ── STEP 3: Check Guard ───────────────────────────────────────────────
    if (!user) {
      user = await Guard.findOne({ username });
      role = 'GUARD';
    }

    // ── STEP 4: Check Resident ────────────────────────────────────────────
    if (!user) {
      user = await User.findOne({ username });
      role = 'RESIDENT';

      // Residents must be approved before they can log in
      if (user && !user.isApproved) {
        return res.status(403).json({ 
          message: 'Your account is pending admin approval.' 
        });
      }
    }

    // No account found with that username
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Verify password against stored hash
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Generate JWT — role is embedded so the frontend and middleware
    // can read it directly from the token
    const token = jwt.sign(
      { userId: user._id, role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    return res.json({
      token,
      role,
      user: {
        id: user._id,
        username: user.username,
        role
      }
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};