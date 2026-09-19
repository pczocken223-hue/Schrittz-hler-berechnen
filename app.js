/* Tabak-Tracker – App-Logik
   Alle Daten liegen im localStorage dieses Browsers:
   „tabakTrackerEntries“ (Tabak- und Hülsen-Käufe) und „tabakTrackerSettings“ (Personen, Gramm pro Zigarette). */
(() => {
  'use strict';

  const KEY = 'tabakTrackerEntries';
  const SETTINGS_KEY = 'tabakTrackerSettings';
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  const MONTHS_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
  const RING_C = 2 * Math.PI * 102;
  const DAYS_PER_MONTH = 30.44;
  const TABS = ['overview', 'entries'];

  const $ = (id) => document.getElementById(id);

  /* ---------- Hilfsfunktionen ---------- */

  const pad = (n) => String(n).padStart(2, '0');
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

  // Alle Datumsfunktionen arbeiten mit lokalen Kalendertagen (kein UTC-Versatz).
  const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const monthKeyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const todayISO = () => isoOf(new Date());
  const parseISO = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d, 12);
  };
  const daysBetween = (a, b) => Math.round((parseISO(b) - parseISO(a)) / 86400000);
  const addDays = (iso, n) => {
    const d = parseISO(iso);
    d.setDate(d.getDate() + n);
    return isoOf(d);
  };
  const monthKey = (iso) => iso.slice(0, 7);
  const fmtDate = (iso) => {
    const [y, m, d] = iso.split('-');
    return `${d}.${m}.${y}`;
  };
  const fmtLong = (iso) => parseISO(iso).toLocaleDateString('de-DE', {
    weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric'
  });
  const fmtNum = (n, digits = 1) => n.toLocaleString('de-DE', { maximumFractionDigits: digits });
  const fmtEUR = (n) => n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  const plural = (n, one, many) => (n === 1 ? one : many);
  const fmtGrams = (g) => (g >= 1000 ? `${fmtNum(g / 1000, g / 1000 >= 10 ? 1 : 2)} kg` : `${fmtNum(g, 0)} g`);
  const relDays = (n) => {
    if (n === 0) return 'heute';
    if (n === 1) return 'morgen';
    if (n === -1) return 'gestern';
    return n > 0 ? `in ${n} Tagen` : `vor ${-n} Tagen`;
  };
  const setText = (id, text) => { $(id).textContent = text; };

  /* ---------- Daten ---------- */

  const isValid = (x) => x && typeof x.date === 'string' && ISO.test(x.date) &&
    typeof x.qty === 'number' && isFinite(x.qty) && x.qty > 0;

  // kind: „tobacco“ (Tabak, in Büchsen, zählt für Zigaretten & Reichweite) oder
  // „sleeves“ (Hülsen, nur die Ausgaben fließen mit ein, nie in die Zigarettenzahl).
  const normalize = (x) => {
    const kind = x.kind === 'sleeves' ? 'sleeves' : 'tobacco';
    return {
      id: typeof x.id === 'string' && x.id ? x.id : uid(),
      date: x.date,
      kind,
      dateEnd: kind === 'tobacco' && typeof x.dateEnd === 'string' && ISO.test(x.dateEnd) ? x.dateEnd : null,
      qty: x.qty,
      grams: kind === 'tobacco' && typeof x.grams === 'number' && isFinite(x.grams) && x.grams > 0 ? x.grams : null,
      price: typeof x.price === 'number' && isFinite(x.price) && x.price >= 0 ? x.price : null,
      note: typeof x.note === 'string' ? x.note : ''
    };
  };

  const byDate = (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id);

  function loadEntries() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY));
      return Array.isArray(raw) ? raw.filter(isValid).map(normalize).sort(byDate) : [];
    } catch (e) {
      return [];
    }
  }

  let entries = loadEntries();

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(entries));
      return true;
    } catch (e) {
      toast('Speichern nicht möglich. Der Browser-Speicher ist voll oder gesperrt.');
      return false;
    }
  }

  /* ---------- Einstellungen ---------- */

  // persons: 1–20, gramsPerCig: Gramm Tabak pro Zigarette beim Stopfen
  const DEFAULT_GRAMS_PER_CIG = 0.8;
  const normSettings = (s) => {
    const p = Math.round(Number(s && s.persons));
    const g = Number(s && s.gramsPerCig);
    return {
      persons: isFinite(p) && p >= 1 ? Math.min(p, 20) : 1,
      gramsPerCig: isFinite(g) && g > 0 ? Math.round(g * 100) / 100 : DEFAULT_GRAMS_PER_CIG
    };
  };

  function loadSettings() {
    try {
      return normSettings(JSON.parse(localStorage.getItem(SETTINGS_KEY)));
    } catch (e) {
      return normSettings(null);
    }
  }

  let settings = loadSettings();

  function persistSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      return true;
    } catch (e) {
      toast('Speichern nicht möglich. Der Browser-Speicher ist voll oder gesperrt.');
      return false;
    }
  }

  /* ---------- Kennzahlen ---------- */

  function compute() {
    const today = todayISO();
    const now = new Date();
    const curKey = monthKeyOf(now);
    const prevKey = monthKeyOf(new Date(now.getFullYear(), now.getMonth() - 1, 1));

    // Reichweite, nächster Kauf, Verlauf und Zigaretten betreffen nur Tabak-Käufe;
    // Hülsen-Käufe fließen unten nur in die Ausgaben (cost/yearCost) mit ein.
    const tobacco = entries.filter((e) => e.kind === 'tobacco');
    const qtyOf = (key) => tobacco.filter((e) => monthKey(e.date) === key).reduce((s, e) => s + e.qty, 0);
    const gramsOf = (key) => tobacco
      .filter((e) => monthKey(e.date) === key && e.grams !== null)
      .reduce((s, e) => s + e.qty * e.grams, 0);
    const gramsMissingOf = (key) => tobacco
      .filter((e) => monthKey(e.date) === key && e.grams === null).length;
    const totalGrams = tobacco
      .filter((e) => e.grams !== null)
      .reduce((s, e) => s + e.qty * e.grams, 0);
    const totalGramsMissing = tobacco.filter((e) => e.grams === null).length;

    // Ausgaben im laufenden Kalenderjahr (Tabak + Hülsen)
    const year = String(now.getFullYear());
    const yearEntries = entries.filter((e) => e.date.startsWith(year));
    const yearPriced = yearEntries.filter((e) => e.price !== null);

    const c = {
      count: tobacco.length, today, monthQty: qtyOf(curKey), prevQty: qtyOf(prevKey),
      monthGrams: gramsOf(curKey), monthGramsMissing: gramsMissingOf(curKey),
      totalGrams, totalGramsMissing,
      year, yearCount: yearEntries.length, yearPricedCount: yearPriced.length,
      yearCost: yearPriced.reduce((s, e) => s + e.price * e.qty, 0)
    };
    if (!tobacco.length) return c;

    const first = tobacco[0];
    const last = tobacco[tobacco.length - 1];
    const total = tobacco.reduce((s, e) => s + e.qty, 0);
    const spanMonths = Math.max(daysBetween(first.date, today) / DAYS_PER_MONTH, 1);

    // Reichweite pro Büchse: bevorzugt aus Einträgen mit "Aufgebraucht am"
    const withEnd = tobacco.filter((e) => e.dateEnd);
    let daysPerBox = null;
    let dpbSource = 'none';
    if (withEnd.length) {
      const days = withEnd.reduce((s, e) => s + daysBetween(e.date, e.dateEnd), 0);
      const qty = withEnd.reduce((s, e) => s + e.qty, 0);
      if (qty > 0) { daysPerBox = days / qty; dpbSource = 'end'; }
    } else if (tobacco.length >= 2) {
      // Alles außer dem letzten Kauf ist bis zum letzten Kauf verbraucht worden.
      const used = total - last.qty;
      const days = daysBetween(first.date, last.date);
      if (used > 0 && days > 0) { daysPerBox = days / used; dpbSource = 'gaps'; }
    }

    // Nächster Kauf
    let next = null;
    let nextFromEnd = false;
    if (last.dateEnd) {
      next = last.dateEnd;
      nextFromEnd = true;
    } else if (daysPerBox) {
      next = addDays(last.date, Math.round(daysPerBox * last.qty));
    }

    // Ausgaben im Monatsschnitt: Tabak- UND Hülsen-Käufe mit Preis
    const priced = entries.filter((e) => e.price !== null);
    const cost = priced.reduce((s, e) => s + e.price * e.qty, 0);

    return Object.assign(c, {
      first, last, total, spanMonths, daysPerBox, dpbSource, withEndCount: withEnd.length,
      next, nextFromEnd, pricedCount: priced.length, cost
    });
  }

  /* ---------- Darstellung: Übersicht ---------- */

  function renderHero(c) {
    const ring = $('ringProgress');
    ring.style.strokeDasharray = String(RING_C);
    const setRing = (pct, late) => {
      ring.classList.toggle('late', !!late);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        ring.style.strokeDashoffset = String(RING_C * (1 - Math.max(0, Math.min(1, pct))));
      }));
    };
    const sub = $('heroSub');
    sub.classList.remove('muted');

    if (!c.count) {
      setRing(0);
      setText('ringNum', '–');
      setText('ringUnit', 'noch kein Kauf');
      sub.textContent = 'Trage deinen ersten Kauf ein, dann schätzt die App den nächsten.';
      sub.classList.add('muted');
      return;
    }
    if (!c.next) {
      setRing(0);
      setText('ringNum', '–');
      setText('ringUnit', 'keine Schätzung');
      sub.textContent = 'Für eine Schätzung braucht es einen zweiten Kauf oder ein „Aufgebraucht am“-Datum.';
      sub.classList.add('muted');
      return;
    }

    const left = daysBetween(c.today, c.next);
    const span = daysBetween(c.last.date, c.next);
    const elapsed = daysBetween(c.last.date, c.today);
    const label = c.nextFromEnd ? 'Aufgebraucht am' : 'Voraussichtlich';
    sub.textContent = `${label} ${fmtLong(c.next)}`;

    if (left < 0) {
      setRing(1, true);
      setText('ringNum', String(-left));
      setText('ringUnit', plural(-left, 'Tag überfällig', 'Tage überfällig'));
    } else if (left === 0) {
      setRing(1, true);
      setText('ringNum', '0');
      setText('ringUnit', 'heute fällig');
    } else {
      setRing(span > 0 ? Math.max(elapsed / span, 0.02) : 1, false);
      setText('ringNum', String(left));
      setText('ringUnit', `${plural(left, 'Tag', 'Tage')} bis zum nächsten Kauf`);
    }
  }

  function renderMonth(c) {
    setText('monthName', new Date().toLocaleDateString('de-DE', { month: 'long', year: 'numeric' }));
    setText('s-month', fmtNum(c.monthQty));
    setText('s-month-unit', plural(c.monthQty, 'Büchse', 'Büchsen'));

    const delta = $('monthDelta');
    if (c.count && (c.monthQty > 0 || c.prevQty > 0)) {
      const diff = c.monthQty - c.prevQty;
      delta.hidden = false;
      delta.classList.remove('up', 'down');
      if (diff === 0) {
        delta.textContent = 'wie im Vormonat';
      } else {
        delta.classList.add(diff > 0 ? 'up' : 'down');
        delta.textContent = `${diff > 0 ? '+' : '−'}${fmtNum(Math.abs(diff))} zum Vormonat`;
      }
    } else {
      delta.hidden = true;
    }

    const pips = $('pips');
    pips.innerHTML = '';
    const whole = Math.min(Math.floor(c.monthQty), 30);
    for (let i = 0; i < whole; i++) pips.appendChild(Object.assign(document.createElement('span'), { className: 'pip' }));
    if (c.monthQty % 1 !== 0 && whole < 30) {
      pips.appendChild(Object.assign(document.createElement('span'), { className: 'pip half' }));
    }
  }

  // Zigaretten pro Monat / pro Tag – ganz normal aus der Grammzahl der Tabak-Käufe
  // diesen Monat, geteilt durch die eingestellten Gramm pro Zigarette (Stopfen).
  function renderCigarettes(c) {
    const dash = '–';
    if (!c.monthGrams) {
      setText('s-cig-month', dash);
      setText('s-cig-day', dash);
      setText('s-cig-sub', 'Trage bei einem Tabak-Kauf „Gramm pro Büchse“ ein, dann berechnet die App die Zigaretten.');
      return;
    }
    const month = c.monthGrams / settings.gramsPerCig;
    const day = month / DAYS_PER_MONTH;
    setText('s-cig-month', fmtNum(month, 0));
    setText('s-cig-day', fmtNum(day, 1));
    const p = settings.persons;
    setText('s-cig-sub', p > 1
      ? `Pro Person: ${fmtNum(month / p, 0)} im Monat, ${fmtNum(day / p, 1)} am Tag (${p} Personen)`
      : '');
  }

  // Gesamtverbrauch: Summe aller Gramm-Angaben über alle Tabak-Käufe hinweg
  function renderTotalUsed(c) {
    const dash = '–';
    if (!c.totalGrams) {
      setText('s-totalused', dash);
      setText('s-totalused-sub', 'Trage bei deinen Tabak-Käufen „Gramm pro Büchse“ ein, dann summiert die App den Verbrauch.');
      return;
    }
    setText('s-totalused', fmtGrams(c.totalGrams));
    setText('s-totalused-sub', c.totalGramsMissing
      ? `${c.totalGramsMissing} ${plural(c.totalGramsMissing, 'Kauf', 'Käufe')} ohne Gramm-Angabe nicht mitgezählt`
      : 'seit dem ersten Eintrag mit Gramm-Angabe');
  }

  function renderStats(c) {
    const dash = '–';

    // Reichweite pro Büchse und Ausgaben pro Monat
    if (!c.count) {
      ['s-dpb', 's-costm'].forEach((id) => setText(id, dash));
      ['s-dpb-sub', 's-costm-sub'].forEach((id) => setText(id, ''));
    } else {
      if (c.daysPerBox !== null) {
        setText('s-dpb', `${fmtNum(c.daysPerBox)} ${plural(c.daysPerBox, 'Tag', 'Tage')}`);
        setText('s-dpb-sub', c.dpbSource === 'end'
          ? `aus ${c.withEndCount} ${plural(c.withEndCount, 'Eintrag', 'Einträgen')} mit „Aufgebraucht am“`
          : 'geschätzt aus den Abständen deiner Käufe');
      } else {
        setText('s-dpb', dash);
        setText('s-dpb-sub', 'Dafür braucht es mindestens zwei Käufe.');
      }

      if (c.pricedCount) {
        setText('s-costm', fmtEUR(c.cost / c.spanMonths));
        setText('s-costm-sub', 'im Monatsschnitt');
      } else {
        setText('s-costm', dash);
        setText('s-costm-sub', 'Trage bei einem Kauf den Preis ein.');
      }
    }

    // Ausgaben im ganzen (laufenden) Jahr
    if (c.yearPricedCount) {
      const missing = c.yearCount - c.yearPricedCount;
      setText('s-costy', fmtEUR(c.yearCost));
      setText('s-costy-sub', `Kalenderjahr ${c.year}` + (missing
        ? `, ${missing} ${plural(missing, 'Eintrag', 'Einträge')} ohne Preis`
        : ''));
    } else {
      setText('s-costy', dash);
      setText('s-costy-sub', c.yearCount
        ? `Für ${c.year} ist noch kein Preis eingetragen.`
        : `Noch kein Kauf in ${c.year}.`);
    }

    renderCigarettes(c);
    renderTotalUsed(c);
  }

  function renderChart() {
    const box = $('chart');
    const tobacco = entries.filter((e) => e.kind === 'tobacco');
    if (!tobacco.length) {
      box.innerHTML = '<svg viewBox="0 0 360 120"><text class="empty" x="180" y="64">Noch keine Daten für den Verlauf</text></svg>';
      return;
    }
    const now = new Date();
    const months = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: monthKeyOf(d), label: MONTHS_SHORT[d.getMonth()], now: i === 0 });
    }
    months.forEach((m) => {
      m.sum = tobacco.filter((e) => monthKey(e.date) === m.key).reduce((s, e) => s + e.qty, 0);
    });

    const W = 360, H = 200, top = 26, bottom = 28;
    const plotH = H - top - bottom;
    const max = Math.max(...months.map((m) => m.sum), 1);
    const slot = W / months.length;
    const bw = slot * 0.62;

    let svg = `<svg viewBox="0 0 ${W} ${H}"><defs><linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">` +
      '<stop offset="0" stop-color="#f3d082"/><stop offset="1" stop-color="#c98f3c"/></linearGradient></defs>' +
      `<line class="axis" x1="0" y1="${H - bottom}" x2="${W}" y2="${H - bottom}"/>`;

    months.forEach((m, i) => {
      const x = i * slot + (slot - bw) / 2;
      const h = m.sum > 0 ? Math.max((m.sum / max) * plotH, 6) : 4;
      const y = H - bottom - h;
      const cls = m.sum > 0 ? (m.now ? 'bar now' : 'bar') : 'bar zero';
      svg += `<rect class="${cls}" x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="6"/>`;
      if (m.sum > 0) {
        svg += `<text class="lbl-v" x="${(x + bw / 2).toFixed(1)}" y="${(y - 7).toFixed(1)}">${fmtNum(m.sum)}</text>`;
      }
      svg += `<text class="lbl-m${m.now ? ' now' : ''}" x="${(x + bw / 2).toFixed(1)}" y="${H - 9}">${m.label}</text>`;
    });
    box.innerHTML = svg + '</svg>';
  }

  /* ---------- Darstellung: Einträge (nach Jahr gruppiert) ---------- */

  const openYears = new Set();
  let yearsInitialised = false;
  let openEntryId = null;

  function rowHtml(e, today) {
    const isTobacco = e.kind === 'tobacco';
    const unit = isTobacco ? plural(e.qty, 'Büchse', 'Büchsen') : plural(e.qty, 'Packung', 'Packungen');
    const dur = e.dateEnd ? daysBetween(e.date, e.dateEnd) : null;
    const rel = relDays(daysBetween(today, e.date));
    const isOpen = e.id === openEntryId;

    const meta = [];
    if (isTobacco) {
      meta.push(`<div><span>Aufgebraucht am</span><b>${e.dateEnd ? fmtDate(e.dateEnd) : '–'}</b></div>`);
      meta.push(`<div><span>Dauer</span><b>${dur !== null ? `${dur} ${plural(dur, 'Tag', 'Tage')}` : '–'}</b></div>`);
      meta.push(`<div><span>Gramm pro Büchse</span><b>${e.grams !== null ? `${fmtNum(e.grams, 0)} g` : '–'}</b></div>`);
    }
    meta.push(`<div><span>Preis pro ${isTobacco ? 'Büchse' : 'Packung'}</span><b>${e.price !== null ? fmtEUR(e.price) : '–'}</b></div>`);
    meta.push(`<div><span>Gesamt</span><b>${e.price !== null ? fmtEUR(e.price * e.qty) : '–'}</b></div>`);

    return `<div class="row${isOpen ? ' open' : ''}" data-id="${esc(e.id)}">
      <button type="button" class="row-head" data-act="toggle" aria-expanded="${isOpen}">
        <span class="row-main">
          <span class="row-date">${fmtDate(e.date)}</span>
          <span class="row-rel">${rel}${isTobacco ? '' : ' · Hülsen'}</span>
        </span>
        <span class="row-qty">${fmtNum(e.qty)} ${unit}</span>
        <svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      <div class="row-body"${isOpen ? '' : ' hidden'}>
        <div class="entry-meta">
          ${meta.join('')}
        </div>
        ${e.note ? `<p class="entry-note">${esc(e.note)}</p>` : ''}
        <div class="entry-actions">
          <button type="button" data-act="edit">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16v4z"/></svg>Bearbeiten
          </button>
          <button type="button" class="del" data-act="del">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>Löschen
          </button>
        </div>
      </div>
    </div>`;
  }

  function renderEntries(c) {
    const list = $('entryList');
    setText('entryCount', entries.length ? `${entries.length} ${plural(entries.length, 'Eintrag', 'Einträge')}` : '');

    if (!entries.length) {
      list.innerHTML = '<div class="card empty-card"><b>Noch keine Einträge</b>' +
        '<p>Tippe unten auf „Neuer Eintrag“ und trage deinen ersten Kauf ein.</p></div>';
      return;
    }

    // Neueste zuerst, gruppiert nach Kaufjahr
    const groups = new Map();
    [...entries].reverse().forEach((e) => {
      const y = e.date.slice(0, 4);
      if (!groups.has(y)) groups.set(y, []);
      groups.get(y).push(e);
    });

    // Beim ersten Anzeigen ist nur das neueste Jahr aufgeklappt
    if (!yearsInitialised) {
      openYears.add(groups.keys().next().value);
      yearsInitialised = true;
    }

    list.innerHTML = [...groups].map(([year, items]) => {
      const tSum = items.filter((e) => e.kind === 'tobacco').reduce((s, e) => s + e.qty, 0);
      const sCount = items.filter((e) => e.kind === 'sleeves').length;
      const parts = [
        `${items.length} ${plural(items.length, 'Eintrag', 'Einträge')}`,
        `${fmtNum(tSum)} ${plural(tSum, 'Büchse', 'Büchsen')}`
      ];
      if (sCount) parts.push(`${sCount} ${plural(sCount, 'Hülsen-Kauf', 'Hülsen-Käufe')}`);
      return `<details class="card year" data-year="${year}"${openYears.has(year) ? ' open' : ''}>
        <summary>
          <div>
            <div class="year-name">${year}</div>
            <div class="year-sum">${parts.join(', ')}</div>
          </div>
          <svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
        </summary>
        <div class="rows">${items.map((e) => rowHtml(e, c.today)).join('')}</div>
      </details>`;
    }).join('');
  }

  function render() {
    const c = compute();
    renderHero(c);
    renderMonth(c);
    renderStats(c);
    renderChart();
    renderEntries(c);
  }

  /* ---------- Bereiche: Umschalten und Wischen ---------- */

  let activeTab = 'overview';

  function setTab(name, opts = {}) {
    if (name === activeTab || !TABS.includes(name)) return;
    const from = activeTab;
    activeTab = name;
    $('tabs').dataset.active = name;
    TABS.forEach((t) => {
      const selected = t === name;
      const tab = $(`tab-${t}`);
      const page = $(`page-${t}`);
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
      page.hidden = !selected;
      page.classList.remove('enter-right', 'enter-left');
      if (selected && from !== name) {
        void page.offsetWidth; // Animation neu starten
        page.classList.add(name === 'entries' ? 'enter-right' : 'enter-left');
      }
    });
    window.scrollTo(0, 0);
    if (opts.focus) $(`tab-${name}`).focus();
  }

  TABS.forEach((t) => $(`tab-${t}`).addEventListener('click', () => setTab(t)));

  $('tabs').addEventListener('keydown', (ev) => {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    ev.preventDefault();
    setTab(ev.key === 'ArrowRight' ? 'entries' : 'overview', { focus: true });
  });

  // Wischen: eine deutlich waagerechte Bewegung wechselt in den anderen Bereich.
  let swipe = null;
  const pagesEl = $('pages');
  pagesEl.addEventListener('touchstart', (ev) => {
    const blocked = ev.touches.length !== 1 || document.querySelector('dialog[open]') ||
      ev.target.closest('input, textarea, select');
    if (blocked) { swipe = null; return; }
    swipe = { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
  }, { passive: true });
  pagesEl.addEventListener('touchcancel', () => { swipe = null; }, { passive: true });
  pagesEl.addEventListener('touchend', (ev) => {
    if (!swipe) return;
    const t = ev.changedTouches[0];
    const dx = t.clientX - swipe.x;
    const dy = t.clientY - swipe.y;
    swipe = null;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.6) return;
    setTab(activeTab === 'overview' ? 'entries' : 'overview');
  }, { passive: true });

  /* ---------- Toast & Dialoge ---------- */

  let toastTimer;
  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }

  function openDialog(dlg) {
    if (!dlg.open) dlg.showModal();
    document.body.classList.add('locked');
  }

  document.querySelectorAll('dialog').forEach((dlg) => {
    dlg.addEventListener('click', (ev) => { if (ev.target === dlg) dlg.close(); });
    dlg.addEventListener('close', () => {
      if (!document.querySelector('dialog[open]')) document.body.classList.remove('locked');
    });
  });
  document.querySelectorAll('[data-close]').forEach((btn) => {
    btn.addEventListener('click', () => btn.closest('dialog').close());
  });

  // Auswahl-Dialog: liefert den Wert des gedrückten Knopfs, bei Abbruch null.
  function choose({ title, text, actions }) {
    return new Promise((resolve) => {
      const dlg = $('confirmDialog');
      setText('confirmTitle', title);
      setText('confirmText', text);
      const wrap = $('confirmActions');
      wrap.innerHTML = '';
      let result = null;
      actions.forEach((a) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `btn ${a.kind || 'ghost'}`;
        b.textContent = a.label;
        b.addEventListener('click', () => { result = a.value; dlg.close(); });
        wrap.appendChild(b);
      });
      dlg.addEventListener('close', () => resolve(result), { once: true });
      openDialog(dlg);
    });
  }

  /* ---------- Einstellungen: Personen und Gramm pro Zigarette ---------- */

  const persInput = $('f-persons');
  const gcigInput = $('f-gcig');

  function syncSettingsUI() {
    persInput.value = String(settings.persons);
    if (gcigInput) gcigInput.value = String(settings.gramsPerCig);
  }

  function commitSettings() {
    settings = normSettings({
      persons: parseInt(persInput.value, 10),
      gramsPerCig: gcigInput && gcigInput.value !== '' ? parseFloat(gcigInput.value) : null
    });
    persistSettings();
    render();
  }

  persInput.addEventListener('input', commitSettings);
  persInput.addEventListener('change', () => { commitSettings(); syncSettingsUI(); });
  if (gcigInput) {
    gcigInput.addEventListener('input', commitSettings);
    gcigInput.addEventListener('change', () => { commitSettings(); syncSettingsUI(); });
  }

  function stepPersons(delta) {
    const cur = parseInt(persInput.value, 10);
    persInput.value = String(Math.max(1, Math.min(20, (isFinite(cur) ? cur : 1) + delta)));
    commitSettings();
    syncSettingsUI();
  }
  $('personsMinus').addEventListener('click', () => stepPersons(-1));
  $('personsPlus').addEventListener('click', () => stepPersons(1));

  /* ---------- Eintrag anlegen / bearbeiten ---------- */

  let editingId = null;
  let currentKind = 'tobacco';
  const f = {
    date: $('f-date'), end: $('f-end'), qty: $('f-qty'), grams: $('f-grams'),
    price: $('f-price'), note: $('f-note')
  };
  const kindSwitch = $('kindSwitch');
  const gramsField = $('gramsField');
  const endField = $('endField');
  const qtyLabel = $('f-qty-label');
  const priceLabel = $('f-price-label');

  function setKind(kind) {
    currentKind = kind;
    const isTobacco = kind === 'tobacco';
    if (kindSwitch) {
      kindSwitch.querySelectorAll('.kind-btn').forEach((b) => {
        const active = b.dataset.kind === kind;
        b.classList.toggle('active', active);
        b.setAttribute('aria-pressed', String(active));
      });
    }
    if (gramsField) gramsField.hidden = !isTobacco;
    if (endField) endField.hidden = !isTobacco;
    if (qtyLabel) qtyLabel.textContent = isTobacco ? 'Anzahl Büchsen' : 'Anzahl Packungen';
    if (priceLabel) priceLabel.textContent = isTobacco ? 'Preis pro Büchse in €' : 'Preis pro Packung in €';
    f.qty.min = isTobacco ? '0.5' : '1';
    f.qty.step = isTobacco ? '0.5' : '1';
  }

  if (kindSwitch) {
    kindSwitch.addEventListener('click', (ev) => {
      const btn = ev.target.closest('.kind-btn');
      if (!btn || editingId !== null || btn.dataset.kind === currentKind) return;
      setKind(btn.dataset.kind);
      f.qty.value = '1';
      if (f.grams) f.grams.value = '';
      if (f.end) f.end.value = '';
    });
  }

  function openEntry(id) {
    editingId = id || null;
    const e = id ? entries.find((x) => x.id === id) : null;
    setText('entryTitle', e ? 'Eintrag bearbeiten' : 'Neuer Eintrag');
    setKind(e ? e.kind : 'tobacco');
    if (kindSwitch) kindSwitch.classList.toggle('disabled', !!e);
    f.date.value = e ? e.date : todayISO();
    if (f.end) f.end.value = e && e.dateEnd ? e.dateEnd : '';
    f.qty.value = e ? e.qty : 1;
    if (f.grams) f.grams.value = e && e.grams !== null ? e.grams : '';
    f.price.value = e && e.price !== null ? e.price : '';
    f.note.value = e ? e.note : '';
    setText('formError', '');
    openDialog($('entryDialog'));
  }

  function stepQty(sign) {
    const step = parseFloat(f.qty.step) || 0.5;
    const min = parseFloat(f.qty.min) || 0.5;
    const cur = parseFloat(f.qty.value);
    const next = Math.max(min, (isFinite(cur) ? cur : 0) + sign * step);
    f.qty.value = String(Math.round(next / step) * step);
  }

  $('qtyMinus').addEventListener('click', () => stepQty(-1));
  $('qtyPlus').addEventListener('click', () => stepQty(1));

  $('entryForm').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const kind = currentKind;
    const date = f.date.value;
    const dateEnd = kind === 'tobacco' ? ((f.end && f.end.value) || null) : null;
    const qty = parseFloat(f.qty.value);
    const grams = kind === 'tobacco' && f.grams && f.grams.value !== '' ? parseFloat(f.grams.value) : null;
    const price = f.price.value !== '' ? parseFloat(f.price.value) : null;
    const note = f.note.value.trim();
    const fail = (msg) => setText('formError', msg);

    if (!date) return fail('Bitte gib ein Kaufdatum an.');
    if (!isFinite(qty) || qty <= 0) {
      return fail(kind === 'tobacco'
        ? 'Bitte gib eine Anzahl größer als 0 an.'
        : 'Bitte gib eine Anzahl Packungen größer als 0 an.');
    }
    if (dateEnd && dateEnd < date) return fail('„Aufgebraucht am“ darf nicht vor dem Kaufdatum liegen.');
    if (grams !== null && (!isFinite(grams) || grams <= 0)) return fail('Bitte gib eine gültige Grammzahl an.');
    if (price !== null && (!isFinite(price) || price < 0)) return fail('Bitte gib einen gültigen Preis an.');

    const entry = { id: editingId || uid(), date, kind, dateEnd, qty, grams, price, note };
    const wasEdit = editingId !== null;
    if (wasEdit) {
      entries = entries.map((e) => (e.id === editingId ? entry : e));
    } else {
      entries.push(entry);
    }
    entries.sort(byDate);
    if (!persist()) return;
    // Das Jahr des Eintrags aufklappen, damit man ihn sofort sieht.
    openYears.add(date.slice(0, 4));
    $('entryDialog').close();
    render();
    toast(wasEdit ? 'Änderungen gespeichert' : 'Eintrag gespeichert');
  });

  $('addBtn').addEventListener('click', () => openEntry(null));

  // Jahre auf- und zuklappen (merkt sich, welche offen sind)
  $('entryList').addEventListener('toggle', (ev) => {
    const det = ev.target;
    if (!det.matches || !det.matches('details.year')) return;
    if (det.open) openYears.add(det.dataset.year); else openYears.delete(det.dataset.year);
  }, true);

  $('entryList').addEventListener('click', async (ev) => {
    const btn = ev.target.closest('button[data-act]');
    if (!btn) return;
    const row = btn.closest('.row');
    const id = row.dataset.id;

    if (btn.dataset.act === 'toggle') {
      const willOpen = id !== openEntryId;
      document.querySelectorAll('#entryList .row.open').forEach((r) => {
        r.classList.remove('open');
        r.querySelector('.row-body').hidden = true;
        r.querySelector('.row-head').setAttribute('aria-expanded', 'false');
      });
      if (willOpen) {
        row.classList.add('open');
        row.querySelector('.row-body').hidden = false;
        btn.setAttribute('aria-expanded', 'true');
        openEntryId = id;
      } else {
        openEntryId = null;
      }
    } else if (btn.dataset.act === 'edit') {
      openEntry(id);
    } else {
      const e = entries.find((x) => x.id === id);
      const answer = await choose({
        title: 'Eintrag löschen?',
        text: e ? `Der Kauf vom ${fmtDate(e.date)} wird entfernt.` : 'Der Eintrag wird entfernt.',
        actions: [
          { label: 'Löschen', value: 'yes', kind: 'danger' },
          { label: 'Abbrechen', value: 'no', kind: 'ghost' }
        ]
      });
      if (answer === 'yes') {
        entries = entries.filter((x) => x.id !== id);
        if (openEntryId === id) openEntryId = null;
        persist();
        render();
        toast('Eintrag gelöscht');
      }
    }
  });

  /* ---------- Sicherung: speichern, laden, löschen ---------- */

  async function exportEntries() {
    if (!entries.length) { toast('Es gibt noch keine Einträge zum Sichern.'); return; }
    const data = {
      app: 'tabak-tracker',
      version: 2,
      entries: entries.map(({ date, kind, dateEnd, qty, grams, price, note }) =>
        ({ date, kind, dateEnd, qty, grams, price, note })),
      settings: { persons: settings.persons, gramsPerCig: settings.gramsPerCig }
    };
    const json = JSON.stringify(data, null, 2);
    const name = `tabak-tracker-${todayISO()}.json`;

    // Auf dem Handy über das Teilen-Menü, sonst als Download.
    try {
      const file = new File([json], name, { type: 'application/json' });
      if (matchMedia('(pointer: coarse)').matches && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Tabak-Tracker Sicherung' });
        return;
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Sicherung gespeichert');
  }

  function importEntries(file) {
    const reader = new FileReader();
    reader.onerror = () => toast('Die Datei konnte nicht gelesen werden.');
    reader.onload = async (ev) => {
      let data;
      try { data = JSON.parse(ev.target.result); } catch (e) { data = null; }

      // Alte Sicherungen sind eine reine Liste, neue enthalten Einträge und Einstellungen.
      let list = null;
      let importedSettings = null;
      if (Array.isArray(data)) {
        list = data;
      } else if (data && Array.isArray(data.entries)) {
        list = data.entries;
        if (data.settings) importedSettings = normSettings(data.settings);
      }
      if (!list) {
        toast('Das ist keine Sicherung des Tabak-Trackers.');
        return;
      }
      const valid = list.filter(isValid).map(normalize);
      if (!valid.length) { toast('Die Datei enthält keine gültigen Einträge.'); return; }

      const mode = await choose({
        title: `${valid.length} ${plural(valid.length, 'Eintrag', 'Einträge')} gefunden`,
        text: 'Sollen sie zu deinen bestehenden Einträgen hinzugefügt werden oder sie ersetzen?',
        actions: [
          { label: 'Hinzufügen', value: 'add', kind: 'primary' },
          { label: 'Ersetzen', value: 'replace', kind: 'soft' },
          { label: 'Abbrechen', value: null, kind: 'ghost' }
        ]
      });
      if (!mode) return;

      if (mode === 'replace') {
        entries = valid;
        if (importedSettings) { settings = importedSettings; persistSettings(); syncSettingsUI(); }
      } else {
        valid.forEach((v) => {
          const exists = entries.some((e) => e.date === v.date && e.qty === v.qty && e.kind === v.kind &&
            (e.dateEnd || null) === (v.dateEnd || null) && (e.grams || null) === (v.grams || null) &&
            e.note === v.note);
          if (!exists) entries.push(v);
        });
        // Beim Hinzufügen bleiben deine Einstellungen unverändert.
      }
      entries.sort(byDate);
      if (!persist()) return;
      render();
      toast('Sicherung geladen');
    };
    reader.readAsText(file);
  }

  $('exportBtn').addEventListener('click', exportEntries);
  $('importBtn').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', (ev) => {
    const file = ev.target.files[0];
    if (file) importEntries(file);
    ev.target.value = '';
  });

  $('clearBtn').addEventListener('click', async () => {
    if (!entries.length) { toast('Es gibt nichts zu löschen.'); return; }
    const answer = await choose({
      title: 'Alle Einträge löschen?',
      text: 'Das lässt sich nicht rückgängig machen. Speichere vorher eine Sicherung, wenn du die Daten behalten willst.',
      actions: [
        { label: 'Alles löschen', value: 'yes', kind: 'danger' },
        { label: 'Abbrechen', value: 'no', kind: 'ghost' }
      ]
    });
    if (answer === 'yes') {
      entries = [];
      openEntryId = null;
      persist();
      render();
      toast('Alle Einträge gelöscht');
    }
  });

  /* ---------- Installation als App ---------- */

  let deferredPrompt = null;
  const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  function updateInstallUI() {
    const chip = $('installChip');
    const btn = $('installBtn');
    const help = $('installHelp');
    const status = $('installStatus');
    help.hidden = true;

    if (isStandalone()) {
      chip.hidden = true;
      btn.hidden = true;
      status.textContent = 'Die App ist installiert und läuft im Vollbild.';
    } else if (deferredPrompt) {
      chip.hidden = false;
      btn.hidden = false;
      status.textContent = 'Installiere den Tracker auf deinem Startbildschirm. Er startet dann im Vollbild und funktioniert auch ohne Internet.';
    } else if (isIOS()) {
      chip.hidden = false;
      btn.hidden = true;
      status.textContent = 'Auf dem iPhone installierst du die App in Safari:';
      help.innerHTML = '<ol><li>Tippe auf <b>Teilen</b>.</li><li>Wähle <b>Zum Home-Bildschirm</b>.</li><li>Tippe auf <b>Hinzufügen</b>.</li></ol>';
      help.hidden = false;
    } else {
      chip.hidden = true;
      btn.hidden = true;
      status.textContent = 'Öffne das Browsermenü und wähle „App installieren“ oder „Zum Startbildschirm hinzufügen“.';
    }
  }

  async function promptInstall() {
    if (!deferredPrompt) {
      // Anleitung steht im zweiten Bereich unter „Daten & App“.
      setTab('entries');
      $('installSection').scrollIntoView({ block: 'center' });
      return;
    }
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    updateInstallUI();
    if (outcome === 'accepted') toast('App wird installiert …');
  }

  window.addEventListener('beforeinstallprompt', (ev) => {
    ev.preventDefault();
    deferredPrompt = ev;
    updateInstallUI();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    updateInstallUI();
    toast('App installiert');
  });

  $('installChip').addEventListener('click', promptInstall);
  $('installBtn').addEventListener('click', promptInstall);

  /* ---------- Start ---------- */

  syncSettingsUI();
  updateInstallUI();
  if (entries.length) persist(); // vergibt IDs für alte Einträge dauerhaft
  render();

  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    const hadController = !!navigator.serviceWorker.controller;
    let reloaded = false;
    // Kommt eine neue Version der App, einmal neu laden (nicht mitten in einem Dialog).
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloaded || document.querySelector('dialog[open]')) return;
      reloaded = true;
      location.reload();
    });
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => { /* offline-Betrieb optional */ });
    });
  }
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(() => {});
  }
})();
