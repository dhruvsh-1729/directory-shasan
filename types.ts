// types/index.ts

export interface Phone {
  id: string;
  number: string;
  type: 'mobile' | 'office' | 'residence' | 'fax' | 'other';
  isPrimary: boolean;
  label?: string;
  country?: string; // New: Country name (e.g., "India", "United States")
  region?: string;  // New: Country code (e.g., "IN", "US")
  isValid?: boolean; // New: Whether the number format is valid
}

export interface Email {
  id: string;
  address: string;
  isPrimary: boolean;
  isValid?: boolean; // New: Whether email format is valid
}

export type PhoneType = "mobile" | "office" | "residence" | "fax" | "other";

export type RelationshipType =
  | "spouse"
  | "child"
  | "parent"
  | "sibling"
  | "extended_family"
  | "grandparent"
  | "grandchild"
  | "in_law"
  | "colleague"
  | "assistant"
  | "supervisor"
  | "subordinate"
  | "business_partner"
  | "client"
  | "friend"
  | "neighbor"
  | "related";

export interface ContactRelationship {
  id: string;
  contactId: string;
  relatedContactId: string;
  relationshipType: RelationshipType;
  description?: string;
}

export interface Contact {
  id: string;
  name: string;
  status?: string; // New: Status of the contact
  address?: string; // New: Primary address
  suburb?: string; // New: Suburb information
  city?: string;
  pincode?: string | number; // New: Postal code
  state?: string;
  country?: string;
  phones: Phone[];
  emails: Email[];
  category?: string; // New: Category of the contact
  officeAddress?: string; // New: Office address
  address2?: string; // New: Secondary address
  isMainContact: boolean;
  parentContactId?: string;
  relationships?: ContactRelationship[];
  duplicateGroup?: string;
  alternateNames?: string[]; // Store original relationship names as alternates
  tags?: string[];
  notes?: string;
  lastUpdated?: Date;
  parentContact?: Contact; // For hierarchical display
  childContacts?: Contact[]; // For hierarchical display
}

// New: Interface for validation results
export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// New: Interface for phone number analysis
export interface PhoneAnalysis {
  formatted: string;
  country: string;
  region: string;
  isValid: boolean;
  type?: 'mobile' | 'landline' | 'toll-free' | 'premium';
}

// New: Interface for contact extraction configuration
export interface ExtractionConfig {
  skipEmptyValues: boolean;
  validatePhoneNumbers: boolean;
  validateEmails: boolean;
  cleanRelationshipNames: boolean;
  detectDuplicates: boolean;
  defaultCountry?: string; // For phone number parsing
}

// New: Interface for extraction results
export interface ExtractionResult {
  contacts: Contact[];
  duplicates: Contact[];
  errors: ValidationResult[];
  statistics: {
    totalContacts: number;
    validPhones: number;
    validEmails: number;
    relationshipContacts: number;
  };
}