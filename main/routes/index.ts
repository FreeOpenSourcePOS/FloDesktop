import { Express } from 'express';
import { authRoutes } from './auth';
import { categoryRoutes } from './categories';
import { productRoutes } from './products';
import { addonGroupRoutes } from './addon-groups';
import { orderRoutes } from './orders';
import { billRoutes } from './bills';
import { tableRoutes } from './tables';
import { kitchenStationRoutes } from './kitchen-stations';
import { customerRoutes } from './customers';
import { staffRoutes } from './staff';
import { settingsRoutes } from './settings';
import { reportRoutes } from './reports';
import { kdsRoutes } from './kds';
import { kdsInfoRoutes } from './kds-info';

export function registerRoutes(app: Express): void {
  // Auth routes
  app.use('/api/auth', authRoutes);

  // Resource routes
  app.use('/api/categories', categoryRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/addon-groups', addonGroupRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/bills', billRoutes);
  app.use('/api/tables', tableRoutes);
  app.use('/api/kitchen-stations', kitchenStationRoutes);
  app.use('/api/customers', customerRoutes);
  app.use('/api/staff', staffRoutes);   // users with POS roles
  app.use('/api/users', staffRoutes);   // same router, dual-mounted
  app.use('/api/settings', settingsRoutes);
  app.use('/api/reports', reportRoutes);
  app.use('/api/kds', kdsRoutes);
  app.use('/api/kds-info', kdsInfoRoutes);

  // Tax preview
  app.post('/api/tax/preview', async (req, res) => {
    const { calculateTaxPreview } = await import('../services/tax');
    calculateTaxPreview(req, res);
  });
}
