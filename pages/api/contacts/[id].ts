// pages/api/contacts/[id].ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

type Phone = {
  id: string;
  number: string;
  type: 'mobile'|'office'|'residence'|'fax'|'other';
  isPrimary: boolean;
  label?: string | null;
  country?: string | null;
  region?: string | null;
  isValid?: boolean | null;
};

type Email = {
  id: string;
  address: string;
  isPrimary: boolean;
  isValid?: boolean | null;
};

type ContactRelationship = {
  id: string;
  contactId: string;
  relatedContactId: string;
  relationshipType:
    | 'spouse'|'child'|'parent'|'sibling'|'extended_family'|'grandparent'|'grandchild'
    | 'in_law'|'colleague'|'assistant'|'supervisor'|'subordinate'
    | 'business_partner'|'client'|'friend'|'neighbor'|'related';
  description?: string | null;
};

type ContactPatch = {
  name?: string;
  status?: string | null;
  address?: string | null;
  suburb?: string | null;
  city?: string | null;
  pincode?: string | null;
  state?: string | null;
  country?: string | null;
  category?: string | null;
  officeAddress?: string | null;
  address2?: string | null;
  isMainContact?: boolean;
  parentContactId?: string | null;
  duplicateGroup?: string | null;
  alternateNames?: string[];
  tags?: string[];
  notes?: string | null;
  phones?: Phone[];
  emails?: Email[];
  relationships?: ContactRelationship[];
};

type PutBody = {
  patch: ContactPatch;                 // fields to update on target contact
  applyToParent?: boolean;             // if true & target is related, also update parent
  parentPatch?: ContactPatch;          // optional different patch for parent
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const id = String(req.query.id);

  try {
    if (req.method === 'GET') {
      const contact = await prisma.contact.findUnique({ where: { id } });
      if (!contact) return res.status(404).json({ message: 'Not found' });
      return res.status(200).json({ contact });
    }

    if (req.method === 'PUT') {
      const { patch, applyToParent } = (req.body || {}) as PutBody;
      if (!patch || typeof patch !== 'object') {
      return res.status(400).json({ message: 'Missing patch' });
      }

      // sanitize arrays if present
      const safePatch: Prisma.ContactUpdateInput = {
      ...stripUndef(patch),
      phones: patch.phones ? (patch.phones as any) : undefined,
      emails: patch.emails ? (patch.emails as any) : undefined,
      relationships: patch.relationships ? (patch.relationships as any) : undefined,
      lastUpdated: new Date(),
      };

      const existing = await prisma.contact.findUnique({ where: { id } });
      if (!existing) return res.status(404).json({ message: 'Not found' });

      // Update target contact
      const updated = await prisma.contact.update({
      where: { id },
      data: safePatch,
      });

      // Optionally update parent (only address fields if this contact is related)
      let parentUpdated = null as any;
      if (applyToParent && existing.isMainContact === false && existing.parentContactId) {
      const parentId = existing.parentContactId;
      const addressFields = [
        'address', 'suburb', 'city', 'pincode', 'state', 'country', 'officeAddress', 'address2'
      ];
      const parentAddressPatch: Prisma.ContactUpdateInput = {
        lastUpdated: new Date(),
      };
      for (const field of addressFields) {
        if (field in patch) {
        (parentAddressPatch as any)[field] = (patch as any)[field];
        }
      }

      parentUpdated = await prisma.contact.update({
        where: { id: parentId },
        data: parentAddressPatch,
      });
      }

      return res.status(200).json({ contact: updated, parentContact: parentUpdated });
    }

    return res.status(405).json({ message: 'Method not allowed' });
  } catch (err: any) {
    console.error('contacts/[id] error:', err);
    return res.status(500).json({ message: err.message || 'Server error' });
  } finally {
    // prisma will be reused by Next.js; avoid disconnect() here
  }
}

function stripUndef<T extends Record<string, any>>(obj: T): T {
  const out = {} as any;
  for (const k in obj) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}
