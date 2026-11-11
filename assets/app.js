/* Simon Ferns — Training. Static site; all content comes from files in /data. */
(function () {
  "use strict";

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var MONTHS_FULL = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  var SPORTS = ["Bike", "Run", "Swim", "Gym"];
  var SPORT_COLORS = { Bike: "#3b6ea5", Run: "#e8763a", Swim: "#2a9d8f", Gym: "#8a8f98" };
  var PHASE_BAND_COLORS = ["#dde3ee", "#dceae4", "#e8e0d2", "#eadbd4", "#f2e3d0", "#e4dcee", "#d8e6ea", "#dfe4ea"];
  // IRONMAN 70.3 Durban cutoffs (minutes): swim, swim+T1+bike, finish.
  var CUTOFFS = { swim_time: 70, swim_bike: 330, total: 510 };

  var DATA = {};
  var state = { todayISO: null, weeks: [], months: [], weekIdx: 0, monthIdx: 0, planMode: "week" };

  /* ---------- small utilities ---------- */

  function el(tag, cls, html) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html !== undefined) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }
  function dUTC(iso) {
    var p = iso.split("-");
    return Date.UTC(+p[0], +p[1] - 1, +p[2]);
  }
  function isoOf(ms) {
    var d = new Date(ms);
    return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");
  }
  function addDays(iso, n) { return isoOf(dUTC(iso) + n * 86400000); }
  function dayDiff(a, b) { return Math.round((dUTC(b) - dUTC(a)) / 86400000); }
  function mondayOf(iso) {
    var d = new Date(dUTC(iso));
    var off = (d.getUTCDay() + 6) % 7; // Mon=0
    return isoOf(dUTC(iso) - off * 86400000);
  }
  function weekdayName(iso) { return DAYS[(new Date(dUTC(iso)).getUTCDay() + 6) % 7]; }
  function fmtDate(iso, opts) {
    opts = opts || {};
    var d = new Date(dUTC(iso));
    var s = d.getUTCDate() + " " + MONTHS[d.getUTCMonth()];
    if (!opts.noYear) s += " " + d.getUTCFullYear();
    if (opts.weekday) s = weekdayName(iso) + " " + s;
    return s;
  }
  function fmtRange(a, b) {
    var da = new Date(dUTC(a)), db = new Date(dUTC(b));
    if (da.getUTCFullYear() === db.getUTCFullYear()) {
      if (da.getUTCMonth() === db.getUTCMonth()) {
        return da.getUTCDate() + "\u2013" + db.getUTCDate() + " " + MONTHS[da.getUTCMonth()] + " " + da.getUTCFullYear();
      }
      return da.getUTCDate() + " " + MONTHS[da.getUTCMonth()] + " \u2013 " + db.getUTCDate() + " " + MONTHS[db.getUTCMonth()] + " " + da.getUTCFullYear();
    }
    return fmtDate(a) + " \u2013 " + fmtDate(b);
  }
  function todayInJohannesburg() {
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(new Date());
  }
  function fmtDur(min) {
    min = Math.round(min);
    var h = Math.floor(min / 60), m = min % 60;
    if (h === 0) return m + " min";
    if (m === 0) return h + " h";
    return h + " h " + String(m).padStart(2, "0");
  }
  function fmtHours(h) { return (Math.round(h * 10) / 10).toFixed(1) + " h"; }
  function timeStrToMin(t) { // "8:48" or "1:31" -> minutes
    var p = String(t).split(":");
    return (+p[0]) * 60 + (+p[1] || 0);
  }

  function parseCSV(text) {
    var rows = [], row = [], field = "", inQ = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (inQ) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else { inQ = false; }
        } else field += c;
      } else if (c === '"') inQ = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field); field = "";
        if (row.length > 1 || row[0] !== "") rows.push(row);
        row = [];
      } else field += c;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    var head = rows.shift();
    return rows.map(function (r) {
      var o = {};
      head.forEach(function (h, j) { o[h] = r[j] === undefined ? "" : r[j]; });
      return o;
    });
  }

  /* ---------- data shaping ---------- */

  function buildIndexes() {
    var byDate = {};
    DATA.sessions.forEach(function (s) {
      s.duration_min = +s.duration_min || 0;
      s.distance_km = s.distance_km === "" ? null : +s.distance_km;
      s.slot = +s.slot || 1;
      (byDate[s.date] = byDate[s.date] || []).push(s);
    });
    Object.keys(byDate).forEach(function (d) {
      byDate[d].sort(function (a, b) { return a.slot - b.slot; });
    });
    DATA.byDate = byDate;

    // Monday-start weeks covering the whole plan
    var weeks = [];
    var w = mondayOf(DATA.site.plan_start);
    var last = DATA.site.plan_end;
    while (dUTC(w) <= dUTC(last)) {
      var days = [];
      for (var i = 0; i < 7; i++) days.push(addDays(w, i));
      var sessions = [];
      days.forEach(function (d) { if (byDate[d]) sessions = sessions.concat(byDate[d]); });
      var bySport = {}, total = 0, phases = [], srcWeeks = [];
      sessions.forEach(function (s) {
        bySport[s.sport] = (bySport[s.sport] || 0) + s.duration_min;
        total += s.duration_min;
        if (phases.indexOf(s.phase) < 0) phases.push(s.phase);
        if (srcWeeks.indexOf(+s.week) < 0) srcWeeks.push(+s.week);
      });
      weeks.push({ monday: w, days: days, sessions: sessions, bySport: bySport, totalMin: total, phases: phases, srcWeeks: srcWeeks });
      w = addDays(w, 7);
    }
    state.weeks = weeks;

    // Months
    var months = [], seen = {};
    DATA.sessions.forEach(function (s) {
      var key = s.date.slice(0, 7);
      if (!seen[key]) { seen[key] = { key: key, sessions: [] }; months.push(seen[key]); }
      seen[key].sessions.push(s);
    });
    months.sort(function (a, b) { return a.key < b.key ? -1 : 1; });
    months.forEach(function (m) {
      m.bySport = {}; m.totalMin = 0;
      m.sessions.forEach(function (s) {
        m.bySport[s.sport] = (m.bySport[s.sport] || 0) + s.duration_min;
        m.totalMin += s.duration_min;
      });
      var p = m.key.split("-");
      m.label = MONTHS_FULL[+p[1] - 1] + " " + p[0];
    });
    state.months = months;
  }

  function phaseOn(iso) {
    for (var i = 0; i < DATA.phases.length; i++) {
      var p = DATA.phases[i];
      if (iso >= p.start && iso <= p.end) return p;
    }
    return null;
  }
  function weekIndexFor(iso) {
    var mon = mondayOf(iso);
    for (var i = 0; i < state.weeks.length; i++) if (state.weeks[i].monday === mon) return i;
    return iso < state.weeks[0].monday ? 0 : state.weeks.length - 1;
  }
  function monthIndexFor(iso) {
    var key = iso.slice(0, 7);
    for (var i = 0; i < state.months.length; i++) if (state.months[i].key === key) return i;
    return key < state.months[0].key ? 0 : state.months.length - 1;
  }
  function weekLabelShort(wk) {
    var lbl = "Week of " + fmtDate(wk.monday);
    if (wk.phases.length) lbl += " \u00b7 " + wk.phases.join(" / ");
    return lbl;
  }
  function sourceWeekText(wk) {
    if (!wk.srcWeeks.length) return "";
    var parts = [];
    wk.phases.forEach(function (ph) {
      var nums = [];
      wk.sessions.forEach(function (s) { if (s.phase === ph && nums.indexOf(+s.week) < 0) nums.push(+s.week); });
      nums.sort(function (a, b) { return a - b; });
      parts.push(ph + " week " + nums.join("/"));
    });
    return parts.join(" \u00b7 ");
  }

  /* ---------- tabs ---------- */

  var TABS = ["overview", "plan", "phases", "races", "predictions", "gym"];
  var chartsDone = { hours: false, weight: false };
  function showTab() {
    var tab = (location.hash || "#overview").slice(1).split("?")[0];
    if (TABS.indexOf(tab) < 0) tab = "overview";
    TABS.forEach(function (t) {
      document.getElementById("panel-" + t).hidden = t !== tab;
    });
    document.querySelectorAll(".tabs a").forEach(function (a) {
      a.classList.toggle("active", a.dataset.tab === tab);
    });
    // Charts are created only once their panel is visible, so the canvas has a real size.
    if (tab === "overview" && !chartsDone.hours) { chartsDone.hours = true; renderHoursChart(); }
    if (tab === "predictions" && !chartsDone.weight) { chartsDone.weight = true; renderWeightChart(); }
    window.scrollTo(0, 0);
  }

  /* ---------- renderers ---------- */

  function sportBadge(sport) {
    return '<span class="badge ' + sport.toLowerCase() + '">' + esc(sport) + "</span>";
  }

  function sessionHTML(s, opts) {
    opts = opts || {};
    var meta = [fmtDur(s.duration_min)];
    if (s.distance_km != null) meta.push(s.distance_km + " km");
    var h = '<div class="session">' +
      '<div class="session-top">' + sportBadge(s.sport) +
      '<span class="session-title">' + esc(s.title) + "</span>" +
      '<span class="session-meta">' + meta.join(" \u00b7 ") + "</span></div>";
    if (s.segments) h += '<div class="segments">' + esc(s.segments) + "</div>";
    if (s.description && s.description !== s.title) {
      h += "<details" + (opts.openDetails ? " open" : "") + "><summary>Details</summary><p>" + esc(s.description) + "</p></details>";
    }
    return h + "</div>";
  }

  function totalsHTML(bySport, totalMin) {
    var parts = ['<span class="t"><strong>' + fmtHours(totalMin / 60) + "</strong> total</span>"];
    SPORTS.forEach(function (sp) {
      if (bySport[sp]) parts.push('<span class="t">' + sportBadge(sp) + " " + fmtHours(bySport[sp] / 60) + "</span>");
    });
    return '<div class="totals-row">' + parts.join("") + "</div>";
  }

  /* ----- overview ----- */

  function renderOverview() {
    var today = state.todayISO;
    var cards = document.getElementById("overview-cards");
    var phase = phaseOn(today);
    var wi = weekIndexFor(today);
    var wk = state.weeks[wi];

    var html = "";

    var phaseSub = "";
    if (phase) {
      var pd = dayDiff(phase.start, today) + 1, pt = dayDiff(phase.start, phase.end) + 1;
      phaseSub = fmtRange(phase.start, phase.end) + " \u00b7 day " + pd + " of " + pt;
    }
    html += '<div class="card stat-card"><div class="k">Current phase</div><div class="v">' +
      esc(phase ? phase.name : "Between phases") + '</div><div class="s">' + phaseSub + "</div></div>";

    html += '<div class="card stat-card"><div class="k">This week</div><div class="v">' +
      fmtHours(wk.totalMin / 60) + ' planned</div><div class="s">' + esc(fmtRange(wk.days[0], wk.days[6])) +
      (wk.srcWeeks.length ? " \u00b7 " + esc(sourceWeekText(wk)) : "") + "</div></div>";

    [DATA.site.goal_race, DATA.site.second_goal].forEach(function (g) {
      var dd = dayDiff(today, g.date);
      var vv = dd > 0 ? dd + " days" : (dd === 0 ? "Race day!" : "Done");
      html += '<div class="card stat-card"><div class="k">' + esc(g.name) + '</div><div class="v">' + vv +
        '</div><div class="s">' + fmtDate(g.date, { weekday: true }) + "</div></div>";
    });

    cards.innerHTML = html;

    // Today + next up
    var box = document.getElementById("overview-today");
    var todaySessions = DATA.byDate[today] || [];
    var h = '<div class="card"><h2>Today \u00b7 ' + fmtDate(today, { weekday: true }) + "</h2>";
    if (todaySessions.length) {
      todaySessions.forEach(function (s) { h += sessionHTML(s, { openDetails: true }); });
    } else {
      h += '<p class="rest-note">No session planned today \u2014 rest day.</p>';
    }
    h += "</div>";

    var next = null, d = addDays(today, 1);
    while (d <= DATA.site.plan_end && !next) {
      if (DATA.byDate[d]) next = d; else d = addDays(d, 1);
    }
    if (next) {
      h += '<div class="card" style="margin-top:12px"><h2>Next up \u00b7 ' + fmtDate(next, { weekday: true }) + "</h2>";
      DATA.byDate[next].forEach(function (s) { h += sessionHTML(s); });
      h += "</div>";
    }
    box.innerHTML = h;
  }

  function renderHoursChart() {
    var note = document.getElementById("hours-chart-note");
    var weeks = state.weeks.filter(function (w) { return w.totalMin > 0; });
    var total = 0;
    weeks.forEach(function (w) { total += w.totalMin; });
    note.textContent = "Full plan, " + fmtDate(DATA.site.plan_start) + " to " + fmtDate(DATA.site.plan_end) +
      " \u00b7 " + fmtHours(total / 60) + " planned in total.";

    if (typeof Chart === "undefined") {
      note.textContent += " (Chart could not be loaded.)";
      return;
    }

    var labels = weeks.map(function (w) { return fmtDate(w.monday, { noYear: true }) + " '" + w.monday.slice(2, 4); });
    var todayMon = mondayOf(state.todayISO);
    var datasets = SPORTS.map(function (sp) {
      return {
        label: sp,
        data: weeks.map(function (w) { return Math.round(((w.bySport[sp] || 0) / 60) * 100) / 100; }),
        backgroundColor: SPORT_COLORS[sp],
        borderColor: weeks.map(function (w) { return w.monday === todayMon ? "#1d2733" : SPORT_COLORS[sp]; }),
        borderWidth: weeks.map(function (w) { return w.monday === todayMon ? 1.5 : 0; }),
        stack: "h"
      };
    });

    var phaseNames = DATA.phases.map(function (p) { return p.name; });
    var bandPlugin = {
      id: "phaseBands",
      beforeDraw: function (chart) {
        var x = chart.scales.x, area = chart.chartArea, ctx = chart.ctx;
        if (!x || !area) return;
        ctx.save();
        weeks.forEach(function (w, i) {
          var ph = w.phases[0];
          var pi = phaseNames.indexOf(ph);
          if (pi < 0) return;
          ctx.fillStyle = PHASE_BAND_COLORS[pi % PHASE_BAND_COLORS.length];
          ctx.globalAlpha = 0.45;
          var x0 = x.getPixelForValue(i) - (x.getPixelForValue(1) - x.getPixelForValue(0)) / 2;
          var x1 = x.getPixelForValue(i) + (x.getPixelForValue(1) - x.getPixelForValue(0)) / 2;
          ctx.fillRect(Math.max(x0, area.left), area.top, Math.min(x1, area.right) - Math.max(x0, area.left), area.bottom - area.top);
        });
        ctx.restore();
      }
    };

    new Chart(document.getElementById("hours-chart"), {
      type: "bar",
      data: { labels: labels, datasets: datasets },
      plugins: [bandPlugin],
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { stacked: true, ticks: { maxRotation: 60, autoSkip: true, maxTicksLimit: 20, font: { size: 10 } }, grid: { display: false } },
          y: { stacked: true, title: { display: true, text: "Hours" }, beginAtZero: true }
        },
        plugins: {
          legend: { position: "bottom", labels: { boxWidth: 12 } },
          tooltip: {
            callbacks: {
              title: function (items) {
                var w = weeks[items[0].dataIndex];
                return "Week of " + fmtDate(w.monday) + " \u00b7 " + w.phases.join(" / ");
              },
              footer: function (items) {
                var w = weeks[items[0].dataIndex];
                return "Total " + fmtHours(w.totalMin / 60);
              }
            }
          }
        }
      }
    });
  }

  /* ----- plan ----- */

  function setupPlanControls() {
    var sel = document.getElementById("plan-select");

    function fillSelect() {
      sel.innerHTML = "";
      if (state.planMode === "week") {
        state.weeks.forEach(function (w, i) {
          var o = document.createElement("option");
          o.value = i;
          o.textContent = "Week of " + fmtDate(w.monday) + (w.phases.length ? " \u2014 " + w.phases.join(" / ") : "");
          sel.appendChild(o);
        });
        sel.value = state.weekIdx;
      } else {
        state.months.forEach(function (m, i) {
          var o = document.createElement("option");
          o.value = i;
          o.textContent = m.label;
          sel.appendChild(o);
        });
        sel.value = state.monthIdx;
      }
    }

    function setMode(mode) {
      state.planMode = mode;
      document.getElementById("view-week").classList.toggle("active", mode === "week");
      document.getElementById("view-month").classList.toggle("active", mode === "month");
      fillSelect();
      renderPlan();
    }

    document.getElementById("view-week").onclick = function () { setMode("week"); };
    document.getElementById("view-month").onclick = function () { setMode("month"); };
    document.getElementById("plan-prev").onclick = function () { step(-1); };
    document.getElementById("plan-next").onclick = function () { step(1); };
    document.getElementById("plan-today").onclick = function () {
      if (state.planMode === "week") state.weekIdx = weekIndexFor(state.todayISO);
      else state.monthIdx = monthIndexFor(state.todayISO);
      fillSelect(); renderPlan();
    };
    sel.onchange = function () {
      if (state.planMode === "week") state.weekIdx = +sel.value; else state.monthIdx = +sel.value;
      renderPlan();
    };

    function step(dir) {
      if (state.planMode === "week") {
        state.weekIdx = Math.min(Math.max(state.weekIdx + dir, 0), state.weeks.length - 1);
        sel.value = state.weekIdx;
      } else {
        state.monthIdx = Math.min(Math.max(state.monthIdx + dir, 0), state.months.length - 1);
        sel.value = state.monthIdx;
      }
      renderPlan();
    }

    fillSelect();
  }

  function renderPlan() {
    var body = document.getElementById("plan-body");
    if (state.planMode === "week") renderWeek(body);
    else renderMonth(body);
  }

  function renderWeek(body) {
    var wk = state.weeks[state.weekIdx];
    var h = '<div class="card"><h2>Week of ' + fmtDate(wk.monday, { weekday: true }) + "</h2>";
    if (wk.srcWeeks.length) h += '<p class="muted">' + esc(sourceWeekText(wk)) + "</p>";
    h += totalsHTML(wk.bySport, wk.totalMin) + "</div>";

    wk.days.forEach(function (d) {
      if (d < DATA.site.plan_start || d > DATA.site.plan_end) return;
      var isToday = d === state.todayISO;
      var sessions = DATA.byDate[d] || [];
      h += '<div class="card day-block' + (isToday ? " today-block" : "") + '">' +
        '<div class="day-head"><span class="d">' + fmtDate(d, { weekday: true }) + "</span>" +
        (isToday ? '<span class="today-pill">Today</span>' : "") + "</div>";
      if (sessions.length) sessions.forEach(function (s) { h += sessionHTML(s); });
      else h += '<p class="rest-note">Rest day \u2014 no planned session.</p>';
      h += "</div>";
    });
    body.innerHTML = h;
  }

  function renderMonth(body) {
    var m = state.months[state.monthIdx];
    var h = '<div class="card"><h2>' + esc(m.label) + "</h2>" + totalsHTML(m.bySport, m.totalMin);

    // sessions grouped by date, compact
    var byDate = {};
    m.sessions.forEach(function (s) { (byDate[s.date] = byDate[s.date] || []).push(s); });
    var dates = Object.keys(byDate).sort();

    h += '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Sessions</th><th class="num">Time</th></tr></thead><tbody>';
    dates.forEach(function (d) {
      var ss = byDate[d];
      var tot = 0;
      var lines = ss.map(function (s) {
        tot += s.duration_min;
        var bits = [sportBadge(s.sport) + " " + esc(s.title), fmtDur(s.duration_min)];
        if (s.distance_km != null) bits.push(s.distance_km + " km");
        return bits.join(" \u00b7 ");
      });
      h += '<tr class="' + (d === state.todayISO ? "current-row" : "") + '"><td style="white-space:nowrap">' +
        fmtDate(d, { weekday: true, noYear: true }) + "</td><td>" + lines.join("<br>") +
        '</td><td class="num">' + fmtDur(tot) + "</td></tr>";
    });
    h += "</tbody></table></div>";
    h += '<p class="footnote">Switch to \u201cBy week\u201d for segment detail and session descriptions.</p></div>';
    body.innerHTML = h;
  }

  /* ----- phases ----- */

  function renderPhases() {
    var box = document.getElementById("phases-list");
    var today = state.todayISO;
    var h = "";
    DATA.phases.forEach(function (p) {
      var status = today > p.end ? "done" : (today >= p.start ? "current" : "upcoming");
      var statusTxt = { done: "Completed", current: "Current", upcoming: "Upcoming" }[status];
      var weeksTxt = "plan weeks " + p.source_week_start + (p.source_week_end !== p.source_week_start ? "\u2013" + p.source_week_end : "");
      h += '<div class="card phase-card" style="margin-top:12px">' +
        '<div class="phase-head"><h3>' + esc(p.name) + ' <span class="badge ' + status + '">' + statusTxt + "</span></h3>" +
        '<span class="phase-dates">' + fmtRange(p.start, p.end) + " \u00b7 " + esc(weeksTxt) + "</span></div>";
      if (status === "current") {
        var pct = Math.round(100 * (dayDiff(p.start, today) + 1) / (dayDiff(p.start, p.end) + 1));
        h += '<div class="phase-bar"><span style="width:' + pct + '%"></span></div>' +
          '<p class="muted">' + pct + "% through this phase.</p>";
      }
      if (p.notes) h += '<p class="muted">' + esc(p.notes) + "</p>";
      h += "</div>";
    });
    box.innerHTML = h;
  }

  /* ----- races ----- */

  function raceFormat(f) {
    if (!f) return "";
    var parts = [];
    if (f.swim_m) parts.push(f.swim_m + " m swim");
    if (f.swim_km) parts.push(f.swim_km + " km swim");
    if (f.bike_km) parts.push(f.bike_km + " km bike");
    if (f.run_km) parts.push(f.run_km + " km run");
    return parts.join(" \u00b7 ");
  }

  function renderRaces() {
    var box = document.getElementById("races-list");
    var today = state.todayISO;
    var races = DATA.races.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var h = "";
    races.forEach(function (r) {
      var approx = /approximate|around/i.test(r.notes || "");
      var badges = "";
      if (r.priority === "A-race") badges += ' <span class="badge a-race">A-race</span>';
      else if (r.priority === "training-race") badges += ' <span class="badge training-race">Training race</span>';
      else badges += ' <span class="badge test">Test</span>';
      var dd = dayDiff(today, r.date);
      var when = fmtDate(r.date, { weekday: true });
      if (approx) when = "~" + when + " (approx.)";
      var count = dd > 0 ? "in " + dd + " days" : (dd === 0 ? "today" : "done");
      h += '<div class="card race-card" style="margin-top:12px">' +
        '<span class="race-when">' + esc(when) + '<br><span class="muted" style="font-weight:400">' + count + "</span></span>" +
        '<span><span class="race-name">' + esc(r.name) + "</span>" + badges +
        (r.location ? ' <span class="muted">\u00b7 ' + esc(r.location) + "</span>" : "") +
        '<br><span class="race-format">' + raceFormat(r.format) + "</span></span>";
      if (r.notes) h += '<p class="race-notes">' + esc(r.notes) + "</p>";
      h += "</div>";
    });
    box.innerHTML = h;
  }

  /* ----- predictions ----- */

  function renderPredictions() {
    var P = DATA.predictions;
    var box = document.getElementById("predictions-body");
    var h = "";

    h += '<div class="card"><h2>Race-day predictions \u00b7 ' + esc(P.goal_race) + "</h2>" +
      '<p class="muted">Updated ' + fmtDate(P.updated) + " \u00b7 race on " + fmtDate(P.goal_race_date, { weekday: true }) +
      ". These projections are refreshed about once a week and come straight from the data file in this repository.</p></div>";

    // Weight plan
    var wp = P.weight_plan;
    h += '<div class="card chart-card"><h2>Weight plan: ' + wp.start_kg + " kg \u2192 " + wp.target_kg + " kg</h2>" +
      '<p class="muted">' + wp.start_kg + " kg on " + fmtDate(wp.start_date) + " to " + wp.target_kg + " kg by " +
      fmtDate(wp.hit_date, { weekday: true }) + " (about " + wp.rate_kg_per_week + " kg/week), then hold through race day " +
      fmtDate(wp.hold_through) + ".</p>" +
      '<div class="chart-box"><canvas id="weight-chart"></canvas></div>' +
      (wp.notes ? '<p class="footnote">' + esc(wp.notes) + "</p>" : "") + "</div>";

    // Primary scenario
    var primKey = null, prim = null;
    Object.keys(P.scenarios).forEach(function (k) { if (P.scenarios[k].is_primary) { primKey = k; prim = P.scenarios[k]; } });
    if (prim) h += scenarioCard(prim, true);

    // Comparison scenarios
    Object.keys(P.scenarios).forEach(function (k) {
      if (k !== primKey) h += scenarioCard(P.scenarios[k], false);
    });

    // Honesty / cutoffs
    h += '<div class="card"><h2>Cutoffs, honestly</h2>' +
      '<p class="muted">IRONMAN 70.3 Durban cutoffs: swim 1h10 \u00b7 swim + T1 + bike about 5h30 \u00b7 finish 8h30.</p>' +
      '<ul class="honesty">' + (P.honesty || []).map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul></div>";

    // Baselines
    var B = P.baselines;
    h += '<div class="card"><h2>Where the numbers start from</h2>' +
      '<p class="muted">Baselines as of ' + fmtDate(P.baselines_as_of) + ".</p>" +
      '<dl class="kv">' +
      "<dt>Easy run pace</dt><dd>" + esc(B.easy_run_pace_per_km) + " /km \u2014 " + esc(B.easy_run_source) + "</dd>" +
      "<dt>Bike start (primary)</dt><dd>" + B.bike_start_kmh_fair + " km/h</dd>" +
      "<dt>Bike start (official baseline)</dt><dd>" + B.bike_start_kmh_official + " km/h</dd>" +
      "</dl>" +
      '<p class="footnote">' + esc(B.bike_notes) + "</p>" +
      '<p class="footnote">' + esc(B.swim_notes) + "</p></div>";

    // Model notes
    h += '<div class="card"><details><summary><strong>How the model works</strong> (assumptions)</summary><ul class="honesty">' +
      (P.model_notes || []).map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") +
      "</ul></details></div>";

    box.innerHTML = h;
  }

  var SCENARIO_ROWS = [
    ["swim_per_100", "Swim pace", " /100 m"],
    ["swim_time", "Swim (1.9 km)", ""],
    ["bike_kmh", "Bike speed", " km/h"],
    ["bike_time", "Bike (90 km)", ""],
    ["swim_bike", "Swim + T1 + bike elapsed", ""],
    ["easy_pace", "Easy run pace", " /km"],
    ["off_bike_pace", "Off-the-bike run pace", " /km"],
    ["off_bike_half", "Run (21.1 km, off the bike)", ""],
    ["total", "Projected finish", ""]
  ];
  var COLS = [["opt", "Optimistic"], ["central", "Central"], ["cons", "Conservative"]];

  function scenarioCard(sc, isPrimary) {
    var june = sc.june || {};
    var h = '<div class="card"><h2>' + (isPrimary ? "Primary scenario: " : "Comparison: ") + esc(sc.label) +
      (isPrimary ? ' <span class="badge current">Primary</span>' : "") + "</h2>";
    if (!isPrimary) h += '<p class="scenario-note">Shown for comparison only \u2014 not the headline projection.</p>';
    h += '<div class="table-wrap"><table><thead><tr><th>June projection</th>' +
      COLS.map(function (c) { return '<th class="num">' + c[1] + "</th>"; }).join("") + "</tr></thead><tbody>";
    SCENARIO_ROWS.forEach(function (row) {
      var key = row[0], label = row[1], unit = row[2];
      var present = COLS.some(function (c) { return june[c[0]] && june[c[0]][key] !== undefined; });
      if (!present) return;
      h += "<tr><td>" + label + "</td>";
      COLS.forEach(function (c) {
        var v = june[c[0]] ? june[c[0]][key] : undefined;
        if (v === undefined) { h += '<td class="num">\u2014</td>'; return; }
        var style = "";
        if (CUTOFFS[key] !== undefined && timeStrToMin(v) > CUTOFFS[key]) style = ' style="color:var(--bad);font-weight:600"';
        h += '<td class="num"' + style + ">" + esc(v) + esc(unit) + "</td>";
      });
      h += "</tr>";
    });
    h += "</tbody></table></div>" +
      '<p class="footnote">Times in red are over the matching Durban cutoff (swim 1h10, swim+T1+bike ~5h30, finish 8h30).</p>';
    if (sc.notes) h += '<p class="footnote">' + esc(sc.notes) + "</p>";
    return h + "</div>";
  }

  function renderWeightChart() {
    if (typeof Chart === "undefined") return;
    var wp = DATA.predictions.weight_plan;
    var pts = [{ date: wp.start_date, kg: wp.start_kg }];
    (wp.monthly_marks || []).forEach(function (m) {
      if (m.date !== wp.hit_date) pts.push({ date: m.date, kg: m.kg });
    });
    pts.push({ date: wp.hit_date, kg: wp.target_kg });
    pts.push({ date: wp.hold_through, kg: wp.target_kg });
    pts.sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    var holdIdx = pts.findIndex(function (p) { return p.date === wp.hit_date; });

    new Chart(document.getElementById("weight-chart"), {
      type: "line",
      data: {
        labels: pts.map(function (p) { return fmtDate(p.date, { noYear: true }); }),
        datasets: [{
          label: "Planned weight (kg)",
          data: pts.map(function (p) { return p.kg; }),
          borderColor: "#24455f",
          backgroundColor: "#24455f",
          pointRadius: 4,
          tension: 0,
          segment: {
            borderDash: function (ctx) { return ctx.p0DataIndex >= holdIdx ? [6, 5] : undefined; }
          }
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { title: { display: true, text: "kg" }, suggestedMin: 56, suggestedMax: 80 }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: function (items) { return fmtDate(pts[items[0].dataIndex].date, { weekday: true }); },
              label: function (item) { return pts[item.dataIndex].kg + " kg planned"; }
            }
          }
        }
      }
    });
  }

  /* ----- gym ----- */

  function renderGym() {
    var G = DATA.gym;
    var box = document.getElementById("gym-body");
    var h = '<div class="card"><h2>Gym log</h2>' +
      '<p class="muted">' + esc(G.schedule_note || "") + "</p>" +
      '<p class="muted">Each logged session records, per exercise: <strong>weight (kg)</strong>, <strong>reps</strong>, <strong>sets</strong> and <strong>RIR</strong> (reps in reserve). Entries appear here only once Simon logs them \u2014 nothing on this page is estimated.</p></div>';

    if (!G.sessions || !G.sessions.length) {
      h += '<div class="card"><div class="empty-state"><div class="big">Not logged yet</div>' +
        "<p>No gym sessions have been logged so far. Once logging starts, each session will appear below in this format:</p></div>" +
        '<div class="table-wrap" style="margin-top:12px"><table><thead><tr>' +
        "<th>Exercise</th><th class=\"num\">Weight (kg)</th><th class=\"num\">Reps</th><th class=\"num\">Sets</th><th class=\"num\">RIR</th>" +
        '</tr></thead><tbody><tr><td colspan="5" class="muted" style="text-align:center">\u2014 no entries yet \u2014</td></tr></tbody></table></div></div>';
    } else {
      G.sessions.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).forEach(function (s) {
        h += '<div class="card" style="margin-top:12px"><h3>' + fmtDate(s.date, { weekday: true }) +
          (s.day ? " \u00b7 Gym " + esc(s.day) : "") + "</h3>" +
          '<div class="table-wrap"><table><thead><tr><th>Exercise</th><th class="num">Weight (kg)</th><th class="num">Reps</th><th class="num">Sets</th><th class="num">RIR</th></tr></thead><tbody>';
        (s.entries || []).forEach(function (e) {
          h += "<tr><td>" + esc(e.exercise) + '</td><td class="num">' + esc(e.weight_kg) + '</td><td class="num">' +
            esc(e.reps) + '</td><td class="num">' + esc(e.sets) + '</td><td class="num">' + esc(e.rir) + "</td></tr>";
        });
        h += "</tbody></table></div></div>";
      });
    }
    box.innerHTML = h;
  }

  /* ---------- boot ---------- */

  function fetchJSON(url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error(url + ": " + r.status); return r.json(); }); }
  function fetchText(url) { return fetch(url).then(function (r) { if (!r.ok) throw new Error(url + ": " + r.status); return r.text(); }); }

  Promise.all([
    fetchJSON("data/site.json"),
    fetchText("data/sessions.csv"),
    fetchJSON("data/phases.json"),
    fetchJSON("data/races.json"),
    fetchJSON("data/predictions.json"),
    fetchJSON("data/gym-log.json")
  ]).then(function (res) {
    DATA.site = res[0];
    DATA.sessions = parseCSV(res[1]);
    DATA.phases = res[2];
    DATA.races = res[3];
    DATA.predictions = res[4];
    DATA.gym = res[5];

    state.todayISO = todayInJohannesburg();
    buildIndexes();
    state.weekIdx = weekIndexFor(state.todayISO);
    state.monthIdx = monthIndexFor(state.todayISO);

    setupPlanControls();
    renderOverview();
    renderPlan();
    renderPhases();
    renderRaces();
    renderPredictions();
    renderGym();

    window.addEventListener("hashchange", showTab);
    showTab();
  }).catch(function (err) {
    var e = document.getElementById("load-error");
    e.hidden = false;
    e.textContent = "Could not load the plan data (" + err.message + "). If you opened index.html directly from disk, serve the folder over HTTP instead, e.g. `python3 -m http.server`.";
  });
})();
