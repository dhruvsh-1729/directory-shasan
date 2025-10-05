// pages/api/contacts/import.ts - Enhanced Import API
import { NextApiRequest, NextApiResponse } from 'next';
import { ContactDatabaseService, prisma } from '@/lib/database';
import { Contact } from '@/types';
import rateLimit from '@/lib/rateLimit';

const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 100, // Fewer imports allowed
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Apply stricter rate limiting for imports
    // await limiter.check(res, 3, 'IMPORT_TOKEN'); // Only 3 imports per minute

    const startTime = Date.now();
    const { contacts, fileName, fileSize, options = {} }: { 
      contacts: Contact[], 
      fileName: string, 
      fileSize: number,
      options: {
        skipValidation?: boolean;
        batchSize?: number;
        updateExisting?: boolean;
      }
    } = req.body;

    // Validate request
    if (!contacts || !Array.isArray(contacts)) {
      return res.status(400).json({ 
        error: 'Contacts array is required',
        received: typeof contacts
      });
    }

    if (contacts.length === 0) {
      return res.status(400).json({ 
        error: 'Cannot import empty contacts array',
        contactCount: 0
      });
    }

    if (contacts.length > 5000) {
      return res.status(400).json({ 
        error: 'Too many contacts in single import',
        received: contacts.length,
        maxAllowed: 5000,
        suggestion: 'Please split into smaller batches'
      });
    }

    // Create enhanced import session with metadata
    const importSession = await prisma.importSession.create({
      data: {
        fileName: fileName || 'unknown',
        fileSize: fileSize || 0,
        status: 'PROCESSING',
        totalRecords: contacts.length,
        processedRecords: 0,
        errorRecords: 0,
        errors: [],
        statistics: {
          startTime: new Date().toISOString(),
          options,
          estimatedDuration: Math.ceil(contacts.length / 100) + ' seconds'
        }
      }
    });

    console.log(`📦 Starting import session ${importSession.id} with ${contacts.length} contacts`);

    try {
      const errors: string[] = [];
      let processedCount = 0;
      let errorCount = 0;
      const batchSize = Math.min(options.batchSize || 100, 200);

      // Enhanced preprocessing with validation
      const preprocessedContacts = await preprocessContacts(contacts, options);
      
      // Process in optimized batches
      for (let i = 0; i < preprocessedContacts.validContacts.length; i += batchSize) {
        const batchStart = Date.now();
        const batch = preprocessedContacts.validContacts.slice(i, i + batchSize);
        const batchNumber = Math.floor(i / batchSize) + 1;
        const totalBatches = Math.ceil(preprocessedContacts.validContacts.length / batchSize);
        
        console.log(`🔄 Processing batch ${batchNumber}/${totalBatches} (${batch.length} contacts)`);
        
        try {
          const result = await ContactDatabaseService.createManyContacts(batch);
          processedCount += result.count;
          errors.push(...result.errors);
          
          const batchTime = Date.now() - batchStart;
          console.log(`✅ Batch ${batchNumber} completed: ${result.count} created, ${result.errors.length} errors, ${batchTime}ms`);

          // Update progress periodically
          if (batchNumber % 5 === 0 || batchNumber === totalBatches) {
            await prisma.importSession.update({
              where: { id: importSession.id },
              data: {
                processedRecords: processedCount,
                errorRecords: errorCount + preprocessedContacts.invalidContacts.length,
                errors: [...errors, ...preprocessedContacts.validationErrors].slice(0, 200) // Keep latest 200 errors
              }
            });
          }

        } catch (batchError) {
          const errorMessage = batchError instanceof Error ? batchError.message : 'Batch processing failed';
          errors.push(`Batch ${batchNumber}: ${errorMessage}`);
          errorCount += batch.length;
          console.error(`❌ Batch ${batchNumber} failed:`, batchError);
        }
      }

      // Add preprocessing errors
      errors.push(...preprocessedContacts.validationErrors);
      errorCount += preprocessedContacts.invalidContacts.length;

      // Calculate final statistics
      const processingTime = Date.now() - startTime;
      const finalStats = {
        totalRequested: contacts.length,
        validContacts: preprocessedContacts.validContacts.length,
        invalidContacts: preprocessedContacts.invalidContacts.length,
        successfullyCreated: processedCount,
        failed: errorCount,
        successRate: Math.round((processedCount / contacts.length) * 100),
        processingTime: `${processingTime}ms`,
        averageTimePerContact: `${Math.round(processingTime / contacts.length)}ms`,
        contactsPerSecond: Math.round(contacts.length / (processingTime / 1000)),
        mainContacts: preprocessedContacts.validContacts.filter(c => c.isMainContact).length,
        relatedContacts: preprocessedContacts.validContacts.filter(c => !c.isMainContact).length,
        totalPhones: preprocessedContacts.validContacts.reduce((sum, c) => sum + (c.phones?.length || 0), 0),
        totalEmails: preprocessedContacts.validContacts.reduce((sum, c) => sum + (c.emails?.length || 0), 0),
        categoryCounts: preprocessedContacts.validContacts.reduce((acc, c) => {
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
          // status: processedCount === 0 ? 'FAILED' : processedCount === contacts.length ? 'COMPLETED' : 'PARTIAL',
          processedRecords: processedCount,
          errorRecords: errorCount,
          errors: errors.slice(0, 200),
          statistics: finalStats,
          completedAt: new Date()
        }
      });

      console.log(`🎉 Import session ${importSession.id} completed: ${processedCount}/${contacts.length} contacts created`);

      return res.status(200).json({
        success: processedCount > 0,
        importSessionId: importSession.id,
        statistics: finalStats,
        summary: {
          message: processedCount === contacts.length 
            ? 'All contacts imported successfully'
            : processedCount > 0 
              ? `Partially successful: ${processedCount} of ${contacts.length} contacts imported`
              : 'Import failed: No contacts were created',
          created: processedCount,
          failed: errorCount,
          totalProcessed: contacts.length
        },
        errors: errors.slice(0, 20), // Return first 20 errors
        hasMoreErrors: errors.length > 20,
        recommendations: generateRecommendations(finalStats, errors)
      });

    } catch (importError) {
      console.error('Critical import error:', importError);
      
      // Update import session with failure
      await prisma.importSession.update({
        where: { id: importSession.id },
        data: {
          status: 'FAILED',
          errors: [importError instanceof Error ? importError.message : 'Critical import failure'],
          completedAt: new Date()
        }
      });

      return res.status(500).json({
        success: false,
        importSessionId: importSession.id,
        error: 'Critical import failure',
        details: importError instanceof Error ? importError.message : 'Unknown error',
        processingTime: Date.now() - startTime
      });
    }

  } catch (error) {
    console.error('Import API error:', error);
    
    if (error instanceof Error && error.message.includes('Rate limit')) {
      return res.status(429).json({
        error: 'Import rate limit exceeded',
        message: 'Too many import requests. Please wait before trying again.',
        retryAfter: 60
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Import service unavailable',
      details: process.env.NODE_ENV === 'development' ? 
        (error instanceof Error ? error.message : 'Unknown error') : undefined
    });
  }
}

// Enhanced contact preprocessing with validation
async function preprocessContacts(contacts: Contact[], options: any): Promise<{
  validContacts: Omit<Contact, 'id' | 'createdAt' | 'lastUpdated'>[];
  invalidContacts: any[];
  validationErrors: string[];
}> {
  const validContacts: Omit<Contact, 'id' | 'createdAt' | 'lastUpdated'>[] = [];
  const invalidContacts: any[] = [];
  const validationErrors: string[] = [];

  const seenNames = new Set<string>();
  const seenPhones = new Set<string>();
  const seenEmails = new Set<string>();

  contacts.forEach((contact, index) => {
    const errors: string[] = [];
    
    try {
      // Basic validation
      if (!contact.name || typeof contact.name !== 'string' || contact.name.trim().length === 0) {
        errors.push('Missing or invalid name');
      }

      const normalizedName = contact.name?.trim().toLowerCase();
      if (normalizedName && seenNames.has(normalizedName)) {
        errors.push('Duplicate name in import batch');
      } else if (normalizedName) {
        seenNames.add(normalizedName);
      }

      // Phone validation with deduplication
      if (contact.phones && contact.phones.length > 0) {
        const validPhones = contact.phones.filter(phone => {
          if (!phone.number || phone.number.trim().length === 0) {
            errors.push('Empty phone number');
            return false;
          }
          
          const normalizedPhone = phone.number.replace(/\D/g, '');
          if (normalizedPhone.length < 10) {
            errors.push(`Invalid phone number: ${phone.number}`);
            return false;
          }
          
          if (seenPhones.has(normalizedPhone)) {
            errors.push(`Duplicate phone number: ${phone.number}`);
            return false;
          }
          
          seenPhones.add(normalizedPhone);
          return true;
        });

        if (validPhones.length !== contact.phones.length && !options.skipValidation) {
          errors.push(`${contact.phones.length - validPhones.length} invalid phone numbers`);
        }
      }

      // Email validation with deduplication
      if (contact.emails && contact.emails.length > 0) {
        const validEmails = contact.emails.filter(email => {
          if (!email.address || !email.address.includes('@')) {
            errors.push(`Invalid email: ${email.address}`);
            return false;
          }
          
          const normalizedEmail = email.address.trim().toLowerCase();
          if (seenEmails.has(normalizedEmail)) {
            errors.push(`Duplicate email: ${email.address}`);
            return false;
          }
          
          seenEmails.add(normalizedEmail);
          return true;
        });

        if (validEmails.length !== contact.emails.length && !options.skipValidation) {
          errors.push(`${contact.emails.length - validEmails.length} invalid email addresses`);
        }
      }

      if (errors.length === 0 || (options.skipValidation && contact.name)) {
        // Clean and prepare contact for insertion
        const { id, createdAt, lastUpdated, ...cleanContact } = contact as any;
        
        validContacts.push({
          ...cleanContact,
          name: contact.name.trim(),
          phones: (contact.phones || []).map(phone => ({
            ...phone,
            number: phone.number.trim(),
            isValid: validatePhoneNumber(phone.number)
          })),
          emails: (contact.emails || []).map(email => ({
            ...email,
            address: email.address.trim().toLowerCase(),
            isValid: validateEmail(email.address)
          })),
          alternateNames: contact.alternateNames || [],
          tags: contact.tags || [],
          relationships: contact.relationships || []
        });
      } else {
        invalidContacts.push({ index, contact, errors });
        validationErrors.push(`Contact ${index + 1} (${contact.name || 'unnamed'}): ${errors.join(', ')}`);
      }

    } catch (processError) {
      const errorMsg = processError instanceof Error ? processError.message : 'Processing error';
      invalidContacts.push({ index, contact, errors: [errorMsg] });
      validationErrors.push(`Contact ${index + 1}: ${errorMsg}`);
    }
  });

  return { validContacts, invalidContacts, validationErrors };
}

// Utility functions
function validatePhoneNumber(phone: string): boolean {
  const phoneRegex = /^[\+]?[1-9][\d\s\-\(\)]{7,15}$/;
  return phoneRegex.test(phone.replace(/\s/g, ''));
}

function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

function generateRecommendations(stats: any, errors: string[]): string[] {
  const recommendations: string[] = [];
  
  if (stats.successRate < 100) {
    recommendations.push('Review error messages to improve data quality');
  }
  
  if (stats.successRate < 50) {
    recommendations.push('Consider using data validation tools before import');
  }
  
  const commonErrors = errors.reduce((acc, error) => {
    const key = error.split(':')[0];
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const mostCommonError = Object.entries(commonErrors)
    .sort(([,a], [,b]) => b - a)[0];
  
  if (mostCommonError && mostCommonError[1] > 1) {
    recommendations.push(`Focus on fixing "${mostCommonError[0]}" issues (${mostCommonError[1]} occurrences)`);
  }
  
  if (stats.averageTimePerContact > 100) {
    recommendations.push('Consider smaller batch sizes for better performance');
  }
  
  if (stats.totalPhones === 0) {
    recommendations.push('Contacts without phone numbers have limited usefulness');
  }
  
  return recommendations;
}