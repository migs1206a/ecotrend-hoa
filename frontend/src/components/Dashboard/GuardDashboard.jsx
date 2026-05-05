import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ecohoa from '../../assets/ecohoa.png';
import { apiUrl } from '../../utils/api';
import { 
  Home, LogOut, Search, UserCheck, Car, Clock, 
  Menu, X, ChevronRight, AlertCircle, CheckCircle,
  LogIn, LogOut as LogOutIcon, User, Phone, MapPin, Package, 
  Calendar, MessageSquare, Bell, Landmark, Camera, Map as MapIcon
} from 'lucide-react';
import './GuardDashboard.css';
import GuardAnnouncement from '../AnnouncementManagement/GuardAnnouncement';
import GuardFacilityReservations from '../FacilityManagement/GuardFacilityReservations';
import CCTVFeedsModule from '../CCTV/CCTVFeedsModule';
import SubdivisionMap3D from '../SubdivisionMap/SubdivisionMap3D';
import { hasModuleAccess, getUserRoleLabel } from '../../utils/adminPermissions';
import { buildPaginatedUrl, parsePaginatedResponse } from '../../utils/pagination';
import {
  sanitizeNameInput,
  sanitizePhoneNumberInput,
  validateNameValue,
  validatePhoneNumberValue
} from '../../utils/formSecurity';

const GuardDashboard = ({ onLogout, showConfirm, showAlert }) => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeModule, setActiveModule] = useState('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchType, setSearchType] = useState('resident');
  const [searchResults, setSearchResults] = useState([]);
  const [loading, setLoading] = useState(false);
  
  const [residents, setResidents] = useState([]);
  const [residentSearchQuery, setResidentSearchQuery] = useState('');
  const [showResidentDropdown, setShowResidentDropdown] = useState(false);
  const [residentDropdownType, setResidentDropdownType] = useState('');
  
  const [entryForm, setEntryForm] = useState({
    visitorType: 'visitor',
    visitorLastName: '', visitorFirstName: '', visitorMiddleName: '',
    visitorContact: '+63', purposeOfVisit: '',
    hostResidentId: '', hostResidentName: '', hostResidentAddress: '',
    deliveryLastName: '', deliveryFirstName: '', deliveryMiddleName: '',
    deliveryContact: '+63',
    deliveryResidentId: '', deliveryResidentName: '', deliveryResidentAddress: '',
    residentId: '', residentName: '', residentAddress: '',
    plateNumber: '', vehicleType: '', vehicleColor: '', notes: ''
  });

  const [activeVisitors, setActiveVisitors] = useState([]);
  const [activeDeliveries, setActiveDeliveries] = useState([]);
  const [selectedItem, setSelectedItem] = useState(null);
  const [itemSearchQuery, setItemSearchQuery] = useState('');
  const [exitType, setExitType] = useState('visitor');
  const [residentForExit, setResidentForExit] = useState(null);
  const [preRegisteredVisitors, setPreRegisteredVisitors] = useState([]);

  const [stats, setStats] = useState({
    todayEntries: 0, todayExits: 0, todayVisitorEntries: 0,
    todayDeliveryEntries: 0, todayResidentEntries: 0,
    activeVisitors: 0, activeDeliveries: 0
  });

  const [recentActivity, setRecentActivity] = useState([]);
  const [myActivityLogs, setMyActivityLogs] = useState([]);
  const [guardAnnouncements, setGuardAnnouncements] = useState([]);

  const [sessionUser, setSessionUser] = useState(() => JSON.parse(localStorage.getItem('user') || '{}'));
  const user = sessionUser;
  const token = localStorage.getItem('token');
  const canAccessModule = useCallback((moduleKey) => hasModuleAccess(user, moduleKey), [user]);
  const userRoleLabel = getUserRoleLabel(user);
  const permissionUser = useMemo(
    () => ({
      role: user.role,
      position: user.position,
      modules: user.modules
    }),
    [user.modules, user.role, user.position]
  );

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

  // ── Input Sanitizers ────────────────────────────────────────────
  const toNameOnly    = (v) => sanitizeNameInput(v, 30);
  const toAlphaNum    = (v) => v.replace(/[^a-zA-Z0-9]/g, '');
  const toLettersOnly = (v) => v.replace(/[^a-zA-Z\s]/g, '');
  const toNoSpecial   = (v) => v.replace(/[^a-zA-Z0-9\s.,!?'"-]/g, '');
  const toPhone       = (v, prev) => sanitizePhoneNumberInput(v, prev);
  const composePersonName = (...parts) => parts.map((part) => String(part || '').trim()).filter(Boolean).join(' ');

  const menuItems = useMemo(
    () => ([
      { id: 'overview',       icon: Home,       label: 'Overview' },
      { id: 'search',         icon: Search,     label: 'Search Records' },
      { id: 'entry-log',      icon: LogIn,      label: 'Log Entry' },
      { id: 'exit-log',       icon: LogOutIcon, label: 'Log Exit' },
      { id: 'pre-registered', icon: Calendar,   label: 'Pre-Registered Visitors' },
      { id: 'facilities',     icon: Landmark,   label: 'Facility Reservations' },
      { id: 'announcements',  icon: Bell,       label: 'Announcements' },
      { id: 'cctv',           icon: Camera,     label: 'CCTV Feeds' },
      { id: 'subdivision_map', icon: MapIcon,   label: '3D Subdivision Map' },
      { id: 'activity',       icon: Clock,      label: 'Gate Activity Log' }
    ].filter((item) => hasModuleAccess(permissionUser, item.id))),
    [permissionUser]
  );

  // ── Data Fetching ────────────────────────────────────────────────
  const fetchResidents = useCallback(async () => {
    try {
      const response = await fetch(apiUrl('/residents/approved'), { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await response.json();
      setResidents(Array.isArray(data) ? data : []);
    } catch (error) { console.error('Error fetching residents:', error); setResidents([]); }
  }, [token]);

  const fetchStats = useCallback(async () => {
    try {
      const entryResponse    = await fetch(apiUrl('/entry-logs/stats/today'), { headers: { 'Authorization': `Bearer ${token}` } });
      const entryData        = await entryResponse.json();
      const visitorResponse  = await fetch(apiUrl('/visitors/active'),        { headers: { 'Authorization': `Bearer ${token}` } });
      const visitorData      = await visitorResponse.json();
      const deliveryResponse = await fetch(apiUrl('/deliveries/active'),      { headers: { 'Authorization': `Bearer ${token}` } }).catch(() => ({ json: async () => [] }));
      const deliveryData     = await deliveryResponse.json();
      setStats({
        todayEntries:         entryData.todayEntries         || 0,
        todayExits:           entryData.todayExits           || 0,
        todayVisitorEntries:  entryData.todayVisitorEntries  || 0,
        todayDeliveryEntries: entryData.todayDeliveryEntries || 0,
        todayResidentEntries: entryData.todayResidentEntries || 0,
        activeVisitors:  Array.isArray(visitorData)  ? visitorData.length  : 0,
        activeDeliveries: Array.isArray(deliveryData) ? deliveryData.length : 0
      });
    } catch (error) { console.error('Error fetching stats:', error); }
  }, [token]);

  const fetchRecentActivity = useCallback(async () => {
    try {
      const [entryLogsRes, visitorsRes, deliveriesRes] = await Promise.all([
        fetch(apiUrl('/entry-logs'), { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(apiUrl('/visitors'),   { headers: { 'Authorization': `Bearer ${token}` } }),
        fetch(apiUrl('/deliveries'), { headers: { 'Authorization': `Bearer ${token}` } }).catch(() => ({ json: async () => [] }))
      ]);
      const entryLogs  = await entryLogsRes.json();
      const visitors   = await visitorsRes.json();
      const deliveries = await deliveriesRes.json();
      const activities = [];
      if (Array.isArray(entryLogs)) {
        entryLogs.forEach(log => {
          const residentInfo = log.residentName ? ` - ${log.residentName}` : '';
          const vehicleInfo  = log.plateNumber !== 'NO-VEHICLE' ? `Vehicle ${log.plateNumber}` : `${log.vehicleOwnerType}`;
          activities.push({ text: `${vehicleInfo} ${log.logType === 'entry' ? 'entered' : 'exited'} (${log.vehicleOwnerType || 'resident'})${residentInfo}`, time: new Date(log.timestamp).toLocaleTimeString(), date: new Date(log.timestamp).toLocaleDateString(), color: log.logType === 'entry' ? 'green' : 'blue', timestamp: new Date(log.timestamp) });
        });
      }
      if (Array.isArray(visitors)) {
        visitors.forEach(visitor => {
          if (visitor.entryTime) activities.push({ text: `Visitor ${visitor.name} registered (visiting ${visitor.hostResidentName})`, time: new Date(visitor.entryTime).toLocaleTimeString(), date: new Date(visitor.entryTime).toLocaleDateString(), color: 'purple', timestamp: new Date(visitor.entryTime) });
          if (visitor.status === 'exited' && visitor.exitTime) activities.push({ text: `Visitor ${visitor.name} exited (visited ${visitor.hostResidentName})`, time: new Date(visitor.exitTime).toLocaleTimeString(), date: new Date(visitor.exitTime).toLocaleDateString(), color: 'orange', timestamp: new Date(visitor.exitTime) });
        });
      }
      if (Array.isArray(deliveries)) {
        deliveries.forEach(delivery => {
          activities.push({ text: `Delivery by ${delivery.driverName} registered (${delivery.hostResidentAddress})`, time: new Date(delivery.entryTime).toLocaleTimeString(), date: new Date(delivery.entryTime).toLocaleDateString(), color: 'purple', timestamp: new Date(delivery.entryTime) });
          if (delivery.status === 'exited' && delivery.exitTime) activities.push({ text: `Delivery by ${delivery.driverName} exited (${delivery.hostResidentAddress})`, time: new Date(delivery.exitTime).toLocaleTimeString(), date: new Date(delivery.exitTime).toLocaleDateString(), color: 'orange', timestamp: new Date(delivery.exitTime) });
        });
      }
      activities.sort((a, b) => b.timestamp - a.timestamp);
      setRecentActivity(activities);
    } catch (error) { console.error('Error fetching recent activity:', error); }
  }, [token]);

  const fetchGuardAnnouncements = useCallback(async () => {
    try {
      const response = await fetch(apiUrl(buildPaginatedUrl('/announcements', 1, {
        activeOnly: true,
        audience: 'guards',
        limit: 4
      })));
      const data = await response.json();
      const parsed = parsePaginatedResponse(data);
      setGuardAnnouncements(parsed.items);
    } catch (error) {
      console.error('Error fetching guard announcements:', error);
      setGuardAnnouncements([]);
    }
  }, []);

  const fetchMyActivity = useCallback(async () => {
    if (!user.id) return;
    try {
      const response = await fetch(apiUrl(`/entry-logs/guard/${user.id}`), { headers: { 'Authorization': `Bearer ${token}` } });
      if (response.ok) { const data = await response.json(); setMyActivityLogs(Array.isArray(data) ? data : []); }
      else setMyActivityLogs([]);
    } catch (error) { console.error('Error fetching my activity:', error); setMyActivityLogs([]); }
  }, [user.id, token]);

  const fetchActiveVisitors = useCallback(async () => {
    try {
      const response = await fetch(apiUrl('/visitors/active'), { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await response.json();
      setActiveVisitors(Array.isArray(data) ? data : []);
    } catch (error) { console.error('Error fetching active visitors:', error); setActiveVisitors([]); }
  }, [token]);

  const fetchActiveDeliveries = useCallback(async () => {
    try {
      const response = await fetch(apiUrl('/deliveries/active'), { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await response.json();
      setActiveDeliveries(Array.isArray(data) ? data : []);
    } catch (error) { console.error('Error fetching active deliveries:', error); setActiveDeliveries([]); }
  }, [token]);

  const fetchPreRegisteredVisitors = useCallback(async () => {
    try {
      const response = await fetch(apiUrl('/visitors/pre-registered'), { headers: { 'Authorization': `Bearer ${token}` } });
      const data = await response.json();
      setPreRegisteredVisitors(Array.isArray(data) ? data : []);
    } catch (error) { console.error('Error fetching pre-registered visitors:', error); setPreRegisteredVisitors([]); }
  }, [token]);

  useEffect(() => {
    if (!hasModuleAccess(permissionUser, 'overview')) {
      return undefined;
    }

    fetchStats(); fetchRecentActivity(); fetchGuardAnnouncements();
    const interval = setInterval(() => { fetchStats(); fetchRecentActivity(); fetchGuardAnnouncements(); }, 30000);
    return () => clearInterval(interval);
  }, [fetchStats, fetchRecentActivity, fetchGuardAnnouncements, permissionUser]);

  useEffect(() => {
    if (!menuItems.some((item) => item.id === activeModule)) {
      setActiveModule(menuItems[0]?.id || 'overview');
    }
  }, [activeModule, menuItems]);

  useEffect(() => {
    if      (activeModule === 'activity')       fetchMyActivity();
    else if (activeModule === 'exit-log')       { fetchActiveVisitors(); fetchActiveDeliveries(); }
    else if (activeModule === 'entry-log')      fetchResidents();
    else if (activeModule === 'pre-registered') fetchPreRegisteredVisitors();
  }, [activeModule, fetchMyActivity, fetchActiveVisitors, fetchActiveDeliveries, fetchResidents, fetchPreRegisteredVisitors]);

  // ── Handlers ─────────────────────────────────────────────────────
  const handleSearch = async () => {
    if (!searchQuery.trim()) { showAlert('Please enter a search term', 'error'); return; }
    setLoading(true);
    try {
      const url = searchType === 'vehicle'
        ? apiUrl(`/guards/search/vehicle?query=${searchQuery}`)
        : apiUrl(`/guards/search?type=${searchType}&query=${searchQuery}`);
      const response = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } });
      if (response.ok) { const data = await response.json(); setSearchResults(Array.isArray(data) ? data : []); }
      else setSearchResults([]);
    } catch (error) { console.error('Search error:', error); setSearchResults([]); }
    setLoading(false);
  };

  const handleSelectResident = (resident, fieldPrefix) => {
    if      (fieldPrefix === 'host')     setEntryForm({ ...entryForm, hostResidentId: resident._id, hostResidentName: resident.familyName, hostResidentAddress: `${resident.houseAddress}, ${resident.street}` });
    else if (fieldPrefix === 'delivery') setEntryForm({ ...entryForm, deliveryResidentId: resident._id, deliveryResidentName: resident.familyName, deliveryResidentAddress: `${resident.houseAddress}, ${resident.street}` });
    else if (fieldPrefix === 'resident') setEntryForm({ ...entryForm, residentId: resident._id, residentName: resident.familyName, residentAddress: `${resident.houseAddress}, ${resident.street}` });
    setResidentSearchQuery(''); setShowResidentDropdown(false);
  };

  const handleEntry = async (e) => {
    e.preventDefault();
    const { visitorType } = entryForm;
    if (visitorType === 'visitor'  && (!entryForm.visitorLastName || !entryForm.visitorFirstName || !entryForm.purposeOfVisit || !entryForm.hostResidentId)) { showAlert('Please fill in visitor last name, first name, purpose, and select host resident', 'error'); return; }
    if (visitorType === 'delivery' && (!entryForm.deliveryLastName || !entryForm.deliveryFirstName || !entryForm.deliveryResidentId))                          { showAlert('Please fill in delivery driver last name, first name, and select delivery address', 'error'); return; }
    if (visitorType === 'resident' && !entryForm.residentId)                                                               { showAlert('Please select the resident', 'error'); return; }

    const visitorName = composePersonName(entryForm.visitorFirstName, entryForm.visitorMiddleName, entryForm.visitorLastName);
    const deliveryDriverName = composePersonName(entryForm.deliveryFirstName, entryForm.deliveryMiddleName, entryForm.deliveryLastName);

    const nameValidation = visitorType === 'visitor'
      ? validateNameValue(visitorName, 'Visitor name', { minLength: 2, maxLength: 80 })
      : visitorType === 'delivery'
        ? validateNameValue(deliveryDriverName, 'Driver name', { minLength: 2, maxLength: 80 })
        : { valid: true, value: entryForm.residentName };

    if (!nameValidation.valid) {
      showAlert(nameValidation.message, 'error');
      return;
    }

    const contactValidation = visitorType === 'visitor'
      ? validatePhoneNumberValue(entryForm.visitorContact, 'Contact number')
      : visitorType === 'delivery'
        ? validatePhoneNumberValue(entryForm.deliveryContact, 'Contact number')
        : { valid: true, value: '' };

    if (!contactValidation.valid) {
      showAlert(contactValidation.message, 'error');
      return;
    }

    setLoading(true);
    try {
      if (visitorType === 'visitor') {
        const res = await fetch(apiUrl('/visitors'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ name: nameValidation.value, contactNumber: contactValidation.value, purpose: entryForm.purposeOfVisit, hostResidentId: entryForm.hostResidentId, hostResidentName: entryForm.hostResidentName, hostResidentAddress: entryForm.hostResidentAddress, vehiclePlateNumber: entryForm.plateNumber || '', vehicleType: entryForm.vehicleType || '', vehicleColor: entryForm.vehicleColor || '', guardOnDuty: user.id })
        });
        if (!res.ok) { const err = await res.json(); showAlert(err.message || 'Failed to register visitor', 'error'); setLoading(false); return; }
      }

      if (visitorType === 'delivery') {
        const res = await fetch(apiUrl('/deliveries'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ driverName: nameValidation.value, contactNumber: contactValidation.value, hostResidentId: entryForm.deliveryResidentId, hostResidentName: entryForm.deliveryResidentName, hostResidentAddress: entryForm.deliveryResidentAddress, vehiclePlateNumber: entryForm.plateNumber || '', vehicleType: entryForm.vehicleType || '', vehicleColor: entryForm.vehicleColor || '', guardOnDuty: user.id })
        });
        if (!res.ok) { const err = await res.json(); showAlert(err.message || 'Failed to register delivery', 'error'); setLoading(false); return; }
      }

      const logRes = await fetch(apiUrl('/entry-logs'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({
          plateNumber: entryForm.plateNumber || '',
          logType: 'entry',
          vehicleOwnerType: visitorType,
          ownerName:       visitorType === 'resident' ? entryForm.residentName : nameValidation.value,
          vehicleType:     entryForm.vehicleType  || '',
          vehicleColor:    entryForm.vehicleColor || '',
          residentId:      visitorType === 'visitor' ? entryForm.hostResidentId      : visitorType === 'delivery' ? entryForm.deliveryResidentId      : entryForm.residentId,
          residentName:    visitorType === 'visitor' ? entryForm.hostResidentName    : visitorType === 'delivery' ? entryForm.deliveryResidentName    : entryForm.residentName,
          residentAddress: visitorType === 'visitor' ? entryForm.hostResidentAddress : visitorType === 'delivery' ? entryForm.deliveryResidentAddress : entryForm.residentAddress,
          guardOnDuty: user.id,
          notes: entryForm.notes
        })
      });
      if (!logRes.ok) { const err = await logRes.json(); showAlert(err.message || 'Failed to log entry', 'error'); setLoading(false); return; }

      showAlert(`${visitorType === 'visitor' ? 'Visitor' : visitorType === 'delivery' ? 'Delivery' : 'Resident'} entry logged successfully!`, 'success');
      setEntryForm({ visitorType: 'visitor', visitorLastName: '', visitorFirstName: '', visitorMiddleName: '', visitorContact: '+63', purposeOfVisit: '', hostResidentId: '', hostResidentName: '', hostResidentAddress: '', deliveryLastName: '', deliveryFirstName: '', deliveryMiddleName: '', deliveryContact: '+63', deliveryResidentId: '', deliveryResidentName: '', deliveryResidentAddress: '', residentId: '', residentName: '', residentAddress: '', plateNumber: '', vehicleType: '', vehicleColor: '', notes: '' });
      fetchStats(); fetchRecentActivity();
    } catch (error) { console.error('Entry log error:', error); showAlert('Failed to log entry', 'error'); }
    setLoading(false);
  };

  const handleItemExit = async () => {
    if (!selectedItem && !residentForExit) { showAlert('Please select an item', 'error'); return; }

    if (exitType === 'resident' && residentForExit) {
      showConfirm(`Confirm exit for ${residentForExit.familyName}?`, async () => {
        setLoading(true);
        try {
          await fetch(apiUrl('/entry-logs'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ plateNumber: '', logType: 'exit', vehicleOwnerType: 'resident', ownerName: residentForExit.familyName, vehicleType: '', vehicleColor: '', residentId: residentForExit._id, residentName: residentForExit.familyName, residentAddress: `${residentForExit.houseAddress}, ${residentForExit.street}`, guardOnDuty: user.id, notes: 'Resident exit' })
          });
          showAlert('Resident exit logged successfully!', 'success');
          setResidentForExit(null); setItemSearchQuery('');
          fetchStats(); fetchRecentActivity();
        } catch (error) { console.error('Exit error:', error); showAlert('Failed to log resident exit', 'error'); }
        setLoading(false);
      });
      return;
    }

    const isDelivery = exitType === 'delivery';
    const itemName   = isDelivery ? selectedItem.driverName : selectedItem.name;
    const normalizedItemName = validateNameValue(sanitizeNameInput(itemName, 80), isDelivery ? 'Driver name' : 'Visitor name', {
      minLength: 2,
      maxLength: 80
    });

    showConfirm(`Confirm exit for ${itemName}?`, async () => {
      setLoading(true);
      try {
        const endpoint = isDelivery
          ? apiUrl(`/deliveries/${selectedItem._id}/exit`)
          : apiUrl(`/visitors/${selectedItem._id}/exit`);
        const response = await fetch(endpoint, { method: 'PATCH', headers: { 'Authorization': `Bearer ${token}` } });
        if (!response.ok) { const err = await response.json(); showAlert(err.message || `Failed to log ${isDelivery ? 'delivery' : 'visitor'} exit`, 'error'); setLoading(false); return; }

        await fetch(apiUrl('/entry-logs'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ plateNumber: selectedItem.vehiclePlateNumber || '', logType: 'exit', vehicleOwnerType: isDelivery ? 'delivery' : 'visitor', ownerName: normalizedItemName.valid ? normalizedItemName.value : sanitizeNameInput(itemName, 80).trim(), vehicleType: selectedItem.vehicleType || '', vehicleColor: selectedItem.vehicleColor || '', residentId: selectedItem.hostResident, residentName: selectedItem.hostResidentName, residentAddress: selectedItem.hostResidentAddress, guardOnDuty: user.id, notes: `${isDelivery ? 'Delivery' : 'Visitor'} exit` })
        });

        showAlert(`${isDelivery ? 'Delivery' : 'Visitor'} exit logged successfully!`, 'success');
        setSelectedItem(null); setItemSearchQuery('');
        fetchActiveVisitors(); fetchActiveDeliveries(); fetchStats(); fetchRecentActivity();
      } catch (error) { console.error('Exit error:', error); showAlert(`Failed to log ${isDelivery ? 'delivery' : 'visitor'} exit`, 'error'); }
      setLoading(false);
    });
  };

  const handleSelectItem = (item, type) => { setSelectedItem(item); setExitType(type); setItemSearchQuery(''); };

  const handlePreRegisteredEntry = async (visitor) => {
    const companionCount = Array.isArray(visitor.accompanyingVisitors) ? visitor.accompanyingVisitors.length : 0;
    showConfirm(`Log entry for ${visitor.name}${companionCount ? ` with ${companionCount} companion${companionCount > 1 ? 's' : ''}` : ''}?`, async () => {
      setLoading(true);
      try {
        const res = await fetch(apiUrl(`/visitors/${visitor._id}/entry`), {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ guardOnDuty: user.id })
        });
        if (!res.ok) { const err = await res.json(); showAlert(err.message || 'Failed to log entry', 'error'); setLoading(false); return; }

        await fetch(apiUrl('/entry-logs'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ plateNumber: visitor.vehiclePlateNumber || '', logType: 'entry', vehicleOwnerType: 'visitor', ownerName: sanitizeNameInput(visitor.name, 80).trim(), vehicleType: visitor.vehicleType || '', vehicleColor: visitor.vehicleColor || '', residentId: visitor.hostResident, residentName: visitor.hostResidentName, residentAddress: visitor.hostResidentAddress, guardOnDuty: user.id, notes: companionCount ? `Pre-registered visitor entry with ${companionCount} companion${companionCount > 1 ? 's' : ''}` : 'Pre-registered visitor entry' })
        });

        showAlert('Pre-registered visitor entry logged successfully!', 'success');
        fetchPreRegisteredVisitors(); fetchStats(); fetchRecentActivity();
      } catch (error) { console.error('Entry error:', error); showAlert('Failed to log entry', 'error'); }
      setLoading(false);
    });
  };

  const handleCancelPreRegistered = async (visitorId) => {
    showConfirm('Cancel this pre-registered visitor?', async () => {
      setLoading(true);
      try {
        const response = await fetch(apiUrl(`/visitors/${visitorId}/cancel`), { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
        if (response.ok) { showAlert('Pre-registered visitor cancelled successfully!', 'success'); fetchPreRegisteredVisitors(); }
        else showAlert('Failed to cancel visitor', 'error');
      } catch (error) { console.error('Cancel error:', error); showAlert('Failed to cancel visitor', 'error'); }
      setLoading(false);
    });
  };

  const filteredResidents  = residents.filter(r => r.familyName.toLowerCase().includes(residentSearchQuery.toLowerCase()) || r.houseAddress.toLowerCase().includes(residentSearchQuery.toLowerCase()) || r.street.toLowerCase().includes(residentSearchQuery.toLowerCase()));
  const filteredVisitors   = activeVisitors.filter(v => v.name.toLowerCase().includes(itemSearchQuery.toLowerCase()) || v.hostResidentName.toLowerCase().includes(itemSearchQuery.toLowerCase()) || (v.vehiclePlateNumber && v.vehiclePlateNumber.toLowerCase().includes(itemSearchQuery.toLowerCase())));
  const filteredDeliveries = activeDeliveries.filter(d => d.driverName.toLowerCase().includes(itemSearchQuery.toLowerCase()) || d.hostResidentName.toLowerCase().includes(itemSearchQuery.toLowerCase()) || (d.vehiclePlateNumber && d.vehiclePlateNumber.toLowerCase().includes(itemSearchQuery.toLowerCase())));

  const StatCard = ({ title, value, icon: Icon, color }) => (
    <div className="guard-stat-card">
      <div className="stat-card-content">
        <div className="stat-info"><p>{title}</p><h3>{value}</h3></div>
        <div className={`stat-icon bg-${color}-50`}><Icon className={`text-${color}-600`} size={24} /></div>
      </div>
    </div>
  );

  const getAnnouncementCategoryClass = (category) => {
    switch (String(category || '').toLowerCase()) {
      case 'urgent': return 'urgent';
      case 'maintenance': return 'maintenance';
      case 'events': return 'events';
      default: return 'general';
    }
  };

  const GuardAnnouncementPreview = () => {
    const featuredAnnouncement = guardAnnouncements[0];
    const supportingAnnouncements = guardAnnouncements.slice(1, 4);

    return (
      <div className="dashboard-card guard-announcement-card">
        <div className="card-header guard-announcement-header">
          <div>
            <span className="guard-overview-kicker"><Bell size={15} /> Announcements</span>
            <h3>HOA Notices</h3>
          </div>
          {canAccessModule('announcements') && (
            <button type="button" className="guard-overview-link-btn" onClick={() => setActiveModule('announcements')}>
              View All
              <ChevronRight size={16} />
            </button>
          )}
        </div>

        {featuredAnnouncement ? (
          <>
            <div className="guard-announcement-feature">
              <span className={`guard-announcement-category ${getAnnouncementCategoryClass(featuredAnnouncement.category)}`}>
                {featuredAnnouncement.category || 'general'}
              </span>
              <h4>{featuredAnnouncement.title}</h4>
              <p>{featuredAnnouncement.content?.length > 180 ? `${featuredAnnouncement.content.substring(0, 180)}...` : featuredAnnouncement.content}</p>
              <div className="guard-announcement-meta">
                <span>{new Date(featuredAnnouncement.createdAt).toLocaleDateString()}</span>
                <span>{featuredAnnouncement.postedBy || 'Admin'}</span>
              </div>
            </div>

            {supportingAnnouncements.length > 0 && (
              <div className="guard-announcement-list">
                {supportingAnnouncements.map((announcement) => (
                  <button
                    key={announcement._id}
                    type="button"
                    className="guard-announcement-list-item"
                    onClick={() => canAccessModule('announcements') && setActiveModule('announcements')}
                  >
                    <span>{announcement.title}</span>
                    <strong>{new Date(announcement.createdAt).toLocaleDateString()}</strong>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="guard-announcement-empty">
            <Bell size={28} />
            <h4>No active notices</h4>
            <p>New HOA announcements will appear here.</p>
          </div>
        )}
      </div>
    );
  };

  const RecentActivityPreview = () => (
    <div className="dashboard-card guard-overview-recent-card">
      <div className="card-header"><h3>Recent Activity</h3></div>
      <div className="activity-list">
        {recentActivity.length === 0
          ? <div className="empty-state-small"><p>No recent activity</p></div>
          : recentActivity.slice(0, 8).map((activity, idx) => (
              <div key={idx} className="activity-item">
                <div className={`activity-dot bg-${activity.color}-50`}><div className="activity-dot-inner" style={{ backgroundColor: `var(--color-${activity.color})` }} /></div>
                <div className="activity-content"><p className="activity-text">{activity.text}</p><p className="activity-time">{activity.time}</p></div>
              </div>
            ))}
      </div>
    </div>
  );

  const PreRegisteredVisitorsContent = () => {
    const [preRegSearchQuery, setPreRegSearchQuery] = useState('');
    const filteredPreReg = preRegisteredVisitors.filter(v =>
      v.name.toLowerCase().includes(preRegSearchQuery.toLowerCase()) ||
      v.hostResidentName.toLowerCase().includes(preRegSearchQuery.toLowerCase()) ||
      (v.vehiclePlateNumber && v.vehiclePlateNumber.toLowerCase().includes(preRegSearchQuery.toLowerCase()))
    );

    return (
      <div>
        <div className="page-header">
          <div className="page-title"><h2>Pre-Registered Visitors</h2><p>Visitors pre-registered by residents</p></div>
        </div>

        <div className="search-input-group" style={{ marginBottom: '1.5rem' }}>
          <Search size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input type="text" value={preRegSearchQuery} onChange={(e) => setPreRegSearchQuery(e.target.value)} placeholder="Search by name, host, or plate number..." className="search-input" style={{ paddingLeft: '3rem' }} />
        </div>

        <div style={{ marginBottom: '1rem', padding: '1rem', backgroundColor: 'white', borderRadius: '0.5rem', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '1.125rem', fontWeight: '600', color: '#1f2937' }}>Total Pre-Registered</h3>
              <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.875rem', color: '#6b7280' }}>Awaiting entry</p>
            </div>
            <div style={{ fontSize: '2rem', fontWeight: '700', color: '#8b5cf6' }}>{filteredPreReg.length}</div>
          </div>
        </div>

        {loading ? (
          <div className="loading-container"><div className="spinner"></div><p className="loading-text">Loading pre-registered visitors...</p></div>
        ) : filteredPreReg.length === 0 ? (
          <div className="empty-state"><div className="empty-icon"><Calendar size={40} style={{ color: '#9ca3af' }} /></div><h3>No Pre-Registered Visitors</h3><p>{preRegSearchQuery ? 'Try a different search term' : 'No visitors have been pre-registered yet'}</p></div>
        ) : (
          <div className="visitor-logs-grid">
            {filteredPreReg.map((visitor) => (
              <div key={visitor._id} className="visitor-log-card">
                <div className="visitor-log-header">
                  <div><h3>{visitor.name}</h3><p className="visitor-log-type"><Calendar size={14} /> Pre-Registered</p></div>
                  <span className="status-badge" style={{ background: 'linear-gradient(135deg, #fef3c7 0%, #fde68a 100%)', color: '#d97706' }}>Pending Entry</span>
                </div>
                <div className="visitor-log-details">
                  <div className="visitor-log-detail"><User size={14} /><span>Host: {visitor.hostResidentName}</span></div>
                  <div className="visitor-log-detail"><MapPin size={14} /><span>{visitor.hostResidentAddress}</span></div>
                  <div className="visitor-log-detail"><MessageSquare size={14} /><span>Purpose: {visitor.purpose}</span></div>
                  {visitor.contactNumber    && <div className="visitor-log-detail"><Phone size={14} /><span>{visitor.contactNumber}</span></div>}
                  {visitor.vehiclePlateNumber && <div className="visitor-log-detail"><Car size={14} /><span>{visitor.vehiclePlateNumber} ({visitor.vehicleType || 'N/A'})</span></div>}
                  {visitor.expectedDate      && <div className="visitor-log-detail"><Clock size={14} /><span>Expected: {new Date(visitor.expectedDate).toLocaleString()}</span></div>}
                  <div className="visitor-log-detail"><User size={14} /><span>Pre-registered: {new Date(visitor.createdAt).toLocaleString()}</span></div>
                </div>
                {Array.isArray(visitor.accompanyingVisitors) && visitor.accompanyingVisitors.length > 0 && (
                  <div className="pre-reg-companion-review">
                    <div className="pre-reg-companion-title">Companions to Review</div>
                    {visitor.accompanyingVisitors.map((companion, index) => (
                      <div key={index} className="pre-reg-companion-item">
                        <strong>{companion.firstName} {companion.lastName}</strong>
                        <span>{companion.relationshipToResident}</span>
                        <span>ID: {companion.identification}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                  <button onClick={() => handlePreRegisteredEntry(visitor)} className="btn-approve" style={{ flex: 1 }} disabled={loading}><LogIn size={18} />Log Entry</button>
                  <button onClick={() => handleCancelPreRegistered(visitor._id)} className="btn-reject" style={{ flex: 1 }} disabled={loading}><X size={18} />Cancel</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  // ── Render Content ───────────────────────────────────────────────
  const renderContent = () => {
    if (activeModule === 'overview') {
      return (
        <div>
          <div className="page-header">
            <div className="page-title"><h2>Guard Dashboard</h2><p>Welcome, {user.username}! Monitor and manage gate operations.</p></div>
            <div className="current-time"><Clock size={18} /><span>{new Date().toLocaleTimeString()}</span></div>
          </div>
          <div className="stats-grid guard-overview-stats">
            <StatCard title="Today's Entries"    value={stats.todayEntries}         icon={LogIn}       color="green"  />
            <StatCard title="Today's Exits"      value={stats.todayExits}           icon={LogOutIcon}  color="blue"   />
            <StatCard title="Today's Visitors"   value={stats.todayVisitorEntries}  icon={UserCheck}   color="purple" />
            <StatCard title="Today's Deliveries" value={stats.todayDeliveryEntries} icon={Package}     color="orange" />
            <StatCard title="Active Visitors"    value={stats.activeVisitors}       icon={AlertCircle} color="orange" />
          </div>
          <div className="guard-overview-board">
            <GuardAnnouncementPreview />
            <RecentActivityPreview />
          </div>
          <div className="quick-actions-section guard-overview-actions">
            <h3>Quick Actions</h3>
            <div className="quick-actions-grid">
              {canAccessModule('search') && (
                <button onClick={() => setActiveModule('search')} className="quick-action-btn bg-blue-50">
                  <Search className="text-blue-600" size={20} />
                  <p>Search Resident</p>
                </button>
              )}
              {canAccessModule('entry-log') && (
                <button onClick={() => setActiveModule('entry-log')} className="quick-action-btn bg-green-50">
                  <LogIn className="text-green-600" size={20} />
                  <p>Log Entry</p>
                </button>
              )}
              {canAccessModule('exit-log') && (
                <button onClick={() => setActiveModule('exit-log')} className="quick-action-btn bg-orange-50">
                  <LogOutIcon className="text-orange-600" size={20} />
                  <p>Log Exit</p>
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    if (activeModule === 'search') {
      return (
        <div>
          <div className="page-header"><div className="page-title"><h2>Search Resident/Vehicle</h2><p>Search for residents or vehicles in the system</p></div></div>
          <div className="search-section">
            <div className="search-controls">
              <div className="guard-search-toolbar">
                <div className="guard-search-toggle-group">
                  <button
                    className={searchType === 'resident' ? 'toggle-btn active' : 'toggle-btn'}
                    onClick={() => { setSearchType('resident'); setSearchQuery(''); setSearchResults([]); }}
                    type="button"
                  >
                    <User size={14} />Resident
                  </button>
                  <button
                    className={searchType === 'vehicle' ? 'toggle-btn active' : 'toggle-btn'}
                    onClick={() => { setSearchType('vehicle'); setSearchQuery(''); setSearchResults([]); }}
                    type="button"
                  >
                    <Car size={14} />Vehicle
                  </button>
                </div>

                <div className="guard-search-input-row">
                  <div className="guard-search-input-wrap">
                    <Search size={16} className="guard-search-inline-icon" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={searchType === 'resident' ? 'Name or address...' : 'Plate number...'}
                      className="search-input guard-search-input"
                      onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    />
                  </div>
                  <button
                    onClick={handleSearch}
                    disabled={loading}
                    className="search-btn guard-search-btn"
                    type="button"
                  >
                    <Search size={15} />{loading ? 'Searching...' : 'Search'}
                  </button>
                </div>
              </div>
            </div>

            <div className="search-results">
              {searchResults.length === 0
                ? <div className="empty-state"><Search size={40} style={{ color: '#9ca3af' }} /><h3>No Results</h3><p>Try searching for a resident or vehicle</p></div>
                : <div className="results-grid">
                    {searchResults.map((result, idx) => (
                      <div key={idx} className="result-card">
                        <div className="result-header"><h3>{result.familyName || result.ownerName}</h3><CheckCircle size={20} className="text-green-600" /></div>
                        <div className="result-details">
                          <div className="result-detail"><MapPin size={16} /><span>{result.houseAddress}, {result.street}</span></div>
                          <div className="result-detail"><Phone size={16} /><span>{result.phoneNumber || 'N/A'}</span></div>
                          {result.plateNumber && <>
                            <div className="result-detail"><Car size={16} /><span>{result.plateNumber} - {result.vehicleType}</span></div>
                            <div className="result-detail"><span style={{ marginLeft: '22px', fontSize: '0.875rem', color: '#6b7280' }}>{result.brand} {result.model} ({result.color})</span></div>
                          </>}
                        </div>
                      </div>
                    ))}
                  </div>}
            </div>
          </div>
        </div>
      );
    }

    if (activeModule === 'entry-log') {
      return (
        <div>
          <div className="page-header">
            <div className="page-title"><h2>Log Entry</h2><p>Register visitor, resident, or delivery entry</p></div>
          </div>

          {/* Full-width card, no max-width cap */}
          <div style={{ background: '#fff', borderRadius: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', padding: '1.75rem' }}>
            <form onSubmit={handleEntry}>

              {/* Entry Type Toggle — compact pill row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>Entry Type</span>
                <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: '10px', padding: '3px', gap: '2px' }}>
                  {[
                    { val: 'visitor',  icon: <UserCheck size={13} />, label: 'Visitor'  },
                    { val: 'resident', icon: <User      size={13} />, label: 'Resident' },
                    { val: 'delivery', icon: <Package   size={13} />, label: 'Delivery' },
                  ].map(t => (
                    <button key={t.val} type="button"
                      onClick={() => setEntryForm({ ...entryForm, visitorType: t.val })}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.45rem 1rem', fontSize: '0.8125rem', fontWeight: 600, border: 'none', borderRadius: '8px', cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.2s',
                        background: entryForm.visitorType === t.val ? 'linear-gradient(135deg,#10b981,#14b8a6)' : 'transparent',
                        color:      entryForm.visitorType === t.val ? '#fff' : '#6b7280',
                        boxShadow:  entryForm.visitorType === t.val ? '0 4px 12px rgba(16,185,129,0.3)' : 'none',
                      }}
                    >{t.icon}{t.label}</button>
                  ))}
                </div>
              </div>

              {/* Two-column body */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', alignItems: 'start' }}>

                {/* ── LEFT: Person Info ── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {entryForm.visitorType === 'visitor' ? 'Visitor Information' : entryForm.visitorType === 'delivery' ? 'Driver Information' : 'Resident'}
                  </p>

                  {entryForm.visitorType === 'visitor' && (<>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div className="form-group"><label>Last Name *</label><input type="text" value={entryForm.visitorLastName} onChange={(e) => setEntryForm({ ...entryForm, visitorLastName: toNameOnly(e.target.value).slice(0,30) })} placeholder="Last name" className="form-input" maxLength={30} required /></div>
                      <div className="form-group"><label>First Name *</label><input type="text" value={entryForm.visitorFirstName} onChange={(e) => setEntryForm({ ...entryForm, visitorFirstName: toNameOnly(e.target.value).slice(0,30) })} placeholder="First name" className="form-input" maxLength={30} required /></div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div className="form-group"><label>Middle Name</label><input type="text" value={entryForm.visitorMiddleName} onChange={(e) => setEntryForm({ ...entryForm, visitorMiddleName: toNameOnly(e.target.value).slice(0,30) })} placeholder="Optional" className="form-input" maxLength={30} /></div>
                      <div className="form-group"><label>Contact</label><input type="tel" value={entryForm.visitorContact} onChange={(e) => setEntryForm({ ...entryForm, visitorContact: toPhone(e.target.value, entryForm.visitorContact) })} onKeyDown={(e) => { if (e.target.selectionStart <= 3 && e.key === 'Backspace') e.preventDefault(); }} placeholder="+639XXXXXXXXX" className="form-input" maxLength="13" /></div>
                    </div>
                    <div className="form-group">
                      <label>Resident to Visit *</label>
                      {entryForm.hostResidentId
                        ? <div className="selected-resident-card"><div className="selected-resident-info"><div className="selected-resident-name">{entryForm.hostResidentName}</div><div className="selected-resident-address">{entryForm.hostResidentAddress}</div></div><button type="button" onClick={() => { setEntryForm({ ...entryForm, hostResidentId: '', hostResidentName: '', hostResidentAddress: '' }); setResidentSearchQuery(''); }} className="change-resident-btn">Change</button></div>
                        : <div className="resident-search-container">
                            <input type="text" value={residentSearchQuery} onChange={(e) => { setResidentSearchQuery(e.target.value); setShowResidentDropdown(true); setResidentDropdownType('host'); }} onFocus={() => { setShowResidentDropdown(true); setResidentDropdownType('host'); }} placeholder="Search resident..." className="form-input" />
                            {showResidentDropdown && residentDropdownType === 'host' && (
                              <div className="resident-dropdown">
                                {filteredResidents.length === 0 ? <div className="resident-dropdown-item disabled">No residents found</div>
                                  : filteredResidents.slice(0,10).map(r => <div key={r._id} className="resident-dropdown-item" onClick={() => handleSelectResident(r,'host')}><div className="resident-dropdown-name">{r.familyName}</div><div className="resident-dropdown-address">{r.houseAddress}, {r.street}</div></div>)}
                              </div>
                            )}
                          </div>}
                    </div>
                    <div className="form-group">
                      <label>Purpose *</label>
                      <textarea value={entryForm.purposeOfVisit} onChange={(e) => setEntryForm({ ...entryForm, purposeOfVisit: toNoSpecial(e.target.value).slice(0,50) })} placeholder="Reason for visit" className="form-textarea-compact" rows="2" maxLength={50} required />
                      <small style={{ color: '#9ca3af', fontSize: '0.72rem' }}>{entryForm.purposeOfVisit.length}/50</small>
                    </div>
                  </>)}

                  {entryForm.visitorType === 'resident' && (
                    <div className="form-group">
                      <label>Select Resident *</label>
                      {entryForm.residentId
                        ? <div className="selected-resident-card"><div className="selected-resident-info"><div className="selected-resident-name">{entryForm.residentName}</div><div className="selected-resident-address">{entryForm.residentAddress}</div></div><button type="button" onClick={() => { setEntryForm({ ...entryForm, residentId: '', residentName: '', residentAddress: '' }); setResidentSearchQuery(''); }} className="change-resident-btn">Change</button></div>
                        : <div className="resident-search-container">
                            <input type="text" value={residentSearchQuery} onChange={(e) => { setResidentSearchQuery(e.target.value); setShowResidentDropdown(true); setResidentDropdownType('resident'); }} onFocus={() => { setShowResidentDropdown(true); setResidentDropdownType('resident'); }} placeholder="Search resident..." className="form-input" />
                            {showResidentDropdown && residentDropdownType === 'resident' && (
                              <div className="resident-dropdown">
                                {filteredResidents.length === 0 ? <div className="resident-dropdown-item disabled">No residents found</div>
                                  : filteredResidents.slice(0,10).map(r => <div key={r._id} className="resident-dropdown-item" onClick={() => handleSelectResident(r,'resident')}><div className="resident-dropdown-name">{r.familyName}</div><div className="resident-dropdown-address">{r.houseAddress}, {r.street}</div></div>)}
                              </div>
                            )}
                          </div>}
                    </div>
                  )}

                  {entryForm.visitorType === 'delivery' && (<>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div className="form-group"><label>Driver Last Name *</label><input type="text" value={entryForm.deliveryLastName} onChange={(e) => setEntryForm({ ...entryForm, deliveryLastName: toNameOnly(e.target.value).slice(0,30) })} placeholder="Last name" className="form-input" maxLength={30} required /></div>
                      <div className="form-group"><label>Driver First Name *</label><input type="text" value={entryForm.deliveryFirstName} onChange={(e) => setEntryForm({ ...entryForm, deliveryFirstName: toNameOnly(e.target.value).slice(0,30) })} placeholder="First name" className="form-input" maxLength={30} required /></div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div className="form-group"><label>Middle Name</label><input type="text" value={entryForm.deliveryMiddleName} onChange={(e) => setEntryForm({ ...entryForm, deliveryMiddleName: toNameOnly(e.target.value).slice(0,30) })} placeholder="Optional" className="form-input" maxLength={30} /></div>
                      <div className="form-group"><label>Contact</label><input type="tel" value={entryForm.deliveryContact} onChange={(e) => setEntryForm({ ...entryForm, deliveryContact: toPhone(e.target.value, entryForm.deliveryContact) })} onKeyDown={(e) => { if (e.target.selectionStart <= 3 && e.key === 'Backspace') e.preventDefault(); }} placeholder="+639XXXXXXXXX" className="form-input" maxLength="13" /></div>
                    </div>
                    <div className="form-group">
                      <label>Delivery Address *</label>
                      {entryForm.deliveryResidentId
                        ? <div className="selected-resident-card"><div className="selected-resident-info"><div className="selected-resident-name">{entryForm.deliveryResidentName}</div><div className="selected-resident-address">{entryForm.deliveryResidentAddress}</div></div><button type="button" onClick={() => { setEntryForm({ ...entryForm, deliveryResidentId: '', deliveryResidentName: '', deliveryResidentAddress: '' }); setResidentSearchQuery(''); }} className="change-resident-btn">Change</button></div>
                        : <div className="resident-search-container">
                            <input type="text" value={residentSearchQuery} onChange={(e) => { setResidentSearchQuery(e.target.value); setShowResidentDropdown(true); setResidentDropdownType('delivery'); }} onFocus={() => { setShowResidentDropdown(true); setResidentDropdownType('delivery'); }} placeholder="Search address..." className="form-input" />
                            {showResidentDropdown && residentDropdownType === 'delivery' && (
                              <div className="resident-dropdown">
                                {filteredResidents.length === 0 ? <div className="resident-dropdown-item disabled">No residents found</div>
                                  : filteredResidents.slice(0,10).map(r => <div key={r._id} className="resident-dropdown-item" onClick={() => handleSelectResident(r,'delivery')}><div className="resident-dropdown-name">{r.familyName}</div><div className="resident-dropdown-address">{r.houseAddress}, {r.street}</div></div>)}
                              </div>
                            )}
                          </div>}
                    </div>
                  </>)}
                </div>

                {/* ── RIGHT: Vehicle Info + Notes + Submit ── */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                  <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 700, color: '#10b981', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Vehicle Info <span style={{ color: '#9ca3af', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>(optional)</span></p>

                  <div style={{ background: '#f9fafb', borderRadius: '14px', padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                      <div className="form-group"><label>Plate No.</label><input type="text" value={entryForm.plateNumber} onChange={(e) => setEntryForm({ ...entryForm, plateNumber: toAlphaNum(e.target.value).toUpperCase().slice(0,7) })} placeholder="ABC1234" className="form-input" maxLength={7} /></div>
                      <div className="form-group"><label>Type</label>
                        <select value={entryForm.vehicleType} onChange={(e) => setEntryForm({ ...entryForm, vehicleType: e.target.value })} className="form-input">
                          <option value="">Select</option>
                          <option value="car">Car</option>
                          <option value="motorcycle">Motorcycle</option>
                          <option value="suv">SUV</option>
                          <option value="van">Van</option>
                          <option value="truck">Truck</option>
                        </select>
                      </div>
                    </div>
                    <div className="form-group"><label>Color</label><input type="text" value={entryForm.vehicleColor} onChange={(e) => setEntryForm({ ...entryForm, vehicleColor: toLettersOnly(e.target.value).slice(0,20) })} placeholder="e.g., White" className="form-input" maxLength={20} /></div>
                  </div>

                  <div className="form-group">
                    <label>Notes <span style={{ color: '#9ca3af', fontWeight: 400 }}>(optional)</span></label>
                    <textarea value={entryForm.notes} onChange={(e) => setEntryForm({ ...entryForm, notes: toNoSpecial(e.target.value).slice(0,50) })} placeholder="Additional notes..." className="form-textarea-compact" rows="3" maxLength={50} />
                    <small style={{ color: '#9ca3af', fontSize: '0.72rem' }}>{entryForm.notes.length}/50</small>
                  </div>

                  <button type="submit" className="submit-btn" disabled={loading} style={{ marginTop: 'auto' }}>
                    <LogIn size={18} />{loading ? 'Logging...' : 'Log Entry'}
                  </button>
                </div>

              </div>
            </form>
          </div>
        </div>
      );
    }

    if (activeModule === 'exit-log') {
      const filteredResidentsForExit = residents.filter(r => r.familyName.toLowerCase().includes(itemSearchQuery.toLowerCase()) || r.houseAddress.toLowerCase().includes(itemSearchQuery.toLowerCase()) || r.street.toLowerCase().includes(itemSearchQuery.toLowerCase()));
      const exitList = exitType === 'visitor' ? filteredVisitors : exitType === 'delivery' ? filteredDeliveries : filteredResidentsForExit;
      const fieldBox = { display: 'flex', flexDirection: 'column', gap: '0.25rem' };
      const fieldLabel = { fontSize: '0.7rem', fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.04em' };
      const fieldVal = { fontSize: '0.9rem', fontWeight: 600, color: '#111827' };

      return (
        <div>
          <div className="page-header"><div className="page-title"><h2>Log Exit</h2><p>Record visitor, delivery, or resident departure</p></div></div>

          {!selectedItem && !residentForExit ? (
            <div>
              {/* Type + Search — single compact row */}
              <div style={{ background: 'white', borderRadius: '16px', padding: '1rem 1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.08)', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.875rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', background: '#f3f4f6', borderRadius: '10px', padding: '3px', gap: '2px', flexShrink: 0 }}>
                  {[{v:'visitor',icon:<UserCheck size={13}/>,l:'Visitor'},{v:'delivery',icon:<Package size={13}/>,l:'Delivery'},{v:'resident',icon:<User size={13}/>,l:'Resident'}].map(({v,icon,l}) => (
                    <button key={v} type="button"
                      onClick={() => { setExitType(v); setItemSearchQuery(''); setSelectedItem(null); setResidentForExit(null); }}
                      style={{ display:'flex', alignItems:'center', gap:'0.3rem', padding:'0.45rem 1rem', fontSize:'0.8125rem', fontWeight:700, border:'none', borderRadius:'8px', cursor:'pointer', fontFamily:'inherit', transition:'all 0.2s',
                        background: exitType===v ? 'linear-gradient(135deg,#f97316,#ea580c)' : 'transparent',
                        color: exitType===v ? 'white' : '#6b7280',
                        boxShadow: exitType===v ? '0 2px 8px rgba(249,115,22,0.3)' : 'none' }}>
                      {icon}{l}
                    </button>
                  ))}
                </div>
                <div style={{ position:'relative', flex:1, minWidth:'200px' }}>
                  <Search size={15} style={{ position:'absolute', left:'0.75rem', top:'50%', transform:'translateY(-50%)', color:'#9ca3af', pointerEvents:'none' }} />
                  <input type="text" value={itemSearchQuery} onChange={(e) => setItemSearchQuery(e.target.value)}
                    placeholder={exitType==='visitor' ? 'Name or host...' : exitType==='delivery' ? 'Driver name or address...' : 'Resident name or address...'}
                    style={{ width:'100%', padding:'0.55rem 1rem 0.55rem 2.25rem', border:'2px solid #e5e7eb', borderRadius:'10px', fontSize:'0.875rem', fontFamily:'inherit', fontWeight:500, outline:'none', boxSizing:'border-box' }} />
                </div>
                <span style={{ fontSize:'0.8125rem', fontWeight:700, color:'#9ca3af', flexShrink:0 }}>{exitList.length} found</span>
              </div>

              {/* Selection grid */}
              {exitList.length === 0 ? (
                <div className="empty-state">
                  {exitType==='visitor' ? <UserCheck size={40} style={{color:'#9ca3af'}}/> : exitType==='delivery' ? <Package size={40} style={{color:'#9ca3af'}}/> : <User size={40} style={{color:'#9ca3af'}}/>}
                  <h3>No {exitType==='visitor' ? 'Active Visitors' : exitType==='delivery' ? 'Active Deliveries' : 'Residents Found'}</h3>
                  <p>{itemSearchQuery ? 'Try a different search term' : exitType==='resident' ? 'Start typing to search' : `No ${exitType==='visitor'?'visitors':'deliveries'} currently inside`}</p>
                </div>
              ) : (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:'0.75rem' }}>
                  {exitList.map((item) => {
                    const isRes = exitType === 'resident';
                    const name  = isRes ? item.familyName : exitType==='visitor' ? item.name : item.driverName;
                    return (
                      <div key={item._id}
                        onClick={() => isRes ? setResidentForExit(item) : handleSelectItem(item, exitType)}
                        style={{ background:'white', border:'2px solid #e5e7eb', borderRadius:'14px', padding:'1rem 1.125rem', cursor:'pointer', transition:'all 0.2s', display:'flex', flexDirection:'column', gap:'0.5rem' }}
                        onMouseEnter={(e) => { e.currentTarget.style.borderColor='#f97316'; e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 8px 24px rgba(249,115,22,0.18)'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.borderColor='#e5e7eb'; e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='none'; }}>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:'0.625rem' }}>
                            <div style={{ width:'2rem', height:'2rem', borderRadius:'50%', background: isRes ? 'linear-gradient(135deg,#3b82f6,#60a5fa)' : exitType==='visitor' ? 'linear-gradient(135deg,#10b981,#14b8a6)' : 'linear-gradient(135deg,#8b5cf6,#a78bfa)', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontSize:'0.8125rem', fontWeight:700 }}>
                              {name?.[0]?.toUpperCase()||'?'}
                            </div>
                            <div>
                              <p style={{ margin:0, fontWeight:700, fontSize:'0.9375rem', color:'#111827' }}>{name}</p>
                              <p style={{ margin:0, fontSize:'0.75rem', color:'#6b7280', fontWeight:500 }}>
                                {isRes ? `${item.houseAddress}, ${item.street}` : exitType==='visitor' ? `Host: ${item.hostResidentName}` : `To: ${item.hostResidentName}`}
                              </p>
                            </div>
                          </div>
                          <span style={{ fontSize:'0.7rem', fontWeight:700, padding:'0.25rem 0.625rem', borderRadius:'6px', background: isRes ? '#dbeafe' : '#ecfdf5', color: isRes ? '#2563eb' : '#059669' }}>
                            {isRes ? 'Resident' : 'Inside'}
                          </span>
                        </div>
                        {!isRes && item.entryTime && (
                          <div style={{ display:'flex', alignItems:'center', gap:'0.375rem', fontSize:'0.775rem', color:'#9ca3af' }}>
                            <Clock size={11}/><span>{new Date(item.entryTime).toLocaleString()}</span>
                            {item.vehiclePlateNumber && <><Car size={11} style={{marginLeft:'0.375rem'}}/><span>{item.vehiclePlateNumber}</span></>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          ) : residentForExit ? (
            <div>
              <button onClick={() => setResidentForExit(null)} className="back-btn" style={{ marginBottom:'1rem' }}><X size={16}/>Back</button>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem', alignItems:'start' }}>
                <div style={{ background:'white', borderRadius:'16px', padding:'1.5rem', boxShadow:'0 1px 4px rgba(0,0,0,0.08)', display:'flex', flexDirection:'column', gap:'0.75rem' }}>
                  <p style={{ margin:0, fontSize:'0.75rem', fontWeight:700, color:'#3b82f6', textTransform:'uppercase', letterSpacing:'0.05em', borderBottom:'2px solid #dbeafe', paddingBottom:'0.5rem' }}>🏠 Resident Details</p>
                  <div style={fieldBox}><span style={fieldLabel}>Family Name</span><span style={fieldVal}>{residentForExit.familyName}</span></div>
                  <div style={fieldBox}><span style={fieldLabel}>Address</span><span style={{...fieldVal, fontSize:'0.875rem'}}>{residentForExit.houseAddress}, {residentForExit.street}</span></div>
                  <div style={fieldBox}><span style={fieldLabel}>Contact</span><span style={fieldVal}>{residentForExit.phoneNumber || 'N/A'}</span></div>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:'0.875rem' }}>
                  <div style={{ background:'#fff7ed', border:'2px solid #fed7aa', borderRadius:'16px', padding:'1.25rem', textAlign:'center' }}>
                    <LogOutIcon size={28} color="#f97316" style={{marginBottom:'0.5rem'}}/>
                    <p style={{ margin:0, fontWeight:700, fontSize:'1rem', color:'#111827' }}>Log exit for</p>
                    <p style={{ margin:'0.25rem 0 0', fontWeight:800, fontSize:'1.25rem', color:'#f97316' }}>{residentForExit.familyName}</p>
                  </div>
                  <button onClick={handleItemExit} disabled={loading} style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.625rem', padding:'0.875rem', background: loading?'#9ca3af':'linear-gradient(135deg,#f97316,#ea580c)', color:'white', border:'none', borderRadius:'14px', fontSize:'1rem', fontWeight:700, cursor: loading?'not-allowed':'pointer', boxShadow: loading?'none':'0 6px 18px rgba(249,115,22,0.35)', fontFamily:'inherit' }}>
                    <LogOutIcon size={18}/>{loading ? 'Logging...' : 'Confirm Exit'}
                  </button>
                </div>
              </div>
            </div>

          ) : selectedItem ? (
            <div>
              <button onClick={() => setSelectedItem(null)} className="back-btn" style={{ marginBottom:'1rem' }}><X size={16}/>Back</button>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'1rem', alignItems:'start' }}>
                <div style={{ background:'white', borderRadius:'16px', padding:'1.5rem', boxShadow:'0 1px 4px rgba(0,0,0,0.08)', display:'flex', flexDirection:'column', gap:'0.75rem' }}>
                  <p style={{ margin:0, fontSize:'0.75rem', fontWeight:700, color: exitType==='visitor'?'#10b981':'#8b5cf6', textTransform:'uppercase', letterSpacing:'0.05em', borderBottom:`2px solid ${exitType==='visitor'?'#d1fae5':'#ede9fe'}`, paddingBottom:'0.5rem' }}>
                    {exitType==='visitor' ? '👤 Visitor Details' : '📦 Delivery Details'}
                  </p>
                  <div style={fieldBox}><span style={fieldLabel}>{exitType==='visitor'?'Visitor Name':'Driver Name'}</span><span style={fieldVal}>{exitType==='visitor'?selectedItem.name:selectedItem.driverName}</span></div>
                  <div style={fieldBox}><span style={fieldLabel}>{exitType==='visitor'?'Host Resident':'Delivery To'}</span><span style={fieldVal}>{selectedItem.hostResidentName}</span></div>
                  <div style={fieldBox}><span style={fieldLabel}>Address</span><span style={{...fieldVal, fontSize:'0.875rem'}}>{selectedItem.hostResidentAddress}</span></div>
                  {exitType==='visitor' && selectedItem.purpose && <div style={fieldBox}><span style={fieldLabel}>Purpose</span><span style={{...fieldVal, fontSize:'0.875rem'}}>{selectedItem.purpose}</span></div>}
                  {selectedItem.contactNumber && <div style={fieldBox}><span style={fieldLabel}>Contact</span><span style={fieldVal}>{selectedItem.contactNumber}</span></div>}
                  {selectedItem.vehiclePlateNumber && (
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'0.5rem' }}>
                      <div style={fieldBox}><span style={fieldLabel}>Plate</span><span style={fieldVal}>{selectedItem.vehiclePlateNumber}</span></div>
                      {selectedItem.vehicleType  && <div style={fieldBox}><span style={fieldLabel}>Type</span><span style={{...fieldVal, textTransform:'capitalize'}}>{selectedItem.vehicleType}</span></div>}
                      {selectedItem.vehicleColor && <div style={fieldBox}><span style={fieldLabel}>Color</span><span style={fieldVal}>{selectedItem.vehicleColor}</span></div>}
                    </div>
                  )}
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:'0.875rem' }}>
                  <div style={{ background:'white', borderRadius:'16px', padding:'1.25rem', boxShadow:'0 1px 4px rgba(0,0,0,0.08)', display:'flex', flexDirection:'column', gap:'0.625rem' }}>
                    <p style={{ margin:0, fontSize:'0.75rem', fontWeight:700, color:'#f59e0b', textTransform:'uppercase', letterSpacing:'0.05em', borderBottom:'2px solid #fef3c7', paddingBottom:'0.5rem' }}>⏱ Time Inside</p>
                    <div style={fieldBox}><span style={fieldLabel}>Entry Time</span><span style={{...fieldVal, fontSize:'0.875rem'}}>{new Date(selectedItem.entryTime).toLocaleString()}</span></div>
                    <div style={fieldBox}>
                      <span style={fieldLabel}>Duration</span>
                      <span style={{...fieldVal, fontSize:'1.375rem', color:'#f97316'}}>
                        {(() => { const d=Date.now()-new Date(selectedItem.entryTime); const mins=Math.floor(d/(1000*60)); const hours=Math.floor(d/(1000*60*60)); const days=Math.floor(d/(1000*60*60*24)); const weeks=Math.floor(days/7); const months=Math.floor(days/30); if(months>=1) return `${months}mo ${days%30}d`; else if(weeks>=1) return `${weeks}wk ${days%7}d`; else if(days>=1) return `${days}d ${hours%24}h ${mins%60}m`; else return `${hours}h ${mins%60}m`; })()}
                      </span>
                    </div>
                  </div>
                  <div style={{ background:'#fff7ed', border:'2px solid #fed7aa', borderRadius:'16px', padding:'1rem', textAlign:'center' }}>
                    <p style={{ margin:0, fontWeight:700, fontSize:'0.9rem', color:'#111827' }}>Confirm exit for</p>
                    <p style={{ margin:'0.25rem 0 0', fontWeight:800, fontSize:'1.1rem', color:'#f97316' }}>{exitType==='visitor'?selectedItem.name:selectedItem.driverName}</p>
                  </div>
                  <button onClick={handleItemExit} disabled={loading} style={{ width:'100%', display:'flex', alignItems:'center', justifyContent:'center', gap:'0.625rem', padding:'0.875rem', background: loading?'#9ca3af':'linear-gradient(135deg,#f97316,#ea580c)', color:'white', border:'none', borderRadius:'14px', fontSize:'1rem', fontWeight:700, cursor: loading?'not-allowed':'pointer', boxShadow: loading?'none':'0 6px 18px rgba(249,115,22,0.35)', fontFamily:'inherit' }}>
                    <LogOutIcon size={18}/>{loading ? 'Logging Exit...' : 'Confirm Exit'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      );
    }
    const wrapModule = (content) => (
      <div className="module-stage">
        <div className="module-stage__inner">{content}</div>
      </div>
    );

    if (activeModule === 'pre-registered') return <PreRegisteredVisitorsContent />;

    if (activeModule === 'activity') {
      return (
        <div>
          <div className="page-header"><div className="page-title"><h2>Gate Activity Log</h2><p>View your recent activities and logs</p></div></div>
          <div className="dashboard-card">
            {!Array.isArray(myActivityLogs) || myActivityLogs.length === 0
              ? <div className="empty-state"><Clock size={40} style={{ color: '#9ca3af' }} /><h3>No Activity Yet</h3><p>Your activity will appear here</p></div>
              : <div className="activity-table">
                  <table>
                    <thead><tr><th>Plate Number</th><th>Type</th><th>Owner Type</th><th>Owner/Driver</th><th>Resident/Address</th><th>Date & Time</th><th>Notes</th></tr></thead>
                    <tbody>
                      {myActivityLogs.map((log, idx) => (
                        <tr key={log._id || idx}>
                          <td><strong>{log.plateNumber}</strong></td>
                          <td><span className={`badge badge-${log.logType === 'entry' ? 'green' : 'blue'}`}>{log.logType === 'entry' ? 'Entry' : 'Exit'}</span></td>
                          <td><span className="capitalize">{log.vehicleOwnerType || 'resident'}</span></td>
                          <td>{log.ownerName || '-'}</td>
                          <td>{log.residentName ? <><strong>{log.residentName}</strong>{log.residentAddress && <><br /><span style={{ fontSize: '0.75rem', color: '#6b7280' }}>{log.residentAddress}</span></>}</> : '-'}</td>
                          <td>{new Date(log.timestamp).toLocaleString()}</td>
                          <td>{log.notes || '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>}
          </div>
        </div>
      );
    }

    if (activeModule === 'facilities') return wrapModule(<GuardFacilityReservations token={token} />);
    if (activeModule === 'announcements') return wrapModule(<GuardAnnouncement token={token} />);
    if (activeModule === 'cctv') return wrapModule(<CCTVFeedsModule token={token} mode="guard" showAlert={showAlert} />);
    if (activeModule === 'subdivision_map') return wrapModule(<SubdivisionMap3D role={userRoleLabel} />);
    return null;
  };

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className={`guard-dashboard ${sidebarOpen ? 'sidebar-open' : 'sidebar-closed'}`}>
      <div className={`sidebar-backdrop ${sidebarOpen ? 'active' : ''}`} onClick={() => setSidebarOpen(false)} />
      <aside className={`guard-sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          {sidebarOpen && (
            <div className="sidebar-logo">
              <img src={ecohoa} alt="Ecotrend HOA Logo" style={{ width: '40px', height: '40px', objectFit: 'contain', borderRadius: '10px', background: '#fff', padding: '4px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)', flexShrink: 0 }} />
              <div><h1>Ecotrend HOA</h1><p>Guard Panel</p></div>
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

      <main className="guard-main">
        <header className="guard-header">
          <div className="header-content">
            <div className="header-title">
              <h2>{menuItems.find(item => item.id === activeModule)?.label || 'Overview'}</h2>
              <p>Ecotrend Homeowners Association</p>
            </div>
            <div className="header-user" onClick={() => setSidebarOpen(!sidebarOpen)} style={{ cursor: 'pointer' }}>
              <div className="user-info"><p className="user-name">{user.username}</p><p className="user-role">{userRoleLabel}</p></div>
              <div className="user-avatar">{user.username?.[0]?.toUpperCase() || 'G'}</div>
            </div>
          </div>
        </header>
        <div className="guard-content">
          <div key={activeModule} className="module-view-transition">
            {renderContent()}
          </div>
        </div>
      </main>
    </div>
  );
};

export default GuardDashboard;
