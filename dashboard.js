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

function groupByWeek(rows) {
  const weeks = new Map();
  for (const row of rows) {
    if (!weeks.has(row.week)) weeks.set(row.week, []);
    weeks.get(row.week).push(row);
  }
  return [...weeks].sort(([a], [b]) => a.localeCompare(b))
    .map(([week, members]) => ({ week, ...summarize(members) }));
}
function ratio(value, sales) {
  return sales === 0 ? "—" : percent.format(value / sales);
}

const currency = new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 });
const integer = new Intl.NumberFormat("zh-CN");
const percent = new Intl.NumberFormat("zh-CN", { style: "percent", minimumFractionDigits: 1, maximumFractionDigits: 1 });

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
      const selected = groupByWeek(filterRows(rows, from, to, filters));
      metrics.replaceChildren();
      bars.replaceChildren();
      trend.hidden = !selected.length;
      status.textContent = selected.length ? `共 ${selected.length} 周` :
        "当前条件下没有数据，请调整日期或筛选项。";
      if (!selected.length) return;

      const { sales, units, orders, grossProfit, adSpend } = summarize(selected);
      const cards = [
        ["累计销售额", currency.format(sales)],
        ["累计销量", integer.format(units)],
        ["产品订单数", integer.format(orders)],
        ["累计毛利率", ratio(grossProfit, sales)],
        ["累计广告花费", currency.format(adSpend)],
        ["广告花费占比", ratio(adSpend, sales)],
      ];
      for (const [label, value] of cards) {
        const card = document.createElement("article");
        card.className = "card";
        const title = document.createElement("h2");
        title.textContent = label;
        const result = document.createElement("p");
        result.textContent = value;
        card.append(title, result);
        metrics.append(card);
      }

      const maximum = selected.reduce((max, row) => Math.max(max, Math.abs(row.sales)), 1);
      for (const row of selected) {
        const bar = document.createElement("div");
        bar.className = "bar-row";
        const label = document.createElement("span");
        label.textContent = row.week;
        const track = document.createElement("div");
        track.className = "track";
        track.setAttribute("aria-hidden", "true");
        const fill = document.createElement("div");
        fill.className = "fill";
        fill.style.width = `${Math.abs(row.sales) / maximum * 100}%`;
        track.append(fill);
        const amount = document.createElement("span");
        amount.className = "amount";
        amount.textContent = (row.sales / 10000).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
        bar.append(label, track, amount);
        bars.append(bar);
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



