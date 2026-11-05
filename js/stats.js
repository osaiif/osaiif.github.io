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
        title: entry.title,
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
