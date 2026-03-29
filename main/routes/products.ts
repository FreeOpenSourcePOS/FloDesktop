import { Router, Request, Response } from 'express';
import { getDatabase, now } from '../db';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    let query = 'SELECT * FROM products WHERE deleted_at IS NULL';
    const params: any[] = [];

    if (req.query.category_id) {
      query += ' AND category_id = ?';
      params.push(req.query.category_id);
    }
    if (req.query.active === 'true' || req.query.active === '1') {
      query += ' AND is_active = 1';
    }
    if (req.query.search) {
      query += ' AND (name LIKE ? OR sku LIKE ?)';
      const searchTerm = `%${req.query.search}%`;
      params.push(searchTerm, searchTerm);
    }
    if (req.query.low_stock === 'true') {
      query += ' AND track_inventory = 1 AND stock_quantity <= low_stock_threshold';
    }

    query += ' ORDER BY sort_order, name';

    const products = db.prepare(query).all(...params);

    // Load category and addon groups for each product
    const productsWithRelations = products.map((product: any) => {
      const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(product.category_id);
      const addonGroupIds = db.prepare('SELECT addon_group_id FROM addon_group_product WHERE product_id = ?').all(product.id).map((r: any) => r.addon_group_id);
      const addonGroups = addonGroupIds.length > 0
        ? db.prepare(`SELECT * FROM addon_groups WHERE id IN (${addonGroupIds.map(() => '?').join(',')})`).all(...addonGroupIds)
        : [];
      
      // Load addons for each group
      const addonGroupsWithAddons = addonGroups.map((group: any) => {
        const addons = db.prepare('SELECT * FROM addons WHERE addon_group_id = ?').all(group.id);
        return { ...group, addons };
      });

      return { ...product, category, addonGroups: addonGroupsWithAddons };
    });

    res.json({ products: productsWithRelations });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const product = db.prepare('SELECT * FROM products WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const category = db.prepare('SELECT * FROM categories WHERE id = ?').get((product as any).category_id);
    const addonGroupIds = db.prepare('SELECT addon_group_id FROM addon_group_product WHERE product_id = ?').all(req.params.id).map((r: any) => r.addon_group_id);
    const addonGroups = addonGroupIds.length > 0
      ? db.prepare(`SELECT * FROM addon_groups WHERE id IN (${addonGroupIds.map(() => '?').join(',')})`).all(...addonGroupIds)
      : [];

    const addonGroupsWithAddons = addonGroups.map((group: any) => {
      const addons = db.prepare('SELECT * FROM addons WHERE addon_group_id = ?').all(group.id);
      return { ...group, addons };
    });

    res.json({ product: { ...product, category, addonGroups: addonGroupsWithAddons } });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/', (req: Request, res: Response) => {
  try {
    const {
      category_id, name, sku, description, price, cost_price, cb_percent,
      tax_type, tax_rate, hsn_code, track_inventory, stock_quantity,
      low_stock_threshold, is_active, available_online, image_url,
      tags, variants, modifiers, sort_order, addon_group_ids
    } = req.body;

    if (!name || price === undefined) {
      return res.status(400).json({ error: 'Name and price are required' });
    }

    const db = getDatabase();
    const result = db.prepare(`
      INSERT INTO products (category_id, name, sku, description, price, cost_price, cb_percent,
        tax_type, tax_rate, hsn_code, track_inventory, stock_quantity, low_stock_threshold,
        is_active, available_online, image_url, tags, variants, modifiers, sort_order, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      category_id || null, name, sku || null, description || null, price, cost_price || 0, cb_percent || 0,
      tax_type || 'none', tax_rate || 0, hsn_code || null,
      track_inventory ? 1 : 0, stock_quantity || 0, low_stock_threshold || 0,
      is_active !== false ? 1 : 0, available_online ? 1 : 0, image_url || null,
      JSON.stringify(tags || []), JSON.stringify(variants || {}), JSON.stringify(modifiers || {}),
      sort_order || 0, now(), now()
    );

    const productId = result.lastInsertRowid;

    // Link addon groups
    if (addon_group_ids && addon_group_ids.length > 0) {
      const insertAgp = db.prepare('INSERT INTO addon_group_product (addon_group_id, product_id) VALUES (?, ?)');
      for (const agId of addon_group_ids) {
        insertAgp.run(agId, productId);
      }
    }

    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
    res.status(201).json({ product });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const product = db.prepare('SELECT * FROM products WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const {
      category_id, name, sku, description, price, cost_price, cb_percent,
      tax_type, tax_rate, hsn_code, track_inventory, stock_quantity,
      low_stock_threshold, is_active, available_online, image_url,
      tags, variants, modifiers, sort_order, addon_group_ids
    } = req.body;

    db.prepare(`
      UPDATE products SET category_id = COALESCE(?, category_id), name = COALESCE(?, name),
        sku = COALESCE(?, sku), description = COALESCE(?, description), price = COALESCE(?, price),
        cost_price = COALESCE(?, cost_price), cb_percent = COALESCE(?, cb_percent),
        tax_type = COALESCE(?, tax_type), tax_rate = COALESCE(?, tax_rate),
        hsn_code = COALESCE(?, hsn_code), track_inventory = COALESCE(?, track_inventory),
        stock_quantity = COALESCE(?, stock_quantity), low_stock_threshold = COALESCE(?, low_stock_threshold),
        is_active = COALESCE(?, is_active), available_online = COALESCE(?, available_online),
        image_url = COALESCE(?, image_url), tags = COALESCE(?, tags),
        variants = COALESCE(?, variants), modifiers = COALESCE(?, modifiers),
        sort_order = COALESCE(?, sort_order), updated_at = ?
      WHERE id = ?
    `).run(
      category_id, name, sku, description, price, cost_price, cb_percent,
      tax_type, tax_rate, hsn_code,
      track_inventory ? 1 : track_inventory === 0 ? 0 : null,
      stock_quantity, low_stock_threshold,
      is_active !== undefined ? (is_active ? 1 : 0) : null,
      available_online !== undefined ? (available_online ? 1 : 0) : null,
      image_url, tags ? JSON.stringify(tags) : null,
      variants ? JSON.stringify(variants) : null,
      modifiers ? JSON.stringify(modifiers) : null,
      sort_order, now(), req.params.id
    );

    // Update addon group links
    if (addon_group_ids !== undefined) {
      db.prepare('DELETE FROM addon_group_product WHERE product_id = ?').run(req.params.id);
      if (addon_group_ids && addon_group_ids.length > 0) {
        const insertAgp = db.prepare('INSERT INTO addon_group_product (addon_group_id, product_id) VALUES (?, ?)');
        for (const agId of addon_group_ids) {
          insertAgp.run(agId, req.params.id);
        }
      }
    }

    const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    res.json({ product: updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const product = db.prepare('SELECT * FROM products WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    db.prepare('UPDATE products SET deleted_at = ? WHERE id = ?').run(now(), req.params.id);
    res.json({ message: 'Product deleted' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/:id/stock', (req: Request, res: Response) => {
  try {
    const { action, quantity } = req.body;

    if (!action || quantity === undefined) {
      return res.status(400).json({ error: 'Action and quantity are required' });
    }

    if (!['set', 'increase', 'decrease'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action. Use: set, increase, decrease' });
    }

    const db = getDatabase();
    const product = db.prepare('SELECT * FROM products WHERE id = ? AND deleted_at IS NULL').get(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    let newQuantity = 0;
    switch (action) {
      case 'set':
        newQuantity = quantity;
        break;
      case 'increase':
        newQuantity = (product as any).stock_quantity + quantity;
        break;
      case 'decrease':
        newQuantity = (product as any).stock_quantity - quantity;
        if (newQuantity < 0) {
          return res.status(400).json({ error: 'Insufficient stock' });
        }
        break;
    }

    db.prepare('UPDATE products SET stock_quantity = ?, updated_at = ? WHERE id = ?').run(newQuantity, now(), req.params.id);
    const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
    res.json({ product: updated });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export const productRoutes = router;