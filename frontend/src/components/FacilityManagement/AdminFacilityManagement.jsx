import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock3,
  Eye,
  ImagePlus,
  Landmark,
  MapPin,
  Pencil,
  PhilippinePeso,
  PlusCircle,
  QrCode,
  Search,
  Trash2,
  Upload,
  Users,
  XCircle
} from 'lucide-react';
import { apiUrl, assetUrl } from '../../utils/api';
import './AdminFacilityManagement.css';
import PaginationControls from '../common/PaginationControls';
import { buildPaginatedUrl, parsePaginatedResponse } from '../../utils/pagination';
import {
  IMAGE_UPLOAD_MAX_BYTES,
  formatFileSize,
  validateImageFile
} from '../../utils/uploadValidation';

const formatDateTime = (value) => new Date(value).toLocaleString();

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

  const [facilityForm, setFacilityForm] = useState(emptyFacilityForm);
  const [facilitySaving, setFacilitySaving] = useState(false);
  const [facilityError, setFacilityError] = useState('');

  const facilities = useMemo(
    () => (Array.isArray(settings?.facilities) ? settings.facilities : []),
    [settings]
  );

  const fetchReservations = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(apiUrl(buildPaginatedUrl('/facilities/all', page)), {
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
  }, [page, token]);

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

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  useEffect(() => {
    if (activePanel !== 'reservations') {
      return undefined;
    }

    fetchReservations();
    const interval = setInterval(fetchReservations, 30000);
    return () => clearInterval(interval);
  }, [activePanel, fetchReservations]);

  useEffect(() => {
    if (facilityFilter !== 'all' && !facilities.some((facility) => facility._id === facilityFilter)) {
      setFacilityFilter('all');
    }
  }, [facilities, facilityFilter]);

  const resetFacilityForm = () => {
    setFacilityForm(emptyFacilityForm);
    setFacilityError('');
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
      name: facility.name || '',
      description: facility.description || '',
      hourlyRate: String(facility.hourlyRate ?? 0),
      mapX: String(facility.mapPosition?.x ?? 0),
      mapZ: String(facility.mapPosition?.z ?? 0),
      photoFile: null,
      currentPhoto: facility.photo || null
    });
    setFacilityError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleFacilitySubmit = async () => {
    const trimmedName = String(facilityForm.name || '').trim();

    if (trimmedName.length < 2) {
      setFacilityError('Facility name must be at least 2 characters.');
      return;
    }

    if (String(facilityForm.description || '').trim().length > 500) {
      setFacilityError('Facility description must not exceed 500 characters.');
      return;
    }

    if (Number(facilityForm.hourlyRate) < 0) {
      setFacilityError('Facility price must be 0 or higher.');
      return;
    }

    setFacilitySaving(true);
    setFacilityError('');

    const payload = new FormData();
    payload.append('name', trimmedName);
    payload.append('description', String(facilityForm.description || '').trim());
    payload.append('hourlyRate', String(Number(facilityForm.hourlyRate) || 0));
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
      resetFacilityForm();
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
        resetFacilityForm();
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
              <button type="button" className="facility-admin-inline-btn facility-admin-create-btn" onClick={resetFacilityForm}>
                <PlusCircle size={15} />
                New Facility
              </button>
            </div>
          </div>

          {facilities.length === 0 ? (
            <div className="facility-admin-empty-state">
              <Landmark size={38} />
              <h4>No facilities yet</h4>
              <p>Add the first facility from the editor panel to open reservations.</p>
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
                        {Number(facility.hourlyRate) > 0 ? `P${facility.hourlyRate}/hr` : 'Free'}
                      </span>
                    </div>

                    <div className="facility-admin-map-chip">
                      <MapPin size={13} />
                      <span>Map X {facility.mapPosition?.x ?? 0}, Z {facility.mapPosition?.z ?? 0}</span>
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

        <section className="facility-admin-editor-card">
          <div className="facility-admin-editor-head">
            <div>
              <h3>{facilityForm.id ? 'Edit Facility' : 'Add Facility'}</h3>
              <p>Set the name, hourly rate, description, and cover image. Use `0` to make a facility free.</p>
            </div>
            {facilityForm.id && (
              <button type="button" className="facility-admin-inline-btn" onClick={resetFacilityForm}>
                <XCircle size={15} />
                Cancel Edit
              </button>
            )}
          </div>

          {facilityError && <div className="facility-admin-form-error">{facilityError}</div>}

          <div className="facility-admin-editor-grid">
            <label className="facility-admin-field">
              <span>Facility Name</span>
              <input
                type="text"
                className="form-input"
                value={facilityForm.name}
                onChange={(event) => setFacilityForm((previous) => ({ ...previous, name: event.target.value }))}
                placeholder="Example: Clubhouse"
              />
            </label>

            <label className="facility-admin-field">
              <span>Hourly Price</span>
              <input
                type="number"
                min="0"
                step="0.01"
                className="form-input"
                value={facilityForm.hourlyRate}
                onChange={(event) => setFacilityForm((previous) => ({ ...previous, hourlyRate: event.target.value }))}
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

            <div className="facility-admin-map-fields facility-admin-field-span">
              <div className="facility-admin-map-head">
                <MapPin size={16} />
                <div>
                  <strong>3D Map Position</strong>
                  <span>Move the facility marker across the subdivision map.</span>
                </div>
              </div>

              <label className="facility-admin-range-field">
                <span>West / East</span>
                <input
                  type="range"
                  min="-4.85"
                  max="4.85"
                  step="0.05"
                  value={facilityForm.mapX}
                  onChange={(event) => setFacilityForm((previous) => ({ ...previous, mapX: event.target.value }))}
                />
                <strong>{Number(facilityForm.mapX || 0).toFixed(2)}</strong>
              </label>

              <label className="facility-admin-range-field">
                <span>North / South</span>
                <input
                  type="range"
                  min="-2.85"
                  max="2.85"
                  step="0.05"
                  value={facilityForm.mapZ}
                  onChange={(event) => setFacilityForm((previous) => ({ ...previous, mapZ: event.target.value }))}
                />
                <strong>{Number(facilityForm.mapZ || 0).toFixed(2)}</strong>
              </label>
            </div>

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

          <button type="button" className="upload-btn facility-admin-upload-btn" onClick={handleFacilitySubmit} disabled={facilitySaving}>
            {facilitySaving ? 'Saving...' : facilityForm.id ? 'Save Facility Changes' : 'Add Facility'}
          </button>
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
        </div>
      </div>

      {loading && reservations.length === 0 ? (
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
                        <p>{reservation.paymentRequired ? `P${reservation.totalAmount} (${reservation.hourlyRate}/hr)` : 'Free'}</p>
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

            <PaginationControls pagination={pagination} onPageChange={setPage} />
          </div>
        </>
      )}

      {viewingReceipt && (
        <div className="modal-overlay" onClick={() => setViewingReceipt(null)}>
          <div className="modal-content" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>{viewingReceipt.facility?.name || viewingReceipt.facilityName} Receipt</h3>
              <button onClick={() => setViewingReceipt(null)} className="modal-close">
                <XCircle size={24} />
              </button>
            </div>
            <div className="modal-body">
              {viewingReceipt.paymentReceipt.mimetype === 'application/pdf' ? (
                <iframe src={assetUrl(viewingReceipt.paymentReceipt.path)} className="receipt-pdf" title="Payment Receipt" />
              ) : (
                <img src={assetUrl(viewingReceipt.paymentReceipt.path)} alt="Payment Receipt" className="receipt-image" />
              )}
            </div>
          </div>
        </div>
      )}

      {viewingQr && settings?.gcashQr?.path && (
        <div className="modal-overlay" onClick={() => setViewingQr(false)}>
          <div className="modal-content" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>Facility GCash QR</h3>
              <button onClick={() => setViewingQr(false)} className="modal-close">
                <XCircle size={24} />
              </button>
            </div>
            <div className="modal-body">
              <img src={assetUrl(settings.gcashQr.path)} alt="Facility GCash QR" className="receipt-image" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminFacilityManagement;
