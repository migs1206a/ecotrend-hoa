import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ecohoa from '../../assets/ecohoa.png';
import { apiUrl, assetUrl } from '../../utils/api';
import { 
  Home, LogOut, Users, Car, UserCheck, Calendar, 
  Bell, BarChart3, FileText, Shield,
  Menu, X, ChevronRight, TrendingUp, AlertCircle, CheckCircle, XCircle,
  Eye, Download, Search, Clock, MapPin, Phone, Package, User,
  LayoutGrid, Table2, Mail, Bot, Receipt, Camera, Map as MapIcon, History, QrCode
} from 'lucide-react';
import './AdminDashboard.css';
import AdminAnnouncementManagement from '../AnnouncementManagement/AdminAnnouncementManagement';
import AdminAuditLogs from '../AuditLogs/AdminAuditLogs';
import AdminFacilityManagement from '../FacilityManagement/AdminFacilityManagement';
import AdminBillingManagement from '../BillingManagement/AdminBillingManagement';
import AdminBillsAuditLogs from '../BillingManagement/AdminBillsAuditLogs';
import AdminComplaintManagement from '../ComplaintManagement/AdminComplaintManagement';
import AdminReportsManagement from '../ReportsManagement/AdminReportsManagement';
import AdminDocumentsManagement from '../DocumentsManagement/AdminDocumentsManagement';
import AdminContactHOAManagement from '../ContactHOA/AdminContactHOAManagement';
import CCTVFeedsModule from '../CCTV/CCTVFeedsModule';
import SubdivisionMap3D from '../SubdivisionMap/SubdivisionMap3D';
import ManageAccountsModule from '../Accounts/ManageAccountsModule';
import AIAnalyticsModule from '../Analytics/AIAnalyticsModule';
import AdminAIChatbotModule from '../Chatbot/AdminAIChatbotModule';
import PaginationControls from '../common/PaginationControls';
import VisitorIdentificationModal from '../common/VisitorIdentificationModal';
import { PAGE_SIZE, buildPaginatedUrl, parsePaginatedResponse } from '../../utils/pagination';
import { SUBDIVISION_MAP_MODULE, hasAdminModuleAccess, getUserRoleLabel } from '../../utils/adminPermissions';
import {
  formatResidentAddress,
  formatResidentExpiry,
  getResidentAccountMeta,
  getResidentOccupancyLabel
} from '../../utils/residentAccounts';

const formatResidentDate = (value, fallback = 'Not set') => {
  if (!value) {
    return fallback;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toLocaleDateString();
};

const formatDateInputValue = (value) => {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
};

const RESIDENT_SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'family_asc', label: 'Family Name A-Z' },
  { value: 'family_desc', label: 'Family Name Z-A' }
];

const buildResidentEditDraft = (resident = {}) => ({
  familyName: resident.familyName || '',
  email: resident.email || '',
  phoneNumber: resident.phoneNumber || '',
  street: resident.street || '',
  block: resident.block || '',
  lot: resident.lot || '',
  phase: resident.phase || '',
  buildingName: resident.buildingName || '',
  unitNumber: resident.unitNumber || ''
});

const formatResidentDraftAddress = (draft = {}, propertyType = 'house') => {
  const parts = [];

  if (draft.block) {
    parts.push(`Block ${draft.block}`);
  }

  if (draft.lot) {
    parts.push(`Lot ${draft.lot}`);
  }

  if (draft.phase) {
    parts.push(`Phase ${draft.phase}`);
  }

  if (propertyType === 'apartment') {
    if (draft.buildingName) {
      parts.push(draft.buildingName);
    }

    if (draft.unitNumber) {
      parts.push(`Unit ${draft.unitNumber}`);
    }
  }

  if (draft.street) {
    parts.push(draft.street);
  }

  return parts.join(', ') || 'Complete the address fields to preview the full home address.';
};

const formatVisitorAccessCode = (value) => String(value || '').trim().match(/.{1,4}/g)?.join('\n') || '';
const getVisitorPartySize = (visitor) => 1 + (Array.isArray(visitor?.accompanyingVisitors) ? visitor.accompanyingVisitors.length : 0);
const isQrManagedVisitor = (visitor) => Boolean(
  visitor?.qrEntryEnabled ||
  String(visitor?.qrManualCode || visitor?.qrToken || '').trim() ||
  (Array.isArray(visitor?.qrCheckpoints) && visitor.qrCheckpoints.length > 0)
);

// ── OUTSIDE AdminDashboard kasi nagbblink due to currentTime re-renders (nakikisabay yarn HAHAHA) ──────

const FamilyMembersModal = ({ resident, onClose }) => (
  <div className="document-viewer-overlay" onClick={onClose}>
    <div className="family-modal-container" onClick={e => e.stopPropagation()}>
      <div className="family-modal-header">
        <div>
          <h3>Family Members</h3>
          <p>{resident.familyName} &middot; {resident.familyMembers.length} member{resident.familyMembers.length !== 1 ? 's' : ''}</p>
        </div>
        <button onClick={onClose} className="btn-close-viewer"><X size={20} /></button>
      </div>
      <div className="family-modal-body">
        {resident.familyMembers.map((member, i) => (
          <div key={i} className="modal-family-item">
            <div className="family-member-avatar">{member.firstName?.[0]}{member.lastName?.[0]}</div>
            <div className="family-member-info">
              <p className="family-member-name">{member.firstName} {member.middleName} {member.lastName}</p>
              {member.relationship && <span className="family-member-relationship">{member.relationship}</span>}
              {member.isPrimaryContact && <span className="family-member-primary">Primary Contact</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const ResidentDetailModal = ({
  resident,
  onClose,
  isPending,
  onApprove,
  onReject,
  onApproveRenewal,
  onRejectRenewal,
  onViewDocument,
  onUpdateResident,
  onDeleteResident,
  isUpdatingResident,
  isDeletingResident
}) => {
  const accountMeta = getResidentAccountMeta(resident);
  const hasPendingRenewal = resident?.renewalStatus === 'pending';
  const [approvalDate, setApprovalDate] = useState('');
  const [decisionNote, setDecisionNote] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(buildResidentEditDraft(resident));
  const isApartment = resident?.propertyType === 'apartment';
  const addressPreview = formatResidentDraftAddress(editDraft, resident?.propertyType);

  useEffect(() => {
    setApprovalDate(
      formatDateInputValue(resident?.requestedOccupancyEndDate) ||
      formatDateInputValue(resident?.expiresAt)
    );
    setDecisionNote('');
    setIsEditing(false);
    setEditDraft(buildResidentEditDraft(resident));
  }, [resident?._id, resident?.requestedOccupancyEndDate, resident?.expiresAt]);

  const handleDraftChange = (field, value) => {
    setEditDraft((currentDraft) => ({
      ...currentDraft,
      [field]: value
    }));
  };

  const handleSaveResident = async () => {
    const success = await onUpdateResident?.(resident._id, editDraft);

    if (success) {
      setIsEditing(false);
    }
  };

  return (
  <div className="document-viewer-overlay" onClick={onClose}>
    <div className="resident-modal-container" onClick={e => e.stopPropagation()}>
      <div className="resident-modal-header">
        <div className="resident-modal-header-left">
          <div className={`resident-modal-avatar ${isPending ? 'resident-modal-avatar--pending' : ''}`}>
            {resident.familyName?.[0] || 'R'}
          </div>
          <div>
            <h3>{resident.familyName}</h3>
            <p>@{resident.username}</p>
            {!isPending && (
              <div className="resident-modal-subline">
                <span className={accountMeta.className}>{accountMeta.label}</span>
                <span className="resident-type-note">{getResidentOccupancyLabel(resident)}</span>
              </div>
            )}
          </div>
        </div>
        <div className="resident-modal-header-actions">
          {isPending ? (
            <>
              <button onClick={() => onApprove(resident._id)} className="btn-approve"><CheckCircle size={16} /> Approve</button>
              <button onClick={() => onReject(resident._id)}  className="btn-reject"><XCircle size={16} /> Reject</button>
            </>
          ) : (
            <span className="modal-approved-badge"><CheckCircle size={14} /> Approved</span>
          )}
          <button onClick={onClose} className="btn-close-viewer"><X size={20} /></button>
        </div>
      </div>

      <div className="resident-modal-body">
        <div className="modal-account-toolbar">
          <div>
            <h4>Account Management</h4>
            <p>Update resident contact details and household address without leaving this review panel.</p>
          </div>
          <div className="modal-account-toolbar-actions">
            {isEditing ? (
              <>
                <button
                  type="button"
                  className="modal-secondary-btn"
                  onClick={() => {
                    setIsEditing(false);
                    setEditDraft(buildResidentEditDraft(resident));
                  }}
                  disabled={isUpdatingResident}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-approve"
                  onClick={handleSaveResident}
                  disabled={isUpdatingResident}
                >
                  <CheckCircle size={16} /> {isUpdatingResident ? 'Saving...' : 'Save Changes'}
                </button>
              </>
            ) : (
              <button type="button" className="modal-secondary-btn" onClick={() => setIsEditing(true)}>
                Edit Account
              </button>
            )}
            {!isPending && !isEditing && (
              <button
                type="button"
                className="btn-reject"
                onClick={() => onDeleteResident?.(resident._id)}
                disabled={isDeletingResident}
              >
                <XCircle size={16} /> {isDeletingResident ? 'Deleting...' : 'Delete Account'}
              </button>
            )}
          </div>
        </div>

        {isEditing ? (
          <div className="modal-edit-panel">
            <div className="modal-edit-grid">
              <div className="modal-field-group">
                <label>Family Name</label>
                <input
                  type="text"
                  value={editDraft.familyName}
                  onChange={(event) => handleDraftChange('familyName', event.target.value)}
                  className="modal-form-input"
                  maxLength={20}
                />
              </div>
              <div className="modal-field-group">
                <label>Email Address</label>
                <input
                  type="email"
                  value={editDraft.email}
                  onChange={(event) => handleDraftChange('email', event.target.value)}
                  className="modal-form-input"
                />
              </div>
              <div className="modal-field-group">
                <label>Phone Number</label>
                <input
                  type="text"
                  value={editDraft.phoneNumber}
                  onChange={(event) => handleDraftChange('phoneNumber', event.target.value)}
                  className="modal-form-input"
                />
              </div>
              <div className="modal-field-group">
                <label>Street</label>
                <input
                  type="text"
                  value={editDraft.street}
                  onChange={(event) => handleDraftChange('street', event.target.value)}
                  className="modal-form-input"
                  maxLength={30}
                />
              </div>
              <div className="modal-field-group">
                <label>Block</label>
                <input
                  type="text"
                  value={editDraft.block}
                  onChange={(event) => handleDraftChange('block', event.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
                  className="modal-form-input"
                />
              </div>
              <div className="modal-field-group">
                <label>Lot</label>
                <input
                  type="text"
                  value={editDraft.lot}
                  onChange={(event) => handleDraftChange('lot', event.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
                  className="modal-form-input"
                />
              </div>
              <div className="modal-field-group">
                <label>Phase</label>
                <input
                  type="text"
                  value={editDraft.phase}
                  onChange={(event) => handleDraftChange('phase', event.target.value.replace(/[^0-9]/g, '').slice(0, 1))}
                  className="modal-form-input"
                />
              </div>
              {isApartment && (
                <>
                  <div className="modal-field-group">
                    <label>Building Name</label>
                    <input
                      type="text"
                      value={editDraft.buildingName}
                      onChange={(event) => handleDraftChange('buildingName', event.target.value)}
                      className="modal-form-input"
                      maxLength={60}
                    />
                  </div>
                  <div className="modal-field-group">
                    <label>Unit Number</label>
                    <input
                      type="text"
                      value={editDraft.unitNumber}
                      onChange={(event) => handleDraftChange('unitNumber', event.target.value.toUpperCase())}
                      className="modal-form-input"
                      maxLength={20}
                    />
                  </div>
                </>
              )}
            </div>
            <div className="modal-address-preview">
              <span className="modal-info-label">Home Address Preview</span>
              <strong>{addressPreview}</strong>
            </div>
          </div>
        ) : (
          <div className="resident-modal-info-grid">
            <div className="modal-info-item"><Mail size={15} /><div><span className="modal-info-label">Email</span><span className="modal-info-value">{resident.email}</span></div></div>
            <div className="modal-info-item"><MapPin size={15} /><div><span className="modal-info-label">Address</span><span className="modal-info-value">{formatResidentAddress(resident)}</span></div></div>
            <div className="modal-info-item"><Phone size={15} /><div><span className="modal-info-label">Phone</span><span className="modal-info-value">{resident.phoneNumber}</span></div></div>
            <div className="modal-info-item"><Clock size={15} /><div><span className="modal-info-label">{isPending ? 'Applied' : 'Joined'}</span><span className="modal-info-value">{formatResidentDate(resident.createdAt, 'Unknown')}</span></div></div>
            <div className="modal-info-item"><User size={15} /><div><span className="modal-info-label">Resident Type</span><span className="modal-info-value">{getResidentOccupancyLabel(resident)}</span></div></div>
            <div className="modal-info-item"><CheckCircle size={15} /><div><span className="modal-info-label">Account Status</span><span className="modal-info-value"><span className={accountMeta.className}>{accountMeta.label}</span></span></div></div>
            {resident?.occupancyType === 'renter' && (
              <>
                <div className="modal-info-item"><Calendar size={15} /><div><span className="modal-info-label">Occupancy Start</span><span className="modal-info-value">{formatResidentDate(resident.occupancyStartDate)}</span></div></div>
                <div className="modal-info-item"><Calendar size={15} /><div><span className="modal-info-label">Account Expiry</span><span className="modal-info-value">{formatResidentExpiry(resident)}</span></div></div>
              </>
            )}
          </div>
        )}

        {hasPendingRenewal && !isPending && (
          <div className="modal-renewal-panel">
            <div className="modal-renewal-header">
              <div>
                <h4>Renewal Request Ready for Review</h4>
                <p>
                  Requested extension until {formatResidentDate(resident.requestedOccupancyEndDate)}.
                  {resident.renewalRequestedAt ? ` Submitted on ${formatResidentDate(resident.renewalRequestedAt)}.` : ''}
                </p>
              </div>
              <span className="resident-account-pill renewal">Action Needed</span>
            </div>
            {resident.renewalRequestNote && (
              <div className="modal-note-box">
                <strong>Resident note</strong>
                <p>{resident.renewalRequestNote}</p>
              </div>
            )}
            <div className="modal-renewal-form">
              <div className="modal-renewal-grid">
                <div className="modal-field-group">
                  <label>Approved End Date</label>
                  <input
                    type="date"
                    value={approvalDate}
                    min={formatDateInputValue(new Date())}
                    onChange={(e) => setApprovalDate(e.target.value)}
                    className="modal-form-input"
                  />
                </div>
                <div className="modal-field-group">
                  <label>Admin Note</label>
                  <textarea
                    value={decisionNote}
                    onChange={(e) => setDecisionNote(e.target.value.slice(0, 250))}
                    placeholder="Optional note for the resident"
                    className="modal-form-textarea"
                    rows={3}
                  />
                </div>
              </div>
              <div className="modal-renewal-meta">
                <span>Current expiry: {formatResidentExpiry(resident)}</span>
                <span>Requested end date: {formatResidentDate(resident.requestedOccupancyEndDate)}</span>
              </div>
            </div>
            <div className="modal-renewal-actions">
              <button
                onClick={() => onApproveRenewal(resident._id, {
                  approvedOccupancyEndDate: approvalDate,
                  note: decisionNote
                })}
                className="btn-approve"
                disabled={!approvalDate}
              >
                <CheckCircle size={16} /> Approve Renewal
              </button>
              <button
                onClick={() => onRejectRenewal(resident._id, {
                  note: decisionNote
                })}
                className="btn-reject"
              >
                <XCircle size={16} /> Reject Renewal
              </button>
            </div>
          </div>
        )}

        <div className="modal-section">
          <h4 className="modal-section-title">Identification Document</h4>
          <button onClick={() => onViewDocument(resident)} className="btn-view-document"><Eye size={16} /> View Document</button>
        </div>

        {resident.familyMembers?.length > 0 && (
          <div className="modal-section">
            <h4 className="modal-section-title">Family Members <span className="modal-count-badge">{resident.familyMembers.length}</span></h4>
            <div className="modal-family-list">
              {resident.familyMembers.map((member, index) => (
                <div key={index} className="modal-family-item">
                  <div className="family-member-avatar">{member.firstName?.[0]}{member.lastName?.[0]}</div>
                  <div className="family-member-info">
                    <p className="family-member-name">{member.firstName} {member.middleName} {member.lastName}</p>
                    {member.relationship && <span className="family-member-relationship">{member.relationship}</span>}
                    {member.isPrimaryContact && <span className="family-member-primary">Primary Contact</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {resident.vehicles?.length > 0 && (
          <div className="modal-section">
            <h4 className="modal-section-title">Vehicles <span className="modal-count-badge">{resident.vehicles.length}</span></h4>
            <div className="modal-vehicles-list">
              {resident.vehicles.map((vehicle, index) => (
                <div key={index} className="modal-vehicle-item">
                  <Car size={16} className="modal-vehicle-icon" />
                  <div>
                    <p className="modal-vehicle-plate">{vehicle.plateNumber}</p>
                    <p className="modal-vehicle-detail">{vehicle.brand} {vehicle.model} · {vehicle.color} · {vehicle.vehicleType}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  </div>
  );
};

const DocumentViewer = ({ resident, token, onClose }) => {
  const [documentUrl, setDocumentUrl] = useState('');
  const [documentError, setDocumentError] = useState('');
  const [loadingDocument, setLoadingDocument] = useState(true);
  const identificationDocument = resident.identificationDocument || {};
  const isPDF = identificationDocument.mimetype === 'application/pdf';
  const originalName = identificationDocument.originalName || 'identification-document';

  useEffect(() => {
    let objectUrl = '';
    let cancelled = false;

    const loadDocument = async () => {
      setLoadingDocument(true);
      setDocumentError('');
      setDocumentUrl('');

      try {
        const response = await fetch(apiUrl(`/residents/${resident._id}/identification/file`), {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.message || 'Failed to load identification document.');
        }

        const blob = await response.blob();
        objectUrl = URL.createObjectURL(blob);

        if (!cancelled) {
          setDocumentUrl(objectUrl);
        }
      } catch (error) {
        if (!cancelled) {
          setDocumentError(error.message || 'Failed to load identification document.');
        }
      } finally {
        if (!cancelled) {
          setLoadingDocument(false);
        }
      }
    };

    loadDocument();

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [resident._id, token]);
  return (
    <div className="document-viewer-overlay" onClick={onClose}>
      <div className="document-viewer-container" onClick={e => e.stopPropagation()}>
        <div className="document-viewer-header">
          <div><h3>Identification Document</h3><p>{resident.familyName} — {originalName}</p></div>
          <div className="document-viewer-actions">
            <a
              href={documentUrl || '#'}
              download={originalName}
              className="btn-download"
              onClick={(event) => {
                if (!documentUrl) event.preventDefault();
              }}
            >
              <Download size={18} /> Download
            </a>
            <button onClick={onClose} className="btn-close-viewer"><X size={20} /></button>
          </div>
        </div>
        <div className="document-viewer-content">
          {loadingDocument
            ? <div className="document-viewer-message"><div className="spinner"></div><p>Loading document...</p></div>
            : documentError
              ? <div className="document-viewer-message document-viewer-error"><AlertCircle size={28} /><p>{documentError}</p></div>
              : isPDF
                ? <iframe src={documentUrl} title="ID Document" className="document-viewer-iframe" />
                : <img src={documentUrl} alt="ID Document" className="document-viewer-image" />}
        </div>
      </div>
    </div>
  );
};

const VehiclePhotoModal = ({ vehicle, onClose }) => {
  const photoUrl = assetUrl(vehicle?.photo?.path || '');

  return (
    <div className="document-viewer-overlay" onClick={onClose}>
      <div className="document-viewer-container" onClick={(event) => event.stopPropagation()}>
        <div className="document-viewer-header">
          <div><h3>Vehicle Photo</h3><p>{vehicle?.plateNumber} - {vehicle?.brand} {vehicle?.model}</p></div>
          <div className="document-viewer-actions">
            <a
              href={photoUrl || '#'}
              download={vehicle?.photo?.originalName || `${vehicle?.plateNumber || 'vehicle'}-photo`}
              className="btn-download"
              onClick={(event) => {
                if (!photoUrl) {
                  event.preventDefault();
                }
              }}
            >
              <Download size={18} /> Download
            </a>
            <button onClick={onClose} className="btn-close-viewer"><X size={20} /></button>
          </div>
        </div>
        <div className="document-viewer-content">
          {photoUrl
            ? <img src={photoUrl} alt={`${vehicle?.plateNumber || 'Vehicle'} registration`} className="document-viewer-image" />
            : <div className="document-viewer-message document-viewer-error"><AlertCircle size={28} /><p>No vehicle photo is attached to this record.</p></div>}
        </div>
      </div>
    </div>
  );
};

  const ScrollableTableWrapper = ({ children }) => {
    const scrollRef = useRef(null);
    const dragRef = useRef({
    active: false,
    dragged: false,
    pointerId: null,
    startX: 0,
    scrollLeft: 0
  });

    const handlePointerDown = (event) => {
      const target = event.target instanceof Element ? event.target : null;

    if (event.pointerType === 'touch' || target?.closest('button, a, input, select, textarea')) {
      return;
    }

    const element = scrollRef.current;
    if (!element) {
      return;
    }

    dragRef.current = {
      active: true,
      dragged: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      scrollLeft: element.scrollLeft
    };
    element.setPointerCapture?.(event.pointerId);
  };

  const stopDragging = () => {
    dragRef.current.active = false;
    dragRef.current.pointerId = null;
  };

  const handlePointerMove = (event) => {
    const state = dragRef.current;
    const element = scrollRef.current;

    if (!state.active || !element || state.pointerId !== event.pointerId) {
      return;
    }

    const deltaX = event.clientX - state.startX;

    if (Math.abs(deltaX) > 4) {
      dragRef.current.dragged = true;
      event.preventDefault();
    }

    element.scrollLeft = state.scrollLeft - deltaX;
  };

  const handleClickCapture = (event) => {
    if (!dragRef.current.dragged) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    dragRef.current.dragged = false;
  };

  return (
    <div
      className="residents-table-wrapper"
      ref={scrollRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={stopDragging}
      onPointerCancel={stopDragging}
      onClickCapture={handleClickCapture}
    >
      {children}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────

const AdminDashboard = ({ onLogout, showConfirm, showAlert }) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeModule, setActiveModule]         = useState('overview');
  const [stats, setStats]                       = useState({ totalResidents: 0, totalVehicles: 0, todayVisitors: 0, pendingApprovals: 0, activeReservations: 0 });
  const [pendingResidents, setPendingResidents] = useState([]);
  const [allResidents, setAllResidents]         = useState([]);
  const [recentActivity, setRecentActivity]     = useState([]);
  const [dashboardAnnouncements, setDashboardAnnouncements] = useState([]);
  const [allVisitors, setAllVisitors]           = useState([]);
  const [preRegisteredVisitors, setPreRegisteredVisitors] = useState([]);
  const [allDeliveries, setAllDeliveries]       = useState([]);
  const [loading, setLoading]                   = useState(false);
  const [showAllResidents, setShowAllResidents] = useState(false);
  const [viewingDocument, setViewingDocument]   = useState(null);
  const [viewingVisitorIdentification, setViewingVisitorIdentification] = useState(null);
  const [residentViewMode, setResidentViewMode] = useState('card');
  const [viewingResident, setViewingResident]   = useState(null);
  const [viewingFamilyMembers, setViewingFamilyMembers] = useState(null);
  const [viewingVehicle, setViewingVehicle] = useState(null);
  const [allVehicles, setAllVehicles]           = useState([]);
  const [pendingResidentsPage, setPendingResidentsPage] = useState(1);
  const [approvedResidentsPage, setApprovedResidentsPage] = useState(1);
  const [vehiclesPage, setVehiclesPage] = useState(1);
  const [pendingResidentsPagination, setPendingResidentsPagination] = useState(null);
  const [approvedResidentsPagination, setApprovedResidentsPagination] = useState(null);
  const [vehiclesPagination, setVehiclesPagination] = useState(null);
  const [vehicleViewMode, setVehicleViewMode]   = useState('card');
  const [vehicleSearchQuery, setVehicleSearchQuery]   = useState('');
  const [residentSearchQuery, setResidentSearchQuery] = useState('');
  const [residentSortOption, setResidentSortOption] = useState('newest');
  const [visitorSearchQuery, setVisitorSearchQuery]   = useState('');
  const [preRegisteredSearchQuery, setPreRegisteredSearchQuery] = useState('');
  const [visitorViewMode, setVisitorViewMode]   = useState('card');
  const [preRegisteredViewMode, setPreRegisteredViewMode] = useState('card');
  const [visitorLogsPage, setVisitorLogsPage] = useState(1);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [residentLoadingCount, setResidentLoadingCount] = useState(0);
  const [residentMutation, setResidentMutation] = useState({ id: '', action: '' });
  const lastTrackedModuleRef = useRef('');
  const residentLoading = residentLoadingCount > 0;

  const [sessionUser, setSessionUser] = useState(() => JSON.parse(localStorage.getItem('user') || '{}'));
  const user = sessionUser;
  const token = useMemo(() => localStorage.getItem('token'), []);
  const canAccessModule = useCallback(
    (moduleKey) => hasAdminModuleAccess(user, moduleKey),
    [user]
  );
  const userRoleLabel = getUserRoleLabel(user);
  const beginResidentLoading = useCallback(() => {
    setResidentLoadingCount((currentCount) => currentCount + 1);
  }, []);
  const endResidentLoading = useCallback(() => {
    setResidentLoadingCount((currentCount) => Math.max(0, currentCount - 1));
  }, []);

  const syncCurrentUser = useCallback(async () => {
    if (!token) return;

    try {
      const response = await fetch(apiUrl('/auth/me'), {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.status === 401 || response.status === 403) {
        onLogout?.();
        return;
      }

      if (!response.ok) return;

      const data = await response.json();
      if (!data?.user) return;

      setSessionUser((previousUser) => {
        const nextUser = { ...previousUser, ...data.user };
        const previousJson = JSON.stringify(previousUser);
        const nextJson = JSON.stringify(nextUser);

        if (previousJson === nextJson) {
          return previousUser;
        }

        localStorage.setItem('user', nextJson);
        return nextUser;
      });
    } catch (error) {
      console.error('Error syncing current user:', error);
    }
  }, [onLogout, token]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 767) setSidebarOpen(false);
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    syncCurrentUser();

    const interval = setInterval(syncCurrentUser, 5000);
    const handleFocus = () => syncCurrentUser();
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        syncCurrentUser();
      }
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [syncCurrentUser]);

  // ── Data Fetching ────────────────────────────────────────────────
  const fetchAllStats = useCallback(async () => {
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const nextStats = {
        totalResidents: 0,
        totalVehicles: 0,
        todayVisitors: 0,
        pendingApprovals: 0,
        activeReservations: 0
      };

      if (canAccessModule('residents')) {
        const [residentsRes, pendingRes, vehiclesRes] = await Promise.all([
          fetch(apiUrl(buildPaginatedUrl('/residents/approved', 1, { limit: 1 })), { headers }),
          fetch(apiUrl(buildPaginatedUrl('/residents/pending', 1, { limit: 1 })), { headers }),
          fetch(apiUrl(buildPaginatedUrl('/residents/vehicles/all', 1, { limit: 1 })), { headers })
        ]);
        const residentsParsed = parsePaginatedResponse(await residentsRes.json());
        const pendingParsed = parsePaginatedResponse(await pendingRes.json());
        const vehiclesParsed = parsePaginatedResponse(await vehiclesRes.json());

        nextStats.totalResidents = residentsParsed.pagination?.total ?? residentsParsed.items.length;
        nextStats.totalVehicles = vehiclesParsed.pagination?.total ?? vehiclesParsed.items.length;
        nextStats.pendingApprovals = pendingParsed.pagination?.total ?? pendingParsed.items.length;
      }

      if (canAccessModule('visitors')) {
        const visitorsRes = await fetch(apiUrl('/visitors'), { headers });
        const visitorsData = await visitorsRes.json();
        const today = new Date().toDateString();

        if (Array.isArray(visitorsData)) {
          nextStats.todayVisitors = visitorsData.filter(
            (visitor) => new Date(visitor.entryTime).toDateString() === today
          ).length;
        }
      }

      if (canAccessModule('facilities')) {
        const facilitiesRes = await fetch(apiUrl('/facilities/all'), { headers });
        const facilitiesData = await facilitiesRes.json();

        if (Array.isArray(facilitiesData)) {
          nextStats.activeReservations = facilitiesData.filter((reservation) =>
            ['pending', 'approved'].includes(reservation.status)
          ).length;
        }
      }

      setStats(nextStats);
    } catch (error) { console.error('Error fetching stats:', error); }
  }, [token, canAccessModule]);

  const fetchRecentActivity = useCallback(async () => {
    try {
      if (!canAccessModule('visitors')) {
        setRecentActivity([]);
        return;
      }

      const [entryLogsRes, visitorsRes, deliveriesRes] = await Promise.all([
        fetch(apiUrl('/entry-logs'), { headers: { Authorization: `Bearer ${token}` } }),
        fetch(apiUrl('/visitors'),   { headers: { Authorization: `Bearer ${token}` } }),
        fetch(apiUrl('/deliveries'), { headers: { Authorization: `Bearer ${token}` } }).catch(() => ({ json: async () => [] }))
      ]);
      const entryLogs  = await entryLogsRes.json();
      const visitors   = await visitorsRes.json();
      const deliveries = await deliveriesRes.json();
      const activities = [];
      if (Array.isArray(entryLogs))  entryLogs.slice(0,10).forEach(log => activities.push({ text: log.notes || `Vehicle ${log.plateNumber} ${log.logType === 'entry' ? 'entered' : 'exited'} (${log.vehicleOwnerType || 'resident'})`, time: formatTimeAgo(new Date(log.timestamp)), color: log.logType === 'entry' ? 'bg-green-50' : 'bg-blue-50', dotColor: log.logType === 'entry' ? '#10b981' : '#3b82f6', timestamp: new Date(log.timestamp) }));
      if (Array.isArray(visitors))   visitors.slice(0,10).forEach(visitor => { activities.push({ text: `Visitor ${visitor.name} registered (visiting ${visitor.hostResidentName})`, time: formatTimeAgo(new Date(visitor.entryTime)), color: 'bg-purple-50', dotColor: '#8b5cf6', timestamp: new Date(visitor.entryTime) }); if (visitor.status === 'exited' && visitor.exitTime) activities.push({ text: `Visitor ${visitor.name} exited`, time: formatTimeAgo(new Date(visitor.exitTime)), color: 'bg-orange-50', dotColor: '#f97316', timestamp: new Date(visitor.exitTime) }); });
      if (Array.isArray(deliveries)) deliveries.slice(0,10).forEach(delivery => { activities.push({ text: `Delivery by ${delivery.driverName} to ${delivery.hostResidentAddress}`, time: formatTimeAgo(new Date(delivery.entryTime)), color: 'bg-cyan-50', dotColor: '#06b6d4', timestamp: new Date(delivery.entryTime) }); if (delivery.status === 'exited' && delivery.exitTime) activities.push({ text: `Delivery by ${delivery.driverName} completed`, time: formatTimeAgo(new Date(delivery.exitTime)), color: 'bg-orange-50', dotColor: '#f97316', timestamp: new Date(delivery.exitTime) }); });
      activities.sort((a, b) => b.timestamp - a.timestamp);
      setRecentActivity(activities.slice(0, 10));
    } catch (error) { console.error('Error fetching recent activity:', error); }
  }, [token, canAccessModule]);

  const fetchDashboardAnnouncements = useCallback(async () => {
    try {
      const response = await fetch(apiUrl(buildPaginatedUrl('/announcements', 1, {
        activeOnly: true,
        limit: 4
      })));
      const data = await response.json();
      const parsed = parsePaginatedResponse(data);
      setDashboardAnnouncements(parsed.items);
    } catch (error) {
      console.error('Error fetching dashboard announcements:', error);
      setDashboardAnnouncements([]);
    }
  }, []);

  const formatTimeAgo = (date) => {
    const s = Math.floor((new Date() - date) / 1000);
    if (s < 60)     return 'Just now';
    if (s < 3600)   return `${Math.floor(s / 60)} min ago`;
    if (s < 86400)  return `${Math.floor(s / 3600)} hour${Math.floor(s / 3600) > 1 ? 's' : ''} ago`;
    if (s < 604800) return `${Math.floor(s / 86400)} day${Math.floor(s / 86400) > 1 ? 's' : ''} ago`;
    return date.toLocaleDateString();
  };

  const fetchPendingResidents = useCallback(async () => {
    beginResidentLoading();
    try {
      const response = await fetch(
        apiUrl(buildPaginatedUrl('/residents/pending', pendingResidentsPage, {
          q: residentSearchQuery.trim(),
          sort: residentSortOption
        })),
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await response.json();
      const parsed = parsePaginatedResponse(data);
      setPendingResidents(parsed.items);
      setPendingResidentsPagination(parsed.pagination);
    } catch (error) {
      console.error('Error fetching pending:', error);
      setPendingResidents([]);
      setPendingResidentsPagination(null);
    } finally {
      endResidentLoading();
    }
  }, [beginResidentLoading, endResidentLoading, pendingResidentsPage, residentSearchQuery, residentSortOption, token]);

  const fetchAllResidents = useCallback(async () => {
    try {
      beginResidentLoading();
      const response = await fetch(
        apiUrl(buildPaginatedUrl('/residents/approved', approvedResidentsPage, {
          q: residentSearchQuery.trim(),
          sort: residentSortOption
        })),
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await response.json();
      const parsed = parsePaginatedResponse(data);
      setAllResidents(parsed.items);
      setApprovedResidentsPagination(parsed.pagination);
    } catch (error) {
      console.error('Error fetching residents:', error);
      setAllResidents([]);
      setApprovedResidentsPagination(null);
    } finally {
      endResidentLoading();
    }
  }, [approvedResidentsPage, beginResidentLoading, endResidentLoading, residentSearchQuery, residentSortOption, token]);

  const fetchAllVehicles = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(apiUrl(buildPaginatedUrl('/residents/vehicles/all', vehiclesPage)), { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      const parsed = parsePaginatedResponse(data);
      setAllVehicles(parsed.items);
      setVehiclesPagination(parsed.pagination);
    } catch (error) { console.error('Error fetching vehicles:', error); }
    setLoading(false);
  }, [vehiclesPage, token]);

  const fetchAllVisitors = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(apiUrl('/visitors'), { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      setAllVisitors(Array.isArray(data) ? data : []);
    } catch (error) { setAllVisitors([]); }
    setLoading(false);
  }, [token]);

  const fetchPreRegisteredVisitors = useCallback(async () => {
    try {
      const response = await fetch(apiUrl('/visitors/pre-registered'), { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      setPreRegisteredVisitors(Array.isArray(data) ? data : []);
    } catch (error) {
      setPreRegisteredVisitors([]);
    }
  }, [token]);

  const fetchAllDeliveries = useCallback(async () => {
    try {
      const response = await fetch(apiUrl('/deliveries'), { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      setAllDeliveries(Array.isArray(data) ? data : []);
    } catch (error) { setAllDeliveries([]); }
  }, [token]);

  const openVisitorIdentification = async (visitor) => {
    if (!visitor?.identificationDocument?.path) {
      showAlert('No visitor identification is attached to this record.', 'error');
      return;
    }

    setViewingVisitorIdentification(visitor);
  };

  const reviewPreRegisteredVisitor = (visitor, decision, qrEntryEnabled = false) => {
    const actionLabel = decision === 'approved'
      ? qrEntryEnabled ? 'approve this visitor for QR entry' : 'approve this visitor'
      : 'reject this visitor';

    showConfirm(`Are you sure you want to ${actionLabel}?`, async () => {
      try {
        const response = await fetch(apiUrl(`/visitors/${visitor._id}/review`), {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ decision, qrEntryEnabled })
        });
        const data = await response.json();

        if (!response.ok) {
          showAlert(data.message || 'Failed to review pre-registered visitor.', 'error');
          return;
        }

        showAlert(data.message || 'Pre-registered visitor reviewed.', 'success');
        fetchPreRegisteredVisitors();
        fetchAllVisitors();
      } catch (error) {
        showAlert('Failed to review pre-registered visitor.', 'error');
      }
    });
  };

  useEffect(() => {
    fetchAllStats();
    fetchRecentActivity();
    fetchDashboardAnnouncements();
    const interval = setInterval(() => { fetchAllStats(); fetchRecentActivity(); fetchDashboardAnnouncements(); }, 30000);
    return () => clearInterval(interval);
  }, [fetchAllStats, fetchRecentActivity, fetchDashboardAnnouncements]);

  useEffect(() => {
    if      (activeModule === 'residents') { fetchPendingResidents(); fetchAllResidents(); }
    else if (activeModule === 'vehicles')  { fetchAllVehicles(); }
    else if (activeModule === 'visitors')  { fetchAllVisitors(); fetchAllDeliveries(); }
    else if (activeModule === 'pre-registered') { fetchPreRegisteredVisitors(); }
  }, [activeModule, fetchPendingResidents, fetchAllResidents, fetchAllVehicles, fetchAllVisitors, fetchPreRegisteredVisitors, fetchAllDeliveries]);

  useEffect(() => {
    setVisitorLogsPage(1);
  }, [visitorSearchQuery]);

  const approveResident = async (id) => {
    try {
      const response = await fetch(apiUrl(`/residents/${id}/approve`), { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } });
      if (response.ok) { fetchPendingResidents(); fetchAllResidents(); fetchAllStats(); fetchRecentActivity(); setViewingResident(null); }
    } catch (error) { console.error('Error approving:', error); }
  };

  const rejectResident = async (id) => {
    showConfirm('Are you sure you want to reject this resident?', async () => {
      try {
        const response = await fetch(apiUrl(`/residents/${id}`), { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
        const data = await response.json().catch(() => ({}));
        if (response.ok) {
          fetchPendingResidents(); fetchAllResidents(); fetchAllStats(); setViewingResident(null);
          showAlert(data.message || 'Resident rejected successfully.', 'success');
          return;
        }
        showAlert(data.message || 'Failed to reject resident.', 'error');
      } catch (error) { console.error('Error rejecting:', error); showAlert('Failed to reject resident.', 'error'); }
    });
  };

  const updateResidentAccount = async (id, payload = {}) => {
    setResidentMutation({ id, action: 'update' });

    try {
      const response = await fetch(apiUrl(`/residents/${id}`), {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        showAlert(data.message || 'Failed to update resident account.', 'error');
        return false;
      }

      fetchPendingResidents();
      fetchAllResidents();
      setViewingResident(data.resident || null);
      showAlert(data.message || 'Resident account updated successfully.', 'success');
      return true;
    } catch (error) {
      console.error('Error updating resident:', error);
      showAlert('Failed to update resident account.', 'error');
      return false;
    } finally {
      setResidentMutation({ id: '', action: '' });
    }
  };

  const deleteResidentAccount = async (id) => {
    showConfirm('Move this resident account to recently deleted accounts?', async () => {
      setResidentMutation({ id, action: 'delete' });

      try {
        const response = await fetch(apiUrl(`/residents/${id}`), {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          showAlert(data.message || 'Failed to delete resident account.', 'error');
          return;
        }

        fetchPendingResidents();
        fetchAllResidents();
        fetchAllStats();
        setViewingResident(null);
        showAlert(data.message || 'Resident account moved to recently deleted accounts.', 'success');
      } catch (error) {
        console.error('Error deleting resident:', error);
        showAlert('Failed to delete resident account.', 'error');
      } finally {
        setResidentMutation({ id: '', action: '' });
      }
    });
  };

  const approveResidentRenewal = async (id, payload = {}) => {
    if (!payload.approvedOccupancyEndDate) {
      showAlert('Please set an approved end date before approving this renewal.', 'error');
      return;
    }

    showConfirm('Approve this renter renewal request?', async () => {
      try {
        const response = await fetch(apiUrl(`/residents/${id}/renewal/approve`), {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });
        const data = await response.json();

        if (!response.ok) {
          showAlert(data.message || 'Failed to approve renewal request.', 'error');
          return;
        }

        fetchAllResidents();
        fetchAllStats();
        setViewingResident(data.resident || null);
        showAlert('Renewal approved successfully.', 'success');
      } catch (error) {
        console.error('Error approving renewal:', error);
        showAlert('Failed to approve renewal request.', 'error');
      }
    });
  };

  const rejectResidentRenewal = async (id, payload = {}) => {
    showConfirm('Reject this renter renewal request?', async () => {
      try {
        const response = await fetch(apiUrl(`/residents/${id}/renewal/reject`), {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify(payload)
        });
        const data = await response.json();

        if (!response.ok) {
          showAlert(data.message || 'Failed to reject renewal request.', 'error');
          return;
        }

        fetchAllResidents();
        fetchAllStats();
        setViewingResident(data.resident || null);
        showAlert('Renewal request rejected.', 'success');
      } catch (error) {
        console.error('Error rejecting renewal:', error);
        showAlert('Failed to reject renewal request.', 'error');
      }
    });
  };

  // ── Menu ─────────────────────────────────────────────────────────
  const PesoIcon = ({ size = 20 }) => (
    <span style={{ fontSize: size, fontWeight: 800, lineHeight: 1, fontFamily: 'inherit' }}>₱</span>
  );

  const allMenuItems = [
    { id: 'overview',        icon: Home,        label: 'Overview', permission: 'overview' },
    { id: 'residents',       icon: Users,       label: 'Resident Management', permission: 'residents' },
    { id: 'vehicles',        icon: Car,         label: 'Vehicle Management', permission: 'vehicles' },
    { id: 'visitors',        icon: UserCheck,   label: 'Visitor Logs', permission: 'visitors' },
    { id: 'pre-registered',  icon: QrCode,      label: 'Pre-Registered Visitors', permission: 'visitors' },
    { id: 'facilities',      icon: Calendar,    label: 'Facility Reservations', permission: 'facilities' },
    { id: 'complaints',      icon: AlertCircle, label: 'Complaints', permission: 'complaints' },
    { id: 'announcements',   icon: Bell,        label: 'Announcements', permission: 'announcements' },
    { id: 'contact_hoa',     icon: Phone,       label: 'Contact HOA', permission: 'contact_hoa' },
    { id: 'cctv',            icon: Camera,      label: 'CCTV Feeds', permission: 'cctv' },
    { id: 'billing',         icon: PesoIcon,    label: 'Billing & Payments', permission: 'billing' },
    { id: 'bill_audit_logs', icon: Receipt,     label: 'Admin Bills Audit/Logs', permission: 'bill_audit_logs' },
    { id: 'audit_logs',      icon: History,     label: 'Audit Logs', permission: 'audit_logs' },
    { id: 'documents',       icon: FileText,    label: 'Resident Documents', permission: 'documents' },
    { id: 'analytics',       icon: BarChart3,   label: 'AI Analytics', permission: 'analytics' },
    { id: 'ai_chatbot',      icon: Bot,         label: 'AI Chatbot', permission: 'ai_chatbot' },
    { id: 'subdivision_map', icon: MapIcon,     label: SUBDIVISION_MAP_MODULE.label, permission: 'subdivision_map' },
    { id: 'reports',         icon: FileText,    label: 'Reports', permission: 'reports' },
    { id: 'manage_accounts', icon: Shield,      label: 'Manage Accounts', permission: 'manage_accounts' }
  ];

  const menuItems = allMenuItems.filter((item) => canAccessModule(item.permission));

  useEffect(() => {
    if (!menuItems.some((item) => item.id === activeModule)) {
      setActiveModule(menuItems[0]?.id || 'overview');
    }
  }, [activeModule, menuItems]);

  useEffect(() => {
    const trackedModuleKey = activeModule === 'pre-registered' ? 'visitors' : activeModule;

    if (!token || !activeModule || !hasAdminModuleAccess(user, trackedModuleKey)) {
      return;
    }

    if (lastTrackedModuleRef.current === activeModule) {
      return;
    }

    lastTrackedModuleRef.current = activeModule;

    fetch(apiUrl('/admin-audit-logs/module-access'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ moduleKey: trackedModuleKey })
    }).catch((error) => {
      console.error('Failed to record module access:', error);
    });
  }, [activeModule, token, user]);

  // ── Small Components ─────────────────────────────────────────────
  const StatCard = ({ title, value, icon: Icon, borderColor, iconBg, iconColor, trend }) => (
    <div className="stat-card" style={{ borderLeftColor: borderColor }}>
      <div className="stat-card-content">
        <div className="stat-info">
          <p>{title}</p><h3>{value}</h3>
          {trend && <div className="stat-trend"><TrendingUp size={14} /><span>{trend}</span></div>}
        </div>
        <div className={`stat-icon ${iconBg}`}><Icon className={iconColor} size={24} /></div>
      </div>
    </div>
  );

  // ── View Toggles ─────────────────────────────────────────────────
  const ViewToggle = () => (
    <div className="view-toggle-group">
      <button className={`view-toggle-btn ${residentViewMode === 'card'  ? 'active' : ''}`} onClick={() => setResidentViewMode('card')}><LayoutGrid size={16} /><span>Cards</span></button>
      <button className={`view-toggle-btn ${residentViewMode === 'table' ? 'active' : ''}`} onClick={() => setResidentViewMode('table')}><Table2 size={16} /><span>Table</span></button>
    </div>
  );

  const VehicleViewToggle = () => (
    <div className="view-toggle-group">
      <button className={`view-toggle-btn ${vehicleViewMode === 'card'  ? 'active' : ''}`} onClick={() => setVehicleViewMode('card')}><LayoutGrid size={16} /><span>Cards</span></button>
      <button className={`view-toggle-btn ${vehicleViewMode === 'table' ? 'active' : ''}`} onClick={() => setVehicleViewMode('table')}><Table2 size={16} /><span>Table</span></button>
    </div>
  );

  const VisitorViewToggle = () => (
    <div className="view-toggle-group">
      <button className={`view-toggle-btn ${visitorViewMode === 'card'  ? 'active' : ''}`} onClick={() => setVisitorViewMode('card')}><LayoutGrid size={16} /><span>Cards</span></button>
      <button className={`view-toggle-btn ${visitorViewMode === 'table' ? 'active' : ''}`} onClick={() => setVisitorViewMode('table')}><Table2 size={16} /><span>Table</span></button>
    </div>
  );

  const PreRegisteredViewToggle = () => (
    <div className="view-toggle-group">
      <button className={`view-toggle-btn ${preRegisteredViewMode === 'card'  ? 'active' : ''}`} onClick={() => setPreRegisteredViewMode('card')}><LayoutGrid size={16} /><span>Cards</span></button>
      <button className={`view-toggle-btn ${preRegisteredViewMode === 'table' ? 'active' : ''}`} onClick={() => setPreRegisteredViewMode('table')}><Table2 size={16} /><span>Table</span></button>
    </div>
  );

  // ── Family Count Cell ────────────────────────────────────────────
  const FamilyCountCell = ({ resident }) => (
    <td onClick={e => e.stopPropagation()}>
      {resident.familyMembers?.length > 0 ? (
        <button className="family-count-btn" onClick={() => setViewingFamilyMembers(resident)}>
          <Users size={13} /> {resident.familyMembers.length} member{resident.familyMembers.length !== 1 ? 's' : ''}
        </button>
      ) : (
        <span className="table-empty">—</span>
      )}
    </td>
  );

  // ── Tables ───────────────────────────────────────────────────────
  const renderApprovedResidentsTable = (residents) => (
    <ScrollableTableWrapper>
      <table className="residents-table">
        <thead>
          <tr><th>Family Name</th><th>Username</th><th>Resident Type</th><th>Status</th><th>Address</th><th>Family Members</th><th>Joined</th><th>ID</th></tr>
        </thead>
        <tbody>
          {residents.map((resident) => {
            const accountMeta = getResidentAccountMeta(resident);

            return (
              <tr key={resident._id} onClick={() => setViewingResident(resident)} className="table-row-clickable">
                <td><div className="table-name-cell"><div className="table-avatar">{resident.familyName?.[0]}</div><span className="table-family-name">{resident.familyName}</span></div></td>
                <td><span className="table-username">@{resident.username}</span></td>
                <td className="table-email">{getResidentOccupancyLabel(resident)}</td>
                <td className="table-status-cell">
                  <span className={accountMeta.className}>{accountMeta.label}</span>
                  {resident.renewalStatus === 'pending' && (
                    <span className="resident-inline-note">Renewal queued</span>
                  )}
                </td>
                <td className="table-address">{formatResidentAddress(resident)}</td>
              <FamilyCountCell resident={resident} />
                <td>{formatResidentDate(resident.createdAt, 'Unknown')}</td>
                <td onClick={e => e.stopPropagation()}>
                  <button onClick={() => setViewingDocument(resident)} className="btn-view-document btn-view-document-sm"><Eye size={14} /> View</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </ScrollableTableWrapper>
  );

  const renderPendingResidentsTable = (residents) => (
    <ScrollableTableWrapper>
      <table className="residents-table">
        <thead>
          <tr><th>Family Name</th><th>Username</th><th>Resident Type</th><th>Address</th><th>Phone</th><th>Family Members</th><th>Applied</th><th>ID</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {residents.map(resident => (
            <tr key={resident._id} onClick={() => setViewingResident(resident)} className="table-row-clickable">
              <td><div className="table-name-cell"><div className="table-avatar">{resident.familyName?.[0]}</div><span className="table-family-name">{resident.familyName}</span></div></td>
              <td><span className="table-username">@{resident.username}</span></td>
              <td className="table-email">{getResidentOccupancyLabel(resident)}</td>
              <td className="table-address">{formatResidentAddress(resident)}</td>
              <td>{resident.phoneNumber}</td>
              <FamilyCountCell resident={resident} />
              <td>{formatResidentDate(resident.createdAt, 'Unknown')}</td>
              <td onClick={e => e.stopPropagation()}>
                <button onClick={() => setViewingDocument(resident)} className="btn-view-document btn-view-document-sm"><Eye size={14} /> View</button>
              </td>
              <td onClick={e => e.stopPropagation()}>
                <div className="table-actions">
                  <button onClick={() => approveResident(resident._id)} className="btn-approve btn-approve-sm"><CheckCircle size={14} /> Approve</button>
                  <button onClick={() => rejectResident(resident._id)}  className="btn-reject btn-reject-sm"><XCircle size={14} /> Reject</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollableTableWrapper>
  );

  const renderVehiclesTable = (vehicles) => (
    <ScrollableTableWrapper>
      <table className="residents-table">
        <thead>
          <tr><th>Plate Number</th><th>Brand & Model</th><th>Type</th><th>Color</th><th>Owner</th><th>Address</th><th>Phone</th><th>Photo</th><th>Registered</th></tr>
        </thead>
        <tbody>
          {vehicles.map((vehicle, idx) => (
            <tr key={`${vehicle.ownerId}-${vehicle._id || idx}`}>
              <td><span className="table-family-name">{vehicle.plateNumber}</span></td>
              <td>{vehicle.brand} {vehicle.model}</td>
              <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', padding: '0.25rem 0.625rem', background: 'var(--primary-green-50)', color: 'var(--primary-green-dark)', borderRadius: 'var(--radius-full)', fontSize: '0.75rem', fontWeight: 700 }}>{vehicle.vehicleType}</span></td>
              <td>{vehicle.color}</td>
              <td><span className="table-family-name">{vehicle.ownerName}</span></td>
              <td className="table-address">{vehicle.ownerAddress}</td>
              <td>{vehicle.ownerPhone}</td>
              <td onClick={(event) => event.stopPropagation()}>
                {vehicle.photo?.path ? (
                  <button onClick={() => setViewingVehicle(vehicle)} className="btn-view-document btn-view-document-sm"><Eye size={14} /> View</button>
                ) : (
                  <span className="table-empty">-</span>
                )}
              </td>
              <td>{new Date(vehicle.registeredDate).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollableTableWrapper>
  );

  const renderVisitorLogsTable = (visitors) => (
    <ScrollableTableWrapper>
      <table className="residents-table">
        <thead>
          <tr><th>Name</th><th>Type</th><th>Host</th><th>Address</th><th>Vehicle</th><th>Contact</th><th>Entry</th><th>Exit</th><th>Status</th></tr>
        </thead>
        <tbody>
          {visitors.map((item, idx) => (
            <tr key={`${item.type}-${item._id || idx}`}>
              <td><span className="table-family-name">{item.name}</span></td>
              <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.375rem', padding: '0.25rem 0.625rem', background: item.type === 'visitor' ? 'var(--primary-green-50)' : '#cffafe', color: item.type === 'visitor' ? 'var(--primary-green-dark)' : '#0e7490', borderRadius: 'var(--radius-full)', fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase' }}>{item.type === 'visitor' ? <><UserCheck size={11} /> Visitor</> : <><Package size={11} /> Delivery</>}</span></td>
              <td><span className="table-family-name">{item.hostResidentName}</span></td>
              <td className="table-address">{item.hostResidentAddress}</td>
              <td>{item.vehiclePlateNumber ? `${item.vehiclePlateNumber} (${item.vehicleType})` : <span className="table-empty">—</span>}</td>
              <td>{item.contactNumber || <span className="table-empty">—</span>}</td>
              <td style={{ fontSize: '0.8125rem' }}>{new Date(item.entryTime).toLocaleString()}</td>
              <td style={{ fontSize: '0.8125rem' }}>{item.exitTime ? new Date(item.exitTime).toLocaleString() : <span className="table-empty">—</span>}</td>
              <td><span className={`status-badge ${item.status === 'inside' ? 'status-inside' : 'status-exited'}`}>{item.status === 'inside' ? 'Inside' : 'Exited'}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollableTableWrapper>
  );

  // ── Overview Sub-components ──────────────────────────────────────
  const RecentActivity = () => (
    <div className="dashboard-card admin-overview-recent-card">
      <div className="card-header"><h3>Recent Activity</h3></div>
      <div className="activity-list">
        {recentActivity.length === 0
          ? <div className="empty-state-small"><p>No recent activity</p></div>
          : recentActivity.map((activity, idx) => (
              <div key={idx} className="activity-item">
                <div className={`activity-dot ${activity.color}`}><div className="activity-dot-inner" style={{ backgroundColor: activity.dotColor }} /></div>
                <div className="activity-content"><p className="activity-text">{activity.text}</p><p className="activity-time">{activity.time}</p></div>
              </div>
            ))}
      </div>
    </div>
  );

  const AnnouncementPreview = () => {
    const [featuredAnnouncement, ...otherAnnouncements] = dashboardAnnouncements;
    const categoryClass = featuredAnnouncement?.category || 'general';
    const formatAnnouncementDate = (value) => {
      const date = new Date(value);
      return Number.isNaN(date.getTime())
        ? 'Recently posted'
        : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    };

    return (
      <div className="dashboard-card admin-announcement-card">
        <div className="admin-announcement-head">
          <div>
            <span className="admin-overview-kicker">Announcement</span>
            <h3>Community Notice Board</h3>
          </div>
          {canAccessModule('announcements') && (
            <button type="button" className="admin-overview-link-btn" onClick={() => setActiveModule('announcements')}>
              Manage
              <ChevronRight size={15} />
            </button>
          )}
        </div>

        {featuredAnnouncement ? (
          <div className="admin-announcement-feature">
            <div className={`admin-announcement-category ${categoryClass}`}>
              <Bell size={15} />
              <span>{featuredAnnouncement.category || 'general'}</span>
            </div>
            <h4>{featuredAnnouncement.title}</h4>
            <p>{featuredAnnouncement.content}</p>
            <div className="admin-announcement-meta">
              <span>{featuredAnnouncement.postedBy || 'Admin'}</span>
              <span>{formatAnnouncementDate(featuredAnnouncement.createdAt)}</span>
              <span>{featuredAnnouncement.targetAudience === 'all' ? 'All users' : featuredAnnouncement.targetAudience}</span>
            </div>
          </div>
        ) : (
          <div className="admin-announcement-empty">
            <Bell size={28} />
            <h4>No active announcements</h4>
            <p>Published announcements will appear here for quick review.</p>
          </div>
        )}

        {otherAnnouncements.length > 0 && (
          <div className="admin-announcement-list">
            {otherAnnouncements.map((announcement) => (
              <button
                key={announcement._id}
                type="button"
                className="admin-announcement-list-item"
                onClick={() => canAccessModule('announcements') && setActiveModule('announcements')}
              >
                <span>{announcement.title}</span>
                <strong>{formatAnnouncementDate(announcement.createdAt)}</strong>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const QuickActions = () => {
    const quickActions = [
      { id: 'residents', icon: Users, label: 'View Residents', cardClass: 'bg-blue-50', iconClass: 'text-blue-600' },
      { id: 'vehicles', icon: Car, label: 'View Vehicles', cardClass: 'bg-green-50', iconClass: 'text-green-600' },
      { id: 'announcements', icon: Bell, label: 'Post Announcement', cardClass: 'bg-red-50', iconClass: 'text-red-600' },
      { id: 'ai_chatbot', icon: Bot, label: 'Open AI Chatbot', cardClass: 'bg-cyan-50', iconClass: 'text-cyan-600' },
      { id: 'reports', icon: FileText, label: 'Generate Report', cardClass: 'bg-purple-50', iconClass: 'text-purple-600' },
      { id: 'manage_accounts', icon: Shield, label: 'Manage Accounts', cardClass: 'bg-green-50', iconClass: 'text-green-600' }
    ].filter((action) => menuItems.some((item) => item.id === action.id));

    return (
      <div className="dashboard-card">
        <div className="card-header"><h3>Quick Actions</h3></div>
        <div className="quick-actions-grid">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button key={action.id} onClick={() => setActiveModule(action.id)} className={`quick-action-btn ${action.cardClass}`}>
                <Icon className={action.iconClass} size={20} />
                <p>{action.label}</p>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const Alerts = () => (
    <div className="dashboard-card">
      <div className="card-header"><h3>Alerts &amp; Notifications</h3></div>
      <div className="alert-list">
        {canAccessModule('residents') && stats.pendingApprovals > 0 && (
          <div className="alert-item bg-yellow-50">
            <AlertCircle className="text-yellow-600" size={18} />
            <div className="alert-content"><p className="alert-title">{stats.pendingApprovals} pending approval{stats.pendingApprovals > 1 ? 's' : ''}</p><p className="alert-description">New resident registrations waiting for approval</p></div>
          </div>
        )}
        <div className="alert-item bg-blue-50">
          <AlertCircle className="text-blue-600" size={18} />
          <div className="alert-content"><p className="alert-title">System running smoothly</p><p className="alert-description">All modules operational</p></div>
        </div>
      </div>
    </div>
  );

  // ── Module Content ───────────────────────────────────────────────
  const OverviewContent = () => {
    const overviewCards = [
      canAccessModule('residents') && { title: 'Total Residents', value: stats.totalResidents, icon: Users, borderColor: '#3b82f6', iconBg: 'bg-blue-50', iconColor: 'text-blue-600' },
      canAccessModule('residents') && { title: 'Registered Vehicles', value: stats.totalVehicles, icon: Car, borderColor: '#8b5cf6', iconBg: 'bg-purple-50', iconColor: 'text-purple-600' },
      canAccessModule('visitors') && { title: "Today's Visitors", value: stats.todayVisitors, icon: UserCheck, borderColor: '#f97316', iconBg: 'bg-orange-50', iconColor: 'text-orange-600' },
      canAccessModule('residents') && { title: 'Pending Approvals', value: stats.pendingApprovals, icon: AlertCircle, borderColor: '#f59e0b', iconBg: 'bg-yellow-50', iconColor: 'text-yellow-600' },
      canAccessModule('facilities') && { title: 'Active Reservations', value: stats.activeReservations, icon: Calendar, borderColor: '#06b6d4', iconBg: 'bg-cyan-50', iconColor: 'text-cyan-600' },
      { title: 'System Status', value: 'Running', icon: Bell, borderColor: '#10b981', iconBg: 'bg-green-50', iconColor: 'text-green-600' }
    ].filter(Boolean);

    return (
      <div>
        <div className="page-header">
          <div className="page-title"><h2>Dashboard Overview</h2><p>Welcome back, {user.username}! Here's what's happening in Ecotrend.</p></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.875rem 1.5rem', background: 'linear-gradient(135deg, var(--primary-green-50) 0%, var(--primary-green-100) 100%)', borderRadius: 'var(--radius-lg)', color: 'var(--primary-green-dark)', fontWeight: 700, fontSize: '0.9375rem', boxShadow: 'var(--shadow-md)' }}>
            <Clock size={18} />
            <span>{currentTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
            <span style={{ opacity: 0.4 }}>|</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '0.02em' }}>
              {currentTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          </div>
        </div>
        <div className="stats-grid admin-overview-stats">
          {overviewCards.map((card) => (
            <StatCard key={card.title} {...card} />
          ))}
        </div>

        <div className="admin-overview-board">
          <AnnouncementPreview />
          <RecentActivity />
        </div>

        <div className="admin-overview-support-grid">
          <QuickActions />
          <Alerts />
        </div>
      </div>
    );
  };

  const ResidentManagementContent = () => {
    const residentSearchActive = Boolean(residentSearchQuery.trim());
    const renewalPendingCount = allResidents.filter((resident) => resident.renewalStatus === 'pending').length;
    const expiringSoonCount = allResidents.filter((resident) => resident.accountStatus === 'expiring_soon').length;
    const expiredCount = allResidents.filter((resident) => resident.accountStatus === 'expired').length;
    const pendingRentersCount = pendingResidents.filter((resident) => resident.occupancyType === 'renter').length;

    return (
      <div>
        <div className="page-header">
          <div className="page-title">
            <h2>Resident Management</h2>
            <p>{showAllResidents ? 'All registered residents' : 'Review and approve new resident registrations'}</p>
          </div>
          <div className="page-header-actions">
            <ViewToggle />
            <button className="action-btn" onClick={() => setShowAllResidents(!showAllResidents)}>
              <Users size={18} />{showAllResidents ? 'View Pending Approvals' : 'View All Residents'}
            </button>
          </div>
        </div>

        <div className="resident-toolbar">
          <div className="search-input-group" style={{ marginBottom: 0 }}>
            <Search size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input
              type="text"
              value={residentSearchQuery}
              onChange={(event) => {
                setPendingResidentsPage(1);
                setApprovedResidentsPage(1);
                setResidentSearchQuery(event.target.value);
              }}
              placeholder="Search by name, username, email, address, or phone..."
              className="search-input"
              style={{ paddingLeft: '3rem' }}
            />
          </div>
          <div className="resident-sort-group">
            <label htmlFor="resident-sort-select">Sort By</label>
            <select
              id="resident-sort-select"
              value={residentSortOption}
              onChange={(event) => {
                setPendingResidentsPage(1);
                setApprovedResidentsPage(1);
                setResidentSortOption(event.target.value);
              }}
              className="resident-sort-select"
            >
              {RESIDENT_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {showAllResidents ? (
          residentLoading
            ? <div className="loading-container"><div className="spinner"></div><p className="loading-text">Loading residents...</p></div>
            : allResidents.length === 0
              ? <div className="empty-state"><div className="empty-icon"><Users size={40} style={{ color: '#9ca3af' }} /></div><h3>{residentSearchActive ? 'No Residents Found' : 'No Residents Yet'}</h3><p>{residentSearchActive ? 'No approved residents match the current search.' : 'There are no approved residents at the moment.'}</p></div>
              : <>
                  <div className="residents-count-bar">
                    <div><h3>{residentSearchActive ? 'Approved Resident Search Results' : 'Total Approved Residents'}</h3><p>{residentSearchActive ? 'Search now checks the entire resident dataset before pagination is applied.' : 'Monitor resident status, renter expiries, and renewal requests.'}</p></div>
                    <div className="residents-count-bar-right">
                      <div className="residents-count-meta">
                        <span className="resident-summary-chip">Page results {allResidents.length}</span>
                        {renewalPendingCount > 0 && <span className="resident-summary-chip attention">{renewalPendingCount} renewal pending</span>}
                        {expiringSoonCount > 0 && <span className="resident-summary-chip warning">{expiringSoonCount} expiring soon</span>}
                        {expiredCount > 0 && <span className="resident-summary-chip danger">{expiredCount} expired</span>}
                      </div>
                      <div className="residents-count-number">{approvedResidentsPagination?.total ?? allResidents.length}</div>
                    </div>
                  </div>
                  {residentViewMode === 'card'
                    ? <div className="residents-grid">{allResidents.map(r => {
                        const accountMeta = getResidentAccountMeta(r);

                        return (
                          <div key={r._id} className="resident-card resident-card-clickable" onClick={() => setViewingResident(r)}>
                            <div className="resident-card-status-row">
                              <span className={accountMeta.className}>{accountMeta.label}</span>
                              {r.renewalStatus === 'pending' && <span className="resident-inline-note">Renewal queued</span>}
                            </div>
                            <div className="card-summary-static">
                              <div className="resident-avatar-circle">{r.familyName?.[0] || 'R'}</div>
                              <div><h3 className="card-summary-name">{r.familyName}</h3><p className="resident-username">@{r.username}</p></div>
                            </div>
                            <div className="card-preview-details">
                              <div className="card-preview-row"><User size={13} /><span>{getResidentOccupancyLabel(r)}</span></div>
                              <div className="card-preview-row"><MapPin size={13} /><span>{formatResidentAddress(r)}</span></div>
                              <div className="card-preview-row"><Clock size={13} /><span>Joined {formatResidentDate(r.createdAt, 'Unknown')}</span></div>
                              {r.occupancyType === 'renter' && <div className="card-preview-row"><Calendar size={13} /><span>Expiry {formatResidentExpiry(r)}</span></div>}
                              {r.familyMembers?.length > 0 && <div className="card-preview-row"><Users size={13} /><span>{r.familyMembers.length} family member{r.familyMembers.length > 1 ? 's' : ''}</span></div>}
                            </div>
                            <div className="card-click-hint">Click to view full details</div>
                          </div>
                        );
                      })}</div>
                    : renderApprovedResidentsTable(allResidents)}
                  <PaginationControls pagination={approvedResidentsPagination} onPageChange={setApprovedResidentsPage} />
                </>
        ) : (
          residentLoading
            ? <div className="loading-container"><div className="spinner"></div><p className="loading-text">Loading pending approvals...</p></div>
            : pendingResidents.length === 0
              ? <div className="empty-state"><div className="empty-icon"><CheckCircle size={40} style={{ color: '#9ca3af' }} /></div><h3>{residentSearchActive ? 'No Pending Matches' : 'All Caught Up!'}</h3><p>{residentSearchActive ? 'No pending residents match the current search.' : 'No pending resident approvals at the moment.'}</p></div>
              : <>
                  <div className="residents-count-bar">
                    <div><h3>{residentSearchActive ? 'Pending Resident Search Results' : 'Pending Resident Approvals'}</h3><p>{residentSearchActive ? 'Search now checks every pending applicant before paginating the results.' : 'Review new household registrations before they can access the portal.'}</p></div>
                    <div className="residents-count-bar-right">
                      <div className="residents-count-meta">
                        <span className="resident-summary-chip">Page results {pendingResidents.length}</span>
                        {pendingRentersCount > 0 && <span className="resident-summary-chip warning">{pendingRentersCount} renter applicants</span>}
                      </div>
                      <div className="residents-count-number">{pendingResidentsPagination?.total ?? pendingResidents.length}</div>
                    </div>
                  </div>
                  {residentViewMode === 'card'
                    ? <div className="residents-grid">{pendingResidents.map(r => (
                        <div key={r._id} className="resident-card resident-card-clickable resident-card-pending" onClick={() => setViewingResident(r)}>
                          <div className="pending-badge-top">Pending Approval</div>
                          <div className="card-summary-static">
                            <div className="resident-avatar-circle resident-avatar-pending">{r.familyName?.[0] || 'R'}</div>
                            <div><h3 className="card-summary-name">{r.familyName}</h3><p className="resident-username">@{r.username}</p></div>
                          </div>
                          <div className="card-preview-details">
                            <div className="card-preview-row"><User size={13} /><span>{getResidentOccupancyLabel(r)}</span></div>
                            <div className="card-preview-row"><MapPin size={13} /><span>{formatResidentAddress(r)}</span></div>
                            <div className="card-preview-row"><Clock size={13} /><span>Applied {formatResidentDate(r.createdAt, 'Unknown')}</span></div>
                            {r.occupancyType === 'renter' && <div className="card-preview-row"><Calendar size={13} /><span>Requested until {formatResidentExpiry(r)}</span></div>}
                          </div>
                          <div className="card-click-hint">Click to review &amp; approve</div>
                        </div>
                      ))}</div>
                    : renderPendingResidentsTable(pendingResidents)}
                  <PaginationControls pagination={pendingResidentsPagination} onPageChange={setPendingResidentsPage} />
                </>
        )}

        {/* Modals — now stable references since they're defined outside */}
        {viewingResident && (
          <ResidentDetailModal
            resident={viewingResident}
            onClose={() => setViewingResident(null)}
            isPending={!viewingResident.isApproved}
            onApprove={approveResident}
            onReject={rejectResident}
            onApproveRenewal={approveResidentRenewal}
            onRejectRenewal={rejectResidentRenewal}
            onViewDocument={setViewingDocument}
            onUpdateResident={updateResidentAccount}
            onDeleteResident={deleteResidentAccount}
            isUpdatingResident={residentMutation.id === viewingResident._id && residentMutation.action === 'update'}
            isDeletingResident={residentMutation.id === viewingResident._id && residentMutation.action === 'delete'}
          />
        )}
        {viewingDocument && (
          <DocumentViewer resident={viewingDocument} token={token} onClose={() => setViewingDocument(null)} />
        )}
        {viewingFamilyMembers && (
          <FamilyMembersModal resident={viewingFamilyMembers} onClose={() => setViewingFamilyMembers(null)} />
        )}
        {viewingVehicle && (
          <VehiclePhotoModal vehicle={viewingVehicle} onClose={() => setViewingVehicle(null)} />
        )}
      </div>
    );
  };

  const VehicleManagementContent = () => {
    const filteredVehicles = allVehicles.filter(v =>
      v.plateNumber.toLowerCase().includes(vehicleSearchQuery.toLowerCase()) ||
      v.ownerName.toLowerCase().includes(vehicleSearchQuery.toLowerCase())   ||
      v.brand.toLowerCase().includes(vehicleSearchQuery.toLowerCase())        ||
      v.model.toLowerCase().includes(vehicleSearchQuery.toLowerCase())
    );
    return (
      <div>
        <div className="page-header">
          <div className="page-title"><h2>Vehicle Management</h2><p>View and manage all registered vehicles</p></div>
          <div className="page-header-actions"><VehicleViewToggle /></div>
        </div>
        <div className="search-section">
          <div className="search-input-group" style={{ marginBottom: '1.5rem' }}>
            <Search size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input type="text" value={vehicleSearchQuery} onChange={e => setVehicleSearchQuery(e.target.value)} placeholder="Search by plate number, owner, brand, or model..." className="search-input" style={{ paddingLeft: '3rem' }} />
          </div>
          <div className="residents-count-bar">
            <div><h3>Total Registered Vehicles</h3><p>{filteredVehicles.length} of {allVehicles.length} vehicles</p></div>
            <div className="residents-count-number" style={{ color: '#8b5cf6' }}>{filteredVehicles.length}</div>
          </div>
          {loading
            ? <div className="loading-container"><div className="spinner"></div><p className="loading-text">Loading vehicles...</p></div>
            : filteredVehicles.length === 0
              ? <div className="empty-state"><div className="empty-icon"><Car size={40} style={{ color: '#9ca3af' }} /></div><h3>No Vehicles Found</h3><p>{vehicleSearchQuery ? 'Try a different search term' : 'No vehicles registered yet'}</p></div>
              : <>
                  {vehicleViewMode === 'card'
                    ? <div className="vehicles-grid">{filteredVehicles.map((vehicle, idx) => (
                        <div key={`${vehicle.ownerId}-${vehicle._id||idx}`} className="vehicle-card">
                          <div className="vehicle-header">
                            <div><h3>{vehicle.plateNumber}</h3><p className="vehicle-model">{vehicle.brand} {vehicle.model}</p></div>
                            <div className="vehicle-type-badge"><Car size={16} />{vehicle.vehicleType}</div>
                          </div>
                          <div className="vehicle-details">
                            <div className="vehicle-detail"><span className="detail-label">Color:</span><span className="detail-value">{vehicle.color}</span></div>
                            <div className="vehicle-detail"><span className="detail-label">Owner:</span><span className="detail-value">{vehicle.ownerName}</span></div>
                            <div className="vehicle-detail"><span className="detail-label">Address:</span><span className="detail-value">{vehicle.ownerAddress}</span></div>
                            <div className="vehicle-detail"><span className="detail-label">Phone:</span><span className="detail-value">{vehicle.ownerPhone}</span></div>
                            <div className="vehicle-detail"><span className="detail-label">Registered:</span><span className="detail-value">{new Date(vehicle.registeredDate).toLocaleDateString()}</span></div>
                          </div>
                          {vehicle.photo?.path && (
                            <button className="btn-view-document" onClick={() => setViewingVehicle(vehicle)}>
                              <Eye size={16} /> View Uploaded Photo
                            </button>
                          )}
                        </div>
                      ))}</div>
                    : renderVehiclesTable(filteredVehicles)}
                  <PaginationControls pagination={vehiclesPagination} onPageChange={setVehiclesPage} />
                </>
          }
        </div>
      </div>
    );
  };

  const VisitorLogsContent = () => {
    const combinedVisitors = [
      ...allVisitors.map(v  => ({ ...v, type: 'visitor' })),
      ...allDeliveries.map(d => ({ ...d, type: 'delivery', name: d.driverName }))
    ].sort((a, b) => new Date(b.entryTime) - new Date(a.entryTime));
    const q = visitorSearchQuery.toLowerCase();
    const filteredVisitors = combinedVisitors.filter(item =>
      (item.name||'').toLowerCase().includes(q) ||
      (item.hostResidentName||'').toLowerCase().includes(q) ||
      (item.vehiclePlateNumber||'').toLowerCase().includes(q)
    );
    const visitorLogsPagination = {
      page: visitorLogsPage,
      limit: PAGE_SIZE,
      total: filteredVisitors.length,
      totalPages: filteredVisitors.length > 0 ? Math.ceil(filteredVisitors.length / PAGE_SIZE) : 1,
      hasNextPage: visitorLogsPage * PAGE_SIZE < filteredVisitors.length,
      hasPrevPage: visitorLogsPage > 1
    };
    const visibleVisitors = filteredVisitors.slice(
      (visitorLogsPage - 1) * PAGE_SIZE,
      visitorLogsPage * PAGE_SIZE
    );
    return (
      <div>
        <div className="page-header">
          <div className="page-title"><h2>Visitor &amp; Delivery Logs</h2><p>View all visitor and delivery records</p></div>
          <div className="page-header-actions"><VisitorViewToggle /></div>
        </div>
        <div className="search-section">
          <div className="search-input-group" style={{ marginBottom: '1.5rem' }}>
            <Search size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input type="text" value={visitorSearchQuery} onChange={e => setVisitorSearchQuery(e.target.value)} placeholder="Search by name, host, or plate number..." className="search-input" style={{ paddingLeft: '3rem' }} />
          </div>
          <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: 'white', borderRadius: '0.5rem', boxShadow: '0 1px 3px 0 rgba(0,0,0,0.1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around', gap: '2rem' }}>
              <div style={{ textAlign: 'center' }}><h3 style={{ margin: 0, fontSize: '2rem', fontWeight: '700', color: '#8b5cf6' }}>{allVisitors.length}</h3><p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>Total Visitors</p></div>
              <div style={{ textAlign: 'center' }}><h3 style={{ margin: 0, fontSize: '2rem', fontWeight: '700', color: '#06b6d4' }}>{allDeliveries.length}</h3><p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>Total Deliveries</p></div>
              <div style={{ textAlign: 'center' }}><h3 style={{ margin: 0, fontSize: '2rem', fontWeight: '700', color: '#f97316' }}>{stats.todayVisitors}</h3><p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>Today's Visitors</p></div>
            </div>
          </div>
          {loading
            ? <div className="loading-container"><div className="spinner"></div><p className="loading-text">Loading visitor logs...</p></div>
            : filteredVisitors.length === 0
              ? <div className="empty-state"><div className="empty-icon"><UserCheck size={40} style={{ color: '#9ca3af' }} /></div><h3>No Visitor Records</h3><p>{visitorSearchQuery ? 'Try a different search term' : 'No visitors logged yet'}</p></div>
              : visitorViewMode === 'card'
                ? <>
                    <div className="visitor-logs-grid">{visibleVisitors.map((item, idx) => (
                    <div key={`${item.type}-${item._id||idx}`} className="visitor-log-card">
                      <div className="visitor-log-header">
                        <div><h3>{item.name}</h3><p className="visitor-log-type">{item.type === 'visitor' ? <><UserCheck size={14} /> Visitor</> : <><Package size={14} /> Delivery</>}</p></div>
                        <span className={`status-badge ${item.status === 'inside' ? 'status-inside' : 'status-exited'}`}>{item.status === 'inside' ? 'Inside' : 'Exited'}</span>
                      </div>
                      <div className="visitor-log-details">
                        <div className="visitor-log-detail"><User size={14} /><span>Host: {item.hostResidentName}</span></div>
                        <div className="visitor-log-detail"><MapPin size={14} /><span>{item.hostResidentAddress}</span></div>
                        {item.vehiclePlateNumber && <div className="visitor-log-detail"><Car size={14} /><span>{item.vehiclePlateNumber} ({item.vehicleType})</span></div>}
                        {item.contactNumber      && <div className="visitor-log-detail"><Phone size={14} /><span>{item.contactNumber}</span></div>}
                        <div className="visitor-log-detail"><Clock size={14} /><span>Entry: {new Date(item.entryTime).toLocaleString()}</span></div>
                        {item.exitTime && <div className="visitor-log-detail"><Clock size={14} /><span>Exit: {new Date(item.exitTime).toLocaleString()}</span></div>}
                      </div>
                    </div>
                  ))}</div>
                    <PaginationControls pagination={visitorLogsPagination} onPageChange={setVisitorLogsPage} />
                  </>
                : <>
                    {renderVisitorLogsTable(visibleVisitors)}
                    <PaginationControls pagination={visitorLogsPagination} onPageChange={setVisitorLogsPage} />
                  </>
          }
        </div>
      </div>
    );
  };

  const PreRegisteredVisitorsContent = () => {
    const q = preRegisteredSearchQuery.toLowerCase();
    const filteredPreRegistered = preRegisteredVisitors.filter((item) =>
      (item.name || '').toLowerCase().includes(q) ||
      (item.hostResidentName || '').toLowerCase().includes(q) ||
      (item.vehiclePlateNumber || '').toLowerCase().includes(q)
    );
    const pendingCount = filteredPreRegistered.filter((item) => item.reviewStatus === 'pending').length;

    return (
      <div>
        <div className="page-header">
          <div className="page-title">
            <h2>Pre-Registered Visitors</h2>
            <p>Review visitor identification and enable QR entry before guards process arrivals.</p>
          </div>
        </div>
        <div className="search-section">
          <div className="search-input-group" style={{ marginBottom: '1.5rem' }}>
            <Search size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
            <input
              type="text"
              value={preRegisteredSearchQuery}
              onChange={(event) => setPreRegisteredSearchQuery(event.target.value)}
              placeholder="Search by name, host, or plate number..."
              className="search-input"
              style={{ paddingLeft: '3rem' }}
            />
          </div>
          <div className="residents-count-bar">
            <div>
              <h3>Review Queue</h3>
              <p>{pendingCount} pending approval, {filteredPreRegistered.length - pendingCount} already reviewed.</p>
            </div>
            <div className="residents-count-bar-right">
              <PreRegisteredViewToggle />
              <div className="residents-count-number">{filteredPreRegistered.length}</div>
            </div>
          </div>
          {loading ? (
            <div className="loading-container"><div className="spinner"></div><p className="loading-text">Loading pre-registered visitors...</p></div>
          ) : filteredPreRegistered.length === 0 ? (
            <div className="empty-state"><div className="empty-icon"><QrCode size={40} style={{ color: '#9ca3af' }} /></div><h3>No Pre-Registered Visitors</h3><p>{preRegisteredSearchQuery ? 'Try a different search term' : 'No visitors are waiting for review right now'}</p></div>
          ) : preRegisteredViewMode === 'table' ? (
            <div className="module-table-card">
              <div className="module-table-wrap">
                <table className="module-table">
                  <thead>
                    <tr>
                      <th>Visitor</th>
                      <th>Host / Purpose</th>
                      <th>Schedule</th>
                      <th>Status</th>
                      <th>QR Details</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPreRegistered.map((visitor) => (
                      <tr key={visitor._id}>
                        <td>
                          <span className="module-table__primary">{visitor.name}</span>
                          <span className="module-table__secondary">
                            {visitor.relationshipToResident || 'Relationship not set'} · Party size: {getVisitorPartySize(visitor)}
                          </span>
                        </td>
                        <td>
                          <span className="module-table__primary">{visitor.hostResidentName}</span>
                          <span className="module-table__secondary">{visitor.purpose}</span>
                        </td>
                        <td>
                          <span className="module-table__primary">{visitor.expectedDate ? new Date(visitor.expectedDate).toLocaleString() : 'Any time'}</span>
                          <span className="module-table__secondary">
                            {visitor.vehiclePlateNumber ? `${visitor.vehiclePlateNumber} (${visitor.vehicleType || 'N/A'})` : 'No vehicle registered'}
                          </span>
                        </td>
                        <td>
                          <span className={`module-table__pill ${visitor.reviewStatus === 'pending' ? 'pending' : isQrManagedVisitor(visitor) ? 'info' : visitor.status === 'inside' ? 'success' : 'approved'}`}>
                            {visitor.reviewStatus === 'pending' ? 'Pending' : isQrManagedVisitor(visitor) ? 'QR Approved' : visitor.status === 'inside' ? 'Inside' : 'Approved'}
                          </span>
                          {visitor.reviewStatus === 'approved' && (
                            <span className="module-table__secondary">
                              Reviewed by {visitor.reviewedByName || 'Admin'}
                            </span>
                          )}
                        </td>
                        <td>
                          {isQrManagedVisitor(visitor) && (visitor.qrManualCode || visitor.qrToken) ? (
                            <>
                              <span className="module-table__code">{formatVisitorAccessCode(visitor.qrManualCode || visitor.qrToken)}</span>
                              <span className="module-table__secondary">Short code for QR fallback</span>
                            </>
                          ) : (
                            <span className="module-table__empty">No QR approval yet</span>
                          )}
                        </td>
                        <td>
                          <div className="module-table__actions">
                            {visitor.identificationDocument?.path && (
                              <button type="button" onClick={() => openVisitorIdentification(visitor)} className="module-table__action-btn secondary">
                                <Eye size={14} /> View ID
                              </button>
                            )}
                            {visitor.reviewStatus === 'pending' && (
                              <>
                                <button type="button" onClick={() => reviewPreRegisteredVisitor(visitor, 'approved', false)} className="module-table__action-btn success">
                                  <CheckCircle size={14} /> Approve
                                </button>
                                <button type="button" onClick={() => reviewPreRegisteredVisitor(visitor, 'approved', true)} className="module-table__action-btn info">
                                  <QrCode size={14} /> Approve QR
                                </button>
                                <button type="button" onClick={() => reviewPreRegisteredVisitor(visitor, 'rejected', false)} className="module-table__action-btn danger">
                                  <XCircle size={14} /> Reject
                                </button>
                              </>
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
            <div className="visitor-logs-grid">
              {filteredPreRegistered.map((visitor) => (
                <div key={visitor._id} className="visitor-log-card">
                  <div className="visitor-log-header">
                    <div>
                      <h3>{visitor.name}</h3>
                      <p className="visitor-log-type"><Calendar size={14} /> {visitor.reviewStatus === 'pending' ? 'Pending Review' : 'Review Complete'}</p>
                    </div>
                    <span className={`status-badge ${visitor.reviewStatus === 'approved' ? 'status-inside' : ''}`} style={visitor.reviewStatus === 'pending' ? { background: '#fef3c7', color: '#b45309' } : undefined}>
                      {isQrManagedVisitor(visitor) ? 'QR Approved' : visitor.reviewStatus === 'pending' ? 'Pending' : visitor.status === 'inside' ? 'Inside Subdivision' : 'Approved'}
                    </span>
                  </div>
                  <div className="visitor-log-details">
                    <div className="visitor-log-detail"><User size={14} /><span>Host: {visitor.hostResidentName}</span></div>
                    <div className="visitor-log-detail"><Users size={14} /><span>Relationship: {visitor.relationshipToResident || 'Not set'}</span></div>
                    <div className="visitor-log-detail"><FileText size={14} /><span>Purpose: {visitor.purpose}</span></div>
                    <div className="visitor-log-detail"><Clock size={14} /><span>Expected: {visitor.expectedDate ? new Date(visitor.expectedDate).toLocaleString() : 'Any time'}</span></div>
                    <div className="visitor-log-detail"><QrCode size={14} /><span>Party Size: {getVisitorPartySize(visitor)} person{getVisitorPartySize(visitor) > 1 ? 's' : ''}</span></div>
                    {visitor.vehiclePlateNumber && <div className="visitor-log-detail"><Car size={14} /><span>{visitor.vehiclePlateNumber} ({visitor.vehicleType || 'N/A'})</span></div>}
                  </div>
                  {Array.isArray(visitor.accompanyingVisitors) && visitor.accompanyingVisitors.length > 0 && (
                    <div className="pre-reg-companion-review">
                      <div className="pre-reg-companion-title">Companions</div>
                      {visitor.accompanyingVisitors.map((companion, index) => (
                        <div key={index} className="pre-reg-companion-item">
                          <strong>{companion.firstName} {companion.lastName}</strong>
                          <span>{companion.relationshipToResident}</span>
                          <span>ID: {companion.identification}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {isQrManagedVisitor(visitor) && (visitor.qrManualCode || visitor.qrToken) && (
                    <div className="admin-visitor-code-card">
                      <span className="admin-visitor-code-label">Visitor Code</span>
                      <strong>{formatVisitorAccessCode(visitor.qrManualCode || visitor.qrToken)}</strong>
                      <p>Residents and guards can use this short code whenever QR camera scanning is unavailable.</p>
                    </div>
                  )}
                  {visitor.reviewStatus === 'approved' && (
                    <div className="admin-review-note">
                      Reviewed by {visitor.reviewedByName || 'Admin'}{visitor.reviewedAt ? ` on ${new Date(visitor.reviewedAt).toLocaleString()}` : ''}.
                    </div>
                  )}
                  <div className="admin-pre-reg-actions">
                    {visitor.identificationDocument?.path && (
                      <button type="button" onClick={() => openVisitorIdentification(visitor)} className="btn-view-document"><Eye size={16} />View ID</button>
                    )}
                    {visitor.reviewStatus === 'pending' && (
                      <>
                        <button type="button" onClick={() => reviewPreRegisteredVisitor(visitor, 'approved', false)} className="btn-approve"><CheckCircle size={16} />Approve</button>
                        <button type="button" onClick={() => reviewPreRegisteredVisitor(visitor, 'approved', true)} className="btn-approve"><QrCode size={16} />Approve QR Entry</button>
                        <button type="button" onClick={() => reviewPreRegisteredVisitor(visitor, 'rejected', false)} className="btn-reject"><XCircle size={16} />Reject</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const wrapModule = (content) => (
    <div className="module-stage">
      <div className="module-stage__inner">{content}</div>
    </div>
  );

  const renderContent = () => {
    switch (activeModule) {
      case 'overview':       return <OverviewContent />;
      case 'residents':      return ResidentManagementContent();
      case 'vehicles':       return VehicleManagementContent();
      case 'visitors':       return VisitorLogsContent();
      case 'pre-registered': return PreRegisteredVisitorsContent();
      case 'facilities':     return wrapModule(<AdminFacilityManagement token={token} showConfirm={showConfirm} />);
      case 'complaints':     return wrapModule(<AdminComplaintManagement token={token} />);
      case 'announcements':  return wrapModule(<AdminAnnouncementManagement token={token} showConfirm={showConfirm} />);
      case 'contact_hoa':    return wrapModule(<AdminContactHOAManagement token={token} showAlert={showAlert} showConfirm={showConfirm} />);
      case 'cctv':           return wrapModule(<CCTVFeedsModule token={token} mode="admin" showAlert={showAlert} showConfirm={showConfirm} />);
      case 'billing':        return wrapModule(<AdminBillingManagement token={token} showConfirm={showConfirm} />);
      case 'bill_audit_logs': return wrapModule(<AdminBillsAuditLogs token={token} showConfirm={showConfirm} showAlert={showAlert} />);
      case 'audit_logs':     return wrapModule(<AdminAuditLogs token={token} showAlert={showAlert} />);
      case 'documents':      return wrapModule(<AdminDocumentsManagement token={token} />);
      case 'analytics':      return wrapModule(<AIAnalyticsModule token={token} showAlert={showAlert} />);
      case 'ai_chatbot':     return wrapModule(<AdminAIChatbotModule token={token} showAlert={showAlert} />);
      case 'subdivision_map': return wrapModule(<SubdivisionMap3D role={getUserRoleLabel(user)} />);
      case 'reports':        return wrapModule(<AdminReportsManagement token={token} />);
      case 'manage_accounts': return wrapModule(<ManageAccountsModule showConfirm={showConfirm} showAlert={showAlert} />);
      default:               return <OverviewContent />;
    }
  };

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className={`admin-dashboard ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
      <div className={`sidebar-backdrop ${sidebarOpen ? 'active' : ''}`} onClick={() => setSidebarOpen(false)} />

      <aside className={`admin-sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          {sidebarOpen && (
            <div className="sidebar-logo">
              <img src={ecohoa} alt="Ecotrend HOA Logo" style={{ width: '40px', height: '40px', objectFit: 'contain', borderRadius: '10px', background: '#fff', padding: '4px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', flexShrink: 0 }} />
              <div><h1>Ecotrend HOA</h1><p>Officer Panel</p></div>
            </div>
          )}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="sidebar-toggle">
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
        <nav className="sidebar-nav">
          {menuItems.map(item => {
            const Icon = item.icon;
            const isActive = activeModule === item.id;
            return (
              <button key={item.id} onClick={() => { setActiveModule(item.id); if (window.innerWidth <= 767) setSidebarOpen(false); }} className={`nav-item ${isActive ? 'active' : ''}`}>
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

      <main className="admin-main">
        <header className="admin-header">
          <div className="header-content">
            <div className="header-title">
              <h2>{menuItems.find(item => item.id === activeModule)?.label || 'Overview'}</h2>
              <p>Ecotrend Homeowners Association</p>
            </div>
            <div className="header-user" onClick={() => setSidebarOpen(!sidebarOpen)} style={{ cursor: 'pointer' }}>
              <div className="user-info"><p className="user-name">{user.username}</p><p className="user-role">{userRoleLabel}</p></div>
              <div className="user-avatar">{user.username?.[0]?.toUpperCase() || 'A'}</div>
            </div>
          </div>
        </header>
        <div className="admin-content">
          <div key={activeModule} className="module-view-transition">
            {renderContent()}
          </div>
        </div>
        {viewingVisitorIdentification && (
          <VisitorIdentificationModal
            visitor={viewingVisitorIdentification}
            token={token}
            onClose={() => setViewingVisitorIdentification(null)}
          />
        )}
      </main>
    </div>
  );
};

export default AdminDashboard;
