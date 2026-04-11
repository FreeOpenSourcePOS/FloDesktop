import { Router, Request, Response } from 'express';
import { getDatabase, getDbPath, createBackup } from '../db';
import * as fs from 'fs';
import * as path from 'path';

const router = Router();

router.get('/export', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    
    // Get all table names
    const tables = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `).all() as { name: string }[];

    const exportData: Record<string, any[]> = {};

    for (const { name: tableName } of tables) {
      exportData[tableName] = db.prepare(`SELECT * FROM ${tableName}`).all();
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `flo-export-${timestamp}.json`;

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.json({
      version: 1,
      app: 'FloDesktop',
      exported_at: new Date().toISOString(),
      schema_version: (db.prepare("SELECT value FROM settings WHERE key = 'schema_version'").get() as { value: string } | undefined)?.value || 'unknown',
      data: exportData,
    });
  } catch (error: any) {
    console.error('[DB Export] Error:', error);
    res.status(500).json({ error: 'Export failed: ' + error.message });
  }
});

router.post('/import', (req: Request, res: Response) => {
  try {
    const { data, overwrite } = req.body;

    if (!data || !data.data || typeof data.data !== 'object') {
      return res.status(400).json({ error: 'Invalid import file format' });
    }

    const db = getDatabase();
    const importData = data.data as Record<string, any[]>;

    // Validate required tables exist
    const requiredTables = ['settings', 'categories', 'products', 'users'];
    const importedTables = Object.keys(importData);
    
    const missingTables = requiredTables.filter(t => !importedTables.includes(t));
    if (missingTables.length > 0) {
      return res.status(400).json({ 
        error: `Missing required tables: ${missingTables.join(', ')}` 
      });
    }

    // Create backup before import
    const backupPath = createBackup();

    if (overwrite) {
      // Clear existing data and import fresh
      db.exec('BEGIN TRANSACTION');
      
      try {
        for (const tableName of importedTables) {
          db.exec(`DELETE FROM ${tableName}`);
          const rows = importData[tableName];
          if (rows && Array.isArray(rows) && rows.length > 0) {
            const columns = Object.keys(rows[0]);
            const placeholders = columns.map(() => '?').join(', ');
            const insertStmt = db.prepare(
              `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`
            );
            for (const row of rows) {
              insertStmt.run(...columns.map(col => row[col]));
            }
          }
        }
        
        db.exec('COMMIT');
        res.json({ 
          success: true, 
          message: 'Database imported successfully',
          backup: backupPath 
        });
      } catch (err: any) {
        db.exec('ROLLBACK');
        throw err;
      }
    } else {
      // Merge mode - add new records, skip existing
      db.exec('BEGIN TRANSACTION');
      
      try {
        for (const tableName of importedTables) {
          const rows = importData[tableName];
          if (rows && Array.isArray(rows)) {
            const columns = Object.keys(rows[0]);
            const placeholders = columns.map(() => '?').join(', ');
            const insertStmt = db.prepare(
              `INSERT OR IGNORE INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders})`
            );
            for (const row of rows) {
              insertStmt.run(...columns.map(col => row[col]));
            }
          }
        }
        
        db.exec('COMMIT');
        res.json({ 
          success: true, 
          message: 'Data merged successfully',
          backup: backupPath 
        });
      } catch (err: any) {
        db.exec('ROLLBACK');
        throw err;
      }
    }
  } catch (error: any) {
    console.error('[DB Import] Error:', error);
    res.status(500).json({ error: 'Import failed: ' + error.message });
  }
});

router.get('/backup', (req: Request, res: Response) => {
  try {
    const backupPath = createBackup();
    res.json({ 
      success: true, 
      path: backupPath,
      filename: path.basename(backupPath)
    });
  } catch (error: any) {
    console.error('[DB Backup] Error:', error);
    res.status(500).json({ error: 'Backup failed: ' + error.message });
  }
});

router.get('/download', (req: Request, res: Response) => {
  try {
    const dbPath = getDbPath();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `flo-database-${timestamp}.db`;
    
    res.download(dbPath, filename);
  } catch (error: any) {
    console.error('[DB Download] Error:', error);
    res.status(500).json({ error: 'Download failed: ' + error.message });
  }
});

router.get('/tables', (req: Request, res: Response) => {
  try {
    const db = getDatabase();
    const tables = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all() as { name: string }[];

    const tableInfo = tables.map(({ name: tableName }) => {
      const count = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get() as { count: number };
      return { name: tableName, rows: count.count };
    });

    res.json({ tables: tableInfo });
  } catch (error: any) {
    console.error('[DB Tables] Error:', error);
    res.status(500).json({ error: error.message });
  }
});

export const databaseRoutes = router;
