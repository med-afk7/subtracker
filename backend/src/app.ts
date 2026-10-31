import cookieParser from 'cookie-parser';
import express from 'express';
import { pinoHttp } from 'pino-http';
import { errorHandler } from './http/middleware/errorHandler.js';
import { notFoundHandler } from './http/middleware/notFound.js';
import { originCheck } from './http/middleware/originCheck.js';
import accountRouter from './http/routes/account.routes.js';
import authRouter from './http/routes/auth.routes.js';
import calendarRouter from './http/routes/calendar.routes.js';
import categoriesRouter from './http/routes/categories.routes.js';
import dashboardRouter from './http/routes/dashboard.routes.js';
import forecastRouter from './http/routes/forecast.routes.js';
import healthRouter from './http/routes/health.routes.js';
import internalRouter from './http/routes/internal.routes.js';
import { notificationsRouter, preferencesRouter } from './http/routes/notifications.routes.js';
import subscriptionsRouter from './http/routes/subscriptions.routes.js';
import { logger } from './lib/logger.js';

const app = express();

app.disable('x-powered-by');
// One structured log line per request (method, url, status, duration); sets req.log
app.use(pinoHttp({ logger }));
app.use(express.json());
app.use(cookieParser());
app.use(originCheck);

app.use('/api/health', healthRouter);
app.use('/api/auth', authRouter);
app.use('/api/account', accountRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api/categories', categoriesRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/forecast', forecastRouter);
app.use('/api/subscriptions', subscriptionsRouter);
app.use('/api/notification-preferences', preferencesRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/internal', internalRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
