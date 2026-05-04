const express = require('express');
const auth = require('../middleware/auth');
const { requireOfficerModule } = require('../middleware/accessControl');
const { askAdminChatbot } = require('../controllers/adminChatbotController');

const router = express.Router();

router.post('/chat', auth, requireOfficerModule('ai_chatbot'), askAdminChatbot);

module.exports = router;
