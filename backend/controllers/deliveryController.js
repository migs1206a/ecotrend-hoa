//backend/controllers/deliveryController.js
const Delivery = require('../models/Delivery');
const { parsePagination, sendPaginatedResponse } = require('../utils/pagination');
const {
  validateNameField,
  validatePhoneNumberField
} = require('../utils/fieldValidation');

const normalizePlateNumber = (value) => {
  const normalized = String(value || '').trim().toUpperCase();
  if (!normalized) return { value: '' };
  if (!/^[A-Z0-9]{1,10}$/.test(normalized)) {
    return { error: 'Plate number can only contain letters and numbers' };
  }
  return { value: normalized };
};

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

    const driverNameValidation = validateNameField(driverName, 'Driver name', {
      minLength: 2,
      maxLength: 80
    });
    if (driverNameValidation.error) {
      return res.status(400).json({ message: driverNameValidation.error });
    }

    const contactNumberValidation = validatePhoneNumberField(contactNumber, 'Contact number');
    if (contactNumberValidation.error) {
      return res.status(400).json({ message: contactNumberValidation.error });
    }

    const plateValidation = normalizePlateNumber(vehiclePlateNumber);
    if (plateValidation.error) {
      return res.status(400).json({ message: plateValidation.error });
    }

    const delivery = new Delivery({
      driverName: driverNameValidation.value,
      contactNumber: contactNumberValidation.value,
      deliveryAddress: hostResidentAddress,
      hostResident: hostResidentId,
      hostResidentName,
      hostResidentAddress,
      vehiclePlateNumber: plateValidation.value,
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
    const pagination = parsePagination(req.query);
    const query = Delivery.find()
      .populate('guardOnDuty', 'username fullName')
      .populate('hostResident', 'familyName houseAddress street phoneNumber')
      .sort({ entryTime: -1 });

    if (pagination.enabled) {
      const [items, total] = await Promise.all([
        query.clone().skip(pagination.skip).limit(pagination.limit),
        Delivery.countDocuments()
      ]);
      return sendPaginatedResponse(res, pagination, items, total);
    }

    const deliveries = await query;
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
    const filter = { status: 'inside' };
    const pagination = parsePagination(req.query);
    const query = Delivery.find(filter)
      .populate('guardOnDuty', 'username fullName')
      .populate('hostResident', 'familyName houseAddress street phoneNumber')
      .sort({ entryTime: -1 });

    if (pagination.enabled) {
      const [items, total] = await Promise.all([
        query.clone().skip(pagination.skip).limit(pagination.limit),
        Delivery.countDocuments(filter)
      ]);
      return sendPaginatedResponse(res, pagination, items, total);
    }

    const activeDeliveries = await query;
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
    const filter = { hostResident: req.params.residentId };
    const pagination = parsePagination(req.query);
    const query = Delivery.find(filter)
      .populate('guardOnDuty', 'username fullName')
      .sort({ entryTime: -1 });

    if (pagination.enabled) {
      const [items, total] = await Promise.all([
        query.clone().skip(pagination.skip).limit(pagination.limit),
        Delivery.countDocuments(filter)
      ]);
      return sendPaginatedResponse(res, pagination, items, total);
    }

    const deliveries = await query.limit(20);
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
