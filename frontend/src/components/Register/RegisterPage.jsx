import React, { useEffect, useState } from 'react';
import RegisterForm from './RegisterForm';
import { apiUrl } from '../../utils/api';
import {
  validateNameValue,
  validatePhoneNumberValue
} from '../../utils/formSecurity';
import {
  DOCUMENT_UPLOAD_MAX_BYTES,
  IMAGE_UPLOAD_MAX_BYTES,
  validateImageFile,
  validatePdfOrImageFile
} from '../../utils/uploadValidation';

const getTodayInputValue = () => new Date().toISOString().split('T')[0];
const PRIMARY_CONTACT_RELATIONSHIP = 'Primary Contact';

const RegisterPage = ({ onRegisterSuccess, onNavigateToLogin }) => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    familyName: '',
    username: '',
    password: '',
    confirmPassword: '',
    propertyType: 'house',
    occupancyType: 'permanent',
    block: '',
    lot: '',
    phase: '',
    buildingName: '',
    unitNumber: '',
    street: '',
    occupancyStartDate: getTodayInputValue(),
    occupancyEndDate: '',
    phoneNumber: '+63'
  });
  const [familyMembers, setFamilyMembers] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [identificationFile, setIdentificationFile] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailVerificationCode, setEmailVerificationCode] = useState('');
  const [emailVerificationToken, setEmailVerificationToken] = useState('');
  const [verifiedEmail, setVerifiedEmail] = useState('');
  const [emailVerificationStatus, setEmailVerificationStatus] = useState({ type: '', message: '' });
  const [sendingEmailOtp, setSendingEmailOtp] = useState(false);
  const [verifyingEmailOtp, setVerifyingEmailOtp] = useState(false);
  const [emailOtpCooldown, setEmailOtpCooldown] = useState(0);

  const validateEmail = (email) => {
    const validProviders = [
      'gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com',
      'icloud.com', 'aol.com', 'protonmail.com', 'zoho.com'
    ];
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (!emailRegex.test(normalizedEmail)) {
      return { valid: false, message: 'Please enter a valid email address' };
    }

    const domain = normalizedEmail.split('@')[1];
    if (!validProviders.includes(domain)) {
      return {
        valid: false,
        message: 'Please use a valid email provider (Gmail, Yahoo, Hotmail, Outlook, iCloud, etc.)'
      };
    }

    return {
      valid: true,
      value: normalizedEmail
    };
  };

  const normalizeEmail = (email) => String(email || '').trim().toLowerCase();
  const isEmailVerified = Boolean(emailVerificationToken) && normalizeEmail(formData.email) === verifiedEmail;

  useEffect(() => {
    if (emailOtpCooldown <= 0) return undefined;

    const timer = setInterval(() => {
      setEmailOtpCooldown((current) => (current <= 1 ? 0 : current - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [emailOtpCooldown]);

  const validateUsername = (username) => {
    if (username.length > 20) {
      return { valid: false, message: 'Username must not exceed 20 characters' };
    }
    const usernameRegex = /^[a-zA-Z0-9_]+$/;
    if (!usernameRegex.test(username)) {
      return { valid: false, message: 'Username can only contain letters, numbers, and underscores' };
    }
    if (username.length < 3) {
      return { valid: false, message: 'Username must be at least 3 characters long' };
    }
    return { valid: true };
  };

  const validatePassword = (password) => {
    if (password.length < 8) {
      return { valid: false, message: 'Password must be at least 8 characters long' };
    }
    if (!/[A-Z]/.test(password)) {
      return { valid: false, message: 'Password must contain at least one uppercase letter' };
    }
    if (!/[a-z]/.test(password)) {
      return { valid: false, message: 'Password must contain at least one lowercase letter' };
    }
    if (!/[0-9]/.test(password)) {
      return { valid: false, message: 'Password must contain at least one number' };
    }
    if (!/[^A-Za-z0-9\s]/.test(password)) {
      return { valid: false, message: 'Password must contain at least one special character' };
    }
    return { valid: true };
  };

  const validateBlock = (block) => {
    if (!block || block === '') {
      return { valid: false, message: 'Please select a block' };
    }
    return { valid: true };
  };

  const validateLot = (lot) => {
    if (!lot || lot === '') {
      return { valid: false, message: 'Please select a lot' };
    }
    return { valid: true };
  };

  const validatePhase = (phase) => {
    if (!phase || phase === '') {
      return { valid: false, message: 'Please select a phase' };
    }
    return { valid: true };
  };

  const validateBuildingName = (buildingName) => {
    const normalized = String(buildingName || '').trim();
    if (normalized.length < 2) {
      return { valid: false, message: 'Building name must be at least 2 characters' };
    }
    if (normalized.length > 60) {
      return { valid: false, message: 'Building name must not exceed 60 characters' };
    }
    return { valid: true, value: normalized };
  };

  const validateUnitNumber = (unitNumber) => {
    const normalized = String(unitNumber || '').trim().toUpperCase();
    if (!normalized) {
      return { valid: false, message: 'Unit number is required for apartment registrations' };
    }
    if (normalized.length > 20) {
      return { valid: false, message: 'Unit number must not exceed 20 characters' };
    }
    return { valid: true, value: normalized };
  };

  const validateFamilyName = (name) => {
    return validateNameValue(name, 'Family name', {
      minLength: 2,
      maxLength: 20
    });
  };

  const validateStreet = (street) => {
    if (!street || street === '') {
      return { valid: false, message: 'Please select a street' };
    }
    return { valid: true };
  };

  const validatePhoneNumber = (phone) => {
    return validatePhoneNumberValue(phone, 'Phone number', { required: true });
  };

  const validateOccupancyStartDate = (value) => {
    if (!value) {
      return { valid: false, message: 'Please choose an occupancy start date' };
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return { valid: false, message: 'Please choose a valid occupancy start date' };
    }

    return { valid: true };
  };

  const validateOccupancyEndDate = (startDateValue, endDateValue) => {
    if (!endDateValue) {
      return { valid: true };
    }

    const startDate = new Date(startDateValue);
    const endDate = new Date(endDateValue);

    if (Number.isNaN(endDate.getTime())) {
      return { valid: false, message: 'Please choose a valid occupancy end date' };
    }

    if (Number.isNaN(startDate.getTime())) {
      return { valid: false, message: 'Please choose a valid occupancy start date first' };
    }

    if (endDate.getTime() <= startDate.getTime()) {
      return { valid: false, message: 'Occupancy end date must be later than the start date' };
    }

    return { valid: true };
  };

  const resetEmailVerificationState = () => {
    setEmailVerificationCode('');
    setEmailVerificationToken('');
    setVerifiedEmail('');
    setEmailVerificationStatus({ type: '', message: '' });
    setEmailOtpCooldown(0);
  };

  const handleEmailChange = (email) => {
    const normalizedNextEmail = normalizeEmail(email);
    const stillVerified = normalizedNextEmail && normalizedNextEmail === verifiedEmail;

    setFormData((current) => ({
      ...current,
      email
    }));

    if (!stillVerified) {
      resetEmailVerificationState();
    }
  };

  const handleSendEmailOtp = async () => {
    setError('');

    const emailValidation = validateEmail(formData.email);
    if (!emailValidation.valid) {
      setEmailVerificationStatus({ type: 'error', message: emailValidation.message });
      return;
    }

    if (isEmailVerified) {
      setEmailVerificationStatus({ type: 'success', message: 'This email address is already verified.' });
      return;
    }

    setSendingEmailOtp(true);
    setEmailVerificationStatus({ type: '', message: '' });

    try {
      const response = await fetch(apiUrl('/auth/email-verification/send-otp'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: emailValidation.value
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setEmailVerificationStatus({
          type: 'error',
          message: data.message || 'Failed to send verification OTP.'
        });
        return;
      }

      setEmailVerificationCode('');
      setEmailVerificationToken('');
      setVerifiedEmail('');
      setEmailOtpCooldown(Number(data.retryAfterSeconds) || 60);
      setEmailVerificationStatus({
        type: 'info',
        message: data.message || 'Verification OTP sent successfully.'
      });
    } catch (err) {
      setEmailVerificationStatus({
        type: 'error',
        message: 'Connection error. Please try again.'
      });
    } finally {
      setSendingEmailOtp(false);
    }
  };

  const handleVerifyEmailOtp = async () => {
    setError('');

    const emailValidation = validateEmail(formData.email);
    if (!emailValidation.valid) {
      setEmailVerificationStatus({ type: 'error', message: emailValidation.message });
      return;
    }

    if (emailVerificationCode.trim().length !== 6) {
      setEmailVerificationStatus({ type: 'error', message: 'Please enter the 6-digit OTP sent to your email.' });
      return;
    }

    setVerifyingEmailOtp(true);
    setEmailVerificationStatus({ type: '', message: '' });

    try {
      const response = await fetch(apiUrl('/auth/email-verification/verify-otp'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email: emailValidation.value,
          otp: emailVerificationCode
        })
      });

      const data = await response.json();

      if (!response.ok) {
        setEmailVerificationStatus({
          type: 'error',
          message: data.message || 'Failed to verify OTP.'
        });
        return;
      }

      setEmailVerificationToken(data.verificationToken || '');
      setVerifiedEmail(emailValidation.value);
      setEmailVerificationStatus({
        type: 'success',
        message: data.message || 'Email verified successfully.'
      });
    } catch (err) {
      setEmailVerificationStatus({
        type: 'error',
        message: 'Connection error. Please try again.'
      });
    } finally {
      setVerifyingEmailOtp(false);
    }
  };

  const handleRegister = async () => {
    setError('');

    const emailValidation = validateEmail(formData.email);
    if (!emailValidation.valid) { setError(emailValidation.message); return; }

    if (!isEmailVerified) {
      setError('Please verify your email before creating an account.');
      return;
    }

    const familyNameValidation = validateFamilyName(formData.familyName);
    if (!familyNameValidation.valid) { setError(familyNameValidation.message); return; }

    const usernameValidation = validateUsername(formData.username);
    if (!usernameValidation.valid) { setError(usernameValidation.message); return; }

    const passwordValidation = validatePassword(formData.password);
    if (!passwordValidation.valid) { setError(passwordValidation.message); return; }

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    const blockValidation = validateBlock(formData.block);
    if (!blockValidation.valid) { setError(blockValidation.message); return; }

    const lotValidation = validateLot(formData.lot);
    if (!lotValidation.valid) { setError(lotValidation.message); return; }

    const phaseValidation = validatePhase(formData.phase);
    if (!phaseValidation.valid) { setError(phaseValidation.message); return; }

    if (formData.propertyType === 'apartment') {
      const buildingNameValidation = validateBuildingName(formData.buildingName);
      if (!buildingNameValidation.valid) { setError(buildingNameValidation.message); return; }

      const unitNumberValidation = validateUnitNumber(formData.unitNumber);
      if (!unitNumberValidation.valid) { setError(unitNumberValidation.message); return; }
    }

    const streetValidation = validateStreet(formData.street);
    if (!streetValidation.valid) { setError(streetValidation.message); return; }

    if (formData.occupancyType === 'renter') {
      const occupancyStartValidation = validateOccupancyStartDate(formData.occupancyStartDate);
      if (!occupancyStartValidation.valid) { setError(occupancyStartValidation.message); return; }

      const occupancyEndValidation = validateOccupancyEndDate(
        formData.occupancyStartDate,
        formData.occupancyEndDate
      );
      if (!occupancyEndValidation.valid) { setError(occupancyEndValidation.message); return; }
    }

    const phoneValidation = validatePhoneNumber(formData.phoneNumber);
    if (!phoneValidation.valid) { setError(phoneValidation.message); return; }

    if (familyMembers.length === 0) {
      setError('Please add at least one family member');
      return;
    }

    const primaryContactCount = familyMembers.filter((member) => member.isPrimaryContact).length;
    if (primaryContactCount !== 1) {
      setError('Please select exactly one primary household contact.');
      return;
    }

    const normalizedFamilyMembers = [];
    for (let index = 0; index < familyMembers.length; index += 1) {
      const member = familyMembers[index];
      const lastNameValidation = validateNameValue(member.lastName, `Family member ${index + 1} last name`, {
        minLength: 1,
        maxLength: 30
      });
      if (!lastNameValidation.valid) {
        setError(lastNameValidation.message);
        return;
      }

      const firstNameValidation = validateNameValue(member.firstName, `Family member ${index + 1} first name`, {
        minLength: 1,
        maxLength: 30
      });
      if (!firstNameValidation.valid) {
        setError(firstNameValidation.message);
        return;
      }

      const middleNameValidation = validateNameValue(member.middleName, `Family member ${index + 1} middle name`, {
        minLength: 1,
        maxLength: 30
      });
      if (!middleNameValidation.valid) {
        setError(middleNameValidation.message);
        return;
      }

      const isPrimaryContact = Boolean(member.isPrimaryContact);
      const normalizedRelationship = isPrimaryContact
        ? PRIMARY_CONTACT_RELATIONSHIP
        : String(member.relationship || '').trim();

      if (!normalizedRelationship) {
        setError(`Please select the relationship to the primary contact for family member ${index + 1}.`);
        return;
      }

      if (!isPrimaryContact && normalizedRelationship === PRIMARY_CONTACT_RELATIONSHIP) {
        setError(`Family member ${index + 1} cannot use "${PRIMARY_CONTACT_RELATIONSHIP}" unless selected as primary contact.`);
        return;
      }

      normalizedFamilyMembers.push({
        ...member,
        lastName: lastNameValidation.value,
        firstName: firstNameValidation.value,
        middleName: middleNameValidation.value,
        relationship: normalizedRelationship,
        isPrimaryContact
      });
    }

    if (vehicles.length > 0) {
      const incompleteVehicle = vehicles.find(
        (vehicle) =>
          !vehicle.plateNumber ||
          !vehicle.vehicleType ||
          !vehicle.brand ||
          !vehicle.model ||
          !vehicle.color
      );
      if (incompleteVehicle) {
        setError('Please fill in all vehicle fields or remove incomplete vehicles');
        return;
      }
    }

    if (!identificationFile) {
      setError('Please upload an identification document');
      return;
    }

    const identificationValidation = validatePdfOrImageFile(identificationFile, {
      label: 'Identification document',
      maxBytes: DOCUMENT_UPLOAD_MAX_BYTES
    });
    if (!identificationValidation.valid) {
      setError(identificationValidation.message);
      return;
    }

    for (let index = 0; index < vehicles.length; index += 1) {
      const vehiclePhoto = vehicles[index]?.photo;
      if (!vehiclePhoto || !(vehiclePhoto instanceof File)) continue;

      const vehiclePhotoValidation = validateImageFile(vehiclePhoto, {
        label: `Vehicle photo ${index + 1}`,
        maxBytes: IMAGE_UPLOAD_MAX_BYTES
      });
      if (!vehiclePhotoValidation.valid) {
        setError(vehiclePhotoValidation.message);
        return;
      }
    }

    setLoading(true);

    try {
      const formDataToSend = new FormData();
      const houseAddress = formData.propertyType === 'house'
        ? `Block ${formData.block}, Lot ${formData.lot}, Phase ${formData.phase}`
        : `Block ${formData.block}, Lot ${formData.lot}, Phase ${formData.phase}, ${String(formData.buildingName || '').trim()}, Unit ${String(formData.unitNumber || '').trim().toUpperCase()}`;

      formDataToSend.append('email', emailValidation.value);
      formDataToSend.append('emailVerificationToken', emailVerificationToken);
      formDataToSend.append('familyName', familyNameValidation.value);
      formDataToSend.append('username', formData.username);
      formDataToSend.append('password', formData.password);
      formDataToSend.append('propertyType', formData.propertyType);
      formDataToSend.append('occupancyType', formData.occupancyType);
      formDataToSend.append('block', formData.block);
      formDataToSend.append('lot', formData.lot);
      formDataToSend.append('phase', formData.phase);
      formDataToSend.append('buildingName', String(formData.buildingName || '').trim());
      formDataToSend.append('unitNumber', String(formData.unitNumber || '').trim().toUpperCase());
      formDataToSend.append('houseAddress', houseAddress);
      formDataToSend.append('street', formData.street);
      formDataToSend.append('occupancyStartDate', formData.occupancyStartDate || '');
      formDataToSend.append('occupancyEndDate', formData.occupancyEndDate || '');
      formDataToSend.append('phoneNumber', phoneValidation.value);
      formDataToSend.append('familyMembers', JSON.stringify(normalizedFamilyMembers));

      const vehiclesData = vehicles.map((vehicle) => ({
        plateNumber: vehicle.plateNumber,
        vehicleType: vehicle.vehicleType,
        brand: vehicle.brand,
        model: vehicle.model,
        color: vehicle.color
      }));
      formDataToSend.append('vehicles', JSON.stringify(vehiclesData));

      vehicles.forEach((vehicle, index) => {
        if (vehicle.photo && vehicle.photo instanceof File) {
          formDataToSend.append(`vehiclePhoto_${index}`, vehicle.photo);
        }
      });

      formDataToSend.append('identificationDocument', identificationFile);

      const response = await fetch(apiUrl('/auth/register'), {
        method: 'POST',
        body: formDataToSend
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.message || 'Registration failed');
        return;
      }

      onRegisterSuccess();
    } catch (err) {
      setError('Connection error. Please check if the server is running.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <RegisterForm
      showPassword={showPassword}
      setShowPassword={setShowPassword}
      showConfirmPassword={showConfirmPassword}
      setShowConfirmPassword={setShowConfirmPassword}
      formData={formData}
      setFormData={setFormData}
      handleEmailChange={handleEmailChange}
      familyMembers={familyMembers}
      setFamilyMembers={setFamilyMembers}
      vehicles={vehicles}
      setVehicles={setVehicles}
      identificationFile={identificationFile}
      setIdentificationFile={setIdentificationFile}
      emailVerificationCode={emailVerificationCode}
      setEmailVerificationCode={setEmailVerificationCode}
      emailVerificationStatus={emailVerificationStatus}
      sendingEmailOtp={sendingEmailOtp}
      verifyingEmailOtp={verifyingEmailOtp}
      emailOtpCooldown={emailOtpCooldown}
      isEmailVerified={isEmailVerified}
      handleSendEmailOtp={handleSendEmailOtp}
      handleVerifyEmailOtp={handleVerifyEmailOtp}
      error={error}
      setError={setError}
      loading={loading}
      handleRegister={handleRegister}
      onNavigateToLogin={onNavigateToLogin}
    />
  );
};

export default RegisterPage;
