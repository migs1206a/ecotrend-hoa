//backend/controllers/adminController.js

const bcrypt = require('bcryptjs');
const Admin = require('../models/Admin');

// @desc    Get all admins
// @route   GET /api/admin
// @access  Super Admin only
exports.getAllAdmins = async (req, res) => {
  try {
    const admins = await Admin.find().select('-password');
    res.json(admins);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Create new admin
// @route   POST /api/admin/create
// @access  Super Admin only
exports.createAdmin = async (req, res) => {
  try {
    const { username, password } = req.body;

    const existingAdmin = await Admin.findOne({ username });
    if (existingAdmin) {
      return res.status(400).json({ message: 'Admin already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const admin = new Admin({
      username,
      password: hashedPassword,
      role: 'ADMIN'
    });

    await admin.save();

    res.status(201).json({ 
      message: 'Admin created successfully',
      admin: {
        id: admin._id,
        username: admin.username,
        role: admin.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get admin by ID
// @route   GET /api/admin/:id
// @access  Super Admin only
exports.getAdminById = async (req, res) => {
  try {
    const admin = await Admin.findById(req.params.id).select('-password');
    
    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }
    
    res.json(admin);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Update admin
// @route   PUT /api/admin/:id
// @access  Super Admin only
exports.updateAdmin = async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const updateData = { username };
    
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }

    const admin = await Admin.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    ).select('-password');

    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    res.json({ 
      message: 'Admin updated successfully', 
      admin 
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Delete admin
// @route   DELETE /api/admin/:id
// @access  Super Admin only
exports.deleteAdmin = async (req, res) => {
  try {
    const admin = await Admin.findByIdAndDelete(req.params.id);

    if (!admin) {
      return res.status(404).json({ message: 'Admin not found' });
    }

    res.json({ 
      message: 'Admin deleted successfully',
      deletedId: req.params.id
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
