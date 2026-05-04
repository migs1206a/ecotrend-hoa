//backend/controllers/searchController.js

const User = require('../models/User');
const { isResidentAccountExpired } = require('../utils/residentAccounts');

// @desc    Search residents and vehicles
// @route   GET /api/guards/search
// @access  Guard only
exports.searchResidentsAndVehicles = async (req, res) => {
  try {
    const { type, query } = req.query;

    if (!query || !type) {
      return res.status(400).json({ message: 'Type and query are required' });
    }

    let results = [];

    if (type === 'resident') {
      // Search by family name, username, or address
      results = await User.find({
        isApproved: true,
        $or: [
          { familyName: { $regex: query, $options: 'i' } },
          { username: { $regex: query, $options: 'i' } },
          { houseAddress: { $regex: query, $options: 'i' } },
          { street: { $regex: query, $options: 'i' } }
        ]
      }).select('-password').limit(20);

      results = results.filter((resident) => !isResidentAccountExpired(resident)).slice(0, 10);
    } else if (type === 'vehicle') {
      // This is handled by the separate route below
      results = [];
    }

    res.json(results);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Search vehicles by plate number
// @route   GET /api/guards/search/vehicle
// @access  Guard only
exports.searchVehicles = async (req, res) => {
  try {
    const { query } = req.query;

    if (!query) {
      return res.status(400).json({ message: 'Query is required' });
    }

    // Search for residents who have vehicles matching the plate number
    const residents = await User.find({
      isApproved: true,
      'vehicles.plateNumber': { $regex: query, $options: 'i' }
    }).select('-password');

    // Extract matching vehicles with owner info
    const vehicleResults = [];
    
    residents.forEach(resident => {
      if (isResidentAccountExpired(resident)) {
        return;
      }

      const matchingVehicles = resident.vehicles.filter(vehicle =>
        vehicle.plateNumber.toLowerCase().includes(query.toLowerCase())
      );
      
      matchingVehicles.forEach(vehicle => {
        vehicleResults.push({
          plateNumber: vehicle.plateNumber,
          vehicleType: vehicle.vehicleType,
          brand: vehicle.brand,
          model: vehicle.model,
          color: vehicle.color,
          ownerName: resident.familyName,
          familyName: resident.familyName,
          houseAddress: resident.houseAddress,
          street: resident.street,
          phoneNumber: resident.phoneNumber
        });
      });
    });

    res.json(vehicleResults);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
