const SIGNIN_HTML = `
  <form class="auth-form" id="signin-form" novalidate>
    <input type="text" class="auth-input" id="signin-username" name="username" placeholder="Username" autocomplete="username">
    <input type="password" class="auth-input" id="signin-password" name="password" placeholder="Password" autocomplete="current-password">
    <div class="auth-form-divider"></div>
    <button type="submit" class="auth-submit-btn -primary" id="signin-submit">Sign In</button>
    <button type="button" class="auth-submit-btn -ghost" id="goto-signup">Sign Up</button>
  </form>
`;
const SIGNIN_LOADING_HTML = `
  <div class="auth-modal-loading">
    <div class="spinner -inline"><div></div><div></div><div></div><div></div><div></div><div></div></div>
  </div>
`;
const SIGNUP_HTML = `
  <div class="auth-modal-caption">Under dev</div>
`;
const SIGNIN_ERROR_MESSAGE = 'Invalid username or password';
const SIGNIN_LOADING_MS = 1650;
const AUTH_TOAST_VISIBLE_MS = 2200;
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.auth-dropdown .auth-dropdown-btn').forEach(btn => {
    if (btn.htmlFor === 'signup-toggle' || (btn.getAttribute && btn.getAttribute('for') === 'signup-toggle')) {
      btn.remove();
    }
  });
  const signinBox = document.querySelector('.signin-modal-wrap .auth-modal-box');
  const signupBox = document.querySelector('.signup-modal-wrap .auth-modal-box');
  if (signupBox) signupBox.innerHTML = SIGNUP_HTML;
  const authMenuToggle = document.getElementById('auth-menu-toggle');
  const signinToggle = document.getElementById('signin-toggle');
  const signupToggle = document.getElementById('signup-toggle');
  let toastEl = null;
  let toastTimer = null;
  function showToast(message) {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'watchlist-toast';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    toastEl.classList.remove('-visible');
    void toastEl.offsetWidth;
    toastEl.classList.add('-visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove('-visible');
    }, AUTH_TOAST_VISIBLE_MS);
  }
  function renderSigninForm() {
    if (!signinBox) return;
    signinBox.innerHTML = SIGNIN_HTML;
    const form = document.getElementById('signin-form');
    if (!form) return;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      signinBox.innerHTML = SIGNIN_LOADING_HTML;
      setTimeout(() => {
        if (signinToggle) signinToggle.checked = false;
        if (authMenuToggle) authMenuToggle.checked = false;
        renderSigninForm();
        showToast(SIGNIN_ERROR_MESSAGE);
      }, SIGNIN_LOADING_MS);
    });
    const gotoSignup = document.getElementById('goto-signup');
    if (gotoSignup) {
      gotoSignup.addEventListener('click', () => {
        if (signinToggle) signinToggle.checked = false;
        if (signupToggle) signupToggle.checked = true;
      });
    }
  }
  renderSigninForm();
  function closeMenuIfBoxClosed(toggle) {
    if (toggle && !toggle.checked && authMenuToggle) {
      authMenuToggle.checked = false;
    }
  }
  if (signinToggle) signinToggle.addEventListener('change', () => closeMenuIfBoxClosed(signinToggle));
  if (signupToggle) signupToggle.addEventListener('change', () => closeMenuIfBoxClosed(signupToggle));
  window.addEventListener('scroll', () => {
    if (signinToggle && signinToggle.checked) signinToggle.checked = false;
    if (signupToggle && signupToggle.checked) signupToggle.checked = false;
    if (authMenuToggle && authMenuToggle.checked) authMenuToggle.checked = false;
  }, { passive: true });
});
