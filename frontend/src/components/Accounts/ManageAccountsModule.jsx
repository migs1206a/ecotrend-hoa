import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiUrl } from '../../utils/api';
import {
  Eye,
  EyeOff,
  Filter,
  KeyRound,
  Pencil,
  RefreshCw,
  Search,
  Shield,
  Trash2,
  UserPlus,
  Users,
  X
} from 'lucide-react';
import PaginationControls from '../common/PaginationControls';
import { buildPaginatedUrl, parsePaginatedResponse } from '../../utils/pagination';
import {
  getEffectiveModules,
  getModuleLabel,
  getModuleOptionsForRole,
  getOfficerPositionLabel,
  normalizeModules,
  normalizeOfficerPosition,
  OFFICER_POSITION_OPTIONS,
  OFFICER_POSITIONS
} from '../../utils/adminPermissions';
import {
  sanitizeNameInput,
  validateNameValue
} from '../../utils/formSecurity';
import '../Dashboard/MasterAdminDashboard.css';
import './ManageAccountsModule.css';

const API = apiUrl('/master-admin');

const buildCreateForm = (accountType = 'ADMIN', position = OFFICER_POSITIONS.VICE_PRESIDENT) => ({
  username: '',
  fullName: '',
  password: '',
  confirmPassword: '',
  position,
  modules: normalizeModules(undefined, accountType, position)
});

const defaultPasswordForm = {
  newPassword: '',
  confirmPassword: ''
};

const arraysMatch = (first = [], second = []) =>
  first.length === second.length && first.every((value) => second.includes(value));

const getNextModulesForPosition = (currentModules, role, previousPosition, nextPosition) => {
  const previousDefaults = normalizeModules(undefined, role, previousPosition);
  const normalizedCurrent = normalizeModules(currentModules, role, previousPosition);

  if (arraysMatch(previousDefaults, normalizedCurrent)) {
    return normalizeModules(undefined, role, nextPosition);
  }

  return normalizeModules(currentModules, role, nextPosition);
};

const getAccountModules = (account) =>
  getEffectiveModules({
    role: account?.role,
    position: account?.position,
    modules: account?.modules
  });

const ModuleChecklist = ({ role, position, modules, onToggle, variant = 'default' }) => {
  const options = getModuleOptionsForRole(role);
  const normalizedModules = normalizeModules(modules, role, position);
  const selectedCount = normalizedModules.length;

  if (!options.length) {
    return null;
  }

  return (
    <div className={`ma-module-section ${variant === 'modal' ? 'is-modal' : ''}`}>
      <div className="ma-module-head">
        <div className="ma-module-heading">
          <div className="ma-module-topline">
            <h4>Module Access</h4>
            <span className="ma-module-count">{selectedCount} selected</span>
          </div>
          <p>Select which modules this account can open in the portal.</p>
        </div>
        {String(role || '').toUpperCase() === 'ADMIN' && (
          <div className="ma-module-note">Manage Accounts stays reserved for the president portal.</div>
        )}
      </div>

      <div className={`ma-module-grid ${variant === 'modal' ? 'ma-module-grid--modal' : ''}`}>
        {options.map((option) => {
          const checked = normalizedModules.includes(option.value);

          return (
            <label
              key={option.value}
              className={`ma-module-card ${checked ? 'active' : ''} ${option.required ? 'locked' : ''}`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={option.required}
                onChange={() => onToggle(option.value)}
              />
              <div className="ma-module-copy">
                <strong>{option.label}</strong>
                <span>{option.description}</span>
                {option.required && <em>Required basic access</em>}
              </div>
            </label>
          );
        })}
      </div>
    </div>
  );
};

const ManageAccountsModule = ({ showConfirm, showAlert }) => {
  const [activePanel, setActivePanel] = useState('create');
  const [accountType, setAccountType] = useState('ADMIN');
  const [formData, setFormData] = useState(buildCreateForm('ADMIN'));
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');

  const [accounts, setAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [filterRole, setFilterRole] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);

  const [editModal, setEditModal] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [editMode, setEditMode] = useState('info');
  const [editData, setEditData] = useState({
    username: '',
    fullName: '',
    position: OFFICER_POSITIONS.VICE_PRESIDENT,
    modules: normalizeModules(undefined, 'ADMIN', OFFICER_POSITIONS.VICE_PRESIDENT)
  });
  const [editPasswordData, setEditPasswordData] = useState(defaultPasswordForm);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [showEditConfirmPassword, setShowEditConfirmPassword] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState('');

  const token = localStorage.getItem('token');

  const resetCreateForm = useCallback((nextType = accountType, { preserveStatus = false } = {}) => {
    const nextPosition = OFFICER_POSITIONS.VICE_PRESIDENT;
    setFormData(buildCreateForm(nextType, nextPosition));
    if (!preserveStatus) {
      setCreateError('');
      setCreateSuccess('');
    }
    setShowPassword(false);
    setShowConfirmPassword(false);
  }, [accountType]);

  const validatePassword = (password) => {
    if (!password || password.length < 8) return 'Password must be at least 8 characters.';
    if (!/[A-Z]/.test(password)) return 'Password must contain an uppercase letter.';
    if (!/[a-z]/.test(password)) return 'Password must contain a lowercase letter.';
    if (!/[0-9]/.test(password)) return 'Password must contain a number.';
    if (!/[^A-Za-z0-9\s]/.test(password)) {
      return 'Password must contain a special character.';
    }
    return '';
  };

  const validateAccountForm = ({ username, fullName, password, confirmPassword, position, modules }, type) => {
    const fullNameValidation = validateNameValue(fullName, 'Full name', {
      minLength: 2,
      maxLength: 80
    });
    if (!fullNameValidation.valid) {
      return fullNameValidation.message;
    }

    if (String(username || '').trim().length < 3) {
      return 'Username must be at least 3 characters.';
    }

    if (!/^[a-zA-Z0-9_]+$/.test(String(username || '').trim())) {
      return 'Username can only contain letters, numbers, and underscores.';
    }

    if (type === 'ADMIN' && !normalizeOfficerPosition(position, 'ADMIN')) {
      return 'Please assign a valid officer role.';
    }

    if (normalizeModules(modules, type, position).length === 0) {
      return 'Please assign at least one module.';
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      return passwordError;
    }

    if (password !== confirmPassword) {
      return 'Passwords do not match.';
    }

    return '';
  };

  const fetchAccounts = useCallback(async (targetPage = 1) => {
    setLoadingAccounts(true);

    try {
      const response = await fetch(apiUrl(buildPaginatedUrl('/master-admin/accounts', targetPage)), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to load accounts.');
      }

      const parsed = Array.isArray(data?.accounts)
        ? { items: data.accounts, pagination: null }
        : parsePaginatedResponse(data);

      setAccounts(parsed.items);
      setPagination(parsed.pagination);
    } catch (error) {
      setAccounts([]);
      setPagination(null);
      setCreateError(error.message || 'Failed to load accounts.');
    } finally {
      setLoadingAccounts(false);
    }
  }, [token]);

  useEffect(() => {
    fetchAccounts(page);
  }, [fetchAccounts, page]);

  const handleCreate = async () => {
    setCreateError('');
    setCreateSuccess('');

    const validationError = validateAccountForm(formData, accountType);
    if (validationError) {
      setCreateError(validationError);
      return;
    }

    setCreateLoading(true);

    try {
      const fullNameValidation = validateNameValue(formData.fullName, 'Full name', {
        minLength: 2,
        maxLength: 80
      });
      const endpoint = accountType === 'ADMIN' ? `${API}/create-admin` : `${API}/create-guard`;
      const payload = accountType === 'ADMIN'
        ? {
            username: formData.username.trim(),
            fullName: fullNameValidation.value,
            password: formData.password,
            position: formData.position,
            modules: normalizeModules(formData.modules, 'ADMIN', formData.position)
          }
        : {
            username: formData.username.trim(),
            fullName: fullNameValidation.value,
            password: formData.password,
            modules: normalizeModules(formData.modules, 'GUARD')
          };

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to create account.');
      }

      const accountLabel = accountType === 'ADMIN' ? 'Officer' : 'Guard';
      resetCreateForm(accountType, { preserveStatus: true });
      setCreateSuccess(`${accountLabel} account created successfully.`);
      showAlert?.(`${accountLabel} account created successfully.`, 'success');

      if (page !== 1) {
        setPage(1);
      } else {
        fetchAccounts(1);
      }
    } catch (error) {
      setCreateError(error.message || 'Failed to create account.');
    } finally {
      setCreateLoading(false);
    }
  };

  const openEditModal = (account, mode = 'info') => {
    setEditTarget(account);
    setEditMode(mode);
    setEditData({
      username: account.username || '',
      fullName: account.fullName || '',
      position: normalizeOfficerPosition(account.position, account.role) || OFFICER_POSITIONS.VICE_PRESIDENT,
      modules: getAccountModules(account)
    });
    setEditPasswordData(defaultPasswordForm);
    setShowEditPassword(false);
    setShowEditConfirmPassword(false);
    setEditError('');
    setEditModal(true);
  };

  const closeEditModal = () => {
    setEditModal(false);
    setEditTarget(null);
    setEditMode('info');
    setEditError('');
    setEditPasswordData(defaultPasswordForm);
  };

  const handleUpdateInfo = async () => {
    if (!editTarget) {
      return;
    }

    setEditError('');

    const fullNameValidation = validateNameValue(editData.fullName, 'Full name', {
      minLength: 2,
      maxLength: 80
    });
    if (!fullNameValidation.valid) {
      setEditError(fullNameValidation.message);
      return;
    }

    if (String(editData.username || '').trim().length < 3) {
      setEditError('Username must be at least 3 characters.');
      return;
    }

    if (!/^[a-zA-Z0-9_]+$/.test(String(editData.username || '').trim())) {
      setEditError('Username can only contain letters, numbers, and underscores.');
      return;
    }

    if (editTarget.role === 'ADMIN' && !normalizeOfficerPosition(editData.position, 'ADMIN')) {
      setEditError('Please assign a valid officer role.');
      return;
    }

    if (normalizeModules(editData.modules, editTarget.role, editData.position).length === 0) {
      setEditError('Please assign at least one module.');
      return;
    }

    setEditLoading(true);

    try {
      const endpoint = editTarget.role === 'ADMIN'
        ? `${API}/admin/${editTarget._id}`
        : `${API}/guard/${editTarget._id}`;
      const payload = editTarget.role === 'ADMIN'
        ? {
            username: editData.username.trim(),
            fullName: fullNameValidation.value,
            position: editData.position,
            modules: normalizeModules(editData.modules, 'ADMIN', editData.position)
          }
        : {
            username: editData.username.trim(),
            fullName: fullNameValidation.value,
            modules: normalizeModules(editData.modules, 'GUARD')
          };

      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to update account.');
      }

      showAlert?.('Account updated successfully.', 'success');
      closeEditModal();
      fetchAccounts(page);
    } catch (error) {
      setEditError(error.message || 'Failed to update account.');
    } finally {
      setEditLoading(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!editTarget) {
      return;
    }

    setEditError('');

    const passwordError = validatePassword(editPasswordData.newPassword);
    if (passwordError) {
      setEditError(passwordError);
      return;
    }

    if (editPasswordData.newPassword !== editPasswordData.confirmPassword) {
      setEditError('Passwords do not match.');
      return;
    }

    setEditLoading(true);

    try {
      const endpoint = editTarget.role === 'ADMIN'
        ? `${API}/admin/${editTarget._id}/password`
        : `${API}/guard/${editTarget._id}/password`;

      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ newPassword: editPasswordData.newPassword })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to update password.');
      }

      showAlert?.('Password updated successfully.', 'success');
      closeEditModal();
    } catch (error) {
      setEditError(error.message || 'Failed to update password.');
    } finally {
      setEditLoading(false);
    }
  };

  const confirmAction = (message, action) => {
    if (showConfirm) {
      showConfirm(message, action);
      return;
    }

    if (window.confirm(message)) {
      action();
    }
  };

  const handleDelete = (account) => {
    confirmAction(`Delete ${account.role === 'ADMIN' ? 'this officer' : 'this guard'} account?`, async () => {
      try {
        const endpoint = account.role === 'ADMIN'
          ? `${API}/admin/${account._id}`
          : `${API}/guard/${account._id}`;

        const response = await fetch(endpoint, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Failed to delete account.');
        }

        showAlert?.('Account deleted successfully.', 'success');
        fetchAccounts(page);
      } catch (error) {
        showAlert?.(error.message || 'Failed to delete account.', 'error');
      }
    });
  };

  const filteredAccounts = useMemo(() => accounts.filter((account) => {
    const matchesRole = filterRole === 'ALL' || account.role === filterRole;
    const query = searchQuery.trim().toLowerCase();

    if (!query) {
      return matchesRole;
    }

    const positionLabel = account.role === 'ADMIN'
      ? getOfficerPositionLabel(account.position, 'ADMIN').toLowerCase()
      : 'security guard';
    const moduleLabels = getAccountModules(account)
      .map((moduleKey) => getModuleLabel(moduleKey, account.role).toLowerCase())
      .join(' ');

    const matchesSearch = [
      account.username,
      account.fullName,
      positionLabel,
      moduleLabels
    ].some((value) => String(value || '').toLowerCase().includes(query));

    return matchesRole && matchesSearch;
  }), [accounts, filterRole, searchQuery]);

  const officerCount = accounts.filter((account) => account.role === 'ADMIN').length;
  const guardCount = accounts.filter((account) => account.role === 'GUARD').length;
  const boardMemberCount = accounts.filter(
    (account) => account.role === 'ADMIN' && normalizeOfficerPosition(account.position, 'ADMIN') === OFFICER_POSITIONS.BOARD_MEMBER
  ).length;

  const formatDate = (value) => new Date(value).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });

  const renderModuleSummary = (account) => {
    const moduleLabels = getAccountModules(account).map((moduleKey) => getModuleLabel(moduleKey, account.role));
    const preview = moduleLabels.slice(0, 3);
    const remaining = moduleLabels.length - preview.length;

    return (
      <div className="ma-module-summary">
        {preview.map((label) => (
          <span key={label} className="ma-module-pill">{label}</span>
        ))}
        {remaining > 0 && <span className="ma-module-pill muted">+{remaining} more</span>}
      </div>
    );
  };

  const handleCreateRoleChange = (nextType) => {
    setAccountType(nextType);
    resetCreateForm(nextType);
  };

  const openAccountsPanel = () => {
    setActivePanel('accounts');
    fetchAccounts(page);
  };

  const toggleCreateModule = (moduleKey) => {
    setFormData((previous) => {
      const nextModules = previous.modules.includes(moduleKey)
        ? previous.modules.filter((item) => item !== moduleKey)
        : [...previous.modules, moduleKey];

      return {
        ...previous,
        modules: normalizeModules(nextModules, accountType, previous.position)
      };
    });
  };

  const toggleEditModule = (moduleKey) => {
    if (!editTarget) {
      return;
    }

    setEditData((previous) => {
      const nextModules = previous.modules.includes(moduleKey)
        ? previous.modules.filter((item) => item !== moduleKey)
        : [...previous.modules, moduleKey];

      return {
        ...previous,
        modules: normalizeModules(nextModules, editTarget.role, previous.position)
      };
    });
  };

  return (
    <div className="manage-accounts-module">
      <div className="ma-content-area ma-content-area--full">
        <div className="ma-page-header">
          <div>
            <h1 className="ma-page-title">Manage Accounts</h1>
            <p className="ma-page-sub">
              Create and manage officer and guard accounts, then assign exactly which modules they can access.
            </p>
          </div>
          <div className="ma-view-switch">
            <button
              type="button"
              className={`ma-view-btn ${activePanel === 'create' ? 'active' : ''}`}
              onClick={() => setActivePanel('create')}
            >
              <UserPlus size={16} />
              Create Account
            </button>
            <button
              type="button"
              className={`ma-view-btn ${activePanel === 'accounts' ? 'active' : ''}`}
              onClick={openAccountsPanel}
            >
              <Users size={16} />
              Accounts
            </button>
          </div>
        </div>

        <div className="ma-stats-row">
          <span className="ma-stat-pill total"><Shield size={15} /> {officerCount} officer account{officerCount === 1 ? '' : 's'}</span>
          <span className="ma-stat-pill guard"><Users size={15} /> {guardCount} guard account{guardCount === 1 ? '' : 's'}</span>
          <span className="ma-stat-pill admin"><Shield size={15} /> {boardMemberCount}/3 board members assigned</span>
        </div>

        {activePanel === 'create' && (
          <section className="ma-section">
            <div className="ma-form-card">
              <div className="ma-type-toggle">
                <button
                  className={`ma-type-btn ${accountType === 'ADMIN' ? 'active' : ''}`}
                  onClick={() => handleCreateRoleChange('ADMIN')}
                >
                  <Shield size={18} />
                  Officer Account
                </button>
                <button
                  className={`ma-type-btn ${accountType === 'GUARD' ? 'active' : ''}`}
                  onClick={() => handleCreateRoleChange('GUARD')}
                >
                  <Users size={18} />
                  Guard Account
                </button>
              </div>

              <div className="ma-form-body">
                {createError && <div className="ma-alert ma-alert-error">{createError}</div>}
                {createSuccess && <div className="ma-alert ma-alert-success">{createSuccess}</div>}

                <div className="ma-manage-grid">
                  <div className="ma-field">
                    <label className="ma-label">Full Name</label>
                    <input
                      className="ma-input"
                      type="text"
                      placeholder={accountType === 'ADMIN' ? 'Enter officer full name' : 'Enter guard full name'}
                      value={formData.fullName}
                      onChange={(event) => setFormData({ ...formData, fullName: sanitizeNameInput(event.target.value, 80) })}
                      maxLength={80}
                    />
                  </div>

                  <div className="ma-field">
                    <label className="ma-label">Username</label>
                    <input
                      className="ma-input"
                      type="text"
                      placeholder="Choose a username"
                      value={formData.username}
                      onChange={(event) => setFormData({ ...formData, username: event.target.value.slice(0, 20) })}
                      maxLength={20}
                    />
                  </div>

                  {accountType === 'ADMIN' && (
                    <div className="ma-field">
                      <label className="ma-label">Officer Role</label>
                      <select
                        className="ma-input ma-select"
                        value={formData.position}
                        onChange={(event) => {
                          const nextPosition = event.target.value;
                          setFormData((previous) => ({
                            ...previous,
                            position: nextPosition,
                            modules: getNextModulesForPosition(previous.modules, 'ADMIN', previous.position, nextPosition)
                          }));
                        }}
                      >
                        {OFFICER_POSITION_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                      <span className="ma-field-note">Default suggestions follow the selected officer role, but you can still fine-tune the checkboxes below.</span>
                    </div>
                  )}

                  <div className="ma-field">
                    <label className="ma-label">Password</label>
                    <div className="ma-input-wrap">
                      <input
                        className="ma-input"
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Enter a secure password"
                        value={formData.password}
                        onChange={(event) => setFormData({ ...formData, password: event.target.value })}
                      />
                      <button
                        type="button"
                        className="ma-eye-btn"
                        onClick={() => setShowPassword((value) => !value)}
                      >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <div className="ma-field">
                    <label className="ma-label">Confirm Password</label>
                    <div className="ma-input-wrap">
                      <input
                        className="ma-input"
                        type={showConfirmPassword ? 'text' : 'password'}
                        placeholder="Confirm the password"
                        value={formData.confirmPassword}
                        onChange={(event) => setFormData({ ...formData, confirmPassword: event.target.value })}
                      />
                      <button
                        type="button"
                        className="ma-eye-btn"
                        onClick={() => setShowConfirmPassword((value) => !value)}
                      >
                        {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>
                </div>

                <ModuleChecklist
                  role={accountType}
                  position={formData.position}
                  modules={formData.modules}
                  onToggle={toggleCreateModule}
                />

                <div className="ma-create-actions">
                  <button className="ma-submit-btn" onClick={handleCreate} disabled={createLoading}>
                    {createLoading ? <span className="ma-spinner" /> : <UserPlus size={18} />}
                    {createLoading ? 'Creating Account...' : `Create ${accountType === 'ADMIN' ? 'Officer' : 'Guard'} Account`}
                  </button>
                  <button type="button" className="ma-directory-link" onClick={openAccountsPanel}>
                    <Users size={16} />
                    Open Accounts Directory
                  </button>
                </div>
              </div>
            </div>
          </section>
        )}

        {activePanel === 'accounts' && (
          <section className="ma-section">
          <div className="ma-page-header ma-page-header--compact">
            <div>
              <h2 className="ma-page-title ma-page-title--small">Account Directory</h2>
              <p className="ma-page-sub">Review, edit, reset passwords, and remove accounts.</p>
            </div>
            <button type="button" className="ma-directory-link" onClick={() => setActivePanel('create')}>
              <UserPlus size={16} />
              Create Account
            </button>
          </div>

          <div className="ma-toolbar">
            <div className="ma-search-wrap">
              <Search size={16} className="ma-search-icon" />
              <input
                className="ma-search-input"
                type="text"
                placeholder="Search username, full name, role, or module"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
              {searchQuery && (
                <button className="ma-search-clear" onClick={() => setSearchQuery('')}>
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="ma-filter-wrap">
              <Filter size={16} />
              {['ALL', 'ADMIN', 'GUARD'].map((role) => (
                <button
                  key={role}
                  className={`ma-filter-btn ${filterRole === role ? 'active' : ''}`}
                  onClick={() => setFilterRole(role)}
                >
                  {role === 'ALL' ? 'All' : role === 'ADMIN' ? 'Officers' : 'Guards'}
                </button>
              ))}
            </div>

            <button className="ma-refresh-btn" onClick={() => fetchAccounts(page)} disabled={loadingAccounts}>
              <RefreshCw size={16} className={loadingAccounts ? 'spin' : ''} />
              Refresh
            </button>
          </div>

          {loadingAccounts ? (
            <div className="ma-loading">
              <div className="ma-spinner ma-spinner-lg" />
              <p>Loading accounts...</p>
            </div>
          ) : filteredAccounts.length === 0 ? (
            <div className="ma-empty">
              <Users size={36} />
              <p>No accounts found</p>
              <span>Try another search or role filter.</span>
            </div>
          ) : (
            <>
              <div className="ma-table-wrap">
                <table className="ma-table">
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th>Type</th>
                      <th>Assigned Role</th>
                      <th>Module Access</th>
                      <th>Created</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAccounts.map((account) => (
                      <tr key={account._id}>
                        <td>
                          <div className="ma-table-user">
                            <div className={`ma-table-avatar ${account.role === 'ADMIN' ? 'avatar-admin' : 'avatar-guard'}`}>
                              {account.username?.[0]?.toUpperCase() || 'A'}
                            </div>
                            <div>
                              <div className="ma-table-username">@{account.username}</div>
                              <div className="ma-table-name">{account.fullName || 'No full name yet'}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`ma-account-badge ${account.role === 'ADMIN' ? 'badge-admin' : 'badge-guard'}`}>
                            {account.role === 'ADMIN' ? 'Officer' : 'Guard'}
                          </span>
                        </td>
                        <td>
                          {account.role === 'ADMIN' ? (
                            <span className="ma-position-badge">{getOfficerPositionLabel(account.position, 'ADMIN')}</span>
                          ) : (
                            <span className="ma-table-na">Security Team</span>
                          )}
                        </td>
                        <td>{renderModuleSummary(account)}</td>
                        <td className="ma-table-date">{formatDate(account.createdAt)}</td>
                        <td>
                          <div className="ma-action-btns">
                            <button className="ma-action-btn edit-btn" onClick={() => openEditModal(account, 'info')}>
                              <Pencil size={16} />
                            </button>
                            <button className="ma-action-btn view-btn" onClick={() => openEditModal(account, 'password')}>
                              <KeyRound size={16} />
                            </button>
                            <button className="ma-action-btn delete-btn" onClick={() => handleDelete(account)}>
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {pagination && (
                <div className="ma-pagination-wrap">
                  <PaginationControls pagination={pagination} onPageChange={setPage} />
                </div>
              )}
            </>
          )}
          </section>
        )}
      </div>

      {editModal && editTarget && createPortal((
        <div className="ma-modal-overlay manage-accounts-module" onClick={closeEditModal}>
          <div className="ma-modal ma-modal-lg" onClick={(event) => event.stopPropagation()}>
            <div className="ma-modal-header">
              <div>
                <h3 className="ma-modal-title">
                  {editTarget.role === 'ADMIN' ? 'Edit Officer Account' : 'Edit Guard Account'}
                </h3>
                <p className="ma-modal-subtitle">@{editTarget.username}</p>
              </div>
              <button className="ma-modal-close" onClick={closeEditModal}>
                <X size={18} />
              </button>
            </div>

            <div className="ma-edit-tabs">
              <button
                className={`ma-edit-tab ${editMode === 'info' ? 'active' : ''}`}
                onClick={() => setEditMode('info')}
              >
                <Pencil size={16} />
                Account Info
              </button>
              <button
                className={`ma-edit-tab ${editMode === 'password' ? 'active' : ''}`}
                onClick={() => setEditMode('password')}
              >
                <KeyRound size={16} />
                Reset Password
              </button>
            </div>

            <div className="ma-modal-body">
              {editError && <div className="ma-alert ma-alert-error">{editError}</div>}

              {editMode === 'info' ? (
                <div className="ma-edit-section ma-edit-section--account">
                  <div className="ma-edit-form-grid">
                    <div className="ma-field">
                      <label className="ma-label">Full Name</label>
                      <input
                        className="ma-input"
                        type="text"
                        value={editData.fullName}
                        onChange={(event) => setEditData({ ...editData, fullName: sanitizeNameInput(event.target.value, 80) })}
                        maxLength={80}
                      />
                    </div>

                    <div className="ma-field">
                      <label className="ma-label">Username</label>
                      <input
                        className="ma-input"
                        type="text"
                        value={editData.username}
                        onChange={(event) => setEditData({ ...editData, username: event.target.value.slice(0, 20) })}
                        maxLength={20}
                      />
                    </div>

                    {editTarget.role === 'ADMIN' && (
                      <div className="ma-field ma-field--full">
                        <label className="ma-label">Officer Role</label>
                        <select
                          className="ma-input ma-select"
                          value={editData.position}
                          onChange={(event) => {
                            const nextPosition = event.target.value;
                            setEditData((previous) => ({
                              ...previous,
                              position: nextPosition,
                              modules: getNextModulesForPosition(previous.modules, 'ADMIN', previous.position, nextPosition)
                            }));
                          }}
                        >
                          {OFFICER_POSITION_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>

                  <ModuleChecklist
                    role={editTarget.role}
                    position={editData.position}
                    modules={editData.modules}
                    onToggle={toggleEditModule}
                    variant="modal"
                  />

                  <div className="ma-modal-footer">
                    <button className="ma-btn-secondary" onClick={closeEditModal}>Cancel</button>
                    <button className="ma-btn-primary" onClick={handleUpdateInfo} disabled={editLoading}>
                      {editLoading ? <span className="ma-spinner" /> : <Pencil size={16} />}
                      Save Changes
                    </button>
                  </div>
                </div>
              ) : (
                <div className="ma-edit-section">
                  <div className="ma-pw-warning">
                    <KeyRound size={16} />
                    This will replace the current password for this account.
                  </div>

                  <div className="ma-field">
                    <label className="ma-label">New Password</label>
                    <div className="ma-input-wrap">
                      <input
                        className="ma-input"
                        type={showEditPassword ? 'text' : 'password'}
                        value={editPasswordData.newPassword}
                        onChange={(event) => setEditPasswordData({ ...editPasswordData, newPassword: event.target.value })}
                      />
                      <button type="button" className="ma-eye-btn" onClick={() => setShowEditPassword((value) => !value)}>
                        {showEditPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <div className="ma-field">
                    <label className="ma-label">Confirm Password</label>
                    <div className="ma-input-wrap">
                      <input
                        className="ma-input"
                        type={showEditConfirmPassword ? 'text' : 'password'}
                        value={editPasswordData.confirmPassword}
                        onChange={(event) => setEditPasswordData({ ...editPasswordData, confirmPassword: event.target.value })}
                      />
                      <button type="button" className="ma-eye-btn" onClick={() => setShowEditConfirmPassword((value) => !value)}>
                        {showEditConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                      </button>
                    </div>
                  </div>

                  <div className="ma-modal-footer">
                    <button className="ma-btn-secondary" onClick={closeEditModal}>Cancel</button>
                    <button className="ma-btn-primary" onClick={handleUpdatePassword} disabled={editLoading}>
                      {editLoading ? <span className="ma-spinner" /> : <KeyRound size={16} />}
                      Update Password
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      ), document.body)}
    </div>
  );
};

export default ManageAccountsModule;
