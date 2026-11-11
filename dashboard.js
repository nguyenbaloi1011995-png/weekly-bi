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
    const response = await fetch("./weekly.json?v=filters-v2", { cache: "no-cache" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const data = await response.json();
    if (data.simulated !== true || !Array.isArray(data.rows)) throw new Error("Invalid demo data");
    const rows = data.rows;
    const dimensions = ["group", "region", "product"];
    const keys = Object.keys(summarize([]));
    if (rows.some(row => !row || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
      !/^\d{4}-W\d{2}$/.test(row.week) ||
      dimensions.some(key => typeof row[key] !== "string" || !row[key]) ||
      keys.some(key => !Number.isFinite(row[key])) || row.sales < 0)) {
      throw new Error("Invalid demo rows");
    }

    const selects = dimensions.map(key => [key, document.getElementById(key)]);
    const dates = rows.map(row => row.date).sort();
    for (const input of [start, end]) {
      input.min = dates[0] ?? "";
      input.max = dates.at(-1) ?? "";
      input.disabled = !rows.length;
    }
    for (const [key, select] of selects) {
      const values = [...new Set(rows.map(row => row[key]))].sort();
      select.replaceChildren(new Option("全部", ""), ...values.map(value => new Option(value, value)));
      select.disabled = !rows.length;
    }

    function render() {
      const filters = Object.fromEntries(selects.map(([key, select]) => [key, select.value]));
      const selected = groupByWeek(filterRows(rows, start.value, end.value, filters));
      metrics.replaceChildren();
      bars.replaceChildren();
      trend.hidden = !selected.length;
      status.textContent = selected.length ? `共 ${selected.length} 周` :
        rows.length ? "当前条件下没有数据，请调整日期或筛选项。" : "暂无数据。";
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

      const maximum = Math.max(1, ...selected.map(row => row.sales));
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
        fill.style.width = `${row.sales / maximum * 100}%`;
        track.append(fill);
        const amount = document.createElement("span");
        amount.className = "amount";
        amount.textContent = (row.sales / 10000).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
        bar.append(label, track, amount);
        bars.append(bar);
      }
    }

    function reset() {
      start.value = dates[0] ?? "";
      end.value = dates.at(-1) ?? "";
      for (const [, select] of selects) select.value = "";
      render();
    }

    for (const control of [start, end, ...selects.map(([, select]) => select)]) {
      control.addEventListener("change", render);
    }
    document.querySelector("#reset").addEventListener("click", reset);
    reset();
  } catch (error) {
    status.textContent = "加载失败，请确认 weekly.json 可访问且格式正确。";
    console.error(error);
  }
}

if (typeof document !== "undefined") initialize();
if (typeof module !== "undefined") module.exports = { summarize, filterRows, groupByWeek, ratio };


