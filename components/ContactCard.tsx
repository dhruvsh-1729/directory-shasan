// components/ContactCard.tsx
import React, { useState } from 'react';
import { Contact } from '@/types';
import { 
  User, Users, Phone, Mail, MapPin, ChevronDown, ChevronUp, 
  AlertTriangle, CheckCircle, Globe, Building, Home
} from 'lucide-react';

interface ContactCardProps {
  contact: Contact;
  onSelect: () => void;
  isSelected: boolean;
  showValidation?: boolean;
}

const ContactCard: React.FC<ContactCardProps> = ({ 
  contact, 
  onSelect, 
  isSelected, 
  showValidation = true 
}) => {
  const [expanded, setExpanded] = useState(false);
  
  const validPhones = contact.phones.filter(p => p.isValid !== false);
  const validEmails = contact.emails.filter(e => e.isValid !== false);
  const hasValidationIssues = contact.phones.some(p => p.isValid === false) || 
                             contact.emails.some(e => e.isValid === false);

  return (
    <div
      className={`bg-white rounded-lg shadow-sm border transition-all duration-200 
        ${isSelected ? 'ring-2 ring-blue-500 border-blue-200' : 'border-gray-200'}
        ${!contact.isMainContact ? 'border-l-2 border-l-green-300' : ''}`}
    >
      {/* Main Row - Always Visible */}
      <div className="p-3 flex items-center" onClick={onSelect}>
        {/* Avatar/Icon */}
        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 
          ${contact.isMainContact ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
          {contact.isMainContact ? <User className="h-4 w-4" /> : <Users className="h-4 w-4" />}
        </div>
        
        {/* Name & Location */}
        <div className="ml-3 min-w-0 flex-1">
          <div className="flex items-center">
            <h3 className="text-sm font-semibold text-gray-900 truncate">{contact.name}</h3>
            {!contact.isMainContact && (
              <span className="ml-2 bg-green-100 text-green-800 px-1.5 py-0.5 rounded-full text-xs font-medium">
                Related
              </span>
            )}
            {hasValidationIssues && showValidation && (
              <span className="ml-2">
                <AlertTriangle className="h-3 w-3 text-red-500" />
              </span>
            )}
          </div>
          <div className="text-xs text-gray-500 flex items-center truncate">
            {contact.city && <span>{contact.city}{contact.state ? ', ' : ''}</span>}
            {contact.state && <span>{contact.state}</span>}
          </div>
        </div>
        
        {/* Primary Contact Info */}
        <div className="hidden sm:flex items-center space-x-4 flex-shrink-0 mx-2">
          {contact.phones.length > 0 && (
            <div className="flex items-center text-xs">
              <Phone className="h-3 w-3 text-gray-400 mr-1" />
              <span className="font-mono truncate max-w-[120px]">{contact.phones[0].number}</span>
            </div>
          )}
          
          {contact.emails.length > 0 && (
            <div className="hidden md:flex items-center text-xs">
              <Mail className="h-3 w-3 text-gray-400 mr-1" />
              <span className="font-mono truncate max-w-[180px]">{contact.emails[0].address}</span>
            </div>
          )}
        </div>
        
        {/* Status Indicators */}
        <div className="flex items-center space-x-2 flex-shrink-0 mr-2">
          {contact.duplicateGroup && (
            <span className="bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded-full text-xs">
              <AlertTriangle className="h-3 w-3" />
            </span>
          )}
          
          <div className="flex space-x-1 text-xs">
            <span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded-full flex items-center">
              <Phone className="h-3 w-3 mr-1" />
              {validPhones.length}/{contact.phones.length}
            </span>
            <span className="bg-green-100 text-green-800 px-1.5 py-0.5 rounded-full flex items-center">
              <Mail className="h-3 w-3 mr-1" />
              {validEmails.length}/{contact.emails.length}
            </span>
          </div>
        </div>
        
        {/* Expand/Collapse Button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
          className="text-gray-400 hover:text-gray-600 p-1.5 hover:bg-gray-100 rounded-full transition-colors"
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>
      
      {/* Expanded Details */}
      {expanded && (
        <div className="border-t p-3 bg-gray-50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Phone Numbers */}
            {contact.phones.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-700 mb-2 flex items-center">
                  <Phone className="h-3 w-3 mr-1" /> Phone Numbers
                </h4>
                <div className="space-y-1.5">
                  {contact.phones.map(phone => (
                    <div key={phone.id} className="flex items-center justify-between text-xs p-1.5 bg-white rounded border">
                      <span className="font-mono">{phone.number}</span>
                      <div className="flex items-center">
                        <span className="px-1.5 py-0.5 rounded-full text-xs bg-gray-100">{phone.type}</span>
                        {phone.isPrimary && <span className="ml-1.5 text-yellow-500">★</span>}
                        {showValidation && phone.isValid === false && <AlertTriangle className="h-3 w-3 text-red-500 ml-1.5" />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Email Addresses */}
            {contact.emails.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold text-gray-700 mb-2 flex items-center">
                  <Mail className="h-3 w-3 mr-1" /> Email Addresses
                </h4>
                <div className="space-y-1.5">
                  {contact.emails.map(email => (
                    <div key={email.id} className="flex items-center justify-between text-xs p-1.5 bg-white rounded border">
                      <span className="font-mono truncate max-w-[200px]">{email.address}</span>
                      <div className="flex items-center">
                        {email.isPrimary && <span className="text-yellow-500">★</span>}
                        {showValidation && email.isValid === false && <AlertTriangle className="h-3 w-3 text-red-500 ml-1.5" />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          
          {/* Tags */}
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

          {/* Relationships */}
          {contact.relationships && contact.relationships.length > 0 && (
            <div className="mt-3">
              <h4 className="text-xs font-semibold text-gray-700 mb-2">Relationships</h4>
              <div className="flex flex-wrap gap-1">
                {contact.relationships.map(rel => (
                  <span key={rel.id} className="bg-gray-100 text-gray-800 px-2 py-0.5 rounded-full text-xs">
                    {rel.description || rel.relationshipType.replace(/_/g, ' ')}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ContactCard;