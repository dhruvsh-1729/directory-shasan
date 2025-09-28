// components/ContactDetailModal.tsx
import React, { useState, useEffect } from 'react';
import { Contact } from '@/types';
import { 
  Edit3, X, Globe, AlertTriangle, CheckCircle, Phone, Mail, MapPin, 
  User, Users, Building, Home, Star, Copy, ExternalLink, Calendar,
  Tag, FileText, Activity, TrendingUp, Shield, Loader2
} from 'lucide-react';
import EditContactModal from './EditContactModal';

interface ContactDetailModalProps {
  contact: Contact;
  onClose: () => void;
  allContacts: Contact[];
}

const ContactDetailModal: React.FC<ContactDetailModalProps> = ({ 
  contact, 
  onClose, 
  allContacts 
}) => {
  const [relatedContacts, setRelatedContacts] = useState<Contact[]>([]);
  const [parentContactData, setParentContactData] = useState<Contact | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');
  // 2) ADD THIS STATE near your other useState hooks
const [editing, setEditing] = useState(false);
const [currentContact, setCurrentContact] = useState<Contact>(contact);

  console.log({ contact, parentContactData });  

  // Fetch related contacts and parent contact data
  useEffect(() => {
    const fetchRelatedData = async () => {
      setLoading(true);
      setError('');
      
      try {
        // Find related contacts
        const related = allContacts.filter(c => 
          c.parentContactId === contact.id || 
          (contact.parentContactId && c.parentContactId === contact.parentContactId && c.id !== contact.id)
        );
        setRelatedContacts(related);

        // Fetch parent contact data if this is a related contact
        if (contact.parentContactId && !contact.isMainContact) {
          try {
            const response = await fetch(`/api/contacts/${contact.parentContactId}`);
            if (response.ok) {
              const data = await response.json();
              setParentContactData(data.contact);
            }
          } catch (err) {
            console.warn('Failed to fetch parent contact:', err);
          }
        }
      } catch (err) {
        setError('Failed to load related contact data');
        console.error('Error fetching related data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchRelatedData();
  }, [contact, allContacts]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const getCountryFlag = (region?: string) => {
    const flags: { [key: string]: string } = {
      'IN': '🇮🇳', 'US': '🇺🇸', 'UK': '🇬🇧', 'CA': '🇨🇦', 'AU': '🇦🇺', 'XX': '🌍'
    };
    return flags[region || 'XX'] || '🌍';
  };

  const getPhoneTypeColor = (type: string) => {
    const colors = {
      mobile: 'bg-green-100 text-green-800 border-green-300',
      office: 'bg-blue-100 text-blue-800 border-blue-300',
      residence: 'bg-purple-100 text-purple-800 border-purple-300',
      fax: 'bg-orange-100 text-orange-800 border-orange-300',
      other: 'bg-gray-100 text-gray-800 border-gray-300'
    };
    return colors[type as keyof typeof colors] || colors.other;
  };

  const getRelationshipTypeColor = (type: string) => {
    const colors = {
      spouse: 'bg-pink-100 text-pink-800 border-pink-300',
      child: 'bg-blue-100 text-blue-800 border-blue-300',
      parent: 'bg-green-100 text-green-800 border-green-300',
      sibling: 'bg-yellow-100 text-yellow-800 border-yellow-300',
      friend: 'bg-indigo-100 text-indigo-800 border-indigo-300',
      colleague: 'bg-cyan-100 text-cyan-800 border-cyan-300',
      extended_family: 'bg-teal-100 text-teal-800 border-teal-300',
      related: 'bg-gray-100 text-gray-800 border-gray-300'
    };
    return colors[type as keyof typeof colors] || colors.related;
  };

  const formatRelationshipType = (type: string) => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  const getTagDisplayName = (tag: string) => {
    const tagMappings = {
      'G': 'GuruBhakt',
      'SP': 'Sansari Parivarjan', 
      'GM': 'Gruh Mandir',
      'AS': 'Anya Samuday',
      'MM': 'Mangal Murti',
      'VIP': 'VIP'
    };
    return tagMappings[tag as keyof typeof tagMappings] || tag;
  };

  // AFTER
const validPhones = currentContact.phones.filter(p => p.isValid !== false);
const validEmails = currentContact.emails.filter(e => e.isValid !== false);
// ...
const displayAddress = currentContact.address || parentContactData?.address;
const displayCity = currentContact.city || parentContactData?.city;
// etc...

  const qualityScore = Math.round(
    ((validPhones.length / Math.max(contact.phones.length, 1)) * 0.4 +
     (validEmails.length / Math.max(contact.emails.length, 1)) * 0.4 +
     (contact.address ? 0.2 : 0)) * 100
  );

  const displayState = contact.state || parentContactData?.state;
  const displayCountry = contact.country || parentContactData?.country;
  const displayPincode = contact.pincode || parentContactData?.pincode;
  const displaySuburb = contact.suburb || parentContactData?.suburb;

  return (
    <div 
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-2xl max-w-6xl w-full max-h-[95vh] overflow-y-auto shadow-2xl">
        {/* Enhanced Header with Gradient */}
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-t-2xl p-6 z-10">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center space-x-4">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center shadow-lg ${
                  contact.isMainContact 
                    ? 'bg-white/20 backdrop-blur-sm' 
                    : 'bg-green-500/80 backdrop-blur-sm'
                }`}>
                  {contact.isMainContact ? 
                    <User className="h-8 w-8 text-white" /> : 
                    <Users className="h-8 w-8 text-white" />
                  }
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-2xl font-bold text-white mb-1">{contact.name}</h2>
                  {contact.alternateNames && contact.alternateNames.length > 0 && (
                    <div className="text-sm text-blue-100 mb-2">
                      <span>Also known as: </span>
                      <span className="font-medium">{contact.alternateNames.join(', ')}</span>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    {!contact.isMainContact && (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-green-500/80 text-white border border-green-400">
                        Related Contact
                      </span>
                    )}
                    {contact.duplicateGroup && (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-yellow-500/80 text-white border border-yellow-400">
                        <AlertTriangle className="h-3 w-3 mr-1" />
                        Potential Duplicate
                      </span>
                    )}
                    {(displayCity || displayState) && (
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-white/20 text-white border border-white/30">
                        <MapPin className="h-3 w-3 mr-1" />
                        {displayCity}{displayState ? `, ${displayState}` : ''}
                      </span>
                    )}
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${
                      qualityScore >= 80 ? 'bg-green-500/80 text-white border-green-400' :
                      qualityScore >= 60 ? 'bg-yellow-500/80 text-white border-yellow-400' :
                      'bg-red-500/80 text-white border-red-400'
                    }`}>
                      <Shield className="h-3 w-3 mr-1" />
                      Data Quality: {qualityScore}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/20 p-3 rounded-full transition-colors ml-4"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>
        
        {error && (
          <div className="bg-red-50 border-l-4 border-red-400 p-4 m-6 rounded">
            <div className="flex items-center">
              <AlertTriangle className="h-5 w-5 text-red-400 mr-3" />
              <p className="text-red-700">{error}</p>
            </div>
          </div>
        )}

        <div className="p-6 space-y-8">
          {/* Contact Information Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Phone Numbers */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Phone className="h-5 w-5 text-blue-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Phone Numbers</h3>
                  <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                    {contact.phones.length}
                  </span>
                </div>
                <div className="text-sm text-gray-600">
                  {validPhones.length}/{contact.phones.length} valid
                </div>
              </div>
              
              <div className="space-y-3">
                {contact.phones.length > 0 ? contact.phones.map(phone => (
                  <div key={phone.id} className="group p-4 border border-gray-200 rounded-xl hover:bg-gray-50 transition-all duration-200">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-3 mb-2">
                          <span className="font-mono font-semibold text-lg text-gray-800">
                            {phone.number}
                          </span>
                          {phone.country && phone.region && (
                            <div className="flex items-center space-x-2">
                              <span className="text-xl">{getCountryFlag(phone.region)}</span>
                              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                                {phone.country}
                              </span>
                            </div>
                          )}
                          <button
                            onClick={() => navigator.clipboard.writeText(phone.number)}
                            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 transition-opacity"
                            title="Copy phone number"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                        </div>
                        
                        {phone.label && (
                          <div className="text-sm text-gray-600 mb-2">
                            <span className="font-medium">Label:</span> {phone.label}
                          </div>
                        )}
                        
                        <div className="flex items-center space-x-2 flex-wrap">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getPhoneTypeColor(phone.type)}`}>
                            {phone.type.charAt(0).toUpperCase() + phone.type.slice(1)}
                          </span>
                          {phone.isPrimary && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-300">
                              <Star className="h-3 w-3 mr-1 fill-current" />
                              Primary
                            </span>
                          )}
                          {phone.isValid === false ? (
                            <div className="inline-flex items-center space-x-1 text-red-600">
                              <AlertTriangle className="h-4 w-4" />
                              <span className="text-xs font-medium">Invalid Format</span>
                            </div>
                          ) : (
                            <div className="inline-flex items-center space-x-1 text-green-600">
                              <CheckCircle className="h-4 w-4" />
                              <span className="text-xs font-medium">Valid</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 ml-4">
                        <a
                          href={`tel:${phone.number}`}
                          className="inline-flex items-center px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                        >
                          <Phone className="h-4 w-4 mr-1" />
                          Call
                        </a>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="p-8 text-center text-gray-500 bg-gray-50 rounded-xl">
                    <Phone className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                    <p className="font-medium">No phone numbers available</p>
                    <p className="text-sm mt-1">Add phone numbers to improve contact reachability</p>
                  </div>
                )}
              </div>
            </div>
            
            {/* Email Addresses */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Mail className="h-5 w-5 text-green-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Email Addresses</h3>
                  <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                    {contact.emails.length}
                  </span>
                </div>
                <div className="text-sm text-gray-600">
                  {validEmails.length}/{contact.emails.length} valid
                </div>
              </div>
              
              <div className="space-y-3">
                {contact.emails.length > 0 ? contact.emails.map(email => (
                  <div key={email.id} className="group p-4 border border-gray-200 rounded-xl hover:bg-gray-50 transition-all duration-200">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-3 mb-2">
                          <span className="font-mono text-lg text-gray-800 truncate">
                            {email.address}
                          </span>
                          <button
                            onClick={() => navigator.clipboard.writeText(email.address)}
                            className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 transition-opacity"
                            title="Copy email address"
                          >
                            <Copy className="h-4 w-4" />
                          </button>
                        </div>
                        
                        <div className="flex items-center space-x-2 flex-wrap">
                          {email.isPrimary && (
                            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-300">
                              <Star className="h-3 w-3 mr-1 fill-current" />
                              Primary
                            </span>
                          )}
                          {email.isValid === false ? (
                            <div className="inline-flex items-center space-x-1 text-red-600">
                              <AlertTriangle className="h-4 w-4" />
                              <span className="text-xs font-medium">Invalid Format</span>
                            </div>
                          ) : (
                            <div className="inline-flex items-center space-x-1 text-green-600">
                              <CheckCircle className="h-4 w-4" />
                              <span className="text-xs font-medium">Valid</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2 ml-4">
                        <a
                          href={`mailto:${email.address}`}
                          className="inline-flex items-center px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                        >
                          <Mail className="h-4 w-4 mr-1" />
                          Email
                        </a>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="p-8 text-center text-gray-500 bg-gray-50 rounded-xl">
                    <Mail className="h-12 w-12 mx-auto mb-3 text-gray-400" />
                    <p className="font-medium">No email addresses available</p>
                    <p className="text-sm mt-1">Add email addresses to improve contact reachability</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Address Information */}
          {(displayAddress || contact.officeAddress) && (
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100">
              <div className="flex items-center space-x-2 mb-4">
                <Building className="h-5 w-5 text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-900">Address Information</h3>
                {parentContactData && !contact.address && (
                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded-full">
                    Inherited from parent contact
                  </span>
                )}
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {displayAddress && (
                  <div className="bg-white rounded-lg p-4 border border-blue-200">
                    <div className="flex items-center space-x-2 mb-3">
                      <Home className="h-4 w-4 text-blue-600" />
                      <span className="font-medium text-gray-900">Residential Address</span>
                    </div>
                    <div className="text-sm text-gray-700 space-y-1">
                      <p>{displayAddress}</p>
                      {displaySuburb && <p>Suburb: {displaySuburb}</p>}
                      <p>
                        {displayCity}{displayState ? `, ${displayState}` : ''} {displayPincode}
                      </p>
                      {displayCountry && <p>{displayCountry}</p>}
                    </div>
                  </div>
                )}
                
                {contact.officeAddress && (
                  <div className="bg-white rounded-lg p-4 border border-blue-200">
                    <div className="flex items-center space-x-2 mb-3">
                      <Building className="h-4 w-4 text-blue-600" />
                      <span className="font-medium text-gray-900">Office Address</span>
                    </div>
                    <div className="text-sm text-gray-700">
                      <p>{contact.officeAddress}</p>
                    </div>
                  </div>
                )}
                
                {contact.address2 && (
                  <div className="bg-white rounded-lg p-4 border border-blue-200">
                    <div className="flex items-center space-x-2 mb-3">
                      <MapPin className="h-4 w-4 text-blue-600" />
                      <span className="font-medium text-gray-900">Additional Address</span>
                    </div>
                    <div className="text-sm text-gray-700">
                      <p>{contact.address2}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Related Contacts */}
          {loading ? (
            <div className="bg-gray-50 rounded-xl p-6 border text-center">
              <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2 text-blue-600" />
              <p className="text-gray-600">Loading related contacts...</p>
            </div>
          ) : relatedContacts.length > 0 && (
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 border border-green-100">
              <div className="flex items-center space-x-2 mb-4">
                <Users className="h-5 w-5 text-green-600" />
                <h3 className="text-lg font-semibold text-gray-900">Related Contacts</h3>
                <span className="text-sm text-gray-500 bg-green-100 px-2 py-1 rounded-full">
                  {relatedContacts.length}
                </span>
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {relatedContacts.map(relContact => (
                  <div key={relContact.id} className="bg-white rounded-lg p-4 border border-green-200 hover:shadow-md transition-shadow">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold text-gray-900">{relContact.name}</h4>
                        {relContact.relationships?.[0] && (
                          <span className={`px-3 py-1 rounded-full text-xs font-medium border ${
                            getRelationshipTypeColor(relContact.relationships[0].relationshipType)
                          }`}>
                            {formatRelationshipType(relContact.relationships[0].relationshipType)}
                          </span>
                        )}
                      </div>
                      
                      {relContact.alternateNames && relContact.alternateNames.length > 0 && (
                        <div className="text-xs text-gray-500">
                          <span className="font-medium">Original name:</span> {relContact.alternateNames[0]}
                        </div>
                      )}
                      
                      {relContact.phones.length > 0 && (
                        <div className="space-y-1">
                          {relContact.phones.slice(0, 2).map(phone => (
                            <div key={phone.id} className="flex items-center space-x-2 text-sm">
                              <Phone className="h-3 w-3 text-gray-400" />
                              <span className="font-mono">{phone.number}</span>
                              {phone.country && phone.region && (
                                <span className="text-xs">{getCountryFlag(phone.region)}</span>
                              )}
                              <span className={`px-2 py-1 rounded text-xs border ${getPhoneTypeColor(phone.type)}`}>
                                {phone.type}
                              </span>
                            </div>
                          ))}
                          {relContact.phones.length > 2 && (
                            <div className="text-xs text-gray-500 ml-5">
                              +{relContact.phones.length - 2} more phone numbers
                            </div>
                          )}
                        </div>
                      )}
                      
                      {relContact.emails.length > 0 && (
                        <div className="space-y-1">
                          {relContact.emails.slice(0, 1).map(email => (
                            <div key={email.id} className="flex items-center space-x-2 text-sm">
                              <Mail className="h-3 w-3 text-gray-400" />
                              <span className="font-mono truncate">{email.address}</span>
                              {email.isValid === false && (
                                <AlertTriangle className="h-3 w-3 text-red-500" />
                              )}
                            </div>
                          ))}
                          {relContact.emails.length > 1 && (
                            <div className="text-xs text-gray-500 ml-5">
                              +{relContact.emails.length - 1} more email addresses
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

            {/* Child Contacts or Parent Contact */}
            {contact.isMainContact && contact.childContacts && contact.childContacts.length > 0 ? (
              <div className="bg-gradient-to-br from-yellow-50 to-amber-50 rounded-xl p-6 border border-amber-100">
                <div className="flex items-center space-x-2 mb-4">
                  <Users className="h-5 w-5 text-amber-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Child Contacts</h3>
                  <span className="text-sm text-gray-500 bg-amber-100 px-2 py-1 rounded-full">
                    {contact.childContacts.length}
                  </span>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {contact.childContacts.map(child => (
                    <div
                      key={child.id}
                      onClick={() => setCurrentContact(child)}
                      className="bg-white rounded-lg p-4 border border-amber-200 hover:shadow-md hover:cursor-pointer transition-shadow"
                    >
                      <h4 className="font-semibold text-gray-900">{child.name}</h4>
                      {child.phones && child.phones.length > 0 ? (
                        <div className="flex items-center space-x-2 mt-2">
                          <Phone className="h-4 w-4 text-amber-600" />
                          <span className="font-mono text-sm text-gray-700">{child.phones[0].number}</span>
                          {child.phones[0].country && child.phones[0].region && (
                            <span className="text-xl">{getCountryFlag(child.phones[0].region)}</span>
                          )}
                          <span className={`px-2 py-1 rounded text-xs border ${getPhoneTypeColor(child.phones[0].type)}`}>
                            {child.phones[0].type.charAt(0).toUpperCase() + child.phones[0].type.slice(1)}
                          </span>
                        </div>
                      ) : (
                        <div className="text-sm text-gray-400 mt-2">No phone number available</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : parentContactData ? (
              <div className="bg-gradient-to-br from-yellow-50 to-amber-50 rounded-xl p-6 border border-amber-100">
                <div className="flex items-center space-x-2 mb-4">
                  <User className="h-5 w-5 text-amber-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Parent Contact</h3>
                </div>
                <div
                  onClick={() => setCurrentContact(parentContactData)}
                  className="bg-white rounded-lg p-4 border border-amber-200 hover:shadow-md hover:cursor-pointer transition-shadow"
                >
                  <h4 className="font-semibold text-gray-900">{parentContactData.name}</h4>
                  {parentContactData.phones && parentContactData.phones.length > 0 ? (
                    <div className="flex items-center space-x-2 mt-2">
                      <Phone className="h-4 w-4 text-amber-600" />
                      <span className="font-mono text-sm text-gray-700">{parentContactData.phones[0].number}</span>
                      {parentContactData.phones[0].country && parentContactData.phones[0].region && (
                        <span className="text-xl">{getCountryFlag(parentContactData.phones[0].region)}</span>
                      )}
                      <span className={`px-2 py-1 rounded text-xs border ${getPhoneTypeColor(parentContactData.phones[0].type)}`}>
                        {parentContactData.phones[0].type.charAt(0).toUpperCase() + parentContactData.phones[0].type.slice(1)}
                      </span>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-400 mt-2">No phone number available</div>
                  )}
                  {/* Show full address info */}
                  {(parentContactData.address ||
                    parentContactData.city ||
                    parentContactData.state ||
                    parentContactData.country ||
                    parentContactData.pincode ||
                    parentContactData.suburb) && (
                    <div className="mt-4 text-sm text-gray-700 space-y-1">
                      {parentContactData.address && <p><span className="font-medium">Address:</span> {parentContactData.address}</p>}
                      {parentContactData.suburb && <p><span className="font-medium">Suburb:</span> {parentContactData.suburb}</p>}
                      {(parentContactData.city || parentContactData.state) && (
                        <p>
                          <span className="font-medium">City/State:</span> {parentContactData.city}{parentContactData.state ? `, ${parentContactData.state}` : ''}
                        </p>
                      )}
                      {parentContactData.pincode && <p><span className="font-medium">Pincode:</span> {parentContactData.pincode}</p>}
                      {parentContactData.country && <p><span className="font-medium">Country:</span> {parentContactData.country}</p>}
                    </div>
                  )}
                  {/* <div className="text-xs text-gray-500 mt-1">Click to view details</div> */}
                </div>
              </div>
            ) : null}


          {/* Tags and Categories */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Tags */}
            {contact.tags && contact.tags.length > 0 && (
              <div className="bg-gradient-to-br from-purple-50 to-violet-50 rounded-xl p-6 border border-purple-100">
                <div className="flex items-center space-x-2 mb-4">
                  <Tag className="h-5 w-5 text-purple-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Tags</h3>
                  <span className="text-sm text-gray-500 bg-purple-100 px-2 py-1 rounded-full">
                    {contact.tags.length}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {contact.tags.map((tag, index) => (
                    <span key={index} className="inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium bg-purple-100 text-purple-800 border border-purple-300">
                      {getTagDisplayName(tag)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Category */}
            {contact.category && (
              <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl p-6 border border-indigo-100">
                <div className="flex items-center space-x-2 mb-4">
                  <FileText className="h-5 w-5 text-indigo-600" />
                  <h3 className="text-lg font-semibold text-gray-900">Categories</h3>
                </div>
                <div className="flex flex-wrap gap-2">
                  {contact.category.split(',').map((cat, index) => (
                    <span key={index} className="inline-flex items-center px-3 py-2 rounded-lg text-sm font-medium bg-indigo-100 text-indigo-800 border border-indigo-300">
                      {cat.trim()}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          {contact.notes && (
            <div className="bg-gradient-to-br from-gray-50 to-slate-50 rounded-xl p-6 border border-gray-200">
              <div className="flex items-center space-x-2 mb-4">
                <FileText className="h-5 w-5 text-gray-600" />
                <h3 className="text-lg font-semibold text-gray-900">Notes</h3>
              </div>
              <div className="bg-white rounded-lg p-4 border border-gray-200">
                <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{contact.notes}</p>
              </div>
            </div>
          )}

          {/* Data Quality Summary */}
          <div className="bg-gradient-to-br from-slate-50 to-gray-50 rounded-xl p-6 border border-slate-200">
            <div className="flex items-center space-x-2 mb-4">
              <Activity className="h-5 w-5 text-slate-600" />
              <h3 className="text-lg font-semibold text-gray-900">Data Quality & Analytics</h3>
            </div>
            
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
              <div className="bg-white rounded-lg p-4 text-center border border-slate-200">
                <div className={`text-2xl font-bold mb-1 ${
                  qualityScore >= 80 ? 'text-green-600' : 
                  qualityScore >= 60 ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  {qualityScore}%
                </div>
                <div className="text-xs text-gray-600">Overall Quality</div>
              </div>
              
              <div className="bg-white rounded-lg p-4 text-center border border-slate-200">
                <div className={`text-2xl font-bold mb-1 ${
                  validPhones.length === contact.phones.length ? 'text-green-600' : 
                  validPhones.length > 0 ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  {validPhones.length}/{contact.phones.length}
                </div>
                <div className="text-xs text-gray-600">Valid Phones</div>
              </div>
              
              <div className="bg-white rounded-lg p-4 text-center border border-slate-200">
                <div className={`text-2xl font-bold mb-1 ${
                  validEmails.length === contact.emails.length ? 'text-green-600' : 
                  validEmails.length > 0 ? 'text-yellow-600' : 'text-red-600'
                }`}>
                  {validEmails.length}/{contact.emails.length}
                </div>
                <div className="text-xs text-gray-600">Valid Emails</div>
              </div>
              
              <div className="bg-white rounded-lg p-4 text-center border border-slate-200">
                <div className={`text-2xl font-bold mb-1 ${
                  relatedContacts.length > 0 ? 'text-blue-600' : 'text-gray-400'
                }`}>
                  {relatedContacts.length}
                </div>
                <div className="text-xs text-gray-600">Related Contacts</div>
              </div>
              
              <div className="bg-white rounded-lg p-4 text-center border border-slate-200">
                <div className={`text-2xl font-bold mb-1 ${
                  contact.relationships && contact.relationships.length > 0 ? 'text-purple-600' : 'text-gray-400'
                }`}>
                  {contact.relationships?.length || 0}
                </div>
                <div className="text-xs text-gray-600">Relationships</div>
              </div>
              
              <div className="bg-white rounded-lg p-4 text-center border border-slate-200">
                <div className={`text-2xl font-bold mb-1 ${
                  contact.lastUpdated && new Date(contact.lastUpdated) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) ? 'text-green-600' : 'text-gray-600'
                }`}>
                  {contact.lastUpdated ? Math.floor((Date.now() - new Date(contact.lastUpdated).getTime()) / (1000 * 60 * 60 * 24)) : 'N/A'}
                </div>
                <div className="text-xs text-gray-600">Days Since Update</div>
              </div>
            </div>
          </div>
        </div>
        
        {/* Enhanced Footer */}
        <div className="sticky bottom-0 bg-gradient-to-r from-gray-50 to-slate-50 p-6 border-t border-gray-200 rounded-b-2xl">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="text-sm text-gray-500">
              {contact.lastUpdated && (
                <span>Last updated: {new Date(contact.lastUpdated).toLocaleDateString('en-IN', {
                  year: 'numeric',
                  month: 'long', 
                  day: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}</span>
              )}
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={onClose}
                className="px-6 py-3 text-gray-700 border border-gray-300 rounded-xl hover:bg-gray-50 transition-colors font-medium"
              >
                Close
              </button>
            <button
            onClick={() => setEditing(true)}
            className="px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 font-medium flex items-center shadow-lg"
            >
            <Edit3 className="h-4 w-4 mr-2" />
            Edit Contact
            </button>

            </div>
          </div>
        </div>
      </div>
        {editing && (
        <EditContactModal
        contact={currentContact}
        parentContact={parentContactData || null}
        onCancel={() => setEditing(false)}
        onSaved={({ contact: updated, parentContact }) => {
          setCurrentContact(updated);
          if (parentContact) setParentContactData(parentContact);
          // Rebuild related if parent/child flags changed:
          const related = allContacts.filter(c =>
            c.parentContactId === updated.id ||
            (updated.parentContactId && c.parentContactId === updated.parentContactId && c.id !== updated.id)
          );
          setRelatedContacts(related);
          setEditing(false);
        }}
        />
        )}
    </div>
  );
};

export default ContactDetailModal;