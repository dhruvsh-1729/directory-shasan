// components/ContactDirectoryApp.tsx
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Search, 
  Filter, 
  Users, 
  Phone, 
  Mail, 
  MapPin, 
  Building, 
  User, 
  ChevronDown, 
  ChevronUp, 
  Eye, 
  Edit3, 
  Trash2, 
  UserPlus, 
  Copy, 
  Download, 
  Upload, 
  AlertCircle, 
  Check,
  RefreshCw,
  Database,
  X,
  Calendar,
  Tag,
  Grid3X3,
  List,
  MoreVertical,
  AlertTriangle,
  CheckCircle,
  Loader2,
  FileText,
  TrendingUp
} from 'lucide-react';
import ContactCard from './ContactCard';
import ContactDetailModal from './ContactDetailModal';
import { ContactExtractor } from '@/utils/main';
import { Contact } from '@/types';

interface AdvancedFilters {
  city?: string;
  state?: string;
  category?: string;
  hasEmails?: boolean;
  hasPhones?: boolean;
  createdAfter?: string;
  createdBefore?: string;
}

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
  locationCounts: Record<string, number>;
}

const ContactDirectoryApp: React.FC = () => {
  // State management
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'main' | 'related' | 'duplicates'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalContacts, setTotalContacts] = useState(0);
  const [dbStats, setDbStats] = useState<DatabaseStats | null>(null);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [advancedFilters, setAdvancedFilters] = useState<AdvancedFilters>({});
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [error, setError] = useState<string>('');
  const [showExport, setShowExport] = useState(false);
  const [exportFields, setExportFields] = useState<string[]>([
    'name','status','isMainContact','parentContactId',
    'address','suburb','city','pincode','state','country',
    'category','phones','emails','tags','notes'
  ]);
  const [exportLoading, setExportLoading] = useState(false);

  // Debounced search
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Load contacts with enhanced error handling and caching
  const loadContacts = useCallback(async (useCache = true) => {
    setLoading(true);
    setError('');
    
    try {
      const filters = {
        search: debouncedSearchTerm || undefined,
        filter: selectedFilter,
        ...advancedFilters,
        createdAfter: advancedFilters.createdAfter ? new Date(advancedFilters.createdAfter) : undefined,
        createdBefore: advancedFilters.createdBefore ? new Date(advancedFilters.createdBefore) : undefined
      };

      // Remove undefined values
      Object.keys(filters).forEach(key => {
        if (filters[key as keyof typeof filters] === undefined) {
          delete filters[key as keyof typeof filters];
        }
      });

      const response = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': useCache ? 'max-age=300' : 'no-cache'
        },
        body: JSON.stringify({
          ...filters,
          page: currentPage,
          limit: itemsPerPage
        })
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data: ContactSearchResult = await response.json();
      
      // Enhanced contact data with parent contact address resolution
      const enhancedContacts = await Promise.all(
        data.contacts.map(async (contact) => {
          if (contact.parentContactId && !contact.isMainContact) {
            try {
              const parentResponse = await fetch(`/api/contacts/${contact.parentContactId}`);
              if (parentResponse.ok) {
                const parentData = await parentResponse.json();
                const parentContact = parentData.contact;
                
                // Inherit address information from parent if missing
                return {
                  ...contact,
                  address: contact.address || parentContact?.address,
                  city: contact.city || parentContact?.city,
                  state: contact.state || parentContact?.state,
                  country: contact.country || parentContact?.country,
                  pincode: contact.pincode || parentContact?.pincode,
                  suburb: contact.suburb || parentContact?.suburb,
                  parentContactInfo: parentContact
                };
              }
            } catch (err) {
              console.warn('Failed to fetch parent contact data:', err);
            }
          }
          return contact;
        })
      );
      
      setContacts(enhancedContacts);
      setTotalPages(data.totalPages);
      setTotalContacts(data.total);
      
    } catch (error) {
      console.error('Error loading contacts:', error);
      setError('Failed to load contacts. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [currentPage, itemsPerPage, debouncedSearchTerm, selectedFilter, advancedFilters]);

  // Load database stats
  const loadDatabaseStats = useCallback(async () => {
    try {
      const response = await fetch('/api/stats');
      if (response.ok) {
        const stats = await response.json();
        setDbStats(stats);
      }
    } catch (error) {
      console.warn('Failed to load database stats:', error);
    }
  }, []);

  // Load data on mount and when dependencies change
  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  useEffect(() => {
    loadDatabaseStats();
  }, [loadDatabaseStats]);

  // Reset to first page when filters change
  useEffect(() => {
    if (currentPage !== 1) {
      setCurrentPage(1);
    }
  }, [debouncedSearchTerm, selectedFilter, advancedFilters]);

  // File upload handler with better progress tracking
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setUploadStatus('processing');
    setUploadProgress(0);
    setError('');
    
    try {
      const processedContacts = await processContactFile(file);
      
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      const response = await fetch('/api/contacts/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contacts: processedContacts,
          fileName: file.name,
          fileSize: file.size
        })
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      const result = await response.json();
      
      if (result.success) {
        setUploadStatus('success');
        await loadContacts(false);
        await loadDatabaseStats();
        event.target.value = '';
        console.log(`Successfully imported ${result.statistics.totalContacts} contacts`);
      } else {
        setUploadStatus('error');
        setError('Import failed: ' + (result.error || 'Unknown error'));
        console.error('Import errors:', result.errors);
      }
      
    } catch (error) {
      console.error('Error processing file:', error);
      setUploadStatus('error');
      setError('Failed to process file: ' + (error instanceof Error ? error.message : 'Unknown error'));
    } finally {
      setLoading(false);
      setTimeout(() => {
        setUploadStatus('idle');
        setUploadProgress(0);
      }, 3000);
    }
  };

  // Process contact file (enhanced version)
  const processContactFile = async (file: File): Promise<Contact[]> => {
    const arrayBuffer = await file.arrayBuffer();
    const XLSX = await import('xlsx');
    
    const workbook = XLSX.read(arrayBuffer, {
      cellStyles: true,
      cellFormula: true,
      cellDates: true,
      cellNF: true,
      sheetStubs: true
    });
    
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    if (jsonData.length === 0) {
      throw new Error('Excel file is empty');
    }
    
    const dataRows = jsonData.slice(1).filter(row => row && (row as any[]).length > 0 && (row as any[])[1]);
    
    const columnMap = {
      srNo: 0, name: 1, status: 2, address: 3, suburb: 4, city: 5, pincode: 6,
      state: 7, country: 8, mobile1: 9, mobile2: 10, mobile3: 11, mobile4: 12,
      office: 13, residence: 14, emails: 15, category: 16, officeAddress: 17, address2: 18
    };

    const allProcessedContacts: Contact[] = [];
    
    dataRows.forEach((row, index) => {
      const rowData = row as any[];
      
      if (!rowData[columnMap.name] || String(rowData[columnMap.name]).trim() === '') {
        return;
      }
      
      try {
        const phoneFields: (string | number)[] = [];
        [columnMap.mobile1, columnMap.mobile2, columnMap.mobile3, columnMap.mobile4].forEach(colIndex => {
          const phoneValue = rowData[colIndex];
          if (phoneValue && String(phoneValue).trim() !== '' && String(phoneValue).trim() !== '-') {
            phoneFields.push(phoneValue);
          }
        });
        
        if (rowData[columnMap.office] && String(rowData[columnMap.office]).trim() !== '' && String(rowData[columnMap.office]).trim() !== '-') {
          phoneFields.push(rowData[columnMap.office]);
        }
        
        if (rowData[columnMap.residence] && String(rowData[columnMap.residence]).trim() !== '' && String(rowData[columnMap.residence]).trim() !== '-') {
          phoneFields.push(rowData[columnMap.residence]);
        }

        const recordContacts = ContactExtractor.processRecord({
          name: String(rowData[columnMap.name]).trim(),
          phoneFields,
          emailField: rowData[columnMap.emails] ? String(rowData[columnMap.emails]).trim() : '',
          city: rowData[columnMap.city] ? String(rowData[columnMap.city]).trim() : undefined,
          state: rowData[columnMap.state] ? String(rowData[columnMap.state]).trim() : undefined,
          country: rowData[columnMap.country] ? String(rowData[columnMap.country]).trim() : undefined,
          srNo: rowData[columnMap.srNo] || index + 1,
          status: rowData[columnMap.status] ? String(rowData[columnMap.status]).trim() : undefined,
          address: rowData[columnMap.address] ? String(rowData[columnMap.address]).trim() : undefined,
          suburb: rowData[columnMap.suburb] ? String(rowData[columnMap.suburb]).trim() : undefined,
          pincode: rowData[columnMap.pincode],
          category: rowData[columnMap.category] ? String(rowData[columnMap.category]).trim() : undefined,
          officeAddress: rowData[columnMap.officeAddress] ? String(rowData[columnMap.officeAddress]).trim() : undefined,
          address2: rowData[columnMap.address2] ? String(rowData[columnMap.address2]).trim() : undefined
        });

        if (recordContacts.length > 0) {
          const mainContact = recordContacts.find(c => c.isMainContact);
          if (mainContact) {
            mainContact.id = `contact_${rowData[columnMap.srNo] || index + 1}_${index}`;
            mainContact.status = rowData[columnMap.status] ? String(rowData[columnMap.status]).trim() : undefined;
            mainContact.address = rowData[columnMap.address] ? String(rowData[columnMap.address]).trim() : undefined;
            mainContact.suburb = rowData[columnMap.suburb] ? String(rowData[columnMap.suburb]).trim() : undefined;
            mainContact.pincode = rowData[columnMap.pincode];
            mainContact.category = rowData[columnMap.category] ? String(rowData[columnMap.category]).trim() : undefined;
            mainContact.officeAddress = rowData[columnMap.officeAddress] ? String(rowData[columnMap.officeAddress]).trim() : undefined;
            mainContact.address2 = rowData[columnMap.address2] ? String(rowData[columnMap.address2]).trim() : undefined;
            
            const relatedContacts = recordContacts.filter(c => !c.isMainContact);
            mainContact.relationships = relatedContacts.flatMap(rc => rc.relationships || []);
          }
        }
        
        allProcessedContacts.push(...recordContacts);
        
      } catch (error) {
        console.error(`Error processing row ${index + 1}:`, error);
      }
    });
    
    const contactsWithDuplicates = ContactExtractor.detectDuplicates(allProcessedContacts);
    return contactsWithDuplicates;
  };

  const handleRefresh = async () => {
    await loadContacts(false);
    await loadDatabaseStats();
  };

  const handleDeleteContact = async (contactId: string) => {
    if (!confirm('Are you sure you want to delete this contact?')) return;
    
    try {
      const response = await fetch(`/api/contacts/${contactId}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        await loadContacts(false);
        await loadDatabaseStats();
        setSelectedContact(null);
      } else {
        throw new Error('Failed to delete contact');
      }
    } catch (error) {
      console.error('Error deleting contact:', error);
      setError('Failed to delete contact');
    }
  };

  // Advanced filter handlers
  const handleAdvancedFilterChange = (key: keyof AdvancedFilters, value: any) => {
    setAdvancedFilters(prev => ({
      ...prev,
      [key]: value
    }));
  };

  const clearAdvancedFilters = () => {
    setAdvancedFilters({});
  };

  const hasActiveAdvancedFilters = Object.values(advancedFilters).some(v => v !== undefined && v !== '');

  // Get unique values for filter dropdowns
  const uniqueValues = useMemo(() => {
    if (!dbStats) return { cities: [], states: [], categories: [] };
    
    return {
      cities: Object.keys(dbStats.locationCounts)
        .map(loc => loc.split(', ')[0])
        .filter(Boolean)
        .sort(),
      states: Array.from(new Set(
        Object.keys(dbStats.locationCounts)
          .map(loc => loc.split(', ')[1])
          .filter(Boolean)
      )).sort(),
      categories: Object.keys(dbStats.categoryCounts).sort()
    };
  }, [dbStats]);

  const handleExport = async (format: 'csv' | 'xlsx') => {
    try {
      setExportLoading(true);
      // Fetch all contacts without pagination
      const filters = {
        search: debouncedSearchTerm || undefined,
        filter: selectedFilter,
        ...advancedFilters,
        createdAfter: advancedFilters.createdAfter ? new Date(advancedFilters.createdAfter) : undefined,
        createdBefore: advancedFilters.createdBefore ? new Date(advancedFilters.createdBefore) : undefined
      };
      Object.keys(filters).forEach(key => {
        if (filters[key as keyof typeof filters] === undefined) {
          delete filters[key as keyof typeof filters];
        }
      });

      const response = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache'
        },
        body: JSON.stringify({
          ...filters,
          skipPagination: true
        })
      });

      // if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const data: ContactSearchResult = await response.json();
      const exportContacts = data.contacts;

      const rows = exportContacts.map(c => {
        const row: Record<string, any> = {};
        for (const f of exportFields) {
          switch (f) {
            case 'phones':
              row.phones = (c.phones || []).map(p => p.number).join('; ');
              break;
            case 'emails':
              row.emails = (c.emails || []).map(e => e.address).join('; ');
              break;
            case 'tags':
              row.tags = (c.tags || []).join(', ');
              break;
            default:
              // @ts-expect-error – dynamic pickup
              row[f] = c[f];
          }
        }
        return row;
      });

      const XLSX = await import('xlsx');
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Contacts');

      const fileName = `contacts_export_${new Date().toISOString().slice(0,10)}.${format}`;
      if (format === 'csv') {
        const csv = XLSX.utils.sheet_to_csv(ws);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = fileName; a.click();
        URL.revokeObjectURL(url);
      } else {
        XLSX.writeFile(wb, fileName, { bookType: 'xlsx' });
      }
      setShowExport(false);
    } catch (e) {
      console.error('Export failed', e);
      setError('Export failed. Please try again.');
    } finally {
      setExportLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      {/* Enhanced Header with glassmorphism */}
      <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-xl border-b border-white/20 shadow-lg">
      <div className="w-full px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
            <Database className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Smart Contact Directory</h1>
            <p className="text-sm text-gray-500">Advanced contact management system</p>
          </div>
          </div>
          {dbStats && (
          <div className="hidden md:flex items-center space-x-4 text-sm text-gray-600">
            <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
            <span>Connected to MongoDB</span>
            </div>
            <div className="text-gray-400">•</div>
            <span>{dbStats.totalContacts.toLocaleString()} total contacts</span>
          </div>
          )}
        </div>
        
        <div className="flex items-center space-x-3">
          <button
          onClick={() => setViewMode(viewMode === 'table' ? 'grid' : 'table')}
          className="p-2.5 text-gray-500 hover:text-gray-700 hover:bg-white/60 rounded-lg transition-all duration-200"
          title={`Switch to ${viewMode === 'table' ? 'grid' : 'table'} view`}
          disabled={exportLoading}
          >
          {viewMode === 'table' ? <Grid3X3 className="h-5 w-5" /> : <List className="h-5 w-5" />}
          </button>
          
          <button
          onClick={handleRefresh}
          disabled={loading || exportLoading}
          className="p-2.5 text-gray-500 hover:text-gray-700 hover:bg-white/60 rounded-lg transition-all duration-200 disabled:opacity-50"
          title="Refresh data"
          >
          <RefreshCw className={`h-5 w-5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
          onClick={() => setShowExport(true)}
          className="p-2.5 text-gray-500 hover:text-gray-700 hover:bg-white/60 rounded-lg transition-all duration-200"
          title="Export"
          disabled={exportLoading}
          >
          <Download className="h-5 w-5" />
          </button>
          
          <label className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2.5 rounded-xl cursor-pointer hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 flex items-center shadow-lg disabled:opacity-50">
          <Upload className="h-4 w-4 mr-2" />
          Upload Excel
          <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileUpload}
            disabled={loading || exportLoading}
            className="hidden"
          />
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
        <button
          onClick={() => setError('')}
          className="ml-auto text-red-400 hover:text-red-600"
        >
          <X className="h-4 w-4" />
        </button>
        </div>
      </div>
      )}

      <div className="w-full px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Enhanced Search and Filters Card */}
      <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-6">
        <div className="space-y-4">
        {/* Main search and filter row */}
        <div className="flex flex-col lg:flex-row gap-4 items-center">
          <div className="relative flex-1 w-full lg:w-auto">
          <Search className="h-5 w-5 text-gray-400 absolute left-4 top-3.5" />
          <input
            type="text"
            placeholder="Search contacts, phones, emails, locations..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white/80 backdrop-blur-sm transition-all duration-200"
            disabled={exportLoading}
          />
          {searchTerm && (
            <button
            onClick={() => setSearchTerm('')}
            className="absolute right-3 top-3.5 text-gray-400 hover:text-gray-600"
            disabled={exportLoading}
            >
            <X className="h-4 w-4" />
            </button>
          )}
          </div>
          
          <select
          value={selectedFilter}
          onChange={(e) => setSelectedFilter(e.target.value as any)}
          className="px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white/80 backdrop-blur-sm"
          disabled={exportLoading}
          >
          <option value="all">All Contacts</option>
          <option value="main">Main Contacts</option>
          <option value="related">Related Contacts</option>
          {/* <option value="duplicates">Potential Duplicates</option> */}
          </select>
          
          <button
          onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
          className={`px-4 py-3 border rounded-xl transition-all duration-200 flex items-center font-medium ${
            showAdvancedFilters || hasActiveAdvancedFilters 
            ? 'bg-blue-100 border-blue-300 text-blue-700' 
            : 'border-gray-200 text-gray-700 hover:bg-gray-50 bg-white/80 backdrop-blur-sm'
          }`}
          disabled={exportLoading}
          >
          <Filter className="h-4 w-4 mr-2" />
          Advanced Filters
          {hasActiveAdvancedFilters && (
            <span className="ml-2 bg-blue-600 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center">
            {Object.values(advancedFilters).filter(v => v !== undefined && v !== '').length}
            </span>
          )}
          </button>
        </div>

        {/* Advanced filters */}
        {showAdvancedFilters && (
          <div className="border-t border-gray-100 pt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">City</label>
            <select
              value={advancedFilters.city || ''}
              onChange={(e) => handleAdvancedFilterChange('city', e.target.value || undefined)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white/80"
              disabled={exportLoading}
            >
              <option value="">All Cities</option>
              {uniqueValues.cities.map(city => (
              <option key={city} value={city}>{city}</option>
              ))}
            </select>
            </div>
            
            <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">State</label>
            <select
              value={advancedFilters.state || ''}
              onChange={(e) => handleAdvancedFilterChange('state', e.target.value || undefined)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white/80"
              disabled={exportLoading}
            >
              <option value="">All States</option>
              {uniqueValues.states.map(state => (
              <option key={state} value={state}>{state}</option>
              ))}
            </select>
            </div>
            
            <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
            <select
              value={advancedFilters.category || ''}
              onChange={(e) => handleAdvancedFilterChange('category', e.target.value || undefined)}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white/80"
              disabled={exportLoading}
            >
              <option value="">All Categories</option>
              {uniqueValues.categories.map(category => (
              <option key={category} value={category}>{category}</option>
              ))}
            </select>
            </div>
            
            <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Contact Data</label>
            <select
              value={
              advancedFilters.hasEmails === true ? 'has-emails' :
              advancedFilters.hasPhones === true ? 'has-phones' :
              advancedFilters.hasEmails === false ? 'no-emails' :
              advancedFilters.hasPhones === false ? 'no-phones' : ''
              }
              onChange={(e) => {
              const value = e.target.value;
              if (value === 'has-emails') {
                handleAdvancedFilterChange('hasEmails', true);
                handleAdvancedFilterChange('hasPhones', undefined);
              } else if (value === 'has-phones') {
                handleAdvancedFilterChange('hasPhones', true);
                handleAdvancedFilterChange('hasEmails', undefined);
              } else if (value === 'no-emails') {
                handleAdvancedFilterChange('hasEmails', false);
                handleAdvancedFilterChange('hasPhones', undefined);
              } else if (value === 'no-phones') {
                handleAdvancedFilterChange('hasPhones', false);
                handleAdvancedFilterChange('hasEmails', undefined);
              } else {
                handleAdvancedFilterChange('hasEmails', undefined);
                handleAdvancedFilterChange('hasPhones', undefined);
              }
              }}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white/80"
              disabled={exportLoading}
            >
              <option value="">All Contacts</option>
              <option value="has-emails">Has Emails</option>
              <option value="has-phones">Has Phones</option>
              <option value="no-emails">No Emails</option>
              <option value="no-phones">No Phones</option>
            </select>
            </div>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Created After</label>
              <input
              type="date"
              value={advancedFilters.createdAfter || ''}
              onChange={(e) => handleAdvancedFilterChange('createdAfter', e.target.value || undefined)}
              className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white/80"
              disabled={exportLoading}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Created Before</label>
              <input
              type="date"
              value={advancedFilters.createdBefore || ''}
              onChange={(e) => handleAdvancedFilterChange('createdBefore', e.target.value || undefined)}
              className="px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white/80"
              disabled={exportLoading}
              />
            </div>
            </div>
            
            {hasActiveAdvancedFilters && (
            <button
              onClick={clearAdvancedFilters}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 flex items-center border border-gray-200 rounded-lg hover:bg-gray-50 bg-white/80"
              disabled={exportLoading}
            >
              <X className="h-4 w-4 mr-1" />
              Clear All Filters
            </button>
            )}
          </div>
          </div>
        )}
        </div>
        
        {/* Enhanced Database Stats */}
        {dbStats && (
        <div className="mt-6 pt-6 border-t border-gray-100">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-xl text-center">
            <div className="text-2xl font-bold text-blue-600">{dbStats.mainContacts.toLocaleString()}</div>
            <div className="text-sm text-blue-700 font-medium">Main Contacts</div>
          </div>
          <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-xl text-center">
            <div className="text-2xl font-bold text-green-600">{dbStats.relatedContacts.toLocaleString()}</div>
            <div className="text-sm text-green-700 font-medium">Related Contacts</div>
          </div>
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-xl text-center">
            <div className="text-2xl font-bold text-purple-600">{dbStats.totalPhones.toLocaleString()}</div>
            <div className="text-sm text-purple-700 font-medium">Phone Numbers</div>
          </div>
          <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-4 rounded-xl text-center">
            <div className="text-2xl font-bold text-orange-600">{dbStats.totalEmails.toLocaleString()}</div>
            <div className="text-sm text-orange-700 font-medium">Email Addresses</div>
          </div>
          <div className="bg-gradient-to-br from-red-50 to-red-100 p-4 rounded-xl text-center">
            <div className="text-2xl font-bold text-red-600">{dbStats.duplicateGroups.toLocaleString()}</div>
            <div className="text-sm text-red-700 font-medium">Duplicate Groups</div>
          </div>
          <div className="bg-gradient-to-br from-indigo-50 to-indigo-100 p-4 rounded-xl text-center">
            <div className="text-2xl font-bold text-indigo-600">{dbStats.recentImports.toLocaleString()}</div>
            <div className="text-sm text-indigo-700 font-medium">Recent Imports</div>
          </div>
          </div>
        </div>
        )}
      </div>

      {/* Contact List */}
      {loading ? (
        <div className="flex justify-center items-center py-12">
        <div className="flex flex-col items-center space-y-4">
          <Loader2 className="h-12 w-12 text-blue-600 animate-spin" />
          <span className="text-lg font-medium text-gray-600">Loading contacts...</span>
          <span className="text-sm text-gray-500">Please wait while we fetch your data</span>
        </div>
        </div>
      ) : viewMode === 'table' ? (
        <div className="w-[96vw] space-y-3">
        {contacts.map((contact) => (
          <ContactCard
          key={contact.id}
          contact={contact}
          onSelect={() => setSelectedContact(contact)}
          onDelete={() => handleDeleteContact(contact.id)}
          isSelected={selectedContact?.id === contact.id}
          showValidation={true}
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
            <div className={`w-16 h-16 rounded-full flex items-center justify-center text-white text-lg font-medium mb-4 ${
            contact.isMainContact 
              ? 'bg-gradient-to-r from-blue-500 to-blue-600' 
              : 'bg-gradient-to-r from-green-500 to-green-600'
            }`}>
            {contact.isMainContact ? <User className="h-8 w-8" /> : <Users className="h-8 w-8" />}
            </div>
            <h3 className="text-sm font-semibold text-gray-900 mb-1 truncate">{contact.name}</h3>
            {contact.phones.length > 0 && (
            <div className="text-xs text-gray-500 mb-1 font-mono">
              {contact.phones[0].number}
            </div>
            )}
            {contact.emails.length > 0 && (
            <div className="text-xs text-gray-500 truncate">
              {contact.emails[0].address}
            </div>
            )}
            {contact.category && (
            <div className="mt-3">
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              {contact.category}
              </span>
            </div>
            )}
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

      {/* Enhanced Pagination */}
      {totalPages > 1 && (
        <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setCurrentPage(1)}
            disabled={currentPage === 1 || loading || exportLoading}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white/80 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            First
          </button>
          <button
            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
            disabled={currentPage === 1 || loading || exportLoading}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white/80 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            <ChevronDown className="w-4 h-4 mr-1 rotate-90" />
            Previous
          </button>
          <button
            onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages || loading || exportLoading}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white/80 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            Next
            <ChevronDown className="w-4 h-4 ml-1 -rotate-90" />
          </button>
          <button
            onClick={() => setCurrentPage(totalPages)}
            disabled={currentPage === totalPages || loading || exportLoading}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white/80 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
          >
            Last
          </button>
          </div>
          
          <div className="flex flex-col sm:flex-row items-center gap-4">
          <span className="flex items-center gap-1 text-sm text-gray-700 font-medium">
            Showing {((currentPage - 1) * itemsPerPage + 1).toLocaleString()} - {Math.min(currentPage * itemsPerPage, totalContacts).toLocaleString()} of {totalContacts.toLocaleString()} contacts
          </span>
          <div className="flex items-center gap-2 text-sm text-gray-700">
            <span>Page</span>
            <span className="inline-flex items-center px-3 py-1 rounded-lg bg-blue-100 text-blue-800 font-bold">
            {currentPage}
            </span>
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
            disabled={exportLoading}
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

      {/* Enhanced Empty State */}
      {!loading && contacts.length === 0 && (
        <div className="text-center py-16">
        <div className="bg-white/70 backdrop-blur-sm rounded-2xl shadow-xl border border-white/20 p-12">
          <div className="w-24 h-24 bg-gradient-to-r from-blue-100 to-indigo-100 rounded-full flex items-center justify-center mb-6">
          <Users className="h-12 w-12 text-blue-600" />
          </div>
          <h3 className="text-xl font-semibold text-gray-900 mb-3">
          {searchTerm || hasActiveAdvancedFilters ? 'No contacts found' : 'No contacts yet'}
          </h3>
          <p className="text-gray-600 mb-8 leading-relaxed">
          {searchTerm || hasActiveAdvancedFilters
            ? 'Try adjusting your search terms or filters to find what you\'re looking for.' 
            : 'Get started by uploading an Excel file to import your contacts into the system.'
          }
          </p>
          {(searchTerm || hasActiveAdvancedFilters) ? (
          <div className="flex flex-col sm:flex-row justify-center gap-3">
            <button
            onClick={() => setSearchTerm('')}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            disabled={exportLoading}
            >
            Clear Search
            </button>
            {hasActiveAdvancedFilters && (
            <button
              onClick={clearAdvancedFilters}
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              disabled={exportLoading}
            >
              Clear Filters
            </button>
            )}
          </div>
          ) : (
          <label className="inline-flex items-center px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg cursor-pointer hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 font-medium shadow-lg">
            <Upload className="h-5 w-5 mr-2" />
            Upload Your First File
            <input
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileUpload}
            disabled={loading || exportLoading}
            className="hidden"
            />
          </label>
          )}
        </div>
        </div>
      )}
      </div>

      {/* Contact Detail Modal */}
      {selectedContact && (
      <ContactDetailModal
        contact={selectedContact}
        onClose={() => setSelectedContact(null)}
        allContacts={contacts}
      />
      )}

      {showExport && (
      <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-xl w-full max-w-2xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Export Contacts</h3>
          <button onClick={() => setShowExport(false)} className="p-2 rounded hover:bg-gray-100" disabled={exportLoading}>
          <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-sm text-gray-600 mb-4">Choose the fields to include:</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
          {[
          'name','status','isMainContact','parentContactId',
          'address','suburb','city','pincode','state','country',
          'category','phones','emails','tags','notes'
          ].map(f => (
          <label key={f} className="inline-flex items-center space-x-2">
            <input
            type="checkbox"
            className="h-4 w-4"
            checked={exportFields.includes(f)}
            onChange={(e) => {
              setExportFields(prev =>
              e.target.checked ? [...prev, f] : prev.filter(x => x !== f)
              );
            }}
            disabled={exportLoading}
            />
            <span className="text-sm capitalize">{f}</span>
          </label>
          ))}
        </div>

        <div className="flex items-center justify-end gap-3">
          <button onClick={() => setShowExport(false)} className="px-4 py-2 rounded border" disabled={exportLoading}>
          Cancel
          </button>
          <button
          onClick={() => handleExport('csv')}
          className="px-4 py-2 rounded bg-blue-600 text-white hover:bg-blue-700 flex items-center"
          disabled={exportLoading}
          >
          {exportLoading && (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          )}
          Export CSV
          </button>
          <button
          onClick={() => handleExport('xlsx')}
          className="px-4 py-2 rounded bg-indigo-600 text-white hover:bg-indigo-700 flex items-center"
          disabled={exportLoading}
          >
          {exportLoading && (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          )}
          Export XLSX
          </button>
        </div>
        </div>
      </div>
      )}
    </div>
  );
};

export default ContactDirectoryApp;