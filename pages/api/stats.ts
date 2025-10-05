// pages/api/stats.ts - Enhanced Stats API
import { NextApiRequest, NextApiResponse } from 'next';
import { ContactDatabaseService } from '@/lib/database';
import rateLimit from '@/lib/rateLimit';

const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 500,
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Apply rate limiting
    // await limiter.check(res, 20, 'STATS_TOKEN'); // 20 requests per minute

    const startTime = Date.now();
    const stats = await ContactDatabaseService.getStats();
    const queryTime = Date.now() - startTime;
    
    // Add performance metadata
    const enhancedStats = {
      ...stats,
      metadata: {
        queryTime: `${queryTime}ms`,
        timestamp: new Date().toISOString(),
        version: '1.0',
        cacheStatus: 'fresh' // This would be set based on cache hit/miss
      }
    };
    
    // Set caching headers for better performance
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=600');
    res.setHeader('X-Query-Time', `${queryTime}ms`);
    
    return res.status(200).json(enhancedStats);
  } catch (error) {
    console.error('Stats API error:', error);
    
    if (error instanceof Error && error.message.includes('Rate limit')) {
      return res.status(429).json({
        error: 'Too many requests',
        message: 'Please wait before requesting stats again',
        retryAfter: 60
      });
    }
    
    return res.status(500).json({ 
      error: 'Internal server error',
      details: process.env.NODE_ENV === 'development' ? 
        (error instanceof Error ? error.message : 'Unknown error') : undefined
    });
  }
}