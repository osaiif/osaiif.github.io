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
  var IMG_BASE = 'https://image.tmdb.org/t/p/w154';
  var SAIF = {
    name: 'Saif',
    href: '/u/saif/',
    photo: 'https://raw.githubusercontent.com/osaiif/r/main/r.webp'
  };
  var TABS = [['all', 'All'], ['tv', 'Shows'], ['movie', 'Movies'], ['anime', 'Anime'], ['person', 'People']];
  var MAX_PAGES = 500;
  var NOW_YEAR = new Date().getFullYear();
  var MIN_YEAR = 1900;
  var MIN_VOTES = 30;
  var EMPTY_LIMIT = 10;
  var CONFIG_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  var FILTER_TABS = { tv: true, movie: true, anime: true };
  function genreDef(name, tvIds, movieIds) {
    return { name: name, slug: slugify(name), ids: { tv: tvIds || [], movie: movieIds || [] } };
  }
  var TV_GENRES = [
    genreDef('Action & Adventure', [10759]), genreDef('Animation', [16]), genreDef('Comedy', [35]),
    genreDef('Crime', [80]), genreDef('Documentary', [99]), genreDef('Drama', [18]),
    genreDef('Family', [10751]), genreDef('Kids', [10762]), genreDef('Mystery', [9648]),
    genreDef('News', [10763]), genreDef('Reality', [10764]), genreDef('Sci-Fi & Fantasy', [10765]),
    genreDef('Soap', [10766]), genreDef('Talk', [10767]), genreDef('War & Politics', [10768]),
    genreDef('Western', [37])
  ];
  var MOVIE_GENRES = [
    genreDef('Action', null, [28]), genreDef('Adventure', null, [12]), genreDef('Animation', null, [16]),
    genreDef('Comedy', null, [35]), genreDef('Crime', null, [80]), genreDef('Documentary', null, [99]),
    genreDef('Drama', null, [18]), genreDef('Family', null, [10751]), genreDef('Fantasy', null, [14]),
    genreDef('History', null, [36]), genreDef('Horror', null, [27]), genreDef('Music', null, [10402]),
    genreDef('Mystery', null, [9648]), genreDef('Romance', null, [10749]), genreDef('Science Fiction', null, [878]),
    genreDef('Thriller', null, [53]), genreDef('TV Movie', null, [10770]), genreDef('War', null, [10752]),
    genreDef('Western', null, [37])
  ];
  var ANIME_GENRES = [
    genreDef('Action & Adventure', [10759], [28, 12]), genreDef('Comedy', [35], [35]),
    genreDef('Crime', [80], [80]), genreDef('Documentary', [99], [99]), genreDef('Drama', [18], [18]),
    genreDef('Family', [10751], [10751]), genreDef('Horror', [], [27]), genreDef('Kids', [10762], []),
    genreDef('Music', [], [10402]), genreDef('Mystery', [9648], [9648]), genreDef('Romance', [], [10749]),
    genreDef('Sci-Fi & Fantasy', [10765], [878, 14]), genreDef('Thriller', [], [53]),
    genreDef('War & Politics', [10768], [10752]), genreDef('Western', [37], [37])
  ];
  var RATINGS = [['6', '3+'], ['7', '3.5+'], ['8', '4+'], ['9', '4.5+']];
  var POPULAR_COUNTRIES = [
    ['US', 'United States of America'], ['GB', 'United Kingdom'], ['CA', 'Canada'], ['AU', 'Australia'],
    ['JP', 'Japan'], ['KR', 'South Korea'], ['CN', 'China'], ['IN', 'India'], ['FR', 'France'],
    ['DE', 'Germany'], ['ES', 'Spain'], ['IT', 'Italy'], ['BR', 'Brazil'], ['MX', 'Mexico'],
    ['TR', 'Turkey'], ['SE', 'Sweden'], ['DK', 'Denmark'], ['NO', 'Norway'], ['NL', 'Netherlands'],
    ['PL', 'Poland'], ['TH', 'Thailand']
  ];
  var POPULAR_LANGS = [
    ['en', 'English'], ['ko', 'Korean'], ['ja', 'Japanese'], ['es', 'Spanish'], ['fr', 'French'],
    ['de', 'German'], ['hi', 'Hindi'], ['it', 'Italian'], ['pt', 'Portuguese'], ['zh', 'Mandarin'],
    ['tr', 'Turkish'], ['ru', 'Russian'], ['sv', 'Swedish'], ['da', 'Danish'], ['no', 'Norwegian'],
    ['nl', 'Dutch'], ['th', 'Thai'], ['pl', 'Polish']
  ];
  var STAR_ICON_SVG =
    '<svg class="star-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.75l2.87 6.13 6.63.7-4.93 4.6 1.32 6.62L12 17.9l-5.89 3.9 1.32-6.62-4.93-4.6 6.63-.7L12 2.75z"></path></svg>';
  var SPINNER_HTML =
    '<div class="spinner -inline"><div></div><div></div><div></div><div></div><div></div><div></div></div>';
  var LOADING_HTML = SPINNER_HTML;
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
    return (voteAverage / 2).toFixed(1);
  }
  function validTab(value) {
    for (var i = 0; i < TABS.length; i++) if (TABS[i][0] === value) return true;
    return false;
  }
  function validOption(list, value) {
    for (var i = 0; i < list.length; i++) if (list[i][0] === value) return true;
    return false;
  }
  function genreListFor(kind) {
    return kind === 'movie' ? MOVIE_GENRES : (kind === 'anime' ? ANIME_GENRES : TV_GENRES);
  }
  function genreBySlug(slug) {
    var list = genreListFor(tab);
    for (var i = 0; i < list.length; i++) if (list[i].slug === slug) return list[i];
    return null;
  }
  function matchesGenre(item, def) {
    var ids = def.ids[item.media_type] || [];
    var have = item.genre_ids || [];
    for (var i = 0; i < ids.length; i++) if (have.indexOf(ids[i]) !== -1) return true;
    return false;
  }
  function cachedConfig(key, path, build) {
    var storageKey = 'tvbox:cfg:' + key;
    try {
      var raw = localStorage.getItem(storageKey);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.data) && parsed.data.length && (Date.now() - parsed.ts) < CONFIG_TTL_MS) {
          return Promise.resolve(parsed.data);
        }
      }
    } catch (e) {}
    return tmdbFetch(path).then(function (list) {
      var data = build(list || []);
      try {
        localStorage.setItem(storageKey, JSON.stringify({ data: data, ts: Date.now() }));
      } catch (e) {}
      return data;
    });
  }
  function loadCountries() {
    return cachedConfig('countries', '/configuration/countries', function (list) {
      return list
        .filter(function (c) { return c && c.iso_3166_1 && c.english_name; })
        .map(function (c) { return [c.iso_3166_1, c.english_name]; })
        .sort(function (a, b) { return a[1].localeCompare(b[1]); });
    });
  }
  function loadLanguages() {
    return cachedConfig('languages', '/configuration/languages', function (list) {
      return list
        .filter(function (l) { return l && l.iso_639_1 && l.iso_639_1 !== 'xx' && (l.english_name || l.name); })
        .map(function (l) { return [l.iso_639_1, l.english_name || l.name]; })
        .sort(function (a, b) { return a[1].localeCompare(b[1]); });
    });
  }
  function optionsHtml(anyLabel, popular, full, selected) {
    var html = '<option value="">' + escapeHtml(anyLabel) + '</option>';
    function opt(pair) {
      return '<option value="' + escapeHtml(pair[0]) + '"' + (pair[0] === selected ? ' selected' : '') + '>' + escapeHtml(pair[1]) + '</option>';
    }
    if (full && full.length) {
      var names = {};
      full.forEach(function (pair) { names[pair[0]] = pair[1]; });
      var top = popular.filter(function (pair) { return names[pair[0]]; }).map(function (pair) { return [pair[0], names[pair[0]]]; });
      html += '<optgroup label="Popular">' + top.map(opt).join('') + '</optgroup>';
      html += '<optgroup label="A–Z">' + full.map(opt).join('') + '</optgroup>';
    } else {
      html += popular.map(opt).join('');
    }
    return html;
  }
  function simpleOptionsHtml(anyLabel, list, selected) {
    return '<option value="">' + escapeHtml(anyLabel) + '</option>' + list.map(function (pair) {
      return '<option value="' + escapeHtml(pair[0]) + '"' + (pair[0] === selected ? ' selected' : '') + '>' + escapeHtml(pair[1]) + '</option>';
    }).join('');
  }
  function syncField(select) {
    var field = select.closest('.cg-field');
    if (!field) return;
    var isDefault = select.value === field.getAttribute('data-default');
    var option = select.options[select.selectedIndex];
    field.querySelector('.cg-field-text').textContent = isDefault || !option ? field.getAttribute('data-label') : option.textContent;
    field.classList.toggle('-set', !isDefault);
    buildFieldMenu(select);
  }
  function fieldOf(select) {
    return select.closest('.cg-field');
  }
  function menuButton(opt, idx, select) {
    var cls = select.id === 'f-year' && opt.value !== '' ? ' cg-year-option' : '';
    return '<button type="button" class="sort-option' + cls + '" role="menuitemradio" aria-checked="false" data-index="' + idx + '">' + escapeHtml(opt.textContent) + '</button>';
  }
  function fieldChoices(select) {
    var field = fieldOf(select);
    return field ? field.querySelector('.cg-field-menu .sort-choices') : null;
  }
  function markFieldMenu(select) {
    var choices = fieldChoices(select);
    if (!choices) return;
    Array.prototype.forEach.call(choices.querySelectorAll('.sort-option'), function (b) {
      var on = parseInt(b.getAttribute('data-index'), 10) === select.selectedIndex;
      b.classList.toggle('-active', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }
  function buildFieldMenu(select) {
    var choices = fieldChoices(select);
    if (!choices) return;
    var html = '';
    var idx = 0;
    Array.prototype.forEach.call(select.children, function (node) {
      if (node.tagName === 'OPTGROUP') {
        html += '<span class="cg-menu-label">' + escapeHtml(node.label) + '</span>';
        Array.prototype.forEach.call(node.children, function (opt) { html += menuButton(opt, idx++, select); });
      } else if (node.tagName === 'OPTION') {
        html += menuButton(node, idx++, select);
      }
    });
    choices.innerHTML = html;
    markFieldMenu(select);
  }
  function setFieldOpen(field, open) {
    var menu = field.querySelector('.cg-field-menu');
    var trigger = field.querySelector('.cg-field-trigger');
    if (!menu || !trigger) return;
    field.classList.toggle('-open', open);
    menu.classList.toggle('-open', open);
    trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (!open) return;
    menu.classList.remove('-right');
    var rect = field.getBoundingClientRect();
    var width = menu.offsetWidth;
    if (rect.left + width > window.innerWidth - 12 && rect.right - width >= 12) menu.classList.add('-right');
    var active = menu.querySelector('.-active');
    if (active) menu.scrollTop = Math.max(0, active.offsetTop - (menu.clientHeight - active.offsetHeight) / 2);
  }
  function closeFieldMenus(except) {
    Array.prototype.forEach.call(document.querySelectorAll('.cg-field.-open'), function (f) {
      if (f !== except) setFieldOpen(f, false);
    });
  }
  function enhanceField(select) {
    var field = fieldOf(select);
    if (!field) return;
    var trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'cg-field-trigger';
    trigger.setAttribute('aria-haspopup', 'true');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', field.getAttribute('data-label') || '');
    var menu = document.createElement('div');
    menu.className = 'sort-menu cg-field-menu';
    menu.setAttribute('role', 'menu');
    menu.innerHTML = '<div class="sort-row"><div class="sort-choices"></div></div>';
    field.appendChild(trigger);
    field.appendChild(menu);
    trigger.addEventListener('click', function () {
      var open = !field.classList.contains('-open');
      closeFieldMenus(field);
      setFieldOpen(field, open);
    });
    menu.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.sort-option') : null;
      if (!btn) return;
      setFieldOpen(field, false);
      var idx = parseInt(btn.getAttribute('data-index'), 10);
      if (isNaN(idx) || idx === select.selectedIndex) return;
      select.selectedIndex = idx;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }
  function enhanceFields() {
    Array.prototype.forEach.call(document.querySelectorAll('.cg-field-select'), enhanceField);
    document.addEventListener('click', function (e) {
      closeFieldMenus(e.target.closest ? e.target.closest('.cg-field') : null);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      var open = document.querySelector('.cg-field.-open');
      if (!open) return;
      var trigger = open.querySelector('.cg-field-trigger');
      closeFieldMenus(null);
      if (trigger) trigger.focus();
    });
  }
  var input = document.getElementById('home-search-input');
  var resultsContainer = document.getElementById('results-container');
  var statusEl = document.getElementById('search-status');
  var tabsEl = document.getElementById('search-tabs');
  var sentinel = document.getElementById('results-sentinel');
  var loaderEl = document.getElementById('results-loader');
  var retryEl = document.getElementById('results-retry');
  var filtersEl = document.getElementById('search-filters');
  var filterResetEl = document.getElementById('f-reset');
  var filterEls = {
    genre: document.getElementById('f-genre'),
    year: document.getElementById('f-year'),
    country: document.getElementById('f-country'),
    lang: document.getElementById('f-lang'),
    rating: document.getElementById('f-rating')
  };
  var filters = { genre: '', year: '', country: '', lang: '', rating: '' };
  var countryList = null;
  var languageList = null;
  var configRequested = false;
  var emptyStreak = 0;
  var debounceTimer = null;
  var activeController = null;
  var requestId = 0;
  var query = '';
  var apiQuery = '';
  var correctedTo = '';
  var correctionTried = false;
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
    el.setAttribute('data-lazy', isMovie ? 'movie' : 'tv');
    el.setAttribute('data-id', item.id);
    var posterSrc = item.poster_path ? IMG_BASE + item.poster_path : 'poster-placeholder.jpg';
    var rating = formatRating(item.vote_average, item.vote_count);
    el.innerHTML =
      '<img class="poster" src="' + posterSrc + '" alt="' + escapeHtml(title) + '" loading="lazy" decoding="async">' +
      '<div class="details">' +
        '<div class="header">' +
          '<h2 class="title">' + escapeHtml(title) + '</h2>' +
          '<div class="meta">' +
            '<span class="kind">' + escapeHtml(kindLabel(item) + (yearFromDate(date) ? ' | ' + yearFromDate(date) : '')) + '</span>' +
            (rating ? '<span class="rating numbers">' + STAR_ICON_SVG + rating + '</span>' : '') +
          '</div>' +
        '</div>' +
        '<p class="overview">' + escapeHtml(item.overview || '') + '</p>' +
        '<div class="creator">' +
          '<span>' + (isMovie ? 'Directed by' : 'Created by') + '</span>' +
          '<span class="creator-badge -loading">…</span>' +
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
  function removeCreator(card) {
    var creator = card.querySelector('.creator');
    if (creator) creator.innerHTML = '';
  }
  function loadDetails(card) {
    var type = card.getAttribute('data-lazy');
    var id = card.getAttribute('data-id');
    card.removeAttribute('data-lazy');
    var badge = card.querySelector('.creator-badge');
    var path = '/' + type + '/' + id;
    var params = type === 'movie' ? 'append_to_response=credits' : '';
    tmdbFetch(path, params)
      .then(function (details) {
        var names;
        if (type === 'movie') {
          names = ((details && details.credits && details.credits.crew) || []).filter(function (c) { return c.job === 'Director'; }).map(function (c) { return c.name; });
        } else {
          names = ((details && details.created_by) || []).map(function (c) { return c.name; });
        }
        if (badge && names.length) {
          badge.classList.remove('-loading');
          badge.textContent = names.slice(0, 3).join(', ');
        } else {
          removeCreator(card);
        }
      })
      .catch(function () {
        removeCreator(card);
      });
  }
  function watchDetails(root) {
    var cards = root.querySelectorAll('[data-lazy]');
    Array.prototype.forEach.call(cards, function (card) {
      if (!('IntersectionObserver' in window)) {
        loadDetails(card);
        return;
      }
      if (!creditsObserver) {
        creditsObserver = new IntersectionObserver(function (entries) {
          entries.forEach(function (entry) {
            if (!entry.isIntersecting) return;
            creditsObserver.unobserve(entry.target);
            if (entry.target.getAttribute('data-lazy')) loadDetails(entry.target);
          });
        }, { rootMargin: '300px 0px' });
      }
      creditsObserver.observe(card);
    });
  }
  function renderTabs() {
    tabsEl.hidden = !query;
    tabsEl.innerHTML = TABS.map(function (t) {
      var on = t[0] === tab;
      return '<button type="button" class="search-tab' + (on ? ' -active' : '') + '" role="tab" aria-selected="' + on + '" data-tab="' + t[0] + '">' + escapeHtml(t[1]) + '</button>';
    }).join('');
  }
  function renderYearOptions() {
    var html = '<option value="">All</option>';
    for (var y = NOW_YEAR + 1; y >= MIN_YEAR; y--) {
      html += '<option value="' + y + '"' + (String(y) === filters.year ? ' selected' : '') + '>' + y + '</option>';
    }
    filterEls.year.innerHTML = html;
    filterEls.year.value = filters.year;
    syncField(filterEls.year);
  }
  function renderCountryOptions() {
    filterEls.country.innerHTML = optionsHtml('All', POPULAR_COUNTRIES, countryList, filters.country);
    filterEls.country.value = filters.country;
    syncField(filterEls.country);
  }
  function renderLangOptions() {
    filterEls.lang.innerHTML = optionsHtml('All', POPULAR_LANGS, languageList, filters.lang);
    filterEls.lang.value = filters.lang;
    syncField(filterEls.lang);
  }
  function ensureConfigs() {
    if (configRequested) return;
    configRequested = true;
    loadCountries().then(function (list) {
      countryList = list;
      renderCountryOptions();
    }).catch(function () {});
    loadLanguages().then(function (list) {
      languageList = list;
      renderLangOptions();
    }).catch(function () {});
  }
  function renderFilters() {
    var show = !!query && !!FILTER_TABS[tab];
    filtersEl.hidden = !show;
    if (!show) return;
    if (filters.genre && !genreBySlug(filters.genre)) filters.genre = '';
    filterEls.genre.innerHTML = '<option value="">All</option>' + genreListFor(tab).map(function (g) {
      return '<option value="' + g.slug + '"' + (g.slug === filters.genre ? ' selected' : '') + '>' + escapeHtml(g.name) + '</option>';
    }).join('');
    filterEls.genre.value = filters.genre;
    syncField(filterEls.genre);
    renderYearOptions();
    renderCountryOptions();
    renderLangOptions();
    filterEls.rating.innerHTML = simpleOptionsHtml('All', RATINGS, filters.rating);
    filterEls.rating.value = filters.rating;
    syncField(filterEls.rating);
    filterResetEl.hidden = !isFiltering();
    ensureConfigs();
  }
  function syncUrl() {
    var q = [];
    if (query) q.push('q=' + encodeURIComponent(query));
    if (query && tab !== 'all') q.push('type=' + tab);
    if (query && FILTER_TABS[tab]) {
      if (filters.genre) q.push('genre=' + encodeURIComponent(filters.genre));
      if (filters.year) q.push('year=' + filters.year);
      if (filters.country) q.push('country=' + filters.country);
      if (filters.lang) q.push('lang=' + filters.lang);
      if (filters.rating) q.push('rating=' + filters.rating);
    }
    try {
      history.replaceState(null, '', window.location.pathname + (q.length ? '?' + q.join('&') : '') + window.location.hash);
    } catch (e) {}
  }
  function updateFooter() {
    loaderEl.hidden = !loading || !shownAny;
    retryEl.hidden = !failed || !shownAny;
  }
  function endpointFor(kind) {
    return { all: '/search/multi', tv: '/search/tv', movie: '/search/movie', person: '/search/person' }[kind];
  }
  function isFiltering() {
    return !!(FILTER_TABS[tab] && (filters.genre || filters.year || filters.country || filters.lang || filters.rating));
  }
  function pageParams(pageNumber, kind) {
    var params = 'query=' + encodeURIComponent(apiQuery || query) + '&include_adult=false&page=' + pageNumber;
    if (filters.year && FILTER_TABS[tab]) {
      params += (kind === 'movie' ? '&primary_release_year=' : '&first_air_date_year=') + filters.year;
    }
    return params;
  }
  function applyFilters(items, signal) {
    if (!isFiltering()) return Promise.resolve(items);
    var def = filters.genre ? genreBySlug(filters.genre) : null;
    var minRating = filters.rating ? parseFloat(filters.rating) : 0;
    var kept = items.filter(function (item) {
      if (def && !matchesGenre(item, def)) return false;
      if (filters.lang && item.original_language !== filters.lang) return false;
      if (minRating && !(item.vote_average >= minRating && item.vote_count >= MIN_VOTES)) return false;
      return true;
    });
    if (!filters.country) return Promise.resolve(kept);
    return Promise.all(kept.map(function (item) {
      if (item.media_type === 'tv' && item.origin_country && item.origin_country.length) {
        return Promise.resolve(item.origin_country.indexOf(filters.country) !== -1 ? item : null);
      }
      var path = (item.media_type === 'movie' ? '/movie/' : '/tv/') + item.id;
      return tmdbFetch(path, '', signal).then(function (d) {
        var codes = ((d && d.production_countries) || []).map(function (c) { return c.iso_3166_1; });
        if (d && d.origin_country) codes = codes.concat(d.origin_country);
        return codes.indexOf(filters.country) !== -1 ? item : null;
      }).catch(function (e) {
        if (e && e.name === 'AbortError') throw e;
        return null;
      });
    })).then(function (list) {
      return list.filter(Boolean);
    });
  }
  function fetchResults(pageNumber, signal) {
    if (tab === 'anime') {
      return Promise.all([
        tmdbFetch('/search/tv', pageParams(pageNumber, 'tv'), signal).catch(function (e) { if (e && e.name === 'AbortError') throw e; return null; }),
        tmdbFetch('/search/movie', pageParams(pageNumber, 'movie'), signal).catch(function (e) { if (e && e.name === 'AbortError') throw e; return null; })
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
    return tmdbFetch(endpointFor(tab), pageParams(pageNumber, tab), signal).then(function (data) {
      var kind = tab;
      (data.results || []).forEach(function (r) {
        if (kind !== 'all') r.media_type = kind;
      });
      return data;
    });
  }
  function normText(str) {
    var s = String(str || '');
    if (s.normalize) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return s.toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function editDistance(a, b) {
    a = a.slice(0, 80);
    b = b.slice(0, 80);
    var rows = [];
    for (var i = 0; i <= a.length; i++) {
      rows[i] = [i];
      for (var j = 1; j <= b.length; j++) rows[i][j] = i === 0 ? j : 0;
    }
    for (i = 1; i <= a.length; i++) {
      for (j = 1; j <= b.length; j++) {
        var cost = a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1;
        var v = Math.min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + cost);
        if (i > 1 && j > 1 && a.charAt(i - 1) === b.charAt(j - 2) && a.charAt(i - 2) === b.charAt(j - 1)) {
          v = Math.min(v, rows[i - 2][j - 2] + 1);
        }
        rows[i][j] = v;
      }
    }
    return rows[a.length][b.length];
  }
  function similarity(a, b) {
    if (!a || !b) return 0;
    var best = 0;
    var pairs = [[a, b], [a.replace(/ /g, ''), b.replace(/ /g, '')]];
    if (/^the /.test(b)) pairs.push([a, b.slice(4)]);
    if (/^the /.test(a)) pairs.push([a.slice(4), b]);
    pairs.forEach(function (p) {
      var len = Math.max(p[0].length, p[1].length);
      if (!len) return;
      var sim = 1 - editDistance(p[0], p[1]) / len;
      if (sim > best) best = sim;
    });
    return best;
  }
  function itemNames(item) {
    var names = [item.title, item.original_title, item.name, item.original_name];
    var out = [];
    names.forEach(function (n) {
      var t = normText(n);
      if (t && out.indexOf(t) === -1) out.push(t);
    });
    return out;
  }
  function tokensCovered(q, name) {
    var qt = q.split(' ');
    var nt = name.split(' ');
    return qt.every(function (t) {
      return nt.some(function (w) { return w.indexOf(t) === 0; });
    });
  }
  function hasGoodMatch(items, q) {
    var top = (items || []).slice(0, 10);
    for (var i = 0; i < top.length; i++) {
      var names = itemNames(top[i]);
      for (var j = 0; j < names.length; j++) {
        if (similarity(q, names[j]) >= 0.8 || tokensCovered(q, names[j])) return true;
      }
    }
    return false;
  }
  var vocabPromise = null;
  function loadVocabulary() {
    if (vocabPromise) return vocabPromise;
    var paths = [];
    ['/tv/popular', '/movie/popular', '/tv/top_rated', '/movie/top_rated'].forEach(function (p) {
      for (var n = 1; n <= 5; n++) paths.push([p, 'language=en-US&page=' + n, p.indexOf('/tv') === 0 ? 'tv' : 'movie']);
    });
    for (var m = 1; m <= 2; m++) paths.push(['/trending/all/week', 'language=en-US&page=' + m, '']);
    vocabPromise = Promise.all(paths.map(function (p) {
      return tmdbFetch(p[0], p[1]).then(function (data) {
        return (data.results || []).map(function (r) {
          if (p[2]) r.media_type = p[2];
          return r;
        });
      }).catch(function () { return []; });
    })).then(function (lists) {
      return [].concat.apply([], lists);
    });
    return vocabPromise;
  }
  function correctionQueries(q) {
    var tokens = q.split(' ');
    var out = [];
    function add(s) {
      if (s && s.length >= 3 && s !== q && out.indexOf(s) === -1) out.push(s);
    }
    tokens.forEach(function (t) { if (t.length >= 3) add(t); });
    if (tokens.length > 1) {
      tokens.forEach(function (t, i) {
        add(tokens.filter(function (x, k) { return k !== i; }).join(' '));
      });
    }
    if (q.length >= 6) add(q.slice(0, -1));
    tokens.forEach(function (t) { if (t.length >= 6) add(t.slice(0, -1)); });
    return out.slice(0, 8);
  }
  function findCorrection(q, signal) {
    var compact = q.replace(/ /g, '');
    if (compact.length < 4 || !/[a-z]/.test(compact)) return Promise.resolve('');
    var searches = correctionQueries(q).map(function (s) {
      return tmdbFetch('/search/multi', 'query=' + encodeURIComponent(s) + '&include_adult=false&page=1', signal).then(function (data) {
        return data.results || [];
      }).catch(function (e) {
        if (e && e.name === 'AbortError') throw e;
        return [];
      });
    });
    searches.push(loadVocabulary());
    return Promise.all(searches).then(function (lists) {
      var pool = [].concat.apply([], lists);
      var best = null;
      var bestScore = 0;
      var bestPop = -1;
      pool.forEach(function (item) {
        if (!item || (item.media_type !== 'tv' && item.media_type !== 'movie' && item.media_type !== 'person')) return;
        var raw = item.media_type === 'movie' ? [item.title, item.original_title] : [item.name, item.original_name];
        raw.forEach(function (r) {
          var name = normText(r);
          if (!name || !r) return;
          var score = similarity(q, name);
          var pop = item.popularity || 0;
          if (score > bestScore + 0.0001 || (Math.abs(score - bestScore) <= 0.0001 && pop > bestPop)) {
            best = r;
            bestScore = score;
            bestPop = pop;
          }
        });
      });
      return best && bestScore >= 0.75 ? String(best).trim() : '';
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
        if (rid !== requestId || next !== 1 || correctionTried) return data;
        correctionTried = true;
        var q = normText(query);
        if (matchesSaif(query) || hasGoodMatch(data.results, q)) return data;
        return findCorrection(q, controller.signal).then(function (fixed) {
          if (rid !== requestId || !fixed || normText(fixed) === q) return data;
          apiQuery = fixed;
          return fetchResults(1, controller.signal).then(function (fixedData) {
            if (rid !== requestId) return fixedData;
            if (!(fixedData.results || []).length) {
              apiQuery = query;
              return data;
            }
            correctedTo = fixed;
            return fixedData;
          });
        });
      })
      .then(function (data) {
        if (rid !== requestId) return;
        var fresh = (data.results || []).filter(function (item) {
          if (!keepItem(item)) return false;
          var key = item.media_type + ':' + item.id;
          if (seen[key]) return false;
          seen[key] = true;
          return true;
        });
        return applyFilters(fresh, controller.signal).then(function (items) {
          if (rid !== requestId) return;
          loading = false;
          page = next;
          totalPages = Math.min(data.total_pages || 0, MAX_PAGES);
          exhausted = page >= totalPages;
          emptyStreak = items.length ? 0 : emptyStreak + 1;
          if (emptyStreak >= EMPTY_LIMIT) exhausted = true;
          var fragment = document.createDocumentFragment();
          if (next === 1) {
            var withSaif = matchesSaif(query) && (tab === 'all' || tab === 'person');
            if (withSaif) {
              fragment.appendChild(buildSaifCard());
              if (items.length) fragment.appendChild(buildGroupLabel('Results'));
              shownAny = true;
            }
          }
          items.forEach(function (item) {
            fragment.appendChild(buildCard(item));
            shownAny = true;
          });
          if (!shownAny) {
            if (!exhausted) {
              updateFooter();
              fetchPage();
              return;
            }
            setStatus('');
            resultsContainer.innerHTML = '<p class="no-results">No results for “' + escapeHtml(query) + '”' + (isFiltering() ? ' with these filters' : '') + '</p>';
            updateFooter();
            return;
          }
          setStatus('');
          resultsContainer.appendChild(fragment);
          watchDetails(resultsContainer);
          updateFooter();
          window.requestAnimationFrame(maybeLoad);
        });
      })
      .catch(function (err) {
        if (err.name === 'AbortError' || rid !== requestId) return;
        loading = false;
        failed = true;
        if (!shownAny) {
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
    emptyStreak = 0;
    apiQuery = query;
    correctedTo = '';
    correctionTried = false;
    clearResults();
    updateFooter();
    renderTabs();
    renderFilters();
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
  Object.keys(filterEls).forEach(function (key) {
    filterEls[key].addEventListener('change', function () {
      filters[key] = filterEls[key].value;
      syncField(filterEls[key]);
      startSearch();
    });
  });
  filterResetEl.addEventListener('click', function () {
    filters = { genre: '', year: '', country: '', lang: '', rating: '' };
    startSearch();
  });
  function retry() {
    failed = false;
    if (!shownAny) setStatus(LOADING_HTML);
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
  enhanceFields();
  var params = new URLSearchParams(window.location.search);
  var initialTab = params.get('type');
  if (initialTab && validTab(initialTab)) tab = initialTab;
  (function readFilters() {
    var yearParam = parseInt(params.get('year') || '', 10);
    if (!isNaN(yearParam) && yearParam >= MIN_YEAR && yearParam <= NOW_YEAR + 1) filters.year = String(yearParam);
    var country = (params.get('country') || '').toUpperCase();
    if (/^[A-Z]{2}$/.test(country)) filters.country = country;
    var lang = (params.get('lang') || '').toLowerCase();
    if (/^[a-z]{2,3}$/.test(lang)) filters.lang = lang;
    if (validOption(RATINGS, params.get('rating') || '')) filters.rating = params.get('rating');
    filters.genre = slugify(params.get('genre') || '');
  })();
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
