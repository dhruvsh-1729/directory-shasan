const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function updateCountryToIndia() {
  await prisma.contact.updateMany({
    where: { country: null },
    data: { country: 'India' },
  });
  console.log('Updated contacts with null country to India');
}

updateCountryToIndia()
  .catch(e => {
    console.error(e);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });