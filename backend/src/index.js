const express = require('express');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const { query } = require('./db');
const { signAccessToken, requireAuth } = require('./auth');

dotenv.config({ path: '../.env' });

const app = express();
const port = process.env.PORT || 4000;

app.use(express.json());

function toPublicUser(row) {
  return {
    id: row.id,
    role: row.role,
    email: row.email,
    name: row.name,
    created_at: row.created_at,
  };
}

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    service: 'backend',
    now: new Date().toISOString(),
  });
});

app.post('/api/v1/auth/register', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const name = String(req.body?.name || '').trim();
    const role = String(req.body?.role || '').trim().toUpperCase();

    if (!email || !password || !name || !role) {
      return res.status(400).json({ error: 'email, password, name, role are required' });
    }

    if (!['TEACHER', 'STUDENT'].includes(role)) {
      return res.status(400).json({ error: 'role must be TEACHER or STUDENT' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'password must be at least 8 characters' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const insertUserSql = `
      INSERT INTO users (role, email, password_hash, name)
      VALUES ($1, $2, $3, $4)
      RETURNING id, role, email, name, created_at
    `;

    const userResult = await query(insertUserSql, [role, email, passwordHash, name]);
    const user = userResult.rows[0];

    if (role === 'TEACHER') {
      await query(
        `
          INSERT INTO teacher_profiles (teacher_user_id)
          VALUES ($1)
          ON CONFLICT (teacher_user_id) DO NOTHING
        `,
        [user.id]
      );
    }

    const token = signAccessToken(user);
    return res.status(201).json({ token, user: toPublicUser(user) });
  } catch (err) {
    if (err && err.code === '23505') {
      return res.status(409).json({ error: 'email already exists' });
    }
    console.error(err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
});

app.post('/api/v1/auth/login', async (req, res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');

    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const userResult = await query(
      `
        SELECT id, role, email, name, password_hash, created_at
        FROM users
        WHERE email = $1
        LIMIT 1
      `,
      [email]
    );

    if (userResult.rowCount === 0) {
      return res.status(401).json({ error: 'invalid_credentials' });
    }

    const user = userResult.rows[0];
    const matched = await bcrypt.compare(password, user.password_hash);
    if (!matched) {
      return res.status(401).json({ error: 'invalid_credentials' });
    }

    const token = signAccessToken(user);
    return res.json({ token, user: toPublicUser(user) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
});

app.post('/api/v1/auth/logout', requireAuth, async (req, res) => {
  return res.json({ ok: true });
});

app.get('/api/v1/auth/me', requireAuth, async (req, res) => {
  try {
    const result = await query(
      `
        SELECT id, role, email, name, created_at
        FROM users
        WHERE id = $1
      `,
      [req.auth.userId]
    );

    if (result.rowCount === 0) {
      return res.status(401).json({ error: 'unauthorized' });
    }

    return res.json({ user: toPublicUser(result.rows[0]) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'internal_server_error' });
  }
});

app.listen(port, () => {
  console.log(`backend listening on port ${port}`);
});
