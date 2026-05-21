import { Router, Response } from 'express';

const router = Router();

function notImplemented(res: Response) {
  return res.status(501).json({ message: 'Not implemented' });
}

router.post('/', async (req, res) => {
  return notImplemented(res);
});

router.get('/:preparationId', async (req, res) => {
  return notImplemented(res);
});

router.get('/:preparationId/file', async (req, res) => {
  return notImplemented(res);
});

export default router;
