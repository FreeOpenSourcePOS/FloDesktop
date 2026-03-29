'use client';

import { useState, useEffect } from 'react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import toast from 'react-hot-toast';
import { Plus, X } from 'lucide-react';
import type { Staff } from '@/lib/types';

export default function StaffPage() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ employee_code: '', role: 'waiter', monthly_salary: '' });

  const fetchStaff = async () => {
    try {
      const { data } = await api.get('/staff');
      setStaff(data.staff || []);
    } catch {
      toast.error('Failed to load staff');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStaff(); }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/staff', {
        ...form,
        monthly_salary: form.monthly_salary ? Number(form.monthly_salary) : null,
      });
      toast.success('Staff added');
      setShowForm(false);
      setForm({ employee_code: '', role: 'waiter', monthly_salary: '' });
      fetchStaff();
    } catch {
      toast.error('Failed to add staff');
    }
  };

  const toggleActive = async (s: Staff) => {
    try {
      await api.post(`/staff/${s.id}/${s.is_active ? 'deactivate' : 'reactivate'}`);
      fetchStaff();
    } catch {
      toast.error('Failed to update');
    }
  };

  const roleColors: Record<string, string> = {
    manager: 'bg-purple-100 text-purple-800',
    cashier: 'bg-blue-100 text-blue-800',
    waiter: 'bg-green-100 text-green-800',
    cook: 'bg-orange-100 text-orange-800',
    bartender: 'bg-pink-100 text-pink-800',
    host: 'bg-teal-100 text-teal-800',
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Staff</h1>
        <Button onClick={() => setShowForm(true)}><Plus size={16} className="mr-1" /> Add Staff</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {staff.map((s) => (
          <div key={s.id} className={`bg-white rounded-xl p-5 border ${s.is_active ? 'border-gray-100' : 'border-gray-200 opacity-60'}`}>
            <div className="flex justify-between items-start">
              <div>
                <p className="font-bold text-gray-900">{s.employee_code}</p>
                <span className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${roleColors[s.role] || 'bg-gray-100 text-gray-800'}`}>
                  {s.role}
                </span>
              </div>
              <button
                onClick={() => toggleActive(s)}
                className={`text-xs font-medium ${s.is_active ? 'text-red-500 hover:text-red-700' : 'text-green-500 hover:text-green-700'}`}
              >
                {s.is_active ? 'Deactivate' : 'Reactivate'}
              </button>
            </div>
            {s.monthly_salary && (
              <p className="text-sm text-gray-500 mt-2">Salary: {Number(s.monthly_salary).toLocaleString()}/mo</p>
            )}
          </div>
        ))}
      </div>

      {staff.length === 0 && <p className="text-center text-gray-500 py-12">No staff members yet</p>}

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold">Add Staff</h2>
              <button onClick={() => setShowForm(false)}><X size={20} className="text-gray-400" /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <input type="text" placeholder="Employee Code (e.g., EMP001)" value={form.employee_code}
                onChange={(e) => setForm({ ...form, employee_code: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-brand" required />
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-brand">
                <option value="manager">Manager</option>
                <option value="cashier">Cashier</option>
                <option value="waiter">Waiter</option>
                <option value="cook">Cook</option>
                <option value="bartender">Bartender</option>
                <option value="host">Host</option>
              </select>
              <input type="number" placeholder="Monthly Salary (optional)" value={form.monthly_salary}
                onChange={(e) => setForm({ ...form, monthly_salary: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg outline-none focus:ring-2 focus:ring-brand" />
              <Button type="submit" className="w-full">Add Staff</Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
