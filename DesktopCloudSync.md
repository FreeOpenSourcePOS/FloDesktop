# Desktop-to-Cloud Sync Plan

## Overview
Sync frontend and API changes from FloDesktop → FloCloud, keeping ~95% shared code in sync. FloDesktop is public, FloCloud is private.

---

## Phase 1: Frontend (FloUI Submodule)

### Step 1.1: Commit Changes in FloDesktop/frontend
```bash
cd /Users/bkm/Sites/FloDesktop/frontend
git add src/app/\(dashboard\)/orders/page.tsx
git add src/app/\(dashboard\)/settings/page.tsx
git add src/components/pos/TableCheckoutModal.tsx
git add public/logo-white.png
git commit -m "feat: add KDS pairing UI, printer management, updates tab"
git push
```

### Step 1.2: Update FloCloud Frontend Submodule
```bash
cd /Users/bkm/Sites/FloCloud/frontend
git submodule update --remote
cd ..
git add frontend
git commit -m "chore: update FloUI submodule"
```

---

## Phase 2: New Route Files (Create in FloCloud)

| Destination | Source |
|-------------|--------|
| `desktop/main/routes/kitchen.ts` | Copy from FloDesktop `main/routes/kitchen.ts` |
| `desktop/main/routes/order-items.ts` | Copy from FloDesktop `main/routes/order-items.ts` |
| `desktop/main/routes/printers.ts` | Copy from FloDesktop `main/routes/printers.ts` |

---

## Phase 3: Modified Route Files (Update in FloCloud)

### `addon-groups.ts`
- Add `randomUUID` import from `crypto`
- POST: Use `randomUUID()` for `addon_groups.id`
- POST: Add `id` and timestamps (`created_at`, `updated_at`) to addons INSERT
- POST `/:groupId/addons`: Add `id` and timestamps

### `auth.ts`
- JWT secret: `flopos-local-secret-change-in-production` → `flo-local-secret-change-in-production`

### `bills.ts`
- Import `notifyKdsUpdate` from `../services/kds`
- POST `/generate`: Add `paid_amount = 0, balance = total` columns
- Rename `/:id/recordPayment` → `/:id/payment`
- Update payment logic to append to `payment_details` JSON array
- On `paid` status: update order `completed_at`, release table, call `notifyKdsUpdate()`
- Return `{ bill, walletDebited }`

### `categories.ts`
- `active` param check: `req.query.active === 'true' || req.query.active === '1'`

### `customers.ts`
- Order by `name` instead of `last_visit_at DESC, name`

### `kds-info.ts`
- Add `qrcode` package import
- Generate QR code via `QRCode.toDataURL()`
- Return `{ mdns_url, ip_url, qr_url, qr_data_url }`

### `kds.ts`
- Import `randomUUID` from `crypto`
- Change `t.name` → `t.number as table_name`
- POST `/pairing`: Add `id` (UUID) to `kds_pairing_tokens`
- GET `/display`: Change `t.name` → `t.number as table_name`
- PATCH `/items/:id/status`: Remove `prepared_at` logic

### `orders.ts`
- Import `parseItemJson` from `../db`, `notifyKdsUpdate` from `../services/kds`
- GET `/`: `req.query.today` check: `!== '0' && !== 'false'`
- GET `/`, GET `/:id`, POST, PATCH `/:id/status`: Map items via `parseItemJson`
- GET `/`, GET `/:id`, PATCH `/:id/status`: `table.name = tableRow.number`
- POST `/`: Call `notifyKdsUpdate()` after order creation
- PATCH `/:id/status`: reason is optional for cancellation

### `tables.ts`
- GET `/`: `ORDER BY number`, map `{ ...t, name: t.number }`
- GET `/:id`: Return `name: table.number`
- POST: Accept `number` or `name`, insert into `number` column

### `index.ts` (Route Registration)
Add imports and `app.use()` for:
- `orderItemRoutes` → `/api/order-items`
- `kitchenRoutes` → `/api/kitchen`
- `printerRoutes` → `/api/printers`

---

## Phase 4: Services

### `desktop/main/services/kds.ts`
- Import `randomUUID` from `crypto`
- Change `t.name` → `t.number as table_name`
- Broadcast logic: allow `client.stationId === null` to receive all
- INSERT into `kds_pairing_tokens` with UUID id
- Remove `prepared_at` from item status UPDATE

---

## Excluded (Electron-Specific)

| File | Reason |
|------|--------|
| `main/index.ts` | Electron main process, app lifecycle |
| `main/ipc.ts` | Electron IPC handlers |
| `main/preload.ts` | Electron preload script |
| `main/server.ts` | Electron server + KDS HTML page |
| `main/db.ts` | Different schema (staff vs users, flopos.db vs flo.db) |
| `main/printers/thermal.ts` | Hardware USB/IPC access |

---

## Schema Differences (For Awareness)

FloCloud uses different schema — route changes are backward-compatible:
- Auth: `staff` table (not `users`)
- DB: `flopos.db` (not `flo.db`)
- Missing columns return as `NULL` — SQLite handles gracefully

---

## Execution Order

1. Commit frontend changes & push (FloDesktop/frontend)
2. Update FloCloud frontend submodule
3. Copy new route files (kitchen, order-items, printers)
4. Apply route modifications
5. Update services/kds.ts
6. Commit FloCloud changes