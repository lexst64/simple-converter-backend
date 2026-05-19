import { Router, Response } from 'express';

const router = Router();

function notImplemented(res: Response) {
  return res.status(501).json({ message: 'Not implemented' });
}

router.get('/:conversionId', async (req, res) => {
  if (!req.isLoggedIn) {
    res.status(401);
    return;
  }

  return notImplemented(res);
});

router.get('/:conversionId/events', async (req, res) => {
  if (!req.isLoggedIn) {
    res.status(401);
    return;
  }

  return notImplemented(res);
});

router.get('/:conversionId/file', async (req, res) => {
  if (!req.isLoggedIn) {
    res.status(401);
    return;
  }

  return notImplemented(res);
});

export default router;
