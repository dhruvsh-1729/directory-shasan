import { Contact } from "@/types";
import { ValidationUtils } from "./validation";

// lib/analytics.ts - Analytics and Reporting Utilities
export class AnalyticsService {
  static generateContactReport(contacts: Contact[]): ContactReport {
    const totalContacts = contacts.length;
    const mainContacts = contacts.filter(c => c.isMainContact).length;
    const relatedContacts = contacts.filter(c => !c.isMainContact).length;
    
    const phoneStats = this.analyzePhones(contacts);
    const emailStats = this.analyzeEmails(contacts);
    const locationStats = this.analyzeLocations(contacts);
    const qualityStats = this.analyzeDataQuality(contacts);
    
    return {
      summary: {
        totalContacts,
        mainContacts,
        relatedContacts,
        avgContactsPerMain: mainContacts > 0 ? totalContacts / mainContacts : 0
      },
      phoneStats,
      emailStats,
      locationStats,
      qualityStats,
      generatedAt: new Date()
    };
  }
  
  private static analyzePhones(contacts: Contact[]) {
    const allPhones = contacts.flatMap(c => c.phones);
    const validPhones = allPhones.filter(p => p.isValid !== false);
    
    const typeDistribution = allPhones.reduce((acc, phone) => {
      acc[phone.type] = (acc[phone.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    return {
      total: allPhones.length,
      valid: validPhones.length,
      invalid: allPhones.length - validPhones.length,
      validationRate: allPhones.length > 0 ? (validPhones.length / allPhones.length) * 100 : 0,
      typeDistribution,
      avgPhonesPerContact: contacts.length > 0 ? allPhones.length / contacts.length : 0
    };
  }
  
  private static analyzeEmails(contacts: Contact[]) {
    const allEmails = contacts.flatMap(c => c.emails);
    const validEmails = allEmails.filter(e => e.isValid !== false);
    
    const domainDistribution = validEmails.reduce((acc, email) => {
      const domain = email.address.split('@')[1]?.toLowerCase();
      if (domain) {
        acc[domain] = (acc[domain] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);
    
    return {
      total: allEmails.length,
      valid: validEmails.length,
      invalid: allEmails.length - validEmails.length,
      validationRate: allEmails.length > 0 ? (validEmails.length / allEmails.length) * 100 : 0,
      domainDistribution,
      avgEmailsPerContact: contacts.length > 0 ? allEmails.length / contacts.length : 0
    };
  }
  
  private static analyzeLocations(contacts: Contact[]) {
    const locationCounts = contacts.reduce((acc, contact) => {
      const location = [contact.city, contact.state].filter(Boolean).join(', ');
      if (location) {
        acc[location] = (acc[location] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);
    
    const stateDistribution = contacts.reduce((acc, contact) => {
      if (contact.state) {
        acc[contact.state] = (acc[contact.state] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);
    
    return {
      locationCounts,
      stateDistribution,
      contactsWithLocation: contacts.filter(c => c.city || c.state).length,
      locationCompleteness: contacts.length > 0 ? 
        (contacts.filter(c => c.city && c.state).length / contacts.length) * 100 : 0
    };
  }
  
  private static analyzeDataQuality(contacts: Contact[]) {
    const qualityScores = contacts.map(contact => 
      ValidationUtils.calculateDataQuality(contact)
    );
    
    const avgQuality = qualityScores.length > 0 ? 
      qualityScores.reduce((sum, q) => sum + q.score, 0) / qualityScores.length : 0;
    
    const qualityDistribution = qualityScores.reduce((acc, quality) => {
      const bucket = quality.score >= 80 ? 'high' : 
                     quality.score >= 60 ? 'medium' : 'low';
      acc[bucket] = (acc[bucket] || 0) + 1;
      return acc;
    }, { high: 0, medium: 0, low: 0 });
    
    const commonIssues = qualityScores
      .flatMap(q => q.issues)
      .reduce((acc, issue) => {
        acc[issue] = (acc[issue] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
    
    return {
      averageQuality: avgQuality,
      qualityDistribution,
      commonIssues,
      contactsNeedingAttention: qualityScores.filter(q => q.score < 60).length
    };
  }
}

export interface ContactReport {
  summary: {
    totalContacts: number;
    mainContacts: number;
    relatedContacts: number;
    avgContactsPerMain: number;
  };
  phoneStats: any;
  emailStats: any;
  locationStats: any;
  qualityStats: any;
  generatedAt: Date;
}