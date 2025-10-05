// pages/api/uploads/cloudinary-signature.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME!,
  api_key: process.env.CLOUDINARY_API_KEY!,
  api_secret: process.env.CLOUDINARY_API_SECRET!,
  secure: true,
});

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method not allowed' });

  const { folder = 'contacts/avatars', publicId } = req.body || {};
  const timestamp = Math.round(Date.now() / 1000);

  // Only include the exact params you’ll also send from the client
  const paramsToSign: Record<string, string | number> = {
    timestamp,
    folder,                 // <-- note: not URL-encoded
  };

  if (publicId) paramsToSign.public_id = publicId; // only if you’ll send it from client

  const signature = cloudinary.utils.api_sign_request(
    paramsToSign,
    process.env.CLOUDINARY_API_SECRET!
  );

  return res.status(200).json({
    timestamp,
    signature,
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    folder,
    // echo back publicId if you passed it in
    ...(publicId ? { publicId } : {}),
  });
}
