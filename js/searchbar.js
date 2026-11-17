(function () {
  var form = document.getElementById('home-search-form');
  var input = document.getElementById('home-search-input');
  if (!form || !input || form.classList.contains('-centered')) return;
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
    if (input.value.trim()) return;
    form.classList.remove('-open');
    form.style.width = '';
  }
  input.addEventListener('focus', openSearch);
  input.addEventListener('click', openSearch);
  input.addEventListener('blur', closeSearch);
  input.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      input.value = '';
      input.blur();
      closeSearch();
    }
  });
  window.addEventListener('resize', function () {
    if (form.classList.contains('-open')) fit();
  });
})();
