const ContactHOASetting = require('../models/ContactHOASetting');
const { normalizeSpaces, validatePhoneNumberField } = require('../utils/fieldValidation');
const { storeUploadedFile, deleteStoredFile } = require('../utils/fileStorage');

const CONTACT_TYPES = new Set(['mobile', 'landline', 'other']);
const LANDLINE_ALLOWED_PATTERN = /^[0-9()+\-\s]+$/;
const MAX_CONTACTS = 12;

const getSettings = async () => {
  let settings = await ContactHOASetting.findOne({ key: 'default' });

  if (!settings) {
    settings = await ContactHOASetting.create({ key: 'default' });
  }

  return settings;
};

const serializeContact = (contact) => ({
  _id: String(contact?._id || ''),
  label: String(contact?.label || '').trim(),
  type: String(contact?.type || 'other').trim().toLowerCase(),
  number: String(contact?.number || '').trim()
});

const serializeSettings = (settings) => ({
  hierarchyImage: settings?.hierarchyImage || {},
  contacts: Array.isArray(settings?.contacts)
    ? settings.contacts.map(serializeContact)
    : [],
  updatedAt: settings?.updatedAt || null
});

const normalizeMobileNumber = (value) => {
  const rawValue = String(value || '').trim();
  const compactValue = rawValue.replace(/[^\d+]/g, '');

  if (/^09\d{9}$/.test(compactValue)) {
    return `+63${compactValue.slice(1)}`;
  }

  if (/^639\d{9}$/.test(compactValue)) {
    return `+${compactValue}`;
  }

  return compactValue;
};

const validateLandlineNumber = (value, label = 'Landline number') => {
  const normalizedValue = normalizeSpaces(value);
  const digitCount = normalizedValue.replace(/\D/g, '').length;

  if (!normalizedValue) {
    return { error: `${label} is required.` };
  }

  if (!LANDLINE_ALLOWED_PATTERN.test(normalizedValue)) {
    return { error: `${label} can only contain digits, spaces, parentheses, plus signs, and hyphens.` };
  }

  if (digitCount < 7 || digitCount > 15) {
    return { error: `${label} must contain 7-15 digits.` };
  }

  if (normalizedValue.length > 25) {
    return { error: `${label} must not exceed 25 characters.` };
  }

  return { value: normalizedValue };
};

const validateContactEntries = (contacts = []) => {
  if (!Array.isArray(contacts)) {
    return { error: 'Contacts must be provided as a list.' };
  }

  if (contacts.length > MAX_CONTACTS) {
    return { error: `Only ${MAX_CONTACTS} contact numbers can be saved at a time.` };
  }

  const normalizedContacts = [];

  for (let index = 0; index < contacts.length; index += 1) {
    const entry = contacts[index] || {};
    const contactType = String(entry.type || 'other').trim().toLowerCase();
    const label = normalizeSpaces(entry.label).slice(0, 80);
    const labelPrefix = `Contact ${index + 1}`;

    if (!CONTACT_TYPES.has(contactType)) {
      return { error: `${labelPrefix} type is invalid.` };
    }

    if (!label) {
      return { error: `${labelPrefix} label is required.` };
    }

    if (label.length < 2) {
      return { error: `${labelPrefix} label must be at least 2 characters.` };
    }

    let numberValidation;

    if (contactType === 'mobile') {
      numberValidation = validatePhoneNumberField(
        normalizeMobileNumber(entry.number),
        `${labelPrefix} phone number`,
        { required: true }
      );
    } else {
      numberValidation = validateLandlineNumber(
        entry.number,
        `${labelPrefix} ${contactType === 'landline' ? 'landline number' : 'contact number'}`
      );
    }

    if (numberValidation.error) {
      return { error: numberValidation.error };
    }

    normalizedContacts.push({
      label,
      type: contactType,
      number: numberValidation.value
    });
  }

  return { value: normalizedContacts };
};

const getContactHoaSettings = async (req, res) => {
  try {
    const settings = await getSettings();
    return res.json(serializeSettings(settings));
  } catch (error) {
    console.error('getContactHoaSettings error:', error);
    return res.status(500).json({ message: 'Failed to load Contact HOA settings.' });
  }
};

const updateContactHoaImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: 'Please choose a hierarchy image to upload.' });
    }

    const settings = await getSettings();

    if (settings.hierarchyImage?.path) {
      await deleteStoredFile(settings.hierarchyImage);
    }

    settings.hierarchyImage = await storeUploadedFile(req.file, {
      folder: 'ecotrend-hoa/contact-hoa/hierarchy',
      localDir: 'uploads/contact-hoa',
      prefix: 'officer-hierarchy',
      resourceType: 'image'
    });

    await settings.save();

    return res.json({
      message: 'Officer hierarchy image updated successfully.',
      settings: serializeSettings(settings)
    });
  } catch (error) {
    console.error('updateContactHoaImage error:', error);
    return res.status(500).json({ message: 'Failed to update the officer hierarchy image.' });
  }
};

const deleteContactHoaImage = async (req, res) => {
  try {
    const settings = await getSettings();

    if (settings.hierarchyImage?.path) {
      await deleteStoredFile(settings.hierarchyImage);
    }

    settings.hierarchyImage = {};
    await settings.save();

    return res.json({
      message: 'Officer hierarchy image deleted successfully.',
      settings: serializeSettings(settings)
    });
  } catch (error) {
    console.error('deleteContactHoaImage error:', error);
    return res.status(500).json({ message: 'Failed to delete the officer hierarchy image.' });
  }
};

const updateContactHoaContacts = async (req, res) => {
  try {
    const { value, error } = validateContactEntries(req.body?.contacts);

    if (error) {
      return res.status(400).json({ message: error });
    }

    const settings = await getSettings();
    settings.contacts = value;
    await settings.save();

    return res.json({
      message: 'Contact HOA numbers updated successfully.',
      settings: serializeSettings(settings)
    });
  } catch (error) {
    console.error('updateContactHoaContacts error:', error);
    return res.status(500).json({ message: 'Failed to update Contact HOA numbers.' });
  }
};

module.exports = {
  getContactHoaSettings,
  updateContactHoaImage,
  deleteContactHoaImage,
  updateContactHoaContacts
};
