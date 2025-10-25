import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Plus,
  Minus,
  Save,
  AlertTriangle,
  Loader2,
  Search as SearchIcon,
} from 'lucide-react';
import type { Contact, Email, Phone } from '@/types';
import { convertCase } from '@/utils/helpers';
import Location from './Location';

type ContactDraft = Omit<Contact, 'id' | 'parentContact' | 'childContacts'> & { id?: string };

type ParentOption = {
  id: string;
  name: string;
  status?: string | null;
  category?: string | null;
  suburb?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  pincode?: string | null;
  address?: string | null;
  phones: Phone[];
  emails: Email[];
};

type Props = {
  onCancel: () => void;
  onCreated: (payload: { contact: Contact; parentContact?: Contact | null }) => void;
};

const PHONE_TYPES = ['mobile', 'office', 'residence', 'fax', 'other'] as const;

const createEmptyContact = (): ContactDraft => ({
  name: '',
  status: undefined,
  address: undefined,
  suburb: undefined,
  city: undefined,
  pincode: undefined,
  state: undefined,
  country: undefined,
  category: undefined,
  officeAddress: undefined,
  address2: undefined,
  isMainContact: true,
  parentContactId: undefined,
  relationships: [],
  duplicateGroup: undefined,
  alternateNames: [],
  tags: [],
  notes: undefined,
  avatarUrl: undefined,
  avatarPublicId: undefined,
  phones: [],
  emails: [],
});

const AddContactModal: React.FC<Props> = ({ onCancel, onCreated }) => {
  const [contactType, setContactType] = useState<'parent' | 'child'>('parent');
  const [form, setForm] = useState<ContactDraft>(() => createEmptyContact());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>('');

  const [parentSearchTerm, setParentSearchTerm] = useState('');
  const [parentOptions, setParentOptions] = useState<ParentOption[]>([]);
  const [parentLoading, setParentLoading] = useState(false);
  const [parentError, setParentError] = useState('');
  const [selectedParent, setSelectedParent] = useState<ParentOption | null>(null);
  const searchAbortController = useRef<AbortController | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const setField = useCallback(<K extends keyof ContactDraft>(key: K, value: ContactDraft[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const forChild = contactType === 'child';

  useEffect(() => {
    if (contactType === 'parent') {
      setSelectedParent(null);
      setForm((prev) => {
        if (prev.isMainContact === true && !prev.parentContactId) return prev;
        return { ...prev, isMainContact: true, parentContactId: undefined };
      });
      setParentSearchTerm('');
    } else {
      setForm((prev) => {
        const parentId = selectedParent?.id;
        if (prev.isMainContact === false && prev.parentContactId === parentId) return prev;
        return { ...prev, isMainContact: false, parentContactId: parentId };
      });
    }
  }, [contactType, selectedParent]);

  useEffect(() => {
    if (!forChild) return;

    if (parentSearchTerm.trim().length < 2) {
      setParentOptions([]);
      setParentLoading(false);
      setParentError('');
      if (!selectedParent) {
        setForm((prev) => ({ ...prev, parentContactId: undefined }));
      }
      return;
    }

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (searchAbortController.current) searchAbortController.current.abort();

    setParentLoading(true);
    setParentError('');

    const controller = new AbortController();
    searchAbortController.current = controller;

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/contacts/parents?q=${encodeURIComponent(parentSearchTerm.trim())}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setParentOptions(data.parents || []);
      } catch (err: any) {
        if (err?.name === 'AbortError') return;
        console.error('Failed to search parent contacts', err);
        setParentError('Failed to search parent contacts. Please try again.');
      } finally {
        setParentLoading(false);
      }
    }, 300);

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
        searchTimeoutRef.current = null;
      }
      controller.abort();
    };
  }, [forChild, parentSearchTerm, selectedParent]);

  const addPhone = () =>
    setForm((prev) => ({
      ...prev,
      phones: [
        ...prev.phones,
        {
          id: `phone_${Date.now()}`,
          number: '',
          type: 'mobile',
          isPrimary: prev.phones.length === 0,
          label: '',
          country: '',
          region: '',
          isValid: true,
        },
      ],
    }));

  const removePhone = (id: string) =>
    setForm((prev) => ({
      ...prev,
      phones: prev.phones.filter((ph) => ph.id !== id),
    }));

  const setPhone = (id: string, key: keyof Phone, value: any) =>
    setForm((prev) => ({
      ...prev,
      phones: prev.phones.map((ph) => (ph.id === id ? { ...ph, [key]: value } : ph)),
    }));

  const setPrimaryPhone = (id: string) =>
    setForm((prev) => ({
      ...prev,
      phones: prev.phones.map((ph) => ({ ...ph, isPrimary: ph.id === id })),
    }));

  const addEmail = () =>
    setForm((prev) => ({
      ...prev,
      emails: [
        ...prev.emails,
        {
          id: `email_${Date.now()}`,
          address: '',
          isPrimary: prev.emails.length === 0,
          isValid: true,
        },
      ],
    }));

  const removeEmail = (id: string) =>
    setForm((prev) => ({
      ...prev,
      emails: prev.emails.filter((em) => em.id !== id),
    }));

  const setEmail = (id: string, key: keyof Email, value: any) =>
    setForm((prev) => ({
      ...prev,
      emails: prev.emails.map((em) => (em.id === id ? { ...em, [key]: value } : em)),
    }));

  const setPrimaryEmail = (id: string) =>
    setForm((prev) => ({
      ...prev,
      emails: prev.emails.map((em) => ({ ...em, isPrimary: em.id === id })),
    }));

  const tagsCSV = useMemo(() => (form.tags || []).join(', '), [form.tags]);
  const setTagsCSV = (value: string) => {
    setField(
      'tags',
      value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    );
  };

  const toProperCaseArray = (arr: string[] | null | undefined) =>
    (arr ?? []).map((s) => convertCase(s));

  const selectParent = (parent: ParentOption) => {
    setSelectedParent(parent);
    setParentSearchTerm(parent.name);
    setParentOptions([]);
    setForm((prev) => ({
      ...prev,
      parentContactId: parent.id,
      isMainContact: false,
    }));
  };

  const clearParentSelection = () => {
    setSelectedParent(null);
    setParentSearchTerm('');
    setForm((prev) => ({
      ...prev,
      parentContactId: undefined,
      isMainContact: contactType === 'parent',
    }));
  };

  const onSave = async () => {
    if (!form.name || form.name.trim().length === 0) {
      setError('Name is required');
      return;
    }
    if (forChild && !selectedParent) {
      setError('Please select a parent contact for this child contact.');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const payload = {
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
        isMainContact: !forChild,
        parentContactId: forChild && selectedParent ? selectedParent.id : undefined,
        duplicateGroup: convertCase(form.duplicateGroup),
        alternateNames: toProperCaseArray(form.alternateNames),
        tags: toProperCaseArray(form.tags),
        notes: convertCase(form.notes),
        avatarUrl: form.avatarUrl ?? null,
        avatarPublicId: form.avatarPublicId ?? null,
        phones: form.phones,
        emails: form.emails,
        relationships: form.relationships ?? [],
      };

      const res = await fetch('/api/contacts/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || body.message || `Failed to create contact (HTTP ${res.status})`);
      }

      const data = await res.json();
      const { metadata, ...contactPayload } = data;
      onCreated({
        contact: contactPayload as Contact,
        parentContact: (contactPayload as Contact).parentContact ?? null,
      });
    } catch (err: any) {
      console.error('Failed to create contact', err);
      setError(err.message || 'Failed to create contact');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl max-w-5xl w-full max-h-[95vh] overflow-y-auto shadow-2xl">
        <div className="sticky top-0 bg-gradient-to-r from-emerald-600 to-sky-600 text-white rounded-t-2xl p-5 z-10 flex items-center justify-between">
          <h2 className="text-xl font-semibold">Add New Contact</h2>
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
          <section className="space-y-3">
            <h3 className="font-semibold text-gray-900">Contact Type</h3>
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => setContactType('parent')}
                className={`flex-1 border rounded-xl px-4 py-3 text-sm font-medium transition ${
                  contactType === 'parent'
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                    : 'border-gray-200 text-gray-600 hover:border-emerald-200'
                }`}
              >
                Parent Contact
                <p className="text-xs text-gray-500 mt-1">
                  Independent contact that can have child contacts linked to it.
                </p>
              </button>
              <button
                onClick={() => setContactType('child')}
                className={`flex-1 border rounded-xl px-4 py-3 text-sm font-medium transition ${
                  contactType === 'child'
                    ? 'border-sky-500 bg-sky-50 text-sky-700'
                    : 'border-gray-200 text-gray-600 hover:border-sky-200'
                }`}
              >
                Child Contact
                <p className="text-xs text-gray-500 mt-1">
                  Related contact that must be linked to an existing parent contact.
                </p>
              </button>
            </div>
          </section>

          {forChild && (
            <section className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-gray-900">Parent Contact</h3>
                {selectedParent && (
                  <button
                    onClick={clearParentSelection}
                    className="text-xs text-sky-600 hover:text-sky-700 underline"
                  >
                    Change selection
                  </button>
                )}
              </div>
              {!selectedParent && (
                <div className="space-y-3">
                  <div className="relative">
                    <SearchIcon className="h-4 w-4 text-gray-400 absolute left-3 top-3.5" />
                    <input
                      value={parentSearchTerm}
                      onChange={(e) => setParentSearchTerm(e.target.value)}
                      placeholder="Search parent contact by name, suburb, city, state, country, email or phone"
                      className="w-full pl-9 pr-10 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-sky-500 focus:border-transparent bg-white/80 text-sm"
                    />
                    {parentLoading && (
                      <Loader2 className="h-4 w-4 animate-spin absolute right-3 top-3.5 text-gray-400" />
                    )}
                  </div>
                  {parentError && (
                    <p className="text-xs text-red-600">{parentError}</p>
                  )}
                  {parentSearchTerm.trim().length >= 2 && (
                    <div className="border rounded-xl divide-y max-h-56 overflow-y-auto bg-white shadow-sm">
                      {parentOptions.length === 0 && !parentLoading ? (
                        <div className="p-3 text-sm text-gray-500">No matching parent contacts found.</div>
                      ) : (
                        parentOptions.map((parent) => {
                          const location = [parent.suburb, parent.city, parent.state, parent.country]
                            .filter(Boolean)
                            .join(', ');
                          const phoneLine = parent.phones
                            .map((p) => p.number)
                            .filter(Boolean)
                            .slice(0, 3)
                            .join(', ');
                          const emailLine = parent.emails
                            .map((e) => e.address)
                            .filter(Boolean)
                            .slice(0, 3)
                            .join(', ');
                          return (
                            <button
                              key={parent.id}
                              onClick={() => selectParent(parent)}
                              className="w-full text-left p-3 hover:bg-sky-50 transition"
                            >
                              <div className="flex items-start justify-between">
                                <div>
                                  <p className="font-semibold text-gray-900">{parent.name}</p>
                                  {location && <p className="text-xs text-gray-500 mt-1">{location}</p>}
                                  {parent.address && (
                                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{parent.address}</p>
                                  )}
                                </div>
                                {parent.status && (
                                  <span className="text-xs px-2 py-1 rounded-full bg-sky-100 text-sky-700">
                                    {parent.status}
                                  </span>
                                )}
                              </div>
                              {phoneLine && (
                                <p className="text-xs text-gray-500 mt-2">
                                  <span className="font-medium text-gray-600">Phones:</span> {phoneLine}
                                </p>
                              )}
                              {emailLine && (
                                <p className="text-xs text-gray-500">
                                  <span className="font-medium text-gray-600">Emails:</span> {emailLine}
                                </p>
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              )}
              {selectedParent && (
                <div className="border border-sky-200 bg-sky-50 rounded-xl p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-sky-800">{selectedParent.name}</p>
                      <p className="text-xs text-sky-700 mt-1">
                        {[selectedParent.suburb, selectedParent.city, selectedParent.state, selectedParent.country]
                          .filter(Boolean)
                          .join(', ')}
                      </p>
                      {selectedParent.emails.length > 0 && (
                        <p className="text-xs text-sky-700 mt-2">
                          Emails: {selectedParent.emails.map((e) => e.address).filter(Boolean).join(', ')}
                        </p>
                      )}
                      {selectedParent.phones.length > 0 && (
                        <p className="text-xs text-sky-700">
                          Phones: {selectedParent.phones.map((p) => p.number).filter(Boolean).join(', ')}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={clearParentSelection}
                      className="text-xs text-sky-700 hover:text-sky-900 underline"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}

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
                <span className="text-sm text-gray-600">Category</span>
                <input
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                  value={form.category || ''}
                  onChange={(e) => setField('category', e.target.value)}
                />
              </label>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="font-semibold text-gray-900">Address</h3>
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

              <div className="grid grid-cols-2 gap-3 sm:col-span-2">
                <label className="block">
                  <span className="text-sm text-gray-600">Suburb</span>
                  <input
                    className="mt-1 w-full rounded-lg border px-3 py-2"
                    value={form.suburb || ''}
                    onChange={(e) => setField('suburb', e.target.value)}
                  />
                </label>
                <Location
                  form={{
                    country: (form.country || '') as string,
                    state: (form.state || '') as string,
                    city: (form.city || '') as string,
                    pincode: (form.pincode as string) || '',
                  }}
                  setField={setField}
                />
              </div>
            </div>
          </section>

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
              {form.phones.map((ph) => (
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
                    onChange={(e) => setPhone(ph.id, 'type', e.target.value as Phone['type'])}
                  >
                    {PHONE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
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
              {form.phones.length === 0 && <div className="text-sm text-gray-500">No phone numbers</div>}
            </div>
          </section>

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
              {form.emails.map((em) => (
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
              {form.emails.length === 0 && <div className="text-sm text-gray-500">No emails</div>}
            </div>
          </section>

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
                          .map((s) => s.trim())
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

        <div className="sticky bottom-0 bg-gradient-to-r from-gray-50 to-slate-50 p-6 border-t border-gray-200 rounded-b-2xl">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="text-sm text-gray-500">
              {forChild
                ? selectedParent
                  ? `Child contact will be linked to ${selectedParent.name}`
                  : 'Select a parent contact to continue'
                : 'Parent contact will be created as a top-level entry'}
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={onCancel}
                className="px-6 py-3 text-gray-700 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors font-medium"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={onSave}
                disabled={saving}
                className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-sky-600 text-white rounded-xl hover:from-emerald-700 hover:to-sky-700 transition-all duration-200 font-medium flex items-center shadow-lg disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                Create Contact
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddContactModal;
