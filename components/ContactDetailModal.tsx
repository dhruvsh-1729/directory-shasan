// components/ContactDetailModal.tsx
import React from 'react';
import { Contact } from '@/types';
import { Edit3, X, Globe, AlertTriangle, CheckCircle, Phone, Mail, MapPin, User, Users } from 'lucide-react';

interface ContactDetailModalProps {
  contact: Contact;
  onClose: () => void;
  allContacts: Contact[];
}

const ContactDetailModal: React.FC<ContactDetailModalProps> = ({ contact, onClose, allContacts }) => {
  const relatedContacts = allContacts.filter(c => 
    c.parentContactId === contact.id || 
    (contact.parentContactId && c.parentContactId === contact.parentContactId && c.id !== contact.id)
  );

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const getCountryFlag = (region?: string) => {
    const flags: { [key: string]: string } = {
      'IN': '🇮🇳',
      'US': '🇺🇸',
      'UK': '🇬🇧',
      'CA': '🇨🇦',
      'AU': '🇦🇺',
      'XX': '🌍'
    };
    return flags[region || 'XX'] || '🌍';
  };

  const getPhoneTypeColor = (type: string) => {
    const colors = {
      mobile: 'bg-green-100 text-green-800',
      office: 'bg-blue-100 text-blue-800',
      residence: 'bg-purple-100 text-purple-800',
      fax: 'bg-orange-100 text-orange-800',
      other: 'bg-gray-100 text-gray-800'
    };
    return colors[type as keyof typeof colors] || colors.other;
  };

  const getRelationshipTypeColor = (type: string) => {
    const colors = {
      spouse: 'bg-pink-100 text-pink-800',
      child: 'bg-blue-100 text-blue-800',
      parent: 'bg-green-100 text-green-800',
      sibling: 'bg-yellow-100 text-yellow-800',
      friend: 'bg-indigo-100 text-indigo-800',
      colleague: 'bg-cyan-100 text-cyan-800',
      extended_family: 'bg-teal-100 text-teal-800',
      related: 'bg-gray-100 text-gray-800'
    };
    return colors[type as keyof typeof colors] || colors.related;
  };

  const formatRelationshipType = (type: string) => {
    return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  };

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-lg max-w-5xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b sticky top-0 bg-white rounded-t-lg">
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="flex items-center space-x-3">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  contact.isMainContact ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                }`}>
                  {contact.isMainContact ? <User className="h-6 w-6" /> : <Users className="h-6 w-6" />}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">{contact.name}</h2>
                  {contact.alternateNames && contact.alternateNames.length > 0 && (
                    <div className="mt-1">
                      <span className="text-sm text-gray-500">Also known as: </span>
                      <span className="text-sm text-gray-700">
                        {contact.alternateNames.join(', ')}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center space-x-2 mt-2">
                    {!contact.isMainContact && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Related Contact
                      </span>
                    )}
                    {contact.city && contact.state && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        <MapPin className="h-3 w-3 mr-1" />
                        {contact.city}, {contact.state}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-full transition-colors"
            >
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>
        
        <div className="p-6 space-y-8">
          {/* Contact Information Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Phone Numbers */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Phone className="h-5 w-5 text-gray-600" />
                <h3 className="text-lg font-semibold text-gray-900">Phone Numbers</h3>
                <span className="text-sm text-gray-500">({contact.phones.length})</span>
              </div>
              <div className="space-y-3">
                {contact.phones.length > 0 ? contact.phones.map(phone => (
                  <div key={phone.id} className="group p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-1">
                          <span className="font-mono font-medium text-lg">{phone.number}</span>
                          {phone.country && phone.region && (
                            <div className="flex items-center space-x-1">
                              <span className="text-lg">{getCountryFlag(phone.region)}</span>
                              <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                                {phone.country}
                              </span>
                            </div>
                          )}
                        </div>
                        {phone.label && (
                          <div className="text-sm text-gray-600 mb-2">
                            <span className="font-medium">Label:</span> {phone.label}
                          </div>
                        )}
                        <div className="flex items-center space-x-2">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getPhoneTypeColor(phone.type)}`}>
                            {phone.type.charAt(0).toUpperCase() + phone.type.slice(1)}
                          </span>
                          {phone.isPrimary && (
                            <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-xs font-medium">
                              Primary
                            </span>
                          )}
                          {phone.isValid === false && (
                            <div className="flex items-center space-x-1 text-red-600">
                              <AlertTriangle className="h-4 w-4" />
                              <span className="text-xs">Invalid format</span>
                            </div>
                          )}
                          {phone.isValid === true && (
                            <div className="flex items-center space-x-1 text-green-600">
                              <CheckCircle className="h-4 w-4" />
                              <span className="text-xs">Valid</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="p-8 text-center text-gray-500 bg-gray-50 rounded-lg">
                    <Phone className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                    <p className="italic">No phone numbers available</p>
                  </div>
                )}
              </div>
            </div>
            
            {/* Email Addresses */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Mail className="h-5 w-5 text-gray-600" />
                <h3 className="text-lg font-semibold text-gray-900">Email Addresses</h3>
                <span className="text-sm text-gray-500">({contact.emails.length})</span>
              </div>
              <div className="space-y-3">
                {contact.emails.length > 0 ? contact.emails.map(email => (
                  <div key={email.id} className="group p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2 mb-2">
                          <span className="font-mono text-lg truncate">{email.address}</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          {email.isPrimary && (
                            <span className="bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-xs font-medium">
                              Primary
                            </span>
                          )}
                          {email.isValid === false && (
                            <div className="flex items-center space-x-1 text-red-600">
                              <AlertTriangle className="h-4 w-4" />
                              <span className="text-xs">Invalid format</span>
                            </div>
                          )}
                          {email.isValid !== false && (
                            <div className="flex items-center space-x-1 text-green-600">
                              <CheckCircle className="h-4 w-4" />
                              <span className="text-xs">Valid</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="p-8 text-center text-gray-500 bg-gray-50 rounded-lg">
                    <Mail className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                    <p className="italic">No email addresses available</p>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Related Contacts */}
          {relatedContacts.length > 0 && (
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Users className="h-5 w-5 text-gray-600" />
                <h3 className="text-lg font-semibold text-gray-900">Related Contacts</h3>
                <span className="text-sm text-gray-500">({relatedContacts.length})</span>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {relatedContacts.map(relContact => (
                  <div key={relContact.id} className="p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="font-semibold text-gray-900">{relContact.name}</h4>
                        {relContact.relationships?.[0] && (
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
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
                              <span className={`px-2 py-1 rounded text-xs ${getPhoneTypeColor(phone.type)}`}>
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
          
          {/* Data Quality Summary */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Data Quality Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 border rounded-lg text-center">
                <div className="text-2xl font-bold text-blue-600">{contact.phones.length}</div>
                <div className="text-sm text-gray-600">Phone Numbers</div>
                <div className="text-xs text-gray-500 mt-1">
                  {contact.phones.filter(p => p.isValid !== false).length} valid
                </div>
              </div>
              
              <div className="p-4 border rounded-lg text-center">
                <div className="text-2xl font-bold text-green-600">{contact.emails.length}</div>
                <div className="text-sm text-gray-600">Email Addresses</div>
                <div className="text-xs text-gray-500 mt-1">
                  {contact.emails.filter(e => e.isValid !== false).length} valid
                </div>
              </div>
              
              <div className="p-4 border rounded-lg text-center">
                <div className="text-2xl font-bold text-purple-600">{relatedContacts.length}</div>
                <div className="text-sm text-gray-600">Related Contacts</div>
                <div className="text-xs text-gray-500 mt-1">
                  {contact.relationships?.length || 0} relationships
                </div>
              </div>
            </div>
          </div>

          {/* Tags and Notes */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {contact.tags && contact.tags.length > 0 && (
            <div className="mt-3">
              <h4 className="text-xs font-semibold text-gray-700 mb-2">Tags</h4>
              <div className="flex flex-wrap gap-1">
                {contact.tags.map((tag, index) => {
                  // Expand abbreviations to full form
                  let expandedTag = tag;
                  if (tag === 'G') expandedTag = 'GuruBhakt';
                  else if (tag === 'SP') expandedTag = 'Sansari Parivarjan';
                  else if (tag === 'GM') expandedTag = 'Gruh Mandir';
                  else if (tag === 'AS') expandedTag = 'Anya Samuday';
                  else if (tag === 'MM') expandedTag = 'Mangal Murti';
                  else if (tag === 'VIP') expandedTag = 'VIP';
                  
                  return (
                    <span key={index} className="bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full text-xs">
                      {expandedTag}
                    </span>
                  );
                })}
              </div>
            </div>
          )}

            {contact.notes && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900">Notes</h3>
                <div className="p-4 border rounded-lg bg-gray-50">
                  <p className="text-gray-700 whitespace-pre-wrap text-sm leading-relaxed">{contact.notes}</p>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* Footer */}
        <div className="p-6 border-t bg-gray-50 flex justify-between items-center sticky bottom-0 rounded-b-lg">
          <div className="text-sm text-gray-500">
            {contact.lastUpdated && (
              <span>Last updated: {new Date(contact.lastUpdated).toLocaleString()}</span>
            )}
          </div>
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              className="px-6 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Close
            </button>
            <button className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center">
              <Edit3 className="h-4 w-4 mr-2" />
              Edit Contact
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContactDetailModal;