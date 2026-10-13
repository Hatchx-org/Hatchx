# Hatchx security operations

Application security depends on the deployed configuration as well as this code.
Complete this checklist for every production environment.

## Required controls

- Enable MFA for GitHub, Vercel, Supabase, Resend, and Brevo administrators.
- Store `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET`, email-provider keys, VAPID
  private keys, and database credentials only as Vercel Secrets. Never expose
  them through a `NEXT_PUBLIC_` variable.
- Use a unique random `CRON_SECRET` of at least 32 bytes.
- Keep Supabase leaked-password protection enabled and configure only the
  required school domains in `ALLOWED_EMAIL_DOMAINS`.
- Keep Row Level Security enabled on every client-accessible Supabase table.
- Apply `supabase/security-hardening.sql` to existing databases after deploying
  the matching application release.
- Protect the GitHub `main` branch, require the CI workflow, and restrict who can
  change Actions secrets or production deployments.
- Keep production and Preview credentials separate. Never run mutating browser
  tests against the production Supabase project.

## Routine maintenance

- Review dependency and secret-scan CI results on every change.
- Rotate service-role, email, cron, and VAPID secrets after suspected exposure
  and redeploy before revoking the old credential.
- Download and test an encrypted database backup regularly. Database dumps do
  not include Supabase Storage objects, which require a separate export.
- Review Admin audit logs, system errors, unusual public-form volume, and email
  delivery failures.
- Remove departed administrators immediately and review Club management roles at
  the beginning and end of each school term.

No internet-facing application can be guaranteed completely secure. Report a
suspected incident privately to the school administrator; do not include student
data, credentials, or exploit details in a public GitHub issue.
