function createBasisRollup(fields, grain, start, end, filters) {
  const index = new Map(fields.map((field, i) => [field, i]));
  const groups = new Map();
  const weeks = new Map();
  const days = ["FBA日", "国内日", "销售日"].map(name => index.get(name));
  const fbaIndex = index.get("平均FBA库存量");
  const tIndex = index.get("FBAT级库存量占比");
  const allowed = filters.map(values => new Set(values));
  const sum = values => {
    let result = null;
    for (const value of values) if (value != null) result = (result ?? 0) + value;
    return result;
  };
  const ratio = (a, b) => a == null || !b ? null : a / b;

  function add(rows) {
    for (const row of rows) {
      const day = row[0];
      if ((start && day < start) || (end && day > end)) continue;
      if (allowed.some((selection, i) => selection.size && !selection.has(row[i + 1]))) continue;
      let label = grain === "total" ? "total" : grain === "month" ? day.slice(0, 7) : day;
      if (grain === "week") {
        if (!weeks.has(day)) {
          const date = new Date(day + "T00:00:00Z");
          date.setUTCDate(date.getUTCDate() - date.getUTCDay());
          weeks.set(day, date.toISOString().slice(0, 10));
        }
        label = weeks.get(day);
      }
      if (!groups.has(label)) groups.set(label, {
        label, start: day, end: day, sums: Array(fields.length).fill(null),
        days: days.map(() => new Set()), tStock: null,
      });
      const group = groups.get(label);
      if (day < group.start) group.start = day;
      if (day > group.end) group.end = day;
      for (let i = 0; i < fields.length; i++) {
        const value = row[i + 7];
        if (value != null) group.sums[i] = (group.sums[i] ?? 0) + value;
      }
      days.forEach((i, j) => { if (row[i + 7]) group.days[j].add(day); });
      if (row[tIndex + 7] != null) {
        group.tStock = (group.tStock ?? 0) + row[tIndex + 7] * (row[fbaIndex + 7] ?? 0);
      }
    }
  }

  function finish() {
    return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label)).map(group => {
      const result = {};
      const raw = name => group.sums[index.get(name)];
      const avg = (name, i) => ratio(raw(name), group.days[i].size);
      for (const name of fields.slice(0, -3)) {
        if (name.includes("国内") && !name.includes("天数")) result[name] = avg(name, 1);
        if (name.includes("FBA") && !/天数|占比|在库\+在途/.test(name)) result[name] = avg(name, 0);
      }
      result["累计销量"] = raw("累计销量");
      result["平均每日销量"] = avg("累计销量", 2);
      result["平均FBA在库+在途数量"] = sum([result["平均FBA库存量"], result["平均FBA在途数量"]]);
      const cost = avg("平均每日销售货值", 2);
      result["平均FBA库存天数"] = ratio(-(result["平均FBA库存货值"] ?? 0), cost);
      result["平均FBA+在途库存天数"] = ratio(-((result["平均FBA库存货值"] ?? 0) + (result["平均FBA在途货值"] ?? 0)), cost);
      result["平均国内库存天数"] = ratio(-(result["平均国内库存货值"] ?? 0), avg("非GNC日均销售货值", 2));
      result["滞销率"] = ratio(sum(Object.entries(result).filter(([name]) => name.includes("滞销库存量")).map(([, value]) => value)),
        sum([result["平均FBA库存量"], result["平均国内库存量"]]));
      for (const [prefix, name] of [["", "缺货率"], ["SAB", "SAB级缺货率"], ["新品", "新品缺货率"]]) {
        result[name] = ratio(raw(prefix + "缺货销售货值") ?? 0, raw(prefix + "平均日均销售货值"));
      }
      result["FBAT级库存量占比"] = ratio(group.tStock, raw("平均FBA库存量"));
      return { label: group.label, start: group.start, end: group.end,
        sabStockoutValue: avg("SAB缺货销售货值", 0),
        values: fields.slice(0, 35).map(name => result[name] ?? null) };
    });
  }
  return { add, finish };
}
if (typeof module !== "undefined") module.exports = { createBasisRollup };
