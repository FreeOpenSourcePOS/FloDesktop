import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { WebSocketServer, WebSocket } from 'ws';
import * as http from 'http';
import * as os from 'os';
import { registerRoutes } from './routes';
import { setupKdsWebSocket } from './services/kds';

let server: http.Server;
let app: Express;
let wss: WebSocketServer;

const PORT = 3001;

export function startServer(): Promise<void> {
  return new Promise((resolve, reject) => {
    app = express();

    app.use(cors());
    app.use(express.json());

    app.get('/api/health', (req: Request, res: Response) => {
      res.json({
        status: 'ok',
        service: 'FloPos Local API',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
      });
    });

    registerRoutes(app);

    app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
      console.error('[Server] Error:', err);
      res.status(500).json({ error: err.message || 'Internal server error' });
    });

    server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`[Server] HTTP server running on http://localhost:${PORT}`);

      wss = new WebSocketServer({ server, path: '/kds' });
      setupKdsWebSocket(wss);
      console.log('[Server] KDS WebSocket server running on ws://localhost:' + PORT + '/kds');

      resolve();
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`[Server] Port ${PORT} in use, trying ${PORT + 1}`);
        server.listen(PORT + 1, '0.0.0.0');
      } else {
        reject(err);
      }
    });
  });
}

export function stopServer(): void {
  if (wss) {
    wss.close();
  }
  if (server) {
    server.close();
  }
  console.log('[Server] HTTP server stopped');
}

export function getLocalIP(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    const iface = interfaces[name];
    if (!iface) continue;
    for (const alias of iface) {
      if (alias.family === 'IPv4' && !alias.internal) {
        return alias.address;
      }
    }
  }
  return '127.0.0.1';
}