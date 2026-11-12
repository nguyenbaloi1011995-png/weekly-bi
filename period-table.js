const integer = new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 });
const percent = new Intl.NumberFormat("zh-CN", { style: "percent", minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmt = (value, format = integer) => value == null || !Number.isFinite(value) ? "—" : format.format(value);
const ratio = (a, b) => a == null || !b ? null : a / b;
const monthly = document.body.dataset.page === "monthly.html";

const inventoryWeek = [
  "平均FBA+在途库存天数", "平均FBA库存天数", "平均国内库存天数", "平均每日销量",
  "平均FBA库存量", "平均FBA在途数量", "平均FBA180天滞销库存量", "平均国内180天滞销库存量",
  "平均FBA365天滞销库存量", "平均国内365天滞销库存量", "滞销率",
  "SAB缺货销售货值", "新品缺货率", "FBAT级库存量占比",
];
const inventoryMonth = [
  "平均FBA+在途库存天数", "平均FBA库存天数", "平均国内库存天数", "追加占比",
  "SAB级最终预估准确率", "SAB级运营预估准确率", "SAB级模型预估准确率",
  "平均每日销量", "平均FBA库存量", "平均国内库存量", "平均FBA在途数量",
  "平均FBA180天滞销库存量", "平均FBA365天滞销库存量",
  "平均国内180天滞销库存量", "平均国内365天滞销库存量", "滞销率",
  "SAB级缺货率", "新品缺货率", "FBAT级库存量占比",
];

async function read(path, compressed = false) {
  const response = await fetch(path, { cache: compressed ? "default" : "no-cache" });
  if (!response.ok) throw new Error("HTTP " + response.status + " " + path);
  if (!compressed) return response.json();
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes[0] !== 31 || bytes[1] !== 139) return JSON.parse(new TextDecoder().decode(bytes));
  return new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).json();
}

function sunday(day) {
  const date = new Date(day + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.toISOString().slice(0, 10);
}
function weekLabel(day) {
  const date = new Date(day + "T00:00:00Z");
  date.setUTCDate(date.getUTCDate() + 4);
  const year = date.getUTCFullYear();
  const week = 1 + Math.floor((date - Date.UTC(year, 0, 1)) / (7 * 86400000));
  return year + "-W" + String(week).padStart(2, "0");
}

function aggregateRows() {
  const periods = new Map();
  const total = [];
  const labels = new Map();
  return {
    add(date, values) {
      let period = labels.get(date);
      if (!period) {
        period = monthly ? date.slice(0, 7) : sunday(date);
        labels.set(date, period);
      }
      if (!periods.has(period)) periods.set(period, []);
      const current = periods.get(period);
      values.forEach((value, i) => {
        if (value == null) return;
        current[i] = (current[i] ?? 0) + value;
        total[i] = (total[i] ?? 0) + value;
      });
    },
    periods, total,
  };
}

async function initialize() {
  const start = document.querySelector("#start");
  const end = document.querySelector("#end");
  const status = document.querySelector("#status");
  const panel = document.querySelector("#trend");
  const output = document.querySelector("#bars");
  const selects = ["group", "region", "product"].map(id => document.getElementById(id));
  const [sales, stock, extra] = await Promise.all([
    read("./data/index.json"),
    read("./chart-history/data/index.json"),
    monthly ? read("./monthly-metrics/index.json") : Promise.resolve(null),
  ]);
  const first = sales.months[0].first;
  const last = sales.months.at(-1).last;
  document.querySelector("#dataset").textContent = "汇总数据";
  document.querySelector("#updated").textContent = "数据更新 " +
    new Date(sales.updatedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
  for (const input of [start, end]) { input.min = first; input.max = last; }
  selects.forEach((select, i) => {
    const key = ["group", "region", "product"][i];
    const values = [...new Set([...sales.dimensions[key], ...stock.options[[0, 1, 4][i]]])].sort();
    select.replaceChildren(new Option("全部", ""), ...values.map(value => new Option(value, value)));
  });

  const grain = monthly ? "month" : "week";
  const fieldIndexes = new Map(stock.fields.map((name, i) => [name, i]));
  const cache = new Map();
  let generation = 0;
  function load(path, compressed) {
    if (!cache.has(path)) {
      if (cache.size >= 4) cache.delete(cache.keys().next().value);
      cache.set(path, read(path, compressed).catch(error => { cache.delete(path); throw error; }));
    }
    return cache.get(path);
  }

  async function render() {
    const current = ++generation;
    const from = start.value || first;
    const to = end.value || last;
    const [group, region, asin] = selects.map(select => select.value);
    const inRange = day => day >= from && day <= to;
    const overlaps = file => from <= to && file.last >= from && file.first <= to;
    const matches = (g, r, a) => (!group || group === g) && (!region || region === r) && (!asin || asin === a);
    const selectors = [group ? [group] : [], region ? [region] : [], [], [], asin ? [asin] : [], []];
    const salesRoll = aggregateRows();
    const extraRoll = aggregateRows();
    const stockRoll = createBasisRollup(stock.fields, grain, from, to, selectors);
    const stockTotal = createBasisRollup(stock.fields, "total", from, to, selectors);
    status.textContent = "正在读取数据…";
    try {
      await Promise.all([
        (async () => {
          for (const file of sales.months.filter(overlaps)) {
            const rows = await load("./data/" + file.file, false);
            if (current !== generation) return;
            for (const row of rows) if (inRange(row.date) && matches(row.group, row.region, row.product)) {
              salesRoll.add(row.date, [row.sales, row.units, row.orders, row.grossProfit, row.adSpend]);
            }
          }
        })(),
        (async () => {
          for (const file of stock.files.filter(overlaps)) {
            const rows = await load("./chart-history/data/" + file.file, true);
            if (current !== generation) return;
            stockRoll.add(rows);
            stockTotal.add(rows);
          }
        })(),
        (async () => {
          if (region || asin) return;
          for (const file of (extra?.files ?? []).filter(overlaps)) {
            const rows = await load("./monthly-metrics/" + file.file, true);
            if (current !== generation) return;
            for (const [date, g, ...values] of rows) {
              if (inRange(date) && group === g) extraRoll.add(date, values);
            }
          }
        })(),
      ]);
      if (current !== generation) return;
      const inventory = new Map(stockRoll.finish().map(row => [row.label, row]));
      const periods = [...new Set([...salesRoll.periods.keys(), ...inventory.keys(), ...extraRoll.periods.keys()])].sort();
      const definitions = [
        ["累计销售额", (row) => fmt(row.sales[0])],
        ["累计销量", (row) => fmt(row.sales[1])],
        ["累计订单量", (row) => fmt(row.sales[2])],
        ["累计毛利率", (row) => fmt(ratio(row.sales[3], row.sales[0]), percent)],
        ["累计广告花费", (row) => fmt(row.sales[4])],
        ["广告花费占比", (row) => fmt(ratio(row.sales[4], row.sales[0]), percent)],
      ];
      const extraNames = new Map(inventoryMonth.slice(3, 7).map((name, index) => [name, index]));
      for (const name of monthly ? inventoryMonth : inventoryWeek) {
        definitions.push([name, row => {
          const index = extraNames.get(name);
          if (monthly && index !== undefined) {
            const [added, shipped, units, ...deviations] = row.extra;
            const value = index === 0 ? ratio(added, shipped) :
              units ? (units - (deviations[index - 1] ?? 0)) / units : null;
            return fmt(value, percent);
          }
          const value = name === "SAB缺货销售货值" ? row.stock?.sabStockoutValue :
            row.stock?.values[fieldIndexes.get(name)];
          return fmt(value, /率$|占比$/.test(name) ? percent : integer);
        }]);
      }
      const rows = periods.map(period => ({
        sales: salesRoll.periods.get(period) ?? [],
        stock: inventory.get(period), extra: extraRoll.periods.get(period) ?? [],
      }));
      rows.push({sales: salesRoll.total, stock: stockTotal.finish()[0], extra: extraRoll.total});
      const note = document.querySelector("#extra-note");
      if (note) note.hidden = !(region || asin);
      output.replaceChildren();
      panel.hidden = !periods.length;
      status.textContent = periods.length ? "共 " + periods.length + (monthly ? " 个月" : " 周") : "当前筛选条件无数据。";
      if (!periods.length) return;
      const table = document.createElement("table");
      function heading(row, label, scope) {
        const cell = document.createElement("th");
        cell.scope = scope;
        cell.textContent = label;
        row.append(cell);
      }
      const head = table.createTHead().insertRow();
      for (const label of ["指标", ...periods.map(period => monthly ? period : weekLabel(period)), "所选合计"]) heading(head, label, "col");
      const body = table.createTBody();
      for (const [name, format] of definitions) {
        const row = body.insertRow();
        heading(row, name, "row");
        for (const values of rows) row.insertCell().textContent = format(values);
      }
      const scroll = document.createElement("div");
      scroll.className = "table-scroll";
      scroll.append(table);
      output.append(scroll);
    } catch (error) {
      if (current === generation) status.textContent = "数据加载失败，请重新选择日期。";
      console.error(error);
    }
  }

  function reset() {
    start.value = monthly ? first : recentThreeMonths(first, last);
    end.value = last;
    selects.forEach(select => { select.value = ""; });
    render();
  }
  [start, end, ...selects].forEach(control => control.addEventListener("change", render));
  document.querySelector("#reset").addEventListener("click", reset);
  reset();
}
initialize().catch(error => {
  document.querySelector("#status").textContent = "看板索引加载失败，请刷新重试。";
  console.error(error);
});
