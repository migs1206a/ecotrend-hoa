const CCTVFeed = require('../models/CCTVFeed');
const { normalizeSpaces } = require('../utils/fieldValidation');
const { parsePagination, sendPaginatedResponse } = require('../utils/pagination');
const { isOfficer } = require('../utils/adminPermissions');

const MAX_FEEDS = 24;
const ALLOWED_STATUSES = new Set(['active', 'inactive']);
const ALLOWED_SOURCE_TYPES = new Set(['browser', 'rtsp', 'onvif', 'hybrid']);
const CONNECTION_URL_PATTERN = /^(https?:\/\/|rtsp:\/\/|rtmp:\/\/|ws:\/\/|wss:\/\/).+/i;
const BROWSER_URL_PATTERN = /^https?:\/\/.+/i;
const HOST_PATTERN = /^(localhost|(\d{1,3}\.){3}\d{1,3}|[a-z0-9.-]+)$/i;

const toTrimmedString = (value, maxLength) => String(value || '').trim().slice(0, maxLength);

const normalizePort = (value, fallback) => {
  const nextValue = value === '' || value === null || typeof value === 'undefined'
    ? fallback
    : Number.parseInt(value, 10);

  if (!Number.isFinite(nextValue) || nextValue < 1 || nextValue > 65535) {
    return null;
  }

  return nextValue;
};

const normalizeStreamPath = (value) => {
  const trimmed = toTrimmedString(value || '/stream1', 160);

  if (!trimmed) {
    return '/stream1';
  }

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
};

const parseLegacyUrl = (value = '') => {
  const rawValue = toTrimmedString(value, 1000);

  if (!rawValue || !CONNECTION_URL_PATTERN.test(rawValue)) {
    return null;
  }

  try {
    const parsed = new URL(rawValue);
    return {
      url: rawValue,
      protocol: String(parsed.protocol || '').replace(':', '').toLowerCase(),
      hostname: String(parsed.hostname || '').trim(),
      port: String(parsed.port || '').trim(),
      pathname: String(parsed.pathname || '').trim(),
      username: decodeURIComponent(String(parsed.username || '').trim()),
      password: decodeURIComponent(String(parsed.password || '').trim())
    };
  } catch (error) {
    return null;
  }
};

const buildRtspUrl = ({ ipAddress = '', rtspPort = 554, streamPath = '/stream1', cameraUsername = '', cameraPassword = '' }) => {
  const host = toTrimmedString(ipAddress, 120);
  if (!host) {
    return '';
  }

  const normalizedPath = normalizeStreamPath(streamPath);
  const encodedUsername = encodeURIComponent(String(cameraUsername || '').trim());
  const encodedPassword = encodeURIComponent(String(cameraPassword || '').trim());
  const credentials = encodedUsername
    ? `${encodedUsername}${encodedPassword ? `:${encodedPassword}` : ''}@`
    : '';

  return `rtsp://${credentials}${host}:${rtspPort}${normalizedPath}`;
};

const buildStoredStreamUrl = (feed = {}, legacyUrlInput = '') => {
  const previewUrl = toTrimmedString(feed.previewUrl, 1000);
  const openUrl = toTrimmedString(feed.openUrl, 1000);

  if (feed.sourceType === 'rtsp' || feed.sourceType === 'hybrid') {
    const rtspUrl = buildRtspUrl(feed);
    if (rtspUrl) {
      return rtspUrl;
    }
  }

  if (feed.sourceType === 'browser' && previewUrl) {
    return previewUrl;
  }

  if (openUrl) {
    return openUrl;
  }

  if (previewUrl) {
    return previewUrl;
  }

  const normalizedLegacyUrl = toTrimmedString(legacyUrlInput, 1000);
  return CONNECTION_URL_PATTERN.test(normalizedLegacyUrl) ? normalizedLegacyUrl : '';
};

const getMonitoringSummary = ({ previewUrl = '', openUrl = '', sourceType = '', hasNativeSource = false }) => {
  if (previewUrl) {
    return 'Browser preview ready';
  }

  if (hasNativeSource && sourceType === 'hybrid') {
    return 'Native camera source configured; add a browser gateway link for live preview';
  }

  if (hasNativeSource) {
    return 'Native camera source configured';
  }

  if (openUrl) {
    return 'External monitor link configured';
  }

  return 'Awaiting browser preview link';
};

const getTechnicalSummary = ({ sourceType = '', ipAddress = '', rtspPort = 554, onvifPort = 2020, streamPath = '/stream1', legacy = null }) => {
  const host = toTrimmedString(ipAddress, 120) || toTrimmedString(legacy?.hostname, 120);
  const legacyProtocol = toTrimmedString(legacy?.protocol, 20);

  if ((sourceType === 'rtsp' || sourceType === 'hybrid' || legacyProtocol === 'rtsp') && host) {
    const port = rtspPort || Number.parseInt(legacy?.port || '', 10) || 554;
    const path = normalizeStreamPath(streamPath || legacy?.pathname || '/stream1');
    return `RTSP ${host}:${port}${path}`;
  }

  if ((sourceType === 'onvif' || sourceType === 'hybrid') && host) {
    return `ONVIF ${host}:${onvifPort || 2020}`;
  }

  if (legacyProtocol) {
    return `${legacyProtocol.toUpperCase()} source saved`;
  }

  return '';
};

const serializeFeed = (feed, { includeTechnicalDetails = false } = {}) => {
  const legacy = parseLegacyUrl(feed?.streamUrl);
  const sourceType = ALLOWED_SOURCE_TYPES.has(String(feed?.sourceType || '').trim().toLowerCase())
    ? String(feed?.sourceType || '').trim().toLowerCase()
    : legacy?.protocol === 'rtsp'
      ? 'rtsp'
      : legacy?.protocol
        ? 'browser'
        : 'browser';
  const previewUrl = toTrimmedString(feed?.previewUrl, 1000) || (
    legacy && BROWSER_URL_PATTERN.test(legacy.url) ? legacy.url : ''
  );
  const openUrl = toTrimmedString(feed?.openUrl, 1000) || previewUrl;
  const ipAddress = toTrimmedString(feed?.ipAddress, 120) || toTrimmedString(legacy?.hostname, 120);
  const rtspPort = Number.isFinite(Number(feed?.rtspPort)) ? Number(feed.rtspPort) : Number.parseInt(legacy?.port || '', 10) || 554;
  const onvifPort = Number.isFinite(Number(feed?.onvifPort)) ? Number(feed.onvifPort) : 2020;
  const streamPath = normalizeStreamPath(feed?.streamPath || legacy?.pathname || '/stream1');
  const cameraUsername = toTrimmedString(feed?.cameraUsername, 80) || toTrimmedString(legacy?.username, 80);
  const credentialsSaved = Boolean(toTrimmedString(feed?.cameraPassword, 120) || toTrimmedString(legacy?.password, 120));
  const hasNativeSource = ['rtsp', 'onvif', 'hybrid'].includes(sourceType) || ['rtsp', 'rtmp'].includes(String(legacy?.protocol || '').trim().toLowerCase());

  const payload = {
    _id: String(feed?._id || ''),
    name: toTrimmedString(feed?.name, 80),
    location: toTrimmedString(feed?.location, 120),
    provider: toTrimmedString(feed?.provider, 40) || 'Custom',
    sourceType,
    status: String(feed?.status || 'active'),
    notes: toTrimmedString(feed?.notes, 250),
    previewUrl,
    openUrl,
    browserReady: Boolean(previewUrl),
    hasNativeSource,
    credentialsSaved,
    monitoringSummary: getMonitoringSummary({ previewUrl, openUrl, sourceType, hasNativeSource }),
    createdAt: feed?.createdAt || null,
    updatedAt: feed?.updatedAt || null
  };

  if (includeTechnicalDetails) {
    payload.ipAddress = ipAddress;
    payload.rtspPort = rtspPort;
    payload.onvifPort = onvifPort;
    payload.streamPath = streamPath;
    payload.cameraUsername = cameraUsername;
    payload.cameraPasswordConfigured = credentialsSaved;
    payload.technicalSummary = getTechnicalSummary({
      sourceType,
      ipAddress,
      rtspPort,
      onvifPort,
      streamPath,
      legacy
    });
  }

  return payload;
};

const validateFeedPayload = (body = {}, { partial = false } = {}) => {
  const next = {};
  const legacyUrlInput = Object.prototype.hasOwnProperty.call(body, 'streamUrl')
    ? toTrimmedString(body.streamUrl, 1000)
    : '';
  const passwordInputProvided = Object.prototype.hasOwnProperty.call(body, 'cameraPassword');

  if (!partial || Object.prototype.hasOwnProperty.call(body, 'name')) {
    const name = normalizeSpaces(body.name).slice(0, 80);

    if (!name) {
      return { error: 'CCTV feed name is required.' };
    }

    if (name.length < 2) {
      return { error: 'CCTV feed name must be at least 2 characters.' };
    }

    next.name = name;
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, 'location')) {
    next.location = normalizeSpaces(body.location).slice(0, 120);
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, 'provider')) {
    next.provider = normalizeSpaces(body.provider || 'Custom').slice(0, 40) || 'Custom';
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, 'sourceType')) {
    const sourceType = String(body.sourceType || 'browser').trim().toLowerCase();

    if (!ALLOWED_SOURCE_TYPES.has(sourceType)) {
      return { error: 'CCTV feed source type is invalid.' };
    }

    next.sourceType = sourceType;
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, 'ipAddress')) {
    const ipAddress = toTrimmedString(body.ipAddress, 120);

    if (ipAddress && !HOST_PATTERN.test(ipAddress)) {
      return { error: 'Camera IP or hostname is invalid.' };
    }

    next.ipAddress = ipAddress;
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, 'rtspPort')) {
    const rtspPort = normalizePort(body.rtspPort, 554);
    if (rtspPort === null) {
      return { error: 'RTSP port must be between 1 and 65535.' };
    }
    next.rtspPort = rtspPort;
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, 'onvifPort')) {
    const onvifPort = normalizePort(body.onvifPort, 2020);
    if (onvifPort === null) {
      return { error: 'ONVIF port must be between 1 and 65535.' };
    }
    next.onvifPort = onvifPort;
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, 'streamPath')) {
    next.streamPath = normalizeStreamPath(body.streamPath || '/stream1');
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, 'cameraUsername')) {
    next.cameraUsername = toTrimmedString(body.cameraUsername, 80);
  }

  if (passwordInputProvided) {
    next.cameraPassword = toTrimmedString(body.cameraPassword, 120);
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, 'previewUrl')) {
    const previewUrl = toTrimmedString(body.previewUrl, 1000);

    if (previewUrl && !BROWSER_URL_PATTERN.test(previewUrl)) {
      return { error: 'Browser preview URL must start with http:// or https://.' };
    }

    next.previewUrl = previewUrl;
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, 'openUrl')) {
    const openUrl = toTrimmedString(body.openUrl, 1000);

    if (openUrl && !CONNECTION_URL_PATTERN.test(openUrl)) {
      return { error: 'Monitor link must start with http://, https://, rtsp://, rtmp://, ws://, or wss://.' };
    }

    next.openUrl = openUrl;
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, 'status')) {
    const status = String(body.status || 'active').trim().toLowerCase();

    if (!ALLOWED_STATUSES.has(status)) {
      return { error: 'CCTV feed status is invalid.' };
    }

    next.status = status;
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, 'notes')) {
    next.notes = normalizeSpaces(body.notes).slice(0, 250);
  }

  const sourceType = next.sourceType || String(body.sourceType || '').trim().toLowerCase();
  const ipAddress = next.ipAddress || toTrimmedString(body.ipAddress, 120);

  if ((sourceType === 'rtsp' || sourceType === 'onvif' || sourceType === 'hybrid') && !ipAddress && !legacyUrlInput) {
    return { error: 'Camera IP or hostname is required for native CCTV sources.' };
  }

  if (sourceType === 'browser' && !next.previewUrl && !next.openUrl && !legacyUrlInput) {
    return { error: 'Add a browser preview URL or monitor link for browser-based CCTV feeds.' };
  }

  if (!next.previewUrl && sourceType !== 'browser' && !legacyUrlInput) {
    next.previewUrl = '';
  }

  return {
    value: next,
    meta: {
      legacyUrlInput,
      passwordInputProvided
    }
  };
};

const getCCTVFeeds = async (req, res) => {
  try {
    const pagination = parsePagination(req.query);
    const includeTechnicalDetails = isOfficer(req.user);
    const query = CCTVFeed.find().sort({ createdAt: -1 }).lean();

    if (pagination.enabled) {
      const [feeds, total] = await Promise.all([
        query.clone().skip(pagination.skip).limit(pagination.limit),
        CCTVFeed.countDocuments()
      ]);

      return sendPaginatedResponse(
        res,
        pagination,
        feeds.map((feed) => serializeFeed(feed, { includeTechnicalDetails })),
        total
      );
    }

    const feeds = await query;
    return res.json(feeds.map((feed) => serializeFeed(feed, { includeTechnicalDetails })));
  } catch (error) {
    console.error('getCCTVFeeds error:', error);
    return res.status(500).json({ message: 'Failed to load CCTV feeds.' });
  }
};

const createCCTVFeed = async (req, res) => {
  try {
    const feedCount = await CCTVFeed.countDocuments();

    if (feedCount >= MAX_FEEDS) {
      return res.status(400).json({ message: `Only ${MAX_FEEDS} CCTV feeds can be saved.` });
    }

    const { value, error, meta } = validateFeedPayload(req.body);

    if (error) {
      return res.status(400).json({ message: error });
    }

    const nextValue = {
      ...value,
      streamUrl: buildStoredStreamUrl(value, meta.legacyUrlInput)
    };

    const feed = await CCTVFeed.create(nextValue);

    return res.status(201).json({
      message: 'CCTV feed added successfully.',
      feed: serializeFeed(feed.toObject(), { includeTechnicalDetails: true })
    });
  } catch (error) {
    console.error('createCCTVFeed error:', error);
    return res.status(500).json({ message: 'Failed to add CCTV feed.' });
  }
};

const updateCCTVFeed = async (req, res) => {
  try {
    const existingFeed = await CCTVFeed.findById(req.params.id).select('+cameraPassword');

    if (!existingFeed) {
      return res.status(404).json({ message: 'CCTV feed not found.' });
    }

    const { value, error, meta } = validateFeedPayload(req.body);

    if (error) {
      return res.status(400).json({ message: error });
    }

    const nextValue = {
      ...value
    };

    if (meta.passwordInputProvided) {
      if (!nextValue.cameraPassword && existingFeed.cameraPassword) {
        nextValue.cameraPassword = existingFeed.cameraPassword;
      }
    } else {
      nextValue.cameraPassword = existingFeed.cameraPassword || '';
    }

    const mergedForStorage = {
      ...existingFeed.toObject(),
      ...nextValue
    };

    nextValue.streamUrl = buildStoredStreamUrl(mergedForStorage, meta.legacyUrlInput || existingFeed.streamUrl || '');

    const feed = await CCTVFeed.findByIdAndUpdate(req.params.id, nextValue, {
      new: true,
      runValidators: true
    });

    return res.json({
      message: 'CCTV feed updated successfully.',
      feed: serializeFeed(feed.toObject(), { includeTechnicalDetails: true })
    });
  } catch (error) {
    console.error('updateCCTVFeed error:', error);
    return res.status(500).json({ message: 'Failed to update CCTV feed.' });
  }
};

const deleteCCTVFeed = async (req, res) => {
  try {
    const feed = await CCTVFeed.findByIdAndDelete(req.params.id);

    if (!feed) {
      return res.status(404).json({ message: 'CCTV feed not found.' });
    }

    return res.json({ message: 'CCTV feed deleted successfully.' });
  } catch (error) {
    console.error('deleteCCTVFeed error:', error);
    return res.status(500).json({ message: 'Failed to delete CCTV feed.' });
  }
};

module.exports = {
  getCCTVFeeds,
  createCCTVFeed,
  updateCCTVFeed,
  deleteCCTVFeed
};
