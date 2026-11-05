import { createCoreSession } from "./core-session.js";
import { createScreen2D } from "./screen-2d.js";
import { startRemoteLog } from "./remote-log.js";
import { startEmbed } from "./embed.js";

// 보기·편집 전환. 보기 전용이면 코어를 읽기 전용으로 켜고, 글자 입력칸에 초점을 주지 않는다.
// 라우트(자식)의 effect 가 셸(부모)의 startPreview 보다 먼저 돌므로, 시작 전이면 값만 기억해 둔다.
let readOnly = false;
let applyReadOnly = null;

export function setReadOnly(on) {
  readOnly = !!on;
  applyReadOnly?.(readOnly);
}

export async function startPreview() {
    if (startPreview.started) return;
    startPreview.started = true;

    function logError(stage, error) {
      const detail = error?.stack || error?.message || String(error);
      console.log(`[Error: ${stage}]\nMessage: ${detail}`);
    }

    window.addEventListener("error", (errorEvent) => {
      console.log(`[Error]\nMessage: ${errorEvent.message}\nFile: ${errorEvent.filename}\nLine: ${errorEvent.lineno}`);
    });
    window.addEventListener("unhandledrejection", (event) => {
      logError("unhandledrejection", event.reason);
    });

    let shellCameraHook = () => {};
    const session = createCoreSession(
      (line) => appendCoreLine(line),
      (camera) => {
        shellCameraHook(camera);
      },
      undefined,
      (frame) => showRemoteFrame(frame),
    );
    // ?rlog=1 이면 폰 같은 원격 기기의 로그와 프레임 통계를 개발 서버로 보낸다.
    const remoteLog = startRemoteLog(session);
    // iframe 으로 넣은 보기면 넣은 페이지와 배율·쪽·쪽 모양을 주고받는다.
    const embed = startEmbed((event) => sendInput(event));
    const status = document.getElementById("status");
    status.textContent = "코어 준비 중...";
    // 파일은 문서를 여는 동안만 쌓인다. 렌더링과 요소는 쪽마다 따로 둔다.
    // 요소는 코어가 개체·줄마다 한 번만 내보내므로 그 쪽에 남겨 둔다. 렌더링은 쪽에 들어올 때마다 비운다.
    const fileRows = [];
    const eventRows = [];
    const pageRows = new Map();
    let logTab = "file";
    const logTabIds = {
      file: "logTabFile",
      render: "logTabRender",
      element: "logTabElement",
      event: "logTabEvent",
    };
    const logTabNames = ["file", "render", "element", "event"];
    const lineMarks = new Map();
    let pickedMark = "";
    // ?debug=1 이 없으면 오른쪽 로그와 줄·객체 박스를 두지 않는다.
    const debug = new URLSearchParams(location.search).get("debug") === "1";
    function paintedMarks(marks) {
      if (!debug || !marks?.length) return [];
      return marks;
    }
    function currentPage() {
      const index = pageSelect?.selectedIndex ?? -1;
      return index >= 0 ? index + 1 : 1;
    }
    function pageBucket(page) {
      let bucket = pageRows.get(page);
      if (!bucket) {
        bucket = { render: [], element: [] };
        pageRows.set(page, bucket);
      }
      return bucket;
    }
    function rowsFor(tab, page = currentPage()) {
      if (tab === "file") return fileRows;
      if (tab === "event") return eventRows;
      return pageBucket(page)[tab];
    }
    function documentLog(tab) {
      return tab === "file" || tab === "event";
    }
    function updateTabLabels() {
      const rows = rowsFor("element");
      const warns = rows.filter((item) => item.kind === "warn").length;
      const element = document.getElementById("logTabElement");
      if (element) {
        element.textContent = rows.length === 0 ? "요소" : warns > 0 ? `요소 ${rows.length} · 차이 ${warns}` : `요소 ${rows.length}`;
      }
      for (const name of logTabNames) {
        const button = document.getElementById(logTabIds[name]);
        button?.classList.toggle("on", logTab === name);
        if (button) button.setAttribute("aria-selected", logTab === name ? "true" : "false");
      }
    }
    function makeLogRow(item) {
      const row = document.createElement("pre");
      row.className = item.kind === "warn" ? "log-row warn" : item.kind === "object" ? "log-row object" : "log-row";
      if (item.mark && item.mark === pickedMark) row.classList.add("picked");
      if (item.mark) row.dataset.mark = item.mark;
      row.textContent = typeof item.value === "string" ? item.value : JSON.stringify(item.value, null, 2);
      return row;
    }
    function paintLogBody(mode) {
      const body = document.getElementById("logBody");
      if (!body) return;
      body.replaceChildren();
      let picked = null;
      for (const item of rowsFor(logTab)) {
        const row = makeLogRow(item);
        body.append(row);
        if (!picked && item.mark && item.mark === pickedMark) picked = row;
      }
      if (mode === "pick" && picked) scrollLogTo(picked);
      else body.scrollTop = body.scrollHeight;
    }
    function showTab(tab, mode) {
      logTab = tab;
      updateTabLabels();
      paintLogBody(mode || "end");
    }
    function clearLog() {
      fileRows.length = 0;
      eventRows.length = 0;
      pageRows.clear();
      pickedMark = "";
      lineMarks.clear();
      showTab("file", "end");
    }
    function pushRow(tab, page, value, kind = "info") {
      const item = { value, kind, mark: "" };
      rowsFor(tab, page).push(item);
      updateTabLabels();
      if (logTab !== tab || (!documentLog(tab) && page !== currentPage())) return { item, row: null };
      const body = document.getElementById("logBody");
      const row = makeLogRow(item);
      body?.append(row);
      if (body) body.scrollTop = body.scrollHeight;
      return { item, row };
    }
    function appendLog(value, kind = "info") {
      return pushRow("file", currentPage(), value, kind).row;
    }
    function scrollLogTo(row) {
      const body = document.getElementById("logBody");
      if (!body || !row) return;
      const bodyRect = body.getBoundingClientRect();
      const rowRect = row.getBoundingClientRect();
      const next = body.scrollTop + (rowRect.top - bodyRect.top) - (body.clientHeight - rowRect.height) / 2;
      body.scrollTop = Math.max(0, next);
    }
    function pickMark(id) {
      pickedMark = id;
      if (id) showTab("element", "pick");
      else if (logTab === "element") paintLogBody();
      if (lastPaint) paintView(lastPaint);
    }
    function logPageOf(value) {
      if (value && typeof value === "object" && typeof value.쪽 === "number" && value.쪽 > 0) return value.쪽;
      return currentPage();
    }
    function appendCoreLine(line) {
      let value = line;
      let kind = "info";
      let tab = "render";
      if (typeof line === "string" && line.startsWith("{")) {
        try {
          value = JSON.parse(line);
          if (value && typeof value === "object" && (value.경고 || value.요소)) {
            const diffs = Array.isArray(value.다른필드) && value.다른필드.length > 0;
            kind = value.경고 || diffs ? "warn" : "object";
            tab = "element";
          }
        } catch {
          value = line;
        }
      }
      const page = logPageOf(value);
      const { item, row } = pushRow(tab, page, value, kind);
      if (value && typeof value === "object" && Array.isArray(value.영역) && value.영역.length >= 4) {
        const markPage = value.쪽 | 0;
        if (markPage <= 0) return;
        const mark = {
          x: value.영역[0] | 0,
          y: value.영역[1] | 0,
          w: value.영역[2] | 0,
          h: value.영역[3] | 0,
        };
        if (mark.w <= 0 || mark.h <= 0) return;
        const list = lineMarks.get(markPage) || [];
        const key = `${value.요소 || ""}:${mark.x}:${mark.y}:${mark.w}:${mark.h}`;
        item.mark = `${markPage}:${key}`;
        if (row) row.dataset.mark = item.mark;
        if (!list.some((entry) => entry.key === key)) {
          list.push({ ...mark, key, warn: kind === "warn", line: value.요소 === "줄" });
          lineMarks.set(markPage, list);
        }
        if (lastPaint && pageSelect.selectedIndex + 1 === markPage) paintView(lastPaint);
      }
    }
    function appendEvent(text) {
      if (!debug || !text) return;
      pushRow("event", currentPage(), text);
    }
    for (const name of logTabNames) {
      const button = document.getElementById(logTabIds[name]);
      button?.addEventListener("click", () => showTab(name));
    }
    const coreReady = session.boot().then(async (result) => {
      appendLog(`[ClassingHWP] 코어 ${Number(result?.coreMs || 0).toFixed(1)}ms`);
      if (status.textContent === "코어 준비 중...") status.textContent = "문서를 열 수 있습니다.";
      // ?cacheBudget=pageGpu:8000000 처럼 캐시 예산(바이트)을 바꾼다. 메모리가 작은 기기의 사정을 데스크톱에서 재현할 때 쓴다.
      for (const pair of (new URLSearchParams(location.search).get("cacheBudget") || "").split(",")) {
        const [name, bytes] = pair.split(":");
        if (name && Number(bytes) > 0) await session.setCacheBudget(name, Number(bytes));
      }
      // ?debug=1 이면 캐시 사용량을 콘솔에서 볼 수 있게 한다: await __chwpCacheUsage()
      if (debug) window.__chwpCacheUsage = () => session.cacheUsage();
      remoteLog?.begin();
      // 글꼴 고르기 목록은 코어가 정한다. 라이선스로 막힌 글꼴은 빠져 있다.
      void session.pickableFonts().then((list) => {
        window.__chwpFontList = Array.isArray(list) ? list : [];
        window.dispatchEvent(new CustomEvent("chwp-font-list", { detail: window.__chwpFontList }));
      }, (error) => logError("pickableFonts", error));
      return result;
    }).catch((error) => {
      logError("boot", error);
      status.textContent = `코어 실패: ${error?.message || error}`;
      throw error;
    });
    const preview = document.getElementById("preview");
    const pageSelect = document.getElementById("page");
    const pageInfo = document.getElementById("pageInfo");
    const prev = document.getElementById("prev");
    const next = document.getElementById("next");
    let pages = [];
    let openedName = "";
    let saving = false;

    function sheetSlot() {
      return document.getElementById("sheetSlot");
    }

    function applyCompare() {
      const slot = sheetSlot();
      const opacity = Number(document.getElementById("opacity")?.value ?? 100);
      if (slot) slot.style.opacity = String(opacity / 100);
    }

    let scenePages = [];

    // 화면 배율. 100%는 한글과 같이 96dpi로 본 용지이고, 주소와 상관없이 이 값을 쓴다.
    let screenPercent = (() => {
      const n = Number(new URLSearchParams(location.search).get("hangul"));
      return Number.isFinite(n) && n > 0 ? Math.round(n) : 100;
    })();
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
    let zoomFit = "";

    let lastNotifiedPage = -1;
    let lastNotifiedPageCount = -1;
    let lastNotifiedPercent = -1;
    let lastNotifiedFitPage = false;
    let lastNotifiedFitWidth = false;
    let lastNotifiedGrid = "";
    // 코어가 정한 쪽 모양(입력 답). GPU 화면이면 lastPaint 가 없어서 따로 둔다.
    let viewGrid = { mode: "auto", cols: 1, rows: 1, effectiveCols: 1 };

    // 화면 가운데 쪽은 코어가 정한다(보기 계획·카메라의 page). 셸은 받은 값을 쓴다.
    function resolveCurrentPageIndex(scrollY = shownScrollY, hintPage = -1) {
      void scrollY;
      if (Number.isInteger(hintPage) && hintPage >= 0) return hintPage;
      if (pageNow >= 0) return pageNow;
      return Math.max(0, pageSelect?.selectedIndex | 0);
    }

    function syncViewportInfo(hintPage = -1, forceNotify = false) {
      const count = Math.max(scenePages.length, pages.length, pageSelect?.options?.length || 0);
      const index = resolveCurrentPageIndex(shownScrollY, hintPage);
      if (lastPaint && Number.isInteger(index) && index >= 0) {
        lastPaint.page = index;
      }
      if (pageSelect && index >= 0 && index < pageSelect.options.length && pageSelect.selectedIndex !== index) {
        pageSelect.selectedIndex = index;
        showHangul();
      }
      const activeIndex = pageSelect && pageSelect.selectedIndex >= 0 ? pageSelect.selectedIndex : index;
      if (activeIndex >= 0 && count > 0) {
        if (pageInfo) pageInfo.textContent = `${activeIndex + 1} / ${count}쪽`;
        if (prev) prev.disabled = activeIndex <= 0;
        if (next) next.disabled = activeIndex >= count - 1;
      }
      const percent = currentZoomPercent();
      const page = activeIndex >= 0 ? activeIndex + 1 : 1;
      const grid = `${viewGrid.mode}:${viewGrid.cols}x${viewGrid.rows}`;
      if (
        forceNotify ||
        page !== lastNotifiedPage ||
        count !== lastNotifiedPageCount ||
        percent !== lastNotifiedPercent ||
        fitPageMode !== lastNotifiedFitPage ||
        fitWidthMode !== lastNotifiedFitWidth ||
        grid !== lastNotifiedGrid
      ) {
        lastNotifiedGrid = grid;
        lastNotifiedPage = page;
        lastNotifiedPageCount = count;
        lastNotifiedPercent = percent;
        lastNotifiedFitPage = fitPageMode;
        lastNotifiedFitWidth = fitWidthMode;
        zoomFit = fitPageMode ? "page" : (fitWidthMode ? "width" : "");
        const detail = {
          page,
          pageIndex: Math.max(0, activeIndex),
          pageCount: count,
          percent,
          fit: zoomFit,
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
        window.dispatchEvent(new CustomEvent("chwp-page-changed", { detail }));
        window.dispatchEvent(new CustomEvent("chwp-viewport-changed", { detail }));
      }
    }

    function currentZoomPercent() {
      return screenPercent;
    }

    function syncZoomInput(hintPage = -1) {
      const percent = currentZoomPercent();
      zoomFit = fitPageMode ? "page" : (fitWidthMode ? "width" : "");
      const zoomMode = zoomModeNow;
      const zoomLabel = zoomLabelNow;
      // 입력칸은 맞춤이면 그 이름, 아니면 % 없는 숫자를 보인다.
      const shown = zoomMode === "percent" ? String(percent) : zoomLabel;
      const info = document.getElementById("zoomInfo");
      const slider = document.getElementById("zoomSlider");
      if (info && document.activeElement !== info) info.value = shown;
      if (slider && document.activeElement !== slider) slider.value = String(percent);
      const count = Math.max(scenePages.length, pages.length, pageSelect?.options?.length || 0);
      const pageIndex = Math.max(0, resolveCurrentPageIndex(shownScrollY, hintPage));
      const page = pageIndex + 1;
      window.dispatchEvent(new CustomEvent("chwp-zoom-changed", {
        detail: {
          percent,
          fit: zoomFit,
          fitPage: fitPageMode,
          fitWidth: fitWidthMode,
          zoomMode,
          zoomLabel,
          page,
          pageIndex,
          pageCount: count,
          gridMode: viewGrid.mode,
          gridCols: viewGrid.cols,
          gridRows: viewGrid.rows,
          effectiveCols: viewGrid.effectiveCols,
          rowStepY: lastPaint?.rowStepY || 0,
          pageStepY: lastPaint?.pageStepY || 0,
        },
      }));
      syncViewportInfo(pageIndex, false);
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

    let viewCanvasNode = null;
    let screenAttached = null;
    let screenLive = false;
    let applyingScroll = false;
    let pinchLive = false;
    let gestureActive = false;
    let scrollOwned = false;
    let scrollSerial = 0;
    let shownScrollX = 0;
    let shownScrollY = 0;
    let caretBlink = 0;
    let lastPaint = null;
    let selectedText = "";
    let selectionMarks = [];
    let caretImage = null;


    function syncZoomChrome() {
      syncZoomInput();
      document.documentElement.classList.add("zoomed");
    }

    function viewportPatch() {
      const scroller = document.getElementById("viewScroller");
      const cssW = scroller ? scroller.clientWidth : preview.clientWidth;
      const cssH = scroller ? scroller.clientHeight : preview.clientHeight;
      return {
        cssW: Math.max(1, cssW),
        cssH: Math.max(1, cssH),
        dpr: window.devicePixelRatio || 1,
      };
    }

    function viewportInput() {
      const patch = viewportPatch();
      return { type: "viewport", cssW: patch.cssW, cssH: patch.cssH, dpr: patch.dpr };
    }

    function postViewport() {
      void sendInput(viewportInput());
    }

    function sceneReady() {
      return scenePages.some((node) => node?.width && node?.height);
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

    function sheetAt(plan, dx, dy) {
      for (const sheet of sheetRects(plan)) {
        if (sheet.w <= 0 || sheet.h <= 0) continue;
        if (dx >= sheet.x && dy >= sheet.y && dx <= sheet.x + sheet.w && dy <= sheet.y + sheet.h) return sheet;
      }
      return null;
    }

    function viewPoint(clientX, clientY) {
      const canvas = document.getElementById("viewCanvas");
      const plan = lastPaint;
      if (!(canvas instanceof HTMLCanvasElement) || !plan) return null;
      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return null;
      const bufferW = plan.viewW || canvas.width || rect.width;
      const bufferH = plan.viewH || canvas.height || rect.height;
      return {
        plan,
        dx: (clientX - rect.left) * (bufferW / rect.width),
        dy: (clientY - rect.top) * (bufferH / rect.height),
      };
    }

    // 원격 화면: 캔버스를 워커로 넘길 수 없을 때. 코어가 정한 2D 그림 목록을 캔버스 2D 로 옮긴다.
    const drawScreen2D = createScreen2D();
    function showRemoteFrame(frame) {
      const canvas = document.getElementById("viewCanvas") || viewCanvasNode;
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
        replacement.id = canvas.id;
        replacement.className = canvas.className;
        if (canvas.parentNode) canvas.replaceWith(replacement);
        if (viewCanvasNode === canvas) viewCanvasNode = replacement;
      };
      screenAttached = coreReady.then(async () => {
        const nogpu = new URLSearchParams(window.location.search).get("nogpu") === "1";
        const ok = await session.surface(offscreen, nogpu);
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
        viewCanvasNode.id = "viewCanvas";
        viewCanvasNode.className = "view-canvas";
      }
      return viewCanvasNode;
    }

    // GPU 화면은 글꼴·문서와 상관없다. 코어가 뜨면 바로 만들어 첫 문서가 기다리지 않게 한다.
    // 캔버스는 문서를 열 때 ensureViewport 가 화면에 붙인다.
    function prepareViewSurface() {
      if (document.getElementById("viewCanvas")) return;
      attachViewSurface(makeViewCanvas());
    }

    function ensureViewport() {
      document.documentElement.classList.add("view-mode");
      syncZoomChrome();
      const stack = document.getElementById("pageStack");
      if (stack) {
        stack.style.width = "";
        stack.style.height = "";
        stack.style.maxWidth = "";
        stack.style.maxHeight = "";
      }
      let canvas = document.getElementById("viewCanvas");
      if (!(canvas instanceof HTMLCanvasElement)) {
        canvas = makeViewCanvas();
        const slot = sheetSlot();
        if (slot) slot.replaceChildren(canvas);
        else preview.append(canvas);
      }
      attachViewSurface(canvas);
      ensureCaret();
      let scroller = document.getElementById("viewScroller");
      if (!(scroller instanceof HTMLElement)) {
        scroller = document.createElement("div");
        scroller.id = "viewScroller";
        scroller.className = "view-scroller";
        const spacer = document.createElement("div");
        spacer.id = "viewSpacer";
        spacer.className = "view-spacer";
        scroller.append(spacer);
        preview.append(scroller);
        scroller.addEventListener("scroll", onViewScroll, { passive: true });
        scroller.addEventListener("pointermove", (event) => {
          if (event.buttons || event.pointerType === "touch" || event.pointerType === "pen") return;
          if (markAt(event.clientX, event.clientY)) {
            hoverWanted = null;
            scroller.style.cursor = "pointer";
            return;
          }
          const hover = viewPoint(event.clientX, event.clientY);
          if (!hover) return;
          hoverWanted = { x: hover.dx, y: hover.dy };
          void askHoverCursor();
        });
      }
      return scroller;
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
          const scroller = document.getElementById("viewScroller");
          if (scroller && !hoverWanted && presses.size === 0) scroller.style.cursor = cursor || "";
        }
      } catch (error) {
        logError("hover", error);
      } finally {
        hoverAsking = false;
      }
    }

    function clearViewport() {
      document.documentElement.classList.remove("view-mode");
      document.getElementById("viewScroller")?.remove();
      document.getElementById("viewCanvas")?.remove();
      document.getElementById("viewDebug")?.remove();
      document.getElementById("viewCaret")?.remove();
      if (caretBlink) {
        clearInterval(caretBlink);
        caretBlink = 0;
      }
      selectionMarks = [];
      caretImage = null;
      lastPaint = null;
      const frame = document.querySelector(".pdf-frame");
      if (frame instanceof HTMLElement) {
        frame.style.left = "";
        frame.style.top = "";
        frame.style.width = "";
        frame.style.height = "";
        frame.style.right = "";
        frame.style.bottom = "";
      }
    }

    function markOnSheet(sheet, dx, dy) {
      const page = scenePages[sheet.index];
      const marks = paintedMarks(lineMarks.get(sheet.index + 1));
      if (!page?.width || !page?.height || !sheet.w || !sheet.h || !marks.length) return null;
      const sx = sheet.w / page.width;
      const sy = sheet.h / page.height;
      const px = (dx - sheet.x) / sx;
      const py = (dy - sheet.y) / sy;
      let hit = null;
      let area = Infinity;
      for (const mark of marks) {
        if (px < mark.x || py < mark.y || px > mark.x + mark.w || py > mark.y + mark.h) continue;
        const box = mark.w * mark.h;
        if (box < area) {
          area = box;
          hit = mark;
        }
      }
      return hit;
    }

    function markAt(clientX, clientY) {
      const point = viewPoint(clientX, clientY);
      if (!point) return null;
      const sheet = sheetAt(point.plan, point.dx, point.dy);
      if (!sheet) return null;
      return markOnSheet(sheet, point.dx, point.dy);
    }

    function pickMarkAt(clientX, clientY) {
      const point = viewPoint(clientX, clientY);
      if (!point) return;
      const sheet = sheetAt(point.plan, point.dx, point.dy);
      if (!sheet) return;
      const hit = markOnSheet(sheet, point.dx, point.dy);
      pickMark(hit ? `${sheet.index + 1}:${hit.key}` : "");
    }

    function paintView(plan, alreadyPresented = false, restartCaret = false) {
      const canvas = document.getElementById("viewCanvas");
      if (!(canvas instanceof HTMLCanvasElement) || !plan?.viewW || !plan?.viewH) return;
      const dpr = plan.dpr || 1;
      canvas.style.width = `${plan.viewW / dpr}px`;
      canvas.style.height = `${plan.viewH / dpr}px`;
      // 화면은 코어가 그린다. 셸 겹그림(디버그 상자·캐럿 그림)은 지운다.
      canvas.style.transform = "";
      const debug = document.getElementById("viewDebug");
      if (debug instanceof HTMLCanvasElement) {
        debug.getContext("2d")?.clearRect(0, 0, debug.width, debug.height);
        debug.style.transform = "";
      }
      const caret = document.getElementById("viewCaret");
      if (caret) caret.hidden = true;
    }

    function ensureCaret() {
      const slot = sheetSlot();
      if (!slot) return;
      const found = document.getElementById("viewCaret");
      if (found instanceof HTMLCanvasElement) return;
      found?.remove();
      const el = document.createElement("canvas");
      el.id = "viewCaret";
      el.className = "view-caret";
      el.hidden = true;
      slot.append(el);
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

    function copySelectedText(text) {
      const write = navigator.clipboard?.writeText;
      if (write) {
        void write.call(navigator.clipboard, text).catch(() => {
          const field = document.createElement("textarea");
          field.value = text;
          field.setAttribute("readonly", "");
          field.style.position = "fixed";
          field.style.left = "-9999px";
          document.body.append(field);
          field.select();
          document.execCommand("copy");
          field.remove();
        });
        return;
      }
      const field = document.createElement("textarea");
      field.value = text;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.left = "-9999px";
      document.body.append(field);
      field.select();
      document.execCommand("copy");
      field.remove();
    }

    let editorInput = null;
    // 입력칸이 입력기 조합 중인지. 규칙 표(composing)대로 바꾼다.
    let fieldComposing = false;
    // 입력칸 규칙 표는 코어가 준다(fieldRules). 사건 그 자리에서 기본 동작을 막고 입력칸을 비워야 해서 미리 받아 둔다.
    // 코어는 일꾼에 있어 답을 기다리면 그사이 다음 조합이 시작될 수 있다.
    let fieldTable = [];
    // 코어가 부탁한 깨우기 타이머. 자리(wakeSlot)마다 하나다.
    const fieldTimers = new Map();
    let pendingFieldUpdate = null;
    function fieldActions(event) {
      const ime = !!event.isComposing || fieldComposing || !!event.imeKey;
      const out = {
        send: false, preventDefault: false, clearField: false, blur: false, composing: -1, turnEnd: false, toField: false,
      };
      const differs = (want, value) => want >= 0 && (want === 1) !== !!value;
      for (const rule of fieldTable) {
        if (rule.on !== event.kind) continue;
        if (rule.inputTypes && !rule.inputTypes.includes(event.inputType)) continue;
        if (rule.key && rule.key !== event.data) continue;
        if (differs(rule.ime, ime) || differs(rule.repeat, event.repeat)) continue;
        if (differs(rule.endComposition, event.endComposition) || differs(rule.hasText, event.hasText)) continue;
        out.send = out.send || !!rule.send;
        out.preventDefault = out.preventDefault || !!rule.preventDefault;
        out.clearField = out.clearField || !!rule.clearField;
        out.blur = out.blur || !!rule.blur;
        out.turnEnd = out.turnEnd || !!rule.turnEnd;
        out.toField = out.toField || !!rule.toField;
        if (rule.composing >= 0) out.composing = rule.composing;
      }
      return out;
    }
    // 입력칸 사건 하나. 표대로 그 자리에서 할 일을 하고 코어에 넘긴다. 무엇을 넣고 지울지는 코어(editField)가 정한다.
    // 키 사건은 표가 send 라고 한 것만 넘긴다.
    function fieldEvent(event, domEvent = null) {
      const el = editorInput;
      const act = fieldActions(event);
      if (act.preventDefault) domEvent?.preventDefault();
      if (act.clearField && el) el.value = "";
      if (act.composing >= 0) fieldComposing = act.composing === 1;
      if (event.kind !== "keydown" || act.send) sendField(event);
      if (act.turnEnd) queueMicrotask(() => sendField({ kind: "turnend" }));
      // 입력칸을 놓으면 입력기가 조합 끝을 바로 보낼 수 있다. 놓은 사건을 먼저 넘긴 뒤 놓는다.
      if (act.blur && el) el.blur();
    }
    // 키 사건을 입력칸 사건 모양으로 바꾼다.
    function fieldKeyEvent(event) {
      return {
        kind: "keydown",
        data: event.key || "",
        isComposing: !!event.isComposing,
        imeKey: event.keyCode === 229,
        repeat: !!event.repeat,
        shift: !!event.shiftKey,
        hasText: !!editorInput?.value,
      };
    }
    // 셸이 입력칸을 놓는다(다른 곳 누름, 편집 키, 대화 상자). endComposition 이면 조합 중이던 글도 버린다.
    function resetEditorField(endComposition = false) {
      if (editorInput) fieldEvent({ kind: "reset", endComposition });
    }
    function sendField(event) {
      // 아직 보내지 못한 조합 글은 마지막 것만 보낸다(통로 줄이기).
      if (event.kind === "compositionupdate" && pendingFieldUpdate && !pendingFieldUpdate.started) {
        pendingFieldUpdate.event = event;
        return;
      }
      const slot = { event, started: false };
      pendingFieldUpdate = event.kind === "compositionupdate" ? slot : null;
      void queueEdit(async () => {
        slot.started = true;
        if (pendingFieldUpdate === slot) pendingFieldUpdate = null;
        const result = await session.editField(slot.event);
        applyFieldReply(result?.field);
        return result?.edit ?? null;
      }, true);
    }
    // 코어가 정한 입력칸 일을 한다: 글자 넣기, 깨우기 타이머.
    function applyFieldReply(field) {
      const el = editorInput;
      if (!field || !el) return;
      if (field.insert) {
        const at = el.selectionEnd ?? el.value.length;
        el.setRangeText(field.insert, at, at, "end");
        fieldEvent({ kind: "input", inputType: "insertText", value: el.value });
      }
      if (field.wakeSlot) {
        clearTimeout(fieldTimers.get(field.wakeSlot));
        const wakeId = field.wakeId | 0;
        fieldTimers.set(field.wakeSlot, setTimeout(() => {
          fieldTimers.delete(field.wakeSlot);
          if (editorInput === el) sendField({ kind: "wake", wakeId });
        }, field.wakeAfterMs | 0));
      }
    }
    let editChain = Promise.resolve();
    // 단축키 표는 코어가 준다(keyBindings). 키를 누른 그 순간 기본 동작을 막아야 해서 미리 받아 둔다.
    let keyTable = [];
    function findKey(event) {
      const ctrl = !!(event.ctrlKey || event.metaKey);
      const alt = !!event.altKey;
      const shift = event.shiftKey ? 1 : 0;
      return keyTable.find((item) =>
        (item.key === event.code || item.key === event.key) && item.ctrl === ctrl && item.alt === alt &&
        (item.shift < 0 || item.shift === shift));
    }
    function editKeyOf(name) {
      return keyTable.find((item) => item.key === name && item.command === "editKey")?.editKey | 0;
    }

    // 화면 위 토스트(Toast.jsx). kind 는 info · saved · undo · error 다.
    function notify(text, kind = "info", action = null) {
      window.dispatchEvent(new CustomEvent("chwp-toast", { detail: { text, kind, action } }));
    }

    // 상태 줄의 저장 표시. clean 은 연 그대로, dirty 는 고친 뒤 저장 전, saved 는 저장한 뒤다. 상태는 코어가 정한다.
    function emitDocState(state) {
      if (!state) return;
      window.dispatchEvent(new CustomEvent("chwp-doc-state", { detail: { state, name: openedName } }));
    }

    // 쪽 수는 코어가 알린다(편집 결과의 쪽 목록, 카메라의 pageCount). 글꼴이 들어와 다시 놓거나 글이 쪽을 넘겨도 맞춘다.
    function showPageCount(count) {
      const next = count | 0;
      if (next <= 0 || next === pages.length) return;
      const prevIdx = Math.min(Math.max(0, pageSelect.selectedIndex), next - 1);
      pages = Array.from({ length: next }, () => "");
      pageSelect.replaceChildren();
      pages.forEach((_, pageIndex) => {
        const option = document.createElement("option");
        option.textContent = `${pageIndex + 1}쪽`;
        pageSelect.append(option);
      });
      pageSelect.selectedIndex = prevIdx;
      if (status && typeof status.textContent === "string") {
        status.textContent = status.textContent.replace(/·\s*\d+페이지/, `· ${next}페이지`);
      }
    }

    function applyEditResult(result) {
      if (!result) return;
      if (result.needsFontSwap) askFontSwap();
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

    // 편집이 아닌 코어 일(저장 등)을 앞서 넣은 편집 뒤에 한다. 입력칸은 그대로 둔다.
    function afterEdits(task) {
      const run = editChain.then(async () => {
        await coreReady;
        return task();
      });
      editChain = run.then(() => {}, () => {});
      return run;
    }
    // 코어 편집 하나를 차례에 넣는다. 입력칸에서 온 편집(fromField)이 아니면 먼저 입력칸을 놓는다.
    // 입력칸 밖 편집(편집 키, 되돌리기, 서식, 개체 넣기)은 캐럿이나 문서를 바꿔 입력칸에 남긴 글이 옛 글이 된다.
    function queueEdit(task, fromField = false) {
      if (!fromField) resetEditorField();
      const run = editChain.then(async () => {
        await coreReady;
        const result = await task();
        applyEditResult(result);
        return result;
      });
      editChain = run.then(() => {}, () => {});
      return run;
    }

    function ensureEditorInput() {
      if (editorInput instanceof HTMLInputElement && editorInput.isConnected) return editorInput;
      // 한 줄 입력칸이다. 아이패드 크롬은 여러 줄 입력칸(textarea)에 한글을 치면 키마다 메인 스레드를
      // 수백 ms 붙잡아 키가 줄을 선다(같은 기기에서 input 은 대기 중간값 10ms, textarea 는 1.5초). 줄 바꿈은 Enter 키로 온다.
      const el = document.createElement("input");
      el.type = "text";
      el.id = "viewEditorInput";
      el.setAttribute("autocapitalize", "off");
      el.setAttribute("autocomplete", "off");
      el.setAttribute("autocorrect", "off");
      el.setAttribute("spellcheck", "false");
      el.setAttribute("aria-hidden", "true");
      el.tabIndex = -1;
      el.style.cssText =
        "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1;padding:0;border:0;outline:none;";
      // 입력칸 사건은 모양만 바꿔 넘긴다. 그 자리에서 할 일은 규칙 표가, 무엇을 넣고 지울지는 코어가 정한다.
      el.addEventListener("compositionstart", () => fieldEvent({ kind: "compositionstart" }));
      // 붙여 넣기는 클립보드 글을 그대로 넘긴다. 한 줄 입력칸에 들어가면 줄바꿈이 지워진다.
      el.addEventListener("paste", (event) =>
        fieldEvent({ kind: "paste", data: event.clipboardData?.getData("text/plain") ?? "" }, event));
      el.addEventListener("compositionupdate", (event) => fieldEvent({ kind: "compositionupdate", data: event.data ?? "" }));
      el.addEventListener("compositionend", (event) => fieldEvent({ kind: "compositionend", data: event.data ?? "" }));
      el.addEventListener("input", (event) =>
        fieldEvent({ kind: "input", inputType: event.inputType || "", value: el.value, isComposing: !!event.isComposing }));
      el.addEventListener("keydown", (event) => {
        const keyEvent = fieldKeyEvent(event);
        const ime = keyEvent.isComposing || fieldComposing || keyEvent.imeKey;
        const toField = fieldActions(keyEvent).toField;
        fieldEvent(keyEvent, event);
        if (ime || toField || event.defaultPrevented) return;
        // 편집 키와 단축키는 코어 단축키 표(window keydown)가 맡는다. 입력칸에서만 쓰는 키는 여기서 보낸다.
        const binding = findKey(event);
        if (!binding?.editorOnly || binding.command !== "editKey") return;
        event.preventDefault();
        void queueEdit(() =>
          session.editKey(binding.editKey, !!event.shiftKey, !!(event.ctrlKey || event.metaKey), !!event.altKey));
      });
      document.body.append(el);
      editorInput = el;
      return el;
    }

    function focusEditorInput() {
      // 보기 전용에서는 입력칸을 쓰지 않는다. 터치에서 화면 자판이 뜨지 않게 한다.
      if (readOnly) return;
      const el = ensureEditorInput();
      const active = document.activeElement;
      if (
        active &&
        active !== el &&
        active !== document.body &&
        ((active.tagName === "INPUT" && active.getAttribute("type") !== "color") ||
          active.tagName === "TEXTAREA" ||
          active.isContentEditable)
      ) {
        return;
      }
      if (active !== el) {
        try {
          el.focus({ preventScroll: true });
        } catch {
          el.focus();
        }
      }
    }

    function emitCursorStyle(cursorStyle) {
      if (!cursorStyle || typeof cursorStyle !== "object") return;
      window.__chwpCursorStyle = cursorStyle;
      window.dispatchEvent(
        new CustomEvent("chwp-cursor-style-changed", {
          detail: cursorStyle,
        }),
      );
      if (cursorStyle.caret) window.dispatchEvent(new CustomEvent("chwp-caret-status", { detail: cursorStyle.caret }));
    }

    // 화면 이벤트 모양만 풀어서 이름·값을 그대로 넘긴다. 이름·단위·범위는 코어(setFormatField)가 정한다.
    function normalizeFormatPatch(raw, defaultKey = null) {
      if (raw == null) return null;
      if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
        return defaultKey ? { [defaultKey]: raw } : null;
      }
      if (typeof raw !== "object") return null;
      const src = raw.patch && typeof raw.patch === "object" ? raw.patch : raw;
      const out = {};
      for (const [key, value] of Object.entries(src)) {
        if (key === "patch") continue;
        if (typeof value === "boolean" || typeof value === "string" || (typeof value === "number" && Number.isFinite(value))) {
          out[key] = value;
        }
      }
      return Object.keys(out).length > 0 ? out : null;
    }

    function applyFormatPatch(raw, defaultKey = null) {
      const patch = normalizeFormatPatch(raw, defaultKey);
      if (!patch) return Promise.resolve(null);
      // 고른 글꼴은 편집한 뒤 코어가 받으라고 부르고, 받으면 문서를 다시 놓는다.
      return queueEdit(() => session.editStyle(patch));
    }

    window.__chwpApplyStyle = applyFormatPatch;
    // 막힌 글꼴마다 전에 고른 글꼴. 이 브라우저에 저장해 두고 코어에 넘긴다. 무엇을 기억할지는 코어가 정한다.
    const swapChoiceKey = "chwp.fontSwapChoices";
    void coreReady.then(() => {
      let saved = "{}";
      try {
        saved = window.localStorage.getItem(swapChoiceKey) || "{}";
      } catch {}
      return session.setFontSwapPreferences(saved);
    }).catch((error) => logError("setFontSwapPreferences", error));
    // 최근 색. 이 브라우저에 저장해 두고 코어에 넘긴다. 몇 개를 어떤 차례로 둘지, 처음 펜 색은 코어가 정한다.
    const recentColorKey = "chwp.recentColors";
    function publishColors(memory) {
      if (!memory) return;
      window.__chwpColors = memory;
      window.dispatchEvent(new CustomEvent("chwp-colors", { detail: memory }));
      try {
        window.localStorage.setItem(recentColorKey, memory.saved);
      } catch {
        // 저장하지 못해도 이번에 고른 색은 그대로 쓴다.
      }
    }
    void coreReady.then(() => {
      let saved = "";
      try {
        saved = window.localStorage.getItem(recentColorKey) || "";
      } catch {}
      return session.setRecentColors(saved);
    }).then(publishColors).catch((error) => logError("setRecentColors", error));
    window.addEventListener("chwp-remember-color", (event) => {
      void session.rememberColor(event.detail).then(publishColors).catch((error) => logError("rememberColor", error));
    });
    void coreReady.then(() => session.keyBindings()).then((list) => {
      if (Array.isArray(list)) keyTable = list;
      // 메뉴의 단축키 표시도 이 표에서 읽는다.
      void session.zoomDialogSpec().then((spec) => {
        window.__chwpZoomSpec = spec;
        window.dispatchEvent(new CustomEvent("chwp-zoom-spec", { detail: spec }));
      }).catch((error) => logError("zoomDialogSpec", error));
      window.__chwpKeyBindings = keyTable;
      window.dispatchEvent(new CustomEvent("chwp-key-bindings", { detail: keyTable }));
    }).catch((error) => logError("keyBindings", error));
    void coreReady.then(() => session.fieldRules()).then((list) => {
      if (Array.isArray(list)) fieldTable = list;
    }).catch((error) => logError("fieldRules", error));
    // 서식 대화 상자. 칸 이름과 칸에 친 값을 그대로 넘기고, 받은 값을 그대로 보인다.
    window.__chwpFormatView = async (kind, patch) => {
      await coreReady;
      return session.formatView(kind, patch || {});
    };
    window.__chwpFormatPreview = async (kind, patch, w, h) => {
      await coreReady;
      return session.formatPreview(kind, patch || {}, w, h);
    };
    window.__chwpApplyFormatDialog = (kind, patch, whole = false) => {
      if (!patch || typeof patch !== "object" || Object.keys(patch).length === 0) return Promise.resolve(null);
      return queueEdit(() => session.editFormatDialog(kind, patch, whole));
    };
    // 편집 용지 대화 상자·세로/가로·쪽 여백 메뉴. 값은 고친 것만 넘긴다.
    window.__chwpPageSetupFields = async () => {
      await coreReady;
      return session.pageSetupFields();
    };
    window.__chwpApplyPageSetup = (patch, whole = false) => {
      if (!patch || typeof patch !== "object" || Object.keys(patch).length === 0) return Promise.resolve(null);
      return queueEdit(() => session.editPageSetup(patch, whole));
    };
    // 도형 그리기. 도구만 켜고, 끌기와 넣기는 코어가 포인터 입력으로 한다.
    window.__chwpDrawShape = (tool) => {
      if (readOnly || !sceneReady()) return Promise.resolve(null);
      return session.setDrawTool(tool);
    };
    // 그림 넣기. 고른 파일 바이트를 그대로 코어에 넘긴다. 모르는 파일이면 코어가 넣지 않는다.
    window.__chwpInsertPicture = (bytes) => {
      if (readOnly || !sceneReady() || !bytes) return Promise.resolve(null);
      return queueEdit(() => session.editInsertPicture(bytes));
    };
    // 표 만들기 대화 상자.
    window.__chwpInsertTable = (rows, cols) => {
      if (readOnly || !sceneReady()) return Promise.resolve(null);
      return queueEdit(() => session.editInsertTable(rows, cols));
    };
    // 글자 모양·문단 모양 대화 상자가 열릴 때 지금 자리의 값을 받는다.
    window.__chwpFormatFields = async () => {
      await coreReady;
      return session.formatFields();
    };
    for (const eventName of [
      "chwp-format",
      "chwp-style",
      "chwp-cursor-style",
      "chwp-para-shape",
      "chwp-char-shape",
    ]) {
      window.addEventListener(eventName, (event) => {
        void applyFormatPatch(event?.detail);
      });
    }
    window.addEventListener("chwp-align", (event) => {
      void applyFormatPatch(event?.detail, "align");
    });
    window.addEventListener("chwp-focus-editor", () => focusEditorInput());

    // 라이선스로 막힌 글꼴이 있으면 코어가 편집을 받지 않는다(needsFontSwap). 바꿀지 묻고, 바꾸면 한꺼번에 바꾼다.
    let fontSwapAsking = false;
    function askFontSwap() {
      if (fontSwapAsking) return;
      fontSwapAsking = true;
      // 조합 중이던 글자는 코어에 들어가지 않았다. 입력 칸을 비워 대화 상자 뒤로 남지 않게 한다.
      if (editorInput) {
        resetEditorField(true);
        editorInput.blur();
      }
      void session.licenseFontSwaps().then((swaps) => {
        if (!Array.isArray(swaps) || !swaps.length) {
          fontSwapAsking = false;
          return;
        }
        window.dispatchEvent(new CustomEvent("chwp-font-swap-ask", { detail: { swaps } }));
      }, (error) => {
        fontSwapAsking = false;
        logError("licenseFontSwaps", error);
      });
    }
    // detail.chosen 은 대화 상자에서 고른 {막힌 글꼴: 바꿀 글꼴}이다. 고를 수 있는 글꼴인지는 코어가 다시 본다.
    window.addEventListener("chwp-font-swap-apply", (event) => {
      const chosen = event?.detail?.chosen && typeof event.detail.chosen === "object" ? event.detail.chosen : {};
      void queueEdit(async () => {
        // 바꿔 넣을 글꼴은 바꾼 뒤 코어가 받으라고 부르고, 받으면 문서를 다시 놓는다.
        const result = await session.editSwapFonts(chosen);
        try {
          window.localStorage.setItem(swapChoiceKey, await session.fontSwapPreferences());
        } catch {
          // 저장하지 못해도 이번 바꾸기는 그대로 한다.
        }
        return result;
      }).then((result) => {
        if (result?.cursorStyle) emitCursorStyle(result.cursorStyle);
      }, (error) => logError("editSwapFonts", error)).finally(() => {
        fontSwapAsking = false;
        focusEditorInput();
      });
    });
    window.addEventListener("chwp-font-swap-cancel", () => {
      fontSwapAsking = false;
      void session.dropPendingInsert().catch((error) => logError("dropPendingInsert", error));
      focusEditorInput();
    });

    function applyPointerResult(result, restartCaret) {
      appendEvent(result?.event);
      // 끌어 그린 도형처럼 포인터로 문서를 고쳤다.
      if (result?.edited) emitDocState(result.docState);
      // 막힌 글꼴 때문에 그린 도형을 넣지 못했다. 바꿀지 묻고, 바꾸면 코어가 그 도형을 이어서 넣는다.
      // 표·그림 넣기는 applyEditResult 에서 같은 식으로 묻는다.
      if (result?.needsFontSwap) askFontSwap();
      if (result?.cursorStyle) emitCursorStyle(result.cursorStyle);
      if (typeof result?.text === "string") selectedText = result.text;
      selectionMarks = [];
      caretImage = result?.caret ? { caret: true } : null;
      for (const image of result?.images || []) {
        const canvas = pixelsToCanvas(image);
        if (!canvas) continue;
        const mark = {
          page: image.page | 0,
          x: image.x | 0,
          y: image.y | 0,
          w: image.w | 0,
          h: image.h | 0,
          pageW: image.pageW | 0,
          pageH: image.pageH | 0,
          canvas,
        };
        if (image.caret) caretImage = mark;
        else selectionMarks.push(mark);
      }
      if (lastPaint) paintView(lastPaint, screenLive, !!restartCaret);
      else showCaret(null);
      if (restartCaret && caretImage) blinkCaret();
      if (result?.active || result?.caret) focusEditorInput();
      // 블록 마커를 끌지 않고 누르면 그 자리에 복사·잘라내기 메뉴를 띄운다.
      if (result?.pinTap && selectedText) {
        window.dispatchEvent(new CustomEvent("chwp-selection-menu", {
          detail: { x: lastPressClient.x, y: lastPressClient.y, readOnly },
        }));
      }
    }

    function selectionAction(action) {
      if (action === "copy") {
        if (selectedText) copySelectedText(selectedText);
        return;
      }
      if (readOnly) return;
      if (action === "undo" || action === "redo") {
        if (!sceneReady()) return;
        void queueEdit(() => (action === "undo" ? session.editUndo() : session.editRedo()));
        return;
      }
      if (action === "cut" || action === "delete") {
        // 클립보드에 넣는 일은 플랫폼 일이라 누른 그 자리에서 한다. 지우기는 코어가 고른 글을 보고 한다.
        if (action === "cut" && selectedText) copySelectedText(selectedText);
        void queueEdit(() => session.editDeleteSelection());
        return;
      }
      if (action === "paste") {
        const read = navigator.clipboard?.readText;
        if (!read) return;
        // 메뉴 붙여 넣기도 키보드 붙여 넣기와 같은 입력칸 사건이다.
        void read.call(navigator.clipboard).then((text) => {
          if (!text) return;
          ensureEditorInput();
          fieldEvent({ kind: "paste", data: text });
        }).catch((error) => logError("paste", error));
      }
    }
    window.addEventListener("chwp-selection-action", (event) => selectionAction(event.detail?.action));
    // 상태 줄의 삽입/수정 단추. Insert 키와 같은 길이다.
    window.addEventListener("chwp-toggle-overwrite", () => {
      focusEditorInput();
      void queueEdit(() => session.editKey(editKeyOf("Insert"), false, false, false));
    });
    // 리본의 머리말·꼬리말 닫기. 입력칸의 Shift+Esc 와 같은 길이다.
    window.addEventListener("chwp-leave-band", () => {
      focusEditorInput();
      void queueEdit(() => session.editKey(editKeyOf("Escape"), true, false, false));
    });

    function showCaret(plan) {
      const el = document.getElementById("viewCaret");
      if (!(el instanceof HTMLCanvasElement)) return;
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
      const el = document.getElementById("viewCaret");
      if (!el) return;
      el.style.animation = "none";
      void el.offsetWidth;
      el.style.animation = "";
    }

    function hideCaret() {
      selectionMarks = [];
      caretImage = null;
      showCaret(lastPaint);
      // 코어의 고른 구간·캐럿도 지운다.
      void session.pointer(4, -1, 0, 0, screenPercent).catch(() => {});
    }

    function placePdf(plan) {
      const frame = document.querySelector(".pdf-frame");
      if (!(frame instanceof HTMLElement) || frame.hidden || !plan) return;
      const dpr = plan.dpr || 1;
      const focus = plan.page ?? pageSelect.selectedIndex;
      if (!Array.isArray(plan.pages) || !plan.pages.length) return;
      const page = plan.pages.find((item) => item.index === focus) || plan.pages[0];
      const x = page.x - (plan.scrollX || 0);
      const y = page.y - (plan.scrollY || 0);
      frame.style.right = "auto";
      frame.style.bottom = "auto";
      frame.style.left = `${x / dpr}px`;
      frame.style.top = `${y / dpr}px`;
      frame.style.width = `${Math.max(1, page.w / dpr)}px`;
      frame.style.height = `${Math.max(1, page.h / dpr)}px`;
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
      const scroller = document.getElementById("viewScroller");
      const spacer = document.getElementById("viewSpacer");
      if (!scroller || !spacer || !plan) return;
      const dpr = plan.dpr || 1;
      const beforeW = scroller.clientWidth;
      const beforeH = scroller.clientHeight;
      holdApplyingScroll();
      spacer.style.width = `${beforeW + (plan.maxScrollX || 0) / dpr}px`;
      spacer.style.height = `${beforeH + (plan.maxScrollY || 0) / dpr}px`;
      if (!keepPlace) {
        const left = (plan.scrollX || 0) / dpr;
        const top = (plan.scrollY || 0) / dpr;
        if (Math.abs(scroller.scrollLeft - left) >= 0.5 || Math.abs(scroller.scrollTop - top) >= 0.5) {
          scroller.scrollLeft = left;
          scroller.scrollTop = top;
        }
      }
    }

    function onViewScroll() {
      if (applyingScroll || pinchLive || scrollOwned) return;
      const scroller = document.getElementById("viewScroller");
      if (!scroller) return;
      const dpr = lastPaint?.dpr || window.devicePixelRatio || 1;
      const x = Math.round(scroller.scrollLeft * dpr);
      const y = Math.round(scroller.scrollTop * dpr);
      if (x === shownScrollX && y === shownScrollY) return;
      scrollSerial += 1;
      const dx = x - shownScrollX;
      const dy = y - shownScrollY;
      shownScrollX = x;
      shownScrollY = y;
      if (!lastPaint) {
        queueScrollInput(x, y);
        return;
      }
      lastPaint = { ...lastPaint, scrollX: x, scrollY: y };
      placePdf(lastPaint);
      syncViewportInfo();
      queueScrollInput(x, y);
    }

    function logNext(turn, message) {
      if (!turn) return;
      pushRow("render", turn.page, `다음 ${turn.page}쪽 ${message} +${(Date.now() - turn.at).toFixed(1)}ms`);
    }
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
        clearLog();
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
        if (error) embed.failed(error);
        const head = {
          idx: 0,
          문서: this.name,
          시작: 0,
          ms: Number((Date.now() - this.at).toFixed(1)),
        };
        if (error) head.오류 = String(error?.message || error);
        appendLog([head, ...this.steps]);
        remoteLog?.memory("열기 끝");
        remoteLog?.note("opening", [head, ...this.steps]);
      },
    };

    function foldPageLog(rows) {
      const pages = [];
      let header = null;
      let stack = null;
      let calc = null;
      let count = null;
      for (const row of rows ?? []) {
        if (!row || typeof row !== "object") continue;
        if (typeof row.쪽 === "number") pages.push(row);
        if ("머리말" in row) header = (header ?? 0) + row.머리말;
        if ("쪽쌓기" in row) stack = row.쪽쌓기;
        if ("페이지계산" in row) calc = row.페이지계산;
        if ("쪽수" in row) count = row.쪽수;
      }
      if (!pages.length && header == null && stack == null && calc == null) return null;
      const extra = {};
      if (pages.length) extra.쪽 = pages;
      if (header != null) extra.머리말 = header;
      if (stack != null) extra.쪽쌓기 = stack;
      if (calc != null) extra.페이지계산 = calc;
      if (count != null) extra.쪽수 = count;
      return extra;
    }
    function layoutZoom() {
      syncZoomChrome();
      const index = pageSelect.selectedIndex;
      const node = index >= 0 ? scenePages[index] : null;
      if (node?.width && node?.height) {
        ensureViewport();
        if (lastPaint) placePdf(lastPaint);
        return;
      }
      clearViewport();
      applyCompare();
    }

    // 배율 바꾸기도 화면이 있든 없든 코어 입력 하나다. 범위 자르기·맞춤 끄기·스크롤 기준은 코어가 정하고,
    // 셸은 카메라 답(adoptCamera·applyShellCamera)으로 화면과 배율 칸을 맞춘다.
    function applyZoomPercent(raw) {
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) {
        syncZoomInput();
        return;
      }
      if (location.search.includes("hangul")) {
        const url = new URL(location.href);
        url.searchParams.delete("hangul");
        history.replaceState(null, "", url);
      }
      if (!sceneReady()) return;
      ensureViewport();
      void sendInput({ type: "zoom", percent: Math.round(n) });
    }


    function renderPreview() {
      const index = pageSelect.selectedIndex;
      const paging = pages.length > 0 && index >= 0;
      prev.disabled = !paging || index <= 0;
      next.disabled = !paging || index >= pages.length - 1;
      pageSelect.disabled = !paging;
      if (!paging) {
        pageInfo.textContent = "";
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

    function showHangul() {
      const index = pageSelect.selectedIndex;
      const page = index >= 0 ? index + 1 : 0;
      const pageCount = Math.max(scenePages.length, pages.length, pageSelect?.options?.length || 0);
      const percent = currentZoomPercent();
      const url = "";
      window.dispatchEvent(new CustomEvent("chwp-page", {
        detail: { url, page, pageIndex: Math.max(0, index), pageCount, percent },
      }));
    }

    function setPages(nextPages, index = 0, keepCoreCaret = false) {
      const count = scenePages.length || nextPages.length;
      pages = Array.from({ length: count }, () => "");
      pageSelect.replaceChildren();
      pages.forEach((_, pageIndex) => {
        const option = document.createElement("option");
        option.textContent = `${pageIndex + 1}쪽`;
        pageSelect.append(option);
      });
      if (pages.length) pageSelect.selectedIndex = Math.min(Math.max(0, index | 0), pages.length - 1);
      // 문서를 막 열었으면 커서는 코어가 쪽을 짤 때 정했다(새 문서는 첫 문단). 셸 표시만 지우고 코어 커서는 둔다.
      if (keepCoreCaret) {
        selectionMarks = [];
        caretImage = null;
        showCaret(lastPaint);
      } else {
        hideCaret();
      }
      showHangul();
      renderPreview();
    }

    document.getElementById("opacity")?.addEventListener("input", applyCompare);
    window.addEventListener("chwp-page-ready", layoutZoom);
    new ResizeObserver(() => {
      if (sceneReady()) {
        ensureViewport();
        postViewport();
        return;
      }
      layoutZoom();
    }).observe(preview);
    const zoomSlider = document.getElementById("zoomSlider");
    zoomSlider?.addEventListener("input", () => {
      applyZoomPercent(zoomSlider.value);
    });
    const zoomInfo = document.getElementById("zoomInfo");
    zoomInfo?.addEventListener("change", () => applyZoomPercent(zoomInfo.value));
    zoomInfo?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      applyZoomPercent(zoomInfo.value);
      zoomInfo.blur();
    });
    function stepPageView(dir) {
      if (!dir) return;
      if (!sceneReady()) return;
      cancelScrollInput();
      void sendInput({ type: "pageStep", dir: dir < 0 ? -1 : 1 });
    }
    // 단축키. 어떤 키가 무슨 명령인지는 코어 표가 정하고, 여기서는 그 명령을 실행한다.
    // 다른 입력칸(대화 상자 등) 안에서는 그 칸의 기본 동작을 둔다. 한글 자판이어도 글자 키는 같은 자리 키다(event.code).
    window.addEventListener("keydown", (event) => {
      if (event.isComposing || event.keyCode === 229 || fieldComposing) return;
      const binding = findKey(event);
      if (!binding) return;
      const target = event.target;
      const inEditor = target === editorInput;
      // 입력칸에 맡길 키(글이 남은 입력칸의 지우기)는 입력기가 처리한다.
      if (inEditor && fieldActions(fieldKeyEvent(event)).toField) return;
      const foreign =
        !inEditor &&
        (target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement ||
          (target instanceof HTMLElement && target.isContentEditable));
      // 편집 입력칸에서만 쓰는 키(Esc)는 입력칸이 받는다. 위에 뜬 대화 상자가 먼저 닫을 수 있게 둔다.
      if (foreign || binding.editorOnly) return;
      const command = binding.command;
      // 붙여 넣기는 플랫폼이 입력칸에 붙여 넣기 사건으로 준다(입력칸 paste 사건). 기본 동작을 막지 않는다.
      if (command === "paste") return;
      if (command === "cut" || command === "open" || command === "save") {
        event.preventDefault();
        if (command === "cut") selectionAction("cut");
        else if (command === "open") document.getElementById("file")?.click();
        else window.dispatchEvent(new Event("chwp-save-as"));
        return;
      }
      if (command === "copy") {
        // 복사는 클립보드에 바로 써야 해서 셸이 쓴다. 고른 글이 없으면 브라우저에 둔다.
        if (!selectedText) return;
        event.preventDefault();
        copySelectedText(selectedText);
        return;
      }
      const dialog = command.endsWith("Dialog") ? command.slice(0, -"Dialog".length) : "";
      if (!dialog && !sceneReady()) return;
      event.preventDefault();
      event.stopPropagation();
      if (dialog) {
        window.dispatchEvent(new CustomEvent("chwp-open-format-dialog", { detail: { name: dialog } }));
      } else if (command === "editKey") {
        void queueEdit(() =>
          session.editKey(binding.editKey, !!event.shiftKey, !!(event.ctrlKey || event.metaKey), !!event.altKey));
      } else if (command === "undo" || command === "redo") {
        selectionAction(command);
      } else if (command === "pageDown" || command === "pageUp") {
        stepPageView(command === "pageDown" ? 1 : -1);
      }
    }, true);
    window.addEventListener("chwp-page-grid", (event) => {
      applyPageGrid(event.detail);
    });
    // 눈금자는 코어가 화면 캔버스에 그린다. 켠 값과 처음 값, 켜고 끄기는 코어가 정한다.
    // 셸은 코어가 알려 준 값을 메뉴에 보이고, 사용자가 바꾸면 저장해 둔다.
    const rulersKey = "chwp.rulers";
    let rulersWanted = null;
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
      if (typeof camera?.rulersWanted !== "boolean" || camera.rulersWanted === rulersWanted) return;
      const changed = rulersWanted !== null;
      rulersWanted = camera.rulersWanted;
      window.__chwpRulersWanted = rulersWanted;
      if (changed) {
        try {
          localStorage.setItem(rulersKey, rulersWanted ? "1" : "0");
        } catch {}
      }
      window.dispatchEvent(new CustomEvent("chwp-rulers-changed", { detail: { on: rulersWanted } }));
    }
    // 블록 마커는 따로 설정하지 않는다. 손가락이 주 입력인 화면(pointer: coarse)에서만 켜고,
    // 태블릿에 키보드·마우스를 붙이는 것처럼 주 입력이 바뀌면 따라간다.
    const coarsePointer = window.matchMedia?.("(pointer: coarse)");
    function syncPins() {
      void sendInput({ type: "pins", on: !!coarsePointer?.matches });
    }
    coarsePointer?.addEventListener?.("change", syncPins);
    window.addEventListener("chwp-rulers", () => void sendInput({ type: "rulersToggle" }));
    // 배율 대화 상자의 적용. 쪽 모양과 배율을 함께 보내고, 어떻게 맞출지는 코어가 정한다.
    window.addEventListener("chwp-zoom-dialog", (event) => {
      if (!sceneReady()) return;
      const detail = event.detail || {};
      ensureViewport();
      void sendInput({
        type: "zoomDialog",
        mode: String(detail.shape || "auto"),
        cols: Number(detail.cols) | 0,
        rows: Number(detail.rows) | 0,
        choice: String(detail.zoom || ""),
        percent: Number(detail.percent) | 0,
      });
    });
    window.addEventListener("chwp-zoom", (event) => {
      const raw = event.detail;
      if (typeof raw === "number" || typeof raw === "string") {
        applyZoomPercent(raw);
        return;
      }
      const detail = raw || {};
      if (detail.grid || detail.gridMode) {
        applyPageGrid(detail.grid || {
          mode: detail.gridMode,
          cols: detail.cols ?? detail.gridCols,
          rows: detail.rows ?? detail.gridRows,
          fit: detail.fit === true || detail.gridMode === "grid",
        });
        return;
      }
      if (detail.pageStep) {
        stepPageView(Number(detail.pageStep));
        return;
      }
      if (detail.fit === "width" || detail.fit === "page") {
        fitZoom(detail.fit);
        return;
      }
      const direct = detail.percent ?? detail.zoom ?? detail.value;
      if (direct != null && direct !== "") {
        applyZoomPercent(direct);
        return;
      }
      const step = Number(detail.step);
      if (!Number.isFinite(step) || step === 0) return;
      // 한 단계 크기(계단)는 코어가 정한다. 방향만 넘긴다.
      void sendInput({ type: "zoomStep", dir: Math.sign(step) });
    });
    syncZoomInput();
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
        const scroller = document.getElementById("viewScroller") || preview;
        cachedContactBounds = scroller.getBoundingClientRect();
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
      const scroller = document.getElementById("viewScroller");
      const dpr = lastPaint?.dpr || window.devicePixelRatio || 1;
      shownScrollX = x;
      shownScrollY = y;
      if (scroller && (settle || !scrollOwned)) {
        holdApplyingScroll();
        scroller.scrollLeft = x / dpr;
        scroller.scrollTop = y / dpr;
      }
      if (!lastPaint) {
        syncViewportInfo(hintPage);
        return;
      }
      lastPaint.scrollX = x;
      lastPaint.scrollY = y;
      placePdf(lastPaint);
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
      if (sceneReady()) showPageCount(camera.pageCount);
      shownScrollX = camera.scrollX | 0;
      shownScrollY = camera.scrollY | 0;
      // 스크롤을 누가 쥐고 있는지·멈췄는지는 코어가 정한다.
      scrollOwned = !!camera.ownsScroll;
      const viewW = camera.viewW | 0;
      const viewH = camera.viewH | 0;
      if (viewW > 0 && viewH > 0) {
        const dpr = camera.dpr > 0 ? camera.dpr : (window.devicePixelRatio || 1);
        const canvas = document.getElementById("viewCanvas");
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
        if (settled) {
          const scroller = document.getElementById("viewScroller");
          if (scroller) {
            holdApplyingScroll();
            scroller.scrollLeft = shownScrollX / dpr;
            scroller.scrollTop = shownScrollY / dpr;
          }
        }
        placePdf(lastPaint);
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

    async function adoptCamera(camera) {
      takeRulers(camera);
      takeZoomLabel(camera);
      if (Number(camera?.tapSlop) > 0) tapSlop = Number(camera.tapSlop);
      if (camera?.select) applyPointerResult(camera, (camera.selectPhase | 0) === 1);
      applyShellCamera(camera, false);
    }
    function sendInput(event) {
      return coreReady.then(() => session.input(event)).then((camera) => {
        void adoptCamera(camera);
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
    function flushPointer(force = false) {
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
      if (phase === 2 && gestureActive && event.pointerType === "touch") {
        return;
      }
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
        flushPointer(true);
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
    preview.addEventListener("pointerdown", (event) => {
      const touchOrPen = event.pointerType === "touch" || event.pointerType === "pen";
      if (!touchOrPen && event.button !== 0 && event.button !== 1) return;
      event.preventDefault();
      event.stopPropagation();
      // 커서가 옮겨 갈 수 있다. 입력칸에 남긴 글은 옛 자리 글이라 비우고, 조합 중이면 조합도 버린다.
      resetEditorField(true);
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
        preview.setPointerCapture?.(event.pointerId);
      } catch {
        // 캡처가 없어도 이동 이벤트는 미리보기로 온다.
      }
      sendPointer(event, 1, event.button);
    }, true);
    preview.addEventListener("auxclick", (event) => {
      if (event.button === 1) event.preventDefault();
    }, true);
    preview.addEventListener("pointermove", (event) => {
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
      if (press.button !== 1 && event.type === "pointerup" && !press.moved) {
        if (press.touch && presses.size === 0) focusEditorInput();
        pickMarkAt(event.clientX, event.clientY);
      }
    };
    preview.addEventListener("pointerup", endPointer, true);
    preview.addEventListener("pointercancel", endPointer, true);
    // 휴대폰 화면 자판은 사용자 탭 안에서 준 초점에만 뜬다. iOS 는 touchend 를 그 탭으로 본다.
    // 또 touchend 뒤에 브라우저가 흉내 내는 mousedown·click 이 캔버스에 떨어지면 방금 준 초점을 빼앗아 자판이 닫힌다.
    // 그래서 탭이면 여기서 다시 초점을 주고, 기본 동작을 막아 흉내 마우스 이벤트가 오지 않게 한다.
    preview.addEventListener("touchend", (event) => {
      if (!touchTapPending) return;
      touchTapPending = false;
      if (event.touches.length > 0) return;
      event.preventDefault();
      focusEditorInput();
    }, { capture: true, passive: false });
    preview.addEventListener("touchstart", () => {
      touchTapPending = false;
    }, { capture: true, passive: true });
    const scheduleGestureFlush = () => {
      if (gestureFlush || !gesturePending) return;
      gestureFlush = requestAnimationFrame(() => {
        gestureFlush = 0;
        flushGesture();
      });
    };
    const flushGesture = (force = false) => {
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
        flushGesture(true);
        void sendInput(payload);
        return;
      }
      gesturePending = payload;
      scheduleGestureFlush();
    };
    window.addEventListener("gesturestart", (event) => sendGesture(event, 1), { passive: false });
    window.addEventListener("gesturechange", (event) => sendGesture(event, 2), { passive: false });
    window.addEventListener("gestureend", (event) => sendGesture(event, 3), { passive: false });
    window.addEventListener("wheel", (event) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
    }, { passive: false, capture: true });
    // 휠은 브라우저 값을 그대로 넘긴다. 단위·마우스/트랙패드 가르기·속도·끝 판정은 코어(WheelReader)가 한다.
    function sendWheel(event) {
      const point = contactPoint(event);
      const zoom = !!(event.ctrlKey || event.metaKey);
      if (zoom) pinchLive = true;
      scrollOwned = true;
      cancelScrollInput();
      const scroller = document.getElementById("viewScroller");
      void sendInput({
        type: "wheelRaw",
        dx: event.deltaX,
        dy: event.deltaY,
        deltaMode: event.deltaMode | 0,
        zoom,
        x: point.x,
        y: point.y,
        pageW: scroller ? scroller.clientWidth : 0,
        pageH: scroller ? scroller.clientHeight : 0,
        dpr: lastPaint?.dpr || window.devicePixelRatio || 1,
      });
    }
    preview.addEventListener("wheel", (event) => {
      event.preventDefault();
      if (!sceneReady()) return;
      sendWheel(event);
    }, { passive: false, capture: true });

    // 쪽 넘기기. 어디로 갈지·캐럿을 둘지는 코어가 정한다(PageUp·PageDown 과 같은 길).
    function turnPage() {
      void sendInput({ type: "revealPage", page: pageSelect.selectedIndex | 0 });
      showHangul();
    }
    pageSelect.addEventListener("change", turnPage);
    prev.addEventListener("click", () => stepPageView(-1));
    next.addEventListener("click", () => {
      logNext({ at: Date.now(), page: pageSelect.selectedIndex + 2 }, "클릭");
      stepPageView(1);
    });

    async function openBytes(bytes, name, openedAt) {
      if (openedAt == null) opening.begin(name, Date.now());
      let openError = null;
      try {
        scrollSerial += 1;
        shownScrollX = 0;
        shownScrollY = 0;
        selectedText = "";
        selectionMarks = [];
        caretImage = null;
        lastPaint = null;
        const coreStarted = Date.now();
        await coreReady;
        opening.mark("코어 준비", coreStarted);
        const resetStarted = Date.now();
        await session.view({ reset: true });
        opening.mark("화면 지우기", resetStarted);
        status.textContent = "파싱 중...";
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
        if (result?.ok) {
          status.textContent = "쪽 계산 중...";
          try {
            const fontStarted = Date.now();
            const fontReport = await session.fontFiles();
            opening.mark("글꼴 받기", fontStarted, fontReport || { 요청: 0, 받음: 0 });
            const layoutStarted = Date.now();
            // ?measured=1 이면 lineseg 의 줄 경계만 쓰고 줄 높이는 우리 측정값으로 그린다(한글과 모양 비교용).
            const measured = new URLSearchParams(location.search).get("measured") === "1";
            const planned = await session.plan(measured);
            const plan = JSON.parse(planned.json);
            opening.mark("쪽 계산", layoutStarted, foldPageLog(planned.detail));
            const laid = Array.isArray(plan.pages) ? plan.pages : [];
            scenePages = laid;
            pages = Array.from({ length: scenePages.length }, () => "");
            pageSelect.replaceChildren();
            pages.forEach((_, pageIndex) => {
              const option = document.createElement("option");
              option.textContent = `${pageIndex + 1}쪽`;
              pageSelect.append(option);
            });
            ensureViewport();
            if (screenAttached) await screenAttached;
            await session.beginGrind();
            await sendInput(viewportInput());
            // 주소의 쪽 모양·배율·쪽(?view= &zoom= &page=)은 코어가 읽고 그 차례로 맞춘다.
            const opened = await sendInput({ type: "embedOpen", choice: location.search });
            const openPage = opened?.page | 0;
            if (pages.length) pageSelect.selectedIndex = openPage;
            setPages([], openPage, true);
            embed.opened(opened);
            // 글꼴 고르기 목록에 이 문서 글꼴이 더해진다(막힌 글꼴은 코어가 뺀다).
            void session.pickableFonts().then((list) => {
              window.__chwpFontList = Array.isArray(list) ? list : [];
              window.dispatchEvent(new CustomEvent("chwp-font-list", { detail: window.__chwpFontList }));
            }).catch((error) => logError("pickableFonts", error));
            // 리본 스타일 목록은 문서 스타일 표에서 온다.
            void session.styleNames().then((names) => {
              window.__chwpStyleList = Array.isArray(names) ? names : [];
              window.dispatchEvent(new CustomEvent("chwp-style-list", { detail: window.__chwpStyleList }));
            }).catch((error) => logError("styleNames", error));
            // 새 문서는 첫 문단에 커서가 있으니 바로 칠 수 있게 입력칸에 초점을 준다.
            if (!bytes) focusEditorInput();
          } catch (error) {
            logError("openBytes.plan", error);
            status.textContent = `배치 실패: ${error?.message || error}`;
            openError = error;
            return;
          }
        } else {
          setPages([]);
          openError = new Error(result?.error || "파싱 실패");
          logError("openBytes.parse", openError);
        }
        status.textContent = result?.ok ? `${name} · ${pages.length}페이지` : (result?.error || "파싱 실패");
      } catch (error) {
        logError("openBytes", error);
        openError = error;
        throw error;
      } finally {
        opening.end(openError);
      }
    }

    function downloadBytes(bytes, name) {
      const blob = new Blob([bytes], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    }

    async function saveAsDownload() {
      if (saving) return;
      if (!openedName) {
        status.textContent = "열린 문서가 없습니다.";
        return;
      }
      saving = true;
      status.textContent = "저장 중...";
      try {
        // 저장 형식과 이름은 코어가 정한다(이름 끝, 없으면 연 파일의 형식).
        // 앞서 친 글·조합이 먼저 문서에 들어가게 편집 차례 뒤에 저장한다.
        const saved = await afterEdits(() => session.saveDocument(openedName));
        const bytes = saved?.bytes;
        if (!(bytes instanceof Uint8Array) || bytes.length === 0) throw new Error("저장에 실패했습니다.");
        downloadBytes(bytes, saved.name);
        status.textContent = `${saved.name} · ${pages.length}페이지`;
        emitDocState(saved.docState);
        notify("문서를 저장했어요.", "saved");
      } catch (error) {
        logError("saveAs", error);
        status.textContent = `저장 실패: ${error?.message || error}`;
        notify(`저장하지 못했어요. ${error?.message || ""}`.trim(), "error", { label: "다시 시도", run: () => void saveAsDownload() });
      } finally {
        saving = false;
      }
    }

    window.addEventListener("chwp-save-as", () => {
      void saveAsDownload();
    });

    window.addEventListener("chwp-new-document", () => {
      const openedAt = Date.now();
      opening.begin("새 문서", openedAt);
      status.textContent = "새 문서...";
      void openBytes(null, "", openedAt);
    });

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

    async function openFetched(response, fallbackName, openedAt) {
      if (!response.ok) throw new Error(`열기 실패 (${response.status})`);
      const name =
        nameFromDisposition(response.headers.get("Content-Disposition")) ||
        fallbackName ||
        "문서";
      const bytes = new Uint8Array(await response.arrayBuffer());
      opening.mark("파일 읽기", openedAt);
      await openBytes(bytes, name, openedAt);
    }

    // ?handler= OneDrive 파일 핸들러. ?file= 브라우저가 직접 받을 수 있는 https 주소.
    async function openFromQuery() {
      const params = new URLSearchParams(location.search);
      const handler =
        params.get("handler") ||
        (typeof window.__HWP_HANDLER__ === "string" ? window.__HWP_HANDLER__ : "");
      const file = params.get("file") || "";
      if (/^[A-Za-z0-9_-]{20,80}$/.test(handler)) {
        const openedAt = Date.now();
        opening.begin("OneDrive", openedAt);
        status.textContent = "여는 중...";
        try {
          await openFetched(await fetch(`/api/hwp/file-handler/${handler}`), "document.hwp", openedAt);
        } catch (error) {
          logError("handler", error);
          status.textContent = `열기 실패: ${error?.message || error}`;
          opening.end(error);
        }
        return;
      }
      let direct;
      try {
        direct = file ? new URL(file, location.href) : null;
      } catch {
        direct = null;
      }
      // 다른 곳 주소는 https 만 받는다. 같은 출처면 /docs/a.hwp 처럼 경로만 줘도 된다.
      if (direct && (direct.protocol === "https:" || direct.origin === location.origin)) {
        const openedAt = Date.now();
        const fallback = decodeURIComponent(direct.pathname.split("/").pop() || "document.hwp");
        opening.begin(fallback, openedAt);
        status.textContent = "여는 중...";
        try {
          await openFetched(await fetch(direct.href), fallback, openedAt);
        } catch (error) {
          logError("fileUrl", error);
          status.textContent = `열기 실패: ${error?.message || error}`;
          opening.end(error);
        }
      }
    }

    const fileInput = document.getElementById("file");
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      fileInput.value = "";
      if (!file) return;
      const openedAt = Date.now();
      opening.begin(file.name, openedAt);
      status.textContent = "여는 중...";
      const readStarted = Date.now();
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        opening.mark("파일 읽기", readStarted);
        await openBytes(bytes, file.name, openedAt);
      } catch (error) {
        logError("fileInput", error);
        status.textContent = `열기 실패: ${error?.message || error}`;
        opening.end(error);
      }
    });

    prepareViewSurface();
    applyReadOnly = (on) => {
      // 보기 전용이면 눈금자를 숨기는 일은 코어가 한다. 켠 값은 저장해 둔 값을 넘긴다.
      const saved = savedRulers();
      if (saved !== null) void sendInput({ type: "rulers", on: saved });
      void sendInput({ type: "readOnly", on });
      if (on) editorInput?.blur();
    };
    applyReadOnly(readOnly);
    syncPins();
    void openFromQuery();
    renderPreview();
  
}
