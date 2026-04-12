export type SessionUser = {
  discordId: string;
  username: string;
  avatar: string;
};

const asNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const normalizeAvatar = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
};

const parseSessionObject = (raw: unknown): SessionUser | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const candidate = raw as {
    discordId?: unknown;
    username?: unknown;
    avatar?: unknown;
  };

  const discordId = asNonEmptyString(candidate.discordId);
  const username = asNonEmptyString(candidate.username);

  if (!discordId || !username) {
    return null;
  }

  return {
    discordId,
    username,
    avatar: normalizeAvatar(candidate.avatar),
  };
};

export const parseSessionUserFromCookie = (cookieValue: unknown): SessionUser | null => {
  if (typeof cookieValue !== 'string' || !cookieValue.length) {
    return null;
  }

  try {
    const parsed = JSON.parse(cookieValue);
    return parseSessionObject(parsed);
  } catch {
    return null;
  }
};

export const encodeSessionUserForTransport = (sessionUser: SessionUser): string => {
  const json = JSON.stringify(sessionUser);
  return Buffer.from(json, 'utf8').toString('base64url');
};

export const parseSessionUserFromTransport = (encodedValue: unknown): SessionUser | null => {
  if (typeof encodedValue !== 'string' || !encodedValue.length) {
    return null;
  }

  try {
    const json = Buffer.from(encodedValue, 'base64url').toString('utf8');
    const parsed = JSON.parse(json);
    return parseSessionObject(parsed);
  } catch {
    return null;
  }
};