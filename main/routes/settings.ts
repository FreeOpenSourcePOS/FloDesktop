import { Router, Request, Response } from 'express';
import { getDatabase, now } from '../db';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const settings = db.prepare('SELECT * FROM settings').all();

    const settingsMap: Record<string, string> = {};
    for (const s of settings) {
      (settingsMap as any)[(s as any).key] = (s as any).value;
    }

    res.json({ settings: settingsMap });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:key', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const setting = db.prepare('SELECT * FROM settings WHERE key = ?').get(req.params.key);

    if (!setting) {
      return res.status(404).json({ error: 'Setting not found' });
    }

    res.json({ setting });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:key', (req: Request, res: Response) => {
  try {
    const { value } = req.body;

    if (value === undefined) {
      return res.status(400).json({ error: 'Value is required' });
    }

    const db = getDatabase();
    db.prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run(req.params.key, value, now());

    const setting = db.prepare('SELECT * FROM settings WHERE key = ?').get(req.params.key);
    res.json({ setting });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/tax/info', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const settings = db.prepare('SELECT * FROM settings').all();

    const settingsMap: Record<string, string> = {};
    for (const s of settings) {
      (settingsMap as any)[(s as any).key] = (s as any).value;
    }

    res.json({
      taxSettings: {
        tax_registered: settingsMap.tax_registered === 'true',
        gstin: settingsMap.gstin || '',
        state_code: settingsMap.state_code || '',
        tax_scheme: settingsMap.tax_scheme || 'regular',
        country: settingsMap.country || 'IN',
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/tax', (req: Request, res: Response) => {
  try {
    const { tax_registered, gstin, state_code, tax_scheme } = req.body;

    const db = getDatabase();
    const upsert = db.prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);

    if (tax_registered !== undefined) {
      upsert.run('tax_registered', String(tax_registered), now());
    }
    if (gstin !== undefined) {
      upsert.run('gstin', gstin, now());
    }
    if (state_code !== undefined) {
      upsert.run('state_code', state_code, now());
    }
    if (tax_scheme !== undefined) {
      upsert.run('tax_scheme', tax_scheme, now());
    }

    const settings = db.prepare('SELECT * FROM settings').all();
    const settingsMap: Record<string, string> = {};
    for (const s of settings) {
      (settingsMap as any)[(s as any).key] = (s as any).value;
    }

    res.json({
      taxSettings: {
        tax_registered: settingsMap.tax_registered === 'true',
        gstin: settingsMap.gstin || '',
        state_code: settingsMap.state_code || '',
        tax_scheme: settingsMap.tax_scheme || 'regular',
        country: settingsMap.country || 'IN',
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/business/info', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const settings = db.prepare('SELECT * FROM settings').all();

    const settingsMap: Record<string, string> = {};
    for (const s of settings) {
      (settingsMap as any)[(s as any).key] = (s as any).value;
    }

    res.json({
      businessSettings: {
        business_name: settingsMap.business_name || 'My Restaurant',
        country: settingsMap.country || 'IN',
        currency: settingsMap.currency || 'INR',
        timezone: settingsMap.timezone || 'Asia/Kolkata',
        address: settingsMap.address || '',
        phone: settingsMap.phone || '',
        email: settingsMap.email || '',
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/business', (req: Request, res: Response) => {
  try {
    const { business_name, country, currency, timezone, address, phone, email } = req.body;

    const db = getDatabase();
    const upsert = db.prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);

    if (business_name !== undefined) upsert.run('business_name', business_name, now());
    if (country !== undefined) upsert.run('country', country, now());
    if (currency !== undefined) upsert.run('currency', currency, now());
    if (timezone !== undefined) upsert.run('timezone', timezone, now());
    if (address !== undefined) upsert.run('address', address, now());
    if (phone !== undefined) upsert.run('phone', phone, now());
    if (email !== undefined) upsert.run('email', email, now());

    const settings = db.prepare('SELECT * FROM settings').all();
    const settingsMap: Record<string, string> = {};
    for (const s of settings) {
      (settingsMap as any)[(s as any).key] = (s as any).value;
    }

    res.json({
      businessSettings: {
        business_name: settingsMap.business_name || 'My Restaurant',
        country: settingsMap.country || 'IN',
        currency: settingsMap.currency || 'INR',
        timezone: settingsMap.timezone || 'Asia/Kolkata',
        address: settingsMap.address || '',
        phone: settingsMap.phone || '',
        email: settingsMap.email || '',
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/loyalty/info', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const settings = db.prepare('SELECT * FROM settings').all();

    const settingsMap: Record<string, string> = {};
    for (const s of settings) {
      (settingsMap as any)[(s as any).key] = (s as any).value;
    }

    res.json({
      loyaltySettings: {
        loyalty_enabled: settingsMap.loyalty_enabled === 'true',
        loyalty_expiry_days: parseInt(settingsMap.loyalty_expiry_days || '365'),
        loyalty_points_per_rs: parseFloat(settingsMap.loyalty_points_per_rs || '1'),
        loyalty_redeem_value: parseFloat(settingsMap.loyalty_redeem_value || '0.25'),
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/loyalty', (req: Request, res: Response) => {
  try {
    const { loyalty_enabled, loyalty_expiry_days, loyalty_points_per_rs, loyalty_redeem_value } = req.body;

    const db = getDatabase();
    const upsert = db.prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `);

    if (loyalty_enabled !== undefined) upsert.run('loyalty_enabled', String(loyalty_enabled), now());
    if (loyalty_expiry_days !== undefined) upsert.run('loyalty_expiry_days', String(loyalty_expiry_days), now());
    if (loyalty_points_per_rs !== undefined) upsert.run('loyalty_points_per_rs', String(loyalty_points_per_rs), now());
    if (loyalty_redeem_value !== undefined) upsert.run('loyalty_redeem_value', String(loyalty_redeem_value), now());

    const settings = db.prepare('SELECT * FROM settings').all();
    const settingsMap: Record<string, string> = {};
    for (const s of settings) {
      (settingsMap as any)[(s as any).key] = (s as any).value;
    }

    res.json({
      loyaltySettings: {
        loyalty_enabled: settingsMap.loyalty_enabled === 'true',
        loyalty_expiry_days: parseInt(settingsMap.loyalty_expiry_days || '365'),
        loyalty_points_per_rs: parseFloat(settingsMap.loyalty_points_per_rs || '1'),
        loyalty_redeem_value: parseFloat(settingsMap.loyalty_redeem_value || '0.25'),
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export const settingsRoutes = router;
