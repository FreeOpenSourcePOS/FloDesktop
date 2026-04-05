import { Router, Request, Response } from 'express';
import { getDatabase, now } from '../db';

const router = Router();

function getWalletBalance(customerId: string | number): number {
  const db = getDatabase();
  const credits = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total FROM loyalty_ledger
    WHERE customer_id = ? AND type = 'credit' AND (expires_at IS NULL OR expires_at > datetime('now'))
  `).get(customerId) as { total: number };

  const debits = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total FROM loyalty_ledger
    WHERE customer_id = ? AND type = 'debit'
  `).get(customerId) as { total: number };

  return Math.max(0, credits.total - debits.total);
}

// Cleanup endpoint: delete all customers with null IDs - must be before /:id
router.delete('/admin/cleanup', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const result = db.prepare("DELETE FROM customers WHERE id IS NULL").run();
    res.json({ message: `Deleted ${result.changes} customers with null IDs` });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    let query = 'SELECT * FROM customers WHERE 1=1';
    const params: any[] = [];

    if (req.query.phone) {
      query += ' AND phone LIKE ?';
      params.push(`%${req.query.phone}%`);
    }
    if (req.query.name) {
      query += ' AND name LIKE ?';
      params.push(`%${req.query.name}%`);
    }

    query += ' ORDER BY name';

    if (req.query.per_page) {
      query += ` LIMIT ${parseInt(req.query.per_page as string)}`;
    }

    const customers = db.prepare(query).all(...params);
    res.json({ customers });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/search', (req: Request, res: Response) => {
  try {
    const { q } = req.query;
    if (!q || String(q).length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const db = getDatabase();
    const searchTerm = `%${q}%`;

    const customers = db.prepare(`
      SELECT * FROM customers
      WHERE phone LIKE ? OR name LIKE ? OR email LIKE ?
      ORDER BY name LIMIT 20
    `).all(searchTerm, searchTerm, searchTerm);

    res.json({ customers });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const walletBalance = getWalletBalance(req.params.id);
    const loyaltyHistory = db.prepare(`
      SELECT * FROM loyalty_ledger WHERE customer_id = ? ORDER BY created_at DESC LIMIT 50
    `).all(req.params.id);

    const recentOrders = db.prepare(`
      SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 10
    `).all(req.params.id);

    res.json({ customer: { ...customer, walletBalance, loyaltyHistory, recentOrders } });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id/wallet', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const customerId = parseInt(req.params.id);
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const balance = getWalletBalance(customerId);
    const transactions = db.prepare(`
      SELECT * FROM loyalty_ledger WHERE customer_id = ? ORDER BY created_at DESC LIMIT 50
    `).all(req.params.id);

    res.json({ balance, transactions });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', (req: Request, res: Response) => {
  try {
    const { phone, name, email, address, notes } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ message: 'Name is required' });
    }

    const db = getDatabase();

    if (phone) {
      const existing = db.prepare('SELECT * FROM customers WHERE phone = ?').get(phone);
      if (existing) {
        return res.status(400).json({ message: 'Customer with this phone already exists' });
      }
    }

    const id = 'cust-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    db.prepare(`
      INSERT INTO customers (id, phone, name, email, address, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      phone ? String(phone).trim() : null,
      String(name).trim(),
      email ? String(email).trim() : null,
      address ? String(address).trim() : null,
      notes ? String(notes).trim() : null,
      now(),
      now()
    );

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
    res.status(201).json({ customer });
  } catch (error: any) {
    console.error('[Customer POST error]', error);
    res.status(500).json({ message: 'Failed to create customer: ' + error.message });
  }
});

router.put('/:id', (req: Request, res: Response) => {
  try {
    const {
      phone, name, email, address, notes
    } = req.body;
    const db = getDatabase();

    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    db.prepare(`
      UPDATE customers SET
        phone = COALESCE(?, phone),
        name = COALESCE(?, name),
        email = COALESCE(?, email),
        address = COALESCE(?, address),
        notes = COALESCE(?, notes),
        updated_at = ?
      WHERE id = ?
    `).run(
      phone, name, email, address, notes, now(), req.params.id
    );

    const updated = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    res.json({ customer: updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    if (!customer) {
      return res.status(404).json({ error: 'Customer not found' });
    }

    const recentOrders = db.prepare(`
      SELECT * FROM orders WHERE customer_id = ? AND date(created_at) > date('now', '-30 days')
    `).get(req.params.id);
    if (recentOrders) {
      return res.status(400).json({ error: 'Cannot delete customer with recent orders' });
    }

    db.prepare('DELETE FROM customers WHERE id = ?').run(req.params.id);
    res.json({ message: 'Customer deleted' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export const customerRoutes = router;
