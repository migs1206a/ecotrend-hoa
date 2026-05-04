import React, { useState, useEffect } from 'react';
import { apiUrl } from '../../utils/api';
import {
  Eye, EyeOff, UserPlus, Shield, Users, LogOut,
  CheckCircle, XCircle, Trash2, RefreshCw, Pencil,
  X, KeyRound, User, Search, Filter, Camera, Map as MapIcon
} from 'lucide-react';
import './MasterAdminDashboard.css';
import ecohoa from '../../assets/ecohoa.png';
import PaginationControls from '../common/PaginationControls';
import { buildPaginatedUrl, parsePaginatedResponse } from '../../utils/pagination';
import CCTVFeedsModule from '../CCTV/CCTVFeedsModule';
import SubdivisionMap3D from '../SubdivisionMap/SubdivisionMap3D';

const API = apiUrl('/master-admin');

const MasterAdminDashboard = ({ onLogout }) => {
  const [activeTab, setActiveTab] = useState('create');

  // ── Create form state ──────────────────────────────────────
  const [accountType, setAccountType] = useState('ADMIN');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');
  const [formData, setFormData] = useState({
    username: '', password: '', confirmPassword: '', fullName: ''
  });

  // ── Manage tab state ───────────────────────────────────────
  const [accounts, setAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [filterRole, setFilterRole] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);

  // ── Edit modal state ───────────────────────────────────────
  const [editModal, setEditModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [editMode, setEditMode] = useState('info');
  const [editData, setEditData] = useState({ username: '', fullName: '' });
  const [editPwData, setEditPwData] = useState({ newPassword: '', confirmPassword: '' });
  const [showEditPw, setShowEditPw] = useState(false);
  const [showEditConfirmPw, setShowEditConfirmPw] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');
  const [editSuccess, setEditSuccess] = useState('');

  // ── View modal state ───────────────────────────────────────
  const [viewModal, setViewModal] = useState(false);
  const [viewTarget, setViewTarget] = useState(null);

  const token = () => localStorage.getItem('token');
  const preventCopyPaste = (e) => e.preventDefault();

  // ── Fetch accounts ─────────────────────────────────────────
  const fetchAccounts = async () => {
    setLoadingAccounts(true);
    try {
      const res = await fetch(apiUrl(buildPaginatedUrl('/master-admin/accounts', page)), {
        headers: { Authorization: `Bearer ${token()}` }
      });
      const data = await res.json();
      if (res.ok) {
        const parsed = Array.isArray(data?.accounts)
          ? { items: data.accounts, pagination: null }
          : parsePaginatedResponse(data);
        setAccounts(parsed.items);
        setPagination(parsed.pagination);
      }
    } catch { /* silent */ }
    finally { setLoadingAccounts(false); }
  };

  useEffect(() => {
    if (activeTab === 'manage') fetchAccounts();
  }, [activeTab, page]);

  // ── Filtered list ──────────────────────────────────────────
  const filteredAccounts = accounts.filter(acc => {
    const matchRole = filterRole === 'ALL' || acc.role === filterRole;
    const q = searchQuery.toLowerCase();
    const matchSearch = !q
      || acc.username.toLowerCase().includes(q)
      || (acc.fullName && acc.fullName.toLowerCase().includes(q));
    return matchRole && matchSearch;
  });

  // ── Reset create form ──────────────────────────────────────
  const resetForm = () => {
    setFormData({ username: '', password: '', confirmPassword: '', fullName: '' });
    setCreateError(''); setCreateSuccess('');
    setShowPassword(false); setShowConfirmPassword(false);
  };

  // ── Validate password rules ────────────────────────────────
  const validatePassword = (pw) => {
    if (pw.length < 8) return 'Password must be at least 8 characters.';
    if (!/[A-Z]/.test(pw)) return 'Password needs an uppercase letter.';
    if (!/[a-z]/.test(pw)) return 'Password needs a lowercase letter.';
    if (!/[0-9]/.test(pw)) return 'Password needs a number.';
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pw))
      return 'Password needs a special character.';
    return null;
  };

  // ── CREATE ─────────────────────────────────────────────────
  const handleCreate = async () => {
    setCreateError(''); setCreateSuccess('');
    if (accountType === 'GUARD' && !formData.fullName.trim())
      return setCreateError('Full name is required for Guard accounts.');
    if (formData.username.trim().length < 3)
      return setCreateError('Username must be at least 3 characters.');
    if (!/^[a-zA-Z0-9_]+$/.test(formData.username))
      return setCreateError('Username: letters, numbers, underscores only.');
    const pwErr = validatePassword(formData.password);
    if (pwErr) return setCreateError(pwErr);
    if (formData.password !== formData.confirmPassword)
      return setCreateError('Passwords do not match.');

    setCreateLoading(true);
    try {
      const endpoint = accountType === 'ADMIN' ? `${API}/create-admin` : `${API}/create-guard`;
      const payload = accountType === 'ADMIN'
        ? { username: formData.username, password: formData.password }
        : { username: formData.username, password: formData.password, fullName: formData.fullName };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) setCreateError(data.message || 'Failed to create account.');
      else {
        setCreateSuccess(`${accountType === 'ADMIN' ? 'Admin' : 'Guard'} account "@${formData.username}" created!`);
        resetForm();
      }
    } catch { setCreateError('Connection error. Is the server running?'); }
    finally { setCreateLoading(false); }
  };

  // ── DELETE ─────────────────────────────────────────────────
  const handleDelete = async (acc) => {
    if (!window.confirm(`Delete ${acc.role} account "@${acc.username}"?\nThis cannot be undone.`)) return;
    try {
      const endpoint = acc.role === 'ADMIN'
        ? `${API}/admin/${acc._id}` : `${API}/guard/${acc._id}`;
      const res = await fetch(endpoint, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token()}` }
      });
      if (res.ok) setAccounts(prev => prev.filter(a => a._id !== acc._id));
      else alert('Failed to delete account.');
    } catch { alert('Connection error.'); }
  };

  // ── Open EDIT modal ────────────────────────────────────────
  const openEdit = (acc) => {
    setEditTarget(acc);
    setEditMode('info');
    setEditData({ username: acc.username, fullName: acc.fullName || '' });
    setEditPwData({ newPassword: '', confirmPassword: '' });
    setEditError(''); setEditSuccess('');
    setShowEditPw(false); setShowEditConfirmPw(false);
    setEditModal(true);
  };

  const closeEdit = () => {
    setEditModal(false); setEditTarget(null);
    setEditError(''); setEditSuccess('');
  };

  // ── UPDATE info ────────────────────────────────────────────
  const handleUpdateInfo = async () => {
    setEditError(''); setEditSuccess('');
    if (editData.username.trim().length < 3)
      return setEditError('Username must be at least 3 characters.');
    if (!/^[a-zA-Z0-9_]+$/.test(editData.username))
      return setEditError('Username: letters, numbers, underscores only.');
    if (editTarget.role === 'GUARD' && !editData.fullName.trim())
      return setEditError('Full name is required for Guard accounts.');

    setEditLoading(true);
    try {
      const endpoint = editTarget.role === 'ADMIN'
        ? `${API}/admin/${editTarget._id}` : `${API}/guard/${editTarget._id}`;
      const payload = editTarget.role === 'ADMIN'
        ? { username: editData.username }
        : { username: editData.username, fullName: editData.fullName };

      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) setEditError(data.message || 'Update failed.');
      else {
        setEditSuccess('Account updated successfully.');
        setAccounts(prev => prev.map(a =>
          a._id === editTarget._id
            ? { ...a, username: editData.username, fullName: editData.fullName }
            : a
        ));
        setEditTarget(prev => ({ ...prev, username: editData.username, fullName: editData.fullName }));
      }
    } catch { setEditError('Connection error.'); }
    finally { setEditLoading(false); }
  };

  // ── UPDATE password ────────────────────────────────────────
  const handleUpdatePassword = async () => {
    setEditError(''); setEditSuccess('');
    const pwErr = validatePassword(editPwData.newPassword);
    if (pwErr) return setEditError(pwErr);
    if (editPwData.newPassword !== editPwData.confirmPassword)
      return setEditError('Passwords do not match.');

    setEditLoading(true);
    try {
      const endpoint = editTarget.role === 'ADMIN'
        ? `${API}/admin/${editTarget._id}/password`
        : `${API}/guard/${editTarget._id}/password`;

      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
        body: JSON.stringify({ newPassword: editPwData.newPassword })
      });
      const data = await res.json();
      if (!res.ok) setEditError(data.message || 'Password update failed.');
      else {
        setEditSuccess('Password updated successfully.');
        setEditPwData({ newPassword: '', confirmPassword: '' });
      }
    } catch { setEditError('Connection error.'); }
    finally { setEditLoading(false); }
  };

  // ── VIEW modal ─────────────────────────────────────────────
  const openView = (acc) => { setViewTarget(acc); setViewModal(true); };
  const closeView = () => { setViewModal(false); setViewTarget(null); };

  const formatDate = (d) => new Date(d).toLocaleDateString('en-PH', {
    year: 'numeric', month: 'long', day: 'numeric'
  });

  const adminCount  = accounts.filter(a => a.role === 'ADMIN').length;
  const guardCount  = accounts.filter(a => a.role === 'GUARD').length;

  return (
    <div className="ma-container">
      <div className="ma-bg">
        <div className="ma-orb ma-orb-1" /><div className="ma-orb ma-orb-2" /><div className="ma-orb ma-orb-3" />
      </div>

      {/* ── Sidebar ── */}
      <aside className="ma-sidebar">
        <div className="ma-sidebar-header">
          <div className="ma-logo-wrap">
            <img src={ecohoa} alt="EHAI Logo" className="ma-logo" />
          </div>
          <div>
            <h2 className="ma-brand">Ecotrend HOA</h2>
            <span className="ma-role-badge">Master Admin</span>
          </div>
        </div>

        <nav className="ma-nav">
          <button
            className={`ma-nav-item ${activeTab === 'create' ? 'active' : ''}`}
            onClick={() => { setActiveTab('create'); resetForm(); }}
          >
            <UserPlus size={20} /><span>Create Account</span>
          </button>
          <button
            className={`ma-nav-item ${activeTab === 'manage' ? 'active' : ''}`}
            onClick={() => setActiveTab('manage')}
          >
            <Users size={20} /><span>Manage Accounts</span>
          </button>
          <button
            className={`ma-nav-item ${activeTab === 'cctv' ? 'active' : ''}`}
            onClick={() => setActiveTab('cctv')}
          >
            <Camera size={20} /><span>CCTV Feeds</span>
          </button>
          <button
            className={`ma-nav-item ${activeTab === 'subdivision_map' ? 'active' : ''}`}
            onClick={() => setActiveTab('subdivision_map')}
          >
            <MapIcon size={20} /><span>3D Mapped Subdivision</span>
          </button>
        </nav>

        <button className="ma-logout-btn" onClick={onLogout}>
          <LogOut size={18} /><span>Logout</span>
        </button>
      </aside>

      {/* ── Main ── */}
      <main className="ma-main">

        {/* ═══════════════ CREATE TAB ═══════════════ */}
        {activeTab === 'create' && (
          <div className="ma-content-area">
            <div className="ma-page-header">
              <div>
                <h1 className="ma-page-title">Create Account</h1>
                <p className="ma-page-sub">Set up a new Admin or Guard account for the system.</p>
              </div>
            </div>

            <div className="ma-form-card">
              <div className="ma-type-toggle">
                <button
                  className={`ma-type-btn ${accountType === 'ADMIN' ? 'active' : ''}`}
                  onClick={() => { setAccountType('ADMIN'); resetForm(); }}
                >
                  <Shield size={18} /> Admin Account
                </button>
                <button
                  className={`ma-type-btn ${accountType === 'GUARD' ? 'active' : ''}`}
                  onClick={() => { setAccountType('GUARD'); resetForm(); }}
                >
                  <Users size={18} /> Guard Account
                </button>
              </div>

              <div className="ma-form-body">
                {accountType === 'GUARD' && (
                  <div className="ma-field">
                    <label className="ma-label">Full Name</label>
                    <input className="ma-input" type="text"
                      placeholder="Enter guard's full name"
                      value={formData.fullName}
                      onChange={e => setFormData({ ...formData, fullName: e.target.value })}
                      onPaste={preventCopyPaste} onCopy={preventCopyPaste}
                      maxLength={50}
                    />
                  </div>
                )}

                <div className="ma-field">
                  <label className="ma-label">Username</label>
                  <input className="ma-input" type="text"
                    placeholder="Choose a username"
                    value={formData.username}
                    onChange={e => setFormData({ ...formData, username: e.target.value.slice(0, 20) })}
                    onPaste={preventCopyPaste} onCopy={preventCopyPaste}
                    maxLength={20}
                  />
                  <span className="ma-hint">{formData.username.length}/20 characters</span>
                </div>

                <div className="ma-field-row">
                  <div className="ma-field">
                    <label className="ma-label">Password</label>
                    <div className="ma-input-wrap">
                      <input className="ma-input"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Create a password"
                        value={formData.password}
                        onChange={e => setFormData({ ...formData, password: e.target.value })}
                        onPaste={preventCopyPaste} onCopy={preventCopyPaste}
                        maxLength={30}
                      />
                      <button type="button" className="ma-eye-btn" onClick={() => setShowPassword(p => !p)}>
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    <span className="ma-hint">Min 8 chars: A–Z, a–z, 0–9, special</span>
                  </div>

                  <div className="ma-field">
                    <label className="ma-label">Confirm Password</label>
                    <div className="ma-input-wrap">
                      <input className="ma-input"
                        type={showConfirmPassword ? 'text' : 'password'}
                        placeholder="Confirm password"
                        value={formData.confirmPassword}
                        onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
                        onPaste={preventCopyPaste} onCopy={preventCopyPaste}
                        maxLength={30}
                      />
                      <button type="button" className="ma-eye-btn" onClick={() => setShowConfirmPassword(p => !p)}>
                        {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                </div>

                {createError && (
                  <div className="ma-alert ma-alert-error"><XCircle size={18} /><span>{createError}</span></div>
                )}
                {createSuccess && (
                  <div className="ma-alert ma-alert-success"><CheckCircle size={18} /><span>{createSuccess}</span></div>
                )}

                <button className="ma-submit-btn" onClick={handleCreate} disabled={createLoading}>
                  {createLoading
                    ? <><span className="ma-spinner" />Creating Account...</>
                    : <><UserPlus size={18} />Create {accountType === 'ADMIN' ? 'Admin' : 'Guard'} Account</>
                  }
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════ MANAGE TAB ═══════════════ */}
        {activeTab === 'manage' && (
          <div className="ma-content-area">
            <div className="ma-page-header">
              <div>
                <h1 className="ma-page-title">Manage Accounts</h1>
                <p className="ma-page-sub">View, edit, and delete Admin and Guard accounts.</p>
              </div>
              <button className="ma-refresh-btn" onClick={fetchAccounts} disabled={loadingAccounts}>
                <RefreshCw size={16} className={loadingAccounts ? 'spin' : ''} /> Refresh
              </button>
            </div>

            {/* Stats */}
            <div className="ma-stats-row">
              <div className="ma-stat-pill admin">
                <Shield size={14} /><span>{adminCount} Admin{adminCount !== 1 ? 's' : ''}</span>
              </div>
              <div className="ma-stat-pill guard">
                <Users size={14} /><span>{guardCount} Guard{guardCount !== 1 ? 's' : ''}</span>
              </div>
              <div className="ma-stat-pill total">
                <User size={14} /><span>{accounts.length} Total</span>
              </div>
            </div>

            {/* Search + Filter */}
            <div className="ma-toolbar">
              <div className="ma-search-wrap">
                <Search size={16} className="ma-search-icon" />
                <input
                  className="ma-search-input"
                  type="text"
                  placeholder="Search by username or name…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                  <button className="ma-search-clear" onClick={() => setSearchQuery('')}>
                    <X size={14} />
                  </button>
                )}
              </div>
              <div className="ma-filter-wrap">
                <Filter size={15} />
                {['ALL', 'ADMIN', 'GUARD'].map(r => (
                  <button
                    key={r}
                    className={`ma-filter-btn ${filterRole === r ? 'active' : ''}`}
                    onClick={() => setFilterRole(r)}
                  >{r}</button>
                ))}
              </div>
            </div>

            {loadingAccounts ? (
              <div className="ma-loading"><span className="ma-spinner ma-spinner-lg" /><p>Loading accounts…</p></div>
            ) : filteredAccounts.length === 0 ? (
              <div className="ma-empty">
                <Users size={48} />
                <p>{accounts.length === 0 ? 'No accounts found.' : 'No results match your search.'}</p>
                <span>{accounts.length === 0 ? 'Use "Create Account" to add one.' : 'Try a different search or filter.'}</span>
              </div>
            ) : (
              <div className="ma-table-wrap">
                <table className="ma-table">
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th>Role</th>
                      <th>Full Name</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAccounts.map(acc => (
                      <tr key={acc._id}>
                        <td>
                          <div className="ma-table-user">
                            <div className={`ma-table-avatar ${acc.role === 'ADMIN' ? 'avatar-admin' : 'avatar-guard'}`}>
                              {acc.role === 'ADMIN' ? <Shield size={15} /> : <Users size={15} />}
                            </div>
                            <span className="ma-table-username">@{acc.username}</span>
                          </div>
                        </td>
                        <td>
                          <span className={`ma-account-badge ${acc.role === 'ADMIN' ? 'badge-admin' : 'badge-guard'}`}>
                            {acc.role}
                          </span>
                        </td>
                        <td className="ma-table-name">{acc.fullName || <span className="ma-table-na">—</span>}</td>
                        <td className="ma-table-date">{formatDate(acc.createdAt)}</td>
                        <td>
                          <div className="ma-action-btns">
                            <button className="ma-action-btn view-btn" onClick={() => openView(acc)} title="View details">
                              <Eye size={15} />
                            </button>
                            <button className="ma-action-btn edit-btn" onClick={() => openEdit(acc)} title="Edit account">
                              <Pencil size={15} />
                            </button>
                            <button className="ma-action-btn delete-btn" onClick={() => handleDelete(acc)} title="Delete account">
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <PaginationControls pagination={pagination} onPageChange={setPage} />
          </div>
        )}

        {activeTab === 'cctv' && (
          <div className="ma-content-area ma-content-area--full">
            <CCTVFeedsModule token={token()} mode="admin" />
          </div>
        )}

        {activeTab === 'subdivision_map' && (
          <div className="ma-content-area ma-content-area--full">
            <SubdivisionMap3D role="Master Admin" />
          </div>
        )}
      </main>

      {/* ═══════════════ VIEW MODAL ═══════════════ */}
      {viewModal && viewTarget && (
        <div className="ma-modal-overlay" onClick={closeView}>
          <div className="ma-modal" onClick={e => e.stopPropagation()}>
            <div className="ma-modal-header">
              <h2 className="ma-modal-title">Account Details</h2>
              <button className="ma-modal-close" onClick={closeView}><X size={20} /></button>
            </div>
            <div className="ma-modal-body">
              <div className="ma-view-hero">
                <div className={`ma-view-avatar ${viewTarget.role === 'ADMIN' ? 'avatar-admin' : 'avatar-guard'}`}>
                  {viewTarget.role === 'ADMIN' ? <Shield size={32} /> : <Users size={32} />}
                </div>
                <span className={`ma-account-badge ${viewTarget.role === 'ADMIN' ? 'badge-admin' : 'badge-guard'}`}>
                  {viewTarget.role}
                </span>
              </div>
              <div className="ma-view-fields">
                <div className="ma-view-field">
                  <span className="ma-view-label">Username</span>
                  <span className="ma-view-value">@{viewTarget.username}</span>
                </div>
                {viewTarget.fullName && (
                  <div className="ma-view-field">
                    <span className="ma-view-label">Full Name</span>
                    <span className="ma-view-value">{viewTarget.fullName}</span>
                  </div>
                )}
                <div className="ma-view-field">
                  <span className="ma-view-label">Role</span>
                  <span className="ma-view-value">{viewTarget.role}</span>
                </div>
                <div className="ma-view-field">
                  <span className="ma-view-label">Date Created</span>
                  <span className="ma-view-value">{formatDate(viewTarget.createdAt)}</span>
                </div>
              </div>
              <div className="ma-modal-footer">
                <button className="ma-btn-secondary" onClick={closeView}>Close</button>
                <button className="ma-btn-primary" onClick={() => { closeView(); openEdit(viewTarget); }}>
                  <Pencil size={15} /> Edit Account
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════ EDIT MODAL ═══════════════ */}
      {editModal && editTarget && (
        <div className="ma-modal-overlay" onClick={closeEdit}>
          <div className="ma-modal ma-modal-lg" onClick={e => e.stopPropagation()}>
            <div className="ma-modal-header">
              <h2 className="ma-modal-title">
                Edit Account&nbsp;
                <span className="ma-modal-subtitle">@{editTarget.username}</span>
              </h2>
              <button className="ma-modal-close" onClick={closeEdit}><X size={20} /></button>
            </div>

            <div className="ma-edit-tabs">
              <button
                className={`ma-edit-tab ${editMode === 'info' ? 'active' : ''}`}
                onClick={() => { setEditMode('info'); setEditError(''); setEditSuccess(''); }}
              >
                <User size={15} /> Account Info
              </button>
              <button
                className={`ma-edit-tab ${editMode === 'password' ? 'active' : ''}`}
                onClick={() => { setEditMode('password'); setEditError(''); setEditSuccess(''); }}
              >
                <KeyRound size={15} /> Reset Password
              </button>
            </div>

            <div className="ma-modal-body">
              {editMode === 'info' && (
                <div className="ma-edit-section">
                  <div className="ma-field">
                    <label className="ma-label">Username</label>
                    <input className="ma-input" type="text"
                      value={editData.username}
                      onChange={e => setEditData({ ...editData, username: e.target.value.slice(0, 20) })}
                      onPaste={preventCopyPaste} onCopy={preventCopyPaste}
                      maxLength={20}
                    />
                    <span className="ma-hint">{editData.username.length}/20 characters</span>
                  </div>
                  {editTarget.role === 'GUARD' && (
                    <div className="ma-field">
                      <label className="ma-label">Full Name</label>
                      <input className="ma-input" type="text"
                        value={editData.fullName}
                        onChange={e => setEditData({ ...editData, fullName: e.target.value })}
                        onPaste={preventCopyPaste} onCopy={preventCopyPaste}
                        maxLength={50}
                      />
                    </div>
                  )}
                  {editError && <div className="ma-alert ma-alert-error"><XCircle size={18} /><span>{editError}</span></div>}
                  {editSuccess && <div className="ma-alert ma-alert-success"><CheckCircle size={18} /><span>{editSuccess}</span></div>}
                  <div className="ma-modal-footer">
                    <button className="ma-btn-secondary" onClick={closeEdit}>Cancel</button>
                    <button className="ma-btn-primary" onClick={handleUpdateInfo} disabled={editLoading}>
                      {editLoading ? <><span className="ma-spinner" />Saving…</> : <><CheckCircle size={15} />Save Changes</>}
                    </button>
                  </div>
                </div>
              )}

              {editMode === 'password' && (
                <div className="ma-edit-section">
                  <div className="ma-pw-warning">
                    <KeyRound size={16} />
                    <span>This will immediately change the account's login password.</span>
                  </div>
                  <div className="ma-field">
                    <label className="ma-label">New Password</label>
                    <div className="ma-input-wrap">
                      <input className="ma-input"
                        type={showEditPw ? 'text' : 'password'}
                        placeholder="Enter new password"
                        value={editPwData.newPassword}
                        onChange={e => setEditPwData({ ...editPwData, newPassword: e.target.value })}
                        onPaste={preventCopyPaste} onCopy={preventCopyPaste}
                        maxLength={30}
                      />
                      <button type="button" className="ma-eye-btn" onClick={() => setShowEditPw(p => !p)}>
                        {showEditPw ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                    <span className="ma-hint">Min 8 chars: A–Z, a–z, 0–9, special character</span>
                  </div>
                  <div className="ma-field">
                    <label className="ma-label">Confirm New Password</label>
                    <div className="ma-input-wrap">
                      <input className="ma-input"
                        type={showEditConfirmPw ? 'text' : 'password'}
                        placeholder="Confirm new password"
                        value={editPwData.confirmPassword}
                        onChange={e => setEditPwData({ ...editPwData, confirmPassword: e.target.value })}
                        onPaste={preventCopyPaste} onCopy={preventCopyPaste}
                        maxLength={30}
                      />
                      <button type="button" className="ma-eye-btn" onClick={() => setShowEditConfirmPw(p => !p)}>
                        {showEditConfirmPw ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                  {editError && <div className="ma-alert ma-alert-error"><XCircle size={18} /><span>{editError}</span></div>}
                  {editSuccess && <div className="ma-alert ma-alert-success"><CheckCircle size={18} /><span>{editSuccess}</span></div>}
                  <div className="ma-modal-footer">
                    <button className="ma-btn-secondary" onClick={closeEdit}>Cancel</button>
                    <button className="ma-btn-primary" onClick={handleUpdatePassword} disabled={editLoading}>
                      {editLoading ? <><span className="ma-spinner" />Updating…</> : <><KeyRound size={15} />Update Password</>}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MasterAdminDashboard;
