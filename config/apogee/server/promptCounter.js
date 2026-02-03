/**
 * Prompt Counter Middleware for LibreChat
 *
 * Intercepts chat requests to track and limit anonymous user prompts.
 * Works with the Apogee dashboard API to check and increment usage.
 *
 * Anonymous users are identified by their email pattern: anon-{sessionId}@anonymous.apog.ai
 */

const APOGEE_API_URL = process.env.APOGEE_DASHBOARD_URL || 'https://apog.ai';

/**
 * Check if a user is anonymous based on their email pattern.
 * @param {object} user - The user object from the request
 * @returns {boolean}
 */
function isAnonymousUser(user) {
  if (!user?.email) return false;
  return user.email.includes('@anonymous.apog.ai');
}

/**
 * Extract the session ID from an anonymous user's email.
 * Email format: anon-{sessionId}@anonymous.apog.ai
 * @param {string} email - The user's email
 * @returns {string|null}
 */
function getSessionIdFromEmail(email) {
  const match = email.match(/^anon-([^@]+)@anonymous\.apog\.ai$/);
  return match ? match[1] : null;
}

/**
 * Check if the anonymous user can send a prompt and increment their usage.
 * @param {string} sessionId - The anonymous session ID
 * @returns {Promise<{allowed: boolean, promptsUsed: number, promptLimit: number, signupUrl: string}>}
 */
async function checkAndIncrementPrompt(sessionId) {
  try {
    const response = await fetch(`${APOGEE_API_URL}/api/anonymous/check-prompt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ sessionId }),
    });

    if (!response.ok) {
      console.error('[Apogee Prompt Counter] API response not OK:', response.status);
      // Fail open - allow prompt if API is down
      return { allowed: true, promptsUsed: 0, promptLimit: 5, signupUrl: `${APOGEE_API_URL}/auth/login?signup=true` };
    }

    return await response.json();
  } catch (err) {
    console.error('[Apogee Prompt Counter] API error:', err.message);
    // Fail open - allow prompt if API is unreachable
    return { allowed: true, promptsUsed: 0, promptLimit: 5, signupUrl: `${APOGEE_API_URL}/auth/login?signup=true` };
  }
}

/**
 * Express middleware to intercept chat requests and check anonymous prompts.
 * If the user has reached their limit, returns a 429 response.
 *
 * @param {object} req - Express request object
 * @param {object} res - Express response object
 * @param {function} next - Next middleware function
 */
async function promptCounterMiddleware(req, res, next) {
  // Only apply to chat/ask endpoints
  const path = req.path || req.url || '';
  const isChatEndpoint = path.includes('/ask') ||
                         path.includes('/chat') ||
                         path.includes('/messages');

  if (!isChatEndpoint) {
    return next();
  }

  // Only apply to POST requests (actual prompts)
  if (req.method !== 'POST') {
    return next();
  }

  const user = req.user;

  // Skip for non-anonymous users (registered users)
  if (!isAnonymousUser(user)) {
    return next();
  }

  const sessionId = getSessionIdFromEmail(user.email);
  if (!sessionId) {
    console.warn('[Apogee Prompt Counter] Could not extract session ID from email:', user.email);
    return next();
  }

  console.log(`[Apogee Prompt Counter] Checking prompt limit for session: ${sessionId.substring(0, 8)}...`);

  // Check prompt limit before processing
  const result = await checkAndIncrementPrompt(sessionId);

  if (!result.allowed) {
    console.log(`[Apogee Prompt Counter] Limit reached for session: ${sessionId.substring(0, 8)}... (${result.promptsUsed}/${result.promptLimit})`);

    // Return structured error that frontend can handle
    return res.status(429).json({
      error: 'PROMPT_LIMIT_REACHED',
      message: "You've used your 5 free prompts. Sign up to continue.",
      promptsUsed: result.promptsUsed,
      promptLimit: result.promptLimit,
      signupUrl: result.signupUrl,
    });
  }

  console.log(`[Apogee Prompt Counter] Prompt allowed for session: ${sessionId.substring(0, 8)}... (${result.promptsUsed}/${result.promptLimit})`);

  // Continue to the actual chat handler
  return next();
}

/**
 * Factory function to create wrapped route handler with prompt counting.
 * Use this to wrap individual route handlers.
 *
 * @param {function} originalHandler - The original route handler
 * @returns {function} - Wrapped handler with prompt counting
 */
function createPromptCounterMiddleware(originalHandler) {
  return async (req, res, next) => {
    const user = req.user;

    // Skip for non-anonymous users
    if (!isAnonymousUser(user)) {
      return originalHandler(req, res, next);
    }

    const sessionId = getSessionIdFromEmail(user.email);
    if (!sessionId) {
      return originalHandler(req, res, next);
    }

    // Check prompt limit before processing
    const result = await checkAndIncrementPrompt(sessionId);

    if (!result.allowed) {
      return res.status(429).json({
        error: 'PROMPT_LIMIT_REACHED',
        message: "You've used your 5 free prompts. Sign up to continue.",
        promptsUsed: result.promptsUsed,
        promptLimit: result.promptLimit,
        signupUrl: result.signupUrl,
      });
    }

    // Continue to original handler
    return originalHandler(req, res, next);
  };
}

module.exports = {
  promptCounterMiddleware,
  createPromptCounterMiddleware,
  isAnonymousUser,
  getSessionIdFromEmail,
  checkAndIncrementPrompt,
};
