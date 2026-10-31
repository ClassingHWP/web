if (location.protocol === "chrome-extension:" && location.origin === "null") {
  await installSandboxWorkers();
}

async function installSandboxWorkers() {
  const entry = document.querySelector('script[type="module"][src*="/assets/index-"]');
  if (!entry) return;
  const texts = new Map();
  const blobs = new Map();

  function absolute(spec, base) {
    return new URL(spec, base || location.href).href;
  }

  function dependencies(text, base) {
    const found = new Set();
    for (const match of text.matchAll(/from["'](\.[^"']+)["']/g)) found.add(absolute(match[1], base));
    for (const match of text.matchAll(/\/assets\/[A-Za-z0-9._-]+\.(?:js|wasm|data)/g)) {
      found.add(absolute(match[0], location.href));
    }
    return [...found];
  }

  async function readText(href) {
    if (texts.has(href)) return texts.get(href);
    const response = await fetch(href);
    if (!response.ok) throw new Error(`${response.status} ${href}`);
    const text = await response.text();
    texts.set(href, text);
    return text;
  }

  async function walk(href, seen = new Set()) {
    if (seen.has(href) || !href.includes("/assets/")) return;
    seen.add(href);
    if (/\.(wasm|data)$/.test(href)) return;
    const text = await readText(href);
    for (const dep of dependencies(text, href)) await walk(dep, seen);
  }

  async function blobBinary(href) {
    if (blobs.has(href)) return blobs.get(href);
    const response = await fetch(href);
    if (!response.ok) throw new Error(`${response.status} ${href}`);
    const type = href.endsWith(".wasm") ? "application/wasm" : "application/octet-stream";
    const url = URL.createObjectURL(new Blob([await response.arrayBuffer()], { type }));
    blobs.set(href, url);
    return url;
  }

  function rewrite(text, href) {
    const selfName = new URL(href).pathname.split("/").pop();
    let next = text.replace(
      /new URL\(\s*\/\*\s*@vite-ignore\s*\*\/\s*`(\/assets\/noting-[^`]+\.js)`,``\+import\.meta\.url\)/g,
      (full, assetPath) => {
        const name = assetPath.split("/").pop();
        if (name === selfName) return "new URL(import.meta.url)";
        const blob = blobs.get(absolute(assetPath, location.href));
        return blob ? `new URL(${JSON.stringify(blob)})` : full;
      },
    );
    for (const [from, blob] of blobs) {
      if (from === href) continue;
      const path = new URL(from).pathname;
      next = next.split(path).join(blob);
      const file = path.split("/").pop();
      next = next.split(`"./${file}"`).join(JSON.stringify(blob));
      next = next.split(`'./${file}'`).join(JSON.stringify(blob));
    }
    return next;
  }

  async function blobScript(href, stack = new Set()) {
    if (blobs.has(href)) return blobs.get(href);
    if (stack.has(href)) return "";
    stack.add(href);
    let text = await readText(href);
    for (const dep of dependencies(text, href)) {
      if (dep === href) continue;
      if (/\.(wasm|data)$/.test(dep)) await blobBinary(dep);
      else await blobScript(dep, stack);
    }
    text = rewrite(text, href);
    const url = URL.createObjectURL(new Blob([text], { type: "text/javascript" }));
    blobs.set(href, url);
    return url;
  }

  const indexHref = absolute(entry.getAttribute("src"), location.href);
  await walk(indexHref);
  for (const href of texts.keys()) {
    if (!blobs.has(href)) await blobScript(href);
  }

  const NativeWorker = globalThis.Worker;
  globalThis.Worker = function Worker(scriptURL, options) {
    const href = scriptURL instanceof URL
      ? scriptURL.href
      : absolute(String(scriptURL), location.href);
    const blob = blobs.get(href);
    return new NativeWorker(blob || scriptURL, options);
  };
}
