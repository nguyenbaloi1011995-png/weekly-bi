const statusNode = document.querySelector("#snapshot-status");
const chartGrid = document.querySelector("#snapshot-charts");
const number = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 });
const palette = ["#087e78", "#3174ae", "#bb6825", "#8455a5", "#be4f60", "#6d7c2e", "#597487", "#8c623f"];

async function readSnapshot(name) {
  const response = await fetch("./data/" + name + ".json?v=1");
  if (!response.ok) throw new Error("HTTP " + response.status);
  return response.json();
}

function drawChart(chart) {
  const card = document.createElement("article");
  card.className = "chart-card";
  const title = document.createElement("h3");
  title.textContent = chart.title;
  const canvas = document.createElement("canvas");
  canvas.width = 720;
  canvas.height = 300;
  canvas.setAttribute("aria-label", chart.title);
  canvas.setAttribute("role", "img");
  const ctx = canvas.getContext("2d");
  const indexes = [...new Set(chart.series.flatMap(series => Object.keys(series.values).map(Number)))].sort((a,b) => a-b);
  const plot = { left: 75, top: 22, width: 570, height: 230 };
  const rate = series => series.name.endsWith("率");
  const values = chart.series.flatMap(series => rate(series) ? [] : Object.values(series.values));
  const rates = chart.series.flatMap(series => rate(series) ? Object.values(series.values) : []);
  const min = Math.min(0, ...values);
  const max = Math.max(min + 1, ...values);
  const rateMax = Math.max(0.01, ...rates);
  const step = plot.width / Math.max(indexes.length, 1);
  const x = i => plot.left + step * (i + 0.5);
  const y = (value, percent) => plot.top + plot.height * (percent ? 1 - value / rateMax : (max - value) / (max - min));
  ctx.font = "14px sans-serif";
  for (let tick = 0; tick <= 4; tick++) {
    const yy = plot.top + plot.height * tick / 4;
    ctx.strokeStyle = "#d9e3ec";
    ctx.beginPath();
    ctx.moveTo(plot.left, yy);
    ctx.lineTo(plot.left + plot.width, yy);
    ctx.stroke();
    ctx.fillStyle = "#40586b";
    ctx.textAlign = "right";
    if (values.length) ctx.fillText(number.format(max - (max - min) * tick / 4), plot.left - 6, yy + 4);
    ctx.textAlign = "left";
    if (rates.length) ctx.fillText(number.format(rateMax * (1 - tick / 4) * 100) + "%", plot.left + plot.width + 5, yy + 4);
  }
  const columns = chart.series.filter(series => series.type === "barChart");
  chart.series.forEach((series, index) => {
    const color = palette[index % palette.length];
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
        const width = step * 0.8 / columns.length;
        ctx.fillRect(x(i) - step * 0.4 + columns.indexOf(series) * width, Math.min(y(0, false), yy), width, Math.abs(y(0, false) - yy));
      } else {
        if (connected) ctx.lineTo(x(i), yy);
        else ctx.moveTo(x(i), yy);
        connected = true;
      }
    });
    if (series.type !== "barChart") ctx.stroke();
  });
  const labels = chart.series[0].categoryLevels[0] ?? {};
  ctx.fillStyle = "#40586b";
  ctx.textAlign = "center";
  indexes.forEach((key, i) => {
    if (i % Math.max(1, Math.ceil(indexes.length / 6)) === 0) {
      ctx.fillText(labels[key] ?? "", x(i), 275);
    }
  });
  const legend = document.createElement("div");
  chart.series.forEach((series, index) => {
    const item = document.createElement("span");
    item.style.color = palette[index % palette.length];
    item.style.marginRight = "1em";
    item.textContent = "● " + series.name;
    legend.append(item);
  });
  card.append(title, canvas, legend);
  return card;
}

async function renderSnapshot() {
  if (chartGrid) {
    const charts = await readSnapshot("charts");
    const byId = new Map(charts.map(chart => [chart.id, chart]));
    chartGrid.replaceChildren(...[8, 6, 5, 4, 3, 7, 1, 2].map(id => drawChart(byId.get(id))));
    statusNode.textContent = "Excel 图表快照 · 按工作簿保存时的范围展示";
    return;
  }
  const rows = await readSnapshot("stockout");
  const input = document.querySelector("#stock-search");
  const tbody = document.querySelector("#stock-rows");
  const from = document.querySelector("#stock-from");
  const to = document.querySelector("#stock-to");
  const selects = ["group", "region", "parentTier", "childTier"].map(key =>
    [key, document.getElementById("stock-" + key)]);
  for (const [key, select] of selects) {
    const values = [...new Set(rows.map(row => row[key]).filter(Boolean))].sort();
    select.replaceChildren(new Option("全部", ""), ...values.map(value => new Option(value, value)));
  }

  function showRows() {
    const query = input.value.trim().toLowerCase();
    const filters = selects.map(([key, select]) => [key, select.value]);
    const matches = rows.filter(row =>
      (!from.value || (row.date && row.date >= from.value)) &&
      (!to.value || (row.date && row.date <= to.value)) &&
      filters.every(([key, value]) => !value || row[key] === value) &&
      (!query || Object.values(row).some(value => String(value ?? "").toLowerCase().includes(query))));
    tbody.replaceChildren();
    for (const row of matches) {
      const tr = tbody.insertRow();
      for (const key of ["date","group","region","asin","product","parentTier","childTier","estimatedStockout"]) {
        const value = row[key];
        tr.insertCell().textContent = typeof value === "number" ? number.format(value) : value ?? "—";
      }
    }
    statusNode.textContent = "Excel 缺货明细快照 · 共 " + matches.length + " 条";
  }
  input.addEventListener("input", showRows);
  for (const control of [from, to, ...selects.map(([, select]) => select)]) {
    control.addEventListener("change", showRows);
  }
  document.querySelector("#stock-reset").addEventListener("click", () => {
    for (const control of [from, to, input, ...selects.map(([, select]) => select)]) control.value = "";
    showRows();
  });
  showRows();
}

renderSnapshot().catch(error => {
  statusNode.textContent = "Excel 快照加载失败，请刷新重试。";
  console.error(error);
});
