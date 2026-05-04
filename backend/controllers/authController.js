const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Admin = require('../models/Admin');
const Guard = require('../models/Guard');
const MasterAdmin = require('../models/MasterAdmin');
const { storeUploadedFile, deleteStoredFile } = require('../utils/fileStorage');
const {
  validateFamilyMembers,
  validateNameField,
  validatePhoneNumberField
} = require('../utils/fieldValidation');
const {
  normalizeEmail,
  validateResidentEmail,
  verifyEmailVerificationToken
} = require('../utils/emailVerification');
const {
  getEffectiveModules,
  OFFICER_POSITIONS,
  normalizeOfficerPosition
} = require('../utils/adminPermissions');
const {
  appendResidentComputedFields,
  buildHouseholdDetails
} = require('../utils/residentAccounts');
const {
  IMAGE_UPLOAD_MAX_BYTES
} = require('../utils/uploadLimits');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

const normalizePlateNumber = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return { error: 'Plate number is required for registered vehicles' };
  if (!/^[A-Z0-9]{1,10}$/.test(normalized)) {
    return { error: 'Plate number can only contain letters and numbers' };
  }
  return { value: normalized };
};

exports.register = async (req, res) => {
  const storedFiles = [];

  try {
    const {
      email,
      emailVerificationToken,
      familyName,
      username,
      password,
      propertyType,
      occupancyType,
      block,
      lot,
      phase,
      buildingName,
      unitNumber,
      street,
      occupancyStartDate,
      occupancyEndDate,
      phoneNumber,
      familyMembers,
      vehicles
    } = req.body;

    if (!req.files || !req.files.identificationDocument) {
      return res.status(400).json({ message: 'Identification document is required' });
    }

    const identificationFile = req.files.identificationDocument[0];

    const emailValidation = validateResidentEmail(email);
    if (emailValidation.error) {
      return res.status(400).json({ message: emailValidation.error });
    }

    const normalizedEmail = normalizeEmail(emailValidation.value);
    if (!verifyEmailVerificationToken(emailVerificationToken, normalizedEmail)) {
      return res.status(400).json({ message: 'Please verify your email before registering.' });
    }

    const familyNameValidation = validateNameField(familyName, 'Family name', {
      minLength: 2,
      maxLength: 20
    });
    if (familyNameValidation.error) {
      return res.status(400).json({ message: familyNameValidation.error });
    }

    if (username.length > 20) {
      return res.status(400).json({ message: 'Username must not exceed 20 characters' });
    }

    const usernameRegex = /^[a-zA-Z0-9_]+$/;
    if (!usernameRegex.test(username)) {
      return res.status(400).json({ message: 'Username can only contain letters, numbers, and underscores' });
    }

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

    const householdDetailsResult = buildHouseholdDetails({
      propertyType,
      occupancyType,
      block,
      lot,
      phase,
      buildingName,
      unitNumber,
      street,
      occupancyStartDate,
      occupancyEndDate
    });
    if (householdDetailsResult.error) {
      return res.status(400).json({ message: householdDetailsResult.error });
    }

    const householdDetails = householdDetailsResult.value;

    const phoneNumberValidation = validatePhoneNumberField(phoneNumber, 'Phone number', {
      required: true
    });
    if (phoneNumberValidation.error) {
      return res.status(400).json({ message: phoneNumberValidation.error });
    }

    const existingUser = await User.findOne({
      $or: [
        { email: normalizedEmail },
        { username },
        { addressKey: householdDetails.addressKey },
        { houseAddress: householdDetails.houseAddress }
      ]
    });
    if (existingUser) {
      if (existingUser.email === normalizedEmail) {
        return res.status(400).json({ message: 'Email already exists' });
      }

      if (existingUser.username === username) {
        return res.status(400).json({ message: 'Username already exists' });
      }

      return res.status(400).json({
        message: existingUser.isApproved
          ? 'This household or unit already has an active account.'
          : 'This household or unit already has a pending registration.'
      });
    }

    let parsedFamilyMembers;
    try {
      parsedFamilyMembers = JSON.parse(familyMembers);
    } catch (error) {
      return res.status(400).json({ message: 'Invalid family members data' });
    }

    const familyMembersValidation = validateFamilyMembers(parsedFamilyMembers, {
      required: true,
      primaryContactRequired: true
    });
    if (familyMembersValidation.error) {
      return res.status(400).json({ message: familyMembersValidation.error });
    }
    parsedFamilyMembers = familyMembersValidation.value;

    let parsedVehicles = [];
    if (vehicles) {
      try {
        parsedVehicles = JSON.parse(vehicles);
      } catch (error) {
        return res.status(400).json({ message: 'Invalid vehicles data' });
      }

      for (const vehicle of parsedVehicles) {
        if (!vehicle.plateNumber || !vehicle.vehicleType || !vehicle.brand || !vehicle.model || !vehicle.color) {
          return res.status(400).json({ message: 'All vehicle fields are required for registered vehicles' });
        }

        const plateValidation = normalizePlateNumber(vehicle.plateNumber);
        if (plateValidation.error) {
          return res.status(400).json({ message: plateValidation.error });
        }
        vehicle.plateNumber = plateValidation.value;
      }
    }

    const storedIdentification = await storeUploadedFile(identificationFile, {
      folder: 'ecotrend-hoa/identification',
      localDir: 'uploads/identification',
      prefix: 'id',
      resourceType: identificationFile.mimetype === 'application/pdf' ? 'raw' : 'auto'
    });
    storedFiles.push(storedIdentification);

    parsedVehicles = await Promise.all(parsedVehicles.map(async (vehicle, index) => {
      const photoFieldName = `vehiclePhoto_${index}`;
      const vehicleWithPhoto = { ...vehicle };

      if (req.files[photoFieldName] && req.files[photoFieldName][0]) {
        const vehiclePhoto = req.files[photoFieldName][0];

        if (vehiclePhoto.size > IMAGE_UPLOAD_MAX_BYTES) {
          throw new Error(`Vehicle photo ${index + 1} is too large. Maximum size is ${Math.round(IMAGE_UPLOAD_MAX_BYTES / (1024 * 1024))}MB.`);
        }

        const storedPhoto = await storeUploadedFile(vehiclePhoto, {
          folder: 'ecotrend-hoa/vehicles',
          localDir: 'uploads/vehicles',
          prefix: 'vehicle',
          resourceType: 'image'
        });
        storedFiles.push(storedPhoto);
        vehicleWithPhoto.photo = storedPhoto;
      }

      return vehicleWithPhoto;
    }));

    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({
      email: normalizedEmail,
      familyName: familyNameValidation.value,
      username,
      password: hashedPassword,
      houseAddress: householdDetails.houseAddress,
      addressKey: householdDetails.addressKey,
      propertyType: householdDetails.propertyType,
      occupancyType: householdDetails.occupancyType,
      block: householdDetails.block,
      lot: householdDetails.lot,
      phase: householdDetails.phase,
      buildingName: householdDetails.buildingName,
      unitNumber: householdDetails.unitNumber,
      street: householdDetails.street,
      occupancyStartDate: householdDetails.occupancyStartDate,
      occupancyEndDate: householdDetails.occupancyEndDate,
      expiresAt: householdDetails.expiresAt,
      renewalStatus: householdDetails.renewalStatus,
      phoneNumber: phoneNumberValidation.value,
      familyMembers: parsedFamilyMembers,
      vehicles: parsedVehicles,
      identificationDocument: storedIdentification,
      isApproved: false
    });

    await newUser.save();

    res.status(201).json({
      message: 'Registration successful! Please wait for admin approval.',
      userId: newUser._id
    });
  } catch (error) {
    console.error('Registration error:', error);
    await Promise.all(storedFiles.map((file) => deleteStoredFile(file).catch((cleanupError) => {
      console.error('Cleanup error:', cleanupError);
    })));
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { username, password } = req.body;

    let user = await MasterAdmin.findOne({ username });
    let role = 'MASTER_ADMIN';
    let position = OFFICER_POSITIONS.PRESIDENT;

    if (!user) {
      user = await Admin.findOne({ username });
      role = 'ADMIN';
      position = normalizeOfficerPosition(user?.position);
    }

    if (!user) {
      user = await Guard.findOne({ username });
      role = 'GUARD';
      position = '';
    }

    if (!user) {
      user = await User.findOne({ username });
      role = 'RESIDENT';
      position = '';

      if (user && !user.isApproved) {
        return res.status(403).json({
          message: 'Your account is pending admin approval.'
        });
      }
    }

    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const residentSnapshot = role === 'RESIDENT' ? appendResidentComputedFields(user) : null;

    const tokenPayload = {
      userId: user._id,
      role,
      username: user.username,
      modules: getEffectiveModules({
        role,
        position,
        modules: user.modules
      })
    };

    if (position) {
      tokenPayload.position = position;
    }

    if (user.fullName) {
      tokenPayload.fullName = user.fullName;
    }

    if (user.familyName) {
      tokenPayload.familyName = user.familyName;
    }

    if (residentSnapshot) {
      tokenPayload.accountStatus = residentSnapshot.accountStatus;
      tokenPayload.occupancyType = residentSnapshot.occupancyType;
      tokenPayload.propertyType = residentSnapshot.propertyType;
      tokenPayload.expiresAt = residentSnapshot.expiresAt;
      tokenPayload.isAccessRestricted = residentSnapshot.isAccessRestricted;
    }

    const token = jwt.sign(
      tokenPayload,
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    const userPayload = {
      id: user._id,
      username: user.username,
      role,
      modules: getEffectiveModules({
        role,
        position,
        modules: user.modules
      })
    };

    if (position) {
      userPayload.position = position;
    }

    if (user.fullName) {
      userPayload.fullName = user.fullName;
    }

    if (user.familyName) {
      userPayload.familyName = user.familyName;
    }

    if (residentSnapshot) {
      userPayload.accountStatus = residentSnapshot.accountStatus;
      userPayload.accountStatusLabel = residentSnapshot.accountStatusLabel;
      userPayload.occupancyType = residentSnapshot.occupancyType;
      userPayload.propertyType = residentSnapshot.propertyType;
      userPayload.expiresAt = residentSnapshot.expiresAt;
      userPayload.isAccessRestricted = residentSnapshot.isAccessRestricted;
    }

    return res.json({
      token,
      role,
      user: userPayload
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.me = async (req, res) => {
  try {
    const userPayload = {
      id: req.user.id || req.user.userId,
      username: req.user.username,
      role: req.user.role
    };

    if (Array.isArray(req.user.modules)) {
      userPayload.modules = req.user.modules;
    }

    if (req.user.position) {
      userPayload.position = req.user.position;
    }

    if (req.user.fullName) {
      userPayload.fullName = req.user.fullName;
    }

    if (req.user.familyName) {
      userPayload.familyName = req.user.familyName;
    }

    if (String(req.user.role || '').toUpperCase() === 'RESIDENT') {
      userPayload.accountStatus = req.user.accountStatus;
      userPayload.occupancyType = req.user.occupancyType;
      userPayload.propertyType = req.user.propertyType;
      userPayload.expiresAt = req.user.expiresAt;
      userPayload.isAccessRestricted = req.user.isAccessRestricted;
    }

    return res.json({ user: userPayload });
  } catch (error) {
    return res.status(500).json({ message: 'Failed to load current user', error: error.message });
  }
};
