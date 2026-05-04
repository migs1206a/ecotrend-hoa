import React, { useCallback, useState, useEffect } from 'react';
import { apiUrl } from '../../utils/api';
import { 
  Bell, Calendar, Clock, AlertCircle, Search,
  Shield, Users, ChevronDown, X
} from 'lucide-react';
import './GuardAnnouncement.css';
import PaginationControls from '../common/PaginationControls';
import { buildPaginatedUrl, parsePaginatedResponse } from '../../utils/pagination';

const GuardAnnouncements = ({ token }) => {
  const [announcements, setAnnouncements]           = useState([]);
  const [loading, setLoading]                       = useState(false);
  const [searchQuery, setSearchQuery]               = useState('');
  const [selectedCategory, setSelectedCategory]     = useState('all');
  const [expandedAnnouncement, setExpandedAnnouncement] = useState(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);

  const fetchAnnouncements = useCallback(async (targetPage = page) => {
    setLoading(true);
    try {
      const response = await fetch(apiUrl(buildPaginatedUrl('/announcements', targetPage, {
        activeOnly: true,
        audience: 'guards',
        category: selectedCategory,
        search: searchQuery
      })), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        const parsed = parsePaginatedResponse(data);
        setAnnouncements(parsed.items);
        setPagination(parsed.pagination);
      }
    } catch (error) { console.error('Error fetching announcements:', error); setAnnouncements([]); setPagination(null); }
    setLoading(false);
  }, [page, searchQuery, selectedCategory, token]);

  useEffect(() => { setPage(1); }, [searchQuery, selectedCategory]);
  useEffect(() => { fetchAnnouncements(page); }, [fetchAnnouncements, page]);

  const filteredAnnouncements = announcements;

  const CATEGORY = {
    urgent:      { label: 'Urgent',      color: '#dc2626', bg: '#fee2e2' },
    maintenance: { label: 'Maintenance', color: '#d97706', bg: '#fef3c7' },
    events:      { label: 'Events',      color: '#7c3aed', bg: '#ede9fe' },
    general:     { label: 'General',     color: '#2563eb', bg: '#dbeafe' },
  };

  const CATEGORIES = [
    { value: 'all',         label: 'All' },
    { value: 'urgent',      label: 'Urgent' },
    { value: 'maintenance', label: 'Maintenance' },
    { value: 'events',      label: 'Events' },
    { value: 'general',     label: 'General' },
  ];

  const formatRelativeTime = (dateString) => {
    const date = new Date(dateString);
    const now  = new Date();
    const mins  = Math.floor(Math.abs(now - date) / 60000);
    const hours = Math.floor(mins / 60);
    const days  = Math.floor(hours / 24);
    if (mins < 60)  return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7)   return `${days}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatDate = (d) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

  const todayCount  = filteredAnnouncements.filter(a => new Date(a.createdAt).toDateString() === new Date().toDateString()).length;
  const urgentCount = filteredAnnouncements.filter(a => a.category === 'urgent').length;

  return (
    <div className="ga-root">

      {/* ── Header ── */}
      <div className="ga-topbar">
        <div className="ga-header-left">
          <div className="ga-shield-icon"><Shield size={22} /></div>
          <div>
            <h2 className="ga-title">Security Announcements</h2>
            <p className="ga-subtitle">Active updates and instructions for security personnel</p>
          </div>
        </div>
      </div>

      {/* ── Stats Strip ── */}
      <div className="ga-stats">
        {[
          { label: 'Active',    value: filteredAnnouncements.length, icon: <Bell size={17} />,       accent: '#3b82f6', bg: '#dbeafe' },
          { label: 'Urgent',    value: urgentCount,                  icon: <AlertCircle size={17} />, accent: '#dc2626', bg: '#fee2e2' },
          { label: 'New Today', value: todayCount,                   icon: <Shield size={17} />,      accent: '#d97706', bg: '#fef3c7' },
        ].map(s => (
          <div key={s.label} className="ga-stat">
            <div className="ga-stat-icon" style={{ background: s.bg, color: s.accent }}>{s.icon}</div>
            <div>
              <p className="ga-stat-label">{s.label}</p>
              <p className="ga-stat-value" style={{ color: s.accent }}>{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Search + Category Filter (single row) ── */}
      <div className="ga-controls">
        {/* Search */}
        <div className="ga-search-wrap">
          <Search size={15} className="ga-search-icon" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search announcements..."
            className="ga-search"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="ga-search-clear"><X size={14} /></button>
          )}
        </div>

        {/* Category Pills */}
        <div className="ga-category-pills">
          {CATEGORIES.map(c => (
            <button
              key={c.value}
              onClick={() => setSelectedCategory(c.value)}
              className={`ga-pill ${selectedCategory === c.value ? 'ga-pill-active' : ''}`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── List ── */}
      {loading ? (
        <div className="ga-loading">
          <div className="ga-spinner" />
          <p>Loading announcements...</p>
        </div>
      ) : filteredAnnouncements.length === 0 ? (
        <div className="ga-empty">
          <div className="ga-empty-icon"><Shield size={36} /></div>
          <h3>{searchQuery || selectedCategory !== 'all' ? 'No Results Found' : 'No Announcements'}</h3>
          <p>{searchQuery ? 'Try different keywords' : selectedCategory !== 'all' ? 'No announcements in this category' : 'Check back later for security updates'}</p>
        </div>
      ) : (
        <div className="ga-list">
          {filteredAnnouncements.map((a) => {
            const cat      = CATEGORY[a.category] || CATEGORY.general;
            const expanded = expandedAnnouncement === a._id;
            const isLong   = a.content.length > 220;
            return (
              <div key={a._id} className={`ga-card ${a.category === 'urgent' ? 'ga-card-urgent' : ''}`}>
                <div className="ga-card-stripe" style={{ background: cat.color }} />

                <div className="ga-card-body">
                  {/* Top row: badge + time */}
                  <div className="ga-card-top">
                    <span className="ga-badge" style={{ background: cat.bg, color: cat.color }}>{cat.label}</span>
                    <span className="ga-time">{formatRelativeTime(a.createdAt)}</span>
                  </div>

                  {/* Title */}
                  <h4 className="ga-card-title">{a.title}</h4>

                  {/* Content */}
                  <p className={`ga-card-content ${expanded ? 'ga-expanded' : ''}`}>{a.content}</p>

                  {isLong && (
                    <button className="ga-expand-btn" onClick={() => setExpandedAnnouncement(expanded ? null : a._id)}>
                      {expanded ? <><X size={13} />Show Less</> : <><ChevronDown size={13} />Read More</>}
                    </button>
                  )}
                </div>

                {/* Footer meta */}
                <div className="ga-card-footer">
                  <span className="ga-meta"><Calendar size={11} />{formatRelativeTime(a.createdAt)}</span>
                  {a.expiryDate && <span className="ga-meta"><Clock size={11} />Expires {formatDate(a.expiryDate)}</span>}
                  <span className="ga-meta">
                    {a.targetAudience === 'all' ? <Bell size={11} /> : a.targetAudience === 'guards' ? <Shield size={11} /> : <Users size={11} />}
                    {a.targetAudience === 'all' ? 'All' : a.targetAudience === 'guards' ? 'Guards' : 'Residents'}
                  </span>
                  <span className="ga-meta"><Users size={11} />{a.postedBy || 'HOA Admin'}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <PaginationControls pagination={pagination} onPageChange={setPage} />
    </div>
  );
};

export default GuardAnnouncements;
