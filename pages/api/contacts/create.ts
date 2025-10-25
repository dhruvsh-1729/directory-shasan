import { ContactDatabaseService } from '@/lib/database';
import { ValidationUtils } from '@/lib/validation';
import { Contact } from '@/types';
import type { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const startTime = Date.now();

  try {
    if (
      req.body.name &&
      typeof req.body.name === 'string' &&
      req.body.name.trim().length > 0
    ) {
      const stringOrUndefined = (value: any): string | undefined => {
        if (value === null || value === undefined) return undefined;
        const str = String(value).trim();
        return str.length > 0 ? str : undefined;
      };

      const rawPayload = { ...req.body, name: String(req.body.name).trim() };
      const sanitized = ValidationUtils.sanitizeContact(rawPayload);

      const contactData: Omit<Contact, 'id' | 'createdAt' | 'lastUpdated'> = {
        name: sanitized.name || rawPayload.name,
        status: stringOrUndefined(rawPayload.status),
        address: stringOrUndefined(rawPayload.address),
        suburb: stringOrUndefined(rawPayload.suburb),
        city: sanitized.city ?? stringOrUndefined(rawPayload.city),
        pincode: stringOrUndefined(rawPayload.pincode),
        state: sanitized.state ?? stringOrUndefined(rawPayload.state),
        country: sanitized.country ?? stringOrUndefined(rawPayload.country),
        category: stringOrUndefined(rawPayload.category),
        officeAddress: stringOrUndefined(rawPayload.officeAddress),
        address2: stringOrUndefined(rawPayload.address2),
        isMainContact: sanitized.isMainContact ?? !!rawPayload.isMainContact,
        parentContactId: sanitized.parentContactId || stringOrUndefined(rawPayload.parentContactId),
        duplicateGroup: stringOrUndefined(rawPayload.duplicateGroup),
        alternateNames:
          sanitized.alternateNames ??
          (Array.isArray(rawPayload.alternateNames) ? rawPayload.alternateNames : []),
        tags: sanitized.tags ?? (Array.isArray(rawPayload.tags) ? rawPayload.tags : []),
        notes: stringOrUndefined(rawPayload.notes),
        avatarUrl: stringOrUndefined(rawPayload.avatarUrl),
        avatarPublicId: stringOrUndefined(rawPayload.avatarPublicId),
        phones: (sanitized.phones && sanitized.phones.length > 0
          ? sanitized.phones
          : rawPayload.phones || []
        ).map((phone: any, index: number) => {
          if (!phone.id) phone.id = phone.id ?? `phone_${Date.now()}_${index}`;
          return phone;
        }),
        emails: (sanitized.emails && sanitized.emails.length > 0
          ? sanitized.emails
          : rawPayload.emails || []
        ).map((email: any, index: number) => {
          if (!email.id) email.id = email.id ?? `email_${Date.now()}_${index}`;
          return email;
        }),
        relationships:
          sanitized.relationships ??
          (Array.isArray(rawPayload.relationships) ? rawPayload.relationships : []),
      };

      const parentId = stringOrUndefined(contactData.parentContactId);
      if (parentId) {
        contactData.parentContactId = parentId;
        contactData.isMainContact = false;
      } else {
        contactData.parentContactId = undefined;
        contactData.isMainContact = true;
      }

      const validation = ValidationUtils.validateContact(contactData);
      if (!validation.isValid) {
        return res
          .status(400)
          .json({ error: 'Validation failed', validationErrors: validation.errors });
      }

      if (!contactData.isMainContact && !contactData.parentContactId) {
        return res
          .status(400)
          .json({ error: 'Child contacts must include a parentContactId' });
      }

      contactData.phones?.forEach((p, i) => {
        if (!p.number || p.number.trim().length === 0)
          throw new Error(`Phone ${i + 1}: Missing phone number`);
      });
      contactData.emails?.forEach((e, i) => {
        if (!e.address || !e.address.includes('@'))
          throw new Error(`Email ${i + 1}: Invalid email format`);
      });

      const contact = await ContactDatabaseService.createContact(contactData);
      const processingTime = Date.now() - startTime;
      return res.status(201).json({
        ...contact,
        metadata: {
          processingTime: `${processingTime}ms`,
          createdAt: new Date().toISOString(),
        },
      });
    } else {
      return res.status(400).json({ error: 'Name is required' });
    }
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Internal Server Error' });
  }
}