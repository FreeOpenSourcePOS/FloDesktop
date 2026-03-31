import { Router, Request, Response } from 'express';
import { getDatabase, now, parseItemJson } from '../db';
import { notifyKdsUpdate } from '../services/kds';

const router = Router();

// PATCH /api/order-items/:id/status — update a single item's kitchen status
router.patch('/:id/status', (req: Request, res: Response) => {
  try {
    const { status } = req.body;
    const validStatuses = ['pending', 'preparing', 'ready', 'served'];

    if (!status || !validStatuses.includes(status)) {
      return res.status(400).json({ error: `Valid status required: ${validStatuses.join(', ')}` });
    }

    const db = getDatabase();
    const item = db.prepare('SELECT * FROM order_items WHERE id = ?').get(req.params.id) as any;
    if (!item) {
      return res.status(404).json({ error: 'Order item not found' });
    }

    db.prepare('UPDATE order_items SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, now(), req.params.id);

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(item.order_id) as any;
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(item.order_id).map(parseItemJson);
    const tableRow = order.table_id
      ? db.prepare('SELECT * FROM tables WHERE id = ?').get(order.table_id) as any
      : null;
    const table = tableRow ? { ...tableRow, name: tableRow.number } : null;

    notifyKdsUpdate();

    res.json({ order: { ...order, items, table } });
  } catch (error: any) {
    console.error('[OrderItems] Status update error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:orderId/items/:itemId', (req: Request, res: Response) => {
  try {
    const { orderId, itemId } = req.params;
    const userRole = req.headers['x-user-role'] as string;

    if (!userRole || !['owner', 'manager'].includes(userRole.toLowerCase())) {
      return res.status(403).json({ error: 'Only owner or manager can cancel items' });
    }

    const db = getDatabase();
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as any;
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.status !== 'pending') {
      return res.status(400).json({ error: 'Can only cancel items from pending orders' });
    }

    const item = db.prepare('SELECT * FROM order_items WHERE id = ? AND order_id = ?').get(itemId, orderId) as any;
    if (!item) {
      return res.status(404).json({ error: 'Item not found in this order' });
    }

    if (item.product_id) {
      const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.product_id) as any;
      if (product?.track_inventory) {
        db.prepare('UPDATE products SET stock_quantity = stock_quantity + ?, updated_at = ? WHERE id = ?')
          .run(item.quantity, now(), item.product_id);
      }
    }

    db.prepare('DELETE FROM order_items WHERE id = ?').run(itemId);

    const remainingItems = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId).map(parseItemJson);
    let subtotal = 0;
    let totalTax = 0;
    for (const i of remainingItems) {
      subtotal += i.subtotal;
      totalTax += i.tax_amount;
    }
    const preRoundTotal = subtotal + totalTax + ((order as any).packaging_charge || 0);
    const roundOff = Math.round(preRoundTotal) - preRoundTotal;
    const total = Math.round(preRoundTotal) + roundOff;
    db.prepare(`
      UPDATE orders SET
        subtotal = ?,
        tax_amount = ?,
        total = ?,
        round_off = ?,
        updated_at = ?
      WHERE id = ?
    `).run(subtotal, totalTax, total, roundOff, now(), orderId);

    const updatedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId) as any;
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId).map(parseItemJson);

    res.json({ order: { ...updatedOrder, items }, deleted: itemId });
  } catch (error: any) {
    console.error('[OrderItems] Delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

export const orderItemRoutes = router;
