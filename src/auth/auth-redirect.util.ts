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

export const normalizeRedirectPath = (value: string | undefined): string => {
  if (!value) {
    return DEFAULT_REDIRECT_PATH;
  }

  let decodedValue = value.trim();

  try {
    decodedValue = decodeURIComponent(decodedValue);
  } catch {
    decodedValue = value.trim();
  }

  if (!decodedValue) {
    return DEFAULT_REDIRECT_PATH;
  }

  if (/^https?:\/\//i.test(decodedValue)) {
    const frontendOrigin = getFrontendOrigin();

    if (!frontendOrigin) {
      return DEFAULT_REDIRECT_PATH;
    }

    try {
      const parsedUrl = new URL(decodedValue);

      if (parsedUrl.origin !== frontendOrigin) {
        return DEFAULT_REDIRECT_PATH;
      }

      return `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}` || DEFAULT_REDIRECT_PATH;
    } catch {
      return DEFAULT_REDIRECT_PATH;
    }
  }

  if (!decodedValue.startsWith('/') || decodedValue.startsWith('//')) {
    return DEFAULT_REDIRECT_PATH;
  }

  return decodedValue;
};

export const resolveRedirectPathFromRequest = (req: Request): string => {
  const redirectToQueryValue = readStringCandidate(req.query?.redirectTo);

  if (redirectToQueryValue) {
    return normalizeRedirectPath(redirectToQueryValue);
  }

  const stateQueryValue = readStringCandidate(req.query?.state);

  if (stateQueryValue) {
    return normalizeRedirectPath(stateQueryValue);
  }

  const referer = req.get('referer');

  if (!referer) {
    return DEFAULT_REDIRECT_PATH;
  }

  const frontendOrigin = getFrontendOrigin();

  if (!frontendOrigin) {
    return DEFAULT_REDIRECT_PATH;
  }

  try {
    const refererUrl = new URL(referer);

    if (refererUrl.origin !== frontendOrigin) {
      return DEFAULT_REDIRECT_PATH;
    }

    return normalizeRedirectPath(`${refererUrl.pathname}${refererUrl.search}${refererUrl.hash}`);
  } catch {
    return DEFAULT_REDIRECT_PATH;
  }
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