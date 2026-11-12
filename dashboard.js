function summarize(weeks) {
  const totals = { sales: 0, units: 0, orders: 0, grossProfit: 0, adSpend: 0 };
  for (const week of weeks) {
    for (const key of Object.keys(totals)) totals[key] += week[key];
  }
  return totals;
}

function filterRows(rows, start, end, filters) {
  return rows.filter(row => (!start || row.date >= start) && (!end || row.date <= end) &&
    Object.entries(filters).every(([key, value]) => !value || row[key] === value));
}

function groupByPeriod(rows, keyForRow) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyForRow(row);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b))
    .map(([period, members]) => ({ period, ...summarize(members) }));
}

function groupByWeek(rows) {
  return groupByPeriod(rows, row => row.week).map(({ period, ...totals }) => ({ week: period, ...totals }));
}

function ratio(value, sales) {
  return sales === 0 ? "—" : percent.format(value / sales);
}

const currency = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat("zh-CN");
const percent = new Intl.NumberFormat("zh-CN", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });

function createSalesChart(rows) {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 270;
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", rows.map(row => row.period + " 销量 " + integer.format(row.units)).join("，"));
  const context = canvas.getContext("2d");
  const left = 70, top = 20, width = 550, height = 212;
  const low = rows.reduce((min, row) => Math.min(min, row.units), 0);
  const high = rows.reduce((max, row) => Math.max(max, row.units), 1);
  const x = index => left + (rows.length === 1 ? width / 2 : index * width / (rows.length - 1));
  const y = units => top + (high - units) * height / (high - low);
  context.font = "15px sans-serif";
  context.fillStyle = "#40586b";
  context.textAlign = "right";
  for (let step = 0; step <= 4; step++) {
    const value = high - (high - low) * step / 4;
    const position = y(value);
    context.strokeStyle = "#d9e3ec";
    context.beginPath();
    context.moveTo(left, position);
    context.lineTo(left + width, position);
    context.stroke();
    context.fillText(integer.format(Math.round(value)), left - 8, position + 5);
  }

  context.strokeStyle = "#087e78";
  context.lineWidth = 3;
  context.beginPath();
  rows.forEach((row, index) => {
    if (index === 0) context.moveTo(x(index), y(row.units));
    else context.lineTo(x(index), y(row.units));
  });
  context.stroke();
  context.textAlign = "center";
  const labelStep = Math.max(1, Math.ceil(rows.length / 6));
  rows.forEach((row, index) => {
    context.fillStyle = "#087e78";
    context.beginPath();
    context.arc(x(index), y(row.units), 4, 0, Math.PI * 2);
    context.fill();
    if (index % labelStep === 0) {
      context.fillStyle = "#40586b";
      const labelX = Math.max(45, Math.min(canvas.width - 42, x(index)));
      context.fillText(row.period, labelX, 257);
    }
  });
  return canvas;
}

async function initialize() {
  const start = document.querySelector("#start");
  const end = document.querySelector("#end");
  const status = document.querySelector("#status");
  const metrics = document.querySelector("#metrics");
  const trend = document.querySelector("#trend");
  const bars = document.querySelector("#bars");

  try {
    async function readJson(path) {
      const response = await fetch(path, { cache: "no-cache" });
      if (!response.ok) throw new Error(path + ": HTTP " + response.status);
      return response.json();
    }

    const index = await readJson("./data/index.json");
    const months = index.months;
    const latest = months.at(-1);
    document.querySelector("#dataset").textContent = index.simulated ? "模拟数据" : "汇总数据";
    document.querySelector("#updated").textContent = "数据更新 " +
      new Date(index.updatedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
    const selects = ["group", "region", "product"].map(key => [key, document.getElementById(key)]);
    for (const input of [start, end]) {
      input.min = months[0]?.first ?? "";
      input.max = latest?.last ?? "";
    }
    for (const [key, select] of selects) {
      select.replaceChildren(new Option("全部", ""), ...index.dimensions[key].map(value => new Option(value, value)));
    }
    const cache = new Map();
    let request = 0;

    function loadMonth(month) {
      if (!cache.has(month.file)) {
        cache.set(month.file, readJson("./data/" + month.file).catch(error => {
          cache.delete(month.file);
          throw error;
        }));
      }
      return cache.get(month.file);
    }

    async function render() {
      const current = ++request;
      const from = start.value;
      const to = end.value;
      const filters = Object.fromEntries(selects.map(([key, select]) => [key, select.value]));
      const wanted = from && to && from > to ? [] :
        months.filter(month => (!from || month.last >= from) && (!to || month.first <= to));
      metrics.replaceChildren();
      bars.replaceChildren();
      trend.hidden = true;
      status.textContent = "正在加载…";
      try {
        const rows = (await Promise.all(wanted.map(loadMonth))).flat();
        if (current !== request) return;
        showRows(rows, from, to, filters);
      } catch (error) {
        if (current === request) status.textContent = "数据加载失败，请重试。";
        console.error(error);
      }
    }

    function showRows(rows, from, to, filters) {
      const page = document.body.dataset.page;
      const monthly = page === "monthly.html";
      const chart = page === "charts.html";
      const selected = groupByPeriod(filterRows(rows, from, to, filters),
        row => monthly ? row.date.slice(0, 7) : row.week);
      metrics.replaceChildren();
      bars.replaceChildren();
      trend.hidden = !selected.length;
      status.textContent = selected.length ? `共 ${selected.length} ${monthly ? "个月" : "周"}` :
        "当前条件下没有数据，请调整日期或筛选项。";
      if (!selected.length) return;

      const totals = summarize(selected);
      const definitions = [
        ["累计销售额", row => currency.format(row.sales)],
        ["累计销量", row => integer.format(row.units)],
        ["产品订单数", row => integer.format(row.orders)],
        ["累计毛利率", row => ratio(row.grossProfit, row.sales)],
        ["累计广告花费", row => currency.format(row.adSpend)],
        ["广告花费占比", row => ratio(row.adSpend, row.sales)],
      ];
      for (const [label, format] of definitions) {
        const card = document.createElement("article");
        card.className = "card";
        const title = document.createElement("h2");
        title.textContent = label;
        const result = document.createElement("p");
        result.textContent = format(totals);
        card.append(title, result);
        metrics.append(card);
      }

      if (!chart) {
        const table = document.createElement("table");
        const head = table.createTHead().insertRow();
        const body = table.createTBody();
        function heading(row, label, scope) {
          const cell = document.createElement("th");
          cell.scope = scope;
          cell.textContent = label;
          row.append(cell);
        }
        for (const label of ["指标", ...selected.map(row => row.period), "所选合计"]) {
          heading(head, label, "col");
        }
        for (const [label, format] of definitions) {
          const row = body.insertRow();
          heading(row, label, "row");
          for (const period of [...selected, totals]) row.insertCell().textContent = format(period);
        }
        const scroller = document.createElement("div");
        scroller.className = "table-scroll";
        scroller.append(table);
        bars.append(scroller);
        return;
      }

      const chartTitles = [
        "国内库龄", "国内库存数量", "缺货率", "滞销情况",
        "销量汇总", "FBA 库龄", "FBA 库存数量", "库存天数",
      ];
      for (const title of chartTitles) {
        const section = document.createElement("section");
        section.className = "chart-card";
        const heading = document.createElement("h3");
        heading.textContent = title;
        section.append(heading);
        if (title === "销量汇总") {
          section.append(createSalesChart(selected));
        } else {
          const placeholder = document.createElement("p");
          placeholder.className = "chart-placeholder";
          placeholder.textContent = "待接入对应数据";
          section.append(placeholder);
        }
        bars.append(section);
      }
    }

    function reset() {
      start.value = latest?.first ?? "";
      end.value = latest?.last ?? "";
      for (const [, select] of selects) select.value = "";
      render();
    }

    for (const control of [start, end, ...selects.map(([, select]) => select)]) {
      control.addEventListener("change", render);
    }
    document.querySelector("#reset").addEventListener("click", reset);
    reset();
  } catch (error) {
    status.textContent = "加载失败，请检查数据索引。";
    console.error(error);
  }
}

if (typeof document !== "undefined") initialize();
if (typeof module !== "undefined") module.exports = { summarize, filterRows, groupByWeek, ratio };
