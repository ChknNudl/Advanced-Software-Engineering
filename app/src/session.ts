import { createHash } from 'node:crypto';

/** Only a token hash is persisted. Cookie values are never logged. */
export const digest = (token: string) =>
  createHash('sha256').update(token).digest('hex');

export const tokenFrom = (cookie = '') =>
  cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('session='))
    ?.slice(8) ?? '';
