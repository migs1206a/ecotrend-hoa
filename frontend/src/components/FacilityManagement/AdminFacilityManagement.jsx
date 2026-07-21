import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock3,
  Eye,
  ImagePlus,
  LayoutGrid,
  Landmark,
  Pencil,
  PhilippinePeso,
  PlusCircle,
  QrCode,
  Search,
  Table2,
  Trash2,
  Upload,
  Users,
  XCircle
} from 'lucide-react';
import { apiUrl, assetUrl } from '../../utils/api';
import './AdminFacilityManagement.css';
import PaginationControls from '../common/PaginationControls';
import { buildPaginatedUrl, parsePaginatedResponse } from '../../utils/pagination';
import FacilityReservationCalendar from './FacilityReservationCalendar';
import FileViewerModal from '../common/FileViewerModal';
import {
  IMAGE_UPLOAD_MAX_BYTES,
  formatFileSize,
  validateImageFile
} from '../../utils/uploadValidation';

const formatDateTime = (value) => new Date(value).toLocaleString();
const getMonthRange = (date) => ({
  start: new Date(date.getFullYear(), date.getMonth(), 1),
  end: new Date(date.getFullYear(), date.getMonth() + 1, 1)
});
const getDateKey = (value) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

const emptyFacilityForm = {
  id: '',
  name: '',
  description: '',
  hourlyRate: '0',
  mapX: '0',
  mapZ: '0',
  photoFile: null,
  currentPhoto: null
};

const clampMapValue = (value, min, max) => Math.min(Math.max(Number(value) || 0, min), max);

const sanitizeFacilityNameInput = (value) =>
  String(value || '')
    .replace(/[^A-Za-z\s]/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trimStart();

const normalizeFacilityName = (value) =>
  sanitizeFacilityNameInput(value).trim().replace(/\s+/g, ' ');

const isValidFacilityName = (value) => /^[A-Za-z]+(?:\s+[A-Za-z]+)*$/.test(value);

const sanitizeHourlyRateInput = (value) => {
  const cleanValue = String(value || '').replace(/[^\d.]/g, '');
  const [wholePart, ...decimalParts] = cleanValue.split('.');
  const decimalPart = decimalParts.join('').slice(0, 2);

  if (!cleanValue.includes('.')) {
    return wholePart;
  }

  return `${wholePart || '0'}.${decimalPart}`;
};

const preventNegativePriceInput = (event) => {
  if (['-', '+', 'e', 'E'].includes(event.key)) {
    event.preventDefault();
  }
};

const AdminFacilityManagement = ({ token }) => {
  const [activePanel, setActivePanel] = useState('facilities');
  const [reservations, setReservations] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [facilityFilter, setFacilityFilter] = useState('all');
  const [qrFile, setQrFile] = useState(null);
  const [savingQr, setSavingQr] = useState(false);
  const [viewingReceipt, setViewingReceipt] = useState(null);
  const [viewingQr, setViewingQr] = useState(false);
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [reservationsViewMode, setReservationsViewMode] = useState('card');
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [calendarReservations, setCalendarReservations] = useState([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarSelectedDate, setCalendarSelectedDate] = useState(getDateKey(new Date()));

  const [facilityForm, setFacilityForm] = useState(emptyFacilityForm);
  const [facilitySaving, setFacilitySaving] = useState(false);
  const [facilityError, setFacilityError] = useState('');
  const [showFacilityModal, setShowFacilityModal] = useState(false);

  const facilities = useMemo(
    () => (Array.isArray(settings?.facilities) ? settings.facilities : []),
    [settings]
  );

  const fetchReservations = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(apiUrl(buildPaginatedUrl('/facilities/all', page, {
        search: searchQuery,
        status: statusFilter,
        facilityId: facilityFilter
      })), {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        const parsed = parsePaginatedResponse(data);
        setReservations(parsed.items);
        setPagination(parsed.pagination);
      }
    } catch (error) {
      console.error('Error fetching reservations:', error);
    }
    setLoading(false);
  }, [facilityFilter, page, searchQuery, statusFilter, token]);

  const fetchSettings = useCallback(async () => {
    try {
      const response = await fetch(apiUrl('/facilities/settings'), {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error('Error fetching facility settings:', error);
    }
  }, [token]);

  const fetchCalendarReservations = useCallback(async () => {
    const { start, end } = getMonthRange(calendarMonth);
    const calendarStatus = statusFilter === 'all' ? 'upcoming' : statusFilter;

    setCalendarLoading(true);

    try {
      const response = await fetch(apiUrl(`/facilities/calendar?${new URLSearchParams({
        start: start.toISOString(),
        end: end.toISOString(),
        status: calendarStatus,
        facilityId: facilityFilter || 'all'
      }).toString()}`), {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setCalendarReservations(Array.isArray(data) ? data : []);
      } else {
        setCalendarReservations([]);
      }
    } catch (error) {
      console.error('Error fetching reservation calendar:', error);
      setCalendarReservations([]);
    }

    setCalendarLoading(false);
  }, [calendarMonth, facilityFilter, statusFilter, token]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    if (activePanel !== 'reservations') {
      return undefined;
    }

    fetchReservations();
    fetchCalendarReservations();
    const interval = setInterval(() => {
      fetchReservations();
      fetchCalendarReservations();
    }, 30000);
    return () => clearInterval(interval);
  }, [activePanel, fetchCalendarReservations, fetchReservations]);

  useEffect(() => {
    if (activePanel !== 'reservations') {
      return;
    }

    fetchCalendarReservations();
  }, [activePanel, fetchCalendarReservations]);

  useEffect(() => {
    const selectedDate = new Date(`${calendarSelectedDate}T00:00:00`);

    if (
      !calendarSelectedDate ||
      Number.isNaN(selectedDate.getTime()) ||
      selectedDate.getMonth() !== calendarMonth.getMonth() ||
      selectedDate.getFullYear() !== calendarMonth.getFullYear()
    ) {
      setCalendarSelectedDate(getDateKey(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1)));
    }
  }, [calendarMonth, calendarSelectedDate]);

  useEffect(() => {
    if (facilityFilter !== 'all' && !facilities.some((facility) => facility._id === facilityFilter)) {
      setFacilityFilter('all');
    }
  }, [facilities, facilityFilter]);

  useEffect(() => {
    if (activePanel === 'reservations') {
      setPage(1);
    }
  }, [activePanel, facilityFilter, searchQuery, statusFilter]);

  const resetFacilityForm = () => {
    setFacilityForm(emptyFacilityForm);
    setFacilityError('');
  };

  const closeFacilityModal = () => {
    setShowFacilityModal(false);
    resetFacilityForm();
  };

  const openCreateFacilityModal = () => {
    resetFacilityForm();
    setShowFacilityModal(true);
  };

  const openReservationsPanel = () => {
    setActivePanel('reservations');
  };

  const runAction = async (path, options = {}, successMessage) => {
    try {
      const response = await fetch(apiUrl(path), {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(options.headers || {})
        }
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        window.alert(data.message || 'Request failed');
        return false;
      }

      if (successMessage) window.alert(successMessage);
      fetchReservations();
      return true;
    } catch (error) {
      console.error('Facility action failed:', error);
      window.alert('Request failed');
      return false;
    }
  };

  const handleVerifyPayment = async (reservationId) => {
    if (!window.confirm('Verify this uploaded receipt?')) return;
    await runAction(`/facilities/${reservationId}/verify-payment`, { method: 'PATCH' }, 'Receipt verified successfully.');
  };

  const handleApprove = async (reservationId) => {
    if (!window.confirm('Approve this reservation?')) return;
    await runAction(`/facilities/${reservationId}/approve`, { method: 'PATCH' }, 'Reservation approved successfully.');
  };

  const handleReject = async (reservationId) => {
    if (!rejectReason.trim()) {
      window.alert('Please provide a rejection reason.');
      return;
    }

    const success = await runAction(
      `/facilities/${reservationId}/reject`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: rejectReason.trim() })
      },
      'Reservation rejected.'
    );

    if (success) {
      setRejectingId(null);
      setRejectReason('');
    }
  };

  const handleExpireOld = async () => {
    if (!window.confirm('Expire all pending reservations that are already past their 12-hour hold?')) return;
    await runAction('/facilities/expire-old', { method: 'POST' }, 'Expired old pending reservations.');
  };

  const handleQrFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    if (!file) {
      setQrFile(null);
      return;
    }

    const validation = validateImageFile(file, {
      label: 'Facility QR image',
      maxBytes: IMAGE_UPLOAD_MAX_BYTES
    });

    if (!validation.valid) {
      window.alert(validation.message);
      event.target.value = '';
      return;
    }

    setQrFile(file);
  };

  const handleQrUpload = async () => {
    if (!qrFile) {
      window.alert('Please choose a QR image first.');
      return;
    }

    setSavingQr(true);
    const payload = new FormData();
    payload.append('gcashQr', qrFile);
    
    try {
      const response = await fetch(apiUrl('/facilities/settings/gcash-qr'), {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
        body: payload
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        window.alert(data.message || 'Failed to update GCash QR.');
        return;
      }

      window.alert('Facility GCash QR updated successfully.');
      setQrFile(null);
      fetchSettings();
    } catch (error) {
      console.error('Error updating GCash QR:', error);
      window.alert('Failed to update GCash QR.');
    }

    setSavingQr(false);
  };

  const handleFacilityPhotoChange = (event) => {
    const file = event.target.files?.[0] || null;

    if (!file) {
      setFacilityForm((previous) => ({ ...previous, photoFile: null }));
      return;
    }

    const validation = validateImageFile(file, {
      label: 'Facility photo',
      maxBytes: IMAGE_UPLOAD_MAX_BYTES
    });

    if (!validation.valid) {
      setFacilityError(validation.message);
      event.target.value = '';
      return;
    }

    setFacilityError('');
    setFacilityForm((previous) => ({ ...previous, photoFile: file }));
  };

  const startEditFacility = (facility) => {
    setFacilityForm({
      id: facility._id,
      name: sanitizeFacilityNameInput(facility.name || ''),
      description: facility.description || '',
      hourlyRate: String(facility.hourlyRate ?? 0),
      mapX: String(facility.mapPosition?.x ?? 0),
      mapZ: String(facility.mapPosition?.z ?? 0),
      photoFile: null,
      currentPhoto: facility.photo || null
    });
    setFacilityError('');
    setShowFacilityModal(true);
  };

  const handleFacilitySubmit = async () => {
    const trimmedName = normalizeFacilityName(facilityForm.name);
    const hourlyRate = Number(facilityForm.hourlyRate || 0);

    if (trimmedName.length < 2) {
      setFacilityError('Facility name must be at least 2 characters.');
      return;
    }

    if (!isValidFacilityName(trimmedName)) {
      setFacilityError('Facility name can only contain letters and spaces.');
      return;
    }

    if (String(facilityForm.description || '').trim().length > 500) {
      setFacilityError('Facility description must not exceed 500 characters.');
      return;
    }

    if (!Number.isFinite(hourlyRate) || hourlyRate < 0) {
      setFacilityError('Facility price must be 0 or higher.');
      return;
    }

    setFacilitySaving(true);
    setFacilityError('');

    const payload = new FormData();
    payload.append('name', trimmedName);
    payload.append('description', String(facilityForm.description || '').trim());
    payload.append('hourlyRate', String(hourlyRate || 0));
    payload.append('mapX', String(clampMapValue(facilityForm.mapX, -4.85, 4.85)));
    payload.append('mapZ', String(clampMapValue(facilityForm.mapZ, -2.85, 2.85)));
    if (facilityForm.photoFile) {
      payload.append('photo', facilityForm.photoFile);
    }

    try {
      const isEditing = Boolean(facilityForm.id);
      const response = await fetch(
        apiUrl(
          isEditing
            ? `/facilities/settings/facilities/${facilityForm.id}`
            : '/facilities/settings/facilities'
        ),
        {
          method: isEditing ? 'PUT' : 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: payload
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || 'Failed to save facility.');
      }

      window.alert(isEditing ? 'Facility updated successfully.' : 'Facility created successfully.');
      closeFacilityModal();
      fetchSettings();
    } catch (error) {
      setFacilityError(error.message || 'Failed to save facility.');
    } finally {
      setFacilitySaving(false);
    }
  };

  const handleFacilityDelete = async (facility) => {
    if (!window.confirm(`Delete ${facility.name}?`)) {
      return;
    }

    try {
      const response = await fetch(apiUrl(`/facilities/settings/facilities/${facility._id}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.message || 'Failed to delete facility.');
      }

      window.alert('Facility deleted successfully.');

      if (facilityForm.id === facility._id) {
        closeFacilityModal();
      }

      fetchSettings();
    } catch (error) {
      window.alert(error.message || 'Failed to delete facility.');
    }
  };

  const getStatusMeta = (status) => {
    const map = {
      pending: { icon: Clock3, label: 'Pending', className: 'facility-admin-status pending' },
      approved: { icon: CheckCircle2, label: 'Approved', className: 'facility-admin-status approved' },
      rejected: { icon: XCircle, label: 'Rejected', className: 'facility-admin-status rejected' },
      expired: { icon: AlertCircle, label: 'Expired', className: 'facility-admin-status expired' }
    };
    return map[status] || map.pending;
  };

  const getPaymentMeta = (reservation) => {
    if (!reservation.paymentRequired) {
      return { label: 'Free Reservation', className: 'facility-admin-payment free' };
    }

    if (reservation.paymentStatus === 'verified' || reservation.isPaid) {
      return { label: 'Receipt Verified', className: 'facility-admin-payment verified' };
    }

    if (reservation.paymentStatus === 'pending') {
      return { label: 'Receipt Pending Verification', className: 'facility-admin-payment pending' };
    }

    if (reservation.paymentStatus === 'rejected') {
      return { label: 'Receipt Rejected', className: 'facility-admin-payment rejected' };
    }

    return { label: 'Awaiting Receipt', className: 'facility-admin-payment waiting' };
  };

  const filteredReservations = useMemo(
    () =>
      reservations.filter((reservation) => {
        const query = searchQuery.trim().toLowerCase();
        const facilityName = reservation.facility?.name || reservation.facilityName;
        const facilityId = reservation.facility?._id || reservation.facilityId;
        const matchesSearch =
          !query ||
          reservation.residentName?.toLowerCase().includes(query) ||
          facilityName?.toLowerCase().includes(query) ||
          reservation.eventType?.toLowerCase().includes(query) ||
          reservation.purpose?.toLowerCase().includes(query);

        const matchesStatus = statusFilter === 'all' || reservation.status === statusFilter;
        const matchesFacility = facilityFilter === 'all' || facilityId === facilityFilter;
        return matchesSearch && matchesStatus && matchesFacility;
      }),
    [facilityFilter, reservations, searchQuery, statusFilter]
  );

  const calendarFilteredReservations = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return calendarReservations.filter((reservation) => {
      if (!query) {
        return true;
      }

      const facilityName = reservation.facility?.name || reservation.facilityName || '';

      return [
        reservation.residentName,
        reservation.residentAddress,
        facilityName,
        reservation.eventType,
        reservation.purpose
      ].some((value) => String(value || '').toLowerCase().includes(query));
    });
  }, [calendarReservations, searchQuery]);

  const reservationStats = useMemo(
    () => ({
      total: reservations.length,
      pending: reservations.filter((reservation) => reservation.status === 'pending').length,
      paymentReview: reservations.filter(
        (reservation) => reservation.paymentRequired && reservation.paymentStatus === 'pending'
      ).length,
      approved: reservations.filter((reservation) => reservation.status === 'approved').length
    }),
    [reservations]
  );

  const facilityStats = useMemo(
    () => ({
      total: facilities.length,
      paid: facilities.filter((facility) => Number(facility.hourlyRate) > 0).length,
      free: facilities.filter((facility) => Number(facility.hourlyRate) <= 0).length
    }),
    [facilities]
  );

  const isReservationsView = activePanel === 'reservations';
  const renderFacilityPortal = (content) => (
    typeof document !== 'undefined' ? createPortal(content, document.body) : null
  );

  return (
    <div className="facility-admin-shell">
      <div className="page-header facility-admin-page-header">
        <div className="page-title">
          <h2>Facility Management</h2>
          <p>Keep the facility catalog clean, then open resident reservations only when it is time to review bookings.</p>
        </div>
        <div className="facility-admin-header-actions">
          <div className="facility-admin-view-switch" role="tablist" aria-label="Facility admin views">
            <button
              type="button"
              className={`facility-admin-view-btn ${!isReservationsView ? 'active' : ''}`}
              onClick={() => setActivePanel('facilities')}
            >
              Facilities
            </button>
            <button
              type="button"
              className={`facility-admin-view-btn ${isReservationsView ? 'active' : ''}`}
              onClick={openReservationsPanel}
            >
              Reservations
            </button>
          </div>

          {isReservationsView && (
            <button onClick={handleExpireOld} className="action-btn facility-action-btn">
              <Clock3 size={18} />
              Expire Old Requests
            </button>
          )}
        </div>
      </div>

      {!isReservationsView ? (
        <>
          <div className="facility-admin-management-grid">
        <section className="facility-admin-library-card">
          <div className="facility-admin-library-head">
            <div>
              <span className="facility-admin-kicker">Facility Library</span>
              <h3>Current reservable facilities</h3>
              <p>Photos, descriptions, and rates update the resident reservation view automatically.</p>
            </div>
            <div className="facility-admin-library-head-side">
              <div className="facility-admin-mini-stats">
                <div>
                  <strong>{facilityStats.total}</strong>
                  <span>Total</span>
                </div>
                <div>
                  <strong>{facilityStats.paid}</strong>
                  <span>Paid</span>
                </div>
                <div>
                  <strong>{facilityStats.free}</strong>
                  <span>Free</span>
                </div>
              </div>
              <button type="button" className="facility-admin-inline-btn facility-admin-create-btn" onClick={openCreateFacilityModal}>
                <PlusCircle size={15} />
                Add Facility
              </button>
            </div>
          </div>

          {facilities.length === 0 ? (
            <div className="facility-admin-empty-state">
              <Landmark size={38} />
              <h4>No facilities yet</h4>
              <p>Use the Add Facility button to publish the first reservable space.</p>
            </div>
          ) : (
            <div className="facility-admin-library-grid">
              {facilities.map((facility) => (
                <article key={facility._id} className="facility-admin-library-item">
                  <div className="facility-admin-library-image-wrap">
                    {facility.photo?.path ? (
                      <img src={assetUrl(facility.photo.path)} alt={facility.name} className="facility-admin-library-image" />
                    ) : (
                      <div className="facility-admin-library-placeholder">
                        <ImagePlus size={22} />
                        <span>No photo</span>
                      </div>
                    )}
                  </div>

                  <div className="facility-admin-library-copy">
                    <div className="facility-admin-library-title">
                      <div>
                        <h4>{facility.name}</h4>
                        <p>{facility.description || 'No description added yet.'}</p>
                      </div>
                      <span className={`facility-admin-rate-pill ${Number(facility.hourlyRate) > 0 ? 'paid' : 'free'}`}>
                        {Number(facility.hourlyRate) > 0 ? `₱${facility.hourlyRate}/hr` : 'Free'}
                      </span>
                    </div>

                    <div className="facility-admin-library-actions">
                      <button type="button" className="facility-admin-inline-btn" onClick={() => startEditFacility(facility)}>
                        <Pencil size={15} />
                        Edit
                      </button>
                      <button type="button" className="facility-admin-inline-btn danger" onClick={() => handleFacilityDelete(facility)}>
                        <Trash2 size={15} />
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="facility-admin-overview">
        <div className="facility-admin-summary-card">
          <div className="facility-admin-summary-copy">
            <span className="facility-admin-kicker">Reservation Control Center</span>
            <h3>Keep setup work separate from resident booking reviews</h3>
            <p>Residents can reserve any configured facility while admins review proof of payment and approve schedules with live status tracking.</p>
          </div>
          <div className="facility-admin-summary-actions">
            <button type="button" className="upload-btn facility-admin-upload-btn facility-admin-summary-btn" onClick={openReservationsPanel}>
              <Calendar size={16} />
              Open Resident Reservations
            </button>
            <span className="facility-admin-summary-note">
              {reservationStats.pending} pending review{reservationStats.pending === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        <div className="facility-admin-qr-card">
          <div className="facility-admin-qr-head">
            <h3><QrCode size={18} /> Facility GCash QR</h3>
            <p>Residents will use this QR for paid facility reservations.</p>
          </div>

          {settings?.gcashQr?.path ? (
            <button
              type="button"
              className="facility-admin-qr-preview-btn"
              onClick={() => {
                if (!settings?.gcashQr?.path) {
                  window.alert('No facility QR uploaded yet.');
                  return;
                }
                setViewingQr(true);
              }}
            >
              <QrCode size={16} />
              View Current QR
            </button>
          ) : (
            <div className="facility-admin-empty-qr">
              <AlertCircle size={18} />
              <span>No facility QR uploaded yet.</span>
            </div>
          )}

          <div className="facility-admin-upload-box">
            <label className="file-label facility-admin-file-label">
              <Upload size={16} />
              {qrFile?.name || `Choose New QR Image (max ${formatFileSize(IMAGE_UPLOAD_MAX_BYTES)})`}
              <input
                type="file"
                accept="image/*"
                className="file-input"
                onChange={handleQrFileChange}
              />
            </label>
            <button onClick={handleQrUpload} className="upload-btn facility-admin-upload-btn" disabled={savingQr}>
              {savingQr ? 'Saving...' : 'Update QR'}
            </button>
          </div>
        </div>
      </div>
        </>
      ) : (
        <>
          <div className="facility-admin-reservations-shell">
            <div className="facility-admin-reservations-head">
              <div>
                <span className="facility-admin-kicker">Resident Reservations</span>
                <h3>Bookings made by residents</h3>
                <p>Review schedules, receipts, and approvals in a focused queue without the facility editor crowding the page.</p>
              </div>
              <button type="button" className="facility-admin-inline-btn" onClick={() => setActivePanel('facilities')}>
                <Landmark size={15} />
                Back to Facilities
              </button>
            </div>

            <div className="stats-grid facility-admin-stats-grid">
        <div className="stat-card facility-admin-stat-card blue">
          <div className="stat-card-content">
            <div className="stat-info">
              <p>Total Reservations</p>
              <h3>{reservationStats.total}</h3>
            </div>
            <div className="stat-icon bg-blue-50">
              <Calendar className="text-blue-600" size={24} />
            </div>
          </div>
        </div>

        <div className="stat-card facility-admin-stat-card gold">
          <div className="stat-card-content">
            <div className="stat-info">
              <p>Pending Review</p>
              <h3>{reservationStats.pending}</h3>
            </div>
            <div className="stat-icon bg-yellow-50">
              <Clock3 className="text-yellow-600" size={24} />
            </div>
          </div>
        </div>

        <div className="stat-card facility-admin-stat-card orange">
          <div className="stat-card-content">
            <div className="stat-info">
              <p>Receipt Checks</p>
              <h3>{reservationStats.paymentReview}</h3>
            </div>
            <div className="stat-icon bg-orange-50">
              <PhilippinePeso className="text-orange-600" size={24} />
            </div>
          </div>
        </div>

        <div className="stat-card facility-admin-stat-card green">
          <div className="stat-card-content">
            <div className="stat-info">
              <p>Approved</p>
              <h3>{reservationStats.approved}</h3>
            </div>
            <div className="stat-icon bg-green-50">
              <CheckCircle2 className="text-green-600" size={24} />
            </div>
          </div>
        </div>
      </div>

      <div className="facility-admin-filter-card">
        <div className="facility-admin-search">
          <Search size={18} />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by resident, facility, event, or purpose..."
          />
        </div>

        <div className="facility-admin-filter-row">
          <select value={facilityFilter} onChange={(event) => setFacilityFilter(event.target.value)} className="form-input">
            <option value="all">All Facilities</option>
            {facilities.map((facility) => (
              <option key={facility._id} value={facility._id}>{facility.name}</option>
            ))}
          </select>

          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="form-input">
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="expired">Expired</option>
          </select>
          <div className="module-view-toggle">
            <button type="button" className={`module-view-toggle__btn ${reservationsViewMode === 'card' ? 'active' : ''}`} onClick={() => setReservationsViewMode('card')}>
              <LayoutGrid size={16} />
              <span>Cards</span>
            </button>
            <button type="button" className={`module-view-toggle__btn ${reservationsViewMode === 'table' ? 'active' : ''}`} onClick={() => setReservationsViewMode('table')}>
              <Table2 size={16} />
              <span>Table</span>
            </button>
            <button type="button" className={`module-view-toggle__btn ${reservationsViewMode === 'calendar' ? 'active' : ''}`} onClick={() => setReservationsViewMode('calendar')}>
              <Calendar size={16} />
              <span>Calendar</span>
            </button>
          </div>
        </div>
      </div>

      {reservationsViewMode === 'calendar' ? (
        <FacilityReservationCalendar
          events={calendarFilteredReservations}
          loading={calendarLoading}
          monthDate={calendarMonth}
          onMonthChange={setCalendarMonth}
          selectedDateKey={calendarSelectedDate}
          onDateSelect={setCalendarSelectedDate}
          showResidentDetails
          title="Active Booking Calendar"
          description="Pending and approved reservations stay visible here so admins can spot crowding and prevent accidental double-booking."
          emptyDayCopy="No active reservations are scheduled for this day."
        />
      ) : loading && reservations.length === 0 ? (
        <div className="loading-state">
          <div className="spinner" />
          <p>Loading facility reservations...</p>
        </div>
      ) : filteredReservations.length === 0 ? (
        <div className="empty-state facility-admin-empty-state">
          <Landmark size={46} />
          <h3>No Reservations Found</h3>
          <p>{searchQuery || statusFilter !== 'all' || facilityFilter !== 'all' ? 'Try adjusting the search or filters.' : 'Facility reservations will show up here once residents start booking.'}</p>
        </div>
      ) : reservationsViewMode === 'table' ? (
        <div className="module-table-card">
          <div className="module-table-wrap">
            <table className="module-table">
              <thead>
                <tr>
                  <th>Facility</th>
                  <th>Resident</th>
                  <th>Schedule</th>
                  <th>Guests / Purpose</th>
                  <th>Payment</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredReservations.map((reservation) => {
                  const statusMeta = getStatusMeta(reservation.status);
                  const paymentMeta = getPaymentMeta(reservation);
                  const canApprove = reservation.status === 'pending' && (!reservation.paymentRequired || reservation.isPaid);
                  const canVerify = reservation.status === 'pending' && reservation.paymentRequired && reservation.paymentStatus === 'pending';
                  const facilityName = reservation.facility?.name || reservation.facilityName;

                  return (
                    <tr key={reservation._id}>
                      <td>
                        <span className="module-table__primary">{facilityName}</span>
                        <span className="module-table__secondary">{reservation.eventType}</span>
                      </td>
                      <td>
                        <span className="module-table__primary">{reservation.residentName}</span>
                        <span className="module-table__secondary">{reservation.residentAddress}</span>
                      </td>
                      <td>
                        <span className="module-table__primary">{formatDateTime(reservation.dateReserved)}</span>
                        <span className="module-table__secondary">{reservation.durationHours} hour{reservation.durationHours > 1 ? 's' : ''}</span>
                      </td>
                      <td>
                        <span className="module-table__primary">{reservation.numberOfGuests || 0} guest(s)</span>
                        <span className="module-table__notes">{reservation.purpose}</span>
                      </td>
                      <td>
                        <span className="module-table__primary">{paymentMeta.label}</span>
                        <span className="module-table__secondary">
                          {reservation.paymentRequired ? `PHP ${reservation.totalAmount} (${reservation.hourlyRate}/hr)` : 'No payment required'}
                        </span>
                      </td>
                      <td>
                        <span className={`module-table__pill ${reservation.status === 'approved' ? 'success' : reservation.status === 'rejected' || reservation.status === 'expired' ? 'danger' : 'pending'}`}>
                          {statusMeta.label}
                        </span>
                      </td>
                      <td>
                        <div className="module-table__actions">
                          {reservation.paymentReceipt?.path && (
                            <button type="button" className="module-table__action-btn secondary" onClick={() => setViewingReceipt(reservation)}>
                              <Eye size={14} /> Receipt
                            </button>
                          )}
                          {canVerify && (
                            <button type="button" className="module-table__action-btn info" onClick={() => handleVerifyPayment(reservation._id)}>
                              Verify
                            </button>
                          )}
                          {canApprove && (
                            <button type="button" className="module-table__action-btn success" onClick={() => handleApprove(reservation._id)}>
                              Approve
                            </button>
                          )}
                          {reservation.status === 'pending' && (
                            <button
                              type="button"
                              className="module-table__action-btn danger"
                              onClick={() => {
                                setReservationsViewMode('card');
                                setRejectingId(reservation._id);
                              }}
                            >
                              Reject
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="facility-admin-grid">
          {filteredReservations.map((reservation) => {
            const statusMeta = getStatusMeta(reservation.status);
            const paymentMeta = getPaymentMeta(reservation);
            const StatusIcon = statusMeta.icon;
            const canApprove = reservation.status === 'pending' && (!reservation.paymentRequired || reservation.isPaid);
            const canVerify = reservation.status === 'pending' && reservation.paymentRequired && reservation.paymentStatus === 'pending';
            const facilityName = reservation.facility?.name || reservation.facilityName;

            return (
              <article key={reservation._id} className="facility-admin-card">
                {reservation.facility?.photo?.path && (
                  <div className="facility-admin-reservation-photo-wrap">
                    <img src={assetUrl(reservation.facility.photo.path)} alt={facilityName} className="facility-admin-reservation-photo" />
                  </div>
                )}

                <div className="facility-admin-card-top">
                  <div>
                    <h4>{facilityName}</h4>
                    <p>{reservation.eventType}</p>
                  </div>
                  <span className={statusMeta.className}>
                    <StatusIcon size={14} />
                    {statusMeta.label}
                  </span>
                </div>

                <div className="facility-admin-card-body">
                  <div className="facility-admin-user-strip">
                    <div>
                      <strong>{reservation.residentName}</strong>
                      <span>{reservation.residentAddress}</span>
                    </div>
                  </div>

                  <div className="facility-admin-details-grid">
                    <div className="facility-admin-detail">
                      <Calendar size={16} />
                      <div>
                        <strong>Schedule</strong>
                        <p>{formatDateTime(reservation.dateReserved)}</p>
                      </div>
                    </div>

                    <div className="facility-admin-detail">
                      <Clock3 size={16} />
                      <div>
                        <strong>Duration</strong>
                        <p>{reservation.durationHours} hour{reservation.durationHours > 1 ? 's' : ''}</p>
                      </div>
                    </div>

                    <div className="facility-admin-detail">
                      <Users size={16} />
                      <div>
                        <strong>Guests</strong>
                        <p>{reservation.numberOfGuests || 0}</p>
                      </div>
                    </div>

                    <div className="facility-admin-detail">
                      <PhilippinePeso size={16} />
                      <div>
                        <strong>Charge</strong>
                        <p>{reservation.paymentRequired ? `₱${reservation.totalAmount} (${reservation.hourlyRate}/hr)` : 'Free'}</p>
                      </div>
                    </div>
                  </div>

                  {reservation.facility?.description && (
                    <div className="facility-admin-purpose-box">
                      <strong>Facility Description</strong>
                      <p>{reservation.facility.description}</p>
                    </div>
                  )}

                  <div className="facility-admin-purpose-box">
                    <strong>Purpose / Notes</strong>
                    <p>{reservation.purpose}</p>
                  </div>

                  <div className={paymentMeta.className}>
                    <div>
                      <strong>{paymentMeta.label}</strong>
                      <p>{reservation.paymentRequired ? 'Paid reservation flow' : 'No payment required for this facility'}</p>
                    </div>
                  </div>

                  {reservation.paymentReceipt?.path && (
                    <button type="button" className="view-receipt-btn" onClick={() => setViewingReceipt(reservation)}>
                      <Eye size={16} />
                      View Receipt
                    </button>
                  )}

                  {canVerify && (
                    <button type="button" className="upload-btn facility-admin-upload-btn" onClick={() => handleVerifyPayment(reservation._id)}>
                      Verify Receipt
                    </button>
                  )}

                  {canApprove && (
                    <button type="button" className="upload-btn facility-admin-upload-btn" onClick={() => handleApprove(reservation._id)}>
                      Approve Reservation
                    </button>
                  )}

                  {reservation.status === 'pending' && (
                    <div className="facility-admin-reject-wrap">
                      {rejectingId === reservation._id ? (
                        <>
                          <textarea
                            className="form-textarea"
                            rows="3"
                            value={rejectReason}
                            onChange={(event) => setRejectReason(event.target.value)}
                            placeholder="Add a rejection reason..."
                          />
                          <div className="facility-admin-inline-actions">
                            <button type="button" className="facility-admin-inline-btn danger" onClick={() => handleReject(reservation._id)}>
                              Reject Reservation
                            </button>
                            <button type="button" className="facility-admin-inline-btn" onClick={() => { setRejectingId(null); setRejectReason(''); }}>
                              Cancel
                            </button>
                          </div>
                        </>
                      ) : (
                        <button type="button" className="facility-admin-inline-btn danger" onClick={() => setRejectingId(reservation._id)}>
                          Reject Reservation
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

            {reservationsViewMode !== 'calendar' && (
              <PaginationControls pagination={pagination} onPageChange={setPage} />
            )}
          </div>
        </>
      )}

      {viewingReceipt && renderFacilityPortal(
        <FileViewerModal
          title={`${viewingReceipt.facility?.name || viewingReceipt.facilityName} Receipt`}
          subtitle={viewingReceipt.paymentReceipt.originalName || 'Payment receipt'}
          fileUrl={assetUrl(viewingReceipt.paymentReceipt.path)}
          downloadUrl={assetUrl(viewingReceipt.paymentReceipt.path)}
          downloadName={viewingReceipt.paymentReceipt.originalName || `${viewingReceipt.facility?.name || viewingReceipt.facilityName}-receipt`}
          isPdf={viewingReceipt.paymentReceipt.mimetype === 'application/pdf'}
          onClose={() => setViewingReceipt(null)}
        />
      )}

      {viewingQr && settings?.gcashQr?.path && renderFacilityPortal(
        <FileViewerModal
          title="Facility GCash QR"
          subtitle={settings.gcashQr.originalName || 'Facility payment QR'}
          fileUrl={assetUrl(settings.gcashQr.path)}
          downloadUrl={assetUrl(settings.gcashQr.path)}
          downloadName={settings.gcashQr.originalName || 'facility-gcash-qr'}
          onClose={() => setViewingQr(false)}
        />
      )}

      {showFacilityModal && renderFacilityPortal(
        <div className="modal-overlay" onClick={closeFacilityModal}>
          <div className="modal-content facility-admin-facility-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div className="facility-admin-facility-modal-copy">
                <h3>{facilityForm.id ? 'Edit Facility' : 'Add Facility'}</h3>
                <p>Set the name, hourly rate, description, and cover image. Use `0` to make a facility free.</p>
              </div>
              <button onClick={closeFacilityModal} className="modal-close">
                <XCircle size={24} />
              </button>
            </div>

            <div className="facility-admin-facility-modal-body">
              {facilityError && <div className="facility-admin-form-error">{facilityError}</div>}

              <div className="facility-admin-editor-grid">
                <label className="facility-admin-field">
                  <span>Facility Name</span>
                  <input
                    type="text"
                    className="form-input"
                    maxLength="80"
                    pattern="[A-Za-z ]*"
                    value={facilityForm.name}
                    onChange={(event) => setFacilityForm((previous) => ({ ...previous, name: sanitizeFacilityNameInput(event.target.value) }))}
                    placeholder="Example: Clubhouse"
                  />
                </label>

                <label className="facility-admin-field">
                  <span>Hourly Price</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    className="form-input"
                    value={facilityForm.hourlyRate}
                    onKeyDown={preventNegativePriceInput}
                    onChange={(event) => setFacilityForm((previous) => ({ ...previous, hourlyRate: sanitizeHourlyRateInput(event.target.value) }))}
                    placeholder="0"
                  />
                </label>

                <label className="facility-admin-field facility-admin-field-span">
                  <span>Description</span>
                  <textarea
                    className="form-textarea"
                    rows="4"
                    value={facilityForm.description}
                    onChange={(event) => setFacilityForm((previous) => ({ ...previous, description: event.target.value }))}
                    placeholder="Share what the facility is used for, house rules, or setup notes."
                  />
                </label>

                <div className="facility-admin-photo-panel">
                  <div className="facility-admin-photo-preview">
                    {facilityForm.photoFile ? (
                      <div className="facility-admin-photo-note">
                        <ImagePlus size={18} />
                        <span>{facilityForm.photoFile.name}</span>
                      </div>
                    ) : facilityForm.currentPhoto?.path ? (
                      <img src={assetUrl(facilityForm.currentPhoto.path)} alt="Current facility" className="facility-admin-photo-current" />
                    ) : (
                      <div className="facility-admin-library-placeholder">
                        <ImagePlus size={22} />
                        <span>No photo selected</span>
                      </div>
                    )}
                  </div>

                  <label className="file-label facility-admin-file-label">
                    <Upload size={16} />
                    {facilityForm.photoFile?.name || `Choose Facility Photo (max ${formatFileSize(IMAGE_UPLOAD_MAX_BYTES)})`}
                    <input
                      type="file"
                      accept="image/*"
                      className="file-input"
                      onChange={handleFacilityPhotoChange}
                    />
                  </label>
                </div>
              </div>

              <div className="facility-admin-editor-actions">
                <button type="button" className="facility-admin-inline-btn" onClick={closeFacilityModal}>
                  Cancel
                </button>
                <button type="button" className="upload-btn facility-admin-upload-btn" onClick={handleFacilitySubmit} disabled={facilitySaving}>
                  {facilitySaving ? 'Saving...' : facilityForm.id ? 'Save Facility Changes' : 'Add Facility'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminFacilityManagement;
