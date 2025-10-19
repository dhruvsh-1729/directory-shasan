// components/ContactDirectoryApp.tsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Search,
  Filter,
  Users,
  Phone,
  Mail,
  User,
  ChevronDown,
  ChevronUp,
  Download,
  Upload,
  RefreshCw,
  Database,
  X,
  AlertTriangle,
  CheckCircle,
  Loader2,
  Grid3X3,
  List,
  Tag,
  Check,
  AlertCircle,
  Calendar,
  Settings2
} from 'lucide-react';
import ContactCard from './ContactCard';
import ContactDetailModal from './ContactDetailModal';
import { ContactExtractor } from '@/utils/main';
import { Contact } from '@/types';
import ContactAvatar from './ContactAvatar';
import { expandAbbreviationList } from '@/utils/helpers';

// --------------------------
// Types that match database
// --------------------------
type PhoneType = 'mobile' | 'office' | 'residence' | 'fax' | 'other';

interface AdvancedFilters {
  // Basic
  search?: string;
  filter?: 'all' | 'main' | 'related' | 'duplicates';

  // Address granularity
  address?: string; // not used in server filter directly, but handy for quick search
  suburb?: string;
  city?: string;
  state?: string;
  country?: string;
  pincode?: string;

  hasAddress?: boolean;
  missingAddress?: boolean;
  missingCity?: boolean;
  missingState?: boolean;
  missingCountry?: boolean;
  missingSuburb?: boolean;
  missingPincode?: boolean;

  // Identity/meta
  status?: string;
  isMain?: boolean | null;     // tri-state
  hasParent?: boolean | null;  // tri-state
  hasAvatar?: boolean | null;  // tri-state

  // Validation & types
  hasEmails?: boolean | null;  // tri-state
  hasPhones?: boolean | null;  // tri-state
  validPhonesOnly?: boolean;
  validEmailsOnly?: boolean;
  phoneTypes?: PhoneType[];
  primaryPhoneOnly?: boolean;
  emailDomain?: string;

  // Arrays/tags/category
  tagsAny?: string[];
  tagsAll?: string[];
  category?: string;     // single search string
  categoryIn?: string[]; // multi

  // Date ranges
  createdAfter?: string;
  createdBefore?: string;
  updatedAfter?: string;
  updatedBefore?: string;
}

// Add a type for the options payload
type DirectoryOptions = {
  addresses: string[];
  suburbs: string[];
  cities: string[];
  pincodes: string[];
  states: string[];
  countries: string[];
  categories: string[];
  statuses: string[];
  tags: string[];
};

interface ContactSearchResult {
  contacts: Contact[];
  total: number;
  totalPages: number;
  currentPage: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

interface DatabaseStats {
  totalContacts: number;
  mainContacts: number;
  relatedContacts: number;
  totalPhones: number;
  totalEmails: number;
  duplicateGroups: number;
  recentImports: number;
  categoryCounts: Record<string, number>;
  locationCounts: Record<string, number>; // key = "city, state"
  validationStats?: {
    validPhones: number;
    invalidPhones: number;
    validEmails: number;
    invalidEmails: number;
  };
}

// Static options
const PHONE_TYPES: PhoneType[] = ['mobile', 'office', 'residence', 'fax', 'other'];

// Utility to normalize string lists (trim + case-insensitive unique)
const normalizeList = (values: (string | null | undefined)[]) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    if (!v) continue;
    const trimmed = v.trim();
    if (!trimmed || trimmed === '-' || trimmed.toLowerCase() === 'na') continue;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(trimmed);
    }
  }
  return out.sort((a, b) => a.localeCompare(b));
};

// helper to merge + sort unique strings
const unionSorted = (a: string[] = [], b: string[] = []) =>
  normalizeList([...(a || []), ...(b || [])]);

const pill =
  'inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm border bg-white/70 hover:bg-white transition';

const toggleBtn =
  'inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs border hover:bg-gray-50 transition';

const chip =
  'inline-flex items-center gap-1 rounded-full bg-gray-100 text-gray-700 px-3 py-1 text-xs';

const sectionTitle = 'text-[13px] font-semibold text-gray-700 mb-2';

const ContactDirectoryApp: React.FC = () => {
  // --------------------------
  // State
  // --------------------------
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] =
    useState<'all' | 'main' | 'related' | 'duplicates'>('all');

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);

  const [uploadStatus, setUploadStatus] =
    useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);

  const [totalPages, setTotalPages] = useState(0);
  const [totalContacts, setTotalContacts] = useState(0);
  const [dbStats, setDbStats] = useState<DatabaseStats | null>(null);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [serverFilters, setServerFilters] = useState<AdvancedFilters>({}); // applied
  const [draftFilters, setDraftFilters] = useState<AdvancedFilters>({}); // UI draft

  // ...existing state...
  const [options, setOptions] = useState<DirectoryOptions | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(false);

  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [error, setError] = useState<string>('');

  const [inflight, setInflight] = useState(0);

  const [showExport, setShowExport] = useState(false);
  const [exportFields, setExportFields] = useState<string[]>([
    'name',
    'status',
    'isMainContact',
    'parentContactId',
    'address',
    'suburb',
    'city',
    'pincode',
    'state',
    'country',
    'category',
    'phones',
    'emails',
    'tags',
    'notes',
  ]);
  const [exportLoading, setExportLoading] = useState(0 > 0); // keep type boolean
  const [exportLoadingBool, setExportLoadingBool] = useState(false);

  // keep the old boolean variable name in uses below
  useEffect(() => {
    setExportLoadingBool(exportLoading as unknown as boolean);
  }, [exportLoading]);

  const [pageInput, setPageInput] = useState('1');

  useEffect(() => {
    // keep the textbox reflecting the actual page after changes from buttons/data
    setPageInput(String(currentPage));
  }, [currentPage]);

  const commitPage = useCallback(() => {
    const n = parseInt(pageInput, 10);
    if (!Number.isFinite(n) || n < 1) {
      setPageInput(String(currentPage));
      return;
    }
    // Only clamp if we actually know totalPages (>0). Otherwise let the fetch define bounds.
    if (totalPages > 0) {
      const clamped = Math.max(1, Math.min(totalPages, n));
      setCurrentPage(clamped);
    } else {
      setCurrentPage(n);
    }
  }, [pageInput, currentPage, totalPages]);

  // Abort controller to cancel ONLY in-flight contacts list loads
  const contactsControllerRef = useRef<AbortController | null>(null);

  // --------------------------
  // Networking helpers
  // --------------------------
  const fetchContacts = useCallback(async (url: string, init?: RequestInit) => {
    // abort only the previous contacts request (not options/stats)
    contactsControllerRef.current?.abort();
    const controller = new AbortController();
    contactsControllerRef.current = controller;

    setInflight((n) => n + 1);
    try {
      const res = await fetch(url, { ...init, signal: controller.signal });
      return res;
    } finally {
      setInflight((n) => Math.max(0, n - 1));
    }
  }, []);

  const plainFetch = useCallback(async (url: string, init?: RequestInit) => {
    setInflight((n) => n + 1);
    try {
      const res = await fetch(url, init);
      return res;
    } finally {
      setInflight((n) => Math.max(0, n - 1));
    }
  }, []);

  const loadOptions = useCallback(async () => {
    try {
      setOptionsLoading(true);
      const res = await plainFetch('/api/contacts/options', {
        headers: { 'Cache-Control': 'max-age=20' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: DirectoryOptions = await res.json();
      setOptions(data);
    } catch (e) {
      console.warn('Failed to load filter options', e);
    } finally {
      setOptionsLoading(false);
    }
  }, [plainFetch]);

  useEffect(() => {
    loadOptions();
  }, [loadOptions]);

  // Debounce search input (client)
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchTerm(searchTerm), 350);
    return () => clearTimeout(t);
  }, [searchTerm]);

  // --------------------------
  // Derived: unique values
  // --------------------------
  const uniqueValues = useMemo(() => {
    // Contextual values from current list (cheap)
    const fromContacts = (pick: (c: Contact) => string | undefined) =>
      normalizeList(contacts.map(pick));

    const ctxCountries = fromContacts((c) => c.country);
    const ctxStates   = fromContacts((c) => c.state);
    const ctxCities   = fromContacts((c) => c.city);
    const ctxSuburbs  = fromContacts((c) => c.suburb);
    const ctxPincodes = fromContacts((c) => c.pincode?.toString());
    const ctxStatus   = fromContacts((c) => c.status);
    const ctxCats     = fromContacts((c) => c.category);
    const ctxTags     = normalizeList(contacts.flatMap((c) => c.tags || []));

    // Prefer server options if present; merge with contextual for nice narrowing
    return {
      countries: unionSorted(options?.countries, ctxCountries),
      states:    unionSorted(options?.states, ctxStates),
      cities:    unionSorted(options?.cities, ctxCities),
      suburbs:   unionSorted(options?.suburbs, ctxSuburbs),
      pincodes:  unionSorted(options?.pincodes, ctxPincodes),
      statuses:  unionSorted(options?.statuses, ctxStatus),
      categories:unionSorted(options?.categories, ctxCats),
      tags:      unionSorted(options?.tags, ctxTags),
    };
  }, [options, contacts]);

  const hasActiveFilters = useMemo(() => {
    const f = serverFilters;
    return Object.keys(f).some((k) => {
      const v = (f as any)[k];
      if (Array.isArray(v)) return v.length > 0;
      return v !== undefined && v !== null && v !== '';
    });
  }, [serverFilters]);

  // Build payload for server from applied filters + debounced search
  const buildServerPayload = useCallback(
    (pageOverride?: number) => {
      const f = { ...serverFilters };

      // ensure search & high-level type filter
      f.search = debouncedSearchTerm || undefined;
      f.filter = selectedFilter;

      // Tri-state normalization: null => undefined (don’t send)
      const tri: (keyof AdvancedFilters)[] = ['isMain', 'hasParent', 'hasAvatar', 'hasEmails', 'hasPhones'];
      tri.forEach((k) => {
        if ((f as any)[k] === null) delete (f as any)[k];
      });

      // Dates: string -> Date
      const dateKeys: (keyof AdvancedFilters)[] = [
        'createdAfter',
        'createdBefore',
        'updatedAfter',
        'updatedBefore',
      ];
      const out: Record<string, any> = {};
      Object.keys(f).forEach((k) => {
        const val = (f as any)[k];
        if (val === undefined || val === null || val === '') return;
        if (dateKeys.includes(k as keyof AdvancedFilters)) {
          out[k] = new Date(val as string);
        } else {
          out[k] = val;
        }
      });

      const page = pageOverride ?? currentPage;
      const limit = itemsPerPage;

      return {
        ...out,
        page,                  // if your API is 1-based
        pageIndex: page - 1,   // if your API is 0-based
        limit,
        skip: (page - 1) * limit, // if your API uses skip/limit
      };
    },
    [serverFilters, debouncedSearchTerm, selectedFilter, currentPage, itemsPerPage]
  );

  // --------------------------
  // Loaders
  // --------------------------
  const loadContacts = useCallback(async (useCache = true, pageOverride?: number) => {
    setLoading(true);
    setError('');

    try {
      const payload = buildServerPayload(pageOverride);

      // prune undefined before sending
      Object.keys(payload).forEach((k) => {
        if ((payload as any)[k] === undefined) delete (payload as any)[k];
      });

      const res = await fetchContacts('/api/contacts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': useCache ? 'max-age=20' : 'no-cache',
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: ContactSearchResult = await res.json();

      setContacts(data.contacts || []);
      setTotalPages(data.totalPages || 0);
      setTotalContacts(data.total || 0);
    } catch (e: any) {
      if (e?.name === 'AbortError') return;
      console.error('Error loading contacts:', e);
      setError('Failed to load contacts. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [buildServerPayload, fetchContacts]);

  const loadDatabaseStats = useCallback(async () => {
    try {
      const res = await plainFetch('/api/stats', {
        headers: { 'Cache-Control': 'max-age=20' },
      });
      if (res.ok) {
        const stats = await res.json();
        setDbStats(stats);
      }
    } catch (e: any) {
      console.warn('Failed to load database stats:', e);
    }
  }, [plainFetch]);

  // Boot / refresh
  useEffect(() => {
    loadContacts(true, 1);
    loadDatabaseStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pagination – when page changes, reload
  useEffect(() => {
    loadContacts(true);
  }, [currentPage, itemsPerPage, loadContacts]);

  // When search or selectedFilter or serverFilters change:
  // - If we're NOT on page 1, just set page to 1 (the page change effect will load).
  // - If we're already on page 1, load page 1 directly.
  useEffect(() => {
    if (currentPage !== 1) {
      setCurrentPage(1);
    } else {
      loadContacts(true, 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearchTerm, selectedFilter, serverFilters]);

  // --------------------------
  // UI Handlers
  // --------------------------
  const handleApplyFilters = () => {
    setServerFilters(draftFilters);
    setFiltersOpen(false);
  };

  const handleClearAllFilters = () => {
    setDraftFilters({});
    setServerFilters({});
    setCurrentPage(1);
  };

  const updateDraft = <K extends keyof AdvancedFilters>(key: K, value: AdvancedFilters[K]) => {
    setDraftFilters((prev) => ({ ...prev, [key]: value }));
  };

  const removeFilterChip = (key: keyof AdvancedFilters, value?: any) => {
    setDraftFilters((prev) => {
      const copy: any = { ...prev };
      if (Array.isArray(copy[key]) && value !== undefined) {
        copy[key] = (copy[key] as any[]).filter((x) => x !== value);
        if (copy[key].length === 0) delete copy[key];
      } else {
        delete copy[key];
      }
      return copy;
    });
    // also apply immediately when removing a chip (snappy)
    setServerFilters((prev: any) => {
      const next: any = { ...prev };
      if (Array.isArray(next[key]) && value !== undefined) {
        next[key] = (next[key] as any[]).filter((x: any) => x !== value);
        if (next[key].length === 0) delete next[key];
      } else {
        delete next[key];
      }
      return next;
    });
  };

  const handleRefresh = async () => {
    await loadContacts(false, currentPage);
    await loadDatabaseStats();
  };

  const handleDeleteContact = async (contactId: string) => {
    if (!confirm('Are you sure you want to delete this contact?')) return;
    try {
      const res = await fetch(`/api/contacts/${contactId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete contact');
      await loadContacts(false, 1);
      await loadDatabaseStats();
      setSelectedContact(null);
    } catch (e) {
      console.error('Error deleting contact:', e);
      setError('Failed to delete contact');
    }
  };

  // File upload
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setUploadStatus('processing');
    setUploadProgress(0);
    setError('');

    try {
      const processedContacts = await processContactFile(file);
      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => Math.min(prev + 10, 90));
      }, 200);

      const response = await fetch('/api/contacts/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contacts: processedContacts,
          fileName: file.name,
          fileSize: file.size,
        }),
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      const result = await response.json();
      if (result.success) {
        setUploadStatus('success');
        await loadContacts(false, 1);
        await loadDatabaseStats();
        event.target.value = '';
      } else {
        setUploadStatus('error');
        setError('Import failed: ' + (result.error || 'Unknown error'));
      }
    } catch (e) {
      console.error('Error processing file:', e);
      setUploadStatus('error');
      setError('Failed to process file.');
    } finally {
      setLoading(false);
      setTimeout(() => {
        setUploadStatus('idle');
        setUploadProgress(0);
      }, 3000);
    }
  };

  // Excel processing
  const processContactFile = async (file: File): Promise<Contact[]> => {
    const arrayBuffer = await file.arrayBuffer();
    const XLSX = await import('xlsx');

    const workbook = XLSX.read(arrayBuffer, {
      cellStyles: true,
      cellFormula: true,
      cellDates: true,
      cellNF: true,
      sheetStubs: true,
    });

    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    if (jsonData.length === 0) throw new Error('Excel file is empty');

    const dataRows = jsonData.slice(1).filter((row) => row && (row as any[]).length > 0 && (row as any[])[1]);

    const columnMap = {
      srNo: 0,
      name: 1,
      status: 2,
      address: 3,
      suburb: 4,
      city: 5,
      pincode: 6,
      state: 7,
      country: 8,
      mobile1: 9,
      mobile2: 10,
      mobile3: 11,
      mobile4: 12,
      office: 13,
      residence: 14,
      emails: 15,
      category: 16,
      officeAddress: 17,
      address2: 18,
    };

    const allProcessed: Contact[] = [];

    dataRows.forEach((row, index) => {
      const r = row as any[];
      if (!r[columnMap.name] || String(r[columnMap.name]).trim() === '') return;

      try {
        const phoneFields: (string | number)[] = [];
        [columnMap.mobile1, columnMap.mobile2, columnMap.mobile3, columnMap.mobile4].forEach((col) => {
          const val = r[col];
          if (val && String(val).trim() !== '' && String(val).trim() !== '-') phoneFields.push(val);
        });
        if (r[columnMap.office] && String(r[columnMap.office]).trim() !== '-' && String(r[columnMap.office]).trim() !== '')
          phoneFields.push(r[columnMap.office]);
        if (
          r[columnMap.residence] &&
          String(r[columnMap.residence]).trim() !== '-' &&
          String(r[columnMap.residence]).trim() !== ''
        )
          phoneFields.push(r[columnMap.residence]);

        const recordContacts = ContactExtractor.processRecord({
          name: String(r[columnMap.name]).trim(),
          phoneFields,
          emailField: r[columnMap.emails] ? String(r[columnMap.emails]).trim() : '',
          city: r[columnMap.city] ? String(r[columnMap.city]).trim() : undefined,
          state: r[columnMap.state] ? String(r[columnMap.state]).trim() : undefined,
          country: r[columnMap.country] ? String(r[columnMap.country]).trim() : undefined,
          srNo: r[columnMap.srNo] || index + 1,
          status: r[columnMap.status] ? String(r[columnMap.status]).trim() : undefined,
          address: r[columnMap.address] ? String(r[columnMap.address]).trim() : undefined,
          suburb: r[columnMap.suburb] ? String(r[columnMap.suburb]).trim() : undefined,
          pincode: r[columnMap.pincode],
          category: r[columnMap.category] ? String(r[columnMap.category]).trim() : undefined,
          officeAddress: r[columnMap.officeAddress] ? String(r[columnMap.officeAddress]).trim() : undefined,
          address2: r[columnMap.address2] ? String(r[columnMap.address2]).trim() : undefined,
        });

        if (recordContacts.length > 0) {
          const main = recordContacts.find((c) => c.isMainContact);
          if (main) {
            main.id = `contact_${r[columnMap.srNo] || index + 1}_${index}`;
            main.status = r[columnMap.status] ? String(r[columnMap.status]).trim() : undefined;
            main.address = r[columnMap.address] ? String(r[columnMap.address]).trim() : undefined;
            main.suburb = r[columnMap.suburb] ? String(r[columnMap.suburb]).trim() : undefined;
            main.pincode = r[columnMap.pincode];
            main.category = r[columnMap.category] ? String(r[columnMap.category]).trim() : undefined;
            main.officeAddress = r[columnMap.officeAddress] ? String(r[columnMap.officeAddress]).trim() : undefined;
            main.address2 = r[columnMap.address2] ? String(r[columnMap.address2]).trim() : undefined;
            const related = recordContacts.filter((c) => !c.isMainContact);
            main.relationships = related.flatMap((rc) => rc.relationships || []);
          }
        }
        allProcessed.push(...recordContacts);
      } catch (e) {
        console.error(`Error processing row ${index + 1}:`, e);
      }
    });

    const contactsWithDuplicates = ContactExtractor.detectDuplicates(allProcessed);
    return contactsWithDuplicates;
  };

  // Inherit helpers (unchanged)
  const mergeInherited = (child: Contact, parent?: Contact | null): Contact => {
    if (!parent || child.isMainContact) return child;
    return {
      ...child,
      address: child.address || parent.address || child.address,
      city: child.city || parent.city || child.city,
      state: child.state || parent.state || child.state,
      country: child.country || parent.country || child.country,
      pincode: child.pincode || parent.pincode || child.pincode,
      suburb: child.suburb || parent.suburb || child.suburb,
      parentContact: parent ?? child.parentContact,
    };
  };

  const handleContactSaved = (updated: Contact, parent?: Contact | null) => {
    setContacts((prev) => {
      const updatedWithInheritance = mergeInherited(
        updated,
        parent ?? (prev.find((c) => c.id === updated.parentContactId) || null)
      );
      let next = prev.map((c) => (c.id === updated.id ? updatedWithInheritance : c));
      if (parent) next = next.map((c) => (c.id === parent.id ? parent : c));
      if (updatedWithInheritance.parentContactId) {
        const parentObj = parent || next.find((c) => c.id === updatedWithInheritance.parentContactId) || null;
        if (parentObj) {
          next = next.map((c) =>
            c.parentContactId === updatedWithInheritance.parentContactId ? mergeInherited(c, parentObj) : c
          );
        }
      }
      return next;
    });

    setSelectedContact((sel) => {
      if (!sel) return sel;
      if (sel.id === updated.id)
        return mergeInherited(updated, parent || contacts.find((c) => c.id === updated.parentContactId) || null);
      if (parent && sel.id === parent.id) return parent;
      return sel;
    });
  };

  // ----------------------------------
  // Active filter chips (top-of-list)
  // ----------------------------------
  const activeChips = useMemo(() => {
    const f = serverFilters;
    const chips: { key: keyof AdvancedFilters; label: string; value?: any }[] = [];

    const add = (key: keyof AdvancedFilters, label: string, value?: any) => chips.push({ key, label, value });

    if (f.city) add('city', `City: ${f.city}`);
    if (f.state) add('state', `State: ${f.state}`);
    if (f.country) add('country', `Country: ${f.country}`);
    if (f.suburb) add('suburb', `Suburb: ${f.suburb}`);
    if (f.pincode) add('pincode', `Pincode: ${f.pincode}`);
    if (f.status) add('status', `Status: ${f.status}`);
    if (f.category) add('category', `Category ~ ${f.category}`);
    (f.categoryIn || []).forEach((c) => add('categoryIn', `Category: ${c}`, c));
    (f.tagsAny || []).forEach((t) => add('tagsAny', `Tag (any): ${t}`, t));
    (f.tagsAll || []).forEach((t) => add('tagsAll', `Tag (all): ${t}`, t));
    (f.phoneTypes || []).forEach((pt) => add('phoneTypes', `Phone: ${pt}`, pt));
    if (f.emailDomain) add('emailDomain', `Domain: @${f.emailDomain.replace(/^@/, '')}`);
    if (f.validPhonesOnly) add('validPhonesOnly', 'Valid phones only');
    if (f.validEmailsOnly) add('validEmailsOnly', 'Valid emails only');
    if (f.primaryPhoneOnly) add('primaryPhoneOnly', 'Primary phone only');

    const tri = (name: string, v?: boolean | null) => (v === true ? name : v === false ? `Not ${name}` : '');
    const t1 = tri('main', f.isMain);
    const t2 = tri('has parent', f.hasParent);
    const t3 = tri('has avatar', f.hasAvatar);
    const t4 = tri('has emails', f.hasEmails);
    const t5 = tri('has phones', f.hasPhones);
    [t1 && ['isMain', t1], t2 && ['hasParent', t2], t3 && ['hasAvatar', t3], t4 && ['hasEmails', t4], t5 && ['hasPhones', t5]]
      .filter(Boolean)
      .forEach(([k, label]) => add(k as keyof AdvancedFilters, label as string));

    const addrTri = (flag: keyof AdvancedFilters, label: string) => {
      if ((f as any)[flag]) add(flag, label);
    };
    addrTri('hasAddress', 'Has any address');
    addrTri('missingAddress', 'Missing all address');
    addrTri('missingCity', 'Missing city');
    addrTri('missingState', 'Missing state');
    addrTri('missingCountry', 'Missing country');
    addrTri('missingSuburb', 'Missing suburb');
    addrTri('missingPincode', 'Missing pincode');

    if (f.createdAfter) add('createdAfter', `Created ≥ ${f.createdAfter}`);
    if (f.createdBefore) add('createdBefore', `Created ≤ ${f.createdBefore}`);
    if (f.updatedAfter) add('updatedAfter', `Updated ≥ ${f.updatedAfter}`);
    if (f.updatedBefore) add('updatedBefore', `Updated ≤ ${f.updatedBefore}`);

    return chips;
  }, [serverFilters]);

  // ----------------------------------
  // Export handler (unchanged logic)
  // ----------------------------------
  const handleExport = async (format: 'csv' | 'xlsx') => {
    try {
      setExportLoadingBool(true);
      const payload = buildServerPayload(1);
      const res = await fetch('/api/contacts/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
        body: JSON.stringify({ ...payload, skipPagination: true }),
      });
      const data: ContactSearchResult = await res.json();
      const exportContacts = data.contacts;

      const rows = exportContacts.map((c) => {
        const row: Record<string, any> = {};
        for (const f of exportFields) {
          switch (f) {
            case 'phones':
              row.phones = (c.phones || []).map((p) => p.number).join('; ');
              break;
            case 'emails':
              row.emails = (c.emails || []).map((e) => e.address).join('; ');
              break;
            case 'tags':
              row.tags = (c.tags || []).join(', ');
              break;
            default:
              // @ts-expect-error dynamic
              row[f] = c[f];
          }
        }
        return row;
      });

      const XLSX = await import('xlsx');
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Contacts');
      const fileName = `contacts_export_${new Date().toISOString().slice(0, 10)}.${format}`;

      if (format === 'csv') {
        const csv = XLSX.utils.sheet_to_csv(ws);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        XLSX.writeFile(wb, fileName, { bookType: 'xlsx' });
      }
      setShowExport(false);
    } catch (e) {
      console.error('Export failed', e);
      setError('Export failed. Please try again.');
    } finally {
      setExportLoadingBool(false);
    }
  };

  // ----------------------------------
  // Render
  // ----------------------------------
  return (
    <div
      className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50"
      aria-busy={inflight > 0 || loading}
      aria-live="polite"
    >
      {inflight > 0 && (
        <div className="fixed inset-0 z-[55] pointer-events-none">
          <div className="absolute top-3 right-3 px-3 py-1.5 rounded-lg bg-white/80 backdrop-blur border text-sm text-gray-700 shadow">
            <Loader2 className="inline h-4 w-4 animate-spin mr-2" />
            Fetching latest data…
          </div>
        </div>
      )}

      {/* Stats */}
      {dbStats && (
        <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-4 sm:p-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
            <StatCard color="from-blue-50 to-blue-100" value={dbStats.mainContacts} label="Main Contacts" />
            <StatCard color="from-green-50 to-green-100" value={dbStats.relatedContacts} label="Related Contacts" />
            <StatCard color="from-purple-50 to-purple-100" value={dbStats.totalPhones} label="Phone Numbers" />
            <StatCard color="from-orange-50 to-orange-100" value={dbStats.totalEmails} label="Email Addresses" />
            <StatCard color="from-red-50 to-red-100" value={dbStats.duplicateGroups} label="Duplicate Groups" />
            <StatCard color="from-indigo-50 to-indigo-100" value={dbStats.recentImports} label="Recent Imports" />
          </div>
        </div>
      )}

      {/* Header */}
      <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-white/20 shadow-lg">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                <Database className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">Smart Contact Directory</h1>
                <p className="text-sm text-gray-500">Advanced contact management system</p>
              </div>
              {dbStats && (
                <div className="hidden md:flex items-center gap-4 text-sm text-gray-600">
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                    <span>Connected to MongoDB</span>
                  </div>
                  <div className="text-gray-400">•</div>
                  <span>{dbStats.totalContacts.toLocaleString()} total contacts</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setViewMode(viewMode === 'table' ? 'grid' : 'table')}
                className="p-2.5 text-gray-500 hover:text-gray-700 hover:bg-white/60 rounded-lg transition-all"
                title={`Switch to ${viewMode === 'table' ? 'grid' : 'table'} view`}
                disabled={exportLoadingBool}
              >
                {viewMode === 'table' ? <Grid3X3 className="h-5 w-5" /> : <List className="h-5 w-5" />}
              </button>

              <button
                onClick={handleRefresh}
                disabled={loading || exportLoadingBool}
                className="p-2.5 text-gray-500 hover:text-gray-700 hover:bg-white/60 rounded-lg transition-all disabled:opacity-50"
                title="Refresh data"
              >
                <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
              </button>

              <button
                onClick={() => setShowExport(true)}
                className="p-2.5 text-gray-500 hover:text-gray-700 hover:bg-white/60 rounded-lg transition-all"
                title="Export"
                disabled={exportLoadingBool}
              >
                <Download className="h-5 w-5" />
              </button>

              <label className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2.5 rounded-xl cursor-pointer hover:from-blue-700 hover:to-indigo-700 transition-all flex items-center shadow-lg disabled:opacity-50">
                <Upload className="h-4 w-4 mr-2" />
                Upload Excel
                <input type="file" accept=".xlsx,.xls" onChange={handleFileUpload} disabled={loading || exportLoadingBool} className="hidden" />
              </label>

              {uploadStatus === 'processing' && (
                <div className="flex items-center text-blue-600 bg-blue-50 px-3 py-2 rounded-lg">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span className="text-sm">Processing... {uploadProgress}%</span>
                </div>
              )}
              {uploadStatus === 'success' && (
                <div className="flex items-center text-green-600 bg-green-50 px-3 py-2 rounded-lg">
                  <CheckCircle className="h-4 w-4 mr-2" />
                  <span className="text-sm">Upload successful!</span>
                </div>
              )}
              {uploadStatus === 'error' && (
                <div className="flex items-center text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                  <AlertTriangle className="h-4 w-4 mr-2" />
                  <span className="text-sm">Upload failed</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="w-full bg-red-50 border-l-4 border-red-400 p-4">
          <div className="flex items-center">
            <AlertTriangle className="h-5 w-5 text-red-400 mr-3" />
            <p className="text-red-700">{error}</p>
            <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Search + Compact filter bar */}
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-4">
        <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-4 sm:p-6">
          <div className="flex flex-col lg:flex-row items-stretch gap-3">
            <div className="relative flex-1">
              <Search className="h-5 w-5 text-gray-400 absolute left-3 top-3.5" />
              <input
                type="text"
                placeholder="Search name, phone, email, location, tag..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-10 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white/80"
                aria-label="Search contacts"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-600"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <select
                value={selectedFilter}
                onChange={(e) => setSelectedFilter(e.target.value as any)}
                className={pill}
                title="Contact type"
              >
                <option value="all">All</option>
                <option value="main">Main</option>
                <option value="related">Related</option>
                <option value="duplicates">Duplicate Groups</option>
              </select>

              <button
                onClick={() => setFiltersOpen((s) => !s)}
                className={`${pill} ${filtersOpen || hasActiveFilters ? 'border-blue-200 bg-blue-50 text-blue-700' : ''}`}
                title="Advanced filters"
              >
                <Filter className="h-4 w-4" />
                Filters
                {optionsLoading && <Loader2 className="h-3.5 w-3.5 ml-2 animate-spin" />}
                {hasActiveFilters && (
                  <span className="ml-1 inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-600 text-white text-[10px]">
                    {activeChips.length}
                  </span>
                )}
              </button>

              {hasActiveFilters && (
                <button onClick={handleClearAllFilters} className={pill} title="Clear all filters">
                  <X className="h-4 w-4" />
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Quick toggles row */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {/* Has Phones */}
            <button
              className={`${toggleBtn} ${serverFilters.hasPhones === true ? 'border-blue-500 text-blue-700' : 'border-gray-200 text-gray-600'}`}
              onClick={() => setServerFilters((p) => ({ ...p, hasPhones: p.hasPhones === true ? null : true }))}
            >
              <Phone className="h-3.5 w-3.5" /> Has Phones
            </button>
            {/* Has Emails */}
            <button
              className={`${toggleBtn} ${serverFilters.hasEmails === true ? 'border-blue-500 text-blue-700' : 'border-gray-200 text-gray-600'}`}
              onClick={() => setServerFilters((p) => ({ ...p, hasEmails: p.hasEmails === true ? null : true }))}
            >
              <Mail className="h-3.5 w-3.5" /> Has Emails
            </button>
            {/* Missing Address */}
            <button
              className={`${toggleBtn} ${serverFilters.missingAddress ? 'border-rose-500 text-rose-700' : 'border-gray-200 text-gray-600'}`}
              onClick={() => setServerFilters((p) => ({ ...p, missingAddress: !p.missingAddress }))}
            >
              <AlertCircle className="h-3.5 w-3.5" /> Missing Address
            </button>
            {/* Validations */}
            <button
              className={`${toggleBtn} ${serverFilters.validPhonesOnly ? 'border-emerald-500 text-emerald-700' : 'border-gray-200 text-gray-600'}`}
              onClick={() => setServerFilters((p) => ({ ...p, validPhonesOnly: !p.validPhonesOnly }))}
            >
              <Check className="h-3.5 w-3.5" /> Valid Phones
            </button>
            <button
              className={`${toggleBtn} ${serverFilters.validEmailsOnly ? 'border-emerald-500 text-emerald-700' : 'border-gray-200 text-gray-600'}`}
              onClick={() => setServerFilters((p) => ({ ...p, validEmailsOnly: !p.validEmailsOnly }))}
            >
              <Check className="h-3.5 w-3.5" /> Valid Emails
            </button>
          </div>

          {/* Active chips */}
          {activeChips.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {activeChips.map(({ key, label, value }, i) => (
                <span key={`${String(key)}-${label}-${i}`} className={chip}>
                  {label}
                  <button
                    className="ml-1 text-gray-500 hover:text-gray-700"
                    onClick={() => removeFilterChip(key, value)}
                    aria-label={`Remove ${label}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Advanced drawer */}
          {filtersOpen && (
            <div className="mt-6 border-t border-gray-100 pt-5">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                {/* Location */}
                <div className="bg-white/70 border rounded-xl p-4">
                  <div className={sectionTitle}>Location</div>
                  <div className="space-y-2">
                    <Select label="Country" value={draftFilters.country || ''} onChange={(v) => updateDraft('country', v || undefined)} options={uniqueValues.countries} />
                    <Select label="State" value={draftFilters.state || ''} onChange={(v) => updateDraft('state', v || undefined)} options={uniqueValues.states} />
                    <Select label="City" value={draftFilters.city || ''} onChange={(v) => updateDraft('city', v || undefined)} options={uniqueValues.cities} />
                    <Select label="Suburb" value={draftFilters.suburb || ''} onChange={(v) => updateDraft('suburb', v || undefined)} options={uniqueValues.suburbs} />
                    <Select label="Pincode" value={draftFilters.pincode || ''} onChange={(v) => updateDraft('pincode', v || undefined)} options={uniqueValues.pincodes} />
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <Tri label="Has Address" value={draftFilters.hasAddress ?? null} onChange={(v) => updateDraft('hasAddress', v as any)} />
                    <Toggle label="Missing All" checked={!!draftFilters.missingAddress} onChange={(v) => updateDraft('missingAddress', v)} />
                    <Toggle label="Missing City" checked={!!draftFilters.missingCity} onChange={(v) => updateDraft('missingCity', v)} />
                    <Toggle label="Missing State" checked={!!draftFilters.missingState} onChange={(v) => updateDraft('missingState', v)} />
                    <Toggle label="Missing Country" checked={!!draftFilters.missingCountry} onChange={(v) => updateDraft('missingCountry', v)} />
                    <Toggle label="Missing Suburb" checked={!!draftFilters.missingSuburb} onChange={(v) => updateDraft('missingSuburb', v)} />
                    <Toggle label="Missing Pincode" checked={!!draftFilters.missingPincode} onChange={(v) => updateDraft('missingPincode', v)} />
                  </div>
                </div>

                {/* Identity / Meta */}
                {/* (kept commented as in your code) */}

                {/* Validation & Communication */}
                <div className="bg-white/70 border rounded-xl p-4">
                  <div className={sectionTitle}>Communication & Validation</div>
                  <div className="grid grid-cols-2 gap-2">
                    <Tri label="Has Emails" value={draftFilters.hasEmails ?? null} onChange={(v) => updateDraft('hasEmails', v as any)} />
                    <Tri label="Has Phones" value={draftFilters.hasPhones ?? null} onChange={(v) => updateDraft('hasPhones', v as any)} />
                    <Toggle label="Valid Phones Only" checked={!!draftFilters.validPhonesOnly} onChange={(v) => updateDraft('validPhonesOnly', v)} />
                    <Toggle label="Valid Emails Only" checked={!!draftFilters.validEmailsOnly} onChange={(v) => updateDraft('validEmailsOnly', v)} />
                    <Toggle label="Primary Phone Only" checked={!!draftFilters.primaryPhoneOnly} onChange={(v) => updateDraft('primaryPhoneOnly', v)} />
                  </div>

                  <div className="mt-3">
                    <MultiSelect
                      label="Phone Types"
                      options={PHONE_TYPES}
                      selected={draftFilters.phoneTypes || []}
                      onChange={(vals) => updateDraft('phoneTypes', vals.length ? (vals as PhoneType[]) : undefined)}
                    />
                    <Input label="Email Domain" value={draftFilters.emailDomain || ''} onChange={(v) => updateDraft('emailDomain', v || undefined)} placeholder="e.g. gmail.com" />
                  </div>
                </div>

                {/* Tags & Dates */}
                {/* (kept commented as in your code) */}
              </div>

              <div className="mt-5 flex items-center justify-between">
                <div className="text-xs text-gray-500 flex items-center gap-2">
                  <Settings2 className="h-4 w-4" />
                  Changes won’t apply until you click <b>Apply</b>.
                </div>
                <div className="flex items-center gap-2">
                  <button className="px-4 py-2 rounded-lg border bg-white hover:bg-gray-50 text-sm" onClick={() => setFiltersOpen(false)}>
                    Close
                  </button>
                  <button className="px-4 py-2 rounded-lg border text-sm" onClick={() => setDraftFilters({})}>
                    Reset
                  </button>
                  <button className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm" onClick={handleApplyFilters}>
                    Apply
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* List */}
        {loading ? (
          viewMode === 'table'
            ? <TableSkeleton rows={itemsPerPage} />
            : <GridSkeleton cards={Math.min(itemsPerPage, 10)} />
        ) : viewMode === 'table' ? (
          <div className="w-[96vw] max-w-full space-y-3">
            {contacts.map((contact) => (
              <ContactCard
                key={contact.id}
                contact={contact}
                onSelect={() => setSelectedContact(contact)}
                onDelete={() => handleDeleteContact(contact.id)}
                isSelected={selectedContact?.id === contact.id}
                showValidation
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
            {contacts.map((contact) => (
              <div
                key={contact.id}
                onClick={() => setSelectedContact(contact)}
                className="bg-white/70 backdrop-blur-sm border border-white/20 rounded-xl p-6 hover:shadow-xl hover:border-white/40 cursor-pointer transition-all duration-300 transform hover:-translate-y-1"
              >
                <div className="text-center">
                  <div
                    className={`w-16 h-16 rounded-full flex items-center justify-center text-white text-lg font-medium mb-4 ${
                      contact.isMainContact ? 'bg-gradient-to-r from-blue-500 to-blue-600' : 'bg-gradient-to-r from-green-500 to-green-600'
                    }`}
                  >
                    <div className="relative">
                      <ContactAvatar contact={contact} size={72} />
                      <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center ${
                      contact.isMainContact 
                      ? 'bg-blue-500 text-white' 
                      : 'bg-green-500 text-white'
                      }`}>
                      {contact.isMainContact ? <User className="h-3 w-3" /> : <Users className="h-3 w-3" />}
                      </div>
                    </div>
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900 mb-1 truncate">{contact.name}</h3>
                  
                  {contact.phones.length > 0 && (
                    <div className="text-xs text-gray-500 mb-1 font-mono">{contact.phones[0].number}</div>
                  )}
                  {contact.emails.length > 0 && (
                    <div className="text-xs text-gray-500 truncate">{contact.emails[0].address}</div>
                  )}
                  {expandAbbreviationList(contact.category).map((cat, index) => (
                    <span key={index} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 border border-indigo-200">
                    {cat.trim()}
                    </span>
                  ))}
                  <div className="mt-3 flex justify-center space-x-2">
                    <div className="flex items-center text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                      <Phone className="h-3 w-3 mr-1" />
                      {contact.phones.length}
                    </div>
                    <div className="flex items-center text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                      <Mail className="h-3 w-3 mr-1" />
                      {contact.emails.length}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-4 sm:p-6">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={currentPage === 1 || loading || exportLoadingBool}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white/80 hover:bg-gray-50 disabled:opacity-50"
                >
                  First
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1 || loading || exportLoadingBool}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white/80 hover:bg-gray-50 disabled:opacity-50"
                >
                  <ChevronDown className="w-4 h-4 mr-1 rotate-90" />
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages || loading || exportLoadingBool}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white/80 hover:bg-gray-50 disabled:opacity-50"
                >
                  Next
                  <ChevronDown className="w-4 h-4 ml-1 -rotate-90" />
                </button>
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={currentPage === totalPages || loading || exportLoadingBool}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white/80 hover:bg-gray-50 disabled:opacity-50"
                >
                  Last
                </button>
              </div>

              <div className="flex flex-col sm:flex-row items-center gap-4">
                <span className="flex items-center gap-1 text-sm text-gray-700 font-medium">
                  Showing {totalContacts > 0 ? ((currentPage - 1) * itemsPerPage + 1).toLocaleString() : 0} -{' '}
                  {Math.min(currentPage * itemsPerPage, totalContacts).toLocaleString()} of{' '}
                  {totalContacts.toLocaleString()} contacts
                </span>
                <div className="flex items-center gap-2 text-sm text-gray-700">
                  <span>Page</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      value={pageInput}
                      onChange={(e) => {
                        // allow empty while typing; strip non-digits
                        const v = e.target.value.replace(/[^\d]/g, '');
                        setPageInput(v);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitPage();
                      }}
                      onBlur={commitPage}
                      className="w-16 px-2 py-1 text-center border border-gray-300 rounded-lg bg-white/80 focus:ring-2 focus:ring-blue-500 focus:border-transparent font-bold"
                      aria-label="Go to page"
                    />
                    <button
                      onClick={commitPage}
                      className="px-3 py-1.5 rounded-lg border text-sm bg-white hover:bg-gray-50 disabled:opacity-50"
                      disabled={loading || totalPages <= 1}
                    >
                      Go
                    </button>
                  </div>
                  <span>of</span>
                  <span className="inline-flex items-center px-3 py-1 rounded-lg bg-gray-100 text-gray-800 font-bold">
                    {totalPages}
                  </span>
                </div>
                <select
                  value={itemsPerPage}
                  onChange={(e) => {
                    setItemsPerPage(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white/80 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={loading || exportLoadingBool}
                >
                  {[10, 20, 50, 100].map((size) => (
                    <option key={size} value={size}>
                      Show {size}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && contacts.length === 0 && (
          <div className="text-center py-16">
            <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-12">
              <div className="w-24 h-24 bg-gradient-to-r from-blue-100 to-indigo-100 rounded-full flex items-center justify-center mb-6">
                <Users className="h-12 w-12 text-blue-600" />
              </div>
              <h3 className="text-xl font-semibold text-gray-900 mb-3">
                {debouncedSearchTerm || hasActiveFilters ? 'No contacts found' : 'No contacts yet'}
              </h3>
              <p className="text-gray-600 mb-8 leading-relaxed">
                {debouncedSearchTerm || hasActiveFilters
                  ? "Try adjusting your search or filters. You can also clear everything below."
                  : 'Get started by uploading an Excel file to import your contacts into the system.'}
              </p>

              {debouncedSearchTerm || hasActiveFilters ? (
                <div className="flex flex-col sm:flex-row justify-center gap-3">
                  <button onClick={() => setSearchTerm('')} className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                    Clear Search
                  </button>
                  {hasActiveFilters && (
                    <button
                      onClick={handleClearAllFilters}
                      className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                    >
                      Clear Filters
                    </button>
                  )}
                </div>
              ) : (
                <label className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg cursor-pointer hover:from-blue-700 hover:to-indigo-700 transition-all font-medium shadow-lg">
                  <Upload className="h-5 w-5 mr-2" />
                  Upload Your First File
                  <input type="file" accept=".xlsx,.xls" onChange={handleFileUpload} disabled={loading || exportLoadingBool} className="hidden" />
                </label>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Contact Modal */}
      {selectedContact && (
        <ContactDetailModal
          contact={selectedContact}
          onClose={() => setSelectedContact(null)}
          allContacts={contacts}
          onContactSaved={handleContactSaved}
        />
      )}

      {/* Export Dialog */}
      {showExport && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Export Contacts</h3>
              <button onClick={() => setShowExport(false)} className="p-2 rounded hover:bg-gray-100" disabled={exportLoadingBool}>
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-sm text-gray-600 mb-4">Choose the fields to include:</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
              {[
                'name',
                'status',
                'isMainContact',
                'parentContactId',
                'address',
                'suburb',
                'city',
                'pincode',
                'state',
                'country',
                'category',
                'phones',
                'emails',
                'tags',
                'notes',
              ].map((f) => (
                <label key={f} className="inline-flex items-center space-x-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={exportFields.includes(f)}
                    onChange={(e) => {
                      setExportFields((prev) => (e.target.checked ? [...prev, f] : prev.filter((x) => x !== f)));
                    }}
                    disabled={exportLoadingBool}
                  />
                  <span className="text-sm capitalize">{f}</span>
                </label>
              ))}
            </div>

            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setShowExport(false)} className="px-4 py-2 rounded border" disabled={exportLoadingBool}>
                Cancel
              </button>
              <button onClick={() => handleExport('csv')} className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 flex items-center" disabled={exportLoadingBool}>
                {exportLoadingBool && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Export CSV
              </button>
              <button onClick={() => handleExport('xlsx')} className="px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700 flex items-center" disabled={exportLoadingBool}>
                {exportLoadingBool && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Export XLSX
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// --------------------------
// Small UI atoms
// --------------------------
function StatCard({ color, value, label }: { color: string; value: number; label: string }) {
  return (
    <div className={`bg-gradient-to-br ${color} p-4 rounded-xl text-center`}>
      <div className="text-2xl font-bold text-gray-800">{value.toLocaleString()}</div>
      <div className="text-sm text-gray-700 font-medium">{label}</div>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <div className="text-[12px] font-medium text-gray-700 mb-1">{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white/80"
      />
    </label>
  );
}

function DateInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <div className="text-[12px] font-medium text-gray-700 mb-1 flex items-center gap-1">
        <Calendar className="h-3.5 w-3.5" />
        {label}
      </div>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white/80"
      />
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  allowFree = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  allowFree?: boolean;
}) {
  return (
    <label className="block">
      <div className="text-[12px] font-medium text-gray-700 mb-1">{label}</div>
      <div className="flex gap-2">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white/80"
        >
          <option value="">Any</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        {allowFree && (
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Custom…"
            className="w-32 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white/80"
          />
        )}
      </div>
    </label>
  );
}

function MultiSelect({
  label,
  options,
  selected,
  onChange,
  allowFree = false,
}: {
  label: string;
  options: string[];
  selected: string[];
  onChange: (vals: string[]) => void;
  allowFree?: boolean;
}) {
  const [input, setInput] = useState('');
  const normOptions = useMemo(() => normalizeList(options), [options]);

  const toggle = (val: string) => {
    const exists = selected.includes(val);
    const next = exists ? selected.filter((v) => v !== val) : [...selected, val];
    onChange(next);
  };

  return (
    <div>
      <div className="text-[12px] font-medium text-gray-700 mb-1">{label}</div>
      <div className="flex flex-wrap gap-2 mb-2">
        {selected.map((tag) => (
          <span key={tag} className={chip}>
            <Tag className="h-3 w-3" />
            {tag}
            <button className="ml-1 text-gray-500 hover:text-gray-700" onClick={() => toggle(tag)}>
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <select
          className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white/80"
          value=""
          onChange={(e) => {
            if (!e.target.value) return;
            toggle(e.target.value);
          }}
        >
          <option value="">Add…</option>
          {normOptions
            .filter((o) => !selected.includes(o))
            .map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
        </select>
        {allowFree && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const v = input.trim();
              if (!v) return;
              toggle(v);
              setInput('');
            }}
            className="flex gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Add custom…"
              className="w-36 px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white/80"
            />
            <button className="px-3 py-2 rounded-lg border bg-white hover:bg-gray-50 text-sm" type="submit">
              Add
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-xs text-gray-700">
      <input
        type="checkbox"
        className="h-4 w-4 rounded border-gray-300"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      {label}
    </label>
  );
}

function Tri({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean | null) => void;
}) {
  // Value cycles: null -> true -> false -> null
  const cycle = () => {
    if (value === null) onChange(true);
    else if (value === true) onChange(false);
    else onChange(null);
  };
  const badge =
    value === null ? 'bg-gray-100 text-gray-700' : value ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700';
  const text = value === null ? 'Any' : value ? 'Yes' : 'No';

  return (
    <button type="button" onClick={cycle} className="w-full flex items-center justify-between border rounded-lg px-3 py-2 text-xs">
      <span className="text-gray-700">{label}</span>
      <span className={`px-2 py-0.5 rounded-full ${badge}`}>{text}</span>
    </button>
  );
}

function Shimmer() {
  return (
    <div className="relative overflow-hidden bg-slate-200/70 rounded-lg">
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.4s_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent" />
      <style jsx>{`
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
      `}</style>
      <div className="opacity-0">.</div>
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="bg-white/70 border border-white/30 rounded-xl p-4 flex items-center gap-4">
      <div className="w-12 h-12 rounded-lg overflow-hidden"><Shimmer /></div>
      <div className="flex-1 space-y-2">
        <div className="h-4 rounded w-1/3 overflow-hidden"><Shimmer /></div>
        <div className="h-3 rounded w-1/2 overflow-hidden"><Shimmer /></div>
      </div>
      <div className="hidden sm:block w-24 h-6 rounded overflow-hidden"><Shimmer /></div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white/70 border border-white/30 rounded-xl p-6">
      <div className="w-16 h-16 mx-auto rounded-full overflow-hidden mb-4"><Shimmer /></div>
      <div className="h-4 w-2/3 mx-auto rounded overflow-hidden mb-2"><Shimmer /></div>
      <div className="h-3 w-3/4 mx-auto rounded overflow-hidden mb-2"><Shimmer /></div>
      <div className="h-3 w-1/2 mx-auto rounded overflow-hidden"></div>
    </div>
  );
}

function SkeletonList({ mode, count }: { mode: 'table' | 'grid'; count: number }) {
  if (mode === 'table') {
    return (
      <div className="w-[96vw] max-w-full space-y-3">
        {Array.from({ length: count }).map((_, i) => <SkeletonRow key={i} />)}
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
      {Array.from({ length: Math.min(count, 10) }).map((_, i) => <SkeletonCard key={i} />)}
    </div>
  );
}

function PulseBar({ w = 'w-full', h = 'h-4' }: { w?: string; h?: string }) {
  return <div className={`rounded ${w} ${h} bg-slate-200/70 animate-pulse`} />;
}

function TableSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="w-[96vw] max-w-full space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="bg-white/70 border border-white/30 rounded-xl p-4 flex items-center gap-4">
          <div className="w-12 h-12 rounded-lg overflow-hidden"><PulseBar w="w-full" h="h-full" /></div>
          <div className="flex-1 space-y-2">
            <PulseBar w="w-1/3" />
            <PulseBar w="w-1/2" h="h-3" />
          </div>
          <div className="hidden sm:block w-24 h-6 rounded overflow-hidden"><PulseBar w="w-full" h="h-full" /></div>
        </div>
      ))}
    </div>
  );
}

function GridSkeleton({ cards = 8 }: { cards?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="bg-white/70 border border-white/30 rounded-xl p-6 space-y-3">
          <div className="w-16 h-16 mx-auto rounded-full overflow-hidden"><PulseBar w="w-full" h="h-full" /></div>
          <PulseBar w="w-2/3 mx-auto" />
          <PulseBar w="w-3/4 mx-auto" h="h-3" />
          <PulseBar w="w-1/2 mx-auto" h="h-3" />
        </div>
      ))}
    </div>
  );
}

export default ContactDirectoryApp;
