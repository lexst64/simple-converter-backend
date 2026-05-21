import { Router } from 'express';

const router = Router();

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

router.get('/formats', (req, res) => {
  return res.json({
    video: ['mp4', 'avi', 'mov', 'mkv', 'webm', 'flv', 'wmv'],
    image: ['jpeg', 'jpg', 'png', 'gif', 'bmp', 'tiff', 'heic', 'webp'],
    audio: ['mp3', 'wav', 'aac', 'flac', 'ogg', 'm4a'],
  });
});

export default router;
