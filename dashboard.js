function summarize(weeks) {
  const totals = { sales: 0, units: 0, orders: 0, grossProfit: 0, adSpend: 0 };
  for (const week of weeks) {
    for (const key of Object.keys(totals)) totals[key] += week[key];
  }
  return totals;
}

function selectWeeks(weeks, start, end) {
  return weeks.filter(({ week }) => week >= start && week <= end);
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
    const response = await fetch("./weekly.json", { cache: "no-cache" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    const data = await response.json();
    if (data.simulated !== true || !Array.isArray(data.weeks)) throw new Error("Invalid demo data");
    const weeks = [...data.weeks].sort((a, b) => a.week.localeCompare(b.week));
    const keys = Object.keys(summarize([]));
    if (new Set(weeks.map(row => row.week)).size !== weeks.length ||
      weeks.some(row => !/^\d{4}-W(0[1-9]|[1-4]\d|5[0-3])$/.test(row.week) ||
        keys.some(key => !Number.isFinite(row[key])) || row.sales < 0)) {
      throw new Error("Invalid weekly rows");
    }

    for (const select of [start, end]) {
      select.replaceChildren(...weeks.map(({ week }) => new Option(week, week)));
    }
    for (const control of [start, end, document.querySelector("#reset")]) control.disabled = !weeks.length;

    function render() {
      const selected = selectWeeks(weeks, start.value, end.value);
      metrics.replaceChildren();
      bars.replaceChildren();
      trend.hidden = !selected.length;
      status.textContent = selected.length ? `共 ${selected.length} 周` :
        weeks.length ? "所选范围没有数据，请调整起止周。" : "暂无周数据。";
      if (!selected.length) return;

      const { sales, units, orders, grossProfit, adSpend } = summarize(selected);
      const cards = [
        ["累计销售额", currency.format(sales)],
        ["累计销量", integer.format(units)],
        ["累计订单量", integer.format(orders)],
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
      start.selectedIndex = weeks.length ? 0 : -1;
      end.selectedIndex = weeks.length - 1;
      render();
    }

    start.addEventListener("change", render);
    end.addEventListener("change", render);
    document.querySelector("#reset").addEventListener("click", reset);
    reset();
  } catch (error) {
    status.textContent = "加载失败，请确认 weekly.json 可访问且格式正确。";
    console.error(error);
  }
}

if (typeof document !== "undefined") initialize();
if (typeof module !== "undefined") module.exports = { summarize, selectWeeks, ratio };
