import { createCoreSession } from "./core-session.js";
import { createScreen2D } from "./screen-2d.js";
import { startRemoteLog } from "./remote-log.js";
import { attachEditor } from "./editor.js";

// 문서 보기 하나. 받은 그릇(host) 안에 화면을 만들고, 코어 세션(워커) 하나를 따로 띄운다.
// 화면 이동·배율·쪽·선택·편집의 판단은 코어가 한다. 여기서는 브라우저 사건을 코어 입력으로 바꿔 넘기고,
// 코어 답을 화면(스크롤 막대 자리, 캐럿, 캔버스 크기)과 알림으로 옮긴다.
//
//   const viewer = createViewer(element, { readOnly: true, query: "?zoom=width&page=3" });
//   viewer.addEventListener("viewport", (event) => console.log(event.detail.page));
//   await viewer.open("https://example.com/a.hwpx");
//   viewer.zoom("150"); viewer.page("next"); viewer.view("two");
//
// options
//   readOnly   보기 전용(처음 값 true). setReadOnly 로 바꾼다.
//   query      문서를 연 뒤 맞출 쪽 모양·배율·쪽·편집 단추("?view=two&zoom=150&page=3&edit=1"). 코어가 읽는다.
//   ownsPage   페이지 전체가 이 보기다. 그릇 밖의 단축키·Ctrl+휠·제스처도 받는다(앱). 넣은 보기면 그릇 안 것만 받는다.
//   engine     엔진 폴더(core-worker-boot.js, chwp.wasm 등) 주소. 스레드 워커는 같은 출처에서만 떠서 제 서버에 둔다.
//              주지 않으면 앱 빌드가 묶은 엔진(패키지는 /chwp/)을 쓴다.
//   fonts      글꼴 서버 주소 또는 { base, index, licenseSwap, replace }. 목록 셋은 주소나 이미 읽은 JSON 값이다.
//              기본은 우리 글꼴 서버(DEFAULT_FONTS)다. 우리 목록을 받아 고쳐 넘겨도 된다.
//   nogpu, measured, cacheBudget  개발용(GPU 끄기, 측정 줄 높이, "pageGpu:8000000" 캐시 예산)
//
// 알림(addEventListener, detail): status {text}, notice {text}, viewport, zoom, docstate {state, name}, cursorstyle, caretstatus,
// fontlist, stylelist, colors, keybindings, zoomspec, rulers {on}, editbutton {shown}, toast {text, kind, action},
// fontswapask {swaps}, selectionmenu {x, y, readOnly}, formatdialog {name}, saverequest, openrequest,
// opened (코어 입력 답, 쪽은 0부터), openfailed {error}.
// 마지막 값은 viewer.info 에 남는다.

// 기본 글꼴 서버. 목록(index.json 등)과 글꼴 파일을 준다. 다른 출처에서 받을 수 있게 CORS·CORP 를 보낸다.
export const DEFAULT_FONTS = "https://ede.kr/hwp/fonts/";

// 키보드·제스처처럼 창 하나로 오는 입력은 마지막으로 누른 보기가 받는다.
let activeViewer = null;

function logError(stage, error) {
  const detail = error?.stack || error?.message || String(error);
  console.log(`[Error: ${stage}]\nMessage: ${detail}`);
}

function pixelsToCanvas(image) {
  const width = image?.w | 0;
  const height = image?.h | 0;
  const pixels = image?.pixels;
  if (width <= 0 || height <= 0 || !pixels || pixels.length < width * height * 4) return null;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const copy = new Uint8ClampedArray(pixels.buffer, pixels.byteOffset, width * height * 4);
  ctx.putImageData(new ImageData(copy, width, height), 0, 0);
  return canvas;
}

function copyText(text) {
  const fallback = () => {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.left = "-9999px";
    document.body.append(field);
    field.select();
    document.execCommand("copy");
    field.remove();
  };
  const write = navigator.clipboard?.writeText;
  if (write) {
    void write.call(navigator.clipboard, text).catch(fallback);
    return;
  }
  fallback();
}

function nameFromDisposition(header) {
  const star = header?.match(/filename\*=UTF-8''([^;]+)/i);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      return star[1].trim();
    }
  }
  const plain = header?.match(/filename="?([^";]+)"?/i);
  return plain?.[1]?.trim() || "";
}

export function createViewer(host, options = {}) {
  const viewer = new EventTarget();
  const info = {
    status: "",
    viewport: null,
    zoom: null,
    docState: null,
    cursorStyle: null,
    fontList: [],
    styleList: [],
    colors: null,
    keyBindings: [],
    zoomSpec: null,
    rulers: null,
    guides: null,
    editButton: false,
  };
  const infoKey = {
    status: "status", viewport: "viewport", zoom: "zoom", docstate: "docState", cursorstyle: "cursorStyle",
    fontlist: "fontList", stylelist: "styleList", colors: "colors", keybindings: "keyBindings", zoomspec: "zoomSpec",
  };
  function emit(type, detail) {
    if (infoKey[type]) info[infoKey[type]] = detail;
    viewer.dispatchEvent(new CustomEvent(type, { detail }));
  }
  let readOnly = options.readOnly !== false;
  const ownsPage = !!options.ownsPage;
  const cleanups = [];
  function listen(target, type, handler, opts) {
    target.addEventListener(type, handler, opts);
    cleanups.push(() => target.removeEventListener(type, handler, opts));
  }

  let shellCameraHook = () => {};
  const session = createCoreSession(
    undefined,
    (camera) => shellCameraHook(camera),
    undefined,
    (frame) => showRemoteFrame(frame),
    options.engine ? new URL("core-worker-boot.js", new URL(String(options.engine).replace(/\/?$/, "/"), location.href)) : null,
  );
  // ?rlog=1 이면 폰 같은 원격 기기의 로그와 프레임 통계를 개발 서버로 보낸다.
  const remoteLog = startRemoteLog(session);
  function setStatus(text) {
    emit("status", { text });
  }
  setStatus("코어 준비 중...");
  const coreReady = session.boot(options.fonts ?? DEFAULT_FONTS).then(async (result) => {
    if (info.status?.text === "코어 준비 중...") setStatus("문서를 열 수 있습니다.");
    // 캐시 예산(바이트)을 바꾼다. 메모리가 작은 기기의 사정을 데스크톱에서 재현할 때 쓴다.
    for (const pair of String(options.cacheBudget || "").split(",")) {
      const [name, bytes] = pair.split(":");
      if (name && Number(bytes) > 0) await session.setCacheBudget(name, Number(bytes));
    }
    remoteLog?.begin();
    // 글꼴 고르기 목록은 코어가 정한다. 라이선스로 막힌 글꼴은 빠져 있다.
    void session.pickableFonts().then((list) => emit("fontlist", Array.isArray(list) ? list : []),
      (error) => logError("pickableFonts", error));
    return result;
  }).catch((error) => {
    logError("boot", error);
    setStatus(`코어 실패: ${error?.message || error}`);
    throw error;
  });

  // 화면 그릇. 캔버스·캐럿은 쪽 자리(slot)에, 스크롤 막대를 주는 스크롤 판은 그 위에 놓는다.
  const root = document.createElement("div");
  root.className = "preview-scroll";
  root.tabIndex = -1;
  const stack = document.createElement("div");
  stack.className = "page-stack";
  const slot = document.createElement("div");
  slot.className = "sheet-slot";
  stack.append(slot);
  root.append(stack);
  host.append(root);
  activeViewer ??= viewer;
  listen(root, "pointerdown", () => {
    activeViewer = viewer;
  }, true);
  listen(root, "focusin", () => {
    activeViewer = viewer;
  });

  let openedName = "";
  // 쪽 수와 지금 쪽(0부터). 쪽 목록은 코어 답(쪽 계산, 편집 결과, 카메라)에서 온다.
  let pageCount = 0;
  // 코어가 쪽을 아직 세는 중인가(열 때 보일 쪽만 먼저 쌓았다).
  let pageCounting = false;
  let pageIndex = -1;
  let scenePages = [];

  // 화면 배율. 100%는 한글과 같이 96dpi로 본 용지다. 처음 배율은 query 의 zoom 을 코어가 맞춘다.
  let screenPercent = 100;
  let fitPageMode = false;
  let fitWidthMode = false;
  // 배율 방식과 화면 글은 코어가 준다(보기 계획·카메라). 셸은 만들지 않는다.
  let zoomModeNow = "percent";
  let zoomLabelNow = "";
  let pageNow = -1;
  function takeZoomLabel(source) {
    if (Number.isInteger(source?.page) && source.page >= 0) pageNow = source.page;
    if (typeof source?.zoomMode === "string" && source.zoomMode) zoomModeNow = source.zoomMode;
    if (typeof source?.zoomLabel === "string" && source.zoomLabel) zoomLabelNow = source.zoomLabel;
  }

  let lastNotified = "";
  // 코어가 정한 쪽 모양(입력 답). GPU 화면이면 lastPaint 가 없어서 따로 둔다.
  let viewGrid = { mode: "auto", cols: 1, rows: 1, effectiveCols: 1 };

  // 화면 가운데 쪽은 코어가 정한다(보기 계획·카메라의 page). 셸은 받은 값을 쓴다.
  function resolveCurrentPageIndex(hintPage = -1) {
    if (Number.isInteger(hintPage) && hintPage >= 0) return hintPage;
    if (pageNow >= 0) return pageNow;
    return Math.max(0, pageIndex);
  }

  function viewDetail(activeIndex) {
    return {
      page: activeIndex >= 0 ? activeIndex + 1 : 1,
      pageIndex: Math.max(0, activeIndex),
      pageCount: Math.max(scenePages.length, pageCount),
      pageCounting,
      percent: screenPercent,
      fit: fitPageMode ? "page" : (fitWidthMode ? "width" : ""),
      fitPage: fitPageMode,
      fitWidth: fitWidthMode,
      zoomMode: zoomModeNow,
      zoomLabel: zoomLabelNow,
      scrollX: shownScrollX | 0,
      scrollY: shownScrollY | 0,
      gridMode: viewGrid.mode,
      gridCols: viewGrid.cols,
      gridRows: viewGrid.rows,
      effectiveCols: viewGrid.effectiveCols,
      rowStepY: lastPaint?.rowStepY || 0,
      pageStepY: lastPaint?.pageStepY || 0,
    };
  }

  function syncViewportInfo(hintPage = -1) {
    const index = resolveCurrentPageIndex(hintPage);
    if (lastPaint && Number.isInteger(index) && index >= 0) lastPaint.page = index;
    if (index >= 0 && index < pageCount) pageIndex = index;
    const activeIndex = pageIndex >= 0 ? pageIndex : index;
    const detail = viewDetail(activeIndex);
    // 스크롤만 바뀐 것은 알리지 않는다.
    const key = [detail.page, detail.pageCount, detail.pageCounting, detail.percent, fitPageMode, fitWidthMode,
      viewGrid.mode, viewGrid.cols, viewGrid.rows].join(":");
    if (key === lastNotified) return;
    lastNotified = key;
    emit("viewport", detail);
  }

  function syncZoomInput(hintPage = -1) {
    const pageIndexNow = Math.max(0, resolveCurrentPageIndex(hintPage));
    emit("zoom", viewDetail(pageIndexNow));
    syncViewportInfo(pageIndexNow);
  }

  function sceneReady() {
    return scenePages.some((node) => node?.width && node?.height);
  }

  // 맞춤 배율과 쪽 배치는 화면이 있든 없든 코어 입력 하나로 보낸다. 배율 계산·기본값(두 쪽은 2칸,
  // 격자는 맞춤)은 코어가 정하고, 셸은 카메라 답(adoptCamera)으로 화면을 맞춘다.
  function fitZoom(mode) {
    if (!sceneReady()) return;
    ensureViewport();
    void sendInput({ type: "fit", mode: mode === "width" ? "width" : "page" });
  }

  function applyPageGrid(rawGrid) {
    if (!sceneReady()) return;
    const spec = typeof rawGrid === "string" ? { mode: rawGrid } : (rawGrid || {});
    const input = { type: "grid", mode: typeof spec.mode === "string" ? spec.mode : "auto" };
    if (Number(spec.cols) > 0) input.cols = Number(spec.cols) | 0;
    if (Number(spec.rows) > 0) input.rows = Number(spec.rows) | 0;
    if (typeof spec.fit === "boolean") input.fit = spec.fit;
    ensureViewport();
    void sendInput(input);
  }

  // 배율 바꾸기도 화면이 있든 없든 코어 입력 하나다. 범위 자르기·맞춤 끄기·스크롤 기준은 코어가 정한다.
  function applyZoomPercent(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      syncZoomInput();
      return;
    }
    if (!sceneReady()) return;
    ensureViewport();
    void sendInput({ type: "zoom", percent: Math.round(n) });
  }

  let viewCanvasNode = null;
  let scrollerNode = null;
  let spacerNode = null;
  let caretNode = null;
  let screenAttached = null;
  let screenLive = false;
  let applyingScroll = false;
  let pinchLive = false;
  let gestureActive = false;
  let scrollOwned = false;
  let shownScrollX = 0;
  let shownScrollY = 0;
  let lastPaint = null;
  let selectedText = "";
  let caretImage = null;

  // 그릇에 붙어 있는 화면 캔버스. 문서를 닫으면 떼어 두고 다시 붙인다(워커로 넘긴 캔버스는 바꿀 수 없다).
  function liveCanvas() {
    return viewCanvasNode instanceof HTMLCanvasElement && viewCanvasNode.isConnected ? viewCanvasNode : null;
  }

  function syncZoomChrome() {
    syncZoomInput();
    root.classList.add("zoomed");
  }

  function viewportInput() {
    const box = scrollerNode || root;
    return {
      type: "viewport",
      cssW: Math.max(1, box.clientWidth),
      cssH: Math.max(1, box.clientHeight),
      dpr: window.devicePixelRatio || 1,
    };
  }

  function postViewport() {
    void sendInput(viewportInput());
  }

  function sheetRects(plan) {
    const scrollX = plan?.scrollX | 0;
    const scrollY = plan?.scrollY | 0;
    return (plan?.pages || []).map((page) => ({
      index: page.index | 0,
      x: (page.x | 0) - scrollX,
      y: (page.y | 0) - scrollY,
      w: page.w | 0,
      h: page.h | 0,
    }));
  }

  function viewPoint(clientX, clientY) {
    const canvas = liveCanvas();
    const plan = lastPaint;
    if (!canvas || !plan) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const bufferW = plan.viewW || canvas.width || rect.width;
    const bufferH = plan.viewH || canvas.height || rect.height;
    return {
      dx: (clientX - rect.left) * (bufferW / rect.width),
      dy: (clientY - rect.top) * (bufferH / rect.height),
    };
  }

  // 원격 화면: 캔버스를 워커로 넘길 수 없을 때. 코어가 정한 2D 그림 목록을 캔버스 2D 로 옮긴다.
  const drawScreen2D = createScreen2D();
  function showRemoteFrame(frame) {
    const canvas = liveCanvas() || viewCanvasNode;
    if (!(canvas instanceof HTMLCanvasElement)) return;
    drawScreen2D(canvas, frame);
  }
  function attachRemoteSurface() {
    screenAttached = coreReady.then(async () => {
      screenLive = !!(await session.surfaceRemote());
      return screenLive;
    }).catch((error) => {
      logError("session.surfaceRemote", error);
      screenLive = false;
      return false;
    });
    return screenAttached;
  }

  function attachViewSurface(canvas) {
    if (screenAttached) return screenAttached;
    if (typeof canvas.transferControlToOffscreen !== "function") {
      logError("attachViewSurface", "canvas.transferControlToOffscreen 미지원 → 원격 화면");
      return attachRemoteSurface();
    }
    let offscreen;
    try {
      offscreen = canvas.transferControlToOffscreen();
    } catch (error) {
      logError("transferControlToOffscreen", error);
      return attachRemoteSurface();
    }
    // 부팅 때 만든 캔버스는 아직 화면에 없을 수 있다. 그래도 넘긴 캔버스는 다시 못 쓰니 바꿔 둔다.
    const restoreMainCanvas = () => {
      const replacement = document.createElement("canvas");
      replacement.className = canvas.className;
      if (canvas.parentNode) canvas.replaceWith(replacement);
      if (viewCanvasNode === canvas) viewCanvasNode = replacement;
    };
    screenAttached = coreReady.then(async () => {
      const ok = await session.surface(offscreen, !!options.nogpu);
      screenLive = !!ok;
      if (screenLive) return true;
      // 넘긴 캔버스로 화면을 못 열었다. 새 캔버스에 원격 화면으로 붙인다.
      restoreMainCanvas();
      screenLive = !!(await session.surfaceRemote());
      return screenLive;
    }).catch((error) => {
      logError("session.surface", error);
      screenLive = false;
      restoreMainCanvas();
      return false;
    });
    return screenAttached;
  }

  function makeViewCanvas() {
    if (!(viewCanvasNode instanceof HTMLCanvasElement)) {
      viewCanvasNode = document.createElement("canvas");
      viewCanvasNode.className = "view-canvas";
    }
    return viewCanvasNode;
  }

  function ensureViewport() {
    root.classList.add("view-mode");
    syncZoomChrome();
    let canvas = liveCanvas();
    if (!canvas) {
      canvas = makeViewCanvas();
      slot.replaceChildren(canvas);
    }
    attachViewSurface(canvas);
    ensureCaret();
    if (!scrollerNode) {
      scrollerNode = document.createElement("div");
      scrollerNode.className = "view-scroller";
      spacerNode = document.createElement("div");
      spacerNode.className = "view-spacer";
      scrollerNode.append(spacerNode);
      root.append(scrollerNode);
      scrollerNode.addEventListener("scroll", onViewScroll, { passive: true });
      scrollerNode.addEventListener("pointermove", (event) => {
        if (event.buttons || event.pointerType === "touch" || event.pointerType === "pen") return;
        const hover = viewPoint(event.clientX, event.clientY);
        if (!hover) return;
        hoverWanted = { x: hover.dx, y: hover.dy };
        void askHoverCursor();
      });
    }
    return scrollerNode;
  }

  // 마우스 커서 모양은 코어가 정한다(개체 손잡이·글줄·그 밖). 한 번에 하나만 묻고, 그동안 움직인 자리는 마지막 것만 다시 묻는다.
  let hoverWanted = null;
  let hoverAsking = false;
  async function askHoverCursor() {
    if (hoverAsking) return;
    hoverAsking = true;
    try {
      while (hoverWanted) {
        const point = hoverWanted;
        hoverWanted = null;
        const cursor = await session.hover(point.x, point.y);
        if (scrollerNode && !hoverWanted && presses.size === 0) scrollerNode.style.cursor = cursor || "";
      }
    } catch (error) {
      logError("hover", error);
    } finally {
      hoverAsking = false;
    }
  }

  function clearViewport() {
    root.classList.remove("view-mode");
    scrollerNode?.remove();
    scrollerNode = null;
    spacerNode = null;
    liveCanvas()?.remove();
    caretNode?.remove();
    caretNode = null;
    caretImage = null;
    lastPaint = null;
  }

  function paintView(plan) {
    const canvas = liveCanvas();
    if (!canvas || !plan?.viewW || !plan?.viewH) return;
    const dpr = plan.dpr || 1;
    canvas.style.width = `${plan.viewW / dpr}px`;
    canvas.style.height = `${plan.viewH / dpr}px`;
    // 화면은 코어가 그린다. 셸 겹그림(캐럿 그림)은 지운다.
    canvas.style.transform = "";
    if (caretNode) caretNode.hidden = true;
  }

  function ensureCaret() {
    if (caretNode?.isConnected) return;
    caretNode = document.createElement("canvas");
    caretNode.className = "view-caret";
    caretNode.hidden = true;
    slot.append(caretNode);
  }

  // 단축키 표는 코어가 준다(keyBindings). 키를 누른 그 순간 기본 동작을 막아야 해서 미리 받아 둔다.
  let keyTable = [];
  // 키가 사는 캐럿 상태(when)는 코어가 표에 적고, 그 상태 값도 코어가 준다(caretstatus).
  let caretState = {};
  // 두 번 누르는 단축키는 코어 표의 next 다. 앞 키를 맞추면 그 키를 기억해 두고 다음 키로 표를 맞춘다.
  let chordLead = null;
  function findKey(event) {
    const ctrl = !!(event.ctrlKey || event.metaKey);
    const alt = !!event.altKey;
    const shift = event.shiftKey ? 1 : 0;
    const same = (item) => (item.key === event.code || item.key === event.key);
    if (chordLead) {
      const lead = chordLead;
      if (["Control", "Alt", "Shift", "Meta"].includes(event.key)) return null;
      chordLead = null;
      // 다음 키는 앞 키의 Ctrl·Alt 를 쥔 채로도, 놓고도 누를 수 있다.
      return keyTable.find((item) => item.next && item.key === lead.key && item.ctrl === lead.ctrl && item.alt === lead.alt &&
        (item.next === event.code || item.next === event.key) && (!ctrl || item.ctrl) && (!alt || item.alt) &&
        (!item.when || !!caretState[item.when])) || null;
    }
    const plain = keyTable.find((item) => !item.next &&
      same(item) && item.ctrl === ctrl && item.alt === alt &&
      (item.shift < 0 || item.shift === shift) && (!item.when || !!caretState[item.when]));
    if (plain) return plain;
    const lead = keyTable.find((item) => item.next && same(item) && item.ctrl === ctrl && item.alt === alt &&
      (item.shift < 0 || item.shift === shift));
    if (lead) return { command: "chordLead", key: lead.key, ctrl, alt };
    return null;
  }
  void coreReady.then(() => session.keyBindings()).then((list) => {
    if (Array.isArray(list)) keyTable = list;
    // 메뉴의 단축키 표시도 이 표에서 읽는다.
    void session.zoomDialogSpec().then((spec) => emit("zoomspec", spec))
      .catch((error) => logError("zoomDialogSpec", error));
    emit("keybindings", keyTable);
  }).catch((error) => logError("keyBindings", error));

  // 상태 줄의 저장 표시. clean 은 연 그대로, dirty 는 고친 뒤 저장 전, saved 는 저장한 뒤다. 상태는 코어가 정한다.
  function emitDocState(state) {
    if (!state) return;
    emit("docstate", { state, name: openedName });
  }

  // 코어는 바뀐 것만 준다: 모양이 같으면 styleChanged 가 거짓이고, 캐럿 상태가 같으면 caret 이 없다.
  // 알림도 바뀐 것만 낸다. 지금 모양(cursorStyleNow)은 늘 마지막 캐럿 상태를 품는다.
  let cursorStyleNow = null;
  function emitCursorStyle(cursorStyle) {
    if (!cursorStyle || typeof cursorStyle !== "object") return;
    const caret = cursorStyle.caret || null;
    if (caret) caretState = caret;
    if (cursorStyle.styleChanged !== false) {
      cursorStyleNow = { ...cursorStyle, caret: caret || cursorStyleNow?.caret || null };
      emit("cursorstyle", cursorStyleNow);
    } else if (caret && cursorStyleNow) {
      cursorStyleNow.caret = caret;
    }
    if (caret) emit("caretstatus", caret);
  }

  // 쪽 수는 코어가 알린다(편집 결과의 쪽 목록, 카메라의 pageCount). 글꼴이 들어와 다시 놓거나 글이 쪽을 넘겨도 맞춘다.
  function showPageCount(count, counting = false) {
    const next = count | 0;
    if (next > 0 && !!counting !== pageCounting) {
      pageCounting = !!counting;
      syncViewportInfo();
    }
    if (next <= 0 || next === pageCount) return;
    pageIndex = Math.min(Math.max(0, pageIndex), next - 1);
    pageCount = next;
    const text = info.status?.text;
    if (typeof text === "string" && /·\s*\d+페이지/.test(text)) setStatus(text.replace(/·\s*\d+페이지/, `· ${next}페이지`));
  }

  function applyEditResult(result) {
    if (!result) return;
    if (result.needsFontSwap) editor.askFontSwap();
    emitDocState(result.docState);
    if (result.documentChanged && Array.isArray(result.pages) && result.pages.length > 0) {
      scenePages = result.pages;
      showPageCount(result.pages.length);
    }
    if (Number.isFinite(result.scrollX) && Number.isFinite(result.scrollY)) {
      const nextX = result.scrollX | 0;
      const nextY = result.scrollY | 0;
      if (nextX !== shownScrollX || nextY !== shownScrollY) {
        placeCameraScroll(nextX, nextY, true, Number.isInteger(result.page) ? result.page : -1);
      }
    }
    applyPointerResult(result, true);
    // 다시 그리기와 캐럿이 보이게 스크롤하는 일은 코어가 한다. 스크롤은 위 result.scrollX/Y 로 왔다.
  }

  const editor = attachEditor({
    session,
    coreReady,
    readOnly: () => readOnly,
    sceneReady,
    applyEditResult,
    emit,
    emitCursorStyle,
    findKey,
    keyBindings: () => keyTable,
    logError,
  });

  function applyPointerResult(result, restartCaret) {
    // 끌어 그린 도형처럼 포인터로 문서를 고쳤다.
    if (result?.edited) emitDocState(result.docState);
    // 막힌 글꼴 때문에 그린 도형을 넣지 못했다. 바꿀지 묻고, 바꾸면 코어가 그 도형을 이어서 넣는다.
    // 표·그림 넣기는 applyEditResult 에서 같은 식으로 묻는다.
    if (result?.needsFontSwap) editor.askFontSwap();
    if (result?.cursorStyle) emitCursorStyle(result.cursorStyle);
    if (typeof result?.text === "string") selectedText = result.text;
    caretImage = result?.caret ? { caret: true } : null;
    for (const image of result?.images || []) {
      if (!image.caret) continue;
      const canvas = pixelsToCanvas(image);
      if (!canvas) continue;
      caretImage = {
        page: image.page | 0,
        x: image.x | 0,
        y: image.y | 0,
        w: image.w | 0,
        h: image.h | 0,
        pageW: image.pageW | 0,
        pageH: image.pageH | 0,
        canvas,
      };
    }
    if (lastPaint) paintView(lastPaint);
    else showCaret(null);
    if (restartCaret && caretImage) blinkCaret();
    if (result?.active || result?.caret) editor.focusInput();
    // 덧말·글자 겹치기를 두 번 누르면 코어가 고른 고치기 대화 상자를 연다.
    if (result?.dialog) emit("formatdialog", { name: result.dialog });
    // 블록 마커를 끌지 않고 누르면 그 자리에 복사·잘라내기 메뉴를 띄운다.
    if (result?.pinTap && selectedText) {
      emit("selectionmenu", { x: lastPressClient.x, y: lastPressClient.y, readOnly });
    }
  }

  function selectionAction(action) {
    if (action === "copy") {
      if (selectedText) copyText(selectedText);
      return;
    }
    editor.selectionAction(action, selectedText, copyText);
  }

  function showCaret(plan) {
    const el = caretNode;
    if (!el) return;
    const mark = caretImage;
    const sheet = mark && plan ? sheetRects(plan).find((item) => item.index === mark.page) : null;
    if (!mark?.canvas || !sheet?.w || !mark.pageW || !mark.pageH) {
      el.hidden = true;
      return;
    }
    const dpr = plan.dpr || 1;
    const sx = sheet.w / mark.pageW;
    const sy = sheet.h / mark.pageH;
    const left = (sheet.x + mark.x * sx) / dpr;
    const top = (sheet.y + mark.y * sy) / dpr;
    const width = Math.max(1, (mark.w * sx) / dpr);
    const height = Math.max(1, (mark.h * sy) / dpr);
    if (el.width !== mark.w || el.height !== mark.h) {
      el.width = mark.w;
      el.height = mark.h;
    }
    const ctx = el.getContext("2d");
    if (ctx) ctx.drawImage(mark.canvas, 0, 0);
    el.hidden = false;
    el.style.width = `${width}px`;
    el.style.height = `${height}px`;
    el.style.transform = `translate(${left}px, ${top}px)`;
  }

  function blinkCaret() {
    if (!caretNode) return;
    caretNode.style.animation = "none";
    void caretNode.offsetWidth;
    caretNode.style.animation = "";
  }

  function hideCaret() {
    caretImage = null;
    showCaret(lastPaint);
    // 코어의 고른 구간·캐럿도 지운다.
    void session.pointer(4, -1, 0, 0, screenPercent).catch(() => {});
  }

  let applyingScrollRelease = 0;
  function holdApplyingScroll() {
    applyingScroll = true;
    if (applyingScrollRelease) cancelAnimationFrame(applyingScrollRelease);
    applyingScrollRelease = requestAnimationFrame(() => {
      applyingScrollRelease = 0;
      applyingScroll = false;
    });
  }

  function applySpacer(plan, keepPlace) {
    if (!scrollerNode || !spacerNode || !plan) return;
    const dpr = plan.dpr || 1;
    holdApplyingScroll();
    spacerNode.style.width = `${scrollerNode.clientWidth + (plan.maxScrollX || 0) / dpr}px`;
    spacerNode.style.height = `${scrollerNode.clientHeight + (plan.maxScrollY || 0) / dpr}px`;
    if (!keepPlace) {
      const left = (plan.scrollX || 0) / dpr;
      const top = (plan.scrollY || 0) / dpr;
      if (Math.abs(scrollerNode.scrollLeft - left) >= 0.5 || Math.abs(scrollerNode.scrollTop - top) >= 0.5) {
        scrollerNode.scrollLeft = left;
        scrollerNode.scrollTop = top;
      }
    }
  }

  function onViewScroll() {
    if (applyingScroll || pinchLive || scrollOwned || !scrollerNode) return;
    const dpr = lastPaint?.dpr || window.devicePixelRatio || 1;
    const x = Math.round(scrollerNode.scrollLeft * dpr);
    const y = Math.round(scrollerNode.scrollTop * dpr);
    if (x === shownScrollX && y === shownScrollY) return;
    shownScrollX = x;
    shownScrollY = y;
    if (lastPaint) {
      lastPaint = { ...lastPaint, scrollX: x, scrollY: y };
      syncViewportInfo();
    }
    queueScrollInput(x, y);
  }

  // 여는 단계별 시간. 원격 로그(?rlog=1)로 보낸다.
  const opening = {
    name: "",
    at: 0,
    done: false,
    steps: [],
    begin(name, at) {
      this.name = name;
      this.at = at;
      this.done = false;
      this.steps = [];
    },
    fromFile(time) {
      return Number((time - this.at).toFixed(1));
    },
    mark(label, started, extra) {
      const now = Date.now();
      const row = {
        idx: this.steps.length + 1,
        단계: label,
        시작: this.fromFile(started),
        ms: Number((now - started).toFixed(1)),
        누적: this.fromFile(now),
      };
      if (extra) Object.assign(row, extra);
      this.steps.push(row);
      remoteLog?.memory(label);
    },
    end(error) {
      if (this.done) return;
      this.done = true;
      if (error) emit("openfailed", { error });
      const head = {
        idx: 0,
        문서: this.name,
        시작: 0,
        ms: Number((Date.now() - this.at).toFixed(1)),
      };
      if (error) head.오류 = String(error?.message || error);
      remoteLog?.memory("열기 끝");
      remoteLog?.note("opening", [head, ...this.steps]);
    },
  };

  function foldPageLog(rows) {
    const pages = [];
    let header = null;
    let stackMs = null;
    let calc = null;
    let count = null;
    for (const row of rows ?? []) {
      if (!row || typeof row !== "object") continue;
      if (typeof row.쪽 === "number") pages.push(row);
      if ("머리말" in row) header = (header ?? 0) + row.머리말;
      if ("쪽쌓기" in row) stackMs = row.쪽쌓기;
      if ("페이지계산" in row) calc = row.페이지계산;
      if ("쪽수" in row) count = row.쪽수;
    }
    if (!pages.length && header == null && stackMs == null && calc == null) return null;
    const extra = {};
    if (pages.length) extra.쪽 = pages;
    if (header != null) extra.머리말 = header;
    if (stackMs != null) extra.쪽쌓기 = stackMs;
    if (calc != null) extra.페이지계산 = calc;
    if (count != null) extra.쪽수 = count;
    return extra;
  }

  function layoutZoom() {
    syncZoomChrome();
    const node = pageIndex >= 0 ? scenePages[pageIndex] : null;
    if (node?.width && node?.height) {
      ensureViewport();
      return;
    }
    clearViewport();
  }

  function renderPreview() {
    if (!(pageCount > 0 && pageIndex >= 0)) {
      clearViewport();
      return;
    }
    if (sceneReady()) {
      ensureViewport();
      postViewport();
      return;
    }
    // 장면이 아직 없으면 그릴 것이 없다. 장면이 오면 위에서 그린다.
    clearViewport();
  }

  function setPages(count, index = 0, keepCoreCaret = false) {
    pageCount = scenePages.length || count;
    pageIndex = pageCount ? Math.min(Math.max(0, index | 0), pageCount - 1) : -1;
    // 문서를 막 열었으면 커서는 코어가 쪽을 짤 때 정했다(새 문서는 첫 문단). 셸 표시만 지우고 코어 커서는 둔다.
    if (keepCoreCaret) {
      caretImage = null;
      showCaret(lastPaint);
    } else {
      hideCaret();
    }
    renderPreview();
  }

  const resizeObserver = new ResizeObserver(() => {
    if (sceneReady()) {
      ensureViewport();
      postViewport();
      return;
    }
    layoutZoom();
  });
  resizeObserver.observe(root);

  function stepPageView(dir) {
    if (!dir || !sceneReady()) return;
    cancelScrollInput();
    void sendInput({ type: "pageStep", dir: dir < 0 ? -1 : 1 });
  }

  // 창 하나로 오는 입력(키, Ctrl+휠, 제스처)을 이 보기가 받을지. 앱이면 페이지 전체, 넣은 보기면 그릇 안만 받는다.
  function ownsWindowInput(target) {
    if (activeViewer !== viewer) return false;
    return ownsPage || root.contains(target) || editor.isInput(target);
  }

  // 단축키. 어떤 키가 무슨 명령인지는 코어 표가 정하고, 여기서는 그 명령을 실행한다.
  // 다른 입력칸(대화 상자 등) 안에서는 그 칸의 기본 동작을 둔다. 한글 자판이어도 글자 키는 같은 자리 키다(event.code).
  listen(window, "keydown", (event) => {
    if (event.isComposing || event.keyCode === 229 || editor.composing()) return;
    if (!ownsWindowInput(event.target)) return;
    const binding = findKey(event);
    if (!binding) return;
    const target = event.target;
    const inEditor = editor.isInput(target);
    // 입력칸에 맡길 키(글이 남은 입력칸의 지우기)는 입력기가 처리한다.
    if (inEditor && editor.keyGoesToField(event)) return;
    const foreign =
      !inEditor &&
      (target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        (target instanceof HTMLElement && target.isContentEditable));
    // 편집 입력칸에서만 쓰는 키(Esc)는 입력칸이 받는다. 위에 뜬 대화 상자가 먼저 닫을 수 있게 둔다.
    if (foreign || binding.editorOnly) return;
    const command = binding.command;
    // 두 번 누르는 단축키의 앞 키다. 다음 키를 기다린다.
    if (command === "chordLead") {
      event.preventDefault();
      chordLead = binding;
      return;
    }
    // 붙여 넣기는 플랫폼이 입력칸에 붙여 넣기 사건으로 준다(입력칸 paste 사건). 기본 동작을 막지 않는다.
    if (command === "paste") return;
    if (command === "cut" || command === "open" || command === "save") {
      event.preventDefault();
      if (command === "cut") selectionAction("cut");
      else emit(command === "open" ? "openrequest" : "saverequest", {});
      return;
    }
    if (command === "copy") {
      // 복사는 클립보드에 바로 써야 해서 셸이 쓴다. 고른 글이 없으면 브라우저에 둔다.
      if (!selectedText) return;
      event.preventDefault();
      copyText(selectedText);
      return;
    }
    const dialog = command.endsWith("Dialog") ? command.slice(0, -"Dialog".length) : "";
    if (!dialog && !sceneReady()) return;
    event.preventDefault();
    event.stopPropagation();
    if (dialog) {
      emit("formatdialog", { name: dialog });
    } else if (command === "editKey") {
      void editor.editKey(binding, event);
    } else if (command === "undo" || command === "redo") {
      selectionAction(command);
    } else if (command === "pageDown" || command === "pageUp") {
      stepPageView(command === "pageDown" ? 1 : -1);
    } else {
      // 나머지는 코어 편집 명령이다. 코어가 열 대화 상자를 주면 연다(다시 찾기에 찾은 글이 없을 때 등).
      void editor.shortcut(command).then((result) => {
        if (result?.dialog) emit("formatdialog", { name: result.dialog });
        if (result?.notice) emit("notice", { text: result.notice });
        if (result && !result.documentChanged && result.error) emit("notice", { text: result.error });
      });
    }
  }, true);

  // 눈금자는 코어가 화면 캔버스에 그린다. 켠 값과 처음 값, 켜고 끄기는 코어가 정한다.
  // 셸은 코어가 알려 준 값을 알리고, 사용자가 바꾸면 저장해 둔다.
  const rulersKey = "chwp.rulers";
  // 저장해 둔 값. 없으면 null 이다.
  function savedRulers() {
    try {
      const saved = localStorage.getItem(rulersKey);
      return saved === null ? null : saved !== "0";
    } catch {
      return null;
    }
  }
  function takeRulers(camera) {
    if (typeof camera?.rulersWanted !== "boolean" || camera.rulersWanted === info.rulers) return;
    const changed = info.rulers !== null;
    info.rulers = camera.rulersWanted;
    if (changed) {
      try {
        localStorage.setItem(rulersKey, info.rulers ? "1" : "0");
      } catch {}
    }
    emit("rulers", { on: info.rulers });
  }
  // 보기 격자·안내선. 설정과 판단은 코어가 들고, 셸은 코어가 돌려준 값을 알리고 저장해 두었다가 다음에 다시 넘긴다.
  // 저장한 값이 없으면 빈 값을 넘겨 코어의 처음값을 받는다.
  const guidesKey = "chwp.viewGuides";
  function savedGuides() {
    try {
      const saved = localStorage.getItem(guidesKey);
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  }
  function takeGuides(fields, store) {
    if (!fields || typeof fields !== "object") return fields;
    info.guides = fields;
    if (store) {
      try {
        localStorage.setItem(guidesKey, JSON.stringify(fields));
      } catch {}
    }
    emit("guides", fields);
    return fields;
  }
  function applyViewGuides(fields) {
    return coreReady.then(() => session.applyViewGuides(fields || {})).then((next) => takeGuides(next, true));
  }
  function viewGuides(fields) {
    return coreReady.then(() => session.viewGuides(fields || {}));
  }
  void coreReady.then(() => session.applyViewGuides(savedGuides() || {})).then((next) => takeGuides(next, false));
  // 블록 마커는 따로 설정하지 않는다. 손가락이 주 입력인 화면(pointer: coarse)에서만 켜고,
  // 태블릿에 키보드·마우스를 붙이는 것처럼 주 입력이 바뀌면 따라간다.
  const coarsePointer = window.matchMedia?.("(pointer: coarse)");
  function syncPins() {
    void sendInput({ type: "pins", on: !!coarsePointer?.matches });
  }
  if (coarsePointer?.addEventListener) listen(coarsePointer, "change", syncPins);

  // 마우스, 터치, 펜은 같은 포인터로 코어에 넘긴다. 스크롤과 핀치와 선택은 코어가 가른다.
  const presses = new Map();
  // 코어가 입력 답마다 알려 준다. 첫 답 전에는 코어 기본값과 같은 8 장치 픽셀이다.
  let tapSlop = 8;
  const pointerPending = new Map();
  let pointerFlush = 0;
  let gesturePending = null;
  let gestureFlush = 0;
  let scrollInputPending = null;
  let scrollInputFlush = 0;
  let cachedContactBounds = null;
  function contactPoint(event, refreshBounds = false) {
    if (refreshBounds || !cachedContactBounds) {
      cachedContactBounds = (scrollerNode || root).getBoundingClientRect();
    }
    const dpr = window.devicePixelRatio || 1;
    let cx = event.clientX;
    let cy = event.clientY;
    if (!Number.isFinite(cx) || !Number.isFinite(cy) || (cx === 0 && cy === 0 && presses.size >= 2)) {
      let sx = 0;
      let sy = 0;
      let n = 0;
      for (const p of presses.values()) {
        const px = Number.isFinite(p.curX) ? p.curX : p.x;
        const py = Number.isFinite(p.curY) ? p.curY : p.y;
        if (Number.isFinite(px) && Number.isFinite(py)) {
          sx += px;
          sy += py;
          n += 1;
        }
      }
      if (n > 0) {
        cx = sx / n;
        cy = sy / n;
      } else if (Number.isFinite(event.pageX) && Number.isFinite(event.pageY)) {
        cx = event.pageX - window.scrollX;
        cy = event.pageY - window.scrollY;
      } else {
        cx = cachedContactBounds.left + cachedContactBounds.width * 0.5;
        cy = cachedContactBounds.top + cachedContactBounds.height * 0.5;
      }
    }
    return {
      x: (cx - cachedContactBounds.left) * dpr,
      y: (cy - cachedContactBounds.top) * dpr,
    };
  }
  function cancelScrollInput() {
    scrollInputPending = null;
    if (scrollInputFlush) {
      cancelAnimationFrame(scrollInputFlush);
      scrollInputFlush = 0;
    }
  }
  function placeCameraScroll(x, y, settle = false, hintPage = -1) {
    const dpr = lastPaint?.dpr || window.devicePixelRatio || 1;
    shownScrollX = x;
    shownScrollY = y;
    if (scrollerNode && (settle || !scrollOwned)) {
      holdApplyingScroll();
      scrollerNode.scrollLeft = x / dpr;
      scrollerNode.scrollTop = y / dpr;
    }
    if (lastPaint) {
      lastPaint.scrollX = x;
      lastPaint.scrollY = y;
    }
    syncViewportInfo(hintPage);
  }
  function applyShellCamera(camera, fromFrame = false) {
    if (!camera) return;
    takeZoomLabel(camera);
    const prevPercent = screenPercent;
    const prevFitPage = fitPageMode;
    const prevFitWidth = fitWidthMode;
    const nextPercent = camera.percent | 0;
    if (nextPercent > 0) screenPercent = nextPercent;
    if (typeof camera.fitPage === "boolean") fitPageMode = camera.fitPage;
    if (typeof camera.fitWidth === "boolean") fitWidthMode = camera.fitWidth;
    const zoomChanged = screenPercent !== prevPercent || fitPageMode !== prevFitPage || fitWidthMode !== prevFitWidth;
    if (!gestureActive || fromFrame) pinchLive = !!camera.pinching;
    const camPage = Number.isInteger(camera.page) ? (camera.page | 0) : -1;
    if (sceneReady()) showPageCount(camera.pageCount, camera.pageCounting);
    shownScrollX = camera.scrollX | 0;
    shownScrollY = camera.scrollY | 0;
    // 스크롤을 누가 쥐고 있는지·멈췄는지는 코어가 정한다.
    scrollOwned = !!camera.ownsScroll;
    const viewW = camera.viewW | 0;
    const viewH = camera.viewH | 0;
    if (viewW > 0 && viewH > 0) {
      const dpr = camera.dpr > 0 ? camera.dpr : (window.devicePixelRatio || 1);
      const canvas = liveCanvas();
      if (canvas) {
        canvas.style.width = `${viewW / dpr}px`;
        canvas.style.height = `${viewH / dpr}px`;
      }
      lastPaint = {
        ...(lastPaint || {}),
        dpr,
        viewW,
        viewH,
        scrollX: shownScrollX,
        scrollY: shownScrollY,
        maxScrollX: camera.maxScrollX | 0,
        maxScrollY: camera.maxScrollY | 0,
        percent: screenPercent,
        fitPage: fitPageMode,
        fitWidth: fitWidthMode,
        page: camPage >= 0 ? camPage : lastPaint?.page,
      };
      const settled = !!camera.settled && !gestureActive;
      applySpacer(lastPaint, !settled);
      if (settled && scrollerNode) {
        holdApplyingScroll();
        scrollerNode.scrollLeft = shownScrollX / dpr;
        scrollerNode.scrollTop = shownScrollY / dpr;
      }
    }
    // 쪽 모양은 입력 답에만 있다(프레임 알림에는 없다).
    if (typeof camera.gridMode === "string") {
      viewGrid = {
        mode: camera.gridMode,
        cols: camera.gridCols | 0 || 1,
        rows: camera.gridRows | 0 || 1,
        effectiveCols: camera.effectiveCols | 0 || 1,
      };
    }
    if (zoomChanged) syncZoomInput(camPage);
    else syncViewportInfo(camPage);
  }
  shellCameraHook = (camera) => applyShellCamera(camera, true);

  function adoptCamera(camera) {
    takeRulers(camera);
    if (typeof camera?.editButton === "boolean" && camera.editButton !== info.editButton) {
      info.editButton = camera.editButton;
      emit("editbutton", { shown: info.editButton });
    }
    takeZoomLabel(camera);
    if (Number(camera?.tapSlop) > 0) tapSlop = Number(camera.tapSlop);
    if (camera?.select) applyPointerResult(camera, (camera.selectPhase | 0) === 1);
    applyShellCamera(camera, false);
  }
  function sendInput(event) {
    return coreReady.then(() => session.input(event)).then((camera) => {
      adoptCamera(camera);
      return camera;
    });
  }
  function pointerDevice(event) {
    if (event.pointerType === "touch") return 1;
    if (event.pointerType === "pen") return 2;
    return 0;
  }
  function schedulePointerFlush() {
    if (pointerFlush || !pointerPending.size) return;
    pointerFlush = requestAnimationFrame(() => {
      pointerFlush = 0;
      flushPointer();
    });
  }
  function flushPointer() {
    if (pointerFlush) {
      cancelAnimationFrame(pointerFlush);
      pointerFlush = 0;
    }
    if (!pointerPending.size) return;
    const items = Array.from(pointerPending.values());
    pointerPending.clear();
    void (items.length === 1 ? sendInput(items[0]) : sendInput({ type: "pointers", items }));
  }
  function sendPointer(event, phase, button) {
    if (phase === 2 && gestureActive && event.pointerType === "touch") return;
    const point = contactPoint(event, phase === 1);
    const payload = {
      type: "pointer",
      device: pointerDevice(event),
      phase,
      id: event.pointerId,
      button: button | 0,
      x: point.x,
      y: point.y,
      t: event.timeStamp || performance.now(),
    };
    if (phase !== 2) {
      if (presses.size === 0) gestureActive = false;
      flushPointer();
      void sendInput(payload);
      return;
    }
    pointerPending.set(payload.id, payload);
    schedulePointerFlush();
  }
  function queueScrollInput(x, y) {
    scrollInputPending = { x, y };
    if (scrollInputFlush) return;
    scrollInputFlush = requestAnimationFrame(() => {
      scrollInputFlush = 0;
      const pending = scrollInputPending;
      scrollInputPending = null;
      if (!pending) return;
      void sendInput({ type: "scroll", x: pending.x, y: pending.y });
    });
  }
  root.addEventListener("pointerdown", (event) => {
    const touchOrPen = event.pointerType === "touch" || event.pointerType === "pen";
    if (!touchOrPen && event.button !== 0 && event.button !== 1) return;
    event.preventDefault();
    event.stopPropagation();
    // 넣은 보기는 단축키를 그릇 안에서만 받는다. 편집 입력칸이 초점을 받지 않을 때(보기 전용)는 그릇이 받는다.
    if (readOnly) {
      try {
        root.focus({ preventScroll: true });
      } catch {}
    }
    // 커서가 옮겨 갈 수 있다. 입력칸에 남긴 글은 옛 자리 글이라 비우고, 조합 중이면 조합도 버린다.
    editor.resetInput(true);
    if (touchOrPen) scrollOwned = true;
    presses.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      curX: event.clientX,
      curY: event.clientY,
      moved: false,
      touch: touchOrPen,
      button: event.button | 0,
    });
    try {
      root.setPointerCapture?.(event.pointerId);
    } catch {
      // 캡처가 없어도 이동 이벤트는 그릇으로 온다.
    }
    sendPointer(event, 1, event.button);
  }, true);
  root.addEventListener("auxclick", (event) => {
    if (event.button === 1) event.preventDefault();
  }, true);
  root.addEventListener("pointermove", (event) => {
    const press = presses.get(event.pointerId);
    if (!press) return;
    const held = press.button === 1 ? event.buttons & 4 : event.buttons & 1;
    if (!press.touch && !held) return;
    event.preventDefault();
    event.stopPropagation();
    // 탭 거리는 코어 기준(장치 픽셀)이다. 손을 뗄 때 바로 초점을 줘야 해서 여기서도 같은 기준으로 잰다.
    const dpr = lastPaint?.dpr || window.devicePixelRatio || 1;
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) * dpr > tapSlop) press.moved = true;
    press.curX = event.clientX;
    press.curY = event.clientY;
    sendPointer(event, 2, press.button);
  }, true);
  // 마지막으로 뗀 자리(CSS 픽셀). 마커 메뉴를 그 옆에 띄운다.
  const lastPressClient = { x: 0, y: 0 };
  // 손가락 탭이 끝나면 touchend 에서 입력칸에 초점을 준다. 아래 설명.
  let touchTapPending = false;
  const endPointer = (event) => {
    const press = presses.get(event.pointerId);
    if (!press) return;
    event.preventDefault();
    event.stopPropagation();
    presses.delete(event.pointerId);
    lastPressClient.x = event.clientX;
    lastPressClient.y = event.clientY;
    if (press.touch && event.type === "pointerup" && !press.moved && presses.size === 0) touchTapPending = true;
    sendPointer(event, event.type === "pointercancel" ? 4 : 3, press.button);
    if (press.button !== 1 && event.type === "pointerup" && !press.moved && press.touch && presses.size === 0) {
      editor.focusInput();
    }
  };
  root.addEventListener("pointerup", endPointer, true);
  root.addEventListener("pointercancel", endPointer, true);
  // 휴대폰 화면 자판은 사용자 탭 안에서 준 초점에만 뜬다. iOS 는 touchend 를 그 탭으로 본다.
  // 또 touchend 뒤에 브라우저가 흉내 내는 mousedown·click 이 캔버스에 떨어지면 방금 준 초점을 빼앗아 자판이 닫힌다.
  // 그래서 탭이면 여기서 다시 초점을 주고, 기본 동작을 막아 흉내 마우스 이벤트가 오지 않게 한다.
  root.addEventListener("touchend", (event) => {
    if (!touchTapPending) return;
    touchTapPending = false;
    if (event.touches.length > 0) return;
    event.preventDefault();
    editor.focusInput();
  }, { capture: true, passive: false });
  root.addEventListener("touchstart", () => {
    touchTapPending = false;
  }, { capture: true, passive: true });
  const scheduleGestureFlush = () => {
    if (gestureFlush || !gesturePending) return;
    gestureFlush = requestAnimationFrame(() => {
      gestureFlush = 0;
      flushGesture();
    });
  };
  const flushGesture = () => {
    if (gestureFlush) {
      cancelAnimationFrame(gestureFlush);
      gestureFlush = 0;
    }
    if (!gesturePending) return;
    const pending = gesturePending;
    gesturePending = null;
    void sendInput(pending);
  };
  const sendGesture = (event, phase) => {
    if (!ownsWindowInput(event.target)) return;
    event.preventDefault();
    gestureActive = phase !== 3;
    pinchLive = phase !== 3;
    scrollOwned = true;
    cancelScrollInput();
    if (gestureActive && pointerPending.size) {
      pointerPending.clear();
      if (pointerFlush) {
        cancelAnimationFrame(pointerFlush);
        pointerFlush = 0;
      }
    }
    const point = contactPoint(event, phase === 1);
    const payload = {
      type: "gesture",
      kind: 1,
      phase,
      x: point.x,
      y: point.y,
      scale: Number(event.scale) > 0 ? Number(event.scale) : 1,
      dx: 0,
      dy: 0,
      rotation: 0,
    };
    if (phase !== 2) {
      flushGesture();
      void sendInput(payload);
      return;
    }
    gesturePending = payload;
    scheduleGestureFlush();
  };
  listen(window, "gesturestart", (event) => sendGesture(event, 1), { passive: false });
  listen(window, "gesturechange", (event) => sendGesture(event, 2), { passive: false });
  listen(window, "gestureend", (event) => sendGesture(event, 3), { passive: false });
  // 브라우저 확대(Ctrl+휠)를 막는다. 넣은 보기면 그릇 위에서만 막는다.
  listen(window, "wheel", (event) => {
    if (!event.ctrlKey && !event.metaKey) return;
    if (!ownsWindowInput(event.target)) return;
    event.preventDefault();
  }, { passive: false, capture: true });
  // 휠은 브라우저 값을 그대로 넘긴다. 단위·마우스/트랙패드 가르기·속도·끝 판정은 코어(WheelReader)가 한다.
  function sendWheel(event) {
    const point = contactPoint(event);
    const zoom = !!(event.ctrlKey || event.metaKey);
    if (zoom) pinchLive = true;
    scrollOwned = true;
    cancelScrollInput();
    void sendInput({
      type: "wheelRaw",
      dx: event.deltaX,
      dy: event.deltaY,
      deltaMode: event.deltaMode | 0,
      zoom,
      x: point.x,
      y: point.y,
      pageW: scrollerNode ? scrollerNode.clientWidth : 0,
      pageH: scrollerNode ? scrollerNode.clientHeight : 0,
      dpr: lastPaint?.dpr || window.devicePixelRatio || 1,
    });
  }
  root.addEventListener("wheel", (event) => {
    event.preventDefault();
    if (!sceneReady()) return;
    sendWheel(event);
  }, { passive: false, capture: true });

  async function openBytes(bytes, name, query = options.query) {
    let openError = null;
    try {
      shownScrollX = 0;
      shownScrollY = 0;
      selectedText = "";
      caretImage = null;
      lastPaint = null;
      const coreStarted = Date.now();
      await coreReady;
      opening.mark("코어 준비", coreStarted);
      const resetStarted = Date.now();
      await session.view({ reset: true });
      opening.mark("화면 지우기", resetStarted);
      setStatus("파싱 중...");
      scenePages = [];
      const openStarted = Date.now();
      openedName = "";
      const result = bytes ? await session.open(bytes, true) : await session.newDocument();
      if (result?.ok) {
        // 새 문서 이름은 코어가 정한다. 연 문서는 파일 이름이다.
        openedName = name || result.name || "";
        emitDocState(result.docState);
        if (result.cursorStyle) emitCursorStyle(result.cursorStyle);
      }
      opening.mark("문서 열기", openStarted);
      if (!result?.ok) {
        setPages(0);
        openError = new Error(result?.error || "파싱 실패");
        logError("openBytes.parse", openError);
        setStatus(result?.error || "파싱 실패");
        return false;
      }
      setStatus("쪽 계산 중...");
      try {
        const fontStarted = Date.now();
        const fontReport = await session.fontFiles();
        opening.mark("글꼴 받기", fontStarted, fontReport || { 요청: 0, 받음: 0 });
        const layoutStarted = Date.now();
        // measured 면 lineseg 의 줄 경계만 쓰고 줄 높이는 우리 측정값으로 그린다(한글과 모양 비교용).
        const planned = await session.plan(!!options.measured);
        const plan = JSON.parse(planned.json);
        opening.mark("쪽 계산", layoutStarted, foldPageLog(planned.detail));
        scenePages = Array.isArray(plan.pages) ? plan.pages : [];
        pageCount = scenePages.length;
        pageCounting = !!plan.counting;
        ensureViewport();
        if (screenAttached) await screenAttached;
        await session.beginGrind();
        await sendInput(viewportInput());
        // 쪽 모양·배율·쪽·편집 단추(query 의 view, zoom, page, edit)는 코어가 읽고 그 차례로 맞춘다.
        const opened = await sendInput({ type: "embedOpen", choice: String(query || "") });
        setPages(pageCount, opened?.page | 0, true);
        emit("opened", opened);
        // 글꼴 고르기 목록에 이 문서 글꼴이 더해진다(막힌 글꼴은 코어가 뺀다).
        void session.pickableFonts().then((list) => emit("fontlist", Array.isArray(list) ? list : []))
          .catch((error) => logError("pickableFonts", error));
        // 리본 스타일 목록은 문서 스타일 표에서 온다.
        void session.styleNames().then((names) => emit("stylelist", Array.isArray(names) ? names : []))
          .catch((error) => logError("styleNames", error));
        // 새 문서는 첫 문단에 커서가 있으니 바로 칠 수 있게 입력칸에 초점을 준다.
        if (!bytes) editor.focusInput();
      } catch (error) {
        logError("openBytes.plan", error);
        setStatus(`배치 실패: ${error?.message || error}`);
        openError = error;
        return false;
      }
      setStatus(`${name} · ${pageCount}페이지`);
      return true;
    } catch (error) {
      logError("openBytes", error);
      openError = error;
      throw error;
    } finally {
      opening.end(openError);
    }
  }

  // 문서 열기. 바이트(Uint8Array·ArrayBuffer), 파일(Blob), 주소(문자열·URL), fetch 응답을 받는다.
  // query 를 주면 이 문서에는 options.query 대신 그 쪽 모양·배율·쪽을 맞춘다.
  // 열었으면 true 다. 열지 못하면 false 이고 openfailed 를 알린다.
  async function open(source, name = "", query = options.query) {
    const openedAt = Date.now();
    let label = name;
    if (!label && (typeof source === "string" || source instanceof URL)) {
      try {
        label = decodeURIComponent(new URL(source, location.href).pathname.split("/").pop() || "");
      } catch {}
    }
    if (!label && typeof Blob !== "undefined" && source instanceof Blob) label = source.name || "";
    opening.begin(label || "문서", openedAt);
    setStatus("여는 중...");
    try {
      let bytes;
      let response = source instanceof Response ? source : null;
      if (typeof source === "string" || source instanceof URL) response = await fetch(source);
      if (response) {
        if (!response.ok) throw new Error(`열기 실패 (${response.status})`);
        label = nameFromDisposition(response.headers.get("Content-Disposition")) || label;
        bytes = new Uint8Array(await response.arrayBuffer());
      } else if (typeof Blob !== "undefined" && source instanceof Blob) {
        bytes = new Uint8Array(await source.arrayBuffer());
      } else if (source instanceof ArrayBuffer) {
        bytes = new Uint8Array(source);
      } else if (ArrayBuffer.isView(source)) {
        bytes = new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
      } else {
        throw new Error("열 수 없는 문서입니다.");
      }
      opening.mark("파일 읽기", openedAt);
      return await openBytes(bytes, label || "문서", query);
    } catch (error) {
      logError("open", error);
      setStatus(`열기 실패: ${error?.message || error}`);
      opening.end(error);
      return false;
    }
  }

  function newDocument() {
    opening.begin("새 문서", Date.now());
    setStatus("새 문서...");
    return openBytes(null, "").catch(() => false);
  }

  // 저장한 바이트와 이름({ bytes, name, docState })을 준다. 형식과 이름은 코어가 정한다(이름 끝, 없으면 연 파일의 형식).
  // 내려받기는 셸(플랫폼) 일이다.
  let saving = null;
  function save() {
    if (saving) return saving;
    if (!openedName) return Promise.reject(new Error("열린 문서가 없습니다."));
    setStatus("저장 중...");
    // 앞서 친 글·조합이 먼저 문서에 들어가게 편집 차례 뒤에 저장한다.
    saving = editor.afterEdits(() => session.saveDocument(openedName)).then((saved) => {
      const bytes = saved?.bytes;
      if (!(bytes instanceof Uint8Array) || bytes.length === 0) throw new Error("저장에 실패했습니다.");
      setStatus(`${saved.name} · ${pageCount}페이지`);
      emitDocState(saved.docState);
      return saved;
    }).catch((error) => {
      logError("save", error);
      setStatus(`저장 실패: ${error?.message || error}`);
      throw error;
    }).finally(() => {
      saving = null;
    });
    return saving;
  }

  // 보기 전용·편집 전환. 보기 전용이면 코어를 읽기 전용으로 켜고, 글자 입력칸에 초점을 주지 않는다.
  function setReadOnly(on) {
    readOnly = !!on;
    // 보기 전용이면 눈금자를 숨기는 일은 코어가 한다. 켠 값은 저장해 둔 값을 넘긴다.
    const saved = savedRulers();
    if (saved !== null) void sendInput({ type: "rulers", on: saved });
    void sendInput({ type: "readOnly", on: readOnly });
    if (readOnly) editor.blurInput();
  }

  // 다른 페이지에 넣은 보기의 명령(zoom, page, view, edit). 뜻과 범위는 코어가 정한다.
  function embed(command, value, cols = 0, rows = 0) {
    return sendInput({
      type: "embed",
      mode: String(command || ""),
      choice: String(value ?? ""),
      cols: Number(cols) | 0,
      rows: Number(rows) | 0,
    });
  }

  function destroy() {
    for (const cleanup of cleanups.splice(0)) cleanup();
    resizeObserver.disconnect();
    cancelScrollInput();
    if (pointerFlush) cancelAnimationFrame(pointerFlush);
    if (gestureFlush) cancelAnimationFrame(gestureFlush);
    editor.destroy();
    session.close();
    root.remove();
    if (activeViewer === viewer) activeViewer = null;
  }

  // GPU 화면은 글꼴·문서와 상관없다. 코어가 뜨면 바로 만들어 첫 문서가 기다리지 않게 한다.
  // 캔버스는 문서를 열 때 ensureViewport 가 화면에 붙인다.
  attachViewSurface(makeViewCanvas());
  setReadOnly(readOnly);
  syncPins();
  syncZoomInput();
  renderPreview();

  Object.defineProperty(viewer, "readOnly", { get: () => readOnly });
  return Object.assign(viewer, {
    info,
    root,
    open,
    newDocument,
    save,
    setReadOnly,
    // 넣은 보기 명령. zoom("150" | "width" | "in"), page(3 | "next"), view("two" | "grid", cols, rows), showEditButton(true)
    embed,
    zoom: (value) => embed("zoom", value),
    page: (value) => embed("page", value),
    view: (mode, cols = 0, rows = 0) => embed("view", mode, cols, rows),
    showEditButton: (on) => embed("edit", on ? "1" : "0"),
    // 앱 화면(메뉴·배율 대화 상자·상태 줄)이 쓰는 명령
    setZoom: applyZoomPercent,
    fit: fitZoom,
    pageGrid: applyPageGrid,
    stepPage: stepPageView,
    stepZoom: (dir) => sendInput({ type: "zoomStep", dir: Math.sign(Number(dir) || 0) }),
    revealPage: (index) => sendInput({ type: "revealPage", page: index | 0 }),
    toggleRulers: () => sendInput({ type: "rulersToggle" }),
    viewGuides,
    applyViewGuides,
    zoomDialog(detail) {
      if (!sceneReady()) return Promise.resolve(null);
      ensureViewport();
      return sendInput({
        type: "zoomDialog",
        mode: String(detail?.shape || "auto"),
        cols: Number(detail?.cols) | 0,
        rows: Number(detail?.rows) | 0,
        choice: String(detail?.zoom || ""),
        percent: Number(detail?.percent) | 0,
      });
    },
    input: sendInput,
    selectionAction,
    focus: () => editor.focusInput(),
    cacheUsage: () => session.cacheUsage(),
    // 편집
    applyStyle: editor.applyStyle,
    applyFormatDialog: editor.applyFormatDialog,
    formatView: editor.formatView,
    formatPreview: editor.formatPreview,
    formatFields: editor.formatFields,
    pageSetupFields: editor.pageSetupFields,
    applyPageSetup: editor.applyPageSetup,
    drawShape: editor.drawShape,
    insertPicture: editor.insertPicture,
    insertTable: editor.insertTable,
    tableEdit: editor.tableEdit,
    insertBreak: editor.insertBreak,
    pageControl: editor.pageControl,
    insertNote: editor.insertNote,
    columns: editor.columns,
    sectionSettings: editor.sectionSettings,
    tableProperties: editor.tableProperties,
    bookmark: editor.bookmark,
    caption: editor.caption,
    goToPage: editor.goToPage,
    goToSection: editor.goToSection,
    goTo: editor.goTo,
    goToView: editor.goToView,
    exchangeNotes: editor.exchangeNotes,
    copyShape: editor.copyShape,
    tableText: editor.tableText,
    deleteMarks: editor.deleteMarks,
    // 메뉴·리본이 단축키와 같은 코어 명령을 부른다. 코어가 열 대화 상자를 주면 연다.
    shortcut: (command) => editor.shortcut(command).then((result) => {
      if (result?.dialog) emit("formatdialog", { name: result.dialog });
      if (result && !result.documentChanged && result.error) emit("notice", { text: result.error });
      return result;
    }),
    bookmarkView: editor.bookmarkView,
    tablePropertiesView: editor.tablePropertiesView,
    glyphGroup: editor.glyphGroup,
    glyphGroupView: editor.glyphGroupView,
    sortParagraphs: editor.sortParagraphs,
    sortView: editor.sortView,
    tableFormulaView: editor.tableFormulaView,
    convertText: editor.convertText,
    noteShape: editor.noteShape,
    noteShapeView: editor.noteShapeView,
    sectionSettingsView: editor.sectionSettingsView,
    columnView: editor.columnView,
    insertHyperlink: editor.insertHyperlink,
    insertSymbol: editor.insertSymbol,
    pageControlFields: editor.pageControlFields,
    findReplace: editor.findReplace,
    selectedText: () => selectedText,
    applyFontSwap: editor.applyFontSwap,
    cancelFontSwap: editor.cancelFontSwap,
    rememberColor: editor.rememberColor,
    toggleOverwrite: editor.toggleOverwrite,
    leaveBand: editor.leaveBand,
    leaveNote: editor.leaveNote,
    destroy,
  });
}
