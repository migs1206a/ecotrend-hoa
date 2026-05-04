import React, { useCallback, useEffect, useState } from 'react';
import { apiUrl, assetUrl } from '../../utils/api';
import {
  Image as ImageIcon,
  Loader,
  Phone,
  PlusCircle,
  Save,
  Trash2,
  Upload,
  X
} from 'lucide-react';
import {
  IMAGE_UPLOAD_MAX_BYTES,
  formatFileSize,
  validateImageFile
} from '../../utils/uploadValidation';
import './AdminContactHOAManagement.css';

const API = apiUrl('/contact-hoa');
const CONTACT_TYPE_OPTIONS = [
  { value: 'mobile', label: 'Phone Number', hint: 'Use +639XXXXXXXXX or 09XXXXXXXXX' },
  { value: 'landline', label: 'Landline', hint: 'Example: (02) 8123-4567' },
  { value: 'other', label: 'Other', hint: 'Alternate contact format' }
];

const buildEmptyContact = () => ({
  label: '',
  type: 'mobile',
  number: ''
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
  const normalizedValue = String(value || '').replace(/\s+/g, ' ').trim();
  const digitCount = normalizedValue.replace(/\D/g, '').length;

  if (!normalizedValue) {
    return { valid: false, message: `${label} is required.` };
  }

  if (!/^[0-9()+\-\s]+$/.test(normalizedValue)) {
    return {
      valid: false,
      message: `${label} can only contain digits, spaces, parentheses, plus signs, and hyphens.`
    };
  }

  if (digitCount < 7 || digitCount > 15) {
    return { valid: false, message: `${label} must contain 7-15 digits.` };
  }

  if (normalizedValue.length > 25) {
    return { valid: false, message: `${label} must not exceed 25 characters.` };
  }

  return { valid: true, value: normalizedValue };
};

const validateContacts = (contacts = []) => {
  const meaningfulContacts = contacts.filter(
    (contact) => String(contact.label || '').trim() || String(contact.number || '').trim()
  );

  const normalizedContacts = [];

  for (let index = 0; index < meaningfulContacts.length; index += 1) {
    const contact = meaningfulContacts[index] || {};
    const label = String(contact.label || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const type = String(contact.type || 'other').trim().toLowerCase();
    const numberLabel = `${label || `Contact ${index + 1}`} number`;

    if (!label) {
      return { valid: false, message: `Contact ${index + 1} label is required.` };
    }

    if (label.length < 2) {
      return { valid: false, message: `Contact ${index + 1} label must be at least 2 characters.` };
    }

    let numberValidation;

    if (type === 'mobile') {
      const mobileNumber = normalizeMobileNumber(contact.number);
      if (!/^\+63\d{10}$/.test(mobileNumber)) {
        return { valid: false, message: `${numberLabel} must be +63 followed by 10 digits.` };
      }

      numberValidation = { value: mobileNumber };
    } else {
      numberValidation = validateLandlineNumber(contact.number, numberLabel);
      if (!numberValidation.valid) {
        return numberValidation;
      }
    }

    normalizedContacts.push({
      label,
      type: ['mobile', 'landline', 'other'].includes(type) ? type : 'other',
      number: numberValidation.value
    });
  }

  return { valid: true, value: normalizedContacts };
};

const AdminContactHOAManagement = ({ token, showAlert, showConfirm }) => {
  const [settings, setSettings] = useState({ hierarchyImage: {}, contacts: [] });
  const [loading, setLoading] = useState(true);
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState('');
  const [contactsDraft, setContactsDraft] = useState([]);
  const [savingImage, setSavingImage] = useState(false);
  const [savingContacts, setSavingContacts] = useState(false);

  const authHeaders = useCallback(
    () => ({
      Authorization: `Bearer ${token}`
    }),
    [token]
  );

  const jsonHeaders = useCallback(
    () => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    }),
    [token]
  );

  const applySettings = useCallback((data) => {
    const nextSettings = {
      hierarchyImage: data?.hierarchyImage || {},
      contacts: Array.isArray(data?.contacts) ? data.contacts : []
    };

    setSettings(nextSettings);
    setContactsDraft(nextSettings.contacts);
  }, []);

  const fetchSettings = useCallback(async () => {
    try {
      const response = await fetch(API, { headers: authHeaders() });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || 'Failed to load Contact HOA settings.');
      }

      applySettings(data);
    } catch (error) {
      showAlert && showAlert(error.message || 'Failed to load Contact HOA settings.', 'error');
      applySettings({ hierarchyImage: {}, contacts: [] });
    }
  }, [applySettings, authHeaders, showAlert]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchSettings();
      setLoading(false);
    })();
  }, [fetchSettings]);

  useEffect(() => {
    if (!imageFile) {
      setImagePreview('');
      return undefined;
    }

    const objectUrl = URL.createObjectURL(imageFile);
    setImagePreview(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [imageFile]);

  const handleImageChange = (event) => {
    const file = event.target.files?.[0] || null;

    if (!file) {
      setImageFile(null);
      return;
    }

    const validation = validateImageFile(file, {
      label: 'Officer hierarchy image',
      maxBytes: IMAGE_UPLOAD_MAX_BYTES
    });

    if (!validation.valid) {
      showAlert && showAlert(validation.message, 'error');
      event.target.value = '';
      return;
    }

    setImageFile(file);
  };

  const handleUploadImage = async () => {
    if (!imageFile) {
      showAlert && showAlert('Please choose a hierarchy image first.', 'error');
      return;
    }

    setSavingImage(true);

    try {
      const formData = new FormData();
      formData.append('hierarchyImage', imageFile);

      const response = await fetch(`${API}/image`, {
        method: 'PUT',
        headers: authHeaders(),
        body: formData
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || 'Failed to upload the hierarchy image.');
      }

      applySettings(data.settings);
      setImageFile(null);
      showAlert && showAlert('Officer hierarchy image updated successfully.', 'success');
    } catch (error) {
      showAlert && showAlert(error.message || 'Failed to upload the hierarchy image.', 'error');
    }

    setSavingImage(false);
  };

  const runDeleteImage = async () => {
    setSavingImage(true);

    try {
      const response = await fetch(`${API}/image`, {
        method: 'DELETE',
        headers: authHeaders()
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || 'Failed to delete the hierarchy image.');
      }

      applySettings(data.settings);
      setImageFile(null);
      showAlert && showAlert('Officer hierarchy image deleted successfully.', 'success');
    } catch (error) {
      showAlert && showAlert(error.message || 'Failed to delete the hierarchy image.', 'error');
    }

    setSavingImage(false);
  };

  const handleDeleteImage = () => {
    if (showConfirm) {
      showConfirm('Delete the current officer hierarchy image?', runDeleteImage);
      return;
    }

    runDeleteImage();
  };

  const updateContact = (index, field, value) => {
    setContactsDraft((current) =>
      current.map((contact, contactIndex) =>
        contactIndex === index
          ? {
              ...contact,
              [field]: field === 'label' ? String(value || '').slice(0, 80) : String(value || '').slice(0, 25)
            }
          : contact
      )
    );
  };

  const addContact = () => {
    setContactsDraft((current) => [...current, buildEmptyContact()]);
  };

  const removeContact = (index) => {
    setContactsDraft((current) => current.filter((_, contactIndex) => contactIndex !== index));
  };

  const resetContacts = () => {
    setContactsDraft(settings.contacts);
  };

  const handleSaveContacts = async () => {
    const validation = validateContacts(contactsDraft);

    if (!validation.valid) {
      showAlert && showAlert(validation.message, 'error');
      return;
    }

    setSavingContacts(true);

    try {
      const response = await fetch(`${API}/contacts`, {
        method: 'PUT',
        headers: jsonHeaders(),
        body: JSON.stringify({ contacts: validation.value })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || 'Failed to update Contact HOA numbers.');
      }

      applySettings(data.settings);
      showAlert && showAlert('Contact HOA numbers updated successfully.', 'success');
    } catch (error) {
      showAlert && showAlert(error.message || 'Failed to update Contact HOA numbers.', 'error');
    }

    setSavingContacts(false);
  };

  return (
    <div className="contact-hoa-admin-root">
      <div className="page-header">
        <div className="page-title">
          <h2>Contact HOA</h2>
          <p>Upload the officers hierarchy image and maintain the phone and landline numbers residents can use.</p>
        </div>
      </div>

      {loading ? (
        <div className="contact-hoa-admin-loading">
          <Loader size={28} className="spin" />
          <p>Loading Contact HOA settings...</p>
        </div>
      ) : (
        <div className="contact-hoa-admin-layout">
          <section className="contact-hoa-admin-card">
            <div className="contact-hoa-admin-card-head">
              <div>
                <h3>Officers Hierarchy Image</h3>
                <p>Residents will only see one hierarchy image at a time. Uploading a new one replaces the current photo.</p>
              </div>
            </div>

            <div className="contact-hoa-admin-image-panel">
              <div className="contact-hoa-admin-image-frame">
                {imagePreview ? (
                  <img src={imagePreview} alt="New officer hierarchy preview" />
                ) : settings.hierarchyImage?.path ? (
                  <img src={assetUrl(settings.hierarchyImage.path)} alt="Current officer hierarchy" />
                ) : (
                  <div className="contact-hoa-admin-empty-image">
                    <ImageIcon size={36} />
                    <p>No hierarchy image uploaded yet.</p>
                  </div>
                )}
              </div>

              <div className="contact-hoa-admin-image-tools">
                <label className="contact-hoa-admin-upload">
                  <Upload size={16} />
                  <span>{imageFile ? 'Choose another image' : 'Choose image'}</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/gif"
                    onChange={handleImageChange}
                  />
                </label>

                <span className="contact-hoa-admin-file-note">
                  JPG, PNG, or GIF up to {formatFileSize(IMAGE_UPLOAD_MAX_BYTES)}
                </span>

                {imageFile && (
                  <div className="contact-hoa-admin-selected-file">
                    <strong>{imageFile.name}</strong>
                    <span>{formatFileSize(imageFile.size)}</span>
                  </div>
                )}

                <div className="contact-hoa-admin-actions">
                  <button
                    type="button"
                    className="contact-hoa-admin-save"
                    onClick={handleUploadImage}
                    disabled={!imageFile || savingImage}
                  >
                    {savingImage ? <Loader size={15} className="spin" /> : <Save size={15} />}
                    {settings.hierarchyImage?.path ? 'Update Image' : 'Upload Image'}
                  </button>

                  <button
                    type="button"
                    className="contact-hoa-admin-delete"
                    onClick={handleDeleteImage}
                    disabled={!settings.hierarchyImage?.path || savingImage}
                  >
                    <Trash2 size={15} />
                    Delete Current Image
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="contact-hoa-admin-card">
            <div className="contact-hoa-admin-card-head">
              <div>
                <h3>Phone and Landline Numbers</h3>
                <p>Add the numbers residents should call and edit the label for each one.</p>
              </div>
              <button type="button" className="contact-hoa-admin-add" onClick={addContact}>
                <PlusCircle size={15} />
                Add Number
              </button>
            </div>

            <div className="contact-hoa-admin-contact-list">
              {contactsDraft.length === 0 ? (
                <div className="contact-hoa-admin-empty-contacts">
                  <Phone size={28} />
                  <p>No contact numbers added yet.</p>
                </div>
              ) : (
                contactsDraft.map((contact, index) => (
                  <article key={`contact-${index}`} className="contact-hoa-admin-contact-row">
                    <div className="contact-hoa-admin-grid">
                      <div className="contact-hoa-admin-field">
                        <label>Contact Label</label>
                        <input
                          value={contact.label || ''}
                          onChange={(event) => updateContact(index, 'label', event.target.value)}
                          placeholder="Example: HOA Office"
                          maxLength={80}
                        />
                      </div>

                      <div className="contact-hoa-admin-field">
                        <label>Type</label>
                        <select
                          value={contact.type || 'mobile'}
                          onChange={(event) => updateContact(index, 'type', event.target.value)}
                        >
                          {CONTACT_TYPE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="contact-hoa-admin-field contact-hoa-admin-field--wide">
                        <label>Number</label>
                        <input
                          value={contact.number || ''}
                          onChange={(event) => updateContact(index, 'number', event.target.value)}
                          placeholder={CONTACT_TYPE_OPTIONS.find((option) => option.value === contact.type)?.hint || 'Enter contact number'}
                          maxLength={25}
                        />
                      </div>
                    </div>

                    <div className="contact-hoa-admin-row-actions">
                      <button
                        type="button"
                        className="contact-hoa-admin-remove"
                        onClick={() => removeContact(index)}
                      >
                        <X size={14} />
                        Remove
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>

            <div className="contact-hoa-admin-footer">
              <button type="button" className="contact-hoa-admin-reset" onClick={resetContacts} disabled={savingContacts}>
                Reset
              </button>
              <button type="button" className="contact-hoa-admin-save" onClick={handleSaveContacts} disabled={savingContacts}>
                {savingContacts ? <Loader size={15} className="spin" /> : <Save size={15} />}
                Save Contact Numbers
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default AdminContactHOAManagement;
