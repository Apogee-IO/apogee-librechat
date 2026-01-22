/**
 * Patch LibreChat to include Apogee SSO route
 *
 * This script is run at startup before the main server starts.
 * It modifies the server routes to include our custom auth endpoint.
 */

const fs = require('fs');
const path = require('path');

const ROUTES_FILE = '/app/api/server/routes/index.js';
const AUTH_ROUTES_FILE = '/app/api/server/routes/auth.js';
const PATCH_MARKER = '// APOGEE_PATCH_APPLIED';

async function patchRoutes() {
  console.log('[Apogee Patch] Checking if patch is needed...');

  // Check if we should skip patching
  if (!process.env.APOGEE_JWT_PUBLIC_KEY) {
    console.log('[Apogee Patch] APOGEE_JWT_PUBLIC_KEY not set, skipping SSO patch');
    return;
  }

  // Try to patch the auth routes file first (most specific)
  if (fs.existsSync(AUTH_ROUTES_FILE)) {
    await patchFile(AUTH_ROUTES_FILE, 'auth');
  } else if (fs.existsSync(ROUTES_FILE)) {
    await patchFile(ROUTES_FILE, 'routes');
  } else {
    console.error('[Apogee Patch] Could not find routes file to patch');
    console.log('[Apogee Patch] Attempting alternative approach...');
    await patchViaAppJs();
  }
}

async function patchFile(filePath, type) {
  let content = fs.readFileSync(filePath, 'utf-8');

  // Check if already patched
  if (content.includes(PATCH_MARKER)) {
    console.log('[Apogee Patch] Already applied, skipping');
    return;
  }

  console.log(`[Apogee Patch] Patching ${filePath}...`);

  // Add import at the top (after other requires)
  const importLine = `\n${PATCH_MARKER}\nconst apogeeAuth = require('/app/apogee-server/apogeeAuth');\n`;

  // Find the right place to add the import
  if (content.includes("require('express')")) {
    content = content.replace(
      /const\s+.*\s*=\s*require\(['"]express['"]\);?/,
      match => match + importLine
    );
  } else {
    // Add at the very top if no express require found
    content = importLine + content;
  }

  // Add route mounting
  // Look for existing route definitions and add ours
  if (type === 'auth') {
    // For auth routes file, add before module.exports or at the end
    if (content.includes('module.exports')) {
      content = content.replace(
        /module\.exports/,
        `\n// Apogee SSO route\nrouter.use('/', apogeeAuth);\n\nmodule.exports`
      );
    } else {
      content += `\n// Apogee SSO route\nrouter.use('/', apogeeAuth);\n`;
    }
  } else {
    // For main routes file
    if (content.includes("router.use('/auth'")) {
      // Add after existing auth route
      content = content.replace(
        /router\.use\(['"]\/auth['"]/,
        match => `router.use('/auth', apogeeAuth);\n${match}`
      );
    } else if (content.includes('module.exports')) {
      content = content.replace(
        /module\.exports/,
        `\n// Apogee SSO route\nrouter.use('/auth', apogeeAuth);\n\nmodule.exports`
      );
    }
  }

  fs.writeFileSync(filePath, content);
  console.log('[Apogee Patch] Successfully patched routes');
}

async function patchViaAppJs() {
  // Alternative: patch the main app.js or index.js
  const possibleFiles = [
    '/app/api/server/index.js',
    '/app/api/app.js',
    '/app/server/index.js',
  ];

  for (const filePath of possibleFiles) {
    if (fs.existsSync(filePath)) {
      let content = fs.readFileSync(filePath, 'utf-8');

      if (content.includes(PATCH_MARKER)) {
        console.log('[Apogee Patch] Already applied, skipping');
        return;
      }

      console.log(`[Apogee Patch] Patching ${filePath}...`);

      // Add import
      const importLine = `\n${PATCH_MARKER}\nconst apogeeAuth = require('/app/apogee-server/apogeeAuth');\n`;

      // Find app definition
      if (content.includes('const app = express()')) {
        content = content.replace(
          /const\s+app\s*=\s*express\(\)/,
          match => importLine + match
        );
      } else {
        content = importLine + content;
      }

      // Add route after app definition
      if (content.includes("app.use('/api")) {
        content = content.replace(
          /app\.use\(['"]\/api/,
          `app.use('/auth', apogeeAuth);\n$&`
        );
      } else if (content.includes('app.use(')) {
        // Add after first middleware
        const firstUse = content.indexOf('app.use(');
        const insertPoint = content.indexOf('\n', firstUse);
        content = content.slice(0, insertPoint) +
          `\napp.use('/auth', apogeeAuth);` +
          content.slice(insertPoint);
      }

      fs.writeFileSync(filePath, content);
      console.log('[Apogee Patch] Successfully patched via app file');
      return;
    }
  }

  console.error('[Apogee Patch] Could not find any server file to patch');
}

// Run the patch
patchRoutes().catch(err => {
  console.error('[Apogee Patch] Fatal error:', err);
  // Don't exit with error - let the server start anyway
});
