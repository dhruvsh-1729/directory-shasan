// scripts/updatePhoneTypes.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface UpdateStats {
  totalContacts: number;
  contactsWithPhones: number;
  phonesChecked: number;
  phonesUpdated: number;
  errors: number;
}

async function updatePhoneTypes() {
  const stats: UpdateStats = {
    totalContacts: 0,
    contactsWithPhones: 0,
    phonesChecked: 0,
    phonesUpdated: 0,
    errors: 0,
  };

  try {
    console.log('Starting phone type update process...\n');

    // Fetch all contacts with phones
    const contacts = await prisma.contact.findMany({
      select: {
        id: true,
        name: true,
        phones: true,
      },
    });

    stats.totalContacts = contacts.length;
    console.log(`Found ${stats.totalContacts} total contacts\n`);

    // Process each contact
    for (const contact of contacts) {
      if (!contact.phones || contact.phones.length === 0) {
        continue;
      }

      stats.contactsWithPhones++;
      let contactUpdated = false;
      const updatedPhones = [...contact.phones];

      // Check each phone number
      for (let i = 0; i < updatedPhones.length; i++) {
        const phone = updatedPhones[i];
        stats.phonesChecked++;

        // Only update if current type is 'mobile' and doesn't start with +91
        if (phone.type === 'mobile' && !phone.number.startsWith('+91')) {
          console.log(`Contact: ${contact.name}`);
          console.log(`  Phone: ${phone.number}`);
          console.log(`  Changing type: mobile → residence\n`);

          updatedPhones[i] = {
            ...phone,
            type: 'residence',
          };

          contactUpdated = true;
          stats.phonesUpdated++;
        }
      }

      // Update the contact if any phone was modified
      if (contactUpdated) {
        try {
          await prisma.contact.update({
            where: { id: contact.id },
            data: {
              phones: updatedPhones,
              lastUpdated: new Date(),
            },
          });
        } catch (error) {
          console.error(`Error updating contact ${contact.name}:`, error);
          stats.errors++;
        }
      }
    }

    // Print summary
    console.log('\n=== Update Summary ===');
    console.log(`Total contacts: ${stats.totalContacts}`);
    console.log(`Contacts with phones: ${stats.contactsWithPhones}`);
    console.log(`Phone numbers checked: ${stats.phonesChecked}`);
    console.log(`Phone numbers updated: ${stats.phonesUpdated}`);
    console.log(`Errors encountered: ${stats.errors}`);
    console.log('=====================\n');

  } catch (error) {
    console.error('Fatal error during update process:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
updatePhoneTypes()
  .then(() => {
    console.log('Script completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Script failed:', error);
    process.exit(1);
  });