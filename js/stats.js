var STATS_YEARS = (function () {
  var byYear = {};
  SHOWS.filter(function (s) { return !!s.journalYear; })
    .sort(function (a, b) { return a.journalOrder - b.journalOrder; })
    .forEach(function (s) {
      (byYear[s.journalYear] = byYear[s.journalYear] || []).push({ title: s.title, imdb: s.imdb, seasons: s.seasons });
    });
  return byYear;
})();
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
  var TMDB_POSTER_BASE = 'https://image.tmdb.org/t/p/w154';
  var CACHE_PREFIX = 'tvbox:stats:';
  var CACHE_VERSION = 3;
  var CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
  var DEFAULT_RUNTIME_MIN = 45;
  var EMPTY_RECORD = Object.freeze({
    episodes: 0,
    seasons: 0,
    minutes: 0,
    genres: [],
    networks: [],
    directors: [],
    countries: [],
    languages: [],
    rating: 0,
    votes: 0,
    popularity: 0,
    firstYear: null,
    lastYear: null,
    status: null,
    poster: null,
    name: null,
    rawSeasons: []
  });
  function readCache(imdbId) {
    try {
      var raw = localStorage.getItem(CACHE_PREFIX + imdbId);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || parsed.v !== CACHE_VERSION || (Date.now() - parsed.ts) > CACHE_TTL_MS) return null;
      return parsed.data;
    } catch (e) {
      return null;
    }
  }
  function writeCache(imdbId, data) {
    try {
      localStorage.setItem(CACHE_PREFIX + imdbId, JSON.stringify({ data: data, ts: Date.now(), v: CACHE_VERSION }));
    } catch (e) {}
  }
  function yearFromDate(str) {
    if (!str || str.length < 4) return null;
    var y = parseInt(str.slice(0, 4), 10);
    return isNaN(y) ? null : y;
  }
  function normalizeShow(show) {
    if (!show) return EMPTY_RECORD;
    var episodes = show.number_of_episodes || 0;
    var seasons = show.number_of_seasons || 0;
    var runtimes = show.episode_run_time || [];
    var avgRuntime = runtimes.length
      ? runtimes.reduce(function (a, b) { return a + b; }, 0) / runtimes.length
      : DEFAULT_RUNTIME_MIN;
    var genres = (show.genres || []).map(function (g) { return g.name; });
    var networks = (show.networks || []).map(function (n) { return n.name; });
    var directors = null;
    if (show.aggregate_credits) {
      directors = [];
      ((show.aggregate_credits.crew) || []).forEach(function (person) {
        var eps = (person.jobs || []).reduce(function (sum, j) {
          return j && j.job === 'Director' ? sum + (j.episode_count || 0) : sum;
        }, 0);
        if (eps > 0 && person.id && person.name) directors.push({ id: person.id, name: person.name, eps: eps });
      });
      directors.sort(function (a, b) { return b.eps - a.eps; });
      directors = directors.slice(0, 15);
    }
    var countries = (show.production_countries || []).map(function (c) { return c.name; });
    if (!countries.length) countries = (show.origin_country || []).slice();
    var languages = (show.spoken_languages || []).map(function (l) { return l.english_name || l.name; });
    if (!languages.length && show.original_language) languages = [show.original_language.toUpperCase()];
    var rawSeasons = (show.seasons || [])
      .filter(function (s) { return s && typeof s.season_number === 'number' && s.season_number > 0; })
      .map(function (s) {
        return { number: s.season_number, episodes: s.episode_count || 0, airDate: s.air_date || null };
      });
    return {
      episodes: episodes,
      seasons: seasons,
      minutes: episodes * avgRuntime,
      rawSeasons: rawSeasons,
      genres: genres.length ? genres : ['Unspecified'],
      networks: networks.length ? networks : ['Independent / Other'],
      directors: directors,
      countries: countries.length ? countries : ['Unspecified'],
      languages: languages.length ? languages : ['Unspecified'],
      rating: typeof show.vote_average === 'number' ? show.vote_average : 0,
      votes: show.vote_count || 0,
      popularity: show.popularity || 0,
      firstYear: yearFromDate(show.first_air_date),
      lastYear: yearFromDate(show.last_air_date),
      status: show.status || null,
      poster: show.poster_path ? (TMDB_POSTER_BASE + show.poster_path) : null,
      name: show.name || null
    };
  }
  function fetchShowRecord(imdbId, withDirectors) {
    var cached = readCache(imdbId);
    if (cached && (!withDirectors || cached.directors)) return Promise.resolve(cached);
    return tmdbFetch('/find/' + encodeURIComponent(imdbId), 'external_source=imdb_id')
      .catch(function () { return null; })
      .then(function (found) {
        var match = found && found.tv_results && found.tv_results[0];
        if (!match) return null;
        return tmdbFetch('/tv/' + match.id, withDirectors ? 'append_to_response=aggregate_credits' : '').catch(function () { return null; });
      })
      .then(function (show) {
        var record = normalizeShow(show);
        writeCache(imdbId, record);
        return record;
      })
      .catch(function () {
        return EMPTY_RECORD;
      });
  }
  function fetchAll(imdbIds, withDirectors) {
    var CONCURRENCY = 5;
    var queue = imdbIds.slice();
    var results = {};
    function worker() {
      var id = queue.shift();
      if (!id) return Promise.resolve();
      return fetchShowRecord(id, withDirectors).then(function (record) {
        results[id] = record;
        return worker();
      });
    }
    var workers = [];
    for (var i = 0; i < Math.min(CONCURRENCY, queue.length); i++) {
      workers.push(worker());
    }
    return Promise.all(workers).then(function () { return results; });
  }
  function applyWatchedSeasons(record, watchedSeasons) {
    if (!watchedSeasons || !watchedSeasons.length) return record;
    if (!record.rawSeasons || !record.rawSeasons.length) return record;
    var wanted = watchedSeasons.map(function (n) { return Number(n); });
    var matched = record.rawSeasons.filter(function (s) { return wanted.indexOf(s.number) !== -1; });
    if (!matched.length) return record;
    var episodes = matched.reduce(function (sum, s) { return sum + (s.episodes || 0); }, 0);
    var avgRuntime = record.episodes > 0 ? (record.minutes / record.episodes) : DEFAULT_RUNTIME_MIN;
    var years = matched
      .map(function (s) { return yearFromDate(s.airDate); })
      .filter(function (y) { return y !== null; });
    var scoped = {};
    for (var key in record) {
      if (Object.prototype.hasOwnProperty.call(record, key)) scoped[key] = record[key];
    }
    scoped.episodes = episodes;
    scoped.seasons = matched.length;
    scoped.minutes = episodes * avgRuntime;
    if (years.length) {
      scoped.firstYear = Math.min.apply(null, years);
      scoped.lastYear = Math.max.apply(null, years);
    }
    return scoped;
  }
  function aggregate(showList, records) {
    var summary = {
      hours: 0,
      episodes: 0,
      seasons: 0,
      showCount: showList.length,
      platforms: {},
      genres: {},
      directors: {},
      directorIds: {},
      countries: {},
      languages: {},
      ratingSum: 0,
      ratedShowCount: 0,
      avgRating: 0,
      details: []
    };
    showList.forEach(function (entry) {
      var full = records[entry.imdb] || EMPTY_RECORD;
      var r = applyWatchedSeasons(full, entry.seasons);
      var hours = r.minutes / 60;
      summary.hours += hours;
      summary.episodes += r.episodes;
      summary.seasons += r.seasons;
      var platformShare = hours / r.networks.length;
      r.networks.forEach(function (name) {
        summary.platforms[name] = (summary.platforms[name] || 0) + platformShare;
      });
      var genreShare = hours / r.genres.length;
      r.genres.forEach(function (name) {
        summary.genres[name] = (summary.genres[name] || 0) + genreShare;
      });
      var watchedFraction = full.episodes > 0 ? r.episodes / full.episodes : 1;
      (r.directors || []).forEach(function (d) {
        summary.directors[d.name] = (summary.directors[d.name] || 0) + d.eps * watchedFraction;
        summary.directorIds[d.name] = d.id;
      });
      var countryShare = hours / r.countries.length;
      r.countries.forEach(function (name) {
        summary.countries[name] = (summary.countries[name] || 0) + countryShare;
      });
      var languageShare = hours / r.languages.length;
      r.languages.forEach(function (name) {
        summary.languages[name] = (summary.languages[name] || 0) + languageShare;
      });
      if (r.rating > 0) {
        summary.ratingSum += r.rating;
        summary.ratedShowCount += 1;
      }
      summary.details.push({
        title: full.name || entry.title,
        imdb: entry.imdb,
        hours: hours,
        episodes: r.episodes,
        seasons: r.seasons,
        rating: r.rating,
        votes: r.votes,
        popularity: r.popularity,
        firstYear: r.firstYear,
        lastYear: r.lastYear,
        status: r.status,
        poster: r.poster,
        networks: r.networks,
        genres: r.genres
      });
    });
    summary.avgRating = summary.ratedShowCount ? (summary.ratingSum / summary.ratedShowCount) : 0;
    return summary;
  }
  function toRanked(bucket, cap) {
    var list = Object.keys(bucket)
      .map(function (name) { return { name: name, value: bucket[name] }; })
      .sort(function (a, b) { return b.value - a.value; });
    if (!cap || list.length <= cap) return list;
    var head = list.slice(0, cap - 1);
    var tail = list.slice(cap - 1);
    var otherTotal = tail.reduce(function (sum, item) { return sum + item.value; }, 0);
    head.push({ name: 'Other', value: otherTotal });
    return head;
  }
  global.TVStats = {
    fetchAll: fetchAll,
    aggregate: aggregate,
    toRanked: toRanked
  };
})(window);
