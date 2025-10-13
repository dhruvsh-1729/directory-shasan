// components/ContactCard.tsx
import React, { useState } from 'react';
import { Contact } from '@/types';
import { 
  User, Users, Phone, Mail, MapPin, ChevronDown, ChevronUp, 
  AlertTriangle, CheckCircle, Globe, Building, Home, Trash2,
  Edit3, Eye, Copy, ExternalLink, Star
} from 'lucide-react';
import ContactAvatar from './ContactAvatar';

interface ContactCardProps {
  contact: Contact;
  onSelect: () => void;
  onDelete?: () => void;
  isSelected: boolean;
  showValidation?: boolean;
}

const ContactCard: React.FC<ContactCardProps> = ({ 
  contact, 
  onSelect, 
  onDelete,
  isSelected, 
  showValidation = true 
}) => {
  const [expanded, setExpanded] = useState(false);
  
  const validPhones = contact.phones.filter(p => p.isValid !== false);
  const validEmails = contact.emails.filter(e => e.isValid !== false);
  const hasValidationIssues = contact.phones.some(p => p.isValid === false) || 
                             contact.emails.some(e => e.isValid === false);

  const primaryPhone = contact.phones.find(p => p.isPrimary) || contact.phones[0];
  const primaryEmail = contact.emails.find(e => e.isPrimary) || contact.emails[0];

  const getCountryFlag = (region?: string) => {
    const flags: { [key: string]: string } = {
      'IN': '🇮🇳', 'US': '🇺🇸', 'UK': '🇬🇧', 'CA': '🇨🇦', 'AU': '🇦🇺'
    };
    return flags[region || ''] || '🌍';
  };

  const getPhoneTypeColor = (type: string) => {
    const colors = {
      mobile: 'bg-green-100 text-green-800 border-green-200',
      office: 'bg-blue-100 text-blue-800 border-blue-200',
      residence: 'bg-purple-100 text-purple-800 border-purple-200',
      fax: 'bg-orange-100 text-orange-800 border-orange-200',
      other: 'bg-gray-100 text-gray-800 border-gray-200'
    };
    return colors[type as keyof typeof colors] || colors.other;
  };

  const getLocationDisplay = () => {
    const parts = [];
    if (contact.address) parts.push(contact.address);
    if (contact.suburb) parts.push(contact.suburb);
    if (contact.city) parts.push(contact.city);
    if (contact.state) parts.push(contact.state);
    if (contact.country) parts.push(contact.country);
    return parts.join(', ');
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

  return (
    <div
      className={`bg-white/90 backdrop-blur-sm rounded-xl shadow-sm border transition-all duration-300 hover:shadow-lg hover:border-blue-200/50 
      ${isSelected ? 'ring-2 ring-blue-500 border-blue-300 shadow-lg transform scale-[1.01]' : 'border-gray-200'}
      ${!contact.isMainContact ? 'border-l-4 border-l-green-400' : ''}`}
    >
      {/* Main Row - Always Visible */}
      <div className="p-4" onClick={onSelect}>
      <div className="flex items-center">
        {/* Avatar and Name Section - Fixed Width */}
        <div className="flex items-center w-240 min-w-0 mr-4">
        <div className="relative flex-shrink-0">
          <ContactAvatar contact={contact} size={72} />
          <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center ${
          contact.isMainContact 
          ? 'bg-blue-500 text-white' 
          : 'bg-green-500 text-white'
          }`}>
          {contact.isMainContact ? <User className="h-3 w-3" /> : <Users className="h-3 w-3" />}
          </div>
        </div>
        <div className="ml-3 min-w-0 flex-1">
          <div className="flex items-center">
          <h3 className="text-sm font-semibold text-gray-900 truncate mr-2">{contact.name}</h3>
          {!contact.isMainContact && (
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-200 flex-shrink-0">
            Related
            </span>
          )}
          {contact.duplicateGroup && (
            <span className="ml-2 text-yellow-500 flex-shrink-0" title="Potential duplicate">
            <AlertTriangle className="h-4 w-4" />
            </span>
          )}
          {hasValidationIssues && showValidation && (
            <span className="ml-2 text-red-500 flex-shrink-0" title="Validation issues">
            <AlertTriangle className="h-4 w-4" />
            </span>
          )}
          </div>
          <div className="text-xs text-gray-500 flex items-center truncate mt-1">
          {contact.status && (
            <>
            <span className="font-medium">{contact.status}</span>
            {getLocationDisplay() && <span className="mx-1">•</span>}
            </>
          )}
          {getLocationDisplay() && (
            <span className="flex items-center truncate">
            <MapPin className="h-3 w-3 mr-1 flex-shrink-0" />
            <span className="truncate">{getLocationDisplay()}</span>
            </span>
          )}
          </div>
        </div>
        </div>
        
        {/* Phone Section - Fixed Width */}
        <div className="w-56 flex-shrink-0 mr-4">
        {primaryPhone ? (
          <div className="flex items-center text-xs bg-gray-50 px-3 py-2 rounded-lg border">
          <Phone className="h-3 w-3 text-gray-400 mr-2 flex-shrink-0" />
          <span className="font-mono text-gray-700 truncate flex-1">{primaryPhone.number}</span>
          {primaryPhone.country && primaryPhone.region && (
            <span className="ml-2 text-sm flex-shrink-0">{getCountryFlag(primaryPhone.region)}</span>
          )}
          {primaryPhone.isValid === false && (
            <AlertTriangle className="h-3 w-3 text-red-500 ml-2 flex-shrink-0" />
          )}
          </div>
        ) : (
          <div className="flex items-center text-xs text-gray-400 px-3 py-2">
          <Phone className="h-3 w-3 mr-2" />
          <span>No phone</span>
          </div>
        )}
        </div>

        {/* Email Section - Fixed Width */}
        <div className="w-64 flex-shrink-0 mr-4">
        {primaryEmail ? (
          <div className="flex items-center text-xs bg-gray-50 px-3 py-2 rounded-lg border">
          <Mail className="h-3 w-3 text-gray-400 mr-2 flex-shrink-0" />
          <span className="font-mono text-gray-700 truncate flex-1">{primaryEmail.address}</span>
          {primaryEmail.isValid === false && (
            <AlertTriangle className="h-3 w-3 text-red-500 ml-2 flex-shrink-0" />
          )}
          </div>
        ) : (
          <div className="flex items-center text-xs text-gray-400 px-3 py-2">
          <Mail className="h-3 w-3 mr-2" />
          <span>No email</span>
          </div>
        )}
        </div>
        
        {/* Status Indicators - Fixed Width */}
        <div className="w-32 flex items-center space-x-1 flex-shrink-0 mr-4">
        <div className={`px-2 py-1 rounded-full flex items-center border text-xs ${
          validPhones.length === contact.phones.length 
          ? 'bg-green-100 text-green-800 border-green-200' 
          : validPhones.length > 0 
            ? 'bg-yellow-100 text-yellow-800 border-yellow-200'
            : 'bg-red-100 text-red-800 border-red-200'
        }`}>
          <Phone className="h-3 w-3 mr-1" />
          <span className="font-medium">{validPhones.length}/{contact.phones.length}</span>
        </div>
        <div className={`px-2 py-1 rounded-full flex items-center border text-xs ${
          validEmails.length === contact.emails.length 
          ? 'bg-green-100 text-green-800 border-green-200' 
          : validEmails.length > 0 
            ? 'bg-yellow-100 text-yellow-800 border-yellow-200'
            : 'bg-red-100 text-red-800 border-red-200'
        }`}>
          <Mail className="h-3 w-3 mr-1" />
          <span className="font-medium">{validEmails.length}/{contact.emails.length}</span>
        </div>
        </div>
        
        {/* Action Buttons - Fixed Width */}
        <div className="w-24 flex items-center justify-end space-x-1 flex-shrink-0">
        {onDelete && (
          <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="text-red-400 hover:text-red-600 p-2 hover:bg-red-50 rounded-lg transition-colors"
          title="Delete contact"
          >
          <Trash2 className="h-4 w-4" />
          </button>
        )}
        <button
          onClick={(e) => {
          e.stopPropagation();
          setExpanded(!expanded);
          }}
          className="text-gray-400 hover:text-gray-600 p-2 hover:bg-gray-100 rounded-lg transition-colors"
          title={expanded ? "Show less" : "Show more"}
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-4">
        
        {/* Address Information */}
        {(contact.address || contact.officeAddress) && (
          <div className="bg-gray-50 rounded-lg p-3">
          <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center">
            <Building className="h-4 w-4 mr-2 text-gray-500" />
            Address Information
          </h4>
          <div className="space-y-2 text-sm text-gray-600">
            {contact.address && (
            <div>
              <span className="font-medium text-gray-700">Home:</span>
              <p className="mt-1">{contact.address}</p>
              {contact.suburb && <p>Suburb: {contact.suburb}</p>}
              <p>{contact.city}{contact.state ? `, ${contact.state}` : ''} {contact.pincode}</p>
              {contact.country && <p>{contact.country}</p>}
            </div>
            )}
            {contact.officeAddress && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <span className="font-medium text-gray-700">Office:</span>
              <p className="mt-1">{contact.officeAddress}</p>
            </div>
            )}
            {contact.address2 && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <span className="font-medium text-gray-700">Additional:</span>
              <p className="mt-1">{contact.address2}</p>
            </div>
            )}
          </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Phone Numbers */}
          {contact.phones.length > 0 && (
          <div className="bg-blue-50 rounded-lg p-3">
            <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
            <Phone className="h-4 w-4 mr-2 text-blue-600" />
            Phone Numbers ({contact.phones.length})
            </h4>
            <div className="space-y-2">
            {contact.phones.map(phone => (
              <div key={phone.id} className="flex items-center justify-between p-2 bg-white rounded-lg border border-blue-100">
              <div className="flex items-center space-x-2 min-w-0 flex-1">
                <span className="font-mono text-sm text-gray-800">{phone.number}</span>
                {phone.country && phone.region && (
                <span className="text-sm">{getCountryFlag(phone.region)}</span>
                )}
                {showValidation && phone.isValid === false && (
                <AlertTriangle className="h-3 w-3 text-red-500" />
                )}
                {phone.isValid !== false && (
                <CheckCircle className="h-3 w-3 text-green-500" />
                )}
              </div>
              <div className="flex items-center space-x-1 flex-shrink-0">
                <span className={`px-2 py-1 rounded-full text-xs font-medium border ${getPhoneTypeColor(phone.type)}`}>
                {phone.type}
                </span>
                {phone.isPrimary && (
                <Star className="h-3 w-3 text-yellow-500 fill-current" />
                )}
              </div>
              </div>
            ))}
            </div>
          </div>
          )}
          
          {/* Email Addresses */}
          {contact.emails.length > 0 && (
          <div className="bg-green-50 rounded-lg p-3">
            <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
            <Mail className="h-4 w-4 mr-2 text-green-600" />
            Email Addresses ({contact.emails.length})
            </h4>
            <div className="space-y-2">
            {contact.emails.map(email => (
              <div key={email.id} className="flex items-center justify-between p-2 bg-white rounded-lg border border-green-100">
              <div className="flex items-center space-x-2 min-w-0 flex-1">
                <span className="font-mono text-sm text-gray-800 truncate">{email.address}</span>
                {showValidation && email.isValid === false && (
                <AlertTriangle className="h-3 w-3 text-red-500" />
                )}
                {email.isValid !== false && (
                <CheckCircle className="h-3 w-3 text-green-500" />
                )}
              </div>
              <div className="flex items-center space-x-1 flex-shrink-0">
                {email.isPrimary && (
                <Star className="h-3 w-3 text-yellow-500 fill-current" />
                )}
              </div>
              </div>
            ))}
            </div>
          </div>
          )}
        </div>
        
        {/* Tags and Categories */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Tags */}
          {contact.tags && contact.tags.length > 0 && (
          <div className="bg-purple-50 rounded-lg p-3">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Tags</h4>
            <div className="flex flex-wrap gap-2">
            {contact.tags.map((tag, index) => (
              <span key={index} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 border border-purple-200">
              {getTagDisplayName(tag)}
              </span>
            ))}
            </div>
          </div>
          )}

          {/* Category */}
          {contact.category && (
          <div className="bg-indigo-50 rounded-lg p-3">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Category</h4>
            <div className="flex flex-wrap gap-2">
            {contact.category.split(',').map((cat, index) => (
              <span key={index} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 border border-indigo-200">
              {cat.trim()}
              </span>
            ))}
            </div>
          </div>
          )}
        </div>

        {/* Relationships */}
        {contact.relationships && contact.relationships.length > 0 && (
          <div className="bg-orange-50 rounded-lg p-3">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Relationships ({contact.relationships.length})</h4>
          <div className="flex flex-wrap gap-2">
            {contact.relationships.map(rel => (
            <span key={rel.id} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800 border border-orange-200">
              {rel.description || rel.relationshipType.replace(/_/g, ' ')}
            </span>
            ))}
          </div>
          </div>
        )}

        {/* Notes */}
        {contact.notes && (
          <div className="bg-gray-50 rounded-lg p-3">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Notes</h4>
          <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">
            {contact.notes}
          </p>
          </div>
        )}

        {/* Data Quality Summary */}
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-3 border border-blue-100">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">Data Quality Summary</h4>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="text-center">
            <div className={`text-lg font-bold ${
            validPhones.length === contact.phones.length ? 'text-green-600' : 
            validPhones.length > 0 ? 'text-yellow-600' : 'text-red-600'
            }`}>
            {validPhones.length}/{contact.phones.length}
            </div>
            <div className="text-xs text-gray-600">Valid Phones</div>
          </div>
          
          <div className="text-center">
            <div className={`text-lg font-bold ${
            validEmails.length === contact.emails.length ? 'text-green-600' : 
            validEmails.length > 0 ? 'text-yellow-600' : 'text-red-600'
            }`}>
            {validEmails.length}/{contact.emails.length}
            </div>
            <div className="text-xs text-gray-600">Valid Emails</div>
          </div>
          
          <div className="text-center">
            <div className={`text-lg font-bold ${
            contact.relationships && contact.relationships.length > 0 ? 'text-blue-600' : 'text-gray-400'
            }`}>
            {contact.relationships?.length || 0}
            </div>
            <div className="text-xs text-gray-600">Relationships</div>
          </div>
          
          <div className="text-center">
            <div className={`text-lg font-bold ${
            contact.lastUpdated && new Date(contact.lastUpdated) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) ? 'text-green-600' : 'text-gray-600'
            }`}>
            {contact.lastUpdated ? Math.floor((Date.now() - new Date(contact.lastUpdated).getTime()) / (1000 * 60 * 60 * 24)) : 'N/A'}
            </div>
            <div className="text-xs text-gray-600">Days Since Update</div>
          </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="flex flex-wrap gap-2 pt-3 border-t border-gray-100">
          <button 
          onClick={(e) => { e.stopPropagation(); onSelect(); }} 
          className="flex items-center px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
          >
          <Eye className="h-4 w-4 mr-1" />
          View Details
          </button>
          <button 
          onClick={(e) => { e.stopPropagation(); /* Add edit functionality */ }} 
          className="flex items-center px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm font-medium"
          >
          <Edit3 className="h-4 w-4 mr-1" />
          Edit
          </button>
          {primaryPhone && (
          <a 
            href={`tel:${primaryPhone.number}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
          >
            <Phone className="h-4 w-4 mr-1" />
            Call
          </a>
          )}
          {primaryEmail && (
          <a 
            href={`mailto:${primaryEmail.address}`}
            onClick={(e) => e.stopPropagation()}
            className="flex items-center px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm font-medium"
          >
            <Mail className="h-4 w-4 mr-1" />
            Email
          </a>
          )}
        </div>
        </div>
      )}
      </div>
    </div>
  );
};

export default ContactCard;