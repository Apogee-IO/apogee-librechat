/**
 * Anonymous User Indicator for LibreChat
 *
 * Injects a client-side script into LibreChat's frontend that:
 * 1. Shows login/signup buttons in the top right corner (ChatGPT-style)
 * 2. Handles the 429 PROMPT_LIMIT_REACHED error with a signup modal
 * 3. Provides email-based signup directly in the modal
 */

const fs = require('fs');
const path = require('path');

// Internal URL for server-to-server communication (Docker networking)
const DASHBOARD_URL_INTERNAL = process.env.APOGEE_DASHBOARD_URL || 'https://apog.ai';
// External URL for browser navigation - derive from internal URL
// In production: https://apog.ai stays the same
// In development: http://web:3000 becomes http://localhost:3000
const DASHBOARD_URL_EXTERNAL = DASHBOARD_URL_INTERNAL
  .replace('http://web:', 'http://localhost:')
  .replace('https://web:', 'https://localhost:');

/**
 * Client-side script to be injected into LibreChat.
 * This runs in the browser and handles anonymous user UI.
 */
const ANONYMOUS_INDICATOR_SCRIPT = `
<!-- APOGEE_ANONYMOUS_INDICATOR -->
<script>
(function() {
  'use strict';

  const DASHBOARD_URL = '${DASHBOARD_URL_EXTERNAL}';

  // Check if current user is anonymous
  // LibreChat doesn't always store user in localStorage, so we check multiple sources
  function isAnonymousUser() {
    try {
      // Method 1: Check localStorage
      const userStr = localStorage.getItem('user');
      if (userStr) {
        const user = JSON.parse(userStr);
        if (user.email?.includes('@anonymous.apog.ai')) return true;
      }

      // Method 2: Check for "Guest User" in the account settings area
      // This appears in the sidebar when logged in as anonymous
      const accountBtn = document.querySelector('[aria-label*="Account"], [data-testid="user-menu"]');
      if (accountBtn && accountBtn.textContent.includes('Guest User')) return true;

      // Method 3: Check for Guest User text in the page
      const pageText = document.body.innerText;
      if (pageText.includes('Guest User') && !pageText.includes('Sign in')) return true;

      return false;
    } catch (e) {
      return false;
    }
  }

  // Inject styles once
  function injectStyles() {
    if (document.getElementById('apogee-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'apogee-styles';
    styles.textContent = \`
      /* Auth buttons container - top right */
      #apogee-auth-buttons {
        position: fixed;
        top: 12px;
        right: 16px;
        z-index: 99999;
        display: flex;
        gap: 8px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }

      #apogee-auth-buttons .btn {
        padding: 8px 16px;
        border-radius: 9999px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        text-decoration: none;
        transition: all 0.15s ease;
        border: none;
      }

      #apogee-auth-buttons .btn-login {
        background: transparent;
        color: #374151;
        border: 1px solid #d1d5db;
      }

      #apogee-auth-buttons .btn-login:hover {
        background: #f3f4f6;
        border-color: #9ca3af;
      }

      #apogee-auth-buttons .btn-signup {
        background: #0f766e;
        color: white;
      }

      #apogee-auth-buttons .btn-signup:hover {
        background: #115e59;
      }

      /* Dark mode support */
      @media (prefers-color-scheme: dark) {
        #apogee-auth-buttons .btn-login {
          color: #e5e7eb;
          border-color: #4b5563;
        }
        #apogee-auth-buttons .btn-login:hover {
          background: #374151;
          border-color: #6b7280;
        }
      }

      /* LibreChat dark mode detection */
      .dark #apogee-auth-buttons .btn-login,
      [data-theme="dark"] #apogee-auth-buttons .btn-login {
        color: #e5e7eb;
        border-color: #4b5563;
      }

      .dark #apogee-auth-buttons .btn-login:hover,
      [data-theme="dark"] #apogee-auth-buttons .btn-login:hover {
        background: #374151;
        border-color: #6b7280;
      }

      /* Modal styles */
      #apogee-modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 999999;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        animation: apogee-fade-in 0.2s ease;
      }

      @keyframes apogee-fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      @keyframes apogee-slide-up {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }

      #apogee-modal-overlay .modal-content {
        background: #0f172a;
        border-radius: 16px;
        padding: 40px;
        max-width: 420px;
        width: 90%;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        animation: apogee-slide-up 0.3s ease;
        position: relative;
      }

      #apogee-modal-overlay .close-btn {
        position: absolute;
        top: 16px;
        right: 16px;
        background: transparent;
        border: none;
        color: #64748b;
        cursor: pointer;
        padding: 8px;
        border-radius: 8px;
        transition: all 0.15s ease;
      }

      #apogee-modal-overlay .close-btn:hover {
        background: #1e293b;
        color: #94a3b8;
      }

      #apogee-modal-overlay .modal-icon {
        width: 64px;
        height: 64px;
        background: rgba(15, 118, 110, 0.2);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 24px;
      }

      #apogee-modal-overlay .modal-icon svg {
        width: 32px;
        height: 32px;
        color: #0f766e;
      }

      #apogee-modal-overlay h2 {
        margin: 0 0 8px;
        font-size: 24px;
        font-weight: 600;
        color: #f8fafc;
        text-align: center;
      }

      #apogee-modal-overlay .subtitle {
        margin: 0 0 32px;
        color: #94a3b8;
        font-size: 15px;
        text-align: center;
        line-height: 1.5;
      }

      #apogee-modal-overlay .email-form {
        margin-bottom: 24px;
      }

      #apogee-modal-overlay .email-input {
        width: 100%;
        padding: 14px 16px;
        background: #1e293b;
        border: 1px solid #334155;
        border-radius: 10px;
        color: #f8fafc;
        font-size: 15px;
        margin-bottom: 12px;
        box-sizing: border-box;
        transition: border-color 0.15s ease;
      }

      #apogee-modal-overlay .email-input:focus {
        outline: none;
        border-color: #0f766e;
        box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.2);
      }

      #apogee-modal-overlay .email-input::placeholder {
        color: #64748b;
      }

      #apogee-modal-overlay .submit-btn {
        width: 100%;
        padding: 14px 24px;
        background: #0f766e;
        color: white;
        border: none;
        border-radius: 10px;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s ease;
      }

      #apogee-modal-overlay .submit-btn:hover:not(:disabled) {
        background: #115e59;
      }

      #apogee-modal-overlay .submit-btn:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      #apogee-modal-overlay .error-message {
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.3);
        color: #fca5a5;
        padding: 12px;
        border-radius: 8px;
        font-size: 14px;
        margin-bottom: 12px;
        display: none;
      }

      #apogee-modal-overlay .success-message {
        text-align: center;
        padding: 20px 0;
      }

      #apogee-modal-overlay .success-icon {
        width: 64px;
        height: 64px;
        background: rgba(15, 118, 110, 0.2);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 16px;
      }

      #apogee-modal-overlay .divider {
        display: flex;
        align-items: center;
        margin: 20px 0;
        color: #64748b;
        font-size: 13px;
      }

      #apogee-modal-overlay .divider::before,
      #apogee-modal-overlay .divider::after {
        content: '';
        flex: 1;
        height: 1px;
        background: #334155;
      }

      #apogee-modal-overlay .divider span {
        padding: 0 16px;
      }

      #apogee-modal-overlay .login-link {
        display: block;
        text-align: center;
        color: #0f766e;
        font-size: 14px;
        text-decoration: none;
        padding: 12px;
        border-radius: 8px;
        transition: background 0.15s ease;
      }

      #apogee-modal-overlay .login-link:hover {
        background: rgba(15, 118, 110, 0.1);
      }

      #apogee-modal-overlay .fine-print {
        margin-top: 24px;
        text-align: center;
        color: #64748b;
        font-size: 12px;
        line-height: 1.5;
      }

      #apogee-modal-overlay .fine-print a {
        color: #94a3b8;
        text-decoration: underline;
      }
    \`;
    document.head.appendChild(styles);
  }

  // Create and inject the auth buttons (ChatGPT-style)
  function injectAuthButtons() {
    if (!isAnonymousUser()) return;
    if (document.getElementById('apogee-auth-buttons')) return;

    const container = document.createElement('div');
    container.id = 'apogee-auth-buttons';
    container.innerHTML = \`
      <a href="\${DASHBOARD_URL}/auth/login" class="btn btn-login">Log in</a>
      <a href="\${DASHBOARD_URL}/auth/login?signup=true" class="btn btn-signup">Sign up for free</a>
    \`;

    document.body.appendChild(container);
  }

  // Handle 429 PROMPT_LIMIT_REACHED errors
  function setupErrorInterceptor() {
    // Method 1: Intercept fetch for direct API calls
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
      const response = await originalFetch.apply(this, args);

      if (response.status === 429) {
        try {
          const clonedResponse = response.clone();
          const data = await clonedResponse.json();

          if (data.error === 'PROMPT_LIMIT_REACHED') {
            showSignupModal(data);
            // Return a modified response that won't cause further errors
            return new Response(JSON.stringify({
              text: "You've reached your free prompt limit. Please sign up to continue using Apogee.",
              finish_reason: 'limit_reached'
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          }
        } catch (e) {
          // Not JSON or other error, pass through
        }
      }

      return response;
    };

    // Method 2: Watch for error alerts in the DOM (for SSE responses)
    // LibreChat shows errors in alert elements with the error message text
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check for alert elements or elements containing PROMPT_LIMIT_REACHED
            const alerts = node.querySelectorAll ?
              [node, ...node.querySelectorAll('[role="alert"], [class*="error"], [class*="Error"]')] :
              [node];

            for (const alert of alerts) {
              const text = alert.textContent || '';
              if (text.includes('PROMPT_LIMIT_REACHED')) {
                // Parse the error data from the alert text
                try {
                  const match = text.match(/\\{[^}]+PROMPT_LIMIT_REACHED[^}]*\\}/);
                  if (match) {
                    const data = JSON.parse(match[0]);
                    // Clear the error message from the alert
                    const alertEl = alert.closest('[role="alert"]') || alert;
                    if (alertEl) {
                      alertEl.innerHTML = '<p style="color: #94a3b8;">Checking your account status...</p>';
                    }
                    // Show our signup modal
                    showSignupModal(data);
                    return;
                  }
                } catch (e) {
                  // Could not parse, show modal anyway
                  showSignupModal({});
                }
              }
            }
          }
        }
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  // Legacy fetch interceptor continuation (for backwards compatibility)
  function setupLegacyFetchInterceptor() {
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
      const response = await originalFetch.apply(this, args);

      if (response.status === 429) {
        try {
          const clonedResponse = response.clone();
          const data = await clonedResponse.json();

          if (data.error === 'PROMPT_LIMIT_REACHED') {
            showSignupModal(data);
            return new Response(JSON.stringify({
              text: "You've reached your free prompt limit. Please sign up to continue using Apogee.",
              finish_reason: 'limit_reached'
            }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' }
            });
          }
        } catch (e) {
          // Not JSON or other error, pass through
        }
      }

      return response;
    };
  }

  // Show signup modal (with email form)
  function showSignupModal(data = {}) {
    // Remove any existing modal
    const existing = document.getElementById('apogee-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'apogee-modal-overlay';
    overlay.innerHTML = \`
      <div class="modal-content">
        <button class="close-btn" onclick="document.getElementById('apogee-modal-overlay').remove();" aria-label="Close">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>

        <div id="apogee-form-view">
          <div class="modal-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
            </svg>
          </div>

          <h2>You've used your 5 free prompts</h2>
          <p class="subtitle">Enter your work email to sign up and continue the conversation. No credit card required.</p>

          <div class="email-form">
            <div id="apogee-error" class="error-message"></div>
            <input
              type="email"
              id="apogee-email-input"
              class="email-input"
              placeholder="you@workemail.com"
              autocomplete="email"
            />
            <button id="apogee-submit-btn" class="submit-btn">Continue with Email</button>
          </div>

          <div class="divider"><span>Already have an account?</span></div>

          <a href="\${DASHBOARD_URL}/auth/login" class="login-link">Log in</a>

          <p class="fine-print">
            By signing up, you agree to our
            <a href="\${DASHBOARD_URL}/terms" target="_blank">Terms of Service</a>
            and
            <a href="\${DASHBOARD_URL}/privacy" target="_blank">Privacy Policy</a>.
          </p>
        </div>

        <div id="apogee-success-view" style="display: none;">
          <div class="success-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0f766e" stroke-width="2">
              <rect x="3" y="5" width="18" height="14" rx="2"/>
              <polyline points="3 7 12 13 21 7"/>
            </svg>
          </div>
          <h2>Check your email</h2>
          <p class="subtitle" id="apogee-email-sent-to">We sent a sign-in link to your email.</p>
          <a href="\${DASHBOARD_URL}/auth/login" class="login-link" style="margin-top: 24px;">Open Login Page</a>
        </div>
      </div>
    \`;

    document.body.appendChild(overlay);

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        overlay.remove();
      }
    });

    // Setup form submission
    const emailInput = document.getElementById('apogee-email-input');
    const submitBtn = document.getElementById('apogee-submit-btn');
    const errorDiv = document.getElementById('apogee-error');

    emailInput.focus();

    // Handle Enter key
    emailInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        submitBtn.click();
      }
    });

    submitBtn.addEventListener('click', async () => {
      const email = emailInput.value.trim();

      // Basic validation
      if (!email || !email.includes('@')) {
        errorDiv.textContent = 'Please enter a valid email address.';
        errorDiv.style.display = 'block';
        return;
      }

      errorDiv.style.display = 'none';
      submitBtn.disabled = true;
      submitBtn.textContent = 'Sending...';

      try {
        const response = await fetch(\`\${DASHBOARD_URL}/api/auth/login\`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            returnTo: window.location.href
          })
        });

        const result = await response.json();

        if (response.ok) {
          // Show success view
          document.getElementById('apogee-form-view').style.display = 'none';
          document.getElementById('apogee-success-view').style.display = 'block';
          document.getElementById('apogee-email-sent-to').textContent = \`We sent a sign-in code to \${email}\`;
        } else {
          errorDiv.textContent = result.message || 'Failed to send code. Please try again.';
          errorDiv.style.display = 'block';
          submitBtn.disabled = false;
          submitBtn.textContent = 'Continue with Email';
        }
      } catch (err) {
        errorDiv.textContent = 'Network error. Please try again.';
        errorDiv.style.display = 'block';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Continue with Email';
      }
    });
  }

  // Initialize when DOM is ready
  function init() {
    injectStyles();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        injectAuthButtons();
        setupErrorInterceptor();
      });
    } else {
      injectAuthButtons();
      setupErrorInterceptor();
    }

    // Check periodically in case of SPA navigation
    setInterval(() => {
      if (isAnonymousUser() && !document.getElementById('apogee-auth-buttons')) {
        injectAuthButtons();
      }
    }, 2000);
  }

  // Expose showSignupModal globally for testing
  window.apogeeShowSignupModal = showSignupModal;

  init();
})();
</script>
`;

/**
 * Inject the anonymous indicator script into LibreChat's index.html.
 * This is called during the patching phase at startup.
 */
function injectAnonymousIndicator() {
  const possibleIndexFiles = [
    '/app/client/dist/index.html',
    '/app/client/public/index.html',
    '/app/dist/index.html',
    '/app/public/index.html',
  ];

  const INDICATOR_MARKER = '<!-- APOGEE_ANONYMOUS_INDICATOR -->';

  for (const indexPath of possibleIndexFiles) {
    if (!fs.existsSync(indexPath)) {
      continue;
    }

    let content = fs.readFileSync(indexPath, 'utf-8');

    // Check if already injected
    if (content.includes(INDICATOR_MARKER)) {
      console.log('[Apogee Anonymous Indicator] Already injected into', indexPath);
      return true;
    }

    console.log('[Apogee Anonymous Indicator] Injecting into', indexPath);

    // Inject before </body>
    if (content.includes('</body>')) {
      content = content.replace('</body>', ANONYMOUS_INDICATOR_SCRIPT + '\n</body>');
    } else if (content.includes('</html>')) {
      // Fallback: inject before </html>
      content = content.replace('</html>', ANONYMOUS_INDICATOR_SCRIPT + '\n</html>');
    } else {
      // Last resort: append to end
      content += '\n' + ANONYMOUS_INDICATOR_SCRIPT;
    }

    fs.writeFileSync(indexPath, content);
    console.log('[Apogee Anonymous Indicator] Successfully injected');
    return true;
  }

  console.warn('[Apogee Anonymous Indicator] Could not find index.html to inject into');
  return false;
}

module.exports = {
  injectAnonymousIndicator,
  ANONYMOUS_INDICATOR_SCRIPT,
};
