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
  MoreVertical,
  Star,
  Grid3X3,
  List,
  X,
  CheckCircle,
  AlertTriangle,
  Globe
} from 'lucide-react';

// Types (keeping your existing structure)
interface Contact {
  id: string;
  name: string;
  status?: string;
  address?: string;
  suburb?: string;
  city?: string;
  pincode?: string | number;
  state?: string;
  country?: string;
  phones: Phone[];
  emails: Email[];
  category?: string;
  officeAddress?: string;
  address2?: string;
  isMainContact: boolean;
  parentContactId?: string;
  relationships?: ContactRelationship[];
  duplicateGroup?: string;
  alternateNames?: string[];
  tags?: string[];
  notes?: string;
  lastUpdated?: Date;
}

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

interface Email {
  id: string;
  address: string;
  isPrimary: boolean;
  isValid?: boolean;
}

interface ContactRelationship {
  id: string;
  contactId: string;
  relatedContactId: string;
  relationshipType: string;
  description?: string;
}

// Mock data for demo
const generateMockContacts = (): Contact[] => {
  const contacts: Contact[] = [];
  const names = [
    'John Smith', 'Sarah Johnson', 'Michael Brown', 'Emily Davis', 'David Wilson',
    'Lisa Anderson', 'James Taylor', 'Jennifer Martinez', 'Robert Garcia', 'Mary Rodriguez',
    'Christopher Lee', 'Patricia Wilson', 'Daniel Moore', 'Linda Jackson', 'Matthew White',
    'Barbara Harris', 'Anthony Martin', 'Susan Thompson', 'Mark Garcia', 'Nancy Martinez'
  ];
  
  const cities = ['New York', 'Los Angeles', 'Chicago', 'Houston', 'Phoenix', 'Philadelphia'];
  const states = ['NY', 'CA', 'IL', 'TX', 'AZ', 'PA'];
  const countries = ['🇺🇸 United States', '🇨🇦 Canada', '🇬🇧 United Kingdom'];
  const categories = ['Personal', 'Business', 'Family', 'Colleagues', 'Friends'];
  
  names.forEach((name, index) => {
    const cityIndex = Math.floor(Math.random() * cities.length);
    const contact: Contact = {
      id: `contact_${index}`,
      name,
      status: Math.random() > 0.7 ? 'Active' : undefined,
      city: cities[cityIndex],
      state: states[cityIndex],
      country: countries[Math.floor(Math.random() * countries.length)],
      phones: [
        {
          id: `phone_${index}_1`,
          number: `+1 ${Math.floor(Math.random() * 900 + 100)}-${Math.floor(Math.random() * 900 + 100)}-${Math.floor(Math.random() * 9000 + 1000)}`,
          type: 'mobile' as const,
          isPrimary: true,
          country: 'United States',
          region: 'US',
          isValid: Math.random() > 0.1
        }
      ],
      emails: [
        {
          id: `email_${index}`,
          address: `${name.toLowerCase().replace(' ', '.')}@example.com`,
          isPrimary: true,
          isValid: Math.random() > 0.05
        }
      ],
      category: categories[Math.floor(Math.random() * categories.length)],
      isMainContact: true,
      duplicateGroup: Math.random() > 0.9 ? 'potential_duplicate' : undefined,
      lastUpdated: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000)
    };
    
    // Add some with office phones
    if (Math.random() > 0.6) {
      contact.phones.push({
        id: `phone_${index}_2`,
        number: `+1 ${Math.floor(Math.random() * 900 + 100)}-${Math.floor(Math.random() * 900 + 100)}-${Math.floor(Math.random() * 9000 + 1000)}`,
        type: 'office' as const,
        isPrimary: false,
        country: 'United States',
        region: 'US',
        isValid: true
      });
    }
    
    contacts.push(contact);
  });
  
  return contacts;
};

const ModernContactDirectory: React.FC = () => {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'table' | 'grid'>('table');
  const [sortBy, setSortBy] = useState<'name' | 'recent' | 'frequency'>('name');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Initialize with mock data
  useEffect(() => {
    setContacts(generateMockContacts());
  }, []);

  const getCountryFlag = (region?: string) => {
    const flags: { [key: string]: string } = {
      'US': '🇺🇸', 'CA': '🇨🇦', 'UK': '🇬🇧', 'IN': '🇮🇳', 'AU': '🇦🇺'
    };
    return flags[region || ''] || '🌍';
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getRandomColor = (name: string) => {
    const colors = [
      'bg-red-500', 'bg-blue-500', 'bg-green-500', 'bg-yellow-500', 
      'bg-purple-500', 'bg-pink-500', 'bg-indigo-500', 'bg-teal-500'
    ];
    const index = name.charCodeAt(0) % colors.length;
    return colors[index];
  };

  // Filtered and sorted contacts
  const filteredContacts = useMemo(() => {
    let filtered = contacts;
    
    if (searchTerm) {
      filtered = filtered.filter(contact =>
        contact.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        contact.phones.some(p => p.number.includes(searchTerm)) ||
        contact.emails.some(e => e.address.toLowerCase().includes(searchTerm.toLowerCase())) ||
        contact.city?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        contact.category?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    if (selectedFilter !== 'all') {
      if (selectedFilter === 'starred') {
        // filtered = filtered.filter(c => c.isStarred);
      } else if (selectedFilter === 'duplicates') {
        filtered = filtered.filter(c => c.duplicateGroup);
      } else if (selectedFilter === 'recent') {
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        filtered = filtered.filter(c => c.lastUpdated && c.lastUpdated > weekAgo);
      } else {
        filtered = filtered.filter(c => c.category?.toLowerCase() === selectedFilter.toLowerCase());
      }
    }
    
    // Sort
    if (sortBy === 'name') {
      filtered.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortBy === 'recent') {
      filtered.sort((a, b) => 
        (b.lastUpdated?.getTime() || 0) - (a.lastUpdated?.getTime() || 0)
      );
    }
    
    return filtered;
  }, [contacts, searchTerm, selectedFilter, sortBy]);

  const handleSelectContact = (contactId: string, isSelected: boolean) => {
    const newSelected = new Set(selectedContacts);
    if (isSelected) {
      newSelected.add(contactId);
    } else {
      newSelected.delete(contactId);
    }
    setSelectedContacts(newSelected);
  };

  const handleSelectAll = (isSelected: boolean) => {
    if (isSelected) {
      setSelectedContacts(new Set(filteredContacts.map(c => c.id)));
    } else {
      setSelectedContacts(new Set());
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white sticky top-0 z-40">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center">
                  <Users className="h-5 w-5 text-white" />
                </div>
                <h1 className="text-xl font-medium text-gray-900">Contacts</h1>
              </div>
              <div className="text-sm text-gray-500">
                {filteredContacts.length} contacts
              </div>
            </div>
            
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setViewMode(viewMode === 'table' ? 'grid' : 'table')}
                className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full"
              >
                {viewMode === 'table' ? <Grid3X3 className="h-5 w-5" /> : <List className="h-5 w-5" />}
              </button>
              <button className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors">
                <UserPlus className="h-4 w-4 mr-2" />
                Create contact
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="border-b border-gray-100 bg-gray-50">
        <div className="px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center space-x-4">
            <div className="flex-1 max-w-md relative">
              <Search className="h-5 w-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search contacts..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white border border-gray-200 rounded-full focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            
            <div className="flex items-center space-x-2">
              <select
                value={selectedFilter}
                onChange={(e) => setSelectedFilter(e.target.value)}
                className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All contacts</option>
                <option value="personal">Personal</option>
                <option value="business">Business</option>
                <option value="family">Family</option>
                <option value="recent">Recent</option>
                <option value="duplicates">Duplicates</option>
              </select>
              
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="name">Sort by name</option>
                <option value="recent">Recently added</option>
                <option value="frequency">Most contacted</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      {selectedContacts.size > 0 && (
        <div className="border-b border-gray-200 bg-blue-50">
          <div className="px-4 sm:px-6 lg:px-8 py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <span className="text-sm font-medium text-blue-900">
                  {selectedContacts.size} selected
                </span>
                <button
                  onClick={() => setSelectedContacts(new Set())}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Clear selection
                </button>
              </div>
              <div className="flex items-center space-x-2">
                <button className="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-md hover:bg-gray-50">
                  Export
                </button>
                <button className="px-3 py-1.5 text-sm bg-white border border-gray-200 rounded-md hover:bg-gray-50 text-red-600">
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1">
        {viewMode === 'table' ? (
          <TableView 
            contacts={filteredContacts}
            selectedContacts={selectedContacts}
            onSelectContact={handleSelectContact}
            onSelectAll={handleSelectAll}
            onContactClick={setSelectedContact}
            getInitials={getInitials}
            getRandomColor={getRandomColor}
            getCountryFlag={getCountryFlag}
          />
        ) : (
          <GridView 
            contacts={filteredContacts}
            onContactClick={setSelectedContact}
            getInitials={getInitials}
            getRandomColor={getRandomColor}
            getCountryFlag={getCountryFlag}
          />
        )}
      </div>

      {/* Contact Detail Sidebar */}
      {selectedContact && (
        <ContactDetailSidebar
          contact={selectedContact}
          onClose={() => setSelectedContact(null)}
          allContacts={contacts}
          getCountryFlag={getCountryFlag}
          getInitials={getInitials}
          getRandomColor={getRandomColor}
        />
      )}
    </div>
  );
};

// Table View Component
const TableView: React.FC<{
  contacts: Contact[];
  selectedContacts: Set<string>;
  onSelectContact: (id: string, selected: boolean) => void;
  onSelectAll: (selected: boolean) => void;
  onContactClick: (contact: Contact) => void;
  getInitials: (name: string) => string;
  getRandomColor: (name: string) => string;
  getCountryFlag: (region?: string) => string;
}> = ({ 
  contacts, 
  selectedContacts, 
  onSelectContact, 
  onSelectAll, 
  onContactClick,
  getInitials,
  getRandomColor,
  getCountryFlag
}) => {
  const allSelected = contacts.length > 0 && selectedContacts.size === contacts.length;
  const someSelected = selectedContacts.size > 0 && selectedContacts.size < contacts.length;

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="w-12 px-4 py-3">
              <input
                type="checkbox"
                checked={allSelected}
                ref={input => {
                  if (input) input.indeterminate = someSelected;
                }}
                onChange={(e) => onSelectAll(e.target.checked)}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              />
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Contact
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden sm:table-cell">
              Phone
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden md:table-cell">
              Email
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden lg:table-cell">
              Location
            </th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider hidden xl:table-cell">
              Category
            </th>
            <th className="w-12 px-4 py-3"></th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {contacts.map((contact) => (
            <tr 
              key={contact.id} 
              className="hover:bg-gray-50 cursor-pointer transition-colors"
              onClick={() => onContactClick(contact)}
            >
              <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selectedContacts.has(contact.id)}
                  onChange={(e) => onSelectContact(contact.id, e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
              </td>
              <td className="px-6 py-4">
                <div className="flex items-center space-x-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-medium ${getRandomColor(contact.name)}`}>
                    {getInitials(contact.name)}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-gray-900 flex items-center">
                      {contact.name}
                      {contact.duplicateGroup && (
                        <AlertTriangle className="h-4 w-4 text-yellow-500 ml-2" />
                      )}
                    </div>
                    {contact.status && (
                      <div className="text-sm text-gray-500">{contact.status}</div>
                    )}
                  </div>
                </div>
              </td>
              <td className="px-6 py-4 text-sm text-gray-900 hidden sm:table-cell">
                {contact.phones.length > 0 ? (
                  <div className="flex items-center space-x-2">
                    <span className="font-mono">{contact.phones[0].number}</span>
                    {contact.phones[0].country && (
                      <span className="text-xs">{getCountryFlag(contact.phones[0].region)}</span>
                    )}
                    {contact.phones[0].isValid === false && (
                      <AlertTriangle className="h-3 w-3 text-red-500" />
                    )}
                    {contact.phones.length > 1 && (
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                        +{contact.phones.length - 1}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-gray-400">No phone</span>
                )}
              </td>
              <td className="px-6 py-4 text-sm text-gray-900 hidden md:table-cell">
                {contact.emails.length > 0 ? (
                  <div className="flex items-center space-x-2">
                    <span className="font-mono truncate max-w-48">{contact.emails[0].address}</span>
                    {contact.emails[0].isValid === false && (
                      <AlertTriangle className="h-3 w-3 text-red-500" />
                    )}
                    {contact.emails.length > 1 && (
                      <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                        +{contact.emails.length - 1}
                      </span>
                    )}
                  </div>
                ) : (
                  <span className="text-gray-400">No email</span>
                )}
              </td>
              <td className="px-6 py-4 text-sm text-gray-500 hidden lg:table-cell">
                {contact.city && contact.state ? (
                  <div className="flex items-center space-x-1">
                    <MapPin className="h-4 w-4 text-gray-400" />
                    <span>{contact.city}, {contact.state}</span>
                  </div>
                ) : (
                  <span className="text-gray-400">No location</span>
                )}
              </td>
              <td className="px-6 py-4 text-sm hidden xl:table-cell">
                {contact.category ? (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                    {contact.category}
                  </span>
                ) : (
                  <span className="text-gray-400">No category</span>
                )}
              </td>
              <td className="px-4 py-4" onClick={e => e.stopPropagation()}>
                <button className="text-gray-400 hover:text-gray-600 p-1 rounded">
                  <MoreVertical className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      
      {contacts.length === 0 && (
        <div className="text-center py-12">
          <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No contacts found</p>
        </div>
      )}
    </div>
  );
};

// Grid View Component
const GridView: React.FC<{
  contacts: Contact[];
  onContactClick: (contact: Contact) => void;
  getInitials: (name: string) => string;
  getRandomColor: (name: string) => string;
  getCountryFlag: (region?: string) => string;
}> = ({ contacts, onContactClick, getInitials, getRandomColor, getCountryFlag }) => {
  return (
    <div className="p-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
        {contacts.map((contact) => (
          <div
            key={contact.id}
            onClick={() => onContactClick(contact)}
            className="bg-white border border-gray-200 rounded-xl p-6 hover:shadow-md hover:border-gray-300 cursor-pointer transition-all duration-200"
          >
            <div className="text-center">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center text-white text-lg font-medium mx-auto mb-4 ${getRandomColor(contact.name)}`}>
                {getInitials(contact.name)}
              </div>
              <h3 className="text-sm font-medium text-gray-900 mb-1 truncate">{contact.name}</h3>
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
            </div>
          </div>
        ))}
      </div>
      
      {contacts.length === 0 && (
        <div className="text-center py-12">
          <Users className="h-12 w-12 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No contacts found</p>
        </div>
      )}
    </div>
  );
};

// Contact Detail Sidebar
const ContactDetailSidebar: React.FC<{
  contact: Contact;
  onClose: () => void;
  allContacts: Contact[];
  getCountryFlag: (region?: string) => string;
  getInitials: (name: string) => string;
  getRandomColor: (name: string) => string;
}> = ({ contact, onClose, allContacts, getCountryFlag, getInitials, getRandomColor }) => {
  const relatedContacts = allContacts.filter(c => 
    c.parentContactId === contact.id || 
    (contact.parentContactId && c.parentContactId === contact.parentContactId && c.id !== contact.id)
  );

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black bg-opacity-25" onClick={onClose}></div>
      <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-xl">
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="border-b border-gray-200 px-6 py-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium text-gray-900">Contact details</h2>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-full"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-6">
            {/* Contact Header */}
            <div className="text-center mb-8">
              <div className={`w-24 h-24 rounded-full flex items-center justify-center text-white text-2xl font-medium mx-auto mb-4 ${getRandomColor(contact.name)}`}>
                {getInitials(contact.name)}
              </div>
              <h1 className="text-2xl font-semibold text-gray-900 mb-2">{contact.name}</h1>
              {contact.status && (
                <p className="text-sm text-gray-500">{contact.status}</p>
              )}
            </div>

            {/* Contact Information */}
            <div className="space-y-6">
              {/* Phone Numbers */}
              {contact.phones.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center">
                    <Phone className="h-4 w-4 mr-2 text-gray-400" />
                    Phone numbers
                  </h3>
                  <div className="space-y-3">
                    {contact.phones.map(phone => (
                      <div key={phone.id} className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="font-mono text-sm">{phone.number}</div>
                          {phone.country && phone.region && (
                            <span className="text-sm">{getCountryFlag(phone.region)}</span>
                          )}
                          {phone.isValid === false && (
                            <AlertTriangle className="h-4 w-4 text-red-500" />
                          )}
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                            {phone.type}
                          </span>
                          {phone.isPrimary && (
                            <span className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded-full">
                              Primary
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Email Addresses */}
              {contact.emails.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center">
                    <Mail className="h-4 w-4 mr-2 text-gray-400" />
                    Email addresses
                  </h3>
                  <div className="space-y-3">
                    {contact.emails.map(email => (
                      <div key={email.id} className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <div className="font-mono text-sm truncate">{email.address}</div>
                          {email.isValid === false && (
                            <AlertTriangle className="h-4 w-4 text-red-500" />
                          )}
                        </div>
                        {email.isPrimary && (
                          <span className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded-full">
                            Primary
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Location */}
              {(contact.city || contact.address) && (
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-3 flex items-center">
                    <MapPin className="h-4 w-4 mr-2 text-gray-400" />
                    Location
                  </h3>
                  <div className="text-sm text-gray-600">
                    {contact.address && <div>{contact.address}</div>}
                    {contact.city && contact.state && (
                      <div>{contact.city}, {contact.state}</div>
                    )}
                    {contact.country && <div>{contact.country}</div>}
                  </div>
                </div>
              )}

              {/* Category */}
              {contact.category && (
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-3">Category</h3>
                  <span className="inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                    {contact.category}
                  </span>
                </div>
              )}

              {/* Related Contacts */}
              {relatedContacts.length > 0 && (
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-3">Related contacts</h3>
                  <div className="space-y-3">
                    {relatedContacts.map(relContact => (
                      <div key={relContact.id} className="flex items-center space-x-3 p-3 bg-gray-50 rounded-lg">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-medium ${getRandomColor(relContact.name)}`}>
                          {getInitials(relContact.name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-gray-900 truncate">{relContact.name}</div>
                          {relContact.phones.length > 0 && (
                            <div className="text-xs text-gray-500 font-mono">{relContact.phones[0].number}</div>
                          )}
                        </div>
                        {relContact.relationships?.[0] && (
                          <span className="text-xs text-purple-600 bg-purple-100 px-2 py-1 rounded-full">
                            {relContact.relationships[0].description}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="border-t border-gray-200 px-6 py-4">
            <div className="flex space-x-3">
              <button className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center">
                <Edit3 className="h-4 w-4 mr-2" />
                Edit
              </button>
              <button className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors">
                <MoreVertical className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModernContactDirectory;