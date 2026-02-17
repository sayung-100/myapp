const jwt = require('jsonwebtoken');

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
    { expiresIn: '7d' }
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

function requireAuth(req, res, next) {
  try {
    const token = extractBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    const payload = jwt.verify(token, getJwtSecret());
    req.auth = {
      userId: Number(payload.sub),
      role: payload.role,
      email: payload.email,
      token,
    };
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'unauthorized' });
  }
}

module.exports = {
  signAccessToken,
  requireAuth,
};
