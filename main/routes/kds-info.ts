/**
 * GET /api/kds-info
 * Returns the KDS access URLs (mDNS + local IP) so the POS UI can render a QR code.
 * The tablet/display on the same network opens either URL in a browser.
 */
import { Router, Request, Response } from 'express';
import QRCode from 'qrcode';
import { getLocalIP } from '../server';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const port = process.env.PORT || 3001;
  const ip = getLocalIP();

  const mdnsUrl = `http://flo.local:${port}/kds`;
  const ipUrl   = `http://${ip}:${port}/kds`;
  // Prefer IP URL for QR — mDNS may not resolve on Android
  const qrUrl   = ipUrl;

  let qrDataUrl: string | null = null;
  try {
    qrDataUrl = await QRCode.toDataURL(qrUrl, { errorCorrectionLevel: 'M', width: 256 });
  } catch (err) {
    console.warn('[KDS-Info] QR generation failed:', err);
  }

  res.json({
    mdns_url:    mdnsUrl,
    ip_url:      ipUrl,
    qr_url:      qrUrl,
    qr_data_url: qrDataUrl,
  });
});

export const kdsInfoRoutes = router;
