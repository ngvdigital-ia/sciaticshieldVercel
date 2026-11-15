/* BackSwitch Member Area - static app, no login, progress saved on the device. */
(function () {
  'use strict';

  var CONTENT_URL = '/areademembros/assets/data/content.json?v=1';
  var KEY = 'bs_v1_state';
  var COOKIE = 'bs_v1_state';
  var C = null;            // content
  var S = null;            // state
  var storageOk = true;
  var app = document.getElementById('app');

  /* ---------- helpers ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function utc(str) { var p = str.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function todayStr() { return ymd(new Date()); }
  function dateOfDay(n) { // n = program day (1-based) -> yyyy-mm-dd
    var p = S.start.split('-');
    return ymd(new Date(+p[0], +p[1] - 1, +p[2] + n - 1));
  }
  function dayNum() {
    if (!S || !S.start) return 1;
    var t = new Date();
    var n = Math.floor((Date.UTC(t.getFullYear(), t.getMonth(), t.getDate()) - utc(S.start)) / 864e5) + 1;
    return Math.max(1, n);
  }
  function uid() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    return 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }
  function mmss(sec) { sec = Math.max(0, Math.ceil(sec)); return Math.floor(sec / 60) + ':' + pad(sec % 60); }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* ---------- metrics (no personal data; no third-party script) ---------- */
  function track(name, props) {
    try {
      var detail = { event: name, props: props || {} };
      document.dispatchEvent(new CustomEvent('bs:event', { detail: detail }));
      var ep = C && C.config && C.config.analyticsEndpoint;
      if (ep && navigator.sendBeacon) {
        navigator.sendBeacon(ep, JSON.stringify({ e: name, p: props || {}, d: S && S.id, day: S && S.start ? dayNum() : null }));
      }
    } catch (e) {}
  }

  /* ---------- storage: cookie + localStorage with the same data ---------- */
  function cookieGet(name) {
    try {
      var m = document.cookie.split('; ').filter(function (c) { return c.indexOf(name + '=') === 0; })[0];
      return m ? decodeURIComponent(m.slice(name.length + 1)) : null;
    } catch (e) { return null; }
  }
  function cookieSet(name, val) {
    try {
      var sec = location.protocol === 'https:' ? '; Secure' : '';
      document.cookie = name + '=' + encodeURIComponent(val) + '; max-age=34560000; path=/areademembros; SameSite=Lax' + sec;
    } catch (e) {}
  }
  function slim(s) { // compact copy for the cookie (no diary notes)
    var o = { v: 1, i: s.id, n: s.name, s: s.start, p: s.pain, l: s.level, k: s.safetyOk ? 1 : 0, a: s.disclaimer ? 1 : 0, f: s.startFixed ? 1 : 0, z: s.fs || 0, u: s.updated || 0 };
    o.d = (s.done || []).map(function (d) { return Math.floor((utc(d) - utc(s.start)) / 864e5) + 1; });
    o.g = Object.keys(s.logs || {}).map(function (d) {
      var L = s.logs[d];
      return [Math.floor((utc(d) - utc(s.start)) / 864e5) + 1, L.p, L.s];
    });
    o.q = (s.favs || []).join(',');
    o.r = (s.read || []).join(',');
    o.m = (s.fd || []).join(',');
    o.t = (s.dismissed || []).join(',');
    return btoa(unescape(encodeURIComponent(JSON.stringify(o))));
  }
  function unslim(str) {
    var o = JSON.parse(decodeURIComponent(escape(atob(str))));
    var s = blank();
    s.id = o.i; s.name = o.n; s.start = o.s; s.pain = o.p; s.level = o.l;
    s.safetyOk = !!o.k; s.disclaimer = !!o.a; s.startFixed = !!o.f; s.fs = o.z || 0; s.updated = o.u || 0;
    s.done = (o.d || []).map(function (n) { return shift(o.s, n - 1); });
    (o.g || []).forEach(function (g) { s.logs[shift(o.s, g[0] - 1)] = { p: g[1], s: g[2], n: '' }; });
    s.favs = o.q ? o.q.split(',').map(Number) : [];
    s.read = o.r ? o.r.split(',').map(Number) : [];
    s.fd = o.m ? o.m.split(',').map(Number) : [];
    s.dismissed = o.t ? o.t.split(',').map(Number) : [];
    return s;
  }
  function shift(startStr, n) {
    var p = startStr.split('-');
    return ymd(new Date(+p[0], +p[1] - 1, +p[2] + n));
  }
  function blank() {
    return { v: 1, id: uid(), name: '', start: todayStr(), startFixed: false, pain: '', level: 'gentle', safetyOk: false, disclaimer: false,
      done: [], logs: {}, favs: [], fd: [], read: [], dismissed: [], fs: 0, updated: 0 };
  }
  function probeStorage() {
    var ok = true;
    try { localStorage.setItem('bs_probe', '1'); localStorage.removeItem('bs_probe'); } catch (e) { ok = false; }
    var cookieOk = false;
    try { cookieSet('bs_probe', '1'); cookieOk = cookieGet('bs_probe') === '1'; document.cookie = 'bs_probe=; max-age=0; path=/areademembros'; } catch (e) {}
    return ok || cookieOk;
  }
  function load() {
    var a = null, b = null;
    try { var raw = localStorage.getItem(KEY); if (raw) a = JSON.parse(raw); } catch (e) {}
    try { var c = cookieGet(COOKIE); if (c) b = unslim(c); } catch (e) {}
    var pick = a || b;
    if (a && b && (b.updated || 0) > (a.updated || 0)) {
      // cookie is newer: keep local notes, take the rest from the cookie
      var notes = {};
      Object.keys(a.logs || {}).forEach(function (d) { if (a.logs[d] && a.logs[d].n) notes[d] = a.logs[d].n; });
      pick = b;
      Object.keys(notes).forEach(function (d) { if (pick.logs[d]) pick.logs[d].n = notes[d]; });
    }
    var s = pick ? Object.assign(blank(), pick) : blank();
    return s;
  }
  function save() {
    S.updated = Date.now();
    try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {}
    try { var v = slim(S); if (v.length < 3800) cookieSet(COOKIE, v); } catch (e) {}
  }

  /* ---------- program helpers ---------- */
  function fsApply() {
    var sizes = [18, 21, 24];
    document.documentElement.style.setProperty('--fs', sizes[S.fs || 0] + 'px');
  }
  function isDone(d) { return S.done.indexOf(d) > -1; }
  function streak() {
    var d = todayStr(), n = 0;
    if (!isDone(d)) d = shift(d, -1);
    while (isDone(d) && utc(d) >= utc(S.start)) { n++; d = shift(d, -1); }
    return n;
  }
  function unlocked() { var n = dayNum(); return C.messages.filter(function (m) { return m.day <= n; }); }
  function unreadCount() { return unlocked().filter(function (m) { return S.read.indexOf(m.day) < 0; }).length; }
  function updateBadge() {
    var b = $('#badge');
    var n = S.name ? unreadCount() : 0;
    b.hidden = !n; b.textContent = n;
    $('#bell').setAttribute('aria-label', n ? 'Messages, ' + n + ' unread' : 'Messages');
  }
  function levelLabel(l) { return l === 'standard' ? 'Standard' : 'Gentle'; }
  function supportHref() { return 'mailto:' + C.config.supportEmail + '?subject=' + encodeURIComponent('BackSwitch support'); }

  /* ---------- illustrations (simple line drawings) ---------- */
  function figure(id) {
    var body = '#9ec9e6', dark = '#0879bd', acc = '#dc6a00';
    var floor = '<line x1="10" y1="132" x2="290" y2="132" stroke="#c9dceb" stroke-width="3" stroke-linecap="round"/>';
    var head = '<circle cx="38" cy="118" r="11" fill="' + body + '"/>';
    var torso = '<path d="M54 122 L140 122" stroke="' + body + '" stroke-width="14" stroke-linecap="round"/>';
    var legBack = '<path d="M140 122 L182 76 L214 126" fill="none" stroke="#c6e0f1" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>';
    var leg = '<path d="M140 122 L176 72 L208 126" fill="none" stroke="' + body + '" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>';
    var extra = '';
    var arrow = function (d) { return '<path d="' + d + '" fill="none" stroke="' + acc + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'; };
    if (id === 1) {
      extra = arrow('M92 100 Q100 84 108 100') + arrow('M92 78 L100 70 L108 78') + arrow('M96 60 Q100 52 104 60');
    } else if (id === 2) {
      extra = arrow('M122 148 Q140 156 158 146') + arrow('M152 142 L158 146 L152 151');
    } else if (id === 3) {
      extra = arrow('M96 82 L96 104') + arrow('M90 98 L96 104 L102 98') + arrow('M116 82 L116 104') + arrow('M110 98 L116 104 L122 98');
    } else if (id === 4) {
      leg = '<path d="M140 122 L176 72 L208 126" fill="none" stroke="#c6e0f1" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>';
      legBack = '<path d="M140 122 L258 126" fill="none" stroke="' + body + '" stroke-width="9" stroke-linecap="round" stroke-dasharray="1 0"/>';
      extra = arrow('M222 108 L252 108') + arrow('M246 102 L252 108 L246 114');
    } else if (id === 5) {
      torso = '<path d="M54 122 L140 104" stroke="' + body + '" stroke-width="14" stroke-linecap="round"/>';
      legBack = '<path d="M140 104 L182 72 L214 126" fill="none" stroke="#c6e0f1" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>';
      leg = '<path d="M140 104 L176 68 L208 126" fill="none" stroke="' + body + '" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>';
      extra = arrow('M118 84 L118 62') + arrow('M112 68 L118 62 L124 68');
    } else if (id === 6) {
      legBack = '<path d="M140 122 L182 76 L214 126" fill="none" stroke="#c6e0f1" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>';
      leg = '<path d="M140 122 L190 54 L226 84" fill="none" stroke="' + body + '" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>';
      extra = arrow('M250 100 L250 70') + arrow('M244 76 L250 70 L256 76');
    }
    return '<svg class="fig" viewBox="0 0 300 160" aria-hidden="true" focusable="false">' + floor + legBack + torso + head + leg + extra + '</svg>';
  }

  /* ---------- session engine ---------- */
  var sess = null;
  var timerId = null;
  var wakeLock = null;

  function buildSteps() {
    var steps = [{ name: 'Get settled', seconds: 10, inst: 'Lie on your back with your knees bent and your feet flat. Rest your arms by your sides and let your breathing settle.', setup: true }];
    C.triggers.forEach(function (t) { steps.push({ name: t.name, seconds: t.seconds, inst: t.inst, instG: t.instGentle, id: t.id }); });
    return steps;
  }
  function startSession(opts) {
    opts = opts || {};
    var gentle = opts.forceGentle || S.level === 'gentle';
    sess = {
      steps: buildSteps(), idx: 0, running: true, finished: false, fd: !!opts.fd,
      gentle: steps0(gentle), remaining: 0, endAt: 0, startedAt: Date.now(), noWake: false
    };
    sess.remaining = sess.steps[0].seconds;
    sess.endAt = Date.now() + sess.remaining * 1000;
    track('session_started', { level: gentle ? 'gentle' : 'standard', first_day: !!opts.fd });
    requestWake();
    location.hash = '#/session';
  }
  function steps0(gentle) { var a = []; for (var i = 0; i < 7; i++) a.push(gentle); return a; }
  function requestWake() {
    if ('wakeLock' in navigator && navigator.wakeLock.request) {
      navigator.wakeLock.request('screen').then(function (l) { wakeLock = l; }).catch(function () { if (sess) sess.noWake = true; });
    } else if (sess) { sess.noWake = true; }
  }
  function releaseWake() { try { if (wakeLock) wakeLock.release(); } catch (e) {} wakeLock = null; }
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && sess && !sess.finished) requestWake();
  });
  function stopTimer() { if (timerId) { clearInterval(timerId); timerId = null; } }
  function startTimer() {
    stopTimer();
    timerId = setInterval(tick, 200);
  }
  function tick() {
    if (!sess || sess.finished || !sess.running) return;
    var rem = (sess.endAt - Date.now()) / 1000;
    if (rem <= 0) { nextStep(); return; }
    var t = $('#timer'); if (t) t.textContent = mmss(rem);
  }
  function nextStep() {
    if (!sess) return;
    if (sess.idx >= sess.steps.length - 1) { finishSession(); return; }
    sess.idx++;
    sess.remaining = sess.steps[sess.idx].seconds;
    sess.endAt = Date.now() + sess.remaining * 1000;
    sess.running = true;
    renderSession();
  }
  function finishSession() {
    stopTimer(); releaseWake();
    sess.finished = true;
    var d = todayStr();
    if (!isDone(d)) {
      S.done.push(d);
      track('day_done', { day: dayNum() });
    }
    if (sess.fd && S.fd.indexOf(2) < 0) S.fd.push(2);
    save();
    track('session_completed', { seconds: Math.round((Date.now() - sess.startedAt) / 1000) });
    renderSession();
  }
  function stopSession() {
    if (!sess) return;
    track('session_stopped', { step: sess.idx + 1 });
    stopTimer(); releaseWake();
    sess = null;
    location.hash = '#/safety?stopped=1';
  }
  function togglePause() {
    if (!sess || sess.finished) return;
    if (sess.running) { sess.remaining = Math.max(0, (sess.endAt - Date.now()) / 1000); sess.running = false; }
    else { sess.endAt = Date.now() + sess.remaining * 1000; sess.running = true; }
    renderSession();
  }

  /* ---------- views ---------- */
  var view = {};

  function pageHead(title, back) {
    return '<a class="back" href="' + (back || 'javascript:history.back()') + '">&#8592; Back</a><h1>' + esc(title) + '</h1>';
  }
  function warnBlock() {
    return '<p><b>Check before you start.</b> Do any of these apply to you right now?</p>' +
      '<ul class="warn">' + C.warningSigns.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' +
      '<p><b>Emergency signs:</b></p><ul class="warn">' + C.emergencySigns.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' +
      '<p><b>Talk to your doctor or physical therapist first if:</b></p><ul class="clean">' + C.talkToDoctorFirst.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>';
  }

  view.welcome = function () {
    var pains = [['lower', 'Lower back'], ['upper', 'Upper back'], ['both', 'Both'], ['leg', 'Pain going down a leg']];
    var h = '<div class="hero fade"><h1>Welcome' + (S.name ? ', ' + esc(S.name) : '') + '.</h1>' +
      '<p style="margin:0">Your session takes 7 minutes. Let\'s begin with your first day.</p></div>' +
      '<form class="card stack" id="welcome" novalidate>' +
      '<label class="field">First name<input class="input" id="w-name" type="text" autocomplete="given-name" maxlength="30" value="' + esc(S.name) + '" required></label>' +
      '<label class="field">Start date<input class="input" id="w-start" type="date" max="' + todayStr() + '" value="' + esc(S.start) + '"></label>' +
      '<div><b>Where do you feel it most?</b><div class="choices">' +
      pains.map(function (p) { return '<label class="choice"><input type="radio" name="pain" value="' + p[0] + '"' + ((S.pain || 'lower') === p[0] ? ' checked' : '') + '>' + p[1] + '</label>'; }).join('') + '</div></div>' +
      '<div><b>Choose your level</b><div class="choices">' +
      '<label class="choice"><input type="radio" name="level" value="gentle"' + (S.level !== 'standard' ? ' checked' : '') + '><span><b>Gentle</b><br><span class="small muted">Smaller movements, shorter holds. A good start if you have leg pain, a diagnosed spine condition, or strong pain.</span></span></label>' +
      '<label class="choice"><input type="radio" name="level" value="standard"' + (S.level === 'standard' ? ' checked' : '') + '><span><b>Standard</b><br><span class="small muted">The full movements. Both levels take 7 minutes.</span></span></label>' +
      '</div></div>' +
      '<div class="card" style="background:#fffdf0;border-color:#efdc6b;margin:0">' + warnBlock() +
      '<label class="check"><input type="checkbox" id="w-none"' + (S.safetyOk ? ' checked' : '') + '>None of these apply to me</label>' +
      '<label class="check"><input type="checkbox" id="w-disc"' + (S.disclaimer ? ' checked' : '') + '>I understand this is not medical advice and I will follow my doctor\'s plan</label></div>' +
      '<div id="w-err"></div>' +
      '<button class="btn" type="submit">Start my first day</button>' +
      '<p class="small muted center" style="margin:0">' + esc(C.dataNotice) + '</p></form>';
    app.innerHTML = h;
    var form = $('#welcome');
    $$('input[name=pain]', form).forEach(function (r) {
      r.addEventListener('change', function () {
        if (r.value === 'leg' && r.checked) { $('input[name=level][value=gentle]', form).checked = true; }
      });
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = $('#w-name').value.trim();
      var err = $('#w-err');
      if (!name) { err.innerHTML = '<div class="err" role="alert">Please enter your first name.</div>'; $('#w-name').focus(); return; }
      if (!$('#w-disc').checked) { err.innerHTML = '<div class="err" role="alert">Please confirm that you understand this is not medical advice.</div>'; return; }
      var start = $('#w-start').value || todayStr();
      if (start > todayStr()) start = todayStr();
      var pain = ($('input[name=pain]:checked', form) || {}).value || 'lower';
      var level = ($('input[name=level]:checked', form) || {}).value || 'gentle';
      if (pain === 'leg') level = 'gentle';
      var first = !S.name;
      S.name = name; S.start = start; S.pain = pain; S.level = level;
      S.disclaimer = true; S.safetyOk = $('#w-none').checked;
      save();
      if (first) track('welcome_completed', { level: level, pain: pain });
      if (!S.safetyOk) { track('safety_blocked'); location.hash = '#/safety?blocked=1'; return; }
      location.hash = first ? '#/guides/first-day' : '#/today';
    });
  };

  view.check = function () {
    app.innerHTML = pageHead('Safety check', '#/help/settings') +
      '<div class="card stack fade">' + warnBlock() +
      '<label class="check"><input type="checkbox" id="c-none"' + (S.safetyOk ? ' checked' : '') + '>None of these apply to me</label>' +
      '<button class="btn" id="c-save" type="button">Save</button></div>';
    $('#c-save').onclick = function () {
      S.safetyOk = $('#c-none').checked; save();
      if (!S.safetyOk) { track('safety_blocked'); location.hash = '#/safety?blocked=1'; } else location.hash = '#/today';
    };
  };

  view.today = function () {
    var n = dayNum(), prog = C.config.programDays;
    var d = todayStr();
    var done = isDone(d), logged = !!S.logs[d];
    var h = '<div class="fade"><p class="muted" style="margin:0 0 2px">Hello, ' + esc(S.name) + '</p>';
    if (!S.safetyOk) {
      h += '<div class="card"><h2>Check before you start</h2><p>Your sessions are on hold until you confirm that none of the warning signs apply to you.</p>' +
        '<a class="btn" href="#/check">Review the safety check</a></div>';
    } else {
      h += '<div class="card blue today-card"><div class="day">' + (n <= prog ? 'Day ' + n + ' of ' + prog : 'Day ' + n) + '</div>' +
        '<h2>' + (done ? 'Today\'s session is done' : 'Your 7 minutes today') + '</h2>' +
        '<span class="pill">' + levelLabel(S.level) + ' level</span>' +
        '<a class="btn" href="#" data-act="start">' + (done ? 'Do it again' : 'Start my 7 minutes') + '</a></div>';
    }
    var yesterdayMissed = n > 1 && !done && !isDone(shift(d, -1)) && S.done.length > 0;
    if (yesterdayMissed) h += '<div class="notice">Missed a day? Just continue today. Never double up.</div>';
    // level-up suggestion on days 15 and 30
    var lvl = C.config.levelUpDays.filter(function (x) { return n >= x && S.dismissed.indexOf(x) < 0; });
    if (S.safetyOk && S.level === 'gentle' && lvl.length) {
      var th = lvl[lvl.length - 1];
      h += '<div class="card"><h3>Ready for the next level?</h3><p>You are on day ' + n + '. Only if you feel comfortable, you can try the Standard level. If you have a diagnosed condition, check with your doctor or physical therapist first.</p>' +
        '<div class="btn-grid"><button class="btn sec" data-act="levelup" data-th="' + th + '">Switch to Standard</button><button class="btn ghost" data-act="levelno" data-th="' + th + '">Not now</button></div></div>';
    }
    var unread = unreadCount();
    if (unread) h += '<a class="notice" style="display:block;color:inherit;text-decoration:none" href="#/messages"><b>New message</b> &middot; You have ' + unread + ' unread message' + (unread > 1 ? 's' : '') + '.</a>';
    var tip = C.tips[(n - 1) % C.tips.length];
    h += '<div class="card"><div class="tipbox"><div class="ico" aria-hidden="true">i</div><div><h3 style="margin:0">Tip of the day: ' + esc(tip.t) + '</h3><p style="margin:2px 0 0">' + esc(tip.x) + '</p></div></div></div>';
    h += '<div class="links"><a href="#/guides/troubleshooting/flare-up">Flare-up day?</a><a href="#/progress">My progress</a></div>';
    if (done && !logged) h += '<a class="btn sec" style="margin-top:12px" href="#/log">Log how you feel today</a>';
    else if (!done && !logged && S.safetyOk) h += '<a class="btn ghost" style="margin-top:12px" href="#/log">Log how I feel</a>';
    h += '</div>';
    app.innerHTML = h;
  };

  function renderSession() {
    document.body.classList.add('in-session');
    if (!sess) { location.hash = '#/today'; return; }
    if (sess.finished) {
      app.innerHTML = '<div class="sess fade"><div class="card center" style="margin-top:12px"><div class="done-big" aria-hidden="true">&#10003;</div>' +
        '<h1>Done</h1><p>Well done, ' + esc(S.name) + '. Your 7 minutes are complete and today is saved.</p>' +
        '<p class="muted small">Light effort is normal. Pain is not. If anything felt wrong, open the Safety page.</p></div>' +
        '<div class="ctl"><a class="btn" href="#/log">Log how I feel</a><a class="btn sec" href="#/today">Back to Today</a></div></div>';
      return;
    }
    var st = sess.steps[sess.idx];
    var g = sess.gentle[sess.idx] && !st.setup;
    var inst = g && st.instG ? st.instG : st.inst;
    var rem = sess.running ? Math.max(0, (sess.endAt - Date.now()) / 1000) : sess.remaining;
    var prog = '';
    for (var i = 0; i < sess.steps.length; i++) prog += '<i class="' + (i < sess.idx ? 'on' : (i === sess.idx ? 'cur' : '')) + '"></i>';
    var last = sess.idx === sess.steps.length - 1;
    app.innerHTML = '<div class="sess"><div class="prog" aria-hidden="true">' + prog + '</div>' +
      '<div class="stepno">Step ' + (sess.idx + 1) + ' of ' + sess.steps.length + (g ? ' &middot; <span class="gentle-tag">Gentle version</span>' : '') + '</div>' +
      '<h1 class="stepname">' + esc(st.name) + '</h1>' +
      (st.id ? figure(st.id) : '') +
      '<div class="timer" id="timer" role="timer" aria-label="Time left in this step">' + mmss(rem) + '</div>' +
      '<p class="inst">' + esc(inst) + '</p>' +
      (sess.noWake ? '<p class="small muted" style="margin:0">Your screen may turn off. The timer stays accurate.</p>' : '') +
      '<div class="ctl"><div class="ctl-row"><button class="btn sec" data-act="pause">' + (sess.running ? 'Pause' : 'Resume') + '</button>' +
      '<button class="btn" data-act="next">' + (last ? 'Finish' : 'Next') + '</button></div>' +
      '<div class="ctl-row small">' + (st.setup ? '<span></span>' : '<button class="btn ghost" data-act="gentlestep">' + (g ? 'Standard version' : 'Gentle version') + '</button>') +
      '<button class="btn danger" data-act="stop">Stop</button></div></div></div>';
    window.scrollTo(0, 0);
    startTimer();
  }
  view.session = function () { renderSession(); };

  view.log = function () {
    var d = todayStr();
    var cur = S.logs[d] || null;
    var last = null;
    Object.keys(S.logs).sort().forEach(function (k) { last = S.logs[k]; });
    var p = cur ? cur.p : (last ? last.p : 5), s = cur ? cur.s : (last ? last.s : 5);
    app.innerHTML = pageHead('Daily log', '#/today') +
      '<div class="card stack fade">' +
      '<div><label for="l-p"><b>Pain right now</b></label><div class="range-val" id="l-pv">' + p + '</div><input class="range" id="l-p" type="range" min="0" max="10" step="1" value="' + p + '" aria-describedby="l-hint"></div>' +
      '<div><label for="l-s"><b>Stiffness right now</b></label><div class="range-val" id="l-sv">' + s + '</div><input class="range" id="l-s" type="range" min="0" max="10" step="1" value="' + s + '"></div>' +
      '<p class="small muted" id="l-hint" style="margin:0">0 means none. 10 means the most you can imagine.</p>' +
      '<label class="field">Note (optional)<textarea class="input" id="l-n" maxlength="400">' + esc(cur ? cur.n : '') + '</textarea></label>' +
      '<p class="small muted" style="margin:0">This is a personal diary, not a medical test.</p>' +
      '<button class="btn" id="l-save" type="button">Save today\'s log</button><div id="l-msg"></div></div>';
    $('#l-p').oninput = function () { $('#l-pv').textContent = this.value; };
    $('#l-s').oninput = function () { $('#l-sv').textContent = this.value; };
    $('#l-save').onclick = function () {
      S.logs[d] = { p: +$('#l-p').value, s: +$('#l-s').value, n: $('#l-n').value.slice(0, 400) };
      if (S.fd.indexOf(3) < 0) S.fd.push(3);
      save(); track('log_saved', { day: dayNum() });
      $('#l-msg').innerHTML = '<div class="notice" role="status" style="margin-top:12px">Saved. <a href="#/progress">See my progress</a></div>';
    };
  };

  function chartSvg() {
    var W = 320, H = 170, L = 30, R = 10, T = 10, B = 28, prog = C.config.programDays;
    var days = Object.keys(S.logs).sort();
    if (!days.length) return '<p class="muted">Your chart will appear after your first log.</p>';
    function x(n) { return L + (Math.min(n, prog) - 1) / (prog - 1) * (W - L - R); }
    function y(v) { return T + (10 - v) / 10 * (H - T - B); }
    var pts = days.map(function (d) { return { n: Math.floor((utc(d) - utc(S.start)) / 864e5) + 1, p: S.logs[d].p, s: S.logs[d].s }; })
      .filter(function (o) { return o.n >= 1 && o.n <= prog; });
    function line(k, col) {
      var path = pts.map(function (o, i) { return (i ? 'L' : 'M') + x(o.n).toFixed(1) + ' ' + y(o[k]).toFixed(1); }).join(' ');
      var dots = pts.map(function (o) { return '<circle cx="' + x(o.n).toFixed(1) + '" cy="' + y(o[k]).toFixed(1) + '" r="3.2" fill="' + col + '"/>'; }).join('');
      return '<path d="' + path + '" fill="none" stroke="' + col + '" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>' + dots;
    }
    var grid = [0, 5, 10].map(function (v) {
      return '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#d4e4f2"/><text x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end" font-size="11" fill="#55616d">' + v + '</text>';
    }).join('');
    var xs = [1, 15, 30, 45, 60].map(function (n) { return '<text x="' + x(n) + '" y="' + (H - 8) + '" text-anchor="middle" font-size="11" fill="#55616d">' + n + '</text>'; }).join('');
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Line chart of your pain and stiffness scores over 60 days">' + grid + xs + line('p', '#0879bd') + line('s', '#dc6a00') + '</svg>' +
      '<div class="legend"><span><i style="background:#0879bd"></i>Pain</span><span><i style="background:#dc6a00"></i>Stiffness</span></div>';
  }
  view.progress = function () {
    var prog = C.config.programDays, n = dayNum(), cal = '';
    for (var i = 1; i <= prog; i++) {
      var date = dateOfDay(i), cls = '';
      if (isDone(date)) cls += ' done';
      if (i === n) cls += ' today';
      if (i > n) cls += ' future';
      cal += '<span class="' + cls.trim() + '" aria-label="Day ' + i + (isDone(date) ? ', done' : '') + '">' + i + '</span>';
    }
    app.innerHTML = pageHead('My progress', '#/today') +
      '<div class="stats fade" style="margin-bottom:14px"><div><b>' + S.done.length + '</b>Days done</div><div><b>' + streak() + '</b>Current streak</div><div><b>' + Object.keys(S.logs).length + '</b>Logs saved</div></div>' +
      '<div class="card"><h2>Your ' + prog + ' days</h2><div class="cal">' + cal + '</div></div>' +
      '<div class="card"><h2>Pain and stiffness</h2>' + chartSvg() + '<p class="small muted" style="margin:8px 0 0">This is a personal diary, not a medical test.</p></div>' +
      '<a class="btn sec" href="#/log">Log how I feel today</a>';
  };

  view.routine = function () {
    app.innerHTML = '<h1>Your routine</h1><p class="muted">Seven minutes, in this order. Move slowly and keep every movement small. You are on the <b>' + levelLabel(S.level) + '</b> level.</p>' +
      '<div class="list fade">' + C.triggers.map(function (t) {
        return '<a class="item" href="#/routine/' + t.id + '"><span class="n">' + t.id + '</span><span><span class="t">' + esc(t.name) + '</span><span class="s">' + t.seconds + ' sec &middot; ' + esc(t.short) + '</span></span><span class="go" aria-hidden="true">&#8250;</span></a>';
      }).join('') + '</div>' +
      '<a class="btn" style="margin-top:6px" href="#" data-act="start">Start my 7 minutes</a>';
  };
  view.trigger = function (id) {
    var t = C.triggers.filter(function (x) { return x.id === +id; })[0];
    if (!t) { location.hash = '#/routine'; return; }
    app.innerHTML = pageHead(t.id + '. ' + t.name, '#/routine') +
      '<div class="card fade">' + figure(t.id) +
      '<div class="kv"><b>Time</b><span>' + t.seconds + ' seconds</span></div>' +
      '<div class="kv"><b>Position</b><span>' + esc(t.position) + '</span></div>' +
      '<div class="kv"><b>How to do it</b></div><ol class="steps">' + t.steps.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>' +
      '<div class="kv"><b>What you should feel</b><span>' + esc(t.feel) + '</span></div>' +
      '<div class="kv"><b>Common mistakes</b></div><ul class="clean">' + t.mistakes.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' +
      '<div class="kv"><b>Gentle version</b><span>' + esc(t.gentle) + '</span></div>' +
      '<div class="stopif">Stop if ' + esc(t.stopIf) + ' <a href="#/safety">See Safety</a></div></div>' +
      '<div class="btn-grid">' + (t.id > 1 ? '<a class="btn sec" href="#/routine/' + (t.id - 1) + '">&#8592; Previous</a>' : '<span></span>') +
      (t.id < C.triggers.length ? '<a class="btn sec" href="#/routine/' + (t.id + 1) + '">Next &#8594;</a>' : '<a class="btn" href="#" data-act="start">Start session</a>') + '</div>';
  };

  view.guides = function () {
    app.innerHTML = '<h1>Guides</h1><p class="muted">Your three bonus guides. Everything is already unlocked.</p>' +
      '<div class="list fade">' +
      '<a class="item" href="#/guides/first-day"><span class="n">1</span><span><span class="t">First Day Protocol</span><span class="s">Your first 24 hours in 5 steps</span></span><span class="go" aria-hidden="true">&#8250;</span></a>' +
      '<a class="item" href="#/guides/troubleshooting"><span class="n">2</span><span><span class="t">Troubleshooting Guide</span><span class="s">6 situations and a flare-up day page</span></span><span class="go" aria-hidden="true">&#8250;</span></a>' +
      '<a class="item" href="#/guides/tips"><span class="n">3</span><span><span class="t">101 Everyday Tips</span><span class="s">Short tips for daily life</span></span><span class="go" aria-hidden="true">&#8250;</span></a></div>';
  };

  view.firstDay = function () {
    track('guide_opened', { guide: 'first-day' });
    var h = pageHead('First Day Protocol', '#/guides') + '<p class="muted">Your first 24 hours in 5 steps. Tick each one when it is done.</p><div class="fade">';
    C.firstDay.forEach(function (st, i) {
      var on = S.fd.indexOf(i) > -1;
      var btn = '';
      if (i === 0) btn = '<a class="btn sec sm" href="#/safety">Open Safety</a>';
      if (i === 2) btn = '<button class="btn sm" data-act="startfd">Start my first 7 minutes</button>';
      if (i === 3) btn = '<a class="btn sec sm" href="#/log">Open my daily log</a>';
      if (i === 4) btn = '<a class="btn sec sm" href="#/help/settings">Add a daily reminder</a>';
      h += '<div class="card"><label class="check" style="padding-top:0"><input type="checkbox" data-act="fdtick" data-i="' + i + '"' + (on ? ' checked' : '') + '><span>' + (i + 1) + '. ' + esc(st.title) + '<br><span class="small muted" style="font-weight:400">' + esc(st.time) + '</span></span></label>' +
        '<p style="margin:0 0 ' + (btn ? '10px' : '0') + '">' + esc(st.text) + '</p>' + btn + '</div>';
    });
    app.innerHTML = h + '</div>';
  };

  view.trouble = function () {
    track('guide_opened', { guide: 'troubleshooting' });
    var T = C.troubleshooting;
    app.innerHTML = pageHead('Troubleshooting Guide', '#/guides') +
      '<div class="notice">' + esc(T.doctorLine) + '</div><div class="list fade">' +
      T.situations.map(function (s, i) {
        return '<a class="item" href="#/guides/troubleshooting/' + s.id + '"><span class="n">' + (i + 1) + '</span><span><span class="t">' + esc(s.title) + '</span>' + (s.gentleOnly ? '<span class="s">Gentle level only</span>' : '') + '</span><span class="go" aria-hidden="true">&#8250;</span></a>';
      }).join('') +
      '<a class="item" href="#/guides/troubleshooting/flare-up"><span class="n">!</span><span><span class="t">' + esc(T.flareUp.title) + '</span><span class="s">When your pain is well above normal</span></span><span class="go" aria-hidden="true">&#8250;</span></a></div>';
  };
  view.situation = function (id) {
    var T = C.troubleshooting;
    if (id === 'flare-up') {
      track('flareup_opened');
      var f = T.flareUp;
      app.innerHTML = pageHead(f.title, '#/guides/troubleshooting') + '<div class="notice">' + esc(T.doctorLine) + '</div>' +
        '<div class="card fade"><p>' + esc(f.intro) + '</p><ol class="steps">' + f.steps.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>' +
        '<div class="stopif">' + esc(f.talk) + ' <a href="#/safety">See Safety</a></div></div>';
      return;
    }
    var s = T.situations.filter(function (x) { return x.id === id; })[0];
    if (!s) { location.hash = '#/guides/troubleshooting'; return; }
    app.innerHTML = pageHead(s.title, '#/guides/troubleshooting') + '<div class="notice">' + esc(T.doctorLine) + '</div>' +
      '<div class="card fade">' + (s.gentleOnly ? '<p><span class="gentle-tag">Gentle level only</span></p>' : '') +
      '<div class="kv"><b>Who it is for</b><span>' + esc(s.who) + '</span></div>' +
      '<div class="kv"><b>How to adapt your routine</b></div><ul class="clean">' + s.adapt.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>' +
      '<div class="kv"><b>What to skip</b><span>' + esc(s.skip) + '</span></div>' +
      '<div class="kv"><b>When to talk to a doctor</b><span>' + esc(s.talk) + '</span></div>' +
      (s.gentleOnly ? '<button class="btn sec" data-act="setgentle">Switch my routine to Gentle</button>' : '') + '</div>';
  };

  var tipFilter = 'all';
  view.tips = function () {
    track('guide_opened', { guide: 'tips' });
    var chips = [['all', 'All'], ['fav', 'Favorites']].concat(C.tipCategories.map(function (c, i) { return ['c' + i, c]; }));
    var list = C.tips.map(function (t, i) { return { t: t, i: i }; }).filter(function (o) {
      if (tipFilter === 'all') return true;
      if (tipFilter === 'fav') return S.favs.indexOf(o.i) > -1;
      return 'c' + o.t.c === tipFilter;
    });
    app.innerHTML = pageHead('101 Everyday Tips', '#/guides') +
      '<div class="chips" role="tablist" aria-label="Filter tips">' + chips.map(function (c) { return '<button class="chip' + (tipFilter === c[0] ? ' on' : '') + '" data-act="tipfilter" data-f="' + c[0] + '" aria-pressed="' + (tipFilter === c[0]) + '">' + esc(c[1]) + '</button>'; }).join('') + '</div>' +
      (list.length ? '' : '<p class="muted">No favorites yet. Tap the star on any tip.</p>') +
      '<div class="fade">' + list.map(function (o) {
        var fav = S.favs.indexOf(o.i) > -1;
        return '<div class="card tip"><div class="body"><h3>' + esc(o.t.t) + '</h3><p>' + esc(o.t.x) + '</p><span class="small muted">' + esc(C.tipCategories[o.t.c]) + '</span></div>' +
          '<button class="fav' + (fav ? ' on' : '') + '" data-act="fav" data-i="' + o.i + '" aria-pressed="' + fav + '" aria-label="' + (fav ? 'Remove from favorites' : 'Add to favorites') + '">&#9733;</button></div>';
      }).join('') + '</div>';
  };

  view.messages = function () {
    var n = dayNum();
    var next = C.messages.filter(function (m) { return m.day > n; })[0];
    var un = unlocked().slice().reverse();
    app.innerHTML = '<h1>Messages</h1><div class="fade">' +
      (un.length ? un.map(function (m) {
        var isNew = S.read.indexOf(m.day) < 0;
        return '<details class="msg' + (isNew ? ' unread' : '') + '" data-day="' + m.day + '"><summary>' + (isNew ? '<span class="dot" aria-label="New"></span>' : '') + '<span>' + esc(m.title) + '<span class="d">Day ' + m.day + '</span></span></summary>' +
          '<div class="body"><p>' + esc(m.text) + '</p>' + (m.action ? '<a class="btn sec sm" href="' + esc(m.action.route) + '">' + esc(m.action.label) + '</a>' : '') + '</div></details>';
      }).join('') : '<p class="muted">No messages yet.</p>') +
      (next ? '<p class="muted small center">Your next message arrives on day ' + next.day + '.</p>' : '') + '</div>';
    $$('details.msg').forEach(function (d) {
      d.addEventListener('toggle', function () {
        var day = +d.getAttribute('data-day');
        if (d.open && S.read.indexOf(day) < 0) { S.read.push(day); save(); d.classList.remove('unread'); var dot = $('.dot', d); if (dot) dot.remove(); updateBadge(); }
      });
    });
  };

  view.safety = function (q) {
    var h = '<h1>Safety</h1>';
    if (q.stopped) h += '<div class="notice warn" role="status"><b>You stopped your session.</b> That is okay. If you feel pain or any warning sign below, get care. Do not try to push through.</div>';
    if (q.blocked) h += '<div class="notice warn" role="status"><b>Your sessions are on hold.</b> You did not confirm that none of the warning signs apply to you. Please read this page. When you are ready, review the safety check.</div>';
    h += '<p>' + esc(C.safety.intro) + '</p><div class="fade">';
    C.safety.sections.forEach(function (s, i) {
      var cls = (i === 2 || i === 3) ? 'warn' : 'clean';
      h += '<div class="card"><h2>' + esc(s.title) + '</h2><ul class="' + cls + '">' + s.items.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul></div>';
    });
    h += '</div>';
    if (q.blocked || !S.safetyOk) h += '<a class="btn" href="#/check">Review the safety check</a>';
    else h += '<a class="btn sec" href="#/today">Back to Today</a>';
    app.innerHTML = h;
  };

  view.help = function () {
    app.innerHTML = '<h1>Help</h1><div class="list fade">' +
      [['#/help/faq', 'FAQ', '12 common questions'],
       ['#/help/guarantee', 'Guarantee', 'Your 60-day guarantee'],
       ['#/help/support', 'Contact support', 'Send us an email'],
       ['#/help/story', 'Share your story', 'Only with your written permission'],
       ['#/help/data', 'Your progress', 'Where it is saved, backup and restore'],
       ['#/help/settings', 'Settings', 'Text size, level, reminder']].map(function (x) {
        return '<a class="item" href="' + x[0] + '"><span><span class="t">' + x[1] + '</span><span class="s">' + x[2] + '</span></span><span class="go" aria-hidden="true">&#8250;</span></a>';
      }).join('') + '</div>' +
      '<div class="card"><h3>Where is my progress saved?</h3><p style="margin:0">' + esc(C.dataNotice) + '</p></div>';
  };
  view.faq = function () {
    app.innerHTML = pageHead('FAQ', '#/help') + '<div class="fade">' + C.faq.map(function (f) {
      return '<details class="faq"><summary>' + esc(f.q) + '</summary><p>' + esc(f.a) + '</p></details>';
    }).join('') + '</div>';
  };
  view.guarantee = function () {
    track('guarantee_viewed');
    var g = C.guarantee;
    app.innerHTML = pageHead(g.title, '#/help') + '<div class="card fade">' + g.paragraphs.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('') +
      '<a class="btn" data-act="support" href="' + esc(supportHref()) + '">Email our support team</a></div>';
  };
  view.support = function () {
    app.innerHTML = pageHead('Contact support', '#/help') + '<div class="card fade"><p>Our team is ready to help. Please include the email you used to buy.</p>' +
      '<a class="btn" data-act="support" href="' + esc(supportHref()) + '">Email our support team</a>' +
      '<p class="small muted" style="margin:10px 0 0">' + esc(C.config.supportEmail) + '</p></div>';
  };
  view.story = function () {
    var s = C.story;
    app.innerHTML = pageHead(s.title, '#/help') + '<div class="card fade"><p>' + esc(s.text) + '</p><p class="small muted">' + esc(s.consent) + '</p>' +
      '<a class="btn" data-act="story" href="mailto:' + esc(C.config.storyEmail) + '?subject=' + encodeURIComponent('My BackSwitch story') + '">Send us my story</a></div>';
  };
  view.data = function () {
    app.innerHTML = pageHead('Your progress', '#/help') + '<div class="card stack fade"><h3>Where is my progress saved?</h3><p>' + esc(C.dataNotice) + '</p>' +
      (storageOk ? '' : '<div class="err">Your browser is blocking storage. Your progress will not be kept after you close this page.</div>') +
      '<button class="btn" data-act="copy">Copy my progress</button><div id="d-msg"></div>' +
      '<label class="field">Paste to restore<textarea class="input" id="d-paste" placeholder="Paste your progress text here"></textarea></label>' +
      '<button class="btn sec" data-act="restore">Restore from text</button></div>';
  };
  view.settings = function () {
    var canFixStart = !S.startFixed;
    app.innerHTML = pageHead('Settings', '#/help') + '<div class="stack fade">' +
      '<div class="card"><h3>Text size</h3><div class="size-row">' + ['Normal', 'Large', 'Largest'].map(function (l, i) {
        return '<button data-act="fs" data-i="' + i + '" class="' + ((S.fs || 0) === i ? 'on' : '') + '" aria-pressed="' + ((S.fs || 0) === i) + '" style="font-size:' + (16 + i * 3) + 'px">' + l + '</button>'; }).join('') + '</div></div>' +
      '<div class="card"><h3>Your level</h3><div class="size-row" style="grid-template-columns:1fr 1fr">' +
      '<button data-act="level" data-l="gentle" class="' + (S.level === 'gentle' ? 'on' : '') + '" aria-pressed="' + (S.level === 'gentle') + '">Gentle</button>' +
      '<button data-act="level" data-l="standard" class="' + (S.level === 'standard' ? 'on' : '') + '" aria-pressed="' + (S.level === 'standard') + '">Standard</button></div>' +
      '<p class="small muted" style="margin:8px 0 0">If you have leg pain or a diagnosed condition, stay with Gentle.</p></div>' +
      '<div class="card"><h3>Where you feel it most</h3><label class="field" style="margin:0"><select class="input" id="s-pain">' +
      [['lower', 'Lower back'], ['upper', 'Upper back'], ['both', 'Both'], ['leg', 'Pain going down a leg']].map(function (p) { return '<option value="' + p[0] + '"' + (S.pain === p[0] ? ' selected' : '') + '>' + p[1] + '</option>'; }).join('') + '</select></label></div>' +
      '<div class="card"><h3>Start date</h3>' + (canFixStart ?
        '<label class="field" style="margin:0 0 10px"><input class="input" type="date" id="s-start" max="' + todayStr() + '" value="' + esc(S.start) + '"></label><button class="btn sec" data-act="fixstart">Correct my start date (one time)</button><p class="small muted" style="margin:8px 0 0">You can correct it once.</p>' :
        '<p style="margin:0">' + esc(S.start) + '. It has already been corrected once.</p>') + '</div>' +
      '<div class="card"><h3>Daily reminder</h3><p class="small muted">Download a calendar event that repeats every day for 60 days.</p>' +
      '<label class="field">Time<input class="input" type="time" id="s-time" value="08:00"></label><button class="btn sec" data-act="ics">Download reminder (.ics)</button></div>' +
      '<div class="card"><h3>Safety check</h3><a class="btn ghost" href="#/check">Review the safety check</a></div></div>';
    $('#s-pain').onchange = function () {
      S.pain = this.value;
      if (S.pain === 'leg') S.level = 'gentle';
      save(); view.settings();
    };
  };

  /* ---------- actions ---------- */
  function copyText(txt, done) {
    function fallback() {
      var ta = document.createElement('textarea'); ta.value = txt; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = false; try { ok = document.execCommand('copy'); } catch (e) {}
      document.body.removeChild(ta); done(ok);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(function () { done(true); }, fallback);
    else fallback();
  }
  function backupString() { return 'BS1:' + btoa(unescape(encodeURIComponent(JSON.stringify(S)))); }
  function makeIcs(time) {
    var t = time.split(':'), now = new Date();
    var start = now.getFullYear() + pad(now.getMonth() + 1) + pad(now.getDate()) + 'T' + pad(+t[0]) + pad(+t[1]) + '00';
    var stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//BackSwitch//Member Area//EN', 'BEGIN:VEVENT',
      'UID:' + S.id + '@backswitch', 'DTSTAMP:' + stamp, 'DTSTART:' + start, 'DURATION:PT7M', 'RRULE:FREQ=DAILY;COUNT=' + C.config.programDays,
      'SUMMARY:BackSwitch: your 7 minutes', 'DESCRIPTION:Open your Member Area and start today\'s 7-minute session.', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  }

  var actions = {
    start: function () { if (!S.safetyOk) { location.hash = '#/check'; return; } startSession(); },
    startfd: function () { if (!S.safetyOk) { location.hash = '#/check'; return; } startSession({ forceGentle: true, fd: true }); },
    pause: togglePause,
    next: function () { if (sess && !sess.finished) nextStep(); },
    stop: stopSession,
    gentlestep: function () { if (sess) { sess.gentle[sess.idx] = !sess.gentle[sess.idx]; renderSession(); } },
    levelup: function (el) { S.level = 'standard'; S.dismissed.push(+el.getAttribute('data-th')); save(); view.today(); },
    levelno: function (el) { S.dismissed.push(+el.getAttribute('data-th')); save(); view.today(); },
    fdtick: function (el) {
      var i = +el.getAttribute('data-i'), k = S.fd.indexOf(i);
      if (el.checked && k < 0) S.fd.push(i); else if (!el.checked && k > -1) S.fd.splice(k, 1);
      save();
    },
    setgentle: function () { S.level = 'gentle'; save(); var b = $('[data-act=setgentle]'); if (b) { b.outerHTML = '<div class="notice" role="status">Your routine is now on the Gentle level.</div>'; } },
    tipfilter: function (el) { tipFilter = el.getAttribute('data-f'); view.tips(); },
    fav: function (el) {
      var i = +el.getAttribute('data-i'), k = S.favs.indexOf(i);
      if (k < 0) S.favs.push(i); else S.favs.splice(k, 1);
      save();
      if (tipFilter === 'fav') view.tips();
      else { var on = S.favs.indexOf(i) > -1; el.classList.toggle('on', on); el.setAttribute('aria-pressed', on); el.setAttribute('aria-label', on ? 'Remove from favorites' : 'Add to favorites'); }
    },
    support: function () { track('support_email_clicked'); return true; },
    story: function () { track('story_link_clicked'); return true; },
    copy: function () {
      copyText(backupString(), function (ok) {
        track('backup_copied');
        $('#d-msg').innerHTML = ok ? '<div class="notice" role="status">Copied. Paste it somewhere safe, like a note.</div>' :
          '<div class="err">We could not copy automatically. Please select the text below and copy it.</div><textarea class="input" readonly onfocus="this.select()">' + esc(backupString()) + '</textarea>';
      });
    },
    restore: function () {
      var v = ($('#d-paste').value || '').trim();
      var m = $('#d-msg');
      try {
        if (v.indexOf('BS1:') !== 0) throw 0;
        var o = JSON.parse(decodeURIComponent(escape(atob(v.slice(4)))));
        if (!o || o.v !== 1 || !o.start || typeof o.logs !== 'object') throw 0;
        S = Object.assign(blank(), o); save(); fsApply();
        m.innerHTML = '<div class="notice" role="status">Your progress was restored. <a href="#/today">Go to Today</a></div>';
      } catch (e) { m.innerHTML = '<div class="err" role="alert">That text does not look right. Please copy it again from \'Copy my progress\'.</div>'; }
    },
    fs: function (el) { S.fs = +el.getAttribute('data-i'); save(); fsApply(); view.settings(); },
    level: function (el) {
      var l = el.getAttribute('data-l');
      if (S.pain === 'leg' && l === 'standard') { alert('With leg pain, the Gentle level is the safer choice. Please talk to your doctor or physical therapist first.'); return; }
      S.level = l; save(); view.settings();
    },
    fixstart: function () {
      var v = $('#s-start').value; if (!v || v > todayStr()) return;
      S.start = v; S.startFixed = true; save(); view.settings();
    },
    ics: function () {
      var blob = new Blob([makeIcs($('#s-time').value || '08:00')], { type: 'text/calendar' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'backswitch-reminder.ics';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      track('ics_downloaded');
    }
  };
  document.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el) return;
    var a = el.getAttribute('data-act');
    if (el.tagName === 'INPUT') return;
    if (!actions[a]) return;
    var keep = actions[a](el);
    if (!keep) e.preventDefault();
  });
  document.addEventListener('change', function (e) {
    var el = e.target;
    if (el && el.getAttribute && el.getAttribute('data-act') === 'fdtick') actions.fdtick(el);
  });
  $('#bell').addEventListener('click', function () { location.hash = '#/messages'; });

  /* ---------- router ---------- */
  var titles = { today: 'Today', routine: 'Routine', guides: 'Guides', help: 'Help', welcome: 'Welcome', safety: 'Safety', messages: 'Messages', log: 'Daily log', progress: 'My progress', session: 'Session' };
  function route() {
    var raw = location.hash.replace(/^#/, '') || '/today';
    var qi = raw.indexOf('?'), q = {};
    if (qi > -1) { raw.slice(qi + 1).split('&').forEach(function (p) { var kv = p.split('='); q[kv[0]] = kv[1] || '1'; }); raw = raw.slice(0, qi); }
    var parts = raw.split('/').filter(Boolean);
    var top = parts[0] || 'today';

    // leaving a session in progress discards it
    if (top !== 'session' && sess) { stopTimer(); releaseWake(); sess = null; }
    document.body.classList.toggle('in-session', top === 'session');
    document.body.classList.toggle('no-nav', top === 'welcome');
    $('#top').style.display = '';

    if (!S.name && top !== 'welcome' && top !== 'safety') { location.hash = '#/welcome'; return; }
    if (top === 'session' && !sess) { location.hash = '#/today'; return; }

    var navKey = ({ today: 'today', log: 'today', progress: 'today', session: 'today', check: 'today', messages: 'today', routine: 'routine', guides: 'guides', help: 'help', safety: '' })[top] || '';
    $$('#nav a').forEach(function (a) { a.classList.toggle('on', a.getAttribute('data-nav') === navKey); });

    switch (top) {
      case 'welcome': view.welcome(); break;
      case 'check': view.check(); break;
      case 'today': view.today(); break;
      case 'session': view.session(); break;
      case 'log': view.log(); break;
      case 'progress': view.progress(); break;
      case 'routine': parts[1] ? view.trigger(parts[1]) : view.routine(); break;
      case 'guides':
        if (!parts[1]) view.guides();
        else if (parts[1] === 'first-day') view.firstDay();
        else if (parts[1] === 'troubleshooting') parts[2] ? view.situation(parts[2]) : view.trouble();
        else if (parts[1] === 'tips') view.tips();
        else view.guides();
        break;
      case 'messages': view.messages(); break;
      case 'safety': view.safety(q); break;
      case 'help':
        var sub = parts[1];
        if (!sub) view.help();
        else if (view[sub]) view[sub]();
        else view.help();
        break;
      default: view.today();
    }
    document.title = (titles[top] || 'BackSwitch') + ' | BackSwitch Member Area';
    if (top !== 'session') window.scrollTo(0, 0);
    updateBadge();
  }
  window.addEventListener('hashchange', route);

  /* ---------- boot ---------- */
  function boot() {
    storageOk = probeStorage();
    S = load();
    fsApply();
    if (!storageOk) {
      var n = document.createElement('div');
      n.className = 'notice warn'; n.style.margin = '0'; n.style.borderRadius = '0'; n.setAttribute('role', 'status');
      n.textContent = 'Your browser is blocking storage (a private window?). The app works, but your progress will not be kept after you close this page.';
      $('#top').insertAdjacentElement('afterend', n);
    }
    track('area_opened', { returning: !!S.name });
    // keep cookie and localStorage identical: if one was empty, it is refilled from the other
    var hadLs = false, hadCk = false;
    try { hadLs = !!localStorage.getItem(KEY); } catch (e) {}
    hadCk = !!cookieGet(COOKIE);
    if (!S.name || !hadLs || !hadCk) save();
    route();
  }
  fetch(CONTENT_URL, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (j) { C = j; boot(); })
    .catch(function () {
      app.innerHTML = '<div class="card"><h2>We could not load the page</h2><p>Please check your connection and try again.</p><button class="btn" onclick="location.reload()">Try again</button></div>';
    });
})();
