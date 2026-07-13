const SCRIPT_URL = "/node_modules/@techstark/opencv-js/dist/opencv.js";

const cv = await loadOpenCv();

export default cv;
export { cv };

async function loadOpenCv() {
  if (globalThis.cv) {
    return globalThis.cv;
  }

  await loadScriptOnce(SCRIPT_URL);

  if (!globalThis.cv) {
    throw new Error("OpenCV browser bundle did not initialize.");
  }

  return globalThis.cv;
}

function loadScriptOnce(src) {
  const registry = globalThis.__meatosScriptRegistry ?? (globalThis.__meatosScriptRegistry = new Map());
  if (registry.has(src)) {
    return registry.get(src);
  }

  const promise = new Promise((resolve, reject) => {
    if (typeof document === "undefined") {
      reject(new Error("OpenCV browser wrapper requires a DOM environment."));
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
