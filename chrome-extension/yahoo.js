async function yFetch(url) {
  const hosts = ["https://query2.finance.yahoo.com", "https://query1.finance.yahoo.com"];
  let lastErr = null;
  for (let i = 0; i < hosts.length; i++) {
    const u = hosts[i] + url + (url.includes("?") ? "&" : "?") + "nocache=" + Date.now();
    try {
      const r = await fetch(u, { 
        cache: "no-store",
        mode: "cors",
        headers: {
          "Accept": "application/json",
          "Accept-Language": "en-US,en;q=0.9"
        }
      });
      if (r.ok) return await r.json();
      lastErr = `HTTP ${r.status}`;
    } catch (e) {
      lastErr = e.message || "网络错误";
    }
  }
  throw new Error(lastErr || "获取失败");
}

function cacheGet(key, ttlMs) {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return null;
    // 兼容两种缓存格式：带 ts 包装的，或直接是 series 数据的
    if (obj.series) return obj;
    if (ttlMs && obj.ts && Date.now() - obj.ts > ttlMs) return null;
    return obj.data;
  } catch {
    return null;
  }
}

function cacheSet(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch {}
}

async function fetchQuote(symbols) {
  const q = encodeURIComponent(symbols.join(","));
  const cacheKey = "meigu_cache_quote_" + q;
  const cached = cacheGet(cacheKey, 30 * 1000);
  if (cached) return cached;
  try {
    const data = await yFetch("/v7/finance/quote?symbols=" + q);
    if (!data.quoteResponse || !data.quoteResponse.result) throw new Error("行情数据格式错误");
    const res = data.quoteResponse.result.map(r => ({
      symbol: r.symbol,
      shortName: r.shortName || r.longName || r.symbol,
      regularMarketPrice: r.regularMarketPrice,
      regularMarketChangePercent: r.regularMarketChangePercent,
      regularMarketChange: r.regularMarketChange,
      regularMarketOpen: r.regularMarketOpen,
      regularMarketDayHigh: r.regularMarketDayHigh,
      regularMarketDayLow: r.regularMarketDayLow,
      regularMarketVolume: r.regularMarketVolume,
      fiftyTwoWeekHigh: r.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: r.fiftyTwoWeekLow,
      currency: r.currency
    }));
    cacheSet(cacheKey, res);
    return res;
  } catch (err) {
    const results = [];
    for (const sym of symbols) {
      try {
        const c = await fetchChart(sym, "1d");
        if (c && c.series && c.series.length) {
          const last = c.series[c.series.length - 1];
          results.push({
            symbol: sym,
            shortName: sym,
            regularMarketPrice: last[1],
            regularMarketChangePercent: 0,
            isBackup: true
          });
        }
      } catch {}
    }
    if (results.length) {
      cacheSet(cacheKey, results);
      return results;
    }
    throw err;
  }
}

function rangeToInterval(range) {
  if (range === "1d") return "5m";
  if (range === "5d") return "30m";
  if (range === "1mo") return "1d";
  if (range === "3mo") return "1d";
  if (range === "6mo") return "1d";
  if (range === "ytd") return "1d";
  if (range === "1y") return "1d";
  if (range === "5y") return "1d";
  if (range === "10y") return "1d";
  if (range === "max") return "1d";
  return "1d";
}

function sliceByRange(series, range) {
  if (!series || series.length === 0) return series;
  if (range === "max") return series;
  const end = series[series.length - 1][0];
  const d = new Date(end);
  if (range === "1y") d.setFullYear(d.getFullYear() - 1);
  else if (range === "5y") d.setFullYear(d.getFullYear() - 5);
  else if (range === "10y") d.setFullYear(d.getFullYear() - 10);
  else return series;
  const startTs = d.getTime();
  const idx = series.findIndex(p => p[0] >= startTs);
  return idx <= 0 ? series : series.slice(idx);
}

function stooqSymbol(symbol) {
  const s = symbol.toUpperCase();
  if (s === "SPY") return "spy.us";
  if (s === "QQQ") return "qqq.us";
  return null;
}

async function fetchChartStooq(symbol, range) {
  const st = stooqSymbol(symbol);
  if (!st) throw new Error("无可用备用数据源");
  // Stooq without date limits defaults to returning only recent ~10 years of data.
  // Add &d1=19900101 to force full history for 'max' range.
  const url = "https://stooq.com/q/d/l/?s=" + encodeURIComponent(st) + "&i=d" + (range === "max" ? "&d1=19900101" : "");
  const r = await fetch(url, { cache: "no-store", mode: "cors" });
  if (!r.ok) throw new Error("HTTP " + r.status);
  const text = await r.text();
  const lines = text.trim().split("\n");
  if (lines.length < 2) throw new Error("备用数据为空");
  const series = [];
  const vols = [];
  const opens = [];
  const highs = [];
  const lows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < 6) continue;
    const dt = cols[0];
    const open = Number(cols[1]);
    const high = Number(cols[2]);
    const low = Number(cols[3]);
    const close = Number(cols[4]);
    const volume = Number(cols[5]);
    if (!dt || !Number.isFinite(close)) continue;
    const ts = new Date(dt + "T00:00:00Z").getTime();
    series.push([ts, close]);
    vols.push([ts, Number.isFinite(volume) ? volume : null]);
    opens.push([ts, Number.isFinite(open) ? open : null]);
    highs.push([ts, Number.isFinite(high) ? high : null]);
    lows.push([ts, Number.isFinite(low) ? low : null]);
  }
  const slicedSeries = sliceByRange(series, range);
  const startTs = slicedSeries.length ? slicedSeries[0][0] : null;
  const sliceToStart = (arr) => startTs == null ? [] : arr.filter(p => p[0] >= startTs);
  return { symbol, series: slicedSeries, volume: sliceToStart(vols), open: sliceToStart(opens), high: sliceToStart(highs), low: sliceToStart(lows), source: "stooq", adjusted: false };
}

async function fetchChart(symbol, range) {
  const cacheKey = "meigu_cache_chart_" + symbol + "_" + range;
  const cached = cacheGet(cacheKey, 6 * 60 * 60 * 1000);
  if (cached) return cached;
  try {
    const interval = rangeToInterval(range);
    const baseUrl = `/v8/finance/chart/${encodeURIComponent(symbol)}?`;
    // For QQQ max range, period1=0 might return limited data due to Yahoo backend partitioning.
    // However, using range=max works correctly for both SPY and QQQ to fetch full history.
    // We revert to using range=max to ensure QQQ gets data back to 1999.
    const params = new URLSearchParams({ range, interval, includePrePost: "false", events: "div,split" });
    const urlStr = baseUrl + params.toString();
    const data = await yFetch(urlStr);
    const r = data.chart && data.chart.result && data.chart.result[0] ? data.chart.result[0] : null;
    if (!r) throw new Error("图表数据格式错误");
    const t = r.timestamp || [];
    const quote0 = r.indicators && r.indicators.quote && r.indicators.quote[0] ? r.indicators.quote[0] : {};
    const close = quote0.close || [];
    const volume = quote0.volume || [];
    const open = quote0.open || [];
    const high = quote0.high || [];
    const low = quote0.low || [];
    const adj = r.indicators && r.indicators.adjclose && r.indicators.adjclose[0] && r.indicators.adjclose[0].adjclose ? r.indicators.adjclose[0].adjclose : null;
    const useAdj = Array.isArray(adj) && adj.length === close.length;
    const series = [];
    const vols = [];
    const opens = [];
    const highs = [];
    const lows = [];
    if (!t || !t.length) return { symbol, series: [], source: "yahoo", adjusted: useAdj };
    for (let i = 0; i < t.length; i++) {
      // 对于 VIX 指数，它不需要复权，直接使用 close 即可
      const v = (useAdj && symbol !== "^VIX") ? adj[i] : close[i];
      series.push([t[i] * 1000, v == null ? null : v]);
      const vv = volume && volume[i] != null ? volume[i] : null;
      vols.push([t[i] * 1000, vv]);
      opens.push([t[i] * 1000, open && open[i] != null ? open[i] : null]);
      highs.push([t[i] * 1000, high && high[i] != null ? high[i] : null]);
      lows.push([t[i] * 1000, low && low[i] != null ? low[i] : null]);
    }
    const res = { symbol, series, volume: vols, open: opens, high: highs, low: lows, source: "yahoo", adjusted: useAdj };
    cacheSet(cacheKey, res);
    return res;
  } catch (e) {
    const res = await fetchChartStooq(symbol, range);
    cacheSet(cacheKey, res);
    return res;
  }
}

function alignSeries(a, b) {
  if (!a || !a.series || !b || !b.series) return null;
  const mapB = new Map(b.series.map(([ts, v]) => [ts, v]));
  const alignedB = a.series.map(([ts]) => [ts, mapB.get(ts)]);
  return { a: a.series, b: alignedB };
}
window.YahooAPI = { fetchQuote, fetchChart, alignSeries };
