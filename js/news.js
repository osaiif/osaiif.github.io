(function () {
  var GUARDIAN_KEY = '8ebcb3a0-fa93-4174-b9b6-1966b300fe4f';
  var DAYS_BACK = 7;
  var ON_TOPIC = /\b(films?|movies?|cinema|cinemas|box[- ]office|oscars?|academy awards?|bafta|baftas|emmys?|golden globes?|cannes|sundance|venice film|tiff|sag awards?|critics choice|film festival|awards? (season|race|nominations?|ceremony)|nominat\w*|actors?|actress(es)?|starring|casting|director|directors|screenwriter|screenplay|trailers?|sequels?|prequels?|reboots?|franchise|blockbusters?|studios?|hollywood|netflix|disney|hbo|prime video|apple tv|paramount|streaming|streamer|tv|television|series|sitcom|miniseries|showrunner|episodes?|seasons?|finale|documentar\w*|animation|animated|marvel|dc studios|star wars)\b/i;
  var OFF_TOPIC_TAG = /(radio|podcast|music|games?|gaming|books?|fashion|food|sport|football|cricket|rugby|tennis|golf|politics|business|technology|science|world\/)/i;
  var TOPIC_TAG = /(^film\/|tv-and-radio\/(?!radio|podcasts?|tv-and-radio\b)|\/film$|television|tv-and-radio\/(tv|television|series)|\/(tv|television)\b|awards|oscars|bafta|emmy|cinema|actors?|movies?)/i;
  function pad(n) {
    return n < 10 ? '0' + n : '' + n;
  }
  function startDate() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - DAYS_BACK);
    return d;
  }
  function guardianUrl() {
    var d = startDate();
    var from = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    return 'https://content.guardianapis.com/search?section=film%7Ctv-and-radio&tag=type%2Farticle&order-by=newest&page-size=100&from-date=' + from + '&show-tags=keyword&show-fields=trailText,thumbnail&api-key=' + GUARDIAN_KEY;
  }
  function isRelated(item) {
    var tags = item.tags || [];
    var tagIds = tags.map(function (t) { return t.id || ''; }).join(' ');
    var tagText = tags.map(function (t) { return (t.id || '') + ' ' + (t.webTitle || ''); }).join(' ');
    var text = (item.webTitle || '') + ' ' + plainText(item.fields && item.fields.trailText);
    var topicTag = TOPIC_TAG.test(tagIds);
    var topicText = ON_TOPIC.test(text);
    if (item.sectionId === 'film') return true;
    if (topicTag) return true;
    if (OFF_TOPIC_TAG.test(tagText)) return false;
    return topicText;
  }
  function isRecent(item) {
    var d = new Date(item.webPublicationDate);
    return !isNaN(d.getTime()) && d >= startDate();
  }
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
    return fetch(guardianUrl())
      .then(function (res) {
        if (!res.ok) throw new Error('Guardian request failed (' + res.status + ')');
        return res.json();
      })
      .then(function (data) {
        return ((data.response && data.response.results) || []).filter(function (item) {
          return item && item.webTitle && isHttps(item.webUrl) && item.fields && isHttps(item.fields.thumbnail) && isRecent(item) && isRelated(item);
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
  function validId(id) {
    return /^(film|tv-and-radio)\/[a-z0-9\-\/]+$/i.test(id || '');
  }
  function articleUrl(item) {
    return '/news/article/?id=' + encodeURIComponent(item.id);
  }
  function loadArticle(id) {
    var url = 'https://content.guardianapis.com/' + id + '?show-fields=trailText,byline,body,main&api-key=' + GUARDIAN_KEY;
    return fetch(url).then(function (res) {
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Guardian request failed (' + res.status + ')');
      return res.json();
    }).then(function (data) {
      var item = data && data.response && data.response.content;
      if (!item || !item.webTitle || !isHttps(item.webUrl) || !item.fields || !item.fields.body) return null;
      if (item.sectionId !== 'film' && item.sectionId !== 'tv-and-radio') return null;
      return item;
    });
  }
  function htmlEl(tag, className, html) {
    var el = document.createElement(tag);
    el.className = className;
    el.innerHTML = html;
    return el;
  }
  function buildArticle(item) {
    var f = item.fields;
    var wrap = document.createDocumentFragment();
    wrap.appendChild(textEl('p', 'article-section', item.sectionName || ''));
    wrap.appendChild(textEl('h1', 'article-title', item.webTitle));
    var standfirst = plainText(f.trailText);
    if (standfirst) wrap.appendChild(textEl('p', 'article-standfirst', standfirst));
    var meta = [f.byline ? 'By ' + plainText(f.byline) : '', formatDate(item.webPublicationDate)].filter(Boolean).join(' · ');
    if (meta) wrap.appendChild(textEl('p', 'article-meta', meta));
    if (f.main) wrap.appendChild(htmlEl('div', 'article-main', f.main));
    wrap.appendChild(htmlEl('div', 'article-body', f.body));
    wrap.appendChild(textEl('p', 'article-notice', '© Guardian News & Media Limited or its affiliated companies. All rights reserved. Provided by The Guardian through the Guardian Open Platform, for personal use only.'));
    var original = document.createElement('a');
    original.className = 'article-original';
    original.href = item.webUrl;
    original.target = '_blank';
    original.rel = 'noopener noreferrer';
    original.textContent = 'Read the original article on theguardian.com';
    wrap.appendChild(original);
    var powered = document.createElement('a');
    powered.className = 'article-powered';
    powered.href = 'https://www.theguardian.com/';
    powered.target = '_blank';
    powered.rel = 'noopener noreferrer';
    var logo = imageEl('', '/assets/powered-by-guardian.png');
    logo.removeAttribute('class');
    logo.alt = 'Powered by The Guardian';
    logo.loading = 'eager';
    powered.appendChild(logo);
    wrap.appendChild(powered);
    return wrap;
  }
  window.tvboxNews = { validId: validId, articleUrl: articleUrl, loadArticle: loadArticle, buildArticle: buildArticle, load: load, buildItem: buildItem, buildCard: buildCard, addNav: addNav, textEl: textEl };
})();
