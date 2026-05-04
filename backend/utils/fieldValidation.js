const FAMILY_RELATIONSHIPS = new Set([
  'Primary Contact',
  'Spouse',
  'Father',
  'Mother',
  'Son',
  'Daughter',
  'Brother',
  'Sister',
  'Grandfather',
  'Grandmother',
  'Grandson',
  'Granddaughter',
  'Uncle',
  'Aunt',
  'Nephew',
  'Niece',
  'Cousin',
  'Other'
]);

const NAME_REGEX = /^[A-Za-z]+(?:\s+[A-Za-z]+)*$/;
const PHONE_REGEX = /^\+63\d{10}$/;

const normalizeSpaces = (value) => String(value || '').replace(/\s+/g, ' ').trim();

const buildLengthMessage = (label, minLength, maxLength) => {
  if (minLength && maxLength) {
    return `${label} must be ${minLength}-${maxLength} characters.`;
  }

  if (minLength) {
    return `${label} must be at least ${minLength} characters.`;
  }

  return `${label} must not exceed ${maxLength} characters.`;
};

const validateNameField = (value, label = 'Name', options = {}) => {
  const {
    required = true,
    minLength = 2,
    maxLength = 80
  } = options;

  const normalizedValue = normalizeSpaces(value);

  if (!normalizedValue) {
    return required
      ? { error: `${label} is required.` }
      : { value: '' };
  }

  if (minLength && normalizedValue.length < minLength) {
    return { error: buildLengthMessage(label, minLength, maxLength) };
  }

  if (maxLength && normalizedValue.length > maxLength) {
    return { error: buildLengthMessage(label, minLength, maxLength) };
  }

  if (!NAME_REGEX.test(normalizedValue)) {
    return { error: `${label} can only contain letters and spaces.` };
  }

  return { value: normalizedValue };
};

const validatePhoneNumberField = (value, label = 'Contact number', options = {}) => {
  const { required = false } = options;
  const rawValue = String(value || '').trim();
  const normalizedValue = !required && rawValue === '+63' ? '' : rawValue;

  if (!normalizedValue) {
    return required
      ? { error: `${label} is required.` }
      : { value: '' };
  }

  if (!PHONE_REGEX.test(normalizedValue)) {
    return { error: `${label} must be +63 followed by 10 digits.` };
  }

  return { value: normalizedValue };
};

const validateFamilyMembers = (familyMembers, options = {}) => {
  const { required = true, primaryContactRequired = false } = options;

  if (!Array.isArray(familyMembers)) {
    return { error: 'Invalid family members data.' };
  }

  if (required && familyMembers.length === 0) {
    return { error: 'At least one family member is required.' };
  }

  const normalizedMembers = [];
  let primaryContactCount = 0;

  for (let index = 0; index < familyMembers.length; index += 1) {
    const member = familyMembers[index] || {};
    const labelPrefix = `Family member ${index + 1}`;

    const lastNameValidation = validateNameField(member.lastName, `${labelPrefix} last name`, {
      minLength: 1,
      maxLength: 30
    });
    if (lastNameValidation.error) {
      return { error: lastNameValidation.error };
    }

    const firstNameValidation = validateNameField(member.firstName, `${labelPrefix} first name`, {
      minLength: 1,
      maxLength: 30
    });
    if (firstNameValidation.error) {
      return { error: firstNameValidation.error };
    }

    const middleNameValidation = validateNameField(member.middleName, `${labelPrefix} middle name`, {
      minLength: 1,
      maxLength: 30
    });
    if (middleNameValidation.error) {
      return { error: middleNameValidation.error };
    }

    const isPrimaryContact = Boolean(member.isPrimaryContact);
    if (isPrimaryContact) {
      primaryContactCount += 1;
    }

    const rawRelationship = String(member.relationship || '').trim();
    const relationship = isPrimaryContact ? 'Primary Contact' : rawRelationship;

    if (!relationship) {
      return { error: `${labelPrefix} relationship is required.` };
    }

    if (!FAMILY_RELATIONSHIPS.has(relationship)) {
      return { error: `${labelPrefix} relationship is invalid.` };
    }

    if (!isPrimaryContact && relationship === 'Primary Contact') {
      return { error: `${labelPrefix} cannot use "Primary Contact" unless selected as primary contact.` };
    }

    normalizedMembers.push({
      ...member,
      lastName: lastNameValidation.value,
      firstName: firstNameValidation.value,
      middleName: middleNameValidation.value,
      relationship,
      isPrimaryContact
    });
  }

  if (primaryContactRequired && primaryContactCount !== 1) {
    return { error: 'Please select exactly one primary household contact.' };
  }

  return { value: normalizedMembers };
};

module.exports = {
  normalizeSpaces,
  validateNameField,
  validatePhoneNumberField,
  validateFamilyMembers
};
