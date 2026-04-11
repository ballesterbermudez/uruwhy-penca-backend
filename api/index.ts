import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import express from 'express';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import passport from 'passport';
import { AppModule } from '../src/app.module';

dotenv.config();

let cachedHandler: ((req: unknown, res: unknown) => void) | null = null;

const localhostOrigins = [
  'http://localhost:4321',
  'http://127.0.0.1:4321',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
];

const parseCsvEnv = (value: string | undefined): string[] => {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const configureHttpApp = (app: Awaited<ReturnType<typeof NestFactory.create>>) => {
  const allowedOrigins = new Set<string>([
    ...localhostOrigins,
    ...parseCsvEnv(process.env.FRONTEND_URL),
    ...parseCsvEnv(process.env.ALLOWED_ORIGINS),
  ]);

  if (process.env.VERCEL_URL) {
    allowedOrigins.add(`https://${process.env.VERCEL_URL}`);
  }

  app.use(cookieParser());

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    credentials: true,
  });

  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'default_secret',
      resave: false,
      saveUninitialized: false,
      cookie: {
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      },
    }),
  );

  app.use(passport.initialize());
  app.use(passport.session());
};

async function getHandler() {
  if (cachedHandler) {
    return cachedHandler;
  }

  const expressApp = express();
  const app = await NestFactory.create(AppModule, new ExpressAdapter(expressApp));

  configureHttpApp(app);
  await app.init();

  cachedHandler = expressApp;
  return cachedHandler;
}

export default async function handler(req: unknown, res: unknown) {
  const appHandler = await getHandler();
  return appHandler(req, res);
}
