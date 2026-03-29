/**
 * GET /api/kds-info
 * Returns the KDS access URLs (mDNS + local IP) so the POS UI can render a QR code.
 * The tablet/display on the same network opens either URL in a browser.
 */
import { Router, Request, Response } from 'express';
import { getLocalIP } from '../server';

const router = Router();

router.get('/', (_req: Request, res: Response) => {
  const port = process.env.PORT || 3001;
  const ip = getLocalIP();

  res.json({
    mdns_url: `http://flopos.local:${port}/kds`,
    ip_url:   `http://${ip}:${port}/kds`,
    // Prefer the IP URL for the QR code — mDNS may not resolve on Android
    qr_url:   `http://${ip}:${port}/kds`,
  });
});

export const kdsInfoRoutes = router;
