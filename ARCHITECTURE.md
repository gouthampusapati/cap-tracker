# CAP Tracker Architecture

**For agents developing this product.**

## Directory Structure

```
cap-tracker/
├── app/                          # Next.js App Router
│   ├── api/                      # Backend API routes
│   │   ├── import/route.ts       # FAC data import endpoint
│   │   └── findings/route.ts     # GET findings by email
│   ├── auth/
│   │   └── signin/page.tsx       # Login page
│   ├── dashboard/page.tsx        # Main app (findings, CAP items)
│   ├── page.tsx                  # Root redirect to auth/dashboard
│   ├── layout.tsx                # Root layout (no 'use client')
│   ├── providers.tsx             # Client wrapper (SessionProvider)
│   └── globals.css               # Tailwind entry
├── lib/
│   ├── auth.ts                   # Auth utilities (legacy, not used in MVP)
│   ├── auth-config.ts            # Simple localStorage auth
│   ├── fac-client.ts             # FAC API client + mock data
│   └── db/
│       ├── index.ts              # SQLite + Drizzle init
│       └── schema.ts             # Database schema
├── test/
│   ├── setup.ts                  # Test environment
│   └── api/
│       └── import.test.ts        # Example API tests
├── public/                       # Static assets
├── .github/workflows/
│   └── test-deploy.yml           # GitHub Actions CI/CD
├── .env.local                    # Local secrets (git-ignored)
├── package.json                  # Dependencies
├── tsconfig.json                 # TypeScript config
├── next.config.ts                # Next.js config
└── vitest.config.ts              # Vitest config
```

---

## Data Model

### Core Tables (SQLite)

**users**
- `id` (text, PK)
- `email` (text, unique)
- `ein` (text) — organization EIN
- `org_name` (text)
- `created_at`, `last_login`

**audit_years**
- `id` (text, PK)
- `user_id` (text, FK)
- `ein` (text)
- `fiscal_year_end` (text)
- `fac_report_id` (text)
- `raw_fac_data` (JSON)

**findings**
- `id` (text, PK)
- `audit_year_id` (text, FK)
- `fac_finding_id` (text) — e.g., "2024-001"
- `category` (text) — Procurement, Subrecipient Monitoring, etc.
- `description` (text)
- `questioned_costs` (real)
- `is_repeat_finding` (bool)
- `prior_finding_refs` (JSON array)

**cap_items**
- `id` (text, PK)
- `finding_id` (text, FK)
- `description` (text)
- `owner` (text) — name/email of responsible person
- `due_date` (timestamp)
- `status` (text) — "open" | "in_progress" | "resolved"
- `notes` (text)
- `drafted_narrative` (text) — Claude-generated CAP text
- `created_at`, `updated_at`

---

## API Endpoints

### POST /api/import
**Import FAC audit data for an organization**

Request:
```json
{
  "ein": "471334206",
  "email": "user@org.org"
}
```

Response:
```json
{
  "success": true,
  "auditYearId": "uuid"
}
```

Creates: audit_year + findings rows

---

### GET /api/findings?email=user@org.org
**Fetch all findings for a user**

Response:
```json
[
  {
    "id": "finding-1",
    "facFindingId": "2024-001",
    "category": "Procurement",
    "description": "...",
    "questionedCosts": 5000,
    "isRepeatFinding": false,
    "auditYear": "2024-06-30",
    "priorRefs": [],
    "capItems": []
  },
  ...
]
```

---

## Development Workflow (For Agents)

### 1. Local Setup
```bash
git clone https://github.com/YOUR-ORG/cap-tracker
cd cap-tracker
npm install
npm run dev
# Open http://localhost:3000
```

### 2. Make Changes
```bash
# Create feature branch
git checkout -b feature/your-feature

# Edit files in app/, lib/, etc.
# Test locally at http://localhost:3000
```

### 3. Write Tests
```bash
# Add test file in test/
touch test/lib/your-lib.test.ts

# Run tests
npm run test

# Or watch mode
npm run test:watch
```

### 4. Commit & Push
```bash
git add .
git commit -m "feat: description of change"
git push origin feature/your-feature
```

### 5. GitHub Actions Runs Automatically
- Tests run (Vitest)
- Build runs (Next.js)
- If all pass → Deploy to Railway
- If fail → Deployment blocked, PR shows failures

### 6. Create Pull Request (Optional)
- Push to GitHub
- GitHub shows test results in PR
- Code review + merge to main

---

## Key Features by Phase

### Phase 1 ✅ COMPLETE
- [x] Auth (localStorage magic-link)
- [x] FAC data import
- [x] Findings display
- [x] Repeat-finding detection
- [x] CAP item UI (mock)

### Phase 2 (Next)
- [ ] Save CAP edits to database (owner, due date, status)
- [ ] Edit existing CAP items
- [ ] Delete CAP items

### Phase 3
- [ ] Claude API draft generation (CAP narratives)
- [ ] Export draft as text

### Phase 4
- [ ] Next-cycle prep report (all open items by urgency)
- [ ] PDF export

### Phase 5
- [ ] Email reminders (stub)
- [ ] Multi-year historical view

---

## Deployment

### Local Testing
```bash
npm run test       # Run all tests
npm run build      # Build for production
npm start          # Run built app locally
```

### Deploy to Railway
**Automatic on push to main** (via GitHub Actions)

Manual deploy:
```bash
npm install -g @railway/cli
railway link
railway up
```

**Live URL:** https://cap-tracker-production.up.railway.app

### Rollback
Railway dashboard → Current Deployment → "Revert"

---

## Environment Variables

See `.env.local` and `.env.example`:

| Variable | Purpose | Where to Set |
|----------|---------|--------------|
| `NEXTAUTH_SECRET` | Session encryption | .env.local + Railway |
| `DATABASE_URL` | SQLite path | .env.local (default: cap-tracker.db) |
| `FAC_API_KEY` | Federal Audit Clearinghouse | GitHub Secrets → Railway |
| `ANTHROPIC_API_KEY` | Claude API (Phase 4) | GitHub Secrets → Railway |

---

## Agent Instructions

**When Claude (or another agent) develops features:**

1. **Always run tests first**
   ```bash
   npm run test
   ```
   Fail = don't commit

2. **Test locally before pushing**
   ```bash
   npm run dev
   # Test at http://localhost:3000
   ```

3. **Write tests for new features**
   - API route? → test/api/your-feature.test.ts
   - Utility function? → test/lib/your-lib.test.ts
   - Tests must pass to deploy

4. **Commit message format**
   ```
   feat: add CAP item save to database
   fix: repeat finding detection off by one
   test: add import API tests
   docs: update architecture
   ```

5. **Never modify**
   - `.github/workflows/` (CI/CD logic)
   - Database schema without migration
   - Environment variable names

6. **On merge to main**
   - GitHub Actions tests + builds
   - If pass → Railway auto-deploys
   - Watch GitHub Actions tab for logs

---

## Testing

### Run Tests
```bash
npm run test        # Single run
npm run test:watch  # Watch mode
```

### Test Coverage
Tests are in `test/` directory, organized by module:
- `test/api/` — API route tests
- `test/lib/` — Library function tests

### Add New Test
1. Create file in `test/` following module structure
2. Import what you're testing
3. Write test cases
4. Run `npm run test`

Example test:
```typescript
import { describe, it, expect } from 'vitest';
import { getMockFindings } from '@/lib/fac-client';

describe('FAC client', () => {
  it('should return mock findings', () => {
    const findings = getMockFindings();
    expect(findings.length).toBeGreaterThan(0);
  });
});
```

---

## Common Tasks for Agents

### Add a new API endpoint
1. Create `app/api/your-endpoint/route.ts`
2. Export `GET` or `POST` function
3. Add tests in `test/api/your-endpoint.test.ts`
4. Push to GitHub → auto-deployed

### Modify database schema
1. Edit `lib/db/schema.ts`
2. Update table creation in `lib/db/index.ts`
3. Add migration tests
4. Push → Railway migrates on deploy

### Add a new page
1. Create `app/your-feature/page.tsx`
2. Use 'use client' if it needs interactivity
3. Test locally
4. Push → deployed

### Fix a bug
1. Create branch `fix/issue-name`
2. Locate bug in code
3. Add test that fails (reproduces bug)
4. Fix code until test passes
5. Push → GitHub Actions runs → deployed

---

## Troubleshooting

### Tests fail locally but GitHub Actions passes
- Env vars missing locally? Check `test/setup.ts`
- Database state? Tests use in-memory DB via `:memory:`

### Deploy fails but tests pass
- Check Railway logs: Railway dashboard → Deployments → View Logs
- Common: env var missing in Railway secrets

### Next.js build error
- Clear `.next/` folder: `rm -rf .next`
- Reinstall: `npm install`
- Rebuild: `npm run build`

---

**Last Updated:** 2026-08-17
