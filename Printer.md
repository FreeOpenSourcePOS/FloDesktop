# FloDesktop Printing System

## Overview

FloDesktop supports two printing modes:

1. **Desktop App (Electron)** - Uses Node.js `node-thermal-printer` library
2. **Cloud POS (Future)** - Will use WebUSB from browser

---

## Printing Architecture

### Desktop App (Electron)

The Electron desktop app uses `node-thermal-printer` library to connect to thermal printers directly via Node.js. This works with:
- **USB Thermal Printers** - Connected directly to the computer
- **Network (IP/TCP) Printers** - Thermal printers on the network

### Cloud POS (Future Web App)

For the cloud-based POS running in a browser, WebUSB API will be used to connect directly to thermal printers from the browser.

---

## Supported Print Methods

### 1. USB Printers (via Electron App)

**How it works:**
- Uses `node-thermal-printer` Node.js library
- Directly accesses USB devices through the Electron main process
- Works on Windows, macOS, and Linux

**Configuration:**
- Paper width: 58mm or 80mm
- No device path needed - the library auto-detects USB printers

### 2. Network Printers (IP/TCP)

**How it works:**
- TCP socket connection to network thermal printers
- Default port 9100 (standard for thermal printers)

**Configuration:**
- IP Address (e.g., 192.168.1.100)
- Port (default: 9100)

### 3. Browser Print (A4/A5)

**How it works:**
- Uses standard browser print dialog (`window.print()`)
- Works with any printer connected to the computer
- Supports A4 and A5 paper sizes

---

## Settings Pages

### Printing Tab (Merged)

The Settings → Printing tab contains:

1. **Hardware Printers** section
   - Add/Edit/Delete printers
   - Connection types: Network (IP/TCP), USB (via Electron App)
   - Paper width settings (58mm, 80mm)
   - Set default printer
   - Test print button

2. **Print Options** section
   - Enable/Disable printer
   - Paper size selection
   - Print method (ESC/POS vs Browser)
   - Auto-print KOT (when order placed)
   - Auto-print Bill (when payment completed)
   - Web print size (A4/A5)
   - WhatsApp share enable

3. **WhatsApp Sharing** section
   - Enable WhatsApp Share toggle

---

## Print Flow

### Desktop App Flow

```
POS Order Placed
       ↓
Backend receives order
       ↓
Checks default printer from database
       ↓
If USB printer → node-thermal-printer prints via USB
If Network printer → TCP socket sends ESC/POS commands
       ↓
Print success/failure logged
```

### Cloud POS Flow (Future)

```
POS Order Placed (Browser)
       ↓
Frontend calls WebUSB API
       ↓
User selects printer via browser USB picker
       ↓
ESC/POS commands sent directly via WebUSB
       ↓
Print success/failure shown in UI
```

---

## Document Types

1. **Bills** - Three templates:
   - Classic: Rich legacy-style receipt
   - Compact: Minimal, fast printing
   - Detailed: Full GST-compliant tax invoice

2. **KOT (Kitchen Order Ticket)**
   - Order number, table, items
   - Addons and special instructions

3. **WhatsApp Sharing**
   - Send bill details via WhatsApp after payment

---

## State Management

### usePrinterStore (Zustand)
- `status`: Printer connection status
- `deviceInfo`: Connected printer details (for WebUSB mode)
- `printMethod`: 'escpos' or 'browser'
- `paperWidth`: 58 or 80
- Methods: `connect()`, `disconnect()`, `printBill()`, `printKot()`

### usePosSettingsStore
- `printerEnabled`: Enable/disable printer
- `paperSize`: Thermal58, Thermal80, A4, A5
- `printMethod`: ESCPOS or Browser
- `autoPrintKot`: Auto-print KOT toggle
- `autoPrintBill`: Auto-print Bill toggle
- `billTemplate`: Classic/Compact/Detailed
- `billFooterMessage`: Custom footer text

---

## Backend Printer API

### Endpoints

- `GET /api/printers` - List all printers
- `POST /api/printers` - Add new printer
- `PUT /api/printers/:id` - Update printer
- `DELETE /api/printers/:id` - Delete printer
- `POST /api/printers/:id/set-default` - Set default printer
- `POST /api/printers/:id/test` - Test print

### Database Schema

```sql
CREATE TABLE printers (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  connection_type TEXT CHECK(connection_type IN ('network', 'usb')),
  ip_address TEXT,
  port INTEGER DEFAULT 9100,
  usb_device_path TEXT,
  paper_width TEXT DEFAULT '80mm',
  is_default INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT
);
```

---

## Troubleshooting

### USB Printer not working (Desktop)
1. Ensure printer is connected via USB
2. Check paper width setting matches printer
3. Try Network printer option instead
4. Check Electron app logs for errors

### Network Printer not connecting
1. Ensure printer is on same network
2. Check IP address and port (default 9100)
3. Firewall must allow outbound connections
4. Printer must support TCP/IP printing

### Browser print not working
1. Allow popups in browser
2. Ensure printer is added to system
3. Check printer default settings

---

## Files

### Frontend
- `frontend/src/lib/printer/PrinterService.ts` - WebUSB driver (for cloud POS)
- `frontend/src/lib/printer/receipt-encoder.ts` - Receipt encoding
- `frontend/src/lib/printer/gst-bill-encoder.ts` - GST bill encoding
- `frontend/src/lib/printer/kot-encoder.ts` - KOT encoding
- `frontend/src/lib/printer/web-print.ts` - Browser printing
- `frontend/src/hooks/usePrinter.ts` - Printer state management
- `frontend/src/components/pos/PrinterStatus.tsx` - Toolbar component

### Backend
- `main/printers/thermal.ts` - Thermal printer handling
- `main/routes/printers.ts` - Printer API routes
- `main/ipc.ts` - Electron IPC handlers
- `main/db.ts` - Database schema