# Hatchx

Bayside High School's one-stop platform for announcements, clubs, sports, events,
calendar, and opportunities, built with Next.js, Tailwind CSS, and Supabase.

## Tech stack

| Layer     | Choice                                        |
| --------- | --------------------------------------------- |
| Framework | Next.js 16 (App Router, Turbopack, RSC)       |
| Styling   | Tailwind CSS v4 + Figma design tokens         |
| Fonts     | Montserrat (display), Lexend (brand), Geist   |
| Backend   | Supabase (Postgres + Auth + RLS)              |
| Deploy    | Any Node host (Vercel recommended)            |

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a project at [supabase.com](https://supabase.com), then copy the env
   template and fill in your keys:

   ```bash
   cp .env.example .env.local
   ```

   Set `ALLOWED_EMAIL_DOMAINS` to a comma-separated list containing the student
   and staff domains that may access the Hub.

3. Run the dev server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Roles

| Role    | Access                                              |
| ------- | --------------------------------------------------- |
| student | Browse, join clubs, RSVP, submit applications and support requests |
| advisor | Student access plus management of assigned clubs    |
| staff   | Content, applications, support operations, and reports |
| admin   | Staff access plus user-role management              |


## Scripts

| Command          | Purpose                          |
| ---------------- | -------------------------------- |
| `npm run dev`    | Start the dev server             |
| `npm run build`  | Production build                 |
| `npm run start`  | Serve the production build       |
| `npm run lint`   | ESLint                           |
| `npm run typecheck` | TypeScript validation          |
| `npm test`       | Unit tests                        |
| `npm run test:e2e` | Isolated Playwright browser tests |
| `npm run test:e2e:ui` | Interactive Playwright runner |
| `npm run test:e2e:visual` | Login screenshot comparison |
| `npm run test:e2e:update` | Approve new screenshot baselines |
| `npm run test:e2e:live` | Opt-in isolated test-account role checks |

Pull requests and pushes to `main` run the quality and isolated browser checks through
`.github/workflows/ci.yml`.

### Browser end-to-end tests

The default Playwright suite starts Hatchx on port `3100` with a non-production
Supabase address. Authentication requests are intercepted inside the browser,
so the registration tests verify the exact OSIS, grade, and normalized invite
code payload without creating accounts or changing database records. Desktop
Chromium and a Pixel 7 viewport both run in CI. Traces, screenshots, and video
are retained on failure and uploaded as a CI artifact.

Run `npx playwright install chromium` once on a development machine, then use
`npm run test:e2e`. Visual baselines are intentionally separate so operating
system font rendering does not make the main CI gate unstable. The first visual
run creates a platform-specific baseline; later runs compare against it. Update
that baseline only after reviewing the generated diff.

Tests marked `@live` are skipped by default. Run them only against an isolated
Supabase test project with disposable accounts. Set `HATCHX_E2E_BASE_URL`,
`HATCHX_E2E_LIVE=1`, and the `HATCHX_E2E_*` credentials shown in `.env.example`.

## Project structure

```
src/
  app/
    page.tsx            # Home (hero + featured content)
    login/              # Google sign-in screen
    auth/               # OAuth callback + sign-out
    (hub)/              # Sidebar layout: announcements, clubs, calendar, …
      admin/            # Admin-only area (light theme)
  components/           # Sidebar, cards, topbar, search, …
  lib/                  # Supabase clients, auth helpers, static data
supabase/               # SQL migrations to apply in the dashboard
```

For request flow, directory responsibilities, data fallbacks, authorization
boundaries, and the commenting convention, see [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).
The complete Student, Club Officer, Advisor, Staff, and Admin permission matrix
is documented in [`docs/ACCESS_CONTROL.md`](docs/ACCESS_CONTROL.md).

## Deployment

See `.env.example` for the environment variables required in production.
Remember to add your production URL to Supabase's redirect allow-list before
going live.
