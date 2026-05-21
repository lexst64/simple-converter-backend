import { Router, Response } from 'express';

const router = Router();

function notImplemented(res: Response) {
  return res.status(501).json({ message: 'Not implemented' });
}

router.get('/:conversionId', async (req, res) => {
  return notImplemented(res);
});

router.get('/:conversionId/events', async (req, res) => {
  return notImplemented(res);
});

router.get('/:conversionId/file', async (req, res) => {
  return notImplemented(res);
});

export default router;
