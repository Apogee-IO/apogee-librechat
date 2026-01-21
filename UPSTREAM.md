# Upstream Sync Process

This document describes how to sync with the upstream LibreChat repository.

## Repository Setup

```bash
# Upstream remote should be configured
git remote -v
# origin    git@github.com:Apogee-IO/apogee-librechat.git (fetch)
# origin    git@github.com:Apogee-IO/apogee-librechat.git (push)
# upstream  https://github.com/danny-avila/LibreChat.git (fetch)
# upstream  https://github.com/danny-avila/LibreChat.git (push)

# If upstream isn't set:
git remote add upstream https://github.com/danny-avila/LibreChat.git
```

## Sync Schedule

- **Monthly:** Routine sync to pick up security patches and features
- **As needed:** When a specific feature or fix is required

## Sync Process

### 1. Prepare

```bash
# Ensure you're on main and clean
git checkout main
git status  # Should be clean
git pull origin main

# Fetch upstream changes
git fetch upstream
```

### 2. Create Sync Branch

```bash
# Create dated branch for the sync
git checkout -b upstream-sync-$(date +%Y-%m-%d)
```

### 3. Merge Upstream

```bash
# Merge upstream main
git merge upstream/main

# If conflicts occur, resolve them carefully
# Conflicts are most likely in:
# - package.json (dependencies)
# - librechat.yaml (if we modified the template)
# - docker-compose files
```

### 4. Conflict Resolution Strategy

When resolving conflicts:

1. **Our config files** (`config/apogee/*`): Keep ours
2. **LibreChat config templates**: Take upstream, update our separate configs
3. **Dependencies**: Take upstream versions unless we have specific requirements
4. **Any source modifications**: Review carefully (see CUSTOMIZATIONS.md)

### 5. Test Locally

```bash
# Install dependencies
npm install

# Run locally
npm run dev

# Test with Docker
docker compose -f docker-compose.dev.yml up
```

### 6. Verify Key Functionality

- [ ] App starts without errors
- [ ] Login/registration works
- [ ] Bedrock models available
- [ ] MCP tools connect and respond
- [ ] Custom branding appears correctly

### 7. Complete Sync

```bash
# Push sync branch
git push -u origin upstream-sync-$(date +%Y-%m-%d)

# Create PR for review
gh pr create --title "Upstream sync $(date +%Y-%m-%d)" --body "Syncs with upstream LibreChat main branch"

# After review, merge to main
# Prefer squash merge to keep history clean
```

## Tracking Upstream Version

After each sync, update the version in CUSTOMIZATIONS.md:

```bash
# Get upstream commit hash
git log upstream/main -1 --format="%H"
```

## Rollback Plan

If sync causes issues in production:

```bash
# Revert to previous known-good commit
git revert <sync-merge-commit>

# Or hard reset (destructive - only on your branch)
git reset --hard <previous-commit>
```

## Useful Commands

```bash
# See what's changed upstream since last sync
git log main..upstream/main --oneline

# See diff summary
git diff main...upstream/main --stat

# Check upstream releases
gh release list -R danny-avila/LibreChat
```

## Release Notes to Watch

Check these locations for breaking changes:
- https://github.com/danny-avila/LibreChat/releases
- https://docs.librechat.ai/changelog
- https://docs.librechat.ai/install/configuration/dotenv

---

Last successful sync: (not yet synced)
Current upstream commit: (not yet set)
