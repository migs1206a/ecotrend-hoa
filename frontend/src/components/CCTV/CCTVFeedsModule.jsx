import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Camera,
  CheckCircle,
  Edit3,
  ExternalLink,
  Loader,
  PlusCircle,
  Radio,
  Save,
  Trash2,
  X
} from 'lucide-react';
import { apiUrl } from '../../utils/api';
import './CCTVFeedsModule.css';
import PaginationControls from '../common/PaginationControls';
import { buildPaginatedUrl, parsePaginatedResponse } from '../../utils/pagination';

const API = apiUrl('/cctv-feeds');

const emptyForm = {
  name: '',
  location: '',
  streamUrl: '',
  status: 'active',
  notes: ''
};

const isEmbeddableVideoUrl = (url = '') => /\.(m3u8|mp4|webm|ogg)(\?.*)?$/i.test(url);
const isImageStreamUrl = (url = '') => /\.(mjpg|jpeg|jpg|png|gif)(\?.*)?$/i.test(url);
const isWebUrl = (url = '') => /^https?:\/\//i.test(url);
const isNativeStreamUrl = (url = '') => /^(rtsp|rtmp|ws|wss):\/\//i.test(url);

const normalizeForm = (feed = {}) => ({
  name: feed.name || '',
  location: feed.location || '',
  streamUrl: feed.streamUrl || '',
  status: feed.status || 'active',
  notes: feed.notes || ''
});

const CCTVPreview = ({ feed }) => {
  const streamUrl = String(feed?.streamUrl || '').trim();
  const status = String(feed?.status || 'active');

  if (!streamUrl) {
    return (
      <div className="cctv-feed-placeholder">
        <Camera size={34} />
        <h4>Ready for CCTV details</h4>
        <p>Add the stream URL once the camera IP or NVR link is available.</p>
      </div>
    );
  }

  if (status !== 'active') {
    return (
      <div className="cctv-feed-placeholder muted">
        <Radio size={34} />
        <h4>Feed inactive</h4>
        <p>This camera is saved but currently hidden from live monitoring.</p>
      </div>
    );
  }

  if (isImageStreamUrl(streamUrl)) {
    return <img src={streamUrl} alt={`${feed.name} CCTV feed`} className="cctv-feed-media" />;
  }

  if (isEmbeddableVideoUrl(streamUrl)) {
    return (
      <video className="cctv-feed-media" src={streamUrl} controls muted playsInline>
        <track kind="captions" />
      </video>
    );
  }

  if (isWebUrl(streamUrl)) {
    return <iframe src={streamUrl} title={`${feed.name} CCTV feed`} className="cctv-feed-frame" />;
  }

  if (isNativeStreamUrl(streamUrl)) {
    return (
      <div className="cctv-feed-placeholder">
        <Radio size={34} />
        <h4>Native stream saved</h4>
        <p>RTSP/RTMP feeds may need an NVR, browser gateway, or HLS converter before previewing here.</p>
      </div>
    );
  }

  return (
    <div className="cctv-feed-placeholder">
      <Camera size={34} />
      <h4>Feed URL saved</h4>
      <p>Preview will appear when the URL is browser-compatible.</p>
    </div>
  );
};

const CCTVFeedsModule = ({ token, mode = 'admin', showAlert, showConfirm }) => {
  const isAdmin = mode === 'admin';
  const [feeds, setFeeds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);

  const authHeaders = useMemo(
    () => ({
      Authorization: `Bearer ${token}`
    }),
    [token]
  );

  const jsonHeaders = useMemo(
    () => ({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    }),
    [token]
  );

  const fetchFeeds = useCallback(async (targetPage = page) => {
    try {
      const response = await fetch(apiUrl(buildPaginatedUrl('/cctv-feeds', targetPage)), { headers: authHeaders });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || 'Failed to load CCTV feeds.');
      }

      const parsed = parsePaginatedResponse(data);
      setFeeds(parsed.items);
      setPagination(parsed.pagination);
    } catch (error) {
      showAlert?.(error.message || 'Failed to load CCTV feeds.', 'error');
      setFeeds([]);
      setPagination(null);
    }
  }, [authHeaders, page, showAlert]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchFeeds(page);
      setLoading(false);
    })();
  }, [fetchFeeds, page]);

  const updateForm = (field, value) => {
    const maxLength = field === 'streamUrl' ? 1000 : field === 'notes' ? 250 : field === 'location' ? 120 : 80;
    setForm((current) => ({
      ...current,
      [field]: String(value || '').slice(0, maxLength)
    }));
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId('');
  };

  const startEdit = (feed) => {
    setEditingId(feed._id);
    setForm(normalizeForm(feed));
  };

  const validateForm = () => {
    if (!form.name.trim()) {
      return 'CCTV feed name is required.';
    }

    if (form.name.trim().length < 2) {
      return 'CCTV feed name must be at least 2 characters.';
    }

    if (form.streamUrl.trim() && !/^(https?:\/\/|rtsp:\/\/|rtmp:\/\/|ws:\/\/|wss:\/\/).+/i.test(form.streamUrl.trim())) {
      return 'Stream URL must start with http://, https://, rtsp://, rtmp://, ws://, or wss://.';
    }

    return '';
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      showAlert?.(validationError, 'error');
      return;
    }

    setSaving(true);

    try {
      const response = await fetch(editingId ? `${API}/${editingId}` : API, {
        method: editingId ? 'PUT' : 'POST',
        headers: jsonHeaders,
        body: JSON.stringify({
          name: form.name.trim(),
          location: form.location.trim(),
          streamUrl: form.streamUrl.trim(),
          status: form.status,
          notes: form.notes.trim()
        })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || 'Failed to save CCTV feed.');
      }

      showAlert?.(data.message || 'CCTV feed saved successfully.', 'success');
      resetForm();
      if (!editingId && page !== 1) {
        setPage(1);
      } else {
        await fetchFeeds(page);
      }
    } catch (error) {
      showAlert?.(error.message || 'Failed to save CCTV feed.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const runDelete = async (feed) => {
    setSaving(true);

    try {
      const response = await fetch(`${API}/${feed._id}`, {
        method: 'DELETE',
        headers: authHeaders
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.message || 'Failed to delete CCTV feed.');
      }

      showAlert?.(data.message || 'CCTV feed deleted successfully.', 'success');
      if (editingId === feed._id) resetForm();
      await fetchFeeds(page);
    } catch (error) {
      showAlert?.(error.message || 'Failed to delete CCTV feed.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (feed) => {
    if (showConfirm) {
      showConfirm(`Delete "${feed.name}" CCTV feed?`, () => runDelete(feed));
      return;
    }

    runDelete(feed);
  };

  return (
    <div className="cctv-module">
      <div className="page-header">
        <div className="page-title">
          <h2>CCTV Feeds</h2>
          <p>{isAdmin ? 'Prepare and maintain camera feed records for gate monitoring.' : 'View the CCTV feeds configured by the HOA officers.'}</p>
        </div>
      </div>

      {isAdmin && (
        <form className="cctv-editor" onSubmit={handleSubmit}>
          <div className="cctv-editor-head">
            <div>
              <h3>{editingId ? 'Update CCTV Feed' : 'Add CCTV Feed'}</h3>
              <p>Use names like Gate CCTV, Clubhouse CCTV, or Main Road CCTV.</p>
            </div>
            {editingId && (
              <button type="button" className="cctv-icon-btn" onClick={resetForm} title="Cancel editing">
                <X size={17} />
              </button>
            )}
          </div>

          <div className="cctv-form-grid">
            <label className="cctv-field">
              <span>Feed Name</span>
              <input value={form.name} onChange={(event) => updateForm('name', event.target.value)} placeholder="Gate CCTV" maxLength={80} />
            </label>

            <label className="cctv-field">
              <span>Location</span>
              <input value={form.location} onChange={(event) => updateForm('location', event.target.value)} placeholder="Main gate" maxLength={120} />
            </label>

            <label className="cctv-field">
              <span>Status</span>
              <select value={form.status} onChange={(event) => updateForm('status', event.target.value)}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>

            <label className="cctv-field cctv-field--wide">
              <span>Stream URL</span>
              <input value={form.streamUrl} onChange={(event) => updateForm('streamUrl', event.target.value)} placeholder="https://example.com/camera-feed or rtsp://camera-ip/stream" maxLength={1000} />
            </label>

            <label className="cctv-field cctv-field--wide">
              <span>Notes</span>
              <textarea value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} placeholder="Optional setup notes for this camera" maxLength={250} rows={3} />
            </label>
          </div>

          <div className="cctv-editor-actions">
            <button type="button" className="cctv-secondary-btn" onClick={resetForm} disabled={saving}>
              Reset
            </button>
            <button type="submit" className="cctv-primary-btn" disabled={saving}>
              {saving ? <Loader size={16} className="spin" /> : editingId ? <Save size={16} /> : <PlusCircle size={16} />}
              {editingId ? 'Save Changes' : 'Add Feed'}
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="cctv-loading">
          <Loader size={28} className="spin" />
          <p>Loading CCTV feeds...</p>
        </div>
      ) : feeds.length === 0 ? (
        <div className="cctv-empty">
          <Camera size={42} />
          <h3>No CCTV feeds yet</h3>
          <p>{isAdmin ? 'Add a feed record now, then fill in the stream URL once the CCTV details are available.' : 'No CCTV feeds have been configured yet.'}</p>
        </div>
      ) : (
        <div className="cctv-feed-grid">
          {feeds.map((feed) => (
            <article key={feed._id} className={`cctv-feed-card ${feed.status !== 'active' ? 'is-inactive' : ''}`}>
              <div className="cctv-feed-screen">
                <CCTVPreview feed={feed} />
              </div>

              <div className="cctv-feed-body">
                <div>
                  <div className="cctv-feed-title-row">
                    <h3>{feed.name}</h3>
                    <span className={`cctv-status ${feed.status === 'active' ? 'active' : 'inactive'}`}>
                      <CheckCircle size={13} />
                      {feed.status === 'active' ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  {feed.location && <p className="cctv-location">{feed.location}</p>}
                  {feed.notes && <p className="cctv-notes">{feed.notes}</p>}
                </div>

                <div className="cctv-feed-actions">
                  {feed.streamUrl && (
                    <a href={feed.streamUrl} target="_blank" rel="noopener noreferrer" className="cctv-link-btn">
                      <ExternalLink size={15} />
                      Open
                    </a>
                  )}
                  {isAdmin && (
                    <>
                      <button type="button" className="cctv-secondary-btn" onClick={() => startEdit(feed)}>
                        <Edit3 size={15} />
                        Edit
                      </button>
                      <button type="button" className="cctv-danger-btn" onClick={() => handleDelete(feed)} disabled={saving}>
                        <Trash2 size={15} />
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      <PaginationControls pagination={pagination} onPageChange={setPage} />
    </div>
  );
};

export default CCTVFeedsModule;
