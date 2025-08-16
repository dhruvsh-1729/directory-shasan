// utils/main.ts
import { Contact, Phone, Email, ContactRelationship, RelationshipType, PhoneType } from "@/types";

export class ContactExtractor {
  // Enhanced phone number patterns for different countries
  private static readonly PHONE_PATTERNS = {
    INDIAN: /^(?:\+91|91|0)?([6-9]\d{9})$/,
    US: /^(?:\+1|1)?([2-9]\d{2}[2-9]\d{2}\d{4})$/,
    UK: /^(?:\+44|44|0)?((?:[1-9]\d{8,9})|(?:[2-9]\d{7,8}))$/,
    INTERNATIONAL: /^(?:\+\d{1,3})?\d{6,15}$/
  };

  // Relationship indicators to remove from names
  private static readonly RELATIONSHIP_INDICATORS = [
    'son', 'daughter', 'child', 'wife', 'husband', 'spouse', 'father', 'mother', 
    'parent', 'brother', 'sister', 'uncle', 'aunt', 'cousin', 'nephew', 'niece',
    'grandfather', 'grandmother', 'grandson', 'granddaughter', 'brother-in-law',
    'sister-in-law', 'mother-in-law', 'father-in-law', 'friend', 'colleague',
    'assistant', 'secretary', 'partner', 'boss', 'manager', 'employee', 'office',
    'work', 'home', 'personal', 'mobile', 'cell', 'landline', 'fax'
  ];

  // Empty value indicators
  private static readonly EMPTY_VALUES = [
    '', '-', 'null', 'undefined', 'n/a', 'na', 'nil', '0', '00', 'none', 
    'empty', 'blank', 'xxx', '###', '...', 'tbc', 'tbd', 'pending'
  ];

  static isEmptyValue(value: any): boolean {
    if (!value && value !== 0) return true;
    
    const stringValue = String(value).toLowerCase().trim();
    
    // Check against empty value indicators
    if (this.EMPTY_VALUES.includes(stringValue)) return true;
    
    // Check for repeated characters (like ---, ***, etc.)
    if (/^(.)\1{2,}$/.test(stringValue)) return true;
    
    // Check for placeholder patterns
    if (/^x+$/i.test(stringValue) || /^#+$/.test(stringValue)) return true;
    
    return false;
  }

  static extractPhones(phoneFields: (string | number)[]): Phone[] {
    const phones: Phone[] = [];
    let phoneId = 0;

    phoneFields.forEach((field, index) => {
      if (this.isEmptyValue(field)) return;

      const fieldStr = String(field).trim();
      
      // Handle multiple numbers in one field (comma, semicolon, or newline separated)
      const separators = /[,;\n]/;
      if (separators.test(fieldStr)) {
        const numbers = fieldStr.split(separators).map(n => n.trim());
        numbers.forEach((num, numIndex) => {
          if (!this.isEmptyValue(num)) {
            const phone = this.parsePhoneWithRelationship(num, index, phoneId++, index === 0 && numIndex === 0);
            if (phone) phones.push(phone);
          }
        });
      } else {
        // Handle single number
        const phone = this.parsePhoneWithRelationship(fieldStr, index, phoneId++, index === 0);
        if (phone) phones.push(phone);
      }
    });

    return phones;
  }

  private static parsePhoneWithRelationship(
    input: string, 
    fieldIndex: number, 
    phoneId: number, 
    isPrimary: boolean
  ): Phone | null {
    // Extract relationship info if present
    const relationshipMatch = input.match(/^(.+?)\s*\(([^)]+)\)(.*)$/) || 
                             input.match(/^([^:]+):\s*(.+)$/) ||
                             input.match(/^(.+?)\s*-\s*(.+)$/);
    
    let numberPart = input;
    let relationshipInfo = '';
    
    if (relationshipMatch) {
      // Determine which part is the phone number
      const part1 = relationshipMatch[1].trim();
      const part2 = relationshipMatch[2].trim();
      
      if (this.isValidPhoneNumber(part1)) {
        numberPart = part1;
        relationshipInfo = part2;
      } else if (this.isValidPhoneNumber(part2)) {
        numberPart = part2;
        relationshipInfo = part1;
      }
    }

    const phoneInfo = this.analyzePhoneNumber(numberPart);
    if (!phoneInfo) return null;

    return {
      id: `phone_${phoneId}`,
      number: phoneInfo.formatted,
      type: this.determinePhoneType(fieldIndex, relationshipInfo),
      isPrimary,
      label: relationshipInfo || undefined,
      country: phoneInfo.country,
      region: phoneInfo.region,
      isValid: phoneInfo.isValid
    };
  }

  static analyzePhoneNumber(phone: string): {
    formatted: string;
    country: string;
    region: string;
    isValid: boolean;
  } | null {
    if (!phone) return null;
    
    // Clean the number but preserve structure
    let cleaned = phone.replace(/[^\d+\-\s()]/g, '').trim();
    
    // Handle multiple numbers (take first)
    if (cleaned.includes('\n')) {
      cleaned = cleaned.split('\n')[0].trim();
    }

    // Extract just digits for pattern matching
    const digitsOnly = cleaned.replace(/\D/g, '');
    
    if (digitsOnly.length < 6) return null;

    // For numbers starting with 2 or 0, preserve as is
    if (digitsOnly.startsWith('2') || digitsOnly.startsWith('0')) {
      return {
        formatted: cleaned, // Keep original format
        country: 'Unknown',
        region: 'XX',
        isValid: digitsOnly.length >= 8
      };
    }

    // Check against patterns
    if (this.PHONE_PATTERNS.INDIAN.test(digitsOnly)) {
      const match = digitsOnly.match(this.PHONE_PATTERNS.INDIAN);
      return {
        formatted: `+91 ${match![1].substring(0, 5)} ${match![1].substring(5)}`,
        country: 'India',
        region: 'IN',
        isValid: true
      };
    }

    if (this.PHONE_PATTERNS.US.test(digitsOnly)) {
      const match = digitsOnly.match(this.PHONE_PATTERNS.US);
      const number = match![1];
      return {
        formatted: `+1 (${number.substring(0, 3)}) ${number.substring(3, 6)}-${number.substring(6)}`,
        country: 'United States',
        region: 'US',
        isValid: true
      };
    }

    if (this.PHONE_PATTERNS.UK.test(digitsOnly)) {
      return {
        formatted: `+44 ${digitsOnly.substring(digitsOnly.startsWith('44') ? 2 : digitsOnly.startsWith('0') ? 1 : 0)}`,
        country: 'United Kingdom',
        region: 'UK',
        isValid: true
      };
    }

    // International or unknown format
    if (this.PHONE_PATTERNS.INTERNATIONAL.test(digitsOnly)) {
      return {
        formatted: cleaned,
        country: 'Unknown',
        region: 'XX',
        isValid: digitsOnly.length >= 10
      };
    }

    return null;
  }

  private static isValidPhoneNumber(str: string): boolean {
    const digitsOnly = str.replace(/\D/g, '');
    return digitsOnly.length >= 10 && /\d/.test(str);
  }

  private static determinePhoneType(fieldIndex: number, relationshipInfo: string): PhoneType {
    const lower = relationshipInfo.toLowerCase();
    
    if (lower.includes('office') || lower.includes('work') || lower.includes('business')) return 'office';
    if (lower.includes('home') || lower.includes('house') || lower.includes('residence')) return 'residence';
    if (lower.includes('fax')) return 'fax';
    if (lower.includes('mobile') || lower.includes('cell')) return 'mobile';
    
    // Default based on field position
    if (fieldIndex < 4) return 'mobile';
    if (fieldIndex === 4) return 'office';
    if (fieldIndex === 5) return 'residence';
    return 'other';
  }

  static extractEmails(emailField: string): Email[] {
    if (this.isEmptyValue(emailField)) return [];
    
    // Enhanced email extraction with validation
    const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const emails = emailField.match(emailRegex) || [];
    
    return emails
      .map(email => email.trim().toLowerCase())
      .filter((email, index, arr) => arr.indexOf(email) === index) // Remove duplicates
      .map((email, index) => ({
        id: `email_${index}`,
        address: email,
        isPrimary: index === 0,
        isValid: this.isValidEmail(email)
      }));
  }

  private static isValidEmail(email: string): boolean {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
  }

  static extractRelatedContacts(phones: Phone[], mainContact: Contact): Contact[] {
    const relatedContacts: Contact[] = [];
    
    phones.forEach(phone => {
      if (phone.label && phone.label.trim()) {
        const cleanedName = this.cleanRelationshipName(phone.label);
        
        if (cleanedName) {
          const relatedContact: Contact = {
            id: `related_${mainContact.id}_${phone.id}`,
            name: cleanedName,
            alternateNames: [phone.label], // Keep original as alternate name
            phones: [{ 
              ...phone, 
              isPrimary: true, 
              label: undefined // Remove label for related contact
            }],
            emails: [],
            isMainContact: false,
            parentContactId: mainContact.id,
            relationships: [{
              id: `rel_${mainContact.id}_${phone.id}`,
              contactId: mainContact.id,
              relatedContactId: `related_${mainContact.id}_${phone.id}`,
              relationshipType: this.determineRelationshipType(phone.label) as RelationshipType,
              description: phone.label,
            }],
            // Inherit location from main contact
            city: mainContact.city,
            state: mainContact.state,
            country: mainContact.country,
            tags: [],
            notes: undefined,
            lastUpdated: new Date(),
          };
          
          relatedContacts.push(relatedContact);
        }
      }
    });

    return relatedContacts;
  }

  static cleanRelationshipName(rawName: string): string | null {
    if (!rawName || this.isEmptyValue(rawName)) return null;
    
    let cleaned = rawName.trim();
    
    // Remove relationship indicators (case insensitive)
    for (const indicator of this.RELATIONSHIP_INDICATORS) {
      const regex = new RegExp(`\\b${indicator}\\b`, 'gi');
      cleaned = cleaned.replace(regex, '').trim();
    }
    
    // Remove extra whitespace and connecting words
    cleaned = cleaned
      .replace(/\b(of|the|a|an)\b/gi, '') // Remove articles and prepositions
      .replace(/[()]/g, '') // Remove parentheses
      .replace(/[-_]/g, ' ') // Replace hyphens/underscores with spaces
      .replace(/\s+/g, ' ') // Collapse multiple spaces
      .trim();
    
    // Capitalize properly (first letter of each word)
    cleaned = cleaned.split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
    
    // Return null if nothing meaningful remains
    if (cleaned.length < 2 || /^\d+$/.test(cleaned)) return null;
    
    return cleaned;
  }

  static determineRelationshipType(label: string): RelationshipType {
    const lower = label.toLowerCase();
    
    // Family relationships (more comprehensive)
    if (lower.includes('wife') || lower.includes('husband') || lower.includes('spouse')) return 'spouse';
    if (lower.includes('son') || lower.includes('daughter') || lower.includes('child')) return 'child';
    if (lower.includes('father') || lower.includes('mother') || lower.includes('parent')) return 'parent';
    if (lower.includes('brother') || lower.includes('sister')) return 'sibling';
    if (lower.includes('uncle') || lower.includes('aunt')) return 'extended_family';
    if (lower.includes('cousin') || lower.includes('nephew') || lower.includes('niece')) return 'extended_family';
    if (lower.includes('grandfather') || lower.includes('grandmother')) return 'grandparent';
    if (lower.includes('grandson') || lower.includes('granddaughter')) return 'grandchild';
    if (lower.includes('in-law')) return 'in_law';
    
    // Professional relationships
    if (lower.includes('office') || lower.includes('work') || lower.includes('colleague')) return 'colleague';
    if (lower.includes('assistant') || lower.includes('secretary')) return 'assistant';
    if (lower.includes('boss') || lower.includes('manager') || lower.includes('supervisor')) return 'supervisor';
    if (lower.includes('employee') || lower.includes('subordinate')) return 'subordinate';
    if (lower.includes('partner')) return 'business_partner';
    if (lower.includes('client') || lower.includes('customer')) return 'client';
    
    // Social relationships
    if (lower.includes('friend')) return 'friend';
    if (lower.includes('neighbor')) return 'neighbor';
    
    return 'related';
  }

  static cleanPhoneNumber(phone: string): string {
    if (!phone) return '';
    
    // This method is kept for backward compatibility
    const analyzed = this.analyzePhoneNumber(phone);
    return analyzed ? analyzed.formatted : phone.replace(/[^\d+\-\s()]/g, '').trim();
  }

  /**
   * Enhanced email matching with round-robin distribution for unmatched emails
   */
  static matchEmailsToContactsInRecord(emails: Email[], contactsFromSameRecord: Contact[]): void {
    if (emails.length === 0 || contactsFromSameRecord.length === 0) return;

    const matchedEmails = new Set<string>();
    
    // First pass: Try to match emails based on name similarity
    emails.forEach(email => {
      const emailName = email.address.split('@')[0].toLowerCase();
      
      const matchedContact = contactsFromSameRecord.find(contact => {
        const nameParts = contact.name.toLowerCase().split(/\s+/);
        const firstName = nameParts[0];
        const lastName = nameParts[nameParts.length - 1];
        const fullName = contact.name.toLowerCase().replace(/\s+/g, '');
        
        // Check alternate names too
        const alternateMatches = contact.alternateNames?.some(altName => {
          const altParts = altName.toLowerCase().split(/\s+/);
          return altParts.some(part => emailName.includes(part) || part.includes(emailName));
        }) || false;
        
        return emailName.includes(firstName) || 
               emailName.includes(lastName) || 
               emailName.includes(fullName) ||
               firstName.includes(emailName) ||
               lastName.includes(emailName) ||
               alternateMatches;
      });
      
      if (matchedContact && !matchedContact.emails.find(e => e.address === email.address)) {
        matchedContact.emails.push({
          ...email,
          id: `email_${matchedContact.emails.length}`,
          isPrimary: matchedContact.emails.length === 0
        });
        matchedEmails.add(email.address);
      }
    });

    // Second pass: Distribute unmatched emails in round-robin fashion
    const unmatched = emails.filter(email => !matchedEmails.has(email.address));
    
    if (unmatched.length > 0) {
      console.log(`Distributing ${unmatched.length} unmatched emails across ${contactsFromSameRecord.length} contacts`);
      
      unmatched.forEach((email, index) => {
        // Round-robin distribution: cycle through all contacts
        const contactIndex = index % contactsFromSameRecord.length;
        const targetContact = contactsFromSameRecord[contactIndex];
        
        if (!targetContact.emails.find(e => e.address === email.address)) {
          targetContact.emails.push({
            ...email,
            id: `email_${targetContact.emails.length}`,
            isPrimary: targetContact.emails.length === 0
          });
        }
      });
    }
  }

  /**
   * @deprecated Use matchEmailsToContactsInRecord instead to avoid cross-record contamination
   */
  static matchEmailsToContacts(emails: Email[], contacts: Contact[]): void {
    console.warn('matchEmailsToContacts is deprecated. Use matchEmailsToContactsInRecord for better data integrity.');
    this.matchEmailsToContactsInRecord(emails, contacts);
  }

  /**
   * Process a single record and extract all contacts with proper email matching
   */
  static processRecord(recordData: {
    name: string;
    phoneFields: (string | number)[];
    emailField: string;
    city?: string;
    state?: string;
    country?: string;
    [key: string]: any;
  }): Contact[] {
    const recordId = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    
    // Extract phones and emails
    const phones = this.extractPhones(recordData.phoneFields);
    const emails = this.extractEmails(recordData.emailField);
    
    // Create main contact
    const mainContact: Contact = {
      id: `main_${recordId}`,
      name: recordData.name.trim(),
      phones: phones.filter(p => !p.label), // Phones without relationship labels
      emails: [], // Will be populated by email matching
      isMainContact: true,
      city: recordData.city,
      state: recordData.state,
      country: recordData.country,
      tags: [],
      notes: undefined,
      lastUpdated: new Date(),
    };
    
    // Extract related contacts from phones with labels
    const relatedContacts = this.extractRelatedContacts(phones, mainContact);
    
    // Combine all contacts from this record
    const allContactsFromRecord = [mainContact, ...relatedContacts];
    
    // Enhanced email matching with round-robin distribution
    this.matchEmailsToContactsInRecord(emails, allContactsFromRecord);
    
    // Log email distribution for debugging
    console.log(`Record "${recordData.name}": ${emails.length} emails distributed across ${allContactsFromRecord.length} contacts:`, 
      allContactsFromRecord.map(c => ({ name: c.name, emailCount: c.emails.length })));
    
    return allContactsFromRecord;
  }

  static detectDuplicates(contacts: Contact[]): Contact[] {
    const duplicateGroups = new Map<string, Contact[]>();
    
    contacts.forEach(contact => {
      const nameKey = contact.name.toLowerCase().replace(/\s+/g, '');
      const phoneKeys = contact.phones
        .filter(p => p.isValid !== false)
        .map(p => p.number.replace(/\D/g, ''));
      
      let foundGroup = false;
      
      for (const [key, group] of duplicateGroups) {
        if (this.isSimilarName(nameKey, key) || 
            this.hasCommonPhone(phoneKeys, group) ||
            this.hasCommonEmail(contact.emails, group)) {
          group.push(contact);
          contact.duplicateGroup = key;
          foundGroup = true;
          break;
        }
      }
      
      if (!foundGroup) {
        duplicateGroups.set(nameKey, [contact]);
        contact.duplicateGroup = nameKey;
      }
    });
    
    return contacts;
  }

  static hasCommonEmail(emails1: Email[], contacts: Contact[]): boolean {
    const addresses1 = emails1.map(e => e.address.toLowerCase());
    const addresses2 = contacts.flatMap(c => c.emails.map(e => e.address.toLowerCase()));
    return addresses1.some(e1 => addresses2.includes(e1));
  }

  static isSimilarName(name1: string, name2: string): boolean {
    const similarity = this.levenshteinDistance(name1, name2) / Math.max(name1.length, name2.length);
    return similarity < 0.15; // More strict similarity threshold
  }

  static hasCommonPhone(phones1: string[], contacts: Contact[]): boolean {
    const phones2 = contacts.flatMap(c => 
      c.phones
        .filter(p => p.isValid !== false)
        .map(p => p.number.replace(/\D/g, ''))
    );
    return phones1.some(p1 => 
      phones2.some(p2 => p1 === p2 && p1.length >= 10)
    );
  }

  static levenshteinDistance(str1: string, str2: string): number {
    const matrix = Array(str2.length + 1).fill(null).map(() => Array(str1.length + 1).fill(null));
    
    for (let i = 0; i <= str1.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= str2.length; j++) matrix[j][0] = j;
    
    for (let j = 1; j <= str2.length; j++) {
      for (let i = 1; i <= str1.length; i++) {
        const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
        matrix[j][i] = Math.min(
          matrix[j][i - 1] + 1,
          matrix[j - 1][i] + 1,
          matrix[j - 1][i - 1] + indicator
        );
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  // Utility method to validate and clean extracted data
  static validateAndCleanContact(contact: Contact): Contact {
    return {
      ...contact,
      name: contact.name.trim(),
      phones: contact.phones.filter(p => p.isValid !== false),
      emails: contact.emails.filter(e => e.isValid !== false),
      alternateNames: contact.alternateNames?.filter(name => 
        name && !this.isEmptyValue(name) && name !== contact.name
      )
    };
  }
}