# Agent Development Workflow

**For Claude (or any agent) to autonomously develop this product.**

## Quick Start

Agent clones repo and works directly:
```bash
git clone https://github.com/gouthampusapati/cap-tracker
cd cap-tracker
npm install
npm run dev
```

## Development Loop (for agents)

### 1. Create Feature Branch
```bash
git checkout -b feature/your-feature-name
```

### 2. Make Changes
- Edit files in `app/`, `lib/`, etc.
- Test locally: `npm run dev`
- Verify: `npm run test`

### 3. Commit & Push
```bash
git add .
git commit -m "feat: description of change"
git push origin feature/your-feature-name
```

### 4. GitHub Actions Auto-Tests
- GitHub Actions runs automatically
- Workflow: `.github/workflows/test-deploy.yml`
- Tests run: `npm run test`
- Build runs: `npm run build`

### 5. Check Results
- Go to GitHub → Actions tab
- View logs for any failures
- If fail → Fix locally → Push again
- If pass → Ready to merge

### 6. Merge to Main
```bash
git push origin feature/your-feature-name
# Then create PR or just merge:
git checkout main
git pull origin main
git merge feature/your-feature-name
git push origin main
```

---

## Important: DO NOT

❌ Create or send ZIP files  
❌ Modify `.github/workflows/` (CI/CD is locked)  
❌ Push to main directly (use feature branches)  
❌ Manually deploy (use GitHub Actions)  

---

## When Tests Fail

1. Check GitHub Actions logs (most detailed)
2. Run `npm run test` locally to reproduce
3. Fix the issue
4. Commit: `git commit -m "fix: error message"`
5. Push: `git push origin feature/branch-name`
6. GitHub Actions re-runs automatically

---

## When Deployment Fails

Railway deploys only if tests pass. If tests pass but Railway fails:
1. Check Railway dashboard → Deployments → View Logs
2. Usually: missing env var or build issue
3. Fix code + push → GitHub Actions rebuilds → Railway redeploys

---

## Key Files for Agents

| File | Purpose |
|------|---------|
| `ARCHITECTURE.md` | Complete system design |
| `DEPLOY.md` | Deployment procedures |
| `.github/workflows/test-deploy.yml` | CI/CD pipeline (don't edit) |
| `vitest.config.ts` | Test configuration |
| `package.json` | Dependencies + scripts |

---

## Useful Commands

```bash
# Test locally before pushing
npm run test

# Watch mode for development
npm run test:watch

# Build to check for errors
npm run build

# Run dev server
npm run dev

# View git status
git status

# View recent commits
git log --oneline

# Switch branches
git checkout feature/name
git checkout main
```

---

## Example: Add a New Feature

Agent perspective:

```bash
# 1. Start feature branch
git checkout -b feature/save-cap-items

# 2. Edit app/api/cap-items/route.ts (add POST handler)
# 3. Edit app/dashboard/page.tsx (add save button)
# 4. Test locally
npm run dev
# (visit http://localhost:3000, test feature)

# 5. Run tests
npm run test
# (passes)

# 6. Commit
git add .
git commit -m "feat: add save CAP items to database"

# 7. Push
git push origin feature/save-cap-items

# 8. GitHub Actions runs automatically
# - Tests pass ✅
# - Build succeeds ✅
# - Deploy to Railway ✅

# 9. Feature is live at https://cap-tracker-production.up.railway.app
```

---

## Continuous Integration Flow

```
Agent pushes code
    ↓
GitHub Actions triggers
    ↓
Step 1: npm install
Step 2: npm run test
    ├─ If FAIL → Stop, show error in Actions tab
    └─ If PASS → Continue
    ↓
Step 3: npm run build
    ├─ If FAIL → Stop, show error in Actions tab
    └─ If PASS → Continue
    ↓
Step 4: Deploy to Railway
    ├─ If main branch → Auto-deploy
    └─ If feature branch → Deploy preview (optional)
    ↓
Step 5: Live on https://cap-tracker-production.up.railway.app
```

---

## Troubleshooting

**Q: Tests fail locally but how do I see the error?**
A: Run `npm run test` locally to see full output. GitHub Actions shows same errors.

**Q: How do I rollback if something breaks?**
A: Railway dashboard → Deployments → Select previous good version → Revert

**Q: How do I know if my changes deployed?**
A: Check GitHub Actions → Workflow → "Deploy" step shows "✅ Deployed"
Then verify at https://cap-tracker-production.up.railway.app

**Q: What if GitHub Actions is slow?**
A: Normal. First install takes ~2 min, subsequent ~1 min. Check Actions tab for progress.

---

## For Human Review

When agent has completed a feature:
1. Check GitHub Actions log for success
2. Visit https://cap-tracker-production.up.railway.app
3. Test the feature manually
4. If good → No action needed (auto-deployed)
5. If bad → Agent can rollback or fix

---

**Last Updated:** 2026-08-17
