/**
 * Tests for LibreChat Prompt Counter Middleware
 *
 * These tests verify:
 * - Anonymous user detection
 * - Session ID extraction
 * - Middleware behavior
 * - Error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fetch globally
global.fetch = vi.fn();

// Import CJS module using createRequire
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  isAnonymousUser,
  getSessionIdFromEmail,
  checkAndIncrementPrompt,
  promptCounterMiddleware,
} = require('./promptCounter');

describe('isAnonymousUser', () => {
  it('returns true for anonymous user email', () => {
    const user = { email: 'anon-abc12345@anonymous.apog.ai' };
    expect(isAnonymousUser(user)).toBe(true);
  });

  it('returns false for regular user email', () => {
    const user = { email: 'john@example.com' };
    expect(isAnonymousUser(user)).toBe(false);
  });

  it('returns false for null user', () => {
    expect(isAnonymousUser(null)).toBe(false);
  });

  it('returns false for undefined user', () => {
    expect(isAnonymousUser(undefined)).toBe(false);
  });

  it('returns false for user without email', () => {
    const user = { name: 'Test User' };
    expect(isAnonymousUser(user)).toBe(false);
  });

  it('returns false for user with null email', () => {
    const user = { email: null };
    expect(isAnonymousUser(user)).toBe(false);
  });

  it('returns false for similar but incorrect domain', () => {
    const user = { email: 'anon-123@anonymous.example.com' };
    expect(isAnonymousUser(user)).toBe(false);
  });

  it('returns false for partial domain match', () => {
    const user = { email: 'test@apog.ai' };
    expect(isAnonymousUser(user)).toBe(false);
  });
});

describe('getSessionIdFromEmail', () => {
  it('extracts session ID from anonymous email', () => {
    const email = 'anon-abc12345@anonymous.apog.ai';
    expect(getSessionIdFromEmail(email)).toBe('abc12345');
  });

  it('extracts full UUID session ID', () => {
    const email = 'anon-550e8400-e29b-41d4-a716-446655440000@anonymous.apog.ai';
    expect(getSessionIdFromEmail(email)).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('extracts short session ID (8 chars)', () => {
    const email = 'anon-a1b2c3d4@anonymous.apog.ai';
    expect(getSessionIdFromEmail(email)).toBe('a1b2c3d4');
  });

  it('returns null for non-anonymous email', () => {
    const email = 'john@example.com';
    expect(getSessionIdFromEmail(email)).toBeNull();
  });

  it('returns null for malformed anonymous email', () => {
    const email = 'anon@anonymous.apog.ai'; // missing session ID
    expect(getSessionIdFromEmail(email)).toBeNull();
  });

  it('returns null for different domain', () => {
    const email = 'anon-123@other.domain.com';
    expect(getSessionIdFromEmail(email)).toBeNull();
  });
});

describe('checkAndIncrementPrompt', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.APOGEE_DASHBOARD_URL = 'https://apog.ai';
  });

  afterEach(() => {
    delete process.env.APOGEE_DASHBOARD_URL;
  });

  it('returns allowed=true when API returns allowed', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        allowed: true,
        promptsUsed: 2,
        promptLimit: 5,
        signupUrl: 'https://apog.ai/auth/login?signup=true',
      }),
    });

    const result = await checkAndIncrementPrompt('session-123');

    expect(result.allowed).toBe(true);
    expect(result.promptsUsed).toBe(2);
    expect(result.promptLimit).toBe(5);
  });

  it('returns allowed=false when limit reached', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        allowed: false,
        promptsUsed: 5,
        promptLimit: 5,
        signupUrl: 'https://apog.ai/auth/login?signup=true',
      }),
    });

    const result = await checkAndIncrementPrompt('session-123');

    expect(result.allowed).toBe(false);
    expect(result.promptsUsed).toBe(5);
    expect(result.promptLimit).toBe(5);
  });

  it('calls correct API endpoint', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ allowed: true, promptsUsed: 1, promptLimit: 5 }),
    });

    await checkAndIncrementPrompt('session-abc');

    expect(global.fetch).toHaveBeenCalledWith(
      'https://apog.ai/api/anonymous/check-prompt',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: 'session-abc' }),
      })
    );
  });

  it('fails open when API returns non-200', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const result = await checkAndIncrementPrompt('session-123');

    expect(result.allowed).toBe(true);
    expect(result.promptsUsed).toBe(0);
    expect(result.promptLimit).toBe(5);
  });

  it('fails open when fetch throws', async () => {
    global.fetch.mockRejectedValueOnce(new Error('Network error'));

    const result = await checkAndIncrementPrompt('session-123');

    expect(result.allowed).toBe(true);
    expect(result.promptsUsed).toBe(0);
    expect(result.promptLimit).toBe(5);
  });
});

describe('promptCounterMiddleware', () => {
  let mockReq;
  let mockRes;
  let mockNext;

  beforeEach(() => {
    vi.resetAllMocks();
    process.env.APOGEE_DASHBOARD_URL = 'https://apog.ai';

    mockReq = {
      path: '/api/ask',
      method: 'POST',
      user: null,
    };

    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };

    mockNext = vi.fn();
  });

  afterEach(() => {
    delete process.env.APOGEE_DASHBOARD_URL;
  });

  it('calls next for non-chat endpoints', async () => {
    mockReq.path = '/api/users';
    mockReq.method = 'GET';

    await promptCounterMiddleware(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  it('calls next for non-POST requests', async () => {
    mockReq.method = 'GET';

    await promptCounterMiddleware(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalled();
  });

  it('calls next for non-anonymous users', async () => {
    mockReq.user = { email: 'john@example.com' };

    await promptCounterMiddleware(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('calls next when prompt is allowed', async () => {
    mockReq.user = { email: 'anon-session123@anonymous.apog.ai' };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        allowed: true,
        promptsUsed: 2,
        promptLimit: 5,
      }),
    });

    await promptCounterMiddleware(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
  });

  it('returns 429 when prompt limit reached', async () => {
    mockReq.user = { email: 'anon-session123@anonymous.apog.ai' };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        allowed: false,
        promptsUsed: 5,
        promptLimit: 5,
        signupUrl: 'https://apog.ai/auth/login?signup=true',
      }),
    });

    await promptCounterMiddleware(mockReq, mockRes, mockNext);

    expect(mockNext).not.toHaveBeenCalled();
    expect(mockRes.status).toHaveBeenCalledWith(429);
    expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'PROMPT_LIMIT_REACHED',
      promptsUsed: 5,
      promptLimit: 5,
    }));
  });

  it('applies to /chat endpoint', async () => {
    mockReq.path = '/api/chat/completions';
    mockReq.user = { email: 'anon-session123@anonymous.apog.ai' };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ allowed: true, promptsUsed: 1, promptLimit: 5 }),
    });

    await promptCounterMiddleware(mockReq, mockRes, mockNext);

    expect(global.fetch).toHaveBeenCalled();
    expect(mockNext).toHaveBeenCalled();
  });

  it('applies to /messages endpoint', async () => {
    mockReq.path = '/api/messages';
    mockReq.user = { email: 'anon-session123@anonymous.apog.ai' };

    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ allowed: true, promptsUsed: 1, promptLimit: 5 }),
    });

    await promptCounterMiddleware(mockReq, mockRes, mockNext);

    expect(global.fetch).toHaveBeenCalled();
    expect(mockNext).toHaveBeenCalled();
  });

  it('calls next when session ID cannot be extracted', async () => {
    mockReq.user = { email: 'anon@anonymous.apog.ai' }; // Invalid format

    await promptCounterMiddleware(mockReq, mockRes, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
