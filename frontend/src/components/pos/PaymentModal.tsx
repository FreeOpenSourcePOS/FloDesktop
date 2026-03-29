'use client';

import { useState, useEffect } from 'react';
import { X, CreditCard, Banknote, Smartphone, Wallet, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import type { Bill } from '@/lib/types';

interface Props {
  bill: Bill;
  currency: string;
  onClose: () => void;
  onPaid: () => void;
}

const methods = [
  { key: 'cash', label: 'Cash', icon: Banknote },
  { key: 'card', label: 'Card', icon: CreditCard },
  { key: 'upi', label: 'UPI', icon: Smartphone },
] as const;

interface Payment {
  method: string;
  amount: string;
}

export default function PaymentModal({ bill, currency, onClose, onPaid }: Props) {
  const remaining = Number(bill.balance);
  const [payments, setPayments] = useState<Payment[]>([
    { method: 'cash', amount: remaining.toString() },
  ]);
  const [processing, setProcessing] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [walletAmount, setWalletAmount] = useState('');

  useEffect(() => {
    if (bill.customer_id) {
      api.get(`/customers/${bill.customer_id}/wallet`)
        .then((res) => setWalletBalance(Number(res.data.balance) || 0))
        .catch(() => setWalletBalance(0));
    }
  }, [bill.customer_id]);

  const updatePayment = (idx: number, field: keyof Payment, value: string) => {
    setPayments(payments.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  };

  const addSplit = () => {
    const allocated = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
    const rest = Math.max(0, remaining - allocated);
    setPayments([...payments, { method: 'card', amount: rest.toFixed(2) }]);
  };

  const removeSplit = (idx: number) => {
    if (payments.length <= 1) return;
    setPayments(payments.filter((_, i) => i !== idx));
  };

  const walletAmt = parseFloat(walletAmount) || 0;
  const totalPayment = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0) + walletAmt;

  const handlePay = async () => {
    if (totalPayment < remaining - 0.01) {
      toast.error('Payment amount is less than balance');
      return;
    }
    if (walletAmt > 0 && walletBalance !== null && walletAmt > walletBalance) {
      toast.error('Wallet amount exceeds available balance');
      return;
    }
    setProcessing(true);
    try {
      for (const p of payments) {
        const amt = parseFloat(p.amount);
        if (amt <= 0) continue;
        await api.post(`/bills/${bill.id}/payment`, { amount: amt, method: p.method });
      }
      if (walletAmt > 0) {
        await api.post(`/bills/${bill.id}/payment`, { amount: walletAmt, method: 'wallet' });
      }
      toast.success('Payment recorded!');
      onPaid();
    } catch {
      toast.error('Payment failed');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md">
        <div className="flex justify-between items-center p-5 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Payment</h2>
            <p className="text-sm text-gray-500">Bill #{bill.bill_number}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex justify-between items-baseline">
            <span className="text-gray-500">Total Due</span>
            <span className="text-2xl font-bold text-gray-900">{currency}{remaining.toLocaleString()}</span>
          </div>

          {payments.map((p, idx) => (
            <div key={idx} className="space-y-2 bg-gray-50 rounded-xl p-3">
              <div className="flex gap-1.5">
                {methods.map((m) => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.key}
                      onClick={() => updatePayment(idx, 'method', m.key)}
                      className={`flex-1 flex flex-col items-center gap-1 py-2 rounded-lg text-xs font-medium transition-colors ${
                        p.method === m.key ? 'bg-brand text-white' : 'bg-white text-gray-600 border border-gray-200 hover:border-brand/40'
                      }`}
                    >
                      <Icon size={16} />
                      {m.label}
                    </button>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-400 text-sm">{currency}</span>
                <input
                  type="number"
                  value={p.amount}
                  onChange={(e) => updatePayment(idx, 'amount', e.target.value)}
                  className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-brand"
                  step="0.01"
                  min="0"
                />
                {payments.length > 1 && (
                  <button onClick={() => removeSplit(idx)} className="text-red-400 hover:text-red-600">
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}

          <button
            onClick={addSplit}
            className="w-full py-2 text-sm border border-dashed border-gray-300 rounded-lg text-gray-500 hover:border-brand hover:text-brand transition-colors flex items-center justify-center gap-1"
          >
            <Plus size={14} /> Split Payment
          </button>

          {bill.customer_id && walletBalance !== null && (
            <div className={`border rounded-xl p-3 space-y-2 ${walletBalance > 0 ? 'bg-purple-50 border-purple-200' : 'bg-gray-50 border-gray-200'}`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Wallet size={16} className={walletBalance > 0 ? 'text-purple-600' : 'text-gray-400'} />
                  <span className={`text-sm font-medium ${walletBalance > 0 ? 'text-purple-900' : 'text-gray-500'}`}>Loyalty Wallet</span>
                </div>
                <span className={`text-sm font-semibold ${walletBalance > 0 ? 'text-purple-700' : 'text-gray-400'}`}>
                  {walletBalance > 0 ? `${currency}${walletBalance.toLocaleString()} available` : 'No balance'}
                </span>
              </div>
              {walletBalance > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-400 text-sm">{currency}</span>
                  <input
                    type="number"
                    value={walletAmount}
                    onChange={(e) => {
                      const v = e.target.value;
                      const max = Math.min(walletBalance, remaining);
                      const clamped = parseFloat(v) > max ? max.toFixed(2) : v;
                      setWalletAmount(clamped);
                      // Auto-reduce first payment so total stays at remaining
                      const walletUsed = parseFloat(clamped) || 0;
                      setPayments((prev) => prev.map((p, i) =>
                        i === 0 ? { ...p, amount: Math.max(0, remaining - walletUsed).toFixed(2) } : p
                      ));
                    }}
                    placeholder={`0 – ${Math.min(walletBalance, remaining).toFixed(2)}`}
                    className="flex-1 px-3 py-2 text-sm border border-purple-200 rounded-lg outline-none focus:ring-2 focus:ring-purple-400 bg-white"
                    step="0.01"
                    min="0"
                    max={Math.min(walletBalance, remaining)}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="p-5 border-t border-gray-100">
          <Button onClick={handlePay} disabled={processing || totalPayment < remaining - 0.01} className="w-full" size="lg">
            {processing ? 'Processing...' : `Pay ${currency}${totalPayment.toLocaleString()}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
