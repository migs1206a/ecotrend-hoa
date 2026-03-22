//backend/routes/admin.js 

const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

// Get all admins
router.get('/', adminController.getAllAdmins);

// Create new admin
router.post('/create', adminController.createAdmin);

// Get admin by ID
router.get('/:id', adminController.getAdminById);

// Update admin
router.put('/:id', adminController.updateAdmin);

// Delete admin
router.delete('/:id', adminController.deleteAdmin);

module.exports = router;
