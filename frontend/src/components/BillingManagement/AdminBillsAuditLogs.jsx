import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiUrl, assetUrl } from '../../utils/api';
import {
  CalendarDays,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  Pencil,
  PlusCircle,
  Receipt,
  RotateCcw,
  Save,
  Trash2,
  Upload,
  Wallet,
  X
} from 'lucide-react';
import './AdminBillsAuditLogs.css';
import PaginationControls from '../common/PaginationControls';
import FileViewerModal from '../common/FileViewerModal';
import { buildPaginatedUrl, parsePaginatedResponse } from '../../utils/pagination';
import {
  DOCUMENT_UPLOAD_MAX_BYTES,
  formatFileSize,
  validatePdfOrImageFile
} from '../../utils/uploadValidation';

const API = apiUrl('/admin-bill-audit-logs');

const buildEmptyForm = () => ({
  billName: '',
  amount: '',
  billDate: new Date().toISOString().slice(0, 10),
  notes: ''
});

const formatCurrency = (amount) =>
  `₱${Number(amount || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const formatDate = (value) => {
  if (!value) {
    return 'No date';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'No date' : date.toLocaleDateString();
};

const formatDateTime = (value) => {
  if (!value) {
    return 'Not updated';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Not updated' : date.toLocaleString();
};

const AdminBillsAuditLogs = ({ token, showAlert, showConfirm }) => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [editingId, setEditingId] = useState('');
  const [togglingPaidId, setTogglingPaidId] = useState('');
  const [uploadingReceiptId, setUploadingReceiptId] = useState('');
  const [viewingReceipt, setViewingReceipt] = useState(null);
  const [coverageStartDate, setCoverageStartDate] = useState('');
  const [coverageEndDate, setCoverageEndDate] = useState('');
  const [form, setForm] = useState(buildEmptyForm);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);

  const headers = useCallback(
    () => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    }),
    [token]
  );

  const fetchLogs = useCallback(async (targetPage = page) => {
    try {
      const coverageParams = coverageStartDate && coverageEndDate
        ? {
            startDate: coverageStartDate,
            endDate: coverageEndDate
          }
        : {};
      const response = await fetch(apiUrl(buildPaginatedUrl('/admin-bill-audit-logs', targetPage, coverageParams)), { headers: headers() });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || 'Failed to load bill audit logs');
      }

      const parsed = parsePaginatedResponse(data);
      if ((parsed.items?.length || 0) === 0 && (parsed.pagination?.total || 0) > 0 && targetPage > 1) {
        setPage(Math.max(1, parsed.pagination?.totalPages || targetPage - 1));
        return;
      }

      setLogs(parsed.items);
      setPagination(parsed.pagination);
    } catch (error) {
      showAlert && showAlert(error.message || 'Failed to load bill audit logs', 'error');
      setLogs([]);
      setPagination(null);
    }
  }, [coverageEndDate, coverageStartDate, headers, page, showAlert]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchLogs(page);
      setLoading(false);
    })();
  }, [fetchLogs, page]);

  const resetForm = () => {
    setForm(buildEmptyForm());
    setEditingId('');
  };

  const totals = useMemo(() => {
    const totalAmount = logs.reduce((sum, log) => sum + Number(log.amount || 0), 0);
    const currentMonth = new Date().getMonth();
    const currentYear = new Date().getFullYear();
    const monthAmount = logs.reduce((sum, log) => {
      const billDate = new Date(log.billDate);

      if (Number.isNaN(billDate.getTime())) {
        return sum;
      }

      if (billDate.getMonth() === currentMonth && billDate.getFullYear() === currentYear) {
        return sum + Number(log.amount || 0);
      }

      return sum;
    }, 0);

    return {
      totalLogs: pagination?.total ?? logs.length,
      totalAmount,
      monthAmount,
      paidCount: logs.filter((log) => log.isPaid).length,
      unpaidCount: logs.filter((log) => !log.isPaid).length
    };
  }, [logs, pagination]);

  const pageMeta = useMemo(() => {
    const currentPage = pagination?.page || page;
    const limit = pagination?.limit || logs.length || 0;
    const total = pagination?.total || logs.length || 0;

    if (!logs.length || !total) {
      return {
        start: 0,
        end: 0,
        total
      };
    }

    const start = (currentPage - 1) * limit + 1;
    const end = Math.min(start + logs.length - 1, total);

    return {
      start,
      end,
      total
    };
  }, [logs, page, pagination]);

  const handleChange = (field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (!form.billName.trim()) {
      showAlert && showAlert('Please enter a bill name.', 'error');
      return;
    }

    if (Number(form.amount) < 0 || !Number.isFinite(Number(form.amount))) {
      showAlert && showAlert('Please enter a valid bill amount.', 'error');
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(
        editingId ? `${API}/${editingId}` : API,
        {
          method: editingId ? 'PUT' : 'POST',
          headers: headers(),
          body: JSON.stringify({
            billName: form.billName,
            amount: Number(form.amount),
            billDate: form.billDate,
            notes: form.notes
          })
        }
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || 'Failed to save bill log');
      }

      showAlert && showAlert(editingId ? 'Bill log updated successfully.' : 'Bill log recorded successfully.', 'success');
      if (!editingId && page !== 1) {
        setPage(1);
      } else {
        await fetchLogs(page);
      }
      resetForm();
    } catch (error) {
      showAlert && showAlert(error.message || 'Failed to save bill log', 'error');
    }

    setSaving(false);
  };

  const startEdit = (log) => {
    setEditingId(log._id);
    setForm({
      billName: log.billName || '',
      amount: log.amount ?? '',
      billDate: log.billDate ? new Date(log.billDate).toISOString().slice(0, 10) : '',
      notes: log.notes || ''
    });
  };

  const handleDelete = (log) => {
    const confirmDelete = async () => {
      try {
        const response = await fetch(`${API}/${log._id}`, {
          method: 'DELETE',
          headers: headers()
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.message || 'Failed to delete bill log');
        }

        showAlert && showAlert('Bill log deleted successfully.', 'success');
        await fetchLogs(page);

        if (editingId === log._id) {
          resetForm();
        }
      } catch (error) {
        showAlert && showAlert(error.message || 'Failed to delete bill log', 'error');
      }
    };

    if (showConfirm) {
      showConfirm(`Delete "${log.billName}" from the audit log?`, confirmDelete);
      return;
    }

    confirmDelete();
  };

  const togglePaidStatus = (log, paid) => {
    const runToggle = async () => {
      setTogglingPaidId(log._id);

      try {
        const response = await fetch(`${API}/${log._id}/payment-status`, {
          method: 'PATCH',
          headers: headers(),
          body: JSON.stringify({ paid })
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.message || 'Failed to update paid status');
        }

        showAlert && showAlert(
          paid ? 'Bill marked as paid.' : 'Paid mark removed from bill.',
          'success'
        );
        await fetchLogs(page);
      } catch (error) {
        showAlert && showAlert(error.message || 'Failed to update paid status', 'error');
      }

      setTogglingPaidId('');
    };

    if (showConfirm) {
      showConfirm(
        paid
          ? `Mark "${log.billName}" as paid today?`
          : `Undo the paid mark for "${log.billName}"?`,
        runToggle
      );
      return;
    }

    runToggle();
  };

  const handleReceiptUpload = async (log, event) => {
    const file = event.target.files?.[0];
    event.target.value = '';

    if (!file) {
      return;
    }

    if (!log.isPaid) {
      showAlert && showAlert('Mark this bill as paid before uploading a receipt.', 'error');
      return;
    }

    const validation = validatePdfOrImageFile(file, {
      label: 'Bill receipt',
      maxBytes: DOCUMENT_UPLOAD_MAX_BYTES
    });

    if (!validation.valid) {
      showAlert && showAlert(validation.message, 'error');
      return;
    }

    setUploadingReceiptId(log._id);

    try {
      const formData = new FormData();
      formData.append('receipt', file);

      const response = await fetch(`${API}/${log._id}/receipt`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data?.message || 'Failed to upload bill receipt');
      }

      showAlert && showAlert('Bill receipt uploaded successfully.', 'success');
      await fetchLogs(page);
    } catch (error) {
      showAlert && showAlert(error.message || 'Failed to upload bill receipt', 'error');
    } finally {
      setUploadingReceiptId('');
    }
  };

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);

    try {
      if ((coverageStartDate && !coverageEndDate) || (!coverageStartDate && coverageEndDate)) {
        throw new Error('Select both coverage dates before downloading the PDF.');
      }

      const params = new URLSearchParams();
      if (coverageStartDate && coverageEndDate) {
        params.set('startDate', coverageStartDate);
        params.set('endDate', coverageEndDate);
      }

      const response = await fetch(apiUrl(`/admin-bill-audit-logs/export/pdf${params.toString() ? `?${params.toString()}` : ''}`), {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.message || 'Failed to download bill audit log PDF');
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get('content-disposition') || '';
      const filenameMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
      const filename = filenameMatch?.[1] || 'admin-bills-audit-logs.pdf';
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (error) {
      showAlert && showAlert(error.message || 'Failed to download bill audit log PDF', 'error');
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <div className="admin-bill-audit-root">
      <div className="page-header">
        <div className="page-title">
          <h2>Admin Bills Audit/Logs</h2>
          <p>Track admin-side bills like Meralco, service fees, and other recurring HOA expenses.</p>
        </div>
        <div className="admin-bill-audit-page-actions">
          <label className="admin-bill-audit-date-filter">
            <span>From</span>
            <input
              type="date"
              value={coverageStartDate}
              onChange={(event) => {
                setCoverageStartDate(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="admin-bill-audit-date-filter">
            <span>To</span>
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
          <button
            type="button"
            className="admin-bill-audit-download"
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
          >
            <Download size={16} />
            {downloadingPdf ? 'Preparing PDF...' : 'Download PDF'}
          </button>
        </div>
      </div>

      <div className="admin-bill-audit-summary">
        <div className="admin-bill-audit-card">
          <div className="admin-bill-audit-icon"><Receipt size={18} /></div>
          <div>
            <p>Total Logged Bills</p>
            <strong>{totals.totalLogs}</strong>
          </div>
        </div>
        <div className="admin-bill-audit-card">
          <div className="admin-bill-audit-icon money"><Wallet size={18} /></div>
          <div>
            <p>Total Amount Tracked</p>
            <strong>{formatCurrency(totals.totalAmount)}</strong>
          </div>
        </div>
        <div className="admin-bill-audit-card">
          <div className="admin-bill-audit-icon accent"><CalendarDays size={18} /></div>
          <div>
            <p>This Month</p>
            <strong>{formatCurrency(totals.monthAmount)}</strong>
          </div>
        </div>
        <div className="admin-bill-audit-card">
          <div className="admin-bill-audit-icon success"><CheckCircle2 size={18} /></div>
          <div>
            <p>Paid / Unpaid</p>
            <strong>{totals.paidCount} / {totals.unpaidCount}</strong>
          </div>
        </div>
      </div>

      <div className="admin-bill-audit-layout">
        <div className="admin-bill-audit-form-card">
          <div className="admin-bill-audit-form-head">
            <div>
              <h3>{editingId ? 'Edit Bill Log' : 'Record a Bill'}</h3>
              <p>Use any bill name you need and keep the tracker updated over time.</p>
            </div>
            {editingId && (
              <button type="button" className="admin-bill-audit-cancel" onClick={resetForm}>
                <X size={14} />
                Cancel Edit
              </button>
            )}
          </div>

          <form className="admin-bill-audit-form" onSubmit={handleSubmit}>
            <div className="admin-bill-audit-field">
              <label htmlFor="billName">Bill Name</label>
              <input
                id="billName"
                type="text"
                placeholder="Meralco Bill"
                value={form.billName}
                onChange={(event) => handleChange('billName', event.target.value)}
              />
            </div>

            <div className="admin-bill-audit-inline">
              <div className="admin-bill-audit-field">
                <label htmlFor="billAmount">Amount</label>
                <input
                  id="billAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0.00"
                  value={form.amount}
                  onChange={(event) => handleChange('amount', event.target.value)}
                />
              </div>

              <div className="admin-bill-audit-field">
                <label htmlFor="billDate">Bill Date</label>
                <input
                  id="billDate"
                  type="date"
                  value={form.billDate}
                  onChange={(event) => handleChange('billDate', event.target.value)}
                />
              </div>
            </div>

            <div className="admin-bill-audit-field">
              <label htmlFor="billNotes">Notes</label>
              <textarea
                id="billNotes"
                rows={5}
                placeholder="Optional context such as due period, provider details, or remarks"
                value={form.notes}
                onChange={(event) => handleChange('notes', event.target.value)}
              />
            </div>

            <button type="submit" className="admin-bill-audit-submit" disabled={saving}>
              {editingId ? <Save size={16} /> : <PlusCircle size={16} />}
              {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Record Bill'}
            </button>
          </form>
        </div>

        <div className="admin-bill-audit-table-card">
          <div className="admin-bill-audit-table-head">
            <div>
              <h3><FileText size={18} /> Recorded Bills</h3>
              <p>All admins with this module can review, edit, and maintain the shared bill tracker.</p>
            </div>
            <div className="admin-bill-audit-table-tools">
              <span className="admin-bill-audit-page-meta">
                {pageMeta.total > 0
                  ? `Showing ${pageMeta.start}-${pageMeta.end} of ${pageMeta.total}`
                  : 'No records to show'}
              </span>
              <PaginationControls pagination={pagination} onPageChange={setPage} />
            </div>
          </div>

          {loading ? (
            <div className="loading-container">
              <div className="spinner" />
              <p className="loading-text">Loading bill audit logs...</p>
            </div>
          ) : logs.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon"><Receipt size={36} style={{ color: '#9ca3af' }} /></div>
              <h3>No Bill Logs Yet</h3>
              <p>Record the first admin-side bill to start the tracker.</p>
            </div>
          ) : (
            <div className="admin-bill-audit-table-wrap">
              <table className="admin-bill-audit-table">
                <thead>
                   <tr>
                     <th>Bill</th>
                     <th>Amount</th>
                     <th>Bill Date</th>
                     <th>Status</th>
                     <th>Paid Date</th>
                     <th>Receipt</th>
                     <th>Notes</th>
                     <th>Recorded By</th>
                     <th>Last Updated</th>
                     <th />
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log._id}>
                      <td>
                        <div className="admin-bill-audit-bill">
                          <strong>{log.billName}</strong>
                          <span>{formatDate(log.createdAt)}</span>
                        </div>
                      </td>
                      <td className="admin-bill-audit-amount">{formatCurrency(log.amount)}</td>
                      <td>{formatDate(log.billDate)}</td>
                      <td>
                        <span className={`admin-bill-audit-status ${log.isPaid ? 'paid' : 'unpaid'}`}>
                          {log.isPaid ? 'Paid' : 'Unpaid'}
                        </span>
                      </td>
                      <td>
                        <div className="admin-bill-audit-paid-meta">
                          <strong>{log.paidAt ? formatDateTime(log.paidAt) : '-'}</strong>
                          <span>
                            {log.paidBy?.fullName || log.paidBy?.username
                              ? `By ${log.paidBy.fullName || log.paidBy.username}`
                              : log.isPaid
                              ? 'Recorded as paid'
                              : 'Waiting for payment'}
                          </span>
                        </div>
                      </td>
                      <td>
                        <div className="admin-bill-audit-receipt-cell">
                          {log.receipt?.path ? (
                            <button
                              type="button"
                              className="admin-bill-audit-receipt-view"
                              onClick={() => setViewingReceipt(log)}
                            >
                              <Eye size={14} />
                              View
                            </button>
                          ) : (
                            <span className="admin-bill-audit-receipt-empty">No receipt</span>
                          )}
                          {log.isPaid && (
                            <label
                              className="admin-bill-audit-receipt-upload"
                              title={`JPG, PNG, or PDF up to ${formatFileSize(DOCUMENT_UPLOAD_MAX_BYTES)}`}
                            >
                              <Upload size={14} />
                              {uploadingReceiptId === log._id
                                ? 'Uploading...'
                                : log.receipt?.path
                                ? 'Replace'
                                : `Upload`}
                              <input
                                type="file"
                                accept="image/*,application/pdf"
                                disabled={uploadingReceiptId === log._id}
                                onChange={(event) => handleReceiptUpload(log, event)}
                              />
                            </label>
                          )}
                        </div>
                      </td>
                      <td className="admin-bill-audit-notes">{log.notes || '-'}</td>
                      <td>
                        <div className="admin-bill-audit-actor">
                          <strong>{log.createdBy?.fullName || log.createdBy?.username || 'Admin'}</strong>
                          <span>{log.createdBy?.username ? `@${log.createdBy.username}` : 'Officer account'}</span>
                        </div>
                      </td>
                      <td>{formatDateTime(log.updatedAt)}</td>
                      <td className="admin-bill-audit-actions">
                        <button
                          type="button"
                          className={`admin-bill-audit-paid-btn ${log.isPaid ? 'undo' : 'mark'}`}
                          onClick={() => togglePaidStatus(log, !log.isPaid)}
                          disabled={togglingPaidId === log._id}
                        >
                          {log.isPaid ? <RotateCcw size={14} /> : <CheckCircle2 size={14} />}
                          {togglingPaidId === log._id
                            ? 'Saving...'
                            : log.isPaid
                            ? 'Undo Paid'
                            : 'Mark Paid'}
                        </button>
                        <button type="button" className="admin-bill-audit-edit" onClick={() => startEdit(log)}>
                          <Pencil size={14} />
                          Edit
                        </button>
                        <button type="button" className="admin-bill-audit-delete" onClick={() => handleDelete(log)}>
                          <Trash2 size={14} />
                          Delete
                        </button>
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
      {viewingReceipt?.receipt?.path && (
        <FileViewerModal
          title={`${viewingReceipt.billName} Receipt`}
          subtitle={viewingReceipt.receipt.originalName || 'Bill receipt'}
          fileUrl={assetUrl(viewingReceipt.receipt.path)}
          downloadUrl={assetUrl(viewingReceipt.receipt.path)}
          downloadName={viewingReceipt.receipt.originalName || `${viewingReceipt.billName}-receipt`}
          isPdf={viewingReceipt.receipt.mimetype === 'application/pdf'}
          onClose={() => setViewingReceipt(null)}
        />
      )}
    </div>
  );
};

export default AdminBillsAuditLogs;
