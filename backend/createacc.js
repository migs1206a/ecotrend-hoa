const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const Admin = require('./models/Admin');
const Guard = require('./models/Guard');
const MasterAdmin = require('./models/MasterAdmin');

const createAccounts = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    const adminPassword = await bcrypt.hash('admin123', 10);
    await Admin.findOneAndUpdate(
      { username: 'admin' },
      {
        username: 'admin',
        password: adminPassword,
        role: 'ADMIN'
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log('Admin account ready - Username: admin, Password: admin123');

    const guardPassword = await bcrypt.hash('guard123', 10);
    await Guard.findOneAndUpdate(
      { username: 'guard' },
      {
        username: 'guard',
        password: guardPassword,
        fullName: 'Security Guard',
        role: 'GUARD'
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log('Guard account ready - Username: guard, Password: guard123');

    const masterPassword = await bcrypt.hash('Carlo', 10);
    await MasterAdmin.findOneAndUpdate(
      { username: 'Carlo' },
      {
        username: 'Carlo',
        password: masterPassword,
        role: 'MASTER_ADMIN'
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    console.log('Master admin account ready - Username: Carlo, Password: Carlo');

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
};

createAccounts();
