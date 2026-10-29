import { getParam, setParam } from "@/lib/urlState.js";

export function createSettingsRoute({ paramName = "s", onPathChange }) {
  const readPath = () => getParam(paramName).split("/").filter(Boolean);

  function writePath(path, { replace = false, dropModal = false } = {}) {
    const depth = window.history.state?.settingsDepth ?? 0;
    setParam(paramName, path.join("/"), {
      replace,
      drop: dropModal ? ["modal"] : [],
      state: { settingsDepth: replace ? depth : depth + 1 }
    });
  }

  const handlePopState = () => onPathChange(readPath());

  window.addEventListener("popstate", handlePopState);

  return {
    readPath,
    writePath,
    canGoBack: () => (window.history.state?.settingsDepth ?? 0) > 0,
    goBack: () => window.history.back(),
    destroy: () => window.removeEventListener("popstate", handlePopState)
  };
}
