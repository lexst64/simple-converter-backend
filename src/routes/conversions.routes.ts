import { Router, Response } from 'express';
import { pagination } from '../middlewares';

const router = Router();

function notImplemented(res: Response) {
  return res.status(501).json({ message: 'Not implemented' });
}

router.post('/job', async (req, res) => {});

router.get('/job', pagination(1, 50), async (req, res) => {
  const { limit, offset } = req.query;

  return res.json({ limit, offset });
});

router.get('/job/:id', async (req, res) => {
  return notImplemented(res);
});

router.get('/job/:id/status', async (req, res) => {
  return notImplemented(res);
});

export default router;
