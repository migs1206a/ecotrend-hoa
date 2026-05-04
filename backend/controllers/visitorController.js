const Visitor = require('../models/Visitor');
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

const normalizeAccompanyingVisitors = (companions) => {
  if (!Array.isArray(companions)) return { value: [] };

  const normalizedCompanions = [];
  for (let index = 0; index < companions.length; index += 1) {
    const companion = companions[index] || {};
    const label = `Companion ${index + 1}`;
    const relationshipToResident = String(companion.relationshipToResident || '').trim().replace(/\s+/g, ' ');
    const identification = String(companion.identification || '').trim().replace(/\s+/g, ' ');

    if (!relationshipToResident || relationshipToResident.length > 50) {
      return { error: `${label} relationship to resident is required and must not exceed 50 characters` };
    }

    const lastNameValidation = validateNameField(companion.lastName, `${label} last name`, {
      minLength: 1,
      maxLength: 30
    });
    if (lastNameValidation.error) {
      return { error: lastNameValidation.error };
    }

    const firstNameValidation = validateNameField(companion.firstName, `${label} first name`, {
      minLength: 1,
      maxLength: 30
    });
    if (firstNameValidation.error) {
      return { error: firstNameValidation.error };
    }

    if (!identification || identification.length > 80) {
      return { error: `${label} identification is required and must not exceed 80 characters` };
    }

    normalizedCompanions.push({
      relationshipToResident,
      lastName: lastNameValidation.value,
      firstName: firstNameValidation.value,
      identification
    });
  }

  return { value: normalizedCompanions };
};

// @desc    Register new visitor (by guard - immediate entry)
// @route   POST /api/visitors
// @access  Guard only
exports.registerVisitor = async (req, res) => {
  try {
    const { 
      name, 
      contactNumber, 
      purpose, 
      hostResidentId,
      hostResidentName,
      hostResidentAddress,
      vehiclePlateNumber,
      vehicleType,
      vehicleColor,
      guardOnDuty
    } = req.body;

    const nameValidation = validateNameField(name, 'Visitor name', {
      minLength: 2,
      maxLength: 80
    });
    if (nameValidation.error) {
      return res.status(400).json({ message: nameValidation.error });
    }

    const contactNumberValidation = validatePhoneNumberField(contactNumber, 'Contact number');
    if (contactNumberValidation.error) {
      return res.status(400).json({ message: contactNumberValidation.error });
    }

    const plateValidation = normalizePlateNumber(vehiclePlateNumber);
    if (plateValidation.error) {
      return res.status(400).json({ message: plateValidation.error });
    }

    const visitor = new Visitor({
      name: nameValidation.value,
      contactNumber: contactNumberValidation.value,
      purpose: String(purpose || '').trim(),
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

    await visitor.save();

    res.status(201).json({
      message: 'Visitor registered successfully',
      visitor
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Pre-register visitor (by resident)
// @route   POST /api/visitors/pre-register
// @access  Resident only
exports.preRegisterVisitor = async (req, res) => {
  try {
    const { 
      name, 
      contactNumber, 
      purpose, 
      hostResidentId,
      hostResidentName,
      hostResidentAddress,
      vehiclePlateNumber,
      vehicleType,
      vehicleColor,
      expectedDate,
      preRegisteredBy,
      accompanyingVisitors
    } = req.body;

    const nameValidation = validateNameField(name, 'Visitor name', {
      minLength: 2,
      maxLength: 80
    });
    if (nameValidation.error) {
      return res.status(400).json({ message: nameValidation.error });
    }

    const contactNumberValidation = validatePhoneNumberField(contactNumber, 'Contact number');
    if (contactNumberValidation.error) {
      return res.status(400).json({ message: contactNumberValidation.error });
    }

    const plateValidation = normalizePlateNumber(vehiclePlateNumber);
    if (plateValidation.error) {
      return res.status(400).json({ message: plateValidation.error });
    }

    const companionsValidation = normalizeAccompanyingVisitors(accompanyingVisitors);
    if (companionsValidation.error) {
      return res.status(400).json({ message: companionsValidation.error });
    }

    const visitor = new Visitor({
      name: nameValidation.value,
      contactNumber: contactNumberValidation.value,
      purpose: String(purpose || '').trim(),
      hostResident: hostResidentId,
      hostResidentName,
      hostResidentAddress,
      vehiclePlateNumber: plateValidation.value,
      vehicleType,
      vehicleColor,
      accompanyingVisitors: companionsValidation.value,
      expectedDate,
      preRegisteredBy,
      status: 'pre-registered'
    });

    await visitor.save();

    res.status(201).json({
      message: 'Visitor pre-registered successfully',
      visitor
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get all visitors
// @route   GET /api/visitors
// @access  Guard/Admin only
exports.getAllVisitors = async (req, res) => {
  try {
    const pagination = parsePagination(req.query);
    const query = Visitor.find()
      .populate('guardOnDuty', 'username fullName')
      .populate('hostResident', 'familyName houseAddress street phoneNumber')
      .populate('preRegisteredBy', 'familyName username')
      .sort({ entryTime: -1, createdAt: -1 });

    if (pagination.enabled) {
      const [items, total] = await Promise.all([
        query.clone().skip(pagination.skip).limit(pagination.limit),
        Visitor.countDocuments()
      ]);
      return sendPaginatedResponse(res, pagination, items, total);
    }

    const visitors = await query.limit(50);
    res.json(visitors);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get active visitors
// @route   GET /api/visitors/active
// @access  Guard/Admin only
exports.getActiveVisitors = async (req, res) => {
  try {
    const filter = { status: 'inside' };
    const pagination = parsePagination(req.query);
    const query = Visitor.find(filter)
      .populate('guardOnDuty', 'username fullName')
      .populate('hostResident', 'familyName houseAddress street phoneNumber')
      .populate('preRegisteredBy', 'familyName username')
      .sort({ entryTime: -1 });

    if (pagination.enabled) {
      const [items, total] = await Promise.all([
        query.clone().skip(pagination.skip).limit(pagination.limit),
        Visitor.countDocuments(filter)
      ]);
      return sendPaginatedResponse(res, pagination, items, total);
    }

    const activeVisitors = await query;
    res.json(activeVisitors);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get pre-registered visitors
// @route   GET /api/visitors/pre-registered
// @access  Guard/Admin only
exports.getPreRegisteredVisitors = async (req, res) => {
  try {
    const filter = { status: 'pre-registered' };
    const pagination = parsePagination(req.query);
    const query = Visitor.find(filter)
      .populate('hostResident', 'familyName houseAddress street phoneNumber')
      .populate('preRegisteredBy', 'familyName username')
      .sort({ expectedDate: 1, createdAt: -1 });

    if (pagination.enabled) {
      const [items, total] = await Promise.all([
        query.clone().skip(pagination.skip).limit(pagination.limit),
        Visitor.countDocuments(filter)
      ]);
      return sendPaginatedResponse(res, pagination, items, total);
    }

    const preRegisteredVisitors = await query;
    res.json(preRegisteredVisitors);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Get visitors by resident ID
// @route   GET /api/visitors/resident/:residentId
// @access  Resident/Admin only
exports.getVisitorsByResident = async (req, res) => {
  try {
    const filter = { hostResident: req.params.residentId };
    const pagination = parsePagination(req.query);
    const query = Visitor.find(filter)
      .populate('guardOnDuty', 'username fullName')
      .sort({ entryTime: -1, createdAt: -1 })
;

    if (pagination.enabled) {
      const [items, total] = await Promise.all([
        query.clone().skip(pagination.skip).limit(pagination.limit),
        Visitor.countDocuments(filter)
      ]);
      return sendPaginatedResponse(res, pagination, items, total);
    }

    const visitors = await query.limit(20);
    res.json(visitors);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Convert pre-registered visitor to entry
// @route   PATCH /api/visitors/:id/entry
// @access  Guard only
exports.logPreRegisteredEntry = async (req, res) => {
  try {
    const { guardOnDuty } = req.body;

    const visitor = await Visitor.findById(req.params.id);

    if (!visitor) {
      return res.status(404).json({ message: 'Visitor not found' });
    }

    if (visitor.status !== 'pre-registered') {
      return res.status(400).json({ message: 'Visitor is not pre-registered' });
    }

    visitor.status = 'inside';
    visitor.entryTime = new Date();
    visitor.guardOnDuty = guardOnDuty;

    await visitor.save();

    res.json({
      message: 'Pre-registered visitor entry logged successfully',
      visitor
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Log visitor exit
// @route   PATCH /api/visitors/:id/exit
// @access  Guard only
exports.logVisitorExit = async (req, res) => {
  try {
    const visitor = await Visitor.findByIdAndUpdate(
      req.params.id,
      {
        exitTime: new Date(),
        status: 'exited'
      },
      { new: true }
    );

    if (!visitor) {
      return res.status(404).json({ message: 'Visitor not found' });
    }

    res.json({
      message: 'Visitor exit logged successfully',
      visitor
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Cancel pre-registered visitor
// @route   DELETE /api/visitors/:id/cancel
// @access  Guard/Resident only
exports.cancelPreRegisteredVisitor = async (req, res) => {
  try {
    const visitor = await Visitor.findById(req.params.id);

    if (!visitor) {
      return res.status(404).json({ message: 'Visitor not found' });
    }

    if (visitor.status !== 'pre-registered') {
      return res.status(400).json({ message: 'Only pre-registered visitors can be cancelled' });
    }

    await Visitor.findByIdAndDelete(req.params.id);

    res.json({
      message: 'Pre-registered visitor cancelled successfully'
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
