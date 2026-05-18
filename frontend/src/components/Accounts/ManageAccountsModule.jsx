import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { apiUrl } from '../../utils/api';
import {
  Eye,
  EyeOff,
  Filter,
  KeyRound,
  Pencil,
  RefreshCw,
  RotateCcw,
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
  getLockedModulesForRole,
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
const ACTIVE_SCOPE = 'active';
const DELETED_SCOPE = 'deleted';
const ACCOUNT_SUMMARY_DEFAULT = Object.freeze({
  total: 0,
  officers: 0,
  guards: 0,
  residents: 0,
  boardMembers: 0
});
const ACCOUNT_SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'name_asc', label: 'Name A-Z' },
  { value: 'name_desc', label: 'Name Z-A' },
  { value: 'username_asc', label: 'Username A-Z' },
  { value: 'username_desc', label: 'Username Z-A' }
];

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

const getAccountModules = (account) => (
  account?.role === 'RESIDENT'
    ? []
    : getEffectiveModules({
        role: account?.role,
        position: account?.position,
        modules: account?.modules
      })
);

const getAccountDisplayName = (account) =>
  account?.role === 'RESIDENT'
    ? account?.familyName || account?.fullName || 'No family name yet'
    : account?.fullName || 'No full name yet';

const getAccountTypeLabel = (role = '') => {
  if (role === 'ADMIN') {
    return 'Officer';
  }

  if (role === 'GUARD') {
    return 'Guard';
  }

  if (role === 'RESIDENT') {
    return 'Resident';
  }

  return 'Account';
};

const getAssignedRoleLabel = (account = {}) => {
  if (account.role === 'ADMIN') {
    return getOfficerPositionLabel(account.position, 'ADMIN');
  }

  if (account.role === 'GUARD') {
    return 'Security Team';
  }

  if (account.role === 'RESIDENT') {
    return account.isApproved ? 'Resident Portal' : 'Pending Approval';
  }

  return 'Account';
};

const ModuleChecklist = ({ role, position, modules, onToggle, variant = 'default' }) => {
  const options = getModuleOptionsForRole(role);
  const normalizedModules = normalizeModules(modules, role, position);
  const lockedModules = getLockedModulesForRole(role, position);
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
          <div className="ma-module-note">Officer role defaults stay locked. You can still add extra modules for that officer when needed.</div>
        )}
        {String(role || '').toUpperCase() === 'GUARD' && (
          <div className="ma-module-note">Core guard modules stay locked so every guard keeps baseline access.</div>
        )}
      </div>

      <div className={`ma-module-grid ${variant === 'modal' ? 'ma-module-grid--modal' : ''}`}>
        {options.map((option) => {
          const checked = normalizedModules.includes(option.value);
          const isLocked = lockedModules.includes(option.value) || option.required;

          return (
            <label
              key={option.value}
              className={`ma-module-card ${checked ? 'active' : ''} ${isLocked ? 'locked' : ''}`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={isLocked}
                onChange={() => onToggle(option.value)}
              />
              <div className="ma-module-copy">
                <strong>{option.label}</strong>
                <span>{option.description}</span>
                {isLocked && <em>Locked for this role</em>}
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
  const [accountScope, setAccountScope] = useState(ACTIVE_SCOPE);
  const [formData, setFormData] = useState(buildCreateForm('ADMIN'));
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');

  const [accounts, setAccounts] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [filterRole, setFilterRole] = useState('ALL');
  const [sortOption, setSortOption] = useState('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [accountSummary, setAccountSummary] = useState(ACCOUNT_SUMMARY_DEFAULT);

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

  const validateResidentName = (value) => validateNameValue(value, 'Family name', {
    minLength: 2,
    maxLength: 20
  });

  const validateOfficerOrGuardName = (value) => validateNameValue(value, 'Full name', {
    minLength: 2,
    maxLength: 80
  });

  const validateAccountForm = ({ username, fullName, password, confirmPassword, position, modules }, type) => {
    const nameValidation = validateOfficerOrGuardName(fullName);
    if (!nameValidation.valid) {
      return nameValidation.message;
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

  const fetchAccounts = useCallback(async (targetPage = 1, targetScope = accountScope) => {
    setLoadingAccounts(true);

    try {
      const response = await fetch(apiUrl(buildPaginatedUrl('/master-admin/accounts', targetPage, {
        scope: targetScope,
        role: filterRole === 'ALL' ? '' : filterRole,
        q: searchQuery.trim(),
        sort: sortOption
      })), {
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
      setAccountSummary(data?.summary || ACCOUNT_SUMMARY_DEFAULT);
    } catch (error) {
      setAccounts([]);
      setPagination(null);
      setAccountSummary(ACCOUNT_SUMMARY_DEFAULT);
      setCreateError(error.message || 'Failed to load accounts.');
    } finally {
      setLoadingAccounts(false);
    }
  }, [accountScope, filterRole, searchQuery, sortOption, token]);

  useEffect(() => {
    if (activePanel !== 'accounts') {
      return;
    }

    fetchAccounts(page, accountScope);
  }, [accountScope, activePanel, fetchAccounts, page]);

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
      const fullNameValidation = validateOfficerOrGuardName(formData.fullName);
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

      if (activePanel === 'accounts') {
        if (page !== 1) {
          setPage(1);
        } else {
          fetchAccounts(1, ACTIVE_SCOPE);
        }
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
      fullName: account.familyName || account.fullName || '',
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

    const isResident = editTarget.role === 'RESIDENT';
    const nameValidation = isResident
      ? validateResidentName(editData.fullName)
      : validateOfficerOrGuardName(editData.fullName);

    if (!nameValidation.valid) {
      setEditError(nameValidation.message);
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

    if (!isResident && normalizeModules(editData.modules, editTarget.role, editData.position).length === 0) {
      setEditError('Please assign at least one module.');
      return;
    }

    setEditLoading(true);

    try {
      let endpoint = `${API}/resident/${editTarget._id}`;
      let payload = {
        username: editData.username.trim(),
        familyName: nameValidation.value
      };

      if (editTarget.role === 'ADMIN') {
        endpoint = `${API}/admin/${editTarget._id}`;
        payload = {
          username: editData.username.trim(),
          fullName: nameValidation.value,
          position: editData.position,
          modules: normalizeModules(editData.modules, 'ADMIN', editData.position)
        };
      } else if (editTarget.role === 'GUARD') {
        endpoint = `${API}/guard/${editTarget._id}`;
        payload = {
          username: editData.username.trim(),
          fullName: nameValidation.value,
          modules: normalizeModules(editData.modules, 'GUARD')
        };
      }

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
      fetchAccounts(page, accountScope);
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
        : editTarget.role === 'GUARD'
          ? `${API}/guard/${editTarget._id}/password`
          : `${API}/resident/${editTarget._id}/password`;

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
    const accountLabel = getAccountTypeLabel(account.role).toLowerCase();

    confirmAction(`Move this ${accountLabel} account to recently deleted?`, async () => {
      try {
        const endpoint = account.role === 'ADMIN'
          ? `${API}/admin/${account._id}`
          : account.role === 'GUARD'
            ? `${API}/guard/${account._id}`
            : `${API}/resident/${account._id}`;

        const response = await fetch(endpoint, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Failed to delete account.');
        }

        showAlert?.(data.message || 'Account moved to recently deleted.', 'success');
        fetchAccounts(page, accountScope);
      } catch (error) {
        showAlert?.(error.message || 'Failed to delete account.', 'error');
      }
    });
  };

  const handleRestore = (account) => {
    const accountLabel = getAccountTypeLabel(account.role).toLowerCase();

    confirmAction(`Restore this ${accountLabel} account?`, async () => {
      try {
        const endpoint = account.role === 'ADMIN'
          ? `${API}/admin/${account._id}/restore`
          : account.role === 'GUARD'
            ? `${API}/guard/${account._id}/restore`
            : `${API}/resident/${account._id}/restore`;

        const response = await fetch(endpoint, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Failed to restore account.');
        }

        showAlert?.(data.message || 'Account restored successfully.', 'success');
        fetchAccounts(page, accountScope);
      } catch (error) {
        showAlert?.(error.message || 'Failed to restore account.', 'error');
      }
    });
  };

  const officerCount = Number(accountSummary.officers) || 0;
  const guardCount = Number(accountSummary.guards) || 0;
  const residentCount = Number(accountSummary.residents) || 0;
  const boardMemberCount = Number(accountSummary.boardMembers) || 0;

  const formatDate = (value) => value ? new Date(value).toLocaleDateString('en-PH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  }) : 'Not set';

  const renderModuleSummary = (account) => {
    if (account.role === 'RESIDENT') {
      return (
        <div className="ma-module-summary">
          <span className="ma-module-pill">{account.isApproved ? 'Resident Portal' : 'Pending Approval'}</span>
          {account.accountStatusLabel && <span className="ma-module-pill muted">{account.accountStatusLabel}</span>}
        </div>
      );
    }

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

  const openAccountsPanel = (targetScope = ACTIVE_SCOPE) => {
    setActivePanel('accounts');
    if (page !== 1) {
      setPage(1);
    }
    setAccountScope(targetScope);
  };

  const handleScopeChange = (nextScope) => {
    setAccountScope(nextScope);
    setPage(1);
  };

  const handleSearchChange = (value) => {
    setSearchQuery(value);
    setPage(1);
  };

  const handleRoleFilterChange = (role) => {
    setFilterRole(role);
    setPage(1);
  };

  const handleSortChange = (value) => {
    setSortOption(value);
    setPage(1);
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
              Create officer and guard accounts, lock role-based module defaults, and manage resident accounts through the directory.
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
              onClick={() => openAccountsPanel(accountScope)}
            >
              <Users size={16} />
              Accounts
            </button>
          </div>
        </div>

        <div className="ma-stats-row">
          <span className="ma-stat-pill total"><Shield size={15} /> {officerCount} officer account{officerCount === 1 ? '' : 's'}</span>
          <span className="ma-stat-pill guard"><Users size={15} /> {guardCount} guard account{guardCount === 1 ? '' : 's'}</span>
          <span className="ma-stat-pill resident"><Users size={15} /> {residentCount} resident account{residentCount === 1 ? '' : 's'}</span>
          <span className="ma-stat-pill admin">
            <Shield size={15} />
            {accountScope === DELETED_SCOPE
              ? `${boardMemberCount} board member account${boardMemberCount === 1 ? '' : 's'}`
              : `${boardMemberCount}/3 board members assigned`}
          </span>
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
                      <span className="ma-field-note">Role-based default modules stay locked. You can still add extra access below.</span>
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
                  <button type="button" className="ma-directory-link" onClick={() => openAccountsPanel(ACTIVE_SCOPE)}>
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
                <h2 className="ma-page-title ma-page-title--small">
                  {accountScope === DELETED_SCOPE ? 'Recently Deleted Accounts' : 'Account Directory'}
                </h2>
                <p className="ma-page-sub">
                  {accountScope === DELETED_SCOPE
                    ? 'Restore recently deleted officer, guard, and resident accounts before they are purged automatically.'
                    : 'Review, edit, reset passwords, and move accounts to recently deleted.'}
                </p>
              </div>
              <button type="button" className="ma-directory-link" onClick={() => setActivePanel('create')}>
                <UserPlus size={16} />
                Create Account
              </button>
            </div>

            <div className="ma-scope-switch">
              <button
                type="button"
                className={`ma-scope-btn ${accountScope === ACTIVE_SCOPE ? 'active' : ''}`}
                onClick={() => handleScopeChange(ACTIVE_SCOPE)}
              >
                Active Accounts
              </button>
              <button
                type="button"
                className={`ma-scope-btn ${accountScope === DELETED_SCOPE ? 'active' : ''}`}
                onClick={() => handleScopeChange(DELETED_SCOPE)}
              >
                Recently Deleted
              </button>
            </div>

            <div className="ma-toolbar">
              <div className="ma-search-wrap">
                <Search size={16} className="ma-search-icon" />
                <input
                  className="ma-search-input"
                  type="text"
                  placeholder="Search username, name, role, or module"
                  value={searchQuery}
                  onChange={(event) => handleSearchChange(event.target.value)}
                />
                {searchQuery && (
                  <button className="ma-search-clear" onClick={() => handleSearchChange('')}>
                    <X size={14} />
                  </button>
                )}
              </div>

              <div className="ma-filter-wrap">
                <Filter size={16} />
                {['ALL', 'ADMIN', 'GUARD', 'RESIDENT'].map((role) => (
                  <button
                    key={role}
                    className={`ma-filter-btn ${filterRole === role ? 'active' : ''}`}
                    onClick={() => handleRoleFilterChange(role)}
                  >
                    {role === 'ALL' ? 'All' : getAccountTypeLabel(role)}
                  </button>
                ))}
              </div>

              <label className="ma-sort-wrap">
                <span>Sort</span>
                <select
                  className="ma-sort-select"
                  value={sortOption}
                  onChange={(event) => handleSortChange(event.target.value)}
                >
                  {ACCOUNT_SORT_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <button className="ma-refresh-btn" onClick={() => fetchAccounts(page, accountScope)} disabled={loadingAccounts}>
                <RefreshCw size={16} className={loadingAccounts ? 'spin' : ''} />
                Refresh
              </button>
            </div>

            {loadingAccounts ? (
              <div className="ma-loading">
                <div className="ma-spinner ma-spinner-lg" />
                <p>Loading accounts...</p>
              </div>
            ) : accounts.length === 0 ? (
              <div className="ma-empty">
                <Users size={36} />
                <p>No accounts found</p>
                <span>Try another search, role filter, or account scope.</span>
              </div>
            ) : (
              <>
                <div className="ma-table-wrap">
                  <table className="ma-table">
                    <thead>
                      {accountScope === ACTIVE_SCOPE ? (
                        <tr>
                          <th>Account</th>
                          <th>Type</th>
                          <th>Assigned Role</th>
                          <th>Module Access</th>
                          <th>Created</th>
                          <th>Actions</th>
                        </tr>
                      ) : (
                        <tr>
                          <th>Account</th>
                          <th>Type</th>
                          <th>Last Known Role</th>
                          <th>Deleted</th>
                          <th>Auto Purge</th>
                          <th>Actions</th>
                        </tr>
                      )}
                    </thead>
                    <tbody>
                      {accounts.map((account) => (
                        <tr key={account._id}>
                          <td>
                            <div className="ma-table-user">
                              <div className={`ma-table-avatar ${account.role === 'ADMIN' ? 'avatar-admin' : account.role === 'GUARD' ? 'avatar-guard' : 'avatar-resident'}`}>
                                {account.username?.[0]?.toUpperCase() || 'A'}
                              </div>
                              <div>
                                <div className="ma-table-username">@{account.username}</div>
                                <div className="ma-table-name">{getAccountDisplayName(account)}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className={`ma-account-badge ${account.role === 'ADMIN' ? 'badge-admin' : account.role === 'GUARD' ? 'badge-guard' : 'badge-resident'}`}>
                              {getAccountTypeLabel(account.role)}
                            </span>
                          </td>
                          <td>
                            {account.role === 'ADMIN' ? (
                              <span className="ma-position-badge">{getAssignedRoleLabel(account)}</span>
                            ) : (
                              <span className="ma-table-na">{getAssignedRoleLabel(account)}</span>
                            )}
                          </td>
                          {accountScope === ACTIVE_SCOPE ? (
                            <>
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
                            </>
                          ) : (
                            <>
                              <td className="ma-table-date">{formatDate(account.deletedAt)}</td>
                              <td className="ma-table-date">{formatDate(account.purgeAfter)}</td>
                              <td>
                                <div className="ma-action-btns">
                                  <button className="ma-action-btn restore-btn ma-action-btn--label" onClick={() => handleRestore(account)}>
                                    <RotateCcw size={16} />
                                    <span>Restore</span>
                                  </button>
                                </div>
                              </td>
                            </>
                          )}
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
                  {editTarget.role === 'ADMIN'
                    ? 'Edit Officer Account'
                    : editTarget.role === 'GUARD'
                      ? 'Edit Guard Account'
                      : 'Edit Resident Account'}
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
                      <label className="ma-label">{editTarget.role === 'RESIDENT' ? 'Family Name' : 'Full Name'}</label>
                      <input
                        className="ma-input"
                        type="text"
                        value={editData.fullName}
                        onChange={(event) => setEditData({
                          ...editData,
                          fullName: sanitizeNameInput(event.target.value, editTarget.role === 'RESIDENT' ? 20 : 80)
                        })}
                        maxLength={editTarget.role === 'RESIDENT' ? 20 : 80}
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

                  {editTarget.role !== 'RESIDENT' ? (
                    <ModuleChecklist
                      role={editTarget.role}
                      position={editData.position}
                      modules={editData.modules}
                      onToggle={toggleEditModule}
                      variant="modal"
                    />
                  ) : (
                    <div className="ma-module-note">Resident access is managed through approval status and the resident portal, so there are no officer-style module assignments here.</div>
                  )}

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
