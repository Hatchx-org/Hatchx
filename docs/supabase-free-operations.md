# Supabase free-project keepalive and backups

The repository includes an automatic keepalive workflow and a local backup script:

- `Supabase keepalive` performs a read-only database query three times per day.
- `scripts/backup-supabase.sh` exports roles, schema, and data on demand and writes
  an encrypted file into the ignored local `backups/` directory.

These jobs reduce the chance that a low-activity Free Plan project is paused, but
only a paid Supabase plan guarantees that a project will not be paused. A paused
project must first be resumed in the Supabase dashboard before the jobs can query it.

## Repository secrets

In GitHub, open **Settings → Secrets and variables → Actions → New repository secret**
and add:

| Secret | Value |
| --- | --- |
| `SUPABASE_URL` | Project URL, for example `https://PROJECT_REF.supabase.co` |
| `SUPABASE_ANON_KEY` | The project's publishable/anon key; do not use the service-role key |

Never place these values directly in a workflow, source file, issue, or commit.

After adding the secrets, open **Actions**, run `Supabase keepalive` once with
**Run workflow**, and confirm that the job is green. Scheduled workflows run from the
default branch and GitHub may delay them during busy periods. GitHub may disable
scheduled workflows in a public repository after 60 days without repository
activity, so keep normal development activity or re-enable the workflow in the
Actions page if GitHub sends an inactivity notice.

## Create and decrypt a free backup

Install the Supabase CLI, copy the Session pooler connection string from
**Supabase → Connect**, and run locally:

```bash
export SUPABASE_DB_URL='postgresql://...'
export BACKUP_ENCRYPTION_KEY='a unique long passphrase'
./scripts/backup-supabase.sh
```

The database password inside `SUPABASE_DB_URL` must be URL-encoded. Keep both
values out of shell-history where possible and never commit them.

To decrypt a backup, run:

```bash
export BACKUP_ENCRYPTION_KEY='the same passphrase stored in GitHub'
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 \
  -pass env:BACKUP_ENCRYPTION_KEY \
  -in backups/supabase-YYYYMMDDTHHMMSSZ.sql.tar.gz.enc \
  | tar -xz
```

This produces `roles.sql`, `schema.sql`, and `data.sql`. Follow Supabase's official
backup/restore guide before restoring them into a new project.

## Limits and an additional free copy

The database dump does not contain files stored in Supabase Storage; those need a
separate Storage export. Keep the encrypted backup on an external drive or in a
private cloud-drive folder. Keep the encryption key separate from the backup and
test decryption periodically. Other free choices include manually exporting key
tables as CSV from Supabase Studio, although CSV does not preserve relationships,
policies, triggers, Auth configuration, or roles and should only be a secondary copy.
