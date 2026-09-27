# Google and X sign-in / account linking

**Update (team decision, 2026-09-26):** Google is a normal sign-in button on the sign-in screen, next to
LinkedIn and GitHub (`signInWithGoogle` in mobile/lib/auth.tsx), not a Profile connector. Supabase attaches it to
an existing account automatically when the verified Google email matches. X stays link-only. Google is
configured and enabled in Supabase (client ID in supabase/config.toml, secret only in the dashboard).

Uses the existing Supabase Auth account and PKCE callback, not Firebase Auth. Alan requested these
providers and confirmed Supabase on 2026-09-26. New accounts use the existing `on_create_account()`
trigger and onboarding gate. Connecting an identity uses `linkIdentity`, preserving the current user.
These are login identities only: no Gmail, contacts, Drive, X posts, or interest ingestion is added.

## Configure the providers

Both developer apps must register this exact authorized callback:

```
https://mwfzgkikbmnghueolfnw.supabase.co/auth/v1/callback
```

### Google

1. In Google Cloud / Google Auth Platform, select the team's project (an existing Firebase project's
   underlying Google Cloud project is fine). Configure Branding, Audience, and Data Access.
2. Use only identity scopes: `openid`, `userinfo.email`, `userinfo.profile`. Add team members as test
   users if the consent screen is in Testing.
3. Create a **Web application** OAuth client and register the callback above. This is a server-hosted
   OAuth callback even though the app runs on a phone.
4. Supabase → Authentication → Sign In / Providers → Google: enter the client ID and secret, enable,
   save. Keep the secret in the dashboard, never in mobile code or Git.

### X

1. In the X developer portal, select/create the team's app. Configure User authentication settings for
   OAuth 2.0 with the **Web App** (confidential client) type. Set the callback above and genuine website,
   privacy policy and terms URLs. Enable the email request as required by Supabase's X guide.
2. Use the OAuth 2.0 **Client ID / Client Secret**, not the older API Key / API Secret or app bearer token.
3. Supabase → Authentication → Sign In / Providers → **X / Twitter (OAuth 2.0)**: enter those values,
   enable, save. The SDK provider name is `x`, not `twitter`.

### Connect an identity to an existing account

Enable **Allow manual linking** in Supabase → Authentication → Sign In / Providers. This lets a signed-in
user prove ownership of a Google or X identity and add it to the same account. Supabase rejects identities
already attached to another account; we do not merge accounts ourselves.

Keep the existing Auth → URL Configuration return links (including `formalconnect://auth/callback`).
Expo Go must use the team's tunnel workflow, not a LAN IP return URL (see AGENTS.md).

## Phone checks after saving provider settings

- Reload the updated app: enabled providers appear on Sign in.
- New Google/X account: complete OAuth, return to app, see onboarding, then finish/skip it as normal.
- Existing account: Profile → Edit profile / Your sources → Sign-in accounts → Connect Google/X.
  Confirm the identity is connected and the original profile/connections remain.
- Cancel/deny consent: no success message or linked identity should appear.
- Try an identity already attached to a different account: show the provider error, preserve the account.
- Sign out and sign back in with the newly linked provider; verify the same profile returns.
- LinkedIn/GitHub/email remain working. No new native dependency or backend deployment is needed.

## References

- https://supabase.com/docs/guides/auth/social-login/auth-google
- https://supabase.com/docs/guides/auth/social-login/auth-twitter
- https://supabase.com/docs/guides/auth/auth-identity-linking

The code alone does not enable the hosted providers. Real OAuth cannot be verified until the owner
configures both developer apps and completes the phone checks.
