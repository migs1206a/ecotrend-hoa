import React, { useCallback, useState, useEffect } from 'react';
import { apiUrl } from '../../utils/api';
import { 
  Bell, Calendar, Clock, AlertCircle, Search, Filter, X,
  Megaphone, Users, CheckCircle, Info, ChevronDown
} from 'lucide-react';
import './ResidentAnnouncements.css';
import PaginationControls from '../common/PaginationControls';
import { buildPaginatedUrl, parsePaginatedResponse } from '../../utils/pagination';

const ResidentAnnouncements = ({ token }) => {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [expandedAnnouncement, setExpandedAnnouncement] = useState(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);

  const fetchAnnouncements = useCallback(async (targetPage = page) => {
    setLoading(true);
    try {
      const response = await fetch(apiUrl(buildPaginatedUrl('/announcements', targetPage, {
        activeOnly: true,
        audience: 'residents',
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
    } catch (error) {
      console.error('Error fetching announcements:', error);
      setAnnouncements([]);
      setPagination(null);
    }
    setLoading(false);
  }, [page, searchQuery, selectedCategory, token]);

  useEffect(() => {
    setPage(1);
  }, [searchQuery, selectedCategory]);

  useEffect(() => {
    fetchAnnouncements(page);
  }, [fetchAnnouncements, page]);

  const filteredAnnouncements = announcements;

  const getCategoryColor = (category) => {
    switch (category) {
      case 'urgent': return 'bg-red-100 text-red-700';
      case 'maintenance': return 'bg-yellow-100 text-yellow-700';
      case 'events': return 'bg-purple-100 text-purple-700';
      case 'general': return 'bg-green-100 text-green-700';
      default: return 'bg-green-100 text-green-700';
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatRelativeTime = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffTime / (1000 * 60 * 60));
    const diffMinutes = Math.floor(diffTime / (1000 * 60));

    if (diffMinutes < 60) {
      return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    } else if (diffDays < 7) {
      return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    } else {
      return formatDate(dateString);
    }
  };

  const toggleExpanded = (id) => {
    setExpandedAnnouncement(expandedAnnouncement === id ? null : id);
  };

  const categoryOptions = [
    { value: 'all', label: 'All Categories', color: 'bg-gray-50 text-gray-600' },
    { value: 'urgent', label: 'Urgent', color: 'bg-red-100 text-red-700' },
    { value: 'maintenance', label: 'Maintenance', color: 'bg-yellow-100 text-yellow-700' },
    { value: 'events', label: 'Events', color: 'bg-purple-100 text-purple-700' },
    { value: 'general', label: 'General', color: 'bg-green-100 text-green-700' }
  ];

  return (
    <div>
      <div className="page-header">
        <div className="page-title">
          <h2>Community Announcements</h2>
          <p>Stay updated with the latest news and important information</p>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="search-filter-section">
        <div className="search-input-group">
          <Search size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search announcements..."
            className="search-input"
            style={{ paddingLeft: '3rem' }}
          />
        </div>
        
        <button 
          onClick={() => setShowFilters(!showFilters)}
          className="filter-toggle-btn"
        >
          <Filter size={18} />
          Filters
          <ChevronDown size={16} className={`transition-transform ${showFilters ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {showFilters && (
        <div className="filters-panel">
          <div className="filter-group">
            <label>Category</label>
            <div className="category-filters">
              {categoryOptions.map((option) => (
                <button
                  key={option.value}
                  onClick={() => setSelectedCategory(option.value)}
                  className={`category-filter-btn ${selectedCategory === option.value ? 'active' : ''}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Announcement Stats */}
      <div className="announcements-summary">
        <div className="summary-item">
          <div className="summary-icon bg-green-50">
            <Bell className="text-green-600" size={20} />
          </div>
          <div className="summary-info">
            <p className="summary-label">Total Announcements</p>
            <p className="summary-value">{pagination?.total ?? filteredAnnouncements.length}</p>
          </div>
        </div>
        <div className="summary-item">
          <div className="summary-icon bg-red-50">
            <AlertCircle className="text-red-600" size={20} />
          </div>
          <div className="summary-info">
            <p className="summary-label">Urgent</p>
            <p className="summary-value">{filteredAnnouncements.filter(a => a.priority === 'urgent').length}</p>
          </div>
        </div>
        <div className="summary-item">
          <div className="summary-icon bg-blue-50">
            <Info className="text-blue-600" size={20} />
          </div>
          <div className="summary-info">
            <p className="summary-label">New Today</p>
            <p className="summary-value">{filteredAnnouncements.filter(a => {
              const today = new Date().toDateString();
              return new Date(a.createdAt).toDateString() === today;
            }).length}</p>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {loading ? (
        <div className="loading-container">
          <div className="spinner"></div>
          <p className="loading-text">Loading announcements...</p>
        </div>
      ) : filteredAnnouncements.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <Megaphone size={40} style={{ color: '#9ca3af' }} />
          </div>
          <h3>{searchQuery || selectedCategory !== 'all' ? 'No Announcements Found' : 'No Announcements Available'}</h3>
          <p>
            {searchQuery ? 'Try adjusting your search terms' : 
             selectedCategory !== 'all' ? 'No announcements match the selected filters' :
             'Check back later for new community updates'}
          </p>
        </div>
      ) : (
        <div className="announcements-list">
          {filteredAnnouncements.map((announcement) => (
            <div key={announcement._id} className="announcement-item">
              <div className="announcement-header">
                <div className="announcement-title-section">
                  <div className="announcement-title-row">
                    <h3>{announcement.title}</h3>
                    <span className={`category-badge ${getCategoryColor(announcement.category)}`}>
                      {announcement.category ? announcement.category.toUpperCase() : 'GENERAL'}
                    </span>
                  </div>
                  <div className="announcement-meta">
                    <div className="meta-item">
                      <Calendar size={14} />
                      <span>{formatRelativeTime(announcement.createdAt)}</span>
                    </div>
                    <div className="meta-item">
                      <Users size={14} />
                      <span>By: {announcement.postedBy || 'HOA Admin'}</span>
                    </div>
                    {announcement.expiryDate && (
                      <div className="meta-item">
                        <Clock size={14} />
                        <span>Expires: {formatDate(announcement.expiryDate)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="announcement-content">
                <div className={`content-text ${expandedAnnouncement === announcement._id ? 'expanded' : ''}`}>
                  <p>{announcement.content}</p>
                </div>
                {announcement.content.length > 200 && (
                  <button 
                    onClick={() => toggleExpanded(announcement._id)}
                    className="expand-btn"
                  >
                    {expandedAnnouncement === announcement._id ? (
                      <>
                        <X size={16} />
                        Show Less
                      </>
                    ) : (
                      <>
                        <ChevronDown size={16} />
                        Read More
                      </>
                    )}
                  </button>
                )}
              </div>
              
              <div className="announcement-footer">
                <div className="footer-info">
                  <CheckCircle size={14} className="text-green-600" />
                  <span>Active Announcement</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <PaginationControls pagination={pagination} onPageChange={setPage} />
    </div>
  );
};

export default ResidentAnnouncements;
