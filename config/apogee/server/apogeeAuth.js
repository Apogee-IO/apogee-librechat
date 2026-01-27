/**
 * Apogee SSO Authentication Route for LibreChat
 *
 * This route handles JWT-based SSO from the Apogee dashboard.
 * Flow: Apogee dashboard signs a JWT → user redirected here → JWT verified → user logged in
 */

const express = require('express');
const { jwtVerify, importSPKI } = require('jose');

const router = express.Router();

// JWT verification settings
const JWT_ISSUER = 'https://apog.ai';
const JWT_AUDIENCE = 'https://chat.apog.ai';

let publicKey = null;

/**
 * Import and cache the public key
 */
async function getPublicKey() {
  if (publicKey) return publicKey;

  const pemKey = process.env.APOGEE_JWT_PUBLIC_KEY;
  if (!pemKey) {
    throw new Error('APOGEE_JWT_PUBLIC_KEY environment variable is not set');
  }

  publicKey = await importSPKI(pemKey, 'RS256');
  return publicKey;
}

/**
 * GET /auth/apogee
 * Handles SSO callback from Apogee dashboard
 */
router.get('/apogee', async (req, res) => {
  const { token, return_to } = req.query;

  if (!token) {
    console.error('[Apogee Auth] Missing token');
    return res.redirect('/login?error=missing_token');
  }

  try {
    // Verify JWT signature and claims
    const key = await getPublicKey();
    const { payload } = await jwtVerify(token, key, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

    // Extract user data from JWT
    const { sub: apogeeUserId, email, name } = payload;

    if (!email) {
      console.error('[Apogee Auth] JWT missing email claim');
      return res.redirect('/login?error=invalid_token');
    }

    console.log(`[Apogee Auth] Valid JWT for user: ${email}`);

    // Import LibreChat's models and auth utilities
    // LibreChat uses ~/models which exports findUser, createUser, etc.
    const { findUser, createUser, updateUser } = require('~/models');
    const { setAuthTokens } = require('~/server/services/AuthService');

    // Find or create user in MongoDB
    const normalizedEmail = email.toLowerCase();
    let user = await findUser({ email: normalizedEmail });

    if (!user) {
      // Create new user using LibreChat's createUser function
      const userData = {
        email: normalizedEmail,
        name: name || email.split('@')[0],
        username: normalizedEmail,
        provider: 'apogee',
        providerId: apogeeUserId,
        emailVerified: true,
        // Generate a random password (required by LibreChat but won't be used for SSO)
        password: require('crypto').randomBytes(32).toString('hex'),
      };

      user = await createUser(userData, true, true); // skipPasswordHash=true, returnUser=true
      console.log(`[Apogee Auth] Created new user: ${email}`);
    } else {
      // Update provider info if user exists but was created differently
      if (user.provider !== 'apogee') {
        await updateUser(user._id, {
          provider: 'apogee',
          providerId: apogeeUserId,
        });
      }
      console.log(`[Apogee Auth] Existing user logged in: ${email}`);
    }

    // Use LibreChat's built-in auth token mechanism
    await setAuthTokens(user._id, res);

    // Redirect to return_to path or chat home
    // Only allow relative paths for security
    let redirectPath = '/';
    if (return_to && typeof return_to === 'string' && return_to.startsWith('/')) {
      redirectPath = return_to;
    }
    console.log(`[Apogee Auth] Redirecting to: ${redirectPath}`);
    res.redirect(redirectPath);
  } catch (err) {
    console.error('[Apogee Auth] Error:', err.message);

    // Specific error handling
    if (err.code === 'ERR_JWT_EXPIRED') {
      return res.redirect('/login?error=token_expired');
    }
    if (err.code === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED') {
      return res.redirect('/login?error=invalid_signature');
    }

    res.redirect('/login?error=auth_failed');
  }
});

/**
 * GET /auth/apogee-test
 * Test login endpoint - bypasses SSO for testing session creation
 * Only available when APOGEE_TEST_LOGIN_SECRET is set
 */
router.get('/apogee-test', async (req, res) => {
  const testSecret = process.env.APOGEE_TEST_LOGIN_SECRET;
  if (!testSecret) {
    return res.status(404).json({ error: 'Not found' });
  }

  const { secret, email: testEmail } = req.query;
  if (secret !== testSecret) {
    return res.status(401).json({ error: 'Invalid secret' });
  }

  const email = testEmail || 'test@apogee-test.com';
  console.log(`[Apogee Test Auth] Test login for: ${email}`);

  try {
    const { findUser, createUser } = require('~/models');
    const { setAuthTokens } = require('~/server/services/AuthService');

    const normalizedEmail = email.toLowerCase();
    let user = await findUser({ email: normalizedEmail });

    if (!user) {
      const userData = {
        email: normalizedEmail,
        name: email.split('@')[0],
        username: normalizedEmail,
        provider: 'apogee-test',
        providerId: `test-${Date.now()}`,
        emailVerified: true,
        password: require('crypto').randomBytes(32).toString('hex'),
      };

      user = await createUser(userData, true, true);
      console.log(`[Apogee Test Auth] Created test user: ${email}`);
    } else {
      console.log(`[Apogee Test Auth] Found existing user: ${email}`);
    }

    console.log('[Apogee Test Auth] Calling setAuthTokens for user:', user._id.toString());
    try {
      await setAuthTokens(user._id, res);
      console.log('[Apogee Test Auth] setAuthTokens completed successfully');
    } catch (tokenErr) {
      console.error('[Apogee Test Auth] setAuthTokens FAILED:', tokenErr.message, tokenErr.stack);
      return res.status(500).json({ error: 'Session creation failed', details: tokenErr.message });
    }

    const setCookieHeaders = res.getHeaders()['set-cookie'];
    console.log('[Apogee Test Auth] Set-Cookie headers:', JSON.stringify(setCookieHeaders, null, 2));

    // Verify session was saved by reading it back
    const { findSession } = require('~/models');
    const refreshCookie = setCookieHeaders?.find(c => c.startsWith('refreshToken='));
    let sessionVerified = false;
    let sessionId = null;
    if (refreshCookie) {
      const tokenMatch = refreshCookie.match(/refreshToken=([^;]+)/);
      if (tokenMatch) {
        const token = tokenMatch[1];
        // Decode JWT to get sessionId
        const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
        sessionId = decoded.sessionId;
        console.log('[Apogee Test Auth] Session ID from token:', sessionId);

        // Try to find the session in DB
        const session = await findSession({ sessionId });
        sessionVerified = !!session;
        console.log('[Apogee Test Auth] Session found in DB:', session ? 'YES' : 'NO');
        if (!session) {
          console.error('[Apogee Test Auth] CRITICAL: Session was not saved to database!');
        }
      }
    }

    // Return JSON response for test verification
    res.json({
      success: true,
      userId: user._id.toString(),
      email: user.email,
      sessionId,
      sessionVerified,
      cookies: setCookieHeaders ? setCookieHeaders.map(c => c.split(';')[0]) : [],
    });
  } catch (err) {
    console.error('[Apogee Test Auth] Error:', err.message, err.stack);
    res.status(500).json({ error: 'Test auth failed', details: err.message });
  }
});

module.exports = router;
