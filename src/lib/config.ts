/**
 * Legal and contact configuration.
 *
 * Values are read from environment variables at startup so they can be
 * injected at deploy-time. Falls back to URLs derived at runtime from the
 * local git remote (HTTP/HTTPS only); returns null if git is unavailable or
 * the remote is not an HTTP/HTTPS URL.
 */

import { execSync } from 'node:child_process';

function getRemoteBase(): string | null {
  try {
    const remoteUrl = execSync('git remote get-url origin', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    if (!/^https?:\/\//i.exec(remoteUrl)) return null;
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    const repoUrl = remoteUrl.replace(/\.git$/, '');
    return `${repoUrl}/blob/${branch}`;
  } catch {
    return null;
  }
}

const remoteBase = getRemoteBase();

export const config = {
  termsUrl: process.env.TERMS_OF_SERVICE_URL ?? (remoteBase ? `${remoteBase}/TERMS.md` : null),
  privacyUrl: process.env.PRIVACY_POLICY_URL ?? (remoteBase ? `${remoteBase}/PRIVACY.md` : null),
  supportServerLink: process.env.SUPPORT_SERVER_LINK ?? null,
  developerContactEmail: process.env.DEVELOPER_CONTACT_EMAIL ?? null,
} as const;
