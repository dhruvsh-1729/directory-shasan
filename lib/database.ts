// lib/database.ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['query'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

// Database service for contact management
export class ContactDatabaseService {
  
  /**
   * Save processed contacts to database
   */
  static async saveContacts(contacts: Contact[]): Promise<{
    success: boolean;
    contactIds: string[];
    statistics: ImportStatistics;
    errors: string[];
  }> {
    const contactIds: string[] = [];
    const errors: string[] = [];
    
    // Separate main contacts and related contacts
    const mainContacts = contacts.filter(c => c.isMainContact);
    const relatedContacts = contacts.filter(c => !c.isMainContact);
    
    const statistics: ImportStatistics = {
      totalContacts: contacts.length,
      mainContacts: mainContacts.length,
      relatedContacts: relatedContacts.length,
      totalPhones: contacts.reduce((sum, c) => sum + c.phones.length, 0),
      validPhones: contacts.reduce((sum, c) => sum + c.phones.filter(p => p.isValid !== false).length, 0),
      invalidPhones: contacts.reduce((sum, c) => sum + c.phones.filter(p => p.isValid === false).length, 0),
      totalEmails: contacts.reduce((sum, c) => sum + c.emails.length, 0),
      validEmails: contacts.reduce((sum, c) => sum + c.emails.filter(e => e.isValid !== false).length, 0),
      invalidEmails: contacts.reduce((sum, c) => sum + c.emails.filter(e => e.isValid === false).length, 0),
      duplicateGroups: new Set(contacts.filter(c => c.duplicateGroup).map(c => c.duplicateGroup)).size,
      relationshipsFound: contacts.reduce((sum, c) => sum + (c.relationships?.length || 0), 0)
    };

    try {
      await prisma.$transaction(async (tx) => {
        // First, save all main contacts
        for (const contact of mainContacts) {
          try {
            const savedContact = await tx.contact.create({
              data: {
                name: contact.name,
                status: contact.status,
                address: contact.address,
                suburb: contact.suburb,
                city: contact.city,
                pincode: contact.pincode?.toString(),
                state: contact.state,
                country: contact.country,
                category: contact.category,
                officeAddress: contact.officeAddress,
                address2: contact.address2,
                isMainContact: true,
                duplicateGroup: contact.duplicateGroup,
                alternateNames: contact.alternateNames || [],
                tags: contact.tags || [],
                notes: contact.notes,
                lastUpdated: contact.lastUpdated,
                phones: contact.phones.map(phone => ({
                  id: phone.id,
                  number: phone.number,
                  type: phone.type.toUpperCase() as any,
                  isPrimary: phone.isPrimary,
                  label: phone.label,
                  country: phone.country,
                  region: phone.region,
                  isValid: phone.isValid
                })),
                emails: contact.emails.map(email => ({
                  id: email.id,
                  address: email.address,
                  isPrimary: email.isPrimary,
                  isValid: email.isValid
                }))
              }
            });
            
            contactIds.push(savedContact.id);
            
            // Update the contact ID mapping for related contacts
            contact.id = savedContact.id;
            
          } catch (error) {
            console.error(`Error saving main contact ${contact.name}:`, error);
            errors.push(`Failed to save main contact ${contact.name}: ${error.message}`);
          }
        }

        // Then, save related contacts with proper parent references
        for (const relatedContact of relatedContacts) {
          try {
            // Find the parent contact by original ID
            const parentContact = mainContacts.find(c => 
              relatedContact.parentContactId?.includes(c.name) || 
              c.id === relatedContact.parentContactId
            );
            
            if (!parentContact) {
              errors.push(`Parent contact not found for ${relatedContact.name}`);
              continue;
            }

            const savedRelatedContact = await tx.contact.create({
              data: {
                name: relatedContact.name,
                parentContactId: parentContact.id,
                isMainContact: false,
                alternateNames: relatedContact.alternateNames || [],
                tags: relatedContact.tags || [],
                notes: relatedContact.notes,
                city: relatedContact.city || parentContact.city,
                state: relatedContact.state || parentContact.state,
                country: relatedContact.country || parentContact.country,
                phones: relatedContact.phones.map(phone => ({
                  id: phone.id,
                  number: phone.number,
                  type: phone.type.toUpperCase() as any,
                  isPrimary: phone.isPrimary,
                  label: phone.label,
                  country: phone.country,
                  region: phone.region,
                  isValid: phone.isValid
                })),
                emails: relatedContact.emails.map(email => ({
                  id: email.id,
                  address: email.address,
                  isPrimary: email.isPrimary,
                  isValid: email.isValid
                }))
              }
            });
            
            contactIds.push(savedRelatedContact.id);
            
            // Create relationships
            if (relatedContact.relationships) {
              for (const relationship of relatedContact.relationships) {
                try {
                  await tx.contactRelationship.create({
                    data: {
                      contactId: parentContact.id,
                      relatedContactId: savedRelatedContact.id,
                      relationshipType: this.mapRelationshipType(relationship.relationshipType),
                      description: relationship.description
                    }
                  });
                } catch (relError) {
                  console.error(`Error creating relationship:`, relError);
                  errors.push(`Failed to create relationship: ${relError.message}`);
                }
              }
            }
            
          } catch (error) {
            console.error(`Error saving related contact ${relatedContact.name}:`, error);
            errors.push(`Failed to save related contact ${relatedContact.name}: ${error.message}`);
          }
        }
      }, {
        maxWait: 60000, // 60 seconds
        timeout: 120000, // 2 minutes
      });

      return {
        success: errors.length === 0,
        contactIds,
        statistics,
        errors
      };

    } catch (error) {
      console.error('Transaction failed:', error);
      return {
        success: false,
        contactIds: [],
        statistics,
        errors: [`Transaction failed: ${error.message}`]
      };
    }
  }

  /**
   * Create import session record
   */
  static async createImportSession(data: {
    fileName: string;
    fileSize: number;
    totalRows: number;
  }): Promise<string> {
    const session = await prisma.importSession.create({
      data: {
        ...data,
        processedRows: 0,
        successfulRows: 0,
        failedRows: 0,
        contactsCreated: 0,
        relatedContactsCreated: 0,
        duplicatesFound: 0,
        status: 'PROCESSING'
      }
    });
    
    return session.id;
  }

  /**
   * Update import session with results
   */
  static async updateImportSession(
    sessionId: string, 
    data: {
      processedRows: number;
      successfulRows: number;
      failedRows: number;
      contactsCreated: number;
      relatedContactsCreated: number;
      duplicatesFound: number;
      status: 'COMPLETED' | 'FAILED';
      errorMessage?: string;
      statistics?: ImportStatistics;
    }
  ): Promise<void> {
    await prisma.importSession.update({
      where: { id: sessionId },
      data: {
        ...data,
        completedAt: new Date()
      }
    });
  }

  /**
   * Get all contacts with pagination
   */
  static async getContacts(options: {
    page?: number;
    limit?: number;
    search?: string;
    filter?: 'all' | 'main' | 'related' | 'duplicates';
    sortBy?: 'name' | 'recent' | 'category';
  } = {}): Promise<{
    contacts: any[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const {
      page = 1,
      limit = 20,
      search = '',
      filter = 'all',
      sortBy = 'name'
    } = options;

    const skip = (page - 1) * limit;
    
    // Build where clause
    const where: any = {};
    
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { city: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
        { 'phones.number': { contains: search } },
        { 'emails.address': { contains: search, mode: 'insensitive' } }
      ];
    }
    
    if (filter === 'main') {
      where.isMainContact = true;
    } else if (filter === 'related') {
      where.isMainContact = false;
    } else if (filter === 'duplicates') {
      where.duplicateGroup = { not: null };
    }

    // Build orderBy clause
    let orderBy: any = {};
    if (sortBy === 'name') {
      orderBy = { name: 'asc' };
    } else if (sortBy === 'recent') {
      orderBy = { createdAt: 'desc' };
    } else if (sortBy === 'category') {
      orderBy = { category: 'asc' };
    }

    const [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          parentContact: true,
          childContacts: true,
          relationshipsAsMain: {
            include: {
              relatedContact: true
            }
          },
          relationshipsAsRelated: {
            include: {
              contact: true
            }
          }
        }
      }),
      prisma.contact.count({ where })
    ]);

    return {
      contacts,
      total,
      page,
      totalPages: Math.ceil(total / limit)
    };
  }

  /**
   * Get contact by ID with all relationships
   */
  static async getContactById(id: string): Promise<any | null> {
    return await prisma.contact.findUnique({
      where: { id },
      include: {
        parentContact: true,
        childContacts: true,
        relationshipsAsMain: {
          include: {
            relatedContact: true
          }
        },
        relationshipsAsRelated: {
          include: {
            contact: true
          }
        }
      }
    });
  }

  /**
   * Search contacts
   */
  static async searchContacts(query: string, limit = 10): Promise<any[]> {
    return await prisma.contact.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { city: { contains: query, mode: 'insensitive' } },
          { 'phones.number': { contains: query } },
          { 'emails.address': { contains: query, mode: 'insensitive' } }
        ]
      },
      take: limit,
      orderBy: { name: 'asc' }
    });
  }

  /**
   * Get import sessions
   */
  static async getImportSessions(limit = 10): Promise<any[]> {
    return await prisma.importSession.findMany({
      orderBy: { startedAt: 'desc' },
      take: limit
    });
  }

  /**
   * Delete contact and related data
   */
  static async deleteContact(id: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      // Delete relationships
      await tx.contactRelationship.deleteMany({
        where: {
          OR: [
            { contactId: id },
            { relatedContactId: id }
          ]
        }
      });

      // Delete child contacts
      await tx.contact.deleteMany({
        where: { parentContactId: id }
      });

      // Delete the main contact
      await tx.contact.delete({
        where: { id }
      });
    });
  }

  /**
   * Map relationship type string to enum
   */
  private static mapRelationshipType(type: string): any {
    const mapping: { [key: string]: string } = {
      'child': 'child',
      'spouse': 'spouse',
      'parent': 'parent',
      'friend': 'friend',
      'colleague': 'colleague',
      'assistant': 'assistant',
      'sibling': 'sibling',
      'extended_family': 'extended_family',
      'grandparent': 'grandparent',
      'grandchild': 'grandchild',
      'in_law': 'in_law',
      'supervisor': 'supervisor',
      'subordinate': 'subordinate',
      'business_partner': 'business_partner',
      'client': 'client',
      'neighbor': 'neighbor',
      'related': 'related'
    };

    return mapping[type] || 'related';
  }

  /**
   * Get database statistics
   */
  static async getStatistics(): Promise<{
    totalContacts: number;
    mainContacts: number;
    relatedContacts: number;
    totalPhones: number;
    totalEmails: number;
    duplicateGroups: number;
    recentImports: number;
  }> {
    const [
      totalContacts,
      mainContacts,
      relatedContacts,
      duplicateGroups,
      recentImports
    ] = await Promise.all([
      prisma.contact.count(),
      prisma.contact.count({ where: { isMainContact: true } }),
      prisma.contact.count({ where: { isMainContact: false } }),
      prisma.contact.count({ where: { duplicateGroup: { not: null } } }),
      prisma.importSession.count({
        where: {
          startedAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
          }
        }
      })
    ]);

    // Get phone and email counts (these require aggregation)
    const contacts = await prisma.contact.findMany({
      select: { phones: true, emails: true }
    });

    const totalPhones = contacts.reduce((sum, c) => sum + c.phones.length, 0);
    const totalEmails = contacts.reduce((sum, c) => sum + c.emails.length, 0);

    return {
      totalContacts,
      mainContacts,
      relatedContacts,
      totalPhones,
      totalEmails,
      duplicateGroups,
      recentImports
    };
  }
}

// Types for the database service
interface ImportStatistics {
  totalContacts: number;
  mainContacts: number;
  relatedContacts: number;
  totalPhones: number;
  validPhones: number;
  invalidPhones: number;
  totalEmails: number;
  validEmails: number;
  invalidEmails: number;
  duplicateGroups: number;
  relationshipsFound: number;
}

// Export types for use in other files
export type { ImportStatistics };