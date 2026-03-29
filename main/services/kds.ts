import { WebSocketServer, WebSocket } from 'ws';
import { getDatabase, now } from '../db';

interface KdsClient {
  ws: WebSocket;
  stationId: number | null;
  stationName: string | null;
  token: string | null;
}

const clients: Map<WebSocket, KdsClient> = new Map();

export function setupKdsWebSocket(wss: WebSocketServer): void {
  wss.on('connection', (ws: WebSocket, req) => {
    console.log('[KDS] New client connection');

    const client: KdsClient = {
      ws,
      stationId: null,
      stationName: null,
      token: null,
    };
    clients.set(ws, client);

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        handleMessage(ws, message);
      } catch (error) {
        console.error('[KDS] Message parse error:', error);
      }
    });

    ws.on('close', () => {
      console.log('[KDS] Client disconnected');
      clients.delete(ws);
    });

    ws.on('error', (error) => {
      console.error('[KDS] Client error:', error);
    });

    // Send welcome message
    ws.send(JSON.stringify({
      type: 'connected',
      message: 'Connected to FloPos KDS',
      timestamp: new Date().toISOString(),
    }));
  });

  console.log('[KDS] WebSocket server setup complete');
}

function handleMessage(ws: WebSocket, message: any): void {
  const client = clients.get(ws);
  if (!client) return;

  switch (message.type) {
    case 'auth':
      handleAuth(ws, client, message);
      break;

    case 'status_update':
      handleStatusUpdate(client, message);
      break;

    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', timestamp: new Date().toISOString() }));
      break;

    default:
      ws.send(JSON.stringify({ type: 'error', message: 'Unknown message type' }));
  }
}

function handleAuth(ws: WebSocket, client: KdsClient, message: any): void {
  const { token, station_id, station_name } = message;

  // Validate token
  if (token) {
    const db = getDatabase();
    const pairingToken = db.prepare('SELECT * FROM kds_pairing_tokens WHERE token = ? AND expires_at > ?')
      .get(token, now()) as any;

    if (pairingToken) {
      client.stationId = pairingToken.station_id;
      client.stationName = station_name || 'Unknown';
      client.token = token;

      // Delete used token
      db.prepare('DELETE FROM kds_pairing_tokens WHERE token = ?').run(token);

      ws.send(JSON.stringify({
        type: 'auth_success',
        station_id: client.stationId,
        station_name: client.stationName,
      }));

      // Send current orders
      sendActiveOrders(ws, client.stationId);
      return;
    }
  }

  // Fallback: direct station login
  if (station_id) {
    client.stationId = station_id;
    client.stationName = station_name || 'Unknown';

    ws.send(JSON.stringify({
      type: 'auth_success',
      station_id: client.stationId,
      station_name: client.stationName,
    }));

    sendActiveOrders(ws, client.stationId);
    return;
  }

  ws.send(JSON.stringify({
    type: 'auth_error',
    message: 'Invalid token or station_id required',
  }));
}

function handleStatusUpdate(client: KdsClient, message: any): void {
  if (!client.stationId) {
    client.ws.send(JSON.stringify({ type: 'error', message: 'Not authenticated' }));
    return;
  }

  const { order_item_id, status } = message;

  if (!order_item_id || !status) {
    client.ws.send(JSON.stringify({ type: 'error', message: 'order_item_id and status required' }));
    return;
  }

  const db = getDatabase();
  const nowStr = now();

  // Update item status
  db.prepare('UPDATE order_items SET status = ?, prepared_at = ?, updated_at = ? WHERE id = ?')
    .run(status, status === 'ready' ? nowStr : null, nowStr, order_item_id);

  // Broadcast to all KDS clients
  broadcastOrderUpdate(client.stationId);

  client.ws.send(JSON.stringify({
    type: 'status_updated',
    order_item_id,
    status,
  }));
}

function sendActiveOrders(ws: WebSocket, stationId: number | null): void {
  const db = getDatabase();

  let query = `
    SELECT o.*, t.name as table_name
    FROM orders o
    LEFT JOIN tables t ON o.table_id = t.id
    WHERE o.status NOT IN ('completed', 'cancelled')
  `;

  if (stationId) {
    // Filter by station if specified
    query += ` AND o.table_id IN (SELECT id FROM tables WHERE kitchen_station_id = ?)`;
  }

  query += ' ORDER BY o.created_at DESC';

  const orders = stationId
    ? db.prepare(query).all(stationId)
    : db.prepare(query).all();

  const ordersWithItems = orders.map((order: any) => {
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
    return { ...order, items };
  });

  // Get counts
  const counts = db.prepare(`
    SELECT status, COUNT(*) as count
    FROM order_items
    WHERE order_id IN (SELECT id FROM orders WHERE status NOT IN ('completed', 'cancelled'))
    GROUP BY status
  `).all() as { status: string; count: number }[];

  const countMap: Record<string, number> = {};
  counts.forEach((c) => { countMap[c.status] = c.count; });

  ws.send(JSON.stringify({
    type: 'initial_data',
    orders: ordersWithItems,
    counts: countMap,
  }));
}

function broadcastOrderUpdate(stationId: number | null): void {
  clients.forEach((client) => {
    if (client.stationId === stationId || stationId === null) {
      sendActiveOrders(client.ws, client.stationId);
    }
  });
}

// Export for use in routes
export function notifyKdsUpdate(stationId?: number): void {
  broadcastOrderUpdate(stationId || null);
}

// Generate pairing token
export function generatePairingToken(stationId: number): string {
  const db = getDatabase();
  const token = Math.random().toString(36).substring(2, 8).toUpperCase();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes

  db.prepare('INSERT INTO kds_pairing_tokens (token, station_id, expires_at) VALUES (?, ?, ?)')
    .run(token, stationId, expiresAt);

  return token;
}