const User = require('../models/User');
const path = require('path');
const fs = require('fs');

// @desc    Get all approved residents
// @route   GET /api/residents/approved
// @access  Admin only
exports.getApprovedResidents = async (req, res) => {
  try {
    const approvedUsers = await User.find({ isApproved: true })
      .select('-password')
      .sort({ createdAt: -1 });
    
    res.json(approvedUsers);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get pending residents
// @route   GET /api/residents/pending
// @access  Admin only
exports.getPendingResidents = async (req, res) => {
  try {
    const pendingUsers = await User.find({ isApproved: false })
      .select('-password')
      .sort({ createdAt: -1 });
    
    res.json(pendingUsers);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get single resident by ID
// @route   GET /api/residents/:id
// @access  Admin only
exports.getResidentById = async (req, res) => {
  try {
    const resident = await User.findById(req.params.id).select('-password');
    
    if (!resident) {
      return res.status(404).json({ message: 'Resident not found' });
    }
    
    res.json(resident);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Approve resident
// @route   PATCH /api/residents/:id/approve
// @access  Admin only
exports.approveResident = async (req, res) => {
  try {
    const resident = await User.findByIdAndUpdate(
      req.params.id,
      { isApproved: true },
      { new: true }
    ).select('-password');

    if (!resident) {
      return res.status(404).json({ message: 'Resident not found' });
    }

    res.json({ 
      message: 'Resident approved successfully', 
      resident 
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Delete resident
// @route   DELETE /api/residents/:id
// @access  Admin only
exports.deleteResident = async (req, res) => {
  try {
    const resident = await User.findByIdAndDelete(req.params.id);

    if (!resident) {
      return res.status(404).json({ message: 'Resident not found' });
    }

    res.json({ 
      message: 'Resident deleted successfully',
      deletedId: req.params.id
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Update resident information
// @route   PUT /api/residents/:id
// @access  Admin only
exports.updateResident = async (req, res) => {
  try {
    const { 
      email, 
      familyName, 
      houseAddress, 
      street, 
      phoneNumber,
      familyMembers 
    } = req.body;
    
    const resident = await User.findByIdAndUpdate(
      req.params.id,
      { 
        email, 
        familyName, 
        houseAddress, 
        street, 
        phoneNumber,
        familyMembers
      },
      { new: true, runValidators: true }
    ).select('-password');

    if (!resident) {
      return res.status(404).json({ message: 'Resident not found' });
    }

    res.json({ 
      message: 'Resident updated successfully', 
      resident 
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get resident statistics
// @route   GET /api/residents/stats/summary
// @access  Admin only
exports.getResidentStats = async (req, res) => {
  try {
    const totalResidents = await User.countDocuments({ isApproved: true });
    const pendingApprovals = await User.countDocuments({ isApproved: false });
    const totalUsers = await User.countDocuments();

    res.json({
      totalResidents,
      pendingApprovals,
      totalUsers
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get resident identification document
// @route   GET /api/residents/:id/identification
// @access  Admin only
exports.getResidentIdentification = async (req, res) => {
  try {
    const resident = await User.findById(req.params.id);
    
    if (!resident) {
      return res.status(404).json({ message: 'Resident not found' });
    }

    if (!resident.identificationDocument) {
      return res.status(404).json({ message: 'No identification document found' });
    }

    res.json({
      filename: resident.identificationDocument.filename,
      originalName: resident.identificationDocument.originalName,
      mimetype: resident.identificationDocument.mimetype,
      url: `/uploads/identification/${resident.identificationDocument.filename}`
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// ============= VEHICLE MANAGEMENT =============

// @desc    Get all vehicles for a resident
// @route   GET /api/residents/:id/vehicles
// @access  Resident/Admin
exports.getResidentVehicles = async (req, res) => {
  try {
    const resident = await User.findById(req.params.id).select('vehicles');
    
    if (!resident) {
      return res.status(404).json({ message: 'Resident not found' });
    }

    // Only return vehicles that have NOT been soft-deleted
    const activeVehicles = (resident.vehicles || []).filter(v => !v.deletedAt);
    res.json(activeVehicles);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Add vehicle to resident
// @route   POST /api/residents/:id/vehicles
// @access  Resident/Admin
exports.addVehicle = async (req, res) => {
  try {
    const { plateNumber, vehicleType, brand, model, color } = req.body;
    
    if (!plateNumber || !vehicleType || !brand || !model || !color) {
      return res.status(400).json({ message: 'All vehicle fields are required' });
    }

    const resident = await User.findById(req.params.id);
    
    if (!resident) {
      return res.status(404).json({ message: 'Resident not found' });
    }

    // Check if plate number already exists for this resident
    const plateExists = resident.vehicles.some(
      v => v.plateNumber.toUpperCase() === plateNumber.toUpperCase()
    );

    if (plateExists) {
      return res.status(400).json({ message: 'Vehicle with this plate number already registered' });
    }

    // Create vehicle object
    const newVehicle = {
      plateNumber: plateNumber.toUpperCase(),
      vehicleType,
      brand,
      model,
      color
    };

    // Add photo if uploaded
    if (req.file) {
      newVehicle.photo = {
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: req.file.path
      };
    }

    resident.vehicles.push(newVehicle);
    await resident.save();

    // Get the newly added vehicle (last one in array)
    const addedVehicle = resident.vehicles[resident.vehicles.length - 1];

    res.status(201).json({
      message: 'Vehicle added successfully',
      vehicle: addedVehicle
    });
  } catch (error) {
    // Clean up uploaded file if there's an error
    if (req.file) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Error deleting file:', err);
      });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Update vehicle
// @route   PUT /api/residents/:id/vehicles/:vehicleId
// @access  Resident/Admin
exports.updateVehicle = async (req, res) => {
  try {
    const { plateNumber, vehicleType, brand, model, color } = req.body;
    
    const resident = await User.findById(req.params.id);
    
    if (!resident) {
      return res.status(404).json({ message: 'Resident not found' });
    }

    const vehicle = resident.vehicles.id(req.params.vehicleId);
    
    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found' });
    }

    // Check if new plate number conflicts with existing vehicles
    if (plateNumber && plateNumber.toUpperCase() !== vehicle.plateNumber) {
      const plateExists = resident.vehicles.some(
        v => v._id.toString() !== req.params.vehicleId && 
             v.plateNumber.toUpperCase() === plateNumber.toUpperCase()
      );

      if (plateExists) {
        return res.status(400).json({ message: 'Vehicle with this plate number already registered' });
      }
    }

    // Update fields
    if (plateNumber) vehicle.plateNumber = plateNumber.toUpperCase();
    if (vehicleType) vehicle.vehicleType = vehicleType;
    if (brand) vehicle.brand = brand;
    if (model) vehicle.model = model;
    if (color) vehicle.color = color;

    // Update photo if new one uploaded
    if (req.file) {
      // Delete old photo if it exists
      if (vehicle.photo && vehicle.photo.path) {
        fs.unlink(vehicle.photo.path, (err) => {
          if (err) console.error('Error deleting old photo:', err);
        });
      }

      vehicle.photo = {
        filename: req.file.filename,
        originalName: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        path: req.file.path
      };
    }

    await resident.save();

    res.json({
      message: 'Vehicle updated successfully',
      vehicle
    });
  } catch (error) {
    // Clean up uploaded file if there's an error
    if (req.file) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Error deleting file:', err);
      });
    }
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Delete vehicle
// @route   DELETE /api/residents/:id/vehicles/:vehicleId
// @access  Resident/Admin
exports.deleteVehicle = async (req, res) => {
  try {
    const resident = await User.findById(req.params.id);
    
    if (!resident) {
      return res.status(404).json({ message: 'Resident not found' });
    }

    const vehicle = resident.vehicles.id(req.params.vehicleId);
    
    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found' });
    }

    // Soft delete — just stamp the time, don't remove
    vehicle.deletedAt = new Date();
    await resident.save();

    res.json({
      message: 'Vehicle moved to trash',
      vehicleId: req.params.vehicleId
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get soft-deleted vehicles within 48hrs
// @route   GET /api/residents/:id/vehicles/deleted
// @access  Resident/Admin
exports.getDeletedVehicles = async (req, res) => {
  try {
    const resident = await User.findById(req.params.id).select('vehicles');
    
    if (!resident) {
      return res.status(404).json({ message: 'Resident not found' });
    }

    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const deletedVehicles = (resident.vehicles || []).filter(
      v => v.deletedAt && v.deletedAt >= cutoff
    );

    res.json(deletedVehicles);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Restore a soft-deleted vehicle
// @route   PATCH /api/residents/:id/vehicles/:vehicleId/restore
// @access  Resident/Admin
exports.restoreVehicle = async (req, res) => {
  try {
    const resident = await User.findById(req.params.id);
    
    if (!resident) {
      return res.status(404).json({ message: 'Resident not found' });
    }

    const vehicle = resident.vehicles.id(req.params.vehicleId);
    
    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found' });
    }

    // Check it hasn't passed the 48hr window
    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
    if (vehicle.deletedAt && vehicle.deletedAt < cutoff) {
      return res.status(400).json({ message: 'Recovery window has expired for this vehicle' });
    }

    vehicle.deletedAt = null;
    await resident.save();

    res.json({
      message: 'Vehicle restored successfully',
      vehicle
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Permanently delete a soft-deleted vehicle
// @route   DELETE /api/residents/:id/vehicles/:vehicleId/permanent
// @access  Resident/Admin
exports.permanentDeleteVehicle = async (req, res) => {
  try {
    const resident = await User.findById(req.params.id);
    
    if (!resident) {
      return res.status(404).json({ message: 'Resident not found' });
    }

    const vehicle = resident.vehicles.id(req.params.vehicleId);
    
    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found' });
    }

    // Delete photo file from disk if it exists
    if (vehicle.photo && vehicle.photo.path) {
      fs.unlink(vehicle.photo.path, (err) => {
        if (err) console.error('Error deleting photo file:', err);
      });
    }

    resident.vehicles.pull(req.params.vehicleId);
    await resident.save();

    res.json({
      message: 'Vehicle permanently deleted',
      deletedId: req.params.vehicleId
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get vehicle photo
// @route   GET /api/residents/:id/vehicles/:vehicleId/photo
// @access  Resident/Admin/Guard
exports.getVehiclePhoto = async (req, res) => {
  try {
    const resident = await User.findById(req.params.id);
    
    if (!resident) {
      return res.status(404).json({ message: 'Resident not found' });
    }

    const vehicle = resident.vehicles.id(req.params.vehicleId);
    
    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found' });
    }

    if (!vehicle.photo || !vehicle.photo.path) {
      return res.status(404).json({ message: 'No photo found for this vehicle' });
    }

    res.json({
      filename: vehicle.photo.filename,
      originalName: vehicle.photo.originalName,
      mimetype: vehicle.photo.mimetype,
      url: `/uploads/vehicles/${vehicle.photo.filename}`
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};