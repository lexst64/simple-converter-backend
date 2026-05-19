import { Router, Response } from 'express';

const router = Router();

function notImplemented(res: Response) {
  return res.status(501).json({ message: 'Not implemented' });
}

router.post('/request', async (req, res) => {
  if (!req.isLoggedIn) {
    res.status(401);
    return;
  }

  return notImplemented(res);
});

router.post('/:fileUploadId', async (req, res) => {
  if (!req.isLoggedIn) {
    res.status(401);
    return;
  }

  return notImplemented(res);
});

router.post('/:fileUploadId/convert', async (req, res) => {
  if (!req.isLoggedIn) {
    res.status(401);
    return;
  }

  return notImplemented(res);
});

export default router;
