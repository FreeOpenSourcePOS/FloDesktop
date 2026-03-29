'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import toast from 'react-hot-toast';
import type { Order } from '@/lib/types';

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  preparing: 'bg-blue-100 text-blue-800',
  ready: 'bg-green-100 text-green-800',
  served: 'bg-brand-light text-brand',
  completed: 'bg-gray-100 text-gray-800',
  cancelled: 'bg-red-100 text-red-800',
};

const statusFlow = ['pending', 'preparing', 'ready', 'served', 'completed'];

export default function OrdersPage() {
  const { currentTenant } = useAuthStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('active');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  const currency = currentTenant?.currency === 'THB' ? '฿' : '₹';

  const fetchOrders = async () => {
    try {
      const params = filter === 'active'
        ? { today: 1, per_page: 50 }
        : filter === 'all'
        ? { per_page: 50 }
        : { status: filter, per_page: 50 };
      const { data } = await api.get('/orders', { params });
      setOrders(data.data || []);
    } catch {
      toast.error('Failed to load orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 15000);
    return () => clearInterval(interval);
  }, [filter]);

  const updateStatus = async (orderId: number, status: string) => {
    try {
      await api.patch(`/orders/${orderId}/status`, { status });
      toast.success(`Order updated to ${status}`);
      fetchOrders();
      if (selectedOrder?.id === orderId) {
        const { data } = await api.get(`/orders/${orderId}`);
        setSelectedOrder(data.order);
      }
    } catch {
      toast.error('Failed to update order');
    }
  };

  const getNextStatus = (current: string) => {
    const idx = statusFlow.indexOf(current);
    return idx >= 0 && idx < statusFlow.length - 1 ? statusFlow[idx + 1] : null;
  };

  const displayOrders = filter === 'active'
    ? orders.filter((o) => !['completed', 'cancelled'].includes(o.status))
    : orders;

  return (
    <div className="flex gap-4 h-[calc(100vh-4rem)]">
      {/* Order List */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Orders</h1>
          <div className="flex gap-2">
            {['active', 'all', 'pending', 'preparing', 'ready', 'completed'].map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize ${
                  filter === f ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200'
                }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-4 border-brand border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-2">
            {displayOrders.map((order) => (
              <div
                key={order.id}
                onClick={() => setSelectedOrder(order)}
                className={`bg-white rounded-xl p-4 border cursor-pointer transition-colors ${
                  selectedOrder?.id === order.id ? 'border-brand ring-1 ring-brand' : 'border-gray-100 hover:border-gray-300'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-bold text-gray-900">#{order.order_number}</p>
                    <p className="text-sm text-gray-500">
                      {order.type.replace('_', ' ')} &middot; {order.items?.length || 0} items
                      {order.table && ` &middot; ${order.table.name}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusColors[order.status]}`}>
                      {order.status}
                    </span>
                    <p className="font-bold text-gray-900 mt-1">{currency}{Number(order.total).toLocaleString()}</p>
                  </div>
                </div>
              </div>
            ))}
            {displayOrders.length === 0 && (
              <p className="text-center text-gray-500 py-12">No orders found</p>
            )}
          </div>
        )}
      </div>

      {/* Order Detail */}
      {selectedOrder && (
        <div className="w-96 bg-white rounded-xl border border-gray-100 flex flex-col shadow-sm">
          <div className="p-5 border-b border-gray-100">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold text-gray-900">#{selectedOrder.order_number}</h2>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[selectedOrder.status]}`}>
                {selectedOrder.status}
              </span>
            </div>
            <p className="text-sm text-gray-500 mt-1">
              {selectedOrder.type.replace('_', ' ')}
              {selectedOrder.table && ` — ${selectedOrder.table.name}`}
              {selectedOrder.guest_count && ` — ${selectedOrder.guest_count} guests`}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase mb-3">Items</h3>
            <div className="space-y-3">
              {selectedOrder.items?.map((item) => (
                <div key={item.id} className="flex justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {item.quantity}x {item.product_name}
                    </p>
                    {item.special_instructions && (
                      <p className="text-xs text-gray-400 italic">{item.special_instructions}</p>
                    )}
                  </div>
                  <p className="text-sm font-medium text-gray-900">
                    {currency}{Number(item.total).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>

            <div className="mt-6 pt-4 border-t border-gray-100 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span>{currency}{Number(selectedOrder.subtotal).toLocaleString()}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Tax</span>
                <span>{currency}{Number(selectedOrder.tax_amount).toLocaleString()}</span>
              </div>
              <div className="flex justify-between font-bold text-lg pt-2 border-t border-gray-100">
                <span>Total</span>
                <span className="text-brand">{currency}{Number(selectedOrder.total).toLocaleString()}</span>
              </div>
            </div>
          </div>

          <div className="p-5 border-t border-gray-100 space-y-2">
            {getNextStatus(selectedOrder.status) && (
              <Button
                onClick={() => updateStatus(selectedOrder.id, getNextStatus(selectedOrder.status)!)}
                className="w-full capitalize"
              >
                Mark as {getNextStatus(selectedOrder.status)}
              </Button>
            )}
            {!['completed', 'cancelled'].includes(selectedOrder.status) && (
              <Button
                variant="destructive"
                onClick={() => updateStatus(selectedOrder.id, 'cancelled')}
                className="w-full"
              >
                Cancel Order
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
