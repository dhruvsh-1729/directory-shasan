// pages/api/contacts/index.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { ContactDatabaseService, ContactFilters, PaginationOptions } from '@/lib/database';
import { Contact } from '@/types';
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

const limiter = rateLimit({
  interval: 60 * 1000,
  uniqueTokenPerInterval: 500,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const startTime = Date.now();
  try {
    // await limiter.check(res, 10, 'CACHE_TOKEN');
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
        return res.status(405).json({ error: 'Method not allowed', allowedMethods: ['GET', 'POST', 'OPTIONS'] });
    }
  } catch (error) {
    console.error('Contacts API error:', error);
    if (error instanceof Error && error.message.includes('Rate limit')) {
      return res.status(429).json({ error: 'Too many requests', message: 'Please wait before making more requests', retryAfter: 60 });
    }
    const msg = error instanceof Error ? error.message : 'Internal server error';
    const statusCode = msg.toLowerCase().includes('invalid') || msg.toLowerCase().includes('validation') ? 400 : 500;
    return res.status(statusCode).json({ 
      error: 'Failed to process request',
      details: process.env.NODE_ENV === 'development' ? msg : undefined,
      timestamp: new Date().toISOString(),
      requestId: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    });
  }
}

async function handleGet(req: NextApiRequest, res: NextApiResponse, startTime: number) {
  const {
    search, filter = 'all',
    city, state, suburb, country, pincode, category, status,
    hasEmails, hasPhones, hasAddress, missingAddress,
    missingCity, missingState, missingCountry, missingSuburb, missingPincode,
    isMain, hasParent, hasAvatar,
    validPhonesOnly, validEmailsOnly, phoneTypes, primaryPhoneOnly, emailDomain,
    tagsAny, tagsAll, categoryIn,
    createdAfter, createdBefore, updatedAfter, updatedBefore,
    page = '1', limit = '20',
  } = req.query;

  const pageNum = Math.max(1, Math.min(parseInt(String(page), 10) || 1, 1000));
  const limitNum = Math.min(Math.max(1, parseInt(String(limit), 10) || 20), 100);

  const parseBool = (v: any): boolean | undefined => v === 'true' ? true : v === 'false' ? false : undefined;
  const parseArr = (v: any): string[] | undefined => {
    if (!v) return undefined;
    if (Array.isArray(v)) return v as string[];
    return String(v).split(',').map(s => s.trim()).filter(Boolean);
  };

  const filters: ContactFilters = {
    search: search ? String(search).trim() : undefined,
    filter: ['all', 'main', 'related', 'duplicates'].includes(String(filter)) ? (filter as any) : 'all',
    city: city ? String(city).trim() : undefined,
    state: state ? String(state).trim() : undefined,
    suburb: suburb ? String(suburb).trim() : undefined,
    country: country ? String(country).trim() : undefined,
    pincode: pincode ? String(pincode).trim() : undefined,
    category: category ? String(category).trim() : undefined,
    status: status ? String(status).trim() : undefined,

    hasEmails: parseBool(hasEmails),
    hasPhones: parseBool(hasPhones),
    hasAddress: parseBool(hasAddress),
    missingAddress: parseBool(missingAddress),
    missingCity: parseBool(missingCity),
    missingState: parseBool(missingState),
    missingCountry: parseBool(missingCountry),
    missingSuburb: parseBool(missingSuburb),
    missingPincode: parseBool(missingPincode),

    isMain: parseBool(isMain),
    hasParent: parseBool(hasParent),
    hasAvatar: parseBool(hasAvatar),

    validPhonesOnly: parseBool(validPhonesOnly),
    validEmailsOnly: parseBool(validEmailsOnly),
    primaryPhoneOnly: parseBool(primaryPhoneOnly),
    emailDomain: emailDomain ? String(emailDomain).trim() : undefined,

    phoneTypes: parseArr(phoneTypes) as any,
    tagsAny: parseArr(tagsAny),
    tagsAll: parseArr(tagsAll),
    categoryIn: parseArr(categoryIn),

    createdAfter: createdAfter ? new Date(String(createdAfter)) : undefined,
    createdBefore: createdBefore ? new Date(String(createdBefore)) : undefined,
    updatedAfter: updatedAfter ? new Date(String(updatedAfter)) : undefined,
    updatedBefore: updatedBefore ? new Date(String(updatedBefore)) : undefined,
  };

  Object.keys(filters).forEach(k => (filters as any)[k] === undefined && delete (filters as any)[k]);
  const pagination: PaginationOptions = { page: pageNum, limit: limitNum };

  const result = await ContactDatabaseService.searchContacts(filters, pagination);
  const searchTime = Date.now() - startTime;
  res.setHeader('X-Total-Count', result.total.toString());
  res.setHeader('X-Page', result.currentPage.toString());
  res.setHeader('X-Total-Pages', result.totalPages.toString());
  res.setHeader('X-Has-Next-Page', result.hasNextPage.toString());
  res.setHeader('X-Has-Prev-Page', result.hasPrevPage.toString());
  res.setHeader('X-Search-Time', `${searchTime}ms`);
  res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');

  return res.status(200).json({
    ...result,
    searchTime,
    metadata: {
      totalRecords: result.total,
      recordsPerPage: pagination.limit,
      currentPage: pagination.page,
      searchParams: filters,
      performance: { queryTime: `${searchTime}ms`, timestamp: new Date().toISOString() }
    }
  });
}

async function handlePost(req: NextApiRequest, res: NextApiResponse, startTime: number) {
  const { contacts, search, filter, page, limit, ...otherFilters } = req.body;

  // SEARCH (now centralized)
  if (!contacts && (search !== undefined || filter !== undefined || Object.keys(otherFilters).length > 0)) {
    const pageNum = Math.max(1, Math.min(page || 1, 1000));
    const limitNum = Math.min(Math.max(1, limit || 20), 100);

    const filters: ContactFilters = {
      ...otherFilters,
      search: search ? String(search).trim() : undefined,
      filter: ['all', 'main', 'related', 'duplicates'].includes(String(filter)) ? filter : 'all',
      createdAfter: otherFilters.createdAfter ? new Date(otherFilters.createdAfter) : undefined,
      createdBefore: otherFilters.createdBefore ? new Date(otherFilters.createdBefore) : undefined,
      updatedAfter: otherFilters.updatedAfter ? new Date(otherFilters.updatedAfter) : undefined,
      updatedBefore: otherFilters.updatedBefore ? new Date(otherFilters.updatedBefore) : undefined
    };

    Object.keys(filters).forEach(k => (filters as any)[k] === undefined && delete (filters as any)[k]);

    const pagination: PaginationOptions = { page: pageNum, limit: limitNum };
    const result = await ContactDatabaseService.searchContacts(filters, pagination);

    const searchTime = Date.now() - startTime;
    res.setHeader('X-Total-Count', result.total.toString());
    res.setHeader('X-Page', result.currentPage.toString());
    res.setHeader('X-Total-Pages', result.totalPages.toString());
    res.setHeader('X-Search-Time', `${searchTime}ms`);
    res.setHeader('Cache-Control', result.total > 0 || !filters.search ? 'public, max-age=20, stale-while-revalidate=40' : 'public, max-age=30, stale-while-revalidate=60');

    return res.status(200).json({ ...result, searchTime });
  }

  // BULK CREATE
  if (contacts && Array.isArray(contacts)) {
    if (contacts.length === 0) {
      return res.status(400).json({ error: 'Contacts array cannot be empty', received: contacts.length });
    }
    if (contacts.length > 1000) {
      return res.status(400).json({ error: 'Cannot create more than 1000 contacts at once', received: contacts.length, maxAllowed: 1000 });
    }

    const validationErrors: string[] = [];
    contacts.forEach((c: Contact, i: number) => {
      if (!c.name || typeof c.name !== 'string' || c.name.trim().length === 0) {
        validationErrors.push(`Contact ${i + 1}: Missing or invalid name`);
      }
      c.phones?.forEach((p, pi) => { if (!p.number || p.number.trim().length === 0) validationErrors.push(`Contact ${i + 1}, Phone ${pi + 1}: Missing phone number`); });
      c.emails?.forEach((e, ei) => { if (!e.address || !e.address.includes('@')) validationErrors.push(`Contact ${i + 1}, Email ${ei + 1}: Invalid email format`); });
    });
    if (validationErrors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', validationErrors: validationErrors.slice(0, 20), totalErrors: validationErrors.length });
    }

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

  // SINGLE CREATE
  if (req.body.name && typeof req.body.name === 'string' && req.body.name.trim().length > 0) {
    const contactData = { ...req.body, name: req.body.name.trim() } as Omit<Contact, 'id' | 'createdAt' | 'lastUpdated'>;
    contactData.phones?.forEach((p, i) => { if (!p.number || p.number.trim().length === 0) throw new Error(`Phone ${i + 1}: Missing phone number`); });
    contactData.emails?.forEach((e, i) => { if (!e.address || !e.address.includes('@')) throw new Error(`Email ${i + 1}: Invalid email format`); });

    const contact = await ContactDatabaseService.createContact(contactData);
    const processingTime = Date.now() - startTime;
    return res.status(201).json({ ...contact, metadata: { processingTime: `${processingTime}ms`, createdAt: new Date().toISOString() } });
  }

  return res.status(400).json({ 
    error: 'Invalid request body',
    message: 'Request must include either contacts array, search parameters, or valid contact data with name'
  });
}
