const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const dns = require('dns');
require('dotenv').config();

const configuredDnsServers = String(process.env.DNS_SERVERS || '')
  .split(',')
  .map((server) => server.trim())
  .filter(Boolean);

if (configuredDnsServers.length) {
  dns.setServers(configuredDnsServers);
}

const MasterAdminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role:     { type: String, default: 'MASTER_ADMIN' },
  createdAt:{ type: Date,   default: Date.now }
});

const MasterAdmin = mongoose.model('MasterAdmin', MasterAdminSchema);

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ecotrend_housing';

const MASTER_USERNAME = String(process.env.MASTER_ADMIN_USERNAME || '').trim();
const MASTER_PASSWORD = String(process.env.MASTER_ADMIN_PASSWORD || '');

if (!MASTER_USERNAME || !MASTER_PASSWORD) {
  console.error(
    'Missing master admin seed credentials. Set MASTER_ADMIN_USERNAME and MASTER_ADMIN_PASSWORD in backend/.env.'
  );
  process.exit(1);
}


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

  console.log(`Master Admin created for username: "${MASTER_USERNAME}"`);
  console.log('You can now log in with these credentials.');
  process.exit(0);
}

seed().catch(err => {
  console.error('Seeder error:', err);
  process.exit(1);
});
