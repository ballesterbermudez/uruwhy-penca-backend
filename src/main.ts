import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import passport from 'passport';

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

const normalizeOrigin = (origin: string): string => origin.trim().replace(/\/$/, '');

const isAllowedOrigin = (origin: string, allowedOrigins: Set<string>): boolean => {
  const normalizedOrigin = normalizeOrigin(origin);

  if (allowedOrigins.has(normalizedOrigin)) {
    return true;
  }

  if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(normalizedOrigin)) {
    return true;
  }

  return false;
};

const configureHttpApp = (app: Awaited<ReturnType<typeof NestFactory.create>>) => {
  const allowedOrigins = new Set<string>([
    ...localhostOrigins.map((origin) => normalizeOrigin(origin)),
    ...parseCsvEnv(process.env.FRONTEND_URL).map((origin) => normalizeOrigin(origin)),
    ...parseCsvEnv(process.env.ALLOWED_FRONTEND_ORIGINS).map((origin) => normalizeOrigin(origin)),
    ...parseCsvEnv(process.env.ALLOWED_ORIGINS).map((origin) => normalizeOrigin(origin)),
  ]);

  if (process.env.VERCEL_URL) {
    allowedOrigins.add(normalizeOrigin(`https://${process.env.VERCEL_URL}`));
  }

  app.use(cookieParser());

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || isAllowedOrigin(origin, allowedOrigins)) {
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

async function bootstrap() {
  dotenv.config();
  const app = await NestFactory.create(AppModule);
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  configureHttpApp(app);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
