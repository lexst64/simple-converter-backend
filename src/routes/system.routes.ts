import { Router } from 'express';

const router = Router();

/**
 * GET /api/v1/health
 * Returns the health status of the API and its database connection
 */
router.get('/health', (req, res) => {
  // TODO: do real api checks e.g. memory, disk, database connection
  return res.json({
    status: 'ok',
    version: '1.0.0',

    services: {
      database: 'ok',
    },

    timestamp: new Date().toISOString(),
  });
});

/**
 * GET /api/v1/formats
 * Retrieves the lists of supported media conversion formats
 */
router.get('/formats', (req, res) => {
  return res.json({
    video: ['mp4', 'avi', 'mov', 'mkv', 'webm', 'flv', 'wmv'],
    image: ['jpeg', 'jpg', 'png', 'gif', 'bmp', 'tiff', 'heic', 'webp'],
    audio: ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'],
  });
});

export default router;
