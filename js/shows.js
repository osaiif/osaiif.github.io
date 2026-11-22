(function () {
  var SOURCES = [
    'https://raw.githubusercontent.com/osaiif/r/main/t.js',
    'https://cdn.jsdelivr.net/gh/osaiif/r@main/t.js'
  ];
  function load(url) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, false);
      xhr.send(null);
      if (xhr.status >= 200 && xhr.status < 300 && xhr.responseText) {
        (0, eval)(xhr.responseText);
        if (typeof window.SHOWS !== 'undefined' && window.SHOWS && window.SHOWS.length) return true;
      }
    } catch (e) {}
    return false;
  }
  for (var i = 0; i < SOURCES.length; i++) {
    if (load(SOURCES[i])) return;
  }
  window.SHOWS = [
    { id: "tt2149175" },
    { id: "tt13696452", r: 3.5 },
    { id: "tt5753856", r: 3.5 },
    { id: "tt0455275", r: 4 },
    { id: "tt0108700" },
    { id: "tt0773262", r: 4, j: 2022 },
    { id: "tt0185906", r: 5, j: 2022 },
    { id: "tt4179452", r: 3.5, j: 2022 },
    { id: "tt0944947" },
    { id: "tt4158110", r: 4.5 },
    { id: "tt7137906", r: 4 },
    { id: "tt5071412" },
    { id: "tt1190634", r: 4, j: 2022 },
    { id: "tt10048342", r: 4, j: 2022 },
    { id: "tt5290382", r: 4 },
    { id: "tt11743610", r: 3, j: 2023 },
    { id: "tt2661044", r: 2.5 },
    { id: "tt14452776", r: 4, j: 2023 },
    { id: "tt1475582", r: 4.5 },
    { id: "tt0434706" },
    { id: "tt0411008" },
    { id: "tt2356777", r: 4.5 },
    { id: "tt2085059", r: 4 },
    { id: "tt1520211", r: 4 },
    { id: "tt0903747", r: 5 },
    { id: "tt9813792", r: 3.5, j: 2023 },
    { id: "tt11280740", r: 4, j: 2024 },
    { id: "tt17677860", r: 3, j: 2024 },
    { id: "tt2401256", r: 3 },
    { id: "tt7366338", r: 4.5, j: 2024 },
    { id: "tt3581932", r: 3 },
    { id: "tt9859436", r: 1.5 },
    { id: "tt13062500", r: 3.5 },
    { id: "tt18546730", r: 2 },
    { id: "tt11126994", r: 4, j: 2024 },
    { id: "tt24053860", r: 3 },
    { id: "tt33043892", r: 2.5, j: 2025 },
    { id: "tt3581920", r: 3.5, j: 2025 },
    { id: "tt10466872", r: 3.5, j: 2025 },
    { id: "tt31806037", r: 4.5, j: 2025 },
    { id: "tt15007172", r: 3.5, j: 2026 },
    { id: "tt7660850", list: "dnf" },
    { id: "tt0475784", list: "dnf" },
    { id: "tt1567432", list: "dnf" },
    { id: "tt4574334", list: "dnf" },
    { id: "tt5180504", list: "dnf" },
    { id: "tt11311302", list: "dnf" },
    { id: "tt2879552", list: "dnf" },
    { id: "tt22202452", list: "watchlist" },
    { id: "tt31938062", list: "watchlist" },
    { id: "tt31186041", list: "watchlist" },
    { id: "tt11198330", list: "watchlist" },
    { id: "tt10574558", list: "watchlist" },
    { id: "tt7440726", list: "watchlist" },
    { id: "tt30423279", list: "watchlist" },
    { id: "tt15435876", list: "watchlist" },
    { id: "tt10234724", list: "watchlist" },
    { id: "tt31314751", list: "watchlist" },
    { id: "tt22248376", list: "watchlist" },
    { id: "tt1355642", list: "watchlist" },
    { id: "tt32612521", list: "watchlist" },
    { id: "tt13309742", list: "watchlist" },
    { id: "tt2788316", list: "watchlist" },
    { id: "tt28013708", list: "watchlist" },
    { id: "tt1877514", list: "watchlist" },
    { id: "tt5626028", list: "watchlist" },
  ];
})();
(function () {
  var list = window.SHOWS;
  if (!list || !list.length) return;
  var API_KEY = '6cb6e1dc603bc65ffb6198489d5bc5b7';
  var API_URL = 'https://api.themoviedb.org/3/find/';
  var API_BASE = 'https://api.themoviedb.org/3/';
  var IMG_BASE = 'https://image.tmdb.org/t/p/w342';
  var CACHE_PREFIX = 'tvbox:poster2:';
  var TITLE_PREFIX = 'tvbox:title1:';
  var CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  var MAX_ACTIVE = 6;
  var MAX_RETRIES = 2;
  var ID_RE = /^tt\d+$/;
  var PATH_RE = /^\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/;
  var PH_RE = /id='ph-(tt\d+)'/;
  var TMDB_RE = /^https:\/\/(image\.tmdb\.org|media\.themoviedb\.org)\//;
  var canFetch = typeof fetch === 'function';
  var posters = {};
  var titles = {};
  var queued = {};
  var queue = [];
  var lowQueue = [];
  var pendingTitles = [];
  var active = 0;
  var sweepTimer = 0;
  var resortTimer = 0;
  function placeholder(id) {
    return "data:image/svg+xml,%3Csvg%20xmlns='http://www.w3.org/2000/svg'%20width='150'%20height='225'%20id='ph-" + id + "'/%3E";
  }
  function readCache(id) {
    try {
      var raw = localStorage.getItem(CACHE_PREFIX + id);
      if (!raw) return '';
      var o = JSON.parse(raw);
      if (!o || typeof o.p !== 'string' || typeof o.t !== 'number') return '';
      if (Date.now() - o.t > CACHE_TTL_MS || !PATH_RE.test(o.p)) return '';
      return o.p;
    } catch (e) {
      return '';
    }
  }
  function writeCache(id, path) {
    try {
      localStorage.setItem(CACHE_PREFIX + id, JSON.stringify({ p: path, t: Date.now() }));
    } catch (e) {}
  }
  function readTitle(id) {
    try {
      var v = localStorage.getItem(TITLE_PREFIX + id);
      return typeof v === 'string' ? v : '';
    } catch (e) {
      return '';
    }
  }
  function writeTitle(id, name) {
    try {
      localStorage.setItem(TITLE_PREFIX + id, name);
    } catch (e) {}
  }
  function pickMatch(data) {
    var groups = [['tv', (data && data.tv_results) || []], ['movie', (data && data.movie_results) || []]];
    var first = null;
    for (var g = 0; g < groups.length; g++) {
      var items = groups[g][1];
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (!it || !it.id) continue;
        var name = it.name || it.title || '';
        var p = it.poster_path;
        if (typeof p === 'string' && PATH_RE.test(p)) return { type: groups[g][0], id: it.id, path: p, name: name };
        if (!first) first = { type: groups[g][0], id: it.id, path: '', name: name };
      }
    }
    return first;
  }
  function bestPoster(data, fallback) {
    var posters = (data && data.posters) || [];
    var best = null;
    for (var i = 0; i < posters.length; i++) {
      var p = posters[i];
      if (!p || typeof p.file_path !== 'string' || !PATH_RE.test(p.file_path)) continue;
      var votes = p.vote_count || 0;
      var avg = p.vote_average || 0;
      if (!best || votes > best.votes || (votes === best.votes && avg > best.avg)) best = { path: p.file_path, votes: votes, avg: avg };
    }
    return best && best.votes > 0 ? best.path : fallback;
  }
  function apply(id) {
    var marker = "id='ph-" + id + "'";
    list.forEach(function (s) {
      if (s && typeof s.src === 'string' && s.src.indexOf(marker) !== -1) s.src = posters[id];
    });
  }
  function patchTitle(id, name) {
    var cards = document.querySelectorAll('[data-imdb="' + id + '"]');
    for (var i = 0; i < cards.length; i++) {
      if (cards[i].hasAttribute('data-title')) cards[i].setAttribute('data-title', name);
    }
    var links = document.querySelectorAll('a[href="/show/?imdb=' + id + '"]');
    for (var j = 0; j < links.length; j++) {
      var a = links[j];
      if (a.classList.contains('entry-title')) {
        a.textContent = name;
      } else if (!a.classList.contains('stx-hl')) {
        var imgs = a.getElementsByTagName('img');
        for (var k = 0; k < imgs.length; k++) imgs[k].alt = name;
      }
    }
  }
  function resort() {
    resortTimer = 0;
    var el = document.querySelector('.sort-option.-active');
    var key = el && el.getAttribute('data-key');
    if (key && key.indexOf('name_') === 0) el.click();
  }
  function setTitle(id, name) {
    if (!name || titles[id] === name) return;
    titles[id] = name;
    writeTitle(id, name);
    list.forEach(function (s) {
      if (s && s.imdb === id) s.title = name;
    });
    patchTitle(id, name);
    if (!resortTimer) resortTimer = setTimeout(resort, 150);
  }
  function scheduleSweep() {
    if (!sweepTimer) sweepTimer = setTimeout(sweep, 30);
  }
  function store(id, path) {
    if (!path) return;
    writeCache(id, path);
    posters[id] = IMG_BASE + path;
    apply(id);
    scheduleSweep();
  }
  function finish(id, path) {
    active--;
    store(id, path);
    pump();
  }
  function lookup(id, attempt) {
    fetch(API_URL + encodeURIComponent(id) + '?external_source=imdb_id&api_key=' + API_KEY)
      .then(function (res) {
        if (!res.ok) {
          var err = new Error('status');
          err.status = res.status;
          throw err;
        }
        return res.json();
      })
      .then(function (data) {
        var match = pickMatch(data);
        if (!match) {
          finish(id, '');
          return;
        }
        setTitle(id, match.name);
        if (!match.path || posters[id]) {
          finish(id, '');
          return;
        }
        fetch(API_BASE + match.type + '/' + match.id + '/images?include_image_language=en,null&api_key=' + API_KEY)
          .then(function (res) {
            if (!res.ok) throw new Error('status');
            return res.json();
          })
          .then(function (images) {
            finish(id, bestPoster(images, match.path));
          }, function () {
            active--;
            posters[id] = IMG_BASE + match.path;
            apply(id);
            scheduleSweep();
            pump();
          });
      }, function (err) {
        var status = err && err.status;
        if (attempt < MAX_RETRIES && (!status || status === 429 || status >= 500)) {
          setTimeout(function () { lookup(id, attempt + 1); }, 1000 * (attempt + 1));
        } else {
          finish(id, '');
        }
      });
  }
  function pump() {
    while (active < MAX_ACTIVE && (queue.length || lowQueue.length)) {
      active++;
      lookup(queue.length ? queue.shift() : lowQueue.shift(), 0);
    }
  }
  function request(id, low) {
    if (!canFetch) return;
    if (queued[id]) {
      var k = low ? -1 : lowQueue.indexOf(id);
      if (k !== -1) {
        lowQueue.splice(k, 1);
        queue.push(id);
        pump();
      }
      return;
    }
    queued[id] = true;
    (low ? lowQueue : queue).push(id);
    pump();
  }
  function sweep() {
    sweepTimer = 0;
    var imgs = document.getElementsByTagName('img');
    for (var i = 0; i < imgs.length; i++) {
      var attr = imgs[i].getAttribute('src');
      if (!attr || attr.indexOf("id='ph-") === -1) continue;
      var m = PH_RE.exec(attr);
      if (!m) continue;
      if (posters[m[1]]) imgs[i].setAttribute('src', posters[m[1]]);
      else request(m[1]);
    }
    var ids = pendingTitles;
    pendingTitles = [];
    ids.forEach(function (id) { request(id, true); });
  }
  var order = 0;
  list.forEach(function (s) {
    if (!s) return;
    s.imdb = s.id || s.imdb || '';
    s.rating = s.r != null ? s.r : (s.rating != null ? s.rating : null);
    s.journalYear = s.j || s.journalYear;
    if (s.journalYear && s.journalOrder == null) s.journalOrder = ++order;
    var id = ID_RE.test(s.imdb) ? s.imdb : '';
    var name = id ? readTitle(id) : '';
    if (name) titles[id] = name;
    s.title = name || s.title || '';
    if (id && !s.title) pendingTitles.push(id);
    if (TMDB_RE.test(s.src || '')) return;
    var cached = id ? readCache(id) : '';
    if (cached) posters[id] = IMG_BASE + cached;
    s.src = id ? (posters[id] || placeholder(id)) : placeholder('');
  });
  if (typeof MutationObserver === 'function') {
    new MutationObserver(scheduleSweep).observe(document.documentElement, { childList: true, subtree: true });
  }
  document.addEventListener('DOMContentLoaded', scheduleSweep);
  window.addEventListener('load', scheduleSweep);
  scheduleSweep();
})();
