const CCTVFeed = require('../models/CCTVFeed');
const { normalizeSpaces } = require('../utils/fieldValidation');
const { parsePagination, sendPaginatedResponse } = require('../utils/pagination');

const MAX_FEEDS = 24;
const ALLOWED_STATUSES = new Set(['active', 'inactive']);
const URL_PATTERN = /^(https?:\/\/|rtsp:\/\/|rtmp:\/\/|ws:\/\/|wss:\/\/).+/i;

const serializeFeed = (feed) => ({
  _id: String(feed?._id || ''),
  name: String(feed?.name || '').trim(),
  location: String(feed?.location || '').trim(),
  streamUrl: String(feed?.streamUrl || '').trim(),
  status: String(feed?.status || 'active'),
  notes: String(feed?.notes || '').trim(),
  createdAt: feed?.createdAt || null,
  updatedAt: feed?.updatedAt || null
});

const validateFeedPayload = (body = {}, { partial = false } = {}) => {
  const next = {};

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

  if (!partial || Object.prototype.hasOwnProperty.call(body, 'streamUrl')) {
    const streamUrl = String(body.streamUrl || '').trim().slice(0, 1000);

    if (streamUrl && !URL_PATTERN.test(streamUrl)) {
      return { error: 'Stream URL must start with http://, https://, rtsp://, rtmp://, ws://, or wss://.' };
    }

    next.streamUrl = streamUrl;
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

  return { value: next };
};

const getCCTVFeeds = async (req, res) => {
  try {
    const pagination = parsePagination(req.query);
    const query = CCTVFeed.find().sort({ createdAt: -1 }).lean();

    if (pagination.enabled) {
      const [feeds, total] = await Promise.all([
        query.clone().skip(pagination.skip).limit(pagination.limit),
        CCTVFeed.countDocuments()
      ]);

      return sendPaginatedResponse(res, pagination, feeds.map(serializeFeed), total);
    }

    const feeds = await query;
    return res.json(feeds.map(serializeFeed));
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

    const { value, error } = validateFeedPayload(req.body);

    if (error) {
      return res.status(400).json({ message: error });
    }

    const feed = await CCTVFeed.create(value);

    return res.status(201).json({
      message: 'CCTV feed added successfully.',
      feed: serializeFeed(feed)
    });
  } catch (error) {
    console.error('createCCTVFeed error:', error);
    return res.status(500).json({ message: 'Failed to add CCTV feed.' });
  }
};

const updateCCTVFeed = async (req, res) => {
  try {
    const { value, error } = validateFeedPayload(req.body);

    if (error) {
      return res.status(400).json({ message: error });
    }

    const feed = await CCTVFeed.findByIdAndUpdate(req.params.id, value, {
      new: true,
      runValidators: true
    });

    if (!feed) {
      return res.status(404).json({ message: 'CCTV feed not found.' });
    }

    return res.json({
      message: 'CCTV feed updated successfully.',
      feed: serializeFeed(feed)
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
