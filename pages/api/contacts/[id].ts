// pages/api/contacts/[id].ts
import { NextApiRequest, NextApiResponse } from 'next';
import { ContactDatabaseService } from '@/lib/database';
import { Contact } from '@/types';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Contact ID is required' });
  }

  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(req, res, id);
      case 'PUT':
        return await handlePut(req, res, id);
      case 'DELETE':
        return await handleDelete(req, res, id);
      default:
        res.setHeader('Allow', ['GET', 'PUT', 'DELETE']);
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (error) {
    console.error('Contact detail API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function handleGet(req: NextApiRequest, res: NextApiResponse, id: string) {
  const contact = await ContactDatabaseService.getContactById(id);
  
  if (!contact) {
    return res.status(404).json({ error: 'Contact not found' });
  }

  // Also get related contacts
  const relatedContacts = await ContactDatabaseService.getRelatedContacts(id);

  return res.status(200).json({
    contact,
    relatedContacts
  });
}

async function handlePut(req: NextApiRequest, res: NextApiResponse, id: string) {
  const updates: Partial<Contact> = req.body;
  
  // Validate that we don't allow changing critical fields
  delete updates.id;
  // Ensure createdAt exists in Contact type or remove this line if unnecessary
    if ('createdAt' in updates) {
      delete updates.createdAt;
    }

  const updatedContact = await ContactDatabaseService.updateContact(id, updates);
  
  if (!updatedContact) {
    return res.status(404).json({ error: 'Contact not found' });
  }

  return res.status(200).json(updatedContact);
}

async function handleDelete(req: NextApiRequest, res: NextApiResponse, id: string) {
  const deleted = await ContactDatabaseService.deleteContact(id);
  
  if (!deleted) {
    return res.status(404).json({ error: 'Contact not found' });
  }

  return res.status(200).json({ success: true, message: 'Contact deleted successfully' });
}