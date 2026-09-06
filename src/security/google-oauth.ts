import type { OAuth2Client } from 'google-auth-library';

export const GOOGLE_GMAIL_READ_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
export const GOOGLE_CALENDAR_READ_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
export const GOOGLE_DRIVE_METADATA_READ_SCOPE = 'https://www.googleapis.com/auth/drive.metadata.readonly';

export const GOOGLE_CONNECTOR_SCOPES = new Set([
  GOOGLE_GMAIL_READ_SCOPE,
  GOOGLE_CALENDAR_READ_SCOPE,
  GOOGLE_DRIVE_METADATA_READ_SCOPE
]);

const GOOGLE_IDENTITY_SCOPES = new Set([
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
]);

export class GoogleOAuthScopeError extends Error {
  constructor(
    public readonly code:
      | 'google_access_token_missing'
      | 'google_required_scope_missing'
      | 'google_unexpected_scope'
  ) {
    super(code);
    this.name = 'GoogleOAuthScopeError';
  }
}

export function validateGoogleScopeSet(
  grantedScopes: Iterable<string>,
  requiredScopes: Iterable<string>,
  allowedConnectorScopes: Iterable<string> = GOOGLE_CONNECTOR_SCOPES
): void {
  const granted = new Set([...grantedScopes].map((scope) => scope.trim()).filter(Boolean));
  const required = new Set([...requiredScopes].map((scope) => scope.trim()).filter(Boolean));
  const allowed = new Set([...allowedConnectorScopes].map((scope) => scope.trim()).filter(Boolean));

  for (const scope of allowed) {
    if (!GOOGLE_CONNECTOR_SCOPES.has(scope)) {
      throw new GoogleOAuthScopeError('google_unexpected_scope');
    }
  }

  for (const scope of required) {
    if (!allowed.has(scope)) {
      throw new GoogleOAuthScopeError('google_unexpected_scope');
    }
    if (!granted.has(scope)) {
      throw new GoogleOAuthScopeError('google_required_scope_missing');
    }
  }

  for (const scope of granted) {
    if (allowed.has(scope) || GOOGLE_IDENTITY_SCOPES.has(scope)) continue;
    throw new GoogleOAuthScopeError('google_unexpected_scope');
  }
}

export async function verifyGoogleOAuthScopes(
  oauth2: OAuth2Client,
  requiredScopes: Iterable<string>,
  allowedConnectorScopes: Iterable<string> = GOOGLE_CONNECTOR_SCOPES
): Promise<void> {
  const access = await oauth2.getAccessToken();
  if (!access.token) throw new GoogleOAuthScopeError('google_access_token_missing');

  const info = await oauth2.getTokenInfo(access.token);
  validateGoogleScopeSet(info.scopes ?? [], requiredScopes, allowedConnectorScopes);
}
