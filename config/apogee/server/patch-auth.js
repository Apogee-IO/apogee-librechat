/**
 * Patch LibreChat to include Apogee SSO route and redirect middleware
 *
 * This script is run at startup before the main server starts.
 * It modifies the server routes to include:
 * 1. Custom auth endpoint for SSO
 * 2. Redirect middleware for unauthenticated users
 */

const fs = require('fs');
const path = require('path');

const ROUTES_FILE = '/app/api/server/routes/index.js';
const AUTH_ROUTES_FILE = '/app/api/server/routes/auth.js';
const APP_FILE = '/app/api/server/index.js';
const PATCH_MARKER = '// APOGEE_PATCH_APPLIED';
const REDIRECT_MARKER = '// APOGEE_REDIRECT_PATCH';

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

/**
 * Patch redirect middleware for unauthenticated users
 * Redirects to Apogee dashboard login for authentication
 */
async function patchRedirectMiddleware() {
  const dashboardUrl = process.env.APOGEE_DASHBOARD_URL;
  if (!dashboardUrl) {
    console.log('[Apogee Patch] APOGEE_DASHBOARD_URL not set, skipping redirect patch');
    return;
  }

  // Create the redirect middleware file
  const middlewareCode = `
${REDIRECT_MARKER}
/**
 * Apogee Redirect Middleware
 * Redirects unauthenticated users to Apogee dashboard for login
 */

const DASHBOARD_URL = '${dashboardUrl}';

// Paths that don't require authentication
const PUBLIC_PATHS = [
  '/api/auth/apogee',
  '/api/auth',
  '/api/health',
  '/health',
  '/favicon.ico',
];

// Path prefixes that are public
const PUBLIC_PREFIXES = [
  '/assets/',
  '/api/auth/',
];

function isPublicPath(path) {
  if (PUBLIC_PATHS.includes(path)) return true;
  return PUBLIC_PREFIXES.some(prefix => path.startsWith(prefix));
}

function apogeeRedirectMiddleware(req, res, next) {
  // Skip if path is public
  if (isPublicPath(req.path)) {
    return next();
  }

  // Check for authentication via multiple methods:
  // 1. req.user (set by passport after authentication)
  // 2. req.session?.user (session-based auth)
  // 3. LibreChat's refresh token cookie (set by setAuthTokens)
  const hasRefreshToken = req.cookies?.refreshToken;

  if (req.user || req.session?.user || hasRefreshToken) {
    return next();
  }

  // For API requests, return 401
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // For page requests, redirect to Apogee login
  const returnTo = encodeURIComponent(req.originalUrl || '/');
  const loginUrl = \`\${DASHBOARD_URL}/api/auth/chat?return_to=\${returnTo}\`;

  console.log('[Apogee Redirect] Redirecting unauthenticated user to:', loginUrl);
  return res.redirect(loginUrl);
}

module.exports = apogeeRedirectMiddleware;
`;

  const middlewarePath = '/app/apogee-server/redirectMiddleware.js';
  fs.writeFileSync(middlewarePath, middlewareCode);
  console.log('[Apogee Patch] Created redirect middleware at', middlewarePath);

  // Now patch the main app to use this middleware
  // We need to find the Express app and add the middleware early in the chain
  const possibleAppFiles = [
    '/app/api/server/index.js',
    '/app/api/app.js',
  ];

  for (const filePath of possibleAppFiles) {
    if (!fs.existsSync(filePath)) continue;

    let content = fs.readFileSync(filePath, 'utf-8');

    // Check if already patched
    if (content.includes(REDIRECT_MARKER)) {
      console.log('[Apogee Patch] Redirect middleware already applied');
      return;
    }

    console.log(`[Apogee Patch] Adding redirect middleware to ${filePath}...`);

    // Add import at the top
    const importLine = `\n${REDIRECT_MARKER}\nconst apogeeRedirect = require('/app/apogee-server/redirectMiddleware');\n`;

    // Add after express is required
    if (content.includes("require('express')")) {
      content = content.replace(
        /const\s+.*\s*=\s*require\(['"]express['"]\);?/,
        match => match + importLine
      );
    } else {
      content = importLine + content;
    }

    // Add middleware after auth middleware (to ensure req.user is available)
    // Try different patterns in order of preference
    let middlewareAdded = false;

    if (content.includes('app.use(session(')) {
      // Add after session middleware
      content = content.replace(
        /app\.use\(session\([^)]+\)\);?/,
        match => match + '\n\n// Apogee redirect for unauthenticated users\napp.use(apogeeRedirect);'
      );
      middlewareAdded = true;
    } else if (content.includes('app.use(passport.session())')) {
      // Add after passport session
      content = content.replace(
        /app\.use\(passport\.session\(\)\);?/,
        match => match + '\n\n// Apogee redirect for unauthenticated users\napp.use(apogeeRedirect);'
      );
      middlewareAdded = true;
    } else if (content.includes('app.use(passport.initialize())')) {
      // Add after passport initialization (for stateless JWT auth like LibreChat)
      content = content.replace(
        /app\.use\(passport\.initialize\(\)\);?/,
        match => match + '\n\n// Apogee redirect for unauthenticated users\napp.use(apogeeRedirect);'
      );
      middlewareAdded = true;
    } else if (content.includes("app.use('/api")) {
      // Fallback: add before API routes
      content = content.replace(
        /app\.use\(['"]\/api/,
        '// Apogee redirect for unauthenticated users\napp.use(apogeeRedirect);\n\napp.use(\'/api'
      );
      middlewareAdded = true;
    }

    if (!middlewareAdded) {
      console.log('[Apogee Patch] Warning: Could not find suitable location for redirect middleware');
    }

    fs.writeFileSync(filePath, content);
    console.log('[Apogee Patch] Successfully added redirect middleware');
    return;
  }

  console.log('[Apogee Patch] Could not find app file to patch for redirect middleware');
}

// Run the patches
async function runPatches() {
  await patchRoutes();
  await patchRedirectMiddleware();
}

runPatches().catch(err => {
  console.error('[Apogee Patch] Fatal error:', err);
  // Don't exit with error - let the server start anyway
});
