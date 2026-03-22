const Visitor = require('../models/Visitor');

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

    const visitor = new Visitor({
      name,
      contactNumber,
      purpose,
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
      preRegisteredBy
    } = req.body;

    const visitor = new Visitor({
      name,
      contactNumber,
      purpose,
      hostResident: hostResidentId,
      hostResidentName,
      hostResidentAddress,
      vehiclePlateNumber,
      vehicleType,
      vehicleColor,
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
    const visitors = await Visitor.find()
      .populate('guardOnDuty', 'username fullName')
      .populate('hostResident', 'familyName houseAddress street phoneNumber')
      .populate('preRegisteredBy', 'familyName username')
      .sort({ entryTime: -1, createdAt: -1 })
      .limit(50);

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
    const activeVisitors = await Visitor.find({ status: 'inside' })
      .populate('guardOnDuty', 'username fullName')
      .populate('hostResident', 'familyName houseAddress street phoneNumber')
      .populate('preRegisteredBy', 'familyName username')
      .sort({ entryTime: -1 });

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
    const preRegisteredVisitors = await Visitor.find({ status: 'pre-registered' })
      .populate('hostResident', 'familyName houseAddress street phoneNumber')
      .populate('preRegisteredBy', 'familyName username')
      .sort({ expectedDate: 1, createdAt: -1 });

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
    const visitors = await Visitor.find({ hostResident: req.params.residentId })
      .populate('guardOnDuty', 'username fullName')
      .sort({ entryTime: -1, createdAt: -1 })
      .limit(20);

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