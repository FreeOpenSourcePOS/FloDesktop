# FloDesktop Development Guidelines

## Non-Negotiable Rules

### 1. Database Migrations - NEVER DESTRUCTIVE

When modifying the database schema:
- **ALWAYS use incremental migrations** - Add new tables/columns, never drop existing ones
- **Use `CREATE TABLE IF NOT EXISTS`** and **`ALTER TABLE ADD COLUMN`** for new features
- **Never use `DROP TABLE` or `DROP COLUMN`** in migrations
- **Test migrations on existing data** - Always verify that existing data survives upgrades
- **Version bump migrations** - Each schema change gets its own version increment

**Example of CORRECT migration:**
```typescript
// Good - Add printer table without destroying data
if (!columnExists('printers')) {
  db.exec(`CREATE TABLE IF NOT EXISTS printers (...)`);
}
db.exec(`ALTER TABLE orders ADD COLUMN printer_id TEXT`);
```

**Example of WRONG migration (NEVER DO THIS):**
```typescript
// BAD - Drops all tables and recreates!
if (version < NEW_VERSION) {
  dropAllTables();  // NEVER DO THIS
  createSchema();
  seedData();
}
```

### 2. Test Import/Export Before Major Releases

Before building release packages:
- **Test database export** creates valid backup
- **Test database import** restores data correctly
- **Test on existing database** with sample data
- **Verify all tables** are included in backup

### 3. Version Control

- Bump version in `package.json` before building releases
- Create git tags for releases: `git tag -a v1.x.x -m "message"`
- Push tags: `git push origin --tags`
- Update GitHub Releases with build artifacts

## Release Checklist

- [ ] Non-destructive database migration tested
- [ ] Import/Export feature tested
- [ ] All platforms built (macOS, Windows, Linux)
- [ ] Git tag created and pushed
- [ ] GitHub Release published with assets
- [ ] README and docs updated if needed

## Architecture Notes

### Database
- SQLite with better-sqlite3
- Schema version tracked in `settings` table
- All tables use `id TEXT PRIMARY KEY` (string IDs for cross-platform compatibility)

### Key Tables
- `settings` - Key-value business configuration
- `products` - Product catalog
- `categories` - Product categories
- `orders`, `order_items` - Order management
- `bills` - Billing and payments
- `customers` - Customer database
- `printers` - Printer configurations
- `users` - Authentication

### Printers
- Thermal printing via ESC/POS protocol
- Support for USB and Network printers
- Configurable paper widths (58mm/80mm)
