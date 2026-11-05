(function (global) {
  'use strict';
  var TMDB_BASE = 'https://api.themoviedb.org/3';
  var TMDB_API_KEYS = [
    '6cb6e1dc603bc65ffb6198489d5bc5b7',
    '2e7b2fe7002c21f45f08c0a03aa9df52',
    '51952b66efcd80289c3ba5f8f8044e6a'
  ];
  function tmdbFetch(path, params, signal) {
    return new Promise(function (resolve, reject) {
      var controllers = [];
      var failures = 0;
      var settled = false;
      var bestError = null;
      var sep = path.indexOf('?') > -1 ? '&' : '?';
      var extra = params ? '&' + params : '';
      function isAuthError(err) {
        return !!err && (err.status === 401 || err.status === 403);
      }
      function abortAll(exceptIndex) {
        controllers.forEach(function (c, i) {
          if (c && i !== exceptIndex) c.abort();
        });
      }
      if (signal) {
        if (signal.aborted) {
          var abortErr = new Error('Aborted');
          abortErr.name = 'AbortError';
          reject(abortErr);
          return;
        }
        signal.addEventListener('abort', function () {
          if (settled) return;
          settled = true;
          abortAll(-1);
          var e = new Error('Aborted');
          e.name = 'AbortError';
          reject(e);
        });
      }
      function onFail(err) {
        if (settled) return;
        failures++;
        if (!bestError || (isAuthError(bestError) && !isAuthError(err))) bestError = err;
        if (failures === TMDB_API_KEYS.length) {
          settled = true;
          reject(bestError);
        }
      }
      TMDB_API_KEYS.forEach(function (key, index) {
        var controller = typeof AbortController === 'function' ? new AbortController() : null;
        controllers.push(controller);
        fetch(
          TMDB_BASE + path + sep + 'api_key=' + key + extra,
          controller ? { signal: controller.signal } : undefined
        )
          .then(function (res) {
            if (!res.ok) {
              var err = new Error('TMDB request failed (' + res.status + ')');
              err.status = res.status;
              throw err;
            }
            return res.json();
          })
          .then(function (data) {
            if (settled) return;
            settled = true;
            abortAll(index);
            resolve(data);
          })
          .catch(onFail);
      });
    });
  }
  var CACHE_PREFIX = 'tvbox:tmdb:';
  var CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  var SORT_GROUPS = [
    {
      label: 'Date',
      options: [
        { key: 'date_desc', label: 'Newest first' },
        { key: 'date_asc', label: 'Earliest first' }
      ]
    },
    {
      label: 'Average Rating',
      options: [
        { key: 'avg_desc', label: 'Highest first' },
        { key: 'avg_asc', label: 'Lowest first' }
      ]
    },
    {
      label: 'Saif\'s Rating',
      options: [
        { key: 'mine_desc', label: 'Highest first' },
        { key: 'mine_asc', label: 'Lowest first' }
      ]
    },
    {
      label: 'Popularity',
      options: [
        { key: 'pop_desc', label: 'Most popular first' },
        { key: 'pop_asc', label: 'Least popular first' }
      ]
    },
    {
      label: 'Name',
      options: [
        { key: 'name_asc', label: 'A \u2192 Z' },
        { key: 'name_desc', label: 'Z \u2192 A' }
      ]
    }
  ];
  var NEEDS_TMDB = {
    avg_desc: true,
    avg_asc: true,
    pop_desc: true,
    pop_asc: true
  };
  var GEAR_SVG =
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.42-.48-.42h-3.84c-.24 0-.44.18-.47.42l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.86c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94L2.85 14.5c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.03.24.24.42.48.42h3.84c.24 0 .44-.18.47-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.56ZM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6Z"/>' +
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
        writeCache(imdbId, info);
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
  function init(config) {
    var grid = config.grid;
    var mount = config.mount;
    var storageKey = config.storageKey || 'tvbox:sort';
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
    trigger.innerHTML = GEAR_SVG;
    var menu = document.createElement('div');
    menu.className = 'sort-menu';
    menu.setAttribute('role', 'menu');
    var optionEls = {};
    var defaultBtn = document.createElement('button');
    defaultBtn.type = 'button';
    defaultBtn.className = 'sort-option';
    defaultBtn.dataset.key = 'default';
    defaultBtn.textContent = 'Default order';
    menu.appendChild(defaultBtn);
    optionEls['default'] = defaultBtn;
    var topDivider = document.createElement('div');
    topDivider.className = 'sort-divider';
    menu.appendChild(topDivider);
    SORT_GROUPS.forEach(function (group, gi) {
      var groupLabel = document.createElement('div');
      groupLabel.className = 'sort-group-label';
      groupLabel.textContent = group.label;
      menu.appendChild(groupLabel);
      group.options.forEach(function (opt) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sort-option';
        btn.dataset.key = opt.key;
        btn.textContent = opt.label;
        menu.appendChild(btn);
        optionEls[opt.key] = btn;
      });
      if (gi < SORT_GROUPS.length - 1) {
        var divider = document.createElement('div');
        divider.className = 'sort-divider';
        menu.appendChild(divider);
      }
    });
    wrapper.appendChild(trigger);
    wrapper.appendChild(menu);
    mount.appendChild(wrapper);
    var tmdbCache = {};
    var tmdbLoaded = false;
    function setActive(key) {
      Object.keys(optionEls).forEach(function (k) {
        optionEls[k].classList.toggle('-active', k === key);
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
    function compareBy(key) {
      return function (a, b) {
        var av, bv;
        switch (key) {
          case 'date_desc':
            return parseInt(b.dataset.order, 10) - parseInt(a.dataset.order, 10);
          case 'date_asc':
            return parseInt(a.dataset.order, 10) - parseInt(b.dataset.order, 10);
          case 'name_asc':
            return (a.dataset.title || '').localeCompare(b.dataset.title || '');
          case 'name_desc':
            return (b.dataset.title || '').localeCompare(a.dataset.title || '');
          case 'mine_desc':
          case 'mine_asc':
            av = numOrNull(a.dataset.myRating);
            bv = numOrNull(b.dataset.myRating);
            if (av === null && bv === null) return 0;
            if (av === null) return 1;
            if (bv === null) return -1;
            return key === 'mine_desc' ? (bv - av) : (av - bv);
          case 'avg_desc':
          case 'avg_asc':
            av = tmdbCache[a.dataset.imdb] ? tmdbCache[a.dataset.imdb].avg : null;
            bv = tmdbCache[b.dataset.imdb] ? tmdbCache[b.dataset.imdb].avg : null;
            if (av === null && bv === null) return 0;
            if (av === null) return 1;
            if (bv === null) return -1;
            return key === 'avg_desc' ? (bv - av) : (av - bv);
          case 'pop_desc':
          case 'pop_asc':
            av = tmdbCache[a.dataset.imdb] ? tmdbCache[a.dataset.imdb].popularity : null;
            bv = tmdbCache[b.dataset.imdb] ? tmdbCache[b.dataset.imdb].popularity : null;
            if (av === null && bv === null) return 0;
            if (av === null) return 1;
            if (bv === null) return -1;
            return key === 'pop_desc' ? (bv - av) : (av - bv);
          default:
            return parseInt(a.dataset.order, 10) - parseInt(b.dataset.order, 10);
        }
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
        tmdbLoaded = true;
        trigger.classList.remove('-loading');
        done();
      });
    }
    menu.addEventListener('click', function (e) {
      var target = e.target;
      if (!target.classList || !target.classList.contains('sort-option')) return;
      var key = target.dataset.key;
      closeMenu();
      if (NEEDS_TMDB[key]) {
        ensureTmdbLoaded(function () { applySort(key); });
      } else {
        applySort(key);
      }
    });
    var saved = null;
    try { saved = localStorage.getItem(storageKey); } catch (e) {}
    if (saved && optionEls[saved]) {
      if (NEEDS_TMDB[saved]) {
        ensureTmdbLoaded(function () { applySort(saved); });
      } else {
        applySort(saved);
      }
    } else {
      setActive('default');
    }
  }
  global.TVSort = { init: init };
})(window);
