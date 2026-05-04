const BYTES_PER_MB = 1024 * 1024;

export const IMAGE_UPLOAD_MAX_BYTES = 3 * BYTES_PER_MB;
export const DOCUMENT_UPLOAD_MAX_BYTES = 4 * BYTES_PER_MB;

export const formatFileSize = (bytes) => {
  if (!bytes) return '0 Bytes';

  if (bytes >= BYTES_PER_MB) {
    const sizeInMb = bytes / BYTES_PER_MB;
    const rounded = Number.isInteger(sizeInMb) ? sizeInMb : Number(sizeInMb.toFixed(1));
    return `${rounded} MB`;
  }

  const sizeInKb = bytes / 1024;
  const rounded = Number.isInteger(sizeInKb) ? sizeInKb : Number(sizeInKb.toFixed(1));
  return `${rounded} KB`;
};

const getFileExtension = (filename = '') => {
  const parts = String(filename).toLowerCase().split('.');
  return parts.length > 1 ? parts.pop() : '';
};

const matchesAllowedType = (file, allowedMimeTypes, allowedExtensions) => {
  const extension = getFileExtension(file?.name);
  const mimeType = String(file?.type || '').toLowerCase();

  return allowedMimeTypes.includes(mimeType) || allowedExtensions.includes(extension);
};

const validateFile = (file, { label, maxBytes, allowedMimeTypes, allowedExtensions, allowedLabel }) => {
  if (!file) {
    return { valid: false, message: `Please choose a ${label.toLowerCase()}.` };
  }

  if (!matchesAllowedType(file, allowedMimeTypes, allowedExtensions)) {
    return {
      valid: false,
      message: `${label} must be ${allowedLabel}.`
    };
  }

  if (file.size > maxBytes) {
    return {
      valid: false,
      message: `${label} is too large. Maximum size is ${formatFileSize(maxBytes)}.`
    };
  }

  return { valid: true };
};

export const validateImageFile = (file, options = {}) =>
  validateFile(file, {
    label: options.label || 'Image',
    maxBytes: options.maxBytes || IMAGE_UPLOAD_MAX_BYTES,
    allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'],
    allowedExtensions: ['jpg', 'jpeg', 'png', 'gif'],
    allowedLabel: 'a JPG, PNG, or GIF image'
  });

export const validatePdfOrImageFile = (file, options = {}) =>
  validateFile(file, {
    label: options.label || 'File',
    maxBytes: options.maxBytes || DOCUMENT_UPLOAD_MAX_BYTES,
    allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'],
    allowedExtensions: ['jpg', 'jpeg', 'png', 'pdf'],
    allowedLabel: 'a JPG, PNG, or PDF file'
  });
