import React, { useCallback, useState, useEffect } from 'react';
import { apiUrl } from '../../utils/api';
import { 
  Bell, Plus, Send, Calendar, Clock, X, Edit2, Trash2,
  Megaphone, Users, FileText, CheckCircle, XCircle, Search
} from 'lucide-react';
import './AdminAnnouncementManagement.css';
import PaginationControls from '../common/PaginationControls';
import { buildPaginatedUrl, parsePaginatedResponse } from '../../utils/pagination';

const AdminAnnouncementManagement = ({ token, showConfirm, showAlert }) => {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    targetAudience: 'all',
    expiryDate: '',
    category: 'general'
  });

  const fetchAnnouncements = useCallback(async (targetPage = page) => {
    setLoading(true);
    try {
      const response = await fetch(apiUrl(buildPaginatedUrl('/announcements', targetPage, { search: searchQuery })), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        const parsed = parsePaginatedResponse(data);
        setAnnouncements(parsed.items);
        setPagination(parsed.pagination);
      }
    } catch (error) {
      console.error('Error fetching announcements:', error);
      setAnnouncements([]);
      setPagination(null);
    }
    setLoading(false);
  }, [page, searchQuery, token]);

  useEffect(() => { setPage(1); }, [searchQuery]);
  useEffect(() => { fetchAnnouncements(page); }, [fetchAnnouncements, page]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const requestData = { ...formData, postedBy: JSON.parse(localStorage.getItem('user') || '{}').username };
      const url    = editingAnnouncement ? apiUrl(`/announcements/${editingAnnouncement._id}`) : apiUrl('/announcements');
      const method = editingAnnouncement ? 'PUT' : 'POST';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(requestData)
      });
      if (response.ok) {
        showAlert && showAlert(editingAnnouncement ? 'Announcement updated successfully!' : 'Announcement posted successfully!', 'success');
        resetForm();
        if (page !== 1 && !editingAnnouncement) {
          setPage(1);
        } else {
          fetchAnnouncements(page);
        }
      } else {
        const errorData = await response.json();
        showAlert && showAlert(errorData.message || 'Failed to save announcement', 'error');
      }
    } catch (error) {
      console.error('Error saving announcement:', error);
      showAlert && showAlert('Failed to save announcement', 'error');
    }
    setLoading(false);
  };

  const handleEdit = (announcement) => {
    setEditingAnnouncement(announcement);
    setFormData({ title: announcement.title, content: announcement.content, targetAudience: announcement.targetAudience, expiryDate: announcement.expiryDate ? new Date(announcement.expiryDate).toISOString().split('T')[0] : '', category: announcement.category || 'general' });
    setShowForm(true);
  };

  const handleDelete = (id) => {
    const fn = showConfirm || ((msg) => console.warn(`Confirmation unavailable: ${msg}`));
    fn('Are you sure you want to delete this announcement?', async () => {
      setLoading(true);
      try {
        const response = await fetch(apiUrl(`/announcements/${id}`), { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } });
        if (response.ok) { showAlert && showAlert('Announcement deleted successfully!', 'success'); fetchAnnouncements(page); }
        else showAlert && showAlert('Failed to delete announcement', 'error');
      } catch (error) { console.error('Error deleting announcement:', error); showAlert && showAlert('Failed to delete announcement', 'error'); }
      setLoading(false);
    });
  };

  const resetForm = () => {
    setFormData({ title: '', content: '', targetAudience: 'all', expiryDate: '', category: 'general' });
    setEditingAnnouncement(null);
    setShowForm(false);
  };

  const filteredAnnouncements = announcements;

  const CATEGORY = {
    urgent:      { label: 'Urgent',      color: '#dc2626', bg: '#fee2e2' },
    maintenance: { label: 'Maintenance', color: '#d97706', bg: '#fef3c7' },
    events:      { label: 'Events',      color: '#7c3aed', bg: '#ede9fe' },
    general:     { label: 'General',     color: '#059669', bg: '#d1fae5' },
  };

  const AUDIENCE = {
    all:       'All',
    residents: 'Residents',
    guards:    'Guards',
  };

  const formatDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : 'No expiry';
  const isExpired  = (d) => d && new Date(d) < new Date();

  const activeCount  = announcements.filter(a => !isExpired(a.expiryDate)).length;
  const expiredCount = announcements.filter(a =>  isExpired(a.expiryDate)).length;

  return (
    <div className="ann-root">

      {/* ── Top Bar ── */}
      <div className="ann-topbar">
        <div>
          <h2 className="ann-title">Announcements</h2>
          <p className="ann-subtitle">Create and manage community announcements</p>
        </div>
        <button className="ann-post-btn" onClick={() => showForm ? resetForm() : setShowForm(true)}>
          {showForm ? <><X size={16} />Cancel</> : <><Plus size={16} />Post Announcement</>}
        </button>
      </div>

      {/* ── Stats Strip ── */}
      <div className="ann-stats">
        {[
          { label: 'Total', value: pagination?.total ?? announcements.length, icon: <Bell size={18} />, accent: '#3b82f6', bg: '#dbeafe' },
          { label: 'Active', value: activeCount,          icon: <CheckCircle size={18} />, accent: '#10b981', bg: '#d1fae5' },
          { label: 'Expired', value: expiredCount,        icon: <XCircle size={18} />,     accent: '#ef4444', bg: '#fee2e2' },
        ].map(s => (
          <div key={s.label} className="ann-stat">
            <div className="ann-stat-icon" style={{ background: s.bg, color: s.accent }}>{s.icon}</div>
            <div>
              <p className="ann-stat-label">{s.label}</p>
              <p className="ann-stat-value" style={{ color: s.accent }}>{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Create / Edit Form ── */}
      {showForm && (
        <div className="ann-form-card">
          <div className="ann-form-header">
            <div className="ann-form-indicator" />
            <h3>{editingAnnouncement ? 'Edit Announcement' : 'New Announcement'}</h3>
          </div>

          <form onSubmit={handleSubmit}>
            {/* Row 1: Title full width */}
            <div className="ann-form-group" style={{ marginBottom: '1rem' }}>
              <label>Title *</label>
              <input type="text" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} placeholder="Announcement title" className="ann-input" required />
            </div>

            {/* Row 2: Category | Audience | Expiry */}
            <div className="ann-form-row3">
              <div className="ann-form-group">
                <label>Category</label>
                <select value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} className="ann-input">
                  <option value="general">General</option>
                  <option value="urgent">Urgent</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="events">Events</option>
                </select>
              </div>
              <div className="ann-form-group">
                <label>Audience</label>
                <select value={formData.targetAudience} onChange={(e) => setFormData({ ...formData, targetAudience: e.target.value })} className="ann-input">
                  <option value="all">All</option>
                  <option value="residents">Residents Only</option>
                  <option value="guards">Guards Only</option>
                </select>
              </div>
              <div className="ann-form-group">
                <label>Expiry Date <span style={{ fontWeight: 400, color: '#9ca3af' }}>(optional)</span></label>
                <input type="date" value={formData.expiryDate} onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })} className="ann-input" min={new Date().toISOString().split('T')[0]} />
              </div>
            </div>

            {/* Row 3: Content */}
            <div className="ann-form-group" style={{ marginBottom: '1.5rem' }}>
              <label>Details *</label>
              <textarea value={formData.content} onChange={(e) => setFormData({ ...formData, content: e.target.value })} placeholder="Write your announcement here..." className="ann-input ann-textarea" rows={5} required />
            </div>

            {/* Actions */}
            <div className="ann-form-actions">
              <button type="button" onClick={resetForm} className="ann-cancel-btn"><XCircle size={16} />Cancel</button>
              <button type="submit" className="ann-submit-btn" disabled={loading}><Send size={16} />{loading ? 'Posting...' : (editingAnnouncement ? 'Update' : 'Post Announcement')}</button>
            </div>
          </form>
        </div>
      )}

      {/* ── Search ── */}
      <div className="ann-search-wrap">
        <Search size={16} className="ann-search-icon" />
        <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by title or content..." className="ann-search" />
      </div>

      {/* ── Grid ── */}
      {loading ? (
        <div className="ann-loading"><div className="ann-spinner" /><p>Loading announcements...</p></div>
      ) : filteredAnnouncements.length === 0 ? (
        <div className="ann-empty">
          <div className="ann-empty-icon"><Megaphone size={36} /></div>
          <h3>{searchQuery ? 'No results found' : 'No announcements yet'}</h3>
          <p>{searchQuery ? 'Try different keywords' : 'Post your first announcement to keep everyone informed'}</p>
        </div>
      ) : (
        <div className="ann-grid">
          {filteredAnnouncements.map((a) => {
            const cat     = CATEGORY[a.category] || CATEGORY.general;
            const expired = isExpired(a.expiryDate);
            return (
              <div key={a._id} className={`ann-card ${expired ? 'ann-card-expired' : ''}`}>

                {/* Top accent stripe */}
                <div className="ann-card-stripe" style={{ background: expired ? '#d1d5db' : cat.color }} />

                <div className="ann-card-body">
                  {/* Header row */}
                  <div className="ann-card-header">
                    <div className="ann-card-badges">
                      <span className="ann-badge" style={{ background: cat.bg, color: cat.color }}>{cat.label}</span>
                      <span className="ann-badge ann-badge-audience">
                        {a.targetAudience === 'all' ? <Bell size={11} /> : a.targetAudience === 'residents' ? <Users size={11} /> : <FileText size={11} />}
                        {AUDIENCE[a.targetAudience] || 'All'}
                      </span>
                      {expired && <span className="ann-badge ann-badge-expired"><XCircle size={11} />Expired</span>}
                    </div>
                    <div className="ann-card-actions">
                      <button onClick={() => handleEdit(a)} className="ann-icon-btn ann-icon-edit" title="Edit"><Edit2 size={14} /></button>
                      <button onClick={() => handleDelete(a._id)} className="ann-icon-btn ann-icon-delete" title="Delete"><Trash2 size={14} /></button>
                    </div>
                  </div>

                  {/* Title */}
                  <h4 className="ann-card-title">{a.title}</h4>

                  {/* Content */}
                  <p className="ann-card-content">{a.content}</p>
                </div>

                {/* Footer */}
                <div className="ann-card-footer">
                  <span className="ann-meta-item"><Calendar size={12} />{formatDate(a.createdAt)}</span>
                  {a.expiryDate && <span className="ann-meta-item"><Clock size={12} />Expires {formatDate(a.expiryDate)}</span>}
                  <span className="ann-meta-item"><Users size={12} />{a.postedBy || 'Admin'}</span>
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

export default AdminAnnouncementManagement;
