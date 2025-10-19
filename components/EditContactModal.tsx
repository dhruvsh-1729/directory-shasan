// components/EditContactModal.tsx
import React, { useEffect, useMemo, useState } from 'react';
import { X, Plus, Minus, Save, CheckCircle, AlertTriangle } from 'lucide-react';
import type { Contact } from '@/types';
import { convertCase } from '@/utils/helpers';
import Location from './Location';

type Props = {
  contact: Contact;
  parentContact?: Contact | null; // pass parent when available (optional)
  onCancel: () => void;
  onSaved: (updated: { contact: Contact; parentContact?: Contact | null }) => void;
};

const PHONE_TYPES = ['mobile','office','residence','fax','other'] as const;

const EditContactModal: React.FC<Props> = ({ contact, parentContact, onCancel, onSaved }) => {
  const [form, setForm] = useState<Contact>(() => JSON.parse(JSON.stringify(contact)));
  const [applyToParent, setApplyToParent] = useState<boolean>(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>('');

  // Basic setters
  const setField = (k: keyof Contact, v: any) => setForm(p => ({ ...p, [k]: v }));

  // Phones
  const addPhone = () =>
    setForm(p => ({ ...p, phones: [...p.phones, {
      id: `phone_${Date.now()}`,
      number: '',
      type: 'mobile',
      isPrimary: p.phones.length === 0,
      label: '',
      country: '',
      region: '',
      isValid: true,
    }] }));

  const removePhone = (id: string) =>
    setForm(p => ({ ...p, phones: p.phones.filter(ph => ph.id !== id) }));

  const setPhone = (id: string, key: string, value: any) =>
    setForm(p => ({ ...p, phones: p.phones.map(ph => ph.id === id ? { ...ph, [key]: value } : ph) }));

  const setPrimaryPhone = (id: string) =>
    setForm(p => ({ ...p, phones: p.phones.map(ph => ({ ...ph, isPrimary: ph.id === id })) }));

  // Emails
  const addEmail = () =>
    setForm(p => ({ ...p, emails: [...p.emails, {
      id: `email_${Date.now()}`,
      address: '',
      isPrimary: p.emails.length === 0,
      isValid: true,
    }] }));

  const removeEmail = (id: string) =>
    setForm(p => ({ ...p, emails: p.emails.filter(e => e.id !== id) }));

  const setEmail = (id: string, key: string, value: any) =>
    setForm(p => ({ ...p, emails: p.emails.map(e => e.id === id ? { ...e, [key]: value } : e) }));

  const setPrimaryEmail = (id: string) =>
    setForm(p => ({ ...p, emails: p.emails.map(e => ({ ...e, isPrimary: e.id === id })) }));

  // Tags (simple CSV → array UX)
  const tagsCSV = useMemo(() => (form.tags || []).join(', '), [form.tags]);
  const setTagsCSV = (v: string) =>
    setForm(p => ({ ...p, tags: v.split(',').map(s => s.trim()).filter(Boolean) }));

  // Save
  // Helper for CSV fields
  const toProperCaseArray = (arr: string[] | null | undefined) =>
    (arr ?? []).map(s => convertCase(s));

  const onSave = async () => {
    setSaving(true);
    setError('');

    try {
      const res = await fetch(`/api/contacts/${form.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patch: {
            name: convertCase(form.name),
            status: form.status ?? null,
            address: convertCase(form.address),
            suburb: convertCase(form.suburb),
            city: convertCase(form.city),
            pincode: form.pincode ?? null,
            state: convertCase(form.state),
            country: convertCase(form.country),
            category: form.category ?? null,
            officeAddress: convertCase(form.officeAddress),
            address2: convertCase(form.address2),
            duplicateGroup: convertCase(form.duplicateGroup),
            alternateNames: toProperCaseArray(form.alternateNames),
            tags: toProperCaseArray(form.tags),
            notes: convertCase(form.notes),
            phones: form.phones,
            emails: form.emails,
            relationships: form.relationships ?? [],
          },
          applyToParent: !form.isMainContact && applyToParent ? true : false,
        })
      });

      if (!res.ok) {
        const t = await res.json().catch(() => ({}));
        console.error('Save error', res.status, t);
        setError(t.message || `Failed to save (HTTP ${res.status})`);
        return;
      }

      const data = await res.json();
      onSaved({ contact: data.contact, parentContact: data.parentContact || null });
    } catch (e: any) {
      setError(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-5xl w-full max-h-[95vh] overflow-y-auto shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-indigo-600 to-blue-600 text-white rounded-t-2xl p-5 z-10 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Edit Contact</h2>
          <button onClick={onCancel} className="p-2 rounded-lg hover:bg-white/20">
            <X className="h-5 w-5 text-white" />
          </button>
        </div>

        {error && (
          <div className="m-5 p-4 border-l-4 border-red-400 bg-red-50 rounded">
            <div className="flex items-center text-red-700">
              <AlertTriangle className="h-5 w-5 mr-2" />
              <span>{error}</span>
            </div>
          </div>
        )}

        <div className="p-6 space-y-8">
          {/* Basic Info */}
          <section className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm text-gray-600">Name</span>
                <input
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                  value={form.name}
                  onChange={(e) => setField('name', e.target.value)}
                />
              </label>

              <label className="block">
                <span className="text-sm text-gray-600">Status</span>
                <input
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                  value={form.status || ''}
                  onChange={(e) => setField('status', e.target.value)}
                />
              </label>

              <label className="block sm:col-span-2">
                <span className="text-sm text-gray-600">Category (CSV)</span>
                <input
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                  value={form.category || ''}
                  onChange={(e) => setField('category', e.target.value)}
                />
              </label>
            </div>
          </section>

          {/* Address */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Address</h3>
              {!form.isMainContact && parentContact && (
                <label className="inline-flex items-center space-x-2 text-sm">
                  <input
                    type="checkbox"
                    className="rounded border-gray-300"
                    checked={applyToParent}
                    onChange={(e) => setApplyToParent(e.target.checked)}
                  />
                  <span>Apply address & common updates to parent too</span>
                </label>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block">
                <span className="text-sm text-gray-600">Address</span>
                <textarea
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                  value={form.address || ''}
                  onChange={(e) => setField('address', e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-sm text-gray-600">Office Address</span>
                <textarea
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                  value={form.officeAddress || ''}
                  onChange={(e) => setField('officeAddress', e.target.value)}
                />
              </label>
              <label className="block">
                <span className="text-sm text-gray-600">Additional Address</span>
                <textarea
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                  value={form.address2 || ''}
                  onChange={(e) => setField('address2', e.target.value)}
                />
              </label>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-sm text-gray-600">Suburb</span>
                  <input
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    value={form.suburb || ''}
                    onChange={(e) => setField('suburb', e.target.value)}
                  />
                </label>
                {/* <label className="block">
                  <span className="text-sm text-gray-600">City</span>
                  <input
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    value={form.city || ''}
                    onChange={(e) => setField('city', e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-sm text-gray-600">State</span>
                  <input
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    value={form.state || ''}
                    onChange={(e) => setField('state', e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-sm text-gray-600">Country</span>
                  <input
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    value={form.country || ''}
                    onChange={(e) => setField('country', e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="text-sm text-gray-600">Pincode</span>
                  <input
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    value={form.pincode || ''}
                    onChange={(e) => setField('pincode', e.target.value)}
                  />
                </label> */}
                <Location form={{country: form.country || "" as string, state: form.state || "" as string, city: form.city || "" as string, pincode: form.pincode as string}} setField={setField} />

              </div>
            </div>
          </section>

          {/* Phones */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Phones</h3>
              <button
                onClick={addPhone}
                className="inline-flex items-center px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm"
              >
                <Plus className="h-4 w-4 mr-1" /> Add phone
              </button>
            </div>
            <div className="space-y-2">
              {form.phones.map(ph => (
                <div key={ph.id} className="grid grid-cols-1 sm:grid-cols-6 gap-2 p-3 border rounded-lg">
                  <input
                    className="sm:col-span-2 rounded border px-3 py-2"
                    placeholder="Number"
                    value={ph.number}
                    onChange={(e) => setPhone(ph.id, 'number', e.target.value)}
                  />
                  <select
                    className="rounded border px-3 py-2"
                    value={ph.type}
                    onChange={(e) => setPhone(ph.id, 'type', e.target.value)}
                  >
                    {PHONE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <input
                    className="rounded border px-3 py-2"
                    placeholder="Label (optional)"
                    value={ph.label || ''}
                    onChange={(e) => setPhone(ph.id, 'label', e.target.value)}
                  />
                  <div className="flex items-center space-x-2">
                    <label className="inline-flex items-center text-sm">
                      <input
                        type="checkbox"
                        checked={!!ph.isPrimary}
                        onChange={() => setPrimaryPhone(ph.id)}
                        className="mr-2"
                      />
                      Primary
                    </label>
                  </div>
                  <div className="flex items-center justify-end">
                    <button onClick={() => removePhone(ph.id)} className="p-2 rounded hover:bg-red-50 text-red-600">
                      <Minus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
              {form.phones.length === 0 && (
                <div className="text-sm text-gray-500">No phone numbers</div>
              )}
            </div>
          </section>

          {/* Emails */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Emails</h3>
              <button
                onClick={addEmail}
                className="inline-flex items-center px-3 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-sm"
              >
                <Plus className="h-4 w-4 mr-1" /> Add email
              </button>
            </div>
            <div className="space-y-2">
              {form.emails.map(em => (
                <div key={em.id} className="grid grid-cols-1 sm:grid-cols-6 gap-2 p-3 border rounded-lg">
                  <input
                    className="sm:col-span-4 rounded border px-3 py-2"
                    placeholder="address@example.com"
                    value={em.address}
                    onChange={(e) => setEmail(em.id, 'address', e.target.value)}
                  />
                  <label className="inline-flex items-center text-sm">
                    <input
                      type="checkbox"
                      checked={!!em.isPrimary}
                      onChange={() => setPrimaryEmail(em.id)}
                      className="mr-2"
                    />
                    Primary
                  </label>
                  <div className="flex items-center justify-end">
                    <button onClick={() => removeEmail(em.id)} className="p-2 rounded hover:bg-red-50 text-red-600">
                      <Minus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
              {form.emails.length === 0 && (
                <div className="text-sm text-gray-500">No emails</div>
              )}
            </div>
          </section>

          {/* Tags / Notes */}
          <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm text-gray-600">Tags (CSV)</span>
              <input
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={tagsCSV}
                onChange={(e) => setTagsCSV(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="text-sm text-gray-600">Alternate Names (CSV)</span>
              <input
              className="mt-1 w-full rounded-lg border px-3 py-2"
              value={form.alternateNames?.join(', ') ?? ''}
              onChange={(e) =>
                setField(
                'alternateNames',
                e.target.value === ''
                  ? []
                  : e.target.value
                    .split(',')
                    .map(s => s.trim())
                    .filter(Boolean)
                )
              }
              placeholder="Enter alternate names separated by commas"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-sm text-gray-600">Notes</span>
              <textarea
                className="mt-1 w-full rounded-lg border px-3 py-2"
                rows={4}
                value={form.notes || ''}
                onChange={(e) => setField('notes', e.target.value)}
              />
            </label>
          </section>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 p-5 border-t rounded-b-2xl flex items-center justify-between">
          <div className="text-xs text-gray-500 flex items-center">
            <CheckCircle className="h-4 w-4 text-green-600 mr-2" />
            Changes will be saved immediately
          </div>
          <div className="flex items-center space-x-3">
            <button onClick={onCancel} className="px-5 py-2 rounded-lg border">Cancel</button>
            <button
              onClick={onSave}
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditContactModal;
