'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/auth';
import { usePosSettingsStore, type PaperSize, type BillTemplate } from '@/store/pos-settings';
import { usePrinterStore } from '@/hooks/usePrinter';
import { Settings, Building2, Globe, CreditCard, Monitor, Users, Gift, Printer, Share2, FileText, Lock, Smartphone, RefreshCw, Copy, Check } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import api from '@/lib/api';
import toast from 'react-hot-toast';

const CLASSIC_PREVIEW = `  [STORE NAME]
  Table: T1
---------------
Item      Qty Rate Amt
---------------
Burger      1   99   99
  + Sauce
>> No onions
---------------
Subtotal       99
Tax             6
===============
TOTAL         105
Cash          105
---------------
GSTN: xxx  Bill#1
123 Main St`;

const COMPACT_PREVIEW = `  STORE NAME
-----------
Bill #1    12:30
-----------
Burger           99
  2 x 49.50
-----------
TOTAL            99
Cash             99
-----------
  Thank you!`;

const DETAILED_PREVIEW = `  [STORE NAME]
GSTIN: 22XXXXX
  TAX INVOICE
-----------
Bill#1   1 Jan 24
Cust: John
-----------
Item   Qty Rate Amt
Burger   1  99  99
-----------
Subtotal (excl.)  93
CGST @3%           3
SGST @3%           3
===============
TOTAL            99`;

interface TemplateCard {
  id: BillTemplate;
  name: string;
  description: string;
  preview: string;
}

const TEMPLATE_CARDS: TemplateCard[] = [
  { id: 'classic', name: 'Classic', description: 'Rich layout with 4-column item table, addon details, and full totals. Best for dine-in.', preview: CLASSIC_PREVIEW },
  { id: 'compact', name: 'Compact', description: 'Minimal, fast layout. One line per item. Ideal for quick service and takeaway.', preview: COMPACT_PREVIEW },
  { id: 'detailed', name: 'Detailed (GST)', description: 'Full GST compliance with GSTIN header, TAX INVOICE label, and per-rate tax breakdown.', preview: DETAILED_PREVIEW },
];

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative w-11 h-6 rounded-full transition-colors ${value ? 'bg-brand' : 'bg-gray-300'}`}
    >
      <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : 'translate-x-0'}`} />
    </button>
  );
}

export default function SettingsPage() {
  const { currentTenant, user } = useAuthStore();
  const posSettings = usePosSettingsStore();
  const { printMethod, setPrintMethod } = usePrinterStore();
  const isAdmin = currentTenant?.role === 'admin' || currentTenant?.role === 'owner';

  const [loyaltyDays, setLoyaltyDays] = useState(365);
  const [savingLoyalty, setSavingLoyalty] = useState(false);

  // Mobile App Pairing
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pairingRotatedAt, setPairingRotatedAt] = useState<string | null>(null);
  const [rotatingCode, setRotatingCode] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Printing local state (buffered — saved only on explicit Save)
  type PrintingForm = {
    printerEnabled: boolean; printerPaperSize: PaperSize;
    printMethod: 'escpos' | 'browser';
    autoPrintKot: boolean; autoPrintBill: boolean;
    webPrintSize: PaperSize; whatsappShareEnabled: boolean;
  };
  const initPrinting = (): PrintingForm => ({
    printerEnabled: posSettings.printerEnabled,
    printerPaperSize: posSettings.printerPaperSize,
    printMethod: printMethod as 'escpos' | 'browser',
    autoPrintKot: posSettings.autoPrintKot,
    autoPrintBill: posSettings.autoPrintBill,
    webPrintSize: posSettings.webPrintSize,
    whatsappShareEnabled: posSettings.whatsappShareEnabled,
  });
  const [printingForm, setPrintingForm] = useState<PrintingForm>(initPrinting);
  const [savedPrinting, setSavedPrinting] = useState<PrintingForm>(initPrinting);
  const savePrinting = () => {
    posSettings.setPrinterEnabled(printingForm.printerEnabled);
    posSettings.setPrinterPaperSize(printingForm.printerPaperSize);
    setPrintMethod(printingForm.printMethod);
    posSettings.setAutoPrintKot(printingForm.autoPrintKot);
    posSettings.setAutoPrintBill(printingForm.autoPrintBill);
    posSettings.setWebPrintSize(printingForm.webPrintSize);
    posSettings.setWhatsappShareEnabled(printingForm.whatsappShareEnabled);
    setSavedPrinting(printingForm);
    toast.success('Printing settings saved');
  };
  const resetPrinting = () => setPrintingForm(savedPrinting);

  // Bill template local state
  type BillTemplateForm = { billTemplate: BillTemplate; billFooterMessage: string };
  const initBillTemplate = (): BillTemplateForm => ({
    billTemplate: posSettings.billTemplate,
    billFooterMessage: posSettings.billFooterMessage,
  });
  const [billForm, setBillForm] = useState<BillTemplateForm>(initBillTemplate);
  const [savedBillForm, setSavedBillForm] = useState<BillTemplateForm>(initBillTemplate);
  const saveBillTemplate = () => {
    posSettings.setBillTemplate(billForm.billTemplate);
    posSettings.setBillFooterMessage(billForm.billFooterMessage);
    setSavedBillForm(billForm);
    toast.success('Bill template saved');
  };
  const resetBillTemplate = () => setBillForm(savedBillForm);

  // Store / business fields — local form state (saved only on explicit Save)
  type BusinessForm = {
    businessName: string; timezone: string; currency: string;
    gstin: string; businessAddress: string; businessPhone: string;
    billShowName: boolean; billShowAddress: boolean; billShowPhone: boolean; billShowGstn: boolean;
  };
  const [savedBusiness, setSavedBusiness] = useState<BusinessForm>({
    businessName: '', timezone: '', currency: '', gstin: '',
    businessAddress: '', businessPhone: '',
    billShowName: true, billShowAddress: true, billShowPhone: true, billShowGstn: false,
  });
  const [form, setForm] = useState<BusinessForm>(savedBusiness);
  const [savingBusiness, setSavingBusiness] = useState(false);

  const resetBusiness = () => setForm(savedBusiness);

  useEffect(() => {
    api.get('/settings/tax').then((res) => {
      if (res.data.loyalty_expiry_days) setLoyaltyDays(Number(res.data.loyalty_expiry_days));
    }).catch(() => {});

    api.get('/mobile/pairing-code').then((res) => {
      setPairingCode(res.data.pairing_code);
      setPairingRotatedAt(res.data.rotated_at);
    }).catch(() => {});

    api.get('/settings/business').then((res) => {
      const d = res.data;
      const loaded: BusinessForm = {
        businessName: d.business_name || '',
        timezone: d.timezone || '',
        currency: d.currency || '',
        gstin: d.gstin || '',
        businessAddress: d.business_address || '',
        businessPhone: d.business_phone || '',
        billShowName: typeof d.bill_show_name === 'boolean' ? d.bill_show_name : true,
        billShowAddress: typeof d.bill_show_address === 'boolean' ? d.bill_show_address : true,
        billShowPhone: typeof d.bill_show_phone === 'boolean' ? d.bill_show_phone : true,
        billShowGstn: typeof d.bill_show_gstn === 'boolean' ? d.bill_show_gstn : false,
      };
      setSavedBusiness(loaded);
      setForm(loaded);
      // Sync to pos-settings store for bill printing
      posSettings.setBillShowName(loaded.billShowName);
      posSettings.setBillShowAddress(loaded.billShowAddress);
      posSettings.setBillShowPhone(loaded.billShowPhone);
      posSettings.setBillShowGstn(loaded.billShowGstn);
      if (d.gstin) posSettings.setBillGstin(d.gstin);
      if (d.business_address) posSettings.setBillAddress(d.business_address);
      if (d.business_phone) posSettings.setBillPhone(d.business_phone);
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveLoyalty = async () => {
    setSavingLoyalty(true);
    try {
      await api.put('/settings/loyalty', { loyalty_expiry_days: loyaltyDays });
      toast.success('Loyalty settings saved');
    } catch {
      toast.error('Failed to save');
    } finally {
      setSavingLoyalty(false);
    }
  };

  const saveBusinessInfo = async () => {
    setSavingBusiness(true);
    try {
      await api.put('/settings/business', {
        business_name: form.businessName,
        timezone: form.timezone,
        currency: form.currency,
        gstin: form.gstin,
        business_address: form.businessAddress,
        business_phone: form.businessPhone,
        bill_show_name: form.billShowName,
        bill_show_address: form.billShowAddress,
        bill_show_phone: form.billShowPhone,
        bill_show_gstn: form.billShowGstn,
      });
      setSavedBusiness(form);
      posSettings.setBillGstin(form.gstin);
      posSettings.setBillAddress(form.businessAddress);
      posSettings.setBillPhone(form.businessPhone);
      posSettings.setBillShowName(form.billShowName);
      posSettings.setBillShowAddress(form.billShowAddress);
      posSettings.setBillShowPhone(form.billShowPhone);
      posSettings.setBillShowGstn(form.billShowGstn);
      toast.success('Store details saved');
    } catch {
      toast.error('Failed to save');
    } finally {
      setSavingBusiness(false);
    }
  };

  const rotatePairingCode = async () => {
    setRotatingCode(true);
    try {
      const res = await api.post('/mobile/rotate-code');
      setPairingCode(res.data.pairing_code);
      setPairingRotatedAt(res.data.rotated_at);
      toast.success('New pairing code generated');
    } catch {
      toast.error('Failed to generate code');
    } finally {
      setRotatingCode(false);
    }
  };

  const copyPairingCode = () => {
    if (!pairingCode) return;
    navigator.clipboard.writeText(pairingCode).then(() => {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 2000);
    });
  };

  const paperSizeOptions: { value: PaperSize; label: string }[] = [
    { value: 'thermal58', label: '2.5" (58mm)' },
    { value: 'thermal80', label: '3.5" (80mm)' },
    { value: 'a4', label: 'A4 Paper' },
    { value: 'a5', label: 'A5 Paper' },
  ];

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <Settings size={28} className="text-brand" />
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
      </div>

      <Tabs defaultValue="general">
        <TabsList className="mb-6">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="printing">Printing</TabsTrigger>
          <TabsTrigger value="bill-template">Bill Template</TabsTrigger>
        </TabsList>

        {/* ================================================================
            TAB: General
        ================================================================ */}
        <TabsContent value="general">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

            {/* Store Details — editable for admin, readonly otherwise */}
            <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Building2 size={20} className="text-gray-500" />
                <h2 className="font-semibold text-gray-900">Store Details</h2>
                {!isAdmin && (
                  <span className="ml-auto flex items-center gap-1 text-xs text-gray-400">
                    <Lock size={12} /> Admin only
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Business Name</label>
                  {isAdmin ? (
                    <input type="text" value={form.businessName} onChange={(e) => setForm((p) => ({ ...p, businessName: e.target.value }))}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-brand" />
                  ) : (
                    <p className="font-medium text-gray-900">{form.businessName || currentTenant?.business_name}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Currency</label>
                  {isAdmin ? (
                    <input type="text" value={form.currency} onChange={(e) => setForm((p) => ({ ...p, currency: e.target.value }))}
                      placeholder="INR / THB / USD"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-brand" />
                  ) : (
                    <p className="font-medium text-gray-900">{form.currency || currentTenant?.currency}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Timezone</label>
                  {isAdmin ? (
                    <input type="text" value={form.timezone} onChange={(e) => setForm((p) => ({ ...p, timezone: e.target.value }))}
                      placeholder="Asia/Kolkata"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-brand" />
                  ) : (
                    <p className="font-medium text-gray-900">{form.timezone || currentTenant?.timezone}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">GSTIN Number</label>
                  {isAdmin ? (
                    <input type="text" value={form.gstin} onChange={(e) => setForm((p) => ({ ...p, gstin: e.target.value.toUpperCase() }))}
                      placeholder="22AAAAA0000A1Z5"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-brand" />
                  ) : (
                    <p className="font-medium text-gray-900">{form.gstin || '—'}</p>
                  )}
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">Phone</label>
                  {isAdmin ? (
                    <input type="text" value={form.businessPhone} onChange={(e) => setForm((p) => ({ ...p, businessPhone: e.target.value }))}
                      placeholder="+91 9876543210"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-brand" />
                  ) : (
                    <p className="font-medium text-gray-900">{form.businessPhone || '—'}</p>
                  )}
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm text-gray-500 mb-1">Address</label>
                  {isAdmin ? (
                    <textarea value={form.businessAddress} onChange={(e) => setForm((p) => ({ ...p, businessAddress: e.target.value }))}
                      rows={2} placeholder="123 Main Street, City, State - 123456"
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-brand resize-none" />
                  ) : (
                    <p className="font-medium text-gray-900">{form.businessAddress || '—'}</p>
                  )}
                </div>
              </div>

              {/* Bill display toggles */}
              <div className="mt-5 pt-5 border-t border-gray-100">
                <p className="text-sm font-semibold text-gray-700 mb-3">Show on Invoice</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {([
                    { label: 'Business Name', key: 'billShowName' as const },
                    { label: 'Address', key: 'billShowAddress' as const },
                    { label: 'Phone Number', key: 'billShowPhone' as const },
                    { label: 'GSTIN Number', key: 'billShowGstn' as const },
                  ] as const).map((item) => (
                    <div key={item.key} className="flex items-center justify-between py-2">
                      <span className="text-sm text-gray-700">{item.label}</span>
                      <Toggle
                        value={form[item.key]}
                        onChange={isAdmin ? (v) => setForm((p) => ({ ...p, [item.key]: v })) : () => {}}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {isAdmin && (
                <div className="mt-4 flex gap-2">
                  <button onClick={saveBusinessInfo} disabled={savingBusiness}
                    className="px-5 py-2 text-sm bg-brand text-white rounded-lg hover:opacity-90 disabled:opacity-50 font-medium">
                    {savingBusiness ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={resetBusiness} disabled={savingBusiness}
                    className="px-5 py-2 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 font-medium">
                    Cancel
                  </button>
                </div>
              )}
            </div>

            {/* Subscription */}
            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <div className="flex items-center gap-2 mb-4">
                <CreditCard size={20} className="text-gray-500" />
                <h2 className="font-semibold text-gray-900">Subscription</h2>
              </div>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-500">Plan</p>
                  <p className="font-medium text-gray-900 capitalize">{currentTenant?.plan}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Status</p>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                    currentTenant?.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                  }`}>
                    {currentTenant?.status}
                  </span>
                </div>
              </div>
            </div>

            {/* POS Display */}
            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Monitor size={20} className="text-gray-500" />
                <h2 className="font-semibold text-gray-900">POS Display</h2>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">Show Product Images</p>
                  <p className="text-sm text-gray-500">Display product images in the POS grid</p>
                </div>
                <Toggle value={posSettings.showProductImages} onChange={posSettings.setShowProductImages} />
              </div>
            </div>

            {/* POS Workflow */}
            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Users size={20} className="text-gray-500" />
                <h2 className="font-semibold text-gray-900">POS Workflow</h2>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">Customer Mandatory</p>
                    <p className="text-sm text-gray-500">Require customer selection before placing an order</p>
                  </div>
                  <Toggle value={posSettings.customerMandatory} onChange={posSettings.setCustomerMandatory} />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-medium text-gray-900">Phone Number Digits</p>
                      <p className="text-sm text-gray-500">Required digit count for phone validation (e.g. 10 for India)</p>
                    </div>
                  </div>
                  <input type="number" min={7} max={15} value={posSettings.phoneDigits}
                    onChange={(e) => posSettings.setPhoneDigits(parseInt(e.target.value) || 10)}
                    className="w-20 px-3 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-brand" />
                </div>
              </div>
            </div>

            {/* Loyalty */}
            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Gift size={20} className="text-gray-500" />
                <h2 className="font-semibold text-gray-900">Loyalty Program</h2>
              </div>
              <div className="space-y-4">
                <div>
                  <p className="font-medium text-gray-900">Points Expiry</p>
                  <p className="text-sm text-gray-500 mb-2">Number of days before earned loyalty points expire</p>
                  <div className="flex items-center gap-3">
                    <input type="number" min={1} max={3650} value={loyaltyDays}
                      onChange={(e) => setLoyaltyDays(parseInt(e.target.value) || 365)}
                      className="w-24 px-3 py-1.5 text-sm border border-gray-200 rounded-lg outline-none focus:ring-1 focus:ring-brand" />
                    <span className="text-sm text-gray-500">days</span>
                    <button onClick={saveLoyalty} disabled={savingLoyalty}
                      className="px-4 py-1.5 text-sm bg-brand text-white rounded-lg hover:opacity-90 disabled:opacity-50">
                      {savingLoyalty ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Account */}
            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Account</h2>
              <div className="space-y-3">
                <div>
                  <p className="text-sm text-gray-500">Name</p>
                  <p className="font-medium text-gray-900">{user?.name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Email</p>
                  <p className="font-medium text-gray-900">{user?.email}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Role</p>
                  <p className="font-medium text-gray-900 capitalize">{currentTenant?.role || '—'}</p>
                </div>
              </div>
            </div>

            {/* Mobile App */}
            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Smartphone size={20} className="text-gray-500" />
                <h2 className="font-semibold text-gray-900">Mobile App</h2>
              </div>
              <p className="text-sm text-gray-500 mb-4">
                Connect the Flo mobile app to view reports and sales on your phone.
                Enter this code in the app to pair it with your account.
              </p>
              {pairingCode ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 text-center">
                      <span className="font-mono text-2xl font-bold tracking-[0.3em] text-gray-900">
                        {pairingCode}
                      </span>
                    </div>
                    <button
                      onClick={copyPairingCode}
                      className="p-2.5 border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-500"
                      title="Copy code"
                    >
                      {copiedCode ? <Check size={18} className="text-green-600" /> : <Copy size={18} />}
                    </button>
                  </div>
                  {pairingRotatedAt && (
                    <p className="text-xs text-gray-400">
                      Generated {new Date(pairingRotatedAt).toLocaleDateString()}
                    </p>
                  )}
                  <button
                    onClick={rotatePairingCode}
                    disabled={rotatingCode}
                    className="flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50"
                  >
                    <RefreshCw size={14} className={rotatingCode ? 'animate-spin' : ''} />
                    {rotatingCode ? 'Generating...' : 'Generate new code'}
                  </button>
                  <p className="text-xs text-amber-600">
                    Generating a new code will disconnect all currently paired devices.
                  </p>
                </div>
              ) : (
                <button
                  onClick={rotatePairingCode}
                  disabled={rotatingCode}
                  className="px-5 py-2 text-sm bg-brand text-white rounded-lg hover:opacity-90 disabled:opacity-50 font-medium"
                >
                  {rotatingCode ? 'Generating...' : 'Generate Pairing Code'}
                </button>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ================================================================
            TAB: Printing
        ================================================================ */}
        <TabsContent value="printing">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Printer size={20} className="text-gray-500" />
                <h2 className="font-semibold text-gray-900">Printing</h2>
              </div>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">Enable Printer</p>
                    <p className="text-sm text-gray-500">Connect to thermal printer via USB/Bluetooth</p>
                  </div>
                  <Toggle value={printingForm.printerEnabled} onChange={(v) => setPrintingForm((p) => ({ ...p, printerEnabled: v }))} />
                </div>
                <div>
                  <p className="font-medium text-gray-900 mb-2">Paper Size</p>
                  <select value={printingForm.printerPaperSize}
                    onChange={(e) => setPrintingForm((p) => ({ ...p, printerPaperSize: e.target.value as PaperSize }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-brand">
                    {paperSizeOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <p className="font-medium text-gray-900 mb-2">Print Method</p>
                  <select value={printingForm.printMethod}
                    onChange={(e) => setPrintingForm((p) => ({ ...p, printMethod: e.target.value as 'escpos' | 'browser' }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-brand">
                    <option value="escpos">ESCPOS (USB Thermal Printer)</option>
                    <option value="browser">Browser Print (any printer)</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    {printingForm.printMethod === 'escpos'
                      ? 'Direct USB printing via WebUSB — connect the printer from the POS toolbar'
                      : 'Opens the browser print dialog — works with any printer on this computer'}
                  </p>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">Auto-print KOT</p>
                    <p className="text-sm text-gray-500">Print KOT when order is placed</p>
                  </div>
                  <Toggle value={printingForm.autoPrintKot} onChange={(v) => setPrintingForm((p) => ({ ...p, autoPrintKot: v }))} />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-gray-900">Auto-print Bill</p>
                    <p className="text-sm text-gray-500">Print bill when payment is completed</p>
                  </div>
                  <Toggle value={printingForm.autoPrintBill} onChange={(v) => setPrintingForm((p) => ({ ...p, autoPrintBill: v }))} />
                </div>
                <div>
                  <p className="font-medium text-gray-900 mb-2">Web Print Size (A4/A5)</p>
                  <select value={printingForm.webPrintSize}
                    onChange={(e) => setPrintingForm((p) => ({ ...p, webPrintSize: e.target.value as PaperSize }))}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-brand">
                    <option value="a4">A4 (Default)</option>
                    <option value="a5">A5</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <div className="flex items-center gap-2 mb-4">
                <Share2 size={20} className="text-gray-500" />
                <h2 className="font-semibold text-gray-900">WhatsApp Sharing</h2>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">Enable WhatsApp Share</p>
                  <p className="text-sm text-gray-500">Send bill details via WhatsApp after payment</p>
                </div>
                <Toggle value={printingForm.whatsappShareEnabled} onChange={(v) => setPrintingForm((p) => ({ ...p, whatsappShareEnabled: v }))} />
              </div>
            </div>
          </div>

          {/* Printing tab Save/Cancel */}
          <div className="mt-6 flex gap-2">
            <button onClick={savePrinting} className="px-5 py-2 text-sm bg-brand text-white rounded-lg hover:opacity-90 font-medium">Save</button>
            <button onClick={resetPrinting} className="px-5 py-2 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 font-medium">Cancel</button>
          </div>
        </TabsContent>

        {/* ================================================================
            TAB: Bill Template
        ================================================================ */}
        <TabsContent value="bill-template">
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <div className="flex items-center gap-2 mb-4">
                <FileText size={20} className="text-gray-500" />
                <h2 className="font-semibold text-gray-900">Choose Template</h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {TEMPLATE_CARDS.map((card) => {
                  const isSelected = billForm.billTemplate === card.id;
                  return (
                    <button key={card.id} onClick={() => setBillForm((p) => ({ ...p, billTemplate: card.id }))}
                      className={`text-left rounded-xl border-2 p-4 transition-all ${
                        isSelected ? 'border-brand bg-brand/5' : 'border-gray-200 hover:border-gray-300 bg-white'
                      }`}>
                      <p className="font-semibold text-gray-900 mb-2">{card.name}</p>
                      <pre className="font-mono text-[9px] leading-tight text-gray-600 bg-gray-50 p-2 rounded overflow-hidden mb-3 whitespace-pre">
                        {card.preview}
                      </pre>
                      <p className="text-xs text-gray-500">{card.description}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-100 p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Footer Message</h2>
              <div>
                <label htmlFor="footer-message" className="block text-sm font-medium text-gray-700 mb-1">Footer Message</label>
                <textarea id="footer-message" rows={2}
                  placeholder="e.g. Thank you for visiting!"
                  value={billForm.billFooterMessage}
                  onChange={(e) => setBillForm((p) => ({ ...p, billFooterMessage: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-brand resize-none" />
                <p className="text-xs text-gray-400 mt-1">Printed at the bottom of every bill</p>
              </div>
            </div>
          </div>

          {/* Bill Template tab Save/Cancel */}
          <div className="mt-6 flex gap-2">
            <button onClick={saveBillTemplate} className="px-5 py-2 text-sm bg-brand text-white rounded-lg hover:opacity-90 font-medium">Save</button>
            <button onClick={resetBillTemplate} className="px-5 py-2 text-sm border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 font-medium">Cancel</button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
