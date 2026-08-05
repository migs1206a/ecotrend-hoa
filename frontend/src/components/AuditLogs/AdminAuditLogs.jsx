import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Archive,
  Clock3,
  Download,
  Filter,
  History,
  Search,
  ShieldCheck,
  UserRound
} from 'lucide-react';
import { apiUrl } from '../../utils/api';
import './AdminAuditLogs.css';
import PaginationControls from '../common/PaginationControls';
import { buildPaginatedUrl, parsePaginatedResponse } from '../../utils/pagination';
import { ADMIN_MODULE_OPTIONS } from '../../utils/adminPermissions';

const API = '/admin-audit-logs';

const EVENT_TYPE_OPTIONS = [
  { value: '', label: 'All Activity' },
  { value: 'access', label: 'Module Access' },
  { value: 'action', label: 'System Actions' }
];

const MODULE_FILTER_OPTIONS = [
  { value: '', label: 'All Modules' },
  ...ADMIN_MODULE_OPTIONS.map((module) => ({
    value: module.value,
    label: module.label
  })),
  { value: 'manage_accounts', label: 'Manage Accounts' }
];

const formatDateTime = (value) => {
  if (!value) {
    return 'No timestamp';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'No timestamp' : date.toLocaleString();
};

const formatRequestMeta = (log = {}) => {
  return log.eventType === 'access' ? 'Module opened' : 'Action completed';
  /*
  const code = Number(log.statusCode) || 0;
  const statusLabel = getHttpStatusLabel(code);

  if (log.eventType === 'access') {
    return `Access log recorded (${code || '-'} ${statusLabel})`;
  }

  const method = String(log.method || '').trim().toUpperCase();
  return method
    ? `${method} · ${statusLabel} (${code || '-'})`
    : `${statusLabel} (${code || '-'})`;
  */
};

const AdminAuditLogs = ({ token, showAlert }) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [coverageStartDate, setCoverageStartDate] = useState('');
  const [coverageEndDate, setCoverageEndDate] = useState('');
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [archiveWindowDays, setArchiveWindowDays] = useState(30);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveMeta, setArchiveMeta] = useState({
    archives: [],
    retentionDays: 45,
    suggestedArchiveDays: 30,
    eligibleLogCount: 0
  });

  const headers = useCallback(
    () => ({
      Authorization: `Bearer ${token}`
    }),
    [token]
  );

  const fetchLogs = useCallback(async (targetPage = 1) => {
    try {
      const coverageParams = coverageStartDate && coverageEndDate
        ? {
            startDate: coverageStartDate,
            endDate: coverageEndDate
          }
        : {};
      const response = await fetch(
        apiUrl(
          buildPaginatedUrl(API, targetPage, {
            q: searchQuery.trim(),
            module: moduleFilter,
            eventType: eventTypeFilter,
            ...coverageParams
          })
        ),
        { headers: headers() }
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || 'Failed to load audit logs');
      }

      const parsed = parsePaginatedResponse(data);
      setLogs(parsed.items);
      setPagination(parsed.pagination);
    } catch (error) {
      setLogs([]);
      setPagination(null);
      showAlert && showAlert(error.message || 'Failed to load audit logs', 'error');
    }
  }, [coverageEndDate, coverageStartDate, eventTypeFilter, headers, moduleFilter, searchQuery, showAlert]);

  const fetchArchives = useCallback(async () => {
    try {
      const response = await fetch(apiUrl(`${API}/archives`), { headers: headers() });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || 'Failed to load audit log archives');
      }

      setArchiveMeta({
        archives: Array.isArray(data.archives) ? data.archives : [],
        retentionDays: Number(data.retentionDays) || 45,
        suggestedArchiveDays: Number(data.suggestedArchiveDays) || 30,
        eligibleLogCount: Number(data.eligibleLogCount) || 0
      });

      setArchiveWindowDays((previous) => previous || Number(data.suggestedArchiveDays) || 30);
    } catch (error) {
      showAlert && showAlert(error.message || 'Failed to load audit log archives', 'error');
    }
  }, [headers, showAlert]);

  useEffect(() => {
    let cancelled = false;

    const loadLogs = async () => {
      setLoading(true);
      await fetchLogs(page);

      if (!cancelled) {
        setLoading(false);
      }
    };

    loadLogs();

    return () => {
      cancelled = true;
    };
  }, [fetchLogs, page]);

  useEffect(() => {
    fetchArchives();
  }, [fetchArchives]);

  const handleSearchChange = (value) => {
    setSearchQuery(value);
    setPage(1);
  };

  const handleModuleFilterChange = (value) => {
    setModuleFilter(value);
    setPage(1);
  };

  const handleEventTypeChange = (value) => {
    setEventTypeFilter(value);
    setPage(1);
  };

  const handleArchive = async () => {
    setArchiveLoading(true);

    try {
      const response = await fetch(apiUrl(`${API}/archive`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers()
        },
        body: JSON.stringify({
          olderThanDays: archiveWindowDays
        })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || 'Failed to archive audit logs');
      }

      showAlert && showAlert(data.message || 'Audit logs archived successfully.', 'success');
      setPage(1);
      await Promise.all([
        fetchLogs(1),
        fetchArchives()
      ]);
    } catch (error) {
      showAlert && showAlert(error.message || 'Failed to archive audit logs', 'error');
    } finally {
      setArchiveLoading(false);
    }
  };

  const handleDownloadArchive = async (archive) => {
    try {
      const response = await fetch(apiUrl(`${API}/archives/${archive._id}/download`), {
        headers: headers()
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.message || 'Failed to download archive');
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = archive.filename || 'admin-audit-log-archive.json';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (error) {
      showAlert && showAlert(error.message || 'Failed to download archive', 'error');
    }
  };

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);

    try {
      if ((coverageStartDate && !coverageEndDate) || (!coverageStartDate && coverageEndDate)) {
        throw new Error('Select both coverage dates before downloading the PDF.');
      }

      const params = new URLSearchParams();
      const trimmedQuery = searchQuery.trim();

      if (trimmedQuery) {
        params.set('q', trimmedQuery);
      }

      if (moduleFilter) {
        params.set('module', moduleFilter);
      }

      if (eventTypeFilter) {
        params.set('eventType', eventTypeFilter);
      }

      if (coverageStartDate && coverageEndDate) {
        params.set('startDate', coverageStartDate);
        params.set('endDate', coverageEndDate);
      }

      const queryString = params.toString();
      const response = await fetch(
        apiUrl(`${API}/export/pdf${queryString ? `?${queryString}` : ''}`),
        { headers: headers() }
      );

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.message || 'Failed to download audit log PDF');
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get('content-disposition') || '';
      const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
      const filename = filenameMatch?.[1] || 'admin-audit-logs.pdf';
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      showAlert && showAlert(error.message || 'Failed to download audit log PDF', 'error');
    } finally {
      setDownloadingPdf(false);
    }
  };

  const summary = useMemo(() => {
    const accessCount = logs.filter((log) => log.eventType === 'access').length;
    const actionCount = logs.filter((log) => log.eventType !== 'access').length;

    return {
      totalLogs: pagination?.total ?? logs.length,
      accessCount,
      actionCount,
      latestTimestamp: logs[0]?.createdAt || ''
    };
  }, [logs, pagination]);

  return (
    <div className="admin-audit-root">
      <div className="page-header">
        <div className="page-title">
          <h2>Audit Logs</h2>
          <p>Review which admin modules were opened and which admin-side actions were completed across the system.</p>
        </div>
        <div className="admin-audit-page-actions">
          <button
            type="button"
            className="admin-audit-export-btn"
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
          >
            <Download size={16} />
            {downloadingPdf ? 'Preparing PDF...' : 'Download PDF'}
          </button>
        </div>
      </div>

      <div className="admin-audit-storage">
        <div className="admin-audit-storage-copy">
          <h3><Archive size={18} /> Retention &amp; Archive</h3>
          <div className="admin-audit-storage-meta">
            <span>{archiveMeta.eligibleLogCount} log{archiveMeta.eligibleLogCount === 1 ? '' : 's'} currently ready to archive</span>
            <span>{archiveMeta.archives.length} archive file{archiveMeta.archives.length === 1 ? '' : 's'} saved</span>
          </div>
        </div>
        <div className="admin-audit-storage-actions">
          <label className="admin-audit-days">
            <span>Archive logs older than</span>
            <input
              type="number"
              min="1"
              max="3650"
              value={archiveWindowDays}
              onChange={(event) => setArchiveWindowDays(Number(event.target.value) || 1)}
            />
            <strong>days</strong>
          </label>
          <button className="admin-audit-archive-btn" onClick={handleArchive} disabled={archiveLoading}>
            <Archive size={16} />
            {archiveLoading ? 'Archiving...' : 'Archive Old Logs'}
          </button>
        </div>
      </div>

      {archiveMeta.archives.length > 0 && (
        <div className="admin-audit-archives-card">
          <div className="admin-audit-table-head">
            <div>
              <h3><Download size={18} /> Archived Audit Log Files</h3>
              <p>These JSON exports are stored outside MongoDB so you can keep old history without consuming Atlas storage.</p>
            </div>
          </div>

          <div className="admin-audit-archives-list">
            {archiveMeta.archives.map((archive) => (
              <div key={archive._id} className="admin-audit-archive-item">
                <div>
                  <strong>{archive.filename}</strong>
                  <span>{archive.logCount} log record{archive.logCount === 1 ? '' : 's'} archived on {formatDateTime(archive.createdAt)}</span>
                  <small>Cutoff: {formatDateTime(archive.archivedBefore)}</small>
                </div>
                <button className="admin-audit-download-btn" onClick={() => handleDownloadArchive(archive)}>
                  <Download size={15} />
                  Download
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="admin-audit-summary">
        <div className="admin-audit-card">
          <div className="admin-audit-icon"><History size={18} /></div>
          <div>
            <p>Total Records</p>
            <strong>{summary.totalLogs}</strong>
          </div>
        </div>
        <div className="admin-audit-card">
          <div className="admin-audit-icon access"><Activity size={18} /></div>
          <div>
            <p>Access Logs on This Page</p>
            <strong>{summary.accessCount}</strong>
          </div>
        </div>
        <div className="admin-audit-card">
          <div className="admin-audit-icon success"><ShieldCheck size={18} /></div>
          <div>
            <p>Actions on This Page</p>
            <strong>{summary.actionCount}</strong>
          </div>
        </div>
        <div className="admin-audit-card">
          <div className="admin-audit-icon time"><Clock3 size={18} /></div>
          <div>
            <p>Latest Recorded</p>
            <strong>{summary.latestTimestamp ? formatDateTime(summary.latestTimestamp) : 'No activity yet'}</strong>
          </div>
        </div>
      </div>

      <div className="admin-audit-table-card">
        <div className="admin-audit-table-head">
          <div>
            <h3><ShieldCheck size={18} /> Admin Activity Timeline</h3>
            <p>Search by admin name, role, action, or module to quickly trace recent system history.</p>
          </div>
        </div>

        <div className="admin-audit-filters">
          <label className="admin-audit-search">
            <Search size={16} />
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder="Search by admin, role, action, or module..."
            />
          </label>

          <label className="admin-audit-select">
            <Filter size={16} />
            <select value={moduleFilter} onChange={(event) => handleModuleFilterChange(event.target.value)}>
              {MODULE_FILTER_OPTIONS.map((option) => (
                <option key={option.value || 'all-modules'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="admin-audit-select">
            <Activity size={16} />
            <select value={eventTypeFilter} onChange={(event) => handleEventTypeChange(event.target.value)}>
              {EVENT_TYPE_OPTIONS.map((option) => (
                <option key={option.value || 'all-events'} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="admin-audit-select admin-audit-select-date">
            <Clock3 size={16} />
            <input
              type="date"
              value={coverageStartDate}
              onChange={(event) => {
                setCoverageStartDate(event.target.value);
                setPage(1);
              }}
            />
          </label>

          <label className="admin-audit-select admin-audit-select-date">
            <Clock3 size={16} />
            <input
              type="date"
              value={coverageEndDate}
              min={coverageStartDate || undefined}
              onChange={(event) => {
                setCoverageEndDate(event.target.value);
                setPage(1);
              }}
            />
          </label>
        </div>

        {loading ? (
          <div className="loading-container">
            <div className="spinner" />
            <p className="loading-text">Loading audit logs...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon"><History size={36} style={{ color: '#9ca3af' }} /></div>
            <h3>No Audit Records Found</h3>
            <p>Activity will appear here once admins begin opening modules and completing actions.</p>
          </div>
        ) : (
          <div className="admin-audit-table-wrap">
            <table className="admin-audit-table">
              <thead>
                <tr>
                  <th>Admin</th>
                  <th>Role</th>
                  <th>Module</th>
                  <th>Action</th>
                  <th>Details</th>
                  <th>Date &amp; Time</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log._id}>
                    <td>
                      <div className="admin-audit-actor">
                        <div className="admin-audit-avatar">
                          <UserRound size={16} />
                        </div>
                        <div>
                          <strong>{log.actor?.firstName || log.actor?.fullName || log.actor?.username || 'Admin'}</strong>
                          <span>{log.actor?.fullName || (log.actor?.username ? `@${log.actor.username}` : 'Officer account')}</span>
                        </div>
                      </div>
                    </td>
                    <td>{log.actor?.role || log.actor?.accountType || 'Officer'}</td>
                    <td>{log.moduleLabel || log.moduleKey || 'Module'}</td>
                    <td>
                      <span className={`admin-audit-badge ${log.eventType === 'access' ? 'access' : 'action'}`}>
                        {log.action}
                      </span>
                    </td>
                    <td className="admin-audit-description">{log.descriptionDisplay || log.description}</td>
                    <td>
                      <div className="admin-audit-time">
                        <strong>{formatDateTime(log.createdAt)}</strong>
                        <span>{formatRequestMeta(log)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <PaginationControls pagination={pagination} onPageChange={setPage} />
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminAuditLogs;
