(function () {
  var YEAR_TAIL = /^(.+)-((?:19|20)\d{2})$/;
  var ORDINAL_TAIL = /^(.+)-(\d{1,2})$/;
  var ID_TAIL = /^(?:.*-)?(\d+)$/;
  function slugify(name) {
    var s = String(name || '');
    if (s.normalize) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function nameOf(kind, r) {
    if (kind === 'movie') return r.title || r.original_title || '';
    return r.name || r.original_name || '';
  }
  function yearOf(kind, r) {
    var d = kind === 'movie' ? r.release_date : r.first_air_date;
    return d ? String(d).slice(0, 4) : '';
  }
  function searchPath(kind) {
    return kind === 'movie' ? '/search/movie' : (kind === 'person' ? '/search/person' : '/search/tv');
  }
  function search(kind, get, name, year) {
    var params = 'query=' + encodeURIComponent(name) + '&include_adult=false&page=1';
    if (year) params += (kind === 'movie' ? '&primary_release_year=' : '&first_air_date_year=') + year;
    return get(searchPath(kind), params).then(function (data) {
      return (data && data.results) || [];
    });
  }
  function exact(kind, list, slug) {
    return list
      .map(function (r, i) { return { r: r, i: i }; })
      .filter(function (e) { return slugify(nameOf(kind, e.r)) === slug; })
      .sort(function (a, b) {
        var d = (b.r.popularity || 0) - (a.r.popularity || 0);
        return d || a.i - b.i;
      })
      .map(function (e) { return e.r; });
  }
  function storeKey(kind, slug) {
    return 'tvbox:slug:' + kind + ':' + slug;
  }
  function remember(kind, slug, id) {
    try { sessionStorage.setItem(storeKey(kind, slug), String(id)); } catch (e) {}
  }
  function remembered(kind, slug) {
    try { return sessionStorage.getItem(storeKey(kind, slug)); } catch (e) { return null; }
  }
  function safe(promise) {
    return promise.catch(function () { return []; });
  }
  function slugFor(kind, item, get) {
    var base = slugify(nameOf(kind, item));
    if (!base || item.id == null) return Promise.resolve('');
    var year = kind === 'person' ? '' : yearOf(kind, item);
    return search(kind, get, nameOf(kind, item), '').then(function (list) {
      var found = exact(kind, list, base);
      var slug = base;
      if (found.length && found[0].id !== item.id) {
        if (kind === 'person') {
          var idx = -1;
          found.forEach(function (r, i) { if (idx < 0 && r.id === item.id) idx = i; });
          if (idx > 0) slug = base + '-' + (idx + 1);
        } else if (year) {
          slug = base + '-' + year;
        }
      }
      remember(kind, slug, item.id);
      return slug;
    }).catch(function () {
      remember(kind, base, item.id);
      return base;
    });
  }
  function resolve(kind, rawSlug, get) {
    var slug = String(rawSlug || '').trim().toLowerCase();
    if (!slug) return Promise.resolve(null);
    var saved = remembered(kind, slug);
    if (saved) return Promise.resolve(saved);
    function viaId() {
      var m = slug.match(ID_TAIL);
      return m ? m[1] : null;
    }
    function viaOrdinal() {
      var m = kind === 'person' ? slug.match(ORDINAL_TAIL) : null;
      if (!m) return Promise.resolve(null);
      var n = parseInt(m[2], 10);
      if (n < 2) return Promise.resolve(null);
      return safe(search(kind, get, m[1].replace(/-/g, ' '), '')).then(function (list) {
        var found = exact(kind, list, m[1]);
        return found[n - 1] ? found[n - 1].id : null;
      });
    }
    function viaYear() {
      var m = kind === 'person' ? null : slug.match(YEAR_TAIL);
      if (!m) return Promise.resolve(null);
      return safe(search(kind, get, m[1].replace(/-/g, ' '), m[2])).then(function (list) {
        var found = exact(kind, list, m[1]).filter(function (r) { return yearOf(kind, r) === m[2]; });
        return found[0] ? found[0].id : null;
      });
    }
    return safe(search(kind, get, slug.replace(/-/g, ' '), '')).then(function (list) {
      var found = exact(kind, list, slug);
      if (found[0]) return found[0].id;
      return viaYear().then(function (id) {
        if (id != null) return id;
        return viaOrdinal();
      }).then(function (id) {
        return id != null ? id : viaId();
      });
    });
  }
  window.tvboxSlug = { slugify: slugify, slugFor: slugFor, resolve: resolve };
})();
