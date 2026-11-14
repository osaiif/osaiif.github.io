(function () {
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
  var RATINGS = [['6', '6+'], ['7', '7+'], ['8', '8+'], ['9', '9+']];
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
      html += '<optgroup label="All">' + full.map(opt).join('') + '</optgroup>';
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
  function markSet(select) {
    select.classList.toggle('-set', select.value !== '' && select.value !== 'all');
  }
  function cardHtml(show) {
    var year = show.first_air_date ? show.first_air_date.slice(0, 4) : '';
    var rating = show.vote_count > 0 && show.vote_average > 0 ? show.vote_average.toFixed(1) : '';
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
    yearSelect: document.getElementById('f-year'),
    meta: document.getElementById('cg-meta'),
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
  var yearParam = parseInt((params.get('y') || params.get('s') || '').replace(/\D/g, ''), 10);
  var year = !isNaN(yearParam) && yearParam >= 1900 && yearParam <= MAX_YEAR ? yearParam : NOW_YEAR;
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
      history.replaceState(null, '', '/y/' + year + (q ? '?' + q : '') + window.location.hash);
    } catch (e) {}
  }
  function filtersActive() {
    return !!(state.genre || state.country || state.lang || state.status || state.type || state.rating || state.sort !== DEFAULT_SORT);
  }
  function extraActive() {
    return !!(state.status || state.type || state.rating);
  }
  function yearOptionsHtml() {
    var html = '';
    var lowest = Math.min(MIN_YEAR, year);
    var highest = Math.max(NOW_YEAR, year);
    for (var y = highest; y >= lowest; y--) {
      html += '<option value="' + y + '"' + (y === year ? ' selected' : '') + '>' + y + '</option>';
    }
    return html;
  }
  function renderFilters() {
    el.yearSelect.innerHTML = yearOptionsHtml();
    el.yearSelect.value = String(year);
    el.genre.innerHTML = '<option value="">Any genre</option>' + GENRES.map(function (g) {
      return '<option value="' + g.slug + '"' + (g.slug === state.genre ? ' selected' : '') + '>' + escapeHtml(g.name) + '</option>';
    }).join('');
    el.genre.value = state.genre;
    el.sort.innerHTML = SORTS.map(function (pair) {
      return '<option value="' + pair[0] + '">' + escapeHtml(pair[1]) + '</option>';
    }).join('');
    el.sort.value = state.sort;
    el.country.innerHTML = optionsHtml('Any country', POPULAR_COUNTRIES, countryList, state.country);
    el.lang.innerHTML = optionsHtml('Any language', POPULAR_LANGS, languageList, state.lang);
    el.status.innerHTML = simpleOptionsHtml('Any status', STATUSES, state.status);
    el.type.innerHTML = simpleOptionsHtml('Any type', TYPES, state.type);
    el.rating.innerHTML = simpleOptionsHtml('Any rating', RATINGS, state.rating);
    el.country.value = state.country;
    el.lang.value = state.lang;
    markSet(el.genre);
    markSet(el.country);
    markSet(el.lang);
    markSet(el.status);
    markSet(el.type);
    markSet(el.rating);
    el.sort.classList.toggle('-set', state.sort !== DEFAULT_SORT);
    el.reset.hidden = !filtersActive();
    var open = extraActive();
    el.extra.hidden = !open;
    el.moreToggle.setAttribute('aria-expanded', String(open));
    el.moreToggle.textContent = open ? 'Fewer filters' : 'More filters';
  }
  function renderTitle() {
    el.titleName.textContent = String(year);
    var g = genreBySlug(state.genre);
    document.title = (g ? g.name + ' ' : '') + 'TV Shows from ' + year + ' | tvbox';
  }
  function buildQuery(pageNumber) {
    var q = [
      'include_adult=false',
      'include_null_first_air_dates=false',
      'language=en-US',
      'first_air_date.gte=' + year + '-01-01',
      'first_air_date.lte=' + year + '-12-31',
      'sort_by=' + state.sort,
      'page=' + pageNumber
    ];
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
  function renderMeta(data) {
    var total = data.total_results || 0;
    var g = genreBySlug(state.genre);
    el.meta.innerHTML = '<span class="numbers">' + formatCount(total) + '</span> ' + (g ? escapeHtml(g.name) + ' ' : '') + (total === 1 ? 'show' : 'shows') + ' first aired in <span class="numbers">' + year + '</span>';
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
          renderMeta(data);
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
    el.meta.textContent = '';
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
  renderFilters();
  renderTitle();
  syncUrl();
  el.yearSelect.addEventListener('change', function () {
    var target = parseInt(el.yearSelect.value, 10);
    if (isNaN(target) || target === year) return;
    year = target;
    refresh();
  });
  [['genre', el.genre], ['sort', el.sort], ['country', el.country], ['lang', el.lang], ['status', el.status], ['type', el.type], ['rating', el.rating]].forEach(function (pair) {
    pair[1].addEventListener('change', function () {
      state[pair[0]] = pair[1].value;
      if (pair[0] === 'sort') pair[1].classList.toggle('-set', state.sort !== DEFAULT_SORT);
      else markSet(pair[1]);
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
    el.country.innerHTML = optionsHtml('Any country', POPULAR_COUNTRIES, countryList, state.country);
    el.country.value = state.country;
    markSet(el.country);
  }).catch(function () {});
  loadLanguages().then(function (list) {
    languageList = list;
    el.lang.innerHTML = optionsHtml('Any language', POPULAR_LANGS, languageList, state.lang);
    el.lang.value = state.lang;
    markSet(el.lang);
  }).catch(function () {});
})();
