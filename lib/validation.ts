import { Contact } from "@/types";

// lib/validation.ts - Enhanced Validation Utilities
export class ValidationUtils {
  static validateContact(contact: Partial<Contact>): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    // Name validation
    if (!contact.name || contact.name.trim().length === 0) {
      errors.push('Name is required');
    } else if (contact.name.trim().length < 2) {
      errors.push('Name must be at least 2 characters long');
    }
    
    // Phone validation
    if (contact.phones && contact.phones.length > 0) {
      contact.phones.forEach((phone, index) => {
        if (!this.validatePhoneNumber(phone.number)) {
          errors.push(`Phone ${index + 1}: Invalid format`);
        }
      });
    }
    
    // Email validation
    if (contact.emails && contact.emails.length > 0) {
      contact.emails.forEach((email, index) => {
        if (!this.validateEmail(email.address)) {
          errors.push(`Email ${index + 1}: Invalid format`);
        }
      });
    }
    
    // Location validation
    if (contact.pincode && typeof contact.pincode === 'string') {
      if (!/^\d{4,6}$/.test(contact.pincode)) {
        errors.push('Invalid pincode format');
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
  
  static validatePhoneNumber(phone: string): boolean {
    if (!phone || phone.trim().length === 0) return false;
    
    const cleanPhone = phone.replace(/[\s\-\(\)]/g, '');
    
    // Indian phone number patterns
    const indianPatterns = [
      /^(\+91|91)?[6-9]\d{9}$/, // Indian mobile
      /^(\+91|91)?[1-9]\d{9}$/, // Indian landline
    ];
    
    // International patterns
    const intlPatterns = [
      /^\+[1-9]\d{7,14}$/, // International format
      /^[1-9]\d{7,14}$/, // Without country code
    ];
    
    return [...indianPatterns, ...intlPatterns].some(pattern => pattern.test(cleanPhone));
  }
  
  static validateEmail(email: string): boolean {
    if (!email || email.trim().length === 0) return false;
    
    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    
    return emailRegex.test(email.trim().toLowerCase());
  }
  
  static sanitizeContact(contact: any): Partial<Contact> {
    return {
      ...contact,
      name: contact.name ? String(contact.name).trim() : undefined,
      phones: contact.phones ? contact.phones.map((phone: any) => ({
        ...phone,
        number: String(phone.number || '').trim(),
        type: phone.type || 'other',
        isPrimary: Boolean(phone.isPrimary),
        isValid: this.validatePhoneNumber(phone.number)
      })) : [],
      emails: contact.emails ? contact.emails.map((email: any) => ({
        ...email,
        address: String(email.address || '').trim().toLowerCase(),
        isPrimary: Boolean(email.isPrimary),
        isValid: this.validateEmail(email.address)
      })) : [],
      city: contact.city ? String(contact.city).trim() : undefined,
      state: contact.state ? String(contact.state).trim() : undefined,
      country: contact.country ? String(contact.country).trim() : undefined,
      isMainContact: Boolean(contact.isMainContact),
      alternateNames: Array.isArray(contact.alternateNames) ? contact.alternateNames : [],
      tags: Array.isArray(contact.tags) ? contact.tags : [],
      relationships: Array.isArray(contact.relationships) ? contact.relationships : []
    };
  }
  
  static calculateDataQuality(contact: Contact): { score: number; issues: string[] } {
    let score = 0;
    const issues: string[] = [];
    const maxScore = 100;
    
    // Name quality (20 points)
    if (contact.name && contact.name.trim().length >= 2) {
      score += 20;
    } else {
      issues.push('Missing or invalid name');
    }
    
    // Phone quality (30 points)
    const validPhones = contact.phones.filter(p => p.isValid !== false);
    if (validPhones.length > 0) {
      score += Math.min(30, validPhones.length * 15);
    } else {
      issues.push('No valid phone numbers');
    }
    
    // Email quality (25 points)
    const validEmails = contact.emails.filter(e => e.isValid !== false);
    if (validEmails.length > 0) {
      score += Math.min(25, validEmails.length * 12.5);
    } else {
      issues.push('No valid email addresses');
    }
    
    // Address quality (15 points)
    if (contact.address && contact.city && contact.state) {
      score += 15;
    } else if (contact.city && contact.state) {
      score += 10;
      issues.push('Missing detailed address');
    } else {
      issues.push('Missing location information');
    }
    
    // Additional data quality (10 points)
    if (contact.category) score += 3;
    if (contact.tags && contact.tags.length > 0) score += 2;
    if (contact.notes) score += 2;
    if (contact.relationships && contact.relationships.length > 0) score += 3;
    
    return {
      score: Math.min(maxScore, Math.round(score)),
      issues
    };
  }
}