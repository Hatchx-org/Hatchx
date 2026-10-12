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

The SQL is domain-neutral; changing domains never requires editing the schema.

## Other files

- [`upgrade-existing.sql`](./upgrade-existing.sql): compatibility upgrade for the original legacy database only. Back up the database before running it.
- [`demo.sql`](./demo.sql): optional local/demo Club records. Do not run it in production.

Run `npm run check:migrations` before deployment to validate the SQL files for unsafe grants, incomplete transactions, and missing `search_path` protection on security-definer functions.

## Domain checklist

Set `NEXT_PUBLIC_SITE_URL` without a trailing slash. During a domain change, keep the old callback URLs temporarily in Supabase until outstanding email links have expired. Google OAuth continues to use the Supabase callback URL (`https://PROJECT-REF.supabase.co/auth/v1/callback`), not the website callback.
