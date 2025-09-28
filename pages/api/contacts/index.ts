// pages/api/contacts/index.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { ContactDatabaseService, ContactFilters, PaginationOptions, prisma } from '@/lib/database';
import { Contact } from '@/types';
import { Prisma } from '@prisma/client';
import rateLimit from '@/lib/rateLimit';

export interface ContactSearchResult {
  contacts: any[];
  total: number;
  totalPages: number;
  currentPage: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  searchTime?: number;
  cacheHit?: boolean;
}

// Rate limiting configuration
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 500, // Max 500 unique tokens per interval
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const startTime = Date.now();
  
  try {
    // Apply rate limiting
    await limiter.check(res, 10, 'CACHE_TOKEN'); // 10 requests per minute
    
    // Add CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    
    if (req.method === 'OPTIONS') {
      res.status(200).end();
      return;
    }
    
    switch (req.method) {
      case 'GET':
        return await handleGet(req, res, startTime);
      case 'POST':
        return await handlePost(req, res, startTime);
      default:
        res.setHeader('Allow', ['GET', 'POST', 'OPTIONS']);
        return res.status(405).json({ 
          error: 'Method not allowed',
          allowedMethods: ['GET', 'POST', 'OPTIONS']
        });
    }
  } catch (error) {
    console.error('Contacts API error:', error);
    
    // Handle rate limiting errors
    if (error instanceof Error && error.message.includes('Rate limit')) {
      return res.status(429).json({
        error: 'Too many requests',
        message: 'Please wait before making more requests',
        retryAfter: 60
      });
    }
    
    const errorMessage = error instanceof Error ? error.message : 'Internal server error';
    const statusCode = errorMessage.includes('Invalid') || errorMessage.includes('validation') ? 400 : 500;
    
    return res.status(statusCode).json({ 
      error: 'Failed to process request',
      details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      timestamp: new Date().toISOString(),
      requestId: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    });
  }
}

async function handleGet(req: NextApiRequest, res: NextApiResponse, startTime: number) {
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
      limit = '20',
      includeValidation = 'true',
      skipPagination = 'false',
    } = req.query;

    // Validate and sanitize pagination parameters
    const pageNum = Math.max(1, Math.min(parseInt(page as string, 10) || 1, 1000));
    const limitNum = Math.min(Math.max(1, parseInt(limit as string, 10) || 20), 100);

    // Build filters with proper validation
    const filters: ContactFilters = {
      search: search ? String(search).trim() : undefined,
      filter: ['all', 'main', 'related', 'duplicates'].includes(String(filter)) 
        ? filter as any 
        : 'all',
      city: city ? String(city).trim() : undefined,
      state: state ? String(state).trim() : undefined,
      category: category ? String(category).trim() : undefined,
      hasEmails: hasEmails === 'true' ? true : hasEmails === 'false' ? false : undefined,
      hasPhones: hasPhones === 'true' ? true : hasPhones === 'false' ? false : undefined,
      createdAfter: createdAfter ? new Date(createdAfter as string) : undefined,
      createdBefore: createdBefore ? new Date(createdBefore as string) : undefined
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

    console.log(`📊 GET request - Filters:`, filters, `Pagination:`, pagination);

    const result = await ContactDatabaseService.searchContacts(filters, pagination);
    
    // Add performance metrics
    const searchTime = Date.now() - startTime;
    
    // Enhanced response with metadata
    const enhancedResult = {
      ...result,
      searchTime,
      metadata: {
        totalRecords: result.total,
        recordsPerPage: pagination.limit,
        currentPage: pagination.page,
        searchParams: filters,
        performance: {
          queryTime: `${searchTime}ms`,
          timestamp: new Date().toISOString()
        }
      }
    };
    
    // Set comprehensive response headers
    res.setHeader('X-Total-Count', result.total.toString());
    res.setHeader('X-Page', result.currentPage.toString());
    res.setHeader('X-Total-Pages', result.totalPages.toString());
    res.setHeader('X-Has-Next-Page', result.hasNextPage.toString());
    res.setHeader('X-Has-Prev-Page', result.hasPrevPage.toString());
    res.setHeader('X-Search-Time', `${searchTime}ms`);
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    
    return res.status(200).json(enhancedResult);
  } catch (error) {
    console.error('GET contacts error:', error);
    throw error;
  }
}

async function handlePost(req: NextApiRequest, res: NextApiResponse, startTime: number) {
  try {
    const { contacts, search, filter, page, limit, ...otherFilters } = req.body;

    // Handle search requests (POST with search parameters)
    if (!contacts && (search !== undefined || filter !== undefined || Object.keys(otherFilters).length > 0)) {
      return await handleSearchRequest(req, res, startTime);
    }

    // Handle bulk contact creation
    if (contacts && Array.isArray(contacts)) {
      return await handleBulkCreate(req, res, contacts, startTime);
    }

    // Handle single contact creation
    if (req.body.name && typeof req.body.name === 'string' && req.body.name.trim().length > 0) {
      return await handleSingleCreate(req, res, startTime);
    }

    return res.status(400).json({ 
      error: 'Invalid request body',
      message: 'Request must include either contacts array, search parameters, or valid contact data with name',
      expectedFormats: {
        search: 'POST with search, filter, and other query parameters',
        bulkCreate: 'POST with contacts array',
        singleCreate: 'POST with contact object containing name field'
      }
    });
  } catch (error) {
    console.error('POST contacts error:', error);
    throw error;
  }
}

async function handleSearchRequest(req: NextApiRequest, res: NextApiResponse, startTime: number) {
  // Validate and sanitize search parameters
  const pageNum = Math.max(1, Math.min(req.body.page || 1, 1000));
  const limitNum = Math.min(Math.max(1, req.body.limit || 20), 100);
  const skipPagination = req.body.skipPagination === true;

  const filters: ContactFilters = {
    search: req.body.search ? String(req.body.search).trim() : undefined,
    filter: ['all', 'main', 'related', 'duplicates'].includes(String(req.body.filter)) 
      ? req.body.filter 
      : 'all',
    city: req.body.city ? String(req.body.city).trim() : undefined,
    state: req.body.state ? String(req.body.state).trim() : undefined,
    category: req.body.category ? String(req.body.category).trim() : undefined,
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

  console.log(`🔍 POST search request - Filters:`, filters, `Pagination:`, pagination);

  // Build optimized MongoDB query
  const where: Prisma.ContactWhereInput = {};
  
  // Enhanced search with better text matching
  if (filters.search) {
    const searchTerm = filters.search.toLowerCase();
    const searchWords = searchTerm.split(/\s+/).filter(word => word.length > 0);
    
    // Multi-word search support
    where.OR = [
      { name: { contains: searchTerm, mode: 'insensitive' } },
      { phones: { some: { number: { contains: searchTerm.replace(/\s/g, '') } } } },
      { emails: { some: { address: { contains: searchTerm, mode: 'insensitive' } } } },
      { city: { contains: searchTerm, mode: 'insensitive' } },
      { state: { contains: searchTerm, mode: 'insensitive' } },
      { category: { contains: searchTerm, mode: 'insensitive' } },
      { status: { contains: searchTerm, mode: 'insensitive' } },
      { tags: { hasSome: searchWords } },
      { alternateNames: { hasSome: [searchTerm] } },
      { notes: { contains: searchTerm, mode: 'insensitive' } }
    ];
  }
  
  // Apply filters with proper type checking
  if (filters.filter === 'main') {
    where.isMainContact = true;
  } else if (filters.filter === 'related') {
    where.isMainContact = false;
  } else if (filters.filter === 'duplicates') {
    where.duplicateGroup = { not: null };
  }
  
  // Location filters with fuzzy matching
  if (filters.city) {
    where.city = { contains: filters.city, mode: 'insensitive' };
  }
  if (filters.state) {
    where.state = { contains: filters.state, mode: 'insensitive' };
  }
  
  // Category filter with multi-category support
  if (filters.category) {
    where.category = { contains: filters.category, mode: 'insensitive' };
  }
  
  // Contact data filters
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
  
  const skip = (pagination.page - 1) * pagination.limit;
  
  console.log(`📋 Executing optimized query:`, JSON.stringify(where, null, 2));
  
  // Execute optimized parallel queries with proper error handling
  let contacts: any[] = [];
  let total: number = 0;

  if (skipPagination) {
    // Fetch all contacts without pagination
    contacts = await prisma.contact.findMany({
      where,
      include: {
        childContacts: true,
        parentContact: true,
      },
      orderBy: [
        { name: 'asc' },
        { isMainContact: 'desc' },
        { lastUpdated: 'desc' },
      ]
    }).catch((error) => {
      console.error('Error fetching contacts:', error);
      return [];
    });
    total = contacts.length;
  } else {
    // Paginated fetch
    [contacts, total] = await Promise.all([
      prisma.contact.findMany({
        where,
        skip,
        take: pagination.limit,
        include: {
          childContacts: true,
          parentContact: true,
        },
        orderBy: [
          { name: 'asc' },
          { isMainContact: 'desc' },
          { lastUpdated: 'desc' },
        ]
      }).catch((error) => {
        console.error('Error fetching contacts:', error);
        return [];
      }),
      prisma.contact.count({ where }).catch((error) => {
        console.error('Error counting contacts:', error);
        return 0;
      })
    ]);
  }
  
  const searchTime = Date.now() - startTime;
  const totalPages = Math.ceil(total / pagination.limit);
  
  console.log(`✅ Search completed - Found: ${contacts.length}, Total: ${total}, Time: ${searchTime}ms`);
  
  const result: ContactSearchResult = {
    contacts: contacts,
    total,
    totalPages,
    currentPage: pagination.page,
    hasNextPage: pagination.page < totalPages,
    hasPrevPage: pagination.page > 1,
    searchTime
  };
  
  // Set performance and caching headers
  res.setHeader('X-Total-Count', result.total.toString());
  res.setHeader('X-Page', result.currentPage.toString());
  res.setHeader('X-Total-Pages', result.totalPages.toString());
  res.setHeader('X-Search-Time', `${searchTime}ms`);
  
  // Cache successful searches for better performance
  if (result.total > 0 || !filters.search) {
    res.setHeader('Cache-Control', 'public, max-age=120, stale-while-revalidate=300');
  } else {
    res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
  }
  
  return res.status(200).json(result);
}

async function handleBulkCreate(req: NextApiRequest, res: NextApiResponse, contacts: Contact[], startTime: number) {
  // Validate bulk create request
  if (contacts.length === 0) {
    return res.status(400).json({ 
      error: 'Contacts array cannot be empty',
      received: contacts.length
    });
  }

  if (contacts.length > 1000) {
    return res.status(400).json({ 
      error: 'Cannot create more than 1000 contacts at once',
      received: contacts.length,
      maxAllowed: 1000
    });
  }

  // Validate each contact
  const validationErrors: string[] = [];
  contacts.forEach((contact, index) => {
    if (!contact.name || typeof contact.name !== 'string' || contact.name.trim().length === 0) {
      validationErrors.push(`Contact ${index + 1}: Missing or invalid name`);
    }
    
    // Validate phone numbers
    if (contact.phones) {
      contact.phones.forEach((phone, phoneIndex) => {
        if (!phone.number || phone.number.trim().length === 0) {
          validationErrors.push(`Contact ${index + 1}, Phone ${phoneIndex + 1}: Missing phone number`);
        }
      });
    }
    
    // Validate email addresses
    if (contact.emails) {
      contact.emails.forEach((email, emailIndex) => {
        if (!email.address || !email.address.includes('@')) {
          validationErrors.push(`Contact ${index + 1}, Email ${emailIndex + 1}: Invalid email format`);
        }
      });
    }
  });

  if (validationErrors.length > 0) {
    return res.status(400).json({ 
      error: 'Validation failed',
      validationErrors: validationErrors.slice(0, 20), // Limit error messages
      totalErrors: validationErrors.length
    });
  }

  console.log(`📦 Bulk creating ${contacts.length} contacts`);

  const result = await ContactDatabaseService.createManyContacts(contacts);
  const processingTime = Date.now() - startTime;
  
  return res.status(201).json({ 
    success: true, 
    created: result.count,
    errors: result.errors,
    statistics: {
      totalRequested: contacts.length,
      successfullyCreated: result.count,
      failed: contacts.length - result.count,
      successRate: Math.round((result.count / contacts.length) * 100),
      processingTime: `${processingTime}ms`
    },
    message: `Successfully created ${result.count} out of ${contacts.length} contacts`
  });
}

async function handleSingleCreate(req: NextApiRequest, res: NextApiResponse, startTime: number) {
  // Validate single contact creation
  const contactData = {
    ...req.body,
    name: req.body.name.trim()
  } as Omit<Contact, 'id' | 'createdAt' | 'lastUpdated'>;

  // Additional validation
  if (contactData.phones) {
    contactData.phones.forEach((phone, index) => {
      if (!phone.number || phone.number.trim().length === 0) {
        throw new Error(`Phone ${index + 1}: Missing phone number`);
      }
    });
  }

  if (contactData.emails) {
    contactData.emails.forEach((email, index) => {
      if (!email.address || !email.address.includes('@')) {
        throw new Error(`Email ${index + 1}: Invalid email format`);
      }
    });
  }

  console.log(`👤 Creating single contact: ${contactData.name}`);

  const contact = await ContactDatabaseService.createContact(contactData);
  const processingTime = Date.now() - startTime;
  
  return res.status(201).json({
    ...contact,
    metadata: {
      processingTime: `${processingTime}ms`,
      createdAt: new Date().toISOString()
    }
  });
}