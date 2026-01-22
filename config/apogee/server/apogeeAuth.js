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

module.exports = router;
