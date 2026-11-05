(function () {
  var BASE = 'https://raw.githubusercontent.com/osaiif/r/main/';
  var SOURCES = [BASE + 'favs.js', 'https://cdn.jsdelivr.net/gh/osaiif/r@main/favs.js'];
  window.R_BASE = BASE;
  for (var i = 0; i < SOURCES.length; i++) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', SOURCES[i], false);
      xhr.send(null);
      if (xhr.status >= 200 && xhr.status < 300 && xhr.responseText) {
        (0, eval)(xhr.responseText);
        break;
      }
    } catch (e) {}
  }
  var grid = document.getElementById('favorites-grid');
  var list = window.FAVORITES;
  if (!grid || !list || !list.length) return;
  function esc(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
  grid.innerHTML = list.map(function (f) {
    return '<div class="card"><a href="/show/?imdb=' + esc(f.imdb) + '">' +
      '<img src="' + BASE + encodeURIComponent(f.img) + '" alt="' + esc(f.title) +
      '" width="150" height="225" fetchpriority="high" decoding="async"></a></div>';
  }).join('');
})();
