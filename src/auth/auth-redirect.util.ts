import type { Request } from 'express';

const DEFAULT_REDIRECT_PATH = '/';
const DEFAULT_FRONTEND_URL = 'http://localhost:4321';

const trimTrailingSlash = (value: string): string => value.replace(/\/$/, '');

const resolveFrontendUrl = (): string => {
  const frontendUrl = process.env.FRONTEND_URL;

  if (frontendUrl) {
    return trimTrailingSlash(frontendUrl);
  }

  return DEFAULT_FRONTEND_URL;
};

const getFrontendOrigin = (): string | null => {
  try {
    return new URL(resolveFrontendUrl()).origin;
  } catch {
    return null;
  }
};

const readStringCandidate = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }

  return undefined;
};

type RedirectResolutionSource = 'redirectTo' | 'state' | 'referer' | 'fallback';

type RedirectResolutionReason =
  | 'ok-relative'
  | 'ok-absolute-same-origin'
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
  source: RedirectResolutionSource;
  reason: RedirectResolutionReason;
  rawInput?: string;
  frontendOrigin: string | null;
};

const normalizeRedirectPathWithDetails = (value: string | undefined): RedirectResolutionDetails => {
  const frontendOrigin = getFrontendOrigin();

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
    if (!frontendOrigin) {
      return {
        redirectPath: DEFAULT_REDIRECT_PATH,
        source: 'fallback',
        reason: 'frontend-origin-unavailable',
        rawInput,
        frontendOrigin,
      };
    }

    try {
      const parsedUrl = new URL(decodedValue);

      if (parsedUrl.origin !== frontendOrigin) {
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
        source: 'fallback',
        reason: 'ok-absolute-same-origin',
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
  return normalizeRedirectPathWithDetails(value).redirectPath;
};

export const resolveRedirectPathDetailsFromRequest = (req: Request): RedirectResolutionDetails => {
  const redirectToQueryValue = readStringCandidate(req.query?.redirectTo);

  if (redirectToQueryValue) {
    const details = normalizeRedirectPathWithDetails(redirectToQueryValue);
    return {
      ...details,
      source: 'redirectTo',
    };
  }

  const stateQueryValue = readStringCandidate(req.query?.state);

  if (stateQueryValue) {
    const details = normalizeRedirectPathWithDetails(stateQueryValue);
    return {
      ...details,
      source: 'state',
    };
  }

  const referer = req.get('referer');

  if (!referer) {
    return {
      redirectPath: DEFAULT_REDIRECT_PATH,
      source: 'fallback',
      reason: 'referer-missing',
      frontendOrigin: getFrontendOrigin(),
    };
  }

  const frontendOrigin = getFrontendOrigin();

  if (!frontendOrigin) {
    return {
      redirectPath: DEFAULT_REDIRECT_PATH,
      source: 'fallback',
      reason: 'frontend-origin-unavailable',
      rawInput: referer,
      frontendOrigin,
    };
  }

  try {
    const refererUrl = new URL(referer);

    if (refererUrl.origin !== frontendOrigin) {
      return {
        redirectPath: DEFAULT_REDIRECT_PATH,
        source: 'referer',
        reason: 'referer-origin-mismatch',
        rawInput: referer,
        frontendOrigin,
      };
    }

    const details = normalizeRedirectPathWithDetails(`${refererUrl.pathname}${refererUrl.search}${refererUrl.hash}`);

    return {
      ...details,
      source: 'referer',
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

export const resolveFrontendUrlForRedirect = (): string => resolveFrontendUrl();

export const buildFrontendRedirectUrl = (redirectPath: string, encodedSession?: string): string => {
  const targetUrl = new URL(normalizeRedirectPath(redirectPath), `${resolveFrontendUrl()}/`);

  if (!encodedSession) {
    return targetUrl.toString();
  }

  const currentHash = targetUrl.hash.startsWith('#') ? targetUrl.hash.slice(1) : targetUrl.hash;
  const hashParams = new URLSearchParams(currentHash);
  hashParams.set('penca_session', encodedSession);
  targetUrl.hash = hashParams.toString();

  return targetUrl.toString();
};