// pages/api/health.ts - Health Check Endpoint
import { NextApiRequest, NextApiResponse } from 'next';
import { ContactDatabaseService } from '@/lib/database';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const healthCheck = await ContactDatabaseService.healthCheck();
    
    return res.status(healthCheck.status === 'healthy' ? 200 : 503).json({
      status: healthCheck.status,
      service: 'Contact Directory API',
      version: '1.0.0',
      ...healthCheck.details
    });
  } catch (error) {
    return res.status(503).json({
      status: 'unhealthy',
      service: 'Contact Directory API',
      error: 'Health check failed',
      timestamp: new Date().toISOString()
    });
  }
}