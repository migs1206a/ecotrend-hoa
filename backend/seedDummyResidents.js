const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const bcrypt = require('bcryptjs');
const mongoose = require('mongoose');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const User = require('./models/User');
const { storeUploadedFile, deleteStoredFile } = require('./utils/fileStorage');
const {
  validateFamilyMembers,
  validateNameField,
  validatePhoneNumberField
} = require('./utils/fieldValidation');
const { buildHouseholdDetails } = require('./utils/residentAccounts');

const BATCH_NAME = process.env.DUMMY_RESIDENT_BATCH || 'dummy-residents-2026-05-04';
const OUTPUT_DIR = path.join(__dirname, 'uploads', 'dummy-residents');
const COUNT = 32;

const args = new Set(process.argv.slice(2));
const dryRun = args.has('--dry-run');
const deleteMode = args.has('--delete');
const createPending = args.has('--pending');

const FONT = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01111', '10000', '10000', '10000', '10000', '10000', '01111'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01111', '10000', '10000', '10011', '10001', '10001', '01110'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '10101', '01010'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'],
  3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  5: ['11111', '10000', '10000', '11110', '00001', '00001', '11110'],
  6: ['01110', '10000', '10000', '11110', '10001', '10001', '01110'],
  7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  9: ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  ':': ['00000', '01100', '01100', '00000', '01100', '01100', '00000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000']
};

const residents = [
  ['Bautista', 'Marco', 'Reyes'],
  ['Cruz', 'Angela', 'Santos'],
  ['Dela Cruz', 'Paolo', 'Garcia'],
  ['Garcia', 'Leah', 'Mendoza'],
  ['Mendoza', 'Nico', 'Torres'],
  ['Reyes', 'Celine', 'Ramos'],
  ['Santos', 'Arvin', 'Lopez'],
  ['Torres', 'Mia', 'Castro'],
  ['Villanueva', 'Rafael', 'Dizon'],
  ['Ramos', 'Irene', 'Bautista'],
  ['Aquino', 'Jonas', 'Navarro'],
  ['Castillo', 'Bianca', 'Reyes'],
  ['Domingo', 'Luis', 'Cruz'],
  ['Flores', 'Tessa', 'Santiago'],
  ['Gonzales', 'Emil', 'Flores'],
  ['Hernandez', 'Nina', 'Aquino'],
  ['Ilagan', 'Carlo', 'Diaz'],
  ['Javier', 'Rina', 'Villanueva'],
  ['Lazaro', 'Miguel', 'Santos'],
  ['Marquez', 'Diane', 'Garcia'],
  ['Navarro', 'Oscar', 'Mendoza'],
  ['Ortega', 'Grace', 'Ramos'],
  ['Pascual', 'Felix', 'Torres'],
  ['Quintos', 'Alyssa', 'Flores'],
  ['Rivera', 'Dante', 'Castillo'],
  ['Santiago', 'Elaine', 'Domingo'],
  ['Tolentino', 'Ivan', 'Pascual'],
  ['Uy', 'Karen', 'Javier'],
  ['Valdez', 'Leo', 'Aquino'],
  ['Yap', 'Monica', 'Rivera'],
  ['Zamora', 'Noel', 'Quintos'],
  ['Soriano', 'Patricia', 'Lazaro']
];

const streets = [
  'Babylon', 'Bethlehem', 'Bethel', 'Canaan', 'Eden', 'Egypt', 'Galilee',
  'Gaza', 'Golan', 'Golgotha', 'Hebron', 'Israel', 'Jericho', 'Jerusalem',
  'Jordan', 'Judea', 'Nazareth', 'Persia', 'Samaria', 'Sinai', 'Zion'
];

const csvEscape = (value) => {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const toCompactName = (value) => String(value || '').replace(/[^A-Za-z0-9]/g, '');
const pad = (value) => String(value).padStart(2, '0');

const buildResidentSeed = (index) => {
  const [familyName, firstName, middleName] = residents[index];
  const number = index + 1;
  const suffix = pad(number);
  const block = String(((index * 3) % 20) + 1);
  const lot = String(((index * 7) % 40) + 1);
  const phase = String((index % 4) + 1);
  const street = streets[index % streets.length];
  const compactFamily = toCompactName(familyName).slice(0, 12);

  return {
    number,
    email: `dummy.resident${suffix}@example.com`,
    familyName,
    firstName,
    middleName,
    username: `${compactFamily}Fam${suffix}`,
    password: `EcoTest${suffix}!`,
    propertyType: 'house',
    occupancyType: 'permanent',
    block,
    lot,
    phase,
    street,
    phoneNumber: `+63917${String(number).padStart(7, '0')}`,
    idNumber: `TEST-RES-${String(number).padStart(3, '0')}`
  };
};

const rgb = (hex) => {
  const normalized = hex.replace('#', '');
  return [
    parseInt(normalized.slice(0, 2), 16),
    parseInt(normalized.slice(2, 4), 16),
    parseInt(normalized.slice(4, 6), 16)
  ];
};

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[n] = c >>> 0;
  }
  return table;
})();

const crc32 = (buffer) => {
  let crc = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    crc = crcTable[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const pngChunk = (type, data = Buffer.alloc(0)) => {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
};

const createPng = (width, height, pixels) => {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rawOffset = y * (width * 3 + 1);
    raw[rawOffset] = 0;
    pixels.copy(raw, rawOffset + 1, y * width * 3, (y + 1) * width * 3);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND')
  ]);
};

const makeCanvas = (width, height, backgroundHex) => {
  const pixels = Buffer.alloc(width * height * 3);
  const background = rgb(backgroundHex);

  for (let i = 0; i < pixels.length; i += 3) {
    pixels[i] = background[0];
    pixels[i + 1] = background[1];
    pixels[i + 2] = background[2];
  }

  const setPixel = (x, y, color, alpha = 1) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const offset = (Math.floor(y) * width + Math.floor(x)) * 3;
    pixels[offset] = Math.round(pixels[offset] * (1 - alpha) + color[0] * alpha);
    pixels[offset + 1] = Math.round(pixels[offset + 1] * (1 - alpha) + color[1] * alpha);
    pixels[offset + 2] = Math.round(pixels[offset + 2] * (1 - alpha) + color[2] * alpha);
  };

  const fillRect = (x, y, w, h, colorHex, alpha = 1) => {
    const color = rgb(colorHex);
    for (let yy = Math.max(0, y); yy < Math.min(height, y + h); yy += 1) {
      for (let xx = Math.max(0, x); xx < Math.min(width, x + w); xx += 1) {
        setPixel(xx, yy, color, alpha);
      }
    }
  };

  const strokeRect = (x, y, w, h, colorHex, lineWidth = 2) => {
    fillRect(x, y, w, lineWidth, colorHex);
    fillRect(x, y + h - lineWidth, w, lineWidth, colorHex);
    fillRect(x, y, lineWidth, h, colorHex);
    fillRect(x + w - lineWidth, y, lineWidth, h, colorHex);
  };

  const drawText = (text, x, y, scale, colorHex, alpha = 1) => {
    const color = rgb(colorHex);
    let cursorX = x;
    const prepared = String(text || '').toUpperCase();

    for (const char of prepared) {
      const glyph = FONT[char] || FONT[' '];
      glyph.forEach((row, rowIndex) => {
        for (let colIndex = 0; colIndex < row.length; colIndex += 1) {
          if (row[colIndex] === '1') {
            for (let sy = 0; sy < scale; sy += 1) {
              for (let sx = 0; sx < scale; sx += 1) {
                setPixel(
                  cursorX + colIndex * scale + sx,
                  y + rowIndex * scale + sy,
                  color,
                  alpha
                );
              }
            }
          }
        }
      });
      cursorX += 6 * scale;
    }
  };

  const drawWrappedText = (text, x, y, scale, colorHex, maxChars, lineHeight) => {
    const words = String(text || '').toUpperCase().split(/\s+/);
    const lines = [];
    let line = '';

    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (next.length > maxChars && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }

    if (line) lines.push(line);
    lines.forEach((item, index) => drawText(item, x, y + index * lineHeight, scale, colorHex));
  };

  return {
    pixels,
    fillRect,
    strokeRect,
    drawText,
    drawWrappedText
  };
};

const createDummyIdImage = (resident, householdDetails) => {
  const width = 900;
  const height = 560;
  const canvas = makeCanvas(width, height, '#f8fafc');
  const address = `${householdDetails.houseAddress}, ${householdDetails.street}`;

  canvas.fillRect(0, 0, width, 86, '#047857');
  canvas.fillRect(0, 86, width, 8, '#34d399');
  canvas.drawText('ECOTREND HOA', 32, 24, 5, '#ffffff');
  canvas.drawText('DUMMY RESIDENT ID', 514, 34, 3, '#d1fae5');

  canvas.strokeRect(24, 112, 852, 386, '#0f766e', 4);
  canvas.fillRect(42, 130, 190, 238, '#e5e7eb');
  canvas.strokeRect(42, 130, 190, 238, '#64748b', 3);
  canvas.fillRect(92, 166, 90, 90, '#94a3b8');
  canvas.fillRect(72, 278, 130, 58, '#94a3b8');
  canvas.drawText('PHOTO', 80, 382, 3, '#475569');
  canvas.drawText('PLACEHOLDER', 64, 414, 2, '#475569');

  canvas.drawText('FAMILY', 268, 132, 2, '#64748b');
  canvas.drawText(resident.familyName, 268, 158, 5, '#0f172a');
  canvas.drawText('PRIMARY CONTACT', 268, 214, 2, '#64748b');
  canvas.drawText(`${resident.firstName} ${resident.middleName}`, 268, 240, 3, '#111827');
  canvas.drawText('ADDRESS', 268, 292, 2, '#64748b');
  canvas.drawWrappedText(address, 268, 318, 2, '#111827', 44, 24);
  canvas.drawText('ID NO', 268, 404, 2, '#64748b');
  canvas.drawText(resident.idNumber, 268, 430, 3, '#111827');

  canvas.fillRect(248, 194, 608, 96, '#fee2e2', 0.78);
  canvas.strokeRect(248, 194, 608, 96, '#dc2626', 3);
  canvas.drawText('SAMPLE TEST ONLY', 272, 224, 6, '#b91c1c');

  canvas.fillRect(24, 498, 852, 42, '#991b1b');
  canvas.drawText('NOT A VALID ID  FICTIONAL DATA ONLY', 52, 512, 3, '#ffffff');
  canvas.drawText('NO GOVERNMENT SEAL  NO BARCODE  NO QR CODE', 516, 466, 2, '#991b1b');

  return createPng(width, height, canvas.pixels);
};

const ensureOutputDir = () => {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
};

const validateSeed = (seed) => {
  const familyName = validateNameField(seed.familyName, 'Family name', {
    minLength: 2,
    maxLength: 20
  });
  if (familyName.error) throw new Error(familyName.error);

  const phoneNumber = validatePhoneNumberField(seed.phoneNumber, 'Phone number', {
    required: true
  });
  if (phoneNumber.error) throw new Error(phoneNumber.error);

  const household = buildHouseholdDetails(seed);
  if (household.error) throw new Error(household.error);

  const familyMembers = validateFamilyMembers([
    {
      lastName: seed.familyName,
      firstName: seed.firstName,
      middleName: seed.middleName,
      relationship: 'Primary Contact',
      isPrimaryContact: true
    }
  ], {
    required: true,
    primaryContactRequired: true
  });
  if (familyMembers.error) throw new Error(familyMembers.error);

  return {
    familyName: familyName.value,
    phoneNumber: phoneNumber.value,
    householdDetails: household.value,
    familyMembers: familyMembers.value
  };
};

const deleteDummyResidents = async () => {
  const users = await User.find({
    isDummyResident: true,
    seedBatch: BATCH_NAME
  });

  console.log(`Found ${users.length} dummy residents in batch ${BATCH_NAME}.`);

  if (dryRun) {
    users.forEach((user) => console.log(`Would delete ${user.username} (${user._id}).`));
    return;
  }

  for (const user of users) {
    await deleteStoredFile(user.identificationDocument).catch((error) => {
      console.warn(`Could not delete identification for ${user.username}: ${error.message}`);
    });

    for (const vehicle of user.vehicles || []) {
      await deleteStoredFile(vehicle.photo).catch((error) => {
        console.warn(`Could not delete vehicle photo for ${user.username}: ${error.message}`);
      });
    }

    await User.deleteOne({ _id: user._id });
    console.log(`Deleted ${user.username}.`);
  }
};

const createDummyResidents = async () => {
  ensureOutputDir();

  const created = [];
  const skipped = [];
  const failed = [];
  const credentials = [[
    'number',
    'username',
    'password',
    'email',
    'familyName',
    'houseAddress',
    'street',
    'status',
    'seedBatch'
  ]];

  for (let index = 0; index < COUNT; index += 1) {
    const seed = buildResidentSeed(index);
    let storedIdentification = null;

    try {
      const {
        familyName,
        phoneNumber,
        householdDetails,
        familyMembers
      } = validateSeed(seed);

      const existing = await User.findOne({
        $or: [
          { email: seed.email.toLowerCase() },
          { username: seed.username },
          { addressKey: householdDetails.addressKey },
          { houseAddress: householdDetails.houseAddress }
        ]
      }).select('username email addressKey houseAddress');

      if (existing) {
        skipped.push({
          username: seed.username,
          reason: `Existing resident matched ${existing.username || existing.email || existing.addressKey}.`
        });
        continue;
      }

      const imageBuffer = createDummyIdImage(seed, householdDetails);
      const imageName = `dummy-resident-id-${String(seed.number).padStart(3, '0')}.png`;
      const imagePath = path.join(OUTPUT_DIR, imageName);

      if (!dryRun) {
        fs.writeFileSync(imagePath, imageBuffer);
        storedIdentification = await storeUploadedFile({
          buffer: imageBuffer,
          originalname: imageName,
          mimetype: 'image/png',
          size: imageBuffer.length
        }, {
          folder: 'ecotrend-hoa/identification/dummy-residents',
          localDir: 'uploads/identification',
          prefix: `dummy-id-${String(seed.number).padStart(3, '0')}`,
          resourceType: 'image'
        });
      }

      const password = dryRun ? 'DRY_RUN_NOT_HASHED' : await bcrypt.hash(seed.password, 10);
      const user = new User({
        email: seed.email.toLowerCase(),
        familyName,
        username: seed.username,
        password,
        houseAddress: householdDetails.houseAddress,
        addressKey: householdDetails.addressKey,
        propertyType: householdDetails.propertyType,
        occupancyType: householdDetails.occupancyType,
        block: householdDetails.block,
        lot: householdDetails.lot,
        phase: householdDetails.phase,
        buildingName: householdDetails.buildingName,
        unitNumber: householdDetails.unitNumber,
        street: householdDetails.street,
        occupancyStartDate: householdDetails.occupancyStartDate,
        occupancyEndDate: householdDetails.occupancyEndDate,
        expiresAt: householdDetails.expiresAt,
        renewalStatus: householdDetails.renewalStatus,
        phoneNumber,
        familyMembers,
        vehicles: [],
        identificationDocument: dryRun
          ? {
              filename: imageName,
              originalName: imageName,
              mimetype: 'image/png',
              size: imageBuffer.length,
              path: `/uploads/dummy-residents/${imageName}`,
              storage: 'local',
              uploadedAt: new Date()
            }
          : storedIdentification,
        isApproved: !createPending,
        isDummyResident: true,
        seedBatch: BATCH_NAME
      });

      if (!dryRun) {
        await user.save();
      }

      const status = createPending ? 'pending_approval' : 'approved';
      created.push({
        username: seed.username,
        imageSize: imageBuffer.length,
        houseAddress: householdDetails.houseAddress,
        street: householdDetails.street
      });
      credentials.push([
        seed.number,
        seed.username,
        seed.password,
        seed.email.toLowerCase(),
        familyName,
        householdDetails.houseAddress,
        householdDetails.street,
        status,
        BATCH_NAME
      ]);

      console.log(`${dryRun ? 'Would create' : 'Created'} ${seed.username} (${imageBuffer.length} bytes).`);
    } catch (error) {
      if (storedIdentification) {
        await deleteStoredFile(storedIdentification).catch(() => {});
      }
      failed.push({ username: seed.username, reason: error.message });
      console.error(`Failed ${seed.username}: ${error.message}`);
    }
  }

  if (!dryRun && credentials.length > 1) {
    const credentialsPath = path.join(OUTPUT_DIR, `${BATCH_NAME}-credentials.csv`);
    fs.writeFileSync(
      credentialsPath,
      `${credentials.map((row) => row.map(csvEscape).join(',')).join('\n')}\n`
    );
    console.log(`Credentials written to ${credentialsPath}`);
  }

  const imageSizes = created.map((item) => item.imageSize);
  const minImageSize = imageSizes.length ? Math.min(...imageSizes) : 0;
  const maxImageSize = imageSizes.length ? Math.max(...imageSizes) : 0;

  console.log(JSON.stringify({
    dryRun,
    batch: BATCH_NAME,
    requested: COUNT,
    created: created.length,
    skipped: skipped.length,
    failed: failed.length,
    approved: !createPending,
    minImageSize,
    maxImageSize,
    skippedDetails: skipped,
    failedDetails: failed
  }, null, 2));
};

const main = async () => {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not configured.');
  }

  await mongoose.connect(process.env.MONGODB_URI);

  try {
    if (deleteMode) {
      await deleteDummyResidents();
    } else {
      await createDummyResidents();
    }
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
