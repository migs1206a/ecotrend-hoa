//wala to pang create ko lang ng tempo acc nakaraan

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const Admin = require('./models/Admin');
const Guard = require('./models/Guard');

const createAccounts = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Create Admin Account
    const adminPassword = await bcrypt.hash('admin123', 10);
    const admin = new Admin({
      username: 'admin',
      password: adminPassword
    });
    await admin.save();
    console.log('✅ Admin account created - Username: admin, Password: admin123');

    // Create Guard Account
    const guardPassword = await bcrypt.hash('guard123', 10);
    const guard = new Guard({
      username: 'guard',
      password: guardPassword,
      fullName: 'Security Guard'
    });
    await guard.save();
    console.log('✅ Guard account created - Username: guard, Password: guard123');

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

createAccounts();