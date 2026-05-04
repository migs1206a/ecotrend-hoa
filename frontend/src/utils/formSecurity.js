const NAME_REGEX = /^[A-Za-z]+(?:\s+[A-Za-z]+)*$/;
const PHONE_REGEX = /^\+63\d{10}$/;

export const sanitizeNameInput = (value, maxLength = 80) =>
  String(value || '')
    .replace(/[^A-Za-z\s]/g, '')
    .replace(/\s{2,}/g, ' ')
    .slice(0, maxLength);

export const normalizeNameValue = (value) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

export const validateNameValue = (value, label = 'Name', options = {}) => {
  const {
    required = true,
    minLength = 2,
    maxLength = 80
  } = options;

  const normalizedValue = normalizeNameValue(value);

  if (!normalizedValue) {
    return required
      ? { valid: false, message: `${label} is required.` }
      : { valid: true, value: '' };
  }

  if (minLength && normalizedValue.length < minLength) {
    return { valid: false, message: `${label} must be ${minLength}-${maxLength} characters.` };
  }

  if (maxLength && normalizedValue.length > maxLength) {
    return { valid: false, message: `${label} must be ${minLength}-${maxLength} characters.` };
  }

  if (!NAME_REGEX.test(normalizedValue)) {
    return { valid: false, message: `${label} can only contain letters and spaces.` };
  }

  return { valid: true, value: normalizedValue };
};

export const sanitizePhoneNumberInput = (value, previousValue = '+63', maxDigits = 10) => {
  const nextValue = String(value || '');

  if (!nextValue.startsWith('+63')) {
    return previousValue;
  }

  const digits = nextValue.slice(3).replace(/\D/g, '').slice(0, maxDigits);
  return `+63${digits}`;
};

export const validatePhoneNumberValue = (value, label = 'Contact number', options = {}) => {
  const { required = false } = options;
  const rawValue = String(value || '').trim();
  const normalizedValue = !required && rawValue === '+63' ? '' : rawValue;

  if (!normalizedValue) {
    return required
      ? { valid: false, message: `${label} is required.` }
      : { valid: true, value: '' };
  }

  if (!PHONE_REGEX.test(normalizedValue)) {
    return { valid: false, message: `${label} must be +63 followed by 10 digits.` };
  }

  return { valid: true, value: normalizedValue };
};

export const shouldBlockClipboardForTarget = (target) => {
  if (!target || typeof target.closest !== 'function') {
    return false;
  }

  const editableTarget = target.closest('input, textarea, [contenteditable="true"]');
  if (!editableTarget) {
    return false;
  }

  if (editableTarget.tagName === 'INPUT') {
    const inputType = String(editableTarget.getAttribute('type') || 'text').toLowerCase();
    return !['button', 'checkbox', 'color', 'file', 'hidden', 'image', 'radio', 'range', 'reset', 'submit'].includes(inputType);
  }

  return true;
};

export const blockClipboardForEditableFields = (event) => {
  if (shouldBlockClipboardForTarget(event.target)) {
    event.preventDefault();
  }
};
