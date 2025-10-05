// lib/database.ts
import { PrismaClient, Contact as PrismaContact, Prisma, PhoneType as PrismaPhoneType } from '@prisma/client';
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

/** ===========================
 *      FILTERS & RESULTS
 * =========================== */
export interface ContactFilters {
  // existing
  search?: string;
  filter?: 'all' | 'main' | 'related' | 'duplicates';
  city?: string;
  state?: string;
  category?: string;
  hasEmails?: boolean;
  hasPhones?: boolean;
  createdAfter?: Date;
  createdBefore?: Date;

  // NEW — Address granularity
  suburb?: string;
  country?: string;
  pincode?: string;
  hasAddress?: boolean;         // true: must have address, false: must have no address
  missingAddress?: boolean;     // shorthand for no address fields at all
  missingCity?: boolean;
  missingState?: boolean;
  missingCountry?: boolean;
  missingSuburb?: boolean;
  missingPincode?: boolean;

  // NEW — Identity/meta
  status?: string;
  isMain?: boolean;
  hasParent?: boolean;
  hasAvatar?: boolean;

  // NEW — Validation and types
  validPhonesOnly?: boolean;
  validEmailsOnly?: boolean;
  phoneTypes?: PrismaPhoneType[];
  primaryPhoneOnly?: boolean;
  emailDomain?: string;         // e.g. "gmail.com"

  // NEW — Arrays/tags/categories
  tagsAny?: string[];           // at least one of
  tagsAll?: string[];           // must contain all
  categoryIn?: string[];        // multi category OR

  // NEW — Update windows
  updatedAfter?: Date;
  updatedBefore?: Date;
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
  
  // ------- Cache helpers -------
  private static async getFromCache<T>(key: string): Promise<T | null> {
    try {
      const cached = await prisma.cacheEntry.findUnique({ where: { key } });
      if (!cached || cached.expiresAt < new Date()) {
        if (cached) await prisma.cacheEntry.delete({ where: { key } }).catch(() => {});
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
        create: { key, value: value as any, expiresAt },
        update: { value: value as any, expiresAt }
      });
    } catch (error) {
      console.error('Cache write error:', error);
    }
  }

  private static async invalidateCache(pattern?: string): Promise<void> {
    try {
      if (pattern) {
        const entries = await prisma.cacheEntry.findMany({
          where: { key: { contains: pattern } }
        });
        if (entries.length > 0) {
          await prisma.cacheEntry.deleteMany({ where: { id: { in: entries.map(e => e.id) } } });
        }
      } else {
        await prisma.cacheEntry.deleteMany({});
      }
    } catch (error) {
      console.error('Cache invalidation error:', error);
    }
  }

  // ------- Duplicates (cross-contact) -------
  static async getContactsWithDuplicatePhones() {
    const contacts = await prisma.contact.findMany({
      select: { id: true, name: true, phones: true }
    });

    const phoneToContacts = new Map<string, { id: string; name: string }[]>();
    
    contacts.forEach(contact => {
      (contact.phones || []).forEach(phone => {
        const normalizedNumber = this.normalizePhoneNumber(phone.number);
        if (!normalizedNumber) return;
        if (!phoneToContacts.has(normalizedNumber)) {
          phoneToContacts.set(normalizedNumber, []);
        }
        phoneToContacts.get(normalizedNumber)!.push({ id: contact.id, name: contact.name });
      });
    });

    const duplicatePhoneGroups: {
      phoneNumber: string;
      contacts: { id: string; name: string }[];
      count: number;
    }[] = [];

    phoneToContacts.forEach((contactList, phoneNumber) => {
      // Contacts sharing same number
      const uniqueById = Array.from(new Map(contactList.map(c => [c.id, c])).values());
      if (uniqueById.length > 1) {
        duplicatePhoneGroups.push({
          phoneNumber,
          contacts: uniqueById,
          count: uniqueById.length,
        });
      }
    });

    return duplicatePhoneGroups;
  }

  // Normalize phone number for comparison
  static normalizePhoneNumber(phone: string): string {
    if (!phone) return '';
    return phone.replace(/\D/g, '').slice(-10); // last 10 digits
  }

  // ------- Unique location values for filters -------
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
        tags: true,
        status: true
      },
    });

    const dedupe = (arr: (string | null)[]) =>
      Array.from(new Set(arr.filter((v): v is string => !!v && v.trim() !== ''))).sort((a, b) => a.localeCompare(b));

    const tags = new Set<string>();
    contacts.forEach(c => (c.tags || []).forEach(t => tags.add(t)));

    return {
      addresses: dedupe(contacts.map(c => c.address)),
      suburbs: dedupe(contacts.map(c => c.suburb)),
      cities: dedupe(contacts.map(c => c.city)),
      pincodes: dedupe(contacts.map(c => c.pincode)),
      states: dedupe(contacts.map(c => c.state)),
      countries: dedupe(contacts.map(c => c.country)),
      categories: dedupe(contacts.map(c => c.category)),
      statuses: dedupe(contacts.map(c => c.status)),
      tags: Array.from(tags).sort((a, b) => a.localeCompare(b)),
    };
  }

  // ------- Mapping -------
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
      avatarUrl: prismaContact.avatarUrl || undefined,
      avatarPublicId: prismaContact.avatarPublicId || undefined,
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

  private static mapPrismaContactToContact(
    prismaContact: PrismaContact & {
      childContacts?: PrismaContact[];
      parentContact?: PrismaContact | null;
    }
  ): Contact {
    const base = this.mapContactShallow(prismaContact);
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

  // ------- SEARCH (centralized) -------
  static async searchContacts(
    filters: ContactFilters = {},
    pagination: PaginationOptions = { page: 1, limit: 20 }
  ): Promise<ContactSearchResult> {
    const cacheKey = `contacts:search:${JSON.stringify({ filters, pagination })}`;
    try {
      // Cache for simple searches
      if (!filters.search || filters.search.length < 3) {
        const cached = await this.getFromCache<ContactSearchResult>(cacheKey);
        if (cached) return cached;
      }

      const where: Prisma.ContactWhereInput = {};

      // Basic quick search (name/phones/emails/city/state/category/status/tags/alternateNames/notes)
      if (filters.search) {
        const searchTerm = filters.search.toLowerCase().trim();
        const digits = searchTerm.replace(/\D/g, '');
        where.OR = [
          { name: { contains: searchTerm, mode: 'insensitive' } },
          { phones: { some: { number: { contains: digits || searchTerm } } } },
          { emails: { some: { address: { contains: searchTerm, mode: 'insensitive' } } } },
          { city: { contains: searchTerm, mode: 'insensitive' } },
          { state: { contains: searchTerm, mode: 'insensitive' } },
          { country: { contains: searchTerm, mode: 'insensitive' } },
          { suburb: { contains: searchTerm, mode: 'insensitive' } },
          { pincode: { contains: searchTerm, mode: 'insensitive' } },
          { category: { contains: searchTerm, mode: 'insensitive' } },
          { status: { contains: searchTerm, mode: 'insensitive' } },
          { tags: { has: searchTerm } },
          { alternateNames: { has: searchTerm } },
          { notes: { contains: searchTerm, mode: 'insensitive' } },
        ];
      }

      // Type filter
      if (filters.filter === 'main') where.isMainContact = true;
      else if (filters.filter === 'related') where.isMainContact = false;
      else if (filters.filter === 'duplicates') {
        // Gather duplicate IDs in parallel
        const [internalDupes, crossDupes] = await Promise.all([
          this.getContactsWithInternalDuplicatePhones().catch((e) => {
            console.error('Error getting internal duplicate contacts:', e);
            return [];
          }),
          this.getContactsWithDuplicatePhones().catch((e) => {
            console.error('Error getting cross-contact duplicate contacts:', e);
            return [];
          }),
        ]);

        const dupeIds = new Set<string>();
        internalDupes.forEach((c) => dupeIds.add(c.contactId));
        crossDupes.forEach((group) => group.contacts.forEach((c) => dupeIds.add(c.id)));

        // Build a predicate that matches either duplicateGroup or any computed dupe id
        const duplicatePredicate: Prisma.ContactWhereInput =
          dupeIds.size > 0
            ? {
                OR: [
                  { duplicateGroup: { not: null } }, // your explicit duplicate grouping, if used
                  { id: { in: Array.from(dupeIds) } }, // phone-based dupes
                ],
              }
            : {
                // if we didn’t compute any cross/internal dupes, fall back to explicit groups
                duplicateGroup: { not: null },
              };

        // AND this with everything else you’ve already put in `where`
        where.AND = [
          ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
          duplicatePredicate,
        ];
      }

      // Address fields
      if (filters.city) where.city = { contains: filters.city, mode: 'insensitive' };
      if (filters.state) where.state = { contains: filters.state, mode: 'insensitive' };
      if (filters.suburb) where.suburb = { contains: filters.suburb, mode: 'insensitive' };
      if (filters.country) where.country = { contains: filters.country, mode: 'insensitive' };
      if (filters.pincode) where.pincode = { contains: filters.pincode, mode: 'insensitive' };

      // "Has" / "Missing" for address fields
      const isEmptyOrNull = (field: keyof Prisma.ContactWhereInput) => ({
        OR: [
          { [field]: { equals: null } } as any,
          { [field]: { equals: '' } } as any
        ]
      });

      if (filters.hasAddress === true) {
        where.address = { not: null };
      } else if (filters.hasAddress === false || filters.missingAddress) {
        where.AND = [
          ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []),
          isEmptyOrNull('address')
        ];
      }

      if (filters.missingCity) where.AND = [ ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), isEmptyOrNull('city') ];
      if (filters.missingState) where.AND = [ ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), isEmptyOrNull('state') ];
      if (filters.missingCountry) where.AND = [ ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), isEmptyOrNull('country') ];
      if (filters.missingSuburb) where.AND = [ ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), isEmptyOrNull('suburb') ];
      if (filters.missingPincode) where.AND = [ ...(Array.isArray(where.AND) ? where.AND : where.AND ? [where.AND] : []), isEmptyOrNull('pincode') ];

      // Meta
      if (typeof filters.isMain === 'boolean') where.isMainContact = filters.isMain;
      if (typeof filters.hasParent === 'boolean') {
        where.parentContactId = filters.hasParent ? { not: null } : null;
      }
      if (typeof filters.hasAvatar === 'boolean') {
        if (filters.hasAvatar) where.avatarUrl = { not: null };
        else where.OR = [ ...(where.OR || []), { avatarUrl: null }, { avatarUrl: '' } ];
      }
      if (filters.status) where.status = { contains: filters.status, mode: 'insensitive' };

      // Contact data presence
      if (filters.hasEmails === true) where.emails = { some: {} };
      else if (filters.hasEmails === false) where.emails = { none: {} };

      if (filters.hasPhones === true) where.phones = { some: {} };
      else if (filters.hasPhones === false) where.phones = { none: {} };

      // Validation filters
      if (filters.validPhonesOnly) {
        where.phones = { some: { isValid: true } };
      }
      if (filters.validEmailsOnly) {
        where.emails = { some: { isValid: true } };
      }

      // Phone type filters + primary only
      if (filters.phoneTypes && filters.phoneTypes.length > 0) {
        where.phones = {
          ...(where.phones as any || {}),
          some: {
            ...(where.phones && 'some' in (where.phones as any) ? (where.phones as any).some : {}),
            type: { in: filters.phoneTypes }
          }
        } as any;
      }
      if (filters.primaryPhoneOnly) {
        where.phones = {
          ...(where.phones as any || {}),
          some: {
            ...(where.phones && 'some' in (where.phones as any) ? (where.phones as any).some : {}),
            isPrimary: true
          }
        } as any;
      }

      // Email domain
      if (filters.emailDomain) {
        const domain = filters.emailDomain.toLowerCase().replace(/^@/, '');
        where.emails = {
          ...(where.emails as any || {}),
          some: {
            ...(where.emails && 'some' in (where.emails as any) ? (where.emails as any).some : {}),
            address: { endsWith: `@${domain}`, mode: 'insensitive' }
          }
        } as any;
      }

      // Tags and category arrays
      if (filters.tagsAny && filters.tagsAny.length > 0) {
        where.tags = { ...(where.tags as any || {}), hasSome: filters.tagsAny };
      }
      if (filters.tagsAll && filters.tagsAll.length > 0) {
        where.tags = { ...(where.tags as any || {}), hasEvery: filters.tagsAll };
      }
      if (filters.categoryIn && filters.categoryIn.length > 0) {
        where.OR = [
          ...(where.OR || []),
          ...filters.categoryIn.map(cat => ({ category: { contains: cat, mode: 'insensitive' as const } }))
        ];
      } else if (filters.category) {
        where.category = { contains: filters.category, mode: 'insensitive' };
      }

      // Dates
      if (filters.createdAfter || filters.createdBefore) {
        where.createdAt = {
          ...(filters.createdAfter ? { gte: filters.createdAfter } : {}),
          ...(filters.createdBefore ? { lte: filters.createdBefore } : {}),
        };
      }
      if (filters.updatedAfter || filters.updatedBefore) {
        where.lastUpdated = {
          ...(filters.updatedAfter ? { gte: filters.updatedAfter } : {}),
          ...(filters.updatedBefore ? { lte: filters.updatedBefore } : {}),
        };
      }

      const skip = (pagination.page - 1) * pagination.limit;

      const [contacts, total] = await Promise.all([
        prisma.contact.findMany({
          where,
          skip,
          take: pagination.limit,
          orderBy: [
            { name: 'asc' },
            { isMainContact: 'desc' },
            { lastUpdated: 'desc' },
          ],
          include: { childContacts: true, parentContact: true }
        }),
        prisma.contact.count({ where })
      ]);

      // Group contacts by normalized phone numbers if showing duplicates
      if (filters.filter === 'duplicates') {
        const phoneToContacts = new Map<string, Contact[]>();
        const groupedContacts: Contact[] = [];
        
        const mappedContacts = contacts.map(c => this.mapPrismaContactToContact(c));
        
        // Group contacts by their normalized phone numbers
        mappedContacts.forEach(contact => {
          let hasGroupedPhone = false;
          
          (contact.phones || []).forEach(phone => {
            const normalizedNumber = this.normalizePhoneNumber(phone.number);
            if (!normalizedNumber) return;
            
            if (!phoneToContacts.has(normalizedNumber)) {
              phoneToContacts.set(normalizedNumber, []);
            }
            
            // Check if this contact is already in this phone group
            const existingGroup = phoneToContacts.get(normalizedNumber)!;
            if (!existingGroup.find(c => c.id === contact.id)) {
              existingGroup.push(contact);
              hasGroupedPhone = true;
            }
          });
          
          // If contact has no phones or phones weren't grouped, still include if it has duplicateGroup
          if (!hasGroupedPhone && contact.duplicateGroup) {
            groupedContacts.push(contact);
          }
        });
        
        // Add all phone-grouped contacts to result
        phoneToContacts.forEach(contactGroup => {
          if (contactGroup.length > 1) {
            groupedContacts.push(...contactGroup);
          }
        });
        
        // Remove duplicates by ID and maintain order
        const uniqueContacts = Array.from(
          new Map(groupedContacts.map(c => [c.id, c])).values()
        );
        
        // Sort grouped contacts: phone duplicates first, then by name
        uniqueContacts.sort((a, b) => {
          const aHasPhoneDupe = (a.phones || []).some(p => 
            uniqueContacts.some(other => 
              other.id !== a.id && 
              (other.phones || []).some(op => 
                this.normalizePhoneNumber(p.number) === this.normalizePhoneNumber(op.number)
              )
            )
          );
          const bHasPhoneDupe = (b.phones || []).some(p => 
            uniqueContacts.some(other => 
              other.id !== b.id && 
              (other.phones || []).some(op => 
                this.normalizePhoneNumber(p.number) === this.normalizePhoneNumber(op.number)
              )
            )
          );
          
          if (aHasPhoneDupe && !bHasPhoneDupe) return -1;
          if (!aHasPhoneDupe && bHasPhoneDupe) return 1;
          return a.name.localeCompare(b.name);
        });
        
        // Update the result with grouped and sorted contacts
        const startIndex = (pagination.page - 1) * pagination.limit;
        const endIndex = startIndex + pagination.limit;
        const paginatedContacts = uniqueContacts.slice(startIndex, endIndex);
        const newTotal = uniqueContacts.length;
        const newTotalPages = Math.ceil(newTotal / pagination.limit);
        
        const result: ContactSearchResult = {
          contacts: paginatedContacts,
          total: newTotal,
          totalPages: newTotalPages,
          currentPage: pagination.page,
          hasNextPage: pagination.page < newTotalPages,
          hasPrevPage: pagination.page > 1
        };
        
        if (result.contacts.length > 0 || newTotal === 0) {
          await this.setCache(cacheKey, result, this.CACHE_TTL);
        }
        return result;
      }

      const totalPages = Math.ceil(total / pagination.limit);
      const result: ContactSearchResult = {
        contacts: contacts.map(c => this.mapPrismaContactToContact(c)),
        total,
        totalPages,
        currentPage: pagination.page,
        hasNextPage: pagination.page < totalPages,
        hasPrevPage: pagination.page > 1
      };

      if (result.contacts.length > 0 || total === 0) {
        await this.setCache(cacheKey, result, this.CACHE_TTL);
      }
      return result;
    } catch (error) {
      console.error('💥 Search contacts error:', error);
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

  // ------- Contact by ID -------
  static async getContactById(id: string, includeParent = false): Promise<Contact | null> {
    const cacheKey = `contact:${id}:${includeParent}`;
    try {
      const cached = await this.getFromCache<Contact>(cacheKey);
      if (cached) return cached;

      const contact = await prisma.contact.findUnique({
        where: { id },
        include: { childContacts: true, parentContact: includeParent }
      });

      if (!contact) return null;
      let mapped = this.mapPrismaContactToContact(contact);

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

  // ------- Create / Update / Delete (unchanged logic, with avatar fields kept) -------
  static async createContact(contactData: Omit<Contact, 'id' | 'createdAt' | 'lastUpdated'>): Promise<Contact> {
    try {
      if (!contactData.name || contactData.name.trim().length === 0) {
        throw new Error('Contact name is required');
      }

      if (contactData.phones?.length) {
        for (const phone of contactData.phones) {
          if (!phone.number || phone.number.trim().length === 0) {
            throw new Error('Phone number cannot be empty');
          }
        }
      }
      if (contactData.emails?.length) {
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
          pincode: contactData.pincode != null ? String(contactData.pincode) : null,
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
          avatarUrl: contactData.avatarUrl || null,
          avatarPublicId: contactData.avatarPublicId || null,
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
  
  static async createManyContacts(contacts: Omit<Contact, 'id' | 'createdAt' | 'lastUpdated'>[]): Promise<{count: number, errors: string[]}> {
    const errors: string[] = [];
    let successCount = 0;
    try {
      const batchSize = 50;
      for (let i = 0; i < contacts.length; i += batchSize) {
        const batch = contacts.slice(i, i + batchSize);
        try {
          const validatedBatch = batch.map((contact, index) => {
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
              pincode: contact.pincode != null ? String(contact.pincode) : null,
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
              avatarUrl: contact.avatarUrl || null,
              avatarPublicId: contact.avatarPublicId || null,
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
            const result = await prisma.contact.createMany({ data: validatedBatch });
            successCount += result.count;
          }
        } catch (batchError) {
          const errorMessage = batchError instanceof Error ? batchError.message : 'Batch processing failed';
          errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${errorMessage}`);
          console.error(`Batch processing error:`, batchError);
        }
      }
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

  static async updateContact(id: string, updates: Partial<Contact>): Promise<Contact | null> {
    try {
      const { id: _, createdAt, ...safeUpdates } = updates as any;
      safeUpdates.lastUpdated = new Date();
      if (safeUpdates.name !== undefined) {
        if (!safeUpdates.name || safeUpdates.name.trim().length === 0) {
          throw new Error('Contact name cannot be empty');
        }
        safeUpdates.name = safeUpdates.name.trim();
      }
      if (safeUpdates.emails) {
        safeUpdates.emails = safeUpdates.emails.map((email: any) => ({
          ...email,
          address: email.address.trim().toLowerCase()
        }));
      }
      if (safeUpdates.phones) {
        safeUpdates.phones = safeUpdates.phones.map((phone: any) => ({
          ...phone,
          number: phone.number.trim()
        }));
      }
      const updated = await prisma.contact.update({ where: { id }, data: safeUpdates });
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

  static async deleteContact(id: string): Promise<boolean> {
    try {
      const contact = await prisma.contact.findUnique({ where: { id } });
      if (!contact) return false;
      if (contact.isMainContact) {
        const relatedContacts = await prisma.contact.findMany({ where: { parentContactId: id } });
        if (relatedContacts.length > 0) {
          const firstRelated = relatedContacts[0];
          await prisma.contact.update({
            where: { id: firstRelated.id },
            data: {
              isMainContact: true,
              parentContactId: null,
              address: firstRelated.address || contact.address,
              city: firstRelated.city || contact.city,
              state: firstRelated.state || contact.state,
              country: firstRelated.country || contact.country,
              pincode: firstRelated.pincode || contact.pincode,
              suburb: firstRelated.suburb || contact.suburb
            }
          });
          if (relatedContacts.length > 1) {
            await prisma.contact.updateMany({
              where: { parentContactId: id, id: { not: firstRelated.id } },
              data: { parentContactId: firstRelated.id }
            });
          }
        }
      }
      await prisma.contact.delete({ where: { id } });
      await this.invalidateCache(`contact:${id}`);
      await this.invalidateCache('contacts:');
      await this.invalidateCache('stats');
      return true;
    } catch (error) {
      console.error('Delete contact error:', error);
      return false;
    }
  }

  // ------- Internal duplicate phones (per contact) -------
  static async getContactsWithInternalDuplicatePhones(): Promise<
    { contactId: string; name: string; duplicates: { number: string; count: number }[] }[]
  > {
    const contacts = await prisma.contact.findMany({ select: { id: true, name: true, phones: true } });
    const result: { contactId: string; name: string; duplicates: { number: string; count: number }[] }[] = [];
    for (const c of contacts) {
      const freq = new Map<string, number>();
      (c.phones || []).forEach((p) => {
        const norm = this.normalizePhoneNumber(p.number);
        if (!norm) return;
        freq.set(norm, (freq.get(norm) || 0) + 1);
      });
      const duplicates = Array.from(freq.entries())
        .filter(([, count]) => count > 1)
        .map(([number, count]) => ({ number, count }));
      if (duplicates.length > 0) {
        result.push({ contactId: c.id, name: c.name, duplicates });
      }
    }
    return result;
  }

  static async countContactsWithInternalDuplicatePhones(): Promise<number> {
    const dupList = await this.getContactsWithInternalDuplicatePhones();
    return dupList.length;
  }

  // ------- Stats (unchanged, but calls helpers above) -------
  static async getStats(): Promise<DatabaseStats> {
    const cacheKey = 'stats:database';
    try {
      const cached = await this.getFromCache<DatabaseStats>(cacheKey);
      if (cached) return cached;

      const [
        totalContacts,
        mainContacts,
        relatedContacts,
        recentImports,
        categories,
        locations,
        duplicateGroups,
        allContacts,
        internalDuplicatePhoneContacts,
        crossContactDuplicatePhones
      ] = await Promise.all([
        prisma.contact.count().catch(() => 0),
        prisma.contact.count({ where: { isMainContact: true } }).catch(() => 0),
        prisma.contact.count({ where: { isMainContact: false } }).catch(() => 0),
        prisma.importSession.count({
          where: { startedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }
        }).catch(() => 0),
        prisma.contact.groupBy({
          by: ['category'],
          _count: true,
          where: { category: { not: null }, isMainContact: true }
        }).catch(() => []),
        prisma.contact.groupBy({
          by: ['city', 'state'],
          _count: true,
          where: { OR: [{ city: { not: null } }, { state: { not: null } }], isMainContact: true }
        }).catch(() => []),
        prisma.contact.groupBy({
          by: ['duplicateGroup'],
          _count: true,
          where: { duplicateGroup: { not: null } }
        }).catch(() => []),
        prisma.contact.findMany({ select: { phones: true, emails: true } }).catch(() => []),
        this.countContactsWithInternalDuplicatePhones().catch(() => 0),
        this.getContactsWithDuplicatePhones().catch(() => [])
      ]);

      let totalPhones = 0, totalEmails = 0, validPhones = 0, invalidPhones = 0, validEmails = 0, invalidEmails = 0;
      allContacts.forEach(contact => {
        if (contact.phones) {
          totalPhones += contact.phones.length;
          contact.phones.forEach(p => p.isValid === false ? invalidPhones++ : validPhones++);
        }
        if (contact.emails) {
          totalEmails += contact.emails.length;
          contact.emails.forEach(e => e.isValid === false ? invalidEmails++ : validEmails++);
        }
      });

      const totalDuplicatePhoneGroups = crossContactDuplicatePhones.length + internalDuplicatePhoneContacts;

      const stats: DatabaseStats = {
        totalContacts,
        mainContacts,
        relatedContacts,
        totalPhones,
        totalEmails,
        duplicateGroups: duplicateGroups.length + totalDuplicatePhoneGroups,
        recentImports,
        categoryCounts: categories.reduce((acc, cat) => {
          if (cat.category) acc[cat.category] = cat._count;
          return acc;
        }, {} as Record<string, number>),
        locationCounts: locations.reduce((acc, loc) => {
          const key = [loc.city, loc.state].filter(Boolean).join(', ');
          if (key) acc[key] = loc._count;
          return acc;
        }, {} as Record<string, number>),
        validationStats: { validPhones, invalidPhones, validEmails, invalidEmails },
        lastUpdated: new Date()
      };

      await this.setCache(cacheKey, stats, this.STATS_CACHE_TTL);
      return stats;
    } catch (error) {
      console.error('Get stats error:', error);
      return {
        totalContacts: 0, mainContacts: 0, relatedContacts: 0,
        totalPhones: 0, totalEmails: 0, duplicateGroups: 0, recentImports: 0,
        categoryCounts: {}, locationCounts: {},
        validationStats: { validPhones: 0, invalidPhones: 0, validEmails: 0, invalidEmails: 0 },
        lastUpdated: new Date()
      };
    }
  }

  // ------- Related / Batch validate / Utilities -------
  static async getRelatedContacts(contactId: string): Promise<Contact[]> {
    const cacheKey = `related:${contactId}`;
    try {
      const cached = await this.getFromCache<Contact[]>(cacheKey);
      if (cached) return cached;

      const contact = await prisma.contact.findUnique({ where: { id: contactId }});
      if (!contact) return [];

      const where: Prisma.ContactWhereInput = contact.isMainContact
        ? { parentContactId: contactId }
        : contact.parentContactId
          ? { OR: [{ id: contact.parentContactId }, { parentContactId: contact.parentContactId, id: { not: contactId } }] }
          : {};

      const related = await prisma.contact.findMany({
        where,
        orderBy: [{ isMainContact: 'desc' }, { name: 'asc' }],
        include: { parentContact: true, childContacts: false }
      });

      const mapped = related.map(c => this.mapPrismaContactToContact(c));
      await this.setCache(cacheKey, mapped);
      return mapped;
    } catch (e) {
      console.error('Get related contacts error:', e);
      return [];
    }
  }
  
  static async batchUpdateValidation(): Promise<{ updated: number, errors: string[] }> {
    const errors: string[] = [];
    let updated = 0;
    try {
      const contacts = await prisma.contact.findMany({ select: { id: true, phones: true, emails: true } });
      for (const contact of contacts) {
        try {
          let hasUpdates = false;
          const updatedPhones = (contact.phones || []).map(phone => {
            const isValidPhone = this.validatePhoneNumber(phone.number);
            if (phone.isValid !== isValidPhone) { hasUpdates = true; return { ...phone, isValid: isValidPhone }; }
            return phone;
          });
          const updatedEmails = (contact.emails || []).map(email => {
            const isValidEmail = this.validateEmail(email.address);
            if (email.isValid !== isValidEmail) { hasUpdates = true; return { ...email, isValid: isValidEmail }; }
            return email;
          });
          if (hasUpdates) {
            await prisma.contact.update({
              where: { id: contact.id },
              data: { phones: updatedPhones, emails: updatedEmails, lastUpdated: new Date() }
            });
            updated++;
          }
        } catch (error) {
          errors.push(`Contact ${contact.id}: ${error instanceof Error ? error.message : 'Update failed'}`);
        }
      }
      await this.invalidateCache('contacts:');
      await this.invalidateCache('stats');
      return { updated, errors };
    } catch (error) {
      console.error('Batch update validation error:', error);
      throw error;
    }
  }
  
  private static validatePhoneNumber(phone: string): boolean {
    const phoneRegex = /^[\+]?[1-9][\d\s\-\(\)]{7,15}$/;
    return phoneRegex.test(phone.replace(/\s/g, ''));
  }
  
  private static validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
  
  static async cleanupCache(): Promise<void> {
    try {
      await prisma.cacheEntry.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    } catch (error) {
      console.error('Cache cleanup error:', error);
    }
  }
  
  static async healthCheck(): Promise<{ status: 'healthy' | 'unhealthy', details: any }> {
    try {
      const start = Date.now();
      await prisma.contact.count();
      const queryTime = Date.now() - start;
      return { status: 'healthy', details: { database: 'connected', queryTime: `${queryTime}ms`, timestamp: new Date().toISOString() } };
    } catch (error) {
      return { status: 'unhealthy', details: { database: 'disconnected', error: error instanceof Error ? error.message : 'Unknown error', timestamp: new Date().toISOString() } };
    }
  }
}
