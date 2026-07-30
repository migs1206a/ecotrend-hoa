import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiUrl } from '../../utils/api';
import {
  Archive,
  Download,
  DoorOpen,
  FileSpreadsheet,
  FileText,
  Calendar,
  MessageSquareWarning,
  RefreshCcw,
  UserCheck,
  Users
} from 'lucide-react';
import './AdminReportsManagement.css';
import PaginationControls from '../common/PaginationControls';
import { buildPaginatedUrl, parsePaginatedResponse } from '../../utils/pagination';

const reportCards = [
  {
    key: 'residents',
    title: 'Residents Report',
    description: 'Generate a full resident directory with address, contact, family, and vehicle counts.',
    icon: Users
  },
  {
    key: 'visitors',
    title: 'Visitors Report',
    description: 'Export visitor logs with host information, visit purpose, and entry or exit timestamps.',
    icon: UserCheck
  },
  {
    key: 'billing',
    title: 'Billing Report',
    description: 'Create a per-month billing export including payment states, O.R. numbers, and remarks.',
    icon: FileSpreadsheet
  },
  {
    key: 'entry_logs',
    title: 'Entry/Exit Logs Report',
    description: 'Generate a PDF of guard entry and exit logs with timestamps, owner type, plate number, and guard on duty.',
    icon: DoorOpen
  },
  {
    key: 'facilities',
    title: 'Facility Reservations Report',
    description: 'Generate a PDF of Multi-Purpose Court and Chapel reservations, payment states, approval details, and schedules.',
    icon: Calendar
  },
  {
    key: 'complaints',
    title: 'Complaints Report',
    description: 'Archive complaint records, statuses, responses, internal remarks, and evidence indicators.',
    icon: MessageSquareWarning
  }
];

const formatDateTime = (value) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString();
};

const AdminReportsManagement = ({ token, showAlert }) => {
  const [archives, setArchives] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generatingType, setGeneratingType] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [downloadId, setDownloadId] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [coverageStartDate, setCoverageStartDate] = useState('');
  const [coverageEndDate, setCoverageEndDate] = useState('');
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

  const fetchArchives = useCallback(async () => {
    setLoading(true);
    try {
      const path = buildPaginatedUrl('/reports/archives', page, filterType === 'all' ? {} : { type: filterType });
      const response = await fetch(apiUrl(path), {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        const parsed = parsePaginatedResponse(data);
        setArchives(parsed.items);
        setPagination(parsed.pagination);
      } else {
        setArchives([]);
        setPagination(null);
      }
    } catch (error) {
      console.error('Error fetching archived reports:', error);
      setArchives([]);
      setPagination(null);
    }
    setLoading(false);
  }, [filterType, page, token]);

  useEffect(() => {
    setPage(1);
  }, [filterType]);

  useEffect(() => {
    fetchArchives();
  }, [fetchArchives]);

  const summary = useMemo(
    () => ({
      total: archives.length,
      residents: archives.filter((archive) => archive.reportType === 'residents').length,
      visitors: archives.filter((archive) => archive.reportType === 'visitors').length,
      entryLogs: archives.filter((archive) => archive.reportType === 'entry_logs').length,
      facilities: archives.filter((archive) => archive.reportType === 'facilities').length,
      billing: archives.filter((archive) => archive.reportType === 'billing').length,
      complaints: archives.filter((archive) => archive.reportType === 'complaints').length
    }),
    [archives]
  );

  const generateReport = async (reportType) => {
    if ((coverageStartDate && !coverageEndDate) || (!coverageStartDate && coverageEndDate)) {
      notify('Select both coverage dates before generating a report.', 'error');
      return;
    }

    setGeneratingType(reportType);
    try {
      const response = await fetch(apiUrl('/reports/generate'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          reportType,
          startDate: coverageStartDate || undefined,
          endDate: coverageEndDate || undefined
        })
      });

      const data = await response.json();
      if (!response.ok) {
        notify(data.message || 'Failed to generate report', 'error');
        return;
      }

      await fetchArchives();
      notify(`${data.archive?.title || 'Report'} generated and archived successfully.`, 'success');
    } catch (error) {
      console.error('Error generating report:', error);
      notify('Failed to generate report', 'error');
    } finally {
      setGeneratingType('');
    }
  };

  const downloadArchive = async (archive) => {
    setDownloadId(archive._id);
    try {
      const response = await fetch(apiUrl(`/reports/${archive._id}/download`), {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        notify(data.message || 'Failed to download report', 'error');
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = archive.filename || `${archive.reportType}-report.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading report:', error);
      notify('Failed to download report', 'error');
    }
    setDownloadId('');
  };

  return (
    <div className="admin-reports-shell">
      <div className="page-header">
        <div className="page-title">
          <h2>Reports</h2>
          <p>Generate archived system reports for residents, visitors, billing, and complaints. Admin access only.</p>
        </div>
        <div className="page-header-actions">
          <button className="action-btn" onClick={fetchArchives}>
            <RefreshCcw size={16} />
            Refresh Archive
          </button>
        </div>
      </div>

      <div className="admin-reports-summary">
        <div className="admin-reports-stat">
          <Archive size={18} />
          <div><p>Total Archives</p><strong>{summary.total}</strong></div>
        </div>
        <div className="admin-reports-stat">
          <Users size={18} />
          <div><p>Resident Files</p><strong>{summary.residents}</strong></div>
        </div>
        <div className="admin-reports-stat">
          <UserCheck size={18} />
          <div><p>Visitor Files</p><strong>{summary.visitors}</strong></div>
        </div>
        <div className="admin-reports-stat">
          <DoorOpen size={18} />
          <div><p>Entry/Exit Files</p><strong>{summary.entryLogs}</strong></div>
        </div>
        <div className="admin-reports-stat">
          <Calendar size={18} />
          <div><p>Facility Files</p><strong>{summary.facilities}</strong></div>
        </div>
        <div className="admin-reports-stat">
          <FileText size={18} />
          <div><p>Billing + Complaints</p><strong>{summary.billing + summary.complaints}</strong></div>
        </div>
      </div>

      <section className="admin-reports-generator">
        <div className="admin-reports-generator-head">
          <div>
            <h3>Generate New Report</h3>
            <p>Each export is saved into the report archive so admins can download and print it again later.</p>
          </div>
          <div className="admin-reports-coverage-grid">
            <label className="admin-reports-coverage-field">
              <span>Coverage Start</span>
              <input
                type="date"
                className="form-input"
                value={coverageStartDate}
                onChange={(event) => setCoverageStartDate(event.target.value)}
              />
            </label>
            <label className="admin-reports-coverage-field">
              <span>Coverage End</span>
              <input
                type="date"
                className="form-input"
                value={coverageEndDate}
                min={coverageStartDate || undefined}
                onChange={(event) => setCoverageEndDate(event.target.value)}
              />
            </label>
          </div>
        </div>

        <div className="admin-reports-card-grid">
          {reportCards.map((report) => {
            const Icon = report.icon;
            const isGenerating = generatingType === report.key;
            return (
              <article key={report.key} className="admin-reports-card">
                <div className="admin-reports-card-icon">
                  <Icon size={18} />
                </div>
                <h4>{report.title}</h4>
                <p>{report.description}</p>
                <button
                  className="admin-reports-generate-btn"
                  onClick={() => generateReport(report.key)}
                  disabled={Boolean(generatingType)}
                >
                  <FileSpreadsheet size={16} />
                  {isGenerating ? 'Generating...' : 'Generate PDF Report'}
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <section className="admin-reports-archive">
        <div className="admin-reports-archive-head">
          <div>
            <h3>Archived Reports</h3>
            <p>Stored report files remain restricted to admin users through the protected download route.</p>
          </div>
          <select className="form-input admin-reports-filter" value={filterType} onChange={(event) => setFilterType(event.target.value)}>
            <option value="all">All Report Types</option>
            <option value="residents">Residents</option>
            <option value="visitors">Visitors</option>
            <option value="entry_logs">Entry/Exit Logs</option>
            <option value="facilities">Facility Reservations</option>
            <option value="billing">Billing</option>
            <option value="complaints">Complaints</option>
          </select>
        </div>

        {loading ? (
          <div className="loading-container">
            <div className="spinner" />
            <p className="loading-text">Loading archived reports...</p>
          </div>
        ) : archives.length === 0 ? (
          <div className="empty-state">
            <Archive size={40} style={{ color: '#9ca3af' }} />
            <h3>No Archived Reports Yet</h3>
            <p>Generate your first admin report to start building the report archive.</p>
          </div>
        ) : (
          <div className="admin-reports-archive-list">
            {archives.map((archive) => (
              <article key={archive._id} className="admin-reports-archive-card">
                <div className="admin-reports-archive-card-top">
                  <div>
                    <span className="admin-reports-type-badge">{archive.reportType}</span>
                    <h4>{archive.title}</h4>
                    <p>{archive.filename}</p>
                  </div>
                  <button
                    className="admin-reports-download-btn"
                    onClick={() => downloadArchive(archive)}
                    disabled={downloadId === archive._id}
                  >
                    <Download size={15} />
                    {downloadId === archive._id ? 'Downloading...' : 'Download'}
                  </button>
                </div>

                <div className="admin-reports-meta-grid">
                  <div className="admin-reports-meta-box">
                    <strong>Generated</strong>
                    <p>{formatDateTime(archive.createdAt)}</p>
                  </div>
                  <div className="admin-reports-meta-box">
                    <strong>Records</strong>
                    <p>{archive.recordCount}</p>
                  </div>
                  <div className="admin-reports-meta-box">
                    <strong>Generated By</strong>
                    <p>{archive.generatedByName || archive.generatedByRole || 'ADMIN'}</p>
                  </div>
                  <div className="admin-reports-meta-box">
                    <strong>Format</strong>
                    <p>{String(archive.format || 'csv').toUpperCase()}</p>
                  </div>
                  <div className="admin-reports-meta-box admin-reports-meta-box--wide">
                    <strong>Coverage</strong>
                    <p>{archive.notes || 'Coverage: All dates'}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}

        <PaginationControls pagination={pagination} onPageChange={setPage} />
      </section>
    </div>
  );
};

export default AdminReportsManagement;
