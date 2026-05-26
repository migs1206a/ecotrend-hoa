const express = require('express');
const auth = require('../middleware/auth');
const notificationController = require('../controllers/notificationController');

const router = express.Router();

router.use(auth);
router.get('/', notificationController.getNotifications);
router.post('/devices/register', notificationController.registerDevice);
router.post('/devices/unregister', notificationController.unregisterDevice);
router.patch('/:id/seen', notificationController.markNotificationSeen);

module.exports = router;
