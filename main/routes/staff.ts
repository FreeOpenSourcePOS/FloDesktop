import { Router, Request, Response } from 'express';
import { getDatabase, now } from '../db';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    let query = 'SELECT * FROM staff WHERE 1=1';
    const params: any[] = [];

    if (req.query.role) {
      query += ' AND role = ?';
      params.push(req.query.role);
    }
    if (req.query.active === 'true') {
      query += ' AND is_active = 1';
    }
    if (req.query.active === 'false') {
      query += ' AND is_active = 0';
    }

    query += ' ORDER BY role, name';

    const staff = db.prepare(query).all(...params);
    res.json({ staff });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const member = db.prepare(`
      SELECT s.*, u.name as user_name, u.email as user_email, u.role as user_role
      FROM staff s
      LEFT JOIN users u ON s.user_id = u.id
      WHERE s.id = ?
    `).get(req.params.id);

    if (!member) {
      return res.status(404).json({ error: 'Staff member not found' });
    }

    const performance = db.prepare(`
      SELECT COUNT(*) as orders_served, SUM(total) as total_sales
      FROM orders
      WHERE served_by = ? AND date(created_at) = date('now')
    `).get(req.params.id);

    res.json({ staff: { ...member, performance } });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', (req: Request, res: Response) => {
  try {
    const { user_id, employee_code, role, permissions, hourly_rate, monthly_salary, joined_at } = req.body;

    if (!role) {
      return res.status(400).json({ error: 'Role is required' });
    }

    const db = getDatabase();

    if (user_id) {
      const existing = db.prepare('SELECT * FROM staff WHERE user_id = ?').get(user_id);
      if (existing) {
        return res.status(400).json({ error: 'User is already assigned to another staff member' });
      }
    }

    if (employee_code) {
      const existing = db.prepare('SELECT * FROM staff WHERE employee_code = ?').get(employee_code);
      if (existing) {
        return res.status(400).json({ error: 'Employee code already exists' });
      }
    }

    const result = db.prepare(`
      INSERT INTO staff (user_id, employee_code, role, permissions, hourly_rate, monthly_salary, is_active, joined_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
    `).run(
      user_id || null, employee_code || null, role,
      permissions ? JSON.stringify(permissions) : null,
      hourly_rate || null, monthly_salary || null,
      joined_at || null, now(), now()
    );

    const staff = db.prepare('SELECT * FROM staff WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ staff });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', (req: Request, res: Response) => {
  try {
    const { user_id, employee_code, role, permissions, hourly_rate, monthly_salary, is_active, left_at } = req.body;
    const db = getDatabase();

    const member = db.prepare('SELECT * FROM staff WHERE id = ?').get(req.params.id);
    if (!member) {
      return res.status(404).json({ error: 'Staff member not found' });
    }

    db.prepare(`
      UPDATE staff SET
        user_id = COALESCE(?, user_id),
        employee_code = COALESCE(?, employee_code),
        role = COALESCE(?, role),
        permissions = COALESCE(?, permissions),
        hourly_rate = COALESCE(?, hourly_rate),
        monthly_salary = COALESCE(?, monthly_salary),
        is_active = COALESCE(?, is_active),
        left_at = COALESCE(?, left_at),
        updated_at = ?
      WHERE id = ?
    `).run(
      user_id, employee_code, role,
      permissions ? JSON.stringify(permissions) : null,
      hourly_rate, monthly_salary, is_active, left_at,
      now(), req.params.id
    );

    const updated = db.prepare('SELECT * FROM staff WHERE id = ?').get(req.params.id);
    res.json({ staff: updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const member = db.prepare('SELECT * FROM staff WHERE id = ?').get(req.params.id);
    if (!member) {
      return res.status(404).json({ error: 'Staff member not found' });
    }

    db.prepare('DELETE FROM staff WHERE id = ?').run(req.params.id);
    res.json({ message: 'Staff member deleted' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/deactivate', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const member = db.prepare('SELECT * FROM staff WHERE id = ?').get(req.params.id);
    if (!member) {
      return res.status(404).json({ error: 'Staff member not found' });
    }

    if ((member as any).is_active === 0) {
      return res.status(400).json({ error: 'Staff member is already deactivated' });
    }

    db.prepare(`
      UPDATE staff SET is_active = 0, left_at = ?, updated_at = ? WHERE id = ?
    `).run(now(), now(), req.params.id);

    const updated = db.prepare('SELECT * FROM staff WHERE id = ?').get(req.params.id);
    res.json({ staff: updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/reactivate', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const member = db.prepare('SELECT * FROM staff WHERE id = ?').get(req.params.id);
    if (!member) {
      return res.status(404).json({ error: 'Staff member not found' });
    }

    if ((member as any).is_active === 1) {
      return res.status(400).json({ error: 'Staff member is already active' });
    }

    db.prepare(`
      UPDATE staff SET is_active = 1, left_at = NULL, updated_at = ? WHERE id = ?
    `).run(now(), req.params.id);

    const updated = db.prepare('SELECT * FROM staff WHERE id = ?').get(req.params.id);
    res.json({ staff: updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export const staffRoutes = router;
