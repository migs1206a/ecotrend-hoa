const fs = require('fs');
const path = require('path');
const { cloudinary, hasCloudinaryConfig } = require('./cloudinary');

const ROOT_DIR = path.join(__dirname, '..');

const requiresCloudinaryUploads = () =>
  String(process.env.REQUIRE_CLOUDINARY_UPLOADS || '').toLowerCase() === 'true' ||
  String(process.env.NODE_ENV || '').toLowerCase() === 'production';

const ensureDir = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const sanitizeSegment = (value) =>
  String(value || 'file').replace(/[^a-zA-Z0-9-_]/g, '-');

const buildLocalFileName = (prefix, originalName) => {
  const ext = path.extname(originalName || '');
  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  return `${sanitizeSegment(prefix)}-${uniqueSuffix}${ext}`;
};

const uploadToCloudinary = (file, options = {}) =>
  new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: options.folder,
        resource_type: options.resourceType || 'auto',
        public_id: `${sanitizeSegment(options.prefix || 'file')}-${Date.now()}`
      },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );

    uploadStream.end(file.buffer);
  });

const saveLocally = (file, options = {}) => {
  const uploadDir = options.localDir || 'uploads/temp';
  const absoluteDir = path.join(ROOT_DIR, uploadDir);
  ensureDir(absoluteDir);

  const filename = buildLocalFileName(options.prefix || 'file', file.originalname);
  const absolutePath = path.join(absoluteDir, filename);
  fs.writeFileSync(absolutePath, file.buffer);

  return {
    filename,
    originalName: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    path: `/${uploadDir.replace(/\\/g, '/')}/${filename}`,
    storage: 'local',
    uploadedAt: new Date()
  };
};

const storeUploadedFile = async (file, options = {}) => {
  if (!file) return null;

  if (hasCloudinaryConfig()) {
    const result = await uploadToCloudinary(file, options);
    return {
      filename: result.public_id.split('/').pop(),
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      path: result.secure_url,
      storage: 'cloudinary',
      publicId: result.public_id,
      resourceType: result.resource_type,
      uploadedAt: new Date()
    };
  }

  if (requiresCloudinaryUploads()) {
    throw new Error(
      'Cloudinary is required for file uploads. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.'
    );
  }

  return saveLocally(file, options);
};

const deleteStoredFile = async (fileData) => {
  if (!fileData) return;

  if (fileData.storage === 'cloudinary' && fileData.publicId && hasCloudinaryConfig()) {
    await cloudinary.uploader.destroy(fileData.publicId, {
      resource_type: fileData.resourceType || 'image'
    });
    return;
  }

  if (fileData.path && fileData.path.startsWith('/uploads/')) {
    const absolutePath = path.join(ROOT_DIR, fileData.path.replace(/^\//, ''));
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
    }
  }
};

module.exports = {
  storeUploadedFile,
  deleteStoredFile
};
