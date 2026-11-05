(function () {
  var SOURCES = [
    'https://raw.githubusercontent.com/osaiif/r/main/t.js',
    'https://cdn.jsdelivr.net/gh/osaiif/r@b0802a54a9070f7d6165ff2dabc1a1ee4d5a453e/t.js'
  ];
  function load(url) {
    try {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, false);
      xhr.send(null);
      if (xhr.status >= 200 && xhr.status < 300 && xhr.responseText) {
        (0, eval)(xhr.responseText);
        if (typeof window.SHOWS !== 'undefined' && window.SHOWS && window.SHOWS.length) return true;
      }
    } catch (e) {}
    return false;
  }
  for (var i = 0; i < SOURCES.length; i++) {
    if (load(SOURCES[i])) return;
  }
  window.SHOWS = (function () {
return [
  { title: "The Americans",                      imdb: "tt2149175",  src: "https://image.tmdb.org/t/p/w440_and_h660_face/w1UBlxEXhbKe8sp0fxFZh7MqTce.jpg",  rating: null },
  { title: "Money Heist",                        imdb: "tt13696452", src: "https://image.tmdb.org/t/p/w440_and_h660_face/dmnwJGVergOFWCiLbPsQTyyzePw.jpg",  rating: 3.5 },
  { title: "Dark",                               imdb: "tt5753856",  src: "https://static.tvmaze.com/uploads/images/medium_untouched/201/502948.jpg",       rating: 3.5  },
  { title: "Prison Break",                       imdb: "tt0455275",  src: "https://static.tvmaze.com/uploads/images/medium_untouched/48/122451.jpg",        rating: 4    },
  { title: "Baseball",                           imdb: "tt0108700", src: "https://static.tvmaze.com/uploads/images/medium_untouched/80/202106.jpg",         rating: null },
  { title: "Chernobyl",                          imdb: "tt7366338",  src: "https://static.tvmaze.com/uploads/images/medium_portrait/193/482599.jpg",        rating: 4.5  , journalYear: 2024, journalOrder: 18 },
  { title: "The Bear",                           imdb: "tt14452776", src: "https://static.tvmaze.com/uploads/images/medium_untouched/592/1480192.jpg",      rating: 4    , journalYear: 2023, journalOrder: 13 },
  { title: "The Queen's Gambit",                 imdb: "tt10048342", src: "https://static.tvmaze.com/uploads/images/medium_portrait/510/1275203.jpg",       rating: 4    , journalYear: 2022, journalOrder: 8 },
  { title: "Game of Thrones",                    imdb: "tt0944947",  src: "https://static.tvmaze.com/uploads/images/medium_portrait/498/1245274.jpg",       rating: null    },
  { title: "Mr. Robot",                          imdb: "tt4158110",  src: "https://static.tvmaze.com/uploads/images/medium_portrait/211/528026.jpg",        rating: 4.5 },
  { title: "When They See Us",                   imdb: "tt7137906",  src: "https://image.tmdb.org/t/p/w440_and_h660_face/oPv3nNtkuc6EPEql5lgdOuQNHuG.jpg",        rating: 4    },
  { title: "Ozark",                             imdb: "tt5071412",  src: "https://static.tvmaze.com/uploads/images/medium_portrait/398/996611.jpg",        rating: null },
  { title: "Dexter",                             imdb: "tt0773262",  src: "https://static.tvmaze.com/uploads/images/medium_untouched/39/99906.jpg",         rating: 4    , journalYear: 2022, journalOrder: 1 },
  { title: "Severance",                          imdb: "tt11280740", src: "https://static.tvmaze.com/uploads/images/medium_untouched/547/1369575.jpg",      rating: 4    , journalYear: 2024, journalOrder: 16 },
  { title: "Mindhunter",                         imdb: "tt5290382",  src: "https://static.tvmaze.com/uploads/images/medium_portrait/501/1253490.jpg",       rating: 4    },
  { title: "Band of Brothers",                   imdb: "tt0185906",  src: "https://static.tvmaze.com/uploads/images/medium_portrait/80/201679.jpg",        rating: 5    , journalYear: 2022, journalOrder: 3 },
  { title: "The 100",                            imdb: "tt2661044",  src: "https://static.tvmaze.com/uploads/images/medium_portrait/477/1194981.jpg",       rating: 2.5  },
  { title: "Arcane",                             imdb: "tt11126994", src: "https://static.tvmaze.com/uploads/images/medium_untouched/370/927068.jpg",       rating: 4    , journalYear: 2024, journalOrder: 22 },
  { title: "Sherlock",                           imdb: "tt1475582",  src: "https://static.tvmaze.com/uploads/images/medium_portrait/171/428042.jpg",        rating: 4.5  },
  { title: "Monster",                         imdb: "tt0434706",  src: "https://media.themoviedb.org/t/p/w440_and_h660_face/c7YgL8hQoQvh5gSlTy0otMWlO24.jpg",       rating: null    },
  { title: "Lost",                         imdb: "tt0411008",  src: "https://static.tvmaze.com/uploads/images/medium_portrait/0/1389.jpg",       rating: null    },
  { title: "True Detective",                     imdb: "tt2356777",  src: "https://static.tvmaze.com/uploads/images/medium_untouched/178/445106.jpg",       rating: 4.5  },
  { title: "Black Mirror",                       imdb: "tt2085059",  src: "https://static.tvmaze.com/uploads/images/medium_portrait/564/1411764.jpg",       rating: 4    },
  { title: "The Walking Dead",                   imdb: "tt1520211",  src: "https://static.tvmaze.com/uploads/images/medium_untouched/166/417471.jpg",       rating: 4 },
  { title: "Breaking Bad",                       imdb: "tt0903747",  src: "https://static.tvmaze.com/uploads/images/medium_untouched/35/87912.jpg",         rating: 5    },
  { title: "The Boys",                           imdb: "tt1190634",  src: "https://static.tvmaze.com/uploads/images/medium_portrait/619/1547768.jpg",       rating: 4    , journalYear: 2022, journalOrder: 7 },
  { title: "The Last Kingdom",                   imdb: "tt4179452",  src: "https://static.tvmaze.com/uploads/images/medium_untouched/110/275998.jpg",       rating: 3.5  , journalYear: 2022, journalOrder: 4 },
  { title: "From",                               imdb: "tt9813792",  src: "https://static.tvmaze.com/uploads/images/medium_portrait/621/1554646.jpg",       rating: 3.5  , journalYear: 2023, journalOrder: 15 },
  { title: "The Night Of",                       imdb: "tt2401256",  src: "https://static.tvmaze.com/uploads/images/medium_portrait/62/156270.jpg",         rating: 3    },
  { title: "The Terminal List",                  imdb: "tt11743610", src: "https://static.tvmaze.com/uploads/images/medium_untouched/445/1114091.jpg",      rating: 3    , journalYear: 2023, journalOrder: 12 },
  { title: "And Then There Were None",           imdb: "tt3581932",  src: "https://static.tvmaze.com/uploads/images/medium_portrait/77/192526.jpg",         rating: 3    },
  { title: "The Walking Dead: The Ones Who Live",imdb: "tt9859436",  src: "https://static.tvmaze.com/uploads/images/medium_untouched/487/1219697.jpg",      rating: 1.5  },
  { title: "The Walking Dead: Daryl Dixon",      imdb: "tt13062500", src: "https://static.tvmaze.com/uploads/images/medium_portrait/581/1453640.jpg",       rating: 3.5  },
  { title: "The Walking Dead: Dead City",        imdb: "tt18546730", src: "https://static.tvmaze.com/uploads/images/medium_portrait/630/1575480.jpg",       rating: 2  },
  { title: "Presumed Innocent",                  imdb: "tt17677860", src: "https://static.tvmaze.com/uploads/images/medium_portrait/520/1301035.jpg",       rating: 3    , journalYear: 2024, journalOrder: 17 },
  { title: "The Day of the Jackal",              imdb: "tt24053860", src: "https://static.tvmaze.com/uploads/images/medium_portrait/541/1352923.jpg",       rating: 3    },
  { title: "Dexter: Resurrection",               imdb: "tt33043892", src: "https://static.tvmaze.com/uploads/images/medium_portrait/577/1443218.jpg",       rating: 2.5  , journalYear: 2025, journalOrder: 25 },
  { title: "The Last of Us",                     imdb: "tt3581920",  src: "https://static.tvmaze.com/uploads/images/medium_portrait/563/1409008.jpg",       rating: 3.5  , journalYear: 2025, journalOrder: 26 },
  { title: "Dune: Prophecy",                     imdb: "tt10466872", src: "https://static.tvmaze.com/uploads/images/medium_portrait/543/1358056.jpg",       rating: 3.5  , journalYear: 2025, journalOrder: 27 },
  { title: "Adolescence",                        imdb: "tt31806037", src: "https://static.tvmaze.com/uploads/images/medium_portrait/558/1395109.jpg",       rating: 4.5  , journalYear: 2025, journalOrder: 28 },
  { title: "Through the Darkness",               imdb: "tt15007172", src: "https://static.tvmaze.com/uploads/images/medium_portrait/389/972574.jpg",        rating: 3.5  , journalYear: 2026, journalOrder: 30 },
  { title: "Silo",                               imdb: "tt14688458",  src: "https://static.tvmaze.com/uploads/images/medium_portrait/631/1577677.jpg",       rating: 4  , journalYear: 2026, journalOrder: 31, seasons: [3] },
  { title: "Succession",                         imdb: "tt7660850",  src: "https://static.tvmaze.com/uploads/images/medium_portrait/453/1134275.jpg",       rating: null, list: "dnf" },
  { title: "West World",                            imdb: "tt0475784",  src: "https://static.tvmaze.com/uploads/images/medium_portrait/445/1113927.jpg",       rating: null, list: "dnf" },
  { title: "Teen Wolf",                          imdb: "tt1567432",  src: "https://static.tvmaze.com/uploads/images/medium_portrait/30/75365.jpg",         rating: null, list: "dnf" },
  { title: "Stranger Things",                    imdb: "tt4574334",  src: "https://static.tvmaze.com/uploads/images/medium_untouched/65/163146.jpg",        rating: null, list: "dnf" },
  { title: "The Witcher",                        imdb: "tt5180504",  src: "https://static.tvmaze.com/uploads/images/medium_portrait/594/1486674.jpg",       rating: null, list: "dnf" },
  { title: "The Originals",                            imdb: "tt2632424",  src: "https://static.tvmaze.com/uploads/images/medium_portrait/271/678632.jpg",       rating: null, list: "dnf" },
  { title: "Vikings: Valhalla",                            imdb: "tt11311302",  src: "https://static.tvmaze.com/uploads/images/medium_portrait/523/1308457.jpg",       rating: null, list: "dnf" },
  { title: "11.22.63",                            imdb: "tt2879552",  src: "https://static.tvmaze.com/uploads/images/medium_untouched/63/157660.jpg",       rating: null, list: "dnf" },
  { title: "Pluribus",                           imdb: "tt22202452", src: "https://static.tvmaze.com/uploads/images/medium_portrait/592/1481086.jpg",       rating: null, list: "watchlist" },
  { title: "The Pitt",                           imdb: "tt31938062", src: "https://static.tvmaze.com/uploads/images/medium_portrait/606/1516776.jpg",       rating: null, list: "watchlist" },
  { title: "The Comeback: 2004 Boston Red Sox",  imdb: "tt31186041", src: "https://static.tvmaze.com/uploads/images/medium_untouched/540/1351183.jpg",      rating: null, list: "watchlist" },
  { title: "House of the Dragon",                imdb: "tt11198330", src: "https://static.tvmaze.com/uploads/images/medium_portrait/627/1568449.jpg",       rating: null, list: "watchlist" },
];
  })();
})();
