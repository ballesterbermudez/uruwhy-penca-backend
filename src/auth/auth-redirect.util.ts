import type { Request } from 'express';

const DEFAULT_REDIRECT_PATH = '/';
const DEFAULT_FRONTEND_URL = 'http://localhost:4321';

const parseCsvEnv = (value: string | undefined): string[] => {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const trimTrailingSlash = (value: string): string => value.replace(/\/$/, '');

const readStringCandidate = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }

  return undefined;
};

const resolveFrontendCandidates = (): string[] => {
  const fromFrontendEnv = parseCsvEnv(process.env.FRONTEND_URL).map((url) => trimTrailingSlash(url));

  if (fromFrontendEnv.length > 0) {
    return fromFrontendEnv;
  }

  return [DEFAULT_FRONTEND_URL];
};

const resolvePrimaryFrontendUrl = (): string => {
  return resolveFrontendCandidates()[0] ?? DEFAULT_FRONTEND_URL;
};

const resolveAllowedFrontendOrigins = (): Set<string> => {
  const allowedOrigins = new Set<string>();

  const candidates = [
    ...resolveFrontendCandidates(),
    ...parseCsvEnv(process.env.ALLOWED_FRONTEND_ORIGINS),
    ...parseCsvEnv(process.env.ALLOWED_ORIGINS),
    'http://localhost:4321',
    'http://127.0.0.1:4321',
  ];

  candidates.forEach((candidate) => {
    try {
      allowedOrigins.add(new URL(candidate).origin);
    } catch {
      return;
    }
  });

  return allowedOrigins;
};

const isAllowedFrontendOrigin = (origin: string): boolean => {
  return resolveAllowedFrontendOrigins().has(origin);
};

type RedirectResolutionSource = 'redirectTo' | 'state' | 'referer' | 'fallback';

type RedirectResolutionReason =
  | 'ok-relative'
  | 'ok-absolute-allowed-origin'
  | 'ok-from-referer'
  | 'missing-input'
  | 'decode-error'
  | 'invalid-format'
  | 'invalid-absolute-url'
  | 'frontend-origin-unavailable'
  | 'absolute-origin-mismatch'
  | 'referer-missing'
  | 'referer-invalid'
  | 'referer-origin-mismatch';

export type RedirectResolutionDetails = {
  redirectPath: string;
  redirectOrigin?: string;
  source: RedirectResolutionSource;
  reason: RedirectResolutionReason;
  rawInput?: string;
  frontendOrigin: string | null;
};

const normalizeRedirectInput = (value: string | undefined): RedirectResolutionDetails => {
  const frontendOrigin = new URL(resolvePrimaryFrontendUrl()).origin;

  if (!value) {
    return {
      redirectPath: DEFAULT_REDIRECT_PATH,
      source: 'fallback',
      reason: 'missing-input',
      frontendOrigin,
    };
  }

  const rawInput = value;
  let decodedValue = value.trim();

  try {
    decodedValue = decodeURIComponent(decodedValue);
  } catch {
    return {
      redirectPath: DEFAULT_REDIRECT_PATH,
      source: 'fallback',
      reason: 'decode-error',
      rawInput,
      frontendOrigin,
    };
  }

  if (!decodedValue) {
    return {
      redirectPath: DEFAULT_REDIRECT_PATH,
      source: 'fallback',
      reason: 'missing-input',
      rawInput,
      frontendOrigin,
    };
  }

  if (/^https?:\/\//i.test(decodedValue)) {
    try {
      const parsedUrl = new URL(decodedValue);

      if (!isAllowedFrontendOrigin(parsedUrl.origin)) {
        return {
          redirectPath: DEFAULT_REDIRECT_PATH,
          source: 'fallback',
          reason: 'absolute-origin-mismatch',
          rawInput,
          frontendOrigin,
        };
      }

      const redirectPath = `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}` || DEFAULT_REDIRECT_PATH;

      return {
        redirectPath,
        redirectOrigin: parsedUrl.origin,
        source: 'fallback',
        reason: 'ok-absolute-allowed-origin',
        rawInput,
        frontendOrigin,
      };
    } catch {
      return {
        redirectPath: DEFAULT_REDIRECT_PATH,
        source: 'fallback',
        reason: 'invalid-absolute-url',
        rawInput,
        frontendOrigin,
      };
    }
  }

  if (!decodedValue.startsWith('/') || decodedValue.startsWith('//')) {
    return {
      redirectPath: DEFAULT_REDIRECT_PATH,
      source: 'fallback',
      reason: 'invalid-format',
      rawInput,
      frontendOrigin,
    };
  }

  return {
    redirectPath: decodedValue,
    source: 'fallback',
    reason: 'ok-relative',
    rawInput,
    frontendOrigin,
  };
};

export const normalizeRedirectPath = (value: string | undefined): string => {
  return normalizeRedirectInput(value).redirectPath;
};

export const resolveRedirectPathDetailsFromRequest = (req: Request): RedirectResolutionDetails => {
  const redirectToQueryValue = readStringCandidate(req.query?.redirectTo);

  if (redirectToQueryValue) {
    const details = normalizeRedirectInput(redirectToQueryValue);

    return {
      ...details,
      source: 'redirectTo',
    };
  }

  const stateQueryValue = readStringCandidate(req.query?.state);

  if (stateQueryValue) {
    const details = normalizeRedirectInput(stateQueryValue);

    return {
      ...details,
      source: 'state',
    };
  }

  const referer = req.get('referer');
  const frontendOrigin = new URL(resolvePrimaryFrontendUrl()).origin;

  if (!referer) {
    return {
      redirectPath: DEFAULT_REDIRECT_PATH,
      source: 'fallback',
      reason: 'referer-missing',
      frontendOrigin,
    };
  }

  try {
    const refererUrl = new URL(referer);

    if (!isAllowedFrontendOrigin(refererUrl.origin)) {
      return {
        redirectPath: DEFAULT_REDIRECT_PATH,
        source: 'referer',
        reason: 'referer-origin-mismatch',
        rawInput: referer,
        frontendOrigin,
      };
    }

    return {
      redirectPath: `${refererUrl.pathname}${refererUrl.search}${refererUrl.hash}` || DEFAULT_REDIRECT_PATH,
      redirectOrigin: refererUrl.origin,
      source: 'referer',
      reason: 'ok-from-referer',
      rawInput: referer,
      frontendOrigin,
    };
  } catch {
    return {
      redirectPath: DEFAULT_REDIRECT_PATH,
      source: 'referer',
      reason: 'referer-invalid',
      rawInput: referer,
      frontendOrigin,
    };
  }
};

export const resolveRedirectPathFromRequest = (req: Request): string => {
  return resolveRedirectPathDetailsFromRequest(req).redirectPath;
};

export const resolveOAuthStateFromRequest = (req: Request): string => {
  const details = resolveRedirectPathDetailsFromRequest(req);

  if (details.redirectOrigin) {
    return `${details.redirectOrigin}${details.redirectPath}`;
  }

  return details.redirectPath;
};

export const buildFrontendRedirectUrl = (
  redirectPath: string,
  encodedSession?: string,
  redirectOrigin?: string,
): string => {
  const baseOrigin =
    redirectOrigin && isAllowedFrontendOrigin(redirectOrigin)
      ? redirectOrigin
      : new URL(resolvePrimaryFrontendUrl()).origin;

  const targetUrl = new URL(normalizeRedirectPath(redirectPath), `${baseOrigin}/`);

  if (!encodedSession) {
    return targetUrl.toString();
  }

  const currentHash = targetUrl.hash.startsWith('#') ? targetUrl.hash.slice(1) : targetUrl.hash;
  const hashParams = new URLSearchParams(currentHash);
  hashParams.set('penca_session', encodedSession);
  targetUrl.hash = hashParams.toString();

  return targetUrl.toString();
};
