// scripts/import-csv.js
import { PrismaClient } from '@prisma/client';
import XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';

const prisma = new PrismaClient();

// Configuration
const INPUT_FILE = path.join(__dirname, 'contacts.xlsx'); // Place your Excel file here
const BATCH_SIZE = 50; // Reduced batch size for better error handling

// Excel column mapping
const COLUMN_MAP = {
  srNo: 0,
  name: 1,
  status: 2,
  address: 3,
  suburb: 4,
  city: 5,
  pincode: 6,
  state: 7,
  country: 8,
  mobile1: 9,
  mobile2: 10,
  mobile3: 11,
  mobile4: 12,
  office: 13,
  residence: 14,
  emails: 15,
  category: 16,
  officeAddress: 17,
  address2: 18
};

// Generate valid MongoDB ObjectId
function generateObjectId() {
  const timestamp = Math.floor(Date.now() / 1000).toString(16);
  const randomBytes = Array.from({ length: 16 }, () => 
    Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
  ).join('').substring(0, 16);
  
  return (timestamp + randomBytes).substring(0, 24);
}

// Phone type determination
function determinePhoneType(fieldIndex, relationshipInfo = '') {
  const lower = relationshipInfo.toLowerCase();
  
  if (lower.includes('office') || lower.includes('work') || lower.includes('business')) return 'office';
  if (lower.includes('home') || lower.includes('house') || lower.includes('residence')) return 'residence';
  if (lower.includes('fax')) return 'fax';
  if (lower.includes('mobile') || lower.includes('cell')) return 'mobile';
  
  // Default based on field position
  if (fieldIndex < 4) return 'mobile';
  if (fieldIndex === 4) return 'office';
  if (fieldIndex === 5) return 'residence';
  return 'other';
}

// Phone number analysis
function analyzePhoneNumber(phone) {
  if (!phone) return null;
  
  let cleaned = String(phone).replace(/[^\d+\-\s()]/g, '').trim();
  const digitsOnly = cleaned.replace(/\D/g, '');
  
  if (digitsOnly.length < 6) return null;

  // For numbers starting with 2 or 0, preserve as is
  if (digitsOnly.startsWith('2') || digitsOnly.startsWith('0')) {
    return {
      formatted: cleaned,
      country: 'Unknown',
      region: 'XX',
      isValid: digitsOnly.length >= 8
    };
  }

  // Indian phone pattern
  const indianPattern = /^(?:\+91|91|0)?([6-9]\d{9})$/;
  if (indianPattern.test(digitsOnly)) {
    const match = digitsOnly.match(indianPattern);
    return {
      formatted: `+91 ${match[1].substring(0, 5)} ${match[1].substring(5)}`,
      country: 'India',
      region: 'IN',
      isValid: true
    };
  }

  // US phone pattern
  const usPattern = /^(?:\+1|1)?([2-9]\d{2}[2-9]\d{2}\d{4})$/;
  if (usPattern.test(digitsOnly)) {
    const match = digitsOnly.match(usPattern);
    const number = match[1];
    return {
      formatted: `+1 (${number.substring(0, 3)}) ${number.substring(3, 6)}-${number.substring(6)}`,
      country: 'United States',
      region: 'US',
      isValid: true
    };
  }

  // For other numbers, keep as-is if they have reasonable length
  if (digitsOnly.length >= 8) {
    return {
      formatted: cleaned,
      country: 'Unknown',
      region: 'XX',
      isValid: digitsOnly.length >= 10
    };
  }

  return null;
}

// Extract phones from fields
function extractPhones(phoneFields) {
  const phones = [];
  let phoneId = 0;

  phoneFields.forEach((field, index) => {
    if (!field || String(field).trim() === '' || String(field).trim() === '-') return;

    const fieldStr = String(field).trim();
    
    // Handle multiple numbers in one field
    const separators = /[,;\n]/;
    if (separators.test(fieldStr)) {
      const numbers = fieldStr.split(separators).map(n => n.trim());
      numbers.forEach((num, numIndex) => {
        if (num && num !== '-') {
          const phone = parsePhoneWithRelationship(num, index, phoneId++, index === 0 && numIndex === 0);
          if (phone) phones.push(phone);
        }
      });
    } else {
      const phone = parsePhoneWithRelationship(fieldStr, index, phoneId++, index === 0);
      if (phone) phones.push(phone);
    }
  });

  return phones;
}

// Parse phone with relationship
function parsePhoneWithRelationship(input, fieldIndex, phoneId, isPrimary) {
  const relationshipMatch = input.match(/^(.+?)\s*\(([^)]+)\)(.*)$/) || 
                           input.match(/^([^:]+):\s*(.+)$/) ||
                           input.match(/^(.+?)\s*-\s*(.+)$/);
  
  let numberPart = input;
  let relationshipInfo = '';
  
  if (relationshipMatch) {
    const part1 = relationshipMatch[1].trim();
    const part2 = relationshipMatch[2].trim();
    
    // Simple check for which part is the phone number
    const digitsOnly1 = part1.replace(/\D/g, '');
    const digitsOnly2 = part2.replace(/\D/g, '');
    
    if (digitsOnly1.length >= 10) {
      numberPart = part1;
      relationshipInfo = part2;
    } else if (digitsOnly2.length >= 10) {
      numberPart = part2;
      relationshipInfo = part1;
    }
  }

  const phoneInfo = analyzePhoneNumber(numberPart);
  if (!phoneInfo) return null;

  return {
    id: `phone_${phoneId}`,
    number: phoneInfo.formatted,
    type: determinePhoneType(fieldIndex, relationshipInfo),
    isPrimary,
    label: relationshipInfo || null,
    country: phoneInfo.country,
    region: phoneInfo.region,
    isValid: phoneInfo.isValid
  };
}

// Extract emails
function extractEmails(emailField) {
  if (!emailField || String(emailField).trim() === '' || String(emailField).trim() === '-') return [];
  
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const emails = String(emailField).match(emailRegex) || [];
  
  return emails
    .map(email => email.trim().toLowerCase())
    .filter((email, index, arr) => arr.indexOf(email) === index)
    .map((email, index) => ({
      id: `email_${index}`,
      address: email,
      isPrimary: index === 0,
      isValid: /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email)
    }));
}

// Clean relationship name
function cleanRelationshipName(rawName) {
  if (!rawName) return null;
  
  let cleaned = rawName.trim();
  
  // Remove common relationship indicators
  const indicators = [
    'son', 'daughter', 'child', 'wife', 'husband', 'spouse', 'father', 'mother', 
    'parent', 'brother', 'sister', 'uncle', 'aunt', 'cousin', 'nephew', 'niece',
    'grandfather', 'grandmother', 'grandson', 'granddaughter', 'brother-in-law',
    'sister-in-law', 'mother-in-law', 'father-in-law', 'friend', 'colleague',
    'assistant', 'secretary', 'partner', 'boss', 'manager', 'employee', 'office',
    'work', 'home', 'personal', 'mobile', 'cell', 'landline', 'fax'
  ];
  
  for (const indicator of indicators) {
    const regex = new RegExp(`\\b${indicator}\\b`, 'gi');
    cleaned = cleaned.replace(regex, '').trim();
  }
  
  // Clean up formatting
  cleaned = cleaned
    .replace(/\b(of|the|a|an)\b/gi, '')
    .replace(/[()]/g, '')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Capitalize
  cleaned = cleaned.split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
  
  return cleaned.length >= 2 && !/^\d+$/.test(cleaned) ? cleaned : null;
}

// Determine relationship type
function determineRelationshipType(label) {
  const lower = label.toLowerCase();
  
  // Family relationships
  if (lower.includes('wife') || lower.includes('husband') || lower.includes('spouse')) return 'spouse';
  if (lower.includes('son') || lower.includes('daughter') || lower.includes('child')) return 'child';
  if (lower.includes('father') || lower.includes('mother') || lower.includes('parent')) return 'parent';
  if (lower.includes('brother') || lower.includes('sister')) return 'sibling';
  if (lower.includes('uncle') || lower.includes('aunt')) return 'extended_family';
  if (lower.includes('cousin') || lower.includes('nephew') || lower.includes('niece')) return 'extended_family';
  if (lower.includes('grandfather') || lower.includes('grandmother')) return 'grandparent';
  if (lower.includes('grandson') || lower.includes('granddaughter')) return 'grandchild';
  if (lower.includes('in-law')) return 'in_law';
  
  // Professional relationships
  if (lower.includes('office') || lower.includes('work') || lower.includes('colleague')) return 'colleague';
  if (lower.includes('assistant') || lower.includes('secretary')) return 'assistant';
  if (lower.includes('boss') || lower.includes('manager') || lower.includes('supervisor')) return 'supervisor';
  if (lower.includes('employee') || lower.includes('subordinate')) return 'subordinate';
  if (lower.includes('partner')) return 'business_partner';
  if (lower.includes('client') || lower.includes('customer')) return 'client';
  
  // Social relationships
  if (lower.includes('friend')) return 'friend';
  if (lower.includes('neighbor')) return 'neighbor';
  
  return 'related';
}

// Match emails to contacts in record
function matchEmailsToContactsInRecord(emails, contacts) {
  if (emails.length === 0 || contacts.length === 0) return;

  const matchedEmails = new Set();
  
  // First pass: name matching
  emails.forEach(email => {
    const emailName = email.address.split('@')[0].toLowerCase();
    
    const matchedContact = contacts.find(contact => {
      const nameParts = contact.name.toLowerCase().split(/\s+/);
      const firstName = nameParts[0];
      const lastName = nameParts[nameParts.length - 1];
      const fullName = contact.name.toLowerCase().replace(/\s+/g, '');
      
      return emailName.includes(firstName) || 
             emailName.includes(lastName) || 
             emailName.includes(fullName) ||
             firstName.includes(emailName) ||
             lastName.includes(emailName);
    });
    
    if (matchedContact && !matchedContact.emails.find(e => e.address === email.address)) {
      matchedContact.emails.push({
        ...email,
        id: `email_${matchedContact.emails.length}`,
        isPrimary: matchedContact.emails.length === 0
      });
      matchedEmails.add(email.address);
    }
  });

  // Second pass: round-robin distribution
  const unmatched = emails.filter(email => !matchedEmails.has(email.address));
  
  if (unmatched.length > 0) {
    unmatched.forEach((email, index) => {
      const contactIndex = index % contacts.length;
      const targetContact = contacts[contactIndex];
      
      if (!targetContact.emails.find(e => e.address === email.address)) {
        targetContact.emails.push({
          ...email,
          id: `email_${targetContact.emails.length}`,
          isPrimary: targetContact.emails.length === 0
        });
      }
    });
  }
}

// Process single record - FIXED VERSION
async function processRecord(rowData, index) {
  // Generate proper MongoDB ObjectIds
  const mainContactId = generateObjectId();
  
  // Extract phone fields
  const phoneFields = [];
  [COLUMN_MAP.mobile1, COLUMN_MAP.mobile2, COLUMN_MAP.mobile3, COLUMN_MAP.mobile4].forEach(colIndex => {
    const phoneValue = rowData[colIndex];
    if (phoneValue && String(phoneValue).trim() !== '' && String(phoneValue).trim() !== '-') {
      phoneFields.push(phoneValue);
    }
  });
  
  if (rowData[COLUMN_MAP.office] && String(rowData[COLUMN_MAP.office]).trim() !== '' && String(rowData[COLUMN_MAP.office]).trim() !== '-') {
    phoneFields.push(rowData[COLUMN_MAP.office]);
  }
  
  if (rowData[COLUMN_MAP.residence] && String(rowData[COLUMN_MAP.residence]).trim() !== '' && String(rowData[COLUMN_MAP.residence]).trim() !== '-') {
    phoneFields.push(rowData[COLUMN_MAP.residence]);
  }

  // Extract phones and emails
  const phones = extractPhones(phoneFields);
  const emails = extractEmails(rowData[COLUMN_MAP.emails]);
  
  // Create main contact with proper ObjectId
  const mainContact = {
    id: mainContactId,
    name: String(rowData[COLUMN_MAP.name]).trim(),
    status: rowData[COLUMN_MAP.status] ? String(rowData[COLUMN_MAP.status]).trim() : null,
    address: rowData[COLUMN_MAP.address] ? String(rowData[COLUMN_MAP.address]).trim() : null,
    suburb: rowData[COLUMN_MAP.suburb] ? String(rowData[COLUMN_MAP.suburb]).trim() : null,
    city: rowData[COLUMN_MAP.city] ? String(rowData[COLUMN_MAP.city]).trim() : null,
    pincode: rowData[COLUMN_MAP.pincode] ? String(rowData[COLUMN_MAP.pincode]).trim() : null,
    state: rowData[COLUMN_MAP.state] ? String(rowData[COLUMN_MAP.state]).trim() : null,
    country: rowData[COLUMN_MAP.country] ? String(rowData[COLUMN_MAP.country]).trim() : null,
    category: rowData[COLUMN_MAP.category] ? String(rowData[COLUMN_MAP.category]).trim() : null,
    officeAddress: rowData[COLUMN_MAP.officeAddress] ? String(rowData[COLUMN_MAP.officeAddress]).trim() : null,
    address2: rowData[COLUMN_MAP.address2] ? String(rowData[COLUMN_MAP.address2]).trim() : null,
    phones: phones.filter(p => !p.label),
    emails: [],
    isMainContact: true,
    parentContactId: null, // Main contacts have no parent
    alternateNames: [],
    tags: [],
    relationships: [],
    duplicateGroup: null,
    lastUpdated: new Date()
  };
  
  // Extract related contacts with proper ObjectIds
  const relatedContacts = [];
  
  phones.forEach(phone => {
    if (phone.label && phone.label.trim()) {
      const cleanedName = cleanRelationshipName(phone.label);
      
      if (cleanedName) {
        const relatedContactId = generateObjectId();
        const relationshipId = generateObjectId();
        
        const relatedContact = {
          id: relatedContactId,
          name: cleanedName,
          alternateNames: [phone.label],
          phones: [{ 
            ...phone, 
            isPrimary: true, 
            label: null
          }],
          emails: [],
          isMainContact: false,
          parentContactId: mainContactId, // Use the main contact's ObjectId
          relationships: [{
            id: relationshipId,
            contactId: mainContactId,
            relatedContactId: relatedContactId,
            relationshipType: determineRelationshipType(phone.label),
            description: phone.label
          }],
          city: mainContact.city,
          state: mainContact.state,
          country: mainContact.country,
          status: null,
          address: null,
          suburb: null,
          pincode: null,
          category: null,
          officeAddress: null,
          address2: null,
          duplicateGroup: null,
          tags: [],
          notes: null,
          lastUpdated: new Date()
        };
        
        relatedContacts.push(relatedContact);
      }
    }
  });
  
  // Combine all contacts from this record
  const allContactsFromRecord = [mainContact, ...relatedContacts];
  
  // Match emails within this record only
  matchEmailsToContactsInRecord(emails, allContactsFromRecord);
  
  // Set up relationships for main contact
  mainContact.relationships = relatedContacts.flatMap(rc => rc.relationships || []);
  
  return allContactsFromRecord;
}

// Main import function - FIXED VERSION
async function importContacts() {
  console.log('🚀 Starting contact import...');
  
  // Check if file exists
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`❌ File not found: ${INPUT_FILE}`);
    console.log('📄 Please place your Excel file at:', INPUT_FILE);
    process.exit(1);
  }

  // Create import session
  const importSession = await prisma.importSession.create({
    data: {
      fileName: path.basename(INPUT_FILE),
      fileSize: fs.statSync(INPUT_FILE).size,
      status: 'PROCESSING',
      totalRecords: 0,
      processedRecords: 0,
      errorRecords: 0,
      errors: []
    }
  });

  console.log(`📊 Import session created: ${importSession.id}`);

  try {
    // Read Excel file
    console.log('📖 Reading Excel file...');
    const workbook = XLSX.readFile(INPUT_FILE);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    
    if (jsonData.length === 0) {
      throw new Error('Excel file is empty');
    }
    
    const dataRows = jsonData.slice(1).filter(row => row && row.length > 0 && row[1]);
    console.log(`📝 Found ${dataRows.length} data rows`);
    
    // Update total records
    await prisma.importSession.update({
      where: { id: importSession.id },
      data: { totalRecords: dataRows.length }
    });

    const allProcessedContacts = [];
    const errors = [];
    let processedCount = 0;

    // Process each record
    console.log('🔄 Processing records...');
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      
      if (!row[COLUMN_MAP.name] || String(row[COLUMN_MAP.name]).trim() === '') {
        errors.push(`Row ${i + 2}: Missing name`);
        continue;
      }
      
      try {
        const recordContacts = await processRecord(row, i);
        allProcessedContacts.push(...recordContacts);
        processedCount++;
        
        // Update progress every 100 records
        if (processedCount % 100 === 0) {
          await prisma.importSession.update({
            where: { id: importSession.id },
            data: { 
              processedRecords: processedCount,
              errorRecords: errors.length
            }
          });
          console.log(`✅ Processed ${processedCount}/${dataRows.length} records`);
        }
      } catch (error) {
        errors.push(`Row ${i + 2}: ${error.message}`);
        console.error(`❌ Error processing row ${i + 2}:`, error.message);
      }
    }

    console.log(`🔍 Detecting duplicates in ${allProcessedContacts.length} contacts...`);
    
    // Simple duplicate detection
    const duplicateGroups = new Map();
    allProcessedContacts.forEach(contact => {
      const nameKey = contact.name.toLowerCase().replace(/\s+/g, '');
      if (!duplicateGroups.has(nameKey)) {
        duplicateGroups.set(nameKey, []);
      }
      duplicateGroups.get(nameKey).push(contact);
      contact.duplicateGroup = nameKey;
    });

    console.log(`💾 Saving ${allProcessedContacts.length} contacts to database...`);

    // Save in smaller batches to avoid timeout
    let savedCount = 0;
    for (let i = 0; i < allProcessedContacts.length; i += BATCH_SIZE) {
      const batch = allProcessedContacts.slice(i, i + BATCH_SIZE);
      
      try {
        // Save each contact individually for better error handling
        for (const contact of batch) {
          try {
            await prisma.contact.create({
              data: {
                id: contact.id,
                name: contact.name,
                status: contact.status,
                address: contact.address,
                suburb: contact.suburb,
                city: contact.city,
                pincode: contact.pincode,
                state: contact.state,
                country: contact.country,
                category: contact.category,
                officeAddress: contact.officeAddress,
                address2: contact.address2,
                isMainContact: contact.isMainContact,
                parentContactId: contact.parentContactId,
                duplicateGroup: contact.duplicateGroup,
                alternateNames: contact.alternateNames || [],
                tags: contact.tags || [],
                notes: contact.notes,
                phones: contact.phones.map(phone => ({
                  id: phone.id,
                  number: phone.number,
                  type: phone.type,
                  isPrimary: phone.isPrimary,
                  label: phone.label,
                  country: phone.country,
                  region: phone.region,
                  isValid: phone.isValid
                })),
                emails: contact.emails.map(email => ({
                  id: email.id,
                  address: email.address,
                  isPrimary: email.isPrimary,
                  isValid: email.isValid
                })),
                relationships: contact.relationships?.map(rel => ({
                  id: rel.id,
                  contactId: rel.contactId,
                  relatedContactId: rel.relatedContactId,
                  relationshipType: rel.relationshipType,
                  description: rel.description
                })) || []
              }
            });
            savedCount++;
          } catch (contactError) {
            errors.push(`Contact ${contact.name}: ${contactError.message}`);
            console.error(`❌ Error saving contact ${contact.name}:`, contactError.message);
          }
        }
        
        console.log(`💾 Processed batch ${Math.floor(i / BATCH_SIZE) + 1}: ${Math.min(savedCount, i + BATCH_SIZE)} contacts saved`);
      } catch (batchError) {
        console.error(`❌ Error processing batch ${Math.floor(i / BATCH_SIZE) + 1}:`, batchError.message);
        errors.push(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batchError.message}`);
      }
    }

    // Calculate final statistics
    const statistics = {
      totalContacts: savedCount,
      mainContacts: allProcessedContacts.filter(c => c.isMainContact).length,
      relatedContacts: allProcessedContacts.filter(c => !c.isMainContact).length,
      totalPhones: allProcessedContacts.reduce((sum, c) => sum + c.phones.length, 0),
      totalEmails: allProcessedContacts.reduce((sum, c) => sum + c.emails.length, 0),
      duplicateGroups: duplicateGroups.size,
      errorCount: errors.length
    };

    // Update import session
    await prisma.importSession.update({
      where: { id: importSession.id },
      data: {
        status: errors.length > 0 && savedCount === 0 ? 'FAILED' : 'COMPLETED',
        processedRecords: processedCount,
        errorRecords: errors.length,
        errors: errors.slice(0, 100), // Keep only first 100 errors
        statistics,
        completedAt: new Date()
      }
    });

    // Print final results
    console.log('\n🎉 Import completed!');
    console.log('📊 Statistics:');
    console.log(`  • Total processed: ${processedCount} records`);
    console.log(`  • Contacts saved: ${savedCount}`);
    console.log(`  • Main contacts: ${statistics.mainContacts}`);
    console.log(`  • Related contacts: ${statistics.relatedContacts}`);
    console.log(`  • Phone numbers: ${statistics.totalPhones}`);
    console.log(`  • Email addresses: ${statistics.totalEmails}`);
    console.log(`  • Errors: ${errors.length}`);
    
    if (errors.length > 0) {
      console.log('\n❌ First 5 errors:');
      errors.slice(0, 5).forEach(error => console.log(`  • ${error}`));
    }

  } catch (error) {
    console.error('💥 Import failed:', error);
    
    await prisma.importSession.update({
      where: { id: importSession.id },
      data: {
        status: 'FAILED',
        errors: [error.message],
        completedAt: new Date()
      }
    });
  } finally {
    await prisma.$disconnect();
  }
}

// Run the import
if (import.meta.url === `file://${process.argv[1]}`) {
  importContacts().catch(console.error);
}
