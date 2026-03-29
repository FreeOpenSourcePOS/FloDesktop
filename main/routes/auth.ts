import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDatabase, now } from '../db';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'flopos-local-secret-change-in-production';
const JWT_EXPIRES_IN = '24h';

/**
 * Build a synthetic "tenant" object from local settings.
 * FloDesktop is single-tenant — there is always exactly one "business".
 * The frontend expects this shape to determine routing (chef → KDS, others → POS).
 */
function buildLocalTenant(db: ReturnType<typeof getDatabase>, userRole: string) {
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const s: Record<string, string> = Object.fromEntries(rows.map(r => [r.key, r.value]));

  return {
    id: 1,
    business_name:  s.business_name  || 'My Restaurant',
    slug:           'local',
    database_name:  'local',
    business_type:  s.business_type  || 'restaurant',
    country:        s.country        || 'IN',
    currency:       s.currency       || 'INR',
    currency_symbol: s.currency_symbol || '₹',
    timezone:       s.timezone       || 'Asia/Kolkata',
    plan:           'desktop',
    status:         'active',
    role:           userRole,  // user's role — AuthGuard uses this for routing
  };
}

// ── POST /api/auth/login ──────────────────────────────────────────────────────

router.post('/login', (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const db = getDatabase();
    const user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email) as any;

    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    const tenant = buildLocalTenant(db, user.role);

    res.json({
      access_token: token,
      token_type: 'bearer',
      expires_in: 86400,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      // Single tenant — frontend auto-selects when tenants.length === 1
      tenants: [tenant],
    });
  } catch (error: any) {
    console.error('[Auth] Login error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ── POST /api/auth/tenants/select ─────────────────────────────────────────────
// Frontend calls this after login (even when auto-selecting the single tenant).

router.post('/tenants/select', (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    const db = getDatabase();
    const user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(decoded.userId) as any;
    if (!user) return res.status(404).json({ error: 'User not found' });

    const tenant = buildLocalTenant(db, user.role);

    // Re-issue token with tenant context embedded (same payload — desktop is single-tenant)
    const newToken = jwt.sign(
      { userId: user.id, email: user.email, role: user.role, tenantId: 1 },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      access_token: newToken,
      token_type: 'bearer',
      tenant,
    });
  } catch (error: any) {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────────

router.post('/logout', (_req: Request, res: Response) => {
  res.json({ message: 'Logged out successfully' });
});

// ── POST /api/auth/refresh ────────────────────────────────────────────────────

router.post('/refresh', (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const newToken = jwt.sign(
      { userId: decoded.userId, email: decoded.email, role: decoded.role, tenantId: decoded.tenantId },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      access_token: newToken,
      token_type: 'bearer',
      expires_in: 86400,
    });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────────

router.get('/me', (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    const db = getDatabase();
    const user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(decoded.userId) as any;
    if (!user) return res.status(404).json({ error: 'User not found' });

    const tenant = buildLocalTenant(db, user.role);

    res.json({
      user,
      tenants: [tenant],
    });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

// ── POST /api/auth/password/change ────────────────────────────────────────────

router.post('/password/change', (req: Request, res: Response) => {
  try {
    const { current_password, password } = req.body;
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    const db = getDatabase();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.userId) as any;
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (!bcrypt.compareSync(current_password, user.password)) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const hashedPassword = bcrypt.hashSync(password, 10);
    db.prepare('UPDATE users SET password = ?, updated_at = ? WHERE id = ?').run(hashedPassword, now(), decoded.userId);

    res.json({ message: 'Password changed successfully' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export const authRoutes = router;
