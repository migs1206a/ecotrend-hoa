import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiUrl, assetUrl } from '../../utils/api';
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  FileWarning,
  LayoutGrid,
  MessageSquareWarning,
  Send,
  Table2,
  Upload,
  UserRound,
  XCircle
} from 'lucide-react';
import './ResidentComplaintManagement.css';
import PaginationControls from '../common/PaginationControls';
import { buildPaginatedUrl, parsePaginatedResponse } from '../../utils/pagination';
import {
  IMAGE_UPLOAD_MAX_BYTES,
  formatFileSize,
  validateImageFile
} from '../../utils/uploadValidation';

const nameRegex = /^[A-Za-z\s]*$/;
const messageRegex = /^[A-Za-z\s]*$/;
const issueRegex = /^[A-Za-z0-9\s,.\-#()]*$/;
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

const ResidentComplaintManagement = ({ token, userId, showAlert }) => {
  const [profile, setProfile] = useState(null);
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [viewingPhoto, setViewingPhoto] = useState(null);
  const [formData, setFormData] = useState({
    complaintType: 'person',
    category: 'general',
    urgency: 'medium',
    againstPersonName: '',
    message: '',
    subject: '',
    location: ''
  });
  const [photo, setPhoto] = useState(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [viewMode, setViewMode] = useState('card');

  const fetchProfile = useCallback(async () => {
    try {
      const response = await fetch(apiUrl(`/residents/${userId}`), {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.ok) {
        const data = await response.json();
        setProfile(data);
      }
    } catch (error) {
      console.error('Error fetching resident profile:', error);
    }
  }, [token, userId]);

  const fetchComplaints = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(apiUrl(buildPaginatedUrl('/complaints/my', page)), {
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
      console.error('Error fetching complaints:', error);
      setComplaints([]);
      setPagination(null);
    }
    setLoading(false);
  }, [page, token]);

  useEffect(() => {
    fetchProfile();
    fetchComplaints();
  }, [fetchProfile, fetchComplaints]);

  const summary = useMemo(
    () => ({
      total: complaints.length,
      open: complaints.filter((complaint) => ['pending', 'in_progress'].includes(complaint.status)).length,
      resolved: complaints.filter((complaint) => complaint.status === 'resolved').length
    }),
    [complaints]
  );

  const setField = (field, value) => {
    setFormData((current) => ({ ...current, [field]: value }));
  };

  const getCategoryLabel = (category) => CATEGORY_LABELS[category] || CATEGORY_LABELS.general;
  const getUrgencyLabel = (urgency) => URGENCY_LABELS[urgency] || URGENCY_LABELS.medium;

  const handlePhotoChange = (event) => {
    const file = event.target.files?.[0] || null;
    if (!file) {
      setPhoto(null);
      return;
    }

    const validation = validateImageFile(file, {
      label: 'Complaint photo',
      maxBytes: IMAGE_UPLOAD_MAX_BYTES
    });

    if (!validation.valid) {
      showAlert?.(validation.message, 'error');
      event.target.value = '';
      return;
    }

    setPhoto(file);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitting(true);

    try {
      const payload = new FormData();
      payload.append('complaintType', formData.complaintType);
      payload.append('category', formData.category);
      payload.append('urgency', formData.urgency);

      if (formData.complaintType === 'person') {
        payload.append('againstPersonName', formData.againstPersonName.trim());
        payload.append('message', formData.message.trim());
      } else {
        payload.append('subject', formData.subject.trim());
        payload.append('location', formData.location.trim());
        if (photo) payload.append('photo', photo);
      }

      const response = await fetch(apiUrl('/complaints'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: payload
      });

      const data = await response.json();
      if (!response.ok) {
        showAlert?.(data.message || 'Failed to submit complaint', 'error');
        return;
      }

      showAlert?.('Complaint submitted successfully.', 'success');
      setFormData({
        complaintType: 'person',
        category: 'general',
        urgency: 'medium',
        againstPersonName: '',
        message: '',
        subject: '',
        location: ''
      });
      setPhoto(null);
      fetchComplaints();
    } catch (error) {
      console.error('Error submitting complaint:', error);
      showAlert?.('Failed to submit complaint', 'error');
    }

    setSubmitting(false);
  };

  const getStatusMeta = (status) => {
    const map = {
      pending: { label: 'Pending', className: 'resident-complaint-status new' },
      in_progress: { label: 'In Progress', className: 'resident-complaint-status review' },
      resolved: { label: 'Resolved', className: 'resident-complaint-status resolved' }
    };
    return map[status] || map.pending;
  };

  return (
    <div className="resident-complaint-shell">
      <div className="page-header">
        <div className="page-title">
          <h2>Complaints</h2>
          <p>Report a person or a subdivision issue and track how the HOA handles it.</p>
        </div>
      </div>

      <div className="resident-complaint-summary">
        <div className="resident-complaint-stat">
          <AlertCircle size={18} />
          <div><p>Total Complaints</p><strong>{summary.total}</strong></div>
        </div>
        <div className="resident-complaint-stat">
          <FileWarning size={18} />
          <div><p>Open Cases</p><strong>{summary.open}</strong></div>
        </div>
        <div className="resident-complaint-stat">
          <CheckCircle2 size={18} />
          <div><p>Resolved</p><strong>{summary.resolved}</strong></div>
        </div>
      </div>

      <div className="resident-complaint-form-card">
        <div className="resident-complaint-form-head">
          <div>
            <h3>Submit New Complaint</h3>
            <p>Choose whether your complaint is against a person or about a subdivision concern.</p>
          </div>
          <div className="resident-complaint-type-toggle">
            <button
              type="button"
              className={formData.complaintType === 'person' ? 'active' : ''}
              onClick={() => setFormData({
                complaintType: 'person',
                category: formData.category,
                urgency: formData.urgency,
                againstPersonName: '',
                message: '',
                subject: '',
                location: ''
              })}
            >
              <UserRound size={15} />
              Against a Person
            </button>
            <button
              type="button"
              className={formData.complaintType === 'issue' ? 'active' : ''}
              onClick={() => setFormData({
                complaintType: 'issue',
                category: formData.category,
                urgency: formData.urgency,
                againstPersonName: '',
                message: '',
                subject: '',
                location: ''
              })}
            >
              <MessageSquareWarning size={15} />
              About Something
            </button>
          </div>
        </div>

        <form className="resident-complaint-form-grid" onSubmit={handleSubmit}>
          <label className="resident-complaint-field">
            <span>Complainant</span>
            <input className="form-input" value={profile?.familyName || ''} readOnly />
          </label>

          <label className="resident-complaint-field">
            <span>Address</span>
            <input className="form-input" value={profile ? `${profile.houseAddress}, ${profile.street}` : ''} readOnly />
          </label>

          <label className="resident-complaint-field">
            <span>Complaint Category</span>
            <select
              className="form-input"
              value={formData.category}
              onChange={(event) => setField('category', event.target.value)}
            >
              {COMPLAINT_CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="resident-complaint-field">
            <span>Urgency</span>
            <select
              className="form-input"
              value={formData.urgency}
              onChange={(event) => setField('urgency', event.target.value)}
            >
              {COMPLAINT_URGENCY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          {formData.complaintType === 'person' ? (
            <>
              <label className="resident-complaint-field resident-complaint-span">
                <span>Inirereklamo</span>
                <input
                  className="form-input"
                  value={formData.againstPersonName}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (nameRegex.test(value)) setField('againstPersonName', value.slice(0, 60));
                  }}
                  placeholder="Name of the person being complained against"
                  required
                />
              </label>

              <label className="resident-complaint-field resident-complaint-span">
                <span>Message</span>
                <textarea
                  className="form-textarea"
                  rows="5"
                  value={formData.message}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (messageRegex.test(value)) setField('message', value.slice(0, 300));
                  }}
                  placeholder="Letters and spaces only. If you need numbers, spell them out in words."
                  required
                />
                <small>{formData.message.length}/300</small>
              </label>
            </>
          ) : (
            <>
              <label className="resident-complaint-field">
                <span>Subject</span>
                <input
                  className="form-input"
                  value={formData.subject}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (issueRegex.test(value)) setField('subject', value.slice(0, 120));
                  }}
                  placeholder="Exposed electrical wirings"
                  required
                />
              </label>

              <label className="resident-complaint-field">
                <span>Phase / Street</span>
                <input
                  className="form-input"
                  value={formData.location}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (issueRegex.test(value)) setField('location', value.slice(0, 120));
                  }}
                  placeholder="Phase 1, Acacia Street"
                  required
                />
              </label>

              <label className="resident-complaint-field resident-complaint-span">
                <span>Upload Photo <em>(Optional)</em></span>
                <label className="resident-complaint-upload-label">
                  <Upload size={15} />
                  {photo?.name || `Choose Image (max ${formatFileSize(IMAGE_UPLOAD_MAX_BYTES)})`}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoChange}
                  />
                </label>
              </label>
            </>
          )}

          <button type="submit" className="submit-btn resident-complaint-submit-btn" disabled={submitting}>
            <Send size={18} />
            {submitting ? 'Submitting...' : 'Submit Complaint'}
          </button>
        </form>
      </div>

      <div className="resident-complaint-list-card">
        <div className="resident-complaint-list-head module-view-bar">
          <div>
            <h3>My Complaint History</h3>
            <p>See the status of complaints you already submitted.</p>
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

        {loading ? (
          <div className="loading-container">
            <div className="spinner" />
            <p className="loading-text">Loading complaints...</p>
          </div>
        ) : complaints.length === 0 ? (
          <div className="empty-state">
            <AlertCircle size={40} style={{ color: '#9ca3af' }} />
            <h3>No Complaints Yet</h3>
            <p>Your submitted complaints will appear here.</p>
          </div>
        ) : viewMode === 'table' ? (
          <div className="module-table-card">
            <div className="module-table-wrap">
              <table className="module-table">
                <thead>
                  <tr>
                    <th>Complaint</th>
                    <th>Reported Details</th>
                    <th>Submitted</th>
                    <th>Status</th>
                    <th>Admin Response</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {complaints.map((complaint) => {
                    const statusMeta = getStatusMeta(complaint.status);

                    return (
                      <tr key={complaint._id}>
                        <td>
                          <span className="module-table__primary">
                            {complaint.complaintType === 'person' ? 'Complaint Against a Person' : complaint.subject}
                          </span>
                          <span className="module-table__secondary">
                            {complaint.complaintType === 'person' ? 'Against person' : 'Subdivision concern'}
                          </span>
                          <div className="resident-complaint-tags">
                            <span className="resident-complaint-tag">{getCategoryLabel(complaint.category)}</span>
                            <span className={`resident-complaint-tag urgency ${complaint.urgency || 'medium'}`}>
                              {getUrgencyLabel(complaint.urgency)}
                            </span>
                          </div>
                        </td>
                        <td>
                          <span className="module-table__notes">
                            {complaint.complaintType === 'person'
                              ? `Reported person: ${complaint.againstPersonName}. ${complaint.message}`
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
                        </td>
                        <td>
                          {complaint.adminResponse ? (
                            <span className="module-table__notes">{complaint.adminResponse}</span>
                          ) : (
                            <span className="module-table__empty">No response yet</span>
                          )}
                        </td>
                        <td>
                          <div className="module-table__actions">
                            {complaint.photo?.path && (
                              <button type="button" className="module-table__action-btn secondary" onClick={() => setViewingPhoto(complaint.photo)}>
                                <Eye size={14} /> View Photo
                              </button>
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
          <div className="resident-complaint-grid">
            {complaints.map((complaint) => {
              const statusMeta = getStatusMeta(complaint.status);

              return (
                <article key={complaint._id} className="resident-complaint-card">
                  <div className="resident-complaint-card-top">
                    <div>
                      <h4>{complaint.complaintType === 'person' ? 'Complaint Against a Person' : complaint.subject}</h4>
                      <p>{new Date(complaint.createdAt).toLocaleString()}</p>
                      <div className="resident-complaint-tags">
                        <span className="resident-complaint-tag">{getCategoryLabel(complaint.category)}</span>
                        <span className={`resident-complaint-tag urgency ${complaint.urgency || 'medium'}`}>
                          {getUrgencyLabel(complaint.urgency)}
                        </span>
                      </div>
                    </div>
                    <span className={statusMeta.className}>{statusMeta.label}</span>
                  </div>

                  <div className="resident-complaint-card-body">
                    {complaint.complaintType === 'person' ? (
                      <>
                        <div className="resident-complaint-info-box">
                          <strong>Inirereklamo</strong>
                          <p>{complaint.againstPersonName}</p>
                        </div>
                        <div className="resident-complaint-info-box">
                          <strong>Message</strong>
                          <p>{complaint.message}</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="resident-complaint-info-box">
                          <strong>Location</strong>
                          <p>{complaint.location}</p>
                        </div>
                        {complaint.photo?.path && (
                          <button className="resident-complaint-photo-btn" onClick={() => setViewingPhoto(complaint.photo)}>
                            <Eye size={15} />
                            View Uploaded Photo
                          </button>
                        )}
                      </>
                    )}

                    {complaint.adminResponse && (
                      <div className="resident-complaint-admin-note">
                        <strong>Admin Response</strong>
                        <p>{complaint.adminResponse}</p>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <PaginationControls pagination={pagination} onPageChange={setPage} />

      {viewingPhoto && (
        <div className="resident-billing-modal" onClick={() => setViewingPhoto(null)}>
          <div className="resident-billing-modal-card" onClick={(event) => event.stopPropagation()}>
            <div className="resident-billing-modal-head">
              <h3>Complaint Photo</h3>
              <button onClick={() => setViewingPhoto(null)}><XCircle size={16} /></button>
            </div>
            <img src={assetUrl(viewingPhoto.path)} alt="Complaint" className="resident-billing-image" />
          </div>
        </div>
      )}
    </div>
  );
};

export default ResidentComplaintManagement;
