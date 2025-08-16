// pages/api/stats.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { ContactDatabaseService } from '@/lib/database';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const stats = await ContactDatabaseService.getStats();
    
    // Add cache headers for better performance
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=60');
    
    return res.status(200).json(stats);
  } catch (error) {
    console.error('Stats API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}