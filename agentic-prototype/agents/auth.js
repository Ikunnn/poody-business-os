// Auth + RBAC (Phase A - local JWT, upgrade ke OAuth later)
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { loadUsers, saveUsers } = require('./storage');
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-prod-32chars!';

function signToken(payload) { return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' }); }

async function registerUser({ email, password, name, role }) {
  const users = loadUsers();
  if (users.find(u => u.email === email)) throw new Error('email_exists');
  const hash = await bcrypt.hash(password, 10);
  const u = { id: `usr_${Date.now().toString(36)}`, email, name: name || email.split('@')[0], role: role || 'owner', password_hash: hash, created_at: new Date().toISOString() };
  users.push(u);
  saveUsers(users);
  const { password_hash, ...safe } = u;
  return { user: safe, token: signToken({ id: u.id, email: u.email, role: u.role }) };
}

async function loginUser({ email, password }) {
  const users = loadUsers();
  const u = users.find(x => x.email === email);
  if (!u) throw new Error('invalid_credentials');
  const ok = await bcrypt.compare(password, u.password_hash);
  if (!ok) throw new Error('invalid_credentials');
  const { password_hash, ...safe } = u;
  return { user: safe, token: signToken({ id: safe.id, email: safe.email, role: safe.role }) };
}

function authMiddleware(req, res, next) {
  // Allow health + public files + register/login without token. Else require Bearer.
  const open = ['/health', '/api/v1/auth/login', '/api/v1/auth/register', '/api/v1/dashboard/overview', '/api/v1/finance/cashflow'];
  if (open.some(p => req.path === p || req.path.startsWith('/api/v1/auth/'))) {
    const h = req.headers.authorization;
    if (h && h.startsWith('Bearer ')) {
      try { req.user = jwt.verify(h.slice(7), JWT_SECRET); } catch {}
    }
    // For dashboard/overview allow anonymous but still pass user if present
    if (req.path === '/api/v1/dashboard/overview') return next();
    if (req.path.startsWith('/api/v1/auth/')) return next();
  }
  // For all other /api/v1/* require auth if users exist
  const users = loadUsers();
  if (users.length === 0) {
    // No users yet -> allow anonymous but inject mock user so persist works
    req.user = { id: 'usr_mock_owner', email: 'owner@local', role: 'owner' };
    return next();
  }
  // If anonymous but users exist, enforce
  if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized', hint: 'POST /api/v1/auth/login untuk dapat token, lalu header Authorization: Bearer <token>' });
  }
  try {
    req.user = jwt.verify(req.headers.authorization.slice(7), JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid_token', message: e.message });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'unauthorized' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'forbidden', need: roles, have: req.user.role });
    next();
  };
}

module.exports = { signToken, registerUser, loginUser, authMiddleware, requireRole, JWT_SECRET };
