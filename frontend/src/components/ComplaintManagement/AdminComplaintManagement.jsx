import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiUrl, assetUrl } from '../../utils/api';
import {
  AlertCircle,
  CheckCircle2,
  Download,
  Eye,
  FileWarning,
  LayoutGrid,
  MessageSquareWarning,
  Search,
  Table2,
  UserRound,
  XCircle
} from 'lucide-react';
import './AdminComplaintManagement.css';
import { downloadComplaintLetterPdf } from '../../utils/complaintLetterPdf';
import PaginationControls from '../common/PaginationControls';
import { buildPaginatedUrl, parsePaginatedResponse } from '../../utils/pagination';

const COMPLAINT_CATEGORY_OPTIONS = [
  { value: 'general', label: 'General Concern' },
  { value: 'noise_disturbance', label: 'Noise / Disturbance' },
  { value: 'safety_security', label: 'Safety / Security' },
  { value: 'property_damage', label: 'Property Damage' },
  { value: 'parking', label: 'Parking' },
  { value: 'sanitation', label: 'Sanitation / Cleanliness' },
  { value: 'pets_animals', label: 'Pets / Animals' },
  { value: 'harassment', label: 'Harassment / Misconduct' },
  { value: 'other', label: 'Other' }
];
const COMPLAINT_URGENCY_OPTIONS = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' }
];
const CATEGORY_LABELS = Object.fromEntries(COMPLAINT_CATEGORY_OPTIONS.map((option) => [option.value, option.label]));
const URGENCY_LABELS = Object.fromEntries(COMPLAINT_URGENCY_OPTIONS.map((option) => [option.value, option.label]));

const AdminComplaintManagement = ({ token }) => {
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [archiveFilter, setArchiveFilter] = useState('active');
  const [viewingPhoto, setViewingPhoto] = useState(null);
  const [editingId, setEditingId] = useState('');
  const [statusDraft, setStatusDraft] = useState('pending');
  const [responseDraft, setResponseDraft] = useState('');
  const [remarksDraft, setRemarksDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [viewMode, setViewMode] = useState('card');

  const fetchComplaints = useCallback(async () => {
    setLoading(true);
    try {
      const path = buildPaginatedUrl('/complaints/all', page, archiveFilter === 'all' ? { archived: 'all' } : {});
      const response = await fetch(apiUrl(path), {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        const parsed = parsePaginatedResponse(data);
        setComplaints(parsed.items);
        setPagination(parsed.pagination);
      } else {
        setComplaints([]);
        setPagination(null);
      }
    } catch (error) {
      console.error('Error fetching admin complaints:', error);
      setComplaints([]);
      setPagination(null);
    }
    setLoading(false);
  }, [archiveFilter, page, token]);

  useEffect(() => {
    setPage(1);
  }, [archiveFilter]);

  useEffect(() => {
    fetchComplaints();
  }, [fetchComplaints]);

  const summary = useMemo(
    () => ({
      total: complaints.length,
      open: complaints.filter((item) => ['pending', 'in_progress'].includes(item.status) && !item.isArchived).length,
      resolved: complaints.filter((item) => item.status === 'resolved' && !item.isArchived).length,
      archived: complaints.filter((item) => item.isArchived).length
    }),
    [complaints]
  );

  const filteredComplaints = useMemo(
    () =>
      complaints.filter((complaint) => {
        const query = searchQuery.trim().toLowerCase();
        const matchesSearch =
          !query ||
          complaint.complainantName?.toLowerCase().includes(query) ||
          complaint.complainantAddress?.toLowerCase().includes(query) ||
          complaint.againstPersonName?.toLowerCase().includes(query) ||
          complaint.subject?.toLowerCase().includes(query) ||
          complaint.location?.toLowerCase().includes(query) ||
          complaint.category?.toLowerCase().includes(query) ||
          complaint.urgency?.toLowerCase().includes(query);

        const matchesStatus = statusFilter === 'all' || complaint.status === statusFilter;
        const matchesType = typeFilter === 'all' || complaint.complaintType === typeFilter;
        const matchesArchive =
          archiveFilter === 'all' ||
          (archiveFilter === 'active' ? !complaint.isArchived : complaint.isArchived);

        return matchesSearch && matchesStatus && matchesType && matchesArchive;
      }),
    [archiveFilter, complaints, searchQuery, statusFilter, typeFilter]
  );

  const getStatusMeta = (status) => {
    const map = {
      pending: { label: 'Pending', className: 'admin-complaint-status new' },
      in_progress: { label: 'In Progress', className: 'admin-complaint-status review' },
      resolved: { label: 'Resolved', className: 'admin-complaint-status resolved' }
    };
    return map[status] || map.pending;
  };

  const getCategoryLabel = (category) => CATEGORY_LABELS[category] || CATEGORY_LABELS.general;
  const getUrgencyLabel = (urgency) => URGENCY_LABELS[urgency] || URGENCY_LABELS.medium;

  const startEdit = (complaint) => {
    setEditingId(complaint._id);
    setStatusDraft(complaint.status);
    setResponseDraft(complaint.adminResponse || '');
    setRemarksDraft(complaint.internalRemarks || '');
  };

  const saveReview = async (complaintId) => {
    setSaving(true);
    try {
      const response = await fetch(apiUrl(`/complaints/${complaintId}/status`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          status: statusDraft,
          adminResponse: responseDraft,
          internalRemarks: remarksDraft
        })
      });

      const data = await response.json();
      if (!response.ok) {
        window.alert(data.message || 'Failed to update complaint');
        return;
      }

      setEditingId('');
      fetchComplaints();
    } catch (error) {
      console.error('Error updating complaint:', error);
      window.alert('Failed to update complaint');
    }
    setSaving(false);
  };

  const archiveComplaint = async (complaintId) => {
    if (!window.confirm('Archive this resolved complaint?')) return;

    setSaving(true);
    try {
      const response = await fetch(apiUrl(`/complaints/${complaintId}/archive`), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await response.json();
      if (!response.ok) {
        window.alert(data.message || 'Failed to archive complaint');
        return;
      }

      fetchComplaints();
    } catch (error) {
      console.error('Error archiving complaint:', error);
      window.alert('Failed to archive complaint');
    }
    setSaving(false);
  };

  return (
    <div className="admin-complaint-shell">
      <div className="page-header">
        <div className="page-title">
          <h2>Complaints</h2>
          <p>Review resident complaints, respond to them, add internal remarks, and archive resolved records.</p>
        </div>
      </div>

      <div className="admin-complaint-summary">
        <div className="admin-complaint-stat">
          <AlertCircle size={18} />
          <div><p>Total</p><strong>{summary.total}</strong></div>
        </div>
        <div className="admin-complaint-stat">
          <FileWarning size={18} />
          <div><p>Open</p><strong>{summary.open}</strong></div>
        </div>
        <div className="admin-complaint-stat">
          <CheckCircle2 size={18} />
          <div><p>Resolved</p><strong>{summary.resolved}</strong></div>
        </div>
        <div className="admin-complaint-stat">
          <XCircle size={18} />
          <div><p>Archived</p><strong>{summary.archived}</strong></div>
        </div>
      </div>

      <div className="admin-complaint-toolbar">
        <div className="admin-complaint-search">
          <Search size={18} />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search by complainant, address, subject, or reported person..."
          />
        </div>

        <div className="admin-complaint-filters">
          <select className="form-input" value={archiveFilter} onChange={(event) => setArchiveFilter(event.target.value)}>
            <option value="active">Active Only</option>
            <option value="archived">Archived Only</option>
            <option value="all">All Records</option>
          </select>
          <select className="form-input" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
            <option value="all">All Types</option>
            <option value="person">Against Person</option>
            <option value="issue">About Something</option>
          </select>
          <select className="form-input" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="all">All Statuses</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="resolved">Resolved</option>
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
      </div>

      {loading ? (
        <div className="loading-container">
          <div className="spinner" />
          <p className="loading-text">Loading complaints...</p>
        </div>
      ) : filteredComplaints.length === 0 ? (
        <div className="empty-state">
          <AlertCircle size={40} style={{ color: '#9ca3af' }} />
          <h3>No Complaints Found</h3>
          <p>Try adjusting your filters or wait for resident complaints to come in.</p>
        </div>
      ) : viewMode === 'table' ? (
        <div className="module-table-card">
          <div className="module-table-wrap">
            <table className="module-table">
              <thead>
                <tr>
                  <th>Complainant</th>
                  <th>Type / Details</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th>Responses</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredComplaints.map((complaint) => {
                  const statusMeta = getStatusMeta(complaint.status);
                  return (
                    <tr key={complaint._id}>
                      <td>
                        <span className="module-table__primary">{complaint.complainantName}</span>
                        <span className="module-table__secondary">{complaint.complainantAddress}</span>
                      </td>
                      <td>
                        <span className="module-table__primary">
                          {complaint.complaintType === 'person' ? 'Against a Person' : complaint.subject}
                        </span>
                        <span className="module-table__secondary">
                          Category: {getCategoryLabel(complaint.category)} | Urgency: {getUrgencyLabel(complaint.urgency)}
                        </span>
                        <span className="module-table__notes">
                          {complaint.complaintType === 'person'
                            ? `Reported person: ${complaint.againstPersonName}`
                            : `Location: ${complaint.location}`}
                        </span>
                      </td>
                      <td>
                        <span className="module-table__primary">{new Date(complaint.createdAt).toLocaleString()}</span>
                      </td>
                      <td>
                        <span className={`module-table__pill ${complaint.status === 'pending' ? 'pending' : complaint.status === 'resolved' ? 'success' : 'info'}`}>
                          {statusMeta.label}
                        </span>
                        {complaint.isArchived && <span className="module-table__secondary">Archived</span>}
                      </td>
                      <td>
                        {complaint.adminResponse || complaint.internalRemarks ? (
                          <span className="module-table__notes">
                            {complaint.adminResponse ? `Resident: ${complaint.adminResponse}` : ''}
                            {complaint.adminResponse && complaint.internalRemarks ? ' ' : ''}
                            {complaint.internalRemarks ? `Internal: ${complaint.internalRemarks}` : ''}
                          </span>
                        ) : (
                          <span className="module-table__empty">No response or remarks yet</span>
                        )}
                      </td>
                      <td>
                        <div className="module-table__actions">
                          {complaint.photo?.path && (
                            <button type="button" className="module-table__action-btn secondary" onClick={() => setViewingPhoto(complaint.photo)}>
                              <Eye size={14} /> View Photo
                            </button>
                          )}
                          {complaint.complaintType === 'person' && (
                            <button type="button" className="module-table__action-btn info" onClick={() => downloadComplaintLetterPdf(complaint)}>
                              <Download size={14} /> Letter
                            </button>
                          )}
                          {complaint.status === 'resolved' && !complaint.isArchived && (
                            <button type="button" className="module-table__action-btn warning" onClick={() => archiveComplaint(complaint._id)}>
                              Archive
                            </button>
                          )}
                          <button
                            type="button"
                            className="module-table__action-btn primary"
                            onClick={() => {
                              setViewMode('card');
                              startEdit(complaint);
                            }}
                          >
                            Review
                          </button>
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
        <div className="admin-complaint-grid">
          {filteredComplaints.map((complaint) => {
            const statusMeta = getStatusMeta(complaint.status);
            const isEditing = editingId === complaint._id;

            return (
              <article key={complaint._id} className="admin-complaint-card">
                <div className="admin-complaint-card-top">
                  <div>
                    <div className="admin-complaint-type">
                      {complaint.complaintType === 'person' ? <UserRound size={15} /> : <MessageSquareWarning size={15} />}
                      {complaint.complaintType === 'person' ? 'Against a Person' : 'About Something'}
                    </div>
                    <h4>{complaint.complainantName}</h4>
                    <p>{complaint.complainantAddress}</p>
                  </div>
                  <span className={statusMeta.className}>{statusMeta.label}</span>
                </div>

                <div className="admin-complaint-card-body">
                  <div className="admin-complaint-meta-tags">
                    <span className="admin-complaint-meta-tag">{getCategoryLabel(complaint.category)}</span>
                    <span className={`admin-complaint-meta-tag urgency ${complaint.urgency || 'medium'}`}>
                      {getUrgencyLabel(complaint.urgency)}
                    </span>
                  </div>

                  {complaint.complaintType === 'person' ? (
                    <>
                      <div className="admin-complaint-info-box">
                        <strong>Reported Person</strong>
                        <p>{complaint.againstPersonName}</p>
                      </div>
                      <div className="admin-complaint-info-box">
                        <strong>Message</strong>
                        <p>{complaint.message}</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="admin-complaint-info-box">
                        <strong>Subject</strong>
                        <p>{complaint.subject}</p>
                      </div>
                      <div className="admin-complaint-info-box">
                        <strong>Location</strong>
                        <p>{complaint.location}</p>
                      </div>
                      {complaint.photo?.path && (
                        <button className="admin-complaint-photo-btn" onClick={() => setViewingPhoto(complaint.photo)}>
                          <Eye size={15} />
                          View Photo
                        </button>
                      )}
                    </>
                  )}

                  <div className="admin-complaint-info-box">
                    <strong>Submitted</strong>
                    <p>{new Date(complaint.createdAt).toLocaleString()}</p>
                  </div>

                  {complaint.isArchived && (
                    <div className="admin-complaint-admin-note">
                      <strong>Archived</strong>
                      <p>
                        {complaint.archivedAt ? new Date(complaint.archivedAt).toLocaleString() : 'Archived'}
                        {complaint.archivedBy ? ` by ${complaint.archivedBy}` : ''}
                      </p>
                    </div>
                  )}

                  {isEditing ? (
                    <div className="admin-complaint-review-box">
                      <label>
                        <span>Status</span>
                        <select className="form-input" value={statusDraft} onChange={(event) => setStatusDraft(event.target.value)}>
                          <option value="pending">Pending</option>
                          <option value="in_progress">In Progress</option>
                          <option value="resolved">Resolved</option>
                        </select>
                      </label>

                      <label>
                        <span>Admin Response</span>
                        <textarea
                          className="form-textarea"
                          rows="4"
                          value={responseDraft}
                          onChange={(event) => setResponseDraft(event.target.value.slice(0, 300))}
                          placeholder="Visible response for the resident"
                        />
                      </label>

                      <label>
                        <span>Internal Remarks</span>
                        <textarea
                          className="form-textarea"
                          rows="4"
                          value={remarksDraft}
                          onChange={(event) => setRemarksDraft(event.target.value.slice(0, 300))}
                          placeholder="Internal notes for admin record-keeping"
                        />
                      </label>

                      <div className="admin-complaint-review-actions">
                        <button className="btn-approve" onClick={() => saveReview(complaint._id)} disabled={saving}>
                          Save Review
                        </button>
                        <button className="admin-complaint-cancel-btn" onClick={() => setEditingId('')}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      {complaint.adminResponse && (
                        <div className="admin-complaint-admin-note">
                          <strong>Admin Response</strong>
                          <p>{complaint.adminResponse}</p>
                        </div>
                      )}

                      {complaint.internalRemarks && (
                        <div className="admin-complaint-info-box">
                          <strong>Internal Remarks</strong>
                          <p>{complaint.internalRemarks}</p>
                        </div>
                      )}

                      {complaint.status === 'resolved' && !complaint.isArchived && (
                        <button className="admin-complaint-photo-btn" onClick={() => archiveComplaint(complaint._id)}>
                          Archive Complaint
                        </button>
                      )}

                      {complaint.complaintType === 'person' && (
                        <button className="admin-complaint-letter-btn" onClick={() => downloadComplaintLetterPdf(complaint)}>
                          <Download size={15} />
                          Download Complaint Letter
                        </button>
                      )}

                      <button className="admin-complaint-edit-btn" onClick={() => startEdit(complaint)}>
                        Review / Update Status
                      </button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <PaginationControls pagination={pagination} onPageChange={setPage} />

      {viewingPhoto && (
        <div className="billing-receipt-modal" onClick={() => setViewingPhoto(null)}>
          <div className="billing-receipt-card" onClick={(event) => event.stopPropagation()}>
            <div className="billing-receipt-card-head">
              <h3>Complaint Photo</h3>
              <button onClick={() => setViewingPhoto(null)}><XCircle size={16} /></button>
            </div>
            <img src={assetUrl(viewingPhoto.path)} alt="Complaint" className="billing-receipt-image" />
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminComplaintManagement;
