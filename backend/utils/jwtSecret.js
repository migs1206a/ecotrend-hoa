function getJwtSecret() {
  const secret = String(process.env.JWT_SECRET || '').trim();

  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be configured in production.');
  }

  // Development-only fallback. Production must use Render's JWT_SECRET.
  return 'development-only-secret';
}

module.exports = { getJwtSecret };
