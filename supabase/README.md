# Supabase setup

The database setup is intentionally kept to three SQL files.

## Brand-new project

1. Create a Supabase project.
2. Open **SQL Editor → New query** and run [`schema.sql`](./schema.sql) once.
3. Copy the project URL and publishable key into `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
4. In **Authentication → URL Configuration**, set the Site URL to the new production domain and add:
   - `https://YOUR-DOMAIN/auth/callback`
   - `https://YOUR-DOMAIN/auth/confirm`
5. Set `NEXT_PUBLIC_SITE_URL=https://YOUR-DOMAIN` in the hosting environment.

## Google sign-in

1. In Google Cloud Console, create an OAuth 2.0 Web application.
2. Add `https://YOUR-DOMAIN` under **Authorized JavaScript origins**. DOE deployments can therefore authorize only `https://hatchx.org`; no `supabase.co` Google redirect URI is used.
3. Set `NEXT_PUBLIC_GOOGLE_CLIENT_ID` to that Web client ID in Vercel and redeploy.
4. In **Supabase → Authentication → Providers → Google**, enable Google and paste the same Google client ID and its client secret. Supabase uses these values to verify the Google ID token.

Hatchx uses the Google Identity Services popup and then validates the returned email before completing login. Accounts outside the configured NYC Public Schools domains are signed out. The Google client ID is public by design; the Google client secret belongs only in Supabase—not in Vercel or this repository.

The SQL is domain-neutral; changing domains never requires editing the schema.

## Other files

- [`attendance-comments-so-number.sql`](./attendance-comments-so-number.sql): standalone, idempotent upgrade for an existing Hatchx database. Run this file to add attendance comments and optional profile SO numbers without rerunning the full schema.
- [`security-hardening-v2.sql`](./security-hardening-v2.sql): standalone, idempotent upgrade for an existing Hatchx database. Run it once to rate-limit public forms and enforce payload limits inside the database RPC. The `v2` filename prevents accidentally reusing an older SQL Editor tab.
- [`upgrade-existing.sql`](./upgrade-existing.sql): compatibility upgrade for the original pre-Hatchx database only. Back up the database before running it. Do not run this file on a new or partially installed project; rerun `schema.sql` instead.
- [`demo.sql`](./demo.sql): optional local/demo Club records. Do not run it in production.

Run `npm run check:migrations` before deployment to validate the SQL files for unsafe grants, incomplete transactions, and missing `search_path` protection on security-definer functions.

## Free-project availability and backups

GitHub Actions workflows for read-only keepalive queries and encrypted weekly
logical backups are documented in
[`docs/supabase-free-operations.md`](../docs/supabase-free-operations.md). They do
not require another SQL migration.

## Domain checklist

Set `NEXT_PUBLIC_SITE_URL` without a trailing slash. During a domain change, keep the old callback URLs temporarily in Supabase until outstanding email links have expired. Google OAuth continues to use the Supabase callback URL (`https://PROJECT-REF.supabase.co/auth/v1/callback`), not the website callback.
