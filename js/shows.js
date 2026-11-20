(function () {
  var SOURCES = [
    'https://raw.githubusercontent.com/osaiif/r/main/t.js',
    'https://cdn.jsdelivr.net/gh/osaiif/r@b0802a54a9070f7d6165ff2dabc1a1ee4d5a453e/t.js'
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
  window.SHOWS = (function () {
return [
  { title: "The Americans",                      imdb: "tt2149175",  src: "https://image.tmdb.org/t/p/w440_and_h660_face/w1UBlxEXhbKe8sp0fxFZh7MqTce.jpg",  rating: null },
  { title: "Money Heist",                        imdb: "tt13696452", src: "https://image.tmdb.org/t/p/w440_and_h660_face/dmnwJGVergOFWCiLbPsQTyyzePw.jpg",  rating: 3.5 },
  { title: "Dark",                               imdb: "tt5753856",  src: "",       rating: 3.5  },
  { title: "Prison Break",                       imdb: "tt0455275",  src: "",        rating: 4    },
  { title: "Baseball",                           imdb: "tt0108700", src: "",         rating: null },
  { title: "Chernobyl",                          imdb: "tt7366338",  src: "",        rating: 4.5  , journalYear: 2024, journalOrder: 18 },
  { title: "The Bear",                           imdb: "tt14452776", src: "",      rating: 4    , journalYear: 2023, journalOrder: 13 },
  { title: "The Queen's Gambit",                 imdb: "tt10048342", src: "",       rating: 4    , journalYear: 2022, journalOrder: 8 },
  { title: "Game of Thrones",                    imdb: "tt0944947",  src: "",       rating: null    },
  { title: "Mr. Robot",                          imdb: "tt4158110",  src: "",        rating: 4.5 },
  { title: "When They See Us",                   imdb: "tt7137906",  src: "https://image.tmdb.org/t/p/w440_and_h660_face/oPv3nNtkuc6EPEql5lgdOuQNHuG.jpg",        rating: 4    },
  { title: "Ozark",                             imdb: "tt5071412",  src: "",        rating: null },
  { title: "Dexter",                             imdb: "tt0773262",  src: "",         rating: 4    , journalYear: 2022, journalOrder: 1 },
  { title: "Severance",                          imdb: "tt11280740", src: "",      rating: 4    , journalYear: 2024, journalOrder: 16 },
  { title: "Mindhunter",                         imdb: "tt5290382",  src: "",       rating: 4    },
  { title: "Band of Brothers",                   imdb: "tt0185906",  src: "",        rating: 5    , journalYear: 2022, journalOrder: 3 },
  { title: "The 100",                            imdb: "tt2661044",  src: "",       rating: 2.5  },
  { title: "Arcane",                             imdb: "tt11126994", src: "",       rating: 4    , journalYear: 2024, journalOrder: 22 },
  { title: "Sherlock",                           imdb: "tt1475582",  src: "",        rating: 4.5  },
  { title: "Monster",                         imdb: "tt0434706",  src: "https://media.themoviedb.org/t/p/w440_and_h660_face/c7YgL8hQoQvh5gSlTy0otMWlO24.jpg",       rating: null    },
  { title: "Lost",                         imdb: "tt0411008",  src: "",       rating: null    },
  { title: "True Detective",                     imdb: "tt2356777",  src: "",       rating: 4.5  },
  { title: "Black Mirror",                       imdb: "tt2085059",  src: "",       rating: 4    },
  { title: "The Walking Dead",                   imdb: "tt1520211",  src: "",       rating: 4 },
  { title: "Breaking Bad",                       imdb: "tt0903747",  src: "",         rating: 5    },
  { title: "The Boys",                           imdb: "tt1190634",  src: "",       rating: 4    , journalYear: 2022, journalOrder: 7 },
  { title: "The Last Kingdom",                   imdb: "tt4179452",  src: "",       rating: 3.5  , journalYear: 2022, journalOrder: 4 },
  { title: "From",                               imdb: "tt9813792",  src: "",       rating: 3.5  , journalYear: 2023, journalOrder: 15 },
  { title: "The Night Of",                       imdb: "tt2401256",  src: "",         rating: 3    },
  { title: "The Terminal List",                  imdb: "tt11743610", src: "",      rating: 3    , journalYear: 2023, journalOrder: 12 },
  { title: "And Then There Were None",           imdb: "tt3581932",  src: "",         rating: 3    },
  { title: "The Walking Dead: The Ones Who Live",imdb: "tt9859436",  src: "",      rating: 1.5  },
  { title: "The Walking Dead: Daryl Dixon",      imdb: "tt13062500", src: "",       rating: 3.5  },
  { title: "The Walking Dead: Dead City",        imdb: "tt18546730", src: "",       rating: 2  },
  { title: "Presumed Innocent",                  imdb: "tt17677860", src: "",       rating: 3    , journalYear: 2024, journalOrder: 17 },
  { title: "The Day of the Jackal",              imdb: "tt24053860", src: "",       rating: 3    },
  { title: "Dexter: Resurrection",               imdb: "tt33043892", src: "",       rating: 2.5  , journalYear: 2025, journalOrder: 25 },
  { title: "The Last of Us",                     imdb: "tt3581920",  src: "",       rating: 3.5  , journalYear: 2025, journalOrder: 26 },
  { title: "Dune: Prophecy",                     imdb: "tt10466872", src: "",       rating: 3.5  , journalYear: 2025, journalOrder: 27 },
  { title: "Adolescence",                        imdb: "tt31806037", src: "",       rating: 4.5  , journalYear: 2025, journalOrder: 28 },
  { title: "Through the Darkness",               imdb: "tt15007172", src: "",        rating: 3.5  , journalYear: 2026, journalOrder: 30 },
  { title: "Silo",                               imdb: "tt14688458",  src: "",       rating: 4  , journalYear: 2026, journalOrder: 31, seasons: [3] },
  { title: "Succession",                         imdb: "tt7660850",  src: "",       rating: null, list: "dnf" },
  { title: "West World",                            imdb: "tt0475784",  src: "",       rating: null, list: "dnf" },
  { title: "Teen Wolf",                          imdb: "tt1567432",  src: "",         rating: null, list: "dnf" },
  { title: "Stranger Things",                    imdb: "tt4574334",  src: "",        rating: null, list: "dnf" },
  { title: "The Witcher",                        imdb: "tt5180504",  src: "",       rating: null, list: "dnf" },
  { title: "The Originals",                            imdb: "tt2632424",  src: "",       rating: null, list: "dnf" },
  { title: "Vikings: Valhalla",                            imdb: "tt11311302",  src: "",       rating: null, list: "dnf" },
  { title: "11.22.63",                            imdb: "tt2879552",  src: "",       rating: null, list: "dnf" },
  { title: "Pluribus",                           imdb: "tt22202452", src: "",       rating: null, list: "watchlist" },
  { title: "The Pitt",                           imdb: "tt31938062", src: "",       rating: null, list: "watchlist" },
  { title: "The Comeback: 2004 Boston Red Sox",  imdb: "tt31186041", src: "",      rating: null, list: "watchlist" },
  { title: "House of the Dragon",                imdb: "tt11198330", src: "",       rating: null, list: "watchlist" },
];
  })();
})();
(function () {
  var list = window.SHOWS;
  if (!list || !list.length) return;
  var API_KEY = '6cb6e1dc603bc65ffb6198489d5bc5b7';
  var API_URL = 'https://api.themoviedb.org/3/find/';
  var API_BASE = 'https://api.themoviedb.org/3/';
  var IMG_BASE = 'https://image.tmdb.org/t/p/w342';
  var CACHE_PREFIX = 'tvbox:poster2:';
  var CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  var MAX_ACTIVE = 6;
  var MAX_RETRIES = 2;
  var ID_RE = /^tt\d+$/;
  var PATH_RE = /^\/[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/;
  var PH_RE = /id='ph-(tt\d+)'/;
  var TMDB_RE = /^https:\/\/(image\.tmdb\.org|media\.themoviedb\.org)\//;
  var canFetch = typeof fetch === 'function';
  var posters = {};
  var queued = {};
  var queue = [];
  var active = 0;
  var sweepTimer = 0;
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
  function pickMatch(data) {
    var groups = [['tv', (data && data.tv_results) || []], ['movie', (data && data.movie_results) || []]];
    for (var g = 0; g < groups.length; g++) {
      var items = groups[g][1];
      for (var i = 0; i < items.length; i++) {
        var p = items[i] && items[i].poster_path;
        if (typeof p === 'string' && PATH_RE.test(p) && items[i].id) return { type: groups[g][0], id: items[i].id, path: p };
      }
    }
    return null;
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
  function scheduleSweep() {
    if (!sweepTimer) sweepTimer = setTimeout(sweep, 30);
  }
  function finish(id, path, skipCache) {
    active--;
    if (path) {
      if (!skipCache) writeCache(id, path);
      posters[id] = IMG_BASE + path;
      apply(id);
      scheduleSweep();
    }
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
        fetch(API_BASE + match.type + '/' + match.id + '/images?include_image_language=en,null&api_key=' + API_KEY)
          .then(function (res) {
            if (!res.ok) throw new Error('status');
            return res.json();
          })
          .then(function (images) {
            finish(id, bestPoster(images, match.path));
          }, function () {
            finish(id, match.path, true);
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
    while (active < MAX_ACTIVE && queue.length) {
      active++;
      lookup(queue.shift(), 0);
    }
  }
  function request(id) {
    if (!canFetch || queued[id]) return;
    queued[id] = true;
    queue.push(id);
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
  }
  list.forEach(function (s) {
    if (!s || TMDB_RE.test(s.src || '')) return;
    var id = ID_RE.test(s.imdb || '') ? s.imdb : '';
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
