(function () {
  var form = document.getElementById('home-search-form');
  var input = document.getElementById('home-search-input');
  if (!form || !input || form.classList.contains('-centered')) return;
  var KEY = 'tvbox-search-query';
  function readSaved() {
    try {
      return sessionStorage.getItem(KEY) || '';
    } catch (e) {
      return '';
    }
  }
  function writeSaved(value) {
    try {
      if (value) sessionStorage.setItem(KEY, value);
      else sessionStorage.removeItem(KEY);
    } catch (e) {}
  }
  var closeTimer = null;
  function fit() {
    var home = document.querySelector('.floating-home');
    var rect = form.getBoundingClientRect();
    var left = home ? home.getBoundingClientRect().right + 8 : 0;
    var width = Math.max(31.5, rect.right - left) + 'px';
    form.style.width = width;
    form.style.maxWidth = width;
  }
  function openSearch() {
    clearTimeout(closeTimer);
    if (!form.classList.contains('-open')) form.classList.add('-open');
    fit();
  }
  function closeSearch() {
    if (!form.classList.contains('-open')) return;
    form.classList.remove('-open');
    form.style.width = '31.5px';
    form.style.maxWidth = '31.5px';
    clearTimeout(closeTimer);
    closeTimer = setTimeout(function () {
      form.style.width = '';
      form.style.maxWidth = '';
    }, 300);
  }
  if (input.value) {
    writeSaved(input.value);
  } else if (window.location.pathname.indexOf('/search') !== 0) {
    input.value = readSaved();
  }
  input.addEventListener('focus', openSearch);
  input.addEventListener('click', openSearch);
  input.addEventListener('blur', closeSearch);
  input.addEventListener('input', function () {
    writeSaved(input.value);
  });
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      input.value = '';
      writeSaved('');
      input.blur();
      closeSearch();
    }
  });
  window.addEventListener('resize', function () {
    if (form.classList.contains('-open')) fit();
  });
})();
