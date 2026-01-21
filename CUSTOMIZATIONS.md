# Apogee Customizations

This document tracks all changes made to LibreChat for Apogee deployment.

**Key Principle:** Minimize source code changes. Prefer configuration over code modifications.

## Configuration-Only Changes (No Source Modifications)

These customizations are achieved through configuration files, not code changes:

| Customization | Method | Location |
|---------------|--------|----------|
| MCP server connection | `librechat.yaml` | `config/apogee/librechat.yaml` |
| Bedrock model config | `librechat.yaml` | `config/apogee/librechat.yaml` |
| Branding (logo, CSS) | File override | `config/apogee/branding/` |
| Environment settings | `.env` | `config/apogee/.env.template` |

## Source Code Changes

**Current count: 0**

If you must modify source code, document it here with:
- File path
- Description of change
- Reason why configuration wasn't sufficient
- Git commit hash

### Example Entry (Template)

```
### Change: [Brief description]

**File:** `client/src/components/Header.tsx`
**Commit:** `abc123`
**Reason:** Configuration couldn't achieve X because...
**Description:**
Modified the header component to...
```

---

## Guidelines for Future Changes

1. **Try configuration first** - Check LibreChat docs for config options
2. **Use CSS overrides** - Most visual changes can be CSS-only
3. **Environment variables** - Many behaviors are env-configurable
4. **Document everything** - Any source change must be documented here
5. **Keep changes minimal** - Smaller changes = easier upstream merges

## Upstream Compatibility

When making changes, consider:
- Will this conflict with upstream updates?
- Can we achieve this with a LibreChat plugin instead?
- Is there an open PR/issue for this feature?

---

Last reviewed: 2026-01-20
Upstream version: (to be set after initial clone)
