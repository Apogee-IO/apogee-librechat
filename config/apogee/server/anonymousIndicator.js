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

  // Check if current user is an admin (Apogee team member)
  // Admins have full access to the side panel
  function isAdminUser() {
    try {
      const userStr = localStorage.getItem('user');
      if (!userStr) return false;
      const user = JSON.parse(userStr);
      if (!user.email) return false;

      // Admin users are Apogee team members
      const adminDomains = ['@apog.ai', '@apogee.io'];
      return adminDomains.some(domain => user.email.endsWith(domain));
    } catch (e) {
      return false;
    }
  }

  // Hide the right side panel for non-admin users
  function hideSidePanelForNonAdmins() {
    if (isAdminUser()) return;
    if (document.getElementById('apogee-hide-sidepanel-styles')) return;

    const styles = document.createElement('style');
    styles.id = 'apogee-hide-sidepanel-styles';
    styles.textContent = \`
      /* Hide the right side panel (controls nav) for non-admin users */
      #controls-nav,
      #controls-nav + [data-panel-resize-handle-id],
      .sidenav {
        display: none !important;
      }

      /* Also hide the toggle arrow for the right side panel */
      #toggle-right-nav {
        display: none !important;
      }
    \`;
    document.head.appendChild(styles);
  }

  // Override the chat textarea placeholder for all users
  function patchChatPlaceholder() {
    // Set placeholder on any existing textareas
    document.querySelectorAll('textarea').forEach(function(textarea) {
      if (textarea.placeholder && textarea.placeholder.startsWith('Message ')) {
        textarea.placeholder = 'Ask Apogee';
      }
    });

    // Use MutationObserver to catch React resetting the placeholder attribute
    if (!window._apogeePlaceholderObserver) {
      window._apogeePlaceholderObserver = true;

      function observeTextarea(textarea) {
        if (textarea._apogeeObserved) return;
        textarea._apogeeObserved = true;
        var attrObserver = new MutationObserver(function(mutations) {
          mutations.forEach(function(mutation) {
            if (mutation.type === 'attributes' && mutation.attributeName === 'placeholder') {
              if (textarea.placeholder && textarea.placeholder.startsWith('Message ')) {
                textarea.placeholder = 'Ask Apogee';
              }
            }
          });
        });
        attrObserver.observe(textarea, { attributes: true, attributeFilter: ['placeholder'] });
      }

      // Observe existing textareas
      document.querySelectorAll('textarea').forEach(observeTextarea);

      // Watch for new textareas added to the DOM
      var bodyObserver = new MutationObserver(function() {
        document.querySelectorAll('textarea').forEach(observeTextarea);
      });
      bodyObserver.observe(document.body, { childList: true, subtree: true });
    }
  }

  // Positively confirm the user is logged in with a real (non-anonymous) account.
  // Returns false if user data hasn't loaded yet (unknown state).
  // LibreChat doesn't store user data in localStorage, so we check the DOM:
  // the nav-user element renders the username even while hidden by CSS.
  function isConfirmedLoggedIn() {
    try {
      var navUser = document.querySelector('[data-testid="nav-user"]');
      if (!navUser) return false;
      var text = (navUser.textContent || '').trim();
      if (!text) return false;
      // Anonymous users show as "Guest User" or contain "anonymous"
      if (text === 'Guest User' || text.toLowerCase().indexOf('anonymous') !== -1 || text.toLowerCase().indexOf('guest') !== -1) return false;
      return true;
    } catch (e) {
      return false;
    }
  }

  // Show the user menu for logged-in (non-anonymous) users.
  // The menu is hidden by default via early CSS in <head> to prevent FOUC.
  // This function removes that early CSS only once we positively confirm
  // the user is logged in — unknown state keeps the menu hidden.
  function showUserMenuIfLoggedIn() {
    var earlyHide = document.getElementById('apogee-early-hide');
    if (!earlyHide) return;
    if (isConfirmedLoggedIn()) {
      earlyHide.remove();
    }
  }

  // Apogee nodes icon SVG (white fill, from nodes.svg brand asset)
  var APOGEE_ICON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024"><g transform="translate(0,1024) scale(.1,-.1)" fill="white"><path d="M4911 9870 c-161 -43 -318 -144 -417 -268 -62 -77 -131 -220 -150 -312 -12 -55 -15 -109 -11 -205 l4 -130 -216 -77 c-119 -42 -299 -107 -401 -143 -284 -102 -650 -232 -805 -285 -77 -27 -147 -51 -156 -55 -12 -4 -25 8 -48 44 -71 110 -206 208 -351 253 -108 33 -285 33 -385 -1 -232 -78 -400 -271 -436 -500 -20 -132 14 -281 90 -397 44 -67 75 -101 144 -159 l48 -41 -92 -229 c-50 -127 -125 -318 -166 -425 -42 -107 -93 -240 -114 -295 -22 -55 -79 -203 -127 -330 l-88 -230 -40 5 c-21 3 -100 5 -174 5 -125 -1 -142 -3 -228 -33 -478 -165 -668 -714 -393 -1133 158 -240 459 -379 736 -340 48 7 91 9 95 4 4 -4 48 -116 98 -248 93 -246 119 -315 343 -897 71 -185 129 -342 129 -347 0 -6 -4 -11 -8 -11 -4 0 -41 -32 -80 -72 -223 -221 -242 -588 -43 -835 104 -129 260 -213 432 -232 213 -24 407 52 561 218 l66 71 98 -36 c94 -34 1241 -436 1409 -493 l80 -28 -3 -109 c-7 -242 66 -424 242 -599 89 -88 199 -154 331 -195 99 -31 282 -39 396 -16 282 57 535 278 624 545 28 85 44 238 33 316 -4 27 -4 53 0 57 4 4 131 50 282 103 516 181 935 327 1135 396 l200 69 24 -33 c62 -82 161 -166 243 -206 111 -55 182 -71 304 -71 320 0 579 193 655 488 62 244 -29 502 -230 652 -39 29 -71 58 -71 64 0 10 110 306 227 611 19 50 63 167 98 260 35 94 92 244 128 335 35 91 67 173 70 183 6 15 13 16 49 10 24 -5 88 -7 143 -6 323 5 620 217 719 513 135 409 -92 842 -522 993 -78 28 -102 31 -229 35 l-142 4 -17 52 c-29 86 -529 1410 -540 1428 -3 4 19 22 48 41 130 83 234 238 264 392 58 295 -109 575 -410 688 -75 28 -91 30 -211 31 -110 0 -142 -4 -212 -25 -45 -14 -107 -41 -139 -60 -58 -34 -153 -121 -209 -191 l-30 -38 -155 55 c-85 30 -429 149 -765 264 -335 115 -644 222 -685 237 l-75 27 0 151 c-1 137 -3 158 -28 231 -39 117 -91 199 -187 296 -96 96 -176 146 -309 192 -77 27 -101 31 -231 34 -121 3 -157 0 -219 -17z m343 -225 c174 -46 320 -177 376 -339 64 -188 19 -379 -124 -521 -231 -230 -585 -233 -798 -6 -133 140 -175 302 -128 487 26 99 68 170 145 243 111 103 227 149 380 150 52 1 116 -6 149 -14z m773 -941 c115 -41 282 -102 373 -134 91 -32 230 -82 310 -110 80 -28 276 -96 435 -151 160 -55 304 -105 320 -111 l30 -10 -3 -83 c-3 -56 2 -102 13 -146 10 -35 19 -73 22 -84 3 -16 -39 -50 -238 -189 l-241 -168 -43 21 c-171 86 -344 92 -505 20 -52 -24 -67 -27 -75 -17 -5 8 -39 52 -75 98 -35 47 -139 182 -230 300 -91 118 -195 253 -231 300 -36 47 -108 142 -162 211 l-96 126 50 49 c27 27 66 73 86 102 20 28 40 52 45 52 4 0 101 -34 215 -76z m-1564 4 c19 -29 58 -77 86 -107 28 -30 51 -57 51 -61 0 -4 -57 -79 -126 -166 -745 -940 -659 -837 -687 -820 -12 8 -58 26 -102 41 -144 49 -304 36 -447 -36 l-58 -30 -203 142 c-111 78 -208 147 -215 154 -12 11 -10 26 13 91 19 55 29 107 33 170 l5 92 271 97 c149 54 406 146 571 205 165 59 390 140 500 179 110 39 214 78 230 86 17 7 33 14 36 14 3 1 22 -23 42 -51z m-2219 -208 c228 -33 394 -241 357 -447 -25 -135 -111 -246 -239 -306 -64 -30 -73 -32 -187 -32 -117 0 -122 1 -188 34 -216 109 -293 338 -185 544 39 72 102 130 182 168 98 46 153 54 260 39z m6036 -16 c112 -32 200 -109 254 -223 28 -59 31 -75 30 -156 -1 -123 -27 -189 -108 -273 -168 -175 -444 -187 -617 -26 -95 90 -134 187 -127 319 5 104 38 176 112 251 119 119 280 157 456 108z m-2779 -106 c138 -183 450 -589 564 -733 39 -49 100 -128 135 -173 l64 -84 -26 -46 c-84 -150 -85 -331 -5 -494 l43 -88 -206 -257 c-113 -142 -261 -328 -329 -413 -69 -85 -126 -157 -128 -160 -2 -2 -12 1 -21 8 -70 49 -165 97 -244 123 -224 74 -507 39 -697 -86 -29 -19 -54 -35 -56 -35 -2 0 -42 48 -88 108 -46 59 -166 213 -267 342 -267 341 -290 371 -290 379 0 3 14 26 30 51 51 77 72 145 78 256 5 110 -8 174 -55 270 l-25 51 224 279 c123 153 305 383 406 511 100 128 186 234 190 237 5 3 36 -4 70 -14 153 -48 323 -44 475 9 45 16 87 30 93 30 5 1 35 -31 65 -71z m2217 -737 c65 -54 144 -95 232 -122 60 -19 97 -23 187 -23 l112 1 25 -66 c13 -36 59 -156 101 -266 42 -110 155 -409 251 -664 96 -255 179 -472 184 -482 9 -16 1 -25 -57 -63 -38 -25 -90 -65 -117 -90 -37 -35 -53 -43 -65 -36 -55 29 -1341 1006 -1341 1018 0 4 9 36 20 70 41 129 32 290 -20 392 -19 37 -20 45 -8 57 14 14 440 313 446 313 2 0 24 -18 50 -39z m-4913 -120 c105 -73 197 -139 206 -147 15 -14 14 -20 -8 -74 -51 -128 -53 -241 -7 -379 14 -41 21 -77 17 -81 -50 -44 -1303 -976 -1351 -1004 -8 -5 -40 16 -89 56 -41 35 -87 73 -101 84 l-26 21 42 109 c227 593 528 1367 541 1393 9 15 18 16 80 8 136 -19 322 33 436 121 22 17 47 30 55 28 8 -2 101 -63 205 -135z m870 -111 c55 -23 129 -90 160 -144 50 -89 56 -210 15 -303 -29 -66 -111 -146 -183 -179 -54 -26 -73 -29 -157 -29 -83 0 -102 3 -151 28 -76 37 -150 117 -178 192 -30 79 -26 207 8 273 32 63 97 130 154 158 88 45 233 47 332 4z m3224 -14 c101 -52 170 -144 191 -256 27 -143 -54 -301 -191 -370 -50 -26 -154 -43 -219 -35 -116 14 -228 94 -280 200 -21 42 -25 65 -25 145 0 84 3 102 28 152 37 75 95 133 170 169 59 29 67 30 167 27 91 -4 112 -8 159 -32z m-3648 -754 c133 -65 299 -77 428 -31 31 11 63 22 72 25 11 4 35 -20 80 -79 35 -46 175 -228 310 -403 135 -176 256 -333 268 -351 l23 -31 -21 -24 c-34 -36 -99 -175 -118 -251 l-16 -67 -1215 0 c-858 1 -1220 4 -1229 12 -7 6 -13 20 -13 32 0 11 -11 52 -25 91 -14 38 -21 72 -17 76 4 4 70 52 147 107 77 55 390 287 695 516 305 229 557 415 560 413 3 -2 35 -17 71 -35z m3994 -89 c279 -214 963 -731 1143 -862 56 -41 71 -58 66 -70 -4 -9 -21 -55 -37 -103 l-30 -88 -1233 0 -1232 0 -6 35 c-11 59 -60 167 -105 234 -51 74 -51 73 36 176 33 39 182 223 332 410 150 187 278 339 284 338 7 -1 41 -14 77 -29 54 -23 83 -29 171 -32 132 -5 206 12 309 72 l75 44 30 -28 c17 -15 71 -59 120 -97z m-6061 -693 c43 -11 101 -32 129 -47 72 -39 186 -155 225 -229 114 -218 64 -482 -121 -635 -139 -116 -305 -163 -474 -133 -291 50 -492 345 -430 631 36 167 134 297 277 366 142 69 255 83 394 47z m4061 -16 c435 -103 601 -623 296 -924 -113 -112 -260 -170 -430 -170 -174 0 -310 56 -427 174 -82 84 -125 162 -150 273 -52 235 64 478 286 601 120 67 270 83 425 46z m4018 -9 c91 -16 202 -68 269 -125 98 -85 174 -235 185 -370 28 -331 -244 -592 -593 -567 -193 14 -361 126 -449 299 -44 88 -58 162 -53 268 14 252 206 459 463 500 73 11 92 11 178 -5z m-5721 -629 c400 -2 732 -7 738 -11 5 -3 10 -15 10 -26 0 -34 50 -170 86 -234 18 -33 51 -82 73 -109 l39 -49 -48 -56 c-108 -125 -528 -621 -575 -679 -56 -70 -54 -69 -155 -25 -61 26 -73 28 -200 28 -128 0 -139 -2 -214 -32 l-78 -32 -77 58 c-157 119 -1032 771 -1175 877 -82 60 -158 116 -169 125 -19 15 -19 15 3 85 12 38 24 75 26 81 2 10 112 11 496 8 271 -3 820 -7 1220 -9z m4856 -63 c7 -32 23 -84 36 -115 l23 -57 -141 -103 c-77 -56 -283 -209 -457 -339 -174 -130 -404 -301 -510 -379 -107 -79 -206 -154 -221 -168 l-27 -25 -78 35 c-100 46 -166 61 -263 60 -104 0 -177 -18 -269 -64 -42 -21 -77 -34 -79 -28 -4 11 -60 80 -391 485 -135 164 -252 307 -259 317 -12 16 -6 28 42 101 61 91 97 178 116 275 l13 62 1226 0 1227 0 12 -57z m-6679 -311 c50 -43 424 -325 961 -726 190 -142 351 -264 358 -270 10 -10 7 -25 -16 -77 -70 -155 -73 -316 -8 -451 l24 -49 -62 -41 c-33 -23 -123 -86 -200 -141 l-138 -99 -37 34 c-55 53 -99 83 -177 122 -107 53 -179 68 -308 65 l-110 -3 -63 170 c-35 93 -111 295 -170 449 -203 535 -323 857 -323 869 0 6 28 29 61 51 32 22 81 61 106 88 26 26 49 47 51 47 2 0 25 -17 51 -38z m6892 -78 c13 -14 61 -50 106 -80 l81 -55 -38 -97 c-193 -487 -470 -1215 -494 -1298 -6 -20 -15 -22 -129 -26 -107 -4 -132 -9 -202 -36 -99 -39 -172 -87 -251 -164 l-62 -60 -161 113 c-89 62 -175 125 -192 139 l-30 25 34 67 c45 90 60 166 55 280 -3 79 -9 104 -38 166 -19 43 -30 76 -24 81 5 5 153 114 329 244 176 129 466 345 645 480 179 135 330 246 336 246 6 1 21 -11 35 -25z m-3868 -163 c47 -22 114 -47 149 -57 87 -23 237 -33 332 -22 91 10 236 55 303 95 l46 27 31 -35 c17 -19 103 -124 191 -233 88 -109 225 -278 303 -375 194 -238 178 -204 146 -297 -50 -149 -42 -269 26 -405 27 -53 29 -63 17 -77 -7 -10 -143 -172 -302 -362 -159 -190 -338 -403 -399 -475 -60 -71 -111 -131 -112 -133 -1 -2 -26 6 -55 18 -87 34 -183 50 -292 50 -115 0 -197 -16 -311 -61 -65 -26 -80 -29 -91 -18 -6 8 -43 52 -81 99 -38 47 -163 200 -279 340 -116 140 -260 315 -319 389 l-109 134 17 26 c113 173 134 375 55 535 -16 33 -29 63 -29 68 0 5 75 98 168 205 224 263 405 481 469 565 15 21 31 37 34 38 3 0 45 -18 92 -39z m-1061 -759 c122 -60 188 -166 188 -301 0 -95 -22 -151 -87 -221 -117 -127 -286 -158 -441 -82 -135 66 -214 232 -177 373 30 117 100 198 213 246 48 20 71 23 147 21 79 -3 99 -7 157 -36z m3240 9 c150 -58 241 -212 217 -365 -25 -150 -134 -252 -306 -287 -157 -32 -320 49 -393 194 -25 50 -30 72 -30 133 0 161 95 289 253 340 60 20 188 12 259 -15z m-3537 -816 c115 -26 226 -13 356 40 13 5 69 -60 240 -276 123 -155 278 -348 343 -428 66 -80 145 -177 176 -216 l57 -69 -47 -56 c-25 -31 -56 -73 -69 -93 -12 -20 -27 -37 -31 -37 -5 0 -33 9 -62 19 -164 60 -1402 484 -1502 514 l-39 12 -2 125 c-2 99 -6 138 -24 189 -12 35 -21 64 -19 65 2 2 96 68 211 148 l207 146 64 -33 c35 -18 99 -41 141 -50z m3220 1 c75 -20 242 -21 315 -1 30 8 76 24 102 36 l47 22 48 -40 c26 -22 116 -88 198 -147 83 -59 163 -117 179 -129 l29 -22 -17 -66 c-9 -36 -16 -101 -16 -145 l0 -80 -82 -26 c-128 -41 -1492 -509 -1549 -533 -12 -4 -24 6 -44 42 -16 26 -56 77 -91 113 l-62 65 117 141 c64 78 211 255 326 394 116 139 243 294 284 345 l74 92 41 -23 c23 -13 68 -30 101 -38z m-4330 -58 c119 -30 224 -118 283 -237 34 -69 37 -82 36 -155 -3 -229 -177 -397 -414 -399 -219 -3 -385 136 -420 350 -26 158 64 334 209 407 104 53 192 63 306 34z m6004 -7 c83 -26 141 -62 194 -121 220 -245 72 -614 -270 -672 -244 -41 -472 129 -490 365 -22 291 278 518 566 428z m-2953 -906 c97 -33 165 -77 232 -150 181 -197 191 -490 25 -704 -56 -71 -113 -118 -201 -164 -221 -116 -481 -76 -663 103 -187 184 -213 479 -60 696 74 105 159 173 270 215 122 45 269 47 397 4z"/></g></svg>';

  // Replace "AWS Bedrock" sender name with "Apogee" and swap the response icon
  function patchSenderAndIcon() {
    // Replace "AWS Bedrock" text in h2 elements (the message sender label)
    document.querySelectorAll('h2').forEach(function(h2) {
      if (h2.textContent === 'AWS Bedrock') {
        h2.textContent = 'Apogee';
      }
    });

    // Replace the BedrockIcon in message icons (div with title="AWS Bedrock")
    document.querySelectorAll('div[title="AWS Bedrock"]').forEach(function(iconDiv) {
      iconDiv.title = 'Apogee';
      iconDiv.style.background = '#0f766e';
      // Replace inner SVG with Apogee icon
      var existingSvg = iconDiv.querySelector('svg');
      if (existingSvg && !iconDiv._apogeePatched) {
        iconDiv._apogeePatched = true;
        iconDiv.innerHTML = APOGEE_ICON_SVG;
        var newSvg = iconDiv.querySelector('svg');
        if (newSvg) {
          newSvg.style.width = '88%';
          newSvg.style.height = '88%';
        }
      }
    });

    // Use MutationObserver to catch new messages being added
    if (!window._apogeeSenderObserver) {
      window._apogeeSenderObserver = true;
      var observer = new MutationObserver(function() {
        document.querySelectorAll('h2').forEach(function(h2) {
          if (h2.textContent === 'AWS Bedrock') {
            h2.textContent = 'Apogee';
          }
        });
        document.querySelectorAll('div[title="AWS Bedrock"]').forEach(function(iconDiv) {
          iconDiv.title = 'Apogee';
          iconDiv.style.background = '#0f766e';
          var existingSvg = iconDiv.querySelector('svg');
          if (existingSvg && !iconDiv._apogeePatched) {
            iconDiv._apogeePatched = true;
            iconDiv.innerHTML = APOGEE_ICON_SVG;
            var newSvg = iconDiv.querySelector('svg');
            if (newSvg) {
              newSvg.style.width = '88%';
              newSvg.style.height = '88%';
            }
          }
        });
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  // Inject styles once
  function injectStyles() {
    if (document.getElementById('apogee-styles')) return;

    // Load Merriweather serif font from Google Fonts
    if (!document.getElementById('apogee-google-fonts')) {
      var fontLink = document.createElement('link');
      fontLink.id = 'apogee-google-fonts';
      fontLink.rel = 'stylesheet';
      fontLink.href = 'https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,300;0,400;0,700;0,900;1,300;1,400;1,700;1,900&display=swap';
      document.head.appendChild(fontLink);
    }

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
        background: #fff;
        color: #374151;
        border: 1px solid #e3e3e3;
      }

      #apogee-auth-buttons .btn-login:hover {
        background: #e3e3e3;
        border-color: #d1d5db;
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
          background: #212121;
          color: #e5e7eb;
          border-color: #2f2f2f;
        }
        #apogee-auth-buttons .btn-login:hover {
          background: #2f2f2f;
          border-color: #424242;
        }
      }

      /* LibreChat dark mode detection */
      .dark #apogee-auth-buttons .btn-login,
      [data-theme="dark"] #apogee-auth-buttons .btn-login {
        background: #212121;
        color: #e5e7eb;
        border-color: #2f2f2f;
      }

      .dark #apogee-auth-buttons .btn-login:hover,
      [data-theme="dark"] #apogee-auth-buttons .btn-login:hover {
        background: #2f2f2f;
        border-color: #424242;
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

      /* Hide the MCP server selection chip in the badge row */
      /* Targets the Ariakit MenuButton with rounded-full pill styling */
      button[aria-haspopup="menu"].rounded-full.border-border-medium {
        display: none !important;
      }

      /* Hide the portalled MCP server menu dropdown */
      [role="menu"][aria-label="MCP Servers"] {
        display: none !important;
      }

      /* Hide the Web Search badge in the badge row */
      button[aria-label="Search"].rounded-full,
      button[aria-label="Search..."].rounded-full {
        display: none !important;
      }

      /* Hide the Code Interpreter badge in the badge row */
      button[aria-label="Code Interpreter"].rounded-full,
      button[aria-label="Code"].rounded-full {
        display: none !important;
      }

      /* Hide the Artifacts badge and its mode dropdown chevron */
      button[aria-label="Artifacts"].rounded-full,
      button.rounded-l-none.rounded-r-full.w-7 {
        display: none !important;
      }

      /* Hide the Tools Options menu button (all tool toggles are forced, menu is empty) */
      button[aria-label="Tools Options"] {
        display: none !important;
      }

      /* Hide the search/filter field in the model selector dropdown */
      #model-search,
      #model-search + label {
        display: none !important;
      }

      /* Hide the endpoint icon on the landing page (ConvoIcon in the greeting area) */
      .transform-gpu .relative.size-10 {
        display: none !important;
      }

      /* Hide endpoint icons in the sidebar conversation list */
      [data-testid="convo-icon"] {
        display: none !important;
      }

      /* Style the export/share button to match nav buttons (no border, transparent bg) */
      #export-menu-button {
        border: none !important;
        background: transparent !important;
      }
      #export-menu-button:hover {
        background: var(--surface-active-alt) !important;
      }

      /* Serif font for conversation message content and headings */
      .message-content,
      .message-content h1,
      .message-content h2,
      .message-content h3,
      .message-content h4,
      .message-content h5,
      .message-content h6 {
        font-family: "Merriweather", Georgia, serif !important;
        font-weight: 300 !important;
      }

      /* Serif font for the landing page greeting text */
      p.split-parent {
        font-family: "Merriweather", Georgia, serif !important;
      }

      /* Keep monospace font for code blocks within messages */
      .message-content code,
      .message-content pre,
      .message-content pre code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace !important;
      }

      /* Hide per-message avatars and sender name headings */
      .message-render > .flex-shrink-0.items-center:first-child {
        display: none !important;
      }
      .message-render .user-turn h2,
      .message-render .agent-turn h2 {
        display: none !important;
      }

      /* Right-align user messages */
      .message-render:has(.user-turn) {
        justify-content: flex-end;
      }
      .user-turn {
        align-items: flex-end;
      }

      /* Softer text color — off-black in light mode, off-white in dark mode */
      .message-content {
        color: #2d2d2d !important;
      }
      html.dark .message-content {
        color: #d4d4d4 !important;
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
    // Include return_to=/api/auth/chat so users are redirected back to chat via SSO after auth
    const returnTo = encodeURIComponent('/api/auth/chat');
    container.innerHTML = \`
      <a href="\${DASHBOARD_URL}/auth/login?return_to=\${returnTo}" class="btn btn-login">Log in</a>
      <a href="\${DASHBOARD_URL}/auth/login?signup=true&return_to=\${returnTo}" class="btn btn-signup">Sign up for free</a>
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

          <h2>Sign up to continue</h2>
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

          <a href="\${DASHBOARD_URL}/auth/login?return_to=%2Fapi%2Fauth%2Fchat" class="login-link">Log in</a>

          <p class="fine-print">
            By signing up, you agree to our
            <a href="\${DASHBOARD_URL}/terms" target="_blank">Terms of Service</a>
            and
            <a href="\${DASHBOARD_URL}/privacy" target="_blank">Privacy Policy</a>.
          </p>
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

    submitBtn.addEventListener('click', () => {
      const email = emailInput.value.trim();

      // Basic validation
      if (!email || !email.includes('@')) {
        errorDiv.textContent = 'Please enter a valid email address.';
        errorDiv.style.display = 'block';
        return;
      }

      // Redirect to signup page with email pre-filled
      // Use /api/auth/chat as return_to so users are redirected back to chat via SSO after auth
      const returnTo = encodeURIComponent('/api/auth/chat');
      const encodedEmail = encodeURIComponent(email);
      window.location.href = \`\${DASHBOARD_URL}/auth/login?signup=true&email=\${encodedEmail}&return_to=\${returnTo}\`;
    });
  }

  // Force Apogee MCP server to always be selected.
  // LibreChat stores MCP selections per-conversation in localStorage as LAST_MCP_{id}.
  // We intercept localStorage writes to ensure "apogee" is never removed,
  // and pre-seed the "new conversation" key so it starts selected.
  function forceMCPSelection() {
    var defaultSelection = '["apogee"]';

    // Ensure MCP is "pinned" (required for the atom to initialize with selection)
    try {
      localStorage.setItem('PIN_MCP_', 'true');
    } catch (e) {}

    // Ensure the "new conversation" key always has apogee selected
    var newKey = 'LAST_MCP_new';
    try {
      var current = localStorage.getItem(newKey);
      if (!current || current.indexOf('apogee') === -1) {
        localStorage.setItem(newKey, defaultSelection);
      }
    } catch (e) {}

    // Scan existing conversation keys and ensure apogee is always included
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && key.indexOf('LAST_MCP_') === 0) {
          var val = JSON.parse(localStorage.getItem(key) || '[]');
          if (Array.isArray(val) && val.indexOf('apogee') === -1) {
            val.push('apogee');
            localStorage.setItem(key, JSON.stringify(val));
          }
        }
      }
    } catch (e) {}

    // Intercept localStorage.setItem to prevent removing "apogee" from MCP selections
    if (!window._apogeeMCPInterceptor) {
      window._apogeeMCPInterceptor = true;
      var origSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key && key.indexOf('LAST_MCP_') === 0) {
          try {
            var arr = JSON.parse(value);
            if (Array.isArray(arr) && arr.indexOf('apogee') === -1) {
              arr.push('apogee');
              return origSetItem.call(this, key, JSON.stringify(arr));
            }
          } catch (e) {}
        }
        // Force web search to stay enabled
        if (key && key.indexOf('LAST_WEB_SEARCH_TOGGLE_') === 0) {
          return origSetItem.call(this, key, 'true');
        }
        // Force code interpreter to stay disabled
        if (key && key.indexOf('LAST_CODE_TOGGLE_') === 0) {
          return origSetItem.call(this, key, 'false');
        }
        // Force artifacts to stay enabled (shadcn_ui mode)
        if (key && key.indexOf('LAST_ARTIFACTS_TOGGLE_') === 0 && key !== 'LAST_ARTIFACTS_TOGGLEpinned') {
          return origSetItem.call(this, key, '"shadcn_ui"');
        }
        // Force thoughts/reasoning to stay collapsed
        if (key === 'showThinking') {
          return origSetItem.call(this, key, 'false');
        }
        return origSetItem.call(this, key, value);
      };
    }
  }

  // Force web search to always be enabled.
  // Sets localStorage state and prevents toggling off via interceptor.
  function forceWebSearchEnabled() {
    try { localStorage.setItem('PIN_WEB_SEARCH_', 'true'); } catch (e) {}
    try {
      localStorage.setItem('LAST_WEB_SEARCH_TOGGLE_new', 'true');
    } catch (e) {}
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && key.indexOf('LAST_WEB_SEARCH_TOGGLE_') === 0) {
          if (localStorage.getItem(key) !== 'true') {
            localStorage.setItem(key, 'true');
          }
        }
      }
    } catch (e) {}
  }

  // Disable code interpreter for all users.
  // Prevents enabling via localStorage interceptor.
  function disableCodeInterpreter() {
    try { localStorage.setItem('PIN_CODE_INTERPRETER_', 'false'); } catch (e) {}
    try {
      localStorage.setItem('LAST_CODE_TOGGLE_new', 'false');
    } catch (e) {}
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && key.indexOf('LAST_CODE_TOGGLE_') === 0) {
          if (localStorage.getItem(key) !== 'false') {
            localStorage.setItem(key, 'false');
          }
        }
      }
    } catch (e) {}
  }

  // Force artifacts to always be enabled in shadcn_ui mode.
  function forceArtifactsEnabled() {
    try { localStorage.setItem('LAST_ARTIFACTS_TOGGLEpinned', 'true'); } catch (e) {}
    try {
      localStorage.setItem('LAST_ARTIFACTS_TOGGLE_new', '"shadcn_ui"');
    } catch (e) {}
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = localStorage.key(i);
        if (key && key.indexOf('LAST_ARTIFACTS_TOGGLE_') === 0 && key !== 'LAST_ARTIFACTS_TOGGLEpinned') {
          var val = localStorage.getItem(key);
          if (val !== '"shadcn_ui"') {
            localStorage.setItem(key, '"shadcn_ui"');
          }
        }
      }
    } catch (e) {}
  }

  // Force thoughts/reasoning sections to be collapsed by default.
  // LibreChat uses localStorage key 'showThinking' (Jotai atomWithStorage).
  function forceThoughtsCollapsed() {
    try {
      localStorage.setItem('showThinking', 'false');
    } catch (e) {}
  }

  // Hide MCP-related UI elements that CSS can't easily target (e.g. MCPSubMenu in ToolsDropdown).
  // Uses a MutationObserver so items are hidden immediately when menus open, not on interval delay.
  function hideMCPSubMenu() {
    // Scan and hide MCP Servers, Web Search, Code Interpreter, and Artifacts menu items
    document.querySelectorAll('[role="menuitem"]').forEach(function(item) {
      var text = item.textContent || '';
      if (text.indexOf('MCP') !== -1 && text.indexOf('Server') !== -1) {
        item.style.display = 'none';
      }
      if (text.indexOf('Web') !== -1 && text.indexOf('Search') !== -1) {
        item.style.display = 'none';
      }
      if (text.indexOf('Code') !== -1 && text.indexOf('Interpreter') !== -1) {
        item.style.display = 'none';
      }
      if (text.trim() === 'Artifacts') {
        item.style.display = 'none';
      }
    });
  }

  // Replace the Share2 icon in the export menu button with an iOS-style share icon
  function patchShareIcon() {
    var btn = document.getElementById('export-menu-button');
    if (!btn || btn._apogeeSharePatched) return;
    var svg = btn.querySelector('svg');
    if (!svg) return;
    btn._apogeeSharePatched = true;
    svg.innerHTML = '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>';
  }

  // Inject a permanent "New chat" item at the top of the nav drawer chat list.
  // Placed above the virtualized conversation list so React doesn't destroy it.
  function injectNewChatItem() {
    if (document.getElementById('apogee-new-chat-item')) return;

    // Find the conversations container inside chat-history-nav.
    // Structure: nav#chat-history-nav > div.flex > [header] + [conversations container]
    var nav = document.getElementById('chat-history-nav');
    if (!nav) return;

    // The conversations area is the .flex.min-h-0.flex-grow div
    var conversationsContainer = nav.querySelector('.flex.min-h-0.flex-grow');
    if (!conversationsContainer) return;

    var item = document.createElement('div');
    item.id = 'apogee-new-chat-item';
    item.className = 'group relative flex h-9 w-full items-center rounded-lg hover:bg-surface-active-alt cursor-pointer text-text-primary';
    item.setAttribute('role', 'button');
    item.setAttribute('tabindex', '0');
    item.setAttribute('aria-label', 'New chat');
    item.style.cssText = 'flex-shrink: 0; margin-bottom: 2px;';

    item.innerHTML = '<div class="flex grow items-center gap-2 overflow-hidden rounded-lg px-2" style="width:100%">'
      + '<svg class="flex-shrink-0" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
      + '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/>'
      + '</svg>'
      + '<span class="relative flex-1 grow overflow-hidden whitespace-nowrap text-sm text-text-primary">New chat</span>'
      + '</div>';

    item.addEventListener('click', function(e) {
      if (e.button === 0 && (e.ctrlKey || e.metaKey)) {
        window.open('/c/new', '_blank');
      } else {
        window.location.href = '/c/new';
      }
    });
    item.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        window.location.href = '/c/new';
      }
    });

    // Insert before the conversations container (above the virtualized list)
    conversationsContainer.parentNode.insertBefore(item, conversationsContainer);
  }

  // Watch for portalled menus being added to the DOM (Ariakit renders menus as portals)
  function setupUIHidingObserver() {
    if (window._apogeeUIObserver) return;
    window._apogeeUIObserver = true;
    var observer = new MutationObserver(function() {
      hideMCPSubMenu();
      patchShareIcon();
      injectNewChatItem();
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Initialize when DOM is ready
  function init() {
    injectStyles();
    forceMCPSelection();
    forceWebSearchEnabled();
    disableCodeInterpreter();
    forceArtifactsEnabled();
    forceThoughtsCollapsed();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        injectAuthButtons();
        setupErrorInterceptor();
        hideSidePanelForNonAdmins();
        patchChatPlaceholder();
        patchSenderAndIcon();
        showUserMenuIfLoggedIn();
        hideMCPSubMenu();
        patchShareIcon();
        injectNewChatItem();
        setupUIHidingObserver();
      });
    } else {
      injectAuthButtons();
      setupErrorInterceptor();
      hideSidePanelForNonAdmins();
      patchChatPlaceholder();
      patchSenderAndIcon();
      showUserMenuIfLoggedIn();
      hideMCPSubMenu();
      patchShareIcon();
      injectNewChatItem();
      setupUIHidingObserver();
    }

    // Check periodically in case of SPA navigation
    setInterval(() => {
      if (isAnonymousUser() && !document.getElementById('apogee-auth-buttons')) {
        injectAuthButtons();
      }
      // Re-check side panel visibility (user info may load async)
      hideSidePanelForNonAdmins();
      // Re-check placeholder (React may reset it on navigation)
      patchChatPlaceholder();
      // Re-check sender name and icon (new messages may appear)
      patchSenderAndIcon();
      // Show user menu once logged-in status is confirmed (user info may load async)
      showUserMenuIfLoggedIn();
      // Ensure MCP stays selected, web search stays on, code interpreter stays off
      forceMCPSelection();
      forceWebSearchEnabled();
      disableCodeInterpreter();
      forceArtifactsEnabled();
      hideMCPSubMenu();
      injectNewChatItem();
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

  // Early CSS injected into <head> to prevent FOUC for anonymous users.
  // Elements are hidden before first paint, then shown via JS for logged-in users.
  const EARLY_CSS = `<!-- APOGEE_EARLY_STYLES -->
<style id="apogee-early-hide">
  [data-testid="nav-user"] { display: none !important; }
</style>`;

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

    // Add SVG favicon (preferred over PNG fallbacks)
    const svgFaviconLink = '<link rel="icon" type="image/svg+xml" href="assets/nodes.svg" />';
    if (content.includes('<link rel="icon"')) {
      content = content.replace(
        /(<link rel="icon")/,
        svgFaviconLink + '\n    $1'
      );
    }

    // Inject early CSS into <head> to prevent FOUC
    if (content.includes('</head>')) {
      content = content.replace('</head>', EARLY_CSS + '\n</head>');
    }

    // Inject script before </body>
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
