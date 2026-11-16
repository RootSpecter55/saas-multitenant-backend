import express, { type Express } from 'express';
import { pinoHttp } from 'pino-http';
import { errorHandler, notFoundHandler } from './common/error-handler';
import { logger } from './common/logger';
import { sendData } from './common/response';

export function createApp(): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(pinoHttp({ logger }));

  app.get('/health', (_req, res) => sendData(res, { status: 'ok' }));

  app.use(express.json({ limit: '100kb' }));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
