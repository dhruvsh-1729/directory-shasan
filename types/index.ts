// types/index.ts - Enhanced Type Definitions
export interface Contact {
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
  createdAt?: Date;
  parentContact?: Contact | null;     // optional, one level
  childContacts?: Contact[];          // optional, one level

  // Extended properties for enhanced functionality
  parentContactInfo?: Contact; // For related contacts
  dataQuality?: {
    score: number;
    issues: string[];
    lastValidated?: Date;
  };
}

export interface Phone {
  id: string;
  number: string;
  type: 'mobile' | 'office' | 'residence' | 'fax' | 'other';
  isPrimary: boolean;
  label?: string;
  country?: string;
  region?: string;
  isValid?: boolean;
  lastValidated?: Date;
}

export interface Email {
  id: string;
  address: string;
  isPrimary: boolean;
  isValid?: boolean;
  lastValidated?: Date;
  emailType?: 'personal' | 'work' | 'other';
}

export interface ContactRelationship {
  id: string;
  contactId: string;
  relatedContactId: string;
  relationshipType: 'spouse' | 'child' | 'parent' | 'sibling' | 'extended_family' | 
                   'grandparent' | 'grandchild' | 'in_law' | 'colleague' | 'assistant' | 
                   'supervisor' | 'subordinate' | 'business_partner' | 'client' | 
                   'friend' | 'neighbor' | 'related';
  description?: string;
  verified?: boolean;
  createdAt?: Date;
}

export interface ImportSession {
  id: string;
  fileName: string;
  fileSize: number;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'PARTIALLY_COMPLETED' | 'FAILED';
  totalRecords?: number;
  processedRecords?: number;
  errorRecords?: number;
  errors: string[];
  statistics?: any;
  startedAt: Date;
  completedAt?: Date;
}