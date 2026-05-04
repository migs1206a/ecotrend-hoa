import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertCircle,
  BarChart3,
  Calendar,
  ChevronUp,
  Clock,
  Home,
  MapPin,
  RefreshCw,
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

const numberFormatter = new Intl.NumberFormat('en-PH');
const currencyFormatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0
});

const formatNumber = (value) => numberFormatter.format(Number(value) || 0);

const formatCurrency = (value) => currencyFormatter.format(Number(value) || 0);

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

const MetricCard = ({ icon: Icon, label, value, detail, tone = 'info' }) => (
  <div className={`ai-analytics-card ai-analytics-card--${tone}`}>
    <div className="ai-analytics-card__icon">
      <Icon size={18} />
    </div>
    <div className="ai-analytics-card__body">
      <p>{label}</p>
      <h3>{value}</h3>
      <span>{detail}</span>
    </div>
  </div>
);

const ProgressRows = ({ items, valueKey = 'count', emptyLabel = 'No data available yet.' }) => {
  const maxValue = useMemo(
    () => Math.max(1, ...(items || []).map((item) => Number(item?.[valueKey]) || 0)),
    [items, valueKey]
  );

  if (!Array.isArray(items) || items.length === 0) {
    return <p className="ai-empty-copy">{emptyLabel}</p>;
  }

  return (
    <div className="ai-progress-list">
      {items.map((item, index) => {
        const value = Number(item?.[valueKey]) || 0;
        const width = Math.max(6, (value / maxValue) * 100);

        return (
          <div key={`${item.label || item.name || 'row'}-${index}`} className="ai-progress-row">
            <div className="ai-progress-row__header">
              <span>{item.label || item.name}</span>
              <strong>{formatNumber(value)}</strong>
            </div>
            <div className="ai-progress-bar">
              <div className="ai-progress-bar__fill" style={{ width: `${width}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
};

const AIAnalyticsModule = ({ token, showAlert }) => {
  const moduleTopRef = useRef(null);
  const [windowDays, setWindowDays] = useState(30);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [activeView, setActiveView] = useState('all');

  const fetchAnalytics = useCallback(
    async (days, { silent = false } = {}) => {
      try {
        setError('');
        if (silent) {
          setRefreshing(true);
        } else {
          setLoading(true);
        }

        const response = await fetch(apiUrl(`/analytics/overview?days=${days}`), {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Unable to load AI analytics');
        }

        setAnalytics(data);
      } catch (fetchError) {
        const message = fetchError.message || 'Unable to load AI analytics';
        setError(message);

        if (typeof showAlert === 'function') {
          showAlert(message);
        }
      } finally {
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
  const security = analytics?.security || {};
  const engineMode = analytics?.engine?.mlAvailable ? 'ML-enhanced' : 'Python heuristic';
  const recommendationCount = (security.recommendations || []).length;

  const scrollToTop = useCallback(() => {
    moduleTopRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    });
  }, []);

  const handleViewChange = useCallback(
    (viewId) => {
      setActiveView(viewId);

      if (typeof window !== 'undefined') {
        window.requestAnimationFrame(() => {
          scrollToTop();
        });
      }
    },
    [scrollToTop]
  );

  const quickViews = [
    {
      id: 'all',
      label: 'All Panels',
      icon: BarChart3,
      badge: `${formatNumber(summary.monitoredEvents)} events`
    },
    {
      id: 'security',
      label: 'Security',
      icon: Shield,
      badge: `${formatNumber(summary.anomalyCount)} flags`
    },
    {
      id: 'movement',
      label: 'Movement',
      icon: Activity,
      badge: `${formatNumber(visitorBehavior.insideCount)} inside`
    },
    {
      id: 'operations',
      label: 'Operations',
      icon: Home,
      badge: `${formatNumber(facilityUsage.totalReservations)} reservations`
    },
    {
      id: 'actions',
      label: 'Actions',
      icon: TrendingUp,
      badge: `${formatNumber(recommendationCount)} next steps`
    }
  ];

  const showSecurityView = activeView === 'all' || activeView === 'security';
  const showMovementView = activeView === 'all' || activeView === 'movement';
  const showOperationsView = activeView === 'all' || activeView === 'operations';
  const showActionsView = activeView === 'all' || activeView === 'actions';

  const summaryCards = [
    {
      icon: Shield,
      label: 'Security Risk Score',
      value: `${formatNumber(summary.riskScore)}/100`,
      detail: `${titleCase(summary.riskLevel || 'low')} risk outlook`,
      tone: getToneClass(summary.riskLevel)
    },
    {
      icon: AlertCircle,
      label: 'Detected Anomalies',
      value: formatNumber(summary.anomalyCount),
      detail: 'Flagged by AI analytics',
      tone: summary.anomalyCount > 0 ? 'warning' : 'success'
    },
    {
      icon: Activity,
      label: 'Monitored Events',
      value: formatNumber(summary.monitoredEvents),
      detail: `${formatNumber(summary.entryLogs)} gate logs in window`,
      tone: 'info'
    },
    {
      icon: Users,
      label: 'Resident Pressure',
      value: formatNumber(summary.unresolvedComplaints),
      detail: `${formatNumber(summary.totalResidents)} approved resident accounts`,
      tone: summary.unresolvedComplaints > 0 ? 'warning' : 'success'
    }
  ];

  if (loading && !analytics) {
    return (
      <div className="ai-analytics-module" ref={moduleTopRef}>
        <div className="ai-analytics-loading">
          <div className="ai-analytics-spinner" />
          <h3>Generating AI analytics</h3>
          <p>We're processing entry logs, reservations, and resident reports through the Python analytics engine.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="ai-analytics-module" ref={moduleTopRef}>
      <div className="ai-analytics-hero">
        <div className="ai-analytics-hero__copy">
          <div className="ai-analytics-kicker">
            <BarChart3 size={16} />
            <span>AI Analytics Module</span>
          </div>
          <h2>Security and operational intelligence for the subdivision</h2>
          <p>
            This dashboard turns entry logs, visitor behavior, facility reservations, and resident-submitted
            reports into actionable indicators for faster monitoring and decision-making.
          </p>
        </div>
        <div className="ai-analytics-hero__controls">
          <label className="ai-analytics-select">
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
          <div className="ai-engine-badge">
            <span>Python Engine</span>
            <strong>{engineMode}</strong>
          </div>
        </div>
      </div>

      {error && (
        <div className="ai-inline-error">
          <AlertCircle size={18} />
          <span>{error}</span>
        </div>
      )}

      <div className="ai-analytics-summary">
        {summaryCards.map((card) => (
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

      <div className="ai-highlight-strip">
        {(analytics?.highlights || []).length > 0 ? (
          analytics.highlights.map((highlight, index) => (
            <div key={`${highlight.title}-${index}`} className={`ai-highlight ai-highlight--${getToneClass(highlight.tone)}`}>
              <strong>{highlight.title}</strong>
              <p>{highlight.description}</p>
            </div>
          ))
        ) : (
          <div className="ai-highlight ai-highlight--info">
            <strong>Analytics ready</strong>
            <p>More highlights will appear automatically as activity builds up in the selected date window.</p>
          </div>
        )}
      </div>

      <div className="ai-view-toolbar">
        <div className="ai-view-toolbar__copy">
          <strong>Quick views</strong>
          <span>Open one area at a time so the page stays short and easy to scan.</span>
        </div>
        <div className="ai-view-toolbar__actions">
          {quickViews.map((view) => {
            const Icon = view.icon;

            return (
              <button
                key={view.id}
                type="button"
                className={`ai-view-btn ${activeView === view.id ? 'is-active' : ''}`}
                onClick={() => handleViewChange(view.id)}
                aria-pressed={activeView === view.id}
              >
                <span className="ai-view-btn__main">
                  <Icon size={15} />
                  <span>{view.label}</span>
                </span>
                <small>{view.badge}</small>
              </button>
            );
          })}
          <button type="button" className="ai-top-btn" onClick={scrollToTop}>
            <ChevronUp size={15} />
            <span>Top</span>
          </button>
        </div>
      </div>

      <div className={`ai-analytics-grid ${activeView !== 'all' ? 'ai-analytics-grid--focused' : ''}`}>
        {showSecurityView && (
          <section className="ai-panel ai-panel--primary">
            <div className="ai-panel__header">
              <div>
                <h3>Security Risk Outlook</h3>
                <p>Machine-assisted indicators summarizing the current monitoring pressure.</p>
              </div>
              <div className={`ai-risk-badge ai-risk-badge--${getToneClass(summary.riskLevel)}`}>
                <Shield size={15} />
                <span>{titleCase(summary.riskLevel || 'low')}</span>
              </div>
            </div>

            <div className="ai-risk-score">
              <div className="ai-risk-score__ring-wrap">
                <div className="ai-risk-score__ring">
                  <strong>{formatNumber(summary.riskScore)}</strong>
                  <span>/100</span>
                </div>
                <p className="ai-risk-score__caption">Current security score</p>
              </div>
              <div className="ai-risk-score__meta">
                <div className="ai-risk-meta-card">
                  <span className="ai-risk-meta-label">Last generated</span>
                  <strong>{formatDateTime(analytics?.generatedAt)}</strong>
                </div>
                <div className="ai-risk-meta-card">
                  <span className="ai-risk-meta-label">Coverage</span>
                  <strong>
                    Tracking {formatNumber(summary.monitoredEvents)} events across the last {analytics?.windowDays || windowDays} days.
                  </strong>
                </div>
              </div>
            </div>

            <div className="ai-indicator-list">
              {(security.indicators || []).map((indicator, index) => (
                <div key={`${indicator.label}-${index}`} className={`ai-indicator ai-indicator--${getToneClass(indicator.severity)}`}>
                  <div className="ai-indicator__head">
                    <strong>{indicator.label}</strong>
                    <span>{indicator.value}</span>
                  </div>
                  <p>{indicator.description}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        {showSecurityView && (
          <section className="ai-panel">
            <div className="ai-panel__header">
              <div>
                <h3>Detected Anomalies</h3>
                <p>Unusual access patterns, overstays, and complaint clusters that need human review.</p>
              </div>
            </div>
            <div className="ai-anomaly-list">
              {(security.anomalies || []).length > 0 ? (
                security.anomalies.map((anomaly, index) => (
                  <div key={`${anomaly.title}-${index}`} className={`ai-anomaly ai-anomaly--${getToneClass(anomaly.severity)}`}>
                    <div className="ai-anomaly__header">
                      <span className="ai-anomaly__category">{titleCase(anomaly.category)}</span>
                      <strong>{Math.round((Number(anomaly.confidence) || 0) * 100)}%</strong>
                    </div>
                    <h4>{anomaly.title}</h4>
                    <p>{anomaly.summary}</p>
                    <div className="ai-anomaly__footer">
                      <span>{formatDateTime(anomaly.timestamp, 'Ongoing / grouped signal')}</span>
                      <span>{titleCase(anomaly.severity)}</span>
                    </div>
                  </div>
                ))
              ) : (
                <p className="ai-empty-copy">No high-confidence anomalies were detected in this window.</p>
              )}
            </div>
          </section>
        )}

        {showMovementView && (
          <section className="ai-panel">
            <div className="ai-panel__header">
              <div>
                <h3>Visitor Behavior</h3>
                <p>Behavioral signals from visitors and delivery flows across the selected period.</p>
              </div>
              <Users size={18} />
            </div>
            <div className="ai-mini-stats">
              <div className="ai-mini-stat">
                <Clock size={16} />
                <div>
                  <strong>{formatMinutes(visitorBehavior.averageVisitMinutes)}</strong>
                  <span>Average visitor stay</span>
                </div>
              </div>
              <div className="ai-mini-stat">
                <Clock size={16} />
                <div>
                  <strong>{formatMinutes(visitorBehavior.averageDeliveryMinutes)}</strong>
                  <span>Average delivery stay</span>
                </div>
              </div>
              <div className="ai-mini-stat">
                <TrendingUp size={16} />
                <div>
                  <strong>{visitorBehavior.peakHourLabel || 'No activity'}</strong>
                  <span>Peak activity hour</span>
                </div>
              </div>
              <div className="ai-mini-stat">
                <AlertCircle size={16} />
                <div>
                  <strong>{formatNumber(visitorBehavior.insideCount)}</strong>
                  <span>Open inside sessions</span>
                </div>
              </div>
            </div>

            <div className="ai-split-content">
              <div>
                <h4>Top visit purposes</h4>
                <ProgressRows
                  items={visitorBehavior.purposeBreakdown}
                  emptyLabel="Visit purpose trends will show once more visitor records are available."
                />
              </div>
              <div>
                <h4>Repeat visitors</h4>
                {(visitorBehavior.repeatVisitors || []).length > 0 ? (
                  <div className="ai-compact-list">
                    {visitorBehavior.repeatVisitors.map((visitor) => (
                      <div key={`${visitor.name}-${visitor.host}`} className="ai-compact-item">
                        <div>
                          <strong>{visitor.name}</strong>
                          <span>{visitor.host}</span>
                        </div>
                        <span>{formatNumber(visitor.count)} visit(s)</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="ai-empty-copy">No repeat-visitor pattern was strong enough to highlight yet.</p>
                )}
              </div>
            </div>
          </section>
        )}

        {showOperationsView && (
          <section className="ai-panel">
            <div className="ai-panel__header">
              <div>
                <h3>Facility Usage Trends</h3>
                <p>Reservation demand, guest load, and facility pressure in the current analytics window.</p>
              </div>
              <Home size={18} />
            </div>
            <div className="ai-mini-stats">
              <div className="ai-mini-stat">
                <Calendar size={16} />
                <div>
                  <strong>{formatNumber(facilityUsage.totalReservations)}</strong>
                  <span>Total reservations</span>
                </div>
              </div>
              <div className="ai-mini-stat">
                <TrendingUp size={16} />
                <div>
                  <strong>{facilityUsage.approvalRate || 0}%</strong>
                  <span>Approval rate</span>
                </div>
              </div>
              <div className="ai-mini-stat">
                <Users size={16} />
                <div>
                  <strong>{formatNumber(facilityUsage.totalGuests)}</strong>
                  <span>Projected guest load</span>
                </div>
              </div>
              <div className="ai-mini-stat">
                <BarChart3 size={16} />
                <div>
                  <strong>{formatCurrency(facilityUsage.estimatedRevenue)}</strong>
                  <span>Reservation value</span>
                </div>
              </div>
            </div>

            <div className="ai-split-content">
              <div>
                <h4>Busiest facilities</h4>
                {(facilityUsage.busiestFacilities || []).length > 0 ? (
                  <div className="ai-compact-list">
                    {facilityUsage.busiestFacilities.map((facility) => (
                      <div key={facility.name} className="ai-compact-item ai-compact-item--stacked">
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
                  <p className="ai-empty-copy">Facility demand trends will appear once reservations are recorded in this window.</p>
                )}
              </div>
              <div>
                <h4>Reservation days</h4>
                <ProgressRows
                  items={facilityUsage.weekdayTrend}
                  emptyLabel="No reservation activity detected for the selected date window."
                />
              </div>
            </div>
          </section>
        )}

        {showOperationsView && (
          <section className="ai-panel">
            <div className="ai-panel__header">
              <div>
                <h3>Resident Reports and Hotspots</h3>
                <p>Complaint concentration helps reveal streets or locations that need attention first.</p>
              </div>
              <MapPin size={18} />
            </div>
            <div className="ai-mini-stats">
              <div className="ai-mini-stat">
                <AlertCircle size={16} />
                <div>
                  <strong>{formatNumber(complaintInsights.totalComplaints)}</strong>
                  <span>Total reports in window</span>
                </div>
              </div>
              <div className="ai-mini-stat">
                <Shield size={16} />
                <div>
                  <strong>{formatNumber(complaintInsights.unresolvedCount)}</strong>
                  <span>Unresolved reports</span>
                </div>
              </div>
              <div className="ai-mini-stat">
                <TrendingUp size={16} />
                <div>
                  <strong>{formatNumber(complaintInsights.resolvedCount)}</strong>
                  <span>Resolved reports</span>
                </div>
              </div>
            </div>

            <div className="ai-split-content">
              <div>
                <h4>Complaint hotspots</h4>
                <ProgressRows
                  items={complaintInsights.hotspots}
                  emptyLabel="No complaint hotspots were detected for this timeframe."
                />
              </div>
              <div>
                <h4>Status breakdown</h4>
                <div className="ai-pill-list">
                  {(complaintInsights.statusBreakdown || []).length > 0 ? (
                    complaintInsights.statusBreakdown.map((item) => (
                      <span key={item.label} className="ai-pill">
                        {item.label}: {formatNumber(item.count)}
                      </span>
                    ))
                  ) : (
                    <p className="ai-empty-copy">Complaint statuses will appear once reports are submitted.</p>
                  )}
                </div>
              </div>
            </div>
          </section>
        )}

        {showMovementView && (
          <section className="ai-panel">
            <div className="ai-panel__header">
              <div>
                <h3>Access Activity Pattern</h3>
                <p>Hourly and daily views make it easier to spot crowding windows and quiet periods.</p>
              </div>
              <Activity size={18} />
            </div>
            <div className="ai-split-content">
              <div>
                <h4>Hourly access pattern</h4>
                <ProgressRows
                  items={security.hourlyActivity}
                  emptyLabel="Hourly activity bars will populate after gate movement is recorded."
                />
              </div>
              <div>
                <h4>Recent daily activity</h4>
                {(security.dailyActivity || []).length > 0 ? (
                  <div className="ai-compact-list">
                    {security.dailyActivity.map((day) => (
                      <div key={day.date} className="ai-compact-item ai-compact-item--stacked">
                        <div>
                          <strong>{day.label}</strong>
                          <span>{formatNumber(day.total)} tracked events</span>
                        </div>
                        <small>
                          {formatNumber(day.entries)} gate - {formatNumber(day.visits)} visits - {formatNumber(day.complaints)} complaints - {formatNumber(day.reservations)} reservations
                        </small>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="ai-empty-copy">Recent activity bars will appear once enough records exist in the selected window.</p>
                )}
              </div>
            </div>
          </section>
        )}

        {showActionsView && (
          <section className="ai-panel">
            <div className="ai-panel__header">
              <div>
                <h3>Machine Recommendations</h3>
                <p>AI-generated next steps based on the latest trends, anomalies, and unresolved pressure points.</p>
              </div>
            </div>
            {(security.recommendations || []).length > 0 ? (
              <div className="ai-recommendation-list">
                {security.recommendations.map((recommendation, index) => (
                  <div
                    key={`${recommendation.title}-${index}`}
                    className={`ai-recommendation ai-recommendation--${getToneClass(recommendation.priority)}`}
                  >
                    <div className="ai-recommendation__head">
                      <strong>{recommendation.title}</strong>
                      <span>{titleCase(recommendation.priority)}</span>
                    </div>
                    <p>{recommendation.description}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="ai-empty-copy">Recommendations will appear automatically as more operational data becomes available.</p>
            )}
          </section>
        )}
      </div>
    </div>
  );
};

export default AIAnalyticsModule;
