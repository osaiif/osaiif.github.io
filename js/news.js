(function () {
  var GUARDIAN_KEY = '8ebcb3a0-fa93-4174-b9b6-1966b300fe4f';
  var GUARDIAN_URL = 'https://content.guardianapis.com/search?section=film%7Ctv-and-radio&order-by=newest&page-size=12&show-fields=trailText&api-key=' + GUARDIAN_KEY;
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
  function load() {
    return fetch(GUARDIAN_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('Guardian request failed (' + res.status + ')');
        return res.json();
      })
      .then(function (data) {
        return ((data.response && data.response.results) || []).filter(function (item) {
          return item && item.webTitle && /^https:\/\//.test(item.webUrl || '');
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
    a.appendChild(textEl('p', 'news-title', item.webTitle));
    var summary = plainText(item.fields && item.fields.trailText);
    if (summary) a.appendChild(textEl('p', 'news-summary', summary));
    var meta = [item.sectionName, formatDate(item.webPublicationDate)].filter(Boolean).join(' · ');
    if (meta) a.appendChild(textEl('p', 'news-meta', meta));
    return a;
  }
  window.tvboxNews = { load: load, buildItem: buildItem, formatDate: formatDate, textEl: textEl };
})();
