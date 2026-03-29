'use client';

import { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import type { Table, Order, Bill } from '@/lib/types';

interface Props {
  table: Table;
  currency: string;
  onClose: () => void;
  onAddItems: (table: Table, order: Order) => void;
  onPayment: (bill: Bill) => void;
}

export default function TableCheckoutModal({ table, currency, onClose, onAddItems, onPayment }: Props) {
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    const fetchOrder = async () => {
      try {
        const { data } = await api.get(`/tables/${table.id}`);
        const t = data.table;
        if (t.current_order) {
          // Fetch full order with items
          const orderRes = await api.get(`/orders/${t.current_order.id}`);
          setOrder(orderRes.data.order);
        }
      } catch {
        toast.error('Failed to load order');
      } finally {
        setLoading(false);
      }
    };
    fetchOrder();
  }, [table.id]);

  const handleCheckout = async () => {
    if (!order) return;
    setGenerating(true);
    try {
      // Check if bill already exists
      if (order.bill) {
        onPayment(order.bill);
        return;
      }
      // Generate bill
      const { data } = await api.post('/bills/generate', { order_id: order.id });
      onPayment(data.bill);
    } catch (err: unknown) {
      const error = err as { response?: { data?: { message?: string } } };
      toast.error(error.response?.data?.message || 'Failed to generate bill');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-8">
          <div className="w-8 h-8 border-4 border-brand border-t-transparent rounded-full animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  if (!order) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <div className="bg-white rounded-2xl p-6 w-full max-w-md">
          <p className="text-gray-500 text-center py-4">No active order found for this table</p>
          <Button onClick={onClose} variant="outline" className="w-full">Close</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col">
        <div className="flex justify-between items-center p-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{table.name}</h2>
            <p className="text-sm text-gray-500">Order #{order.order_number}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <div className="space-y-2">
            {(order.items || []).map((item) => (
              <div key={item.id} className="flex justify-between items-start py-2 border-b border-gray-50 last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900">
                    {item.quantity} x {item.product_name}
                  </p>
                  {item.special_instructions && (
                    <p className="text-xs text-gray-400 italic mt-0.5">{item.special_instructions}</p>
                  )}
                  {item.addons && Array.isArray(item.addons) && item.addons.length > 0 && (
                    <div className="mt-0.5">
                      {item.addons.map((a: Record<string, unknown>, i: number) => (
                        <p key={i} className="text-xs text-gray-400">
                          + {String(a.name)} {Number(a.price) > 0 && `(${currency}${Number(a.price).toLocaleString()})`}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
                <span className="text-sm font-medium text-gray-900 ml-3">
                  {currency}{Number(item.total).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-5 border-t border-gray-100 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Subtotal</span>
            <span>{currency}{Number(order.subtotal).toLocaleString()}</span>
          </div>
          {Number(order.tax_amount) > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Tax</span>
              <span>{currency}{Number(order.tax_amount).toLocaleString()}</span>
            </div>
          )}
          <div className="flex justify-between text-lg font-bold">
            <span>Total</span>
            <span className="text-brand">{currency}{Number(order.total).toLocaleString()}</span>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2">
            <Button variant="outline" onClick={() => onAddItems(table, order)}>
              Add Items
            </Button>
            <Button onClick={handleCheckout} disabled={generating}>
              {generating ? 'Generating...' : 'Checkout'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
