// pages/api/contacts/[id]/avatar.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { PrismaClient } from '@prisma/client';
import { cloudinary } from '@/lib/cloudinary';

const prisma = new PrismaClient();

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { id } = req.query as { id: string };

  if (req.method === 'PATCH') {
    // Body should contain url & public_id obtained after client upload
    const { url, publicId } = req.body as { url?: string; publicId?: string };
    if (!url || !publicId) return res.status(400).json({ message: 'url and publicId are required' });

    const contact = await prisma.contact.update({
      where: { id },
      data: {
        avatarUrl: url,
        avatarPublicId: publicId,
        lastUpdated: new Date(),
      },
    });

    return res.status(200).json({ contact });
  }

  if (req.method === 'DELETE') {
    // Delete from Cloudinary and unset fields
    // Optional: check & delete old image if exists
    const existing = await prisma.contact.findUnique({ where: { id } });
    if (existing?.avatarPublicId) {
      try {
        await cloudinary.uploader.destroy(existing.avatarPublicId);
      } catch (e) {
        // log, but don't fail the whole request
        console.warn('Cloudinary destroy failed:', e);
      }
    }

    const contact = await prisma.contact.update({
      where: { id },
      data: { avatarUrl: null, avatarPublicId: null, lastUpdated: new Date() },
    });

    return res.status(200).json({ contact });
  }

  return res.status(405).json({ message: 'Method not allowed' });
}
