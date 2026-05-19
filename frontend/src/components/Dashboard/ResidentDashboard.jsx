import React, { useState, useEffect, useCallback, useMemo } from 'react';
import QRCode from 'qrcode';
import ecohoa from '../../assets/ecohoa.png';
import { apiUrl, assetUrl } from '../../utils/api';
import { 
  Home, LogOut, User, Car, UserCheck, Calendar, 
  DollarSign, Bell, FileText, MessageSquare, Menu, X, 
  ChevronRight, AlertCircle, CheckCircle, Phone, MapPin,
  Mail, Users, Edit, Save, XCircle, Plus, Trash2, Upload, Package, Eye, Copy,
  Map as MapIcon, QrCode, Search, LayoutGrid, Table2
} from 'lucide-react';
import './ResidentDashboard.css';
import ResidentAnnouncements from '../AnnouncementManagement/ResidentAnnouncements';
import ResidentFacilityReservation from '../FacilityManagement/ResidentFacilityReservation';
import ResidentBillingManagement from '../BillingManagement/ResidentBillingManagement';
import ResidentComplaintManagement from '../ComplaintManagement/ResidentComplaintManagement';
import ResidentDocumentsManagement from '../DocumentsManagement/ResidentDocumentsManagement';
import ResidentContactHOA from '../ContactHOA/ResidentContactHOA';
import SubdivisionMap3D from '../SubdivisionMap/SubdivisionMap3D';
import PaginationControls from '../common/PaginationControls';
import { buildPaginatedUrl, parsePaginatedResponse } from '../../utils/pagination';
import {
  sanitizeNameInput,
  sanitizePhoneNumberInput,
  validateNameValue,
  validatePhoneNumberValue
} from '../../utils/formSecurity';
import { IMAGE_UPLOAD_MAX_BYTES, formatFileSize, validateImageFile } from '../../utils/uploadValidation';
import {
  formatResidentAddress,
  formatResidentExpiry,
  getResidentAccountMeta,
  getResidentOccupancyLabel,
  isResidentAccessRestricted
} from '../../utils/residentAccounts';
import { SUBDIVISION_MAP_MODULE } from '../../utils/adminPermissions';
import {
  buildVisitorQrPayload,
  extractVisitorQrCredential,
  formatVisitorAccessCode,
  getVisitorAccessCode
} from '../../utils/visitorQr';
import { getVisitorEtaState } from '../../utils/visitEta';

const VISITOR_ID_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];

const getVisitorDateLabel = (visitor) => {
  const value = visitor.entryTime || visitor.expectedDate || visitor.createdAt;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'No date yet' : date.toLocaleDateString();
};

const getVisitorReviewState = (visitor) => {
  const reviewStatus = String(visitor?.reviewStatus || '').trim().toLowerCase();
  if (reviewStatus) return reviewStatus;

  const status = String(visitor?.status || '').trim().toLowerCase();
  if (status === 'rejected') return 'rejected';
  if (status === 'pre-registered') return 'pending';
  return 'approved';
};

const getVisitorStatusLabel = (visitor) => {
  const reviewState = getVisitorReviewState(visitor);
  if (visitor.status === 'rejected' || reviewState === 'rejected') return 'Rejected';
  if (reviewState === 'pending') return 'Pending';
  if (visitor.status === 'inside') return 'Inside';
  if (visitor.status === 'exited') return 'Exited';
  return 'Approved';
};

const getVisitorStatusTone = (visitor) => {
  const reviewState = getVisitorReviewState(visitor);
  if (visitor.status === 'rejected' || reviewState === 'rejected') return 'rejected';
  if (reviewState === 'pending') return 'pending';
  if (visitor.status === 'inside') return 'inside';
  if (visitor.status === 'exited') return 'exited';
  return 'approved';
};

const getVisitorPartySize = (visitor) => 1 + (Array.isArray(visitor?.accompanyingVisitors) ? visitor.accompanyingVisitors.length : 0);
const getCheckpointProgress = (visitor, checkpoint) => {
  const checkpoints = Array.isArray(visitor?.qrCheckpoints) ? visitor.qrCheckpoints : [];
  const matching = checkpoints.filter((item) => item.checkpoint === checkpoint);
  return {
    total: matching.length,
    used: matching.filter((item) => item.usedAt).length
  };
};

const VisitorQrModal = ({ visitor, onClose, onForgottenScan, onCopyCode, onRecordHomeCheckpoint, checkpointLoading }) => {
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [residentScanInput, setResidentScanInput] = useState('');
  const accessCode = getVisitorAccessCode(visitor);
  const checkpoints = Array.isArray(visitor?.qrCheckpoints) ? visitor.qrCheckpoints : [];
  const partySize = getVisitorPartySize(visitor);
  const homeEntryProgress = getCheckpointProgress(visitor, 'home_arrival');
  const homeExitProgress = getCheckpointProgress(visitor, 'home_exit');

  useEffect(() => {
    let cancelled = false;

    const buildQr = async () => {
      const qrPayload = buildVisitorQrPayload(visitor);

      if (!visitor?.qrEntryEnabled || !qrPayload) {
        setQrDataUrl('');
        return;
      }

      const dataUrl = await QRCode.toDataURL(qrPayload, {
        width: 220,
        margin: 1,
        errorCorrectionLevel: 'M'
      });

      if (!cancelled) {
        setQrDataUrl(dataUrl);
      }
    };

    buildQr().catch(() => setQrDataUrl(''));

    return () => {
      cancelled = true;
    };
  }, [visitor?.qrEntryEnabled, visitor?.qrManualCode, visitor?.qrToken]);

  useEffect(() => {
    setResidentScanInput(accessCode);
  }, [accessCode, visitor?._id]);

  if (!visitor?.qrEntryEnabled || !visitor?.qrToken) {
    return null;
  }

  return (
    <div className="resident-qr-modal-overlay" onClick={onClose}>
      <div className="resident-qr-modal" onClick={(event) => event.stopPropagation()}>
        <div className="resident-qr-modal-header">
          <div>
            <div className="resident-qr-modal-kicker">Pre-Registered Visitor Pass</div>
            <h3>{visitor.name}</h3>
            <p>Share this QR with the visitor, or use the visitor code when camera access is unavailable.</p>
          </div>
          <button type="button" onClick={onClose} className="resident-qr-modal-close">
            <X size={20} />
          </button>
        </div>
        <div className="resident-qr-modal-body">
          <div className="resident-qr-preview-card">
            <div className="resident-qr-preview-head">
              <span className={`vr-status ${getVisitorStatusTone(visitor)}`}>
                {getVisitorStatusLabel(visitor)}
              </span>
              <span className="resident-qr-preview-type">
                <QrCode size={14} /> QR Entry Ready
              </span>
            </div>
            {qrDataUrl && <img src={qrDataUrl} alt={`QR entry pass for ${visitor.name}`} />}
            <p>Valid for gate entry, home arrival, home exit, and gate exit.</p>
          </div>
          <div className="resident-qr-details-panel">
            <div className="resident-qr-detail-grid">
              <div className="resident-qr-detail-card">
                <span>Purpose</span>
                <strong>{visitor.purpose || 'Not set'}</strong>
              </div>
              <div className="resident-qr-detail-card">
                <span>Expected</span>
                <strong>{visitor.expectedDate ? new Date(visitor.expectedDate).toLocaleString() : 'Any time'}</strong>
              </div>
              <div className="resident-qr-detail-card">
                <span>Vehicle</span>
                <strong>{visitor.vehiclePlateNumber ? `${visitor.vehiclePlateNumber}${visitor.vehicleType ? ` (${visitor.vehicleType})` : ''}` : 'No vehicle listed'}</strong>
              </div>
              <div className="resident-qr-detail-card">
                <span>Companions</span>
                <strong>{Array.isArray(visitor.accompanyingVisitors) ? visitor.accompanyingVisitors.length : 0}</strong>
              </div>
              <div className="resident-qr-detail-card">
                <span>Required Scans</span>
                <strong>{partySize * 4} total</strong>
              </div>
            </div>
            <div className="resident-qr-code-card">
              <div className="resident-qr-code-header">
                <div>
                  <span className="resident-qr-code-label">Visitor Code</span>
                  <p>Use this short code when camera-based QR scanning is unavailable. Guards use it for gate scans, and residents use it for home scans.</p>
                </div>
                {accessCode && (
                  <button type="button" onClick={() => onCopyCode(accessCode)} className="resident-qr-copy-btn">
                    <Copy size={15} /> Copy Code
                  </button>
                )}
              </div>
              <div className="resident-qr-code-value">{formatVisitorAccessCode(accessCode) || 'No visitor code available yet'}</div>
            </div>
            <div className="resident-qr-home-panel">
              <div className="resident-qr-home-panel-head">
                <div>
                  <h4>Resident Home Scanner Fallback</h4>
                  <p>No resident camera scanner is installed here. Enter the visitor code or a pasted QR token below to record Home Entry and Home Exit.</p>
                </div>
                <span className="resident-qr-home-badge">QR Approved</span>
              </div>
              <input
                type="text"
                value={residentScanInput}
                onChange={(event) => setResidentScanInput(event.target.value)}
                placeholder="Short visitor code or pasted QR token"
                className="resident-qr-home-input"
              />
              <div className="resident-qr-home-actions">
                <button
                  type="button"
                  onClick={() => onRecordHomeCheckpoint(visitor, residentScanInput || accessCode, 'home_arrival')}
                  disabled={checkpointLoading}
                >
                  <QrCode size={16} />
                  Record Home Entry {homeEntryProgress.total ? `(${homeEntryProgress.used}/${homeEntryProgress.total})` : ''}
                </button>
                <button
                  type="button"
                  onClick={() => onRecordHomeCheckpoint(visitor, residentScanInput || accessCode, 'home_exit')}
                  disabled={checkpointLoading}
                >
                  <QrCode size={16} />
                  Record Home Exit {homeExitProgress.total ? `(${homeExitProgress.used}/${homeExitProgress.total})` : ''}
                </button>
              </div>
            </div>
            {checkpoints.length > 0 && (
              <div className="resident-qr-checkpoints">
                <h4>Checkpoint Status</h4>
                <div className="resident-qr-checkpoint-list">
                  {checkpoints.map((checkpoint, index) => (
                    <div key={`${checkpoint.checkpoint}-${checkpoint.memberIndex ?? 0}-${index}`} className="resident-qr-checkpoint-item">
                      <div>
                        <strong>{checkpoint.label}</strong>
                        <span>{checkpoint.memberLabel || `Visitor ${Number(checkpoint.memberIndex || 0) + 1}`}</span>
                        <span>{checkpoint.usedAt ? new Date(checkpoint.usedAt).toLocaleString() : 'Waiting for scan'}</span>
                      </div>
                      <span className={`resident-qr-checkpoint-badge ${checkpoint.usedAt ? 'used' : 'pending'}`}>
                        {checkpoint.usedAt ? 'Recorded' : 'Pending'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="resident-qr-modal-actions">
              <button type="button" onClick={() => onForgottenScan(visitor, 'home_arrival')}>
                Forgot Home Entry Scan
              </button>
              <button type="button" onClick={() => onForgottenScan(visitor, 'home_exit')}>
                Forgot Home Exit Scan
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ResidentDashboard = ({ onLogout, showConfirm, showAlert }) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeModule, setActiveModule] = useState('overview');
  const [loading, setLoading] = useState(false);
  
  const [profile, setProfile] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editedProfile, setEditedProfile] = useState(null);
  
  const [vehicles, setVehicles] = useState([]);
  const [vehicleForm, setVehicleForm] = useState({ plateNumber: '', vehicleType: '', brand: '', model: '', color: '' });
  const [vehiclePhoto, setVehiclePhoto] = useState(null);
  const [vehiclePhotoPreview, setVehiclePhotoPreview] = useState(null);
  const [showVehicleForm, setShowVehicleForm] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState(null);
  const [deletedVehicles, setDeletedVehicles] = useState([]);
  const [vehiclesPage, setVehiclesPage] = useState(1);
  const [vehiclesPagination, setVehiclesPagination] = useState(null);
  const [showDeletedModal, setShowDeletedModal] = useState(false);
  const [recentVisitors, setRecentVisitors] = useState([]);
  const [viewingVisitorQr, setViewingVisitorQr] = useState(null);
  const [visitorHistoryQuery, setVisitorHistoryQuery] = useState('');
  const [visitorHistoryViewMode, setVisitorHistoryViewMode] = useState('card');
  const [dismissedEtaVisitorIds, setDismissedEtaVisitorIds] = useState({});

  const [visitorForm, setVisitorForm] = useState({
  entryType: 'visitor',
  visitorLastName: '', visitorFirstName: '', visitorMiddleName: '',
  visitorContact: '+63', visitorRelationshipToResident: '', visitorIdentification: '', purposeOfVisit: '',
  deliveryDriverName: '', deliveryContact: '+63',
  expectedDate: '', vehiclePlateNumber: '', vehicleType: '', vehicleColor: '',
  accompanyingVisitors: []
});
  const [visitorIdentificationFile, setVisitorIdentificationFile] = useState(null);

  const [stats, setStats] = useState({ registeredVehicles: 0, recentVisitors: 0, familyMembers: 0, accountStatus: 'Active' });
  const [recentAnnouncements, setRecentAnnouncements] = useState([]);
  const [renewalRequestDate, setRenewalRequestDate] = useState('');
  const [renewalRequestNote, setRenewalRequestNote] = useState('');

  const user  = JSON.parse(localStorage.getItem('user') || '{}');
  const token = localStorage.getItem('token');
  const sanitizePlateNumberInput = (value, maxLength = 10) =>
    String(value || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, maxLength);
  const sanitizeIdInput = (value, maxLength = 12) =>
    String(value || '').replace(/\D/g, '').slice(0, maxLength);
  const textOnlyPattern = /^[A-Za-z\s.'-]+$/;
  const purposePattern = /^[A-Za-z\s.,'-]+$/;
  const idPattern = /^\d{1,12}$/;

  const addAccompanyingVisitor = () => {
    setVisitorForm((current) => ({
      ...current,
      accompanyingVisitors: [
        ...(current.accompanyingVisitors || []),
        { relationshipToResident: '', lastName: '', firstName: '', identification: '' }
      ]
    }));
  };

  const updateAccompanyingVisitor = (index, field, value) => {
    setVisitorForm((current) => ({
      ...current,
      accompanyingVisitors: (current.accompanyingVisitors || []).map((companion, companionIndex) => {
        if (companionIndex !== index) return companion;
        const sanitizedValue = ['lastName', 'firstName'].includes(field)
          ? sanitizeNameInput(value, 30)
          : field === 'identification'
            ? sanitizeIdInput(value, 12)
            : String(value || '').replace(/[^a-zA-Z\s.'-]/g, '').slice(0, 40);
        return { ...companion, [field]: sanitizedValue };
      })
    }));
  };

  const removeAccompanyingVisitor = (index) => {
    setVisitorForm((current) => ({
      ...current,
      accompanyingVisitors: (current.accompanyingVisitors || []).filter((_, companionIndex) => companionIndex !== index)
    }));
  };

  const handleVisitorIdentificationFile = (file) => {
    if (!file) {
      setVisitorIdentificationFile(null);
      return;
    }

    if (!VISITOR_ID_MIME_TYPES.includes(String(file.type || '').toLowerCase())) {
      showAlert('Visitor identification must be a JPG or PNG image.', 'error');
      setVisitorIdentificationFile(null);
      return;
    }

    if (file.size > IMAGE_UPLOAD_MAX_BYTES) {
      showAlert(`Visitor identification is too large. Maximum size is ${formatFileSize(IMAGE_UPLOAD_MAX_BYTES)}.`, 'error');
      setVisitorIdentificationFile(null);
      return;
    }

    setVisitorIdentificationFile(file);
  };

  const handleForgottenVisitorScan = async (visitor, checkpoint) => {
    if (!['home_arrival', 'home_exit'].includes(checkpoint)) {
      showAlert('Residents can only mark forgotten Home Entry or Home Exit scans.', 'error');
      return;
    }

    const checkpointLabel = checkpoint === 'home_arrival' ? 'Home Entry' : 'Home Exit';

    showConfirm(
      `Mark ${checkpointLabel} as forgotten for ${visitor?.name || 'this visitor'}? This is only for resident-side home scanning, not gate scanning.`,
      async () => {
        try {
          setLoading(true);
          const response = await fetch(apiUrl(`/visitors/${visitor._id}/qr/forgot`), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`
            },
            body: JSON.stringify({ checkpoint })
          });
          const data = await response.json();

          if (!response.ok) {
            showAlert(data.message || `Failed to record forgotten ${checkpointLabel.toLowerCase()}.`, 'error');
            return;
          }

          showAlert(data.message || `${checkpointLabel} was recorded successfully.`, 'success');
          setViewingVisitorQr(data.visitor || visitor);
          fetchRecentVisitors();
        } catch (error) {
          showAlert(`Failed to record forgotten ${checkpointLabel.toLowerCase()}.`, 'error');
        } finally {
          setLoading(false);
        }
      }
    );
  };

  const handleCopyVisitorCode = async (code) => {
    if (!code) {
      showAlert('No visitor code is available for this QR pass yet.', 'error');
      return;
    }

    try {
      await navigator.clipboard.writeText(code);
      showAlert('Visitor code copied to clipboard.', 'success');
    } catch (error) {
      showAlert('Unable to copy the visitor code right now.', 'error');
    }
  };

  const handleResidentQrCheckpoint = async (visitor, rawCredential, checkpoint) => {
    const credential = extractVisitorQrCredential(rawCredential);

    if (!credential) {
      showAlert('Enter the visitor code or paste the QR token before recording this home checkpoint.', 'error');
      return;
    }

    try {
      setLoading(true);
      const response = await fetch(apiUrl('/visitors/qr/scan'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ qrToken: credential, checkpoint })
      });
      const data = await response.json();

      if (!response.ok) {
        showAlert(data.message || 'Failed to record the home QR checkpoint.', 'error');
        return;
      }

      showAlert(data.message || 'Home QR checkpoint recorded.', 'success');
      setViewingVisitorQr(data.visitor || visitor);
      fetchRecentVisitors();
    } catch (error) {
      showAlert('Failed to record the home QR checkpoint.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const normalizeResidentFamilyMembers = (members = []) => {
    if (!Array.isArray(members) || members.length === 0) {
      return { error: 'Please add at least one family member.' };
    }

    const normalizedMembers = [];
    let primaryContactCount = 0;

    for (let index = 0; index < members.length; index += 1) {
      const member = members[index] || {};

      const lastNameValidation = validateNameValue(member.lastName, `Family member ${index + 1} last name`, {
        minLength: 1,
        maxLength: 30
      });
      if (!lastNameValidation.valid) {
        return { error: lastNameValidation.message };
      }

      const firstNameValidation = validateNameValue(member.firstName, `Family member ${index + 1} first name`, {
        minLength: 1,
        maxLength: 30
      });
      if (!firstNameValidation.valid) {
        return { error: firstNameValidation.message };
      }

      const middleNameValidation = validateNameValue(member.middleName, `Family member ${index + 1} middle name`, {
        minLength: 1,
        maxLength: 30
      });
      if (!middleNameValidation.valid) {
        return { error: middleNameValidation.message };
      }

      const relationship = String(member.relationship || '').trim();
      if (!relationship) {
        return { error: `Please select a relationship for family member ${index + 1}.` };
      }

      const isPrimaryContact = Boolean(member.isPrimaryContact);
      if (isPrimaryContact) {
        primaryContactCount += 1;
      }

      normalizedMembers.push({
        ...member,
        lastName: lastNameValidation.value,
        firstName: firstNameValidation.value,
        middleName: middleNameValidation.value,
        relationship,
        isPrimaryContact
      });
    }

    if (primaryContactCount !== 1) {
      return { error: 'Please select exactly one primary household contact.' };
    }

    return { value: normalizedMembers };
  };

  const PesoIcon = ({ size = 20 }) => (
    <span style={{ fontSize: size, fontWeight: 800, lineHeight: 1, fontFamily: 'inherit' }}>₱</span>
  );

  const allMenuItems = [
    { id: 'overview',       icon: Home,         label: 'Overview' },
    { id: 'profile',        icon: User,         label: 'My Profile' },
    { id: 'vehicles',       icon: Car,          label: 'My Vehicles' },
    { id: 'visitors',       icon: UserCheck,    label: 'Pre-Registered Visitors' },
    { id: 'facilities',     icon: Calendar,     label: 'Facility Reservation' },
    { id: 'complaints',     icon: AlertCircle,  label: 'Complaints' },
    { id: 'announcements',  icon: Bell,         label: 'Announcements' },
    { id: 'billing',        icon: PesoIcon,     label: 'Billing & Payments' },
    { id: 'documents',      icon: FileText,     label: 'Documents & Forms' },
    { id: 'subdivision_map', icon: MapIcon,     label: SUBDIVISION_MAP_MODULE.label },
    { id: 'contact',        icon: MessageSquare,label: 'Contact HOA' }
  ];

  const menuItems = profile && isResidentAccessRestricted(profile)
    ? allMenuItems.filter((item) => ['overview', 'profile', 'contact'].includes(item.id))
    : allMenuItems;

  // ── Data Fetching ────────────────────────────────────────────────
  const fetchProfile = useCallback(async () => {
    try {
      const response = await fetch(apiUrl(`/residents/${user.id}`), { headers: { 'Authorization': `Bearer ${token}` } });
      if (response.ok) {
        const data = await response.json();
        const fallbackRenewalDate = data?.requestedOccupancyEndDate
          ? new Date(data.requestedOccupancyEndDate).toISOString().split('T')[0]
          : data?.expiresAt
            ? new Date(new Date(data.expiresAt).getTime() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
            : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

        setProfile(data);
        setEditedProfile(data);
        setRenewalRequestDate(fallbackRenewalDate);
        setStats((prev) => ({
          ...prev,
          familyMembers: data.familyMembers?.length || 0,
          accountStatus: data.accountStatusLabel || 'Active'
        }));
      }
    } catch (error) { console.error('Error fetching profile:', error); }
  }, [user.id, token]);

  const fetchVehicles = useCallback(async () => {
    try {
      const response = await fetch(apiUrl(buildPaginatedUrl(`/residents/${user.id}/vehicles`, vehiclesPage)), { headers: { 'Authorization': `Bearer ${token}` } });
      if (response.ok) {
        const data = await response.json();
        const parsed = parsePaginatedResponse(data);
        setVehicles(parsed.items);
        setVehiclesPagination(parsed.pagination);
        setStats(prev => ({ ...prev, registeredVehicles: parsed.pagination?.total ?? parsed.items.length }));
      }
    } catch (error) { console.error('Error fetching vehicles:', error); }
  }, [user.id, token, vehiclesPage]);

  const fetchDeletedVehicles = useCallback(async () => {
    try {
      const response = await fetch(apiUrl(buildPaginatedUrl(`/residents/${user.id}/vehicles/deleted`, 1, { limit: 50 })), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        const parsed = parsePaginatedResponse(data);
        setDeletedVehicles(parsed.items);
      }
    } catch (error) { console.error('Error fetching deleted vehicles:', error); }
  }, [user.id, token]);

  const fetchRecentVisitors = useCallback(async () => {
  try {
    const response = await fetch(apiUrl(`/visitors/resident/${user.id}`), {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (response.ok) {
      const data = await response.json();
      const myVisitors = Array.isArray(data) ? data : [];
      setRecentVisitors(myVisitors);
      setStats(prev => ({ ...prev, recentVisitors: myVisitors.length }));
    }
  } catch (error) { console.error('Error fetching visitors:', error); }
}, [token, user.id]);

  const fetchAnnouncements = useCallback(async () => {
    try {
      const response = await fetch(apiUrl('/announcements'), { headers: { 'Authorization': `Bearer ${token}` } });
      if (response.ok) {
        const data = await response.json();
        const residentAnnouncements = Array.isArray(data) ? data.filter(a => {
          const isNotExpired = !a.expiryDate || new Date(a.expiryDate) >= new Date();
          const matchesAudience = a.targetAudience === 'all' || a.targetAudience === 'residents';
          return isNotExpired && matchesAudience;
        }).slice(0, 3) : [];
        setRecentAnnouncements(residentAnnouncements);
      }
    } catch (error) { console.error('Error fetching announcements:', error); setRecentAnnouncements([]); }
  }, [token]);

  useEffect(() => { fetchProfile(); fetchAnnouncements(); }, [fetchProfile, fetchAnnouncements]);

  useEffect(() => {
    if (!profile) return;

    fetchVehicles();
    fetchRecentVisitors();
  }, [profile, fetchVehicles, fetchRecentVisitors]);

  useEffect(() => {
    if (!menuItems.some((item) => item.id === activeModule)) {
      setActiveModule('overview');
    }
  }, [activeModule, menuItems]);

  useEffect(() => {
    if (activeModule === 'vehicles') {
    fetchVehicles();
    fetchDeletedVehicles();   // ← add this
  }
  else if (activeModule === 'visitors') fetchRecentVisitors();
}, [activeModule, fetchVehicles, fetchDeletedVehicles, fetchRecentVisitors]);

  // ── Handlers ─────────────────────────────────────────────────────
  const handleRequestRenewal = async () => {
    if (!profile?.canRequestRenewal) {
      showAlert('This renter account already has a pending renewal request.', 'info');
      return;
    }

    if (!renewalRequestDate) {
      showAlert('Please choose a requested renewal end date.', 'error');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(apiUrl(`/residents/${user.id}/request-renewal`), {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          requestedOccupancyEndDate: renewalRequestDate,
          note: renewalRequestNote
        })
      });

      const data = await response.json();

      if (!response.ok) {
        showAlert(data.message || 'Failed to submit renewal request.', 'error');
        return;
      }

      showAlert('Renewal request submitted. The admin side can review it now.', 'success');
      setRenewalRequestNote('');
      fetchProfile();
    } catch (error) {
      console.error('Error requesting renewal:', error);
      showAlert('Failed to submit renewal request.', 'error');
    }
    setLoading(false);
  };

  const handleUpdateProfile = async () => {
    const phoneNumberValidation = validatePhoneNumberValue(editedProfile?.phoneNumber, 'Phone number', {
      required: true
    });
    if (!phoneNumberValidation.valid) {
      showAlert(phoneNumberValidation.message, 'error');
      return;
    }

    const familyMembersValidation = normalizeResidentFamilyMembers(editedProfile?.familyMembers || []);
    if (familyMembersValidation.error) {
      showAlert(familyMembersValidation.error, 'error');
      return;
    }

    const profilePayload = {
      ...editedProfile,
      phoneNumber: phoneNumberValidation.value,
      familyMembers: familyMembersValidation.value
    };

    setLoading(true);
    try {
      const response = await fetch(apiUrl(`/residents/${user.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(profilePayload)
      });
      if (response.ok) {
        const data = await response.json();
        setProfile(data.resident);
        setEditedProfile(data.resident);
        setStats((prev) => ({
          ...prev,
          familyMembers: data.resident?.familyMembers?.length || 0,
          accountStatus: data.resident?.accountStatusLabel || prev.accountStatus
        }));
        setEditMode(false);
        showAlert('Profile updated successfully!', 'success');
      } else {
        showAlert('Failed to update profile', 'error');
      }
    } catch (error) { console.error('Error updating profile:', error); showAlert('Failed to update profile', 'error'); }
    setLoading(false);
  };

  const handleAddFamilyMember = () => {
    const currentMembers = editedProfile.familyMembers || [];
    setEditedProfile({
      ...editedProfile,
      familyMembers: [
        ...currentMembers,
        {
          lastName: '',
          firstName: '',
          middleName: '',
          relationship: '',
          isPrimaryContact: currentMembers.length === 0
        }
      ]
    });
  };
  const handleRemoveFamilyMember = (index) => {
    const currentMembers = editedProfile.familyMembers || [];
    const removedWasPrimary = Boolean(currentMembers[index]?.isPrimaryContact);
    const nextMembers = currentMembers
      .filter((_, i) => i !== index)
      .map((member, memberIndex) => ({
        ...member,
        isPrimaryContact: removedWasPrimary && memberIndex === 0
          ? true
          : Boolean(member.isPrimaryContact)
      }));

    setEditedProfile({ ...editedProfile, familyMembers: nextMembers });
  };
  const handleFamilyMemberChange = (index, field, value) => {
    const updatedMembers = [...editedProfile.familyMembers];
    if (field === 'isPrimaryContact') {
      setEditedProfile({
        ...editedProfile,
        familyMembers: updatedMembers.map((member, memberIndex) => ({
          ...member,
          isPrimaryContact: memberIndex === index
        }))
      });
      return;
    }

    updatedMembers[index][field] = ['lastName', 'firstName', 'middleName'].includes(field)
      ? sanitizeNameInput(value, 30)
      : value;
    setEditedProfile({ ...editedProfile, familyMembers: updatedMembers });
  };

  const handleVehiclePhotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const validation = validateImageFile(file, {
        label: 'Vehicle photo',
        maxBytes: IMAGE_UPLOAD_MAX_BYTES
      });
      if (!validation.valid) {
        showAlert(validation.message, 'error');
        e.target.value = '';
        return;
      }
      setVehiclePhoto(file);
      const reader = new FileReader();
      reader.onloadend = () => setVehiclePhotoPreview(reader.result);
      reader.readAsDataURL(file);
    }
  };
  const handleRestoreVehicle = (vehicleId) => {
  showConfirm('Restore this vehicle to your active vehicles?', async () => {
    setLoading(true);
    try {
      const response = await fetch(
        apiUrl(`/residents/${user.id}/vehicles/${vehicleId}/restore`),
        { method: 'PATCH', headers: { 'Authorization': `Bearer ${token}` } }
      );
      if (response.ok) {
        showAlert('Vehicle restored successfully!', 'success');
        fetchVehicles();
        fetchDeletedVehicles();
      } else {
        showAlert('Failed to restore vehicle', 'error');
      }
    } catch (error) { showAlert('Failed to restore vehicle', 'error'); }
    setLoading(false);
  });
};

const handlePermanentDelete = (vehicleId) => {
  showConfirm(
    'Permanently delete this vehicle? This cannot be undone.',
    async () => {
      setLoading(true);
      try {
        const response = await fetch(
          apiUrl(`/residents/${user.id}/vehicles/${vehicleId}/permanent`),
          { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } }
        );
        if (response.ok) {
          showAlert('Vehicle permanently deleted.', 'success');
          fetchDeletedVehicles();
        } else {
          showAlert('Failed to delete vehicle', 'error');
        }
      } catch (error) { showAlert('Failed to delete vehicle', 'error'); }
      setLoading(false);
    }
  );
};

  const resetVehicleForm = () => {
    setVehicleForm({ plateNumber: '', vehicleType: '', brand: '', model: '', color: '' });
    setVehiclePhoto(null); setVehiclePhotoPreview(null); setEditingVehicle(null); setShowVehicleForm(false);
  };

  const handleRegisterVehicle = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('plateNumber', vehicleForm.plateNumber);
      formData.append('vehicleType', vehicleForm.vehicleType);
      formData.append('brand',       vehicleForm.brand);
      formData.append('model',       vehicleForm.model);
      formData.append('color',       vehicleForm.color);
      if (vehiclePhoto) formData.append('vehiclePhoto', vehiclePhoto);

      const url    = editingVehicle ? apiUrl(`/residents/${user.id}/vehicles/${editingVehicle._id}`) : apiUrl(`/residents/${user.id}/vehicles`);
      const method = editingVehicle ? 'PUT' : 'POST';

      const response = await fetch(url, { method, headers: { 'Authorization': `Bearer ${token}` }, body: formData });
      if (response.ok) {
        showAlert(editingVehicle ? 'Vehicle updated successfully!' : 'Vehicle registered successfully!', 'success');
        resetVehicleForm(); fetchVehicles();
      } else {
        const data = await response.json();
        showAlert(data.message || 'Failed to save vehicle', 'error');
      }
    } catch (error) { console.error('Error saving vehicle:', error); showAlert('Failed to save vehicle', 'error'); }
    setLoading(false);
  };

  const handleEditVehicle = (vehicle) => {
    setVehicleForm({ plateNumber: sanitizePlateNumberInput(vehicle.plateNumber, 10), vehicleType: vehicle.vehicleType, brand: vehicle.brand, model: vehicle.model, color: vehicle.color });
    setEditingVehicle(vehicle);
    if (vehicle.photo) setVehiclePhotoPreview(assetUrl(vehicle.photo.path));
    setShowVehicleForm(true);
  };

  const handleDeleteVehicle = (vehicleId) => {
    showConfirm('Are you sure you want to delete this vehicle?', async () => {
      setLoading(true);
      try {
        const response = await fetch(apiUrl(`/residents/${user.id}/vehicles/${vehicleId}`), { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
        if (response.ok) { showAlert('Vehicle deleted successfully!', 'success'); fetchVehicles(); }
        else showAlert('Failed to delete vehicle', 'error');
      } catch (error) { console.error('Error deleting vehicle:', error); showAlert('Failed to delete vehicle', 'error'); }
      setLoading(false);
    });
  };

  const handlePreRegisterVisitor = async (e) => {
  e.preventDefault();
  const { entryType } = visitorForm;

  if (entryType === 'visitor' && (!visitorForm.visitorLastName || !visitorForm.visitorFirstName || !visitorForm.purposeOfVisit || !visitorForm.visitorRelationshipToResident || !visitorForm.visitorIdentification)) {
    showAlert('Please fill in visitor name, relationship, identification, and purpose', 'error'); return;
  }
  if (entryType === 'delivery' && !visitorForm.deliveryDriverName) {
    showAlert('Please fill in delivery driver name', 'error'); return;
  }

  if (entryType === 'visitor') {
    const visitorId = sanitizeIdInput(visitorForm.visitorIdentification, 12);
    if (!idPattern.test(visitorId)) {
      showAlert('Visitor Identification ID Number must contain digits only and be up to 12 numbers.', 'error');
      return;
    }

    const relationship = String(visitorForm.visitorRelationshipToResident || '').trim();
    if (!relationship || relationship.length > 50 || !textOnlyPattern.test(relationship)) {
      showAlert('Relationship to resident must be text only and up to 50 characters.', 'error');
      return;
    }

    if (!visitorIdentificationFile) {
      showAlert('Please upload the visitor identification image.', 'error');
      return;
    }

    const purpose = String(visitorForm.purposeOfVisit || '').trim();
    if (!purpose || purpose.length > 50 || !purposePattern.test(purpose)) {
      showAlert('Purpose of visit must be text only and up to 50 characters.', 'error');
      return;
    }
  }

  const visitorFullName = [
    visitorForm.visitorFirstName,
    visitorForm.visitorMiddleName,
    visitorForm.visitorLastName
  ].filter(Boolean).join(' ');

  const nameValidation = validateNameValue(
    entryType === 'visitor' ? visitorFullName : visitorForm.deliveryDriverName,
    entryType === 'visitor' ? 'Visitor name' : 'Driver name',
    { minLength: 2, maxLength: 80 }
  );
  if (!nameValidation.valid) {
    showAlert(nameValidation.message, 'error');
    return;
  }

  const contactValidation = validatePhoneNumberValue(
    entryType === 'visitor' ? visitorForm.visitorContact : visitorForm.deliveryContact,
    'Contact number'
  );
  if (!contactValidation.valid) {
    showAlert(contactValidation.message, 'error');
    return;
  }

  const normalizedCompanions = [];
  if (entryType === 'visitor') {
    for (let index = 0; index < (visitorForm.accompanyingVisitors || []).length; index += 1) {
      const companion = visitorForm.accompanyingVisitors[index];
      const label = `Companion ${index + 1}`;
      const relationshipToResident = String(companion.relationshipToResident || '').trim();
      const identification = sanitizeIdInput(companion.identification, 12);

      if (!relationshipToResident || !companion.lastName || !companion.firstName || !identification) {
        showAlert(`Please complete relationship, name, and identification for ${label}`, 'error');
        return;
      }

      if (relationshipToResident.length > 40 || !textOnlyPattern.test(relationshipToResident)) {
        showAlert(`${label} relationship must be text only and up to 40 characters.`, 'error');
        return;
      }

      if (!idPattern.test(identification)) {
        showAlert(`${label} ID number must contain digits only and be up to 12 numbers.`, 'error');
        return;
      }

      const lastNameValidation = validateNameValue(companion.lastName, `${label} last name`, {
        minLength: 1,
        maxLength: 30
      });
      if (!lastNameValidation.valid) {
        showAlert(lastNameValidation.message, 'error');
        return;
      }

      const firstNameValidation = validateNameValue(companion.firstName, `${label} first name`, {
        minLength: 1,
        maxLength: 30
      });
      if (!firstNameValidation.valid) {
        showAlert(firstNameValidation.message, 'error');
        return;
      }

      normalizedCompanions.push({
        relationshipToResident,
        lastName: lastNameValidation.value,
        firstName: firstNameValidation.value,
        identification
      });
    }
  }

  setLoading(true);
  try {
    const visitorIdNumber = sanitizeIdInput(visitorForm.visitorIdentification, 12);
    const cleanedPurpose = String(visitorForm.purposeOfVisit || '').trim();
    const cleanedVehicleColor = String(visitorForm.vehicleColor || '').trim();
    const expectedDate = visitorForm.expectedDate ? new Date(visitorForm.expectedDate) : null;
    if (!expectedDate) {
      showAlert('Please enter the expected arrival date and time.', 'error');
      setLoading(false);
      return;
    }
    if (expectedDate && Number.isNaN(expectedDate.getTime())) {
      showAlert('Please choose a valid expected arrival date and time.', 'error');
      setLoading(false);
      return;
    }
    if (expectedDate && expectedDate.getTime() < Date.now()) {
      showAlert('Expected arrival date and time must be in the future.', 'error');
      setLoading(false);
      return;
    }
    if (cleanedVehicleColor && (cleanedVehicleColor.length > 20 || !textOnlyPattern.test(cleanedVehicleColor))) {
      showAlert('Vehicle color must be text only and up to 20 characters.', 'error');
      setLoading(false);
      return;
    }

    const formData = new FormData();
    formData.append('entryType', entryType);
    formData.append('name', nameValidation.value);
    formData.append('contactNumber', contactValidation.value);
    formData.append('purpose', entryType === 'visitor' ? cleanedPurpose : 'Delivery');
    formData.append('relationshipToResident', String(visitorForm.visitorRelationshipToResident || '').trim());
    formData.append('identificationNumber', visitorIdNumber);
    formData.append('hostResidentId', user.id);
    formData.append('hostResidentName', profile?.familyName || user.username);
    formData.append('hostResidentAddress', `${profile?.houseAddress || ''}, ${profile?.street || ''}`.trim());
    formData.append('vehiclePlateNumber', sanitizePlateNumberInput(visitorForm.vehiclePlateNumber, 10));
    formData.append('vehicleType', visitorForm.vehicleType);
    formData.append('vehicleColor', cleanedVehicleColor);
    formData.append('accompanyingVisitors', JSON.stringify(entryType === 'visitor' ? normalizedCompanions : []));
    formData.append('expectedDate', visitorForm.expectedDate);
    formData.append('preRegisteredBy', user.id);

    if (entryType === 'visitor' && visitorIdentificationFile) {
      formData.append('identificationFile', visitorIdentificationFile);
    }

    const response = await fetch(apiUrl('/visitors/pre-register'), {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });

    if (response.ok) {
      showAlert(`${entryType === 'visitor' ? 'Visitor' : 'Delivery'} pre-registered successfully! Guards will be notified.`, 'success');
      setVisitorForm({
        entryType: 'visitor',
        visitorLastName: '', visitorFirstName: '', visitorMiddleName: '',
        visitorContact: '+63', visitorRelationshipToResident: '', visitorIdentification: '', purposeOfVisit: '',
        deliveryDriverName: '', deliveryContact: '+63',
        expectedDate: '', vehiclePlateNumber: '', vehicleType: '', vehicleColor: '',
        accompanyingVisitors: []
      });
      setVisitorIdentificationFile(null);
      fetchRecentVisitors();
    } else {
      const data = await response.json();
      showAlert(data.message || 'Failed to pre-register', 'error');
    }
  } catch (error) { showAlert('Failed to pre-register', 'error'); }
  setLoading(false);
};

  // ── Components ───────────────────────────────────────────────────
  const StatCard = ({ title, value, icon: Icon, color }) => (
    <div className="resident-stat-card">
      <div className="stat-card-content">
        <div className="stat-info"><p>{title}</p><h3>{value}</h3></div>
        <div className={`stat-icon bg-${color}-50`}><Icon className={`text-${color}-600`} size={24} /></div>
      </div>
    </div>
  );

  const getCategoryColor = (category) => {
    switch (category) {
      case 'urgent':      return 'bg-red-100 text-red-700';
      case 'maintenance': return 'bg-yellow-100 text-yellow-700';
      case 'events':      return 'bg-purple-100 text-purple-700';
      case 'general':     return 'bg-green-100 text-green-700';
      default:            return 'bg-green-100 text-green-700';
    }
  };

  const getTimeRemaining = (deletedAt) => {
  const expiresAt = new Date(new Date(deletedAt).getTime() + 48 * 60 * 60 * 1000);
  const remaining = expiresAt - new Date();
  if (remaining <= 0) return null;
  const hours   = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
  return { hours, minutes, total: remaining };
};

  const renderVisitorQrAction = (visitor) => {
    if (visitor.qrEntryEnabled && visitor.qrToken) {
      return (
        <>
          <span className="vr-inline-note qr-approved">QR Approved</span>
          <button type="button" className="vr-view-qr-btn" onClick={() => setViewingVisitorQr(visitor)}>
            <Eye size={14} /> View QR
          </button>
        </>
      );
    }

    const reviewState = getVisitorReviewState(visitor);

    if (reviewState === 'pending') {
      return <span className="vr-inline-note">Waiting for admin review</span>;
    }

    if (reviewState === 'approved') {
      return <span className="vr-inline-note">Approved without QR entry</span>;
    }

    return null;
  };

  // ── Render Content ───────────────────────────────────────────────
  const filteredRecentVisitors = useMemo(() => {
    const query = visitorHistoryQuery.trim().toLowerCase();

    return recentVisitors.filter((visitor) => (
      !query ||
      String(visitor.name || '').toLowerCase().includes(query) ||
      String(visitor.hostResidentName || '').toLowerCase().includes(query) ||
      String(visitor.purpose || '').toLowerCase().includes(query) ||
      String(visitor.vehiclePlateNumber || '').toLowerCase().includes(query)
    ));
  }, [recentVisitors, visitorHistoryQuery]);

  const visitorHistorySummary = useMemo(() => ({
    total: recentVisitors.length,
    pending: recentVisitors.filter((visitor) => getVisitorReviewState(visitor) === 'pending').length,
    qrReady: recentVisitors.filter((visitor) => visitor.qrEntryEnabled || getVisitorAccessCode(visitor)).length,
    inside: recentVisitors.filter((visitor) => visitor.status === 'inside').length
  }), [recentVisitors]);

  const renderContent = () => {
    const accountMeta = getResidentAccountMeta(profile);
    const accessRestricted = isResidentAccessRestricted(profile);

    if (activeModule === 'overview') {
      return (
        <div>
          <div className="page-header">
            <div className="page-title"><h2>Welcome Back, {profile?.familyName || user.username}!</h2><p>Here's your household overview</p></div>
          </div>
          <div className="stats-grid resident-overview-stats">
            <StatCard title="Registered Vehicles" value={stats.registeredVehicles} icon={Car}          color="green"  />
            <StatCard title="Recent Visitors"      value={stats.recentVisitors}     icon={UserCheck}    color="blue"   />
            <StatCard title="Family Members"       value={stats.familyMembers}      icon={Users}        color="purple" />
            <StatCard title="Account Status"       value={stats.accountStatus}      icon={CheckCircle}  color="green"  />
          </div>
          <div className="dashboard-layout resident-overview-layout">
            <div className="main-content-area resident-overview-main">
              <div className="dashboard-card resident-household-card">
                <div className="card-header"><h3>Household Information</h3></div>
                <div className="info-grid">
                  <div className="info-item"><div className="info-icon bg-green-50"><MapPin className="text-green-600" size={20} /></div><div className="info-content"><p className="info-label">Address</p><p className="info-value">{formatResidentAddress(profile)}</p></div></div>
                  <div className="info-item"><div className="info-icon bg-blue-50"><Phone className="text-blue-600" size={20} /></div><div className="info-content"><p className="info-label">Contact Number</p><p className="info-value">{profile?.phoneNumber}</p></div></div>
                  <div className="info-item"><div className="info-icon bg-purple-50"><Mail className="text-purple-600" size={20} /></div><div className="info-content"><p className="info-label">Email</p><p className="info-value">{profile?.email}</p></div></div>
                  <div className="info-item"><div className="info-icon bg-orange-50"><Users className="text-orange-600" size={20} /></div><div className="info-content"><p className="info-label">Resident Type</p><p className="info-value">{getResidentOccupancyLabel(profile)}</p></div></div>
                </div>
              </div>
              <div className="dashboard-card resident-announcement-card">
                <div className="card-header"><h3>Recent Announcements</h3></div>
                <div className="announcements-list">
                  {recentAnnouncements.length === 0
                    ? <div className="empty-state-small"><Bell size={20} style={{ color: '#9ca3af' }} /><p>No announcements yet</p></div>
                    : recentAnnouncements.map((announcement, index) => (
                        <div key={announcement._id || index} className="announcement-item">
                          <div className={`announcement-badge ${getCategoryColor(announcement.category)}`}><Bell size={16} /></div>
                          <div className="announcement-content">
                            <div className="announcement-meta">
                              <span className={`category-badge ${getCategoryColor(announcement.category)}`}>{announcement.category ? announcement.category.toUpperCase() : 'GENERAL'}</span>
                              <span className="announcement-date">{new Date(announcement.createdAt).toLocaleDateString()} • {announcement.postedBy || 'Admin'}</span>
                            </div>
                            <h4>{announcement.title}</h4>
                            <p>{announcement.content.length > 100 ? announcement.content.substring(0, 100) + '...' : announcement.content}</p>
                          </div>
                        </div>
                      ))}
                </div>
              </div>
            </div>
            <div className="sidebar-content-area resident-overview-side">
              <div className="dashboard-card resident-overview-visitor-card">
                <div className="card-header resident-overview-card-header">
                  <h3>Recent Visitors</h3>
                  <span className="resident-overview-count">{recentVisitors.length}</span>
                </div>
                {recentVisitors.length === 0 ? (
                  <div className="empty-state-small">
                    <UserCheck size={26} style={{ color: '#9ca3af' }} />
                    <p>No recent visitors</p>
                  </div>
                ) : (
                  <div className="vr-list resident-overview-vr-list">
                    {recentVisitors.slice(0, 5).map((visitor) => (
                      <div key={visitor._id} className="vr-item">
                        <div className="vr-avatar">{visitor.name?.[0]?.toUpperCase() || '?'}</div>
                        <div className="vr-item-info">
                          <div className="vr-item-top">
                            <span className="vr-item-name">{visitor.name}</span>
                            <span className={`vr-status ${getVisitorStatusTone(visitor)}`}>
                              {getVisitorStatusLabel(visitor)}
                            </span>
                          </div>
                          <p className="vr-item-purpose">{visitor.purpose}</p>
                          <p className="vr-item-date">{getVisitorDateLabel(visitor)}</p>
                          <div className="vr-item-actions">
                            {renderVisitorQrAction(visitor)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="dashboard-card resident-quick-actions-card">
                <div className="card-header"><h3>Quick Actions</h3></div>
                <div className="quick-actions-list">
                  {accessRestricted ? (
                    <div className="resident-renewal-locked">
                      <AlertCircle size={20} className="text-orange-600" />
                      <div>
                        <h4>Access Limited</h4>
                        <p>This renter account is expired. Submit a renewal request below to restore full access.</p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button onClick={() => setActiveModule('vehicles')} className="quick-action-item"><div className="quick-action-icon bg-green-50"><Car className="text-green-600" size={20} /></div><div className="quick-action-content"><h4>Register Vehicle</h4><p>Add a new vehicle</p></div><ChevronRight size={18} className="text-gray-400" /></button>
                      <button onClick={() => setActiveModule('visitors')} className="quick-action-item"><div className="quick-action-icon bg-blue-50"><UserCheck className="text-blue-600" size={20} /></div><div className="quick-action-content"><h4>Pre-register Visitor</h4><p>Notify guards in advance</p></div><ChevronRight size={18} className="text-gray-400" /></button>
                      <button onClick={() => setActiveModule('billing')}  className="quick-action-item"><div className="quick-action-icon bg-purple-50"><DollarSign className="text-purple-600" size={20} /></div><div className="quick-action-content"><h4>View Bills</h4><p>Check payment status</p></div><ChevronRight size={18} className="text-gray-400" /></button>
                    </>
                  )}
                </div>
              </div>
              {profile?.occupancyType === 'renter' && (
                <div className="dashboard-card resident-renewal-card">
                  <div className="card-header"><h3>Renter Renewal</h3></div>
                  <div className="resident-renewal-stack">
                    <div className="resident-renewal-status-row">
                      <span className={accountMeta.className}>{accountMeta.label}</span>
                      <span className="resident-renewal-expiry">Expiry: {formatResidentExpiry(profile)}</span>
                    </div>
                    {profile?.renewalStatus === 'pending' ? (
                      <div className="resident-renewal-note-box">
                        <strong>Renewal request submitted</strong>
                        <p>Your request is already waiting for admin review.</p>
                      </div>
                    ) : (
                      <>
                        {profile?.renewalDecisionNote && (
                          <div className="resident-renewal-note-box resident-renewal-admin-note">
                            <strong>{profile?.renewalStatus === 'rejected' ? 'Admin feedback' : 'Latest admin update'}</strong>
                            <p>{profile.renewalDecisionNote}</p>
                          </div>
                        )}
                        <div className="form-grid-2 resident-renewal-grid">
                          <div className="form-group">
                            <label>Requested New End Date</label>
                            <input
                              type="date"
                              value={renewalRequestDate}
                              onChange={(e) => setRenewalRequestDate(e.target.value)}
                              className="form-input"
                            />
                          </div>
                          <div className="form-group">
                            <label>Note to Admin</label>
                            <input
                              type="text"
                              value={renewalRequestNote}
                              onChange={(e) => setRenewalRequestNote(e.target.value.slice(0, 250))}
                              placeholder="Optional lease or extension note"
                              className="form-input"
                            />
                          </div>
                        </div>
                        <button onClick={handleRequestRenewal} className="action-btn" disabled={loading}>
                          <Calendar size={18} />
                          {loading ? 'Submitting...' : 'Request Renewal'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}
              <div className="dashboard-card resident-reminders-card">
                <div className="card-header"><h3>Important Reminders</h3></div>
                <div className="reminders-list">
                  {profile?.occupancyType === 'renter' ? (
                    <div className="reminder-item"><Calendar className="text-orange-600" size={18} /><div className="reminder-content"><p>Your renter account expires on {formatResidentExpiry(profile)}.</p></div></div>
                  ) : (
                    <div className="reminder-item"><AlertCircle className="text-orange-600" size={18} /><div className="reminder-content"><p>Monthly dues payment due in 5 days</p></div></div>
                  )}
                  <div className="reminder-item"><CheckCircle className="text-green-600" size={18} /><div className="reminder-content"><p>{accessRestricted ? 'Full resident features unlock after renewal approval.' : 'All vehicles registered and updated'}</p></div></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (activeModule === 'profile') {
      return (
        <div>
          <div className="page-header">
            <div className="page-title"><h2>My Profile</h2><p>Manage your household information</p></div>
            <button onClick={() => editMode ? handleUpdateProfile() : setEditMode(true)} className="action-btn" disabled={loading}>
              {editMode ? <><Save size={18} />{loading ? 'Saving...' : 'Save Changes'}</> : <><Edit size={18} />Edit Profile</>}
            </button>
          </div>
          <div className="profile-container">
            <div className="profile-card">
              <div className="profile-header">
                <div className="profile-avatar-large">{profile?.familyName?.[0]?.toUpperCase() || 'R'}</div>
                <div className="profile-header-info">
                  <h2>{profile?.familyName}</h2>
                  <p>@{profile?.username}</p>
                  <span className={accountMeta.className}><CheckCircle size={14} />{accountMeta.label}</span>
                </div>
              </div>

              <div className="profile-section">
                <h3>Contact Information</h3>
                <div className="form-grid">
                  <div className="form-group"><label>Email Address</label>{editMode ? <input type="email" value={editedProfile?.email || ''} onChange={(e) => setEditedProfile({ ...editedProfile, email: e.target.value })} className="form-input" /> : <p className="form-value">{profile?.email}</p>}</div>
                  <div className="form-group"><label>Phone Number</label>{editMode ? <input type="tel" value={editedProfile?.phoneNumber || ''} onChange={(e) => setEditedProfile({ ...editedProfile, phoneNumber: sanitizePhoneNumberInput(e.target.value, editedProfile?.phoneNumber || '+63') })} onKeyDown={(e) => { if (e.target.selectionStart <= 3 && e.key === 'Backspace') e.preventDefault(); }} className="form-input" maxLength={13} /> : <p className="form-value">{profile?.phoneNumber}</p>}</div>
                </div>
              </div>

              <div className="profile-section">
                <h3>Address Information</h3>
                <div className="form-grid">
                  <div className="form-group"><label>Registered Address</label><p className="form-value">{formatResidentAddress(profile)}</p></div>
                  <div className="form-group"><label>Resident Type</label><p className="form-value">{getResidentOccupancyLabel(profile)}</p></div>
                  {profile?.occupancyType === 'renter' && (
                    <div className="form-group"><label>Account Expiry</label><p className="form-value">{formatResidentExpiry(profile)}</p></div>
                  )}
                  <div className="form-group"><label>Address Changes</label><p className="form-value">Please contact the admin to update your registered household or unit.</p></div>
                </div>
              </div>

              {profile?.occupancyType === 'renter' && (
                <div className="profile-section">
                  <h3>Renter Renewal</h3>
                  <div className="resident-renewal-stack">
                    {profile?.renewalStatus === 'pending' ? (
                      <div className="resident-renewal-note-box">
                        <strong>Renewal request in review</strong>
                        <p>The admin side can approve or reject your renewal from Resident Management.</p>
                      </div>
                    ) : (
                      <>
                        {profile?.renewalDecisionNote && (
                          <div className="resident-renewal-note-box resident-renewal-admin-note">
                            <strong>{profile?.renewalStatus === 'rejected' ? 'Admin feedback' : 'Latest admin update'}</strong>
                            <p>{profile.renewalDecisionNote}</p>
                          </div>
                        )}
                        <div className="form-grid">
                          <div className="form-group">
                            <label>Requested New End Date</label>
                            <input
                              type="date"
                              value={renewalRequestDate}
                              onChange={(e) => setRenewalRequestDate(e.target.value)}
                              className="form-input"
                            />
                          </div>
                          <div className="form-group">
                            <label>Note to Admin</label>
                            <input
                              type="text"
                              value={renewalRequestNote}
                              onChange={(e) => setRenewalRequestNote(e.target.value.slice(0, 250))}
                              className="form-input"
                              placeholder="Optional lease or authorization note"
                            />
                          </div>
                        </div>
                        <button onClick={handleRequestRenewal} className="action-btn" disabled={loading}>
                          <Calendar size={18} />
                          {loading ? 'Submitting...' : 'Request Renewal'}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              <div className="profile-section">
                <div className="section-header">
                  <h3>Family Members</h3>
                  {editMode && <button onClick={handleAddFamilyMember} className="add-btn"><Plus size={16} />Add Member</button>}
                </div>
                {editedProfile?.familyMembers?.length === 0
                  ? <p className="empty-message">No family members added yet</p>
                  : <div className="family-members-list">
                      {(editMode ? editedProfile : profile)?.familyMembers?.map((member, index) => (
                        <div key={index} className="family-member-item">
                          {editMode ? (
                            <div className="family-member-form">
                              <input type="text" placeholder="Last Name"   value={member.lastName}   onChange={(e) => handleFamilyMemberChange(index, 'lastName',   e.target.value)} className="form-input-small" maxLength={30} />
                              <input type="text" placeholder="First Name"  value={member.firstName}  onChange={(e) => handleFamilyMemberChange(index, 'firstName',  e.target.value)} className="form-input-small" maxLength={30} />
                              <input type="text" placeholder="Middle Name" value={member.middleName} onChange={(e) => handleFamilyMemberChange(index, 'middleName', e.target.value)} className="form-input-small" maxLength={30} />
                              <select value={member.relationship || ''} onChange={(e) => handleFamilyMemberChange(index, 'relationship', e.target.value)} className="form-input-small">
                                <option value="">Relationship</option>
                                {['Spouse','Father','Mother','Son','Daughter','Brother','Sister','Grandfather','Grandmother','Grandson','Granddaughter','Uncle','Aunt','Nephew','Niece','Cousin','Other'].map(r => <option key={r} value={r}>{r}</option>)}
                              </select>
                              <label className="primary-contact-inline">
                                <input
                                  type="radio"
                                  name="residentPrimaryHouseholdContact"
                                  checked={Boolean(member.isPrimaryContact)}
                                  onChange={() => handleFamilyMemberChange(index, 'isPrimaryContact', true)}
                                />
                                <span>Primary contact</span>
                              </label>
                              <button onClick={() => handleRemoveFamilyMember(index)} className="remove-btn"><Trash2 size={16} /></button>
                            </div>
                          ) : (
                            <div className="family-member-info">
                              <User className="text-green-600" size={20} />
                              <div>
                                <p className="member-name">{member.firstName} {member.middleName} {member.lastName}</p>
                                {member.relationship && <span className="member-relationship-badge">{member.relationship}</span>}
                                {member.isPrimaryContact && <span className="member-primary-badge">Primary Contact</span>}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>}
              </div>

              {editMode && (
                <div className="profile-actions">
                  <button onClick={() => { setEditMode(false); setEditedProfile(profile); }} className="cancel-btn"><XCircle size={18} />Cancel</button>
                  <button onClick={handleUpdateProfile} className="save-btn" disabled={loading}><Save size={18} />{loading ? 'Saving...' : 'Save Changes'}</button>
                </div>
              )}
            </div>
          </div>
        </div>
      );

    }

    if (activeModule === 'vehicles') {
  return (
    <div>

      {/* ── Recently Deleted Modal ── */}
      {showDeletedModal && (
        <div className="vd-modal-overlay" onClick={() => setShowDeletedModal(false)}>
          <div className="vd-modal" onClick={(e) => e.stopPropagation()}>
            <div className="vd-modal-header">
              <div className="vd-modal-header-left">
                <div className="vd-modal-icon"><Trash2 size={18} /></div>
                <div>
                  <h3>Recently Deleted</h3>
                  <p>Vehicles are permanently deleted after 48 hours</p>
                </div>
              </div>
              <button className="vd-modal-close" onClick={() => setShowDeletedModal(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="vd-modal-body">
              {deletedVehicles.length === 0 ? (
                <div className="empty-state-small">
                  <Trash2 size={28} style={{ color: '#9ca3af' }} />
                  <p>No recently deleted vehicles</p>
                </div>
              ) : (
                <div className="vd-list">
                  {deletedVehicles.map((vehicle) => {
                    const timeLeft = getTimeRemaining(vehicle.deletedAt);
                    const isExpiringSoon = timeLeft && timeLeft.hours < 6;
                    return (
                      <div key={vehicle._id} className="vd-row">
                        <div className="vd-row-thumb">
                          {vehicle.photo
                            ? <img src={assetUrl(vehicle.photo.path)} alt={vehicle.plateNumber} />
                            : <Car size={22} style={{ color: 'var(--gray-400)' }} />}
                        </div>
                        <div className="vd-row-info">
                          <div className="vd-row-top">
                            <span className="vd-row-plate">{vehicle.plateNumber}</span>
                            <span className="vd-row-type">{vehicle.vehicleType}</span>
                          </div>
                          <p className="vd-row-sub">{vehicle.brand} {vehicle.model} · {vehicle.color}</p>
                          <div className={`vd-timer ${isExpiringSoon ? 'soon' : ''}`}>
                            <AlertCircle size={11} />
                            {timeLeft
                              ? `Expires in ${timeLeft.hours > 0 ? `${timeLeft.hours}h ` : ''}${timeLeft.minutes}m`
                              : 'Expiring soon'}
                          </div>
                        </div>
                        <div className="vd-row-actions">
                          <button
                            className="vd-restore-btn"
                            disabled={loading}
                            onClick={() => {
                              handleRestoreVehicle(vehicle._id);
                              setShowDeletedModal(false);
                            }}
                          >
                            <Package size={14} />Restore
                          </button>
                          <button
                            className="vd-perm-btn"
                            disabled={loading}
                            onClick={() => handlePermanentDelete(vehicle._id)}
                            title="Delete forever"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Page Header ── */}
      <div className="page-header">
        <div className="page-title">
          <h2>My Vehicles</h2>
          <p>Manage your registered vehicles</p>
        </div>
        <div className="vehicles-header-actions">
          {deletedVehicles.length > 0 && !showVehicleForm && (
            <button className="recently-deleted-pill" onClick={() => setShowDeletedModal(true)}>
              <Trash2 size={14} />
              
              <span className="rd-badge">{deletedVehicles.length}</span>
            </button>
          )}
          <button
            onClick={() => { showVehicleForm ? resetVehicleForm() : setShowVehicleForm(true); }}
            className="action-btn"
          >
            {showVehicleForm
              ? <><XCircle size={18} />Cancel</>
              : <><Plus size={18} />Register Vehicle</>}
          </button>
        </div>
      </div>

      {/* ── Form OR Grid (never both) ── */}
      {showVehicleForm ? (
        <div className="form-card">
          <h3>{editingVehicle ? 'Edit Vehicle' : 'Register New Vehicle'}</h3>
          <form onSubmit={handleRegisterVehicle}>
            <div className="form-grid-2">
              <div className="form-group">
                <label>Plate Number *</label>
                <input type="text" value={vehicleForm.plateNumber} onChange={(e) => setVehicleForm({ ...vehicleForm, plateNumber: sanitizePlateNumberInput(e.target.value, 10) })} placeholder="ABC1234" className="form-input" required />
              </div>
              <div className="form-group">
                <label>Vehicle Type *</label>
                <select value={vehicleForm.vehicleType} onChange={(e) => setVehicleForm({ ...vehicleForm, vehicleType: e.target.value })} className="form-input" required>
                  <option value="">Select type</option>
                  <option value="Car">Car</option><option value="Motorcycle">Motorcycle</option>
                  <option value="SUV">SUV</option><option value="Van">Van</option>
                  <option value="Truck">Truck</option><option value="Bike">Bike</option>
                </select>
              </div>
              <div className="form-group"><label>Brand *</label><input type="text" value={vehicleForm.brand} onChange={(e) => setVehicleForm({ ...vehicleForm, brand: e.target.value })} placeholder="e.g., Toyota" className="form-input" required /></div>
              <div className="form-group"><label>Model *</label><input type="text" value={vehicleForm.model} onChange={(e) => setVehicleForm({ ...vehicleForm, model: e.target.value })} placeholder="e.g., Vios" className="form-input" required /></div>
              <div className="form-group"><label>Color *</label><input type="text" value={vehicleForm.color} onChange={(e) => setVehicleForm({ ...vehicleForm, color: e.target.value })} placeholder="e.g., White" className="form-input" required /></div>
            </div>
            <div className="form-group" style={{ marginTop: '1rem' }}>
              <label>Vehicle Photo (Optional)</label>
              <p className="form-hint"><AlertCircle size={14} />Vehicle photo must show the front of the vehicle including the plate number</p>
              <div className="photo-upload-container">
                <input type="file" accept="image/*" onChange={handleVehiclePhotoChange} className="photo-input" id="vehiclePhoto" />
                <label htmlFor="vehiclePhoto" className="photo-upload-label">
                  <Upload size={20} />{vehiclePhoto ? vehiclePhoto.name : 'Choose Photo'}
                </label>
              </div>
              {vehiclePhotoPreview && (
                <div className="photo-preview">
                  <img src={vehiclePhotoPreview} alt="Vehicle preview" />
                  <button type="button" onClick={() => { setVehiclePhoto(null); setVehiclePhotoPreview(null); }} className="remove-photo-btn"><XCircle size={16} /></button>
                </div>
              )}
            </div>
            <button type="submit" className="submit-btn" disabled={loading}>
              <Car size={20} />{loading ? 'Saving...' : (editingVehicle ? 'Update Vehicle' : 'Register Vehicle')}
            </button>
          </form>
        </div>
      ) : (
        <div className="vehicles-grid">
          {vehicles.length === 0
            ? <div className="empty-state">
                <Car size={40} style={{ color: '#9ca3af' }} />
                <h3>No Vehicles Registered</h3>
                <p>Register your vehicles to allow easy entry and exit</p>
              </div>
          : vehicles.map((vehicle) => (
                <div key={vehicle._id} className="vehicle-card">
                  {vehicle.photo && (
                    <div className="vehicle-photo">
                      <img src={assetUrl(vehicle.photo.path)} alt={vehicle.plateNumber} />
                    </div>
                  )}
                  <div className="vehicle-header">
                    <div className="vehicle-icon bg-green-50"><Car className="text-green-600" size={24} /></div>
                    <span className="vehicle-type">{vehicle.vehicleType}</span>
                  </div>
                  <div className="vehicle-body">
                    <h3>{vehicle.plateNumber}</h3>
                    <p className="vehicle-details">{vehicle.brand} {vehicle.model}</p>
                    <p className="vehicle-color">Color: {vehicle.color}</p>
                  </div>
                  <div className="vehicle-footer">
                    <span className="vehicle-date">Registered: {new Date(vehicle.registeredDate).toLocaleDateString()}</span>
                  </div>
                  <div className="vehicle-actions">
                    <button onClick={() => handleEditVehicle(vehicle)} className="vehicle-action-btn edit-btn"><Edit size={16} />Edit</button>
                    <button onClick={() => handleDeleteVehicle(vehicle._id)} className="vehicle-action-btn delete-btn" disabled={loading}><Trash2 size={16} />Delete</button>
                  </div>
                </div>
              ))}
        </div>
      )}

      <PaginationControls pagination={vehiclesPagination} onPageChange={setVehiclesPage} />

    </div>
  );
}



    if (activeModule === 'visitors') {
  const isDelivery = visitorForm.entryType === 'delivery';
  return (
    <div>
      <div className="page-header">
        <div className="page-title">
          <h2>Pre-Registered Visitors</h2>
          <p>Create visitor passes and open the QR or visitor code whenever entry scanning is unavailable.</p>
        </div>
      </div>

      <div className="visitor-layout">

        {/* ── Form ── */}
        <div className="form-card" style={{ padding: '1.5rem' }}>

          {/* Entry type toggle */}
          <div className="vr-toggle">
            <button
              type="button"
              className={`vr-toggle-btn ${!isDelivery ? 'active' : ''}`}
      onClick={() => setVisitorForm({ ...visitorForm, entryType: 'visitor' })}
            >
              <UserCheck size={15} />Visitor
            </button>
            <button
              type="button"
              className={`vr-toggle-btn ${isDelivery ? 'active' : ''}`}
      onClick={() => setVisitorForm({ ...visitorForm, entryType: 'delivery' })}
            >
              <Package size={15} />Delivery
            </button>
          </div>

          <form onSubmit={handlePreRegisterVisitor}>
            <div className="vr-grid">

              {/* Visitor fields */}


              {!isDelivery && <>
  <div className="form-group">
    <label>Last Name *</label>
    <input
      type="text"
      value={visitorForm.visitorLastName}
      onChange={(e) => setVisitorForm({ ...visitorForm, visitorLastName: sanitizeNameInput(e.target.value, 30) })}
      placeholder="Last name"
      className="form-input"
      maxLength={30}
      required
    />
  </div>
  <div className="form-group">
    <label>First Name *</label>
    <input
      type="text"
      value={visitorForm.visitorFirstName}
      onChange={(e) => setVisitorForm({ ...visitorForm, visitorFirstName: sanitizeNameInput(e.target.value, 30) })}
      placeholder="First name"
      className="form-input"
      maxLength={30}
      required
    />
  </div>
  <div className="form-group">
    <label>Middle Name <span className="field-optional">(optional)</span></label>
    <input
      type="text"
      value={visitorForm.visitorMiddleName}
      onChange={(e) => setVisitorForm({ ...visitorForm, visitorMiddleName: sanitizeNameInput(e.target.value, 30) })}
      placeholder="Middle name"
      className="form-input"
      maxLength={30}
    />
  </div>
  <div className="form-group">
    <label>Contact Number</label>
    <input
      type="tel"
      value={visitorForm.visitorContact}
      onChange={(e) => setVisitorForm({ ...visitorForm, visitorContact: sanitizePhoneNumberInput(e.target.value, visitorForm.visitorContact) })}
      onKeyDown={(e) => { if (e.target.selectionStart <= 3 && e.key === 'Backspace') e.preventDefault(); }}
      placeholder="+639XXXXXXXXX"
      className="form-input"
      maxLength={13}
    />
  </div>
  <div className="form-group">
    <label>Relationship to Resident *</label>
    <input
      type="text"
      value={visitorForm.visitorRelationshipToResident}
      onChange={(e) => setVisitorForm({ ...visitorForm, visitorRelationshipToResident: e.target.value.replace(/[^a-zA-Z\s.'-]/g, '').slice(0, 50) })}
      placeholder="e.g., Cousin"
      className="form-input"
      maxLength={50}
      required
    />
  </div>
  <div className="form-group">
    <label>Identification ID Number *</label>
    <input
      type="text"
      value={visitorForm.visitorIdentification}
      onChange={(e) => setVisitorForm({ ...visitorForm, visitorIdentification: sanitizeIdInput(e.target.value, 12) })}
      placeholder="ID number"
      className="form-input"
      inputMode="numeric"
      pattern="\d{1,12}"
      maxLength={12}
      required
    />
  </div>
  <div className="form-group vr-span">
    <label>Upload Identification *</label>
    <input
      key={visitorIdentificationFile ? 'visitor-id-file-selected' : 'visitor-id-file-empty'}
      type="file"
      accept=".jpg,.jpeg,.png,image/jpeg,image/png"
      onChange={(e) => handleVisitorIdentificationFile(e.target.files?.[0] || null)}
      className="form-input"
      required
    />
    <p className="vr-file-note">
      {visitorIdentificationFile ? visitorIdentificationFile.name : 'JPG or PNG only. Maximum 3 MB.'}
    </p>
  </div>
  <div className="form-group vr-span">
    <label>Purpose of Visit *</label>
    <input
      type="text"
      value={visitorForm.purposeOfVisit}
      onChange={(e) => setVisitorForm({ ...visitorForm, purposeOfVisit: e.target.value.slice(0, 50) })}
      placeholder="e.g., Family visit"
      className="form-input"
      maxLength={50}
      required
    />
  </div>
  <div className="vr-companion-panel vr-span">
    <div className="vr-companion-header">
      <div>
        <h4>Someone else with them?</h4>
        <p>Add each companion so guards can review them before entry.</p>
      </div>
      <button type="button" className="vr-add-companion-btn" onClick={addAccompanyingVisitor}>
        <Plus size={15} />Add Person
      </button>
    </div>
    {(visitorForm.accompanyingVisitors || []).map((companion, index) => (
      <div key={index} className="vr-companion-card">
        <div className="vr-companion-card-head">
          <strong>Companion {index + 1}</strong>
          <button type="button" onClick={() => removeAccompanyingVisitor(index)} aria-label="Remove companion">
            <Trash2 size={15} />
          </button>
        </div>
        <div className="vr-companion-grid">
          <div className="form-group">
            <label>Relationship to Resident *</label>
            <input
              type="text"
              value={companion.relationshipToResident}
              onChange={(e) => updateAccompanyingVisitor(index, 'relationshipToResident', e.target.value)}
              placeholder="e.g., Cousin"
              className="form-input"
              maxLength={40}
            />
          </div>
          <div className="form-group">
            <label>Last Name *</label>
            <input
              type="text"
              value={companion.lastName}
              onChange={(e) => updateAccompanyingVisitor(index, 'lastName', e.target.value)}
              placeholder="Last name"
              className="form-input"
              maxLength={30}
            />
          </div>
          <div className="form-group">
            <label>First Name *</label>
            <input
              type="text"
              value={companion.firstName}
              onChange={(e) => updateAccompanyingVisitor(index, 'firstName', e.target.value)}
              placeholder="First name"
              className="form-input"
              maxLength={30}
            />
          </div>
          <div className="form-group">
            <label>Identification *</label>
            <input
              type="text"
              value={companion.identification}
              onChange={(e) => updateAccompanyingVisitor(index, 'identification', e.target.value)}
              placeholder="ID number"
              className="form-input"
              inputMode="numeric"
              pattern="\d{1,12}"
              maxLength={12}
            />
          </div>
        </div>
      </div>
    ))}
  </div>
</>}

              {/* Delivery fields */}
              {isDelivery && <>
                <div className="form-group">
                  <label>Driver Name *</label>
                  <input
                    type="text"
                    value={visitorForm.deliveryDriverName}
                    onChange={(e) => setVisitorForm({ ...visitorForm, deliveryDriverName: sanitizeNameInput(e.target.value, 80) })}
                    placeholder="Driver's name"
                    className="form-input"
                    maxLength={80}
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Driver Contact</label>
                  <input
                    type="tel"
                    value={visitorForm.deliveryContact}
                    onChange={(e) => setVisitorForm({ ...visitorForm, deliveryContact: sanitizePhoneNumberInput(e.target.value, visitorForm.deliveryContact) })}
                    onKeyDown={(e) => { if (e.target.selectionStart <= 3 && e.key === 'Backspace') e.preventDefault(); }}
                    placeholder="+639XXXXXXXXX"
                    className="form-input"
                    maxLength={13}
                  />
                </div>
              </>}

              {/* Shared: expected date */}
              <div className="form-group vr-span">
                <label>Expected Date &amp; Time</label>
                <input
                  type="datetime-local"
                  value={visitorForm.expectedDate}
                  onChange={(e) => setVisitorForm({ ...visitorForm, expectedDate: e.target.value })}
                  min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                  className="form-input vr-datetime-input"
                />
              </div>

              {/* Vehicle info */}
              <div className="vr-section-label vr-span">Vehicle Info <span>(optional)</span></div>
              <div className="form-group">
                <label>Plate Number</label>
                <input
                  type="text"
                  value={visitorForm.vehiclePlateNumber}
                  onChange={(e) => setVisitorForm({ ...visitorForm, vehiclePlateNumber: sanitizePlateNumberInput(e.target.value, 10) })}
                  placeholder="ABC1234"
                  className="form-input"
                  maxLength={10}
                />
              </div>
              <div className="form-group">
                <label>Vehicle Type</label>
                <select
                  value={visitorForm.vehicleType}
                  onChange={(e) => setVisitorForm({ ...visitorForm, vehicleType: e.target.value })}
                  className="form-input"
                >
                  <option value="">Select type</option>
                  <option value="car">Car</option>
                  <option value="motorcycle">Motorcycle</option>
                  <option value="suv">SUV</option>
                  <option value="van">Van</option>
                  <option value="truck">Truck</option>
                </select>
              </div>
              <div className="form-group">
                <label>Vehicle Color</label>
                <input
                  type="text"
                  value={visitorForm.vehicleColor}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^a-zA-Z\s]/g, '').slice(0, 10);
                    setVisitorForm({ ...visitorForm, vehicleColor: v });
                  }}
                  placeholder="e.g., White, Black"
                  className="form-input"
                  maxLength={10}
                />
              </div>
            </div>

            <button type="submit" className="submit-btn" disabled={loading} style={{ marginTop: '1.25rem' }}>
              <UserCheck size={18} />
              {loading ? 'Registering...' : `Pre-register ${isDelivery ? 'Delivery' : 'Visitor'}`}
            </button>
          </form>
        </div>

        {/* ── Recent Visitors ── */}
        <div className="vr-sidebar vr-insight-sidebar">
          <div className="vr-sidebar-header">
            <h3>Queue Snapshot</h3>
            <span className="vr-count">{visitorHistorySummary.total}</span>
          </div>

          <div className="vr-snapshot-grid">
            <div className="vr-snapshot-card">
              <strong>{visitorHistorySummary.pending}</strong>
              <span>Pending review</span>
            </div>
            <div className="vr-snapshot-card">
              <strong>{visitorHistorySummary.qrReady}</strong>
              <span>QR-ready passes</span>
            </div>
            <div className="vr-snapshot-card">
              <strong>{visitorHistorySummary.inside}</strong>
              <span>Currently inside</span>
            </div>
            <div className="vr-snapshot-card">
              <strong>{Math.max(visitorHistorySummary.total - visitorHistorySummary.pending - visitorHistorySummary.inside, 0)}</strong>
              <span>Reviewed history</span>
            </div>
          </div>

          <div className="vr-sidebar-note">
            <strong>Resident tip</strong>
            <p>QR-approved passes are easier for guards to process at the gate, and you can still help with Home Entry and Home Exit from the QR modal.</p>
          </div>
        </div>

      </div>

      <div className="vr-history-card">
        <div className="vr-history-head">
          <div>
            <h3>Visitor Pass History</h3>
            <p>Search every pass you created, check approval progress, and reopen QR details when needed.</p>
          </div>
          <div className="module-summary-chips">
            <span className="module-summary-chip info">Total {visitorHistorySummary.total}</span>
            <span className="module-summary-chip warning">Pending {visitorHistorySummary.pending}</span>
            <span className="module-summary-chip success">QR Ready {visitorHistorySummary.qrReady}</span>
            <span className="module-summary-chip neutral">Inside {visitorHistorySummary.inside}</span>
          </div>
        </div>

        <div className="module-view-bar vr-history-toolbar">
          <div className="search-input-group vr-history-search">
            <Search size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input
              type="text"
              value={visitorHistoryQuery}
              onChange={(event) => setVisitorHistoryQuery(event.target.value)}
              placeholder="Search by visitor, host, purpose, or plate number..."
              className="search-input"
              style={{ paddingLeft: '2.75rem' }}
            />
          </div>
          <div className="module-view-toggle">
            <button
              type="button"
              className={`module-view-toggle__btn ${visitorHistoryViewMode === 'card' ? 'active' : ''}`}
              onClick={() => setVisitorHistoryViewMode('card')}
            >
              <LayoutGrid size={16} />
              <span>Cards</span>
            </button>
            <button
              type="button"
              className={`module-view-toggle__btn ${visitorHistoryViewMode === 'table' ? 'active' : ''}`}
              onClick={() => setVisitorHistoryViewMode('table')}
            >
              <Table2 size={16} />
              <span>Table</span>
            </button>
          </div>
        </div>

        {filteredRecentVisitors.length === 0 ? (
          <div className="empty-state vr-history-empty">
            <UserCheck size={40} style={{ color: '#9ca3af' }} />
            <h3>{visitorHistoryQuery ? 'No Matching Visitor Passes' : 'No Visitor Passes Yet'}</h3>
            <p>{visitorHistoryQuery ? 'Try a different keyword.' : 'Your pre-registered visitors and deliveries will appear here once you create them.'}</p>
          </div>
        ) : visitorHistoryViewMode === 'table' ? (
          <div className="module-table-card">
            <div className="module-table-wrap">
              <table className="module-table">
                <thead>
                  <tr>
                    <th>Visitor</th>
                    <th>Type</th>
                    <th>Host / Relationship</th>
                    <th>Schedule</th>
                    <th>Status</th>
                    <th>QR / Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRecentVisitors.map((visitor) => {
                    const etaState = getVisitorEtaState(visitor, {
                      dismissed: dismissedEtaVisitorIds[visitor._id]
                    });

                    return (
                    <tr key={visitor._id}>
                      <td>
                        <span className="module-table__primary">{visitor.name}</span>
                        <span className="module-table__secondary">{visitor.purpose}</span>
                      </td>
                      <td>
                        <span className="module-table__primary">{visitor.entryType === 'delivery' ? 'Delivery' : 'Visitor'}</span>
                        <span className="module-table__secondary">Party size: {getVisitorPartySize(visitor)}</span>
                      </td>
                      <td>
                        <span className="module-table__primary">{visitor.hostResidentName}</span>
                        <span className="module-table__secondary">
                          {visitor.entryType === 'delivery' ? 'Delivery booking' : (visitor.relationshipToResident || 'Relationship not set')}
                        </span>
                      </td>
                      <td>
                        <span className="module-table__primary">{visitor.expectedDate ? new Date(visitor.expectedDate).toLocaleString() : 'Any time'}</span>
                        <span className="module-table__secondary">Created {new Date(visitor.createdAt).toLocaleDateString()}</span>
                        {etaState && (
                          <span className={`module-table__secondary ${etaState.tone}`}>
                            {etaState.label}
                            {etaState.kind === 'eta_not_met' && (
                              <button
                                type="button"
                                className="module-table__inline-dismiss"
                                onClick={() => setDismissedEtaVisitorIds((current) => ({ ...current, [visitor._id]: true }))}
                              >
                                Remove
                              </button>
                            )}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className={`module-table__pill ${getVisitorStatusTone(visitor)}`}>
                          {getVisitorStatusLabel(visitor)}
                        </span>
                      </td>
                      <td>
                        <div className="module-table__action-stack">
                          {getVisitorAccessCode(visitor) ? (
                            <span className="module-table__code">{formatVisitorAccessCode(getVisitorAccessCode(visitor))}</span>
                          ) : (
                            <span className="module-table__empty">No QR code assigned</span>
                          )}
                          <div className="module-table__actions">
                            {renderVisitorQrAction(visitor) || <span className="module-table__empty">No extra action</span>}
                          </div>
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
          <div className="vr-history-grid">
            {filteredRecentVisitors.map((visitor) => {
              const etaState = getVisitorEtaState(visitor, {
                dismissed: dismissedEtaVisitorIds[visitor._id]
              });

              return (
              <article key={visitor._id} className="vr-item vr-item--history">
                <div className="vr-avatar">{visitor.name?.[0]?.toUpperCase() || '?'}</div>
                <div className="vr-item-info">
                  <div className="vr-item-top">
                    <span className="vr-item-name">{visitor.name}</span>
                    <span className={`vr-status ${getVisitorStatusTone(visitor)}`}>
                      {getVisitorStatusLabel(visitor)}
                    </span>
                  </div>
                  <p className="vr-item-purpose">{visitor.purpose}</p>
                  <div className="vr-history-meta">
                    <span>{visitor.entryType === 'delivery' ? 'Delivery booking' : (visitor.relationshipToResident || 'Relationship not set')}</span>
                    <span>{visitor.expectedDate ? new Date(visitor.expectedDate).toLocaleString() : 'Any time'}</span>
                    <span>Party size: {getVisitorPartySize(visitor)}</span>
                  </div>
                  {etaState && (
                    <div className={`vr-inline-note ${etaState.tone}`}>
                      {etaState.label}
                      {etaState.kind === 'eta_not_met' && (
                        <button
                          type="button"
                          className="vr-inline-dismiss"
                          onClick={() => setDismissedEtaVisitorIds((current) => ({ ...current, [visitor._id]: true }))}
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  )}
                  <div className="vr-item-actions">
                    {renderVisitorQrAction(visitor)}
                  </div>
                </div>
              </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
    const wrapModule = (content) => (
      <div className="module-stage">
        <div className="module-stage__inner">{content}</div>
      </div>
    );

    if (activeModule === 'announcements') return wrapModule(<ResidentAnnouncements token={token} />);
    if (activeModule === 'facilities')   return wrapModule(<ResidentFacilityReservation token={token} showAlert={showAlert} />);
    if (activeModule === 'complaints')   return wrapModule(<ResidentComplaintManagement token={token} userId={user.id} showAlert={showAlert} />);
    if (activeModule === 'billing')      return wrapModule(<ResidentBillingManagement token={token} userId={user.id} showAlert={showAlert} />);
    if (activeModule === 'documents')    return wrapModule(<ResidentDocumentsManagement token={token} showAlert={showAlert} />);
    if (activeModule === 'subdivision_map') return wrapModule(<SubdivisionMap3D role="Resident" />);
    if (activeModule === 'contact')      return wrapModule(<ResidentContactHOA token={token} showAlert={showAlert} />);
    return null;
  };

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className={`resident-dashboard ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
      <div className={`sidebar-backdrop ${sidebarOpen ? 'active' : ''}`} onClick={() => setSidebarOpen(false)} />
      <aside className={`resident-sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          {sidebarOpen && (
            <div className="sidebar-logo">
              <img src={ecohoa} alt="Ecotrend HOA Logo" style={{ width: '40px', height: '40px', objectFit: 'contain', borderRadius: '10px', background: '#fff', padding: '4px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', flexShrink: 0 }} />
              <div><h1>Ecotrend HOA</h1><p>Resident Panel</p></div>
            </div>
          )}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="sidebar-toggle">
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        <nav className="sidebar-nav">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeModule === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveModule(item.id);
                  if (window.innerWidth <= 767) {
                    setSidebarOpen(false);
                  }
                }}
                className={`nav-item ${isActive ? 'active' : ''}`}
              >
                <Icon size={20} />
                {sidebarOpen && <><span className="nav-item-label">{item.label}</span>{isActive && <ChevronRight size={16} />}</>}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <button onClick={() => showConfirm('Are you sure you want to logout?', onLogout)} className="logout-btn">
            <LogOut size={20} />{sidebarOpen && <span>Logout</span>}
          </button>
        </div>
      </aside>

      <main className="resident-main">
        <header className="resident-header">
          <div className="header-content">
            <div className="header-title">
              <h2>{menuItems.find(item => item.id === activeModule)?.label || 'Overview'}</h2>
              <p>Ecotrend Homeowners Association</p>
            </div>
            <div className="header-user" onClick={() => setSidebarOpen(!sidebarOpen)} style={{ cursor: 'pointer' }}>
              <div className="user-info"><p className="user-name">{user.username}</p><p className="user-role">Resident</p></div>
              <div className="user-avatar">{user.username?.[0]?.toUpperCase() || 'R'}</div>
            </div>
          </div>
        </header>
        <div className="resident-content">
          <div key={activeModule} className="module-view-transition">
            {renderContent()}
          </div>
        </div>
        {viewingVisitorQr && (
          <VisitorQrModal
            visitor={viewingVisitorQr}
            onClose={() => setViewingVisitorQr(null)}
            onForgottenScan={handleForgottenVisitorScan}
            onCopyCode={handleCopyVisitorCode}
            onRecordHomeCheckpoint={handleResidentQrCheckpoint}
            checkpointLoading={loading}
          />
        )}
      </main>
    </div>
  );
};

export default ResidentDashboard;
