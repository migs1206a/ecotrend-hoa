import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  BarChart3,
  Calendar,
  Car,
  Clock,
  FileText,
  Home,
  MapPin,
  QrCode,
  RefreshCw,
  Receipt,
  Shield,
  TrendingUp,
  Users
} from 'lucide-react';
import { apiUrl } from '../../utils/api';
import './AIAnalyticsModule.css';

const WINDOW_OPTIONS = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
  { value: 180, label: '180 days' }
];

const ANALYTICS_REQUEST_TIMEOUT_MS = 90000;

const numberFormatter = new Intl.NumberFormat('en-PH');
const currencyFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0
});

const formatNumber = (value) => numberFormatter.format(Number(value) || 0);
const formatCurrency = (value) => currencyFormatter.format(Number(value) || 0);
const formatPercent = (value) => `${Number(value || 0).toFixed(1)}%`;

const formatMinutes = (value) => {
  const totalMinutes = Number(value) || 0;

  if (totalMinutes <= 0) {
    return '0 min';
  }

  if (totalMinutes < 60) {
    return `${Math.round(totalMinutes)} min`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);

  if (minutes === 0) {
    return `${hours} hr`;
  }

  return `${hours} hr ${minutes} min`;
};

const formatDateTime = (value, fallback = 'Not available') => {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed.toLocaleString();
};

const titleCase = (value = '') =>
  String(value || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());

const shortHourLabel = (value) => {
  const hour = Number(value);

  if (!Number.isFinite(hour)) {
    return '';
  }

  const suffix = hour < 12 ? 'AM' : 'PM';
  const normalizedHour = hour % 12 || 12;

  return `${normalizedHour}${suffix}`;
};

const getToneClass = (value = '') => {
  switch (String(value || '').toLowerCase()) {
    case 'critical':
    case 'danger':
    case 'high':
      return 'danger';
    case 'moderate':
    case 'medium':
    case 'warning':
      return 'warning';
    case 'success':
    case 'low':
      return 'success';
    default:
      return 'info';
  }
};

const findIndicator = (items, label) =>
  (Array.isArray(items) ? items : []).find((item) => item?.label === label) || null;

const MetricCard = ({ icon: Icon, label, value, detail, tone = 'info' }) => (
  <div className={`ai-summary-card ai-summary-card--${tone}`}>
    <div className="ai-summary-card__icon">
      <Icon size={18} />
    </div>
    <div className="ai-summary-card__content">
      <p>{label}</p>
      <h3>{value}</h3>
      <span>{detail}</span>
    </div>
  </div>
);

const HorizontalBars = ({
  items,
  valueKey = 'count',
  emptyLabel = 'No data available yet.',
  valueFormatter = formatNumber
}) => {
  const safeItems = Array.isArray(items) ? items : [];
  const maxValue = Math.max(1, ...safeItems.map((item) => Number(item?.[valueKey]) || 0));

  if (safeItems.length === 0) {
    return <p className="ai-empty-copy">{emptyLabel}</p>;
  }

  return (
    <div className="ai-bars-list">
      {safeItems.map((item, index) => {
        const value = Number(item?.[valueKey]) || 0;
        const width = value <= 0 ? 0 : (value / maxValue) * 100;

        return (
          <div key={`${item.label || item.name || 'row'}-${index}`} className="ai-bars-row">
            <div className="ai-bars-row__header">
              <span>{item.label || item.name}</span>
              <strong>{valueFormatter(value)}</strong>
            </div>
            <div className="ai-bars-row__track">
              <div
                className="ai-bars-row__fill"
                style={{ width: `${Math.max(width, value > 0 ? 8 : 0)}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
};

const DailyActivityChart = ({ items }) => {
  const safeItems = Array.isArray(items) ? items : [];
  const maxTotal = Math.max(1, ...safeItems.map((item) => Number(item?.total) || 0));

  if (safeItems.length === 0) {
    return <p className="ai-empty-copy">Daily activity will appear once records exist in the selected window.</p>;
  }

  const segments = [
    { key: 'entries', label: 'Gate', className: 'gate' },
    { key: 'visits', label: 'Visits', className: 'visits' },
    { key: 'complaints', label: 'Reports', className: 'reports' },
    { key: 'reservations', label: 'Reservations', className: 'reservations' }
  ];

  return (
    <div className="ai-daily-chart">
      <div className="ai-chart-legend">
        {segments.map((segment) => (
          <span key={segment.key} className="ai-chart-legend__item">
            <i className={`ai-chart-legend__dot ai-chart-legend__dot--${segment.className}`} />
            {segment.label}
          </span>
        ))}
      </div>
      <div className="ai-daily-chart__rows">
        {safeItems.map((item) => {
          const total = Number(item?.total) || 0;

          return (
            <div key={item.date || item.label} className="ai-daily-chart__row">
              <div className="ai-daily-chart__meta">
                <strong>{item.label}</strong>
                <span>{formatNumber(total)}</span>
              </div>
              <div className="ai-daily-chart__track">
                <div
                  className="ai-daily-chart__stack"
                  style={{ width: `${Math.max((total / maxTotal) * 100, total > 0 ? 10 : 0)}%` }}
                >
                  {segments.map((segment) => {
                    const segmentValue = Number(item?.[segment.key]) || 0;

                    if (segmentValue <= 0 || total <= 0) {
                      return null;
                    }

                    return (
                      <div
                        key={segment.key}
                        className={`ai-daily-chart__segment ai-daily-chart__segment--${segment.className}`}
                        style={{ width: `${(segmentValue / total) * 100}%` }}
                        title={`${segment.label}: ${formatNumber(segmentValue)}`}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const HourlyActivityChart = ({ items }) => {
  const safeItems = Array.isArray(items) ? items : [];
  const maxValue = Math.max(1, ...safeItems.map((item) => Number(item?.count) || 0));

  if (safeItems.length === 0) {
    return <p className="ai-empty-copy">Hourly activity will appear once gate movement is recorded.</p>;
  }

  return (
    <div className="ai-hourly-chart">
      <div className="ai-hourly-chart__bars">
        {safeItems.map((item) => {
          const value = Number(item?.count) || 0;
          const height = value <= 0 ? 4 : Math.max(10, (value / maxValue) * 100);

          return (
            <div key={`${item.hour}-${item.label}`} className="ai-hourly-chart__column">
              <span className="ai-hourly-chart__value">{value > 0 ? formatNumber(value) : ''}</span>
              <div className="ai-hourly-chart__bar-wrap">
                <div className="ai-hourly-chart__bar" style={{ height: `${height}%` }} />
              </div>
              <span className="ai-hourly-chart__label">
                {[0, 6, 12, 18, 23].includes(Number(item?.hour)) ? shortHourLabel(item.hour) : ''}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const StatusPills = ({ items, emptyLabel }) => {
  if (!Array.isArray(items) || items.length === 0) {
    return <p className="ai-empty-copy">{emptyLabel}</p>;
  }

  return (
    <div className="ai-pill-list">
      {items.map((item) => (
        <span key={item.label} className="ai-pill">
          {item.label}: {formatNumber(item.count)}
        </span>
      ))}
    </div>
  );
};

const AIAnalyticsModule = ({ token, showAlert }) => {
  const [windowDays, setWindowDays] = useState(30);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const fetchAnalytics = useCallback(
    async (days, { silent = false } = {}) => {
      let timeoutId;

      try {
        setError('');
        if (silent) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        const controller = new AbortController();
        timeoutId = window.setTimeout(() => controller.abort(), ANALYTICS_REQUEST_TIMEOUT_MS);
        const query = new URLSearchParams({ days: String(days) });

        if (silent) {
          query.set('refresh', 'true');
        }

        const response = await fetch(apiUrl(`/analytics/overview?${query.toString()}`), {
          headers: {
            Authorization: `Bearer ${token}`
          },
          signal: controller.signal
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Unable to load AI analytics');
        }

        setAnalytics(data);
      } catch (fetchError) {
        const message =
          fetchError.name === 'AbortError'
            ? 'AI analytics is taking too long on the free server. Please try again after the backend wakes up.'
            : fetchError.message || 'Unable to load AI analytics';
        setError(message);

        if (typeof showAlert === 'function') {
          showAlert(message);
        }
      } finally {
        if (timeoutId) {
          window.clearTimeout(timeoutId);
        }
        setLoading(false);
        setRefreshing(false);
      }
    },
    [showAlert, token]
  );

  useEffect(() => {
    fetchAnalytics(windowDays);
  }, [fetchAnalytics, windowDays]);

  const summary = analytics?.summary || {};
  const visitorBehavior = analytics?.visitorBehavior || {};
  const facilityUsage = analytics?.facilityUsage || {};
  const complaintInsights = analytics?.complaintInsights || {};
  const vehicleInsights = analytics?.vehicleInsights || {};
  const billingInsights = analytics?.billingInsights || {};
  const qrInsights = analytics?.qrInsights || {};
  const documentInsights = analytics?.documentInsights || {};
  const responseInsights = analytics?.responseInsights || {};
  const security = analytics?.security || {};
  const indicators = security.indicators || [];
  const posture = security.posture || {};
  const actionQueue = security.actionQueue || security.recommendations || [];
  const watchlist = security.sessionWatchlist || [];
  const ownerTypeBreakdown = security.ownerTypeBreakdown || [];
  const guardActivity = security.guardActivity || [];
  const plateOverview = security.plateOverview || {};
  const frequentPlates = plateOverview.frequentPlates || [];
  const entryExitImbalance = plateOverview.entryExitImbalance || [];
  const complaintCategoryBreakdown = complaintInsights.categoryBreakdown || [];
  const complaintUrgencyBreakdown = complaintInsights.urgencyBreakdown || [];
  const reservationStatusBreakdown = facilityUsage.statusBreakdown || [];
  const paymentStatusBreakdown = facilityUsage.paymentStatusBreakdown || [];
  const eventTypeBreakdown = facilityUsage.eventTypeBreakdown || [];

  const afterHoursIndicator = findIndicator(indicators, 'After-hours gate activity');
  const topFacility = (facilityUsage.busiestFacilities || [])[0] || null;
  const topHotspot = (complaintInsights.hotspots || [])[0] || null;
  const topHost = (visitorBehavior.busiestHosts || [])[0] || null;
  const topGuard = guardActivity[0] || null;
  const approvedRevenue = facilityUsage.approvedRevenue ?? facilityUsage.estimatedRevenue ?? 0;

  const overviewCards = useMemo(
    () => [
      {
        icon: Shield,
        label: 'Risk Score',
        value: `${formatNumber(posture.riskScore || summary.riskScore)}/100`,
        detail: `${titleCase(posture.riskLevel || summary.riskLevel || 'low')} security posture`,
        tone: getToneClass(posture.riskLevel || summary.riskLevel)
      },
      {
        icon: Activity,
        label: 'Gate Logs',
        value: formatNumber(summary.entryLogs),
        detail: `${formatNumber(summary.visitors + summary.deliveries)} related visitor and delivery records`,
        tone: 'info'
      },
      {
        icon: Clock,
        label: 'Open Sessions',
        value: formatNumber(visitorBehavior.insideCount),
        detail: 'Visitors or deliveries still marked inside',
        tone: visitorBehavior.insideCount > 0 ? 'warning' : 'success'
      },
      {
        icon: Home,
        label: 'Pending Facility Reviews',
        value: formatNumber(summary.pendingReservations),
        detail: `${formatPercent(facilityUsage.approvalRate)} reservation approval rate`,
        tone: summary.pendingReservations > 0 ? 'warning' : 'success'
      },
      {
        icon: Receipt,
        label: 'Billing Collection',
        value: formatPercent(billingInsights.collectionRate),
        detail: `${formatCurrency(billingInsights.collectedAmount)} collected`,
        tone:
          Number(billingInsights.collectionRate || 0) >= 75
            ? 'success'
            : Number(billingInsights.collectionRate || 0) >= 45
              ? 'warning'
              : 'danger'
      },
      {
        icon: AlertCircle,
        label: 'Unresolved Reports',
        value: formatNumber(complaintInsights.unresolvedCount),
        detail: `${formatNumber(complaintInsights.totalComplaints)} complaints in this window`,
        tone: complaintInsights.unresolvedCount > 0 ? 'danger' : 'success'
      }
    ],
    [
      billingInsights.collectedAmount,
      billingInsights.collectionRate,
      complaintInsights.totalComplaints,
      complaintInsights.unresolvedCount,
      facilityUsage.approvalRate,
      posture.riskLevel,
      posture.riskScore,
      summary.deliveries,
      summary.entryLogs,
      summary.riskLevel,
      summary.riskScore,
      summary.pendingReservations,
      summary.visitors,
      visitorBehavior.insideCount
    ]
  );

  if (loading && !analytics) {
    return (
      <div className="ai-analytics-module">
        <div className="ai-loading-state">
          <div className="ai-loading-spinner" />
          <h3>Loading analytics</h3>
          <p>Preparing gate, visitor, reservation, and complaint summaries for the selected window.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ai-analytics-module">
      <div className="ai-analytics-header">
        <div className="ai-analytics-header__copy">
          <div className="ai-analytics-header__eyebrow">
            <BarChart3 size={15} />
            <span>AI Analytics</span>
          </div>
          <h2>Operational snapshot</h2>
          <p>
            Focused on recorded counts, open queues, and review-worthy patterns instead of inflated AI-only signals.
          </p>
        </div>
        <div className="ai-analytics-header__controls">
          <label className="ai-control-group">
            <span>Window</span>
            <select value={windowDays} onChange={(event) => setWindowDays(Number(event.target.value))}>
              {WINDOW_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={`ai-refresh-btn ${refreshing ? 'is-refreshing' : ''}`}
            onClick={() => fetchAnalytics(windowDays, { silent: true })}
            disabled={refreshing}
          >
            <RefreshCw size={16} />
            <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
          </button>
        </div>
      </div>

      <div className="ai-meta-strip">
        <span className="ai-meta-chip">Generated {formatDateTime(analytics?.generatedAt)}</span>
        <span className="ai-meta-chip">Window {analytics?.windowDays || windowDays} days</span>
        {analytics?.stale ? <span className="ai-meta-chip ai-meta-chip--warning">Using cached analytics</span> : null}
      </div>

      {analytics?.warning ? (
        <div className="ai-inline-notice ai-inline-notice--warning">
          <AlertCircle size={18} />
          <span>{analytics.warning}</span>
        </div>
      ) : null}

      {error ? (
        <div className="ai-inline-notice ai-inline-notice--danger">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="ai-summary-grid">
        {overviewCards.map((card) => (
          <MetricCard
            key={card.label}
            icon={card.icon}
            label={card.label}
            value={card.value}
            detail={card.detail}
            tone={card.tone}
          />
        ))}
      </div>

      <div className="ai-layout-grid">
        <section className="ai-panel ai-panel--wide">
          <div className="ai-panel__header">
            <div>
              <h3>Security posture and controls</h3>
              <p>High-signal security counters, required follow-up, and the sessions that should be reviewed first.</p>
            </div>
            <Shield size={18} />
          </div>

          <div className="ai-stat-strip ai-stat-strip--four">
            <div className="ai-stat-chip">
              <strong>{formatNumber(posture.afterHoursCount)}</strong>
              <span>After-hours non-resident access logs</span>
            </div>
            <div className="ai-stat-chip">
              <strong>{formatPercent(posture.afterHoursRatio)}</strong>
              <span>After-hours share of access activity</span>
            </div>
            <div className="ai-stat-chip">
              <strong>{formatMinutes(posture.longestOpenSessionMinutes)}</strong>
              <span>Longest open session still active</span>
            </div>
            <div className="ai-stat-chip">
              <strong>{formatNumber(posture.nonResidentAccessCount)}</strong>
              <span>Non-resident gate movements</span>
            </div>
          </div>

          <div className="ai-chart-grid">
            <div className="ai-chart-panel">
              <h4>Required security actions</h4>
              {actionQueue.length > 0 ? (
                <div className="ai-action-list">
                  {actionQueue.map((action, index) => (
                    <div key={`${action.title}-${index}`} className={`ai-action-card ai-action-card--${getToneClass(action.priority)}`}>
                      <div className="ai-action-card__head">
                        <strong>{action.title}</strong>
                        <span>{titleCase(action.priority)}</span>
                      </div>
                      <p>{action.description}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="ai-empty-copy">No immediate security action is queued for this window.</p>
              )}
            </div>
            <div className="ai-chart-panel">
              <h4>Owner type mix</h4>
              <HorizontalBars
                items={ownerTypeBreakdown}
                emptyLabel="Owner type breakdown will appear after gate logs are recorded."
              />
            </div>
          </div>

          <div className="ai-chart-panel ai-chart-panel--spaced">
            <h4>Sessions needing review</h4>
            {watchlist.length > 0 ? (
              <div className="ai-list">
                {watchlist.map((item, index) => (
                  <div key={`${item.type}-${item.name}-${index}`} className="ai-list-item">
                    <div>
                      <strong>{item.name}</strong>
                      <span>{titleCase(item.type)} - {item.context}</span>
                    </div>
                    <small>{item.status} - {formatMinutes(item.durationMinutes)}</small>
                  </div>
                ))}
              </div>
            ) : (
              <p className="ai-empty-copy">No long-stay or still-open sessions need review right now.</p>
            )}
          </div>
        </section>

        <section className="ai-panel ai-panel--wide">
          <div className="ai-panel__header">
            <div>
              <h3>Access activity</h3>
              <p>Recent daily load and hourly access shape across the selected window.</p>
            </div>
            <Activity size={18} />
          </div>

          <div className="ai-stat-strip">
            <div className="ai-stat-chip">
              <strong>{visitorBehavior.peakHourLabel || 'No activity yet'}</strong>
              <span>Peak hour</span>
            </div>
            <div className="ai-stat-chip">
              <strong>{afterHoursIndicator?.value || '0%'}</strong>
              <span>After-hours share</span>
            </div>
            <div className="ai-stat-chip">
              <strong>{topHost ? topHost.label : 'No host data'}</strong>
              <span>{topHost ? `${formatNumber(topHost.count)} hosted movements` : 'Most active host'}</span>
            </div>
          </div>

          <div className="ai-chart-grid">
            <div className="ai-chart-panel">
              <h4>Daily activity mix</h4>
              <DailyActivityChart items={security.dailyActivity} />
            </div>
            <div className="ai-chart-panel">
              <h4>Hourly gate pattern</h4>
              <HourlyActivityChart items={security.hourlyActivity} />
            </div>
          </div>
        </section>

        <section className="ai-panel">
          <div className="ai-panel__header">
            <div>
              <h3>Response intelligence</h3>
              <p>Reliable feedback-aware analytics based on actual approvals, rejections, verifications, and review turnaround.</p>
            </div>
            <TrendingUp size={18} />
          </div>

          <div className="ai-mini-stats">
            <div className="ai-mini-stat">
              <Clock size={15} />
              <div>
                <strong>{formatNumber(responseInsights.visitorReviewHours)}</strong>
                <span>Visitor review hours</span>
              </div>
            </div>
            <div className="ai-mini-stat">
              <Clock size={15} />
              <div>
                <strong>{formatNumber(responseInsights.complaintReviewHours)}</strong>
                <span>Complaint review hours</span>
              </div>
            </div>
            <div className="ai-mini-stat">
              <Clock size={15} />
              <div>
                <strong>{formatNumber(responseInsights.documentReviewHours)}</strong>
                <span>Document review hours</span>
              </div>
            </div>
            <div className="ai-mini-stat">
              <Shield size={15} />
              <div>
                <strong>{formatNumber((responseInsights.feedbackSignals || []).length)}</strong>
                <span>Feedback signals detected</span>
              </div>
            </div>
          </div>

          <div className="ai-split-grid">
            <div>
              <h4>Decision outcomes</h4>
              <div className="ai-split-grid">
                <div>
                  <StatusPills
                    items={responseInsights.visitorOutcomeBreakdown}
                    emptyLabel="Visitor outcomes will appear once reviews happen."
                  />
                </div>
                <div>
                  <StatusPills
                    items={responseInsights.documentOutcomeBreakdown}
                    emptyLabel="Document outcomes will appear once submissions are reviewed."
                  />
                </div>
              </div>
            </div>
            <div>
              <h4>Feedback signals</h4>
              {(responseInsights.feedbackSignals || []).length > 0 ? (
                <div className="ai-action-list">
                  {responseInsights.feedbackSignals.map((signal, index) => (
                    <div key={`${signal.title}-${index}`} className="ai-action-card ai-action-card--warning">
                      <div className="ai-action-card__head">
                        <strong>{signal.title}</strong>
                        <span>Response-aware</span>
                      </div>
                      <p>{signal.description}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="ai-empty-copy">No repeated response pattern is strong enough to flag right now.</p>
              )}
            </div>
          </div>

          <div className="ai-chart-panel ai-chart-panel--spaced">
            <h4>Payment and complaint outcomes</h4>
            <div className="ai-split-grid">
              <div>
                <StatusPills
                  items={responseInsights.paymentOutcomeBreakdown}
                  emptyLabel="Payment outcomes will appear once billing decisions exist."
                />
              </div>
              <div>
                <StatusPills
                  items={responseInsights.complaintOutcomeBreakdown}
                  emptyLabel="Complaint outcomes will appear once reports are reviewed."
                />
              </div>
            </div>
          </div>
        </section>

        <section className="ai-panel">
          <div className="ai-panel__header">
            <div>
              <h3>Document workflow analytics</h3>
              <p>Submission volume, review speed, and document-type mix so admin workload stays measurable.</p>
            </div>
            <FileText size={18} />
          </div>

          <div className="ai-mini-stats">
            <div className="ai-mini-stat">
              <FileText size={15} />
              <div>
                <strong>{formatNumber(documentInsights.totalDocuments)}</strong>
                <span>Documents in window</span>
              </div>
            </div>
            <div className="ai-mini-stat">
              <Clock size={15} />
              <div>
                <strong>{formatNumber(documentInsights.averageReviewHours)}</strong>
                <span>Average review hours</span>
              </div>
            </div>
            <div className="ai-mini-stat">
              <Shield size={15} />
              <div>
                <strong>{formatNumber((documentInsights.statusBreakdown || []).length)}</strong>
                <span>Status groups in use</span>
              </div>
            </div>
            <div className="ai-mini-stat">
              <BarChart3 size={15} />
              <div>
                <strong>{formatNumber((documentInsights.typeBreakdown || []).length)}</strong>
                <span>Document types used</span>
              </div>
            </div>
          </div>

          <div className="ai-split-grid">
            <div>
              <h4>Document statuses</h4>
              <HorizontalBars
                items={documentInsights.statusBreakdown}
                emptyLabel="Document statuses will appear once resident submissions are created."
              />
            </div>
            <div>
              <h4>Document type mix</h4>
              <HorizontalBars
                items={documentInsights.typeBreakdown}
                emptyLabel="Document type mix will appear once resident submissions are created."
              />
            </div>
          </div>
        </section>

        <section className="ai-panel">
          <div className="ai-panel__header">
            <div>
              <h3>Billing and payment analytics</h3>
              <p>Current-year collections, outstanding dues, and which payment states are blocking clean billing flow.</p>
            </div>
            <Receipt size={18} />
          </div>

          <div className="ai-mini-stats">
            <div className="ai-mini-stat">
              <Receipt size={15} />
              <div>
                <strong>{formatPercent(billingInsights.collectionRate)}</strong>
                <span>Collection rate</span>
              </div>
            </div>
            <div className="ai-mini-stat">
              <TrendingUp size={15} />
              <div>
                <strong>{formatCurrency(billingInsights.collectedAmount)}</strong>
                <span>Collected amount</span>
              </div>
            </div>
            <div className="ai-mini-stat">
              <AlertCircle size={15} />
              <div>
                <strong>{formatCurrency(billingInsights.outstandingAmount)}</strong>
                <span>Outstanding amount</span>
              </div>
            </div>
            <div className="ai-mini-stat">
              <Clock size={15} />
              <div>
                <strong>{formatNumber(billingInsights.pendingLines)}</strong>
                <span>Pending payment proofs</span>
              </div>
            </div>
          </div>

          <div className="ai-split-grid">
            <div>
              <h4>Payment status breakdown</h4>
              <HorizontalBars
                items={billingInsights.paymentStatusBreakdown}
                emptyLabel="Billing status breakdown will appear once current-year billing data is available."
              />
            </div>
            <div>
              <h4>Payment methods</h4>
              <HorizontalBars
                items={billingInsights.paymentMethodBreakdown}
                emptyLabel="Payment methods will appear once residents submit or verify payments."
              />
            </div>
          </div>

          <div className="ai-chart-panel ai-chart-panel--spaced">
            <h4>Monthly collections</h4>
            {(billingInsights.monthlyCollection || []).length > 0 ? (
              <div className="ai-list">
                {billingInsights.monthlyCollection.map((month) => (
                  <div key={month.label} className="ai-list-item">
                    <div>
                      <strong>{month.label}</strong>
                      <span>{formatCurrency(month.collected)} of {formatCurrency(month.expected)} collected</span>
                    </div>
                    <small>{formatNumber(month.paidLines)} paid / {formatNumber(month.pendingLines)} pending</small>
                  </div>
                ))}
              </div>
            ) : (
              <p className="ai-empty-copy">Monthly collection rows will appear once billing records exist for the active year.</p>
            )}
          </div>
        </section>

        <section className="ai-panel">
          <div className="ai-panel__header">
            <div>
              <h3>QR-approved access analytics</h3>
              <p>Track how QR-approved visitor and facility flows are issued, used, and completed.</p>
            </div>
            <QrCode size={18} />
          </div>

          <div className="ai-mini-stats">
            <div className="ai-mini-stat">
              <QrCode size={15} />
              <div>
                <strong>{formatNumber(qrInsights.visitorQrApproved)}</strong>
                <span>QR-approved visitors</span>
              </div>
            </div>
            <div className="ai-mini-stat">
              <Shield size={15} />
              <div>
                <strong>{formatNumber(qrInsights.completedVisitorJourneys)}</strong>
                <span>Completed visitor journeys</span>
              </div>
            </div>
            <div className="ai-mini-stat">
              <Home size={15} />
              <div>
                <strong>{formatNumber(qrInsights.facilityQrReservations)}</strong>
                <span>Facility QR reservations</span>
              </div>
            </div>
            <div className="ai-mini-stat">
              <Activity size={15} />
              <div>
                <strong>{formatNumber(qrInsights.facilityScanEvents)}</strong>
                <span>Facility QR scan events</span>
              </div>
            </div>
          </div>

          <div className="ai-split-grid">
            <div>
              <h4>Visitor QR checkpoints</h4>
              <HorizontalBars
                items={qrInsights.visitorCheckpointBreakdown}
                emptyLabel="Visitor QR checkpoint activity will appear once QR-approved guests are scanned."
              />
            </div>
            <div>
              <h4>QR mode usage</h4>
              <div className="ai-split-grid">
                <div>
                  <StatusPills
                    items={qrInsights.visitorModeBreakdown}
                    emptyLabel="Visitor QR scan modes will appear once checkpoints are used."
                  />
                </div>
                <div>
                  <StatusPills
                    items={qrInsights.facilityModeBreakdown}
                    emptyLabel="Facility QR scan modes will appear once guest QR scans are used."
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="ai-panel">
          <div className="ai-panel__header">
            <div>
              <h3>Vehicle analytics</h3>
              <p>Vehicle coverage across approved residents, recent registrations, and record completeness.</p>
            </div>
            <Car size={18} />
          </div>

          <div className="ai-mini-stats">
            <div className="ai-mini-stat">
              <Car size={15} />
              <div>
                <strong>{formatNumber(vehicleInsights.totalVehicles)}</strong>
                <span>Total active vehicles</span>
              </div>
            </div>
            <div className="ai-mini-stat">
              <Users size={15} />
              <div>
                <strong>{formatNumber(vehicleInsights.residentsWithVehicles)}</strong>
                <span>Residents with vehicles</span>
              </div>
            </div>
            <div className="ai-mini-stat">
              <Calendar size={15} />
              <div>
                <strong>{formatNumber(vehicleInsights.recentRegistrations)}</strong>
                <span>Recent registrations</span>
              </div>
            </div>
            <div className="ai-mini-stat">
              <BarChart3 size={15} />
              <div>
                <strong>{formatPercent(vehicleInsights.photoCoverage)}</strong>
                <span>Vehicle photo coverage</span>
              </div>
            </div>
          </div>
        </section>

        <section className="ai-panel">
          <div className="ai-panel__header">
            <div>
              <h3>Gate accountability</h3>
              <p>Who logged the movement, which plates appear most often, and where entry and exit counts drift apart.</p>
            </div>
            <Activity size={18} />
          </div>

          <div className="ai-mini-stats">
            <div className="ai-mini-stat">
              <Activity size={15} />
              <div>
                <strong>{formatNumber(plateOverview.uniquePlates)}</strong>
                <span>Unique plates in window</span>
              </div>
            </div>
            <div className="ai-mini-stat">
              <AlertCircle size={15} />
              <div>
                <strong>{formatNumber(plateOverview.noVehicleCount)}</strong>
                <span>No-vehicle gate logs</span>
              </div>
            </div>
            <div className="ai-mini-stat">
              <Shield size={15} />
              <div>
                <strong>{topGuard ? topGuard.name : 'No guard data'}</strong>
                <span>{topGuard ? `${formatNumber(topGuard.count)} logged events` : 'Top recorder'}</span>
              </div>
            </div>
            <div className="ai-mini-stat">
              <Clock size={15} />
              <div>
                <strong>{formatNumber(entryExitImbalance.length)}</strong>
                <span>Plates with imbalance</span>
              </div>
            </div>
          </div>

          <div className="ai-split-grid">
            <div>
              <h4>Guard activity</h4>
              <HorizontalBars
                items={guardActivity.map((guard) => ({ label: guard.name, count: guard.count }))}
                emptyLabel="Guard activity will appear after gate logs are recorded."
              />
            </div>
            <div>
              <h4>Frequent plates</h4>
              {frequentPlates.length > 0 ? (
                <div className="ai-list">
                  {frequentPlates.map((plate) => (
                    <div key={plate.label} className="ai-list-item">
                      <div>
                        <strong>{plate.label}</strong>
                        <span>{plate.ownerType}</span>
                      </div>
                      <small>{formatNumber(plate.count)} logs</small>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="ai-empty-copy">Frequent plate activity will appear once enough gate data is available.</p>
              )}
            </div>
          </div>

          <div className="ai-chart-panel ai-chart-panel--spaced">
            <h4>Entry and exit imbalance</h4>
            {entryExitImbalance.length > 0 ? (
              <div className="ai-list">
                {entryExitImbalance.map((item) => (
                  <div key={item.plateNumber} className="ai-list-item">
                    <div>
                      <strong>{item.plateNumber}</strong>
                      <span>{item.direction}</span>
                    </div>
                    <small>{formatNumber(item.entries)} in / {formatNumber(item.exits)} out</small>
                  </div>
                ))}
              </div>
            ) : (
              <p className="ai-empty-copy">Entry and exit counts are balanced for the tracked plates in this window.</p>
            )}
          </div>
        </section>

        <section className="ai-panel">
          <div className="ai-panel__header">
            <div>
              <h3>Visitor and delivery review</h3>
              <p>Stay durations, open sessions, and repeat arrivals that deserve checking.</p>
            </div>
            <Users size={18} />
          </div>

          <div className="ai-mini-stats">
            <div className="ai-mini-stat">
              <Clock size={15} />
              <div>
                <strong>{formatMinutes(visitorBehavior.averageVisitMinutes)}</strong>
                <span>Average visitor stay</span>
              </div>
            </div>
            <div className="ai-mini-stat">
              <Clock size={15} />
              <div>
                <strong>{formatMinutes(visitorBehavior.averageDeliveryMinutes)}</strong>
                <span>Average delivery stay</span>
              </div>
            </div>
            <div className="ai-mini-stat">
              <Calendar size={15} />
              <div>
                <strong>{formatNumber(visitorBehavior.preRegisteredCount)}</strong>
                <span>Pre-registered visitors</span>
              </div>
            </div>
            <div className="ai-mini-stat">
              <Shield size={15} />
              <div>
                <strong>{formatNumber(visitorBehavior.insideCount)}</strong>
                <span>Open sessions</span>
              </div>
            </div>
          </div>

          <div className="ai-split-grid">
            <div>
              <h4>Visit purposes</h4>
              <HorizontalBars
                items={visitorBehavior.purposeBreakdown}
                emptyLabel="Visitor purpose trends will appear once more records are available."
              />
            </div>
            <div>
              <h4>Repeat visitors</h4>
              {(visitorBehavior.repeatVisitors || []).length > 0 ? (
                <div className="ai-list">
                  {visitorBehavior.repeatVisitors.map((visitor) => (
                    <div key={`${visitor.name}-${visitor.host}`} className="ai-list-item">
                      <div>
                        <strong>{visitor.name}</strong>
                        <span>{visitor.host}</span>
                      </div>
                      <small>{formatNumber(visitor.count)} visit(s)</small>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="ai-empty-copy">No repeat visitor pattern stands out in this window.</p>
              )}
            </div>
          </div>
        </section>

        <section className="ai-panel">
          <div className="ai-panel__header">
            <div>
              <h3>Facility demand</h3>
              <p>Reservation load, guest pressure, and the facilities drawing the most demand.</p>
            </div>
            <Home size={18} />
          </div>

          <div className="ai-mini-stats">
            <div className="ai-mini-stat">
              <Calendar size={15} />
              <div>
                <strong>{formatNumber(facilityUsage.totalReservations)}</strong>
                <span>Total reservations</span>
              </div>
            </div>
            <div className="ai-mini-stat">
              <TrendingUp size={15} />
              <div>
                <strong>{formatPercent(facilityUsage.approvalRate)}</strong>
                <span>Approval rate</span>
              </div>
            </div>
            <div className="ai-mini-stat">
              <Users size={15} />
              <div>
                <strong>{formatNumber(facilityUsage.totalGuests)}</strong>
                <span>Projected guests</span>
              </div>
            </div>
            <div className="ai-mini-stat">
              <BarChart3 size={15} />
              <div>
                <strong>{formatCurrency(approvedRevenue)}</strong>
                <span>Approved reservation value</span>
              </div>
            </div>
          </div>

          <div className="ai-split-grid">
            <div>
              <h4>Busiest facilities</h4>
              {(facilityUsage.busiestFacilities || []).length > 0 ? (
                <div className="ai-list">
                  {facilityUsage.busiestFacilities.map((facility) => (
                    <div key={facility.name} className="ai-list-item ai-list-item--stacked">
                      <div>
                        <strong>{facility.name}</strong>
                        <span>{formatNumber(facility.count)} reservation(s)</span>
                      </div>
                      <small>
                        {formatNumber(facility.guests)} guests - {facility.hours} hr - {formatCurrency(facility.revenue)}
                      </small>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="ai-empty-copy">No facility demand has been recorded in this window.</p>
              )}
            </div>
            <div>
              <h4>Reservation days</h4>
              <HorizontalBars
                items={facilityUsage.weekdayTrend}
                emptyLabel="Reservation day trends will appear once bookings exist in this window."
              />
            </div>
          </div>
        </section>

        <section className="ai-panel">
          <div className="ai-panel__header">
            <div>
              <h3>Reservation and host scope</h3>
              <p>Broader operational context for guest hosting, reservation types, and payment state.</p>
            </div>
            <Home size={18} />
          </div>

          <div className="ai-mini-stats">
            <div className="ai-mini-stat">
              <Users size={15} />
              <div>
                <strong>{topHost ? topHost.label : 'No host data'}</strong>
                <span>{topHost ? `${formatNumber(topHost.count)} hosted visits` : 'Most active host'}</span>
              </div>
            </div>
            <div className="ai-mini-stat">
              <Calendar size={15} />
              <div>
                <strong>{formatNumber(eventTypeBreakdown.length)}</strong>
                <span>Reservation event types</span>
              </div>
            </div>
            <div className="ai-mini-stat">
              <BarChart3 size={15} />
              <div>
                <strong>{formatCurrency(facilityUsage.requestedRevenue ?? approvedRevenue)}</strong>
                <span>Requested reservation value</span>
              </div>
            </div>
            <div className="ai-mini-stat">
              <TrendingUp size={15} />
              <div>
                <strong>{formatNumber(paymentStatusBreakdown.length)}</strong>
                <span>Payment states in use</span>
              </div>
            </div>
          </div>

          <div className="ai-split-grid">
            <div>
              <h4>Busiest hosts</h4>
              <HorizontalBars
                items={visitorBehavior.busiestHosts}
                emptyLabel="Host concentration will appear once more visitor or delivery records exist."
              />
            </div>
            <div>
              <h4>Reservation event types</h4>
              <HorizontalBars
                items={eventTypeBreakdown}
                emptyLabel="Reservation event types will appear once bookings are recorded."
              />
            </div>
          </div>

          <div className="ai-chart-panel ai-chart-panel--spaced">
            <h4>Reservation and payment states</h4>
            <div className="ai-split-grid">
              <div>
                <StatusPills
                  items={reservationStatusBreakdown}
                  emptyLabel="Reservation statuses will appear once bookings are recorded."
                />
              </div>
              <div>
                <StatusPills
                  items={paymentStatusBreakdown}
                  emptyLabel="Payment states will appear once reservations are processed."
                />
              </div>
            </div>
          </div>
        </section>

        <section className="ai-panel">
          <div className="ai-panel__header">
            <div>
              <h3>Resident reports</h3>
              <p>Complaint load and hotspots to help decide where follow-up should start.</p>
            </div>
            <MapPin size={18} />
          </div>

          <div className="ai-mini-stats">
            <div className="ai-mini-stat">
              <AlertCircle size={15} />
              <div>
                <strong>{formatNumber(complaintInsights.totalComplaints)}</strong>
                <span>Total reports</span>
              </div>
            </div>
            <div className="ai-mini-stat">
              <Shield size={15} />
              <div>
                <strong>{formatNumber(complaintInsights.unresolvedCount)}</strong>
                <span>Unresolved reports</span>
              </div>
            </div>
            <div className="ai-mini-stat">
              <TrendingUp size={15} />
              <div>
                <strong>{formatNumber(complaintInsights.resolvedCount)}</strong>
                <span>Resolved reports</span>
              </div>
            </div>
            <div className="ai-mini-stat">
              <MapPin size={15} />
              <div>
                <strong>{topHotspot ? topHotspot.label : 'No hotspot'}</strong>
                <span>{topHotspot ? `${formatNumber(topHotspot.count)} reports` : 'Highest concentration'}</span>
              </div>
            </div>
          </div>

          <div className="ai-split-grid">
            <div>
              <h4>Complaint hotspots</h4>
              <HorizontalBars
                items={complaintInsights.hotspots}
                emptyLabel="No complaint hotspots were detected for this timeframe."
              />
            </div>
            <div>
              <h4>Status breakdown</h4>
              <StatusPills
                items={complaintInsights.statusBreakdown}
                emptyLabel="Complaint statuses will appear once reports are submitted."
              />
            </div>
          </div>

          <div className="ai-chart-panel ai-chart-panel--spaced">
            <h4>Complaint category and urgency</h4>
            <div className="ai-split-grid">
              <div>
                <HorizontalBars
                  items={complaintCategoryBreakdown}
                  emptyLabel="Complaint categories will appear once reports are submitted."
                />
              </div>
              <div>
                <StatusPills
                  items={complaintUrgencyBreakdown}
                  emptyLabel="Complaint urgency levels will appear once reports are submitted."
                />
              </div>
            </div>
          </div>
        </section>

        <section className="ai-panel ai-panel--wide">
          <div className="ai-panel__header">
            <div>
              <h3>Alerts requiring review</h3>
              <p>Only the stronger anomaly signals are kept here so the review queue stays useful.</p>
            </div>
            <Shield size={18} />
          </div>

          {(security.anomalies || []).length > 0 ? (
            <div className="ai-alert-list">
              {security.anomalies.map((anomaly, index) => (
                <div
                  key={`${anomaly.title}-${index}`}
                  className={`ai-alert-card ai-alert-card--${getToneClass(anomaly.severity)}`}
                >
                  <div className="ai-alert-card__head">
                    <span>{titleCase(anomaly.category)}</span>
                    <strong>{Math.round((Number(anomaly.confidence) || 0) * 100)}%</strong>
                  </div>
                  <h4>{anomaly.title}</h4>
                  <p>{anomaly.summary}</p>
                  <small>{formatDateTime(anomaly.timestamp, 'Grouped signal')}</small>
                </div>
              ))}
            </div>
          ) : (
            <p className="ai-empty-copy">No high-confidence review alerts were produced for this window.</p>
          )}
        </section>
      </div>

      <div className="ai-footer-note">
        <p>
          Top facility: <strong>{topFacility ? topFacility.name : 'No reservation data'}</strong>
        </p>
      </div>
    </div>
  );
};

export default AIAnalyticsModule;
