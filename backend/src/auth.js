const jwt = require('jsonwebtoken');
const { randomUUID } = require('crypto');
const { query } = require('./db');

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is required');
  }
  return secret;
}

function signAccessToken(user) {
  return jwt.sign(
    { sub: String(user.id), role: user.role, email: user.email },
    getJwtSecret(),
    { expiresIn: '7d', jwtid: randomUUID() }
  );
}

function extractBearerToken(req) {
  const authHeader = req.headers.authorization || '';
  const [scheme, token] = authHeader.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return null;
  }
  return token;
}

async function isRevokedToken(tokenId) {
  if (!tokenId) {
    return false;
  }
  try {
    const result = await query(
      `
        SELECT 1
        FROM auth_token_revocations
        WHERE token_id = $1
        LIMIT 1
      `,
      [tokenId]
    );
    return result.rowCount > 0;
  } catch (err) {
    if (err?.code === '42P01') {
      return false;
    }
    throw err;
  }
}

async function revokeAccessToken(authContext) {
  if (!authContext?.tokenId) {
    return;
  }
  const expiresAtIso =
    Number.isInteger(authContext.expiresAtEpochSec) && authContext.expiresAtEpochSec > 0
      ? new Date(authContext.expiresAtEpochSec * 1000).toISOString()
      : null;

  try {
    await query(
      `
        INSERT INTO auth_token_revocations (token_id, user_id, expires_at)
        VALUES ($1, $2, $3::timestamptz)
        ON CONFLICT (token_id) DO NOTHING
      `,
      [authContext.tokenId, authContext.userId || null, expiresAtIso]
    );
  } catch (err) {
    if (err?.code === '42P01') {
      return;
    }
    throw err;
  }
}

async function requireAuth(req, res, next) {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const payload = jwt.verify(token, getJwtSecret());
    if (await isRevokedToken(payload.jti || null)) {
      return res.status(401).json({ error: 'unauthorized' });
    }
    req.auth = {
      userId: Number(payload.sub),
      role: payload.role,
      email: payload.email,
      token,
      tokenId: payload.jti || null,
      expiresAtEpochSec: Number.isInteger(payload.exp) ? payload.exp : null,
    };
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'unauthorized' });
  }
}

async function optionalAuth(req, res, next) {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      req.auth = null;
      return next();
    }
    const payload = jwt.verify(token, getJwtSecret());
    if (await isRevokedToken(payload.jti || null)) {
      req.auth = null;
      return next();
    }
    req.auth = {
      userId: Number(payload.sub),
      role: payload.role,
      email: payload.email,
      token,
      tokenId: payload.jti || null,
      expiresAtEpochSec: Number.isInteger(payload.exp) ? payload.exp : null,
    };
    return next();
  } catch (err) {
    req.auth = null;
    return next();
  }
}

module.exports = {
  signAccessToken,
  requireAuth,
  optionalAuth,
  revokeAccessToken,
};
