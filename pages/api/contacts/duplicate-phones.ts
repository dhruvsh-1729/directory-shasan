// pages/api/contacts/duplicate-phones.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { ContactDatabaseService } from '@/lib/database';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const duplicateGroups = await ContactDatabaseService.getContactsWithDuplicatePhones();
    
    return res.status(200).json({
      success: true,
      data: duplicateGroups,
      count: duplicateGroups.length,
    });
  } catch (error) {
    console.error('Error fetching duplicate phones:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch duplicate phone numbers',
    });
  }
}