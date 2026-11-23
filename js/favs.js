(function () {
  var SOURCES = [
    'https://raw.githubusercontent.com/osaiif/r/main/favs.js',
    'https://cdn.jsdelivr.net/gh/osaiif/r@main/favs.js'
  ];
  var TMDB_KEY = '6cb6e1dc603bc65ffb6198489d5bc5b7';
  var TMDB_IMG = /^https:\/\/image\.tmdb\.org\/t\/p\/(w\d+|original)\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/;
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
      '<img' + (TMDB_IMG.test(f.img || '') ? ' src="' + esc(f.img) + '"' : '') + ' alt="' + esc(f.title) +
      '" width="150" height="225" fetchpriority="high" decoding="async"></a></div>';
  }).join('');
  var imgs = grid.querySelectorAll('img');
  list.forEach(function (f, n) {
    if (TMDB_IMG.test(f.img || '') || !/^tt\d+$/.test(f.imdb || '')) return;
    fetch('https://api.themoviedb.org/3/find/' + encodeURIComponent(f.imdb) + '?external_source=imdb_id&api_key=' + TMDB_KEY)
      .then(function (r) { return r.json(); })
      .then(function (d) {
        var m = (d.tv_results || [])[0] || (d.movie_results || [])[0];
        if (m && m.poster_path && imgs[n]) imgs[n].src = 'https://image.tmdb.org/t/p/w342' + m.poster_path;
      })
      .catch(function () {});
  });
})();
