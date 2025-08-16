// pages/api/contacts/import.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { ContactDatabaseService, prisma } from '@/lib/database';
import { Contact } from '@/types';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { contacts, fileName, fileSize }: { 
    contacts: Contact[], 
    fileName: string, 
    fileSize: number 
  } = req.body;

  if (!contacts || !Array.isArray(contacts)) {
    return res.status(400).json({ error: 'Contacts array is required' });
  }

  // Create import session
  const importSession = await prisma.importSession.create({
    data: {
      fileName: fileName || 'unknown',
      fileSize: fileSize || 0,
      status: 'PROCESSING',
      totalRecords: contacts.length,
      processedRecords: 0,
      errorRecords: 0,
      errors: []
    }
  });

  try {
    const errors: string[] = [];
    let processedCount = 0;
    let errorCount = 0;

    // Process in batches for better performance
    const batchSize = 100;
    for (let i = 0; i < contacts.length; i += batchSize) {
      const batch = contacts.slice(i, i + batchSize);
      
      try {
        // Validate and clean contacts in batch
        const validContacts = batch.map((contact, index) => {
          try {
            // Remove MongoDB-specific fields if present
            const { id, createdAt, lastUpdated, ...cleanContact } = contact as any;
            
            // Ensure required fields
            if (!cleanContact.name || cleanContact.name.trim() === '') {
              throw new Error(`Contact at index ${i + index} is missing name`);
            }

            return {
              ...cleanContact,
              name: cleanContact.name.trim(),
              phones: cleanContact.phones || [],
              emails: cleanContact.emails || [],
              relationships: cleanContact.relationships || [],
              alternateNames: cleanContact.alternateNames || [],
              tags: cleanContact.tags || []
            };
          } catch (error) {
            errors.push(`Batch ${Math.floor(i / batchSize) + 1}, Contact ${index + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            errorCount++;
            return null;
          }
        }).filter(Boolean) as Omit<Contact, 'id' | 'createdAt' | 'lastUpdated'>[];

        if (validContacts.length > 0) {
          const created = await ContactDatabaseService.createManyContacts(validContacts);
          processedCount += created;
        }

        // Update progress
        await prisma.importSession.update({
          where: { id: importSession.id },
          data: {
            processedRecords: processedCount,
            errorRecords: errorCount,
            errors: errors.slice(0, 100) // Keep only first 100 errors
          }
        });

      } catch (batchError) {
        errors.push(`Batch ${Math.floor(i / batchSize) + 1}: ${batchError instanceof Error ? batchError.message : 'Batch processing failed'}`);
        errorCount += batch.length;
      }
    }

    // Calculate statistics
    const statistics = {
      totalContacts: processedCount,
      mainContacts: contacts.filter(c => c.isMainContact).length,
      relatedContacts: contacts.filter(c => !c.isMainContact).length,
      totalPhones: contacts.reduce((sum, c) => sum + (c.phones?.length || 0), 0),
      totalEmails: contacts.reduce((sum, c) => sum + (c.emails?.length || 0), 0),
      categoryCounts: contacts.reduce((acc, c) => {
        if (c.category) {
          acc[c.category] = (acc[c.category] || 0) + 1;
        }
        return acc;
      }, {} as Record<string, number>)
    };

    // Finalize import session
    await prisma.importSession.update({
      where: { id: importSession.id },
      data: {
        status: errors.length > 0 && processedCount === 0 ? 'FAILED' : 'COMPLETED',
        processedRecords: processedCount,
        errorRecords: errorCount,
        errors: errors.slice(0, 100),
        statistics,
        completedAt: new Date()
      }
    });

    return res.status(200).json({
      success: true,
      importSessionId: importSession.id,
      statistics: {
        totalContacts: processedCount,
        errorCount,
        totalRecords: contacts.length,
        successRate: Math.round((processedCount / contacts.length) * 100)
      },
      errors: errors.slice(0, 10), // Return first 10 errors
      hasMoreErrors: errors.length > 10
    });

  } catch (error) {
    console.error('Import error:', error);
    
    // Update import session with failure
    await prisma.importSession.update({
      where: { id: importSession.id },
      data: {
        status: 'FAILED',
        errors: [error instanceof Error ? error.message : 'Unknown import error'],
        completedAt: new Date()
      }
    });

    return res.status(500).json({
      success: false,
      error: 'Import failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}