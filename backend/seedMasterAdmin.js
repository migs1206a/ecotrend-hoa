const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const MasterAdminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role:     { type: String, default: 'MASTER_ADMIN' },
  createdAt:{ type: Date,   default: Date.now }
});

const MasterAdmin = mongoose.model('MasterAdmin', MasterAdminSchema);

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/safeguard';

const MASTER_USERNAME = 'Carlo';
const MASTER_PASSWORD = 'Carlo';   


async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const existing = await MasterAdmin.findOne({ username: MASTER_USERNAME });
  if (existing) {
    console.log('Master Admin already exists. Skipping.');
    process.exit(0);
  }

  const hashed = await bcrypt.hash(MASTER_PASSWORD, 10);
  await MasterAdmin.create({ username: MASTER_USERNAME, password: hashed });

  console.log(`Master Admin created — username | password: "${MASTER_USERNAME,MASTER_PASSWORD}"`);
  console.log('You can now log in with these credentials.');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seeder error:', err);
  process.exit(1);
});