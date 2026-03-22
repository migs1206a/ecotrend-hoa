//backend/controllers/deliveryController.js
const Delivery = require('../models/Delivery');

// @desc    Register new delivery
// @route   POST /api/deliveries
// @access  Guard only
exports.registerDelivery = async (req, res) => {
  try {
    const { 
      driverName, 
      contactNumber, 
      hostResidentId,
      hostResidentName,
      hostResidentAddress,
      vehiclePlateNumber,
      vehicleType,
      vehicleColor,
      guardOnDuty
    } = req.body;

    const delivery = new Delivery({
      driverName,
      contactNumber,
      deliveryAddress: hostResidentAddress,
      hostResident: hostResidentId,
      hostResidentName,
      hostResidentAddress,
      vehiclePlateNumber,
      vehicleType,
      vehicleColor,
      guardOnDuty,
      entryTime: new Date(),
      status: 'inside'
    });

    await delivery.save();

    res.status(201).json({
      message: 'Delivery registered successfully',
      delivery
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get all deliveries
// @route   GET /api/deliveries
// @access  Guard/Admin only
exports.getAllDeliveries = async (req, res) => {
  try {
    const deliveries = await Delivery.find()
      .populate('guardOnDuty', 'username fullName')
      .populate('hostResident', 'familyName houseAddress street phoneNumber')
      .sort({ entryTime: -1 });
      // REMOVED .limit(50) to show ALL deliveries

    res.json(deliveries);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get active deliveries
// @route   GET /api/deliveries/active
// @access  Guard/Admin only
exports.getActiveDeliveries = async (req, res) => {
  try {
    const activeDeliveries = await Delivery.find({ status: 'inside' })
      .populate('guardOnDuty', 'username fullName')
      .populate('hostResident', 'familyName houseAddress street phoneNumber')
      .sort({ entryTime: -1 });

    res.json(activeDeliveries);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get deliveries by resident ID
// @route   GET /api/deliveries/resident/:residentId
// @access  Resident/Admin only
exports.getDeliveriesByResident = async (req, res) => {
  try {
    const deliveries = await Delivery.find({ hostResident: req.params.residentId })
      .populate('guardOnDuty', 'username fullName')
      .sort({ entryTime: -1 })
      .limit(20);

    res.json(deliveries);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Log delivery exit
// @route   PATCH /api/deliveries/:id/exit
// @access  Guard only
exports.logDeliveryExit = async (req, res) => {
  try {
    const delivery = await Delivery.findByIdAndUpdate(
      req.params.id,
      {
        exitTime: new Date(),
        status: 'exited'
      },
      { new: true }
    );

    if (!delivery) {
      return res.status(404).json({ message: 'Delivery not found' });
    }

    res.json({
      message: 'Delivery exit logged successfully',
      delivery
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};