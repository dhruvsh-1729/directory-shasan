// pages/api/contacts/index.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { ContactDatabaseService, ContactFilters, PaginationOptions, prisma } from '@/lib/database';
import { Contact } from '@/types';
import { Prisma } from '@prisma/client';

export interface ContactSearchResult {
  contacts: any[];
  total: number;
  totalPages: number;
  currentPage: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(req, res);
      case 'POST':
        return await handlePost(req, res);
      default:
        res.setHeader('Allow', ['GET', 'POST']);
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Contacts API error:', error);
    
    // Return a more specific error response
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    const statusCode = errorMessage.includes('Invalid') || errorMessage.includes('validation') ? 400 : 500;
    
    return res.status(statusCode).json({ 
      error: 'Failed to process request',
      details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      timestamp: new Date().toISOString()
    });
  }
}

async function handleGet(req: NextApiRequest, res: NextApiResponse) {
  try {
    const {
      search,
      filter = 'all',
      city,
      state,
      category,
      hasEmails,
      hasPhones,
      createdAfter,
      createdBefore,
      page = '1',
      limit = '20'
    } = req.query;

    // Validate pagination parameters
    const pageNum = Math.max(1, parseInt(page as string, 10) || 1);
    const limitNum = Math.min(Math.max(1, parseInt(limit as string, 10) || 20), 100);

    const filters: ContactFilters = {
      search: search as string || undefined,
      filter: (filter as 'all' | 'main' | 'related' | 'duplicates') || 'all',
      city: city as string || undefined,
      state: state as string || undefined,
      category: category as string || undefined,
      hasEmails: hasEmails === 'true' ? true : hasEmails === 'false' ? false : undefined,
      hasPhones: hasPhones === 'true' ? true : hasPhones === 'false' ? false : undefined,
      createdAfter: createdAfter ? new Date(createdAfter as string) : undefined,
      createdBefore: createdBefore ? new Date(createdBefore as string) : undefined
    };

    // Remove undefined values to avoid issues
    Object.keys(filters).forEach(key => {
      if (filters[key as keyof ContactFilters] === undefined) {
        delete filters[key as keyof ContactFilters];
      }
    });

    const pagination: PaginationOptions = {
      page: pageNum,
      limit: limitNum
    };

    const result = await ContactDatabaseService.searchContacts(filters, pagination);
    
    // Add response metadata
    res.setHeader('X-Total-Count', result.total.toString());
    res.setHeader('X-Page', result.currentPage.toString());
    res.setHeader('X-Total-Pages', result.totalPages.toString());
    
    return res.status(200).json(result);
  } catch (error) {
    console.error('GET contacts error:', error);
    throw error; // Re-throw to be handled by main handler
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { contacts, search, filter, page, limit, ...otherFilters } = req.body;

    // If it's a search request (POST with search parameters)
    if (!contacts && (search !== undefined || filter !== undefined || Object.keys(otherFilters).length > 0)) {
      // Validate pagination parameters
      const pageNum = Math.max(1, page || 1);
      const limitNum = Math.min(Math.max(1, limit || 20), 100);

      const filters: ContactFilters = {
        search: search || undefined,
        filter: filter || 'all',
        city: req.body.city || undefined,
        state: req.body.state || undefined,
        category: req.body.category || undefined,
        hasEmails: req.body.hasEmails,
        hasPhones: req.body.hasPhones,
        createdAfter: req.body.createdAfter ? new Date(req.body.createdAfter) : undefined,
        createdBefore: req.body.createdBefore ? new Date(req.body.createdBefore) : undefined
      };

      // Remove undefined values
      Object.keys(filters).forEach(key => {
        if (filters[key as keyof ContactFilters] === undefined) {
          delete filters[key as keyof ContactFilters];
        }
      });

      const pagination: PaginationOptions = {
        page: pageNum,
        limit: limitNum
      };

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
      
      const skip = (pagination.page - 1) * pagination.limit;
      
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
        }),
        prisma.contact.count({ where })
      ]);
      
      const totalPages = Math.ceil(total / pagination.limit);
      
      const result: ContactSearchResult = {
        contacts: contacts,
        total,
        totalPages,
        currentPage: pagination.page,
        hasNextPage: pagination.page < totalPages,
        hasPrevPage: pagination.page > 1
      };
      
      // Add response metadata
      res.setHeader('X-Total-Count', result.total.toString());
      res.setHeader('X-Page', result.currentPage.toString());
      res.setHeader('X-Total-Pages', result.totalPages.toString());
      
      return res.status(200).json(result);
    }

    // If it's a bulk create request
    if (contacts && Array.isArray(contacts)) {
      // Validate contacts array
      if (contacts.length === 0) {
        return res.status(400).json({ error: 'Contacts array cannot be empty' });
      }

      if (contacts.length > 1000) {
        return res.status(400).json({ error: 'Cannot create more than 1000 contacts at once' });
      }

      // Validate each contact has a name
      const invalidContacts = contacts.filter((contact, index) => 
        !contact.name || typeof contact.name !== 'string' || contact.name.trim().length === 0
      );

      if (invalidContacts.length > 0) {
        return res.status(400).json({ 
          error: 'All contacts must have a valid name',
          invalidCount: invalidContacts.length
        });
      }

      const count = await ContactDatabaseService.createManyContacts(contacts);
      return res.status(201).json({ 
        success: true, 
        created: count,
        message: `Successfully created ${count} contacts`
      });
    }

    // Single contact creation
    if (req.body.name && typeof req.body.name === 'string' && req.body.name.trim().length > 0) {
      const contactData = {
        ...req.body,
        name: req.body.name.trim()
      } as Omit<Contact, 'id' | 'createdAt' | 'lastUpdated'>;

      const contact = await ContactDatabaseService.createContact(contactData);
      return res.status(201).json(contact);
    }

    return res.status(400).json({ 
      error: 'Invalid request body',
      message: 'Request must include either contacts array, search parameters, or valid contact data with name'
    });
  } catch (error) {
    console.error('POST contacts error:', error);
    throw error; // Re-throw to be handled by main handler
  }
}