# Deployment Guide

## Platforms

### Railway (Current - Recommended for MVP)
- **Cost:** $5-15/mo
- **SQLite:** Native file persistence
- **Deployment:** Auto via GitHub Actions
- **Rollback:** 1-click in Railway dashboard
- **URL:** https://cap-tracker-production.up.railway.app

---

## GitHub Actions Workflow

**File:** `.github/workflows/test-deploy.yml`

### Flow
1. Code pushed to `main` branch
2. GitHub Actions triggered
3. Install dependencies
4. Run tests (`npm run test`)
   - If fail → Stop, don't deploy
5. Build Next.js (`npm run build`)
   - If fail → Stop, don't deploy
6. Deploy to Railway (if tests & build pass)
7. Health check

### Secrets Required
Set in GitHub repo → Settings → Secrets and variables → Actions:

| Secret | Value |
|--------|-------|
| `RAILWAY_TOKEN` | Your Railway API token |
| `RAILWAY_PROJECT_ID` | Your Railway project ID |
| `FAC_API_KEY` | Federal Audit Clearinghouse API key |
| `ANTHROPIC_API_KEY` | Claude API key (when needed) |

### Get Railway Secrets

**RAILWAY_TOKEN:**
1. Go to https://railway.app
2. Account → API Tokens
3. Generate new token
4. Copy to GitHub Secrets

**RAILWAY_PROJECT_ID:**
1. Go to your project dashboard
2. Settings → General
3. Copy Project ID

---

## Local Testing Before Deploy

### Test Locally
```bash
npm install
npm run dev
# Visit http://localhost:3000
```

### Run Full Test Suite
```bash
npm run test
```

### Build for Production
```bash
npm run build
npm start
```

### Manual Deploy to Railway
```bash
npm install -g @railway/cli
railway link --project <PROJECT_ID>
railway up
```

---

## Rollback

If deployment breaks production:

1. Go to Railway dashboard
2. Click deployment that failed
3. Click "Revert"
4. Select previous good deployment
5. Click "Redeploy"

Takes ~1-2 minutes.

---

## Environment Variables in Railway

Set in Railway dashboard:
1. Project → Service (cap-tracker)
2. Variables tab
3. Add / edit:

```
NEXTAUTH_SECRET=<your-secret>
DATABASE_URL=cap-tracker.db
FAC_API_KEY=<your-key>
ANTHROPIC_API_KEY=<your-key>
```

---

## Monitoring

### Check Deployment Status
1. Go to Railway project
2. Deployments tab shows:
   - ✅ Online (live)
   - ⏳ Building (in progress)
   - ❌ Failed (check logs)

### View Logs
1. Deployments tab → Click deployment
2. View Logs → See real-time output
3. Look for errors

### Health Check
1. Visit https://cap-tracker-production.up.railway.app
2. Should see login page
3. Try signing in with test email

---

## Cost Tracking

Monitor usage at https://railway.app:
- Compute: ~$5/mo (always-on instance)
- Storage: $0.25/GB/mo (SQLite file)
- **Total MVP:** ~$10/mo

Upgrade as needed if traffic increases.

---

## Future: Migration to Production

When moving to production (Phase 2+):

1. **Upgrade Railway plan** → Paid tier for SLA
2. **Set up backups** → Railway → Settings → Backups
3. **Enable monitoring** → New Relic or similar
4. **Use Postgres** instead of SQLite (migration script needed)
5. **Set up error tracking** → Sentry or similar

---

**Last Updated:** 2026-08-17
