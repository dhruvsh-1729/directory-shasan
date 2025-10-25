import type { NextApiRequest, NextApiResponse } from 'next';
import { ContactDatabaseService } from '@/lib/database';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET', 'OPTIONS']);
    res.status(405).json({ error: 'Method not allowed', allowedMethods: ['GET', 'OPTIONS'] });
    return;
  }

  try {
    const { q, limit = '10', page = '1' } = req.query;
    const search = Array.isArray(q) ? q.join(' ').trim() : (q ? String(q).trim() : '');
    const limitNum = Math.min(Math.max(parseInt(String(limit), 10) || 10, 1), 50);
    const pageNum = Math.max(parseInt(String(page), 10) || 1, 1);

    const result = await ContactDatabaseService.searchContacts(
      {
        search: search.length > 0 ? search : undefined,
        filter: 'main',
        hasParent: false,
      },
      { page: pageNum, limit: limitNum }
    );

    const parents = result.contacts.map((contact) => ({
      id: contact.id,
      name: contact.name,
      status: contact.status ?? null,
      category: contact.category ?? null,
      suburb: contact.suburb ?? null,
      city: contact.city ?? null,
      state: contact.state ?? null,
      country: contact.country ?? null,
      pincode: contact.pincode ?? null,
      phones: contact.phones ?? [],
      emails: contact.emails ?? [],
      address: contact.address ?? null,
    }));

    res.status(200).json({
      parents,
      total: result.total,
      totalPages: result.totalPages,
      page: result.currentPage,
      hasNextPage: result.hasNextPage,
      hasPrevPage: result.hasPrevPage,
    });
  } catch (error) {
    console.error('Parent contact search failed:', error);
    res.status(500).json({ error: 'Failed to load parent contacts' });
  }
}
