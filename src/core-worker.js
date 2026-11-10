// 웹 코어. UI 스레드와 메시지로만 이야기한다.
// 앱은 같은 op 를 자기 프로세스 통신으로 코어에 넘기면 된다.
//
// boot { fonts }       wasm 을 올리고 글꼴 목록 요청을 시작한다. fonts 는 글꼴 서버와 목록(아래 setFonts)
// fetchFonts           코어가 고른 글꼴 파일을 받아 코어에 넣는다
// fontFiles            문서가 요청한 글꼴 받기가 끝났는지 본다. 바이트는 도착하는 대로 이미 코어에 들어간다
// parse                문서 JSON
// open                 문서 모델을 연다
// export { format }    열린 문서를 hwp 또는 hwpx 바이트로 내보낸다
// plan { measured }    우리 조판으로 쪽을 나눈다. 저장된 줄 높이를 빌릴지는 core 가 정한다. 글꼴은 셸이 넣은 뒤의 메모리만 쓴다
//                       measured 면 lineseg 의 줄 경계만 쓰고 높이는 우리 측정값이다(한글과 견주기용)
// beginGrind           글꼴을 넣은 뒤, 화면 스레드를 빼고 나머지 스레드가 칸을 굽기 시작한다
// view { patch }                 화면 크기·배율을 코어에 맡기고 보기 계획을 받는다
// surface { canvas | remote }    화면을 붙인다. 그리기는 코어 프레임 루프가 한다
// input { event }                포인터·휠·키 값을 그대로 넘긴다. 무엇을 할지는 코어가 정한다

import { createScreen2D } from "./screen-2d.js";
import { engine } from "./engine.js";

let chwp = null;
let chwpThreaded = false;
let viewCanvas = null;
let viewSurface = false;
let fontsReady = Promise.resolve();
const settledFonts = new Map();
let fontJob = Promise.resolve({ 요청: 0, 받음: 0, ms: 0 });
let captureStdout = false;
const capturedStdout = [];

function formatError(error) {
  if (!error) return String(error);
  if (typeof error === "string") return error;
  // 사파리 stack 에는 메시지가 없다. 메시지와 자리를 함께 남긴다.
  const message = error.message || String(error);
  if (!error.stack) return message;
  return error.stack.includes(message) ? error.stack : `${message}\n${error.stack}`;
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
    if (line.startsWith("[ClassingHWP 오류]")) {
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

// 값과 기본값은 코어가 다 채운다. 여기서는 embind 객체를 보낼 수 있는 꼴로 옮긴다.
// 모양이 앞서 보낸 것과 같으면 코어는 styleChanged:false 와 (바뀐 때만) caret 만 준다.
function readCursorStyle(st) {
  if (!st || typeof st !== "object") return null;
  if (st.styleChanged === false) return { styleChanged: false, caret: readCaretStatus(st.caret) };
  return { ...st, styleChanged: true, fontSizeIn: { ...(st.fontSizeIn || {}) }, mixed: readMixed(st.mixed), caret: readCaretStatus(st.caret) };
}

// 블록 안에서 섞인 값. 셸은 그 칸을 비운다.
function readMixed(mixed) {
  const out = {};
  if (!mixed || typeof mixed !== "object") return out;
  for (const key of ["style", "font", "fontSize", "bold", "italic", "underline", "strikeout", "color", "align", "lineSpacing"]) {
    out[key] = !!mixed[key];
  }
  // 언어별 글꼴이 섞였는가(서식 막대 언어 칸). 언어 차례는 코어 langFonts 와 같다.
  out.langFonts = Array.from(mixed.langFonts || [], (on) => !!on);
  return out;
}

// 상태 줄의 단·줄·칸·구역·삽입/수정. 값은 코어가 채운다.
function readCaretStatus(st) {
  if (!st || typeof st !== "object") return null;
  return { ...st };
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
    zoomMode: plan.zoomMode,
    zoomLabel: plan.zoomLabel,
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
    return file;
  };
}

// 글꼴 서버와 목록. base 아래 <폴더>/<파일> 에서 글꼴을 받는다. 목록 셋(index·licenseSwap·replace)은 주소이거나
// 이미 읽은 JSON 값이다. 주지 않으면 base 아래 index.json, license-swap.json, replace.json 을 읽는다.
// 쓰는 쪽이 우리 목록을 받아 고쳐 넘길 수 있게 둔다.
let fonts = { base: "", index: null, licenseSwap: null, replace: null };
function setFonts(config) {
  const given = typeof config === "string" ? { base: config } : (config && typeof config === "object" ? config : {});
  const base = new URL(String(given.base || "/fonts/"), self.location.href).href.replace(/\/?$/, "/");
  fonts = { base, index: given.index ?? null, licenseSwap: given.licenseSwap ?? null, replace: given.replace ?? null };
}

// 목록 하나. 값이면 그대로, 주소면 받아서, 없으면 base 아래 기본 이름으로 받는다.
async function fontList(source, name) {
  if (source && typeof source === "object") return source;
  const url = typeof source === "string" && source ? new URL(source, fonts.base).href : fonts.base + name;
  const response = await fetch(url);
  if (!response.ok) return null;
  const body = await response.json();
  return body && typeof body === "object" && !Array.isArray(body) ? body : null;
}

function fontUrl(folder, name) {
  return fonts.base + folder + "/" + encodeURIComponent(name);
}

function startDocumentFonts(faces) {
  // 글꼴 목록이 오기 전에 문서를 열면 주소를 하나도 못 찾는다. 목록을 기다린 뒤 받을 글꼴을 고른다.
  fontJob = fontsReady.then(() => fetchDocumentFonts(faces));
}

// 무엇을 받을지(파일 묶기, 대신 받을 글꼴)는 코어가 정한다. 여기서는 받아서 넘기기만 한다.
function fetchDocumentFonts(faces) {
  const jobs = chwp.fontFetchPlan(faces ?? []);
  const started = Date.now();
  if (!jobs.length) return Promise.resolve({ 요청: 0, 받음: 0, ms: 0 });
  let got = 0;
  // 다 받아 풀고 문서에 적용하면 코어가 onFontsSettled(batch) 로 알린다.
  const settled = new Promise((resolve) => settledFonts.set(jobs[0].batch, resolve));
  return Promise.all(jobs.map(async (job) => {
    const url = fontUrl(job.folder, job.file);
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.log("[ClassingHWP 오류:font-fetch]", job.face, url, response.status);
        chwp.fontFetchFailed(job.id);
        return;
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      // 바이트가 쓸 만한지, 압축을 풀고 등록하는 일은 코어가 한다.
      chwp.fontFetched(job.id, bytes);
      got += 1;
    } catch (error) {
      console.log("[ClassingHWP 오류:font-fetch]", job.face || url, formatError(error));
      chwp.fontFetchFailed(job.id);
    }
  })).then(() => settled).then(async () => {
    const report = { 요청: jobs.length, 받음: got, ms: Date.now() - started };
    // 받은 글꼴에 없는 글자가 있으면 core 가 대체 글꼴 이름을 준다. 그것까지 받은 뒤 끝낸다.
    // 몇 번 되물을지는 core 가 센다(DocSession::kFontGapRounds). 다 물으면 빈 목록을 준다.
    const gaps = Array.from(chwp.fontGapFaces?.() ?? []);
    if (!gaps.length) return report;
    const more = await fetchDocumentFonts(gaps);
    return { 요청: report.요청 + more.요청, 받음: report.받음 + more.받음, ms: Date.now() - started };
  });
}

async function loadFontCatalog() {
  const started = Date.now();
  let catalog = {};
  try {
    catalog = (await fontList(fonts.index, "index.json")) || {};
  } catch {
    // 글꼴 목록이 없으면 빈 목록으로 둔다.
  }
  try {
    chwp.setFontCatalog(JSON.stringify(catalog));
    const swaps = await fontList(fonts.licenseSwap, "license-swap.json");
    if (swaps) chwp.setFontLicenseSwaps(JSON.stringify(swaps));
    const listed = await fontList(fonts.replace, "replace.json");
    if (listed) chwp.setFontReplacements(JSON.stringify(listed));
  } catch (error) {
    chwp.setFontCatalog("{}");
    console.warn("font catalog", error);
  }
  return Date.now() - started;
}

async function boot(fontConfig) {
  setFonts(fontConfig);
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
      chwp = await (await engine.pthread())(makeModuleOpts(engine.wasmPthreadUrl));
      chwpThreaded = true;
    } catch (error) {
      onStdout(`[ClassingHWP] 멀티스레드 부팅 실패 → 단일 스레드로 전환 (${formatError(error)})`);
      chwp = await (await engine.single())(makeModuleOpts(engine.wasmSingleUrl));
      chwpThreaded = false;
    }
  } else {
    onStdout("[ClassingHWP] SharedArrayBuffer 미지원 환경 → 단일 스레드 WASM 폴백");
    chwp = await (await engine.single())(makeModuleOpts(engine.wasmSingleUrl));
    chwpThreaded = false;
  }
  chwp.onFontFaces = (faces) => {
    const names = [];
    const count = faces?.length | 0;
    for (let i = 0; i < count; i += 1) {
      const name = faces[i];
      if (name) names.push(String(name));
    }
    startDocumentFonts(names);
    self.postMessage({ fontFaces: names });
  };
  // 카메라 값과 배율 글은 core 가 채운다. 그대로 넘긴다.
  chwp.onFontsSettled = (batch) => {
    const resolve = settledFonts.get(batch);
    settledFonts.delete(batch);
    resolve?.();
  };
  chwp.onCamera = (camera) => {
    self.postMessage({ camera });
  };
  // 2D 화면: 코어가 정한 그림 목록을 캔버스 2D 로 옮긴다. 캔버스가 이 워커에 있으면 여기서 그리고,
  // 원격 화면이면 메인 스레드로 넘긴다.
  const drawScreen2D = createScreen2D();
  chwp.onScreenOps = (frame) => {
    if (viewCanvas) return drawScreen2D(viewCanvas, frame);
    const transfers = [frame.ops, frame.path, frame.drops];
    for (const item of frame.uploads) transfers.push(item.pixels);
    self.postMessage({ screenOps: frame }, transfers);
  };
  const coreMs = Date.now() - started;
  fontsReady = loadFontCatalog();
  return { coreMs, threaded: chwpThreaded };
}

self.onmessage = async (event) => {
  const msg = event.data || {};
  try {
    if (msg.op === "boot") {
      const result = await boot(msg.fonts);
      self.postMessage({ id: msg.id, ok: true, result });
      return;
    }
    if (!chwp) throw new Error(`코어가 아직 준비되지 않았습니다(${msg.op}).`);
    if (msg.op === "fetchFonts") {
      await fontsReady;
      self.postMessage({ id: msg.id, ok: true, result: await fetchDocumentFonts(msg.faces || []) });
      return;
    }
    if (msg.op === "beginGrind") {
      chwp.beginGrind();
      self.postMessage({ id: msg.id, ok: true, result: true });
      return;
    }
    if (msg.op === "fontFiles") {
      const result = await fontJob;
      self.postMessage({ id: msg.id, ok: true, result });
      return;
    }
    if (msg.op === "parse") {
      const json = chwp.parse(msg.bytes, !!msg.pretty, !!msg.lineSegs);
      self.postMessage({ id: msg.id, ok: true, result: json });
      return;
    }
    if (msg.op === "open" || msg.op === "new") {
      const info = msg.op === "new" ? chwp.newDocument() : chwp.openDocument(msg.bytes);
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
          docState: String(info?.docState || ""),
          name: String(info?.name || ""),
          cursorStyle: readCursorStyle(chwp.cursorStyle()),
        },
      });
      return;
    }
    if (msg.op === "trimCaches") {
      chwp.trimCaches(msg.level | 0);
      self.postMessage({ id: msg.id, ok: true, result: true });
      return;
    }
    if (msg.op === "setCacheBudget") {
      const ok = chwp.setCacheBudget(String(msg.name || ""), Number(msg.bytes));
      self.postMessage({ id: msg.id, ok: true, result: !!ok });
      return;
    }
    if (msg.op === "memory") {
      self.postMessage({
        id: msg.id,
        ok: true,
        result: { heapBytes: chwp.memoryBytes(), inUseBytes: chwp.memoryInUse(), report: JSON.parse(chwp.memoryReport()) },
      });
      return;
    }
    if (msg.op === "frameStats") {
      const stats = JSON.parse(chwp.frameStats());
      stats.heapBytes = chwp.memoryBytes();
      stats.inUseBytes = chwp.memoryInUse();
      self.postMessage({ id: msg.id, ok: true, result: stats });
      return;
    }
    if (msg.op === "cacheUsage") {
      self.postMessage({ id: msg.id, ok: true, result: JSON.parse(chwp.cacheUsage()) });
      return;
    }
    if (msg.op === "hover") {
      self.postMessage({ id: msg.id, ok: true, result: String(chwp.hoverCursor(Number(msg.x) || 0, Number(msg.y) || 0)) });
      return;
    }
    if (msg.op === "save") {
      const saved = chwp.saveDocument(String(msg.name || ""));
      const bytes = saved?.bytes;
      if (!bytes || typeof bytes.length !== "number" || bytes.length === 0) {
        throw new Error(String(saved?.error || "") || "저장에 실패했습니다.");
      }
      const copy = new Uint8Array(bytes);
      self.postMessage({
        id: msg.id,
        ok: true,
        result: { bytes: copy, name: String(saved.name), docState: String(saved.docState || "") },
      }, [copy.buffer]);
      return;
    }
    if (msg.op === "plan") {
      await fontsReady;
      captureStdout = true;
      capturedStdout.length = 0;
      let json = "";
      try {
        chwp.setMeasuredLineHeight(!!msg.measured);
        json = chwp.planDocument();
      } finally {
        captureStdout = false;
      }
      const detail = capturedStdout.splice(0);
      self.postMessage({ id: msg.id, ok: true, result: { json, detail } });
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
      // 원격 화면이면 캔버스가 없다. 코어가 정한 2D 그림 목록을 메인 스레드로 보낸다.
      viewCanvas = msg.remote ? null : msg.canvas;
      chwp.canvas = viewCanvas;
      // 이 빌드의 WebGL 은 "#canvas" 를 document 에서 찾는다. 워커에는 문서가 없다.
      if (!globalThis.document) {
        globalThis.document = {
          querySelector(selector) {
            return selector === "#canvas" ? chwp.canvas : null;
          },
          getElementById(id) {
            return id === "canvas" ? chwp.canvas : null;
          },
        };
      }
      // 장치가 붙기를 기다린다. 언제 포기할지는 코어가 정한다(0 대기, 1 준비, 2 실패).
      chwp.attachScreen(!!msg.remote);
      let state = chwp.screenAttachState();
      while (state === 0) {
        await new Promise((resolve) => setTimeout(resolve, 16));
        state = chwp.screenAttachState();
      }
      viewSurface = state === 1;
      self.postMessage({ id: msg.id, ok: true, result: viewSurface });
      return;
    }
    if (msg.op === "input") {
      const camera = chwp.inputEvent(msg.event || {});
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
          zoomMode: camera.zoomMode,
          zoomLabel: camera.zoomLabel,
          gridMode: typeof camera.gridMode === "string" ? camera.gridMode : "auto",
          gridCols: camera.gridCols | 0,
          gridRows: camera.gridRows | 0,
          effectiveCols: camera.effectiveCols | 0,
          rowStepY: camera.rowStepY | 0,
          pageStepY: camera.pageStepY | 0,
          page: camera.page | 0,
          pageCount: camera.pageCount | 0,
          pageCounting: !!camera.pageCounting,
          ownsScroll: !!camera.ownsScroll,
          settled: !!camera.settled,
          needsTick: !!camera.needsTick,
          tapSlop: Number(camera.tapSlop) || 0,
          rulersWanted: !!camera.rulersWanted,
          editButton: !!camera.editButton,
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
          edited: !!camera.edited,
          docState: typeof camera.docState === "string" ? camera.docState : "",
          needsFontSwap: !!camera.needsFontSwap,
          pinTap: !!camera.pinTap,
          dialog: typeof camera.dialog === "string" ? camera.dialog : "",
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
          error: typeof packed?.error === "string" ? packed.error : "",
          notice: typeof packed?.notice === "string" ? packed.notice : "",
          dialog: typeof packed?.dialog === "string" ? packed.dialog : "",
          count: packed?.count | 0,
          found: !!packed?.found,
          fullInvalidation: !!packed?.fullInvalidation,
          canUndo: !!packed?.canUndo,
          canRedo: !!packed?.canRedo,
          docState: typeof packed?.docState === "string" ? packed.docState : "",
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
      const packed = chwp.pointerEvent(msg.kind | 0, msg.page | 0, msg.x | 0, msg.y | 0, msg.percent | 0);
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
    if (msg.op === "editField") {
      await fontsReady;
      const packed = chwp.editField(msg.event || {});
      const field = { ...packed.field };
      if (!packed.edited) {
        self.postMessage({ id: msg.id, ok: true, result: { field, edit: null } });
        return;
      }
      const { result, transfers } = unpackEditResult(packed);
      self.postMessage({ id: msg.id, ok: true, result: { field, edit: result } }, transfers);
      return;
    }
    if (msg.op === "editText") {
      await fontsReady;
      const packed = chwp.editText(String(msg.text ?? ""), !!msg.composing);
      const { result, transfers } = unpackEditResult(packed);
      self.postMessage({ id: msg.id, ok: true, result }, transfers);
      return;
    }
    if (msg.op === "setDrawTool") {
      chwp.setDrawTool(msg.tool | 0);
      self.postMessage({ id: msg.id, ok: true, result: null });
      return;
    }
    if (msg.op === "editInsertPicture") {
      await fontsReady;
      const packed = chwp.editInsertPicture(msg.bytes);
      msg.bytes = null;
      const { result, transfers } = unpackEditResult(packed);
      self.postMessage({ id: msg.id, ok: true, result }, transfers);
      return;
    }
    if (msg.op === "editInsertTable") {
      await fontsReady;
      const packed = chwp.editInsertTable(msg.rows | 0, msg.cols | 0);
      const { result, transfers } = unpackEditResult(packed);
      self.postMessage({ id: msg.id, ok: true, result }, transfers);
      return;
    }
    if (msg.op === "editShortcut") {
      await fontsReady;
      const { result, transfers } = unpackEditResult(chwp.editShortcut(String(msg.command)));
      self.postMessage({ id: msg.id, ok: true, result }, transfers);
      return;
    }
    if (msg.op === "editInsertBreak") {
      await fontsReady;
      const packed = chwp.editInsertBreak(String(msg.kind));
      const { result, transfers } = unpackEditResult(packed);
      self.postMessage({ id: msg.id, ok: true, result }, transfers);
      return;
    }
    if (msg.op === "editInsertHyperlink") {
      await fontsReady;
      const { result, transfers } = unpackEditResult(chwp.editInsertHyperlink(String(msg.text ?? ""), String(msg.url ?? "")));
      self.postMessage({ id: msg.id, ok: true, result }, transfers);
      return;
    }
    if (msg.op === "editNoteShape") {
      await fontsReady;
      const { result, transfers } = unpackEditResult(chwp.editNoteShape(msg.fields || {}, !!msg.endnote, !!msg.whole));
      self.postMessage({ id: msg.id, ok: true, result }, transfers);
      return;
    }
    if (msg.op === "noteShapeView") {
      await fontsReady;
      self.postMessage({ id: msg.id, ok: true, result: chwp.noteShapeView(!!msg.endnote) });
      return;
    }
    if (msg.op === "editCaption") {
      await fontsReady;
      const { result, transfers } = unpackEditResult(chwp.editCaption(String(msg.caption)));
      self.postMessage({ id: msg.id, ok: true, result }, transfers);
      return;
    }
    if (msg.op === "editBookmark") {
      await fontsReady;
      const { result, transfers } = unpackEditResult(chwp.editBookmark(String(msg.action), String(msg.name ?? ""), String(msg.newName ?? "")));
      self.postMessage({ id: msg.id, ok: true, result }, transfers);
      return;
    }
    if (msg.op === "editGoTo") {
      await fontsReady;
      const { result, transfers } = unpackEditResult(chwp.editGoTo(msg.fields || {}));
      self.postMessage({ id: msg.id, ok: true, result }, transfers);
      return;
    }
    if (msg.op === "editDeleteMarks") {
      await fontsReady;
      const { result, transfers } = unpackEditResult(chwp.editDeleteMarks(msg.fields || {}));
      self.postMessage({ id: msg.id, ok: true, result }, transfers);
      return;
    }
    if (msg.op === "editTableText") {
      await fontsReady;
      const { result, transfers } = unpackEditResult(chwp.editTableText(msg.fields || {}));
      self.postMessage({ id: msg.id, ok: true, result }, transfers);
      return;
    }
    if (msg.op === "editCopyShape") {
      await fontsReady;
      const { result, transfers } = unpackEditResult(chwp.editCopyShape(String(msg.action), Number(msg.type) | 0));
      self.postMessage({ id: msg.id, ok: true, result }, transfers);
      return;
    }
    if (msg.op === "editExchangeNotes") {
      await fontsReady;
      const { result, transfers } = unpackEditResult(chwp.editExchangeNotes(Number(msg.mode) | 0));
      self.postMessage({ id: msg.id, ok: true, result }, transfers);
      return;
    }
    if (msg.op === "goToView") {
      await fontsReady;
      self.postMessage({ id: msg.id, ok: true, result: chwp.goToView() });
      return;
    }
    if (msg.op === "editGoToSection") {
      await fontsReady;
      const { result, transfers } = unpackEditResult(chwp.editGoToSection(Number(msg.section) | 0));
      self.postMessage({ id: msg.id, ok: true, result }, transfers);
      return;
    }
    if (msg.op === "editGoToPage") {
      await fontsReady;
      const { result, transfers } = unpackEditResult(chwp.editGoToPage(Number(msg.page) | 0));
      self.postMessage({ id: msg.id, ok: true, result }, transfers);
      return;
    }
    if (msg.op === "bookmarkView") {
      await fontsReady;
      self.postMessage({ id: msg.id, ok: true, result: chwp.bookmarkView() });
      return;
    }
    if (msg.op === "editTableProperties") {
      await fontsReady;
      const { result, transfers } = unpackEditResult(chwp.editTableProperties(msg.fields || {}));
      self.postMessage({ id: msg.id, ok: true, result }, transfers);
      return;
    }
    if (msg.op === "editGlyphGroup") {
      await fontsReady;
      const { result, transfers } = unpackEditResult(chwp.editGlyphGroup(msg.fields || {}));
      self.postMessage({ id: msg.id, ok: true, result }, transfers);
      return;
    }
    if (msg.op === "editConvertText") {
      await fontsReady;
      const { result, transfers } = unpackEditResult(chwp.editConvertText(msg.fields || {}));
      self.postMessage({ id: msg.id, ok: true, result }, transfers);
      return;
    }
    if (msg.op === "editSortParagraphs") {
      await fontsReady;
      const { result, transfers } = unpackEditResult(chwp.editSortParagraphs(msg.fields || {}));
      self.postMessage({ id: msg.id, ok: true, result }, transfers);
      return;
    }
    if (msg.op === "tableFormulaView") {
      await fontsReady;
      self.postMessage({ id: msg.id, ok: true, result: chwp.tableFormulaView() });
      return;
    }
    if (msg.op === "sortView") {
      await fontsReady;
      self.postMessage({ id: msg.id, ok: true, result: chwp.sortView(msg.fields || {}) });
      return;
    }
    if (msg.op === "glyphGroupView") {
      await fontsReady;
      self.postMessage({ id: msg.id, ok: true, result: chwp.glyphGroupView() });
      return;
    }
    if (msg.op === "tablePropertiesView") {
      await fontsReady;
      self.postMessage({ id: msg.id, ok: true, result: chwp.tablePropertiesView() });
      return;
    }
    if (msg.op === "editSectionSettings") {
      await fontsReady;
      const { result, transfers } = unpackEditResult(chwp.editSectionSettings(msg.fields || {}));
      self.postMessage({ id: msg.id, ok: true, result }, transfers);
      return;
    }
    if (msg.op === "sectionSettingsView") {
      await fontsReady;
      self.postMessage({ id: msg.id, ok: true, result: chwp.sectionSettingsView() });
      return;
    }
    if (msg.op === "editColumns") {
      await fontsReady;
      const { result, transfers } = unpackEditResult(chwp.editColumns(msg.fields || {}));
      self.postMessage({ id: msg.id, ok: true, result }, transfers);
      return;
    }
    if (msg.op === "viewGuides") {
      self.postMessage({ id: msg.id, ok: true, result: chwp.viewGuides(msg.fields || {}) });
      return;
    }
    if (msg.op === "applyViewGuides") {
      self.postMessage({ id: msg.id, ok: true, result: chwp.applyViewGuides(msg.fields || {}) });
      return;
    }
    if (msg.op === "columnView") {
      await fontsReady;
      self.postMessage({ id: msg.id, ok: true, result: chwp.columnView(msg.fields || {}) });
      return;
    }
    if (msg.op === "editInsertNote") {
      await fontsReady;
      const { result, transfers } = unpackEditResult(chwp.editInsertNote(!!msg.endnote));
      self.postMessage({ id: msg.id, ok: true, result }, transfers);
      return;
    }
    if (msg.op === "editPageControl") {
      await fontsReady;
      const { result, transfers } = unpackEditResult(chwp.editPageControl(String(msg.kind), msg.fields || {}));
      self.postMessage({ id: msg.id, ok: true, result }, transfers);
      return;
    }
    if (msg.op === "pageControlFields") {
      await fontsReady;
      self.postMessage({ id: msg.id, ok: true, result: chwp.pageControlFields(String(msg.kind)) });
      return;
    }
    if (msg.op === "editFindReplace") {
      await fontsReady;
      const packed = chwp.editFindReplace(String(msg.mode), String(msg.text ?? ""), String(msg.replacement ?? ""), !!msg.matchCase);
      const { result, transfers } = unpackEditResult(packed);
      self.postMessage({ id: msg.id, ok: true, result }, transfers);
      return;
    }
    if (msg.op === "editTableFields") {
      await fontsReady;
      const { result, transfers } = unpackEditResult(chwp.editTableFields(String(msg.kind), msg.fields || {}));
      self.postMessage({ id: msg.id, ok: true, result }, transfers);
      return;
    }
    if (msg.op === "editTable") {
      await fontsReady;
      const packed = chwp.editTable(String(msg.kind), !!msg.after, msg.count | 0, msg.rows | 0, msg.cols | 0, String(msg.border ?? ""), String(msg.color ?? ""), String(msg.lineType ?? ""), msg.lineWidth | 0, String(msg.lineColor ?? ""));
      const { result, transfers } = unpackEditResult(packed);
      self.postMessage({ id: msg.id, ok: true, result }, transfers);
      return;
    }
    if (msg.op === "editUndo" || msg.op === "editRedo") {
      await fontsReady;
      const packed = msg.op === "editUndo" ? chwp.editUndo() : chwp.editRedo();
      const { result, transfers } = unpackEditResult(packed);
      self.postMessage({ id: msg.id, ok: true, result }, transfers);
      return;
    }
    if (msg.op === "editDeleteSelection") {
      await fontsReady;
      const { result, transfers } = unpackEditResult(chwp.editDeleteSelection());
      self.postMessage({ id: msg.id, ok: true, result }, transfers);
      return;
    }
    if (msg.op === "editKey") {
      await fontsReady;
      const packed = chwp.editKey(msg.key | 0, !!msg.shift, !!msg.ctrl, !!msg.alt);
      const { result, transfers } = unpackEditResult(packed);
      self.postMessage({ id: msg.id, ok: true, result }, transfers);
      return;
    }
    if (msg.op === "pickableFonts") {
      await fontsReady;
      self.postMessage({ id: msg.id, ok: true, result: chwp.pickableFonts() });
      return;
    }
    if (msg.op === "formatFields") {
      await fontsReady;
      self.postMessage({ id: msg.id, ok: true, result: chwp.formatFields() });
      return;
    }
    if (msg.op === "licenseFontSwaps") {
      await fontsReady;
      self.postMessage({ id: msg.id, ok: true, result: chwp.licenseFontSwaps() });
      return;
    }
    if (msg.op === "dropPendingInsert") {
      chwp.dropPendingInsert();
      self.postMessage({ id: msg.id, ok: true, result: true });
      return;
    }
    if (msg.op === "editSwapFonts") {
      await fontsReady;
      const packed = chwp.editSwapFonts(msg.chosen && typeof msg.chosen === "object" ? msg.chosen : {});
      const { result, transfers } = unpackEditResult(packed);
      self.postMessage({ id: msg.id, ok: true, result }, transfers);
      return;
    }
    if (msg.op === "pageSetupFields") {
      await fontsReady;
      self.postMessage({ id: msg.id, ok: true, result: chwp.pageSetupFields() });
      return;
    }
    if (msg.op === "editPageSetup") {
      await fontsReady;
      const packed = chwp.editPageSetup(msg.patch || {}, !!msg.whole);
      const { result, transfers } = unpackEditResult(packed);
      self.postMessage({ id: msg.id, ok: true, result }, transfers);
      return;
    }
    if (msg.op === "setFontSwapPreferences") {
      chwp.setFontSwapPreferences(String(msg.json || "{}"));
      self.postMessage({ id: msg.id, ok: true, result: true });
      return;
    }
    if (msg.op === "setRecentColors" || msg.op === "rememberColor") {
      const memory = msg.op === "rememberColor"
        ? chwp.rememberColor(String(msg.hex || ""))
        : chwp.setRecentColors(String(msg.saved || ""));
      self.postMessage({ id: msg.id, ok: true, result: { recent: [...memory.recent], pen: memory.pen, saved: memory.saved } });
      return;
    }
    if (msg.op === "fontSwapPreferences") {
      self.postMessage({ id: msg.id, ok: true, result: chwp.fontSwapPreferences() });
      return;
    }
    if (msg.op === "styleNames") {
      const list = chwp.styleNames();
      const out = [];
      for (let i = 0; i < list.length; i++) out.push(String(list[i]));
      self.postMessage({ id: msg.id, ok: true, result: out });
      return;
    }
    if (msg.op === "fieldRules") {
      const list = chwp.fieldRules();
      const out = [];
      for (let i = 0; i < list.length; i++) {
        const rule = { ...list[i] };
        if (rule.inputTypes) rule.inputTypes = Array.from(rule.inputTypes, String);
        out.push(rule);
      }
      self.postMessage({ id: msg.id, ok: true, result: out });
      return;
    }
    if (msg.op === "zoomDialogSpec") {
      self.postMessage({ id: msg.id, ok: true, result: JSON.parse(chwp.zoomDialogSpec()) });
      return;
    }
    if (msg.op === "keyBindings") {
      const list = chwp.keyBindings();
      const out = [];
      for (let i = 0; i < list.length; i++) out.push({ ...list[i] });
      self.postMessage({ id: msg.id, ok: true, result: out });
      return;
    }
    if (msg.op === "formatView") {
      await fontsReady;
      self.postMessage({ id: msg.id, ok: true, result: chwp.formatDialogView(msg.kind | 0, msg.patch || {}) });
      return;
    }
    if (msg.op === "formatPreview") {
      await fontsReady;
      const frame = chwp.formatDialogPreview(msg.kind | 0, msg.patch || {}, msg.w | 0, msg.h | 0);
      const pixels = new Uint8Array(frame.pixels).slice();
      self.postMessage({ id: msg.id, ok: true, result: { width: frame.width, height: frame.height, pixels } }, [pixels.buffer]);
      return;
    }
    if (msg.op === "editFormatDialog") {
      await fontsReady;
      const packed = chwp.editFormatDialog(msg.kind | 0, msg.patch || {}, !!msg.whole);
      const { result, transfers } = unpackEditResult(packed);
      self.postMessage({ id: msg.id, ok: true, result }, transfers);
      return;
    }
    if (msg.op === "editStyle") {
      await fontsReady;
      const packed = chwp.editStyle(msg.patch || {});
      const { result, transfers } = unpackEditResult(packed);
      self.postMessage({ id: msg.id, ok: true, result }, transfers);
      return;
    }
    if (msg.op === "view") {
      const plan = chwp.viewApply(msg.patch || {});
      self.postMessage({ id: msg.id, ok: true, result: readPlan(plan) });
      return;
    }
    throw new Error(`알 수 없는 코어 요청: ${msg.op}`);
  } catch (error) {
    self.postMessage({ id: msg.id, ok: false, error: formatError(error) });
  }
};
