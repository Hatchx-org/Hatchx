# Supabase database setup

## Brand-new project

1. Create a new Supabase project and wait for database provisioning to finish.
2. Open **SQL Editor → New query**.
3. Run `npm run db:bundle`, then execute the generated `supabase/bootstrap.sql` once. It contains every required migration in the dependency order defined by [`migration-order.json`](./migration-order.json).
4. Do not run `production_compatibility.sql` on a new project. Do not run `demo_clubs.sql` in production.
5. Configure Authentication URLs for the new website domain; no hostname needs to be changed in SQL.

Regenerate the bundle after changing any source migration:

```bash
npm run db:bundle
npm run check:migrations
```

The validator fails when a SQL file is unclassified, missing from disk, or appears more than once in the manifest. The generated bundle is intentionally ignored by Git and should be rebuilt immediately before use.

## Existing project

Do not run the full bootstrap against an existing database. Back up the database and follow [`docs/SUPABASE_SETUP.md`](../docs/SUPABASE_SETUP.md), applying only migrations that have not already been installed. `production_compatibility.sql` is reserved for upgrading the original legacy schema.

## New website domain

The database scripts are domain-neutral. For a new domain such as `https://portal.example.edu`, update:

- Vercel: `NEXT_PUBLIC_SITE_URL=https://portal.example.edu`
- Supabase → Authentication → URL Configuration → Site URL
- Supabase Redirect URLs:
  - `https://portal.example.edu/auth/callback`
  - `https://portal.example.edu/auth/confirm`
- Google OAuth keeps the Supabase callback: `https://<project-ref>.supabase.co/auth/v1/callback`
- `VAPID_SUBJECT` and allowed school email domains if those values also change

Keep the old production callback temporarily during a domain transition so existing email links and sessions are not cut off prematurely.
