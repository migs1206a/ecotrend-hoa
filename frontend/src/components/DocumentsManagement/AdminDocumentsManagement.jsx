import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiUrl, assetUrl } from '../../utils/api';
import { Download, Eye, FileText, LayoutGrid, Search, Table2, XCircle } from 'lucide-react';
import PaginationControls from '../common/PaginationControls';
import { buildPaginatedUrl, parsePaginatedResponse } from '../../utils/pagination';
import './AdminDocumentsManagement.css';

const statusMap = {
  pending: { label: 'Pending', className: 'admin-doc-status pending' },
  in_review: { label: 'In Review', className: 'admin-doc-status review' },
  approved: { label: 'Approved', className: 'admin-doc-status approved' },
  rejected: { label: 'Rejected', className: 'admin-doc-status rejected' }
};

const AdminDocumentsManagement = ({ token }) => {
  const [residents, setResidents] = useState([]);
  const [selectedResidentId, setSelectedResidentId] = useState('all');
  const [submissions, setSubmissions] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingId, setEditingId] = useState('');
  const [statusDraft, setStatusDraft] = useState('pending');
  const [remarksDraft, setRemarksDraft] = useState('');
  const [previewFile, setPreviewFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [viewMode, setViewMode] = useState('card');

  const fetchResidents = useCallback(async () => {
    try {
      const response = await fetch(apiUrl('/residents/approved'), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      setResidents(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching residents for documents module:', error);
      setResidents([]);
    }
  }, [token]);

  const fetchSubmissions = useCallback(async () => {
    setLoading(true);
    try {
      const path = buildPaginatedUrl('/documents/all', page, selectedResidentId === 'all' ? {} : { residentId: selectedResidentId });
      const response = await fetch(apiUrl(path), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      const parsed = parsePaginatedResponse(data);
      setSubmissions(parsed.items);
      setPagination(parsed.pagination);
    } catch (error) {
      console.error('Error fetching all resident document submissions:', error);
      setSubmissions([]);
      setPagination(null);
    }
    setLoading(false);
  }, [page, selectedResidentId, token]);

  useEffect(() => {
    fetchResidents();
  }, [fetchResidents]);

  useEffect(() => {
    setPage(1);
  }, [selectedResidentId]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  const filteredSubmissions = useMemo(
    () =>
      submissions.filter((submission) => {
        const query = searchQuery.trim().toLowerCase();
        return (
          !query ||
          submission.residentName?.toLowerCase().includes(query) ||
          submission.subject?.toLowerCase().includes(query) ||
          submission.documentType?.toLowerCase().includes(query)
        );
      }),
    [searchQuery, submissions]
  );

  const startReview = (submission) => {
    setEditingId(submission._id);
    setStatusDraft(submission.status);
    setRemarksDraft(submission.adminRemarks || '');
  };

  const saveReview = async (submissionId) => {
    setSaving(true);
    try {
      const response = await fetch(apiUrl(`/documents/${submissionId}/status`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          status: statusDraft,
          adminRemarks: remarksDraft
        })
      });
      const data = await response.json();
      if (!response.ok) {
        window.alert(data.message || 'Failed to review document submission');
        return;
      }
      setEditingId('');
      fetchSubmissions();
    } catch (error) {
      console.error('Error reviewing document submission:', error);
      window.alert('Failed to review document submission');
    }
    setSaving(false);
  };

  const summary = useMemo(
    () => ({
      total: submissions.length,
      pending: submissions.filter((item) => item.status === 'pending').length,
      review: submissions.filter((item) => item.status === 'in_review').length,
      approved: submissions.filter((item) => item.status === 'approved').length
    }),
    [submissions]
  );

  return (
    <div className="admin-doc-shell">
      <div className="page-header">
        <div className="page-title">
          <h2>Resident Documents &amp; Forms</h2>
          <p>Choose a resident, review their uploaded forms, view attached files, and update review status.</p>
        </div>
      </div>

      <div className="admin-doc-summary">
        <div className="admin-doc-stat"><p>Total Files</p><strong>{summary.total}</strong></div>
        <div className="admin-doc-stat"><p>Pending</p><strong>{summary.pending}</strong></div>
        <div className="admin-doc-stat"><p>In Review</p><strong>{summary.review}</strong></div>
        <div className="admin-doc-stat"><p>Approved</p><strong>{summary.approved}</strong></div>
      </div>

      <div className="admin-doc-toolbar">
        <div className="admin-doc-search">
          <Search size={18} />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by resident, subject, or form type..."
          />
        </div>
        <select className="form-input admin-doc-filter" value={selectedResidentId} onChange={(event) => setSelectedResidentId(event.target.value)}>
          <option value="all">All Residents</option>
          {residents.map((resident) => (
            <option key={resident._id} value={resident._id}>{resident.familyName}</option>
          ))}
        </select>
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

      {loading ? (
        <div className="loading-container">
          <div className="spinner" />
          <p className="loading-text">Loading resident documents...</p>
        </div>
      ) : filteredSubmissions.length === 0 ? (
        <div className="empty-state">
          <FileText size={40} style={{ color: '#9ca3af' }} />
          <h3>No Resident Document Forms Found</h3>
          <p>Submitted forms will appear here once residents upload them.</p>
        </div>
      ) : viewMode === 'table' ? (
        <div className="module-table-card">
          <div className="module-table-wrap">
            <table className="module-table">
              <thead>
                <tr>
                  <th>Resident</th>
                  <th>Document</th>
                  <th>Details</th>
                  <th>Timeline</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSubmissions.map((submission) => (
                  <tr key={submission._id}>
                    <td>
                      <span className="module-table__primary">{submission.residentName}</span>
                      <span className="module-table__secondary">{submission.residentAddress}</span>
                    </td>
                    <td>
                      <span className="module-table__primary">{submission.documentType}</span>
                      <span className="module-table__secondary">{submission.subject}</span>
                    </td>
                    <td>
                      <span className="module-table__notes">{submission.details}</span>
                    </td>
                    <td>
                      <span className="module-table__primary">Submitted {new Date(submission.createdAt).toLocaleString()}</span>
                      <span className="module-table__secondary">
                        {submission.reviewedAt ? `Reviewed ${new Date(submission.reviewedAt).toLocaleString()}` : 'Not reviewed yet'}
                      </span>
                    </td>
                    <td>
                      <span className={`module-table__pill ${submission.status === 'approved' ? 'success' : submission.status === 'rejected' ? 'danger' : submission.status === 'in_review' ? 'info' : 'pending'}`}>
                        {statusMap[submission.status]?.label || 'Pending'}
                      </span>
                      {submission.adminRemarks && <span className="module-table__secondary">{submission.adminRemarks}</span>}
                    </td>
                    <td>
                      <div className="module-table__actions">
                        <button type="button" className="module-table__action-btn secondary" onClick={() => setPreviewFile(submission.submissionFile)}>
                          <Eye size={14} /> View
                        </button>
                        <a
                          className="module-table__action-btn info"
                          href={assetUrl(submission.submissionFile.path)}
                          target="_blank"
                          rel="noopener noreferrer"
                          download={submission.submissionFile.originalName}
                        >
                          <Download size={14} /> Download
                        </a>
                        <button
                          type="button"
                          className="module-table__action-btn primary"
                          onClick={() => {
                            setViewMode('card');
                            startReview(submission);
                          }}
                        >
                          Review
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="admin-doc-list">
          {filteredSubmissions.map((submission) => {
            const isEditing = editingId === submission._id;
            return (
              <article key={submission._id} className="admin-doc-card">
                <div className="admin-doc-card-top">
                  <div>
                    <span className="admin-doc-type-pill">{submission.documentType}</span>
                    <h4>{submission.subject}</h4>
                    <p>{submission.residentName} • {submission.residentAddress}</p>
                  </div>
                  <span className={statusMap[submission.status]?.className || statusMap.pending.className}>
                    {statusMap[submission.status]?.label || 'Pending'}
                  </span>
                </div>

                <div className="admin-doc-info-box">
                  <strong>Details</strong>
                  <p>{submission.details}</p>
                </div>

                <div className="admin-doc-meta-row">
                  <span>Submitted: {new Date(submission.createdAt).toLocaleString()}</span>
                  {submission.reviewedAt && <span>Reviewed: {new Date(submission.reviewedAt).toLocaleString()}</span>}
                </div>

                {submission.adminRemarks && !isEditing && (
                  <div className="admin-doc-remarks-box">
                    <strong>Admin Remarks</strong>
                    <p>{submission.adminRemarks}</p>
                  </div>
                )}

                {isEditing ? (
                  <div className="admin-doc-review-box">
                    <label>
                      <span>Status</span>
                      <select className="form-input" value={statusDraft} onChange={(event) => setStatusDraft(event.target.value)}>
                        <option value="pending">Pending</option>
                        <option value="in_review">In Review</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </label>

                    <label>
                      <span>Admin Remarks</span>
                      <textarea
                        className="form-textarea"
                        rows="4"
                        value={remarksDraft}
                        maxLength={300}
                        onChange={(event) => setRemarksDraft(event.target.value.slice(0, 300))}
                        placeholder="Visible notes for this resident document submission"
                      />
                    </label>

                    <div className="admin-doc-review-actions">
                      <button className="btn-approve" onClick={() => saveReview(submission._id)} disabled={saving}>
                        Save Review
                      </button>
                      <button className="admin-doc-secondary-btn" onClick={() => setEditingId('')}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="admin-doc-action-row">
                    <button className="admin-doc-secondary-btn" onClick={() => setPreviewFile(submission.submissionFile)}>
                      <Eye size={15} />
                      View Upload
                    </button>
                    <a
                      className="admin-doc-download-link"
                      href={assetUrl(submission.submissionFile.path)}
                      target="_blank"
                      rel="noopener noreferrer"
                      download={submission.submissionFile.originalName}
                    >
                      <Download size={15} />
                      Download
                    </a>
                    <button className="admin-doc-edit-btn" onClick={() => startReview(submission)}>
                      Review / Update Status
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}

      <PaginationControls pagination={pagination} onPageChange={setPage} />

      {previewFile && (
        <div className="billing-receipt-modal" onClick={() => setPreviewFile(null)}>
          <div className="billing-receipt-card" onClick={(event) => event.stopPropagation()}>
            <div className="billing-receipt-card-head">
              <h3>{previewFile.originalName || 'Resident Document'}</h3>
              <button onClick={() => setPreviewFile(null)}><XCircle size={16} /></button>
            </div>
            {previewFile.mimetype === 'application/pdf' ? (
              <iframe title="Resident Upload" src={assetUrl(previewFile.path)} className="admin-doc-preview-frame" />
            ) : (
              <img src={assetUrl(previewFile.path)} alt="Resident Upload" className="billing-receipt-image" />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDocumentsManagement;
