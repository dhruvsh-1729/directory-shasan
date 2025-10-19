// pages/api/contacts/export.ts
import { NextApiRequest, NextApiResponse } from 'next';
import * as XLSX from 'xlsx';
import {
  ContactDatabaseService,
  ContactFilters,
  PaginationOptions,
} from '@/lib/database';

function stripPlus91(num: string): string {
  if (!num) return '';
  return num.replace(/^\s*\+?\s*91[\s\-()]*/i, '').trim();
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const {
      fields = [],
      format = 'xlsx', // 'xlsx' | 'csv'
      skipPagination = true,
      // Extract filters from request body (same as contacts/index.ts)
      search, filter = 'all',
      city, state, suburb, country, pincode, category, status,
      hasEmails, hasPhones, hasAddress, hasCategory, noCategory, missingAddress,
      missingCity, missingState, missingCountry, missingSuburb, missingPincode,
      isMain, hasParent, hasAvatar,
      validPhonesOnly, validEmailsOnly, phoneTypes, primaryPhoneOnly, emailDomain,
      tagsAny, tagsAll, categoryIn,
      createdAfter, createdBefore, updatedAfter, updatedBefore,
      page = 1, limit = 20,
    } = req.body || {};

    // Use same parsing logic as contacts/index.ts GET method
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
      hasCategory: parseBool(hasCategory),
      noCategory: parseBool(noCategory),
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

    // Remove undefined values
    Object.keys(filters).forEach(k => (filters as any)[k] === undefined && delete (filters as any)[k]);

    // Handle pagination - skip if requested, otherwise use provided values
    const pagination: PaginationOptions = skipPagination
      ? { page: 1, limit: 1_000_000 }
      : { page: Math.max(1, Number(page) || 1), limit: Math.max(1, Number(limit) || 20) };

    const result = await ContactDatabaseService.searchContacts(filters, pagination);
    const contacts = (result.contacts || []).map(contact => ({
      ...contact,
      phones: contact.phones ? contact.phones.map((phone: any) => ({
        ...phone,
        number: stripPlus91(phone.number)
      })) : []
    }));

    // Return the contacts in the same format as search API
    return res.status(200).json({
      contacts,
      total: result.total,
      exported: contacts.length,
      skipPagination,
      filters: filters,
    });
  } catch (error) {
    console.error('Export error:', error);
    return res.status(500).json({ error: 'Export failed' });
  }
}
