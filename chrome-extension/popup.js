const ranges = [
  { key: "1d", label: "1天" },
  { key: "5d", label: "1周" },
  { key: "1mo", label: "1个月" },
  { key: "3mo", label: "3个月" },
  { key: "6mo", label: "6个月" },
  { key: "ytd", label: "年初至今" },
  { key: "1y", label: "1年" },
  { key: "5y", label: "5年" },
  { key: "10y", label: "10年" }
];
const defaultTickers = ["SPY", "QQQ", "AAPL", "NVDA", "^GSPC", "XBI", "IBB"];
const vixSymbol = "^VIX";
let state = {
  tickers: [],
  selected: null,
  range: "1y",
  showVix: true,
  useLog: false
};
function getEl(id) { return document.getElementById(id); }
function loadState() {
  const s = localStorage.getItem("meigu_state");
  if (s) {
    try { state = JSON.parse(s); } catch {}
  }
  if (!state.tickers || state.tickers.length === 0) state.tickers = defaultTickers;
  if (!state.selected) state.selected = state.tickers[0];
}
function saveState() { localStorage.setItem("meigu_state", JSON.stringify(state)); }
function renderRanges() {
  const wrap = getEl("ranges");
  wrap.innerHTML = "";
  ranges.forEach(r => {
    const b = document.createElement("button");
    b.textContent = r.label;
    b.className = r.key === state.range ? "active" : "";
    b.onclick = () => { state.range = r.key; saveState(); refresh(); };
    wrap.appendChild(b);
  });
}
function renderTickerList(quotes) {
  const list = getEl("tickerList");
  list.innerHTML = "";
  state.tickers.forEach(sym => {
    const q = quotes.find(x => x.symbol === sym);
    const li = document.createElement("li");
    li.className = sym === state.selected ? "active" : "";
    const left = document.createElement("div");
    left.textContent = q ? q.shortName : sym;
    const right = document.createElement("div");
    if (q) {
      const pct = q.regularMarketChangePercent;
      right.textContent = MeiguUtils.formatChange(pct);
      right.className = MeiguUtils.classByChange(pct);
    } else {
      right.textContent = "";
    }
    li.onclick = () => { state.selected = sym; saveState(); refresh(); };
    li.appendChild(left);
    li.appendChild(right);
    list.appendChild(li);
  });
}
function renderHeader(q) {
  getEl("tickerTitle").textContent = q.shortName + " " + q.symbol;
  getEl("tickerMeta").textContent = q.currency ? q.currency : "";
  getEl("price").textContent = MeiguUtils.toFixed2(q.regularMarketPrice);
  getEl("change").textContent = MeiguUtils.formatChange(q.regularMarketChangePercent);
  getEl("change").className = MeiguUtils.classByChange(q.regularMarketChangePercent);
  getEl("open").textContent = MeiguUtils.toFixed2(q.regularMarketOpen);
  getEl("high").textContent = MeiguUtils.toFixed2(q.regularMarketDayHigh);
  getEl("low").textContent = MeiguUtils.toFixed2(q.regularMarketDayLow);
  getEl("volume").textContent = MeiguUtils.formatNumber(q.regularMarketVolume);
  getEl("fiftyTwoWeekHigh").textContent = MeiguUtils.toFixed2(q.fiftyTwoWeekHigh);
  getEl("fiftyTwoWeekLow").textContent = MeiguUtils.toFixed2(q.fiftyTwoWeekLow);
}
async function refresh() {
  const symbols = [...new Set([...state.tickers, state.selected, vixSymbol])];
  const quotes = await YahooAPI.fetchQuote(symbols);
  renderTickerList(quotes);
  const qSel = quotes.find(x => x.symbol === state.selected);
  if (qSel) renderHeader(qSel);
  const cA = await YahooAPI.fetchChart(state.selected, state.range);
  let cV = null;
  if (state.showVix) cV = await YahooAPI.fetchChart(vixSymbol, state.range);
  let aligned = null;
  if (cV) aligned = YahooAPI.alignSeries(cA, cV);
  const seriesA = cA.series;
  const seriesB = aligned ? aligned.b : null;
  MeiguUtils.drawLineChart(getEl("chartCanvas"), seriesA, seriesB, { labelA: state.selected, useLog: state.useLog });
  if (aligned) {
    const rA = MeiguUtils.returns(seriesA.map(p => p[1]).filter(v => v != null));
    const rB = MeiguUtils.returns(seriesB.map(p => p[1]).filter(v => v != null));
    const corr = MeiguUtils.pearson(rA.slice(0, Math.min(rA.length, rB.length)), rB.slice(0, Math.min(rA.length, rB.length)));
    getEl("correlation").textContent = MeiguUtils.percent(corr);
  } else {
    getEl("correlation").textContent = "";
  }
}
function setupEvents() {
  getEl("addTickerBtn").onclick = () => {
    const v = getEl("searchInput").value.trim();
    if (!v) return;
    if (!state.tickers.includes(v)) state.tickers.unshift(v);
    state.selected = v;
    getEl("searchInput").value = "";
    saveState();
    refresh();
  };
  getEl("showVix").onchange = e => { state.showVix = e.target.checked; saveState(); refresh(); };
  getEl("useLog").onchange = e => { state.useLog = e.target.checked; saveState(); refresh(); };
}
async function init() {
  loadState();
  renderRanges();
  setupEvents();
  const quotes = await YahooAPI.fetchQuote([...new Set([...state.tickers, state.selected])]);
  renderTickerList(quotes);
  refresh();
}
init();
