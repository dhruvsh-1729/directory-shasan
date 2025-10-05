import type { NextApiRequest, NextApiResponse } from 'next';
import rateLimit from '@/lib/rateLimit';
import { ContactDatabaseService } from '@/lib/database';

const limiter = rateLimit({ interval: 60 * 1000, uniqueTokenPerInterval: 500 });

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // await limiter.check(res, 20, 'FILTER_OPTIONS_TOKEN'); // generous but safe
    if (req.method !== 'GET') {
      res.setHeader('Allow', ['GET']);
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // This call is already optimized and deduped on the server.
    const opts = await ContactDatabaseService.getUniqueLocationValues();

    // Cache for a bit; options don’t change often
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
    return res.status(200).json(opts);
  } catch (err) {
    if (err instanceof Error && err.message.includes('Rate limit')) {
      return res.status(429).json({ error: 'Too many requests' });
    }
    console.error('options API error:', err);
    return res.status(500).json({ error: 'Failed to load options' });
  }
}
