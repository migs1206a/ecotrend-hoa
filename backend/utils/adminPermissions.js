const OFFICER_POSITIONS = Object.freeze({
  PRESIDENT: 'PRESIDENT',
  VICE_PRESIDENT: 'VICE_PRESIDENT',
  SECRETARY: 'SECRETARY',
  AUDITOR: 'AUDITOR',
  TREASURER: 'TREASURER',
  BOARD_MEMBER: 'BOARD_MEMBER'
});

const ADMIN_MODULES = Object.freeze([
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
  'bill_audit_logs',
  'documents',
  'analytics',
  'ai_chatbot',
  'subdivision_map',
  'reports',
  'settings',
  'manage_accounts'
]);

const ASSIGNABLE_ADMIN_MODULES = Object.freeze(
  ADMIN_MODULES.filter((moduleKey) => moduleKey !== 'manage_accounts')
);

const DEFAULT_ASSIGNABLE_ADMIN_MODULES = Object.freeze(
  ASSIGNABLE_ADMIN_MODULES.filter((moduleKey) => moduleKey !== 'ai_chatbot')
);

const GUARD_MODULES = Object.freeze([
  'overview',
  'search',
  'entry-log',
  'exit-log',
  'pre-registered',
  'facilities',
  'announcements',
  'cctv',
  'subdivision_map',
  'activity'
]);

const OFFICER_MODULE_ACCESS = Object.freeze({
  [OFFICER_POSITIONS.PRESIDENT]: [...ADMIN_MODULES],
  [OFFICER_POSITIONS.VICE_PRESIDENT]: [...DEFAULT_ASSIGNABLE_ADMIN_MODULES],
  [OFFICER_POSITIONS.AUDITOR]: [...DEFAULT_ASSIGNABLE_ADMIN_MODULES],
  [OFFICER_POSITIONS.TREASURER]: [...DEFAULT_ASSIGNABLE_ADMIN_MODULES],
  [OFFICER_POSITIONS.SECRETARY]: [
    'overview',
    'visitors',
    'facilities',
    'complaints',
    'announcements',
    'contact_hoa',
    'cctv',
    'subdivision_map',
    'documents',
    'reports'
  ],
  [OFFICER_POSITIONS.BOARD_MEMBER]: [
    'overview',
    'visitors',
    'facilities',
    'complaints',
    'announcements',
    'contact_hoa',
    'cctv',
    'subdivision_map',
    'reports'
  ]
});

const POSITION_ALIASES = Object.freeze({
  PRESIDENT: OFFICER_POSITIONS.PRESIDENT,
  VICE_PRESIDENT: OFFICER_POSITIONS.VICE_PRESIDENT,
  VICEPRESIDENT: OFFICER_POSITIONS.VICE_PRESIDENT,
  SECRETARY: OFFICER_POSITIONS.SECRETARY,
  AUDITOR: OFFICER_POSITIONS.AUDITOR,
  TREASURER: OFFICER_POSITIONS.TREASURER,
  BOARD_MEMBER: OFFICER_POSITIONS.BOARD_MEMBER,
  BOARDMEMBER: OFFICER_POSITIONS.BOARD_MEMBER
});

const POSITION_LABELS = Object.freeze({
  [OFFICER_POSITIONS.PRESIDENT]: 'President',
  [OFFICER_POSITIONS.VICE_PRESIDENT]: 'Vice-President',
  [OFFICER_POSITIONS.SECRETARY]: 'Secretary',
  [OFFICER_POSITIONS.AUDITOR]: 'Auditor',
  [OFFICER_POSITIONS.TREASURER]: 'Treasurer',
  [OFFICER_POSITIONS.BOARD_MEMBER]: 'Board Member'
});

const isOfficer = (user) => ['ADMIN', 'MASTER_ADMIN'].includes(String(user?.role || '').toUpperCase());
const isGuard = (user) => String(user?.role || '').toUpperCase() === 'GUARD';
const isResident = (user) => String(user?.role || '').toUpperCase() === 'RESIDENT';
const isModuleManagedUser = (user) => isOfficer(user) || isGuard(user);

const normalizeOfficerPosition = (position) => {
  const normalized = String(position || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');

  return POSITION_ALIASES[normalized] || '';
};

const uniqueModules = (modules = []) => [...new Set(modules.filter(Boolean))];

const getEffectiveOfficerPosition = (user) => {
  const role = String(user?.role || '').toUpperCase();

  if (role === 'MASTER_ADMIN') {
    return OFFICER_POSITIONS.PRESIDENT;
  }

  if (role !== 'ADMIN') {
    return '';
  }

  return normalizeOfficerPosition(user?.position);
};

const getDefaultModulesForRole = (role, position = '') => {
  const normalizedRole = String(role || '').toUpperCase();

  if (normalizedRole === 'MASTER_ADMIN') {
    return [...ADMIN_MODULES];
  }

  if (normalizedRole === 'ADMIN') {
    const normalizedPosition = normalizeOfficerPosition(position);
    return [...(OFFICER_MODULE_ACCESS[normalizedPosition] || DEFAULT_ASSIGNABLE_ADMIN_MODULES)];
  }

  if (normalizedRole === 'GUARD') {
    return [...GUARD_MODULES];
  }

  return [];
};

const getAllowedModulesForRole = (role) => {
  const normalizedRole = String(role || '').toUpperCase();

  if (normalizedRole === 'MASTER_ADMIN') {
    return [...ADMIN_MODULES];
  }

  if (normalizedRole === 'ADMIN') {
    return [...ASSIGNABLE_ADMIN_MODULES];
  }

  if (normalizedRole === 'GUARD') {
    return [...GUARD_MODULES];
  }

  return [];
};

const normalizeModules = (modules, role, position = '') => {
  const normalizedRole = String(role || '').toUpperCase();

  if (normalizedRole === 'MASTER_ADMIN') {
    return [...ADMIN_MODULES];
  }

  const allowedModules = getAllowedModulesForRole(normalizedRole);
  const fallbackModules = getDefaultModulesForRole(normalizedRole, position);
  const sourceModules = Array.isArray(modules) && modules.length > 0 ? modules : fallbackModules;
  const normalizedModules = uniqueModules(
    sourceModules.filter((moduleKey) => allowedModules.includes(moduleKey))
  );

  ['overview', 'subdivision_map'].forEach((moduleKey) => {
    if (!allowedModules.includes(moduleKey) || normalizedModules.includes(moduleKey)) {
      return;
    }

    if (moduleKey === 'overview') {
      normalizedModules.unshift(moduleKey);
    } else {
      normalizedModules.push(moduleKey);
    }
  });

  return normalizedModules;
};

const getEffectiveModules = (user) =>
  normalizeModules(user?.modules, user?.role, user?.position);

const hasModuleAccess = (user, moduleKey) => {
  if (!moduleKey || !isModuleManagedUser(user)) {
    return false;
  }

  return getEffectiveModules(user).includes(moduleKey);
};

const hasAdminModuleAccess = (user, moduleKey) => {
  if (!moduleKey || !isOfficer(user)) {
    return false;
  }

  return getEffectiveModules(user).includes(moduleKey);
};

const getOfficerPositionLabel = (position) => {
  const normalized = normalizeOfficerPosition(position);
  return POSITION_LABELS[normalized] || 'Unassigned Officer';
};

const getUserRoleLabel = (user) => {
  const role = String(user?.role || '').toUpperCase();

  if (role === 'MASTER_ADMIN') {
    return POSITION_LABELS[OFFICER_POSITIONS.PRESIDENT];
  }

  if (role === 'ADMIN') {
    return getOfficerPositionLabel(user?.position);
  }

  if (role === 'GUARD') {
    return 'Guard';
  }

  if (role === 'RESIDENT') {
    return 'Resident';
  }

  return 'User';
};

module.exports = {
  ADMIN_MODULES,
  ASSIGNABLE_ADMIN_MODULES,
  GUARD_MODULES,
  OFFICER_MODULE_ACCESS,
  OFFICER_POSITIONS,
  getAllowedModulesForRole,
  getDefaultModulesForRole,
  getEffectiveModules,
  getEffectiveOfficerPosition,
  getOfficerPositionLabel,
  getUserRoleLabel,
  hasAdminModuleAccess,
  hasModuleAccess,
  isGuard,
  isModuleManagedUser,
  isOfficer,
  isResident,
  normalizeModules,
  normalizeOfficerPosition
};
