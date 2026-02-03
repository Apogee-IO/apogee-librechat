/**
 * Anonymous User Indicator for LibreChat
 *
 * Injects a client-side script into LibreChat's frontend that:
 * 1. Shows a signup banner for anonymous users
 * 2. Handles the 429 PROMPT_LIMIT_REACHED error gracefully
 * 3. Provides visual indication of remaining prompts
 */

const fs = require('fs');
const path = require('path');

const DASHBOARD_URL = process.env.APOGEE_DASHBOARD_URL || 'https://apog.ai';

/**
 * Client-side script to be injected into LibreChat.
 * This runs in the browser and handles anonymous user UI.
 */
const ANONYMOUS_INDICATOR_SCRIPT = `
<!-- APOGEE_ANONYMOUS_INDICATOR -->
<script>
(function() {
  'use strict';

  const DASHBOARD_URL = '${DASHBOARD_URL}';

  // Check if current user is anonymous
  function isAnonymousUser() {
    try {
      const userStr = localStorage.getItem('user');
      if (!userStr) return false;
      const user = JSON.parse(userStr);
      return user.email?.includes('@anonymous.apog.ai');
    } catch (e) {
      return false;
    }
  }

  // Create and inject the anonymous user banner
  function injectBanner() {
    if (!isAnonymousUser()) return;

    // Check if banner already exists
    if (document.getElementById('apogee-anon-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'apogee-anon-banner';
    banner.innerHTML = \`
      <style>
        #apogee-anon-banner {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          background: linear-gradient(90deg, #3b82f6, #6366f1);
          color: white;
          padding: 10px 16px;
          text-align: center;
          z-index: 99999;
          font-size: 14px;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        #apogee-anon-banner a {
          color: white;
          text-decoration: underline;
          font-weight: 600;
          margin-left: 4px;
        }
        #apogee-anon-banner a:hover {
          text-decoration: none;
        }
        #apogee-anon-banner .close-btn {
          position: absolute;
          right: 16px;
          top: 50%;
          transform: translateY(-50%);
          background: rgba(255,255,255,0.2);
          border: none;
          color: white;
          cursor: pointer;
          font-size: 16px;
          width: 24px;
          height: 24px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          line-height: 1;
        }
        #apogee-anon-banner .close-btn:hover {
          background: rgba(255,255,255,0.3);
        }
        body.has-apogee-banner {
          padding-top: 44px !important;
        }
        body.has-apogee-banner > div:first-child,
        body.has-apogee-banner #root > div:first-child {
          margin-top: 0 !important;
        }
      </style>
      <span>You're using Apogee as a guest.</span>
      <a href="\${DASHBOARD_URL}/auth/login?signup=true">Sign up free</a>
      <span>to save your conversations and unlock more tools.</span>
      <button class="close-btn" onclick="document.getElementById('apogee-anon-banner').remove();document.body.classList.remove('has-apogee-banner');localStorage.setItem('apogee-banner-dismissed','1');" aria-label="Close">&times;</button>
    \`;

    // Check if user dismissed the banner in this session
    if (localStorage.getItem('apogee-banner-dismissed') === '1') {
      // Still track, but don't show the banner
      return;
    }

    document.body.prepend(banner);
    document.body.classList.add('has-apogee-banner');
  }

  // Handle 429 PROMPT_LIMIT_REACHED errors
  function setupErrorInterceptor() {
    const originalFetch = window.fetch;
    window.fetch = async function(...args) {
      const response = await originalFetch.apply(this, args);

      if (response.status === 429) {
        try {
          const clonedResponse = response.clone();
          const data = await clonedResponse.json();

          if (data.error === 'PROMPT_LIMIT_REACHED') {
            showLimitReachedModal(data);
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
  }

  // Show modal when prompt limit is reached
  function showLimitReachedModal(data) {
    // Remove any existing modal
    const existing = document.getElementById('apogee-limit-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'apogee-limit-modal';
    modal.innerHTML = \`
      <style>
        #apogee-limit-modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(0,0,0,0.6);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 999999;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        }
        #apogee-limit-modal .modal-content {
          background: white;
          border-radius: 12px;
          padding: 32px;
          max-width: 420px;
          width: 90%;
          text-align: center;
          box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);
        }
        #apogee-limit-modal h2 {
          margin: 0 0 12px;
          font-size: 24px;
          color: #111827;
        }
        #apogee-limit-modal p {
          margin: 0 0 24px;
          color: #6b7280;
          font-size: 16px;
          line-height: 1.5;
        }
        #apogee-limit-modal .benefits {
          text-align: left;
          margin: 0 0 24px;
          padding: 16px;
          background: #f9fafb;
          border-radius: 8px;
        }
        #apogee-limit-modal .benefits li {
          margin: 8px 0;
          color: #374151;
          font-size: 14px;
        }
        #apogee-limit-modal .signup-btn {
          display: inline-block;
          background: linear-gradient(90deg, #3b82f6, #6366f1);
          color: white;
          padding: 12px 32px;
          border-radius: 8px;
          text-decoration: none;
          font-weight: 600;
          font-size: 16px;
          transition: transform 0.2s, box-shadow 0.2s;
        }
        #apogee-limit-modal .signup-btn:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(99, 102, 241, 0.4);
        }
        #apogee-limit-modal .dismiss-link {
          display: block;
          margin-top: 16px;
          color: #9ca3af;
          font-size: 14px;
          cursor: pointer;
        }
        #apogee-limit-modal .dismiss-link:hover {
          color: #6b7280;
        }
      </style>
      <div class="modal-content">
        <h2>You've used your 5 free prompts</h2>
        <p>Sign up to continue the conversation and unlock powerful legislative intelligence tools.</p>
        <ul class="benefits">
          <li>Save your conversation history</li>
          <li>Access 30+ bill search queries per month</li>
          <li>Track legislation and regulations</li>
          <li>No credit card required</li>
        </ul>
        <a href="\${data.signupUrl || DASHBOARD_URL + '/auth/login?signup=true'}" class="signup-btn">Sign Up Free</a>
        <span class="dismiss-link" onclick="document.getElementById('apogee-limit-modal').remove();">Maybe later</span>
      </div>
    \`;

    document.body.appendChild(modal);
  }

  // Initialize when DOM is ready
  function init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        injectBanner();
        setupErrorInterceptor();
      });
    } else {
      injectBanner();
      setupErrorInterceptor();
    }

    // Also check periodically in case of SPA navigation
    setInterval(() => {
      if (isAnonymousUser() && !document.getElementById('apogee-anon-banner')) {
        // Only re-inject if not dismissed
        if (localStorage.getItem('apogee-banner-dismissed') !== '1') {
          injectBanner();
        }
      }
    }, 2000);
  }

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
