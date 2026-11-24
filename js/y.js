(function () {
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
  var IMG_BASE = 'https://image.tmdb.org/t/p/w342';
  var MAX_PAGES = 500;
  var NOW_YEAR = new Date().getFullYear();
  var CONFIG_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  var GENRES = [
    { id: 10759, name: 'Action & Adventure' },
    { id: 16, name: 'Animation' },
    { id: 35, name: 'Comedy' },
    { id: 80, name: 'Crime' },
    { id: 99, name: 'Documentary' },
    { id: 18, name: 'Drama' },
    { id: 10751, name: 'Family' },
    { id: 10762, name: 'Kids' },
    { id: 9648, name: 'Mystery' },
    { id: 10763, name: 'News' },
    { id: 10764, name: 'Reality' },
    { id: 10765, name: 'Sci-Fi & Fantasy' },
    { id: 10766, name: 'Soap' },
    { id: 10767, name: 'Talk' },
    { id: 10768, name: 'War & Politics' },
    { id: 37, name: 'Western' }
  ];
  var SORTS = [
    ['popularity.desc', 'Most popular'],
    ['vote_average.desc', 'Top rated'],
    ['vote_count.desc', 'Most voted'],
    ['first_air_date.desc', 'Newest first'],
    ['first_air_date.asc', 'Oldest first'],
    ['name.asc', 'Title A–Z']
  ];
  var STATUSES = [
    ['0', 'Returning series'],
    ['3', 'Ended'],
    ['4', 'Canceled'],
    ['2', 'In production'],
    ['1', 'Planned'],
    ['5', 'Pilot']
  ];
  var TYPES = [
    ['4', 'Scripted'],
    ['0', 'Documentary'],
    ['2', 'Miniseries'],
    ['3', 'Reality'],
    ['5', 'Talk show'],
    ['1', 'News'],
    ['6', 'Video']
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
  function initials(name) {
    var words = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '';
    var letters = Array.from(words[0])[0] || '';
    if (words.length > 1) letters += Array.from(words[1])[0] || '';
    return letters.toUpperCase();
  }
  function formatCount(n) {
    return Number(n || 0).toLocaleString('en-US');
  }
  function validOption(list, value) {
    for (var i = 0; i < list.length; i++) if (list[i][0] === value) return true;
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
  var STAR_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14l-5-4.87 6.91-1.01z"/></svg>';
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
  function menuButton(opt, idx) {
    return '<button type="button" class="sort-option" role="menuitemradio" aria-checked="false" data-index="' + idx + '">' + escapeHtml(opt.textContent) + '</button>';
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
        Array.prototype.forEach.call(node.children, function (opt) { html += menuButton(opt, idx++); });
      } else if (node.tagName === 'OPTION') {
        html += menuButton(node, idx++);
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
  function cardHtml(show) {
    var year = show.first_air_date ? show.first_air_date.slice(0, 4) : '';
    var rating = show.vote_count > 0 && show.vote_average > 0 ? (show.vote_average / 2).toFixed(1) : '';
    var poster = show.poster_path
      ? '<img src="' + IMG_BASE + show.poster_path + '" alt="" loading="lazy" decoding="async">'
      : '<span class="cg-initials">' + escapeHtml(initials(show.name)) + '</span>';
    return '<a class="cg-card" href="/show/?id=' + show.id + '">' +
      '<span class="cg-poster" data-initials="' + escapeHtml(initials(show.name)) + '">' + poster + '</span>' +
      '<span class="cg-card-title">' + escapeHtml(show.name) + '</span>' +
      '<span class="cg-card-meta">' +
        (year ? '<span class="numbers">' + year + '</span>' : '') +
        (rating ? '<span class="cg-rating numbers">' + STAR_SVG + rating + '</span>' : '') +
      '</span>' +
    '</a>';
  }
  function replaceBrokenPoster(e) {
    var t = e.target;
    if (!t || t.tagName !== 'IMG') return;
    var parent = t.parentNode;
    if (!parent || !parent.classList.contains('cg-poster')) return;
    var span = document.createElement('span');
    span.className = 'cg-initials';
    span.textContent = parent.getAttribute('data-initials') || '';
    parent.removeChild(t);
    parent.appendChild(span);
  }
  var SPINNER_HTML = '<div class="spinner -inline"><div></div><div></div><div></div><div></div><div></div><div></div></div>';
  var DEFAULT_SORT = 'popularity.desc';
  var MIN_YEAR = 1930;
  var MAX_YEAR = 2100;
  var el = {
    titleName: document.getElementById('cg-title-name'),
    pickRow: document.getElementById('cg-title-row'),
    pickTrigger: document.getElementById('cg-pick-trigger'),
    pickMenu: document.getElementById('cg-pick-menu'),
    pickChoices: document.getElementById('cg-pick-choices'),
    extra: document.getElementById('cg-extra'),
    genre: document.getElementById('f-genre'),
    sort: document.getElementById('f-sort'),
    country: document.getElementById('f-country'),
    lang: document.getElementById('f-lang'),
    status: document.getElementById('f-status'),
    type: document.getElementById('f-type'),
    rating: document.getElementById('f-rating'),
    moreToggle: document.getElementById('cg-more-toggle'),
    reset: document.getElementById('cg-reset'),
    statusBox: document.getElementById('cg-status'),
    grid: document.getElementById('cg-grid'),
    sentinel: document.getElementById('cg-sentinel'),
    loader: document.getElementById('cg-loader'),
    retry: document.getElementById('cg-retry'),
    note: document.getElementById('cg-note')
  };
  GENRES.forEach(function (g) { g.slug = slugify(g.name); });
  var params = new URLSearchParams(window.location.search);
  var rawYearParam = params.get('y') || params.get('s') || '';
  var yearParam = parseInt(rawYearParam.replace(/\D/g, ''), 10);
  var year = !isNaN(yearParam) && yearParam >= 1900 && yearParam <= MAX_YEAR ? yearParam : NOW_YEAR;
  if (rawYearParam.toLowerCase() === 'all') year = null;
  var state = {
    genre: '',
    country: '',
    lang: '',
    status: '',
    type: '',
    rating: '',
    sort: DEFAULT_SORT
  };
  (function readState() {
    var slug = slugify(params.get('genre') || '');
    GENRES.forEach(function (g) {
      if (slug && g.slug === slug) state.genre = g.slug;
    });
    var country = (params.get('country') || '').toUpperCase();
    if (/^[A-Z]{2}$/.test(country)) state.country = country;
    var lang = (params.get('lang') || '').toLowerCase();
    if (/^[a-z]{2,3}$/.test(lang)) state.lang = lang;
    if (validOption(STATUSES, params.get('status') || '')) state.status = params.get('status');
    if (validOption(TYPES, params.get('type') || '')) state.type = params.get('type');
    if (validOption(RATINGS, params.get('rating') || '')) state.rating = params.get('rating');
    if (validOption(SORTS, params.get('sort') || '')) state.sort = params.get('sort');
  })();
  var countryList = null;
  var languageList = null;
  var requestId = 0;
  var activeController = null;
  var page = 0;
  var totalPages = 0;
  var capped = false;
  var loading = false;
  var exhausted = false;
  var failed = false;
  var seen = {};
  function genreBySlug(slug) {
    for (var i = 0; i < GENRES.length; i++) if (GENRES[i].slug === slug) return GENRES[i];
    return null;
  }
  function setStatus(content, isError) {
    if (!content) {
      el.statusBox.hidden = true;
      el.statusBox.innerHTML = '';
      el.statusBox.classList.remove('-error');
      return;
    }
    el.statusBox.hidden = false;
    el.statusBox.innerHTML = content;
    el.statusBox.classList.toggle('-error', !!isError);
  }
  function filterQuery() {
    var q = [];
    if (state.genre) q.push('genre=' + state.genre);
    if (state.country) q.push('country=' + state.country);
    if (state.lang) q.push('lang=' + state.lang);
    if (state.status) q.push('status=' + state.status);
    if (state.type) q.push('type=' + state.type);
    if (state.rating) q.push('rating=' + state.rating);
    if (state.sort !== DEFAULT_SORT) q.push('sort=' + state.sort);
    return q.join('&');
  }
  function syncUrl() {
    var q = filterQuery();
    try {
      history.replaceState(null, '', '/y/' + (year === null ? 'all' : year) + (q ? '?' + q : '') + window.location.hash);
    } catch (e) {}
  }
  function filtersActive() {
    return !!(state.genre || state.country || state.lang || state.status || state.type || state.rating || state.sort !== DEFAULT_SORT);
  }
  function extraActive() {
    return !!(state.status || state.type || state.rating);
  }
  function setMenuOpen(open) {
    el.pickMenu.classList.toggle('-open', open);
    el.pickTrigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      var active = el.pickChoices.querySelector('.-active');
      if (active) el.pickMenu.scrollTop = Math.max(0, active.offsetTop - (el.pickMenu.clientHeight - active.offsetHeight) / 2);
    }
  }
  function markActive(attr, key) {
    Array.prototype.forEach.call(el.pickChoices.children, function (b) {
      var on = key !== null && b.getAttribute(attr) === key;
      b.classList.toggle('-active', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    });
  }
  function optionBtn(attr, value, label, cls) {
    return '<button type="button" class="sort-option' + (cls ? ' ' + cls : '') + '" role="menuitemradio" aria-checked="false" ' + attr + '="' + escapeHtml(value) + '">' + escapeHtml(label) + '</button>';
  }
  function buildYearMenu() {
    var lowest = year === null ? MIN_YEAR : Math.min(MIN_YEAR, year);
    var highest = year === null ? NOW_YEAR : Math.max(NOW_YEAR, year);
    var html = optionBtn('data-year', 'all', 'All', '');
    for (var y = highest; y >= lowest; y--) html += optionBtn('data-year', String(y), String(y), 'cg-year-option');
    el.pickChoices.innerHTML = html;
  }
  function markYearActive() {
    markActive('data-year', year === null ? 'all' : String(year));
  }
  function renderFilters() {
    el.genre.innerHTML = '<option value="">All</option>' + GENRES.map(function (g) {
      return '<option value="' + g.slug + '"' + (g.slug === state.genre ? ' selected' : '') + '>' + escapeHtml(g.name) + '</option>';
    }).join('');
    el.genre.value = state.genre;
    el.sort.innerHTML = SORTS.map(function (pair) {
      return '<option value="' + pair[0] + '">' + escapeHtml(pair[1]) + '</option>';
    }).join('');
    el.sort.value = state.sort;
    el.country.innerHTML = optionsHtml('All', POPULAR_COUNTRIES, countryList, state.country);
    el.lang.innerHTML = optionsHtml('All', POPULAR_LANGS, languageList, state.lang);
    el.status.innerHTML = simpleOptionsHtml('All', STATUSES, state.status);
    el.type.innerHTML = simpleOptionsHtml('All', TYPES, state.type);
    el.rating.innerHTML = simpleOptionsHtml('All', RATINGS, state.rating);
    el.country.value = state.country;
    el.lang.value = state.lang;
    syncField(el.genre);
    syncField(el.country);
    syncField(el.lang);
    syncField(el.status);
    syncField(el.type);
    syncField(el.rating);
    syncField(el.sort);
    el.reset.hidden = !filtersActive();
    var open = extraActive();
    el.extra.hidden = !open;
    el.moreToggle.setAttribute('aria-expanded', String(open));
    el.moreToggle.textContent = open ? 'Fewer filters' : 'More filters';
  }
  function renderTitle() {
    el.titleName.textContent = year === null ? 'All years' : String(year);
    markYearActive();
    document.title = (year === null ? 'All years' : String(year)) + ' ǀ tvbox';
  }
  function buildQuery(pageNumber) {
    var q = [
      'include_adult=false',
      'include_null_first_air_dates=false',
      'language=en-US',
      'sort_by=' + state.sort,
      'page=' + pageNumber
    ];
    if (year !== null) {
      q.push('first_air_date.gte=' + year + '-01-01');
      q.push('first_air_date.lte=' + year + '-12-31');
    }
    var g = genreBySlug(state.genre);
    if (g) q.push('with_genres=' + g.id);
    if (state.country) q.push('with_origin_country=' + state.country);
    if (state.lang) q.push('with_original_language=' + state.lang);
    if (state.status) q.push('with_status=' + state.status);
    if (state.type) q.push('with_type=' + state.type);
    var minVotes = 0;
    if (state.rating) {
      q.push('vote_average.gte=' + state.rating);
      minVotes = 30;
    }
    if (state.sort === 'vote_average.desc') minVotes = Math.max(minVotes, 50);
    if (minVotes) q.push('vote_count.gte=' + minVotes);
    return q.join('&');
  }
  function updateFooter() {
    el.loader.hidden = !loading || page === 0;
    el.retry.hidden = !failed || page === 0;
    el.note.hidden = !(exhausted && capped);
  }
  function fetchPage() {
    if (loading || exhausted) return;
    var rid = requestId;
    var next = page + 1;
    var controller = new AbortController();
    activeController = controller;
    loading = true;
    failed = false;
    updateFooter();
    tmdbFetch('/discover/tv', buildQuery(next), controller.signal)
      .then(function (data) {
        if (rid !== requestId) return;
        loading = false;
        page = next;
        totalPages = Math.min(data.total_pages || 0, MAX_PAGES);
        capped = (data.total_pages || 0) > MAX_PAGES;
        exhausted = page >= totalPages;
        var results = (data.results || []).filter(function (s) {
          if (!s || !s.name || seen[s.id]) return false;
          seen[s.id] = true;
          return true;
        });
        setStatus('');
        if (next === 1) {
          if (!results.length) {
            setStatus('No shows match these filters.');
            updateFooter();
            return;
          }
        }
        el.grid.insertAdjacentHTML('beforeend', results.map(cardHtml).join(''));
        updateFooter();
        window.requestAnimationFrame(maybeLoad);
      })
      .catch(function (err) {
        if (err.name === 'AbortError' || rid !== requestId) return;
        loading = false;
        failed = true;
        if (page === 0) {
          setStatus('Something went wrong: ' + escapeHtml(err.message) + ' <button type="button" class="cg-link" id="cg-retry-first">Try again</button>', true);
        }
        updateFooter();
      });
  }
  function maybeLoad() {
    if (loading || exhausted || failed || page === 0) return;
    var rect = el.sentinel.getBoundingClientRect();
    if (rect.top < window.innerHeight + 900) fetchPage();
  }
  function startFresh() {
    requestId++;
    if (activeController) activeController.abort();
    page = 0;
    totalPages = 0;
    capped = false;
    loading = false;
    exhausted = false;
    failed = false;
    seen = {};
    el.grid.innerHTML = '';
    updateFooter();
    setStatus(SPINNER_HTML);
    fetchPage();
  }
  function refresh() {
    el.reset.hidden = !filtersActive();
    renderTitle();
    syncUrl();
    startFresh();
  }
  enhanceFields();
  buildYearMenu();
  renderFilters();
  renderTitle();
  syncUrl();
  el.pickTrigger.addEventListener('click', function (e) {
    e.stopPropagation();
    closeFieldMenus(null);
    setMenuOpen(!el.pickMenu.classList.contains('-open'));
  });
  document.addEventListener('click', function (e) {
    if (!el.pickRow.contains(e.target)) setMenuOpen(false);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && el.pickMenu.classList.contains('-open')) {
      setMenuOpen(false);
      el.pickTrigger.focus();
    }
  });
  el.pickChoices.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('.sort-option') : null;
    if (!btn) return;
    setMenuOpen(false);
    var value = btn.getAttribute('data-year');
    var target = value === 'all' ? null : parseInt(value, 10);
    if (target !== null && isNaN(target)) return;
    if (target === year) return;
    year = target;
    refresh();
  });
  [['genre', el.genre], ['sort', el.sort], ['country', el.country], ['lang', el.lang], ['status', el.status], ['type', el.type], ['rating', el.rating]].forEach(function (pair) {
    pair[1].addEventListener('change', function () {
      state[pair[0]] = pair[1].value;
      syncField(pair[1]);
      refresh();
    });
  });
  el.moreToggle.addEventListener('click', function () {
    var open = el.extra.hidden;
    el.extra.hidden = !open;
    el.moreToggle.setAttribute('aria-expanded', String(open));
    el.moreToggle.textContent = open ? 'Fewer filters' : 'More filters';
  });
  el.reset.addEventListener('click', function () {
    state.genre = '';
    state.country = '';
    state.lang = '';
    state.status = '';
    state.type = '';
    state.rating = '';
    state.sort = DEFAULT_SORT;
    renderFilters();
    refresh();
  });
  function retry() {
    failed = false;
    if (page === 0) setStatus(SPINNER_HTML);
    fetchPage();
  }
  el.retry.addEventListener('click', retry);
  el.statusBox.addEventListener('click', function (e) {
    if (e.target && e.target.id === 'cg-retry-first') retry();
  });
  el.grid.addEventListener('error', replaceBrokenPoster, true);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) maybeLoad();
    }, { rootMargin: '900px 0px' }).observe(el.sentinel);
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
  window.addEventListener('pagehide', function () {
    if (activeController) activeController.abort();
  });
  startFresh();
  loadCountries().then(function (list) {
    countryList = list;
    el.country.innerHTML = optionsHtml('All', POPULAR_COUNTRIES, countryList, state.country);
    el.country.value = state.country;
    syncField(el.country);
  }).catch(function () {});
  loadLanguages().then(function (list) {
    languageList = list;
    el.lang.innerHTML = optionsHtml('All', POPULAR_LANGS, languageList, state.lang);
    el.lang.value = state.lang;
    syncField(el.lang);
  }).catch(function () {});
})();
