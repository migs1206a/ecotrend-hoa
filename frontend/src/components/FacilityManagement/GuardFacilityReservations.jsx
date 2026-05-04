import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  CheckCircle2,
  Clock3,
  Landmark,
  MapPin,
  Search,
  Users,
  XCircle
} from 'lucide-react';
import { apiUrl, assetUrl } from '../../utils/api';
import './GuardFacilityReservations.css';
import PaginationControls from '../common/PaginationControls';
import { buildPaginatedUrl, parsePaginatedResponse } from '../../utils/pagination';

const formatDateTime = (value) => new Date(value).toLocaleString();

const GuardFacilityReservations = ({ token }) => {
  const [reservations, setReservations] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('upcoming');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);

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

    return {
      approved,
      pending,
      guests
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
        </div>
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
      ) : (
        <div className="guard-facility-grid">
          {visibleReservations.map((reservation) => {
            const status = getStatusMeta(reservation.status);
            const StatusIcon = status.icon;

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
