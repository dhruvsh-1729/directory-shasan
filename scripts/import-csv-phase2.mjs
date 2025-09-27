// scripts/import-csv.js
import { PrismaClient } from '@prisma/client';
import XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';

const prisma = new PrismaClient();

// Configuration
const __dirname = path.dirname(new URL(import.meta.url).pathname);
const INPUT_FILE = path.join(__dirname, 'directory.csv'); // Place your Excel file here
const BATCH_SIZE = 100;

// Excel column mapping
const COLUMN_MAP = {
  srNo: 0, name: 1, status: 2, address: 3, suburb: 4, city: 5, pincode: 6,
  state: 7, country: 8, mobile1: 9, mobile2: 10, mobile3: 11, mobile4: 12,
  office: 13, residence: 14, emails: 15, category: 16, officeAddress: 17, address2: 18
};

// Helper functions (same as before)
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

function extractPhones(phoneFields) {
  const phones = [];
  const phonesWithLabels = [];
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
          if (phone) {
            if (phone.label) {
              phonesWithLabels.push(phone);
            } else {
              phones.push(phone);
            }
          }
        }
      });
    } else {
      const phone = parsePhoneWithRelationship(fieldStr, index, phoneId++, index === 0);
      if (phone) {
        if (phone.label) {
          phonesWithLabels.push(phone);
        } else {
          phones.push(phone);
        }
      }
    }
  });

  return { mainContactPhones: phones, relationshipPhones: phonesWithLabels };
}

function parsePhoneWithRelationship(input, fieldIndex, phoneId, isPrimary) {
  const relationshipMatch = input.match(/^(.+?)\s*\(([^)]+)\)(.*)$/) || 
                           input.match(/^([^:]+):\s*(.+)$/) ||
                           input.match(/^(.+?)\s*-\s*(.+)$/);
  
  let numberPart = input;
  let relationshipInfo = '';
  
  if (relationshipMatch) {
    const part1 = relationshipMatch[1].trim();
    const part2 = relationshipMatch[2].trim();
    
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

function cleanRelationshipName(rawName) {
  if (!rawName) return null;
  
  let cleaned = rawName.trim();
  
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
  
  cleaned = cleaned
    .replace(/\b(of|the|a|an)\b/gi, '')
    .replace(/[()]/g, '')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  cleaned = cleaned.split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
  
  return cleaned.length >= 2 && !/^\d+$/.test(cleaned) ? cleaned : null;
}

function determineRelationshipType(label) {
  const lower = label.toLowerCase();
  
  if (lower.includes('wife') || lower.includes('husband') || lower.includes('spouse')) return 'spouse';
  if (lower.includes('son') || lower.includes('daughter') || lower.includes('child')) return 'child';
  if (lower.includes('father') || lower.includes('mother') || lower.includes('parent')) return 'parent';
  if (lower.includes('brother') || lower.includes('sister')) return 'sibling';
  if (lower.includes('uncle') || lower.includes('aunt')) return 'extended_family';
  if (lower.includes('cousin') || lower.includes('nephew') || lower.includes('niece')) return 'extended_family';
  if (lower.includes('grandfather') || lower.includes('grandmother')) return 'grandparent';
  if (lower.includes('grandson') || lower.includes('granddaughter')) return 'grandchild';
  if (lower.includes('in-law')) return 'in_law';
  if (lower.includes('office') || lower.includes('work') || lower.includes('colleague')) return 'colleague';
  if (lower.includes('assistant') || lower.includes('secretary')) return 'assistant';
  if (lower.includes('boss') || lower.includes('manager') || lower.includes('supervisor')) return 'supervisor';
  if (lower.includes('employee') || lower.includes('subordinate')) return 'subordinate';
  if (lower.includes('partner')) return 'business_partner';
  if (lower.includes('client') || lower.includes('customer')) return 'client';
  if (lower.includes('friend')) return 'friend';
  if (lower.includes('neighbor')) return 'neighbor';
  
  return 'related';
}

// Main import function - TWO PHASE APPROACH
async function importContacts() {
  console.log('🚀 Starting two-phase contact import...');
  
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
    
    await prisma.importSession.update({
      where: { id: importSession.id },
      data: { totalRecords: dataRows.length }
    });

    const mainContactsToSave = [];
    const relationshipPhonesMap = new Map(); // Map to store relationship phones by main contact
    const errors = [];
    let processedCount = 0;

    // PHASE 1: Process and create main contacts
    console.log('🔄 Phase 1: Processing main contacts...');
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      
      if (!row[COLUMN_MAP.name] || String(row[COLUMN_MAP.name]).trim() === '') {
        errors.push(`Row ${i + 2}: Missing name`);
        continue;
      }
      
      try {
        // Extract phone fields
        const phoneFields = [];
        [COLUMN_MAP.mobile1, COLUMN_MAP.mobile2, COLUMN_MAP.mobile3, COLUMN_MAP.mobile4].forEach(colIndex => {
          const phoneValue = row[colIndex];
          if (phoneValue && String(phoneValue).trim() !== '' && String(phoneValue).trim() !== '-') {
            phoneFields.push(phoneValue);
          }
        });
        
        if (row[COLUMN_MAP.office] && String(row[COLUMN_MAP.office]).trim() !== '' && String(row[COLUMN_MAP.office]).trim() !== '-') {
          phoneFields.push(row[COLUMN_MAP.office]);
        }
        
        if (row[COLUMN_MAP.residence] && String(row[COLUMN_MAP.residence]).trim() !== '' && String(row[COLUMN_MAP.residence]).trim() !== '-') {
          phoneFields.push(row[COLUMN_MAP.residence]);
        }

        // Extract phones and emails
        const { mainContactPhones, relationshipPhones } = extractPhones(phoneFields);
        const emails = extractEmails(row[COLUMN_MAP.emails]);
        
        // Create main contact data (let MongoDB generate the ID)
        const mainContactData = {
          name: String(row[COLUMN_MAP.name]).trim(),
          status: row[COLUMN_MAP.status] ? String(row[COLUMN_MAP.status]).trim() : null,
          address: row[COLUMN_MAP.address] ? String(row[COLUMN_MAP.address]).trim() : null,
          suburb: row[COLUMN_MAP.suburb] ? String(row[COLUMN_MAP.suburb]).trim() : null,
          city: row[COLUMN_MAP.city] ? String(row[COLUMN_MAP.city]).trim() : null,
          pincode: row[COLUMN_MAP.pincode] ? String(row[COLUMN_MAP.pincode]).trim() : null,
          state: row[COLUMN_MAP.state] ? String(row[COLUMN_MAP.state]).trim() : null,
          country: row[COLUMN_MAP.country] ? String(row[COLUMN_MAP.country]).trim() : null,
          category: row[COLUMN_MAP.category] ? String(row[COLUMN_MAP.category]).trim() : null,
          officeAddress: row[COLUMN_MAP.officeAddress] ? String(row[COLUMN_MAP.officeAddress]).trim() : null,
          address2: row[COLUMN_MAP.address2] ? String(row[COLUMN_MAP.address2]).trim() : null,
          isMainContact: true,
          parentContactId: null,
          alternateNames: [],
          tags: [],
          notes: null,
          duplicateGroup: null,
          phones: mainContactPhones,
          emails: emails,
          relationships: [] // Will be populated later
        };
        
        mainContactsToSave.push(mainContactData);
        
        // Store relationship phones for phase 2
        if (relationshipPhones.length > 0) {
          relationshipPhonesMap.set(i, {
            mainContactData,
            relationshipPhones
          });
        }
        
        processedCount++;
        
        if (processedCount % 100 === 0) {
          console.log(`✅ Processed ${processedCount}/${dataRows.length} main contacts`);
        }
      } catch (error) {
        errors.push(`Row ${i + 2}: ${error.message}`);
        console.error(`❌ Error processing row ${i + 2}:`, error.message);
      }
    }

    // Save main contacts in batches
    console.log(`💾 Saving ${mainContactsToSave.length} main contacts...`);
    const savedMainContacts = [];
    
    for (let i = 0; i < mainContactsToSave.length; i += BATCH_SIZE) {
      const batch = mainContactsToSave.slice(i, i + BATCH_SIZE);
      
      try {
        for (const contactData of batch) {
          const savedContact = await prisma.contact.create({ data: contactData });
          savedMainContacts.push(savedContact);
        }
        console.log(`💾 Saved main contacts batch ${Math.floor(i / BATCH_SIZE) + 1}`);
      } catch (batchError) {
        console.error(`❌ Error saving main contacts batch ${Math.floor(i / BATCH_SIZE) + 1}:`, batchError.message);
        errors.push(`Main contacts batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batchError.message}`);
      }
    }

    // PHASE 2: Create related contacts
    console.log('🔄 Phase 2: Creating related contacts...');
    const relatedContacts = [];
    
    for (const [index, { mainContactData, relationshipPhones }] of relationshipPhonesMap) {
      // Find the saved main contact
      const savedMainContact = savedMainContacts.find(c => c.name === mainContactData.name);
      if (!savedMainContact) {
        errors.push(`Could not find saved main contact for ${mainContactData.name}`);
        continue;
      }
      
      for (const phone of relationshipPhones) {
        if (phone.label && phone.label.trim()) {
          const cleanedName = cleanRelationshipName(phone.label);
          
          if (cleanedName) {
            const relatedContactData = {
              name: cleanedName,
              alternateNames: [phone.label],
              phones: [{ 
                ...phone, 
                isPrimary: true, 
                label: null
              }],
              emails: [],
              isMainContact: false,
              parentContactId: savedMainContact.id, // Now we have the real MongoDB ObjectId
              relationships: [{
                id: `rel_${savedMainContact.id}_${phone.id}`,
                contactId: savedMainContact.id,
                relatedContactId: `temp_${phone.id}`, // Will be updated after creation
                relationshipType: determineRelationshipType(phone.label),
                description: phone.label
              }],
              city: savedMainContact.city,
              state: savedMainContact.state,
              country: savedMainContact.country,
              status: null,
              address: null,
              suburb: null,
              pincode: null,
              category: null,
              officeAddress: null,
              address2: null,
              duplicateGroup: null,
              tags: [],
              notes: null
            };
            
            relatedContacts.push({
              data: relatedContactData,
              mainContactId: savedMainContact.id
            });
          }
        }
      }
    }

    // Save related contacts
    let savedRelatedCount = 0;
    const relationshipUpdates = [];
    
    for (const { data: relatedContactData, mainContactId } of relatedContacts) {
      try {
        const savedRelatedContact = await prisma.contact.create({ data: relatedContactData });
        savedRelatedCount++;
        
        // Update the relationship with the correct relatedContactId
        relationshipUpdates.push({
          mainContactId,
          relationship: {
            ...relatedContactData.relationships[0],
            relatedContactId: savedRelatedContact.id
          }
        });
        
      } catch (error) {
        console.error(`❌ Error saving related contact ${relatedContactData.name}:`, error.message);
        errors.push(`Related contact ${relatedContactData.name}: ${error.message}`);
      }
    }

    // Update main contacts with correct relationships
    console.log('🔗 Updating main contact relationships...');
    const relationshipsByMainContact = new Map();
    
    for (const { mainContactId, relationship } of relationshipUpdates) {
      if (!relationshipsByMainContact.has(mainContactId)) {
        relationshipsByMainContact.set(mainContactId, []);
      }
      relationshipsByMainContact.get(mainContactId).push(relationship);
    }
    
    for (const [mainContactId, relationships] of relationshipsByMainContact) {
      try {
        await prisma.contact.update({
          where: { id: mainContactId },
          data: { relationships }
        });
      } catch (error) {
        console.error(`❌ Error updating relationships for ${mainContactId}:`, error.message);
      }
    }

    // Calculate final statistics
    const totalSaved = savedMainContacts.length + savedRelatedCount;
    const statistics = {
      totalContacts: totalSaved,
      mainContacts: savedMainContacts.length,
      relatedContacts: savedRelatedCount,
      totalPhones: savedMainContacts.reduce((sum, c) => sum + c.phones.length, 0),
      totalEmails: savedMainContacts.reduce((sum, c) => sum + c.emails.length, 0),
      duplicateGroups: 0, // Will implement later
      errorCount: errors.length
    };

    // Update import session
    await prisma.importSession.update({
      where: { id: importSession.id },
      data: {
        status: errors.length > 0 && totalSaved === 0 ? 'FAILED' : 'COMPLETED',
        processedRecords: processedCount,
        errorRecords: errors.length,
        errors: errors.slice(0, 100),
        statistics,
        completedAt: new Date()
      }
    });

    // Print final results
    console.log('\n🎉 Two-phase import completed!');
    console.log('📊 Statistics:');
    console.log(`  • Total processed: ${processedCount} records`);
    console.log(`  • Main contacts saved: ${savedMainContacts.length}`);
    console.log(`  • Related contacts saved: ${savedRelatedCount}`);
    console.log(`  • Total contacts saved: ${totalSaved}`);
    console.log(`  • Total phones: ${statistics.totalPhones}`);
    console.log(`  • Total emails: ${statistics.totalEmails}`);
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
