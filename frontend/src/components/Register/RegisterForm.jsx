import React from 'react';
import { Eye, EyeOff, Plus, Trash2, Users, Upload, X, FileText, Car, Image } from 'lucide-react';
import './RegisterForm.css';
import ecohoa from '../../assets/ecohoa.png';
import {
  sanitizeNameInput,
  sanitizePhoneNumberInput
} from '../../utils/formSecurity';
import {
  DOCUMENT_UPLOAD_MAX_BYTES,
  IMAGE_UPLOAD_MAX_BYTES,
  formatFileSize,
  validateImageFile,
  validatePdfOrImageFile
} from '../../utils/uploadValidation';

const RELATIONSHIP_OPTIONS = [
  'Spouse', 'Father', 'Mother', 'Son', 'Daughter',
  'Brother', 'Sister', 'Grandfather', 'Grandmother',
  'Grandson', 'Granddaughter', 'Uncle', 'Aunt',
  'Nephew', 'Niece', 'Cousin', 'Other'
];

const PRIMARY_CONTACT_RELATIONSHIP = 'Primary Contact';

const RegisterForm = ({
  showPassword,
  setShowPassword,
  showConfirmPassword,
  setShowConfirmPassword,
  formData,
  setFormData,
  handleEmailChange,
  familyMembers,
  setFamilyMembers,
  vehicles,
  setVehicles,
  identificationFile,
  setIdentificationFile,
  emailVerificationCode,
  setEmailVerificationCode,
  emailVerificationStatus,
  sendingEmailOtp,
  verifyingEmailOtp,
  emailOtpCooldown,
  isEmailVerified,
  handleSendEmailOtp,
  handleVerifyEmailOtp,
  error,
  setError,
  loading,
  handleRegister,
  onNavigateToLogin
}) => {
  const availableStreets = [
  'Babylon',
  'Bethlehem',
  'Bethel',
  'Canaan',
  'Eden',
  'Egypt',
  'Galilee',
  'Gaza',
  'Golan',
  'Golgotha',
  'Hebron',
  'Israel',
  'Jericho',
  'Jerusalem',
  'Jordan',
  'Judea',
  'Nazareth',
  'Persia',
  'Samaria',
  'Sinai',
  'Zion'
];

  const addFamilyMember = () => {
    const isFirstMember = familyMembers.length === 0;
    setFamilyMembers([
      ...familyMembers,
      {
        lastName: '',
        firstName: '',
        middleName: '',
        relationship: isFirstMember ? PRIMARY_CONTACT_RELATIONSHIP : '',
        isPrimaryContact: isFirstMember
      }
    ]);
  };

  const enforcePrimaryContactRelationship = (members, primaryIndex) =>
    members.map((member, memberIndex) => {
      const isPrimaryContact = memberIndex === primaryIndex;
      const currentRelationship = String(member.relationship || '').trim();

      return {
        ...member,
        isPrimaryContact,
        relationship: isPrimaryContact
          ? PRIMARY_CONTACT_RELATIONSHIP
          : (currentRelationship === PRIMARY_CONTACT_RELATIONSHIP ? '' : currentRelationship)
      };
    });

  const removeFamilyMember = (index) => {
    const removedWasPrimary = Boolean(familyMembers[index]?.isPrimaryContact);
    const filteredMembers = familyMembers.filter((_, i) => i !== index);

    if (filteredMembers.length === 0) {
      setFamilyMembers([]);
      return;
    }

    const existingPrimaryIndex = filteredMembers.findIndex((member) => Boolean(member.isPrimaryContact));
    const primaryIndex = removedWasPrimary
      ? 0
      : (existingPrimaryIndex >= 0 ? existingPrimaryIndex : 0);

    setFamilyMembers(enforcePrimaryContactRelationship(filteredMembers, primaryIndex));
  };

  const updateFamilyMember = (index, field, value) => {
    const newMembers = [...familyMembers];
    if (field === 'isPrimaryContact') {
      setFamilyMembers(enforcePrimaryContactRelationship(newMembers, index));
      return;
    }

    newMembers[index][field] = ['lastName', 'firstName', 'middleName'].includes(field)
      ? sanitizeNameInput(value, 30)
      : value;
    setFamilyMembers(newMembers);
  };

  const addVehicle = () => {
    setVehicles([...vehicles, {
      plateNumber: '',
      vehicleType: '',
      brand: '',
      model: '',
      color: '',
      photo: null,
      photoPreview: null
    }]);
  };

  const removeVehicle = (index) => {
    const newVehicles = vehicles.filter((_, i) => i !== index);
    setVehicles(newVehicles);
  };

  const updateVehicle = (index, field, value) => {
    const newVehicles = [...vehicles];
    newVehicles[index][field] = field === 'plateNumber'
      ? String(value || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 10)
      : value;
    setVehicles(newVehicles);
  };

  const handleVehiclePhotoChange = (index, e) => {
    const file = e.target.files[0];
    if (file) {
      const validation = validateImageFile(file, {
        label: `Vehicle photo ${index + 1}`,
        maxBytes: IMAGE_UPLOAD_MAX_BYTES
      });

      if (!validation.valid) {
        setError(validation.message);
        e.target.value = '';
        return;
      }

      setError('');
      const reader = new FileReader();
      reader.onloadend = () => {
        const newVehicles = [...vehicles];
        newVehicles[index].photo = file;
        newVehicles[index].photoPreview = reader.result;
        setVehicles(newVehicles);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeVehiclePhoto = (index) => {
    const newVehicles = [...vehicles];
    newVehicles[index].photo = null;
    newVehicles[index].photoPreview = null;
    setVehicles(newVehicles);
    const fileInput = document.getElementById(`vehicle-photo-${index}`);
    if (fileInput) fileInput.value = '';
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const validation = validatePdfOrImageFile(file, {
        label: 'Identification document',
        maxBytes: DOCUMENT_UPLOAD_MAX_BYTES
      });

      if (!validation.valid) {
        setError(validation.message);
        e.target.value = '';
        return;
      }

      setError('');
      setIdentificationFile(file);
    }
  };

  const removeFile = () => {
    setIdentificationFile(null);
    const fileInput = document.getElementById('identification-upload');
    if (fileInput) fileInput.value = '';
  };

  const handlePhoneNumberChange = (e) => {
    setFormData({
      ...formData,
      phoneNumber: sanitizePhoneNumberInput(e.target.value, formData.phoneNumber)
    });
  };

  const preventCopyPaste = (e) => {
    e.preventDefault();
  };

  const handlePropertyTypeChange = (value) => {
    setFormData({
      ...formData,
      propertyType: value,
      buildingName: value === 'apartment' ? formData.buildingName : '',
      unitNumber: value === 'apartment' ? formData.unitNumber : ''
    });
  };

  const handleOccupancyTypeChange = (value) => {
    setFormData({
      ...formData,
      occupancyType: value,
      occupancyEndDate: value === 'renter' ? formData.occupancyEndDate : ''
    });
  };

  return (
    <div className="register-container">
      <div className="register-card">
        <div className="register-header">
          <div className="logo-container">
            <img src={ecohoa} alt="EHAI Logo" className="logo-image" />
          </div>
          <h1 className="register-title">Create Account</h1>
          <p className="register-subtitle">Join the Ecotrend community</p>
        </div>

        <div className="register-form">
          {/* Account Information Section */}
          <div className="form-section">
            <h3 className="section-title">Account Information</h3>

            <div className="form-group">
              <label className="form-label">Email Address</label>
              <input
                type="email"
                placeholder="your.email@gmail.com"
                value={formData.email}
                onChange={(e) => handleEmailChange(e.target.value)}
                onPaste={preventCopyPaste}
                onCopy={preventCopyPaste}
                onCut={preventCopyPaste}
                className="form-input"
              />
              <span className="input-hint">Use Gmail, Yahoo, Hotmail, Outlook, or iCloud</span>

              <div className="email-verification-controls">
                <button
                  type="button"
                  onClick={handleSendEmailOtp}
                  disabled={sendingEmailOtp || emailOtpCooldown > 0 || isEmailVerified}
                  className={`email-action-btn ${isEmailVerified ? 'email-action-btn-success' : ''}`}
                >
                  {isEmailVerified
                    ? 'Email Verified'
                    : sendingEmailOtp
                    ? 'Sending OTP...'
                    : emailOtpCooldown > 0
                    ? `Resend OTP (${emailOtpCooldown}s)`
                    : 'Verify Email'}
                </button>

                <div className="email-otp-group">
                  <input
                    type="text"
                    placeholder="Enter OTP"
                    value={emailVerificationCode}
                    onChange={(e) => setEmailVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    onPaste={preventCopyPaste}
                    onCopy={preventCopyPaste}
                    onCut={preventCopyPaste}
                    className="form-input email-otp-input"
                    maxLength={6}
                    disabled={isEmailVerified}
                  />
                  <button
                    type="button"
                    onClick={handleVerifyEmailOtp}
                    disabled={verifyingEmailOtp || isEmailVerified || !formData.email.trim()}
                    className={`email-action-btn email-otp-btn ${isEmailVerified ? 'email-action-btn-success' : ''}`}
                  >
                    {isEmailVerified ? 'Verified' : verifyingEmailOtp ? 'Verifying...' : 'Verify OTP'}
                  </button>
                </div>
              </div>

              {emailVerificationStatus?.message && (
                <div className={`email-verification-status email-verification-status-${emailVerificationStatus.type || 'info'}`}>
                  {emailVerificationStatus.message}
                </div>
              )}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Username</label>
                <input
                  type="text"
                  placeholder="Choose a username"
                  value={formData.username}
                  onChange={(e) => {
                    const value = e.target.value.slice(0, 20);
                    setFormData({ ...formData, username: value });
                  }}
                  onPaste={preventCopyPaste}
                  onCopy={preventCopyPaste}
                  onCut={preventCopyPaste}
                  className="form-input"
                  maxLength={20}
                />
                <span className="input-hint">{formData.username.length}/20 characters</span>
              </div>

              <div className="form-group">
                <label className="form-label">Family Name</label>
                <input
                  type="text"
                  placeholder="Enter family name"
                  value={formData.familyName}
                  onChange={(e) => {
                    const value = sanitizeNameInput(e.target.value, 20);
                    setFormData({ ...formData, familyName: value });
                  }}
                  onPaste={preventCopyPaste}
                  onCopy={preventCopyPaste}
                  onCut={preventCopyPaste}
                  className="form-input"
                  maxLength={20}
                />
                <span className="input-hint">{formData.familyName.length}/20 characters (letters only)</span>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Password</label>
                <div className="password-container">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Create a password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    onPaste={preventCopyPaste}
                    onCopy={preventCopyPaste}
                    onCut={preventCopyPaste}
                    className="form-input"
                    maxLength={20}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="password-toggle"
                    aria-label="Toggle password visibility"
                  >
                    {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
                <span className="input-hint">Must include: A-Z, a-z, 0-9, and special character</span>
              </div>

              <div className="form-group">
                <label className="form-label">Confirm Password</label>
                <div className="password-container">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    placeholder="Confirm your password"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    onPaste={preventCopyPaste}
                    onCopy={preventCopyPaste}
                    onCut={preventCopyPaste}
                    className="form-input"
                    maxLength={20}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="password-toggle"
                    aria-label="Toggle password visibility"
                  >
                    {showConfirmPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Household Information Section */}
          <div className="form-section">
            <h3 className="section-title">Household Information</h3>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Property Type</label>
                <select
                  value={formData.propertyType}
                  onChange={(e) => handlePropertyTypeChange(e.target.value)}
                  className="form-input"
                >
                  <option value="house">House</option>
                  <option value="apartment">Apartment</option>
                </select>
                <span className="input-hint">Choose the kind of residence this account belongs to</span>
              </div>

              <div className="form-group">
                <label className="form-label">Resident Type</label>
                <select
                  value={formData.occupancyType}
                  onChange={(e) => handleOccupancyTypeChange(e.target.value)}
                  className="form-input"
                >
                  <option value="permanent">Permanent Resident</option>
                  <option value="renter">Renter</option>
                </select>
                <span className="input-hint">Renter accounts can expire and be renewed from the admin side</span>
              </div>
            </div>

            <div className="form-row address-row">
              <div className="form-group">
                <label className="form-label">Block</label>
                <select
                  value={formData.block || ''}
                  onChange={(e) => setFormData({ ...formData, block: e.target.value })}
                  className="form-input"
                >
                  <option value="">Select Block</option>
                  {[...Array(20)].map((_, i) => (
                    <option key={i + 1} value={i + 1}>{i + 1}</option>
                  ))}
                </select>
                <span className="input-hint">1-20</span>
              </div>

              <div className="form-group">
                <label className="form-label">Lot</label>
                <select
                  value={formData.lot || ''}
                  onChange={(e) => setFormData({ ...formData, lot: e.target.value })}
                  className="form-input"
                >
                  <option value="">Select Lot</option>
                  {[...Array(40)].map((_, i) => (
                    <option key={i + 1} value={i + 1}>{i + 1}</option>
                  ))}
                </select>
                <span className="input-hint">1-40</span>
              </div>

              <div className="form-group">
                <label className="form-label">Phase</label>
                <select
                  value={formData.phase || ''}
                  onChange={(e) => setFormData({ ...formData, phase: e.target.value })}
                  className="form-input"
                >
                  <option value="">Select Phase</option>
                  {[...Array(4)].map((_, i) => (
                    <option key={i + 1} value={i + 1}>{i + 1}</option>
                  ))}
                </select>
                <span className="input-hint">1-4</span>
              </div>
            </div>

            {formData.propertyType === 'apartment' && (
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Building Name</label>
                  <input
                    type="text"
                    placeholder="Example: Cedar Heights"
                    value={formData.buildingName || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      buildingName: e.target.value.replace(/[^\w\s#.-]/g, '').slice(0, 60)
                    })}
                    className="form-input"
                    maxLength={60}
                  />
                  <span className="input-hint">Apartment or building name</span>
                </div>

                <div className="form-group">
                  <label className="form-label">Unit / Room Number</label>
                  <input
                    type="text"
                    placeholder="Example: 2B"
                    value={formData.unitNumber || ''}
                    onChange={(e) => setFormData({
                      ...formData,
                      unitNumber: e.target.value.toUpperCase().replace(/[^\w#-]/g, '').slice(0, 20)
                    })}
                    className="form-input"
                    maxLength={20}
                  />
                  <span className="input-hint">This is the unique apartment household/unit</span>
                </div>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Street</label>
              <select
                value={formData.street}
                onChange={(e) => setFormData({ ...formData, street: e.target.value })}
                className="form-input"
              >
                <option value="">Select a street</option>
                {availableStreets.map((street) => (
                  <option key={street} value={street}>{street}</option>
                ))}
              </select>
              <span className="input-hint">Select your street from the list</span>
            </div>

            <div className="form-group">
              <label className="form-label">Phone Number</label>
              <input
                type="tel"
                placeholder="+639XXXXXXXXX"
                value={formData.phoneNumber}
                onChange={handlePhoneNumberChange}
                onPaste={preventCopyPaste}
                onCopy={preventCopyPaste}
                onCut={preventCopyPaste}
                className="form-input"
                maxLength={13}
              />
              <span className="input-hint">Philippine mobile number (+63 cannot be removed)</span>
            </div>

            {formData.occupancyType === 'renter' && (
              <>
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Occupancy Start Date</label>
                    <input
                      type="date"
                      value={formData.occupancyStartDate || ''}
                      onChange={(e) => setFormData({ ...formData, occupancyStartDate: e.target.value })}
                      className="form-input"
                    />
                    <span className="input-hint">Used to track the renter’s active period</span>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Occupancy End Date</label>
                    <input
                      type="date"
                      value={formData.occupancyEndDate || ''}
                      onChange={(e) => setFormData({ ...formData, occupancyEndDate: e.target.value })}
                      className="form-input"
                    />
                    <span className="input-hint">Optional. Leave blank to default the account expiry to 3 months.</span>
                  </div>
                </div>

                <p className="section-description">
                  Renter accounts can be renewed later and the request will appear in the admin resident approval side.
                </p>
              </>
            )}
          </div>

          {/* Vehicle Information Section - OPTIONAL */}
          <div className="form-section vehicle-section">
            <div className="family-members-header">
              <div className="section-title-wrapper">
                <Car className="section-icon" size={20} />
                <h3 className="section-title">Vehicle Information</h3>
                <span className="optional-badge">Optional</span>
              </div>
              <button type="button" onClick={addVehicle} className="btn-add-member">
                <Plus size={18} />
                Add Vehicle
              </button>
            </div>

            {vehicles.length === 0 && (
              <div className="no-members-message">
                <Car size={40} className="no-members-icon" />
                <p>No vehicles added yet</p>
                <span>Click "Add Vehicle" if you want to register a vehicle</span>
              </div>
            )}

            <div className="family-members-list">
              {vehicles.map((vehicle, index) => (
                <div key={index} className="family-member-card vehicle-card-register">
                  <div className="family-member-header">
                    <div className="member-badge">
                      <span className="member-number">#{index + 1}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeVehicle(index)}
                      className="btn-remove-member"
                      aria-label="Remove vehicle"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div className="vehicle-inputs">
                    <div className="form-group-inline">
                      <label className="form-label-sm">Plate Number</label>
                      <input
                        type="text"
                        placeholder="ABC1234"
                        value={vehicle.plateNumber}
                        onChange={(e) => updateVehicle(index, 'plateNumber', e.target.value)}
                        className="form-input-sm"
                        maxLength={10}
                      />
                    </div>
                    <div className="form-group-inline">
                      <label className="form-label-sm">Vehicle Type</label>
                      <select
                        value={vehicle.vehicleType}
                        onChange={(e) => updateVehicle(index, 'vehicleType', e.target.value)}
                        className="form-input-sm"
                      >
                        <option value="">Select type</option>
                        <option value="Car">Car</option>
                        <option value="SUV">SUV</option>
                        <option value="Van">Van</option>
                        <option value="Motorcycle">Motorcycle</option>
                        <option value="Truck">Truck</option>
                        <option value="Bike">Bike</option>
                      </select>
                    </div>
                    <div className="form-group-inline">
                      <label className="form-label-sm">Brand</label>
                      <input
                        type="text"
                        placeholder="e.g., Toyota"
                        value={vehicle.brand}
                        onChange={(e) => updateVehicle(index, 'brand', e.target.value)}
                        className="form-input-sm"
                        maxLength={20}
                      />
                    </div>
                    <div className="form-group-inline">
                      <label className="form-label-sm">Model</label>
                      <input
                        type="text"
                        placeholder="e.g., Vios"
                        value={vehicle.model}
                        onChange={(e) => updateVehicle(index, 'model', e.target.value)}
                        className="form-input-sm"
                        maxLength={20}
                      />
                    </div>
                    <div className="form-group-inline">
                      <label className="form-label-sm">Color</label>
                      <input
                        type="text"
                        placeholder="e.g., White, Black"
                        value={vehicle.color}
                        onChange={(e) => updateVehicle(index, 'color', e.target.value)}
                        className="form-input-sm"
                        maxLength={20}
                      />
                    </div>
                  </div>

                  {/* Vehicle Photo Upload */}
                  <div className="vehicle-photo-section">
                    <label className="form-label-sm">
                      <Image size={14} className="inline-icon" />
                      Vehicle Photo (Optional)
                    </label>
                    <p className="vehicle-photo-hint">
                      Photo must show the front of the vehicle including the plate number
                    </p>

                    {!vehicle.photoPreview ? (
                      <div className="vehicle-photo-upload">
                        <input
                          type="file"
                          id={`vehicle-photo-${index}`}
                          accept="image/jpeg,image/jpg,image/png,image/gif"
                          onChange={(e) => handleVehiclePhotoChange(index, e)}
                          className="file-input-hidden"
                        />
                        <label htmlFor={`vehicle-photo-${index}`} className="vehicle-photo-label">
                          <Upload size={24} />
                          <span>Click to upload photo</span>
                          <span className="photo-subtext">{`JPG, PNG, or GIF (max. ${formatFileSize(IMAGE_UPLOAD_MAX_BYTES)})`}</span>
                        </label>
                      </div>
                    ) : (
                      <div className="vehicle-photo-preview">
                        <img src={vehicle.photoPreview} alt={`Vehicle ${index + 1}`} />
                        <button
                          type="button"
                          onClick={() => removeVehiclePhoto(index)}
                          className="btn-remove-photo"
                          aria-label="Remove photo"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Household Members Section */}
          <div className="form-section family-members-section">
            <div className="family-members-header">
              <div className="section-title-wrapper">
                <Users className="section-icon" size={20} />
                <h3 className="section-title">Household Members</h3>
                <span className="required-badge">Required</span>
              </div>
              <button type="button" onClick={addFamilyMember} className="btn-add-member">
                <Plus size={18} />
                Add Member
              </button>
            </div>
            <p className="section-description">
              This single account covers the household. Select one member as the primary contact for HOA notices and account concerns.
            </p>

            {familyMembers.length === 0 && (
              <div className="no-members-message">
                <Users size={40} className="no-members-icon" />
                <p>No household members added yet</p>
                <span>Add the household members covered by this account</span>
              </div>
            )}

            <div className="family-members-list">
              {familyMembers.map((member, index) => (
                <div key={index} className="family-member-card">
                  <div className="family-member-header">
                    <div className="member-badge">
                      <span className="member-number">#{index + 1}</span>
                      {member.isPrimaryContact && (
                        <span className="primary-contact-badge">Primary Contact</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFamilyMember(index)}
                      className="btn-remove-member"
                      aria-label="Remove family member"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>

                  <div className="family-member-inputs">
                    <div className="form-group-inline">
                      <label className="form-label-sm">Last Name</label>
                      <input
                        type="text"
                        placeholder="Last Name"
                        value={member.lastName}
                        onChange={(e) => updateFamilyMember(index, 'lastName', e.target.value)}
                        className="form-input-sm"
                        maxLength={30}
                      />
                    </div>
                    <div className="form-group-inline">
                      <label className="form-label-sm">First Name</label>
                      <input
                        type="text"
                        placeholder="First Name"
                        value={member.firstName}
                        onChange={(e) => updateFamilyMember(index, 'firstName', e.target.value)}
                        className="form-input-sm"
                        maxLength={30}
                      />
                    </div>
                    <div className="form-group-inline">
                      <label className="form-label-sm">Middle Name</label>
                      <input
                        type="text"
                        placeholder="Middle Name"
                        value={member.middleName}
                        onChange={(e) => updateFamilyMember(index, 'middleName', e.target.value)}
                        className="form-input-sm"
                        maxLength={30}
                      />
                    </div>
                    <div className="form-group-inline">
                      <label className="form-label-sm">Relationship to the Primary Contact</label>
                      <select
                        value={member.relationship}
                        onChange={(e) => updateFamilyMember(index, 'relationship', e.target.value)}
                        className="form-input-sm"
                        disabled={Boolean(member.isPrimaryContact)}
                      >
                        <option value="">
                          {member.isPrimaryContact ? PRIMARY_CONTACT_RELATIONSHIP : 'Select relationship'}
                        </option>
                        {member.isPrimaryContact && (
                          <option value={PRIMARY_CONTACT_RELATIONSHIP}>{PRIMARY_CONTACT_RELATIONSHIP}</option>
                        )}
                        {RELATIONSHIP_OPTIONS.map((r) => (
                          <option key={r} value={r}>{r}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <label className="primary-contact-choice">
                    <input
                      type="radio"
                      name="primaryHouseholdContact"
                      checked={Boolean(member.isPrimaryContact)}
                      onChange={() => updateFamilyMember(index, 'isPrimaryContact', true)}
                    />
                    <span>Use this member as the primary household contact</span>
                  </label>
                </div>
              ))}
            </div>
          </div>

          {/* Identification Document Section */}
          <div className="form-section identification-section">
            <div className="section-title-wrapper">
              <FileText className="section-icon" size={20} />
              <h3 className="section-title">Identification Document</h3>
              <span className="required-badge">Required</span>
            </div>
            <p className="section-description">
              Upload a valid ID for verification (Barangay Certificate, Government ID, Driver's License, etc.)
            </p>

            {!identificationFile ? (
              <div className="file-upload-area">
                <input
                  type="file"
                  id="identification-upload"
                  accept="image/jpeg,image/jpg,image/png,application/pdf"
                  onChange={handleFileChange}
                  className="file-input-hidden"
                />
                <label htmlFor="identification-upload" className="file-upload-label">
                  <Upload className="upload-icon" size={40} />
                  <span className="upload-text">Click to upload or drag and drop</span>
                  <span className="upload-subtext">{`JPG, PNG or PDF (max. ${formatFileSize(DOCUMENT_UPLOAD_MAX_BYTES)})`}</span>
                </label>
              </div>
            ) : (
              <div className="file-preview">
                <div className="file-info">
                  <FileText className="file-icon" size={24} />
                  <div className="file-details">
                    <span className="file-name">{identificationFile.name}</span>
                    <span className="file-size">{formatFileSize(identificationFile.size)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={removeFile}
                  className="btn-remove-file"
                  aria-label="Remove file"
                >
                  <X size={18} />
                </button>
              </div>
            )}
          </div>

          {error && (
            <div className="error-message">
              <span className="error-icon">⚠</span>
              {error}
            </div>
          )}

          <button
            onClick={handleRegister}
            disabled={loading || !isEmailVerified}
            className="btn-primary"
          >
            {loading ? (
              <>
                <span className="spinner"></span>
                Creating Account...
              </>
            ) : (
              isEmailVerified ? 'Create Account' : 'Verify Email to Continue'
            )}
          </button>

          <div className="divider">
            <span>or</span>
          </div>

          <div className="login-link">
            Already have an account?
            <button onClick={onNavigateToLogin}>Sign In</button>
          </div>
        </div>
      </div>

      <div className="background-decoration">
        <div className="leaf-pattern leaf-1"></div>
        <div className="leaf-pattern leaf-2"></div>
        <div className="leaf-pattern leaf-3"></div>
      </div>
    </div>
  );
};

export default RegisterForm;
