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
  function fit() {
    var home = document.querySelector('.floating-home');
    var rect = form.getBoundingClientRect();
    var left = home ? home.getBoundingClientRect().right + 8 : 0;
    form.style.width = Math.max(31.5, rect.right - left) + 'px';
  }
  function openSearch() {
    if (!form.classList.contains('-open')) form.classList.add('-open');
    fit();
  }
  function closeSearch() {
    form.classList.remove('-open');
    form.style.width = '';
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
