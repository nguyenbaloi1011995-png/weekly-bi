const number = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });
const palette = ["#3399ed", "#23ac68", "#f2ba25", "#f58b32", "#eb5b9b", "#e74747", "#ac5548", "#98673e"];

function drawChart(chart) {
  const card = document.createElement("article");
  card.className = "chart-card";
  const title = document.createElement("h3");
  title.textContent = chart.title;
  if (chart.series.every(series => Object.keys(series.values).length === 0)) {
    const empty = document.createElement("p");
    empty.className = "chart-placeholder";
    empty.textContent = "当前条件下无数据";
    card.append(title, empty);
    return card;
  }
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 300;
  canvas.setAttribute("aria-label", chart.title);
  canvas.setAttribute("role", "img");
  const ctx = canvas.getContext("2d");
  const indexes = [...new Set(chart.series.flatMap(series => Object.keys(series.values).map(Number)))].sort((a,b) => a-b);
  const plot = { left: 75, top: 22, width: 570, height: 230 };
  const rate = series => series.name.endsWith("率");
  const stacked = new Set(["FBA 库龄", "国内库存数量", "国内库龄", "FBA 库存数量", "滞销情况"]).has(chart.title);
  const columns = chart.series.filter(series => series.type === "barChart");
  const lines = chart.series.filter(series => series.type !== "barChart");
  const values = chart.series.flatMap(series => rate(series) ? [] : Object.values(series.values));
  const rates = chart.series.flatMap(series => rate(series) ? Object.values(series.values) : []);
  const stackEnds = stacked ? indexes.flatMap(key => {
    const segments = columns.map(series => series.values[key] ?? 0);
    return [
      segments.reduce((sum, value) => sum + Math.max(0, value), 0),
      segments.reduce((sum, value) => sum + Math.min(0, value), 0)
    ];
  }) : [];
  function axisFor(values, fallback) {
    const low = Math.min(0, ...values);
    const high = Math.max(0, ...values);
    const raw = (high - low || fallback) / 4;
    const magnitude = 10 ** Math.floor(Math.log10(raw));
    const step = ([1, 2, 2.5, 5, 10].find(n => n >= raw / magnitude) ?? 10) * magnitude;
    const bottom = Math.floor(low / step);
    const top = Math.max(bottom + 1, Math.ceil(high / step) || Math.ceil(fallback / step));
    return { bottom, top, step };
  }

  const quantityAxis = axisFor([...values, ...stackEnds], 1);
  const rateAxis = axisFor(rates.map(value => value * 100), 1);
  const step = plot.width / Math.max(indexes.length, 1);
  const x = i => plot.left + step * (i + 0.5);
  const y = (value, percent) => {
    const axis = percent ? rateAxis : quantityAxis;
    const scaled = (percent ? value * 100 : value) / axis.step;
    return plot.top + plot.height * (axis.top - scaled) / (axis.top - axis.bottom);
  };
  ctx.font = "14px sans-serif";
  function drawTicks(axis, percent, right, grid) {
    ctx.textAlign = right ? "left" : "right";
    for (let tick = axis.bottom; tick <= axis.top; tick++) {
      const value = tick * axis.step;
      const yy = y(percent ? value / 100 : value, percent);
      if (grid) {
        ctx.strokeStyle = "#e3edf5";
        ctx.beginPath();
        ctx.moveTo(plot.left, yy);
        ctx.lineTo(plot.left + plot.width, yy);
        ctx.stroke();
      }
      ctx.fillStyle = "#49637b";
      const label = Number(value.toPrecision(10)).toLocaleString("zh-CN", { maximumFractionDigits: 8 });
      ctx.fillText(label + (percent ? "%" : ""), right ? plot.left + plot.width + 5 : plot.left - 6, yy + 4);
    }
  }
  const hasQuantity = chart.series.some(series => !rate(series));
  const hasRate = chart.series.some(rate);
  if (hasQuantity) drawTicks(quantityAxis, false, false, true);
  if (hasRate) drawTicks(rateAxis, true, hasQuantity, !hasQuantity);
  const positive = new Map();
  const negative = new Map();
  for (const series of [...columns, ...lines]) {
    const color = palette[chart.series.indexOf(series) % palette.length];
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    let connected = false;
    indexes.forEach((key, i) => {
      const value = series.values[key];
      if (value === undefined) { connected = false; return; }
      const yy = y(value, rate(series));
      if (series.type === "barChart") {
        const offsets = value >= 0 ? positive : negative;
        const start = stacked ? offsets.get(key) ?? 0 : 0;
        if (stacked) offsets.set(key, start + value);
        const width = Math.min(56, step * 0.72 / (stacked ? 1 : columns.length));
        const left = stacked ? x(i) - width / 2 :
          x(i) - columns.length * width / 2 + columns.indexOf(series) * width;
        const from = y(start, false);
        const to = y(start + value, false);
        ctx.fillRect(left, Math.min(from, to), width, Math.abs(from - to));
      } else {
        if (connected) ctx.lineTo(x(i), yy);
        else ctx.moveTo(x(i), yy);
        connected = true;
      }
    });
    if (series.type !== "barChart") {
      ctx.stroke();
      indexes.forEach((key, i) => {
        if (series.values[key] === undefined) return;
        ctx.beginPath();
        ctx.arc(x(i), y(series.values[key], rate(series)), 3, 0, 2 * Math.PI);
        ctx.fill();
      });
    }
  }
  const labels = chart.series[0].categoryLevels[0] ?? {};
  ctx.fillStyle = "#49637b";
  ctx.textAlign = "center";
  indexes.forEach((key, i) => {
    if (i % Math.max(1, Math.ceil(indexes.length / 6)) === 0) {
      ctx.fillText(labels[key] ?? "", x(i), 275);
    }
  });
  const frame = document.createElement("div");
  frame.className = "chart-frame";
  const tooltip = document.createElement("div");
  tooltip.className = "chart-tooltip";
  tooltip.hidden = true;
  frame.append(canvas, tooltip);

  function indexAt(event) {
    const bounds = canvas.getBoundingClientRect();
    const position = (event.clientX - bounds.left) * canvas.width / bounds.width;
    const index = Math.floor((position - plot.left) / step);
    return index >= 0 && index < indexes.length ? indexes[index] : undefined;
  }

  canvas.addEventListener("pointermove", event => {
    const key = indexAt(event);
    if (key === undefined) {
      tooltip.hidden = true;
      return;
    }
    const heading = document.createElement("strong");
    heading.textContent = labels[key] ?? "";
    tooltip.replaceChildren(heading);
    for (const series of chart.series) {
      const line = document.createElement("div");
      const value = series.values[key];
      const formatted = value == null ? "—" :
        rate(series) ? number.format(value * 100) + "%" : number.format(value);
      line.textContent = series.name + "  " + formatted;
      tooltip.append(line);
    }
    tooltip.hidden = false;
    const x = event.clientX - frame.getBoundingClientRect().left;
    tooltip.style.left = Math.max(0, Math.min(x + 12, frame.clientWidth - tooltip.offsetWidth)) + "px";
  });
  canvas.addEventListener("pointerleave", () => { tooltip.hidden = true; });
  canvas.addEventListener("click", event => {
    const key = indexAt(event);
    if (key !== undefined) drill(labels[key]);
  });
  const legend = document.createElement("div");
  legend.className = "chart-legend";
  chart.series.forEach((series, index) => {
    const item = document.createElement("span");
    item.style.color = palette[index % palette.length];

    item.textContent = "● " + series.name;
    legend.append(item);
  });
  card.append(title, frame, legend);
  return card;
}


const grain = document.querySelector("#grain");
const from = document.querySelector("#from");
const to = document.querySelector("#to");
const status = document.querySelector("#status");
const summary = document.querySelector("#summary");
const grid = document.querySelector("#charts");
const dimensions = [...document.querySelectorAll(".dimension")];
const selectedAsins = new Set();
const selectedParents = new Set();

const cache = new Map();
let generation = 0;
let basis;
let salesIndex;
let displayed = new Map();

function drill(label) {
  const bucket = displayed.get(label);
  if (!bucket || grain.value === "day" || status.textContent.startsWith("正在")) return;
  from.value = bucket.start;
  to.value = bucket.end;
  grain.value = grain.value === "month" ? "week" : "day";
  render();
}

const salesCache = new Map();
const summaryInteger = new Intl.NumberFormat("zh-CN", {maximumFractionDigits: 0});
const summaryMoney = new Intl.NumberFormat("zh-CN", {style: "currency", currency: "CNY", maximumFractionDigits: 0});
const summaryPercent = new Intl.NumberFormat("zh-CN", {style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2});


async function summarizeSales(start, end, filters, matchingKeys, request) {
  const totals = {};
  const [groups, regions, , , asins] = filters.map(values => new Set(values));
  for (const month of salesIndex.months) {
    if ((start && month.last < start) || (end && month.first > end)) continue;
    if (!salesCache.has(month.file)) {
      if (salesCache.size >= 4) salesCache.delete(salesCache.keys().next().value);
      salesCache.set(month.file, fetch("./data/" + month.file).then(response => {
        if (!response.ok) throw new Error("Sales data unavailable");
        return response.json();
      }).catch(error => { salesCache.delete(month.file); throw error; }));
    }
    const rows = await salesCache.get(month.file);
    if (request !== generation) return totals;
    for (const row of rows) {
      if ((start && row.date < start) || (end && row.date > end)) continue;
      if (groups.size && !groups.has(row.group) || regions.size && !regions.has(row.region) ||
          asins.size && !asins.has(row.product)) continue;
      if (matchingKeys && !matchingKeys.has(salesKey(row.date, row.group, row.region, row.product))) continue;
      for (const name of ["sales", "units", "grossProfit", "adSpend"]) {
        if (Number.isFinite(row[name])) totals[name] = (totals[name] ?? 0) + row[name];
      }
    }
  }
  return totals;
}

function showSummary(sales, stock) {
  const ratio = value => value == null || !sales.sales ? null : value / sales.sales;
  const cards = [
    ["累计销售额", sales.sales, summaryMoney],
    ["累计销量", sales.units, summaryInteger],
    ["累计毛利率", ratio(sales.grossProfit), summaryPercent],
    ["累计广告花费占比", ratio(sales.adSpend), summaryPercent],
    ...["平均FBA+在途库存天数", "平均FBA库存天数", "SAB级缺货率", "新品缺货率", "滞销率"].map(name =>
      [name, stock?.values[basis.fields.indexOf(name)], name.endsWith("天数") ? summaryInteger : summaryPercent]),
  ];
  summary.replaceChildren(...cards.map(([name, value, format]) => {
    const card = document.createElement("article");
    card.className = "card";
    const label = document.createElement("h2");
    label.textContent = name;
    const amount = document.createElement("p");
    amount.textContent = Number.isFinite(value) ? format.format(value) : "—";
    card.append(label, amount);
    return card;
  }));
  summary.hidden = false;
}
async function render() {

  const type = grain.value;
  const [start, end] = [from.value, to.value];
  const selections = dimensions.map(field => [...field.querySelectorAll("input:checked")].map(box => box.value));
  const filters = [...selections, [...selectedAsins], [...selectedParents]];
  const request = ++generation;
  summary.hidden = true;
  status.textContent = "正在读取所选日期的数据…";
  try {
    const files = basis.files.filter(file =>
      (!start || file.last >= start) && (!end || file.first <= end));
    const rollup = createBasisRollup(basis.fields, type, start, end, filters);
    const total = createBasisRollup(basis.fields, "total", start, end, filters);
    const matchingKeys = filters[2].length || filters[3].length || filters[5].length ? new Set() : null;
    const captureKey = matchingKeys ? ([date, group, region, , , asin]) =>
      matchingKeys.add(salesKey(date, group, region, asin)) : undefined;
    for (const [i, file] of files.entries()) {
      status.textContent = `正在读取数据 ${i + 1} / ${files.length}…`;
      if (!cache.has(file.file)) {
        if (cache.size >= 3) cache.delete(cache.keys().next().value);
        cache.set(file.file, fetch("./chart-history/data/" + file.file).then(async response => {
          if (!response.ok) throw new Error("Data file unavailable");
          const bytes = new Uint8Array(await response.arrayBuffer());
          if (bytes[0] !== 31 || bytes[1] !== 139) return JSON.parse(new TextDecoder().decode(bytes));
          const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
          return new Response(stream).json();
        }).catch(error => {
          cache.delete(file.file);
          throw error;
        }));
      }
      const block = await cache.get(file.file);
      if (request !== generation) return;
      rollup.add(block);
      total.add(block, captureKey);
    }
    const sales = await summarizeSales(start, end, filters, matchingKeys, request);
    if (request !== generation) return;
    showSummary(sales, total.finish()[0]);
    const data = basis;
    const rows = rollup.finish();
    grid.replaceChildren();
    displayed = new Map(rows.map(row => [row.label, row]));
    status.textContent = rows.length ?
      `共 ${rows.length} 个周期。周日到周六为一周，点图内数据区域可下钻。` : Object.keys(sales).length ? "当前筛选条件无图表数据。" : "当前筛选条件无数据。";
    if (!rows.length) return;
    const order = ["FBA 库存数量", "国内库存数量", "FBA 库龄", "国内库龄",
      "库存天数", "销量汇总", "缺货率", "滞销情况"];
    const chartsByTitle = new Map(data.charts.map(chart => [chart.title, chart]));
    for (const title of order) {
      const chart = chartsByTitle.get(title);
      const series = chart.series.map(([name, style, index]) => ({
        name, type: style, categoryLevels: [rows.map(row => row.label)],
        values: Object.fromEntries(rows.flatMap((row, i) => row.values[index] == null ? [] : [[i, row.values[index]]]))
      }));
      grid.append(drawChart({ title: chart.title, series }));
    }
  } catch (error) {
    if (request === generation) status.textContent = "数据计算失败，请重新应用筛选。";
    console.error(error);
  }
}

async function initialize() {
  const response = await fetch("./chart-history/data/index.json", { cache: "no-cache" });
  if (!response.ok) throw new Error("Basis unavailable");
  basis = await response.json();
  const salesResponse = await fetch("./data/index.json", {cache: "no-cache"});
  if (!salesResponse.ok) throw new Error("Sales index unavailable");
  salesIndex = await salesResponse.json();
  for (const input of [from, to]) { input.min = basis.first; input.max = basis.last; }
  const optionsFor = i => basis.options[i - 1];
  dimensions.forEach((field, i) => {
    const options = field.querySelector(".product-options");
    for (const value of optionsFor(i + 1)) {
      const label = document.createElement("label");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.value = value;
      label.append(box, value);
      options.append(label);
    }
  });



  const resetAsins = bindProductPicker("asin", " ASIN", selectedAsins, optionsFor(5));
  const resetParents = bindProductPicker("parent", "父单", selectedParents, optionsFor(6));
  document.querySelector("#apply").addEventListener("click", render);
  grain.addEventListener("change", render);
  function reset() {
    to.value = basis.last;
    from.value = recentThreeMonths(basis.first, basis.last);
    grain.value = "week";
    dimensions.forEach(field => field.querySelectorAll("input").forEach(box => { box.checked = false; }));
    resetAsins();
    resetParents();
    render();
  }
  document.querySelector("#reset").addEventListener("click", reset);
  reset();
}
initialize().catch(error => { status.textContent = "数据加载失败。"; console.error(error); });
