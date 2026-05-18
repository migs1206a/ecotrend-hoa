import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import {
  Calendar, Clock3, CheckCircle2, XCircle, Upload,
  Eye, AlertCircle, Landmark, Ticket, Users, QrCode, Building2, LayoutGrid, Table2, Copy
} from 'lucide-react';
import './ResidentFacilityReservation.css';
import { apiUrl, assetUrl } from '../../utils/api';
import PaginationControls from '../common/PaginationControls';
import { buildPaginatedUrl, parsePaginatedResponse } from '../../utils/pagination';
import FacilityReservationCalendar from './FacilityReservationCalendar';
import {
  FACILITY_GUEST_QR_PAYLOAD_PREFIX,
  formatFacilityGuestQrAccessCode,
  getFacilityGuestQrAccessCode,
  getFacilityGuestQrMeta,
  hasFacilityGuestQr
} from './facilityGuestQr';
import {
  DOCUMENT_UPLOAD_MAX_BYTES,
  formatFileSize,
  validatePdfOrImageFile
} from '../../utils/uploadValidation';

const formatDateTimeLocal = (value) => new Date(value).toLocaleString();
const getLocalDateTimeInputValue = (date = new Date()) => {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
};
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

const FacilityGuestQrModal = ({ reservation, onClose, onCopyCode }) => {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const guestQr = getFacilityGuestQrMeta(reservation);
  const accessCode = getFacilityGuestQrAccessCode(reservation);
  const recentEvents = Array.isArray(guestQr.scanEvents)
    ? [...guestQr.scanEvents].slice(-6).reverse()
    : [];

  useEffect(() => {
    let cancelled = false;

    const buildQr = async () => {
      if (!guestQr.enabled || !guestQr.token) {
        setQrDataUrl('');
        return;
      }

      const dataUrl = await QRCode.toDataURL(`${FACILITY_GUEST_QR_PAYLOAD_PREFIX}${guestQr.token}`, {
        width: 240,
        margin: 1,
        errorCorrectionLevel: 'M'
      });

      if (!cancelled) {
        setQrDataUrl(dataUrl);
      }
    };

    buildQr().catch(() => setQrDataUrl(''));

    return () => {
      cancelled = true;
    };
  }, [guestQr.enabled, guestQr.token]);

  if (!guestQr.enabled) {
    return null;
  }

  return (
    <div className="resident-guest-qr-overlay" onClick={onClose}>
      <div className="resident-guest-qr-modal" onClick={(event) => event.stopPropagation()}>
        <div className="resident-guest-qr-header">
          <div>
            <span className="resident-guest-qr-kicker">Facility Guest Gate Pass</span>
            <h3>{reservation.facility?.name || reservation.facilityName}</h3>
            <p>Use one shared code for every guest. Each guard scan consumes one Entry slot or one Exit slot.</p>
          </div>
          <button type="button" onClick={onClose} className="resident-guest-qr-close">
            <XCircle size={20} />
          </button>
        </div>

        <div className="resident-guest-qr-body">
          <div className="resident-guest-qr-preview">
            {qrDataUrl && <img src={qrDataUrl} alt={`Facility guest gate pass for ${reservation.facilityName}`} />}
            <p>Valid for {guestQr.entry.total} gate entries and {guestQr.exit.total} gate exits for this reservation.</p>
          </div>

          <div className="resident-guest-qr-details">
            <div className="resident-guest-qr-progress-grid">
              <div className="resident-guest-qr-progress-card">
                <span>Entry Scans</span>
                <strong>{guestQr.entry.used}/{guestQr.entry.total}</strong>
              </div>
              <div className="resident-guest-qr-progress-card">
                <span>Exit Scans</span>
                <strong>{guestQr.exit.used}/{guestQr.exit.total}</strong>
              </div>
              <div className="resident-guest-qr-progress-card">
                <span>Guests Inside</span>
                <strong>{guestQr.insideCount}</strong>
              </div>
            </div>

            <div className="resident-guest-qr-code-card">
              <div>
                <span className="resident-guest-qr-code-label">Guest Gate Code</span>
                <p>Show this code if the guard cannot scan the camera-based QR.</p>
              </div>
              {accessCode && (
                <button type="button" onClick={() => onCopyCode(accessCode)} className="resident-guest-qr-copy-btn">
                  <Copy size={15} /> Copy Code
                </button>
              )}
              <div className="resident-guest-qr-code-value">{formatFacilityGuestQrAccessCode(accessCode) || 'No code available yet'}</div>
            </div>

            {recentEvents.length > 0 && (
              <div className="resident-guest-qr-events">
                <h4>Recent Gate Scans</h4>
                <div className="resident-guest-qr-event-list">
                  {recentEvents.map((event, index) => (
                    <div key={`${event.checkpoint}-${event.sequenceNumber}-${event.usedAt}-${index}`} className="resident-guest-qr-event-item">
                      <div>
                        <strong>{event.label}</strong>
                        <span>{event.mode === 'forgot' ? 'Forgotten scan bypass' : 'QR or manual code scan'}</span>
                      </div>
                      <span>{event.usedAt ? new Date(event.usedAt).toLocaleString() : 'Waiting'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const ResidentFacilityReservation = ({ token }) => {
  const [reservations, setReservations] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    facilityId: '',
    eventType: '',
    dateReserved: '',
    durationHours: 1,
    purpose: '',
    numberOfGuests: 0
  });
  const [receiptFiles, setReceiptFiles] = useState({});
  const [uploadingReceipt, setUploadingReceipt] = useState(null);
  const [viewingReceipt, setViewingReceipt] = useState(null);
  const [viewingQr, setViewingQr] = useState(false);
  const [viewingGuestQrReservation, setViewingGuestQrReservation] = useState(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [reservationViewMode, setReservationViewMode] = useState('card');
  const [calendarMonth, setCalendarMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [calendarReservations, setCalendarReservations] = useState([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [calendarFacilityId, setCalendarFacilityId] = useState('all');
  const [calendarSelectedDate, setCalendarSelectedDate] = useState(getDateKey(new Date()));

  const fetchMyReservations = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(apiUrl(buildPaginatedUrl('/facilities/my-reservations', page)), {
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

  const fetchCalendarReservations = useCallback(async () => {
    const { start, end } = getMonthRange(calendarMonth);

    setCalendarLoading(true);

    try {
      const response = await fetch(apiUrl(`/facilities/calendar?${new URLSearchParams({
        start: start.toISOString(),
        end: end.toISOString(),
        status: 'upcoming',
        facilityId: calendarFacilityId || 'all'
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
      console.error('Error fetching facility calendar:', error);
      setCalendarReservations([]);
    }

    setCalendarLoading(false);
  }, [calendarFacilityId, calendarMonth, token]);

  useEffect(() => {
    fetchMyReservations();
    fetchSettings();
  }, [fetchMyReservations, fetchSettings]);

  const facilityOptions = useMemo(() => (Array.isArray(settings?.facilities) ? settings.facilities : []), [settings]);
  const selectedFacility = useMemo(
    () => facilityOptions.find((facility) => facility._id === formData.facilityId) || facilityOptions[0] || { eventTypes: [], hourlyRate: 0, paymentRequired: false },
    [facilityOptions, formData.facilityId]
  );

  useEffect(() => {
    if (!facilityOptions.length) {
      return;
    }

    if (!formData.facilityId || !facilityOptions.some((facility) => facility._id === formData.facilityId)) {
      setFormData((prev) => ({
        ...prev,
        facilityId: facilityOptions[0]._id,
        eventType: facilityOptions[0].eventTypes?.[0] || ''
      }));

      setCalendarFacilityId((current) => current || facilityOptions[0]._id);
    }
  }, [facilityOptions, formData.facilityId]);

  useEffect(() => {
    fetchCalendarReservations();
  }, [fetchCalendarReservations]);

  useEffect(() => {
    if (!formData.dateReserved) {
      return;
    }

    const selectedDate = new Date(formData.dateReserved);

    if (Number.isNaN(selectedDate.getTime())) {
      return;
    }

    setCalendarMonth(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
    setCalendarSelectedDate(getDateKey(selectedDate));
  }, [formData.dateReserved]);

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
    if (selectedFacility.eventTypes?.length && !selectedFacility.eventTypes.includes(formData.eventType)) {
      setFormData((prev) => ({
        ...prev,
        eventType: selectedFacility.eventTypes[0]
      }));
    }
  }, [selectedFacility, formData.eventType]);

  const totalAmount = (selectedFacility.hourlyRate || 0) * Number(formData.durationHours || 1);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLoading(true);

    try {
      const response = await fetch(apiUrl('/facilities/reserve'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          ...formData,
          facilityId: selectedFacility?._id || formData.facilityId,
          facilityName: selectedFacility?.name || ''
        })
      });

      const data = await response.json();
      if (response.ok) {
        window.alert(
          data.paymentRequired
            ? 'Reservation submitted. Please scan the GCash QR and upload your receipt for verification.'
            : 'Reservation submitted. This facility is free and now waiting for admin approval.'
        );
        setFormData({
          facilityId: facilityOptions[0]?._id || '',
          eventType: facilityOptions[0]?.eventTypes?.[0] || '',
          dateReserved: '',
          durationHours: 1,
          purpose: '',
          numberOfGuests: 0
        });
        setShowForm(false);
        fetchMyReservations();
      } else {
        window.alert(data.message || 'Failed to create reservation');
      }
    } catch (error) {
      console.error('Error creating reservation:', error);
      window.alert('Failed to create reservation');
    }

    setLoading(false);
  };

  const handleReceiptUpload = async (reservationId) => {
    const receiptFile = receiptFiles[reservationId];
    if (!receiptFile) {
      window.alert('Please select a receipt file');
      return;
    }

    setUploadingReceipt(reservationId);
    const payload = new FormData();
    payload.append('receipt', receiptFile);

    try {
      const response = await fetch(apiUrl(`/facilities/${reservationId}/upload-receipt`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: payload
      });
      const data = await response.json();

      if (response.ok) {
        window.alert('Receipt uploaded successfully!');
        setReceiptFiles((prev) => ({ ...prev, [reservationId]: null }));
        fetchMyReservations();
      } else {
        window.alert(data.message || 'Failed to upload receipt');
      }
    } catch (error) {
      console.error('Error uploading receipt:', error);
      window.alert('Failed to upload receipt');
    }

    setUploadingReceipt(null);
  };

  const handleReceiptFileChange = (reservationId, event) => {
    const file = event.target.files?.[0] || null;
    if (!file) {
      setReceiptFiles((prev) => ({
        ...prev,
        [reservationId]: null
      }));
      return;
    }

    const validation = validatePdfOrImageFile(file, {
      label: 'Receipt file',
      maxBytes: DOCUMENT_UPLOAD_MAX_BYTES
    });

    if (!validation.valid) {
      window.alert(validation.message);
      event.target.value = '';
      return;
    }

    setReceiptFiles((prev) => ({
      ...prev,
      [reservationId]: file
    }));
  };

  const getStatusBadge = (reservation) => {
    const map = {
      pending: { icon: Clock3, label: 'Pending', className: 'status-pending' },
      approved: { icon: CheckCircle2, label: 'Approved', className: 'status-approved' },
      rejected: { icon: XCircle, label: 'Rejected', className: 'status-rejected' },
      expired: { icon: AlertCircle, label: 'Expired', className: 'status-expired' }
    };
    const meta = map[reservation.status] || map.pending;
    const Icon = meta.icon;
    return (
      <span className={`facility-status-badge ${meta.className}`}>
        <Icon size={14} />
        {meta.label}
      </span>
    );
  };

  const getStatusLabel = (status) => {
    const map = {
      pending: 'Pending',
      approved: 'Approved',
      rejected: 'Rejected',
      expired: 'Expired'
    };

    return map[status] || 'Pending';
  };

  const getPaymentLabel = (reservation) => {
    if (!reservation.paymentRequired) return 'Free Reservation';
    if (reservation.isPaid && reservation.paymentStatus === 'verified') return 'Payment Verified';
    if (reservation.paymentStatus === 'pending') return 'Receipt Pending Verification';
    if (reservation.paymentStatus === 'rejected') return 'Receipt Rejected';
    return 'Awaiting Receipt Upload';
  };

  const selectedDayReservationCount = useMemo(() => {
    const selectedDateKey = getDateKey(formData.dateReserved);
    const selectedFacilityId = selectedFacility?._id;

    if (!selectedDateKey || !selectedFacilityId) {
      return 0;
    }

    return calendarReservations.filter((reservation) => {
      const reservationFacilityId = reservation.facility?._id || reservation.facilityId;
      return reservationFacilityId === selectedFacilityId && getDateKey(reservation.dateReserved) === selectedDateKey;
    }).length;
  }, [calendarReservations, formData.dateReserved, selectedFacility]);

  const getTimeRemaining = (expiresAt) => {
    if (!expiresAt) return 'Pending admin review';

    const now = new Date();
    const expiry = new Date(expiresAt);
    if (Number.isNaN(expiry.getTime())) return 'Pending admin review';

    const diff = expiry - now;
    if (diff <= 0) return 'Expired';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m remaining`;
  };

  const handleCopyGuestQrCode = async (value) => {
    const code = String(value || '').trim();
    if (!code) {
      window.alert('No guest gate code is available for this reservation yet.');
      return;
    }

    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
        window.alert('Guest gate code copied.');
        return;
      }
    } catch (error) {
      console.error('Error copying facility guest QR code:', error);
    }

    window.alert(`Guest gate code: ${code}`);
  };

  const closeReservationForm = () => {
    setShowForm(false);
  };

  const renderFacilityPortal = (content) => (
    typeof document !== 'undefined' ? createPortal(content, document.body) : null
  );

  return (
    <div className="facility-shell">
      <div className="page-header">
        <div className="page-title">
          <h2>Facility Reservation</h2>
          <p>Reserve a facility, review pricing, and track payment verification in one place.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="action-btn facility-action-btn"
          disabled={!facilityOptions.length}
        >
          <Calendar size={18} />
          {facilityOptions.length ? 'Make Reservation' : 'No Facilities Available'}
        </button>
      </div>

      <div className="facility-hero-grid">
        <div className="facility-hero-card">
          <div className="facility-hero-copy">
            <span className="facility-chip"><Building2 size={14} /> Facilities</span>
            <h3>Reserve the right space for your event</h3>
            <p>Choose a facility, review its photo and notes, then submit your reservation with payment only when needed.</p>
          </div>
          <div className="facility-rate-list">
            {facilityOptions.map((facility) => (
              <div key={facility._id} className="facility-rate-item">
                <strong>{facility.name}</strong>
                <span>{Number(facility.hourlyRate) > 0 ? `PHP ${facility.hourlyRate} per hour` : 'Free for now'}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="facility-qr-card">
          <div className="facility-qr-header">
            <h3><QrCode size={18} /> Facility GCash QR</h3>
            <p>Use this QR code when paying for any facility that has a reservation fee.</p>
          </div>
          {settings?.gcashQr?.path ? (
            <button
              type="button"
              className="facility-qr-view-btn"
              onClick={() => {
                if (!settings?.gcashQr?.path) {
                  window.alert('Admin has not uploaded a GCash QR code yet.');
                  return;
                }
                setViewingQr(true);
              }}
            >
              <QrCode size={16} />
              View GCash QR
            </button>
          ) : (
            <div className="facility-qr-empty">
              <AlertCircle size={18} />
              <span>Admin has not uploaded a GCash QR code yet.</span>
            </div>
          )}
        </div>
      </div>

      <div className="facility-calendar-controls">
        <label className="facility-calendar-filter">
          <span>Calendar Facility Filter</span>
          <select
            className="form-input"
            value={calendarFacilityId}
            onChange={(event) => setCalendarFacilityId(event.target.value)}
          >
            <option value="all">All Facilities</option>
            {facilityOptions.map((facility) => (
              <option key={facility._id} value={facility._id}>
                {facility.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <FacilityReservationCalendar
        events={calendarReservations}
        loading={calendarLoading}
        monthDate={calendarMonth}
        onMonthChange={setCalendarMonth}
        selectedDateKey={getDateKey(formData.dateReserved) || calendarSelectedDate}
        onDateSelect={setCalendarSelectedDate}
        title="Active Facility Booking Calendar"
        description="Pending and approved reservations appear here so you can spot busy dates before submitting a new booking."
        emptyDayCopy="No active reservations are scheduled for this day."
      />

      <div className="facility-list-card">
        <div className="facility-list-head module-view-bar">
          <div>
            <h3>My Reservations</h3>
            <p>Review approvals, payment status, and uploaded receipts.</p>
          </div>
          <div className="module-view-toggle">
            <button type="button" className={`module-view-toggle__btn ${reservationViewMode === 'card' ? 'active' : ''}`} onClick={() => setReservationViewMode('card')}>
              <LayoutGrid size={16} />
              <span>Cards</span>
            </button>
            <button type="button" className={`module-view-toggle__btn ${reservationViewMode === 'table' ? 'active' : ''}`} onClick={() => setReservationViewMode('table')}>
              <Table2 size={16} />
              <span>Table</span>
            </button>
          </div>
        </div>

        {loading && reservations.length === 0 ? (
          <div className="loading-state">
            <div className="spinner" />
            <p>Loading reservations...</p>
          </div>
        ) : reservations.length === 0 ? (
          <div className="empty-state">
            <Landmark size={44} />
            <h3>No Reservations Yet</h3>
            <p>Start by creating a reservation for one of the available facilities.</p>
          </div>
        ) : reservationViewMode === 'table' ? (
          <div className="module-table-card">
            <div className="module-table-wrap">
              <table className="module-table">
                <thead>
                  <tr>
                    <th>Facility</th>
                    <th>Schedule</th>
                    <th>Guests / Purpose</th>
                    <th>Payment</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reservations.map((reservation) => (
                    (() => {
                      const guestQr = getFacilityGuestQrMeta(reservation);

                      return (
                        <tr key={reservation._id}>
                          <td>
                            <span className="module-table__primary">{reservation.facility?.name || reservation.facilityName}</span>
                            <span className="module-table__secondary">{reservation.eventType}</span>
                          </td>
                          <td>
                            <span className="module-table__primary">{formatDateTimeLocal(reservation.dateReserved)}</span>
                            <span className="module-table__secondary">{reservation.durationHours} hour{reservation.durationHours > 1 ? 's' : ''}</span>
                          </td>
                          <td>
                            <span className="module-table__primary">{reservation.numberOfGuests || 0} guest(s)</span>
                            <span className="module-table__notes">{reservation.purpose}</span>
                            {guestQr.enabled && (
                              <span className="module-table__secondary">
                                Gate pass: Entry {guestQr.entry.used}/{guestQr.entry.total}, Exit {guestQr.exit.used}/{guestQr.exit.total}
                              </span>
                            )}
                          </td>
                          <td>
                            <span className="module-table__primary">{reservation.paymentRequired ? `PHP ${reservation.totalAmount}` : 'Free reservation'}</span>
                            <span className="module-table__secondary">{getPaymentLabel(reservation)}</span>
                          </td>
                          <td>
                            <span className={`module-table__pill ${reservation.status === 'approved' ? 'success' : reservation.status === 'rejected' || reservation.status === 'expired' ? 'danger' : 'pending'}`}>
                              {getStatusLabel(reservation.status)}
                            </span>
                          </td>
                          <td>
                            <div className="module-table__action-stack">
                              <div className="module-table__actions">
                                {reservation.paymentReceipt?.path && (
                                  <button type="button" className="module-table__action-btn secondary" onClick={() => setViewingReceipt(reservation)}>
                                    <Eye size={14} /> View Receipt
                                  </button>
                                )}
                                {guestQr.enabled && (
                                  <button type="button" className="module-table__action-btn info" onClick={() => setViewingGuestQrReservation(reservation)}>
                                    <QrCode size={14} /> Gate Pass
                                  </button>
                                )}
                                {reservation.paymentRequired && reservation.status === 'pending' && !reservation.isPaid && (
                                  <>
                                    <label className="module-table__action-btn info">
                                      <Upload size={14} /> {receiptFiles[reservation._id]?.name ? 'Replace Receipt' : 'Choose Receipt'}
                                      <input
                                        type="file"
                                        accept="image/*,.pdf"
                                        onChange={(event) => handleReceiptFileChange(reservation._id, event)}
                                      />
                                    </label>
                                    <button type="button" className="module-table__action-btn success" onClick={() => handleReceiptUpload(reservation._id)} disabled={uploadingReceipt === reservation._id}>
                                      {uploadingReceipt === reservation._id ? 'Uploading...' : 'Upload'}
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })()
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="facility-card-grid">
            {reservations.map((reservation) => (
              <div key={reservation._id} className="facility-reservation-card">
                <div className="facility-card-top">
                  <div>
                    <h4>{reservation.facility?.name || reservation.facilityName}</h4>
                    <p>{reservation.eventType}</p>
                  </div>
                  {getStatusBadge(reservation)}
                </div>

                <div className="facility-card-body">
                  <div className="facility-detail-row">
                    <Calendar size={16} />
                    <div>
                      <strong>Schedule</strong>
                      <p>{formatDateTimeLocal(reservation.dateReserved)}</p>
                    </div>
                  </div>

                  <div className="facility-detail-row">
                    <Clock3 size={16} />
                    <div>
                      <strong>Duration</strong>
                      <p>{reservation.durationHours} hour{reservation.durationHours > 1 ? 's' : ''}</p>
                    </div>
                  </div>

                  <div className="facility-detail-row">
                    <Users size={16} />
                    <div>
                      <strong>Guests</strong>
                      <p>{reservation.numberOfGuests || 0}</p>
                    </div>
                  </div>

                  {hasFacilityGuestQr(reservation) && (
                    <div className="facility-guest-qr-summary">
                      <strong>Guest Gate Pass</strong>
                      <p>
                        Entry {getFacilityGuestQrMeta(reservation).entry.used}/{getFacilityGuestQrMeta(reservation).entry.total}
                        {' '}| Exit {getFacilityGuestQrMeta(reservation).exit.used}/{getFacilityGuestQrMeta(reservation).exit.total}
                        {' '}| Inside {getFacilityGuestQrMeta(reservation).insideCount}
                      </p>
                    </div>
                  )}

                  <div className="facility-purpose-box">
                    <strong>Purpose</strong>
                    <p>{reservation.purpose}</p>
                  </div>

                  <div className={`facility-payment-strip ${reservation.paymentRequired ? 'paid-required' : 'paid-free'}`}>
                    <div>
                      <strong>{reservation.paymentRequired ? `PHP ${reservation.totalAmount}` : 'Free'}</strong>
                      <p>{getPaymentLabel(reservation)}</p>
                    </div>
                    {reservation.status === 'pending' && <span>{getTimeRemaining(reservation.expiresAt)}</span>}
                  </div>

                  {reservation.status === 'rejected' && reservation.rejectionReason && (
                    <div className="facility-reject-box">
                      <strong>Rejection Reason</strong>
                      <p>{reservation.rejectionReason}</p>
                    </div>
                  )}

                  {reservation.status === 'approved' && (
                    <div className="facility-approved-box">
                      <CheckCircle2 size={16} />
                      <span>Approved by {reservation.approvedBy} on {new Date(reservation.approvedAt).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>

                <div className="facility-card-footer">
                  {reservation.paymentReceipt?.path && (
                    <button onClick={() => setViewingReceipt(reservation)} className="view-receipt-btn">
                      <Eye size={16} />
                      View Receipt
                    </button>
                  )}

                  {hasFacilityGuestQr(reservation) && (
                    <button onClick={() => setViewingGuestQrReservation(reservation)} className="view-receipt-btn facility-guest-qr-btn">
                      <QrCode size={16} />
                      View Guest Gate Pass
                    </button>
                  )}

                  {reservation.paymentRequired && reservation.status === 'pending' && !reservation.isPaid && (
                    <div className="facility-upload-stack">
                      <label className="file-label">
                        <Upload size={16} />
                        {receiptFiles[reservation._id]?.name || `Choose Receipt (max ${formatFileSize(DOCUMENT_UPLOAD_MAX_BYTES)})`}
                        <input
                          type="file"
                          accept="image/*,.pdf"
                          className="file-input"
                          onChange={(event) => handleReceiptFileChange(reservation._id, event)}
                        />
                      </label>
                      <button
                        onClick={() => handleReceiptUpload(reservation._id)}
                        className="upload-btn"
                        disabled={uploadingReceipt === reservation._id}
                      >
                        {uploadingReceipt === reservation._id ? 'Uploading...' : 'Upload Receipt'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <PaginationControls pagination={pagination} onPageChange={setPage} />

      {viewingReceipt && renderFacilityPortal(
        <div className="modal-overlay" onClick={() => setViewingReceipt(null)}>
          <div className="modal-content" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h3>{viewingReceipt.facilityName} Receipt</h3>
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

      {viewingQr && settings?.gcashQr?.path && renderFacilityPortal(
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

      {showForm && renderFacilityPortal(
        <div className="facility-form-overlay" onClick={closeReservationForm}>
          <div className="facility-form-modal" onClick={(event) => event.stopPropagation()}>
            <div className="facility-form-card facility-form-modal-card">
              {!facilityOptions.length ? (
                <div className="empty-state">
                  <button type="button" onClick={closeReservationForm} className="facility-form-modal-close">
                    <XCircle size={20} />
                  </button>
                  <Landmark size={34} />
                  <h3>No Facilities Available</h3>
                  <p>The admin has not published any reservable facilities yet.</p>
                </div>
              ) : (
                <>
                  <div className="facility-form-head">
                    <div>
                      <h3>Create Reservation</h3>
                      <p>Pick your facility, event type, date, and guest count.</p>
                    </div>
                    <div className="facility-form-head-actions">
                      <div className="facility-form-price">
                        <Ticket size={18} />
                        {selectedFacility.paymentRequired ? `Estimated Total: PHP ${totalAmount}` : 'No payment required'}
                      </div>
                      <button type="button" onClick={closeReservationForm} className="facility-form-modal-close">
                        <XCircle size={20} />
                      </button>
                    </div>
                  </div>

                  {selectedFacility?._id && (
                    <div className="facility-selected-preview">
                      {selectedFacility.photo?.path ? (
                        <img src={assetUrl(selectedFacility.photo.path)} alt={selectedFacility.name} className="facility-selected-image" />
                      ) : null}
                      <div className="facility-selected-copy">
                        <strong>{selectedFacility.name}</strong>
                        <p>{selectedFacility.description || 'No description has been added for this facility yet.'}</p>
                      </div>
                    </div>
                  )}

                  <form className="facility-form-grid" onSubmit={handleSubmit}>
                    <label className="facility-form-field">
                      <span>Facility</span>
                      <select
                        value={formData.facilityId}
                        onChange={(event) => {
                          const nextFacilityId = event.target.value;
                          setFormData((prev) => ({
                            ...prev,
                            facilityId: nextFacilityId,
                            eventType: facilityOptions.find((facility) => facility._id === nextFacilityId)?.eventTypes?.[0] || ''
                          }));
                          setCalendarFacilityId(nextFacilityId || 'all');
                        }}
                        className="form-input"
                      >
                        {facilityOptions.map((facility) => (
                          <option key={facility._id} value={facility._id}>{facility.name}</option>
                        ))}
                      </select>
                    </label>

                    <label className="facility-form-field">
                      <span>Event Type</span>
                      <select
                        value={formData.eventType}
                        onChange={(event) => setFormData((prev) => ({ ...prev, eventType: event.target.value }))}
                        className="form-input"
                      >
                        {(selectedFacility.eventTypes || []).map((eventType) => (
                          <option key={eventType} value={eventType}>{eventType}</option>
                        ))}
                      </select>
                    </label>

                    <label className="facility-form-field">
                      <span>Date &amp; Start Time</span>
                      <input
                        type="datetime-local"
                        value={formData.dateReserved}
                        onChange={(event) => setFormData((prev) => ({ ...prev, dateReserved: event.target.value }))}
                        min={getLocalDateTimeInputValue()}
                        className="form-input"
                        required
                      />
                      {formData.dateReserved && selectedFacility?._id && (
                        <small className={`facility-date-hint ${selectedDayReservationCount > 0 ? 'busy' : 'clear'}`}>
                          {selectedDayReservationCount > 0
                            ? `${selectedDayReservationCount} active booking(s) already appear for ${selectedFacility.name} on this date. Review the calendar before submitting.`
                            : `No active bookings are showing for ${selectedFacility.name} on this date yet.`}
                        </small>
                      )}
                    </label>

                    <label className="facility-form-field">
                      <span>Duration (Hours)</span>
                      <input
                        type="number"
                        min="1"
                        max="12"
                        value={formData.durationHours}
                        onChange={(event) => setFormData((prev) => ({ ...prev, durationHours: Number(event.target.value) || 1 }))}
                        className="form-input"
                        required
                      />
                    </label>

                    <label className="facility-form-field facility-form-span">
                      <span>Purpose / Notes</span>
                      <textarea
                        value={formData.purpose}
                        onChange={(event) => setFormData((prev) => ({ ...prev, purpose: event.target.value }))}
                        className="form-textarea"
                        rows="4"
                        placeholder="Share the event details, setup notes, or special arrangements."
                        required
                      />
                    </label>

                    <label className="facility-form-field">
                      <span>Expected Guests</span>
                      <input
                        type="number"
                        min="0"
                        value={formData.numberOfGuests}
                        onChange={(event) => setFormData((prev) => ({ ...prev, numberOfGuests: Number(event.target.value) || 0 }))}
                        className="form-input"
                      />
                    </label>

                    <div className={`facility-payment-note ${selectedFacility.paymentRequired ? 'needs-payment' : 'free-payment'}`}>
                      <AlertCircle size={18} />
                      <div>
                        <strong>{selectedFacility.paymentRequired ? 'GCash payment required' : 'This reservation is free'}</strong>
                        <p>
                          {selectedFacility.paymentRequired
                            ? 'After submitting, pay via the QR code above and upload your receipt before admin approval.'
                            : 'This facility does not require payment for now. Your request will go straight to admin review.'}
                        </p>
                      </div>
                    </div>

                    <button type="submit" className="submit-btn facility-submit-btn" disabled={loading}>
                      <Calendar size={18} />
                      {loading ? 'Submitting...' : 'Submit Reservation'}
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {viewingGuestQrReservation && renderFacilityPortal(
        <FacilityGuestQrModal
          reservation={viewingGuestQrReservation}
          onClose={() => setViewingGuestQrReservation(null)}
          onCopyCode={handleCopyGuestQrCode}
        />
      )}
    </div>
  );
};

export default ResidentFacilityReservation;
