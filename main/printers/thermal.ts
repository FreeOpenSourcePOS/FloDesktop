import * as net from 'net';
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

    const receipt = formatReceipt(order, bill);

    switch (printer.connection_type) {
      case 'network':
        return await printViaNetwork(printer.ip_address, printer.port || 9100, receipt);
      case 'usb':
        return await printViaUSB(receipt);
      default:
        console.log(`[Printer] Unsupported connection type: ${printer.connection_type}`);
        return false;
    }
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

    const kot = formatKOT(order, items, stationName);

    switch (printer.connection_type) {
      case 'network':
        return await printViaNetwork(printer.ip_address, printer.port || 9100, kot);
      case 'usb':
        return await printViaUSB(kot);
      default:
        return false;
    }
  } catch (error: any) {
    console.error('[Printer] KOT print error:', error);
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

  lines.push('{ESC,}');
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

  return formatESCPOS(lines);
}

function formatKOT(order: any, items: any[], stationName: string): Buffer {
  const lines: string[] = [];

  lines.push('{ESC,}');
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

  return formatESCPOS(lines);
}

function formatESCPOS(lines: string[]): Buffer {
  const buffer: number[] = [];

  for (const line of lines) {
    const escMatch = line.match(/\{ESC\}/);
    if (escMatch) {
      buffer.push(0x1B);
      continue;
    }

    const centerMatch = line.match(/\{CENTER\}(.*?)\{\/CENTER\}/);
    if (centerMatch) {
      buffer.push(0x1B, 0x61, 0x01); // Center alignment
      buffer.push(...Buffer.from(centerMatch[1], 'utf8'));
      buffer.push(0x1B, 0x61, 0x00); // Left alignment
      buffer.push(0x0A);
      continue;
    }

    const boldMatch = line.match(/\{BOLD\}(.*?)\{\/BOLD\}/);
    if (boldMatch) {
      buffer.push(0x1B, 0x45, 0x01); // Bold on
      buffer.push(...Buffer.from(boldMatch[1], 'utf8'));
      buffer.push(0x1B, 0x45, 0x00); // Bold off
      buffer.push(0x0A);
      continue;
    }

    const feedMatch = line.match(/\{FEED\}/);
    if (feedMatch) {
      buffer.push(0x1B, 0x64, 0x03); // Feed 3 lines
      continue;
    }

    const cutMatch = line.match(/\{CUT\}/);
    if (cutMatch) {
      buffer.push(0x1D, 0x56, 0x00); // Full cut
      continue;
    }

    buffer.push(...Buffer.from(line, 'utf8'));
    buffer.push(0x0A);
  }

  return Buffer.from(buffer);
}

async function printViaNetwork(ip: string, port: number, data: Buffer): Promise<boolean> {
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

async function printViaUSB(data: Buffer): Promise<boolean> {
  // USB printing would require native module integration
  // For now, we'll use the network approach
  console.log('[Printer] USB printing not fully implemented, using network fallback');
  return false;
}

export function getPrinterStatus(): { connected: boolean; printer: any } {
  const printer = getPrinterConfig();
  return {
    connected: !!printer,
    printer,
  };
}