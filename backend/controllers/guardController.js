//backend/controllers/guardController.js
const bcrypt = require('bcryptjs');
const Guard = require('../models/Guard');
const { validateNameField } = require('../utils/fieldValidation');

// @desc    Get all guards
// @route   GET /api/guards
// @access  Admin only
exports.getAllGuards = async (req, res) => {
  try {
    const guards = await Guard.find()
      .select('-password')
      .sort({ createdAt: -1 });
    
    res.json(guards);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get guard by ID
// @route   GET /api/guards/:id
// @access  Admin only
exports.getGuardById = async (req, res) => {
  try {
    const guard = await Guard.findById(req.params.id).select('-password');
    
    if (!guard) {
      return res.status(404).json({ message: 'Guard not found' });
    }
    
    res.json(guard);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Create new guard
// @route   POST /api/guards/create
// @access  Admin only
exports.createGuard = async (req, res) => {
  try {
    const { username, password, fullName } = req.body;

    const fullNameValidation = validateNameField(fullName, 'Guard full name', {
      minLength: 2,
      maxLength: 80
    });
    if (fullNameValidation.error) {
      return res.status(400).json({ message: fullNameValidation.error });
    }

    const existingGuard = await Guard.findOne({ username });
    if (existingGuard) {
      return res.status(400).json({ message: 'Guard username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const guard = new Guard({
      username,
      password: hashedPassword,
      fullName: fullNameValidation.value,
      role: 'GUARD'
    });

    await guard.save();

    res.status(201).json({ 
      message: 'Guard created successfully',
      guard: {
        id: guard._id,
        username: guard.username,
        fullName: guard.fullName,
        role: guard.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Update guard
// @route   PUT /api/guards/:id
// @access  Admin only
exports.updateGuard = async (req, res) => {
  try {
    const { username, password, fullName } = req.body;

    const updateData = { username };

    if (fullName !== undefined) {
      const fullNameValidation = validateNameField(fullName, 'Guard full name', {
        minLength: 2,
        maxLength: 80
      });
      if (fullNameValidation.error) {
        return res.status(400).json({ message: fullNameValidation.error });
      }
      updateData.fullName = fullNameValidation.value;
    }
    
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    const guard = await Guard.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    if (!guard) {
      return res.status(404).json({ message: 'Guard not found' });
    }

    res.json({ 
      message: 'Guard updated successfully', 
      guard 
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Delete guard
// @route   DELETE /api/guards/:id
// @access  Admin only
exports.deleteGuard = async (req, res) => {
  try {
    const guard = await Guard.findByIdAndDelete(req.params.id);

    if (!guard) {
      return res.status(404).json({ message: 'Guard not found' });
    }

    res.json({ 
      message: 'Guard deleted successfully',
      deletedId: req.params.id
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get guard statistics
// @route   GET /api/guards/stats/summary
// @access  Admin only
exports.getGuardStats = async (req, res) => {
  try {
    const totalGuards = await Guard.countDocuments();

    res.json({
      totalGuards
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
