import type { OAuth2Client } from 'google-auth-library';
import { describe, expect, it, vi } from 'vitest';
import {
  GOOGLE_CALENDAR_READ_SCOPE,
  GOOGLE_DRIVE_METADATA_READ_SCOPE,
  GOOGLE_GMAIL_READ_SCOPE,
  GoogleOAuthScopeError,
  validateGoogleScopeSet,
  verifyGoogleOAuthScopes
} from '../../src/security/google-oauth.js';

describe('Google OAuth least-privilege scope policy', () => {
  it('accepts the exact read-only connector scopes plus identity scopes', () => {
    expect(() =>
      validateGoogleScopeSet(
        [
          GOOGLE_GMAIL_READ_SCOPE,
          GOOGLE_CALENDAR_READ_SCOPE,
          GOOGLE_DRIVE_METADATA_READ_SCOPE,
          'openid',
          'https://www.googleapis.com/auth/userinfo.email'
        ],
        [GOOGLE_GMAIL_READ_SCOPE]
      )
    ).not.toThrow();
  });

  it('rejects a token that is missing the scope required by the tool', () => {
    expect(() => validateGoogleScopeSet([GOOGLE_GMAIL_READ_SCOPE], [GOOGLE_CALENDAR_READ_SCOPE])).toThrowError(
      new GoogleOAuthScopeError('google_required_scope_missing')
    );
  });

  it('rejects broader Google API scopes even when the required read scope is present', () => {
    expect(() =>
      validateGoogleScopeSet(
        [GOOGLE_GMAIL_READ_SCOPE, 'https://www.googleapis.com/auth/gmail.modify'],
        [GOOGLE_GMAIL_READ_SCOPE]
      )
    ).toThrowError(new GoogleOAuthScopeError('google_unexpected_scope'));

    expect(() =>
      validateGoogleScopeSet(
        [GOOGLE_DRIVE_METADATA_READ_SCOPE, 'https://www.googleapis.com/auth/drive'],
        [GOOGLE_DRIVE_METADATA_READ_SCOPE]
      )
    ).toThrowError(new GoogleOAuthScopeError('google_unexpected_scope'));
  });

  it('validates the actual access token scopes returned by Google token info', async () => {
    const getAccessToken = vi.fn(async () => ({ token: 'access-token' }));
    const getTokenInfo = vi.fn(async () => ({ scopes: [GOOGLE_GMAIL_READ_SCOPE, 'openid'] }));
    const oauth2 = { getAccessToken, getTokenInfo } as unknown as OAuth2Client;

    await expect(verifyGoogleOAuthScopes(oauth2, [GOOGLE_GMAIL_READ_SCOPE])).resolves.toBeUndefined();
    expect(getAccessToken).toHaveBeenCalledTimes(1);
    expect(getTokenInfo).toHaveBeenCalledWith('access-token');
  });

  it('fails closed when Google does not issue an access token', async () => {
    const oauth2 = {
      getAccessToken: vi.fn(async () => ({ token: null })),
      getTokenInfo: vi.fn()
    } as unknown as OAuth2Client;

    await expect(verifyGoogleOAuthScopes(oauth2, [GOOGLE_GMAIL_READ_SCOPE])).rejects.toThrow(
      'google_access_token_missing'
    );
  });
});
