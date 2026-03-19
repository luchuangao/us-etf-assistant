const ranges = [
  { key: "1y", label: "1年" },
  { key: "5y", label: "5年" },
  { key: "10y", label: "10年" },
  { key: "max", label: "全部" }
];

const SYMBOLS = {
  SPY: { symbol: "SPY", label: "标普500 (SPY)" },
  QQQ: { symbol: "QQQ", label: "纳指100 (QQQ)" }
};

let state = {
  symbol: SYMBOLS.SPY.symbol,
  range: "10y",
  useLog: false,
  tab: "dca",
  dcaAmount: 1000,
  dcaStartYear: null,
  oppType: "dd",
  oppThresholdDd: -20,
  oppThresholdVix: 30
};

let lastSeries = null;
let lastVixSeries = null;
let lastMeta = null;
let lastVolume = null;
let lastOpen = null;
let lastHigh = null;
let lastLow = null;

function getEl(id) { return document.getElementById(id); }

function setStatus(text) {
  const el = getEl("dataStatus");
  if (el) el.textContent = text || "";
}

function loadState() {
  const s = localStorage.getItem("meigu_sidebar_state_v2");
  if (s) {
    try { state = { ...state, ...JSON.parse(s) }; } catch {}
  }
  // migrate old state
  if (state.oppThreshold !== undefined) {
    state.oppThresholdDd = state.oppThreshold;
    delete state.oppThreshold;
  }
  if (![SYMBOLS.SPY.symbol, SYMBOLS.QQQ.symbol].includes(state.symbol)) state.symbol = SYMBOLS.SPY.symbol;
  if (!["1y", "5y", "10y", "max"].includes(state.range)) state.range = "10y";
  if (!["dca", "dd", "opp"].includes(state.tab)) state.tab = "dca";
  if (typeof state.dcaAmount !== "number" || !Number.isFinite(state.dcaAmount) || state.dcaAmount < 0) state.dcaAmount = 1000;
  if (!state.oppType) state.oppType = "dd";
  if (typeof state.oppThresholdDd !== "number" || !Number.isFinite(state.oppThresholdDd)) state.oppThresholdDd = -20;
  if (typeof state.oppThresholdVix !== "number" || !Number.isFinite(state.oppThresholdVix)) state.oppThresholdVix = 30;
}

function saveState() {
  localStorage.setItem("meigu_sidebar_state_v2", JSON.stringify(state));
}

function renderRanges() {
  const wrap = getEl("ranges");
  wrap.innerHTML = "";
  ranges.forEach(r => {
    const b = document.createElement("button");
    b.textContent = r.label;
    b.className = r.key === state.range ? "active" : "";
    b.onclick = () => {
      state.range = r.key;
      saveState();
      refresh({ preferCache: true });
    };
    wrap.appendChild(b);
  });
}

function setActiveSymbol() {
  getEl("sym-spy").className = state.symbol === SYMBOLS.SPY.symbol ? "active" : "";
  getEl("sym-qqq").className = state.symbol === SYMBOLS.QQQ.symbol ? "active" : "";
}

function setActivePanel() {
  getEl("tab-dca").className = state.tab === "dca" ? "active" : "";
  getEl("tab-dd").className = state.tab === "dd" ? "active" : "";
  getEl("tab-opp").className = state.tab === "opp" ? "active" : "";
  getEl("panel-dca").style.display = state.tab === "dca" ? "" : "none";
  getEl("panel-dd").style.display = state.tab === "dd" ? "" : "none";
  getEl("panel-opp").style.display = state.tab === "opp" ? "" : "none";
}

function formatDate(ts) {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function lastNonNullValue(series) {
  if (!Array.isArray(series) || series.length === 0) return null;
  for (let i = series.length - 1; i >= 0; i--) {
    const v = series[i][1];
    if (v != null && Number.isFinite(v)) return v;
  }
  return null;
}

function compute52wHighLowFromClose(series) {
  const closes = (series || []).map(p => p[1]).filter(v => v != null && Number.isFinite(v));
  const slice = closes.length > 252 ? closes.slice(closes.length - 252) : closes;
  if (!slice.length) return { hi: null, lo: null };
  return { hi: Math.max(...slice), lo: Math.min(...slice) };
}

function renderFactsFromChart() {
  try {
    const safeSet = (id, text) => { const el = getEl(id); if (el) el.textContent = text; };
    const o = lastNonNullValue(typeof lastOpen !== 'undefined' ? lastOpen : null);
    const h = lastNonNullValue(typeof lastHigh !== 'undefined' ? lastHigh : null);
    const l = lastNonNullValue(typeof lastLow !== 'undefined' ? lastLow : null);
    const v = lastNonNullValue(typeof lastVolume !== 'undefined' ? lastVolume : null);
    const hl = compute52wHighLowFromClose(lastSeries);
    safeSet("open", o == null ? "--" : MeiguUtils.toFixed2(o));
    safeSet("high", h == null ? "--" : MeiguUtils.toFixed2(h));
    safeSet("low", l == null ? "--" : MeiguUtils.toFixed2(l));
    safeSet("volume", v == null ? "--" : MeiguUtils.formatNumber(v));
    safeSet("fiftyTwoWeekHigh", hl.hi == null ? "--" : MeiguUtils.toFixed2(hl.hi));
    safeSet("fiftyTwoWeekLow", hl.lo == null ? "--" : MeiguUtils.toFixed2(hl.lo));
  } catch (e) {
    console.error("renderFacts error:", e);
    getEl("open").textContent = "Err";
  }
}

function updateRangeChangeFromSeries() {
  const el = getEl("rangeChange");
  if (!el || !lastSeries || lastSeries.length < 2) return;
  const first = lastSeries.find(p => p[1] != null && Number.isFinite(p[1]));
  const last = [...lastSeries].reverse().find(p => p[1] != null && Number.isFinite(p[1]));
  if (!first || !last) return;
  const pct = first[1] === 0 ? 0 : (last[1] / first[1] - 1);
  const text = (pct >= 0 ? "+" : "") + (pct * 100).toFixed(2) + "% 过去" + (ranges.find(r => r.key === state.range)?.label || "");
  el.textContent = text;
  el.className = pct >= 0 ? "green" : "red";
}

function renderHeader(q) {
  const safeSet = (id, text) => { const el = getEl(id); if (el) el.textContent = text; };
  const safeClass = (id, cls) => { const el = getEl(id); if (el) el.className = cls; };
  safeSet("tickerTitle", q.shortName || q.symbol);
  safeSet("tickerMeta", q.currency ? q.currency : "");
  safeSet("price", MeiguUtils.toFixed2(q.regularMarketPrice));
  // 兼容新布局：优先 rangeChange，没有则回落到 change
  const changeText = MeiguUtils.formatChange(q.regularMarketChangePercent || 0);
  if (getEl("rangeChange")) {
    safeSet("rangeChange", changeText);
    safeClass("rangeChange", MeiguUtils.classByChange(q.regularMarketChangePercent || 0));
  } else if (getEl("change")) {
    safeSet("change", changeText);
    safeClass("change", MeiguUtils.classByChange(q.regularMarketChangePercent || 0));
  }
  // 底部事实表（若存在）
  safeSet("open", MeiguUtils.toFixed2(q.regularMarketOpen));
  safeSet("high", MeiguUtils.toFixed2(q.regularMarketDayHigh));
  safeSet("low", MeiguUtils.toFixed2(q.regularMarketDayLow));
  safeSet("volume", MeiguUtils.formatNumber(q.regularMarketVolume));
  safeSet("fiftyTwoWeekHigh", MeiguUtils.toFixed2(q.fiftyTwoWeekHigh));
  safeSet("fiftyTwoWeekLow", MeiguUtils.toFixed2(q.fiftyTwoWeekLow));
}

function renderChart(series) {
  const canvas = getEl("chartCanvas");
  MeiguUtils.drawAppleChartAnimated(canvas, series, { useLog: state.useLog, volume: lastVolume });
  // 固定信息条：显示末端日期与价格
  const fb = getEl("fixedbar");
  if (fb && series && series.length) {
    const last = series[series.length - 1];
    const dt = formatDate(last[0]);
    const val = MeiguUtils.toFixed2(last[1]);
    fb.innerHTML = `${dt} <span class="val">${val}</span>`;
  }
  updateRangeChangeFromSeries();
}

function showError(err) {
  const msg = (err && err.message) ? err.message : "未知错误";
  const titleEl = getEl("tickerTitle");
  if (titleEl) titleEl.textContent = "加载失败: " + msg;
  const fb = getEl("fixedbar");
  if (fb) fb.textContent = "错误: " + msg;
}

function cacheKeyChart(symbol, range) {
  return `meigu_cache_chart_${symbol}_${range}`;
}

function readCachedChart(symbol, range) {
  const raw = localStorage.getItem(cacheKeyChart(symbol, range));
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

function writeCachedChart(symbol, range, payload) {
  try { localStorage.setItem(cacheKeyChart(symbol, range), JSON.stringify(payload)); } catch {}
}

function fillDcaStartOptions(series) {
  try {
    const sel = getEl("dcaStart");
    if (!series || !series.length || !sel) return;
    const years = new Set(series.map(p => new Date(p[0]).getFullYear()));
    const arr = Array.from(years).sort((a, b) => a - b);
    sel.innerHTML = "";
    for (const y of arr) {
      const opt = document.createElement("option");
      opt.value = String(y);
      opt.textContent = String(y);
      sel.appendChild(opt);
    }
    if (!state.dcaStartYear || !arr.includes(state.dcaStartYear)) state.dcaStartYear = arr[Math.max(0, arr.length - 10)];
    sel.value = String(state.dcaStartYear);
  } catch (e) {
    console.error("fillDcaStartOptions error", e);
  }
}

function fillOppThresholdOptions() {
  const sel = getEl("oppThreshold");
  if (!sel) return;
  sel.innerHTML = "";
  if (state.oppType === "vix") {
    [20, 30, 40, 50, 60].forEach(v => {
      const opt = document.createElement("option");
      opt.value = String(v);
      opt.textContent = "> " + v;
      sel.appendChild(opt);
    });
    sel.value = String(state.oppThresholdVix);
  } else {
    [-10, -15, -20, -30, -40].forEach(v => {
      const opt = document.createElement("option");
      opt.value = String(v);
      opt.textContent = v + "%";
      sel.appendChild(opt);
    });
    sel.value = String(state.oppThresholdDd);
  }
}

function recomputeAll() {
  try {
    if (!lastSeries || lastSeries.length < 10) return;
    const dcaAmountEl = getEl("dcaAmount");
    const dcaStartEl = getEl("dcaStart");
    const oppTypeEl = getEl("oppType");
    if (dcaAmountEl) dcaAmountEl.value = String(state.dcaAmount);
    if (dcaStartEl && state.dcaStartYear) dcaStartEl.value = String(state.dcaStartYear);
    if (oppTypeEl) oppTypeEl.value = state.oppType;
    fillOppThresholdOptions();
    
    runDca();
    renderYearlyDrawdowns();
    runOpportunity();
  } catch (e) {
    console.error("recomputeAll error", e);
    setStatus("分析出错");
  }
}

function xnpv(rate, flows) {
  const d0 = flows[0].date.getTime();
  let total = 0;
  for (const f of flows) {
    const days = (f.date.getTime() - d0) / (1000 * 60 * 60 * 24);
    total += f.amount / Math.pow(1 + rate, days / 365);
  }
  return total;
}

function xirr(flows) {
  if (!flows || flows.length < 2) return NaN;
  let hasPos = false;
  let hasNeg = false;
  for (const f of flows) {
    if (f.amount > 0) hasPos = true;
    if (f.amount < 0) hasNeg = true;
  }
  if (!hasPos || !hasNeg) return NaN;
  let rate = 0.08;
  for (let i = 0; i < 60; i++) {
    const f0 = xnpv(rate, flows);
    const f1 = xnpv(rate + 1e-6, flows);
    const d = (f1 - f0) / 1e-6;
    if (!Number.isFinite(d) || d === 0) break;
    const next = rate - f0 / d;
    if (Math.abs(next - rate) < 1e-7) return next;
    rate = next;
  }
  return rate;
}

function formatMoney(n) {
  if (n == null || !Number.isFinite(n)) return "--";
  return "$" + n.toFixed(0);
}

function runDca() {
  try {
    if (!lastSeries || lastSeries.length < 10) return;
    const amountEl = getEl("dcaAmount");
    const startEl = getEl("dcaStart");
    if (!amountEl || !startEl) return;
    const amount = Number(amountEl.value || 0);
    const startYear = Number(startEl.value);
    if (!Number.isFinite(amount) || amount < 0) return;
    if (!Number.isFinite(startYear)) return;
    state.dcaAmount = amount;
    state.dcaStartYear = startYear;
    saveState();

    const startTs = new Date(`${startYear}-01-01T00:00:00Z`).getTime();
    const points = lastSeries.filter(p => p[1] != null && p[0] >= startTs);
    if (points.length < 2) return;

    let shares = 0;
    let invested = 0;
    const flows = [];
    let lastMonth = null;
    for (const [ts, price] of points) {
      const d = new Date(ts);
      const month = d.getFullYear() * 12 + d.getMonth();
      if (month !== lastMonth) {
        shares += amount / price;
        invested += amount;
        flows.push({ date: new Date(ts), amount: -amount });
        lastMonth = month;
      }
    }

    const last = points[points.length - 1];
    const endValue = shares * last[1];
    flows.push({ date: new Date(last[0]), amount: endValue });

    const irr = xirr(flows);

    const first = points[0];
    const lsShares = invested > 0 ? invested / first[1] : 0;
    const lsValue = lsShares * last[1];

    const investedEl = getEl("dcaInvested");
    const valueEl = getEl("dcaValue");
    const irrEl = getEl("dcaIrr");
    const lsEl = getEl("lsValue");
    if (investedEl) investedEl.textContent = formatMoney(invested);
    if (valueEl) valueEl.textContent = formatMoney(endValue);
    if (irrEl) irrEl.textContent = Number.isFinite(irr) ? (irr * 100).toFixed(2) + "%" : "--";
    if (lsEl) lsEl.textContent = formatMoney(lsValue);
  } catch (e) {
    console.error("runDca error", e);
  }
}

function computeYearlyDrawdowns(series) {
  const pts = series.filter(p => p[1] != null);
  const byYear = new Map();
  let runningPeak = -Infinity;
  let runningPeakTs = null;

  for (let i = 0; i < pts.length; i++) {
    const ts = pts[i][0];
    const price = pts[i][1];
    const y = new Date(ts).getFullYear();

    if (price > runningPeak) {
      runningPeak = price;
      runningPeakTs = ts;
    }

    let st = byYear.get(y);
    if (!st) {
      st = { year: y, maxDD: 0, ddPeakPrice: null, ddPeakTs: null, troughPrice: null, troughTs: null };
      byYear.set(y, st);
    }

    if (runningPeak > 0) {
      const dd = price / runningPeak - 1;
      if (dd < st.maxDD) {
        st.maxDD = dd;
        st.ddPeakPrice = runningPeak;
        st.ddPeakTs = runningPeakTs;
        st.troughPrice = price;
        st.troughTs = ts;
      }
    }
  }
  const arr = Array.from(byYear.values()).sort((a, b) => b.year - a.year);
  for (const st of arr) {
    st.recoveryDays = null;
    if (!st.troughTs || !st.ddPeakPrice) continue;
    const troughIdx = pts.findIndex(p => p[0] === st.troughTs);
    if (troughIdx < 0) continue;
    for (let i = troughIdx; i < pts.length; i++) {
      if (pts[i][1] >= st.ddPeakPrice) {
        st.recoveryDays = Math.round((pts[i][0] - st.troughTs) / (1000 * 60 * 60 * 24));
        break;
      }
    }
  }
  return arr;
}

function renderYearlyDrawdowns() {
  try {
    const tbody = getEl("ddTable");
    if (!tbody) return;
    tbody.innerHTML = "";
    if (!lastSeries || lastSeries.length < 10) return;
    const rows = computeYearlyDrawdowns(lastSeries);
    let totalDD = 0;
    let ddCount = 0;
    let totalRec = 0;
    let recCount = 0;

    for (const r of rows) {
      if (Number.isFinite(r.maxDD) && r.maxDD < 0) {
        totalDD += r.maxDD;
        ddCount++;
      }
      if (r.recoveryDays != null) {
        totalRec += r.recoveryDays;
        recCount++;
      }

      const tr = document.createElement("tr");
      const dd = r.maxDD;
      const ddText = Number.isFinite(dd) ? (dd * 100).toFixed(1) + "%" : "--";
      
      let ddDate = "--";
      if (r.ddPeakTs && r.troughTs) {
        const start = formatDate(r.ddPeakTs);
        const end = formatDate(r.troughTs);
        if (start.substring(0,4) === end.substring(0,4)) {
           ddDate = `${start} 至 ${end.substring(5)}`;
        } else {
           // 跨年的情况，缩短年份显示例如 2021-12-27 至 23-01-05，以节省空间
           ddDate = `${start.substring(2)} 至 ${end.substring(2)}`;
        }
      } else if (r.troughTs) {
        ddDate = formatDate(r.troughTs);
      }
      
      const rec = r.recoveryDays == null ? "--" : String(r.recoveryDays);
      tr.innerHTML = `<td>${r.year}</td><td class="${dd < 0 ? "red" : ""}">${ddText}</td><td style="font-size: 11px; text-align: center; white-space: nowrap;">${ddDate}</td><td>${rec}</td>`;
      tbody.appendChild(tr);
    }

    // 增加平均值统计行
    if (ddCount > 0) {
      const avgDD = totalDD / ddCount;
      const avgRec = recCount > 0 ? Math.round(totalRec / recCount) : "--";
      const trAvg = document.createElement("tr");
      trAvg.style.fontWeight = "bold";
      trAvg.style.backgroundColor = "#f9fafb";
      trAvg.innerHTML = `<td>平均</td><td class="red">${(avgDD * 100).toFixed(1)}%</td><td style="text-align: center; color: var(--muted);">--</td><td>${avgRec}</td>`;
      tbody.appendChild(trAvg);
    }
  } catch (e) {
    console.error("renderYearlyDrawdowns error", e);
  }
}

function quantile(sorted, q) {
  if (!sorted || sorted.length === 0) return NaN;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] === undefined) return sorted[base];
  return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
}

function computeOpportunity(series, vixSeries, type, threshold) {
  const pts = series.filter(p => p[1] != null);
  let thr = type === "dd" ? threshold / 100 : threshold;
  let peak = -Infinity;
  let inEvent = false;
  const events = [];
  
  // 建立 VIX 日期查找表（归一化到天，忽略时分秒差异）
  const vixMap = new Map();
  if (vixSeries) {
    vixSeries.forEach(p => {
      const d = new Date(p[0]);
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
      vixMap.set(key, p[1]);
    });
  }

  for (let i = 0; i < pts.length; i++) {
    const ts = pts[i][0];
    const price = pts[i][1];
    let triggered = false;

    if (type === "dd") {
      if (price > peak) peak = price;
      const dd = peak > 0 ? (price / peak - 1) : 0;
      if (dd <= thr) triggered = true;
    } else if (type === "vix") {
      const d = new Date(ts);
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
      const v = vixMap.get(key);
      if (v != null && v >= thr) triggered = true;
    }

    if (triggered) {
      if (!inEvent) {
        inEvent = true;
        events.push({ index: i, ts, price });
      }
    } else {
      if (type === "dd" && price >= peak) inEvent = false;
      else if (type === "vix") inEvent = false;
    }
  }
  const horizons = [
    { key: "3m", label: "3个月", offset: 63 },
    { key: "6m", label: "6个月", offset: 126 },
    { key: "1y", label: "1年", offset: 252 },
    { key: "3y", label: "3年", offset: 756 }
  ];
  const result = [];
  for (const h of horizons) {
    const rets = [];
    for (const e of events) {
      const j = e.index + h.offset;
      if (j >= pts.length) continue;
      const r = pts[j][1] / e.price - 1;
      if (Number.isFinite(r)) rets.push(r);
    }
    rets.sort((a, b) => a - b);
    result.push({
      label: h.label,
      n: rets.length,
      median: quantile(rets, 0.5),
      p25: quantile(rets, 0.25),
      p75: quantile(rets, 0.75)
    });
  }
  return result;
}

function formatPct(n) {
  if (n == null || !Number.isFinite(n)) return "--";
  const v = n * 100;
  return (v >= 0 ? "+" : "") + v.toFixed(1) + "%";
}

function runOpportunity() {
  try {
    if (!lastSeries || lastSeries.length < 200) return;
    const thrEl = getEl("oppThreshold");
    const tbody = getEl("oppTable");
    if (!thrEl || !tbody) return;
    const thr = Number(thrEl.value);
    if (!Number.isFinite(thr)) return;
    state[state.oppType === "vix" ? "oppThresholdVix" : "oppThresholdDd"] = thr;
    saveState();
    const results = computeOpportunity(lastSeries, lastVixSeries, state.oppType, thr);
    tbody.innerHTML = "";
    for (const r of results) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td>${r.label}</td><td>${r.n}</td>
        <td class="${r.median >= 0 ? "green" : "red"}">${formatPct(r.median)}</td>
        <td class="${r.p25 >= 0 ? "green" : "red"}">${formatPct(r.p25)}</td>
        <td class="${r.p75 >= 0 ? "green" : "red"}">${formatPct(r.p75)}</td>`;
      tbody.appendChild(tr);
    }
  } catch (e) {
    console.error("runOpportunity error", e);
  }
}

async function refresh(opts) {
  const preferCache = opts && opts.preferCache;
  try {
    setActiveSymbol();
    renderRanges();
    setActivePanel();

    getEl("tickerTitle").textContent = "加载中...";
    setStatus(preferCache ? "读取缓存..." : "更新中...");

    if (preferCache) {
      const cached = readCachedChart(state.symbol, state.range);
      const cachedVix = readCachedChart("^VIX", state.range);
      if (cachedVix && cachedVix.series) {
        lastVixSeries = cachedVix.series;
      }
      if (cached && cached.series && cached.series.length) {
        lastSeries = cached.series;
        lastMeta = cached.meta || null;
        lastVolume = cached.volume || null;
        lastOpen = cached.open || null;
        lastHigh = cached.high || null;
        lastLow = cached.low || null;
        renderChart(lastSeries);
        renderFactsFromChart();
        fillDcaStartOptions(lastSeries);
        recomputeAll();
        setStatus(cached.meta && cached.meta.updatedAt ? `缓存 ${cached.meta.updatedAt}` : "缓存");
      }
    }

    try {
      const quotes = await YahooAPI.fetchQuote([state.symbol]);
      if (quotes && quotes.length) renderHeader(quotes[0]);
    } catch (e) {
      setStatus("行情失败");
    }

    const chart = await YahooAPI.fetchChart(state.symbol, state.range);
    if (!chart || !chart.series || !chart.series.length) throw new Error("图表数据为空");
    
    try {
      const vixChart = await YahooAPI.fetchChart("^VIX", state.range);
      if (vixChart && vixChart.series) {
        lastVixSeries = vixChart.series;
        writeCachedChart("^VIX", state.range, { series: lastVixSeries });
      }
    } catch (e) {
      console.warn("VIX fetch error", e);
    }
    lastSeries = chart.series;
    lastVolume = chart.volume || null;
    lastOpen = chart.open || null;
    lastHigh = chart.high || null;
    lastLow = chart.low || null;
    lastMeta = { source: chart.source || "yahoo", updatedAt: new Date().toLocaleTimeString() };
    renderChart(lastSeries);
    renderFactsFromChart();
    fillDcaStartOptions(lastSeries);
    recomputeAll();
    writeCachedChart(state.symbol, state.range, { series: lastSeries, volume: lastVolume, open: lastOpen, high: lastHigh, low: lastLow, meta: lastMeta });
    setStatus(`${lastMeta.source} ${lastMeta.updatedAt}`);
  } catch (err) {
    setStatus("失败");
    showError(err);
  }
}

function setupTooltip() {
  const canvas = getEl("chartCanvas");
  const tip = getEl("tooltip");
  const show = (text) => { tip.textContent = text; tip.style.display = "block"; };
  const hide = () => { tip.style.display = "none"; };
  canvas.addEventListener("mousemove", (e) => {
    if (!lastSeries || lastSeries.length < 2) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const idx = Math.round((x / rect.width) * (lastSeries.length - 1));
    const i = Math.max(0, Math.min(lastSeries.length - 1, idx));
    const ts = lastSeries[i][0];
    const v = lastSeries[i][1];
    if (v == null) return;
    show(`${formatDate(ts)}  ${MeiguUtils.toFixed2(v)}`);
  });
  canvas.addEventListener("mouseleave", hide);
}

function showTab(tab) {
  state.tab = tab;
  saveState();
  setActivePanel();
  if (tab === "dd") renderYearlyDrawdowns();
}

function setupEvents() {
  getEl("sym-spy").onclick = () => { state.symbol = SYMBOLS.SPY.symbol; saveState(); refresh({ preferCache: true }); };
  getEl("sym-qqq").onclick = () => { state.symbol = SYMBOLS.QQQ.symbol; saveState(); refresh({ preferCache: true }); };
  function clearChartCaches(symbol) {
    try {
      const keys = Object.keys(localStorage);
      keys.forEach(k => {
        if (k.startsWith(`meigu_cache_chart_${symbol}_`) || k.startsWith(`meigu_cache_chart_^VIX_`)) {
          localStorage.removeItem(k);
        }
      });
    } catch {}
  }
  getEl("btn-refresh").onclick = (e) => {
    if (e && e.shiftKey) {
      setStatus("强制刷新中...");
      clearChartCaches(state.symbol);
      refresh({ preferCache: false });
    } else {
      refresh({ preferCache: true });
    }
  };
  getEl("useLog").onchange = e => { state.useLog = e.target.checked; saveState(); if (lastSeries) renderChart(lastSeries); };
  getEl("tab-dca").onclick = () => showTab("dca");
  getEl("tab-dd").onclick = () => showTab("dd");
  getEl("tab-opp").onclick = () => showTab("opp");
  getEl("btn-run-dca").onclick = () => runDca();
  getEl("dcaAmount").onchange = () => runDca();
  getEl("dcaStart").onchange = () => runDca();
  getEl("btn-run-opp").onclick = () => runOpportunity();
  getEl("oppType").onchange = e => {
    state.oppType = e.target.value;
    saveState();
    fillOppThresholdOptions();
    runOpportunity();
  };
  getEl("oppThreshold").onchange = e => {
    if (state.oppType === "vix") state.oppThresholdVix = Number(e.target.value);
    else state.oppThresholdDd = Number(e.target.value);
    saveState();
    runOpportunity();
  };
}

async function init() {
  loadState();
  getEl("useLog").checked = !!state.useLog;
  setupEvents();
  setupTooltip();
  await refresh({ preferCache: true });
}

init();
