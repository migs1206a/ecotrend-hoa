import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiUrl } from '../../utils/api';
import {
  CalendarDays,
  FileText,
  Pencil,
  PlusCircle,
  Receipt,
  Save,
  Trash2,
  Wallet,
  X
} from 'lucide-react';
import './AdminBillsAuditLogs.css';
import PaginationControls from '../common/PaginationControls';
import { buildPaginatedUrl, parsePaginatedResponse } from '../../utils/pagination';

const API = apiUrl('/admin-bill-audit-logs');

const buildEmptyForm = () => ({
  billName: '',
  amount: '',
  billDate: new Date().toISOString().slice(0, 10),
  notes: ''
});

const formatCurrency = (amount) =>
  `P${Number(amount || 0).toLocaleString(undefined, {
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
  const [editingId, setEditingId] = useState('');
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
      const response = await fetch(apiUrl(buildPaginatedUrl('/admin-bill-audit-logs', targetPage)), { headers: headers() });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || 'Failed to load bill audit logs');
      }

      const parsed = parsePaginatedResponse(data);
      setLogs(parsed.items);
      setPagination(parsed.pagination);
    } catch (error) {
      showAlert && showAlert(error.message || 'Failed to load bill audit logs', 'error');
      setLogs([]);
      setPagination(null);
    }
  }, [headers, page, showAlert]);

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
      monthAmount
    };
  }, [logs, pagination]);

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

  return (
    <div className="admin-bill-audit-root">
      <div className="page-header">
        <div className="page-title">
          <h2>Admin Bills Audit/Logs</h2>
          <p>Track admin-side bills like Meralco, service fees, and other recurring HOA expenses.</p>
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
                      <td className="admin-bill-audit-notes">{log.notes || '-'}</td>
                      <td>
                        <div className="admin-bill-audit-actor">
                          <strong>{log.createdBy?.fullName || log.createdBy?.username || 'Admin'}</strong>
                          <span>{log.createdBy?.username ? `@${log.createdBy.username}` : 'Officer account'}</span>
                        </div>
                      </td>
                      <td>{formatDateTime(log.updatedAt)}</td>
                      <td className="admin-bill-audit-actions">
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
    </div>
  );
};

export default AdminBillsAuditLogs;
