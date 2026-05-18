export const OFFICER_POSITIONS = Object.freeze({
  PRESIDENT: 'PRESIDENT',
  VICE_PRESIDENT: 'VICE_PRESIDENT',
  SECRETARY: 'SECRETARY',
  AUDITOR: 'AUDITOR',
  TREASURER: 'TREASURER',
  BOARD_MEMBER: 'BOARD_MEMBER'
});

export const OFFICER_POSITION_OPTIONS = [
  { value: OFFICER_POSITIONS.VICE_PRESIDENT, label: 'Vice-President' },
  { value: OFFICER_POSITIONS.SECRETARY, label: 'Secretary' },
  { value: OFFICER_POSITIONS.AUDITOR, label: 'Auditor' },
  { value: OFFICER_POSITIONS.TREASURER, label: 'Treasurer' },
  { value: OFFICER_POSITIONS.BOARD_MEMBER, label: 'Board Member' }
];

export const SUBDIVISION_MAP_MODULE = Object.freeze({
  value: 'subdivision_map',
  label: '3D Mapped Subdivision Module',
  description: 'Visual 3D subdivision map for easier navigation, monitoring, facilities, roads, and key locations.'
});

export const ADMIN_MODULE_OPTIONS = [
  { value: 'overview', label: 'Overview', description: 'Dashboard summary and quick actions.', required: true },
  { value: 'residents', label: 'Residents', description: 'Resident approvals, profiles, and resident records.' },
  { value: 'vehicles', label: 'Vehicles', description: 'Vehicle registry and resident vehicle management.' },
  { value: 'visitors', label: 'Visitors', description: 'Visitor and delivery monitoring tools.' },
  { value: 'facilities', label: 'Facilities', description: 'Facility reservations, payments, and facility settings.' },
  { value: 'complaints', label: 'Complaints', description: 'Complaint intake, review, and status updates.' },
  { value: 'announcements', label: 'Announcements', description: 'Community announcements and advisories.' },
  { value: 'contact_hoa', label: 'Contact HOA', description: 'Manage the officers hierarchy image and the HOA contact numbers shown to residents.' },
  { value: 'cctv', label: 'CCTV Feeds', description: 'Manage security camera feed names, stream URLs, and availability.' },
  { value: 'billing', label: 'Billing', description: 'Monthly dues, receipts, and billing verification.' },
  { value: 'bill_audit_logs', label: 'Admin Bills Audit/Logs', description: 'Track admin-side bills such as utilities, service fees, and other HOA expenses.' },
  { value: 'audit_logs', label: 'Audit Logs', description: 'Trace which officer modules were opened and which admin-side actions were completed.' },
  { value: 'documents', label: 'Documents', description: 'Resident document requests and submissions.' },
  { value: 'analytics', label: 'Analytics', description: 'Dashboard analytics and performance insights.' },
  { value: 'ai_chatbot', label: 'AI Chatbot', description: 'Grounded admin chatbot for resident, security, and operations questions.' },
  { ...SUBDIVISION_MAP_MODULE, required: true },
  { value: 'reports', label: 'Reports', description: 'CSV/PDF report generation and archives.' },
  { value: 'settings', label: 'Settings', description: 'System configuration and administrative settings.' }
];

export const GUARD_MODULE_OPTIONS = [
  { value: 'overview', label: 'Overview', description: 'Guard dashboard summary and quick shortcuts.', required: true },
  { value: 'search', label: 'Search', description: 'Resident and vehicle search tools.' },
  { value: 'entry-log', label: 'Log Entry', description: 'Create visitor, delivery, and vehicle entry records.' },
  { value: 'exit-log', label: 'Log Exit', description: 'Process visitor and delivery exits.' },
  { value: 'pre-registered', label: 'Pre-Registered', description: 'Review and process pre-registered visitors.' },
  { value: 'facilities', label: 'Facilities', description: 'View facility reservation schedules.' },
  { value: 'announcements', label: 'Announcements', description: 'Read guard-targeted announcements.' },
  { value: 'cctv', label: 'CCTV Feeds', description: 'View configured security camera feeds.' },
  { ...SUBDIVISION_MAP_MODULE, required: true },
  { value: 'activity', label: 'Activity Log', description: 'View gate activity history and personal logs.' }
];

const ADMIN_MODULE_VALUES = ADMIN_MODULE_OPTIONS.map((module) => module.value);
const GUARD_MODULE_VALUES = GUARD_MODULE_OPTIONS.map((module) => module.value);
const DEFAULT_ADMIN_MODULE_VALUES = ADMIN_MODULE_VALUES.filter((module) => module !== 'ai_chatbot');

const MODULE_ACCESS = {
  [OFFICER_POSITIONS.PRESIDENT]: [...ADMIN_MODULE_VALUES, 'manage_accounts'],
  [OFFICER_POSITIONS.VICE_PRESIDENT]: [
    'overview',
    'residents',
    'vehicles',
    'visitors',
    'facilities',
    'complaints',
    'announcements',
    'contact_hoa',
    'cctv',
    'billing',
    'audit_logs',
    'documents',
    'analytics',
    'subdivision_map',
    'reports'
  ],
  [OFFICER_POSITIONS.AUDITOR]: [
    'overview',
    'billing',
    'bill_audit_logs',
    'audit_logs',
    'analytics',
    'subdivision_map',
    'reports'
  ],
  [OFFICER_POSITIONS.TREASURER]: [
    'overview',
    'residents',
    'facilities',
    'billing',
    'bill_audit_logs',
    'audit_logs',
    'analytics',
    'subdivision_map',
    'reports'
  ],
  [OFFICER_POSITIONS.SECRETARY]: [
    'overview',
    'residents',
    'visitors',
    'announcements',
    'contact_hoa',
    'audit_logs',
    'subdivision_map',
    'documents',
    'reports'
  ],
  [OFFICER_POSITIONS.BOARD_MEMBER]: [
    'overview',
    'residents',
    'visitors',
    'facilities',
    'complaints',
    'announcements',
    'cctv',
    'subdivision_map',
    'reports'
  ]
};

const POSITION_ALIASES = {
  PRESIDENT: OFFICER_POSITIONS.PRESIDENT,
  VICE_PRESIDENT: OFFICER_POSITIONS.VICE_PRESIDENT,
  VICEPRESIDENT: OFFICER_POSITIONS.VICE_PRESIDENT,
  SECRETARY: OFFICER_POSITIONS.SECRETARY,
  AUDITOR: OFFICER_POSITIONS.AUDITOR,
  TREASURER: OFFICER_POSITIONS.TREASURER,
  BOARD_MEMBER: OFFICER_POSITIONS.BOARD_MEMBER,
  BOARDMEMBER: OFFICER_POSITIONS.BOARD_MEMBER
};

const POSITION_LABELS = {
  [OFFICER_POSITIONS.PRESIDENT]: 'President',
  [OFFICER_POSITIONS.VICE_PRESIDENT]: 'Vice-President',
  [OFFICER_POSITIONS.SECRETARY]: 'Secretary',
  [OFFICER_POSITIONS.AUDITOR]: 'Auditor',
  [OFFICER_POSITIONS.TREASURER]: 'Treasurer',
  [OFFICER_POSITIONS.BOARD_MEMBER]: 'Board Member'
};

const uniqueModules = (modules = []) => [...new Set(modules.filter(Boolean))];

export const normalizeOfficerPosition = (position, role = '') => {
  const normalizedRole = String(role || '').toUpperCase();

  if (normalizedRole === 'MASTER_ADMIN') {
    return OFFICER_POSITIONS.PRESIDENT;
  }

  const normalized = String(position || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');

  return POSITION_ALIASES[normalized] || '';
};

export const getOfficerPositionLabel = (position, role = '') => {
  const normalizedPosition = normalizeOfficerPosition(position, role);
  return POSITION_LABELS[normalizedPosition] || 'Unassigned Officer';
};

export const getAllowedModulesForRole = (role = '') => {
  const normalizedRole = String(role || '').toUpperCase();

  if (normalizedRole === 'MASTER_ADMIN') {
    return [...ADMIN_MODULE_VALUES, 'manage_accounts'];
  }

  if (normalizedRole === 'ADMIN') {
    return [...ADMIN_MODULE_VALUES];
  }

  if (normalizedRole === 'GUARD') {
    return [...GUARD_MODULE_VALUES];
  }

  return [];
};

export const getModuleOptionsForRole = (role = '') => {
  const normalizedRole = String(role || '').toUpperCase();

  if (normalizedRole === 'ADMIN' || normalizedRole === 'MASTER_ADMIN') {
    return ADMIN_MODULE_OPTIONS;
  }

  if (normalizedRole === 'GUARD') {
    return GUARD_MODULE_OPTIONS;
  }

  return [];
};

export const getLockedModulesForRole = (role = '', position = '') => {
  const normalizedRole = String(role || '').toUpperCase();

  if (normalizedRole === 'MASTER_ADMIN') {
    return [...ADMIN_MODULE_VALUES, 'manage_accounts'];
  }

  if (normalizedRole === 'ADMIN') {
    const normalizedPosition = normalizeOfficerPosition(position, role);
    return [...(MODULE_ACCESS[normalizedPosition] || DEFAULT_ADMIN_MODULE_VALUES)];
  }

  if (normalizedRole === 'GUARD') {
    return [...GUARD_MODULE_VALUES];
  }

  return [];
};

export const getDefaultModulesForRole = (role = '', position = '') => {
  const normalizedRole = String(role || '').toUpperCase();

  if (normalizedRole === 'MASTER_ADMIN') {
    return [...ADMIN_MODULE_VALUES, 'manage_accounts'];
  }

  if (normalizedRole === 'ADMIN') {
    const normalizedPosition = normalizeOfficerPosition(position, role);
    return [...(MODULE_ACCESS[normalizedPosition] || DEFAULT_ADMIN_MODULE_VALUES)];
  }

  if (normalizedRole === 'GUARD') {
    return [...GUARD_MODULE_VALUES];
  }

  return [];
};

export const normalizeModules = (modules, role = '', position = '') => {
  const allowedModules = getAllowedModulesForRole(role);
  const fallbackModules = getDefaultModulesForRole(role, position);
  const lockedModules = uniqueModules(
    getLockedModulesForRole(role, position).filter((moduleKey) =>
      allowedModules.includes(moduleKey)
    )
  );
  const sourceModules = Array.isArray(modules) && modules.length > 0 ? modules : fallbackModules;
  const normalizedModules = uniqueModules(
    sourceModules.filter((moduleKey) => allowedModules.includes(moduleKey))
  );

  return uniqueModules([...lockedModules, ...normalizedModules]);
};

export const getEffectiveModules = (user = {}) =>
  normalizeModules(user.modules, user.role, user.position);

export const hasModuleAccess = (user, moduleKey) => {
  if (!moduleKey) {
    return false;
  }

  const role = String(user?.role || '').toUpperCase();

  if (!['ADMIN', 'MASTER_ADMIN', 'GUARD'].includes(role)) {
    return false;
  }

  return getEffectiveModules(user).includes(moduleKey);
};

export const hasAdminModuleAccess = (user, moduleKey) => {
  const role = String(user?.role || '').toUpperCase();

  if (!['ADMIN', 'MASTER_ADMIN'].includes(role)) {
    return false;
  }

  return hasModuleAccess(user, moduleKey);
};

export const getModuleLabel = (moduleKey, role = '') => {
  const moduleOption = getModuleOptionsForRole(role).find((item) => item.value === moduleKey);
  return moduleOption?.label || moduleKey;
};

export const getUserRoleLabel = (user) => {
  const role = String(user?.role || '').toUpperCase();

  if (role === 'MASTER_ADMIN' || role === 'ADMIN') {
    return getOfficerPositionLabel(user?.position, role);
  }

  if (role === 'GUARD') {
    return 'Guard';
  }

  if (role === 'RESIDENT') {
    return 'Resident';
  }

  return 'User';
};
