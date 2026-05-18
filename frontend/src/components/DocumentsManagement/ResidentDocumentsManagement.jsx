import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiUrl } from '../../utils/api';
import { AlertCircle, Download, Eye, FileText, LayoutGrid, Pencil, Table2, Upload, XCircle } from 'lucide-react';
import PaginationControls from '../common/PaginationControls';
import { buildPaginatedUrl, parsePaginatedResponse } from '../../utils/pagination';
import {
  DOCUMENT_UPLOAD_MAX_BYTES,
  formatFileSize,
  validatePdfOrImageFile
} from '../../utils/uploadValidation';
import './ResidentDocumentsManagement.css';

const emptyForm = {
  documentType: 'Barangay Letter',
  subject: '',
  details: ''
};

const statusMap = {
  pending: { label: 'Pending', className: 'resident-doc-status pending' },
  in_review: { label: 'In Review', className: 'resident-doc-status review' },
  approved: { label: 'Approved', className: 'resident-doc-status approved' },
  rejected: { label: 'Rejected', className: 'resident-doc-status rejected' }
};

const ResidentDocumentsManagement = ({ token, showAlert }) => {
  const [templates, setTemplates] = useState([]);
  const [submissions, setSubmissions] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [selectedFile, setSelectedFile] = useState(null);
  const [editingId, setEditingId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [viewMode, setViewMode] = useState('card');

  const fetchTemplates = useCallback(async () => {
    try {
      const response = await fetch(apiUrl('/documents/templates'), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      setTemplates(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching templates:', error);
      setTemplates([]);
    }
  }, [token]);

  const fetchSubmissions = useCallback(async () => {
    try {
      const response = await fetch(apiUrl(buildPaginatedUrl('/documents/my-submissions', page)), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();
      const parsed = parsePaginatedResponse(data);
      setSubmissions(parsed.items);
      setPagination(parsed.pagination);
    } catch (error) {
      console.error('Error fetching submissions:', error);
      setSubmissions([]);
      setPagination(null);
    }
  }, [page, token]);

  useEffect(() => {
    fetchTemplates();
    fetchSubmissions();
  }, [fetchTemplates, fetchSubmissions]);

  useEffect(() => () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
  }, [previewUrl]);

  const summary = useMemo(
    () => ({
      total: submissions.length,
      pending: submissions.filter((item) => item.status === 'pending' || item.status === 'in_review').length,
      approved: submissions.filter((item) => item.status === 'approved').length,
      rejected: submissions.filter((item) => item.status === 'rejected').length
    }),
    [submissions]
  );

  const resetForm = () => {
    setForm(emptyForm);
    setSelectedFile(null);
    setEditingId('');
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0] || null;
    if (!file) {
      setSelectedFile(null);
      return;
    }

    const validation = validatePdfOrImageFile(file, {
      label: 'Document file',
      maxBytes: DOCUMENT_UPLOAD_MAX_BYTES
    });

    if (!validation.valid) {
      showAlert(validation.message, 'error');
      event.target.value = '';
      return;
    }

    setSelectedFile(file);
  };

  const handleTemplateDownload = async (templateKey) => {
    try {
      const response = await fetch(apiUrl(`/documents/templates/${templateKey}/download`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!response.ok) {
        showAlert('Failed to download template.', 'error');
        return;
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${templateKey}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading template:', error);
      showAlert('Failed to download template.', 'error');
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!selectedFile && !editingId) {
      showAlert('Please choose a file to upload.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const payload = new FormData();
      payload.append('documentType', form.documentType);
      payload.append('subject', form.subject.trim());
      payload.append('details', form.details.trim());
      if (selectedFile) payload.append('documentFile', selectedFile);

      const url = editingId ? apiUrl(`/documents/${editingId}`) : apiUrl('/documents/submit');
      const method = editingId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}` },
        body: payload
      });
      const data = await response.json();

      if (!response.ok) {
        showAlert(data.message || 'Failed to save document form.', 'error');
        return;
      }

      showAlert(editingId ? 'Document form updated successfully.' : 'Document form submitted successfully.', 'success');
      resetForm();
      fetchSubmissions();
    } catch (error) {
      console.error('Error saving document submission:', error);
      showAlert('Failed to save document form.', 'error');
    }
    setSubmitting(false);
  };

  const beginEdit = (submission) => {
    setEditingId(submission._id);
    setForm({
      documentType: submission.documentType,
      subject: submission.subject,
      details: submission.details
    });
    setSelectedFile(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const closePreview = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewFile(null);
    setPreviewUrl('');
    setPreviewLoading(false);
    setPreviewError('');
  };

  const openPreview = async (submission) => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }

    setPreviewFile(submission.submissionFile);
    setPreviewUrl('');
    setPreviewError('');
    setPreviewLoading(true);

    try {
      const response = await fetch(apiUrl(`/documents/submissions/${submission._id}/file`), {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || 'Failed to load document.');
      }

      const blob = await response.blob();
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (error) {
      setPreviewError(error.message || 'Failed to load document.');
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <div className="resident-doc-shell">
      <div className="page-header">
        <div className="page-title">
          <h2>Documents &amp; Forms</h2>
          <p>Download official forms, submit your required documents online, and track review status.</p>
        </div>
      </div>

      <div className="resident-doc-summary">
        <div className="resident-doc-stat"><p>Total Submissions</p><strong>{summary.total}</strong></div>
        <div className="resident-doc-stat"><p>Pending Review</p><strong>{summary.pending}</strong></div>
        <div className="resident-doc-stat"><p>Approved</p><strong>{summary.approved}</strong></div>
        <div className="resident-doc-stat"><p>Rejected</p><strong>{summary.rejected}</strong></div>
      </div>

      <div className="resident-doc-layout">
        <section className="resident-doc-card">
          <div className="resident-doc-card-head">
            <h3>Downloadable Documents</h3>
            <p>These templates can be downloaded anytime as printable PDF forms.</p>
          </div>

          <div className="resident-doc-template-list">
            {templates.map((template) => (
              <article key={template.key} className="resident-doc-template-item">
                <div>
                  <h4>{template.title}</h4>
                  <p>{template.description}</p>
                </div>
                <button className="resident-doc-download-btn" onClick={() => handleTemplateDownload(template.key)}>
                  <Download size={15} />
                  Download PDF
                </button>
              </article>
            ))}
          </div>
        </section>

        <section className="resident-doc-card">
          <div className="resident-doc-card-head">
            <h3>{editingId ? 'Update Submitted Form' : 'Submit Required Form'}</h3>
            <p>Upload barangay letters, certifications, reports, and other official resident forms for admin review.</p>
          </div>

          <form className="resident-doc-form" onSubmit={handleSubmit}>
            <div className="form-grid-2">
              <div className="form-group">
                <label>Document Type</label>
                <select
                  className="form-input"
                  value={form.documentType}
                  onChange={(event) => setForm((current) => ({ ...current, documentType: event.target.value }))}
                >
                  <option>Barangay Letter</option>
                  <option>Certification</option>
                  <option>Report</option>
                  <option>Visitors Report</option>
                  <option>Other</option>
                </select>
              </div>
              <div className="form-group">
                <label>Subject</label>
                <input
                  className="form-input"
                  value={form.subject}
                  maxLength={120}
                  onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value.slice(0, 120) }))}
                  placeholder="Enter the form subject"
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Details</label>
              <textarea
                className="form-textarea"
                rows="5"
                value={form.details}
                maxLength={600}
                onChange={(event) => setForm((current) => ({ ...current, details: event.target.value.slice(0, 600) }))}
                placeholder="Describe what this document is for and any important details."
                required
              />
            </div>

            <div className="form-group">
              <label>{editingId ? 'Replace File (Optional)' : 'Upload File'}</label>
              <label className="resident-doc-upload">
                <Upload size={16} />
                <span>{selectedFile ? selectedFile.name : `Choose PDF or image file (max ${formatFileSize(DOCUMENT_UPLOAD_MAX_BYTES)})`}</span>
                <input
                  type="file"
                  accept=".pdf,image/*"
                  onChange={handleFileChange}
                />
              </label>
            </div>

            <div className="resident-doc-form-actions">
              <button className="submit-btn" type="submit" disabled={submitting}>
                <FileText size={16} />
                {submitting ? 'Saving...' : editingId ? 'Update Submission' : 'Submit Form'}
              </button>
              {editingId && (
                <button type="button" className="resident-doc-secondary-btn" onClick={resetForm}>
                  <XCircle size={16} />
                  Cancel
                </button>
              )}
            </div>
          </form>
        </section>
      </div>

      <section className="resident-doc-card">
        <div className="resident-doc-card-head module-view-bar">
          <div>
            <h3>Submission Status Tracker</h3>
            <p>Monitor your uploaded forms and admin remarks here.</p>
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

        {submissions.length === 0 ? (
          <div className="empty-state">
            <FileText size={40} style={{ color: '#9ca3af' }} />
            <h3>No Forms Submitted Yet</h3>
            <p>Your uploaded resident document forms will appear here once submitted.</p>
          </div>
        ) : viewMode === 'table' ? (
          <div className="module-table-card">
            <div className="module-table-wrap">
              <table className="module-table">
                <thead>
                  <tr>
                    <th>Document Type</th>
                    <th>Subject / Details</th>
                    <th>Submitted</th>
                    <th>Status</th>
                    <th>Admin Remarks</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions.map((submission) => (
                    <tr key={submission._id}>
                      <td>
                        <span className="module-table__primary">{submission.documentType}</span>
                      </td>
                      <td>
                        <span className="module-table__primary">{submission.subject}</span>
                        <span className="module-table__notes">{submission.details}</span>
                      </td>
                      <td>
                        <span className="module-table__primary">{new Date(submission.createdAt).toLocaleString()}</span>
                      </td>
                      <td>
                        <span className={`module-table__pill ${submission.status === 'approved' ? 'success' : submission.status === 'rejected' ? 'danger' : submission.status === 'in_review' ? 'info' : 'pending'}`}>
                          {statusMap[submission.status]?.label || 'Pending'}
                        </span>
                      </td>
                      <td>
                        {submission.adminRemarks ? (
                          <span className="module-table__notes">{submission.adminRemarks}</span>
                        ) : (
                          <span className="module-table__empty">No remarks yet</span>
                        )}
                      </td>
                      <td>
                        <div className="module-table__actions">
                          <button type="button" className="module-table__action-btn secondary" onClick={() => openPreview(submission)}>
                            <Eye size={14} /> View File
                          </button>
                          {submission.status !== 'approved' && (
                            <button type="button" className="module-table__action-btn info" onClick={() => beginEdit(submission)}>
                              <Pencil size={14} /> Update
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="resident-doc-submission-list">
            {submissions.map((submission) => (
              <article key={submission._id} className="resident-doc-submission-card">
                <div className="resident-doc-submission-top">
                  <div>
                    <span className="resident-doc-type-pill">{submission.documentType}</span>
                    <h4>{submission.subject}</h4>
                    <p>Submitted {new Date(submission.createdAt).toLocaleString()}</p>
                  </div>
                  <span className={statusMap[submission.status]?.className || statusMap.pending.className}>
                    {statusMap[submission.status]?.label || 'Pending'}
                  </span>
                </div>

                <div className="resident-doc-detail-box">
                  <strong>Details</strong>
                  <p>{submission.details}</p>
                </div>

                {submission.adminRemarks && (
                  <div className="resident-doc-remarks-box">
                    <strong>Admin Remarks</strong>
                    <p>{submission.adminRemarks}</p>
                  </div>
                )}

                <div className="resident-doc-file-actions">
                  <button className="resident-doc-secondary-btn" onClick={() => openPreview(submission)}>
                    <Eye size={15} />
                    View File
                  </button>
                  {submission.status !== 'approved' && (
                    <button className="resident-doc-secondary-btn" onClick={() => beginEdit(submission)}>
                      <Pencil size={15} />
                      Update
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <PaginationControls pagination={pagination} onPageChange={setPage} />

      {previewFile && (
        <div className="resident-doc-preview-modal" onClick={closePreview}>
          <div className="resident-doc-preview-card" onClick={(event) => event.stopPropagation()}>
            <div className="resident-doc-preview-card-head">
              <h3>{previewFile.originalName || 'Resident Document'}</h3>
              <button onClick={closePreview}><XCircle size={16} /></button>
            </div>
            {previewLoading ? (
              <div className="resident-doc-preview-message"><FileText size={28} /><p>Loading document...</p></div>
            ) : previewError ? (
              <div className="resident-doc-preview-message resident-doc-preview-error"><AlertCircle size={28} /><p>{previewError}</p></div>
            ) : previewFile.mimetype === 'application/pdf' ? (
              <iframe title="Resident Document" src={previewUrl} className="resident-doc-preview-frame" />
            ) : (
              <img src={previewUrl} alt="Resident Document" className="resident-doc-preview-image" />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ResidentDocumentsManagement;
