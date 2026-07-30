import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock3,
  Landmark,
  LayoutGrid,
  MapPin,
  QrCode,
  ScanLine,
  Search,
  Table2,
  Users,
  XCircle
} from 'lucide-react';
import { apiUrl, assetUrl } from '../../utils/api';
import './GuardFacilityReservations.css';
import PaginationControls from '../common/PaginationControls';
import { buildPaginatedUrl, parsePaginatedResponse } from '../../utils/pagination';
import {
  extractFacilityGuestQrToken,
  formatFacilityGuestQrAccessCode,
  getFacilityGuestQrAccessCode,
  getFacilityGuestQrMeta
} from './facilityGuestQr';
import useHtml5QrScanner from '../../hooks/useHtml5QrScanner';

const formatDateTime = (value) => new Date(value).toLocaleString();
const FACILITY_QR_CHECKPOINT_OPTIONS = [
  { value: 'gate_entry', label: 'Gate Entrance' },
  { value: 'gate_exit', label: 'Gate Exit' }
];

const GuardFacilityReservations = ({ token, showAlert, showConfirm }) => {
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('upcoming');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [viewMode, setViewMode] = useState('card');
  const [qrCheckpoint, setQrCheckpoint] = useState('gate_entry');
  const [qrTokenInput, setQrTokenInput] = useState('');
  const notify = useCallback(
    (message, type = 'info') => {
      if (typeof showAlert === 'function') {
        showAlert(message, type);
        return;
      }

      console.warn(message);
    },
    [showAlert]
  );
  const confirmAction = useCallback(
    (message, onConfirm) => {
      if (typeof showConfirm === 'function') {
        showConfirm(message, onConfirm);
        return;
      }

      console.warn(`Confirmation unavailable: ${message}`);
    },
    [showConfirm]
  );

  useEffect(() => {
    setPage(1);
  }, [searchQuery, statusFilter]);

  const fetchReservations = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(apiUrl(buildPaginatedUrl('/facilities/all', page, {
        search: searchQuery,
        status: statusFilter
      })), {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        const parsed = parsePaginatedResponse(data);
        setReservations(parsed.items);
        setPagination(parsed.pagination);
      } else {
        setReservations([]);
        setPagination(null);
      }
    } catch (error) {
      console.error('Error fetching guard facility reservations:', error);
      setReservations([]);
      setPagination(null);
    }
    setLoading(false);
  }, [page, searchQuery, statusFilter, token]);

  const submitQrScan = useCallback(async (rawValue) => {
    const qrToken = extractFacilityGuestQrToken(rawValue);

    if (!qrToken) {
      notify('Please scan a valid facility guest QR pass or enter the guest code.', 'error');
      return false;
    }

    try {
      const response = await fetch(apiUrl('/facilities/qr/scan'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ qrToken, checkpoint: qrCheckpoint })
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        notify(data.message || 'Failed to record the facility guest checkpoint.', 'error');
        return false;
      }

      notify(data.message || 'Facility guest checkpoint recorded.', 'success');
      setQrTokenInput('');
      fetchReservations();
      return true;
    } catch (error) {
      console.error('Error scanning facility guest QR:', error);
      notify('Failed to record the facility guest checkpoint.', 'error');
      return false;
    }
  }, [fetchReservations, notify, qrCheckpoint, token]);

  const {
    scannerActive: qrScannerActive,
    scannerStarting,
    startScanner: startQrScanner,
    stopScanner: stopQrScanner
  } = useHtml5QrScanner({
    containerId: 'guard-facility-qr-scanner',
    onScanSuccess: submitQrScan,
    onStartError: (message) => {
      console.error('Error starting facility QR scanner:', message);
      notify(message || 'Unable to open camera for facility QR scanning.', 'error');
    }
  });

  const loadGuestCodeIntoScanner = (reservation) => {
    const accessCode = getFacilityGuestQrAccessCode(reservation);

    if (!accessCode) {
      notify('No facility guest code is available for this reservation yet.', 'error');
      return;
    }

    setQrTokenInput(accessCode);
    notify('Facility guest code loaded into the scanner field.', 'success');
  };

  const handleForgottenQrCheckpoint = async (reservation, checkpoint) => {
    const checkpointLabel = checkpoint === 'gate_entry' ? 'Gate Entrance' : 'Gate Exit';
    confirmAction(`Bypass the forgotten ${checkpointLabel} scan for this reservation?`, async () => {

      try {
        const response = await fetch(apiUrl(`/facilities/${reservation._id}/qr/forgot`), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ checkpoint })
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          notify(data.message || `Failed to bypass ${checkpointLabel}.`, 'error');
          return;
        }

        notify(data.message || `${checkpointLabel} bypassed successfully.`, 'success');
        fetchReservations();
      } catch (error) {
        console.error('Error bypassing facility QR checkpoint:', error);
        notify(`Failed to bypass ${checkpointLabel}.`, 'error');
      }
    });
  };

  useEffect(() => {
    fetchReservations();
    const interval = setInterval(fetchReservations, 30000);
    return () => clearInterval(interval);
  }, [fetchReservations]);

  const visibleReservations = useMemo(() => {
    return [...reservations]
      .sort((first, second) => new Date(first.dateReserved) - new Date(second.dateReserved));
  }, [reservations]);

  const summary = useMemo(() => {
    const approved = reservations.filter((reservation) => reservation.status === 'approved').length;
    const pending = reservations.filter((reservation) => reservation.status === 'pending').length;
    const guests = reservations
      .filter((reservation) => ['pending', 'approved'].includes(reservation.status))
      .reduce((total, reservation) => total + (Number(reservation.numberOfGuests) || 0), 0);
    const guestsInside = reservations.reduce(
      (total, reservation) => total + (Number(getFacilityGuestQrMeta(reservation).insideCount) || 0),
      0
    );

    return {
      approved,
      pending,
      guests,
      guestsInside
    };
  }, [reservations]);

  const getStatusMeta = (status) => {
    const map = {
      pending: { icon: Clock3, label: 'Pending Approval', className: 'guard-facility-status pending' },
      approved: { icon: CheckCircle2, label: 'Approved', className: 'guard-facility-status approved' },
      rejected: { icon: XCircle, label: 'Rejected', className: 'guard-facility-status rejected' },
      expired: { icon: AlertCircle, label: 'Expired', className: 'guard-facility-status expired' }
    };
    return map[status] || map.pending;
  };

  return (
    <div className="guard-facility-shell">
      <div className="page-header">
        <div className="page-title">
          <h2>Facility Reservations</h2>
          <p>Read-only event visibility for incoming guests, meetings, and community activities.</p>
        </div>
      </div>

      <div className="guard-facility-hero">
        <div className="guard-facility-copy">
          <span className="guard-facility-chip">Guard View</span>
          <h3>Know which events are scheduled before guests arrive</h3>
          <p>Prepare for expected visitors, identify busy time slots, and confirm where residents are hosting activities.</p>
        </div>

        <div className="guard-facility-stats">
          <div>
            <strong>{summary.approved}</strong>
            <span>Approved Events</span>
          </div>
          <div>
            <strong>{summary.pending}</strong>
            <span>Pending Requests</span>
          </div>
          <div>
            <strong>{summary.guests}</strong>
            <span>Expected Guests</span>
          </div>
          <div>
            <strong>{summary.guestsInside}</strong>
            <span>Guests Inside</span>
          </div>
        </div>
      </div>

      <div className="guard-facility-qr-panel">
        <div className="guard-facility-qr-head">
          <div>
            <h3><QrCode size={18} /> Facility Guest QR Scanner</h3>
            <p>Select a gate checkpoint, then scan the reservation QR or enter the guest code manually when camera access is unavailable.</p>
          </div>
          <select value={qrCheckpoint} onChange={(event) => setQrCheckpoint(event.target.value)} className="form-input">
            {FACILITY_QR_CHECKPOINT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </div>
        <div className="guard-facility-qr-controls">
          <button
            type="button"
            className="guard-facility-qr-btn primary"
            onClick={qrScannerActive ? stopQrScanner : startQrScanner}
            disabled={scannerStarting}
          >
            <ScanLine size={16} />{scannerStarting ? 'Starting...' : (qrScannerActive ? 'Stop Scanner' : 'Scan QR')}
          </button>
          <input
            type="text"
            value={qrTokenInput}
            onChange={(event) => setQrTokenInput(event.target.value)}
            placeholder="Facility guest code or QR token"
            className="form-input"
          />
          <button
            type="button"
            className="guard-facility-qr-btn"
            onClick={async () => {
              const recorded = await submitQrScan(qrTokenInput);
              if (recorded) {
                stopQrScanner();
              }
            }}
          >
            <CheckCircle2 size={16} />Record
          </button>
        </div>
        <div
          id="guard-facility-qr-scanner"
          className={`guard-facility-qr-video guard-facility-qr-reader${qrScannerActive ? ' active' : ''}`}
          aria-hidden={!qrScannerActive}
        />
      </div>

      <div className="guard-facility-toolbar">
        <div className="guard-facility-search">
          <Search size={18} />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by resident, facility, event, or purpose..."
          />
        </div>

        <div className="guard-facility-filter-row">
          {[
            { id: 'upcoming', label: 'Upcoming' },
            { id: 'approved', label: 'Approved' },
            { id: 'pending', label: 'Pending' },
            { id: 'all', label: 'All' }
          ].map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setStatusFilter(option.id)}
              className={`guard-facility-filter-btn ${statusFilter === option.id ? 'active' : ''}`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="module-view-toggle">
          <button type="button" className={`module-view-toggle__btn ${viewMode === 'card' ? 'active' : ''}`} onClick={() => setViewMode('card')}>
            <LayoutGrid size={16} />
            <span>Cards</span>
          </button>
          <button type="button" className={`module-view-toggle__btn ${viewMode === 'table' ? 'active' : ''}`} onClick={() => setViewMode('table')}>
            <Table2 size={16} />
            <span>Table</span>
          </button>
        </div>
      </div>

      {loading && reservations.length === 0 ? (
        <div className="loading-state">
          <div className="spinner" />
          <p>Loading facility reservations...</p>
        </div>
      ) : visibleReservations.length === 0 ? (
        <div className="empty-state guard-facility-empty-state">
          <Landmark size={44} />
          <h3>No Reservations to Show</h3>
          <p>{searchQuery ? 'Try another keyword.' : 'There are no facility reservations matching this view yet.'}</p>
        </div>
      ) : viewMode === 'table' ? (
        <div className="module-table-card">
          <div className="module-table-wrap">
            <table className="module-table">
              <thead>
                <tr>
                  <th>Facility</th>
                  <th>Resident Host</th>
                  <th>Schedule</th>
                  <th>Guests / Duration</th>
                  <th>Status</th>
                  <th>Guest Gate QR</th>
                  <th>Purpose</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleReservations.map((reservation) => {
                  const status = getStatusMeta(reservation.status);
                  const guestQr = getFacilityGuestQrMeta(reservation);
                  return (
                    <tr key={reservation._id}>
                      <td>
                        <span className="module-table__primary">{reservation.facility?.name || reservation.facilityName}</span>
                        <span className="module-table__secondary">{reservation.eventType}</span>
                      </td>
                      <td>
                        <span className="module-table__primary">{reservation.residentName}</span>
                        <span className="module-table__secondary">{reservation.residentAddress}</span>
                      </td>
                      <td>
                        <span className="module-table__primary">{formatDateTime(reservation.dateReserved)}</span>
                        <span className="module-table__secondary">{reservation.approvedAt ? `Approved on ${new Date(reservation.approvedAt).toLocaleDateString()}` : 'Awaiting approval'}</span>
                      </td>
                      <td>
                        <span className="module-table__primary">{reservation.numberOfGuests || 0} guest(s)</span>
                        <span className="module-table__secondary">{reservation.durationHours} hour{reservation.durationHours > 1 ? 's' : ''}</span>
                      </td>
                      <td>
                        <span className={`module-table__pill ${reservation.status === 'approved' ? 'success' : reservation.status === 'rejected' || reservation.status === 'expired' ? 'danger' : 'pending'}`}>
                          {status.label}
                        </span>
                      </td>
                      <td>
                        {guestQr.enabled ? (
                          <div className="module-table__progress">
                            <span>Entry: {guestQr.entry.used}/{guestQr.entry.total}</span>
                            <span>Exit: {guestQr.exit.used}/{guestQr.exit.total}</span>
                            <span>Inside: {guestQr.insideCount}</span>
                            {getFacilityGuestQrAccessCode(reservation) && (
                              <span className="module-table__code">{formatFacilityGuestQrAccessCode(getFacilityGuestQrAccessCode(reservation))}</span>
                            )}
                          </div>
                        ) : (
                          <span className="module-table__empty">No guest gate pass</span>
                        )}
                      </td>
                      <td>
                        <span className="module-table__notes">{reservation.purpose}</span>
                      </td>
                      <td>
                        <div className="module-table__actions">
                          {guestQr.enabled && (
                            <>
                              <button type="button" className="module-table__action-btn info" onClick={() => loadGuestCodeIntoScanner(reservation)}>
                                <QrCode size={14} /> Use Code
                              </button>
                              <button type="button" className="module-table__action-btn secondary" onClick={() => handleForgottenQrCheckpoint(reservation, 'gate_entry')}>
                                Forgot Entrance
                              </button>
                              <button type="button" className="module-table__action-btn secondary" onClick={() => handleForgottenQrCheckpoint(reservation, 'gate_exit')}>
                                Forgot Exit
                              </button>
                            </>
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
        <div className="guard-facility-grid">
          {visibleReservations.map((reservation) => {
            const status = getStatusMeta(reservation.status);
            const StatusIcon = status.icon;
            const guestQr = getFacilityGuestQrMeta(reservation);
            const guestCode = getFacilityGuestQrAccessCode(reservation);

            return (
              <article key={reservation._id} className="guard-facility-card">
                {reservation.facility?.photo?.path && (
                  <div className="guard-facility-image-wrap">
                    <img src={assetUrl(reservation.facility.photo.path)} alt={reservation.facility?.name || reservation.facilityName} className="guard-facility-image" />
                  </div>
                )}

                <div className="guard-facility-card-top">
                  <div>
                    <h4>{reservation.facility?.name || reservation.facilityName}</h4>
                    <p>{reservation.eventType}</p>
                  </div>
                  <span className={status.className}>
                    <StatusIcon size={14} />
                    {status.label}
                  </span>
                </div>

                <div className="guard-facility-card-body">
                  <div className="guard-facility-host">
                    <strong>{reservation.residentName}</strong>
                    <span>{reservation.residentAddress}</span>
                  </div>

                  <div className="guard-facility-detail-grid">
                    <div className="guard-facility-detail">
                      <Calendar size={16} />
                      <div>
                        <strong>Schedule</strong>
                        <p>{formatDateTime(reservation.dateReserved)}</p>
                      </div>
                    </div>

                    <div className="guard-facility-detail">
                      <Clock3 size={16} />
                      <div>
                        <strong>Duration</strong>
                        <p>{reservation.durationHours} hour{reservation.durationHours > 1 ? 's' : ''}</p>
                      </div>
                    </div>

                    <div className="guard-facility-detail">
                      <Users size={16} />
                      <div>
                        <strong>Expected Guests</strong>
                        <p>{reservation.numberOfGuests || 0}</p>
                      </div>
                    </div>

                    <div className="guard-facility-detail">
                      <MapPin size={16} />
                      <div>
                        <strong>Facility Notes</strong>
                        <p>{reservation.facility?.description || (reservation.paymentRequired ? 'Paid facility booking' : 'Free facility booking')}</p>
                      </div>
                    </div>
                  </div>

                  <div className="guard-facility-purpose">
                    <strong>Purpose / Event Notes</strong>
                    <p>{reservation.purpose}</p>
                  </div>

                  {guestQr.enabled && (
                    <div className="guard-facility-guest-qr-card">
                      <div className="guard-facility-guest-qr-head">
                        <div>
                          <strong>Guest Gate Pass</strong>
                          <p>Entry {guestQr.entry.used}/{guestQr.entry.total} | Exit {guestQr.exit.used}/{guestQr.exit.total} | Inside {guestQr.insideCount}</p>
                        </div>
                        <button type="button" className="guard-facility-inline-btn" onClick={() => loadGuestCodeIntoScanner(reservation)}>
                          <QrCode size={15} /> Use Code
                        </button>
                      </div>
                      {guestCode && (
                        <div className="guard-facility-guest-code">
                          <span>Guest Code</span>
                          <strong>{formatFacilityGuestQrAccessCode(guestCode)}</strong>
                        </div>
                      )}
                      <div className="guard-facility-forgot-actions">
                        <button type="button" onClick={() => handleForgottenQrCheckpoint(reservation, 'gate_entry')}>Forgot Entrance Scan</button>
                        <button type="button" onClick={() => handleForgottenQrCheckpoint(reservation, 'gate_exit')}>Forgot Exit Scan</button>
                      </div>
                    </div>
                  )}

                  {reservation.status === 'approved' && reservation.approvedAt && (
                    <div className="guard-facility-approved">
                      <CheckCircle2 size={16} />
                      <span>Approved on {new Date(reservation.approvedAt).toLocaleDateString()}</span>
                    </div>
                  )}

                  {reservation.status === 'rejected' && reservation.rejectionReason && (
                    <div className="guard-facility-rejected">
                      <strong>Rejection Reason</strong>
                      <p>{reservation.rejectionReason}</p>
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
  );
};

export default GuardFacilityReservations;
