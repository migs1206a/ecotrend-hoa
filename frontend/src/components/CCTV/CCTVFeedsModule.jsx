import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Camera,
  CheckCircle,
  Edit3,
  ExternalLink,
  Globe,
  KeyRound,
  Loader,
  PlusCircle,
  Radio,
  Save,
  Server,
  Shield,
  Trash2,
  Video,
  X
} from 'lucide-react';
import { apiUrl } from '../../utils/api';
import './CCTVFeedsModule.css';
import PaginationControls from '../common/PaginationControls';
import { buildPaginatedUrl, parsePaginatedResponse } from '../../utils/pagination';

const API = apiUrl('/cctv-feeds');

const SOURCE_TYPE_OPTIONS = [
  { value: 'rtsp', label: 'RTSP Camera' },
  { value: 'hybrid', label: 'RTSP + Browser Gateway' },
  { value: 'onvif', label: 'ONVIF Camera' },
  { value: 'browser', label: 'Browser Feed Only' }
];

const PROVIDER_OPTIONS = [
  'TP-Link Tapo',
  'Agent DVR',
  'go2rtc',
  'MediaMTX',
  'Custom'
];

const emptyForm = {
  name: '',
  location: '',
  provider: 'TP-Link Tapo',
  sourceType: 'rtsp',
  ipAddress: '',
  rtspPort: '554',
  onvifPort: '2020',
  streamPath: '/stream1',
  cameraUsername: '',
  cameraPassword: '',
  previewUrl: '',
  openUrl: '',
  status: 'active',
  notes: ''
};

const isEmbeddableVideoUrl = (url = '') => /\.(m3u8|mp4|webm|ogg)(\?.*)?$/i.test(url);
const isImageStreamUrl = (url = '') => /\.(mjpg|jpeg|jpg|png|gif)(\?.*)?$/i.test(url);
const isWebUrl = (url = '') => /^https?:\/\//i.test(url);
const getPreviewHostname = (url = '') => {
  try {
    return new URL(String(url || '').trim()).hostname.toLowerCase();
  } catch (error) {
    return '';
  }
};
const isKnownExternalPortalUrl = (url = '') => /(^|\.)ispyconnect\.com$/i.test(getPreviewHostname(url));
const isEmbeddablePreviewUrl = (url = '') => {
  if (!url) {
    return false;
  }

  if (isKnownExternalPortalUrl(url)) {
    return false;
  }

  return isImageStreamUrl(url) || isEmbeddableVideoUrl(url) || isWebUrl(url);
};

const normalizeForm = (feed = {}) => ({
  name: feed.name || '',
  location: feed.location || '',
  provider: feed.provider || 'Custom',
  sourceType: feed.sourceType || 'browser',
  ipAddress: feed.ipAddress || '',
  rtspPort: String(feed.rtspPort || 554),
  onvifPort: String(feed.onvifPort || 2020),
  streamPath: feed.streamPath || '/stream1',
  cameraUsername: feed.cameraUsername || '',
  cameraPassword: '',
  previewUrl: feed.previewUrl || '',
  openUrl: feed.openUrl || '',
  status: feed.status || 'active',
  notes: feed.notes || ''
});

const getSourceLabel = (sourceType = '') =>
  SOURCE_TYPE_OPTIONS.find((option) => option.value === sourceType)?.label || 'Browser Feed';

const CCTVPreview = ({ feed }) => {
  const previewUrl = String(feed?.previewUrl || '').trim();
  const status = String(feed?.status || 'active');

  if (!previewUrl) {
    if (status !== 'active') {
      return (
        <div className="cctv-feed-placeholder muted">
          <Radio size={34} />
          <h4>Feed inactive</h4>
          <p>This camera is saved but currently hidden from live monitoring.</p>
        </div>
      );
    }

    return (
      <div className="cctv-feed-placeholder">
        <Server size={34} />
        <h4>{feed?.hasNativeSource ? 'Native camera configured' : 'Ready for preview link'}</h4>
        <p>{feed?.hasNativeSource ? 'Add an Agent DVR, WebRTC, or HLS browser link to preview this camera here.' : 'Save a browser-safe preview URL to display this camera live inside the module.'}</p>
      </div>
    );
  }

  if (isImageStreamUrl(previewUrl)) {
    return <img src={previewUrl} alt={`${feed.name} CCTV feed`} className="cctv-feed-media" />;
  }

  if (isEmbeddableVideoUrl(previewUrl)) {
    return (
      <video className="cctv-feed-media" src={previewUrl} controls muted playsInline autoPlay>
        <track kind="captions" />
      </video>
    );
  }

  if (isKnownExternalPortalUrl(previewUrl)) {
    return (
      <div className="cctv-feed-placeholder">
        <ExternalLink size={34} />
        <h4>External monitor link</h4>
        <p>This provider blocks embedded playback. Use the Open button to launch the live Agent DVR portal.</p>
      </div>
    );
  }

  if (isWebUrl(previewUrl)) {
    return <iframe src={previewUrl} title={`${feed.name} CCTV feed`} className="cctv-feed-frame" />;
  }

  return (
    <div className="cctv-feed-placeholder">
      <Globe size={34} />
      <h4>Preview URL saved</h4>
      <p>Use a browser-safe page or stream URL so the live feed can render inside the CCTV module.</p>
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
  const [passwordConfigured, setPasswordConfigured] = useState(false);

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
    const maxLength = {
      name: 80,
      location: 120,
      provider: 40,
      ipAddress: 120,
      streamPath: 160,
      cameraUsername: 80,
      cameraPassword: 120,
      previewUrl: 1000,
      openUrl: 1000,
      notes: 250
    }[field] || 80;

    setForm((current) => ({
      ...current,
      [field]: String(value || '').slice(0, maxLength)
    }));
  };

  const resetForm = () => {
    setForm(emptyForm);
    setEditingId('');
    setPasswordConfigured(false);
  };

  const startEdit = (feed) => {
    setEditingId(feed._id);
    setForm(normalizeForm(feed));
    setPasswordConfigured(Boolean(feed.cameraPasswordConfigured));
  };

  const validateForm = () => {
    if (!form.name.trim()) {
      return 'CCTV feed name is required.';
    }

    if (form.name.trim().length < 2) {
      return 'CCTV feed name must be at least 2 characters.';
    }

    if (form.previewUrl.trim() && !/^https?:\/\/.+/i.test(form.previewUrl.trim())) {
      return 'Browser preview URL must start with http:// or https://.';
    }

    if (form.openUrl.trim() && !/^(https?:\/\/|rtsp:\/\/|rtmp:\/\/|ws:\/\/|wss:\/\/).+/i.test(form.openUrl.trim())) {
      return 'Monitor link must start with http://, https://, rtsp://, rtmp://, ws://, or wss://.';
    }

    if (['rtsp', 'onvif', 'hybrid'].includes(form.sourceType) && !form.ipAddress.trim()) {
      return 'Camera IP or hostname is required for native CCTV sources.';
    }

    if (form.sourceType === 'browser' && !form.previewUrl.trim() && !form.openUrl.trim()) {
      return 'Add a browser preview URL or monitor link for browser-based feeds.';
    }

    const rtspPort = Number.parseInt(form.rtspPort, 10);
    if (!Number.isFinite(rtspPort) || rtspPort < 1 || rtspPort > 65535) {
      return 'RTSP port must be between 1 and 65535.';
    }

    const onvifPort = Number.parseInt(form.onvifPort, 10);
    if (!Number.isFinite(onvifPort) || onvifPort < 1 || onvifPort > 65535) {
      return 'ONVIF port must be between 1 and 65535.';
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
          provider: form.provider.trim(),
          sourceType: form.sourceType,
          ipAddress: form.ipAddress.trim(),
          rtspPort: Number.parseInt(form.rtspPort, 10),
          onvifPort: Number.parseInt(form.onvifPort, 10),
          streamPath: form.streamPath.trim(),
          cameraUsername: form.cameraUsername.trim(),
          cameraPassword: form.cameraPassword.trim(),
          previewUrl: form.previewUrl.trim(),
          openUrl: form.openUrl.trim(),
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
          <p>{isAdmin ? 'Manage camera source details, secure credentials, and browser preview links for office monitoring.' : 'View the CCTV feeds configured by the HOA officers.'}</p>
        </div>
      </div>

      {isAdmin && (
        <form className="cctv-editor" onSubmit={handleSubmit}>
          <div className="cctv-editor-head">
            <div>
              <h3>{editingId ? 'Update CCTV Feed' : 'Add CCTV Feed'}</h3>
              <p>Save the native camera connection separately from the browser preview link. RTSP stays private; browser links handle live viewing.</p>
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
              <input value={form.name} onChange={(event) => updateForm('name', event.target.value)} placeholder="Office CCTV" maxLength={80} />
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

            <label className="cctv-field">
              <span>Provider</span>
              <input list="cctv-providers" value={form.provider} onChange={(event) => updateForm('provider', event.target.value)} placeholder="TP-Link Tapo" maxLength={40} />
              <datalist id="cctv-providers">
                {PROVIDER_OPTIONS.map((provider) => (
                  <option key={provider} value={provider} />
                ))}
              </datalist>
            </label>

            <label className="cctv-field">
              <span>Source Type</span>
              <select value={form.sourceType} onChange={(event) => updateForm('sourceType', event.target.value)}>
                {SOURCE_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>

            <div className="cctv-field cctv-field--security">
              <span>Credentials</span>
              <div className="cctv-security-note">
                <Shield size={16} />
                <div>
                  <strong>Private camera login</strong>
                  <p>{passwordConfigured ? 'A camera password is already saved. Leave the password field blank to keep it.' : 'Camera credentials are stored privately and are not shown in guard or preview cards.'}</p>
                </div>
              </div>
            </div>

            <label className="cctv-field">
              <span>Camera IP / Hostname</span>
              <input value={form.ipAddress} onChange={(event) => updateForm('ipAddress', event.target.value)} placeholder="192.168.1.2" maxLength={120} />
            </label>

            <label className="cctv-field">
              <span>RTSP Port</span>
              <input value={form.rtspPort} onChange={(event) => updateForm('rtspPort', event.target.value)} inputMode="numeric" placeholder="554" />
            </label>

            <label className="cctv-field">
              <span>ONVIF Port</span>
              <input value={form.onvifPort} onChange={(event) => updateForm('onvifPort', event.target.value)} inputMode="numeric" placeholder="2020" />
            </label>

            <label className="cctv-field">
              <span>Stream Path</span>
              <input value={form.streamPath} onChange={(event) => updateForm('streamPath', event.target.value)} placeholder="/stream1" maxLength={160} />
            </label>

            <label className="cctv-field">
              <span>Camera Username</span>
              <input value={form.cameraUsername} onChange={(event) => updateForm('cameraUsername', event.target.value)} placeholder="EcotrendCCTV" maxLength={80} />
            </label>

            <label className="cctv-field">
              <span>Camera Password</span>
              <input type="password" value={form.cameraPassword} onChange={(event) => updateForm('cameraPassword', event.target.value)} placeholder={passwordConfigured ? 'Leave blank to keep current password' : 'Camera account password'} maxLength={120} autoComplete="new-password" />
            </label>

            <label className="cctv-field cctv-field--wide">
              <span>Browser Preview URL</span>
              <input value={form.previewUrl} onChange={(event) => updateForm('previewUrl', event.target.value)} placeholder="https://agent.local:8090/viewer or https://gateway.local/cctv/main.m3u8" maxLength={1000} />
              <small>Use an HLS, WebRTC, MJPEG, MP4, or web dashboard URL that the browser can render.</small>
            </label>

            <label className="cctv-field cctv-field--wide">
              <span>Monitor Link</span>
              <input value={form.openUrl} onChange={(event) => updateForm('openUrl', event.target.value)} placeholder="https://agent.local:8090 or another monitoring page" maxLength={1000} />
              <small>This opens a separate monitoring page when a direct embedded preview is not ideal.</small>
            </label>

            <label className="cctv-field cctv-field--wide">
              <span>Notes</span>
              <textarea value={form.notes} onChange={(event) => updateForm('notes', event.target.value)} placeholder="Example: Tapo C500, Office gate, RTSP source on stream1, browser preview through Agent DVR." maxLength={250} rows={3} />
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
          <p>{isAdmin ? 'Add a feed record now, then connect it to a browser-safe preview link when your monitoring gateway is ready.' : 'No CCTV feeds have been configured yet.'}</p>
        </div>
      ) : (
        <div className="cctv-feed-grid">
          {feeds.map((feed) => {
            const externalUrl = feed.openUrl || feed.previewUrl;
            const previewEmbeddable = isEmbeddablePreviewUrl(feed.previewUrl);
            const browserReady = Boolean(feed.previewUrl) && previewEmbeddable;
            const monitoringSummary = isKnownExternalPortalUrl(feed.previewUrl)
              ? 'External Agent DVR portal available'
              : feed.monitoringSummary;

            return (
              <article key={feed._id} className={`cctv-feed-card ${feed.status !== 'active' ? 'is-inactive' : ''}`}>
                <div className="cctv-feed-screen">
                  <CCTVPreview feed={feed} />
                </div>

                <div className="cctv-feed-body">
                  <div className="cctv-feed-header-stack">
                    <div className="cctv-feed-title-row">
                      <h3>{feed.name}</h3>
                      <span className={`cctv-status ${feed.status === 'active' ? 'active' : 'inactive'}`}>
                        <CheckCircle size={13} />
                        {feed.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    <div className="cctv-feed-tags">
                      <span className="cctv-meta-pill">
                        <Video size={14} />
                        {getSourceLabel(feed.sourceType)}
                      </span>
                      <span className="cctv-meta-pill">
                        <Server size={14} />
                        {feed.provider || 'Custom'}
                      </span>
                      <span className={`cctv-meta-pill ${browserReady ? 'is-ready' : 'is-pending'}`}>
                        {browserReady ? <Globe size={14} /> : <Radio size={14} />}
                        {browserReady ? 'Browser Ready' : 'Open Externally'}
                      </span>
                    </div>
                  </div>

                  <div className="cctv-feed-copy">
                    {feed.location && <p className="cctv-location">{feed.location}</p>}
                    <p className="cctv-monitoring-summary">{monitoringSummary}</p>
                    {isAdmin && feed.technicalSummary && <p className="cctv-technical-summary">{feed.technicalSummary}</p>}
                    {feed.notes && <p className="cctv-notes">{feed.notes}</p>}
                    {isAdmin && feed.credentialsSaved && (
                      <p className="cctv-security-inline">
                        <KeyRound size={14} />
                        Camera credentials saved privately
                      </p>
                    )}
                  </div>

                  <div className="cctv-feed-actions">
                    {externalUrl && (
                      <a href={externalUrl} target="_blank" rel="noopener noreferrer" className="cctv-link-btn">
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
            );
          })}
        </div>
      )}
      <PaginationControls pagination={pagination} onPageChange={setPage} />
    </div>
  );
};

export default CCTVFeedsModule;
