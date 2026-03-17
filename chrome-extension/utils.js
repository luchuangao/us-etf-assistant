function formatNumber(n) {
  if (n === null || n === undefined) return "";
  const a = Math.abs(n);
  if (a >= 1e12) return (n / 1e12).toFixed(2) + "万亿";
  if (a >= 1e8) return (n / 1e8).toFixed(2) + "亿";
  if (a >= 1e4) return (n / 1e4).toFixed(2) + "万";
  return String(n.toFixed ? n.toFixed(2) : n);
}
function formatChange(n) {
  if (n === null || n === undefined) return "";
  const s = (n >= 0 ? "+" : "") + n.toFixed(2) + "%";
  return s;
}
function pearson(x, y) {
  const n = Math.min(x.length, y.length);
  if (n < 3) return NaN;
  let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    const xi = x[i], yi = y[i];
    sx += xi; sy += yi; sxx += xi * xi; syy += yi * yi; sxy += xi * yi;
  }
  const cov = sxy / n - (sx / n) * (sy / n);
  const vx = sxx / n - (sx / n) * (sx / n);
  const vy = syy / n - (sy / n) * (sy / n);
  const d = Math.sqrt(vx * vy);
  if (d === 0) return NaN;
  return cov / d;
}
function returns(series) {
  const r = [];
  for (let i = 1; i < series.length; i++) {
    const p0 = series[i - 1];
    const p1 = series[i];
    if (p0 == null || p1 == null || p0 === 0) continue;
    r.push((p1 - p0) / p0);
  }
  return r;
}
function drawLineChart(canvas, seriesA, seriesB, options) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, w, h);
  const padL = 44, padR = 44, padT = 16, padB = 24;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  if (!seriesA || seriesA.length === 0) return;
  const valuesA = seriesA.map(v => v[1]).filter(v => v != null);
  const minA = options.useLog ? Math.min(...valuesA.filter(v => v > 0)) : Math.min(...valuesA);
  const maxA = Math.max(...valuesA);
  const scaleA = v => {
    const yv = options.useLog ? Math.log(v) : v;
    const ymin = options.useLog ? Math.log(minA) : minA;
    const ymax = options.useLog ? Math.log(maxA) : maxA;
    const t = (yv - ymin) / (ymax - ymin || 1);
    return padT + plotH - t * plotH;
  };
  const xs = i => padL + (i / (seriesA.length - 1)) * plotW;
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#ff3b30";
  ctx.beginPath();
  for (let i = 0; i < seriesA.length; i++) {
    const y = scaleA(seriesA[i][1]);
    const x = xs(i);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.stroke();
  if (seriesB && seriesB.length > 0) {
    const valuesB = seriesB.map(v => v[1]).filter(v => v != null);
    const minB = Math.min(...valuesB);
    const maxB = Math.max(...valuesB);
    const scaleB = v => {
      const t = (v - minB) / (maxB - minB || 1);
      return padT + plotH - t * plotH;
    };
    ctx.strokeStyle = "#1e88e5";
    ctx.beginPath();
    for (let i = 0; i < seriesB.length; i++) {
      const y = scaleB(seriesB[i][1]);
      const x = xs(i);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = "#1e88e5";
    ctx.textAlign = "right";
    ctx.fillText("VIX", w - 6, padT + 12);
  }
  ctx.fillStyle = "#111418";
  ctx.textAlign = "left";
  ctx.fillText(options.labelA || "", 6, padT + 12);
}
function drawLineChartAnimated(canvas, seriesA, seriesB, options) {
  const prev = canvas.__prevSeriesA || null;
  const start = performance.now();
  const dur = 300;
  function frame(ts) {
    const p = Math.min(1, (ts - start) / dur);
    const mix = [];
    if (prev && prev.length && prev.length === seriesA.length) {
      for (let i = 0; i < seriesA.length; i++) {
        const v0 = prev[i][1];
        const v1 = seriesA[i][1];
        const v = v0 == null || v1 == null ? v1 : v0 + (v1 - v0) * p;
        mix.push([seriesA[i][0], v]);
      }
    } else {
      for (let i = 0; i < seriesA.length; i++) mix.push(seriesA[i]);
    }
    drawLineChart(canvas, mix, seriesB, options);
    if (p < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  canvas.__prevSeriesA = seriesA;
}
function niceTicks(min, max, count) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) return [min];
  const span = max - min;
  const step0 = span / Math.max(1, (count - 1));
  const mag = Math.pow(10, Math.floor(Math.log10(step0)));
  const norm = step0 / mag;
  let step = mag;
  if (norm >= 5) step = 5 * mag;
  else if (norm >= 2) step = 2 * mag;
  const start = Math.floor(min / step) * step;
  const ticks = [];
  for (let v = start; v <= max + step; v += step) ticks.push(v);
  return ticks;
}

function drawAppleChart(canvas, seriesA, options) {
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  const padL = 12, padR = 46, padT = 40, padB = 28;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  if (!seriesA || seriesA.length < 2) return;
  const values = seriesA.map(v => v[1]).filter(v => v != null && Number.isFinite(v));
  if (!values.length) return;
  const useLog = !!options.useLog;
  const color = options.color || "#3aa0ff";
  const minV = useLog ? Math.min(...values.filter(v => v > 0)) : Math.min(...values);
  const maxV = Math.max(...values);
  const yMin = useLog ? Math.log(minV) : minV;
  const yMax = useLog ? Math.log(maxV) : maxV;
  const scaleY = v => {
    const vv = useLog ? Math.log(v) : v;
    const t = (vv - yMin) / (yMax - yMin || 1);
    return padT + plotH - t * plotH;
  };
  const scaleX = i => padL + (i / (seriesA.length - 1)) * plotW;

  ctx.strokeStyle = "rgba(0,0,0,0.06)";
  ctx.lineWidth = 1;
  const ticks = niceTicks(minV, maxV, 4);
  for (let i = 0; i < 4; i++) {
    const y = padT + (i / 3) * plotH;
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(padL + plotW, y);
    ctx.stroke();
  }
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.font = "12px -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif";
  ctx.textAlign = "left";
  const leftYear = new Date(seriesA[0][0]).getFullYear();
  const rightYear = new Date(seriesA[seriesA.length - 1][0]).getFullYear();
  ctx.fillText(String(leftYear), padL, h - 8);
  ctx.textAlign = "right";
  ctx.fillText(String(rightYear), padL + plotW, h - 8);

  ctx.textAlign = "right";
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  const labelVals = [maxV, (maxV + minV) / 2, minV].map(v => useLog ? Math.exp(v) : v);
  for (let i = 0; i < 3; i++) {
    const v = labelVals[i];
    const y = scaleY(v);
    const txt = v >= 1000 ? Math.round(v).toLocaleString() : v.toFixed(0);
    ctx.fillText(txt, w - 8, y + 4);
  }

  const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
  grad.addColorStop(0, "#ff3b30" + "66");
  grad.addColorStop(1, "#ff3b30" + "00");

  ctx.beginPath();
  for (let i = 0; i < seriesA.length; i++) {
    const v = seriesA[i][1];
    if (v == null) continue;
    const x = scaleX(i);
    const y = scaleY(v);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.lineTo(padL + plotW, padT + plotH);
  ctx.lineTo(padL, padT + plotH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.strokeStyle = "#ff3b30";
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < seriesA.length; i++) {
    const v = seriesA[i][1];
    if (v == null) continue;
    const x = scaleX(i);
    const y = scaleY(v);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  // Volume bars at bottom
  if (options && Array.isArray(options.volume) && options.volume.length === seriesA.length) {
    const vols = options.volume.map(p => p[1]).filter(v => v != null);
    if (vols.length) {
      const vMax = Math.max(...vols);
      const vh = 36;
      const baseY = padT + plotH;
      ctx.fillStyle = "rgba(0,0,0,0.12)";
      const barW = Math.max(1, plotW / seriesA.length);
      for (let i = 0; i < seriesA.length; i++) {
        const v = options.volume[i][1];
        if (v == null) continue;
        const x = scaleX(i) - barW / 2;
        const hBar = Math.max(1, (v / (vMax || 1)) * vh);
        ctx.fillRect(x, baseY - hBar, barW * 0.8, hBar);
      }
    }
  }

  const hi = typeof options.hoverIndex === "number" ? options.hoverIndex : null;
  if (hi != null && hi >= 0 && hi < seriesA.length && seriesA[hi][1] != null) {
    const x = scaleX(hi);
    const y = scaleY(seriesA[hi][1]);
    ctx.strokeStyle = "rgba(255,59,48,0.75)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + plotH);
    ctx.stroke();
    ctx.fillStyle = "#ff3b30";
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawAppleChartAnimated(canvas, seriesA, options) {
  const prev = canvas.__prevAppleSeriesA || null;
  const start = performance.now();
  const dur = 260;
  function frame(ts) {
    const p = Math.min(1, (ts - start) / dur);
    const mix = [];
    if (prev && prev.length && prev.length === seriesA.length) {
      for (let i = 0; i < seriesA.length; i++) {
        const v0 = prev[i][1];
        const v1 = seriesA[i][1];
        const v = v0 == null || v1 == null ? v1 : v0 + (v1 - v0) * p;
        mix.push([seriesA[i][0], v]);
      }
    } else {
      for (let i = 0; i < seriesA.length; i++) mix.push(seriesA[i]);
    }
    drawAppleChart(canvas, mix, options);
    if (p < 1) requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  canvas.__prevAppleSeriesA = seriesA;
}
function toFixed2(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "";
  return n.toFixed(2);
}
function percent(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "";
  return (n * 100).toFixed(2) + "%";
}
function classByChange(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "";
  return n >= 0 ? "green" : "red";
}
window.MeiguUtils = { formatNumber, formatChange, pearson, returns, drawLineChart, drawLineChartAnimated, drawAppleChart, drawAppleChartAnimated, toFixed2, percent, classByChange };
