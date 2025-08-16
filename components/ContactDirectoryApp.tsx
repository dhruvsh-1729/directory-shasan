// pages/index.tsx or app/page.tsx (depending on your Next.js version)
import React, { useState, useEffect, useMemo } from 'react';
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
  Database
} from 'lucide-react';
import { ContactExtractor } from '@/utils/main';
import { ContactDatabaseService } from '@/lib/database';
import { Contact } from '@/types';

interface Phone {
  id: string;
  number: string;
  type: 'mobile' | 'office' | 'residence' | 'fax' | 'other';
  isPrimary: boolean;
  label?: string;
  country?: string;
  region?: string;
  isValid?: boolean;
}

interface DatabaseStats {
  totalContacts: number;
  mainContacts: number;
  relatedContacts: number;
  totalPhones: number;
  totalEmails: number;
  duplicateGroups: number;
  recentImports: number;
}

const ContactDirectoryApp: React.FC = () => {
  // State management
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [totalContacts, setTotalContacts] = useState(0);
  const [dbStats, setDbStats] = useState<DatabaseStats | null>(null);

  // Load contacts from database on mount
  useEffect(() => {
    loadContacts();
    loadDatabaseStats();
  }, [currentPage, searchTerm, selectedFilter]);

  const loadContacts = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page: currentPage,
          limit: itemsPerPage,
          search: searchTerm,
          filter: selectedFilter
        })
      });
      
      if (!response.ok) throw new Error('Failed to load contacts');
      
      const data = await response.json();
      setContacts(data.contacts);
      setTotalPages(data.totalPages);
      setTotalContacts(data.total);
      
    } catch (error) {
      console.error('Error loading contacts:', error);
      setUploadStatus('error');
    } finally {
      setLoading(false);
    }
  };

  const loadDatabaseStats = async () => {
    try {
      const response = await fetch('/api/stats');
      if (response.ok) {
        const stats = await response.json();
        setDbStats(stats);
      }
    } catch (error) {
      console.error('Error loading stats:', error);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setUploadStatus('processing');
    setUploadProgress(0);
    
    try {
      // Process the file with proper record-level processing
      const processedContacts = await processContactFile(file);
      setContacts(processedContacts);
      setUploadStatus('success');
    } catch (error) {
      console.error('Error processing file:', error);
      setUploadStatus('error');
    } finally {
      setLoading(false);
      setTimeout(() => {
        setUploadStatus('idle');
        setUploadProgress(0);
      }, 3000);
    }
  };

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
    
    // Process each record individually to ensure proper email scoping
    dataRows.forEach((row, index) => {
      const rowData = row as any[];
      
      if (!rowData[columnMap.name] || String(rowData[columnMap.name]).trim() === '') {
        return;
      }
      
      try {
        // Prepare phone fields for this record
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

        // Use the improved processRecord method to handle email matching per record
        const recordContacts = ContactExtractor.processRecord({
          name: String(rowData[columnMap.name]).trim(),
          phoneFields,
          emailField: rowData[columnMap.emails] ? String(rowData[columnMap.emails]).trim() : '',
          city: rowData[columnMap.city] ? String(rowData[columnMap.city]).trim() : undefined,
          state: rowData[columnMap.state] ? String(rowData[columnMap.state]).trim() : undefined,
          country: rowData[columnMap.country] ? String(rowData[columnMap.country]).trim() : undefined,
          // Additional fields
          srNo: rowData[columnMap.srNo] || index + 1,
          status: rowData[columnMap.status] ? String(rowData[columnMap.status]).trim() : undefined,
          address: rowData[columnMap.address] ? String(rowData[columnMap.address]).trim() : undefined,
          suburb: rowData[columnMap.suburb] ? String(rowData[columnMap.suburb]).trim() : undefined,
          pincode: rowData[columnMap.pincode],
          category: rowData[columnMap.category] ? String(rowData[columnMap.category]).trim() : undefined,
          officeAddress: rowData[columnMap.officeAddress] ? String(rowData[columnMap.officeAddress]).trim() : undefined,
          address2: rowData[columnMap.address2] ? String(rowData[columnMap.address2]).trim() : undefined
        });

        // Add the additional fields to the main contact
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
            
            // Set up relationships for the main contact
            const relatedContacts = recordContacts.filter(c => !c.isMainContact);
            mainContact.relationships = relatedContacts.flatMap(rc => rc.relationships || []);
          }
        }
        
        allProcessedContacts.push(...recordContacts);
        
      } catch (error) {
        console.error(`Error processing row ${index + 1}:`, error);
      }
    });
    
    // Only detect duplicates across all records - email matching was already done per record
    const contactsWithDuplicates = ContactExtractor.detectDuplicates(allProcessedContacts);
    
    console.log(`Processed ${contactsWithDuplicates.length} contacts from ${dataRows.length} records`);
    console.log('Email distribution:', contactsWithDuplicates.map(c => ({
      name: c.name,
      emailCount: c.emails.length,
      isMain: c.isMainContact
    })).filter(c => c.emailCount > 0));
    
    return contactsWithDuplicates;
  };

  const handleRefresh = async () => {
    await loadContacts();
    await loadDatabaseStats();
  };

  const handleDeleteContact = async (contactId: string) => {
    if (!confirm('Are you sure you want to delete this contact?')) return;
    
    try {
      const response = await fetch(`/api/contacts/${contactId}`, {
        method: 'DELETE'
      });
      
      if (response.ok) {
        await loadContacts();
        await loadDatabaseStats();
        setSelectedContact(null);
      }
    } catch (error) {
      console.error('Error deleting contact:', error);
    }
  };

  return (
    <div className="min-h-screen w-full bg-gray-50">
      {/* Header */}
      <div className="bg-white w-full shadow-sm border-b">
        <div className="w-full px-4">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <Database className="h-8 w-8 text-blue-600 mr-3" />
              <h1 className="text-xl font-semibold text-gray-900">Smart Contact Directory</h1>
              <span className="ml-3 text-sm text-gray-500">
                Connected to MongoDB
              </span>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={handleRefresh}
                disabled={loading}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full disabled:opacity-50"
                title="Refresh data"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              
              <label className="bg-blue-600 text-white px-4 py-2 rounded-lg cursor-pointer hover:bg-blue-700 transition-colors flex items-center disabled:opacity-50">
                <Upload className="h-4 w-4 mr-2" />
                Upload Excel
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileUpload}
                  disabled={loading}
                  className="hidden"
                />
              </label>
              
              {uploadStatus === 'processing' && (
                <div className="flex items-center text-blue-600">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                  <span>Processing... {uploadProgress}%</span>
                </div>
              )}
              {uploadStatus === 'success' && (
                <div className="flex items-center text-green-600">
                  <Check className="h-4 w-4 mr-2" />
                  Success!
                </div>
              )}
              {uploadStatus === 'error' && (
                <div className="flex items-center text-red-600">
                  <AlertCircle className="h-4 w-4 mr-2" />
                  Error processing file
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="w-full px-4 sm:px-6 lg:px-8 py-6">
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex flex-col sm:flex-row gap-4 items-center">
            <div className="relative flex-1">
              <Search className="h-5 w-5 text-gray-400 absolute left-3 top-3" />
              <input
                type="text"
                placeholder="Search contacts, phones, emails..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <select
              value={selectedFilter}
              onChange={(e) => setSelectedFilter(e.target.value)}
              className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">All Contacts</option>
              <option value="main">Main Contacts</option>
              <option value="related">Related Contacts</option>
            </select>
          </div>
          
          {/* Database Stats */}
          {dbStats && (
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">{dbStats.mainContacts.toLocaleString()}</div>
                <div className="text-sm text-gray-500">Main Contacts</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">{dbStats.relatedContacts.toLocaleString()}</div>
                <div className="text-sm text-gray-500">Related Contacts</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">{dbStats.totalPhones.toLocaleString()}</div>
                <div className="text-sm text-gray-500">Phone Numbers</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-gray-900">{dbStats.totalEmails.toLocaleString()}</div>
                <div className="text-sm text-gray-500">Email Addresses</div>
              </div>
            </div>
          )}
        </div>

        {/* Contact List */}
        <div className="space-y-4">
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-gray-600">Loading contacts...</span>
            </div>
          ) : (
            contacts.map((contact) => (
              <ContactCard
                key={contact.id}
                contact={contact}
                onSelect={() => setSelectedContact(contact)}
                onDelete={() => handleDeleteContact(contact.id)}
                isSelected={selectedContact?.id === contact.id}
              />
            ))
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center mt-8 space-x-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1 || loading}
              className="px-3 py-1 border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Previous
            </button>
            <span className="px-4 py-1">
              Page {currentPage} of {totalPages} ({totalContacts.toLocaleString()} contacts)
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages || loading}
              className="px-3 py-1 border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loading && contacts.length === 0 && (
          <div className="text-center py-12">
            <Users className="h-16 w-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">
              {searchTerm ? 'No contacts found' : 'No contacts yet'}
            </h3>
            <p className="text-gray-500 mb-6">
              {searchTerm 
                ? 'Try adjusting your search terms or filters' 
                : 'Upload an Excel file to get started with contact extraction'
              }
            </p>
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="text-blue-600 hover:text-blue-800"
              >
                Clear search
              </button>
            )}
          </div>
        )}
      </div>

      {/* Contact Detail Modal */}
      {selectedContact && (
        <ContactDetailModal
          contact={selectedContact}
          onClose={() => setSelectedContact(null)}
          allContacts={contacts}
          onDelete={() => handleDeleteContact(selectedContact.id)}
        />
      )}
    </div>
  );
};

// Updated Contact Card Component with delete functionality
const ContactCard: React.FC<{
  contact: Contact;
  onSelect: () => void;
  onDelete: () => void;
  isSelected: boolean;
}> = ({ contact, onSelect, onDelete, isSelected }) => {
  const [expanded, setExpanded] = useState(false);
  
  // Get primary phone and email for compact display
  const primaryPhone = contact.phones.find(p => p.isPrimary) || contact.phones[0];
  const primaryEmail = contact.emails.find(e => e.isPrimary) || contact.emails[0];

  return (
    <div
      className={`bg-white rounded-lg shadow-sm border transition-all cursor-pointer hover:shadow-md ${
        isSelected ? 'ring-2 ring-blue-500 border-blue-200' : 'border-gray-200'
      } ${!contact.isMainContact ? 'ml-8 border-l-4 border-l-blue-300' : ''}`}
    >
      <div className="p-3" onClick={onSelect}>
        <div className="flex items-center justify-between">
          {/* Left section with avatar and name */}
          <div className="flex items-center min-w-0 flex-0.25">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
              contact.isMainContact ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
            }`}>
              {contact.isMainContact ? <User className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
            </div>
            <div className="ml-2 truncate">
              <h3 className="text-sm font-semibold text-gray-900 truncate">{contact.name}</h3>
              {contact.status && <p className="text-xs text-gray-500 truncate">{contact.status}</p>}
            </div>
          </div>
          
          {/* Middle section with contact info */}
          <div className="flex-1 grid grid-cols-3 gap-2 mx-2 min-w-0">
            {primaryPhone && (
              <div className="flex items-center text-xs truncate">
                <Phone className="h-3 w-3 text-gray-400 mr-1 flex-shrink-0" />
                <span className="truncate">{primaryPhone.number}</span>
                {contact.phones.length > 1 && (
                  <span className="ml-1 text-gray-500">+{contact.phones.length - 1}</span>
                )}
              </div>
            )}
            
            {primaryEmail && (
              <div className="flex items-center text-xs truncate">
                <Mail className="h-3 w-3 text-gray-400 mr-1 flex-shrink-0" />
                <span className="truncate">{primaryEmail.address}</span>
                {contact.emails.length > 1 && (
                  <span className="ml-1 text-gray-500">+{contact.emails.length - 1}</span>
                )}
              </div>
            )}
            
            {contact.city && (
              <div className="flex items-center text-xs truncate">
                <MapPin className="h-3 w-3 text-gray-400 mr-1 flex-shrink-0" />
                <span className="truncate">{contact.city}{contact.state && `, ${contact.state}`}</span>
              </div>
            )}
          </div>
          
          {/* Category tags */}
          <div className="flex items-center gap-1">
            {contact.category && (
              <div className="flex flex-wrap gap-1 max-w-[150px] overflow-hidden">
                {contact.category.split(",").map((tag, index) => {
                  // Expand abbreviations to full form
                  let expandedTag = tag;
                    // Keep original tag content and append expanded form
                    if (tag.trim() === 'G') expandedTag = 'G - GuruBhakt';
                    else if (tag.trim().includes('SP')) expandedTag = `${tag} - Sansari Parivarjan`;
                    else if (tag.trim().includes('GM')) expandedTag = `${tag} - Gruh Mandir`;
                    else if (tag.trim().includes('AS')) expandedTag = `${tag} - Anya Samuday`;
                    else if (tag.trim().includes('MM')) expandedTag = `${tag} - Mangal Murti`;
                    else if (tag.trim().includes('VIP')) expandedTag = `${tag} - VIP`;
                    else expandedTag = tag;
                  
                  return (
                    <span key={index} className="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full text-xs">
                      {expandedTag}
                    </span>
                  );
                })}
              </div>
            )}
            
            {!contact.isMainContact && (
              <span className="bg-green-100 text-green-800 px-1.5 py-0.5 rounded text-xs whitespace-nowrap">
                Related
              </span>
            )}
          </div>
          
          {/* Action buttons */}
          <div className="flex items-center space-x-1 flex-shrink-0">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              className="text-red-400 hover:text-red-600 p-1"
              title="Delete contact"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setExpanded(!expanded);
              }}
              className="text-gray-400 hover:text-gray-600 p-1"
              title={expanded ? "Show less" : "Show more"}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Expanded details */}
        {expanded && (
          <div className="mt-3 border-t pt-3 space-y-4">
            {contact.address && (
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-2">Address</h4>
                <p className="text-sm text-gray-600">
                  {contact.address}
                  {contact.suburb && `, ${contact.suburb}`}
                  <br />
                  {contact.city}, {contact.state} {contact.pincode}
                  <br />
                  {contact.country}
                </p>
              </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {contact.phones.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Phone Numbers</h4>
                  <div className="space-y-1">
                    {contact.phones.map(phone => (
                      <div key={phone.id} className="text-sm text-gray-600 flex items-center justify-between">
                        <span>{phone.number}</span>
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-1 rounded text-xs ${
                            phone.type === 'mobile' ? 'bg-green-100 text-green-800' :
                            phone.type === 'office' ? 'bg-blue-100 text-blue-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {phone.type}
                          </span>
                          {phone.isPrimary && (
                            <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs">
                              Primary
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {contact.emails.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Email Addresses</h4>
                  <div className="space-y-1">
                    {contact.emails.map(email => (
                      <div key={email.id} className="text-sm text-gray-600 flex items-center justify-between">
                        <span className="truncate">{email.address}</span>
                        {email.isPrimary && (
                          <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs ml-2">
                            Primary
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            {contact.officeAddress && (
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-2">Office Address</h4>
                <p className="text-sm text-gray-600">{contact.officeAddress}</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// Updated Contact Detail Modal with delete functionality
const ContactDetailModal: React.FC<{
  contact: Contact;
  onClose: () => void;
  onDelete: () => void;
  allContacts: Contact[];
}> = ({ contact, onClose, onDelete, allContacts }) => {
  const relatedContacts = allContacts.filter(c => 
    c.parentContactId === contact.id || 
    (contact.parentContactId && c.parentContactId === contact.parentContactId && c.id !== contact.id)
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-gray-900">{contact.name}</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              ×
            </button>
          </div>
          {contact.status && (
            <p className="text-gray-600 mt-1">{contact.status}</p>
          )}
        </div>
        
        {/* Contact details same as before... */}
        <div className="p-6 space-y-6">
          {/* Phone Numbers */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Phone Numbers</h3>
              <div className="space-y-2">
                {contact.phones.map(phone => (
                  <div key={phone.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div>
                      <div className="font-medium">{phone.number}</div>
                      {phone.label && (
                        <div className="text-sm text-gray-500">{phone.label}</div>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      <span className={`px-2 py-1 rounded text-xs ${
                        phone.type === 'mobile' ? 'bg-green-100 text-green-800' :
                        phone.type === 'office' ? 'bg-blue-100 text-blue-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {phone.type}
                      </span>
                      {phone.isPrimary && (
                        <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs">
                          Primary
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-3">Email Addresses</h3>
              <div className="space-y-2">
                {contact.emails.length > 0 ? contact.emails.map(email => (
                  <div key={email.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="font-medium">{email.address}</div>
                    {email.isPrimary && (
                      <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs">
                        Primary
                      </span>
                    )}
                  </div>
                )) : (
                  <p className="text-gray-500 italic">No email addresses available</p>
                )}
              </div>
            </div>
          </div>
        </div>
        
        <div className="p-6 border-t bg-gray-50 flex justify-between space-x-3">
          <button
            onClick={onDelete}
            className="px-4 py-2 text-red-700 border border-red-300 rounded-lg hover:bg-red-50 flex items-center"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Contact
          </button>
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-700 border rounded-lg hover:bg-gray-100"
            >
              Close
            </button>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center">
              <Edit3 className="h-4 w-4 mr-2" />
              Edit Contact
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContactDirectoryApp;