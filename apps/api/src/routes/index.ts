import { Router, Response } from 'express';

const router = Router();

router.get('/', (res: Response) => {
    res.send('Hello from the backend API!');
});

export default router;
