(function () {
  var TMDB_BASE = 'https://api.themoviedb.org/3';
  var TMDB_API_KEYS = [
    '6cb6e1dc603bc65ffb6198489d5bc5b7',
    '2e7b2fe7002c21f45f08c0a03aa9df52',
    '51952b66efcd80289c3ba5f8f8044e6a'
  ];
  var TMDB_CACHE_NAME = 'tvbox-tmdb-v1';
  var TMDB_CACHE_TTL_MS = 60 * 60 * 1000;
  var TMDB_MAX_ACTIVE = 10;
  var TMDB_HEDGE_MS = 800;
  var tmdbMemory = {};
  var tmdbPending = {};
  var tmdbQueue = [];
  var tmdbActive = 0;
  var tmdbCursor = Math.floor(Math.random() * TMDB_API_KEYS.length);
  var tmdbCooldown = {};
  function tmdbAbortError() {
    var e = new Error('Aborted');
    e.name = 'AbortError';
    return e;
  }
  function tmdbRetryable(err) {
    var s = err && err.status;
    return !s || s === 401 || s === 403 || s === 429 || s >= 500;
  }
  function tmdbPickKey(tried) {
    var now = Date.now();
    var fallback = -1;
    for (var i = 0; i < TMDB_API_KEYS.length; i++) {
      var idx = (tmdbCursor + i) % TMDB_API_KEYS.length;
      if (tried[idx]) continue;
      if ((tmdbCooldown[idx] || 0) > now) {
        if (fallback < 0) fallback = idx;
        continue;
      }
      tmdbCursor = idx + 1;
      return idx;
    }
    return fallback;
  }
  function tmdbRun(url, signal) {
    return new Promise(function (resolve, reject) {
      var tried = {};
      var controllers = [];
      var inflight = 0;
      var settled = false;
      var lastError = null;
      var timer = null;
      function finish(fn, value) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
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
      entry.promise = tmdbDiskRead(url).then(function (cached) {
        if (cached !== null) return cached;
        if (controller.signal.aborted) throw tmdbAbortError();
        return tmdbSchedule(url, controller.signal).then(function (text) {
          tmdbDiskWrite(url, text);
          return text;
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
  var IMG_BASE = 'https://image.tmdb.org/t/p/w154';
  var SAIF = {
    name: 'Saif',
    href: '/u/saif/',
    photo: 'https://raw.githubusercontent.com/osaiif/r/main/r.webp'
  };
  var TABS = [['all', 'All'], ['tv', 'TV Shows'], ['movie', 'Movies'], ['anime', 'Anime'], ['person', 'People']];
  var MAX_PAGES = 500;
  var STAR_ICON_SVG =
    '<svg class="star-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.75l2.87 6.13 6.63.7-4.93 4.6 1.32 6.62L12 17.9l-5.89 3.9 1.32-6.62-4.93-4.6 6.63-.7L12 2.75z"></path></svg>';
  var SPINNER_HTML =
    '<div class="spinner -inline"><div></div><div></div><div></div><div></div><div></div><div></div></div>';
  var LOADING_HTML = '<div class="loading-shimmer">' + SPINNER_HTML + '</div>';
  function matchesSaif(query) {
    var t = String(query || '').trim().toLowerCase().replace(/^@/, '');
    return t.length >= 3 && ('saif'.indexOf(t) === 0 || t === 'osaif');
  }
  function firstLetter(name) {
    var chars = Array.from(String(name || '').trim());
    return chars.length ? chars[0].toUpperCase() : '';
  }
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }
  function slugify(name) {
    var s = String(name || '');
    if (s.normalize) s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function yearFromDate(dateStr) {
    return dateStr ? dateStr.slice(0, 4) : '';
  }
  function formatRating(voteAverage, voteCount) {
    if (!voteAverage || !voteCount) return '';
    return voteAverage.toFixed(1);
  }
  function validTab(value) {
    for (var i = 0; i < TABS.length; i++) if (TABS[i][0] === value) return true;
    return false;
  }
  var input = document.getElementById('home-search-input');
  var resultsContainer = document.getElementById('results-container');
  var statusEl = document.getElementById('search-status');
  var tabsEl = document.getElementById('search-tabs');
  var sentinel = document.getElementById('results-sentinel');
  var loaderEl = document.getElementById('results-loader');
  var retryEl = document.getElementById('results-retry');
  var debounceTimer = null;
  var activeController = null;
  var requestId = 0;
  var query = '';
  var tab = 'all';
  var page = 0;
  var totalPages = 0;
  var loading = false;
  var exhausted = false;
  var failed = false;
  var seen = {};
  var shownAny = false;
  var creditsObserver = null;
  function setStatus(content, isError) {
    if (!content) {
      statusEl.hidden = true;
      statusEl.innerHTML = '';
      statusEl.classList.remove('-error');
      return;
    }
    statusEl.hidden = false;
    statusEl.innerHTML = content;
    statusEl.classList.toggle('-error', !!isError);
  }
  function clearResults() {
    resultsContainer.innerHTML = '';
  }
  function isAnime(item) {
    return (item.media_type === 'tv' || item.media_type === 'movie') &&
      (item.genre_ids || []).indexOf(16) !== -1 && item.original_language === 'ja';
  }
  function kindLabel(item) {
    if (item.media_type === 'person') return 'Person';
    if (isAnime(item)) return item.media_type === 'movie' ? 'Anime Movie' : 'Anime';
    return item.media_type === 'movie' ? 'Movie' : 'TV';
  }
  function itemHref(item) {
    if (item.media_type === 'movie') return '/m/?id=' + item.id;
    if (item.media_type === 'person') {
      var base = slugify(item.name);
      return '/p/' + (base ? base + '-' + item.id : String(item.id));
    }
    return '/show/?id=' + item.id;
  }
  function buildPersonCard(item) {
    var el = document.createElement('a');
    el.className = 'result-item person-item';
    el.href = itemHref(item);
    var known = (item.known_for || []).map(function (k) { return k.title || k.name; }).filter(Boolean).slice(0, 3);
    var dept = item.known_for_department || '';
    el.innerHTML =
      '<span class="person-photo">' +
        '<span class="person-initial">' + escapeHtml(firstLetter(item.name)) + '</span>' +
        (item.profile_path ? '<img src="' + escapeHtml(IMG_BASE + item.profile_path) + '" alt="" loading="lazy" decoding="async">' : '') +
      '</span>' +
      '<div class="details">' +
        '<div class="header">' +
          '<h2 class="title">' + escapeHtml(item.name) + '</h2>' +
          '<div class="meta"><span class="kind">' + escapeHtml(dept || 'Person') + '</span></div>' +
        '</div>' +
        (known.length ? '<p class="overview">Known for ' + escapeHtml(known.join(', ')) + '</p>' : '') +
      '</div>';
    return el;
  }
  function buildCard(item) {
    if (item.media_type === 'person') return buildPersonCard(item);
    var isMovie = item.media_type === 'movie';
    var title = isMovie ? (item.title || item.original_title) : (item.name || item.original_name);
    var date = isMovie ? item.release_date : item.first_air_date;
    var el = document.createElement('a');
    el.className = 'result-item';
    el.href = itemHref(item);
    var posterSrc = item.poster_path ? IMG_BASE + item.poster_path : 'poster-placeholder.jpg';
    var rating = formatRating(item.vote_average, item.vote_count);
    el.innerHTML =
      '<img class="poster" src="' + posterSrc + '" alt="' + escapeHtml(title) + '" loading="lazy" decoding="async">' +
      '<div class="details">' +
        '<div class="header">' +
          '<h2 class="title">' + escapeHtml(title) + '</h2>' +
          '<div class="meta">' +
            '<span class="kind">' + escapeHtml(kindLabel(item)) + '</span>' +
            (yearFromDate(date) ? '<span class="year numbers">' + yearFromDate(date) + '</span>' : '') +
            (rating ? '<span class="rating numbers">' + STAR_ICON_SVG + rating + '</span>' : '') +
          '</div>' +
        '</div>' +
        (item.overview ? '<p class="overview">' + escapeHtml(item.overview) + '</p>' : '') +
        '<div class="creator">' +
          '<span>' + (isMovie ? 'Directed by' : 'Created by') + '</span>' +
          '<span class="creator-badge -loading" data-type="' + (isMovie ? 'movie' : 'tv') + '" data-id="' + item.id + '">…</span>' +
        '</div>' +
      '</div>';
    return el;
  }
  function buildSaifCard() {
    var el = document.createElement('a');
    el.className = 'result-item person-item';
    el.href = SAIF.href;
    el.innerHTML =
      '<span class="person-photo">' +
        '<span class="person-initial">' + escapeHtml(firstLetter(SAIF.name)) + '</span>' +
        '<img src="' + escapeHtml(SAIF.photo) + '" alt="" decoding="async">' +
      '</span>' +
      '<div class="details">' +
        '<div class="header">' +
          '<h2 class="title">' + escapeHtml(SAIF.name) + '</h2>' +
          '<div class="meta"><span class="kind">Profile</span></div>' +
        '</div>' +
        '<p class="overview">Favorites, ratings and stats.</p>' +
      '</div>';
    return el;
  }
  function buildGroupLabel(text) {
    var label = document.createElement('div');
    label.className = 'result-group-label';
    label.textContent = text;
    return label;
  }
  function loadCredits(badge) {
    var type = badge.getAttribute('data-type');
    var id = badge.getAttribute('data-id');
    var path = type === 'movie' ? '/movie/' + id + '/credits' : '/tv/' + id;
    tmdbFetch(path)
      .then(function (details) {
        var names;
        if (type === 'movie') {
          names = ((details && details.crew) || []).filter(function (c) { return c.job === 'Director'; }).map(function (c) { return c.name; });
        } else {
          names = ((details && details.created_by) || []).map(function (c) { return c.name; });
        }
        badge.classList.remove('-loading');
        badge.textContent = names.length ? names.slice(0, 3).join(', ') : 'Unknown';
      })
      .catch(function () {
        badge.classList.remove('-loading');
        badge.textContent = 'Unknown';
      });
  }
  function watchCredits(root) {
    var badges = root.querySelectorAll('.creator-badge.-loading');
    Array.prototype.forEach.call(badges, function (badge) {
      if (!('IntersectionObserver' in window)) {
        loadCredits(badge);
        return;
      }
      if (!creditsObserver) {
        creditsObserver = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            creditsObserver.unobserve(entry.target);
            loadCredits(entry.target);
          });
        }, { rootMargin: '300px 0px' });
      }
      creditsObserver.observe(badge);
    });
  }
  function renderTabs() {
    tabsEl.hidden = !query;
    tabsEl.innerHTML = TABS.map(function (t) {
      var on = t[0] === tab;
      return '<button type="button" class="search-tab' + (on ? ' -active' : '') + '" role="tab" aria-selected="' + on + '" data-tab="' + t[0] + '">' + escapeHtml(t[1]) + '</button>';
    }).join('');
  }
  function syncUrl() {
    var q = [];
    if (query) q.push('q=' + encodeURIComponent(query));
    if (query && tab !== 'all') q.push('type=' + tab);
    try {
      history.replaceState(null, '', window.location.pathname + (q.length ? '?' + q.join('&') : '') + window.location.hash);
    } catch (e) {}
  }
  function updateFooter() {
    loaderEl.hidden = !loading || page === 0;
    retryEl.hidden = !failed || page === 0;
  }
  function endpointFor(kind) {
    return { all: '/search/multi', tv: '/search/tv', movie: '/search/movie', person: '/search/person' }[kind];
  }
  function pageParams(pageNumber) {
    return 'query=' + encodeURIComponent(query) + '&include_adult=false&page=' + pageNumber;
  }
  function fetchResults(pageNumber, signal) {
    if (tab === 'anime') {
      return Promise.all([
        tmdbFetch('/search/tv', pageParams(pageNumber), signal).catch(function (e) { if (e && e.name === 'AbortError') throw e; return null; }),
        tmdbFetch('/search/movie', pageParams(pageNumber), signal).catch(function (e) { if (e && e.name === 'AbortError') throw e; return null; })
      ]).then(function (pair) {
        if (!pair[0] && !pair[1]) throw new Error('TMDB request failed');
        var items = [];
        [['tv', pair[0]], ['movie', pair[1]]].forEach(function (entry) {
          ((entry[1] && entry[1].results) || []).forEach(function (r) {
            r.media_type = entry[0];
            if (isAnime(r)) items.push(r);
          });
        });
        items.sort(function (a, b) { return (b.popularity || 0) - (a.popularity || 0); });
        return {
          results: items,
          total_pages: Math.max((pair[0] && pair[0].total_pages) || 0, (pair[1] && pair[1].total_pages) || 0)
        };
      });
    }
    return tmdbFetch(endpointFor(tab), pageParams(pageNumber), signal).then(function (data) {
      var kind = tab;
      (data.results || []).forEach(function (r) {
        if (kind !== 'all') r.media_type = kind;
      });
      return data;
    });
  }
  function keepItem(item) {
    if (!item) return false;
    if (item.media_type === 'person') return !!item.name;
    if (item.media_type === 'movie') return !!(item.title || item.original_title);
    if (item.media_type === 'tv') return !!(item.name || item.original_name);
    return false;
  }
  function fetchPage() {
    if (loading || exhausted || !query) return;
    var rid = requestId;
    var next = page + 1;
    var controller = new AbortController();
    activeController = controller;
    loading = true;
    failed = false;
    updateFooter();
    fetchResults(next, controller.signal)
      .then(function (data) {
        if (rid !== requestId) return;
        loading = false;
        page = next;
        totalPages = Math.min(data.total_pages || 0, MAX_PAGES);
        exhausted = page >= totalPages;
        var items = (data.results || []).filter(function (item) {
          if (!keepItem(item)) return false;
          var key = item.media_type + ':' + item.id;
          if (seen[key]) return false;
          seen[key] = true;
          return true;
        });
        setStatus('');
        var fragment = document.createDocumentFragment();
        if (next === 1) {
          var withSaif = matchesSaif(query) && (tab === 'all' || tab === 'person');
          if (withSaif) {
            if (items.length) fragment.appendChild(buildGroupLabel('Profile'));
            fragment.appendChild(buildSaifCard());
            if (items.length) fragment.appendChild(buildGroupLabel('Results'));
            shownAny = true;
          }
        }
        items.forEach(function (item) {
          fragment.appendChild(buildCard(item));
          shownAny = true;
        });
        if (next === 1 && !shownAny) {
          resultsContainer.innerHTML = '<p class="no-results">No results for “' + escapeHtml(query) + '”</p>';
        } else {
          resultsContainer.appendChild(fragment);
          watchCredits(resultsContainer);
        }
        updateFooter();
        window.requestAnimationFrame(maybeLoad);
      })
      .catch(function (err) {
        if (err.name === 'AbortError' || rid !== requestId) return;
        loading = false;
        failed = true;
        if (page === 0) {
          if (matchesSaif(query) && (tab === 'all' || tab === 'person')) {
            setStatus('');
            resultsContainer.appendChild(buildSaifCard());
          } else {
            setStatus('Something went wrong: ' + escapeHtml(err.message) + ' <button type="button" class="search-link" id="results-retry-first">Try again</button>', true);
          }
        }
        updateFooter();
      });
  }
  function maybeLoad() {
    if (loading || exhausted || failed || page === 0 || !query) return;
    var rect = sentinel.getBoundingClientRect();
    if (rect.top < window.innerHeight + 900) fetchPage();
  }
  function startSearch() {
    requestId++;
    if (activeController) activeController.abort();
    page = 0;
    totalPages = 0;
    loading = false;
    exhausted = false;
    failed = false;
    seen = {};
    shownAny = false;
    clearResults();
    updateFooter();
    renderTabs();
    syncUrl();
    document.title = query ? query + ' | tvbox' : 'Search ǀ tvbox';
    if (!query) {
      setStatus('');
      return;
    }
    setStatus(LOADING_HTML);
    fetchPage();
  }
  function runSearch(value) {
    query = String(value || '').trim();
    startSearch();
  }
  input.addEventListener('input', function () {
    var value = input.value;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () {
      if (String(value).trim() === query) return;
      runSearch(value);
    }, 350);
  });
  tabsEl.addEventListener('click', function (e) {
    var btn = e.target.closest('.search-tab');
    if (!btn) return;
    var next = btn.getAttribute('data-tab');
    if (next === tab) return;
    tab = next;
    startSearch();
  });
  function retry() {
    failed = false;
    if (page === 0) setStatus(LOADING_HTML);
    fetchPage();
  }
  retryEl.addEventListener('click', retry);
  statusEl.addEventListener('click', function (e) {
    if (e.target && e.target.id === 'results-retry-first') retry();
  });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) maybeLoad();
    }, { rootMargin: '900px 0px' }).observe(sentinel);
  }
  var scrollTimer = null;
  function onScroll() {
    if (scrollTimer) return;
    scrollTimer = window.setTimeout(function () {
      scrollTimer = null;
      maybeLoad();
    }, 120);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  var params = new URLSearchParams(window.location.search);
  var initialTab = params.get('type');
  if (initialTab && validTab(initialTab)) tab = initialTab;
  var initialQuery = params.get('q');
  renderTabs();
  if (initialQuery) {
    input.value = initialQuery;
    runSearch(initialQuery);
  }
  window.addEventListener('pagehide', function () {
    if (activeController) activeController.abort();
    clearTimeout(debounceTimer);
  });
  window.addEventListener('pageshow', function (event) {
    if (!event.persisted) return;
    var stillSpinning = !statusEl.hidden && statusEl.innerHTML.indexOf('spinner') !== -1;
    var hasResults = resultsContainer.children.length > 0;
    if (stillSpinning && !hasResults) {
      var restoredParams = new URLSearchParams(window.location.search);
      var restoredQuery = restoredParams.get('q') || '';
      input.value = restoredQuery;
      runSearch(restoredQuery);
    }
  });
})();
