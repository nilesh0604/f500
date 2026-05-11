import { Router, Request, Response } from 'express';
import { authenticate, AuthRequest } from '@orderflow/auth';
import { registerSchema, loginSchema } from '../validation/auth.schemas';
import { registerUser, loginUser, deleteUser } from '../services/auth.service';

export const authRouter = Router();

authRouter.post('/register', async (req: Request, res: Response) => {
  const result = registerSchema.safeParse(req.body);
  if (!result.success) {
    res.status(422).json({
      error: 'Validation Error',
      message: 'Invalid request body',
      details: result.error.issues,
    });
    return;
  }

  try {
    const tokens = await registerUser(result.data);
    res.status(201).json(tokens);
  } catch (err) {
    const e = err as Error & { status?: number };
    res.status(e.status ?? 500).json({
      error: e.message,
      message: e.message,
    });
  }
});

authRouter.post('/login', async (req: Request, res: Response) => {
  const result = loginSchema.safeParse(req.body);
  if (!result.success) {
    res.status(422).json({
      error: 'Validation Error',
      message: 'Invalid request body',
      details: result.error.issues,
    });
    return;
  }

  try {
    const tokens = await loginUser(result.data);
    res.status(200).json(tokens);
  } catch (err) {
    const e = err as Error & { status?: number };
    res.status(e.status ?? 500).json({
      error: e.message,
      message: e.message,
    });
  }
});

authRouter.delete('/me', authenticate, async (req: Request, res: Response) => {
  const { userId } = req as AuthRequest;
  await deleteUser(userId);
  res.status(204).send();
});
