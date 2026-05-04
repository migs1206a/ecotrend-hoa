const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const dns = require('dns');
const { getFileSizeLimitMessage } = require('./utils/uploadLimits');
require('dotenv').config();

const configuredDnsServers = String(process.env.DNS_SERVERS || '')
  .split(',')
  .map((server) => server.trim())
  .filter(Boolean);

if (configuredDnsServers.length) {
  dns.setServers(configuredDnsServers);
}

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Create uploads directories if they don't exist
const uploadsDirectories = [
  path.join(__dirname, 'uploads/identification'),
  path.join(__dirname, 'uploads/vehicles'),
  path.join(__dirname, 'report-archives')
];

uploadsDirectories.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`✓ Created ${dir.split('/').slice(-2).join('/')} directory`);
  }
});

// Serve static files from uploads directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// MongoDB Connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ecotrend_housing';

mongoose.connect(MONGODB_URI)
  .then(() => console.log('✓ Connected to MongoDB'))
  .catch((err) => console.error('MongoDB connection error:', err));

// Import Routes

const authRoutes = require('./routes/auth');
const residentRoutes = require('./routes/residents');
const adminRoutes = require('./routes/admin');
const guardRoutes = require('./routes/guards');
const deliveryRoutes = require('./routes/deliveries');
const announcementRoutes = require('./routes/announcements');
const visitorRoutes = require('./routes/visitors');
const entryLogRoutes = require('./routes/entryLogs');
const masterAdminRoutes = require('./routes/masterAdmin');

// Use Routes

app.use('/api/auth', authRoutes);           // Authentication: /api/auth/login, /api/auth/register
app.use('/api/residents', residentRoutes);  // Residents: /api/residents/approved, /api/residents/pending
app.use('/api/admin', adminRoutes);         // Admin: /api/admin/create, /api/admin/:id
app.use('/api/guards', guardRoutes);        // Guards: /api/guards/, /api/guards/create
app.use('/api/deliveries', deliveryRoutes); // Deliveries: /api/deliveries/, /api/deliveries/create
app.use('/api/announcements', announcementRoutes); // Announcements: /api/announcements
app.use('/api/billing', require('./routes/billing'));
app.use('/api/visitors', visitorRoutes);
app.use('/api/entry-logs', entryLogRoutes);
app.use('/api/facilities', require('./routes/facilities'));
app.use('/api/complaints', require('./routes/complaints'));
app.use('/api/documents', require('./routes/documents'));
app.use('/api/admin-bill-audit-logs', require('./routes/adminBillAuditLogs'));
app.use('/api/contact-hoa', require('./routes/contactHoa'));
app.use('/api/cctv-feeds', require('./routes/cctvFeeds'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/admin-ai', require('./routes/adminChatbot'));
app.use('/api/master-admin', masterAdminRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'SafeGuard API Server',
    version: '1.0.0',
    endpoints: {
      auth: '/api/auth',
      residents: '/api/residents',
      admin: '/api/admin',
      guards: '/api/guards',
      visitors: '/api/visitors',
      entryLogs: '/api/entry-logs',
      announcements: '/api/announcements',
      contactHoa: '/api/contact-hoa',
      cctvFeeds: '/api/cctv-feeds',
      analytics: '/api/analytics',
      adminAI: '/api/admin-ai'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  // Handle multer errors
  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ message: getFileSizeLimitMessage(err.limit) });
    }
    return res.status(400).json({ message: 'File upload error: ' + err.message });
  }
  
  res.status(500).json({ 
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});



// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API available at http://localhost:${PORT}`);
  console.log(`Uploads directory configured`);
});
