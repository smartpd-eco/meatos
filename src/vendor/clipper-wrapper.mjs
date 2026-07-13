const SCRIPT_URL = "/node_modules/clipper-lib/clipper.js";

const clipperLib = await loadClipperLib();

export default clipperLib;
export { clipperLib };

async function loadClipperLib() {
  if (globalThis.ClipperLib) {
    return globalThis.ClipperLib;
  }

  await loadScriptOnce(SCRIPT_URL);

  const lib = globalThis.ClipperLib;
  if (!lib) {
    throw new Error("ClipperLib browser bundle did not initialize.");
  }

  return lib;
}

function loadScriptOnce(src) {
  const registry = globalThis.__meatosScriptRegistry ?? (globalThis.__meatosScriptRegistry = new Map());
  if (registry.has(src)) {
    return registry.get(src);
  }

  const promise = new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("ClipperLib browser wrapper requires a DOM environment."));
      return;
    }

    const existing = document.querySelector(`script[data-meatos-src="${cssEscape(src)}"]`);
    if (existing) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.meatosSrc = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
    document.head.appendChild(script);
  });

  registry.set(src, promise);
  return promise;
}

function cssEscape(value) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return String(value).replace(/"/g, '\\"');
}
