import React, { useMemo } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Landmark,
  MapPin,
  Users
} from 'lucide-react';
import './FacilityReservationCalendar.css';

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const STATUS_LABELS = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  expired: 'Expired'
};

const addDays = (date, days) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

const pad = (value) => String(value).padStart(2, '0');

const getDateKey = (value) => {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

const getCalendarStart = (date) => {
  const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  return addDays(firstDayOfMonth, -firstDayOfMonth.getDay());
};

const formatMonthHeading = (date) =>
  date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

const formatDayHeading = (dateKey) => {
  if (!dateKey) {
    return 'Select a date';
  }

  const date = new Date(`${dateKey}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? 'Select a date'
    : date.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric'
      });
};

const formatTime = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '--'
    : date.toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit'
      });
};

const formatTimeRange = (reservation) => {
  const start = new Date(reservation.dateReserved);

  if (Number.isNaN(start.getTime())) {
    return '--';
  }

  const explicitEnd = new Date(reservation.endDateTime);
  const fallbackEnd = new Date(
    start.getTime() + Math.max(1, Number(reservation.durationHours) || 1) * 60 * 60 * 1000
  );
  const end = Number.isNaN(explicitEnd.getTime()) ? fallbackEnd : explicitEnd;

  return `${formatTime(start)} - ${formatTime(end)}`;
};

const FacilityReservationCalendar = ({
  events = [],
  loading = false,
  monthDate,
  onMonthChange,
  selectedDateKey,
  onDateSelect,
  showResidentDetails = false,
  title = 'Reservation Calendar',
  description = 'Review scheduled facility bookings by day.',
  emptyDayCopy = 'No reservations scheduled for this day.'
}) => {
  const todayKey = getDateKey(new Date());

  const eventsByDay = useMemo(() => {
    const grouped = new Map();

    events.forEach((event) => {
      const key = getDateKey(event.dateReserved);

      if (!key) {
        return;
      }

      if (!grouped.has(key)) {
        grouped.set(key, []);
      }

      grouped.get(key).push(event);
    });

    grouped.forEach((dayEvents, key) => {
      grouped.set(
        key,
        [...dayEvents].sort((first, second) => new Date(first.dateReserved) - new Date(second.dateReserved))
      );
    });

    return grouped;
  }, [events]);

  const calendarDays = useMemo(() => {
    const start = getCalendarStart(monthDate);
    return Array.from({ length: 42 }, (_, index) => addDays(start, index));
  }, [monthDate]);

  const agendaEvents = selectedDateKey ? eventsByDay.get(selectedDateKey) || [] : [];

  return (
    <section className="facility-calendar-shell">
      <div className="facility-calendar-header">
        <div>
          <h3>
            <CalendarDays size={18} />
            {title}
          </h3>
          <p>{description}</p>
        </div>

        <div className="facility-calendar-month-nav">
          <button
            type="button"
            className="facility-calendar-month-btn"
            onClick={() => onMonthChange(new Date(monthDate.getFullYear(), monthDate.getMonth() - 1, 1))}
          >
            <ChevronLeft size={16} />
          </button>
          <strong>{formatMonthHeading(monthDate)}</strong>
          <button
            type="button"
            className="facility-calendar-month-btn"
            onClick={() => onMonthChange(new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 1))}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="facility-calendar-grid">
        {DAY_LABELS.map((label) => (
          <div key={label} className="facility-calendar-weekday">
            {label}
          </div>
        ))}

        {calendarDays.map((date) => {
          const dateKey = getDateKey(date);
          const dayEvents = eventsByDay.get(dateKey) || [];
          const isOutsideMonth = date.getMonth() !== monthDate.getMonth();
          const isSelected = dateKey === selectedDateKey;
          const isToday = dateKey === todayKey;

          return (
            <button
              key={dateKey}
              type="button"
              className={[
                'facility-calendar-day',
                isOutsideMonth ? 'outside' : '',
                isSelected ? 'selected' : '',
                isToday ? 'today' : '',
                dayEvents.length > 0 ? 'has-events' : ''
              ].filter(Boolean).join(' ')}
              onClick={() => onDateSelect(dateKey)}
            >
              <div className="facility-calendar-day-top">
                <span>{date.getDate()}</span>
                {dayEvents.length > 0 && (
                  <span className="facility-calendar-day-count">{dayEvents.length}</span>
                )}
              </div>

              <div className="facility-calendar-day-events">
                {dayEvents.slice(0, 3).map((event) => (
                  <span
                    key={`${event._id}-${event.dateReserved}`}
                    className={`facility-calendar-chip ${event.status || 'pending'}`}
                  >
                    {event.facilityName}
                    <small>{formatTime(event.dateReserved)}</small>
                  </span>
                ))}

                {dayEvents.length > 3 && (
                  <span className="facility-calendar-more">
                    +{dayEvents.length - 3} more
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="facility-calendar-agenda">
        <div className="facility-calendar-agenda-head">
          <div>
            <h4>{formatDayHeading(selectedDateKey)}</h4>
            <p>
              {agendaEvents.length
                ? `${agendaEvents.length} reservation${agendaEvents.length === 1 ? '' : 's'} in this day`
                : emptyDayCopy}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="facility-calendar-empty">
            <p>Loading reservation calendar...</p>
          </div>
        ) : agendaEvents.length === 0 ? (
          <div className="facility-calendar-empty">
            <Landmark size={22} />
            <p>{emptyDayCopy}</p>
          </div>
        ) : (
          <div className="facility-calendar-agenda-list">
            {agendaEvents.map((event) => (
              <article key={event._id} className="facility-calendar-agenda-item">
                <div className="facility-calendar-agenda-top">
                  <div>
                    <strong>{event.facilityName}</strong>
                    <p>{event.eventType}</p>
                  </div>
                  <span className={`facility-calendar-status ${event.status || 'pending'}`}>
                    {STATUS_LABELS[event.status] || STATUS_LABELS.pending}
                  </span>
                </div>

                <div className="facility-calendar-agenda-meta">
                  <span>
                    <Clock3 size={14} />
                    {formatTimeRange(event)}
                  </span>
                  {showResidentDetails && event.residentName && (
                    <span>
                      <Users size={14} />
                      {event.residentName}
                    </span>
                  )}
                  {showResidentDetails && event.residentAddress && (
                    <span>
                      <MapPin size={14} />
                      {event.residentAddress}
                    </span>
                  )}
                </div>

                {showResidentDetails && event.purpose && (
                  <div className="facility-calendar-agenda-note">
                    <strong>Purpose / Notes</strong>
                    <p>{event.purpose}</p>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};

export default FacilityReservationCalendar;
