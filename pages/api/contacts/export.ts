// pages/api/contacts/export.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import * as XLSX from 'xlsx';

const prisma = new PrismaClient();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { 
      fields = [], 
      filters = {},
      format = 'xlsx' // 'xlsx' or 'csv'
    } = req.body;

    // Build query based on filters
    const where: any = {};
    
    if (filters.searchTerm) {
      where.OR = [
        { name: { contains: filters.searchTerm, mode: 'insensitive' } },
        { phones: { some: { number: { contains: filters.searchTerm } } } },
        { emails: { some: { address: { contains: filters.searchTerm } } } },
        { city: { contains: filters.searchTerm, mode: 'insensitive' } },
        { state: { contains: filters.searchTerm, mode: 'insensitive' } },
      ];
    }

    // Add location filters
    if (filters.address) where.address = filters.address;
    if (filters.suburb) where.suburb = filters.suburb;
    if (filters.city) where.city = filters.city;
    if (filters.pincode) where.pincode = filters.pincode;
    if (filters.state) where.state = filters.state;
    if (filters.country) where.country = filters.country;
    if (filters.category) where.category = filters.category;
    
    if (filters.isMainContact !== undefined) {
      where.isMainContact = filters.isMainContact;
    }

    // Fetch contacts with relations
    const contacts = await prisma.contact.findMany({
      where,
      include: {
        parentContact: true,
        childContacts: true,
      },
    });

    // Transform data based on selected fields
    const exportData = contacts.map(contact => {
      const row: any = {};
      
      fields.forEach((field: string) => {
        switch(field) {
          case 'name':
            row['Name'] = contact.name;
            break;
          case 'status':
            row['Status'] = contact.status || '';
            break;
          case 'phones':
            row['Primary Phone'] = contact.phones.find(p => p.isPrimary)?.number || '';
            row['All Phones'] = contact.phones.map(p => p.number).join('; ');
            break;
          case 'emails':
            row['Primary Email'] = contact.emails.find(e => e.isPrimary)?.address || '';
            row['All Emails'] = contact.emails.map(e => e.address).join('; ');
            break;
          case 'address':
            row['Address'] = contact.address || '';
            break;
          case 'suburb':
            row['Suburb'] = contact.suburb || '';
            break;
          case 'city':
            row['City'] = contact.city || '';
            break;
          case 'pincode':
            row['Pincode'] = contact.pincode || '';
            break;
          case 'state':
            row['State'] = contact.state || '';
            break;
          case 'country':
            row['Country'] = contact.country || '';
            break;
          case 'category':
            row['Category'] = contact.category || '';
            break;
          case 'officeAddress':
            row['Office Address'] = contact.officeAddress || '';
            break;
          case 'address2':
            row['Address 2'] = contact.address2 || '';
            break;
          case 'tags':
            row['Tags'] = contact.tags.join('; ');
            break;
          case 'notes':
            row['Notes'] = contact.notes || '';
            break;
          case 'createdAt':
            row['Created Date'] = contact.createdAt.toISOString().split('T')[0];
            break;
          case 'lastUpdated':
            row['Last Updated'] = contact.lastUpdated.toISOString().split('T')[0];
            break;
          case 'parentContact':
            row['Parent Contact'] = contact.parentContact?.name || '';
            break;
          case 'childContactsCount':
            row['Related Contacts'] = contact.childContacts.length;
            break;
        }
      });
      
      return row;
    });

    // Generate file based on format
    if (format === 'csv') {
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      const csv = XLSX.utils.sheet_to_csv(worksheet);
      
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="contacts-export-${Date.now()}.csv"`);
      return res.status(200).send(csv);
    } else {
      const workbook = XLSX.utils.book_new();
      const worksheet = XLSX.utils.json_to_sheet(exportData);
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Contacts');
      
      const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="contacts-export-${Date.now()}.xlsx"`);
      return res.status(200).send(buffer);
    }
  } catch (error) {
    console.error('Export error:', error);
    return res.status(500).json({ error: 'Export failed' });
  }
}