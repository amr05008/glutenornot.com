/**
 * Health Check Endpoint
 * Returns status of dependent services
 */

export default async function handler(req, res) {
  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const health = {
    healthy: true,
    timestamp: new Date().toISOString(),
    services: {
      ocr: { status: 'unknown' },
      analysis: { status: 'unknown' }
    }
  };

  // Check if API keys are configured
  const hasVisionKey = !!process.env.GOOGLE_CLOUD_VISION_API_KEY;
  const hasAnthropicKey = !!process.env.ANTHROPIC_API_KEY;

  health.services.ocr.status = hasVisionKey ? 'configured' : 'missing_key';
  health.services.analysis.status = hasAnthropicKey ? 'configured' : 'missing_key';

  // Overall health is true only if both keys are configured
  health.healthy = hasVisionKey && hasAnthropicKey;

  const statusCode = health.healthy ? 200 : 503;

  return res.status(statusCode).json(health);
}
