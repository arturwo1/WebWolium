export function getParam(key) {
  const params = new URLSearchParams(window.location.search);
  return (params.get(key) || "").trim();
}

export function setParam(key, value, { replace = false, state = {}, drop = [] } = {}) {
  try {
    const url = new URL(window.location.href);
    for (const name of drop) url.searchParams.delete(name);
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
    window.history[replace ? "replaceState" : "pushState"](state, "", url);
  } catch { }
}
