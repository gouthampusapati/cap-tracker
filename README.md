# CAP Tracker MVP

Track corrective action plans for Single Audit findings across years.

## Quick Start

```bash
npm install
npm run dev
```

Open `http://localhost:3000`

## Auth

Email magic-link login. Test with any email address (no actual sending in MVP).

## Import Data

1. Sign in
2. Enter EIN (test: `471334206`)
3. View findings and CAP items

## Key Features

- ✅ Magic-link authentication
- ✅ FAC API integration (real + mock fallback)
- ✅ Findings display with repeat-finding warnings
- ✅ CAP item tracking UI (owner, due date, status)
- ✅ SQLite database with Drizzle ORM

## Tech Stack

- Next.js 15 + TypeScript
- NextAuth (email provider)
- SQLite + Drizzle
- Tailwind CSS
