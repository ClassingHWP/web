// 웹 코어. UI 스레드와 메시지로만 이야기한다.
// 앱은 같은 op 를 자기 프로세스 통신으로 코어에 넘기면 된다.
//
// boot                 wasm 을 올리고 글꼴 목록 요청을 시작한다
// fonts                글꼴 목록이 코어에 들어갔는지 기다린다
// prefetchFonts        목록에 있는 글꼴의 주소만 돌려준다. 없는 글꼴은 빼 둔다
// installFonts         받아 온 글꼴 바이트를 코어에 넣는다
// fontFiles            문서가 요청한 글꼴 받기가 끝났는지 본다. 바이트는 도착하는 대로 이미 코어에 들어간다
// parse                문서 JSON
// open                 문서 모델을 연다
// export { format }    열린 문서를 hwp 또는 hwpx 바이트로 내보낸다
// plan { lineSeg, measured }  우리 조판으로 쪽을 나눈다. lineSeg 면 저장된 줄 높이만 빌린다. 글꼴은 셸이 넣은 뒤의 메모리만 쓴다
//                       measured 면 lineseg 의 줄 경계만 쓰고 높이는 우리 측정값이다(한글과 견주기용)
// beginGrind           글꼴을 넣은 뒤, 화면 스레드를 빼고 나머지 스레드가 칸을 굽기 시작한다
// render { page, pixelHeight, view }  요청한 칸의 글리프만 찍어 픽셀을 돌려준다
// view { patch }                 스크롤·배율·칸 선택을 코어에 맡기고 그릴 목록을 받는다

import { toSfnt } from "../font-sfnt.mjs";
import { fontBase } from "./font-base.js";
import createNotingModulePthread from "@wasm/noting.mjs";
import createNotingModuleSingle from "@wasm/noting-single.mjs";
import wasmPthreadUrl from "@wasm/noting.wasm?url";
import wasmSingleUrl from "@wasm/noting-single.wasm?url";
import dataUrl from "@wasm/noting.data?url";

let noting = null;
let notingThreaded = false;
let viewCanvas = null;
let viewSurface = false;
let fontsReady = Promise.resolve();
let fontCatalog = {};
let fontReplace = {};
let fontJob = Promise.resolve({ 요청: 0, 받음: 0, ms: 0 });
const fontLoaded = new Set();
let captureStdout = false;
const capturedStdout = [];

function formatError(error) {
  if (!error) return String(error);
  if (typeof error === "string") return error;
  return error.stack || error.message || String(error);
}

function sendWorkerError(errorData) {
  console.log(errorData);
  try {
    self.postMessage({ errorLog: errorData });
  } catch {
    // postMessage 실패 시 무시
  }
}

const NativeWorker = globalThis.Worker;
if (typeof NativeWorker === "function") {
  globalThis.Worker = class extends NativeWorker {
    constructor(scriptURL, options) {
      super(scriptURL, options);
      this.onerror = function (errorEvent) {
        const errorData = `[Worker Error]\nMessage: ${errorEvent.message}\nFile: ${errorEvent.filename}\nLine: ${errorEvent.lineno}`;
        sendWorkerError(errorData);
      };
    }
  };
}

self.addEventListener("error", (errorEvent) => {
  const errorData = `[Worker Error]\nMessage: ${errorEvent.message}\nFile: ${errorEvent.filename}\nLine: ${errorEvent.lineno}`;
  sendWorkerError(errorData);
});

self.addEventListener("unhandledrejection", (event) => {
  const errorData = `[Worker Error]\nMessage: ${formatError(event.reason)}`;
  sendWorkerError(errorData);
});

function onStdout(text) {
  for (const part of String(text).split("\n")) {
    const line = part.trim();
    if (!line) continue;
    if (captureStdout && line.startsWith("{")) {
      try {
        capturedStdout.push(JSON.parse(line));
        continue;
      } catch {
        // JSON 이 아니면 아래 로그로 남긴다.
      }
    }
    if (line.startsWith("[noting 오류]")) {
      self.postMessage({ errorLog: line, log: line });
      continue;
    }
    self.postMessage({ log: line });
  }
}

function readBar(bar) {
  return {
    x: bar?.x | 0,
    y: bar?.y | 0,
    w: bar?.w | 0,
    h: bar?.h | 0,
    thumbX: bar?.thumbX | 0,
    thumbY: bar?.thumbY | 0,
    thumbW: bar?.thumbW | 0,
    thumbH: bar?.thumbH | 0,
    visible: !!bar?.visible,
  };
}

function readCursorStyle(st) {
  if (!st || typeof st !== "object") return null;
  const fontSize = st.fontSize | 0;
  return {
    active: !!st.active,
    styleId: st.styleId >>> 0,
    styleName: typeof st.styleName === "string" ? st.styleName : "",
    styleEngName: typeof st.styleEngName === "string" ? st.styleEngName : "",
    styleType: typeof st.styleType === "string" ? st.styleType : "PARA",
    paraShapeId: st.paraShapeId >>> 0,
    align: typeof st.align === "string" ? st.align : "JUSTIFY",
    lineSpacingType: typeof st.lineSpacingType === "string" ? st.lineSpacingType : "PERCENT",
    lineSpacing: st.lineSpacing | 0,
    charShapeId: st.charShapeId >>> 0,
    font: typeof st.font === "string" ? st.font : "",
    fontSwapTo: typeof st.fontSwapTo === "string" ? st.fontSwapTo : "",
    fontSize,
    fontSizePt: Number(st.fontSizePt) || (fontSize > 0 ? fontSize / 100 : 10),
    bold: !!st.bold,
    italic: !!st.italic,
    underline: !!st.underline,
    underlineType: typeof st.underlineType === "string" ? st.underlineType : "NONE",
    strikeout: !!st.strikeout,
    color: typeof st.color === "string" ? st.color : "#000000",
    caret: readCaretStatus(st.caret),
  };
}

// 상태 줄의 단·줄·칸·구역.
function readCaretStatus(st) {
  if (!st || typeof st !== "object") return null;
  return {
    active: !!st.active,
    section: st.section | 0,
    sectionCount: st.sectionCount | 0,
    column: st.column | 0,
    line: st.line | 0,
    char: st.char | 0,
    band: st.band | 0,
  };
}

function readPlan(plan) {
  if (!plan) return null;
  const draw = [];
  for (let i = 0; i < plan.draw.length; i++) {
    const item = plan.draw[i];
    draw.push({
      id: item.id | 0,
      x: item.x | 0,
      y: item.y | 0,
      w: item.w | 0,
      h: item.h | 0,
      nearest: !!item.nearest,
      layer: item.layer | 0,
    });
  }
  const drop = [];
  for (let i = 0; i < plan.drop.length; i++) drop.push(plan.drop[i] | 0);
  const source = plan.job;
  const job = source && source.id ? {
    id: source.id | 0,
    generation: source.generation | 0,
    page: source.page | 0,
    percent: source.percent | 0,
    pixelHeight: source.pixelHeight | 0,
    col: source.col | 0,
    row: source.row | 0,
    x: source.x | 0,
    y: source.y | 0,
    w: source.w | 0,
    h: source.h | 0,
    contentW: source.contentW | 0,
    contentH: source.contentH | 0,
    layer: source.layer | 0,
    frame: source.frame | 0,
    background: !!source.background,
  } : null;
  return {
    generation: plan.generation | 0,
    dpr: Number(plan.dpr) || 1,
    viewW: plan.viewW | 0,
    viewH: plan.viewH | 0,
    percent: plan.percent | 0,
    fitPage: !!plan.fitPage,
    fitWidth: !!plan.fitWidth,
    zoomMode: plan.fitPage ? "fitPage" : (plan.fitWidth ? "fitWidth" : "percent"),
    zoomLabel: typeof plan.zoomLabel === "string"
      ? plan.zoomLabel
      : (plan.fitPage ? "쪽 맞춤" : (plan.fitWidth ? "폭 맞춤" : `${plan.percent | 0}%`)),
    contentW: plan.contentW | 0,
    contentH: plan.contentH | 0,
    scrollX: plan.scrollX | 0,
    scrollY: plan.scrollY | 0,
    maxScrollX: plan.maxScrollX | 0,
    maxScrollY: plan.maxScrollY | 0,
    paperX: plan.paperX | 0,
    paperY: plan.paperY | 0,
    paperW: plan.paperW | 0,
    paperH: plan.paperH | 0,
    page: plan.page | 0,
    gridMode: typeof plan.gridMode === "string" ? plan.gridMode : "auto",
    gridCols: plan.gridCols | 0,
    gridRows: plan.gridRows | 0,
    effectiveCols: plan.effectiveCols | 0,
    rowStepY: plan.rowStepY | 0,
    pageStepY: plan.pageStepY | 0,
    ruler: plan.ruler | 0,
    pages: Array.from(plan.pages || [], (item) => ({
      index: item.index | 0,
      x: item.x | 0,
      y: item.y | 0,
      w: item.w | 0,
      h: item.h | 0,
      marginLeft: item.marginLeft | 0,
      marginRight: item.marginRight | 0,
      marginTop: item.marginTop | 0,
      marginBottom: item.marginBottom | 0,
      row: item.row | 0,
      col: item.col | 0,
      outerX: item.outerX | 0,
      outerY: item.outerY | 0,
      outerW: item.outerW | 0,
      outerH: item.outerH | 0,
    })),
    committed: !!plan.committed,
    barX: readBar(plan.barX),
    barY: readBar(plan.barY),
    drop,
    draw,
    job,
  };
}

function canUseWasmThreads() {
  try {
    if (globalThis.name === "single") return false;
    if (!globalThis.crossOriginIsolated || typeof SharedArrayBuffer === "undefined") {
      return false;
    }
    const mem = new WebAssembly.Memory({ initial: 1, maximum: 1, shared: true });
    return mem.buffer instanceof SharedArrayBuffer;
  } catch {
    return false;
  }
}

function makeLocateFile(targetWasmUrl) {
  return function locateFile(file) {
    if (file.endsWith(".wasm")) return targetWasmUrl;
    if (file.endsWith(".data")) return dataUrl;
    return file;
  };
}

function fontUrl(kind, name) {
  return fontBase + kind + "/" + encodeURIComponent(name);
}

// 목록에 있는 파일만 주소가 있다. 없는 글꼴은 요청하지 않는다.
function fontFileUrl(face) {
  const named = fontCatalog[face];
  if (typeof named !== "string" || !named) return "";
  if (named.startsWith("metrics/")) return fontUrl("metrics", named.slice("metrics/".length));
  if (named.startsWith("full/")) return fontUrl("full", named.slice("full/".length));
  // 막힌 글꼴의 대역. 파일은 full 폴더에 같이 있다.
  if (named.startsWith("standin/")) return fontUrl("full", named.slice("standin/".length));
  return "";
}

function startDocumentFonts(faces) {
  // 글꼴 목록이 오기 전에 문서를 열면 주소를 하나도 못 찾는다. 목록을 기다린 뒤 받을 글꼴을 고른다.
  fontJob = fontsReady.then(() => fetchDocumentFonts(faces));
}

function fetchDocumentFonts(faces) {
  const jobs = fontJobsFor(faces);
  const started = Date.now();
  if (!jobs.length) return Promise.resolve({ 요청: 0, 받음: 0, ms: 0 });
  let got = 0;
  return Promise.all(jobs.map(async (job) => {
    try {
      const response = await fetch(job.url);
      if (!response.ok) {
        console.log("[noting 오류:font-fetch]", job.face, job.url, response.status);
        return;
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.length < 12) return;
      const faces = job.faces.filter((face) => face && !fontLoaded.has(face));
      if (faces.length) {
        // 압축을 풀고 등록하는 일은 코어 스레드가 한다. 끝나기는 아래 waitFontDecodes 가 기다린다.
        noting.decodeFont(faces, bytes);
        for (const face of faces) fontLoaded.add(face);
      }
      job.installed = true;
      got += 1;
    } catch (error) {
      console.log("[noting 오류:font-fetch]", job.face || job.url, formatError(error));
    }
  })).then(waitFontDecodes).then(() => {
    applyFontReplacements(jobs);
    return { 요청: jobs.length, 받음: got, ms: Date.now() - started };
  });
}

// 단일 스레드 코어는 decodeFont 안에서 등록까지 끝내므로 바로 넘어간다.
async function waitFontDecodes() {
  while (noting.fontDecodesPending() > 0) {
    await new Promise((resolve) => setTimeout(resolve, 4));
  }
}

function fontJobsFor(faces) {
  const jobs = [];
  const seen = new Set();
  const byUrl = new Map();
  const requested = [...(faces ?? []), "함초롬바탕", "함초롬돋움"];
  for (const face of requested) {
    if (!face || seen.has(face)) continue;
    const next = typeof fontReplace[face] === "string" ? fontReplace[face] : "";
    const replaced = next && next !== face;
    const fetchFace = replaced ? next : face;
    if (!replaced && fontLoaded.has(face)) continue;
    seen.add(face);
    const url = fontFileUrl(fetchFace);
    if (!url) continue;
    let entry = byUrl.get(url);
    if (!entry) {
      entry = { face: fetchFace, faces: [fetchFace], url, replacements: [] };
      byUrl.set(url, entry);
      jobs.push(entry);
    } else if (!entry.faces.includes(fetchFace)) {
      entry.faces.push(fetchFace);
    }
    if (replaced) entry.replacements.push({ from: face, to: next });
  }
  return jobs;
}

function applyFontReplacements(jobs) {
  for (const job of jobs) {
    if (!job.installed) continue;
    for (const swap of job.replacements || []) {
      noting.replaceFontFace(swap.from, swap.to);
    }
  }
}

async function loadFontCatalog() {
  const started = Date.now();
  let catalog = {};
  for (const url of [fontBase + "index.json"]) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const body = await response.json();
      if (body && typeof body === "object" && !Array.isArray(body) && Object.keys(body).length) {
        catalog = body;
        break;
      }
    } catch {
      // 빌드 글꼴 목록이 없으면 빈 목록으로 둔다.
    }
  }
  try {
    fontCatalog = catalog;
    noting.setFontCatalog(JSON.stringify(catalog));
    const swapResponse = await fetch(fontBase + "license-swap.json");
    if (swapResponse.ok) {
      const swaps = await swapResponse.json();
      if (swaps && typeof swaps === "object" && !Array.isArray(swaps)) noting.setFontLicenseSwaps(JSON.stringify(swaps));
    }
    const replaceResponse = await fetch(fontBase + "replace.json");
    if (replaceResponse.ok) {
      const listed = await replaceResponse.json();
      if (listed && typeof listed === "object" && !Array.isArray(listed)) fontReplace = listed;
    }
  } catch (error) {
    fontCatalog = {};
    noting.setFontCatalog("{}");
    console.warn("font catalog", error);
  }
  return Date.now() - started;
}

async function boot() {
  const started = Date.now();
  // Skia WebGL 은 이 캔버스의 컨텍스트로 그림을 확대한 뒤 픽셀만 본문에 붙인다.
  const makeModuleOpts = (targetWasmUrl) => ({
    locateFile: makeLocateFile(targetWasmUrl),
    canvas: new OffscreenCanvas(64, 64),
    print: onStdout,
    printErr: onStdout,
    onAbort(what) {
      sendWorkerError(`[Worker Error]\nMessage: Aborted(${what})`);
    },
  });
  if (canUseWasmThreads()) {
    try {
      noting = await createNotingModulePthread(makeModuleOpts(wasmPthreadUrl));
      notingThreaded = true;
    } catch (error) {
      onStdout(`[noting] 멀티스레드 부팅 실패 → 단일 스레드로 전환 (${formatError(error)})`);
      noting = await createNotingModuleSingle(makeModuleOpts(wasmSingleUrl));
      notingThreaded = false;
    }
  } else {
    onStdout("[noting] SharedArrayBuffer 미지원 환경 → 단일 스레드 WASM 폴백");
    noting = await createNotingModuleSingle(makeModuleOpts(wasmSingleUrl));
    notingThreaded = false;
  }
  noting.onFontFaces = (faces) => {
    const names = [];
    const count = faces?.length | 0;
    for (let i = 0; i < count; i += 1) {
      const name = faces[i];
      if (name) names.push(String(name));
    }
    startDocumentFonts(names);
    self.postMessage({ fontFaces: names });
  };
  noting.onCamera = (x, y, percent, coasting, pinching, page, pageCount, fitPage, fitWidth, viewW, viewH, maxScrollX, maxScrollY, dpr) => {
    self.postMessage({
      camera: {
        scrollX: x | 0,
        scrollY: y | 0,
        percent: percent | 0,
        fitPage: !!fitPage,
        fitWidth: !!fitWidth,
        zoomMode: fitPage ? "fitPage" : (fitWidth ? "fitWidth" : "percent"),
        zoomLabel: fitPage ? "쪽 맞춤" : (fitWidth ? "폭 맞춤" : `${percent | 0}%`),
        coasting: !!coasting,
        pinching: !!pinching,
        page: page | 0,
        pageCount: pageCount | 0,
        viewW: viewW | 0,
        viewH: viewH | 0,
        maxScrollX: maxScrollX | 0,
        maxScrollY: maxScrollY | 0,
        dpr: Number(dpr) > 0 ? Number(dpr) : 1,
      },
    });
  };
  const coreMs = Date.now() - started;
  fontsReady = loadFontCatalog();
  return { coreMs, threaded: notingThreaded };
}

self.onmessage = async (event) => {
  const msg = event.data || {};
  try {
    if (msg.op === "boot") {
      const result = await boot();
      self.postMessage({ id: msg.id, ok: true, result });
      return;
    }
    if (!noting) throw new Error("코어가 아직 준비되지 않았습니다.");
    if (msg.op === "fonts") {
      const ms = await fontsReady;
      self.postMessage({ id: msg.id, ok: true, result: { ms } });
      return;
    }
    if (msg.op === "prefetchFonts") {
      await fontsReady;
      self.postMessage({ id: msg.id, ok: true, result: fontJobsFor(msg.faces) });
      return;
    }
    if (msg.op === "beginGrind") {
      noting.beginGrind();
      self.postMessage({ id: msg.id, ok: true, result: true });
      return;
    }
    if (msg.op === "replaceFontFace") {
      const changed = noting.replaceFontFace(String(msg.from || ""), String(msg.to || "")) | 0;
      self.postMessage({ id: msg.id, ok: true, result: changed });
      return;
    }
    if (msg.op === "installFonts") {
      let loaded = 0;
      for (const item of msg.files || []) {
        const bytes = item?.bytes instanceof Uint8Array ? item.bytes : new Uint8Array(item?.bytes || []);
        const names = Array.isArray(item?.faces) && item.faces.length ? item.faces : (item?.face ? [item.face] : []);
        if (!names.length || bytes.length < 12) continue;
        let sentBytes = false;
        for (const face of names) {
          if (!face || fontLoaded.has(face)) continue;
          noting.loadFont(face, sentBytes ? new Uint8Array(0) : bytes);
          sentBytes = true;
          fontLoaded.add(face);
          loaded += 1;
        }
      }
      self.postMessage({ id: msg.id, ok: true, result: loaded });
      return;
    }
    if (msg.op === "fontFiles") {
      const result = await fontJob;
      self.postMessage({ id: msg.id, ok: true, result });
      return;
    }
    if (msg.op === "ensurePageSpans") {
      self.postMessage({ id: msg.id, ok: true, result: noting.ensurePageSpans(msg.page | 0) });
      return;
    }
    if (msg.op === "pageFaces") {
      self.postMessage({ id: msg.id, ok: true, result: noting.pageFaces(msg.page | 0) });
      return;
    }
    if (msg.op === "documentFaces") {
      self.postMessage({ id: msg.id, ok: true, result: noting.documentFaces() });
      return;
    }
    if (msg.op === "warmDocument") {
      await fontsReady;
      await fontJob;
      self.postMessage({ id: msg.id, ok: true, result: noting.warmDocument(msg.percent | 0) });
      return;
    }
    if (msg.op === "warmGlyphs") {
      await fontsReady;
      await fontJob;
      self.postMessage({ id: msg.id, ok: true, result: noting.warmGlyphs(msg.page | 0, msg.percent | 0) });
      return;
    }
    if (msg.op === "preparePage") {
      await fontsReady;
      const step = noting.preparePage(msg.page | 0, msg.percent | 0, msg.focusY | 0);
      self.postMessage({
        id: msg.id,
        ok: true,
        result: { made: step.made | 0, done: !!step.done },
      });
      return;
    }
    if (msg.op === "idle") {
      await fontsReady;
      const step = noting.idle(msg.patch || {});
      self.postMessage({
        id: msg.id,
        ok: true,
        result: {
          more: !!step.more,
          screen: !!step.screen,
          made: step.made | 0,
          view: readPlan(step.view),
        },
      });
      return;
    }
    if (msg.op === "readyPages") {
      noting.setReadyPages(msg.pages || []);
      self.postMessage({ id: msg.id, ok: true, result: true });
      return;
    }
    if (msg.op === "parse") {
      const json = noting.parse(msg.bytes, !!msg.pretty, !!msg.lineSegs);
      self.postMessage({ id: msg.id, ok: true, result: json });
      return;
    }
    if (msg.op === "open" || msg.op === "new") {
      const info = msg.op === "new" ? noting.newDocument() : noting.openDocument(msg.bytes);
      msg.bytes = null;
      const faces = [];
      const list = info?.faces;
      const count = list ? list.length : 0;
      for (let i = 0; i < count; i += 1) {
        if (list[i]) faces.push(String(list[i]));
      }
      self.postMessage({
        id: msg.id,
        ok: true,
        result: {
          ok: info ? !!info.ok : true,
          error: typeof info?.error === "string" ? info.error : "",
          faces,
          cursorStyle: readCursorStyle(noting.cursorStyle()),
        },
      });
      return;
    }
    if (msg.op === "trimCaches") {
      noting.trimCaches(msg.level | 0);
      self.postMessage({ id: msg.id, ok: true, result: true });
      return;
    }
    if (msg.op === "setCacheBudget") {
      const ok = noting.setCacheBudget(String(msg.name || ""), Number(msg.bytes));
      self.postMessage({ id: msg.id, ok: true, result: !!ok });
      return;
    }
    if (msg.op === "cacheUsage") {
      self.postMessage({ id: msg.id, ok: true, result: JSON.parse(noting.cacheUsage()) });
      return;
    }
    if (msg.op === "cursorStyle") {
      self.postMessage({ id: msg.id, ok: true, result: readCursorStyle(noting.cursorStyle()) });
      return;
    }
    if (msg.op === "hover") {
      self.postMessage({ id: msg.id, ok: true, result: String(noting.hoverCursor(Number(msg.x) || 0, Number(msg.y) || 0)) });
      return;
    }
    if (msg.op === "export") {
      const bytes = noting.exportDocument(String(msg.format || ""));
      if (!bytes || typeof bytes.length !== "number" || bytes.length === 0) {
        throw new Error("저장에 실패했습니다.");
      }
      const copy = new Uint8Array(bytes);
      self.postMessage({ id: msg.id, ok: true, result: copy }, [copy.buffer]);
      return;
    }
    if (msg.op === "plan") {
      await fontsReady;
      captureStdout = true;
      capturedStdout.length = 0;
      let json = "";
      try {
        noting.setMeasuredLineHeight(!!msg.measured);
        json = noting.planDocument(!!msg.lineSeg);
      } finally {
        captureStdout = false;
      }
      const detail = capturedStdout.splice(0);
      self.postMessage({ id: msg.id, ok: true, result: { json, detail } });
      return;
    }
    function caretResult(place) {
      return place && place.hit
        ? {
          hit: true,
          x: place.x | 0,
          y: place.y | 0,
          h: place.h | 0,
          page: place.page | 0,
          story: place.story | 0,
          para: place.para | 0,
          offset: place.offset | 0,
          cursorStyle: readCursorStyle(place.cursorStyle),
        }
        : { hit: false };
    }
    if (msg.op === "caret") {
      const place = noting.caretAt(msg.page | 0, msg.x | 0, msg.y | 0);
      self.postMessage({ id: msg.id, ok: true, result: caretResult(place) });
      return;
    }
    if (msg.op === "caretStory") {
      const place = noting.caretInStory(msg.page | 0, msg.x | 0, msg.y | 0, msg.story | 0);
      self.postMessage({ id: msg.id, ok: true, result: caretResult(place) });
      return;
    }
    if (msg.op === "block") {
      const marks = noting.blockMarks(msg.story | 0, msg.aPara | 0, msg.aOff | 0, msg.bPara | 0, msg.bOff | 0);
      const boxes = [];
      for (let i = 0; i < marks.length; i += 1) {
        const mark = marks[i];
        boxes.push({
          page: mark.page | 0,
          x: mark.x | 0,
          y: mark.y | 0,
          w: mark.w | 0,
          h: mark.h | 0,
        });
      }
      self.postMessage({ id: msg.id, ok: true, result: boxes });
      return;
    }
    if (msg.op === "surface") {
      if (msg.nogpu && typeof navigator !== "undefined") {
        try {
          Object.defineProperty(navigator, "gpu", { value: undefined, configurable: true });
        } catch {
          // ignore
        }
      }
      viewCanvas = msg.canvas;
      noting.canvas = msg.canvas;
      // 이 빌드의 WebGL 은 "#canvas" 를 document 에서 찾는다. 워커에는 문서가 없다.
      if (!globalThis.document) {
        globalThis.document = {
          querySelector(selector) {
            return selector === "#canvas" ? noting.canvas : null;
          },
          getElementById(id) {
            return id === "canvas" ? noting.canvas : null;
          },
        };
      }
      viewSurface = !!noting.attachScreen();
      const deadline = performance.now() + 8000;
      while (viewSurface && !noting.screenReady() && performance.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 16));
      }
      viewSurface = viewSurface && !!noting.screenReady();
      self.postMessage({ id: msg.id, ok: true, result: viewSurface });
      return;
    }
    if (msg.op === "present") {
      const w = msg.w | 0;
      const h = msg.h | 0;
      // 캔버스가 붙으면 프레임 루프가 최종 화면을 낸다. 여기서 다시 그리면 제출이 두 번이다.
      if (viewSurface) {
        self.postMessage({ id: msg.id, ok: true, result: { ok: true, more: false } });
        return;
      }
      if (!viewCanvas || w <= 0 || h <= 0) {
        self.postMessage({ id: msg.id, ok: true, result: false });
        return;
      }
      if (viewCanvas.width !== w || viewCanvas.height !== h) {
        viewCanvas.width = w;
        viewCanvas.height = h;
      }
      const ok = noting.presentView(w, h, msg.scrollX | 0, msg.scrollY | 0, msg.layoutZoom | 0, !!msg.dragging);
      const more = ok && noting.glyphMasksPending();
      if (!ok) self.postMessage({ log: `화면 표시 실패 ${w}×${h}` });
      self.postMessage({ id: msg.id, ok: true, result: { ok: !!ok, more: !!more } });
      return;
    }
    if (msg.op === "input") {
      const camera = noting.inputEvent(msg.event || {});
      self.postMessage({
        id: msg.id,
        ok: true,
        result: {
          scrollX: camera.scrollX | 0,
          scrollY: camera.scrollY | 0,
          maxScrollX: camera.maxScrollX | 0,
          maxScrollY: camera.maxScrollY | 0,
          percent: camera.percent | 0,
          fitPage: !!camera.fitPage,
          fitWidth: !!camera.fitWidth,
          zoomMode: camera.fitPage ? "fitPage" : (camera.fitWidth ? "fitWidth" : "percent"),
          zoomLabel: typeof camera.zoomLabel === "string"
            ? camera.zoomLabel
            : (camera.fitPage ? "쪽 맞춤" : (camera.fitWidth ? "폭 맞춤" : `${camera.percent | 0}%`)),
          gridMode: typeof camera.gridMode === "string" ? camera.gridMode : "auto",
          gridCols: camera.gridCols | 0,
          gridRows: camera.gridRows | 0,
          effectiveCols: camera.effectiveCols | 0,
          rowStepY: camera.rowStepY | 0,
          pageStepY: camera.pageStepY | 0,
          page: camera.page | 0,
          pageCount: camera.pageCount | 0,
          scrollChanged: !!camera.scrollChanged,
          zoomChanged: !!camera.zoomChanged,
          coasting: !!camera.coasting,
          handled: !!camera.handled,
          pinching: !!camera.pinching,
          draggingBar: !!camera.draggingBar,
          wheeling: !!camera.wheeling,
          panning: !!camera.panning,
          select: !!camera.select,
          selectPhase: camera.selectPhase | 0,
          pinTap: !!camera.pinTap,
          active: !!camera.active,
          caret: !!camera.caret,
          cursorStyle: camera.select ? readCursorStyle(camera.cursorStyle) : null,
          event: typeof camera.event === "string" ? camera.event : "",
          text: typeof camera.text === "string" ? camera.text : undefined,
          rotation: Number(camera.rotation) || 0,
          barX: readBar(camera.barX),
          barY: readBar(camera.barY),
        },
      });
      return;
    }
    function unpackSelectionImages(packed) {
      const images = [];
      const transfers = [];
      const list = packed?.images;
      const count = list ? list.length : 0;
      for (let i = 0; i < count; i += 1) {
        const image = list[i];
        if (viewSurface && !image.caret) continue;
        const view = new Uint8Array(image.pixels);
        const pixels = view.slice();
        transfers.push(pixels.buffer);
        images.push({
          page: image.page | 0,
          x: image.x | 0,
          y: image.y | 0,
          w: image.w | 0,
          h: image.h | 0,
          pageW: image.pageW | 0,
          pageH: image.pageH | 0,
          caret: !!image.caret,
          pixels,
        });
      }
      return { images, transfers };
    }
    function unpackEditResult(packed) {
      const { images, transfers } = unpackSelectionImages(packed);
      const pages = [];
      const pageList = packed?.pages;
      const pageCount = pageList ? pageList.length : 0;
      for (let i = 0; i < pageCount; i += 1) {
        const p = pageList[i];
        pages.push({
          width: p.width | 0,
          height: p.height | 0,
          marginLeft: p.marginLeft | 0,
          marginRight: p.marginRight | 0,
          marginTop: p.marginTop | 0,
          marginBottom: p.marginBottom | 0,
        });
      }
      return {
        result: {
          handled: !!packed?.handled,
          documentChanged: !!packed?.documentChanged,
          fullInvalidation: !!packed?.fullInvalidation,
          composing: !!packed?.composing,
          needsFontSwap: !!packed?.needsFontSwap,
          dirtySection: packed?.dirtySection | 0,
          dirtyStory: packed?.dirtyStory | 0,
          dirtyParagraph: packed?.dirtyParagraph | 0,
          active: !!packed?.active,
          caret: !!packed?.caret,
          hasSelection: !!packed?.hasSelection,
          page: packed?.page | 0,
          story: packed?.story | 0,
          para: packed?.para | 0,
          offset: packed?.offset | 0,
          caretX: packed?.caretX | 0,
          caretY: packed?.caretY | 0,
          caretH: packed?.caretH | 0,
          scrollX: Number.isFinite(packed?.scrollX) ? (packed.scrollX | 0) : undefined,
          scrollY: Number.isFinite(packed?.scrollY) ? (packed.scrollY | 0) : undefined,
          cursorStyle: readCursorStyle(packed?.cursorStyle),
          text: typeof packed?.text === "string" ? packed.text : "",
          pages,
          images,
        },
        transfers,
      };
    }
    if (msg.op === "pointer") {
      await fontsReady;
      const packed = noting.pointerEvent(msg.kind | 0, msg.page | 0, msg.x | 0, msg.y | 0, msg.percent | 0);
      const { images, transfers } = unpackSelectionImages(packed);
      self.postMessage({
        id: msg.id,
        ok: true,
        result: {
          active: !!packed.active,
          story: packed.story | 0,
          caret: !!packed.caret,
          cursorStyle: readCursorStyle(packed.cursorStyle),
          images,
          event: typeof packed.event === "string" ? packed.event : "",
          text: typeof packed.text === "string" ? packed.text : undefined,
        },
      }, transfers);
      return;
    }
    if (msg.op === "editText") {
      await fontsReady;
      const packed = noting.editText(String(msg.text ?? ""), !!msg.composing);
      const { result, transfers } = unpackEditResult(packed);
      self.postMessage({ id: msg.id, ok: true, result }, transfers);
      return;
    }
    if (msg.op === "editCommit") {
      await fontsReady;
      const packed = noting.editCommit();
      const { result, transfers } = unpackEditResult(packed);
      self.postMessage({ id: msg.id, ok: true, result }, transfers);
      return;
    }
    if (msg.op === "editKey") {
      await fontsReady;
      const packed = noting.editKey(msg.key | 0, !!msg.shift, !!msg.ctrl, !!msg.alt);
      const { result, transfers } = unpackEditResult(packed);
      self.postMessage({ id: msg.id, ok: true, result }, transfers);
      return;
    }
    if (msg.op === "pickableFonts") {
      await fontsReady;
      self.postMessage({ id: msg.id, ok: true, result: noting.pickableFonts() });
      return;
    }
    if (msg.op === "formatFields") {
      await fontsReady;
      self.postMessage({ id: msg.id, ok: true, result: noting.formatFields() });
      return;
    }
    if (msg.op === "licenseFontSwaps") {
      await fontsReady;
      self.postMessage({ id: msg.id, ok: true, result: noting.licenseFontSwaps() });
      return;
    }
    if (msg.op === "editSwapFonts") {
      await fontsReady;
      const packed = noting.editSwapFonts(msg.chosen && typeof msg.chosen === "object" ? msg.chosen : {});
      const { result, transfers } = unpackEditResult(packed);
      self.postMessage({ id: msg.id, ok: true, result }, transfers);
      return;
    }
    if (msg.op === "editStyle") {
      await fontsReady;
      const packed = noting.editStyle(msg.patch || {});
      const { result, transfers } = unpackEditResult(packed);
      self.postMessage({ id: msg.id, ok: true, result }, transfers);
      return;
    }
    if (msg.op === "view") {
      const plan = noting.viewApply(msg.patch || {});
      self.postMessage({ id: msg.id, ok: true, result: readPlan(plan) });
      return;
    }
    if (msg.op === "render") {
      await fontsReady;
      const region = msg.view;
      const framed = (msg.frame | 0) > 0;
      const frame = framed
        ? noting.renderFrame(msg.frame | 0)
        : region
          ? noting.renderPageView(msg.page, msg.pixelHeight, region.x | 0, region.y | 0, region.w | 0, region.h | 0, region.layer | 0)
          : noting.renderPagePixels(msg.page, msg.pixelHeight);
      if (viewSurface && (msg.tile | 0) > 0) noting.retainViewTile(msg.tile | 0, msg.page | 0);
      if (viewSurface) {
        self.postMessage({
          id: msg.id,
          ok: true,
          result: { width: frame.width, height: frame.height, kept: true },
        });
        return;
      }
      const view = new Uint8Array(frame.pixels);
      const pixels = view.slice();
      self.postMessage(
        { id: msg.id, ok: true, result: { width: frame.width, height: frame.height, pixels } },
        [pixels.buffer],
      );
      return;
    }
    throw new Error(`알 수 없는 코어 요청: ${msg.op}`);
  } catch (error) {
    self.postMessage({ id: msg.id, ok: false, error: formatError(error) });
  }
};
