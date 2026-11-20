(function () {
  var GUARDIAN_KEY = '8ebcb3a0-fa93-4174-b9b6-1966b300fe4f';
  var GUARDIAN_URL = 'https://content.guardianapis.com/search?section=film%7Ctv-and-radio&tag=type%2Farticle&order-by=newest&page-size=24&show-fields=trailText,thumbnail&api-key=' + GUARDIAN_KEY;
  function isHttps(value) {
    return /^https:\/\//.test(value || '');
  }
  function formatDate(value, timeZone) {
    var d = new Date(value);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: timeZone });
  }
  function plainText(html) {
    return new DOMParser().parseFromString(html || '', 'text/html').body.textContent.trim();
  }
  function textEl(tag, className, text) {
    var el = document.createElement(tag);
    el.className = className;
    el.textContent = text;
    return el;
  }
  function imageEl(className, src) {
    var img = document.createElement('img');
    img.className = className;
    img.src = src;
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    return img;
  }
  function metaText(item) {
    return [item.sectionName, formatDate(item.webPublicationDate)].filter(Boolean).join(' · ');
  }
  function load() {
    return fetch(GUARDIAN_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('Guardian request failed (' + res.status + ')');
        return res.json();
      })
      .then(function (data) {
        return ((data.response && data.response.results) || []).filter(function (item) {
          return item && item.webTitle && isHttps(item.webUrl) && item.fields && isHttps(item.fields.thumbnail);
        });
      });
  }
  function buildItem(item, href, external) {
    var a = document.createElement('a');
    a.className = 'news-item';
    a.href = href;
    if (external) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
    a.appendChild(imageEl('news-thumb', item.fields.thumbnail));
    var body = document.createElement('div');
    body.className = 'news-body';
    body.appendChild(textEl('p', 'news-title', item.webTitle));
    var summary = plainText(item.fields.trailText);
    if (summary) body.appendChild(textEl('p', 'news-summary', summary));
    var meta = metaText(item);
    if (meta) body.appendChild(textEl('p', 'news-meta', meta));
    a.appendChild(body);
    return a;
  }
  function buildCard(item, href) {
    var a = document.createElement('a');
    a.className = 'news-card';
    a.href = href;
    a.appendChild(imageEl('news-card-img', item.fields.thumbnail));
    a.appendChild(textEl('p', 'news-card-title', item.webTitle));
    var summary = plainText(item.fields.trailText);
    if (summary) a.appendChild(textEl('p', 'news-card-summary', summary));
    var meta = metaText(item);
    if (meta) a.appendChild(textEl('p', 'news-card-meta', meta));
    return a;
  }
  function addNav(track) {
    var wrap = track.parentNode;
    var prevBtn = document.createElement('button');
    prevBtn.type = 'button';
    prevBtn.className = 'carousel-nav -prev';
    prevBtn.setAttribute('aria-label', 'Scroll left');
    prevBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>';
    prevBtn.addEventListener('click', function () {
      track.scrollBy({ left: -track.clientWidth * 0.8, behavior: 'smooth' });
    });
    var nextBtn = document.createElement('button');
    nextBtn.type = 'button';
    nextBtn.className = 'carousel-nav -next';
    nextBtn.setAttribute('aria-label', 'Scroll right');
    nextBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M8.59 16.59L10 18l6-6-6-6-1.41 1.41L13.17 12z"/></svg>';
    nextBtn.addEventListener('click', function () {
      track.scrollBy({ left: track.clientWidth * 0.8, behavior: 'smooth' });
    });
    wrap.appendChild(prevBtn);
    wrap.appendChild(nextBtn);
    function updateNav() {
      var max = track.scrollWidth - track.clientWidth;
      prevBtn.style.visibility = track.scrollLeft <= 4 ? 'hidden' : '';
      nextBtn.style.visibility = track.scrollLeft >= max - 4 ? 'hidden' : '';
    }
    track.addEventListener('scroll', updateNav, { passive: true });
    window.addEventListener('resize', updateNav);
    updateNav();
  }
  window.tvboxNews = { load: load, buildItem: buildItem, buildCard: buildCard, addNav: addNav, textEl: textEl };
})();
