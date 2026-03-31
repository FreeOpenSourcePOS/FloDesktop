import * as net from 'net';
import * as fs from 'fs';
import { getDatabase } from '../db';

let defaultPrinter: any = null;

export async function initPrinter(): Promise<void> {
  try {
    const db = getDatabase();
    defaultPrinter = db.prepare('SELECT * FROM printers WHERE is_default = 1').get();
    if (defaultPrinter) {
      console.log(`[Printer] Default printer: ${defaultPrinter.name} (${defaultPrinter.connection_type})`);
    } else {
      console.log('[Printer] No default printer configured');
    }
  } catch (error) {
    console.log('[Printer] Printer initialization skipped (database not ready)');
  }
}

export async function printReceipt(order: any, bill: any): Promise<boolean> {
  try {
    const printer = getPrinterConfig();
    if (!printer) {
      console.log('[Printer] No printer configured');
      return false;
    }
    return await dispatchPrint(printer, formatReceipt(order, bill));
  } catch (error: any) {
    console.error('[Printer] Print error:', error);
    return false;
  }
}

export async function printKOT(order: any, items: any[], stationName: string): Promise<boolean> {
  try {
    const printer = getPrinterConfig();
    if (!printer) {
      console.log('[Printer] No printer configured');
      return false;
    }
    return await dispatchPrint(printer, formatKOT(order, items, stationName));
  } catch (error: any) {
    console.error('[Printer] KOT print error:', error);
    return false;
  }
}

async function dispatchPrint(printer: any, data: Buffer): Promise<boolean> {
  switch (printer.connection_type) {
    case 'network':
      return await printViaNetwork(printer.ip_address, printer.port || 9100, data);
    case 'usb':
      return await printViaUSB(data, printer.usb_device_path);
    case 'webusb':
      // WebUSB jobs are dispatched from the browser; server-side we can't reach the USB device.
      console.log('[Printer] WebUSB printer — print must be triggered from the browser');
      return false;
    default:
      console.log(`[Printer] Unsupported connection type: ${printer.connection_type}`);
      return false;
  }
}

function getPrinterConfig(): any {
  if (defaultPrinter) return defaultPrinter;
  const db = getDatabase();
  return db.prepare('SELECT * FROM printers WHERE is_default = 1').get();
}

function formatReceipt(order: any, bill: any): Buffer {
  const lines: string[] = [];

  lines.push('{INIT}');
  lines.push('{CENTER}{BOLD}RECEIPT{/BOLD}{/CENTER}');
  lines.push('');
  lines.push(`Order: ${order.order_number}`);
  lines.push(`Date: ${new Date(order.created_at).toLocaleString()}`);
  lines.push('--------------------------------');

  if (order.items) {
    for (const item of order.items) {
      lines.push(`${item.quantity}x ${item.product_name}`);
      lines.push(`   ${item.unit_price} = ${item.total}`);
      if (item.addons) {
        try {
          const addons = typeof item.addons === 'string' ? JSON.parse(item.addons) : item.addons;
          for (const addon of addons) {
            lines.push(`   + ${addon.name} (${addon.price})`);
          }
        } catch {}
      }
    }
  }

  lines.push('--------------------------------');
  lines.push(`Subtotal: ${bill.subtotal}`);
  lines.push(`Tax: ${bill.tax_amount}`);
  if (bill.discount_amount > 0) {
    lines.push(`Discount: -${bill.discount_amount}`);
  }
  lines.push(`Total: ${bill.total}`);
  lines.push('');

  if (bill.payment_details) {
    try {
      const payments = typeof bill.payment_details === 'string' ? JSON.parse(bill.payment_details) : bill.payment_details;
      for (const payment of payments) {
        lines.push(`${payment.method}: ${payment.amount}`);
      }
    } catch {}
  }

  lines.push('');
  lines.push('{CENTER}Thank you!{/CENTER}');
  lines.push('{FEED}{CUT}');

  return buildEscPos(lines);
}

function formatKOT(order: any, items: any[], stationName: string): Buffer {
  const lines: string[] = [];

  lines.push('{INIT}');
  lines.push('{CENTER}{BOLD}KITCHEN ORDER TICKET{/BOLD}{/CENTER}');
  lines.push('');
  lines.push(`Station: ${stationName}`);
  lines.push(`Order: ${order.order_number}`);
  if (order.table) {
    lines.push(`Table: ${order.table.name}`);
  }
  lines.push(`Time: ${new Date(order.created_at).toLocaleTimeString()}`);
  lines.push('================================');

  for (const item of items) {
    lines.push('');
    lines.push(`{BOLD}${item.quantity}x ${item.product_name}{/BOLD}`);
    if (item.special_instructions) {
      lines.push(`** ${item.special_instructions} **`);
    }
    lines.push(`Status: ${item.status}`);
  }

  lines.push('');
  lines.push('================================');
  lines.push('{FEED}{CUT}');

  return buildEscPos(lines);
}

/** Build a simple test page to verify the printer is working. */
export function buildTestPage(paperWidth: string = '80mm'): Buffer {
  const width = paperWidth === '58mm' ? 32 : 48;
  const bar = '-'.repeat(width);
  const lines = [
    '{INIT}',
    '{CENTER}{BOLD}Flo Printer Test{/BOLD}{/CENTER}',
    '',
    bar,
    '{CENTER}Network / USB test print{/CENTER}',
    bar,
    '',
    `Paper: ${paperWidth}`,
    `Time: ${new Date().toLocaleString()}`,
    '',
    bar,
    '{CENTER}If you can read this, your printer is working!{/CENTER}',
    bar,
    '{FEED}{CUT}',
  ];
  return buildEscPos(lines);
}

function buildEscPos(lines: string[]): Buffer {
  const buf: number[] = [];

  for (const line of lines) {
    // ESC @ — initialize printer
    if (line.includes('{INIT}')) {
      buf.push(0x1B, 0x40);
      continue;
    }

    // {CENTER}...{/CENTER} — with optional inner {BOLD}
    const centerBoldMatch = line.match(/^\{CENTER\}\{BOLD\}(.*?)\{\/BOLD\}\{\/CENTER\}$/);
    if (centerBoldMatch) {
      buf.push(0x1B, 0x61, 0x01);   // align center
      buf.push(0x1B, 0x45, 0x01);   // bold on
      buf.push(...Buffer.from(centerBoldMatch[1], 'utf8'));
      buf.push(0x1B, 0x45, 0x00);   // bold off
      buf.push(0x1B, 0x61, 0x00);   // align left
      buf.push(0x0A);
      continue;
    }

    const centerMatch = line.match(/^\{CENTER\}(.*?)\{\/CENTER\}$/);
    if (centerMatch) {
      buf.push(0x1B, 0x61, 0x01);
      buf.push(...Buffer.from(centerMatch[1], 'utf8'));
      buf.push(0x1B, 0x61, 0x00);
      buf.push(0x0A);
      continue;
    }

    const boldMatch = line.match(/^\{BOLD\}(.*?)\{\/BOLD\}$/);
    if (boldMatch) {
      buf.push(0x1B, 0x45, 0x01);
      buf.push(...Buffer.from(boldMatch[1], 'utf8'));
      buf.push(0x1B, 0x45, 0x00);
      buf.push(0x0A);
      continue;
    }

    if (line.includes('{FEED}')) {
      buf.push(0x1B, 0x64, 0x03);   // feed 3 lines
      continue;
    }

    if (line.includes('{CUT}')) {
      buf.push(0x1D, 0x56, 0x00);   // full cut
      continue;
    }

    buf.push(...Buffer.from(line, 'utf8'));
    buf.push(0x0A);
  }

  return Buffer.from(buf);
}

export async function printViaNetwork(ip: string, port: number, data: Buffer): Promise<boolean> {
  return new Promise((resolve) => {
    const client = new net.Socket();

    client.connect(port, ip, () => {
      client.write(data);
      client.end();
      resolve(true);
    });

    client.on('error', (err) => {
      console.error(`[Printer] Network error: ${err.message}`);
      resolve(false);
    });

    client.setTimeout(5000, () => {
      client.destroy();
      resolve(false);
    });
  });
}

/**
 * USB printing via raw device file write.
 *
 * Linux:   /dev/usb/lp0  (most USB thermal printers)
 * macOS:   /dev/cu.usbserial-XXXX  or via CUPS at /dev/usb/lp0
 * Windows: Not supported via file path — use network/WebUSB instead.
 *
 * The user configures usb_device_path when adding the printer.
 */
export async function printViaUSB(data: Buffer, devicePath?: string): Promise<boolean> {
  const path = devicePath || '/dev/usb/lp0';

  return new Promise((resolve) => {
    fs.open(path, 'w', (openErr, fd) => {
      if (openErr) {
        console.error(`[Printer] USB open error (${path}): ${openErr.message}`);
        resolve(false);
        return;
      }
      fs.write(fd, data, (writeErr) => {
        fs.close(fd, () => {});
        if (writeErr) {
          console.error(`[Printer] USB write error: ${writeErr.message}`);
          resolve(false);
        } else {
          console.log(`[Printer] USB print sent to ${path}`);
          resolve(true);
        }
      });
    });
  });
}

export function getPrinterStatus(): { connected: boolean; printer: any } {
  const printer = getPrinterConfig();
  return { connected: !!printer, printer };
}
