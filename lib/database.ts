// lib/database.ts
import { PrismaClient, Contact as PrismaContact, Prisma } from '@prisma/client';
import { Contact } from '@/types';

let prisma: PrismaClient;

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient();
} else {
  const globalWithPrisma = globalThis as typeof globalThis & {
    prisma: PrismaClient;
  };
  if (!globalWithPrisma.prisma) {
    globalWithPrisma.prisma = new PrismaClient();
  }
  prisma = globalWithPrisma.prisma;
}

export { prisma };

export interface ContactFilters {
  search?: string;
  filter?: 'all' | 'main' | 'related' | 'duplicates';
  city?: string;
  state?: string;
  category?: string;
  hasEmails?: boolean;
  hasPhones?: boolean;
  createdAfter?: Date;
  createdBefore?: Date;
}

export interface PaginationOptions {
  page: number;
  limit: number;
}

export interface ContactSearchResult {
  contacts: Contact[];
  total: number;
  totalPages: number;
  currentPage: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface DatabaseStats {
  totalContacts: number;
  mainContacts: number;
  relatedContacts: number;
  totalPhones: number;
  totalEmails: number;
  duplicateGroups: number;
  recentImports: number;
  categoryCounts: Record<string, number>;
  locationCounts: Record<string, number>;
}

export class ContactDatabaseService {
  private static CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  
  // Cache management with proper error handling
  private static async getFromCache<T>(key: string): Promise<T | null> {
    try {
      const cached = await prisma.cacheEntry.findUnique({
        where: { key }
      });
      
      if (!cached || cached.expiresAt < new Date()) {
        if (cached) {
          await prisma.cacheEntry.delete({ where: { key } }).catch(() => {});
        }
        return null;
      }
      
      return cached.value as T;
    } catch (error) {
      console.error('Cache read error:', error);
      return null;
    }
  }
  
  private static async setCache<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      const expiresAt = new Date(Date.now() + (ttl || this.CACHE_TTL));
      
      await prisma.cacheEntry.upsert({
        where: { key },
        create: {
          key,
          value: value as any,
          expiresAt
        },
        update: {
          value: value as any,
          expiresAt
        }
      });
    } catch (error) {
      console.error('Cache write error:', error);
      // Don't throw - cache failures shouldn't break the app
    }
  }
  
  private static async clearCache(pattern?: string): Promise<void> {
    try {
      if (pattern) {
        // For MongoDB, we need to find matching keys first
        const entries = await prisma.cacheEntry.findMany({
          where: {
            key: {
              contains: pattern
            }
          }
        });
        
        if (entries.length > 0) {
          await prisma.cacheEntry.deleteMany({
            where: {
              id: {
                in: entries.map(e => e.id)
              }
            }
          });
        }
      } else {
        await prisma.cacheEntry.deleteMany({});
      }
    } catch (error) {
      console.error('Cache clear error:', error);
    }
  }
  
  // Convert Prisma Contact to our Contact type with null safety
  private static mapPrismaContactToContact(prismaContact: PrismaContact): Contact {
    return {
      id: prismaContact.id,
      name: prismaContact.name,
      status: prismaContact.status || undefined,
      address: prismaContact.address || undefined,
      suburb: prismaContact.suburb || undefined,
      city: prismaContact.city || undefined,
      pincode: prismaContact.pincode || undefined,
      state: prismaContact.state || undefined,
      country: prismaContact.country || undefined,
      category: prismaContact.category || undefined,
      officeAddress: prismaContact.officeAddress || undefined,
      address2: prismaContact.address2 || undefined,
      isMainContact: prismaContact.isMainContact,
      parentContactId: prismaContact.parentContactId || undefined,
      duplicateGroup: prismaContact.duplicateGroup || undefined,
      alternateNames: prismaContact.alternateNames || [],
      tags: prismaContact.tags || [],
      notes: prismaContact.notes || undefined,
      lastUpdated: prismaContact.lastUpdated || new Date(),
      phones: (prismaContact.phones || []).map(phone => ({
        id: phone.id,
        number: phone.number,
        type: phone.type as any,
        isPrimary: phone.isPrimary,
        label: phone.label || undefined,
        country: phone.country || undefined,
        region: phone.region || undefined,
        isValid: phone.isValid || undefined
      })),
      emails: (prismaContact.emails || []).map(email => ({
        id: email.id,
        address: email.address,
        isPrimary: email.isPrimary,
        isValid: email.isValid || undefined
      })),
      relationships: (prismaContact.relationships || []).map(rel => ({
        id: rel.id,
        contactId: rel.contactId,
        relatedContactId: rel.relatedContactId,
        relationshipType: rel.relationshipType as any,
        description: rel.description || undefined
      }))
    };
  }
  
  // Search contacts with advanced filtering and better error handling
  static async searchContacts(
    filters: ContactFilters = {},
    pagination: PaginationOptions = { page: 1, limit: 20 }
  ): Promise<ContactSearchResult> {
    const cacheKey = `contacts:search:${JSON.stringify({ filters, pagination })}`;
    
    try {
      console.log('🔍 SearchContacts called with:', { filters, pagination });
      
      // Skip cache for debugging - comment this out later
      // const cached = await this.getFromCache<ContactSearchResult>(cacheKey);
      // if (cached) {
      //   console.log('📦 Returning cached result:', cached);
      //   return cached;
      // }
      
      // Build where clause
      const where: Prisma.ContactWhereInput = {};
      
      // Search text across multiple fields
      if (filters.search) {
        const searchTerm = filters.search.toLowerCase();
        where.OR = [
          { name: { contains: searchTerm, mode: 'insensitive' } },
          { phones: { some: { number: { contains: searchTerm } } } },
          { emails: { some: { address: { contains: searchTerm, mode: 'insensitive' } } } },
          { city: { contains: searchTerm, mode: 'insensitive' } },
          { state: { contains: searchTerm, mode: 'insensitive' } },
          { category: { contains: searchTerm, mode: 'insensitive' } },
          { status: { contains: searchTerm, mode: 'insensitive' } }
        ];
      }
      
      // Filter by contact type
      if (filters.filter === 'main') {
        where.isMainContact = true;
      } else if (filters.filter === 'related') {
        where.isMainContact = false;
      } else if (filters.filter === 'duplicates') {
        where.duplicateGroup = { not: null };
      }
      
      // Location filters
      if (filters.city) {
        where.city = { contains: filters.city, mode: 'insensitive' };
      }
      if (filters.state) {
        where.state = { contains: filters.state, mode: 'insensitive' };
      }
      
      // Category filter
      if (filters.category) {
        where.category = { contains: filters.category, mode: 'insensitive' };
      }
      
      // Email/Phone filters
      if (filters.hasEmails === true) {
        where.emails = { some: {} };
      } else if (filters.hasEmails === false) {
        where.emails = { none: {} };
      }
      
      if (filters.hasPhones === true) {
        where.phones = { some: {} };
      } else if (filters.hasPhones === false) {
        where.phones = { none: {} };
      }
      
      console.log('🎯 Final where clause:', JSON.stringify(where, null, 2));
      
      const skip = (pagination.page - 1) * pagination.limit;
      console.log('📄 Pagination - Skip:', skip, 'Take:', pagination.limit);
      
      // First, let's check if there are ANY contacts in the database
      const totalInDatabase = await prisma.contact.count().catch((error) => {
        console.error('❌ Error counting total contacts:', error);
        return 0;
      });
      console.log('📊 Total contacts in database:', totalInDatabase);
      
      // Check count with our where clause
      const countWithFilters = await prisma.contact.count({ where }).catch((error) => {
        console.error('❌ Error counting filtered contacts:', error);
        return 0;
      });
      console.log('🔢 Count with current filters:', countWithFilters);
      
      // If no contacts match, let's try a simple query first
      if (countWithFilters === 0 && Object.keys(filters).length > 0) {
        console.log('⚠️ No contacts match filters, trying simple query...');
        const simpleContacts = await prisma.contact.findMany({
          take: 5, // Just get first 5
          orderBy: { lastUpdated: 'desc' }
        }).catch((error) => {
          console.error('❌ Error with simple query:', error);
          return [];
        });
        console.log('📋 Sample contacts from simple query:', simpleContacts.length, 'found');
        if (simpleContacts.length > 0) {
          console.log('👤 First contact:', {
            id: simpleContacts[0].id,
            name: simpleContacts[0].name,
            isMainContact: simpleContacts[0].isMainContact,
            city: simpleContacts[0].city,
            hasPhones: simpleContacts[0].phones?.length || 0,
            hasEmails: simpleContacts[0].emails?.length || 0
          });
        }
      }
      
      // Execute queries in parallel with error handling
      const [contacts, total] = await Promise.all([
        prisma.contact.findMany({
          where,
          skip,
          take: pagination.limit,
          orderBy: [
            { isMainContact: 'desc' },
            { lastUpdated: 'desc' }
          ]
        }).catch((error) => {
          console.error('❌ Error fetching contacts:', error);
          return []; // Return empty array on error
        }),
        prisma.contact.count({ where }).catch((error) => {
          console.error('❌ Error counting contacts:', error);
          return 0; // Return 0 on error
        })
      ]);
      
      console.log('✅ Query results - Contacts found:', contacts.length, 'Total:', total);
      
      // Log first contact if found
      if (contacts.length > 0) {
        console.log('👤 First contact from query:', {
          id: contacts[0].id,
          name: contacts[0].name,
          isMainContact: contacts[0].isMainContact
        });
      }
      
      const totalPages = Math.ceil(total / pagination.limit);
      
      const result: ContactSearchResult = {
        contacts: contacts.map(this.mapPrismaContactToContact),
        total,
        totalPages,
        currentPage: pagination.page,
        hasNextPage: pagination.page < totalPages,
        hasPrevPage: pagination.page > 1
      };
      
      console.log('📤 Final result:', {
        contactsCount: result.contacts.length,
        total: result.total,
        totalPages: result.totalPages,
        currentPage: result.currentPage
      });
      
      // Cache the result (uncomment when debugging is done)
      // await this.setCache(cacheKey, result, this.CACHE_TTL);
      
      return result;
    } catch (error) {
      console.error('💥 Search contacts error:', error);
      
      // Return empty result on error
      return {
        contacts: [],
        total: 0,
        totalPages: 0,
        currentPage: pagination.page,
        hasNextPage: false,
        hasPrevPage: false
      };
    }
  }
  
  // Get contact by ID with error handling
  static async getContactById(id: string): Promise<Contact | null> {
    const cacheKey = `contact:${id}`;
    
    try {
      const cached = await this.getFromCache<Contact>(cacheKey);
      if (cached) {
        return cached;
      }
      
      const contact = await prisma.contact.findUnique({
        where: { id }
      });
      
      if (!contact) return null;
      
      const mappedContact = this.mapPrismaContactToContact(contact);
      await this.setCache(cacheKey, mappedContact);
      
      return mappedContact;
    } catch (error) {
      console.error('Get contact by ID error:', error);
      return null;
    }
  }
  
  // Create contact with proper data validation
  static async createContact(contactData: Omit<Contact, 'id' | 'createdAt' | 'lastUpdated'>): Promise<Contact> {
    try {
      const created = await prisma.contact.create({
        data: {
          name: contactData.name,
          status: contactData.status || null,
          address: contactData.address || null,
          suburb: contactData.suburb || null,
          city: contactData.city || null,
          pincode: contactData.pincode !== null && contactData.pincode !== undefined ? String(contactData.pincode) : null,
          state: contactData.state || null,
          country: contactData.country || null,
          category: contactData.category || null,
          officeAddress: contactData.officeAddress || null,
          address2: contactData.address2 || null,
          isMainContact: contactData.isMainContact,
          parentContactId: contactData.parentContactId || null,
          duplicateGroup: contactData.duplicateGroup || null,
          alternateNames: contactData.alternateNames || [],
          tags: contactData.tags || [],
          notes: contactData.notes || null,
          phones: (contactData.phones || []).map(phone => ({
            id: phone.id,
            number: phone.number,
            type: phone.type,
            isPrimary: phone.isPrimary,
            label: phone.label || null,
            country: phone.country || null,
            region: phone.region || null,
            isValid: phone.isValid || null
          })),
          emails: (contactData.emails || []).map(email => ({
            id: email.id,
            address: email.address,
            isPrimary: email.isPrimary,
            isValid: email.isValid || null
          })),
          relationships: (contactData.relationships || []).map(rel => ({
            id: rel.id,
            contactId: rel.contactId,
            relatedContactId: rel.relatedContactId,
            relationshipType: rel.relationshipType,
            description: rel.description || null
          }))
        }
      });
      
      // Clear relevant caches
      await this.clearCache('contacts:');
      await this.clearCache('stats');
      
      return this.mapPrismaContactToContact(created);
    } catch (error) {
      console.error('Create contact error:', error);
      throw error;
    }
  }
  
  // Bulk create contacts with better error handling
  static async createManyContacts(contacts: Omit<Contact, 'id' | 'createdAt' | 'lastUpdated'>[]): Promise<number> {
    try {
      const data = contacts.map(contact => ({
        name: contact.name,
        status: contact.status || null,
        address: contact.address || null,
        suburb: contact.suburb || null,
        city: contact.city || null,
        pincode: contact.pincode !== null && contact.pincode !== undefined ? String(contact.pincode) : null,
        state: contact.state || null,
        country: contact.country || null,
        category: contact.category || null,
        officeAddress: contact.officeAddress || null,
        address2: contact.address2 || null,
        isMainContact: contact.isMainContact,
        parentContactId: contact.parentContactId || null,
        duplicateGroup: contact.duplicateGroup || null,
        alternateNames: contact.alternateNames || [],
        tags: contact.tags || [],
        notes: contact.notes || null,
        phones: (contact.phones || []).map(phone => ({
          id: phone.id,
          number: phone.number,
          type: phone.type,
          isPrimary: phone.isPrimary,
          label: phone.label || null,
          country: phone.country || null,
          region: phone.region || null,
          isValid: phone.isValid || null
        })),
        emails: (contact.emails || []).map(email => ({
          id: email.id,
          address: email.address,
          isPrimary: email.isPrimary,
          isValid: email.isValid || null
        })),
        relationships: (contact.relationships || []).map(rel => ({
          id: rel.id,
          contactId: rel.contactId,
          relatedContactId: rel.relatedContactId,
          relationshipType: rel.relationshipType,
          description: rel.description || null
        }))
      }));
      
      const result = await prisma.contact.createMany({ 
        data,
      });
      
      // Clear caches
      await this.clearCache();
      
      return result.count;
    } catch (error) {
      console.error('Create many contacts error:', error);
      throw error;
    }
  }
  
  // Update contact
  static async updateContact(id: string, updates: Partial<Contact>): Promise<Contact | null> {
    try {
      const updateData: any = { ...updates };
      delete updateData.id;
      delete updateData.createdAt;
      updateData.lastUpdated = new Date();
      
      // Handle null values properly
      Object.keys(updateData).forEach(key => {
        if (updateData[key] === undefined) {
          updateData[key] = null;
        }
      });
      
      const updated = await prisma.contact.update({
        where: { id },
        data: updateData
      });
      
      // Clear caches
      await this.clearCache(`contact:${id}`);
      await this.clearCache('contacts:');
      
      return this.mapPrismaContactToContact(updated);
    } catch (error) {
      console.error('Update contact error:', error);
      return null;
    }
  }
  
  // Delete contact
  static async deleteContact(id: string): Promise<boolean> {
    try {
      await prisma.contact.delete({ where: { id } });
      
      // Clear caches
      await this.clearCache(`contact:${id}`);
      await this.clearCache('contacts:');
      await this.clearCache('stats');
      
      return true;
    } catch (error) {
      console.error('Delete contact error:', error);
      return false;
    }
  }
  
  // Get database statistics with better error handling
  static async getStats(): Promise<DatabaseStats> {
    const cacheKey = 'stats:database';
    
    try {
      const cached = await this.getFromCache<DatabaseStats>(cacheKey);
      if (cached) {
        return cached;
      }
      
      const [
        totalContacts,
        mainContacts,
        relatedContacts,
        recentImports,
        categories,
        locations,
        duplicateGroups,
        phonesAndEmails
      ] = await Promise.all([
        prisma.contact.count().catch(() => 0),
        prisma.contact.count({ where: { isMainContact: true } }).catch(() => 0),
        prisma.contact.count({ where: { isMainContact: false } }).catch(() => 0),
        prisma.importSession.count({
          where: {
            startedAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
            }
          }
        }).catch(() => 0),
        prisma.contact.groupBy({
          by: ['category'],
          _count: true,
          where: { 
            category: { not: null },
            isMainContact: true // Only count main contacts for categories
          }
        }).catch(() => []),
        prisma.contact.groupBy({
          by: ['city', 'state'],
          _count: true,
          where: { 
            OR: [
              { city: { not: null } },
              { state: { not: null } }
            ],
            isMainContact: true // Only count main contacts for locations
          }
        }).catch(() => []),
        prisma.contact.groupBy({
          by: ['duplicateGroup'],
          _count: true,
          where: { duplicateGroup: { not: null } }
        }).catch(() => []),
        // Get phone and email counts more safely
        prisma.contact.findMany({
          select: { phones: true, emails: true }
        }).then(contacts => ({
          totalPhones: contacts.reduce((sum, c) => sum + (c.phones?.length || 0), 0),
          totalEmails: contacts.reduce((sum, c) => sum + (c.emails?.length || 0), 0)
        })).catch(() => ({ totalPhones: 0, totalEmails: 0 }))
      ]);
      
      // Calculate phone and email totals more safely
      let totalPhones = 0;
      let totalEmails = 0;
      
      try {
        const contacts = await prisma.contact.findMany({
          select: { phones: true, emails: true }
        });
        
        totalPhones = contacts.reduce((sum, c) => sum + (c.phones?.length || 0), 0);
        totalEmails = contacts.reduce((sum, c) => sum + (c.emails?.length || 0), 0);
      } catch (error) {
        console.error('Error calculating phone/email totals:', error);
        // Use fallback values
        totalPhones = 0;
        totalEmails = 0;
      }
      
      const stats: DatabaseStats = {
        totalContacts,
        mainContacts,
        relatedContacts,
        totalPhones,
        totalEmails,
        duplicateGroups: duplicateGroups.length,
        recentImports,
        categoryCounts: categories.reduce((acc, cat) => {
          if (cat.category) {
            acc[cat.category] = cat._count;
          }
          return acc;
        }, {} as Record<string, number>),
        locationCounts: locations.reduce((acc, loc) => {
          const key = [loc.city, loc.state].filter(Boolean).join(', ');
          if (key) {
            acc[key] = loc._count;
          }
          return acc;
        }, {} as Record<string, number>)
      };
      
      await this.setCache(cacheKey, stats, this.CACHE_TTL * 2); // Cache stats longer
      
      return stats;
    } catch (error) {
      console.error('Get stats error:', error);
      
      // Return default stats on error
      return {
        totalContacts: 0,
        mainContacts: 0,
        relatedContacts: 0,
        totalPhones: 0,
        totalEmails: 0,
        duplicateGroups: 0,
        recentImports: 0,
        categoryCounts: {},
        locationCounts: {}
      };
    }
  }
  
  // Get related contacts
  static async getRelatedContacts(contactId: string): Promise<Contact[]> {
    const cacheKey = `related:${contactId}`;
    
    try {
      const cached = await this.getFromCache<Contact[]>(cacheKey);
      if (cached) {
        return cached;
      }
      
      const contact = await prisma.contact.findUnique({
        where: { id: contactId }
      });
      
      if (!contact) return [];
      
      const where: Prisma.ContactWhereInput = contact.isMainContact
        ? { parentContactId: contactId }
        : contact.parentContactId
          ? {
              OR: [
                { id: contact.parentContactId },
                { parentContactId: contact.parentContactId, id: { not: contactId } }
              ]
            }
          : {};
      
      const related = await prisma.contact.findMany({ where });
      const mappedContacts = related.map(this.mapPrismaContactToContact);
      
      await this.setCache(cacheKey, mappedContacts);
      
      return mappedContacts;
    } catch (error) {
      console.error('Get related contacts error:', error);
      return [];
    }
  }
  
  // Clean expired cache entries
  static async cleanupCache(): Promise<void> {
    try {
      await prisma.cacheEntry.deleteMany({
        where: {
          expiresAt: { lt: new Date() }
        }
      });
    } catch (error) {
      console.error('Cache cleanup error:', error);
    }
  }
}