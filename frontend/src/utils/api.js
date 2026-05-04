const trimTrailingSlash = (value) => value.replace(/\/+$/, '');

const defaultOrigin =
  typeof window !== 'undefined' && window.location.hostname !== 'localhost'
    ? window.location.origin
    : 'http://localhost:5000';

export const SERVER_ORIGIN = trimTrailingSlash(
  process.env.REACT_APP_SERVER_ORIGIN || defaultOrigin
);

export const API_BASE_URL = `${SERVER_ORIGIN}/api`;

export const apiUrl = (path = '') => {
  if (!path) return API_BASE_URL;
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
};

export const assetUrl = (path = '') => {
  if (!path) return SERVER_ORIGIN;
  if (/^https?:\/\//i.test(path)) return path;
  return `${SERVER_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
};
