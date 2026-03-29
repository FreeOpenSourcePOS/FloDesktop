import Database from 'better-sqlite3';
import * as path from 'path';
import { app } from 'electron';
import * as fs from 'fs';
import * as bcrypt from 'bcryptjs';

let db: Database.Database;

function getDbPath(): string {
  const userDataPath = app.isPackaged ? app.getPath('userData') : path.join(__dirname, '../../');
  return path.join(userDataPath, 'flopos.db');
}

function getBackupDir(): string {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'backups');
}

export function initDatabase(): void {
  const dbPath = getDbPath();
  const backupDir = getBackupDir();

  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  console.log(`[DB] Opening database at: ${dbPath}`);
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  runMigrations();
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

export function closeDatabase(): void {
  if (db) {
    db.close();
    console.log('[DB] Database closed');
  }
}

export function createBackup(): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(getBackupDir(), `flopos-backup-${timestamp}.db`);
  db.backup(backupPath);
  console.log(`[DB] Backup created: ${backupPath}`);
  return backupPath;
}

export function restoreBackup(backupPath: string): void {
  const backupDb = new Database(backupPath);
  db.close();
  const dbPath = getDbPath();
  fs.copyFileSync(backupPath, dbPath);
  db = new Database(dbPath);
  console.log(`[DB] Restored from: ${backupPath}`);
}

function runMigrations(): void {
  console.log('[DB] Running migrations...');

  db.exec(`
    -- Categories table
    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      imageUrl TEXT,
      sortOrder INTEGER DEFAULT 0,
      isActive INTEGER DEFAULT 1,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Products table
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      categoryId TEXT,
      name TEXT NOT NULL,
      description TEXT,
      price REAL NOT NULL DEFAULT 0,
      cost REAL DEFAULT 0,
      sku TEXT,
      barcode TEXT,
      imageUrl TEXT,
      isActive INTEGER DEFAULT 1,
      sortOrder INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (categoryId) REFERENCES categories(id)
    );

    -- Addon Groups table
    CREATE TABLE IF NOT EXISTS addon_groups (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      minSelections INTEGER DEFAULT 0,
      maxSelections INTEGER DEFAULT 1,
      isActive INTEGER DEFAULT 1,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Addons table
    CREATE TABLE IF NOT EXISTS addons (
      id TEXT PRIMARY KEY,
      addonGroupId TEXT NOT NULL,
      name TEXT NOT NULL,
      price REAL NOT NULL DEFAULT 0,
      isActive INTEGER DEFAULT 1,
      sortOrder INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (addonGroupId) REFERENCES addon_groups(id)
    );

    -- Kitchen Stations table
    CREATE TABLE IF NOT EXISTS kitchen_stations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      printerIp TEXT,
      isActive INTEGER DEFAULT 1,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Tables for restaurant
    CREATE TABLE IF NOT EXISTS tables (
      id TEXT PRIMARY KEY,
      number TEXT NOT NULL UNIQUE,
      capacity INTEGER DEFAULT 4,
      status TEXT DEFAULT 'available',
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Customers table
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      address TEXT,
      loyaltyPoints INTEGER DEFAULT 0,
      notes TEXT,
      isActive INTEGER DEFAULT 1,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Staff table (local auth)
    CREATE TABLE IF NOT EXISTS staff (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE,
      password TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'staff',
      pin TEXT,
      isActive INTEGER DEFAULT 1,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Orders table
    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      orderNumber TEXT UNIQUE NOT NULL,
      customerId TEXT,
      staffId TEXT,
      type TEXT DEFAULT 'dine-in',
      status TEXT DEFAULT 'pending',
      subtotal REAL DEFAULT 0,
      taxAmount REAL DEFAULT 0,
      discountAmount REAL DEFAULT 0,
      total REAL DEFAULT 0,
      notes TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customerId) REFERENCES customers(id),
      FOREIGN KEY (staffId) REFERENCES staff(id)
    );

    -- Order Items table
    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      orderId TEXT NOT NULL,
      productId TEXT NOT NULL,
      productName TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unitPrice REAL NOT NULL,
      totalPrice REAL NOT NULL,
      notes TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (orderId) REFERENCES orders(id),
      FOREIGN KEY (productId) REFERENCES products(id)
    );

    -- Bills table
    CREATE TABLE IF NOT EXISTS bills (
      id TEXT PRIMARY KEY,
      billNumber TEXT UNIQUE NOT NULL,
      orderId TEXT NOT NULL,
      amount REAL NOT NULL,
      paymentMethod TEXT DEFAULT 'cash',
      status TEXT DEFAULT 'pending',
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (orderId) REFERENCES orders(id)
    );

    -- Loyalty Transactions table
    CREATE TABLE IF NOT EXISTS loyalty_transactions (
      id TEXT PRIMARY KEY,
      customerId TEXT NOT NULL,
      type TEXT NOT NULL,
      points INTEGER NOT NULL,
      balance INTEGER NOT NULL,
      referenceId TEXT,
      expiresAt TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customerId) REFERENCES customers(id)
    );

    -- Settings table (key-value store)
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- KDS Pairing tokens
    CREATE TABLE IF NOT EXISTS kds_pairing_tokens (
      id TEXT PRIMARY KEY,
      token TEXT UNIQUE NOT NULL,
      stationId TEXT,
      expiresAt TEXT NOT NULL,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Printer configurations
    CREATE TABLE IF NOT EXISTS printers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      connectionType TEXT NOT NULL,
      ipAddress TEXT,
      port INTEGER DEFAULT 9100,
      isDefault INTEGER DEFAULT 0,
      paperWidth TEXT DEFAULT '80mm',
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    );

    -- Indexes
    CREATE INDEX IF NOT EXISTS idx_products_category ON products(categoryId);
    CREATE INDEX IF NOT EXISTS idx_products_active ON products(isActive);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
    CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(createdAt);
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(orderId);
    CREATE INDEX IF NOT EXISTS idx_bills_order ON bills(orderId);
    CREATE INDEX IF NOT EXISTS idx_loyalty_customer ON loyalty_transactions(customerId);
  `);

  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  insertSetting.run('business_name', 'My Restaurant');
  insertSetting.run('country', 'IN');
  insertSetting.run('currency', 'INR');
  insertSetting.run('timezone', 'Asia/Kolkata');
  insertSetting.run('tax_registered', 'false');
  insertSetting.run('gstin', '');
  insertSetting.run('state_code', '');
  insertSetting.run('tax_scheme', 'regular');
  insertSetting.run('loyalty_expiry_days', '365');
  insertSetting.run('restaurant_name', 'My Restaurant');
  insertSetting.run('address', '');
  insertSetting.run('phone', '');
  insertSetting.run('email', '');

  const adminExists = db.prepare('SELECT id FROM staff WHERE email = ?').get('admin@flopos.local');
  if (!adminExists) {
    const hashedPassword = bcrypt.hashSync('admin123', 10);
    db.prepare('INSERT INTO staff (id, name, email, password, role) VALUES (?, ?, ?, ?, ?)').run(
      'staff-1', 'Administrator', 'admin@flopos.local', hashedPassword, 'admin'
    );
  }

  console.log('[DB] Migrations complete');
}

export function generateOrderNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const result = db.prepare('SELECT COUNT(*) + 1 as next FROM orders WHERE date(createdAt) = date(?)').get(date) as { next: number };
  return `ORD-${date}-${String(result.next).padStart(4, '0')}`;
}

export function generateBillNumber(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const result = db.prepare('SELECT COUNT(*) + 1 as next FROM bills WHERE date(createdAt) = date(?)').get(date) as { next: number };
  return `INV-${date}-${String(result.next).padStart(4, '0')}`;
}

export function now(): string {
  return new Date().toISOString();
}