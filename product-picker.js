const salesKey = (date, group, region, asin) => JSON.stringify([date, group, region, asin === "-" ? "" : asin]);

function bindProductPicker(key, caption, selected, options) {
  const search = document.querySelector("#" + key + "-search");
  const list = document.querySelector("#" + key + "-options");
  const count = document.querySelector("#" + key + "-count");
  function updateCount() {
    count.textContent = "已选 " + selected.size + " 个" + caption;
  }
  function show() {
    const term = search.value.trim().toUpperCase();
    const matches = options.filter(value => value.toUpperCase().includes(term)).slice(0, 30);
    list.replaceChildren();
    for (const value of new Set([...selected, ...matches])) {
      const label = document.createElement("label");
      const box = document.createElement("input");
      box.type = "checkbox";
      box.checked = selected.has(value);
      box.addEventListener("change", () => {
        if (box.checked) selected.add(value);
        else selected.delete(value);
        updateCount();
      });
      label.append(box, value);
      list.append(label);
    }
    updateCount();
  }
  search.addEventListener("input", show);
  return () => {
    selected.clear();
    search.value = "";
    show();
  };
}
