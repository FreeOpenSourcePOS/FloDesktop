'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Clock, ChefHat, X, ChevronRight, ChevronLeft } from 'lucide-react';
import type { Order, OrderItem } from '@/lib/types';

const STATUS_CONFIG = {
  pending: { label: 'Waiting', color: 'bg-yellow-500', border: 'border-yellow-300', text: 'text-yellow-700', bg: 'bg-yellow-50', btnBg: 'bg-yellow-500 hover:bg-yellow-600' },
  preparing: { label: 'Preparing', color: 'bg-blue-500', border: 'border-blue-300', text: 'text-blue-700', bg: 'bg-blue-50', btnBg: 'bg-blue-500 hover:bg-blue-600' },
  ready: { label: 'Ready', color: 'bg-green-500', border: 'border-green-300', text: 'text-green-700', bg: 'bg-green-50', btnBg: 'bg-green-500 hover:bg-green-600' },
  served: { label: 'Delivered', color: 'bg-purple-500', border: 'border-purple-300', text: 'text-purple-700', bg: 'bg-purple-50', btnBg: 'bg-purple-500 hover:bg-purple-600' },
} as const;

type KitchenStatus = keyof typeof STATUS_CONFIG;

const STATUS_ORDER: KitchenStatus[] = ['pending', 'preparing', 'ready', 'served'];

const NEXT_STATUS: Record<string, KitchenStatus | null> = {
  pending: 'preparing',
  preparing: 'ready',
  ready: 'served',
  served: null,
};

const PREV_STATUS: Record<string, KitchenStatus | null> = {
  pending: null,
  preparing: 'pending',
  ready: 'preparing',
  served: 'ready',
};

interface ModalItem {
  item: OrderItem;
  orderNumber: string;
}

export default function KitchenDisplayPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<KitchenStatus>('pending');
  const [modalItem, setModalItem] = useState<ModalItem | null>(null);
  const [updating, setUpdating] = useState<number | null>(null);

  const fetchOrders = async () => {
    try {
      const { data } = await api.get(`/kitchen/orders?status=pending,preparing,ready,served`);
      setOrders(data.orders || []);
      setCounts(data.counts || {});
    } catch {
      console.error('Failed to fetch kitchen orders');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 5000);
    return () => clearInterval(interval);
  }, []);

  const filteredOrders = orders
    .map((order) => ({
      ...order,
      items: (order.items || []).filter((item) => (item.status || 'pending') === activeTab),
    }))
    .filter((order) => order.items.length > 0);

  const updateItemStatus = async (itemId: number, status: KitchenStatus) => {
    setUpdating(itemId);
    try {
      const { data } = await api.patch(`/order-items/${itemId}/status`, { status });
      setOrders((prev) =>
        prev.map((o) => (o.id === data.order.id ? data.order : o))
      );
      setModalItem(null);
      toast.success(`Item marked as ${STATUS_CONFIG[status].label}`);
    } catch {
      toast.error('Failed to update item');
    } finally {
      setUpdating(null);
    }
  };

  const getTimeSince = (dateStr: string) => {
    const minutes = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-brand border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const activeItem = modalItem?.item;
  const nextStatus = activeItem ? NEXT_STATUS[activeItem.status || 'pending'] : null;
  const prevStatus = activeItem ? PREV_STATUS[activeItem.status || 'pending'] : null;

  return (
    <div className="h-full flex flex-col">
      {/* Header + Tabs */}
      <div className="shrink-0 mb-4">
        <div className="flex items-center gap-3 mb-3">
          <ChefHat size={24} className="text-brand" />
          <h1 className="text-xl font-bold text-gray-900">Kitchen Display</h1>
          <span className="ml-auto text-xs text-gray-400">Auto-refreshes 5s</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(STATUS_CONFIG) as KitchenStatus[]).map((status) => {
            const config = STATUS_CONFIG[status];
            const count = counts[status] || 0;
            const isActive = activeTab === status;
            return (
              <button
                key={status}
                onClick={() => setActiveTab(status)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all flex items-center gap-1.5 ${
                  isActive
                    ? `${config.bg} ${config.text} ring-2 ring-current`
                    : `${config.bg} ${config.text} opacity-50 hover:opacity-80`
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${config.color}`} />
                {config.label}
                <span className="text-xs px-1.5 py-0.5 rounded-full bg-white/60">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Order Cards Grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
          {filteredOrders.map((order) => (
            <div
              key={order.id}
              className={`bg-white rounded-xl border-2 ${STATUS_CONFIG[activeTab].border} p-4 flex flex-col`}
            >
              {/* Order Header */}
              <div className="flex justify-between items-center mb-3">
                <div>
                  <span className="font-bold text-lg">#{order.order_number}</span>
                  <span className="text-xs text-gray-500 ml-2">
                    {order.type.replace('_', ' ')}
                    {order.table && ` — ${order.table.name}`}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <Clock size={12} />
                  {getTimeSince(order.created_at)}
                </div>
              </div>

              {/* Items */}
              <div className="space-y-2 flex-1">
                {order.items?.map((item) => {
                  const itemStatus = (item.status || 'pending') as KitchenStatus;
                  const config = STATUS_CONFIG[itemStatus];

                  return (
                    <button
                      key={item.id}
                      onClick={() => setModalItem({ item, orderNumber: order.order_number })}
                      className={`w-full text-left rounded-xl border-2 ${config.border} ${config.bg} px-3 py-2.5 transition-all active:scale-95 hover:brightness-95`}
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${config.color}`} />
                        <span className={`font-bold text-sm w-6 shrink-0 ${config.text}`}>{item.quantity}×</span>
                        <span className="text-gray-900 text-sm font-semibold flex-1 truncate">{item.product_name}</span>
                        <ChevronRight size={14} className="text-gray-400 shrink-0" />
                      </div>
                      {item.addons && item.addons.length > 0 && (
                        <div className="ml-[26px] flex flex-wrap gap-1 mt-1">
                          {item.addons.map((addon, i) => (
                            <span key={i} className="text-[10px] bg-white/70 text-blue-600 px-1.5 py-0.5 rounded border border-blue-200">
                              + {addon.name}
                            </span>
                          ))}
                        </div>
                      )}
                      {item.special_instructions && (
                        <p className="ml-[26px] text-[11px] text-red-600 italic mt-0.5 font-medium">
                          {`"${item.special_instructions}"`}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {filteredOrders.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-gray-400">
            <ChefHat size={48} className="mb-3 opacity-30" />
            <p className="text-lg">No {STATUS_CONFIG[activeTab].label.toLowerCase()} items</p>
            <p className="text-sm">Items will appear here when their status changes</p>
          </div>
        )}
      </div>

      {/* Full-screen item modal */}
      {modalItem && activeItem && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setModalItem(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 flex flex-col gap-5"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-400 font-medium mb-1">Order #{modalItem.orderNumber}</p>
                <h2 className="text-2xl font-bold text-gray-900 leading-tight">{activeItem.product_name}</h2>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className={`text-sm font-bold ${STATUS_CONFIG[(activeItem.status || 'pending') as KitchenStatus].text}`}>
                    {activeItem.quantity}×
                  </span>
                  <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_CONFIG[(activeItem.status || 'pending') as KitchenStatus].bg} ${STATUS_CONFIG[(activeItem.status || 'pending') as KitchenStatus].text}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${STATUS_CONFIG[(activeItem.status || 'pending') as KitchenStatus].color}`} />
                    {STATUS_CONFIG[(activeItem.status || 'pending') as KitchenStatus].label}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setModalItem(null)}
                className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 shrink-0"
              >
                <X size={18} />
              </button>
            </div>

            {/* Addons */}
            {activeItem.addons && activeItem.addons.length > 0 && (
              <div className="bg-blue-50 rounded-xl p-3">
                <p className="text-xs font-semibold text-blue-700 mb-1.5 uppercase tracking-wide">Add-ons</p>
                <div className="flex flex-wrap gap-1.5">
                  {activeItem.addons.map((addon, i) => (
                    <span key={i} className="text-sm bg-white text-blue-700 px-2.5 py-1 rounded-lg border border-blue-200 font-medium">
                      + {addon.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Special instructions */}
            {activeItem.special_instructions && (
              <div className="bg-red-50 rounded-xl p-3">
                <p className="text-xs font-semibold text-red-700 mb-1 uppercase tracking-wide">Special Instructions</p>
                <p className="text-sm text-red-700 italic font-medium">{activeItem.special_instructions}</p>
              </div>
            )}

            {/* Status pipeline */}
            <div className="flex items-center justify-center gap-1.5">
              {STATUS_ORDER.map((s, i) => (
                <div key={s} className="flex items-center gap-1.5">
                  <div className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
                    (activeItem.status || 'pending') === s
                      ? `${STATUS_CONFIG[s].bg} ${STATUS_CONFIG[s].text} ring-2 ring-current`
                      : STATUS_ORDER.indexOf((activeItem.status || 'pending') as KitchenStatus) > i
                        ? 'bg-gray-100 text-gray-400 line-through'
                        : 'bg-gray-100 text-gray-400'
                  }`}>
                    {STATUS_CONFIG[s].label}
                  </div>
                  {i < STATUS_ORDER.length - 1 && <ChevronRight size={12} className="text-gray-300 shrink-0" />}
                </div>
              ))}
            </div>

            {/* Action buttons */}
            <div className="flex flex-col gap-3">
              {nextStatus && (
                <button
                  onClick={() => updateItemStatus(activeItem.id, nextStatus)}
                  disabled={updating === activeItem.id}
                  className={`w-full py-5 rounded-2xl text-white text-xl font-bold transition-all active:scale-95 disabled:opacity-50 ${STATUS_CONFIG[nextStatus].btnBg}`}
                >
                  {updating === activeItem.id ? 'Updating…' : `Mark as ${STATUS_CONFIG[nextStatus].label}`}
                </button>
              )}
              {prevStatus && (
                <button
                  onClick={() => updateItemStatus(activeItem.id, prevStatus)}
                  disabled={updating === activeItem.id}
                  className="w-full py-4 rounded-2xl text-gray-600 text-base font-semibold border-2 border-gray-200 bg-gray-50 hover:bg-gray-100 transition-all active:scale-95 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <ChevronLeft size={18} />
                  Back to {STATUS_CONFIG[prevStatus].label}
                </button>
              )}
              {!nextStatus && (
                <div className="text-center py-4 text-gray-400 text-base font-medium">
                  ✓ Delivered — no further actions
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
