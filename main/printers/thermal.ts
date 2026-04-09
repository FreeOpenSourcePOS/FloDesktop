import * as net from 'net';
import * as fs from 'fs';
import { execSync, exec } from 'child_process';
import { getDatabase } from '../db';

let defaultPrinter: any = null;

export interface PrinterInfo {
  name: string;
  make: string;
  model: string;
  connectionType: 'usb' | 'network' | 'bluetooth';
  deviceUri: string;
  driver?: string;
  status: 'idle' | 'printing' | 'offline';
  isDefault: boolean;
}

export async function detectConnectedPrinters(): Promise<PrinterInfo[]> {
  const printers: PrinterInfo[] = [];

  if (process.platform === 'darwin') {
    return await detectMacOSPrinters();
  }

  if (process.platform === 'win32') {
    return detectWindowsPrinters();
  }

  if (process.platform === 'linux') {
    return detectLinuxPrinters();
  }

  return printers;
}

async function detectMacOSPrinters(): Promise<PrinterInfo[]> {
  const printers: PrinterInfo[] = [];

  try {
    const lpStatOutput = execSync('lpstat -v 2>/dev/null', { encoding: 'utf8' });
    const lines = lpStatOutput.split('\n');

    const printerNames = new Set<string>();

    for (const line of lines) {
      const match = line.match(/device for (\S+):\s*(.+)/);
      if (match) {
        const name = match[1];
        const uri = match[2].trim();

        if (!printerNames.has(name)) {
          printerNames.add(name);

          const makeModel = await getMacOSPrinterDetails(name);
          const isDefault = await isMacOSDefaultPrinter(name);

          printers.push({
            name,
            make: makeModel.make,
            model: makeModel.model,
            connectionType: uri.includes('usb://') ? 'usb' :
                          uri.includes('socket://') || uri.includes('ipp://') ? 'network' : 'usb',
            deviceUri: uri,
            status: 'idle',
            isDefault
          });
        }
      }
    }
  } catch (err) {
    console.log('[Printer] Could not detect macOS printers:', err);
  }

  return printers;
}

async function getMacOSPrinterDetails(name: string): Promise<{ make: string; model: string }> {
  let make = 'Unknown';
  let model = 'Thermal Printer';

  try {
    const info = execSync(`lpoptions -p "${name}" -l 2>/dev/null`, { encoding: 'utf8' });

    const lower = info.toLowerCase();

    if (lower.includes('epson') || name.toLowerCase().includes('tm-')) {
      make = 'Epson';
      model = extractEpsonModel(name, info);
    } else if (lower.includes('xprinter') || name.toLowerCase().includes('xprinter')) {
      make = 'Xprinter';
      model = name.includes('80') ? 'Xprinter 80mm' : 'Xprinter 58mm';
    } else if (lower.includes('star') || name.toLowerCase().includes('tsp')) {
      make = 'Star';
      model = 'TSP Thermal';
    } else if (lower.includes('zjiang') || name.toLowerCase().includes('zj')) {
      make = 'Zjiang';
      model = '58mm Thermal';
    } else if (lower.includes('zebra')) {
      make = 'Zebra';
      model = 'Zebra Thermal';
    } else if (lower.includes('brother')) {
      make = 'Brother';
      model = 'Brother Thermal';
    } else if (lower.includes('canon')) {
      make = 'Canon';
      model = 'Canon Printer';
    } else if (lower.includes('hp') || lower.includes('hewlett')) {
      make = 'HP';
      model = 'HP Printer';
    } else {
      const nameLower = name.toLowerCase();
      if (nameLower.includes('58') || nameLower.includes('thermal')) {
        make = 'Generic';
        model = '58mm Thermal Printer';
      } else if (nameLower.includes('80')) {
        make = 'Generic';
        model = '80mm Thermal Printer';
      }
    }
  } catch {
    const nameLower = name.toLowerCase();
    if (nameLower.includes('epson') || nameLower.includes('tm-')) {
      make = 'Epson';
      model = 'TM Series';
    } else if (nameLower.includes('xprinter')) {
      make = 'Xprinter';
      model = nameLower.includes('80') ? 'Xprinter 80mm' : 'Xprinter 58mm';
    }
  }

  return { make, model };
}

function extractEpsonModel(name: string, info: string): string {
  const lower = name.toLowerCase();
  if (lower.includes('tm-m30')) return 'TM-m30';
  if (lower.includes('tm-t88')) return 'TM-T88';
  if (lower.includes('tm-t82')) return 'TM-T82';
  if (lower.includes('tm-t20')) return 'TM-T20';
  if (lower.includes('tm-t60')) return 'TM-T60';
  if (lower.includes('tm-l90')) return 'TM-L90';
  if (lower.includes('tm-h600')) return 'TM-H600';
  if (lower.includes('tm-u')) return 'TM-U Series';
  if (lower.includes('tm-')) return 'TM Series';
  return 'Epson Thermal';
}

async function isMacOSDefaultPrinter(name: string): Promise<boolean> {
  try {
    const defaultPrinter = execSync('lpstat -d 2>/dev/null', { encoding: 'utf8' });
    return defaultPrinter.includes(name);
  } catch {
    return false;
  }
}

function detectWindowsPrinters(): PrinterInfo[] {
  const printers: PrinterInfo[] = [];

  try {
    const output = execSync('wmic printer get Name,Default,Status,DriverName 2>/dev/null', { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    const lines = output.split('\n').slice(1);

    for (const line of lines) {
      const parts = line.trim().split(/\s{2,}/);
      if (parts.length >= 2 && parts[0]) {
        const name = parts[0].trim();
        const isDefault = parts[1]?.toLowerCase() === 'true';
        const status = parts[2]?.toLowerCase() || 'unknown';
        const driver = parts[3] || '';

        const makeModel = detectWindowsMakeModel(name, driver);

        printers.push({
          name,
          make: makeModel.make,
          model: makeModel.model,
          connectionType: 'usb',
          deviceUri: name,
          driver,
          status: status === 'ok' || status === 'idle' ? 'idle' : 'offline',
          isDefault
        });
      }
    }
  } catch (err) {
    console.log('[Printer] Could not detect Windows printers via wmic:', err);
  }

  return printers;
}

function detectWindowsMakeModel(name: string, driver: string): { make: string; model: string } {
  let make = 'Unknown';
  let model = 'Thermal Printer';

  const lower = (name + ' ' + driver).toLowerCase();

  if (lower.includes('epson') || name.toLowerCase().includes('tm-')) {
    make = 'Epson';
    model = name.includes('TM-m30') ? 'TM-m30' :
            name.includes('TM-T88') ? 'TM-T88' :
            name.includes('TM-T82') ? 'TM-T82' :
            name.includes('TM-T20') ? 'TM-T20' : 'TM Series';
  } else if (lower.includes('xprinter')) {
    make = 'Xprinter';
    model = lower.includes('80') ? 'Xprinter 80mm' : 'Xprinter 58mm';
  } else if (lower.includes('star') || lower.includes('tsp')) {
    make = 'Star';
    model = 'TSP Thermal';
  } else if (lower.includes('zjiang')) {
    make = 'Zjiang';
    model = '58mm Thermal';
  } else if (lower.includes('zebra')) {
    make = 'Zebra';
    model = 'Zebra Thermal';
  } else if (lower.includes('brother')) {
    make = 'Brother';
    model = 'Brother Thermal';
  } else if (lower.includes('58') || lower.includes('thermal')) {
    make = 'Generic';
    model = '58mm Thermal';
  } else if (lower.includes('80')) {
    make = 'Generic';
    model = '80mm Thermal';
  }

  return { make, model };
}

function detectLinuxPrinters(): PrinterInfo[] {
  const printers: PrinterInfo[] = [];

  try {
    const output = execSync('lpstat -v 2>/dev/null', { encoding: 'utf8' });
    const lines = output.split('\n');

    for (const line of lines) {
      const match = line.match(/device for (\S+):\s*(.+)/);
      if (match) {
        const name = match[1];
        const uri = match[2].trim();

        printers.push({
          name,
          make: 'Generic',
          model: 'Thermal Printer',
          connectionType: uri.includes('/dev/usb') ? 'usb' : 'network',
          deviceUri: uri,
          status: 'idle',
          isDefault: false
        });
      }
    }
  } catch {
    console.log('[Printer] Could not detect Linux printers');
  }

  return printers;
}

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

export async function printReceipt(order: any, bill: any, business?: any, template?: string): Promise<boolean> {
  try {
    console.log('[Printer] printReceipt called, template:', template);
    const printer = getPrinterConfig();
    if (!printer) {
      console.log('[Printer] No printer configured');
      return false;
    }
    console.log('[Printer] Using printer:', printer.name, printer.connection_type);
    const data = formatReceipt(order, bill, business, template);
    console.log('[Printer] Receipt data length:', data.length, 'bytes');
    return await dispatchPrint(printer, data);
  } catch (error: any) {
    console.error('[Printer] Print error:', error);
    return false;
  }
}

export async function printKOT(order: any, items: any[], stationName: string): Promise<boolean> {
  try {
    console.log('[Printer] printKOT called, items count:', items?.length || 0);
    const printer = getPrinterConfig();
    if (!printer) {
      console.log('[Printer] No printer configured');
      return false;
    }
    console.log('[Printer] Using printer:', printer.name, printer.connection_type);
    const data = formatKOT(order, items, stationName);
    console.log('[Printer] KOT data length:', data.length, 'bytes');
    return await dispatchPrint(printer, data);
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
      return await printViaUSB(data, printer.name);
    case 'webusb':
      console.log('[Printer] WebUSB printer — not supported in Electron');
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

function formatReceipt(order: any, bill: any, business?: any, template?: string): Buffer {
  console.log('[Printer] formatReceipt - template:', template);
  console.log('[Printer] formatReceipt - order:', order?.order_number, 'bill:', bill?.bill_number);
  console.log('[Printer] formatReceipt - items count:', order?.items?.length || 0);
  
  const tpl = template || 'compact';
  const biz = business || { name: 'Store', address: '', phone: '', gstin: '' };

  try {
    switch (tpl) {
      case 'classic':
        return formatClassicReceipt(order, bill, biz);
      case 'detailed':
        return formatDetailedReceipt(order, bill, biz);
      default:
        return formatCompactReceipt(order, bill, biz);
    }
  } catch (err) {
    console.error('[Printer] formatReceipt error:', err);
    throw err;
  }
}

function formatCompactReceipt(order: any, bill: any, biz: any): Buffer {
  const lines: string[] = [];
  const currency = '₹';
  const date = new Date(order.created_at);

  lines.push('{INIT}');
  lines.push('{CENTER}{BOLD}' + biz.name + '{/BOLD}{/CENTER}');
  if (biz.address) lines.push('{CENTER}' + biz.address + '{/CENTER}');
  lines.push('{CENTER}' + biz.phone + '{/CENTER}');
  lines.push('================================');

  lines.push(`Bill #${bill.bill_number || order.order_number}`);
  lines.push(date.toLocaleDateString() + '  ' + date.toLocaleTimeString());
  lines.push('--------------------------------');

  if (order.items) {
    for (const item of order.items) {
      lines.push(item.product_name + ' x' + item.quantity);
      const addons = parseAddons(item.addons);
      if (addons.length > 0) {
        for (const addon of addons) {
          lines.push('  + ' + addon.name);
        }
      }
      if (item.special_instructions) {
        lines.push('  ** ' + item.special_instructions);
      }
    }
  }

  lines.push('================================');
  lines.push('Subtotal' + rightAlign(formatCurrency(bill.subtotal)));
  if (bill.discount_amount > 0) {
    lines.push('Discount' + rightAlign('-' + formatCurrency(bill.discount_amount)));
  }
  lines.push('Tax' + rightAlign(formatCurrency(bill.tax_amount)));
  lines.push('{BOLD}TOTAL' + rightAlign(formatCurrency(bill.total)) + '{/BOLD}');

  if (bill.payment_details) {
    lines.push('--------------------------------');
    try {
      const payments = typeof bill.payment_details === 'string' ? JSON.parse(bill.payment_details) : bill.payment_details;
      for (const payment of payments) {
        lines.push(payment.method + rightAlign(formatCurrency(payment.amount)));
      }
    } catch {}
  }

  lines.push('================================');
  lines.push('{CENTER}Thank you!{/CENTER}');
  lines.push('{CENTER}Please visit again{/CENTER}');
  lines.push('{FEED}{FEED}{FEED}{CUT}');

  return buildEscPos(lines);
}

function formatClassicReceipt(order: any, bill: any, biz: any): Buffer {
  const lines: string[] = [];
  const currency = '₹';
  const date = new Date(order.created_at);

  lines.push('{INIT}');
  lines.push('{CENTER}{BOLD}' + biz.name + '{/BOLD}{/CENTER}');
  if (biz.address) lines.push('{CENTER}' + biz.address + '{/CENTER}');
  if (biz.phone) lines.push('{CENTER}Ph: ' + biz.phone + '{/CENTER}');
  lines.push('================================');

  lines.push('Bill #: ' + (bill.bill_number || order.order_number));
  lines.push('Date: ' + date.toLocaleDateString() + ' Time: ' + date.toLocaleTimeString());
  lines.push('--------------------------------');
  lines.push('Item                  Qty  Rate    Amt');
  lines.push('--------------------------------');

  if (order.items) {
    for (const item of order.items) {
      const name = truncate(item.product_name, 18);
      const qty = String(item.quantity).padEnd(4);
      const rate = formatCurrency(item.unit_price).padStart(7);
      const amt = formatCurrency(item.total).padStart(7);
      lines.push(name + qty + rate + amt);

      const addons = parseAddons(item.addons);
      for (const addon of addons) {
        lines.push('  + ' + truncate(addon.name, 16));
      }
      if (item.special_instructions) {
        lines.push('  ** ' + truncate(item.special_instructions, 16));
      }
    }
  }

  lines.push('================================');
  lines.push('Subtotal' + rightAlign(formatCurrency(bill.subtotal)));
  if (bill.discount_amount > 0) {
    lines.push('Discount' + rightAlign('-' + formatCurrency(bill.discount_amount)));
  }
  lines.push('Tax' + rightAlign(formatCurrency(bill.tax_amount)));
  lines.push('================================');
  lines.push('{BOLD}TOTAL' + rightAlign(formatCurrency(bill.total)) + '{/BOLD}');

  if (bill.payment_details) {
    lines.push('--------------------------------');
    try {
      const payments = typeof bill.payment_details === 'string' ? JSON.parse(bill.payment_details) : bill.payment_details;
      for (const payment of payments) {
        lines.push(payment.method + rightAlign(formatCurrency(payment.amount)));
      }
    } catch {}
  }

  lines.push('================================');
  if (biz.gstin) lines.push('GSTIN: ' + biz.gstin);
  lines.push('{CENTER}Thank you!{/CENTER}');
  lines.push('{FEED}{FEED}{FEED}{CUT}');

  return buildEscPos(lines);
}

function formatDetailedReceipt(order: any, bill: any, biz: any): Buffer {
  const lines: string[] = [];
  const currency = '₹';
  const date = new Date(order.created_at);

  lines.push('{INIT}');
  lines.push('{CENTER}{BOLD}' + biz.name.toUpperCase() + '{/BOLD}{/CENTER}');
  if (biz.address) lines.push('{CENTER}' + biz.address + '{/CENTER}');
  if (biz.gstin) lines.push('{CENTER}GSTIN: ' + biz.gstin + '{/CENTER}');
  lines.push('{CENTER}{BOLD}TAX INVOICE{/BOLD}{/CENTER}');
  lines.push('================================');

  lines.push('Invoice #: ' + (bill.bill_number || order.order_number));
  lines.push('Date: ' + date.toLocaleDateString());
  lines.push('Time: ' + date.toLocaleTimeString());
  lines.push('--------------------------------');
  lines.push('{BOLD}Item            Qty    Rate    Amt{/BOLD}');
  lines.push('--------------------------------');

  if (order.items) {
    for (const item of order.items) {
      const name = truncate(item.product_name, 14);
      const qty = String(item.quantity).padEnd(5);
      const rate = formatCurrency(item.unit_price).padStart(8);
      const amt = formatCurrency(item.total).padStart(8);
      lines.push(name + qty + rate + amt);

      if (item.special_instructions) {
        lines.push('  NOTE: ' + truncate(item.special_instructions, 20));
      }
    }
  }

  lines.push('--------------------------------');
  lines.push('Subtotal (excl)' + rightAlign(formatCurrency(bill.subtotal)));

  if (bill.tax_breakdown) {
    try {
      const taxBreakdown = typeof bill.tax_breakdown === 'string' ? JSON.parse(bill.tax_breakdown) : bill.tax_breakdown;
      if (Array.isArray(taxBreakdown) && taxBreakdown.length > 0) {
        for (const tax of taxBreakdown) {
          if (tax.amount > 0) {
            lines.push(tax.name + ' @' + tax.rate + '%' + rightAlign(formatCurrency(tax.amount)));
          }
        }
      }
    } catch {}
  } else {
    lines.push('CGST' + rightAlign(formatCurrency(bill.tax_amount / 2)));
    lines.push('SGST' + rightAlign(formatCurrency(bill.tax_amount / 2)));
  }

  if (bill.discount_amount > 0) {
    lines.push('Discount' + rightAlign('-' + formatCurrency(bill.discount_amount)));
  }
  lines.push('================================');
  lines.push('{BOLD}GRAND TOTAL' + rightAlign(formatCurrency(bill.total)) + '{/BOLD}');

  if (bill.payment_details) {
    lines.push('--------------------------------');
    try {
      const payments = typeof bill.payment_details === 'string' ? JSON.parse(bill.payment_details) : bill.payment_details;
      for (const payment of payments) {
        lines.push(payment.method + rightAlign(formatCurrency(payment.amount)));
        if (payment.method.toLowerCase() === 'cash') {
          const balance = payment.amount - bill.total;
          if (balance > 0) {
            lines.push('Change' + rightAlign(formatCurrency(balance)));
          }
        }
      }
    } catch {}
  }

  lines.push('================================');
  lines.push('{CENTER}Thank you for your business!{/CENTER}');
  lines.push('{CENTER}Please visit again{/CENTER}');
  lines.push('{FEED}{FEED}{FEED}{CUT}');

  return buildEscPos(lines);
}

function parseAddons(addons: any): any[] {
  if (!addons) return [];
  if (typeof addons === 'string') {
    try { return JSON.parse(addons); } catch { return []; }
  }
  return Array.isArray(addons) ? addons : [];
}

function formatCurrency(amount: number): string {
  return '₹' + (Number(amount) || 0).toFixed(2);
}

function rightAlign(text: string): string {
  const width = 24;
  return ' '.repeat(Math.max(1, width - text.length)) + text;
}

function truncate(text: string, length: number): string {
  return text.length > length ? text.substring(0, length - 2) + '..' : text;
}

function formatKOT(order: any, items: any[], stationName: string): Buffer {
  const lines: string[] = [];

  lines.push('{INIT}');
  lines.push('{CENTER}{BOLD}{DOUBLE_HEIGHT}Kitchen Order Ticket{/DOUBLE_HEIGHT}{/BOLD}{/CENTER}');
  lines.push('');
  lines.push(`Station: ${stationName}`);
  lines.push(`Order: ${order.order_number}`);
  if (order.table) {
    lines.push(`Table: ${order.table.name}`);
  }
  lines.push(`Time: ${new Date(order.created_at).toLocaleTimeString()}`);
  lines.push('================================');
  lines.push('');

  for (const item of items) {
    lines.push(`{BOLD}{DOUBLE_WIDTH}${item.quantity}x   ${item.product_name}{/DOUBLE_WIDTH}{/BOLD}`);
    if (item.special_instructions) {
      lines.push(`{BOLD}** ${item.special_instructions} **{/BOLD}`);
    }
  }

  lines.push('');
  lines.push('================================');
  lines.push('{FEED}{FEED}{CUT}');

  return buildEscPos(lines);
}

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
  let doubleHeight = false;
  let doubleWidth = false;
  let bold = false;
  let alignment = 0;

  const resetStyles = () => {
    if (doubleHeight) { buf.push(0x1B, 0x21, alignment === 1 ? 0x10 : (bold ? 0x08 : 0x00)); doubleHeight = false; }
    if (doubleWidth) { buf.push(0x1B, 0x21, alignment === 1 ? 0x20 : (bold ? 0x08 : 0x00)); doubleWidth = false; }
    if (bold) { buf.push(0x1B, 0x45, 0x00); bold = false; }
  };

  const applyStyles = (lineBold: boolean, lineDH: boolean, lineDW: boolean) => {
    if (lineBold && !bold) { buf.push(0x1B, 0x45, 0x01); bold = true; }
    let mode = 0;
    if (lineDH) mode |= 0x10;
    if (lineDW) mode |= 0x20;
    if (lineBold) mode |= 0x08;
    if (mode > 0) {
      buf.push(0x1B, 0x21, mode);
    }
    doubleHeight = lineDH;
    doubleWidth = lineDW;
  };

  for (let line of lines) {
    if (line.includes('{INIT}')) {
      buf.push(0x1B, 0x40);
      buf.push(0x1B, 0x61, 0x00);
      resetStyles();
      continue;
    }

    if (line.includes('{FEED}')) {
      resetStyles();
      buf.push(0x1B, 0x64, 0x03);
      continue;
    }

    if (line.includes('{CUT}')) {
      resetStyles();
      buf.push(0x1B, 0x64, 0x05);
      buf.push(0x1D, 0x56, 0x00);
      continue;
    }

    let lineBold = line.includes('{BOLD}');
    let lineDH = line.includes('{DOUBLE_HEIGHT}');
    let lineDW = line.includes('{DOUBLE_WIDTH}');
    let center = line.startsWith('{CENTER}') && line.includes('{/CENTER}');

    line = line.replace(/\{CENTER\}/g, '').replace(/\{\/CENTER\}/g, '');
    line = line.replace(/\{BOLD\}/g, '').replace(/\{\/BOLD\}/g, '');
    line = line.replace(/\{DOUBLE_HEIGHT\}/g, '').replace(/\{\/DOUBLE_HEIGHT\}/g, '');
    line = line.replace(/\{DOUBLE_WIDTH\}/g, '').replace(/\{\/DOUBLE_WIDTH\}/g, '');

    if (center) {
      buf.push(0x1B, 0x61, 0x01);
    } else {
      buf.push(0x1B, 0x61, 0x00);
    }

    applyStyles(lineBold, lineDH, lineDW);
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

export async function printViaUSB(data: Buffer, printerName?: string): Promise<boolean> {
  console.log('[Printer] printViaUSB called, platform:', process.platform, 'printer:', printerName);

  if (process.platform === 'darwin') {
    return await printViaUSBMacOS(data, printerName);
  }

  if (process.platform === 'win32') {
    return await printViaUSBWindows(data, printerName);
  }

  if (process.platform === 'linux') {
    return await printViaUSBLinux(data, printerName);
  }

  console.log('[Printer] Unsupported platform:', process.platform);
  return false;
}

async function printViaUSBMacOS(data: Buffer, printerName?: string): Promise<boolean> {
  const tmpFile = `/tmp/flo_print_${Date.now()}.bin`;

  try {
    fs.writeFileSync(tmpFile, data);
    console.log('[Printer] Data written to:', tmpFile, 'size:', data.length, 'bytes');
    console.log('[Printer] First 50 bytes:', Array.from(data.slice(0, 50)).map(b => b.toString(16)).join(' '));

    let cmd: string;
    if (printerName) {
      cmd = `lp -d "${printerName}" -o raw "${tmpFile}"`;
    } else {
      cmd = `lp -o raw "${tmpFile}"`;
    }

    console.log('[Printer] Executing:', cmd);
    const result = execSync(cmd, { encoding: 'utf8' });
    console.log('[Printer] Print sent successfully, result:', result);
    return true;
  } catch (err: any) {
    console.error('[Printer] macOS print error:', err.message);
    console.error('[Printer] Error details:', err);
    return false;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

async function printViaUSBWindows(data: Buffer, printerName?: string): Promise<boolean> {
  try {
    const printerLib = require('node-thermal-printer');
    const ThermalPrinter = printerLib.printer;
    const PrinterTypes = printerLib.types;

    const printer = new ThermalPrinter({
      type: PrinterTypes.EPSON,
      interface: printerName ? ` printer:${printerName}` : undefined,
      width: 48,
    });

    const isConnected = await printer.isPrinterConnected();
    console.log('[Printer] Windows printer connected:', isConnected);

    if (!isConnected) {
      console.error('[Printer] No USB printer detected');
      return false;
    }

    printer.printRaw(data);
    await printer.execute();
    console.log('[Printer] Windows print sent successfully');
    return true;
  } catch (err: any) {
    console.error('[Printer] Windows print error:', err.message);

    console.log('[Printer] Trying raw Windows printing...');
    return await printViaWindowsRaw(data, printerName);
  }
}

async function printViaWindowsRaw(data: Buffer, printerName?: string): Promise<boolean> {
  try {
    const tmpFile = `C:\\Windows\\Temp\\flo_print_${Date.now()}.bin`;
    fs.writeFileSync(tmpFile, data);

    const name = printerName || 'Microsoft Print to PDF';
    const cmd = `powershell -Command "Start-Process -FilePath '${tmpFile}' -Verb PrintTo -ArgumentList '${name}' -Wait"`;

    execSync(cmd, { encoding: 'utf8' });
    fs.unlinkSync(tmpFile);
    return true;
  } catch (err: any) {
    console.error('[Printer] Windows raw print error:', err.message);
    return false;
  }
}

async function printViaUSBLinux(data: Buffer, printerName?: string): Promise<boolean> {
  const tmpFile = `/tmp/flo_print_${Date.now()}.bin`;

  try {
    fs.writeFileSync(tmpFile, data);

    if (printerName) {
      const cmd = `lp -d "${printerName}" -o raw "${tmpFile}"`;
      execSync(cmd, { encoding: 'utf8' });
    } else {
      const cmd = `lp -o raw "${tmpFile}"`;
      execSync(cmd, { encoding: 'utf8' });
    }

    return true;
  } catch (err: any) {
    console.error('[Printer] Linux print error:', err.message);
    return false;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

export function getPrinterStatus(): { connected: boolean; printer: any } {
  const printer = getPrinterConfig();
  return { connected: !!printer, printer };
}
