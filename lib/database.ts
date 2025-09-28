// lib/database.ts
import { PrismaClient, Contact as PrismaContact, Prisma } from '@prisma/client';
import { Contact } from '@/types';

let prisma: PrismaClient;

if (process.env.NODE_ENV === 'production') {
  prisma = new PrismaClient({
    log: ['query', 'info', 'warn', 'error'],
  });
} else {
  const globalWithPrisma = globalThis as typeof globalThis & {
    prisma: PrismaClient;
  };
  if (!globalWithPrisma.prisma) {
    globalWithPrisma.prisma = new PrismaClient({
      log: ['query', 'info', 'warn', 'error'],
    });
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
  validationStats: {
    validPhones: number;
    invalidPhones: number;
    validEmails: number;
    invalidEmails: number;
  };
  lastUpdated: Date;
}

export class ContactDatabaseService {
  private static CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  private static STATS_CACHE_TTL = 10 * 60 * 1000; // 10 minutes for stats
  
  // Enhanced cache management
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
    }
  }

  static async getContactsWithDuplicatePhones() {
    const contacts = await prisma.contact.findMany({});

    // Create a map of phone numbers to contacts
    const phoneToContacts = new Map<string, typeof contacts>();
    
    contacts.forEach(contact => {
      contact.phones?.forEach(phone => {
        const normalizedNumber = this.normalizePhoneNumber(phone.number);
        if (!phoneToContacts.has(normalizedNumber)) {
          phoneToContacts.set(normalizedNumber, []);
        }
        phoneToContacts.get(normalizedNumber)!.push(contact);
      });
    });

    // Filter to only duplicate phone numbers
    const duplicatePhoneGroups: {
      phoneNumber: string;
      contacts: typeof contacts;
      count: number;
    }[] = [];

    phoneToContacts.forEach((contactList, phoneNumber) => {
      if (contactList.length > 1) {
        duplicatePhoneGroups.push({
          phoneNumber,
          contacts: contactList,
          count: contactList.length,
        });
      }
    });

    return duplicatePhoneGroups;
  }

  // Normalize phone number for comparison
  static normalizePhoneNumber(phone: string): string {
    return phone.replace(/\D/g, '').slice(-10); // Get last 10 digits
  }

  // Enhanced stats with duplicate phone information
  // static async getStats() {
  //   const [
  //     totalContacts,
  //     mainContacts,
  //     relatedContacts,
  //     duplicateGroups,
  //     recentImports,
  //     duplicatePhoneGroups,
  //     uniqueLocations,
  //   ] = await Promise.all([
  //     prisma.contact.count(),
  //     prisma.contact.count({ where: { isMainContact: true } }),
  //     prisma.contact.count({ where: { isMainContact: false } }),
  //     prisma.contact.groupBy({
  //       by: ['duplicateGroup'],
  //       where: { duplicateGroup: { not: null } },
  //       _count: true,
  //     }),
  //     prisma.importSession.count({
  //     }),
  //     this.getContactsWithDuplicatePhones(),
  //     this.getUniqueLocationValues(),
  //   ]);

  //   // Count total phones and emails
  //   const contacts = await prisma.contact.findMany({
  //     select: { phones: true, emails: true },
  //   });

  //   const totalPhones = contacts.reduce((acc, c) => acc + (c.phones?.length || 0), 0);
  //   const totalEmails = contacts.reduce((acc, c) => acc + (c.emails?.length || 0), 0);

  //   return {
  //     totalContacts,
  //     mainContacts,
  //     relatedContacts,
  //     totalPhones,
  //     totalEmails,
  //     duplicateGroups: duplicateGroups.length,
  //     recentImports,
  //     duplicatePhoneStats: {
  //       totalDuplicateGroups: duplicatePhoneGroups.length,
  //       totalContactsWithDuplicates: duplicatePhoneGroups.reduce((acc, group) => acc + group.count, 0),
  //       duplicatePhoneNumbers: duplicatePhoneGroups.map(g => g.phoneNumber),
  //     },
  //     uniqueLocations,
  //   };
  // }

  // Get unique location values for filters
  static async getUniqueLocationValues() {
    const contacts = await prisma.contact.findMany({
      select: {
        address: true,
        suburb: true,
        city: true,
        pincode: true,
        state: true,
        country: true,
        category: true,
      },
    });

    const uniqueValues = {
      addresses: [...new Set(contacts.map(c => c.address).filter(Boolean))].sort(),
      suburbs: [...new Set(contacts.map(c => c.suburb).filter(Boolean))].sort(),
      cities: [...new Set(contacts.map(c => c.city).filter(Boolean))].sort(),
      pincodes: [...new Set(contacts.map(c => c.pincode).filter(Boolean))].sort(),
      states: [...new Set(contacts.map(c => c.state).filter(Boolean))].sort(),
      countries: [...new Set(contacts.map(c => c.country).filter(Boolean))].sort(),
      categories: [...new Set(contacts.map(c => c.category).filter(Boolean))].sort(),
    };

    return uniqueValues;
  }
  
  private static async invalidateCache(pattern?: string): Promise<void> {
    try {
      if (pattern) {
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
      console.error('Cache invalidation error:', error);
    }
  }
  
  // Enhanced contact mapping with null safety and data validation
  // Add a helper to map a PrismaContact to a shallow Contact (no relations)
private static mapContactShallow(prismaContact: PrismaContact): Contact {
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
      isValid: phone.isValid ?? undefined
    })),
    emails: (prismaContact.emails || []).map(email => ({
      id: email.id,
      address: email.address,
      isPrimary: email.isPrimary,
      isValid: email.isValid ?? undefined
    })),
    relationships: (prismaContact.relationships || []).map(rel => ({
      id: rel.id,
      contactId: rel.contactId,
      relatedContactId: rel.relatedContactId,
      relationshipType: rel.relationshipType as any,
      description: rel.description || undefined
    })),
  };
}

  // Main mapper that *optionally* embeds one-level relations if they were included
  private static mapPrismaContactToContact(
    prismaContact: PrismaContact & {
      childContacts?: PrismaContact[];
      parentContact?: PrismaContact | null;
    }
  ): Contact {
    const base = this.mapContactShallow(prismaContact);

    // Embed one level of relations if present in the record (no extra DB calls)
    if (typeof prismaContact.parentContact !== 'undefined') {
      base.parentContact = prismaContact.parentContact
        ? this.mapContactShallow(prismaContact.parentContact)
        : undefined;
    }

    if (typeof prismaContact.childContacts !== 'undefined') {
      base.childContacts = (prismaContact.childContacts || []).map(c => this.mapContactShallow(c));
    }

    return base;
  }
  
  // Enhanced search with better caching and performance optimization
  static async searchContacts(
    filters: ContactFilters = {},
    pagination: PaginationOptions = { page: 1, limit: 20 }
  ): Promise<ContactSearchResult> {
    const cacheKey = `contacts:search:${JSON.stringify({ filters, pagination })}`;
    
    try {
      console.log('🔍 SearchContacts called with:', { filters, pagination });
      
      // Try cache first for non-real-time queries
      if (!filters.search || filters.search.length < 3) {
        const cached = await this.getFromCache<ContactSearchResult>(cacheKey);
        if (cached) {
          console.log('📦 Returning cached result');
          return cached;
        }
      }
      
      // Build optimized where clause
      const where: Prisma.ContactWhereInput = {};
      
      // Enhanced search across multiple fields with better indexing
      if (filters.search) {
        const searchTerm = filters.search.toLowerCase().trim();
        where.OR = [
          { name: { contains: searchTerm, mode: 'insensitive' } },
          { phones: { some: { number: { contains: searchTerm } } } },
          { emails: { some: { address: { contains: searchTerm, mode: 'insensitive' } } } },
          { city: { contains: searchTerm, mode: 'insensitive' } },
          { state: { contains: searchTerm, mode: 'insensitive' } },
          { category: { contains: searchTerm, mode: 'insensitive' } },
          { status: { contains: searchTerm, mode: 'insensitive' } },
          { tags: { hasSome: [searchTerm] } },
          { alternateNames: { hasSome: [searchTerm] } }
        ];
      }
      
      // Filter by contact type with optimized queries
      if (filters.filter === 'main') {
        where.isMainContact = true;
      } else if (filters.filter === 'related') {
        where.isMainContact = false;
      } else if (filters.filter === 'duplicates') {
        where.duplicateGroup = { not: null };
      }
      
      // Location filters with case-insensitive matching
      if (filters.city) {
        where.city = { contains: filters.city, mode: 'insensitive' };
      }
      if (filters.state) {
        where.state = { contains: filters.state, mode: 'insensitive' };
      }
      
      // Category filter with partial matching
      if (filters.category) {
        where.category = { contains: filters.category, mode: 'insensitive' };
      }
      
      // Enhanced email/phone filters
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
      
      // Date range filters
      if (filters.createdAfter || filters.createdBefore) {
        where.createdAt = {};
        if (filters.createdAfter) {
          where.createdAt.gte = filters.createdAfter;
        }
        if (filters.createdBefore) {
          where.createdAt.lte = filters.createdBefore;
        }
      }
      
      console.log('🎯 Executing query with filters:', JSON.stringify(where, null, 2));
      
      const skip = (pagination.page - 1) * pagination.limit;
      
      // Execute optimized parallel queries
      const [contacts, total] = await Promise.all([
        prisma.contact.findMany({
          where,
          skip,
          take: pagination.limit,
          orderBy: [
            { isMainContact: 'desc' },
            { lastUpdated: 'asc' }, // keep your chosen order; just an example
            { name: 'asc' }
          ],
          include: {
            childContacts: true,
            parentContact: true
          }
        }),
        prisma.contact.count({ where })
      ]);
      
      console.log('✅ Query results - Contacts found:', contacts.length, 'Total:', total);
      
      const totalPages = Math.ceil(total / pagination.limit);
      
      const result: ContactSearchResult = {
        contacts: contacts.map(c => this.mapPrismaContactToContact(c)),
        total,
        totalPages,
        currentPage: pagination.page,
        hasNextPage: pagination.page < totalPages,
        hasPrevPage: pagination.page > 1
      };
      
      // Cache successful results
      if (result.contacts.length > 0 || total === 0) {
        await this.setCache(cacheKey, result, this.CACHE_TTL);
      }
      
      return result;
    } catch (error) {
      console.error('💥 Search contacts error:', error);
      
      // Return safe empty result on error
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
  
  // Enhanced get contact by ID with parent data fetching
  static async getContactById(id: string, includeParent = false): Promise<Contact | null> {
    const cacheKey = `contact:${id}:${includeParent}`;
    try {
      const cached = await this.getFromCache<Contact>(cacheKey);
      if (cached) return cached;

      const contact = await prisma.contact.findUnique({
        where: { id },
        include: {
          childContacts: true,
          parentContact: includeParent // true → embed parent one level
        }
      });

      if (!contact) return null;

      let mapped = this.mapPrismaContactToContact(contact);

      // Keep your address inheritance behavior for children
      if (includeParent && contact.parentContactId && !contact.isMainContact && contact.parentContact) {
        const parent = contact.parentContact;
        mapped = {
          ...mapped,
          address: mapped.address || parent.address || undefined,
          city: mapped.city || parent.city || undefined,
          state: mapped.state || parent.state || undefined,
          country: mapped.country || parent.country || undefined,
          pincode: mapped.pincode || parent.pincode || undefined,
          suburb: mapped.suburb || parent.suburb || undefined,
        };
      }

      await this.setCache(cacheKey, mapped);
      return mapped;
    } catch (e) {
      console.error('Get contact by ID error:', e);
      return null;
    }
  }
  
  // Enhanced contact creation with data validation
  static async createContact(contactData: Omit<Contact, 'id' | 'createdAt' | 'lastUpdated'>): Promise<Contact> {
    try {
      // Validate required fields
      if (!contactData.name || contactData.name.trim().length === 0) {
        throw new Error('Contact name is required');
      }
      
      // Validate phone numbers if provided
      if (contactData.phones && contactData.phones.length > 0) {
        for (const phone of contactData.phones) {
          if (!phone.number || phone.number.trim().length === 0) {
            throw new Error('Phone number cannot be empty');
          }
        }
      }
      
      // Validate email addresses if provided
      if (contactData.emails && contactData.emails.length > 0) {
        for (const email of contactData.emails) {
          if (!email.address || !email.address.includes('@')) {
            throw new Error('Invalid email address format');
          }
        }
      }
      
      const created = await prisma.contact.create({
        data: {
          name: contactData.name.trim(),
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
            number: phone.number.trim(),
            type: phone.type,
            isPrimary: phone.isPrimary,
            label: phone.label || null,
            country: phone.country || null,
            region: phone.region || null,
            isValid: phone.isValid ?? null
          })),
          emails: (contactData.emails || []).map(email => ({
            id: email.id,
            address: email.address.trim().toLowerCase(),
            isPrimary: email.isPrimary,
            isValid: email.isValid ?? null
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
      const withRels = await prisma.contact.findUnique({
        where: { id: created.id },
        include: { childContacts: true, parentContact: true }
      });
      await this.invalidateCache('contacts:');
      await this.invalidateCache('stats');
      return this.mapPrismaContactToContact(withRels!);
      
    } catch (error) {
      console.error('Create contact error:', error);
      throw error;
    }
  }
  
  // Enhanced bulk create with better error handling and progress tracking
  static async createManyContacts(contacts: Omit<Contact, 'id' | 'createdAt' | 'lastUpdated'>[]): Promise<{count: number, errors: string[]}> {
    const errors: string[] = [];
    let successCount = 0;
    
    try {
      // Process in smaller batches to avoid MongoDB limits
      const batchSize = 50;
      
      for (let i = 0; i < contacts.length; i += batchSize) {
        const batch = contacts.slice(i, i + batchSize);
        
        try {
          const validatedBatch = batch.map((contact, index) => {
            // Validate each contact in batch
            if (!contact.name || contact.name.trim().length === 0) {
              errors.push(`Batch ${Math.floor(i / batchSize) + 1}, Contact ${index + 1}: Missing name`);
              return null;
            }
            
            return {
              name: contact.name.trim(),
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
                number: phone.number.trim(),
                type: phone.type,
                isPrimary: phone.isPrimary,
                label: phone.label || null,
                country: phone.country || null,
                region: phone.region || null,
                isValid: phone.isValid ?? null
              })),
              emails: (contact.emails || []).map(email => ({
                id: email.id,
                address: email.address.trim().toLowerCase(),
                isPrimary: email.isPrimary,
                isValid: email.isValid ?? null
              })),
              relationships: (contact.relationships || []).map(rel => ({
                id: rel.id,
                contactId: rel.contactId,
                relatedContactId: rel.relatedContactId,
                relationshipType: rel.relationshipType,
                description: rel.description || null
              }))
            };
          }).filter(Boolean) as any[];
          
          if (validatedBatch.length > 0) {
            const result = await prisma.contact.createMany({
              data: validatedBatch,
              // skipDuplicates: true
            });
            successCount += result.count;
          }
          
        } catch (batchError) {
          const errorMessage = batchError instanceof Error ? batchError.message : 'Batch processing failed';
          errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${errorMessage}`);
          console.error(`Batch processing error:`, batchError);
        }
      }
      
      // Clear caches after successful operations
      if (successCount > 0) {
        await this.invalidateCache('contacts:');
        await this.invalidateCache('stats');
      }
      
      return { count: successCount, errors };
    } catch (error) {
      console.error('Create many contacts error:', error);
      throw error;
    }
  }
  
  // Enhanced update with partial updates and validation
  static async updateContact(id: string, updates: Partial<Contact>): Promise<Contact | null> {
    try {
      // Remove readonly fields
      const { id: _, createdAt, ...safeUpdates } = updates as any;
      safeUpdates.lastUpdated = new Date();
      
      // Validate updates if provided
      if (safeUpdates.name !== undefined) {
        if (!safeUpdates.name || safeUpdates.name.trim().length === 0) {
          throw new Error('Contact name cannot be empty');
        }
        safeUpdates.name = safeUpdates.name.trim();
      }
      
      // Clean up email addresses
      if (safeUpdates.emails) {
        safeUpdates.emails = safeUpdates.emails.map((email: any) => ({
          ...email,
          address: email.address.trim().toLowerCase()
        }));
      }
      
      // Clean up phone numbers
      if (safeUpdates.phones) {
        safeUpdates.phones = safeUpdates.phones.map((phone: any) => ({
          ...phone,
          number: phone.number.trim()
        }));
      }
      
      const updated = await prisma.contact.update({
        where: { id },
        data: safeUpdates
      });
      
      // Clear relevant caches
      // re-fetch with relations
      const withRels = await prisma.contact.findUnique({
        where: { id: updated.id },
        include: { childContacts: true, parentContact: true }
      });

      await this.invalidateCache(`contact:${id}`);
      await this.invalidateCache('contacts:');
      return withRels ? this.mapPrismaContactToContact(withRels) : null;
      
    } catch (error) {
      console.error('Update contact error:', error);
      return null;
    }
  }
  
  // Enhanced delete with cascade handling
  static async deleteContact(id: string): Promise<boolean> {
    try {
      // Check if this is a main contact with related contacts
      const contact = await prisma.contact.findUnique({
        where: { id }
      });
      
      if (!contact) {
        return false;
      }
      
      // If it's a main contact, handle related contacts
      if (contact.isMainContact) {
        const relatedContacts = await prisma.contact.findMany({
          where: { parentContactId: id }
        });
        
        if (relatedContacts.length > 0) {
          // Option 1: Delete all related contacts
          // await prisma.contact.deleteMany({
          //   where: { parentContactId: id }
          // });
          
          // Option 2: Convert first related contact to main contact (preserve data)
          if (relatedContacts.length > 0) {
            const firstRelated = relatedContacts[0];
            await prisma.contact.update({
              where: { id: firstRelated.id },
              data: {
                isMainContact: true,
                parentContactId: null,
                // Inherit data from main contact if missing
                address: firstRelated.address || contact.address,
                city: firstRelated.city || contact.city,
                state: firstRelated.state || contact.state,
                country: firstRelated.country || contact.country,
                pincode: firstRelated.pincode || contact.pincode,
                suburb: firstRelated.suburb || contact.suburb
              }
            });
            
            // Update remaining related contacts to point to new main contact
            if (relatedContacts.length > 1) {
              await prisma.contact.updateMany({
                where: { 
                  parentContactId: id,
                  id: { not: firstRelated.id }
                },
                data: { parentContactId: firstRelated.id }
              });
            }
          }
        }
      }
      
      await prisma.contact.delete({ where: { id } });
      
      // Clear caches
      await this.invalidateCache(`contact:${id}`);
      await this.invalidateCache('contacts:');
      await this.invalidateCache('stats');
      
      return true;
    } catch (error) {
      console.error('Delete contact error:', error);
      return false;
    }
  }
  
  // Enhanced statistics with validation data and caching
  static async getStats(): Promise<DatabaseStats> {
    const cacheKey = 'stats:database';
    
    try {
      const cached = await this.getFromCache<DatabaseStats>(cacheKey);
      if (cached) {
        return cached;
      }
      
      // Execute all stat queries in parallel for better performance
      const [
        totalContacts,
        mainContacts,
        relatedContacts,
        recentImports,
        categories,
        locations,
        duplicateGroups,
        allContacts // For phone/email validation stats
      ] = await Promise.all([
        prisma.contact.count().catch(() => 0),
        prisma.contact.count({ where: { isMainContact: true } }).catch(() => 0),
        prisma.contact.count({ where: { isMainContact: false } }).catch(() => 0),
        prisma.importSession.count({
          where: {
            startedAt: {
              gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
            }
          }
        }).catch(() => 0),
        prisma.contact.groupBy({
          by: ['category'],
          _count: true,
          where: { 
            category: { not: null },
            isMainContact: true
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
            isMainContact: true
          }
        }).catch(() => []),
        prisma.contact.groupBy({
          by: ['duplicateGroup'],
          _count: true,
          where: { duplicateGroup: { not: null } }
        }).catch(() => []),
        prisma.contact.findMany({
          select: { phones: true, emails: true }
        }).catch(() => [])
      ]);
      
      // Calculate phone and email statistics
      let totalPhones = 0;
      let totalEmails = 0;
      let validPhones = 0;
      let invalidPhones = 0;
      let validEmails = 0;
      let invalidEmails = 0;
      
      allContacts.forEach(contact => {
        // Phone statistics
        if (contact.phones) {
          totalPhones += contact.phones.length;
          contact.phones.forEach(phone => {
            if (phone.isValid === false) {
              invalidPhones++;
            } else {
              validPhones++;
            }
          });
        }
        
        // Email statistics
        if (contact.emails) {
          totalEmails += contact.emails.length;
          contact.emails.forEach(email => {
            if (email.isValid === false) {
              invalidEmails++;
            } else {
              validEmails++;
            }
          });
        }
      });
      
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
        }, {} as Record<string, number>),
        validationStats: {
          validPhones,
          invalidPhones,
          validEmails,
          invalidEmails
        },
        lastUpdated: new Date()
      };
      
      await this.setCache(cacheKey, stats, this.STATS_CACHE_TTL);
      
      return stats;
    } catch (error) {
      console.error('Get stats error:', error);
      
      return {
        totalContacts: 0,
        mainContacts: 0,
        relatedContacts: 0,
        totalPhones: 0,
        totalEmails: 0,
        duplicateGroups: 0,
        recentImports: 0,
        categoryCounts: {},
        locationCounts: {},
        validationStats: {
          validPhones: 0,
          invalidPhones: 0,
          validEmails: 0,
          invalidEmails: 0
        },
        lastUpdated: new Date()
      };
    }
  }
  
  // Enhanced related contacts fetching with inheritance
  static async getRelatedContacts(contactId: string): Promise<Contact[]> {
    const cacheKey = `related:${contactId}`;
    try {
      const cached = await this.getFromCache<Contact[]>(cacheKey);
      if (cached) return cached;

      const contact = await prisma.contact.findUnique({ where: { id: contactId }});
      if (!contact) return [];

      const where: Prisma.ContactWhereInput = contact.isMainContact
        ? { parentContactId: contactId } // children of this parent
        : contact.parentContactId
          ? {
              OR: [
                { id: contact.parentContactId }, // its parent
                { parentContactId: contact.parentContactId, id: { not: contactId } } // siblings
              ]
            }
          : {};

      const related = await prisma.contact.findMany({
        where,
        orderBy: [{ isMainContact: 'desc' }, { name: 'asc' }],
        include: {
          parentContact: true,     // so each related child can display parent
          childContacts: false     // keep payload light here
        }
      });

      const mapped = related.map(c => this.mapPrismaContactToContact(c));
      await this.setCache(cacheKey, mapped);
      return mapped;
    } catch (e) {
      console.error('Get related contacts error:', e);
      return [];
    }
  }
  
  // Batch operations for better performance
  static async batchUpdateValidation(): Promise<{ updated: number, errors: string[] }> {
    const errors: string[] = [];
    let updated = 0;
    
    try {
      const contacts = await prisma.contact.findMany({
        select: { id: true, phones: true, emails: true }
      });
      
      for (const contact of contacts) {
        try {
          let hasUpdates = false;
          const updatedPhones = contact.phones?.map(phone => {
            const isValidPhone = this.validatePhoneNumber(phone.number);
            if (phone.isValid !== isValidPhone) {
              hasUpdates = true;
              return { ...phone, isValid: isValidPhone };
            }
            return phone;
          });
          
          const updatedEmails = contact.emails?.map(email => {
            const isValidEmail = this.validateEmail(email.address);
            if (email.isValid !== isValidEmail) {
              hasUpdates = true;
              return { ...email, isValid: isValidEmail };
            }
            return email;
          });
          
          if (hasUpdates) {
            await prisma.contact.update({
              where: { id: contact.id },
              data: {
                phones: updatedPhones,
                emails: updatedEmails,
                lastUpdated: new Date()
              }
            });
            updated++;
          }
        } catch (error) {
          errors.push(`Contact ${contact.id}: ${error instanceof Error ? error.message : 'Update failed'}`);
        }
      }
      
      // Clear caches after batch update
      await this.invalidateCache('contacts:');
      await this.invalidateCache('stats');
      
      return { updated, errors };
    } catch (error) {
      console.error('Batch update validation error:', error);
      throw error;
    }
  }
  
  // Validation helpers
  private static validatePhoneNumber(phone: string): boolean {
    // Basic phone validation - can be enhanced based on requirements
    const phoneRegex = /^[\+]?[1-9][\d\s\-\(\)]{7,15}$/;
    return phoneRegex.test(phone.replace(/\s/g, ''));
  }
  
  private static validateEmail(email: string): boolean {
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
  
  // Cleanup operations
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
  
  // Health check
  static async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy', details: any }> {
    try {
      const start = Date.now();
      await prisma.contact.count();
      const queryTime = Date.now() - start;
      
      return {
        status: 'healthy',
        details: {
          database: 'connected',
          queryTime: `${queryTime}ms`,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          database: 'disconnected',
          error: error instanceof Error ? error.message : 'Unknown error',
          timestamp: new Date().toISOString()
        }
      };
    }
  }
}