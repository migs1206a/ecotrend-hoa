import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { apiUrl, assetUrl } from '../../utils/api';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Edit3,
  Eye,
  Filter,
  Home,
  Loader,
  MapPin,
  QrCode,
  Receipt,
  Save,
  Search,
  TrendingUp,
  Upload,
  Users,
  X
} from 'lucide-react';
import './AdminBillingManagement.css';
import {
  IMAGE_UPLOAD_MAX_BYTES,
  formatFileSize,
  validateImageFile
} from '../../utils/uploadValidation';
import PaginationControls from '../common/PaginationControls';
import { buildPaginatedUrl, parsePaginatedResponse } from '../../utils/pagination';

const MONTHS = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'
];
const BASE_YEAR = 2023;
const DEFAULT_MONTHLY_DUE = 150;
const API = apiUrl();
const PHASE_FILTER_OPTIONS = [
  { value: 'surname', label: 'By Surname' },
  { value: 'phase_1', label: 'Phase 1' },
  { value: 'phase_2', label: 'Phase 2' },
  { value: 'phase_3', label: 'Phase 3' },
  { value: 'phase_4', label: 'Phase 4' }
];

const emptyMonths = () =>
  MONTHS.reduce((acc, month) => {
    acc[month] = {
      paid: false,
      orNumber: '',
      datePaid: '',
      remarks: '',
      paymentMethod: '',
      paymentStatus: 'none',
      receipt: {}
    };
    return acc;
  }, {});

const formatMonthLabel = (month) => month.charAt(0) + month.slice(1).toLowerCase();
const formatCurrency = (amount) =>
  `P${Number(amount || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;

const normalizeOccupancyType = (value) =>
  String(value || '').toLowerCase() === 'renter' ? 'renter' : 'permanent';

const getResidentTypeLabel = (occupancyType) =>
  normalizeOccupancyType(occupancyType) === 'renter' ? 'Renter' : 'Permanent Resident';

const normalizePhaseLabel = (phase) => {
  const raw = String(phase || '').trim();
  const match = raw.match(/([1-4])/);

  if (match) {
    return `Phase ${match[1]}`;
  }

  return raw || 'Unassigned';
};

const getConfiguredDue = (settings, targetYear, occupancyType) => {
  const dueSource = normalizeOccupancyType(occupancyType) === 'renter'
    ? settings?.yearlyRenterDues || {}
    : settings?.yearlyDues || {};

  return Number(dueSource[String(targetYear)]) || DEFAULT_MONTHLY_DUE;
};

const sortResidents = (first, second) => {
  const surnameComparison = String(first.familyName || '').localeCompare(
    String(second.familyName || ''),
    undefined,
    { sensitivity: 'base' }
  );

  if (surnameComparison !== 0) {
    return surnameComparison;
  }

  return normalizePhaseLabel(first.phase).localeCompare(
    normalizePhaseLabel(second.phase),
    undefined,
    { sensitivity: 'base' }
  );
};

const AdminBillingManagement = ({ token, showConfirm }) => {
  const headers = useCallback(
    () => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    }),
    [token]
  );

  const [directory, setDirectory] = useState([]);
  const [loadingDirectory, setLoadingDirectory] = useState(true);
  const [search, setSearch] = useState('');
  const [phaseFilter, setPhaseFilter] = useState('surname');
  const [activeResidentType, setActiveResidentType] = useState('permanent');
  const [directoryPage, setDirectoryPage] = useState(1);
  const [directoryPagination, setDirectoryPagination] = useState(null);
  const [directorySummary, setDirectorySummary] = useState({
    permanentTotal: 0,
    renterTotal: 0,
    total: 0
  });

  const [selected, setSelected] = useState(null);
  const [year, setYear] = useState(() => {
    const currentYear = new Date().getFullYear();
    return currentYear < BASE_YEAR ? BASE_YEAR : currentYear;
  });

  const [billingData, setBillingData] = useState(emptyMonths());
  const [billingMonthlyDue, setBillingMonthlyDue] = useState(DEFAULT_MONTHLY_DUE);
  const [detailLoad, setDetailLoad] = useState(false);
  const [editingRow, setEditingRow] = useState(null);
  const [editDraft, setEditDraft] = useState({});
  const [saving, setSaving] = useState(false);

  const [settings, setSettings] = useState(null);
  const [dueDrafts, setDueDrafts] = useState({
    permanent: String(DEFAULT_MONTHLY_DUE),
    renter: String(DEFAULT_MONTHLY_DUE)
  });
  const [savingDueKey, setSavingDueKey] = useState('');
  const [qrFile, setQrFile] = useState(null);
  const [uploadingQr, setUploadingQr] = useState(false);
  const [viewingReceipt, setViewingReceipt] = useState(null);
  const [viewingQr, setViewingQr] = useState(false);

  const configuredPermanentDue = getConfiguredDue(settings, year, 'permanent');
  const configuredRenterDue = getConfiguredDue(settings, year, 'renter');
  const configuredDues = useMemo(() => ({
    permanent: configuredPermanentDue,
    renter: configuredRenterDue
  }), [configuredPermanentDue, configuredRenterDue]);

  const currentYear = new Date().getFullYear();
  const maxConfiguredYear = Math.max(
    currentYear + 2,
    ...Object.keys(settings?.yearlyDues || {}).map((value) => Number(value)).filter(Number.isFinite),
    ...Object.keys(settings?.yearlyRenterDues || {}).map((value) => Number(value)).filter(Number.isFinite)
  );
  const years = Array.from(
    { length: Math.max(maxConfiguredYear - BASE_YEAR + 1, 1) },
    (_, index) => BASE_YEAR + index
  );

  const fetchDirectory = useCallback(async (targetYear, targetPage = directoryPage) => {
    try {
      const response = await fetch(apiUrl(buildPaginatedUrl(`/billing/directory/${targetYear}`, targetPage, {
        search,
        phase: phaseFilter === 'surname' ? '' : phaseFilter.replace('phase_', ''),
        occupancyType: activeResidentType
      })), { headers: headers() });
      const data = await response.json();
      const parsed = parsePaginatedResponse(data);
      const residents = parsed.items;

      setDirectory(residents);
      setDirectoryPagination(parsed.pagination);
      setDirectorySummary(data?.summary || {
        permanentTotal: activeResidentType === 'permanent' ? parsed.pagination?.total || residents.length : 0,
        renterTotal: activeResidentType === 'renter' ? parsed.pagination?.total || residents.length : 0,
        total: parsed.pagination?.total || residents.length
      });
      setSelected((current) =>
        current ? residents.find((resident) => resident._id === current._id) || current : current
      );
    } catch (error) {
      setDirectory([]);
      setDirectoryPagination(null);
      setDirectorySummary({ permanentTotal: 0, renterTotal: 0, total: 0 });
    }
  }, [activeResidentType, directoryPage, headers, phaseFilter, search]);

  const fetchSettings = useCallback(async () => {
    try {
      const response = await fetch(`${API}/billing/settings`, { headers: headers() });
      const data = await response.json();
      setSettings(data);
    } catch (error) {
      setSettings(null);
    }
  }, [headers]);

  const loadOverviewData = useCallback(async (targetYear, targetPage = directoryPage, { showLoading = true } = {}) => {
    if (showLoading) {
      setLoadingDirectory(true);
    }

    try {
      await Promise.all([
        fetchDirectory(targetYear, targetPage),
        fetchSettings()
      ]);
    } finally {
      if (showLoading) {
        setLoadingDirectory(false);
      }
    }
  }, [directoryPage, fetchDirectory, fetchSettings]);

  useEffect(() => {
    setDirectoryPage(1);
  }, [activeResidentType, phaseFilter, search, year]);

  useEffect(() => {
    loadOverviewData(year, directoryPage);
  }, [year, directoryPage, loadOverviewData]);

  useEffect(() => {
    setDueDrafts({
      permanent: String(configuredPermanentDue),
      renter: String(configuredRenterDue)
    });
  }, [configuredPermanentDue, configuredRenterDue, year]);

  const fetchBillingDetail = useCallback(async (residentId, targetYear) => {
    setDetailLoad(true);

    try {
      const response = await fetch(`${API}/billing/${residentId}/${targetYear}`, { headers: headers() });
      const data = await response.json();
      const merged = emptyMonths();

      if (data.months) {
        MONTHS.forEach((month) => {
          if (data.months[month]) {
            merged[month] = {
              ...merged[month],
              ...data.months[month]
            };
          }
        });
      }

      setBillingData(merged);
      setBillingMonthlyDue(Number(data.monthlyDue) || DEFAULT_MONTHLY_DUE);
    } catch (error) {
      setBillingData(emptyMonths());
      setBillingMonthlyDue(
        selected?.billing?.monthlyDue || getConfiguredDue(settings, targetYear, selected?.occupancyType)
      );
    }

    setDetailLoad(false);
  }, [headers, selected, settings]);

  useEffect(() => {
    if (!selected) {
      return;
    }

    setEditingRow(null);
    setBillingMonthlyDue(
      selected.billing?.monthlyDue || getConfiguredDue(settings, year, selected.occupancyType)
    );
    fetchBillingDetail(selected._id, year);
  }, [selected, year, fetchBillingDetail, settings]);

  const updateDirectoryAfterMutation = useCallback(async () => {
    await fetchDirectory(year, directoryPage);
  }, [directoryPage, fetchDirectory, year]);

  const togglePaid = async (month) => {
    const newPaid = !billingData[month].paid;

    setBillingData((prev) => ({
      ...prev,
      [month]: {
        ...prev[month],
        paid: newPaid,
        paymentStatus: newPaid ? 'verified' : 'none'
      }
    }));

    try {
      const response = await fetch(`${API}/billing/${selected._id}/${year}/${month}`, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({
          paid: newPaid,
          paymentStatus: newPaid ? 'verified' : 'none'
        })
      });

      if (!response.ok) {
        throw new Error('Unable to update payment status');
      }

      await updateDirectoryAfterMutation();
    } catch (error) {
      fetchBillingDetail(selected._id, year);
    }
  };

  const startEdit = (month) => {
    setEditingRow(month);
    setEditDraft({ ...billingData[month] });
  };

  const commitEdit = async () => {
    const month = editingRow;

    if (!month) {
      return;
    }

    setSaving(true);
    const snapshot = { ...billingData[month] };
    setBillingData((prev) => ({
      ...prev,
      [month]: {
        ...prev[month],
        ...editDraft
      }
    }));
    setEditingRow(null);

    try {
      const response = await fetch(`${API}/billing/${selected._id}/${year}/${month}`, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({
          paid: editDraft.paid,
          orNumber: editDraft.orNumber,
          datePaid: editDraft.datePaid,
          remarks: editDraft.remarks,
          paymentStatus: editDraft.paymentStatus,
          paymentMethod: editDraft.paymentMethod
        })
      });

      if (!response.ok) {
        throw new Error('Unable to save billing changes');
      }

      await updateDirectoryAfterMutation();
    } catch (error) {
      setBillingData((prev) => ({ ...prev, [month]: snapshot }));
    }

    setSaving(false);
  };

  const reviewReceipt = async (month, paymentStatus) => {
    const currentRecord = billingData[month];
    const message =
      paymentStatus === 'verified'
        ? `Verify ${formatMonthLabel(month)} payment receipt?`
        : `Reject ${formatMonthLabel(month)} payment receipt?`;

    showConfirm(message, async () => {
      setSaving(true);

      try {
        const response = await fetch(`${API}/billing/${selected._id}/${year}/${month}/review`, {
          method: 'PATCH',
          headers: headers(),
          body: JSON.stringify({
            paymentStatus,
            remarks: currentRecord.remarks,
            orNumber: currentRecord.orNumber,
            datePaid: currentRecord.datePaid
          })
        });

        if (!response.ok) {
          throw new Error('Unable to review receipt');
        }

        await Promise.all([
          fetchBillingDetail(selected._id, year),
          updateDirectoryAfterMutation()
        ]);
      } finally {
        setSaving(false);
      }
    });
  };

  const payAll = () => {
    const unpaidMonths = MONTHS.filter((month) => !billingData[month]?.paid);

    if (unpaidMonths.length === 0) {
      return;
    }

    showConfirm(`Are you sure you want to pay all months for ${year}?`, async () => {
      setSaving(true);

      try {
        await Promise.all(
          unpaidMonths.map(async (month) => {
            const response = await fetch(`${API}/billing/${selected._id}/${year}/${month}`, {
              method: 'PATCH',
              headers: headers(),
              body: JSON.stringify({
                paid: true,
                paymentStatus: 'verified'
              })
            });

            if (!response.ok) {
              throw new Error(`Unable to pay ${month}`);
            }
          })
        );

        await Promise.all([
          fetchBillingDetail(selected._id, year),
          updateDirectoryAfterMutation()
        ]);
      } finally {
        setSaving(false);
      }
    });
  };

  const unpayAll = () => {
    const paidMonths = MONTHS.filter((month) => billingData[month]?.paid);

    if (paidMonths.length === 0) {
      return;
    }

    showConfirm(`Are you sure you want to unpay all months for ${year}?`, async () => {
      setSaving(true);

      try {
        await Promise.all(
          paidMonths.map(async (month) => {
            const response = await fetch(`${API}/billing/${selected._id}/${year}/${month}`, {
              method: 'PATCH',
              headers: headers(),
              body: JSON.stringify({
                paid: false,
                paymentStatus: billingData[month]?.receipt?.path ? 'pending' : 'none'
              })
            });

            if (!response.ok) {
              throw new Error(`Unable to unpay ${month}`);
            }
          })
        );

        await Promise.all([
          fetchBillingDetail(selected._id, year),
          updateDirectoryAfterMutation()
        ]);
      } finally {
        setSaving(false);
      }
    });
  };

  const handleQrUpload = async (event) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    const validation = validateImageFile(file, {
      label: 'GCash QR image',
      maxBytes: IMAGE_UPLOAD_MAX_BYTES
    });

    if (!validation.valid) {
      window.alert(validation.message);
      event.target.value = '';
      return;
    }

    setQrFile(file);
    setUploadingQr(true);

    try {
      const formData = new FormData();
      formData.append('gcashQr', file);

      const response = await fetch(`${API}/billing/settings/gcash-qr`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
        body: formData
      });
      const data = await response.json();

      if (response.ok) {
        setSettings(data);
      }
    } catch (error) {
      // Keep current settings unchanged on failure.
    }

    setUploadingQr(false);
  };

  const handleMonthlyDueSave = async (occupancyType) => {
    const amount = Number(dueDrafts[occupancyType]);

    if (!Number.isFinite(amount) || amount <= 0) {
      return;
    }

    setSavingDueKey(occupancyType);

    try {
      const response = await fetch(`${API}/billing/settings/monthly-due`, {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify({
          year,
          amount,
          occupancyType
        })
      });

      if (!response.ok) {
        return;
      }

      const data = await response.json();
      setSettings(data);
      await updateDirectoryAfterMutation();

      if (selected && normalizeOccupancyType(selected.occupancyType) === occupancyType) {
        await fetchBillingDetail(selected._id, year);
      }
    } catch (error) {
      // Keep current amount on failure.
    }

    setSavingDueKey('');
  };

  const filteredResidents = useMemo(() => {
    const searchText = search.trim().toLowerCase();

    return [...directory]
      .filter((resident) => {
        const matchesSearch = !searchText || [
          resident.familyName,
          resident.username,
          resident.houseAddress,
          resident.street
        ].some((value) => String(value || '').toLowerCase().includes(searchText));

        if (!matchesSearch) {
          return false;
        }

        if (phaseFilter === 'surname') {
          return true;
        }

        return normalizePhaseLabel(resident.phase) === PHASE_FILTER_OPTIONS.find(
          (option) => option.value === phaseFilter
        )?.label;
      })
      .sort(sortResidents);
  }, [directory, phaseFilter, search]);

  const permanentResidents = useMemo(
    () => filteredResidents.filter((resident) => normalizeOccupancyType(resident.occupancyType) === 'permanent'),
    [filteredResidents]
  );
  const renterResidents = useMemo(
    () => filteredResidents.filter((resident) => normalizeOccupancyType(resident.occupancyType) === 'renter'),
    [filteredResidents]
  );
  const permanentTotal = directorySummary.permanentTotal || 0;
  const renterTotal = directorySummary.renterTotal || 0;

  const residentGroups = useMemo(() => ({
    permanent: {
      label: 'Permanent Residents',
      icon: Home,
      residents: permanentResidents,
      totalResidents: permanentTotal,
      monthlyDue: configuredDues.permanent
    },
    renter: {
      label: 'Renters',
      icon: Users,
      residents: renterResidents,
      totalResidents: renterTotal,
      monthlyDue: configuredDues.renter
    }
  }), [
    configuredDues.permanent,
    configuredDues.renter,
    permanentTotal,
    permanentResidents,
    renterTotal,
    renterResidents
  ]);

  const activeGroup = residentGroups[activeResidentType];
  const fullyPaid = directory.filter((resident) => (resident.billing?.paidCount || 0) === 12).length;
  const withArrears = directory.filter((resident) => (resident.billing?.paidCount || 0) < 12).length;
  const withPending = directory.filter((resident) => (resident.billing?.pendingCount || 0) > 0).length;

  const selectedConfiguredDue = selected
    ? getConfiguredDue(settings, year, selected.occupancyType)
    : configuredPermanentDue;
  const monthlyDue = selected ? billingMonthlyDue || selectedConfiguredDue : activeGroup.monthlyDue;
  const totalPaid = MONTHS.filter((month) => billingData[month]?.paid).length;
  const totalAmount = totalPaid * monthlyDue;
  const totalDue = 12 * monthlyDue;
  const totalUnpaid = totalDue - totalAmount;

  const renderDirectoryTable = () => {
    if (loadingDirectory) {
      return (
        <div className="loading-container">
          <div className="spinner" />
          <p className="loading-text">Loading billing directory...</p>
        </div>
      );
    }

    if (activeGroup.residents.length === 0) {
      return (
        <div className="empty-state">
          <div className="empty-icon"><Users size={36} style={{ color: '#9ca3af' }} /></div>
          <h3>No {activeGroup.label} Found</h3>
          <p>{search || phaseFilter !== 'surname' ? 'Try another search or phase filter.' : `No ${activeGroup.label.toLowerCase()} yet.`}</p>
        </div>
      );
    }

    return (
      <div className="billing-directory-table-wrap">
        <table className="billing-directory-table">
          <thead>
            <tr>
              <th>Surname</th>
              <th>Phase</th>
              <th>Address</th>
              <th>Paid</th>
              <th>Pending</th>
              <th>Monthly Due</th>
              <th>Collected</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {activeGroup.residents.map((resident) => {
              const paidCount = resident.billing?.paidCount || 0;
              const pendingCount = resident.billing?.pendingCount || 0;
              const rowMonthlyDue = Number(resident.billing?.monthlyDue) || activeGroup.monthlyDue;
              const totalCollected = paidCount * rowMonthlyDue;

              return (
                <tr key={resident._id}>
                  <td>
                    <div className="billing-directory-name">
                      <div className="billing-row-avatar">{resident.familyName?.[0] || 'R'}</div>
                      <div>
                        <strong>{resident.familyName}</strong>
                        <span>@{resident.username}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="billing-directory-pill">{normalizePhaseLabel(resident.phase)}</span>
                  </td>
                  <td>
                    <span className="billing-directory-address">
                      <MapPin size={12} />
                      {[resident.houseAddress, resident.street].filter(Boolean).join(', ')}
                    </span>
                  </td>
                  <td>{paidCount}/12</td>
                  <td>
                    {pendingCount > 0 ? (
                      <span className="billing-pending-pill">{pendingCount} pending</span>
                    ) : (
                      <span className="billing-cell-empty">-</span>
                    )}
                  </td>
                  <td>{formatCurrency(rowMonthlyDue)}</td>
                  <td>{formatCurrency(totalCollected)}</td>
                  <td className="billing-directory-action-cell">
                    <button
                      type="button"
                      className="billing-directory-open-btn"
                      onClick={() => setSelected(resident)}
                    >
                      Open
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  if (!selected) {
    return (
      <div className="billing-root">
        <div className="page-header" style={{ marginBottom: '1rem' }}>
          <div className="page-title">
            <h2>Billing &amp; Payments</h2>
            <p>Separate monthly billing tables for permanent residents and renters for {year}</p>
          </div>
        </div>

        <div className="billing-settings-grid">
          <div className="billing-settings-card">
            <div className="billing-settings-header">
              <div>
                <h3><Receipt size={18} /> Monthly Dues by Resident Type</h3>
                <p>Set the billing amount per month for each resident type for the selected year.</p>
              </div>
            </div>
            <div className="billing-dues-grid">
              <div className="billing-due-panel">
                <div className="billing-due-panel-head">
                  <div>
                    <h4>Permanent Residents</h4>
                    <p>{year} default monthly due</p>
                  </div>
                  <span className="billing-dues-year">{year}</span>
                </div>
                <div className="billing-dues-editor">
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    className="billing-dues-input"
                    value={dueDrafts.permanent}
                    onChange={(event) => setDueDrafts((prev) => ({
                      ...prev,
                      permanent: event.target.value
                    }))}
                  />
                  <button
                    type="button"
                    className="billing-dues-save-btn"
                    onClick={() => handleMonthlyDueSave('permanent')}
                    disabled={
                      savingDueKey === 'permanent' ||
                      Number(dueDrafts.permanent) <= 0 ||
                      Number(dueDrafts.permanent) === configuredPermanentDue
                    }
                  >
                    {savingDueKey === 'permanent' ? 'Saving...' : 'Save Amount'}
                  </button>
                </div>
              </div>

              <div className="billing-due-panel">
                <div className="billing-due-panel-head">
                  <div>
                    <h4>Renters</h4>
                    <p>{year} renter monthly due</p>
                  </div>
                  <span className="billing-dues-year accent">Renter</span>
                </div>
                <div className="billing-dues-editor">
                  <input
                    type="number"
                    min="1"
                    step="0.01"
                    className="billing-dues-input"
                    value={dueDrafts.renter}
                    onChange={(event) => setDueDrafts((prev) => ({
                      ...prev,
                      renter: event.target.value
                    }))}
                  />
                  <button
                    type="button"
                    className="billing-dues-save-btn"
                    onClick={() => handleMonthlyDueSave('renter')}
                    disabled={
                      savingDueKey === 'renter' ||
                      Number(dueDrafts.renter) <= 0 ||
                      Number(dueDrafts.renter) === configuredRenterDue
                    }
                  >
                    {savingDueKey === 'renter' ? 'Saving...' : 'Save Amount'}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="billing-settings-card">
            <div className="billing-settings-header">
              <div>
                <h3><QrCode size={18} /> GCash QR Code</h3>
                <p>Residents will use this QR code when paying their monthly dues.</p>
              </div>
              <label className="billing-upload-qr-btn">
                <Upload size={14} />
                {uploadingQr ? 'Uploading...' : `Update QR (max ${formatFileSize(IMAGE_UPLOAD_MAX_BYTES)})`}
                <input type="file" accept="image/*" onChange={handleQrUpload} />
              </label>
            </div>
            <div className="billing-settings-preview">
              {settings?.gcashQr?.path ? (
                <button type="button" className="billing-qr-open-btn" onClick={() => setViewingQr(true)}>
                  <QrCode size={14} />
                  View Current QR
                </button>
              ) : (
                <div className="billing-qr-empty">
                  <AlertCircle size={18} />
                  <span>No GCash QR code uploaded yet</span>
                </div>
              )}
              {qrFile && !uploadingQr && <span className="billing-upload-filename">{qrFile.name}</span>}
            </div>
          </div>
        </div>

        <div className="billing-summary-strip">
          <div className="bss-item">
            <div className="bss-icon bg-blue-50"><Home size={18} className="text-blue-600" /></div>
            <div><p className="bss-label">Permanent Residents</p><p className="bss-value">{permanentTotal}</p></div>
          </div>
          <div className="bss-item">
            <div className="bss-icon bg-green-50"><Users size={18} className="text-green-600" /></div>
            <div><p className="bss-label">Renters</p><p className="bss-value">{renterTotal}</p></div>
          </div>
          <div className="bss-item">
            <div className="bss-icon bg-green-50"><CheckCircle size={18} className="text-green-600" /></div>
            <div><p className="bss-label">Fully Paid ({year})</p><p className="bss-value">{fullyPaid}</p></div>
          </div>
          <div className="bss-item">
            <div className="bss-icon" style={{ background: 'linear-gradient(135deg,#fef3c7,#fde68a)' }}>
              <AlertCircle size={18} style={{ color: '#d97706' }} />
            </div>
            <div><p className="bss-label">With Arrears ({year})</p><p className="bss-value">{withArrears}</p></div>
          </div>
          <div className="bss-item">
            <div className="bss-icon" style={{ background: 'linear-gradient(135deg,#dbeafe,#bfdbfe)' }}>
              <Receipt size={18} style={{ color: '#2563eb' }} />
            </div>
            <div><p className="bss-label">Pending Receipts</p><p className="bss-value">{withPending}</p></div>
          </div>
          <div className="bss-item">
            <div className="bss-icon" style={{ background: 'linear-gradient(135deg,#ede9fe,#ddd6fe)' }}>
              <TrendingUp size={18} style={{ color: '#7c3aed' }} />
            </div>
            <div>
              <p className="bss-label">Year Filter</p>
              <div className="bss-year-nav">
                <button onClick={() => setYear((value) => Math.max(BASE_YEAR, value - 1))} disabled={year <= BASE_YEAR}>
                  <ChevronLeft size={14} />
                </button>
                <span>{year}</span>
                <button onClick={() => setYear((value) => Math.min(maxConfiguredYear, value + 1))} disabled={year >= maxConfiguredYear}>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="billing-filters-row">
          <div className="billing-search-wrap">
            <Search size={16} className="billing-search-icon" />
            <input
              className="billing-search"
              placeholder="Search surname, username, or address..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {search && (
              <button className="billing-search-clear" onClick={() => setSearch('')}>
                <X size={14} />
              </button>
            )}
          </div>

          <label className="billing-phase-filter">
            <Filter size={15} />
            <select value={phaseFilter} onChange={(event) => setPhaseFilter(event.target.value)}>
              {PHASE_FILTER_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="billing-type-switch">
          {Object.entries(residentGroups).map(([groupKey, group]) => {
            const Icon = group.icon;

            return (
              <button
                key={groupKey}
                type="button"
                className={`billing-type-tab ${activeResidentType === groupKey ? 'active' : ''}`}
                onClick={() => {
                  setActiveResidentType(groupKey);
                  setDirectoryPage(1);
                }}
              >
                <Icon size={16} />
                <span>{group.label}</span>
                <strong>{group.totalResidents}</strong>
              </button>
            );
          })}
        </div>

        <div className="billing-table-card">
          <div className="billing-section-head">
            <div>
              <h3>{activeGroup.label}</h3>
              <p>
                Showing {activeGroup.residents.length} of {activeGroup.totalResidents} records
                {phaseFilter !== 'surname' ? ` in ${PHASE_FILTER_OPTIONS.find((option) => option.value === phaseFilter)?.label}` : ', sorted by surname'}
              </p>
            </div>
            <div className="billing-section-meta">
              <span className="billing-year-tag">{formatCurrency(activeGroup.monthlyDue)} / month</span>
            </div>
          </div>

          {renderDirectoryTable()}
          <PaginationControls pagination={directoryPagination} onPageChange={setDirectoryPage} />
        </div>
      </div>
    );
  }

  const yearIdx = years.indexOf(year);

  return (
    <div className="billing-root">
      <div className="billing-detail-header">
        <button
          className="billing-back-btn"
          onClick={() => {
            setSelected(null);
            setEditingRow(null);
          }}
        >
          <ArrowLeft size={16} /> Back
        </button>

        <div className="billing-detail-title">
          <div className="billing-detail-avatar">{selected.familyName?.[0] || 'R'}</div>
          <div>
            <h2>{selected.familyName}</h2>
            <p><MapPin size={12} />{[selected.houseAddress, selected.street].filter(Boolean).join(', ')}</p>
            <div className="billing-detail-tags">
              <span className="billing-directory-pill">{getResidentTypeLabel(selected.occupancyType)}</span>
              <span className="billing-directory-pill">{normalizePhaseLabel(selected.phase)}</span>
            </div>
          </div>
        </div>

        <div className="billing-year-nav-group">
          <button className="billing-year-btn" disabled={yearIdx <= 0} onClick={() => setYear(years[yearIdx - 1])}>
            <ChevronLeft size={16} /> Prev
          </button>
          {years.map((itemYear) => (
            <button
              key={itemYear}
              className={`billing-year-pill ${year === itemYear ? 'active' : ''}`}
              onClick={() => setYear(itemYear)}
            >
              {itemYear}
            </button>
          ))}
          <button className="billing-year-btn" disabled={yearIdx >= years.length - 1} onClick={() => setYear(years[yearIdx + 1])}>
            Next <ChevronRight size={16} />
          </button>
        </div>
      </div>

      <div className="billing-status-bar">
        <div className="bsb-item paid">
          <CheckCircle size={14} />
          <span>{totalPaid} months paid</span>
          <strong>{formatCurrency(totalAmount)}</strong>
        </div>
        <div className="bsb-item unpaid">
          <Clock size={14} />
          <span>{12 - totalPaid} months unpaid</span>
          <strong>{formatCurrency(totalUnpaid)}</strong>
        </div>
        <div className="bsb-progress-wrap">
          <div className="bsb-progress-bar">
            <div className="bsb-progress-fill" style={{ width: `${(totalPaid / 12) * 100}%` }} />
          </div>
          <span className="bsb-pct">{Math.round((totalPaid / 12) * 100)}%</span>
        </div>
      </div>

      <div className="billing-table-card">
        <div className="billing-table-heading">
          <Receipt size={16} />
          <span>Monthly Dues - {year}</span>
          <span className="billing-table-sub">{formatCurrency(monthlyDue)} per month</span>
          {(detailLoad || saving) && (
            <span className="billing-syncing">
              <Loader size={13} className="billing-spin" /> Syncing...
            </span>
          )}
          <div className="billing-bulk-actions">
            <button className="billing-btn-pay-all" onClick={payAll} disabled={saving || MONTHS.every((month) => billingData[month]?.paid)}>
              <Check size={14} /> Pay All
            </button>
            <button className="billing-btn-unpay-all" onClick={unpayAll} disabled={saving || MONTHS.every((month) => !billingData[month]?.paid)}>
              <X size={14} /> Unpay All
            </button>
          </div>
        </div>

        {detailLoad ? (
          <div className="loading-container" style={{ padding: '3rem' }}>
            <div className="spinner" />
            <p className="loading-text">Loading billing records...</p>
          </div>
        ) : (
          <div className="billing-table-wrap">
            <table className="billing-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Amount</th>
                  <th>O.R. #</th>
                  <th>Date Paid</th>
                  <th>Remarks</th>
                  <th>Payment</th>
                  <th>Receipt</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {MONTHS.map((month) => {
                  const record = billingData[month] || emptyMonths()[month];
                  const isEditing = editingRow === month;
                  const isPaid = record.paid;
                  const hasReceipt = Boolean(record.receipt?.path);

                  return (
                    <tr key={month} className={isPaid ? 'billing-tr-paid' : 'billing-tr-unpaid'}>
                      <td className="billing-td-month">{formatMonthLabel(month)}</td>
                      <td className="billing-td-amount">{formatCurrency(monthlyDue)}</td>
                      <td>
                        {isEditing ? (
                          <input
                            className="billing-input"
                            placeholder="0000"
                            value={editDraft.orNumber || ''}
                            inputMode="numeric"
                            maxLength={4}
                            onChange={(event) => setEditDraft((draft) => ({
                              ...draft,
                              orNumber: event.target.value.replace(/\D/g, '').slice(0, 4)
                            }))}
                          />
                        ) : (
                          <span className={record.orNumber ? 'billing-cell-value billing-cell-copyable' : 'billing-cell-empty'}>
                            {record.orNumber ? `No. ${record.orNumber}` : '-'}
                          </span>
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            className="billing-input"
                            type="date"
                            value={editDraft.datePaid || ''}
                            onChange={(event) => setEditDraft((draft) => ({ ...draft, datePaid: event.target.value }))}
                          />
                        ) : (
                          <span className={record.datePaid ? 'billing-cell-value' : 'billing-cell-empty'}>
                            {record.datePaid || '-'}
                          </span>
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            className="billing-input"
                            placeholder="Optional note"
                            value={editDraft.remarks || ''}
                            onChange={(event) => setEditDraft((draft) => ({ ...draft, remarks: event.target.value }))}
                          />
                        ) : (
                          <span className={record.remarks ? 'billing-cell-value' : 'billing-cell-empty'}>
                            {record.remarks || '-'}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={record.paymentMethod ? 'billing-cell-value' : 'billing-cell-empty'}>
                          {record.paymentMethod || '-'}
                        </span>
                      </td>
                      <td>
                        {hasReceipt ? (
                          <button className="billing-btn-view" onClick={() => setViewingReceipt({ month, receipt: record.receipt })}>
                            <Eye size={13} /> View
                          </button>
                        ) : (
                          <span className="billing-cell-empty">-</span>
                        )}
                      </td>
                      <td>
                        <span className={`billing-status-badge ${record.paymentStatus || 'none'}`}>
                          {record.paymentStatus === 'verified' && <><Check size={11} /> Verified</>}
                          {record.paymentStatus === 'pending' && <><Clock size={11} /> Pending</>}
                          {record.paymentStatus === 'rejected' && <><X size={11} /> Rejected</>}
                          {(!record.paymentStatus || record.paymentStatus === 'none') && (isPaid ? <><Check size={11} /> Paid</> : <><Clock size={11} /> Unpaid</>)}
                        </span>
                      </td>
                      <td>
                        <div className="billing-action-group">
                          {isEditing ? (
                            <>
                              <button className="billing-btn-save" onClick={commitEdit}><Save size={13} /> Save</button>
                              <button className="billing-btn-cancel" onClick={() => setEditingRow(null)}><X size={13} /></button>
                            </>
                          ) : (
                            <>
                              <button className={`billing-btn-paid ${isPaid ? 'is-paid' : ''}`} onClick={() => togglePaid(month)}>
                                {isPaid ? <><X size={12} /> Unpay</> : <><Check size={12} /> Pay</>}
                              </button>
                              <button className="billing-btn-edit" onClick={() => startEdit(month)} title="Edit O.R. #, date, remarks">
                                <Edit3 size={13} />
                              </button>
                              {record.paymentStatus === 'pending' && (
                                <>
                                  <button className="billing-btn-verify" onClick={() => reviewReceipt(month, 'verified')}>
                                    <Check size={13} /> Verify
                                  </button>
                                  <button className="billing-btn-reject" onClick={() => reviewReceipt(month, 'rejected')}>
                                    <X size={13} /> Reject
                                  </button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="billing-tfoot-row">
                  <td className="billing-tfoot-label">TOTAL</td>
                  <td className="billing-tfoot-amount">{formatCurrency(totalDue)}</td>
                  <td colSpan={4} />
                  <td colSpan={3}>
                    <div className="billing-tfoot-summary">
                      <span className="tfoot-paid">Paid: {formatCurrency(totalAmount)}</span>
                      <span className="tfoot-unpaid">Unpaid: {formatCurrency(totalUnpaid)}</span>
                    </div>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="billing-table-footer">
          Admin can review receipts, manage manual month entries, and keep separate dues for renters and permanent residents from this module.
        </div>
      </div>

      {viewingReceipt && (
        <div className="billing-receipt-modal" onClick={() => setViewingReceipt(null)}>
          <div className="billing-receipt-card" onClick={(event) => event.stopPropagation()}>
            <div className="billing-receipt-card-head">
              <h3>{formatMonthLabel(viewingReceipt.month)} Receipt</h3>
              <button onClick={() => setViewingReceipt(null)}><X size={16} /></button>
            </div>
            {viewingReceipt.receipt.mimetype === 'application/pdf' ? (
              <iframe title="Billing receipt preview" src={assetUrl(viewingReceipt.receipt.path)} className="billing-receipt-frame" />
            ) : (
              <img src={assetUrl(viewingReceipt.receipt.path)} alt="Billing receipt" className="billing-receipt-image" />
            )}
          </div>
        </div>
      )}

      {viewingQr && settings?.gcashQr?.path && (
        <div className="billing-receipt-modal" onClick={() => setViewingQr(false)}>
          <div className="billing-receipt-card" onClick={(event) => event.stopPropagation()}>
            <div className="billing-receipt-card-head">
              <h3>HOA GCash QR Code</h3>
              <button onClick={() => setViewingQr(false)}><X size={16} /></button>
            </div>
            <img src={assetUrl(settings.gcashQr.path)} alt="HOA GCash QR" className="billing-receipt-image" />
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminBillingManagement;
