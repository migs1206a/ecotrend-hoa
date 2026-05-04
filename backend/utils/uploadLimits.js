const BYTES_PER_MB = 1024 * 1024;

const IMAGE_UPLOAD_MAX_BYTES = 3 * BYTES_PER_MB;
const DOCUMENT_UPLOAD_MAX_BYTES = 4 * BYTES_PER_MB;

const formatUploadLimit = (bytes) => {
  const sizeInMb = bytes / BYTES_PER_MB;
  const rounded = Number.isInteger(sizeInMb) ? sizeInMb : Number(sizeInMb.toFixed(1));
  return `${rounded}MB`;
};

const getFileSizeLimitMessage = (bytes, label = 'File') => {
  if (!bytes) {
    return `${label} size too large.`;
  }

  return `${label} size too large. Maximum size is ${formatUploadLimit(bytes)}.`;
};

module.exports = {
  IMAGE_UPLOAD_MAX_BYTES,
  DOCUMENT_UPLOAD_MAX_BYTES,
  formatUploadLimit,
  getFileSizeLimitMessage
};
