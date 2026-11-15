(function (global) {
  'use strict';
  var TMDB_BASE = 'https://api.themoviedb.org/3';
  var TMDB_API_KEYS = [
    '6cb6e1dc603bc65ffb6198489d5bc5b7',
    '2e7b2fe7002c21f45f08c0a03aa9df52',
    '51952b66efcd80289c3ba5f8f8044e6a'
  ];
  var TMDB_CACHE_NAME = 'tvbox-tmdb-v1';
  var TMDB_CACHE_TTL_MS = 60 * 60 * 1000;
  var TMDB_MAX_ACTIVE = 10;
  var TMDB_HEDGE_MS = 300;
  var tmdbMemory = {};
  var tmdbPending = {};
  var tmdbQueue = [];
  var tmdbActive = 0;
  var tmdbCursor = Math.floor(Math.random() * TMDB_API_KEYS.length);
  var tmdbCooldown = {};
  var tmdbLatency = {};
  function tmdbAbortError() {
    var e = new Error('Aborted');
    e.name = 'AbortError';
    return e;
  }
  function tmdbRetryable(err) {
    var s = err && err.status;
    return !s || s === 401 || s === 403 || s === 429 || s >= 500;
  }
  function tmdbRecord(idx, ms) {
    var old = tmdbLatency[idx];
    tmdbLatency[idx] = old ? old * 0.6 + ms * 0.4 : ms;
  }
  function tmdbPickKey(tried) {
    var now = Date.now();
    var best = -1;
    var fallback = -1;
    for (var i = 0; i < TMDB_API_KEYS.length; i++) {
      var idx = (tmdbCursor + i) % TMDB_API_KEYS.length;
      if (tried[idx]) continue;
      if ((tmdbCooldown[idx] || 0) > now) {
        if (fallback < 0) fallback = idx;
        continue;
      }
      if (best < 0 || (tmdbLatency[idx] || 0) < (tmdbLatency[best] || 0)) best = idx;
    }
    if (best < 0) return fallback;
    tmdbCursor = best + 1;
    return best;
  }
  function tmdbRun(url, signal) {
    return new Promise(function (resolve, reject) {
      var tried = {};
      var starts = {};
      var done = {};
      var controllers = [];
      var inflight = 0;
      var settled = false;
      var lastError = null;
      var timer = null;
      function finish(fn, value) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        Object.keys(starts).forEach(function (k) {
          if (!done[k]) tmdbRecord(k, Date.now() - starts[k]);
        });
        controllers.forEach(function (c) { c.abort(); });
        fn(value);
      }
      function launch() {
        if (settled) return;
        var idx = tmdbPickKey(tried);
        if (idx < 0) {
          if (!inflight) finish(reject, lastError || new Error('TMDB request failed'));
          return;
        }
        tried[idx] = true;
        starts[idx] = Date.now();
        inflight++;
        var controller = new AbortController();
        controllers.push(controller);
        fetch(url + '&api_key=' + TMDB_API_KEYS[idx], { signal: controller.signal })
          .then(function (res) {
            if (!res.ok) {
              var err = new Error('TMDB request failed (' + res.status + ')');
              err.status = res.status;
              if (res.status === 429) tmdbCooldown[idx] = Date.now() + (parseInt(res.headers.get('retry-after'), 10) || 2) * 1000;
              if (res.status === 401 || res.status === 403) tmdbCooldown[idx] = Date.now() + 10 * 60 * 1000;
              throw err;
            }
            return res.text();
          })
          .then(function (text) {
            done[idx] = true;
            tmdbRecord(idx, Date.now() - starts[idx]);
            finish(resolve, text);
          })
          .catch(function (err) {
            inflight--;
            if (settled || (err && err.name === 'AbortError')) return;
            if (!lastError || (lastError.status === 401 || lastError.status === 403)) lastError = err;
            if (!tmdbRetryable(err)) {
              finish(reject, err);
              return;
            }
            launch();
          });
        clearTimeout(timer);
        timer = setTimeout(launch, TMDB_HEDGE_MS);
      }
      if (signal) {
        if (signal.aborted) {
          reject(tmdbAbortError());
          return;
        }
        signal.addEventListener('abort', function () {
          finish(reject, tmdbAbortError());
        });
      }
      launch();
    });
  }
  function tmdbPump() {
    while (tmdbActive < TMDB_MAX_ACTIVE && tmdbQueue.length) {
      var item = tmdbQueue.shift();
      if (item.signal.aborted) {
        item.reject(tmdbAbortError());
        continue;
      }
      tmdbActive++;
      tmdbRun(item.url, item.signal).then(item.resolve, item.reject).then(function () {
        tmdbActive--;
        tmdbPump();
      });
    }
  }
  function tmdbSchedule(url, signal) {
    return new Promise(function (resolve, reject) {
      tmdbQueue.push({ url: url, signal: signal, resolve: resolve, reject: reject });
      tmdbPump();
    });
  }
  function tmdbDiskRead(url) {
    if (!window.caches) return Promise.resolve(null);
    return caches.open(TMDB_CACHE_NAME)
      .then(function (cache) { return cache.match(url); })
      .then(function (res) {
        if (!res) return null;
        var ts = parseInt(res.headers.get('x-ts'), 10);
        if (!ts || Date.now() - ts > TMDB_CACHE_TTL_MS) return null;
        return res.text();
      })
      .catch(function () { return null; });
  }
  function tmdbDiskWrite(url, text) {
    if (!window.caches) return;
    caches.open(TMDB_CACHE_NAME)
      .then(function (cache) {
        return cache.put(url, new Response(text, { headers: { 'x-ts': String(Date.now()) } }));
      })
      .catch(function () {});
  }
  function tmdbDiskPrune() {
    try {
      var last = parseInt(localStorage.getItem('tvbox:tmdb:pruned'), 10) || 0;
      if (!window.caches || Date.now() - last < 24 * 60 * 60 * 1000) return;
      localStorage.setItem('tvbox:tmdb:pruned', String(Date.now()));
    } catch (e) {
      return;
    }
    caches.open(TMDB_CACHE_NAME).then(function (cache) {
      return cache.keys().then(function (reqs) {
        return Promise.all(reqs.map(function (req) {
          return cache.match(req).then(function (res) {
            var ts = res ? parseInt(res.headers.get('x-ts'), 10) : 0;
            if (!ts || Date.now() - ts > TMDB_CACHE_TTL_MS) return cache.delete(req);
          });
        }));
      });
    }).catch(function () {});
  }
  setTimeout(tmdbDiskPrune, 4000);
  function tmdbFetch(path, params, signal) {
    var sep = path.indexOf('?') > -1 ? '&' : '?';
    var url = TMDB_BASE + path + sep + '_=1' + (params ? '&' + params : '');
    if (signal && signal.aborted) return Promise.reject(tmdbAbortError());
    var hit = tmdbMemory[url];
    if (hit && Date.now() - hit.ts < TMDB_CACHE_TTL_MS) return Promise.resolve(JSON.parse(hit.text));
    var entry = tmdbPending[url];
    if (!entry) {
      var controller = new AbortController();
      entry = { refs: 0, controller: controller };
      entry.promise = new Promise(function (resolve, reject) {
        var won = false;
        tmdbDiskRead(url).then(function (cached) {
          if (cached === null || won) return;
          won = true;
          controller.abort();
          resolve(cached);
        });
        tmdbSchedule(url, controller.signal).then(function (text) {
          if (won) return;
          won = true;
          tmdbDiskWrite(url, text);
          resolve(text);
        }, function (err) {
          if (won) return;
          won = true;
          reject(err);
        });
      }).then(function (text) {
        tmdbMemory[url] = { text: text, ts: Date.now() };
        if (tmdbPending[url] === entry) delete tmdbPending[url];
        return text;
      }, function (err) {
        if (tmdbPending[url] === entry) delete tmdbPending[url];
        throw err;
      });
      tmdbPending[url] = entry;
    }
    entry.refs++;
    return new Promise(function (resolve, reject) {
      var done = false;
      function release() {
        if (done) return;
        done = true;
        entry.refs--;
        if (entry.refs <= 0) {
          if (tmdbPending[url] === entry) delete tmdbPending[url];
          entry.controller.abort();
        }
      }
      if (signal) {
        signal.addEventListener('abort', function () {
          if (done) return;
          release();
          reject(tmdbAbortError());
        });
      }
      entry.promise.then(function (text) {
        if (done) return;
        done = true;
        resolve(JSON.parse(text));
      }, function (err) {
        if (done) return;
        done = true;
        reject(err);
      });
    });
  }
  var CACHE_PREFIX = 'tvbox:tmdb2:';
  var CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  var SORT_GROUPS = [
    {
      id: 'date',
      label: 'Date',
      options: [
        { key: 'date_desc', label: 'Newest' },
        { key: 'date_asc', label: 'Oldest' }
      ]
    },
    {
      id: 'mine',
      label: 'Saif\'s rating',
      options: [
        { key: 'mine_desc', label: 'Highest' },
        { key: 'mine_asc', label: 'Lowest' }
      ]
    },
    {
      id: 'avg',
      label: 'Average rating',
      options: [
        { key: 'avg_desc', label: 'Highest' },
        { key: 'avg_asc', label: 'Lowest' }
      ]
    },
    {
      id: 'pop',
      label: 'Popularity',
      options: [
        { key: 'pop_desc', label: 'Most' },
        { key: 'pop_asc', label: 'Least' }
      ]
    },
    {
      id: 'name',
      label: 'Name',
      options: [
        { key: 'name_asc', label: 'A\u2013Z' },
        { key: 'name_desc', label: 'Z\u2013A' }
      ]
    }
  ];
  var NEEDS_TMDB = {
    avg_desc: true,
    avg_asc: true,
    pop_desc: true,
    pop_asc: true
  };
  var SORT_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M4 6h16M4 12h11M4 18h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>' +
    '</svg>';
  function readCache(imdbId) {
    try {
      var raw = localStorage.getItem(CACHE_PREFIX + imdbId);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || (Date.now() - parsed.ts) > CACHE_TTL_MS) return null;
      return parsed;
    } catch (e) {
      return null;
    }
  }
  function writeCache(imdbId, info) {
    try {
      localStorage.setItem(CACHE_PREFIX + imdbId, JSON.stringify({
        avg: info.avg,
        popularity: info.popularity,
        ts: Date.now()
      }));
    } catch (e) {
    }
  }
  function fetchTmdbInfo(imdbId) {
    var cached = readCache(imdbId);
    if (cached) return Promise.resolve(cached);
    return tmdbFetch('/find/' + encodeURIComponent(imdbId), 'external_source=imdb_id')
      .catch(function () { return null; })
      .then(function (data) {
        var match = data && data.tv_results && data.tv_results[0];
        var info = {
          avg: (match && typeof match.vote_average === 'number') ? match.vote_average : null,
          popularity: (match && typeof match.popularity === 'number') ? match.popularity : null
        };
        if (data) writeCache(imdbId, info);
        return info;
      })
      .catch(function () {
        return { avg: null, popularity: null };
      });
  }
  function fetchAllTmdbInfo(imdbIds) {
    var CONCURRENCY = 6;
    var results = {};
    var queue = imdbIds.slice();
    function worker() {
      var id = queue.shift();
      if (!id) return Promise.resolve();
      return fetchTmdbInfo(id).then(function (info) {
        results[id] = info;
        return worker();
      });
    }
    var workers = [];
    var i;
    for (i = 0; i < Math.min(CONCURRENCY, queue.length); i++) {
      workers.push(worker());
    }
    return Promise.all(workers).then(function () { return results; });
  }
  function numOrNull(v) {
    if (v === '' || v === undefined || v === null) return null;
    var n = parseFloat(v);
    return isNaN(n) ? null : n;
  }
  var collator = (typeof Intl !== 'undefined' && Intl.Collator)
    ? new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
    : null;
  function nameKey(title) {
    return String(title || '').trim().replace(/^(the|an|a)\s+/i, '');
  }
  function compareNames(a, b) {
    var x = nameKey(a);
    var y = nameKey(b);
    return collator ? collator.compare(x, y) : x.localeCompare(y);
  }
  function compareNullable(av, bv, desc) {
    if (av === null && bv === null) return 0;
    if (av === null) return 1;
    if (bv === null) return -1;
    return desc ? (bv - av) : (av - bv);
  }
  function init(config) {
    var grid = config.grid;
    var mount = config.mount;
    var storageKey = config.storageKey || 'tvbox:sort';
    var hidden = config.hide || [];
    if (!grid || !mount) return;
    var cards = Array.prototype.slice.call(grid.children).filter(function (el) {
      return el.classList && el.classList.contains('card');
    });
    cards.forEach(function (card, i) { card.dataset.order = String(i); });
    mount.innerHTML = '';
    var wrapper = document.createElement('div');
    wrapper.className = 'sort-menu-wrapper';
    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'sort-trigger';
    trigger.setAttribute('aria-label', 'Sort shows');
    trigger.setAttribute('aria-haspopup', 'true');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML = SORT_SVG;
    var menu = document.createElement('div');
    menu.className = 'sort-menu';
    menu.setAttribute('role', 'menu');
    var optionEls = {};
    function addRow(labelText, options) {
      var row = document.createElement('div');
      row.className = 'sort-row';
      var label = document.createElement('span');
      label.className = 'sort-label';
      label.textContent = labelText;
      var choices = document.createElement('div');
      choices.className = 'sort-choices';
      options.forEach(function (opt) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sort-option';
        btn.setAttribute('role', 'menuitemradio');
        btn.setAttribute('aria-checked', 'false');
        btn.dataset.key = opt.key;
        btn.textContent = opt.label;
        choices.appendChild(btn);
        optionEls[opt.key] = btn;
      });
      row.appendChild(label);
      row.appendChild(choices);
      menu.appendChild(row);
    }
    addRow('Order', [{ key: 'default', label: 'Default' }]);
    SORT_GROUPS.forEach(function (group) {
      if (hidden.indexOf(group.id) !== -1) return;
      addRow(group.label, group.options);
    });
    wrapper.appendChild(trigger);
    wrapper.appendChild(menu);
    mount.appendChild(wrapper);
    var tmdbCache = {};
    var tmdbLoaded = false;
    var requestId = 0;
    function setActive(key) {
      Object.keys(optionEls).forEach(function (k) {
        var on = k === key;
        optionEls[k].classList.toggle('-active', on);
        optionEls[k].setAttribute('aria-checked', on ? 'true' : 'false');
      });
      trigger.classList.toggle('-active', key !== 'default');
    }
    function openMenu() {
      menu.classList.add('-open');
      trigger.setAttribute('aria-expanded', 'true');
    }
    function closeMenu() {
      menu.classList.remove('-open');
      trigger.setAttribute('aria-expanded', 'false');
    }
    trigger.addEventListener('click', function (e) {
      e.stopPropagation();
      if (menu.classList.contains('-open')) {
        closeMenu();
      } else {
        openMenu();
      }
    });
    document.addEventListener('click', function (e) {
      if (!wrapper.contains(e.target)) closeMenu();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeMenu();
    });
    function orderOf(card) {
      return parseInt(card.dataset.order, 10);
    }
    function compareBy(key) {
      return function (a, b) {
        var r = 0;
        switch (key) {
          case 'date_desc':
          case 'date_asc':
            r = compareNullable(numOrNull(a.dataset.journal), numOrNull(b.dataset.journal), key === 'date_desc');
            break;
          case 'name_asc':
            r = compareNames(a.dataset.title, b.dataset.title);
            break;
          case 'name_desc':
            r = compareNames(b.dataset.title, a.dataset.title);
            break;
          case 'mine_desc':
          case 'mine_asc':
            r = compareNullable(numOrNull(a.dataset.myRating), numOrNull(b.dataset.myRating), key === 'mine_desc');
            break;
          case 'avg_desc':
          case 'avg_asc':
            r = compareNullable(
              tmdbCache[a.dataset.imdb] ? tmdbCache[a.dataset.imdb].avg : null,
              tmdbCache[b.dataset.imdb] ? tmdbCache[b.dataset.imdb].avg : null,
              key === 'avg_desc'
            );
            break;
          case 'pop_desc':
          case 'pop_asc':
            r = compareNullable(
              tmdbCache[a.dataset.imdb] ? tmdbCache[a.dataset.imdb].popularity : null,
              tmdbCache[b.dataset.imdb] ? tmdbCache[b.dataset.imdb].popularity : null,
              key === 'pop_desc'
            );
            break;
          default:
            return orderOf(a) - orderOf(b);
        }
        return r !== 0 ? r : orderOf(a) - orderOf(b);
      };
    }
    function applySort(key) {
      var sorted = cards.slice().sort(compareBy(key));
      var frag = document.createDocumentFragment();
      sorted.forEach(function (el) { frag.appendChild(el); });
      grid.appendChild(frag);
      setActive(key);
      try { localStorage.setItem(storageKey, key); } catch (e) {}
    }
    function ensureTmdbLoaded(done) {
      if (tmdbLoaded) { done(); return; }
      var ids = cards
        .map(function (c) { return c.dataset.imdb; })
        .filter(function (id) { return !!id; });
      trigger.classList.add('-loading');
      fetchAllTmdbInfo(ids).then(function (results) {
        tmdbCache = results;
        tmdbLoaded = Object.keys(results).some(function (id) {
          return results[id].avg !== null || results[id].popularity !== null;
        });
        trigger.classList.remove('-loading');
        done();
      });
    }
    function choose(key) {
      var id = ++requestId;
      if (NEEDS_TMDB[key]) {
        ensureTmdbLoaded(function () {
          if (id === requestId) applySort(key);
        });
      } else {
        applySort(key);
      }
    }
    menu.addEventListener('click', function (e) {
      var target = e.target;
      if (!target.classList || !target.classList.contains('sort-option')) return;
      closeMenu();
      choose(target.dataset.key);
    });
    var saved = null;
    try { saved = localStorage.getItem(storageKey); } catch (e) {}
    if (saved && optionEls[saved]) {
      choose(saved);
    } else {
      setActive('default');
    }
  }
  global.TVSort = { init: init };
})(window);
