const WATCHLIST_BTN_LABEL = 'Add to Watchlist';
const MARKAS_BTN_LABEL = 'Mark As';
const AUTH_PROMPT_MESSAGE = 'Sign in or Sign up to continue';
const MARKAS_OPTIONS = [
  { id: 'dnf', label: 'Did Not Finish' },
  { id: 'watched', label: 'Watched' },
];
const STAR_COUNT = 5;
const TOAST_VISIBLE_MS = 2200;
const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_LABELS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_LABELS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
document.addEventListener('DOMContentLoaded', () => {
  const actionsBox = document.querySelector('.show-actions');
  if (!actionsBox) return;
  const watchlistBtn      = document.getElementById('watchlist-btn');
  const markasBtnLabel    = document.getElementById('markas-btn-label');
  const markasToggle      = document.getElementById('markas-toggle');
  const markasOptionsWrap = document.getElementById('markas-options');
  const starsTrack        = document.getElementById('markas-stars-track');
  const starsFg           = document.getElementById('markas-stars-fg');
  if (watchlistBtn)   watchlistBtn.textContent  = WATCHLIST_BTN_LABEL;
  if (markasBtnLabel) markasBtnLabel.textContent = MARKAS_BTN_LABEL;
  if (markasOptionsWrap) {
    markasOptionsWrap.innerHTML = MARKAS_OPTIONS.map((opt) =>
      `<button type="button" class="markas-option" data-action="${opt.id}">${opt.label}</button>`
    ).join('');
  }
  const watchedMarkasBtn = markasOptionsWrap
    ? markasOptionsWrap.querySelector('[data-action="watched"]')
    : null;
  const markasContextEl = document.getElementById('markas-context');
  const seasonSectionEl = document.getElementById('show-seasons');
  const seasonListEl    = document.getElementById('season-list');
  const SEASON_POSTER_BASE = 'https://image.tmdb.org/t/p/w185';
  let seasonsData  = [];
  const seasonLogs = {};
  const SEASON_STILL_BASE = 'https://image.tmdb.org/t/p/w300';
  const openSeasons   = {};
  const episodesCache = {};
  let activeSeason = null;
  let applyStarsRating = null;
  function findSeason(n) {
    for (let i = 0; i < seasonsData.length; i++) {
      if (seasonsData[i].number === n) return seasonsData[i];
    }
    return null;
  }
  function seasonDisplayName(season) {
    return season.name || ('Season ' + season.number);
  }
  function setMarkAsContext(seasonNumber) {
    activeSeason = seasonNumber;
    const season = seasonNumber == null ? null : findSeason(seasonNumber);
    if (markasContextEl) {
      markasContextEl.textContent = season ? seasonDisplayName(season) : '';
      markasContextEl.hidden = !season;
    }
    const log = season ? seasonLogs[season.number] : null;
    if (markasOptionsWrap) {
      markasOptionsWrap.querySelectorAll('.markas-option').forEach((b) => {
        b.classList.toggle('-selected', !!log && log.status === b.dataset.action);
      });
    }
  }
  let toastEl    = null;
  let toastTimer = null;
  function showAuthPrompt() {
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.className = 'watchlist-toast';
      toastEl.textContent = AUTH_PROMPT_MESSAGE;
      document.body.appendChild(toastEl);
    }
    toastEl.classList.remove('-visible');
    void toastEl.offsetWidth;
    toastEl.classList.add('-visible');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove('-visible');
    }, TOAST_VISIBLE_MS);
  }
  function closeMarkAs() {
    if (markasToggle) markasToggle.checked = false;
  }
  if (markasBtnLabel) {
    markasBtnLabel.addEventListener('click', () => {
      setMarkAsContext(null);
    });
  }
  if (markasToggle && starsFg) {
    markasToggle.addEventListener('change', () => {
      if (markasToggle.checked) {
        starsFg.style.width = '0%';
      }
    });
  }
  if (watchlistBtn) {
    watchlistBtn.addEventListener('click', () => {
      showAuthPrompt();
    });
  }
  if (markasOptionsWrap) {
    markasOptionsWrap.addEventListener('click', (e) => {
      const btn = e.target.closest('.markas-option');
      if (!btn) return;
      closeMarkAs();
      if (btn.dataset.action === 'watched') {
        openWatchedPopover(activeSeason);
      } else if (activeSeason != null) {
        commitSeasonLog(activeSeason, { status: btn.dataset.action });
      } else {
        showAuthPrompt();
      }
    });
  }
  if (starsTrack && starsFg) {
    let dragging = false;
    function percentFromEvent(e) {
      const rect = starsTrack.getBoundingClientRect();
      const x    = e.clientX - rect.left;
      const pct  = (x / rect.width) * 100;
      return Math.max(0, Math.min(100, pct));
    }
    function buildSnapPoints() {
      const rect         = starsTrack.getBoundingClientRect();
      const totalWidth   = rect.width;
      if (totalWidth === 0) return [];
      const computed      = window.getComputedStyle(starsTrack);
      const letterSpacing = parseFloat(computed.letterSpacing) || 0;
      const slotWidth     = totalWidth / STAR_COUNT;
      const glyphWidth    = slotWidth - letterSpacing;
      const pts = [];
      for (let i = 0; i < STAR_COUNT; i++) {
        const starStart = i * slotWidth;
        pts.push((starStart + glyphWidth * 0.5) / totalWidth * 100);
        pts.push((i + 1) * slotWidth / totalWidth * 100);
      }
      return pts;
    }
    function snapToHalfStar(pct) {
      const pts = buildSnapPoints();
      if (!pts.length) return Math.round(pct / 10) * 10;
      if (pct < pts[0] / 2) return 0;
      let nearest = pts[0];
      let minDist = Math.abs(pct - pts[0]);
      for (let i = 1; i < pts.length; i++) {
        const dist = Math.abs(pct - pts[i]);
        if (dist < minDist) { minDist = dist; nearest = pts[i]; }
      }
      return nearest;
    }
    function setFill(pct) {
      starsFg.style.width = snapToHalfStar(pct) + '%';
    }
    applyStarsRating = (rating) => {
      const pts = buildSnapPoints();
      const idx = Math.round(rating * 2) - 1;
      starsFg.style.width = (rating > 0 && pts[idx] !== undefined ? pts[idx] : 0) + '%';
    };
    function readStarsRating() {
      const pct = parseFloat(starsFg.style.width) || 0;
      if (pct <= 0) return 0;
      const pts = buildSnapPoints();
      if (!pts.length) return Math.round(pct / 10) / 2;
      let best = 0;
      let minDist = Infinity;
      for (let i = 0; i < pts.length; i++) {
        const dist = Math.abs(pct - pts[i]);
        if (dist < minDist) { minDist = dist; best = i; }
      }
      return (best + 1) / 2;
    }
    starsTrack.addEventListener('pointerdown', (e) => {
      dragging = true;
      starsTrack.setPointerCapture(e.pointerId);
      setFill(percentFromEvent(e));
    });
    starsTrack.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      setFill(percentFromEvent(e));
    });
    function finishDrag(e) {
      if (!dragging) return;
      dragging = false;
      const rating = readStarsRating();
      closeMarkAs();
      if (activeSeason != null) {
        commitSeasonLog(activeSeason, { rating: rating > 0 ? rating : null });
      } else {
        showAuthPrompt();
      }
    }
    starsTrack.addEventListener('pointerup',     finishDrag);
    starsTrack.addEventListener('pointercancel', finishDrag);
  }
  const watchdateToggle = document.getElementById('watchdate-toggle');
  const wdPopover       = document.getElementById('watchdate-popover');
  const wdShowNameEl    = document.getElementById('wd-show-name');
  const wdShowYearEl    = document.getElementById('wd-show-year');
  const wdCalendarEl    = document.getElementById('wd-calendar');
  const wdHintEl        = document.getElementById('wd-hint');
  const wdDurationEl    = document.getElementById('wd-duration');
  const wdFieldStart    = document.getElementById('wd-field-start');
  const wdFieldEnd      = document.getElementById('wd-field-end');
  const wdValues = {
    start: document.getElementById('wd-value-start'),
    end:   document.getElementById('wd-value-end'),
  };
  const wdQuickBtn  = document.getElementById('wd-quick-btn');
  const wdCancelBtn = document.getElementById('wd-cancel-btn');
  const wdSaveBtn   = document.getElementById('wd-save-btn');
  const wdJumpToggle   = document.getElementById('wd-jump-toggle');
  const wdJumpMonthsEl = document.getElementById('wd-jump-months');
  const wdJumpYearsEl  = document.getElementById('wd-jump-years');
  if (!watchdateToggle || !wdPopover || !wdCalendarEl) {
    return;
  }
  function todayMidnight() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const WD_TODAY = todayMidnight();
  let wdView        = new Date(WD_TODAY);
  let wdActiveField = 'start';
  let wdJumpYear    = WD_TODAY.getFullYear();
  const wdRange = { start: null, end: null };
  let wdSeason        = null;
  let wdFloorOverride = null;
  let wdLastWasSeason = false;
  function wdFloorDate() {
    if (wdFloorOverride) return wdFloorOverride;
    const meta = window.tvboxShowMeta;
    if (meta && meta.firstAirDate) {
      const parsed = new Date(meta.firstAirDate + 'T00:00:00');
      if (!isNaN(parsed.getTime())) return parsed;
    }
    return new Date(1900, 0, 1);
  }
  function wdMinDate() { return wdFloorDate(); }
  function wdMaxDate() { return WD_TODAY; }
  function sameDay(a, b) {
    return !!a && !!b &&
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
  }
  function formatDate(d) {
    return MONTH_LABELS_SHORT[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }
  function wdNavIcon(dir) {
    const path = dir === 'prev' ? 'M15 6l-6 6 6 6' : 'M9 6l6 6-6 6';
    return '<svg viewBox="0 0 24 24"><path d="' + path +
      '" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  function wdNavBtn(dir, disabled) {
    return '<button type="button" class="wd-cal-nav" data-nav="' + dir + '"' +
      (disabled ? ' disabled' : '') + '>' + wdNavIcon(dir) + '</button>';
  }
  function renderWdCalendar() {
    const min = wdMinDate();
    const max = wdMaxDate();
    const viewYM = new Date(wdView.getFullYear(), wdView.getMonth(), 1);
    const prevMonthLastDay = new Date(viewYM.getFullYear(), viewYM.getMonth(), 0);
    const nextMonthFirstDay = new Date(viewYM.getFullYear(), viewYM.getMonth() + 1, 1);
    const prevDisabled = prevMonthLastDay < min;
    const nextDisabled = nextMonthFirstDay > max;
    let html = '<div class="wd-cal-head">';
    html += wdNavBtn('prev', prevDisabled);
    html += '<button type="button" class="wd-cal-label" data-jump>' +
      MONTH_LABELS_LONG[viewYM.getMonth()] + ' ' + viewYM.getFullYear() + '</button>';
    html += wdNavBtn('next', nextDisabled);
    html += '</div>';
    html += '<div class="wd-weekdays">' +
      WEEKDAY_LABELS.map((w) => '<span>' + w + '</span>').join('') + '</div>';
    html += '<div class="wd-days">';
    const firstWeekday = viewYM.getDay();
    for (let i = 0; i < firstWeekday; i++) {
      html += '<span class="wd-day -empty"></span>';
    }
    const daysInMonth = new Date(viewYM.getFullYear(), viewYM.getMonth() + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(viewYM.getFullYear(), viewYM.getMonth(), day);
      const disabled = d < min || d > max;
      const isToday = sameDay(d, WD_TODAY);
      const isStart = sameDay(d, wdRange.start);
      const isEnd   = sameDay(d, wdRange.end);
      const sameStartEnd = wdRange.start && wdRange.end && sameDay(wdRange.start, wdRange.end);
      let inRange = false;
      if (wdRange.start && wdRange.end) {
        inRange = d > wdRange.start && d < wdRange.end;
      }
      const cls = ['wd-day'];
      if (disabled) cls.push('-disabled');
      if (isToday) cls.push('-today');
      if (isStart || isEnd) cls.push('-selected');
      if (isStart && wdRange.end && !sameStartEnd) cls.push('-range-start');
      if (isEnd && wdRange.start && !sameStartEnd) cls.push('-range-end');
      if (inRange) cls.push('-inrange');
      html += '<button type="button" class="' + cls.join(' ') + '"' +
        (disabled ? ' disabled' : '') + ' data-day="' + d.getTime() + '">' + day + '</button>';
    }
    html += '</div>';
    wdCalendarEl.innerHTML = html;
  }
  function wdCanNavigate(dir) {
    const min = wdMinDate();
    const max = wdMaxDate();
    const viewYM = new Date(wdView.getFullYear(), wdView.getMonth(), 1);
    if (dir < 0) {
      return new Date(viewYM.getFullYear(), viewYM.getMonth(), 0) >= min;
    }
    return new Date(viewYM.getFullYear(), viewYM.getMonth() + 1, 1) <= max;
  }
  function wdNavigate(dir, animate) {
    wdView = new Date(wdView.getFullYear(), wdView.getMonth() + dir, 1);
    renderWdCalendar();
    if (animate) {
      wdCalendarEl.classList.remove('-slide-next', '-slide-prev');
      void wdCalendarEl.offsetWidth;
      wdCalendarEl.classList.add(dir > 0 ? '-slide-next' : '-slide-prev');
    }
  }
  function updateWdStubs() {
    wdValues.start.textContent = wdRange.start ? formatDate(wdRange.start) : '—';
    wdValues.end.textContent   = wdRange.end   ? formatDate(wdRange.end)   : '—';
    if (wdFieldStart) wdFieldStart.classList.toggle('-active', wdActiveField === 'start');
    if (wdFieldEnd)   wdFieldEnd.classList.toggle('-active', wdActiveField === 'end');
    if (wdRange.start && wdRange.end) {
      const days = Math.round((wdRange.end - wdRange.start) / 86400000) + 1;
      wdDurationEl.textContent = days === 1 ? '1 day' : days + ' days';
      wdDurationEl.hidden = false;
    } else {
      wdDurationEl.hidden = true;
    }
    if (wdActiveField === 'start') {
      wdHintEl.textContent = wdRange.start ? 'Tap a day to change when you started' : 'Tap the day you started watching';
    } else {
      wdHintEl.textContent = wdRange.end ? 'Tap a day to change when you finished' : 'Now tap the day you finished';
    }
  }
  function wdSelectDate(date) {
    if (wdActiveField === 'start') {
      wdRange.start = date;
      if (wdRange.end && date > wdRange.end) wdRange.end = null;
      if (!wdRange.end) wdActiveField = 'end';
    } else {
      if (wdRange.start && date < wdRange.start) {
        wdRange.start = date;
        wdRange.end = null;
      } else {
        wdRange.end = date;
      }
    }
    wdView = new Date(date.getFullYear(), date.getMonth(), 1);
    updateWdStubs();
    renderWdCalendar();
  }
  wdCalendarEl.addEventListener('click', (e) => {
    const dayBtn  = e.target.closest('[data-day]');
    const navBtn  = e.target.closest('[data-nav]');
    const jumpBtn = e.target.closest('[data-jump]');
    if (dayBtn) {
      wdSelectDate(new Date(parseInt(dayBtn.getAttribute('data-day'), 10)));
    } else if (navBtn && !navBtn.disabled) {
      wdNavigate(navBtn.getAttribute('data-nav') === 'next' ? 1 : -1);
    } else if (jumpBtn) {
      openWdJump();
    }
  });
  const WD_SWIPE_MIN_PX = 50;
  let wdSwipeX = null;
  let wdSwipeY = null;
  wdCalendarEl.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) {
      wdSwipeX = null;
      wdSwipeY = null;
      return;
    }
    wdSwipeX = e.touches[0].clientX;
    wdSwipeY = e.touches[0].clientY;
  }, { passive: true });
  wdCalendarEl.addEventListener('touchend', (e) => {
    if (wdSwipeX === null) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - wdSwipeX;
    const dy = touch.clientY - wdSwipeY;
    wdSwipeX = null;
    wdSwipeY = null;
    if (Math.abs(dx) < WD_SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    const dir = dx > 0 ? -1 : 1;
    if (!wdCanNavigate(dir)) return;
    wdNavigate(dir, true);
  }, { passive: true });
  wdCalendarEl.addEventListener('touchcancel', () => {
    wdSwipeX = null;
    wdSwipeY = null;
  }, { passive: true });
  if (wdFieldStart) {
    wdFieldStart.addEventListener('click', () => {
      wdRange.start = null;
      wdActiveField = 'start';
      updateWdStubs();
      renderWdCalendar();
    });
  }
  if (wdFieldEnd) {
    wdFieldEnd.addEventListener('click', () => {
      wdRange.end = null;
      wdActiveField = 'end';
      updateWdStubs();
      renderWdCalendar();
    });
  }
  function renderWdJumpMonths() {
    const min = wdMinDate();
    const max = wdMaxDate();
    let html = '';
    for (let m = 0; m < 12; m++) {
      const monthStart = new Date(wdJumpYear, m, 1);
      const monthEnd   = new Date(wdJumpYear, m + 1, 0);
      const disabled   = monthEnd < min || monthStart > max;
      const active     = wdJumpYear === wdView.getFullYear() && m === wdView.getMonth();
      html += '<button type="button" class="wd-jump-row' +
        (disabled ? ' -disabled' : '') + (active ? ' -active' : '') + '"' +
        (disabled ? ' disabled' : '') + ' data-month="' + m + '">' + MONTH_LABELS_LONG[m] + '</button>';
    }
    wdJumpMonthsEl.innerHTML = html;
  }
  function renderWdJumpYears() {
    const min = wdMinDate().getFullYear();
    const max = wdMaxDate().getFullYear();
    let html = '';
    for (let y = max; y >= min; y--) {
      html += '<button type="button" class="wd-jump-row' +
        (y === wdJumpYear ? ' -active' : '') + '" data-year="' + y + '">' + y + '</button>';
    }
    wdJumpYearsEl.innerHTML = html;
  }
  function openWdJump() {
    wdJumpYear = wdView.getFullYear();
    renderWdJumpMonths();
    renderWdJumpYears();
    wdJumpToggle.checked = true;
    const activeMonthBtn = wdJumpMonthsEl.querySelector('.-active');
    if (activeMonthBtn) activeMonthBtn.scrollIntoView({ block: 'center' });
    const activeYearBtn = wdJumpYearsEl.querySelector('.-active');
    if (activeYearBtn) activeYearBtn.scrollIntoView({ block: 'center' });
  }
  function closeWdJump() {
    wdJumpToggle.checked = false;
  }
  if (wdJumpYearsEl) {
    wdJumpYearsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-year]');
      if (!btn) return;
      wdJumpYear = parseInt(btn.getAttribute('data-year'), 10);
      renderWdJumpMonths();
      renderWdJumpYears();
    });
  }
  if (wdJumpMonthsEl) {
    wdJumpMonthsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-month]');
      if (!btn || btn.disabled) return;
      const m = parseInt(btn.getAttribute('data-month'), 10);
      wdView = new Date(wdJumpYear, m, 1);
      closeWdJump();
      renderWdCalendar();
    });
  }
  function openWatchedPopover(seasonNumber) {
    const season = seasonNumber == null ? null : findSeason(seasonNumber);
    wdSeason = season ? season.number : null;
    const titleEl = document.getElementById('show-title');
    const showName =
      (titleEl && titleEl.textContent) ||
      (window.tvboxShowMeta && window.tvboxShowMeta.name) ||
      'this show';
    if (wdShowNameEl) {
      wdShowNameEl.textContent = season ? showName + ' \u00b7 ' + seasonDisplayName(season) : showName;
    }
    if (wdShowYearEl) {
      const meta = window.tvboxShowMeta;
      const dateStr = season ? season.airDate : (meta ? meta.firstAirDate : null);
      const yearMatch = dateStr ? /^\d{4}/.exec(dateStr) : null;
      wdShowYearEl.textContent = yearMatch ? ' - ' + yearMatch[0] : '';
    }
    if (season) {
      const log = seasonLogs[season.number];
      wdRange.start = log && log.start ? fromISODate(log.start) : null;
      wdRange.end   = log && log.end   ? fromISODate(log.end)   : null;
      wdActiveField = wdRange.start && !wdRange.end ? 'end' : 'start';
      wdFloorOverride = fromISODate(season.airDate ? String(season.airDate).slice(0, 10) : '');
      wdLastWasSeason = true;
    } else {
      wdFloorOverride = null;
      if (wdLastWasSeason) {
        wdRange.start = null;
        wdRange.end = null;
        wdActiveField = 'start';
        wdLastWasSeason = false;
      }
    }
    wdView = wdRange.start
      ? new Date(wdRange.start.getFullYear(), wdRange.start.getMonth(), 1)
      : new Date(WD_TODAY);
    updateWdStubs();
    renderWdCalendar();
    watchdateToggle.checked = true;
  }
  function closeWatchedPopover() {
    watchdateToggle.checked = false;
  }
  if (wdCancelBtn) {
    wdCancelBtn.addEventListener('click', () => {
      closeWatchedPopover();
    });
  }
  if (wdQuickBtn) {
    wdQuickBtn.addEventListener('click', () => {
      const season = wdSeason;
      wdRange.start = null;
      wdRange.end = null;
      updateWdStubs();
      closeWatchedPopover();
      if (season != null) {
        commitSeasonLog(season, { status: 'watched', start: null, end: null });
      } else {
        showAuthPrompt();
      }
    });
  }
  if (wdSaveBtn) {
    wdSaveBtn.addEventListener('click', () => {
      const season = wdSeason;
      const start = toISODate(wdRange.start);
      const end   = toISODate(wdRange.end);
      closeWatchedPopover();
      if (season != null) {
        commitSeasonLog(season, { status: 'watched', start: start, end: end });
      } else {
        showAuthPrompt();
      }
    });
  }
  renderWdCalendar();
  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }
  function toISODate(d) {
    return d ? d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) : null;
  }
  function fromISODate(str) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str || '');
    if (!m) return null;
    const d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
    return isNaN(d.getTime()) ? null : d;
  }
  function seasonAirDate(season) {
    return fromISODate(season.airDate ? String(season.airDate).slice(0, 10) : '');
  }
  function isSeasonAired(season) {
    const d = seasonAirDate(season);
    return !!d && d <= todayMidnight();
  }
  function escapeText(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML.replace(/"/g, '&quot;');
  }
  function normalizeDateValue(v) {
    if (v instanceof Date) return isNaN(v.getTime()) ? null : toISODate(v);
    return fromISODate(v) ? v : null;
  }
  function normalizeSeasonEntry(entry) {
    if (!entry) return null;
    const out = { status: null, rating: null, start: null, end: null };
    if (entry.status === 'watched' || entry.status === 'dnf') out.status = entry.status;
    const r = Number(entry.rating);
    if (isFinite(r) && r > 0) {
      const rounded = Math.min(5, Math.round(r * 2) / 2);
      out.rating = rounded > 0 ? rounded : null;
    }
    out.start = normalizeDateValue(entry.start);
    out.end   = normalizeDateValue(entry.end);
    return (out.status || out.rating || out.start || out.end) ? out : null;
  }
  function starsHtml(rating) {
    const pct = Math.max(0, Math.min(100, rating * 20));
    return '<span class="season-stars" aria-hidden="true">' +
      '<span class="season-stars-bg">\u2605\u2605\u2605\u2605\u2605</span>' +
      '<span class="season-stars-fg" style="width:' + pct + '%">\u2605\u2605\u2605\u2605\u2605</span>' +
      '</span>';
  }
  function seasonDatesText(log) {
    const start = log.start ? fromISODate(log.start) : null;
    const end   = log.end   ? fromISODate(log.end)   : null;
    if (start && end) {
      return sameDay(start, end)
        ? formatDate(start)
        : formatDate(start) + ' \u2013 ' + formatDate(end);
    }
    if (start) return 'Started ' + formatDate(start);
    if (end)   return 'Finished ' + formatDate(end);
    return '';
  }
  function seasonRowHtml(season) {
    const aired = isSeasonAired(season);
    const log   = seasonLogs[season.number] || null;
    const name  = seasonDisplayName(season);
    const year  = season.airDate && /^\d{4}/.test(season.airDate) ? season.airDate.slice(0, 4) : null;
    const hasImg = !!season.poster;
    let html = '<article class="season-row' + (season.episodes > 0 ? ' -expandable' : '') +
      '" data-season-row="' + season.number + '">';
    html += '<div class="season-poster' + (hasImg ? ' -has-img' : '') + '">';
    html += '<span class="season-poster-num numbers">' + season.number + '</span>';
    if (hasImg) {
      html += '<img src="' + SEASON_POSTER_BASE + escapeText(season.poster) +
        '" alt="" loading="lazy" decoding="async">';
    }
    html += '</div>';
    html += '<div class="season-info">';
    html += '<div class="season-head"><h3 class="season-name">' + escapeText(name) + '</h3>';
    if (log && log.status === 'watched') {
      html += '<span class="season-status -watched">Watched</span>';
    } else if (log && log.status === 'dnf') {
      html += '<span class="season-status -dnf">Did Not Finish</span>';
    }
    html += '</div>';
    const metaParts = [];
    if (year) metaParts.push('<span class="numbers">' + year + '</span>');
    if (season.episodes > 0) {
      metaParts.push('<span>' + season.episodes + ' episode' + (season.episodes === 1 ? '' : 's') + '</span>');
    }
    if (metaParts.length) {
      html += '<div class="season-meta">' +
        metaParts.join('<span class="season-meta-dot">\u00b7</span>') + '</div>';
    }
    if (log) {
      const bits = [];
      if (log.rating) {
        bits.push(starsHtml(log.rating) + '<span class="numbers">' + log.rating + '</span>');
      }
      const dates = seasonDatesText(log);
      if (dates) bits.push('<span>' + dates + '</span>');
      if (bits.length) {
        html += '<div class="season-log">' +
          bits.map((b) => '<span class="season-log-item">' + b + '</span>').join('') + '</div>';
      }
    }
    html += '</div>';
    if (aired) {
      html += '<button type="button" class="season-log-btn' + (log ? ' -logged' : '') +
        '" data-season="' + season.number + '" aria-label="' +
        (log ? 'Edit log for ' : 'Log ') + escapeText(name) + '">' +
        (log ? 'Edit' : 'Log') + '</button>';
    } else {
      html += '<span class="season-upcoming">Upcoming</span>';
    }
    if (season.episodes > 0) {
      const isOpen = !!openSeasons[season.number];
      html += '<button type="button" class="season-toggle" data-season-toggle="' + season.number +
        '" aria-expanded="' + (isOpen ? 'true' : 'false') +
        '" aria-controls="season-eps-' + season.number +
        '" aria-label="' + (isOpen ? 'Hide' : 'Show') + ' episodes of ' + escapeText(name) + '">' +
        '<svg class="season-toggle-icon" viewBox="0 0 24 24" aria-hidden="true">' +
        '<path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>' +
        '</svg></button>';
    }
    html += '</article>';
    return html;
  }
  function seasonItemHtml(season) {
    const isOpen = !!openSeasons[season.number];
    let html = '<div class="season-item' + (isOpen ? ' -open' : '') + '" data-season-item="' + season.number + '">';
    html += seasonRowHtml(season);
    if (season.episodes > 0) {
      html += '<div class="season-eps" id="season-eps-' + season.number + '"' + (isOpen ? '' : ' hidden') + '></div>';
    }
    html += '</div>';
    return html;
  }
  function formatRuntime(mins) {
    const m = Math.round(Number(mins));
    if (!isFinite(m) || m <= 0) return '';
    if (m < 60) return m + 'm';
    const r = m % 60;
    return Math.floor(m / 60) + 'h' + (r ? ' ' + r + 'm' : '');
  }
  function episodeItemHtml(ep, seasonNumber) {
    const num   = ep.episode_number != null ? ep.episode_number : '';
    const meta  = window.tvboxShowMeta;
    const href  = (num !== '' && meta && meta.id != null)
      ? '/ep/?tv=' + encodeURIComponent(meta.id) + '&season=' + encodeURIComponent(seasonNumber) +
        '&ep=' + encodeURIComponent(num)
      : '';
    const title = ep.name || (num !== '' ? 'Episode ' + num : 'Untitled');
    let html = href ? '<a class="ep-item" href="' + href + '">' : '<div class="ep-item">';
    html += '<div class="ep-thumb' + (ep.still_path ? ' -has-img' : '') + '">';
    if (ep.still_path) {
      html += '<img src="' + SEASON_STILL_BASE + escapeText(ep.still_path) +
        '" alt="" loading="lazy" decoding="async">';
    }
    html += '</div><div class="ep-body"><div class="ep-head">';
    if (num !== '') html += '<span class="ep-num numbers">' + escapeText(num) + '</span>';
    html += '<h4 class="ep-title">' + escapeText(title) + '</h4></div>';
    const bits = [];
    const d = ep.air_date ? fromISODate(String(ep.air_date).slice(0, 10)) : null;
    if (d) bits.push('<span class="numbers">' + formatDate(d) + '</span>');
    const rt = formatRuntime(ep.runtime);
    if (rt) bits.push('<span class="numbers">' + rt + '</span>');
    if (ep.vote_average > 0 && ep.vote_count > 0) {
      bits.push('<span class="ep-rating numbers">\u2605 ' + Number(ep.vote_average).toFixed(1) + '</span>');
    }
    if (bits.length) {
      html += '<div class="ep-meta">' + bits.join('<span class="ep-meta-dot">\u00b7</span>') + '</div>';
    }
    html += '</div>' + (href ? '</a>' : '</div>');
    return html;
  }
  function episodesHtml(list, seasonNumber) {
    if (!list.length) return '<div class="ep-status">No episode details available yet.</div>';
    return '<div class="ep-list">' + list.map((ep) => episodeItemHtml(ep, seasonNumber)).join('') + '</div>';
  }
  function loadEpisodes(n, panel) {
    if (!panel) return;
    if (episodesCache[n]) {
      panel.innerHTML = episodesHtml(episodesCache[n], n);
      return;
    }
    if (panel.getAttribute('data-loading') === '1') return;
    const meta = window.tvboxShowMeta;
    const get  = window.tvboxTmdbGet;
    const failHtml = '<div class="ep-status -error">Couldn\u2019t load episodes.' +
      '<button type="button" class="ep-retry" data-season-retry="' + n + '">Retry</button></div>';
    if (typeof get !== 'function' || !meta || meta.id == null) {
      panel.innerHTML = failHtml;
      return;
    }
    panel.setAttribute('data-loading', '1');
    panel.innerHTML = '<div class="ep-status">Loading episodes\u2026</div>';
    get('/tv/' + encodeURIComponent(meta.id) + '/season/' + encodeURIComponent(n))
      .then((data) => {
        episodesCache[n] = data && Array.isArray(data.episodes) ? data.episodes : [];
        panel.innerHTML = episodesHtml(episodesCache[n], n);
      })
      .catch(() => {
        panel.innerHTML = failHtml;
      })
      .then(() => {
        panel.removeAttribute('data-loading');
      });
  }
  function toggleSeasonEpisodes(n) {
    if (!seasonListEl) return;
    const item = seasonListEl.querySelector('[data-season-item="' + n + '"]');
    const panel = item ? item.querySelector('.season-eps') : null;
    if (!item || !panel) return;
    const open = !openSeasons[n];
    openSeasons[n] = open;
    item.classList.toggle('-open', open);
    panel.hidden = !open;
    const btn = item.querySelector('.season-toggle');
    const season = findSeason(n);
    if (btn) {
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (season) {
        btn.setAttribute('aria-label', (open ? 'Hide' : 'Show') + ' episodes of ' + seasonDisplayName(season));
      }
    }
    if (open) loadEpisodes(n, panel);
  }
  function renderSeasons() {
    if (!seasonSectionEl || !seasonListEl) return;
    const meta = window.tvboxShowMeta;
    const heroEl = document.getElementById('show-hero');
    const list = (meta && Array.isArray(meta.seasons) ? meta.seasons : [])
      .filter((s) => s && typeof s.number === 'number' && s.number > 0)
      .sort((a, b) => a.number - b.number);
    if (!list.length || (heroEl && heroEl.classList.contains('-no-actions'))) {
      seasonsData = [];
      seasonListEl.innerHTML = '';
      seasonSectionEl.hidden = true;
      return;
    }
    seasonsData = list;
    Object.keys(openSeasons).forEach((k) => { delete openSeasons[k]; });
    seasonListEl.innerHTML = list.map(seasonItemHtml).join('');
    seasonSectionEl.hidden = false;
  }
  function setSeasonLog(n, entry) {
    const clean = normalizeSeasonEntry(entry);
    if (clean) {
      seasonLogs[n] = clean;
    } else {
      delete seasonLogs[n];
    }
    const season = findSeason(n);
    const row = seasonListEl
      ? seasonListEl.querySelector('[data-season-row="' + n + '"]')
      : null;
    if (season && row) {
      row.outerHTML = seasonRowHtml(season);
    }
  }
  function commitSeasonLog(n, patch) {
    const entry = Object.assign({}, seasonLogs[n] || {}, patch);
    const api = window.tvboxSeasons;
    if (api && typeof api.onSave === 'function') {
      let ok;
      try {
        ok = api.onSave(n, normalizeSeasonEntry(entry));
      } catch (err) {
        ok = false;
      }
      if (ok !== false) {
        setSeasonLog(n, entry);
        return;
      }
    }
    showAuthPrompt();
  }
  function openSeasonMarkAs(n) {
    if (!markasToggle || !findSeason(n)) return;
    setMarkAsContext(n);
    markasToggle.checked = true;
    const log = seasonLogs[n];
    if (applyStarsRating) applyStarsRating(log && log.rating ? log.rating : 0);
  }
  if (seasonListEl) {
    seasonListEl.addEventListener('click', (e) => {
      const toggleBtn = e.target.closest('.season-toggle');
      if (toggleBtn) {
        toggleSeasonEpisodes(parseInt(toggleBtn.getAttribute('data-season-toggle'), 10));
        return;
      }
      const retryBtn = e.target.closest('.ep-retry');
      if (retryBtn) {
        loadEpisodes(
          parseInt(retryBtn.getAttribute('data-season-retry'), 10),
          retryBtn.closest('.season-eps')
        );
        return;
      }
      const btn = e.target.closest('.season-log-btn');
      if (btn) {
        openSeasonMarkAs(parseInt(btn.getAttribute('data-season'), 10));
        return;
      }
      const row = e.target.closest('.season-row.-expandable');
      if (row) {
        toggleSeasonEpisodes(parseInt(row.getAttribute('data-season-row'), 10));
      }
    });
    seasonListEl.addEventListener('error', (e) => {
      const img = e.target;
      if (!img || img.tagName !== 'IMG') return;
      img.style.display = 'none';
      const box = img.closest('.season-poster, .ep-thumb');
      if (box) box.classList.remove('-has-img');
    }, true);
  }
  const seasonsApi = window.tvboxSeasons = window.tvboxSeasons || {};
  seasonsApi.setLog  = (n, entry) => setSeasonLog(n, entry);
  seasonsApi.setLogs = (map) => {
    Object.keys(map || {}).forEach((k) => setSeasonLog(parseInt(k, 10), map[k]));
  };
  seasonsApi.getLog  = (n) => (seasonLogs[n] ? Object.assign({}, seasonLogs[n]) : null);
  document.addEventListener('tvbox:show-loaded', () => {
    try { sessionStorage.setItem('tvbox-show-path', window.location.pathname); } catch (e) {}
  });
  document.addEventListener('tvbox:show-loaded', renderSeasons);
  if (window.tvboxShowMeta) renderSeasons();
  window.addEventListener('scroll', () => {
    if (markasToggle && markasToggle.checked) markasToggle.checked = false;
    if (watchdateToggle && watchdateToggle.checked) watchdateToggle.checked = false;
    if (wdJumpToggle && wdJumpToggle.checked) wdJumpToggle.checked = false;
  }, { passive: true });
});
