'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import toast from 'react-hot-toast';
import { Plus, Search, X, Wallet } from 'lucide-react';
import type { Customer } from '@/lib/types';

export default function CustomersPage() {
  const { currentTenant } = useAuthStore();
  const currency = currentTenant?.currency === 'THB' ? '฿' : '₹';
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', email: '', country_code: '+91' });

  const fetchCustomers = async () => {
    try {
      const params = search ? { search } : {};
      const { data } = await api.get('/customers', { params });
      setCustomers(data.data || []);
    } catch {
      toast.error('Failed to load customers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchCustomers(); }, [search]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/customers', form);
      toast.success('Customer added');
      setShowForm(false);
      setForm({ name: '', phone: '', email: '', country_code: '+91' });
      fetchCustomers();
    } catch {
      toast.error('Failed to add customer');
    }
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
        <Button onClick={() => setShowForm(true)}><Plus size={16} className="mr-1" /> Add Customer</Button>
      </div>

      <div className="relative mb-4">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, phone, or email..."
          className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand outline-none"
        />
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase">Customer</th>
              <th className="text-left p-4 text-xs font-medium text-gray-500 uppercase">Phone</th>
              <th className="text-center p-4 text-xs font-medium text-gray-500 uppercase">Visits</th>
              <th className="text-right p-4 text-xs font-medium text-gray-500 uppercase">Total Spent</th>
              <th className="text-right p-4 text-xs font-medium text-gray-500 uppercase">Wallet</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {customers.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="p-4">
                  <p className="font-medium text-gray-900">{c.name}</p>
                  <p className="text-xs text-gray-500">{c.email || '—'}</p>
                </td>
                <td className="p-4 text-sm text-gray-600">{c.country_code}{c.phone}</td>
                <td className="p-4 text-center text-sm">{c.visits_count}</td>
                <td className="p-4 text-right font-medium">{currency}{Number(c.total_spent).toLocaleString()}</td>
                <td className="p-4 text-right">
                  {Number(c.wallet_balance) > 0 ? (
                    <span className="inline-flex items-center gap-1 text-purple-700 font-semibold text-sm">
                      <Wallet size={13} />
                      {currency}{Number(c.wallet_balance).toLocaleString()}
                    </span>
                  ) : (
                    <span className="text-gray-400 text-sm">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {customers.length === 0 && <p className="text-center text-gray-500 py-12">No customers found</p>}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">Add Customer</h2>
              <button onClick={() => setShowForm(false)}><X size={20} className="text-gray-400" /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <input type="text" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-brand" required />
              <input type="tel" placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-brand" required />
              <input type="email" placeholder="Email (optional)" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-brand" />
              <Button type="submit" className="w-full">Add Customer</Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
