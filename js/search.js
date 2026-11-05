(function () {
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
  var IMG_BASE = 'https://image.tmdb.org/t/p/w154';
  var SAIF = {
    name: 'Saif',
    href: '/u/saif/',
    photo: 'https://raw.githubusercontent.com/osaiif/r/main/r.webp'
  };
  function matchesSaif(query) {
    var t = String(query || '').trim().toLowerCase().replace(/^@/, '');
    return t.length >= 3 && ('saif'.indexOf(t) === 0 || t === 'osaif');
  }
  function firstLetter(name) {
    var chars = Array.from(String(name || '').trim());
    return chars.length ? chars[0].toUpperCase() : '';
  }
  var input = document.getElementById('home-search-input');
  var resultsContainer = document.getElementById('results-container');
  var statusEl = document.getElementById('search-status');
  var debounceTimer = null;
  var currentRequestId = 0;
  var activeController = null;
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
  var SPINNER_HTML =
    '<div class="spinner -inline"><div></div><div></div><div></div><div></div><div></div><div></div></div>';
  var LOADING_HTML = '<div class="loading-shimmer">' + SPINNER_HTML + '</div>';
  function clearResults() {
    resultsContainer.innerHTML = '';
  }
  function yearFromDate(dateStr) {
    if (!dateStr) return '';
    return dateStr.slice(0, 4);
  }
  var STAR_ICON_SVG =
    '<svg class="star-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.75l2.87 6.13 6.63.7-4.93 4.6 1.32 6.62L12 17.9l-5.89 3.9 1.32-6.62-4.93-4.6 6.63-.7L12 2.75z"></path></svg>';
  function formatRating(voteAverage, voteCount) {
    if (!voteAverage || !voteCount) return '';
    return voteAverage.toFixed(1);
  }
  function buildCard(show) {
    var item = document.createElement('a');
    item.className = 'result-item';
    item.href = '/show/?id=' + show.id;
    var posterSrc = show.poster_path
      ? IMG_BASE + show.poster_path
      : 'poster-placeholder.jpg';
    var rating = formatRating(show.vote_average, show.vote_count);
    item.innerHTML =
      '<img class="poster" src="' + posterSrc + '" alt="' + escapeHtml(show.name) + '" loading="lazy" decoding="async">' +
      '<div class="details">' +
        '<div class="header">' +
          '<h2 class="title">' + escapeHtml(show.name) + '</h2>' +
          '<div class="meta">' +
            (yearFromDate(show.first_air_date) ? '<span class="year numbers">' + yearFromDate(show.first_air_date) + '</span>' : '') +
            (rating ? '<span class="rating numbers">' + STAR_ICON_SVG + rating + '</span>' : '') +
          '</div>' +
        '</div>' +
        (show.overview ? '<p class="overview">' + escapeHtml(show.overview) + '</p>' : '') +
        '<div class="creator">' +
          '<span>Created by</span>' +
          '<span class="creator-badge -loading" data-show-id="' + show.id + '">…</span>' +
        '</div>' +
      '</div>';
    return item;
  }
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }
  function fetchCreators(shows) {
    shows.forEach(function (show) {
      tmdbFetch('/tv/' + show.id)
        .catch(function () { return null; })
        .then(function (details) {
          var badge = resultsContainer.querySelector('.creator-badge[data-show-id="' + show.id + '"]');
          if (!badge) return;
          badge.classList.remove('-loading');
          var names = (details && details.created_by || []).map(function (c) { return c.name; });
          badge.textContent = names.length ? names.join(', ') : 'Unknown';
        })
        .catch(function () {
          var badge = resultsContainer.querySelector('.creator-badge[data-show-id="' + show.id + '"]');
          if (badge) {
            badge.classList.remove('-loading');
            badge.textContent = 'Unknown';
          }
        });
    });
  }
  function buildSaifCard() {
    var item = document.createElement('a');
    item.className = 'result-item person-item';
    item.href = SAIF.href;
    item.innerHTML =
      '<span class="person-photo">' +
        '<span class="person-initial">' + escapeHtml(firstLetter(SAIF.name)) + '</span>' +
        '<img src="' + escapeHtml(SAIF.photo) + '" alt="" decoding="async">' +
      '</span>' +
      '<div class="details">' +
        '<div class="header">' +
          '<h2 class="title">' + escapeHtml(SAIF.name) + '</h2>' +
          '<div class="meta"><span class="year">Profile</span></div>' +
        '</div>' +
        '<p class="overview">Favorites, ratings and stats.</p>' +
      '</div>';
    return item;
  }
  function buildGroupLabel(text) {
    var label = document.createElement('div');
    label.className = 'result-group-label';
    label.textContent = text;
    return label;
  }
  function renderResults(query, shows) {
    var showSaif = matchesSaif(query);
    clearResults();
    if (!showSaif && !shows.length) {
      setStatus('');
      resultsContainer.innerHTML = '<p class="no-results">No results found for “' + escapeHtml(query) + '”.</p>';
      return;
    }
    setStatus('');
    var multiple = showSaif && shows.length > 0;
    var fragment = document.createDocumentFragment();
    if (showSaif) {
      if (multiple) fragment.appendChild(buildGroupLabel('Profile'));
      fragment.appendChild(buildSaifCard());
    }
    if (shows.length) {
      if (multiple) fragment.appendChild(buildGroupLabel('Shows'));
      shows.forEach(function (show) { fragment.appendChild(buildCard(show)); });
    }
    resultsContainer.appendChild(fragment);
    if (shows.length) fetchCreators(shows);
  }
  function runSearch(query) {
    var requestId = ++currentRequestId;
    document.title = query.trim()
      ? query.trim() + ' | tvbox'
      : 'Search TV Shows ǀ tvbox';
    if (!query.trim()) {
      clearResults();
      setStatus('');
      return;
    }
    setStatus(LOADING_HTML);
    if (activeController) activeController.abort();
    var controller = new AbortController();
    activeController = controller;
    tmdbFetch('/search/tv', 'query=' + encodeURIComponent(query.trim()) + '&include_adult=false&page=1', controller.signal)
      .then(function (data) {
        if (requestId !== currentRequestId) return;
        var shows = (data.results || []).filter(function (r) { return r.name; });
        renderResults(query.trim(), shows);
      })
      .catch(function (err) {
        if (err.name === 'AbortError') return;
        if (requestId !== currentRequestId) return;
        clearResults();
        if (matchesSaif(query)) {
          setStatus('');
          resultsContainer.appendChild(buildSaifCard());
          return;
        }
        setStatus('Something went wrong: ' + err.message, true);
      });
  }
  input.addEventListener('input', function () {
    var query = input.value;
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function () {
      runSearch(query);
    }, 350);
  });
  var params = new URLSearchParams(window.location.search);
  var initialQuery = params.get('q');
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
