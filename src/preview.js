
import { createCoreSession } from "./core-session.js";

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
    );
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
    function arrivePage(page) {
      pageBucket(page).render.length = 0;
      updateTabLabels();
      if (logTab === "render" || logTab === "element") paintLogBody("end");
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
      appendLog(`[noting] 코어 ${Number(result?.coreMs || 0).toFixed(1)}ms`);
      if (status.textContent === "코어 준비 중...") status.textContent = "문서를 열 수 있습니다.";
      // ?cacheBudget=pageGpu:8000000 처럼 캐시 예산(바이트)을 바꾼다. 메모리가 작은 기기의 사정을 데스크톱에서 재현할 때 쓴다.
      for (const pair of (new URLSearchParams(location.search).get("cacheBudget") || "").split(",")) {
        const [name, bytes] = pair.split(":");
        if (name && Number(bytes) > 0) await session.setCacheBudget(name, Number(bytes));
      }
      // ?debug=1 이면 캐시 사용량을 콘솔에서 볼 수 있게 한다: await __notingCacheUsage()
      if (debug) window.__notingCacheUsage = () => session.cacheUsage();
      // 글꼴 고르기 목록은 코어가 정한다. 라이선스로 막힌 글꼴은 빠져 있다.
      void session.pickableFonts().then((list) => {
        window.__notingFontList = Array.isArray(list) ? list : [];
        window.dispatchEvent(new CustomEvent("noting-font-list", { detail: window.__notingFontList }));
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
    let parsed = null;
    let images = {};
    let fileBytes = null;
    const imageLoads = new Map();
    const sheetCache = new Map();
    const sheetLayout = new WeakMap();
    let anchorPages = [];
    let innerLines = [];
    let paragraphPages = [];
    let lineRanges = [];
    let bodyDocument = null;

    function aligned(align, origin, size, obj, offset) {
      if (align === "CENTER") return origin + (size - obj) / 2 + offset;
      if (align === "RIGHT" || align === "BOTTOM" || align === "OUTSIDE") return origin + size - obj - offset;
      return origin + offset;
    }

    function sectionPage() {
      return parsed?.sections?.[0]?.page ?? {
        width: 59528, height: 84188,
        marginLeft: 8504, marginRight: 8504, marginTop: 5668, marginBottom: 4252,
        marginHeader: 4252, marginFooter: 4252,
      };
    }

    function contentBox(page) {
      const left = page.marginLeft || 0;
      const top = (page.marginTop || 0) + (page.marginHeader || 0);
      const right = page.width - (page.marginRight || 0);
      const bottom = page.height - (page.marginBottom || 0) - (page.marginFooter || 0);
      return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
    }

    function placeObject(placement, page, content, anchorY) {
      const paperX = placement.horzRelTo === "PAPER";
      const paperY = placement.vertRelTo === "PAPER";
      const x = aligned(placement.horzAlign, paperX ? 0 : content.left, paperX ? page.width : content.width,
        placement.width, placement.horzOffset);
      const y = paperY
        ? aligned(placement.vertAlign, 0, page.height, placement.height, placement.vertOffset)
        : placement.vertRelTo === "PARA"
          ? content.top + anchorY + (placement.vertOffset || 0)
          : aligned(placement.vertAlign, content.top, content.height, placement.height, placement.vertOffset);
      return { x, y, w: placement.width, h: placement.height, placement };
    }

    // 쪽 좌표는 그 쪽 안에서의 위치다. 개체가 놓인 쪽은 문단이 넘어간 쪽이다.
    function controlsOnPage(pageIndex) {
      const paras = parsed?.sections?.[0]?.paragraphs ?? [];
      const found = [];
      let anchor = 0;
      for (let paraIndex = 0; paraIndex < paras.length; paraIndex++) {
        const para = paras[paraIndex];
        for (const run of para.runs ?? []) {
          for (const item of run.items ?? []) {
            const control = item.control;
            if (!control?.placement) continue;
            if (control.placement.treatAsChar && control.kind !== "picture" && control.kind !== "table" &&
                control.kind !== "shape") continue;
            if (anchorPages[anchor] === pageIndex) found.push({ control, paraIndex });
            anchor += 1;
          }
        }
      }
      return found;
    }

    function borderFill(id) {
      return (parsed?.header?.borderFills ?? []).find((fill) => fill.id === id);
    }

    function applyPaint(node, control) {
      const stroke = control.stroke;
      if (stroke) {
        node.dataset.stroke = String(stroke.width || 0);
        node.dataset.strokeType = stroke.type || "SOLID";
        node.dataset.strokeColor = stroke.color || "#000000";
      } else if (control.kind === "picture") {
        node.dataset.strokeType = "NONE";
      }
      if (control.gradColor && control.fillColor && control.fillColor !== "none") {
        node.style.background = `linear-gradient(${control.gradAngle || 0}deg, ${control.fillColor}, ${control.gradColor})`;
      } else if (control.fillColor && control.fillColor !== "none") {
        node.style.background = control.fillColor;
      }
    }

    function applyBorderFill(node, id) {
      const fill = borderFill(id);
      if (!fill) return;
      if (fill.gradColor && fill.faceColor && fill.faceColor !== "none") {
        node.style.background = `linear-gradient(${fill.gradAngle || 0}deg, ${fill.faceColor}, ${fill.gradColor})`;
      } else if (fill.faceColor && fill.faceColor !== "none") {
        node.style.background = fill.faceColor;
      }
      for (const side of ["left", "right", "top", "bottom"]) {
        const edge = fill[side];
        if (!edge) continue;
        const name = side[0].toUpperCase() + side.slice(1);
        if (!edge.type || edge.type === "NONE") {
          node.style[`border${name}Style`] = "none";
          continue;
        }
        node.style[`border${name}Style`] = edge.type.includes("DASH") ? "dashed"
          : edge.type.includes("DOT") ? "dotted" : "solid";
        node.style[`border${name}Color`] = edge.color || "#000000";
        node.dataset["stroke" + name] = String(edge.width || 28);
      }
    }

    function putPicture(node, control) {
      const id = control?.binItemId;
      if (!id) {
        node.textContent = "그림";
        return;
      }
      const place = (url) => {
        if (!url) {
          node.textContent = "그림";
          return;
        }
        const img = document.createElement("img");
        img.src = url;
        img.alt = "";
        node.replaceChildren(img);
      };
      if (images[id]) {
        place(images[id]);
        return;
      }
      ensureImage(id).then(place);
    }

    function paragraphUnits(para) {
      const units = [];
      for (const run of para.runs ?? []) {
        const em = charHeight(run.charShapeId);
        for (const item of run.items ?? []) {
          if (item.text) units.push({ kind: "text", text: item.text, em });
          else if (item.control) units.push({ kind: "ctrl", control: item.control });
        }
      }
      return units;
    }

    function glyphWidth(ch, em) {
      const cp = ch.codePointAt(0);
      if (cp === 0x2007) return em / 4;
      if (ch === " " || cp < 128) return em / 2;
      return em * 970 / 1000;
    }

    function paraShape(para) {
      const shapes = parsed?.header?.paraShapes ?? [];
      return shapes.find((item) => item.id === para.paraShapeId) ?? shapes[para.paraShapeId] ?? {};
    }

    function linePitch(em, para) {
      const shape = paraShape(para);
      const raw = shape.lineSpacing;
      const value = raw === undefined || raw === null ? 160 : raw;
      const type = shape.lineSpacingType || "PERCENT";
      if (type === "FIXED" || type === "AT_LEAST") return Math.max(em, value);
      if (type === "BETWEEN_LINES") return em + Math.max(0, value);
      if (value === 0) return 0;
      return Math.max(em, em * value / 100);
    }

    function lineFrame(shape, innerW, firstLine) {
      let left = shape.marginLeft || 0;
      let right = innerW - (shape.marginRight || 0);
      const indent = shape.indent || 0;
      if (firstLine && indent > 0) left += indent;
      if (firstLine && indent < 0) left += indent;
      if (!firstLine && indent < 0) left += -indent;
      if (right < left + 200) right = left + 200;
      return { left, right };
    }

    function gapsInBox(lineY, pitch, frameLeft, frameRight, floats, paraStart) {
      let free = [[frameLeft, frameRight]];
      for (const child of floats) {
        const placement = child.placement;
        if (!placement || placement.treatAsChar) continue;
        if (placement.textWrap !== "SQUARE" && placement.textWrap !== "TOP_AND_BOTTOM") continue;
        const x = placement.horzOffset || 0;
        const y = paraStart + (placement.vertOffset || 0);
        const w = child.laidW || placement.width || 0;
        const h = child.laidH || placement.height || 0;
        if (lineY + pitch <= y || lineY >= y + h) continue;
        if (placement.textWrap === "TOP_AND_BOTTOM") return [];
        const next = [];
        for (const [left, right] of free) {
          if (x + w <= left || x >= right) {
            next.push([left, right]);
            continue;
          }
          if (x > left) next.push([left, x]);
          if (x + w < right) next.push([x + w, right]);
        }
        free = next.filter(([left, right]) => right - left >= 200);
      }
      return free;
    }

    function addInnerLine(host, x, y, text, em, room, align) {
      const node = document.createElement("div");
      node.className = "inner-line";
      node.dataset.local = "1";
      node.dataset.x = String(x);
      node.dataset.y = String(y);
      node.dataset.em = String(em);
      node.dataset.room = String(room || 0);
      node.dataset.align = align || "LEFT";
      const span = document.createElement("span");
      span.dataset.em = String(em);
      span.textContent = text;
      node.append(span);
      host.append(node);
      return node;
    }

    function placeInnerControl(host, child, x, y) {
      const placement = child.placement;
      if (!placement) return;
      const node = document.createElement("div");
      node.className = "obj nested" + (child.kind === "picture" ? " picture" : "") +
        (child.kind === "table" ? " table" : "");
      node.dataset.local = "1";
      node.dataset.x = String(x);
      node.dataset.y = String(y);
      node.dataset.w = String(placement.width || 0);
      node.dataset.h = String(placement.height || 0);
      applyPaint(node, child);
      if (child.kind === "picture") putPicture(node, child);
      else if (child.kind === "table") drawTable(child, node);
      else fillBox(child, node);
      host.append(node);
      const laidH = Number(node.dataset.h) || child.placement.height || 0;
      const laidW = Number(node.dataset.w) || child.placement.width || 0;
      child.laidH = laidH;
      child.laidW = laidW;
      return laidH;
    }

    function fillBox(control, host) {
      const padLeft = control.boxPadLeft || 0;
      const padTop = control.boxPadTop || 0;
      const innerW = Math.max(200, (Number(host.dataset.w) || control.placement?.width || 0)
        - padLeft - (control.boxPadRight || 0));
      const state = { y: 0 };
      for (const paras of control.subLists ?? []) {
        for (const para of paras) layoutInnerParagraph(host, para, padLeft, padTop, innerW, state);
      }
    }

    function layoutInnerParagraph(host, para, padLeft, padTop, innerW, state) {
      const shape = paraShape(para);
      const align = shape.align || "JUSTIFY";
      const units = paragraphUnits(para);
      const floats = [];
      const flow = [];
      const latinChar = shape.breakLatinWord === "BREAK_WORD";
      for (const unit of units) {
        if (unit.kind === "text") {
          let word = "";
          const flushWord = () => {
            if (word) flow.push({ text: word, em: unit.em });
            word = "";
          };
          for (const ch of unit.text) {
            const cp = ch.codePointAt(0);
            const hangul = cp >= 0xAC00 && cp <= 0xD7A3;
            if (ch === " " || ch === "\t" || ch === "\n") {
              flushWord();
              flow.push({ ch, em: unit.em });
              continue;
            }
            if (hangul || latinChar) {
              flushWord();
              flow.push({ text: ch, em: unit.em });
              continue;
            }
            word += ch;
          }
          flushWord();
        } else if (unit.control?.placement?.treatAsChar) {
          flow.push({ ctrl: unit.control, em: unit.control.placement.height || 1000 });
        } else if (unit.control?.placement) floats.push(unit.control);
      }
      state.y += Math.max(0, shape.spacingPrev || 0);
      const paraStart = state.y;
      let floatBottom = paraStart;
      for (const child of floats) {
        floatBottom = Math.max(floatBottom, paraStart + (child.placement.vertOffset || 0) + (child.placement.height || 0));
      }
      const boxH = Number(host.dataset.h) || 200000;
      const made = [];
      const paraNode = document.createElement("p");
      paraNode.className = "para";
      paraNode.dataset.local = "1";
      paraNode.dataset.x = "0";
      paraNode.dataset.y = String(padTop + paraStart);
      paraNode.dataset.w = String(Number(host.dataset.w) || innerW);
      host.append(paraNode);
      if (!flow.length) {
        const pitch = linePitch(1000, para);
        addInnerLine(paraNode, padLeft, 0, "", 1000, innerW, align);
        state.y += pitch;
        state.y = Math.max(state.y, floatBottom);
        state.y += Math.max(0, shape.spacingNext || 0);
        paraNode.dataset.h = String(Math.max(pitch, state.y - paraStart));
        for (const child of floats) {
          const width = child.placement.width || 0;
          const height = child.placement.height || 0;
          const x = padLeft + aligned(child.placement.horzAlign, 0, innerW, width, child.placement.horzOffset || 0);
          const y = aligned(child.placement.vertAlign, 0, Math.max(pitch, height), height, child.placement.vertOffset || 0);
          placeInnerControl(paraNode, child, x, y);
        }
        return;
      }
      let index = 0;
      let firstLine = true;
      while (index < flow.length && state.y < boxH) {
        const em = flow[index].text || flow[index].ch ? flow[index].em : 1000;
        const pitch = linePitch(em, para);
        const frame = lineFrame(shape, innerW, firstLine);
        const gaps = gapsInBox(state.y, pitch, frame.left, frame.right, floats, paraStart);
        firstLine = false;
        if (!gaps.length) {
          state.y += pitch;
          continue;
        }
        let gapIndex = 0;
        let x = gaps[0][0];
        let text = "";
        let textX = x;
        let textEm = em;
        let used = 0;
        let lineBox = pitch;
        const flush = () => {
          if (!text) return;
          const gapLeft = gaps[gapIndex][0];
          const gapRight = gaps[gapIndex][1];
          const room = gapRight - gapLeft;
          let drawX = textX;
          if (align === "CENTER") drawX = gapLeft + (room - used) / 2;
          else if (align === "RIGHT") drawX = gapRight - used;
          const line = addInnerLine(paraNode, padLeft + drawX, state.y - paraStart, text, textEm,
            align === "LEFT" ? used : room, align);
          line.dataset.used = String(used);
          made.push(line);
          text = "";
          used = 0;
        };
        while (index < flow.length) {
          const item = flow[index];
          const width = item.ctrl
            ? (item.ctrl.placement.width || 0)
            : item.ch
              ? glyphWidth(item.ch, item.em)
              : [...item.text].reduce((sum, ch) => sum + glyphWidth(ch, item.em), 0);
          if (x > gaps[gapIndex][0] && x + width > gaps[gapIndex][1] + 15) {
            flush();
            gapIndex += 1;
            if (gapIndex >= gaps.length) break;
            x = gaps[gapIndex][0];
            textX = x;
            continue;
          }
          if (width > gaps[gapIndex][1] - gaps[gapIndex][0] + 15 && item.text && item.text.length > 1) {
            flow.splice(index, 1, ...[...item.text].map((ch) => ({ text: ch, em: item.em })));
            continue;
          }
          if (item.ctrl && x + width > gaps[gapIndex][1] + 15) {
            flush();
            let nextGap = -1;
            for (let gap = gapIndex; gap < gaps.length; gap++) {
              const at = gap === gapIndex ? x : gaps[gap][0];
              if (width <= gaps[gap][1] - at + 15) {
                nextGap = gap;
                break;
              }
            }
            if (nextGap >= 0 && nextGap !== gapIndex) {
              gapIndex = nextGap;
              x = gaps[nextGap][0];
              textX = x;
              continue;
            }
            const frameW = frame.right - frame.left;
            const clear = gaps.some((gap) => gap[1] - gap[0] + 15 >= frameW);
            if (width > frameW + 15 && clear) {
              // 단 전체보다 넓으면 이 줄에 둔다.
            } else {
              // 이 줄의 빈칸에는 안 들어간다. 줄을 중간에서 자르지 않고 어울림 아래로 내린다.
              let below = state.y;
              for (const child of floats) {
                const placement = child.placement;
                if (!placement || (placement.textWrap !== "SQUARE" && placement.textWrap !== "TOP_AND_BOTTOM")) continue;
                const top = paraStart + (placement.vertOffset || 0);
                const bottom = top + (child.laidH || placement.height || 0);
                if (state.y + lineBox <= top || state.y >= bottom) continue;
                below = Math.max(below, bottom);
              }
              if (below <= state.y) below = state.y + lineBox;
              state.y = below;
              lineBox = 0;
              break;
            }
          }
          if (item.ctrl) {
            flush();
            lineBox = Math.max(lineBox, placeInnerControl(paraNode, item.ctrl, padLeft + x, state.y - paraStart));
            x += item.ctrl.laidW || width;
          } else if (item.ch === "\n") {
            flush();
            index += 1;
            break;
          } else if (item.ch) {
            flush();
            text = item.ch;
            textX = x;
            textEm = item.em;
            used = width;
            flush();
            x += width;
          } else {
            if (!text) {
              textX = x;
              textEm = item.em;
            }
            text += item.text;
            used += width;
            x += width;
          }
          index += 1;
        }
        flush();
        state.y += lineBox;
      }
      if (made.length) {
        const last = made[made.length - 1];
        last.dataset.last = "1";
        if (last.dataset.used) last.dataset.room = last.dataset.used;
      }
      state.y = Math.max(state.y, floatBottom);
      state.y += Math.max(0, shape.spacingNext || 0);
      const paraH = Math.max(0, state.y - paraStart);
      paraNode.dataset.h = String(paraH);
      for (const child of floats) {
        const width = child.placement.width || 0;
        const height = child.placement.height || 0;
        const x = padLeft + aligned(child.placement.horzAlign, 0, innerW, width, child.placement.horzOffset || 0);
        const y = aligned(child.placement.vertAlign, 0, Math.max(paraH, height), height, child.placement.vertOffset || 0);
        placeInnerControl(paraNode, child, x, y);
      }
    }

    function cellPads(table, cell) {
      const tableSet = table.marginLeft || table.marginRight || table.marginTop || table.marginBottom;
      const cellSet = cell.marginLeft || cell.marginRight || cell.marginTop || cell.marginBottom;
      const src = cell.hasMargin || (!tableSet && cellSet) ? cell : table;
      return {
        left: src.marginLeft || 0,
        right: src.marginRight || 0,
        top: src.marginTop || 0,
        bottom: src.marginBottom || 0,
      };
    }

    function shrinkHorizontal(pad, width) {
      const next = { ...pad };
      if (width > 0 && next.left + next.right >= width) {
        const scale = width * 0.5 / (next.left + next.right);
        next.left *= scale;
        next.right *= scale;
      }
      return next;
    }

    // 더 나눌 수 없는 최소 너비. 글은 한 글자까지 줄바꿈하므로 가장 넓은 글자와, 글자처럼 취급하는 개체다.
    function minContentWidth(paragraphs) {
      let widest = 0;
      for (const para of paragraphs ?? []) {
        const shape = paraShape(para);
        let local = 0;
        for (const unit of paragraphUnits(para)) {
          if (unit.kind === "ctrl" && unit.control?.placement?.treatAsChar) {
            local = Math.max(local, unit.control.placement.width || 0);
            continue;
          }
          if (unit.kind !== "text") continue;
          for (const ch of unit.text) {
            if (ch === " " || ch === "\t" || ch === "\n") continue;
            local = Math.max(local, glyphWidth(ch, unit.em));
          }
        }
        local += Math.max(0, shape.marginLeft || 0) + Math.max(0, shape.marginRight || 0);
        widest = Math.max(widest, local);
      }
      return widest;
    }

    function contentHeight(paragraphs, innerW) {
      const scratch = document.createElement("div");
      scratch.dataset.h = "10000000";
      scratch.dataset.w = String(innerW);
      const state = { y: 0 };
      for (const para of paragraphs ?? []) layoutInnerParagraph(scratch, para, 0, 0, innerW, state);
      return state.y;
    }

    function drawTable(control, host) {
      const table = control.table;
      if (!table) return;
      applyBorderFill(host, table.borderFillId);
      const cells = table.cells ?? [];
      let cols = table.colCount || 0;
      let rows = table.rowCount || 0;
      for (const cell of cells) {
        cols = Math.max(cols, cell.col + (cell.colSpan || 1));
        rows = Math.max(rows, cell.row + (cell.rowSpan || 1));
      }
      const colW = Array(cols).fill(0);
      for (const cell of cells) {
        if ((cell.colSpan || 1) === 1) colW[cell.col] = Math.max(colW[cell.col], cell.width || 0);
      }
      for (const cell of cells) {
        if (!colW[cell.col]) colW[cell.col] = Math.max(colW[cell.col], cell.width || 0);
      }
      const pads = cells.map((cell) => cellPads(table, cell));
      for (const [index, cell] of cells.entries()) {
        const span = cell.colSpan || 1;
        const pad = pads[index];
        const minOuter = minContentWidth(cell.paragraphs) + pad.left + pad.right;
        if (span === 1) {
          colW[cell.col] = Math.max(colW[cell.col], cell.width || 0, minOuter);
          continue;
        }
        let sum = 0;
        for (let col = 0; col < span; col++) sum += colW[cell.col + col] || 0;
        if (minOuter > sum) colW[cell.col + span - 1] += minOuter - sum;
      }
      const gap = table.cellSpacing || 0;
      const colX = [0];
      for (let col = 0; col < cols; col++) colX.push(colX[col] + (colW[col] || 0) + (col + 1 < cols ? gap : 0));
      const measured = cells.map((cell, index) => {
        const span = cell.colSpan || 1;
        let outerW = 0;
        for (let col = 0; col < span; col++) outerW += colW[cell.col + col] || 0;
        if (!outerW) outerW = cell.width || 0;
        const pad = shrinkHorizontal(pads[index], outerW);
        const innerW = Math.max(200, outerW - pad.left - pad.right);
        const content = contentHeight(cell.paragraphs, innerW);
        let need = content + pad.top + pad.bottom;
        const stored = cell.height || 0;
        if (stored > 0 && pad.top + pad.bottom >= stored && content <= stored) {
          const scale = stored * 0.5 / (pad.top + pad.bottom);
          pad.top *= scale;
          pad.bottom *= scale;
          need = Math.max(stored, content + pad.top + pad.bottom);
        } else {
          need = Math.max(stored, need);
        }
        return { pad, outerW, innerW, content, need };
      });
      const rowH = Array(rows).fill(0);
      cells.forEach((cell, index) => {
        if ((cell.rowSpan || 1) === 1) rowH[cell.row] = Math.max(rowH[cell.row], measured[index].need);
      });
      cells.forEach((cell, index) => {
        const span = cell.rowSpan || 1;
        if (span <= 1) return;
        let sum = 0;
        for (let row = 0; row < span; row++) sum += rowH[cell.row + row] || 0;
        if (measured[index].need > sum) rowH[cell.row + span - 1] += measured[index].need - sum;
      });
      const rowY = [0];
      for (let row = 0; row < rows; row++) rowY.push(rowY[row] + (rowH[row] || 0) + (row + 1 < rows ? gap : 0));
      const totalW = colX[cols] || 0;
      const totalH = rowY[rows] || 0;
      if (totalW > (Number(host.dataset.w) || 0)) host.dataset.w = String(totalW);
      if (totalH > (Number(host.dataset.h) || 0)) host.dataset.h = String(totalH);
      cells.forEach((cell, index) => {
        const spanC = cell.colSpan || 1;
        const spanR = cell.rowSpan || 1;
        let spanW = 0;
        let spanH = 0;
        for (let col = 0; col < spanC; col++) spanW += colW[cell.col + col] || 0;
        for (let row = 0; row < spanR; row++) spanH += rowH[cell.row + row] || 0;
        if (spanC > 1) spanW += gap * (spanC - 1);
        if (spanR > 1) spanH += gap * (spanR - 1);
        const info = measured[index];
        const slack = Math.max(0, spanH - info.pad.top - info.pad.bottom - info.content);
        const shift = cell.vertAlign === "CENTER" ? slack / 2 : cell.vertAlign === "BOTTOM" ? slack : 0;
        const node = document.createElement("div");
        node.className = "obj nested cell";
        node.dataset.local = "1";
        node.dataset.x = String(colX[cell.col] || 0);
        node.dataset.y = String(rowY[cell.row] || 0);
        node.dataset.w = String(spanW || info.outerW || 0);
        node.dataset.h = String(spanH || info.need || 0);
        applyBorderFill(node, cell.borderFillId);
        const cellState = { y: 0 };
        for (const para of cell.paragraphs ?? []) {
          layoutInnerParagraph(node, para, info.pad.left, info.pad.top + shift, info.innerW, cellState);
        }
        host.append(node);
      });
    }

    async function readZipEntry(bytes, id) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      let offset = 0;
      const decoder = new TextDecoder();
      while (offset + 30 < bytes.length) {
        if (view.getUint32(offset, true) !== 0x04034b50) break;
        const method = view.getUint16(offset + 8, true);
        const compSize = view.getUint32(offset + 18, true);
        const nameLen = view.getUint16(offset + 26, true);
        const extraLen = view.getUint16(offset + 28, true);
        const name = decoder.decode(bytes.subarray(offset + 30, offset + 30 + nameLen));
        const start = offset + 30 + nameLen + extraLen;
        const file = name.split("/").pop() ?? "";
        const stem = file.replace(/\.[^.]+$/, "");
        if (stem === id || file === id) {
          const packed = bytes.slice(start, start + compSize);
          if (method === 0) return packed;
          if (method !== 8) return null;
          const stream = new Blob([packed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
          return new Uint8Array(await new Response(stream).arrayBuffer());
        }
        offset = start + compSize;
      }
      return null;
    }

    function ensureImage(id) {
      if (!id) return Promise.resolve(null);
      if (images[id]) return Promise.resolve(images[id]);
      const pending = imageLoads.get(id);
      if (pending) return pending;
      const load = (async () => {
        if (!fileBytes) return null;
        try {
          const data = await readZipEntry(fileBytes, id);
          if (!data) return null;
          let type = "application/octet-stream";
          if (data[0] === 0x42 && data[1] === 0x4d) type = "image/bmp";
          else if (data[0] === 0xff && data[1] === 0xd8) type = "image/jpeg";
          else if (data[0] === 0x89 && data[1] === 0x50) type = "image/png";
          const url = URL.createObjectURL(new Blob([data], { type }));
          images[id] = url;
          return url;
        } catch (error) {
          console.warn("image", id, error);
          return null;
        }
      })();
      imageLoads.set(id, load);
      return load;
    }

    function charHeight(id) {
      const shapes = parsed?.header?.charShapes ?? [];
      const found = shapes.find((shape) => shape.id === id) ?? shapes[id];
      const height = found?.height || 1000;
      return found?.superscript || found?.subscript ? height * 7 / 10 : height;
    }

    function textWidth(text) {
      let width = 0;
      for (const ch of text) {
        const cp = ch.codePointAt(0);
        width += ch === " " || cp < 128 ? 500 : 970;
      }
      return width;
    }

    function freeIntervals(y, pitch, content, objects) {
      let free = [[content.left, content.left + content.width]];
      for (const obj of objects) {
        const wrap = obj.placement.textWrap;
        if (wrap !== "SQUARE" && wrap !== "TOP_AND_BOTTOM") continue;
        if (y + pitch <= obj.y || y >= obj.y + obj.h) continue;
        if (wrap === "TOP_AND_BOTTOM") return [];
        const next = [];
        for (const [left, right] of free) {
          if (obj.x + obj.w <= left || obj.x >= right) {
            next.push([left, right]);
            continue;
          }
          if (obj.x > left) next.push([left, obj.x]);
          if (obj.x + obj.w < right) next.push([obj.x + obj.w, right]);
        }
        free = next.filter(([left, right]) => right - left >= 1000);
      }
      return free;
    }

    function sheetSlot() {
      return document.getElementById("sheetSlot");
    }

    function mountSheet(node) {
      const slot = sheetSlot();
      if (slot) slot.replaceChildren(node);
      else preview.replaceChildren(node);
    }

    function applyCompare() {
      const slot = sheetSlot();
      const opacity = Number(document.getElementById("opacity")?.value ?? 100);
      if (slot) slot.style.opacity = String(opacity / 100);
    }

    function paragraphChars(para) {
      const chars = [];
      for (const run of para.runs ?? []) {
        const em = charHeight(run.charShapeId);
        for (const item of run.items ?? []) {
          if (!item.text) continue;
          for (const ch of item.text) chars.push({ ch, em });
        }
      }
      return chars;
    }

    function fillLineSpans(line, chars) {
      if (!chars.length) {
        const span = document.createElement("span");
        span.dataset.em = "1000";
        line.append(span);
        return 1000;
      }
      let text = "";
      let em = chars[0].em;
      const flush = () => {
        const span = document.createElement("span");
        span.dataset.em = String(em);
        span.textContent = text;
        line.append(span);
        text = "";
      };
      for (const item of chars) {
        if (text && item.em !== em) {
          flush();
          em = item.em;
        }
        text += item.ch;
      }
      if (text) flush();
      return em;
    }

    function objectHost(placement) {
      if (placement.vertRelTo === "PARA" || placement.horzRelTo === "PARA") return "para";
      if (placement.vertRelTo === "PAPER" || placement.horzRelTo === "PAPER") return "paper";
      return "page";
    }

    function paperAxis(rel, align, offset, obj, axis, page, content, paraY, paraH) {
      const paperSize = axis === "x" ? page.width : page.height;
      const origin = axis === "x" ? content.left : content.top;
      const size = axis === "x" ? content.width : content.height;
      const fallback = axis === "y" ? "TOP" : "LEFT";
      if (rel === "PAPER") return aligned(align || fallback, 0, paperSize, obj, offset || 0);
      if (rel === "PARA") {
        const ref = axis === "x" ? content.width : Math.max(paraH, obj);
        const local = aligned(align || fallback, 0, ref, obj, offset || 0);
        return origin + (axis === "y" ? paraY : 0) + local;
      }
      return origin + aligned(align || fallback, 0, size, obj, offset || 0);
    }

    let scenePages = [];

    function renderSceneNode(node, root) {
      const el = node.kind === "paragraph" ? document.createElement("p") : document.createElement("div");
      el.className = node.kind;
      if (node.kind === "paragraph") el.classList.add("para");
      if (node.kind === "line") el.classList.add("line");
      if (node.kind === "object") el.classList.add("obj");
      if (node.role) el.classList.add(node.role);
      el.dataset.x = String(node.x || 0);
      el.dataset.y = String(node.y || 0);
      el.dataset.w = String(node.width || 0);
      el.dataset.h = String(node.height || 0);
      if (!root) el.dataset.local = "1";
      if (node.zOrder != null && (node.kind === "object" || node.kind === "cell")) {
        el.dataset.z = String(node.zOrder);
      }
      if (node.treatAsChar) el.dataset.char = "1";
      if (node.textWrap) el.dataset.wrap = node.textWrap;
      if (node.fillColor) el.dataset.fill = node.fillColor;
      if (node.border) el.dataset.border = JSON.stringify(node.border);
      if (node.align && (node.kind === "paragraph" || node.kind === "line")) el.dataset.align = node.align;
      if (node.kind === "paragraph" || node.kind === "object") {
        if (node.marginLeft) el.dataset.marginLeft = String(node.marginLeft);
        if (node.marginRight) el.dataset.marginRight = String(node.marginRight);
        if (node.marginTop) el.dataset.marginTop = String(node.marginTop);
        if (node.marginBottom) el.dataset.marginBottom = String(node.marginBottom);
      }
      if (node.lastLine) el.dataset.last = "1";
      if (node.kind === "line") {
        el.dataset.em = String(node.textHeight || node.fontSize || 1000);
        const paintRun = (span, piece) => {
          span.dataset.em = String(piece.fontSize || node.fontSize || 1000);
          span.dataset.font = piece.font || "";
          span.dataset.ratio = String(piece.ratio ?? 100);
          span.dataset.spacing = String(piece.spacing ?? 0);
          span.dataset.offset = String(piece.charOffset || 0);
          if (piece.color) span.style.color = piece.color;
          const band = piece.markpen || (piece.shade && piece.shade !== "none" ? piece.shade : "");
          if (piece.bold) span.style.fontWeight = "700";
          if (piece.italic) span.style.fontStyle = "italic";
          const deco = [];
          if (piece.underline === "TOP") deco.push("overline");
          else if (piece.underline && piece.underline !== "NONE") deco.push("underline");
          if (piece.strikeout || piece.underline === "CENTER") deco.push("line-through");
          if (deco.length) span.style.textDecoration = deco.join(" ");
          if (piece.advances?.length && piece.text !== "\t") {
            span.textContent = "";
            const chars = Array.from(piece.text);
            piece.advances.forEach((width, index) => {
              const ink = piece.inks?.[index] ?? width;
              const glyph = document.createElement("span");
              glyph.className = "glyph";
              glyph.dataset.w = String(ink);
              glyph.dataset.gap = String(width - ink);
              if (band) glyph.style.background = band;
              const face = document.createElement("span");
              face.className = "glyph-ink";
              face.textContent = chars[index] ?? "";
              glyph.append(face);
              span.append(glyph);
            });
            return;
          }
          if (band) span.style.background = band;
          if (piece.text === " " && piece.width) {
            const ink = piece.inks?.[0] ?? piece.width;
            span.dataset.w = String(ink);
            span.dataset.gap = String(piece.width - ink);
            span.dataset.space = "1";
          }
          if (piece.text === "\t" && piece.width) {
            span.dataset.w = String(piece.width);
            span.dataset.tab = "1";
          }
          span.textContent = piece.text === "\t" ? "" : (piece.text || "");
        };
        const children = node.children || [];
        if (children.length) {
          children.forEach((child) => {
            if (child.kind === "span") {
              const span = document.createElement("span");
              paintRun(span, child);
              el.append(span);
            } else {
              el.append(renderSceneNode(child, false));
            }
          });
        } else if (node.text) {
          const span = document.createElement("span");
          paintRun(span, node);
          el.append(span);
        }
      }
      if (node.role === "picture") putPicture(el, { binItemId: node.binItemId });
      if (node.kind !== "line") {
        (node.children || []).forEach((child) => {
          if (child.kind === "span") return;
          el.append(renderSceneNode(child, false));
        });
      }
      return el;
    }

    let nextTurn = null;
    let paintSerial = 0;
    let scrollAnchor = null;
    // 화면 배율. 100%는 한글과 같이 96dpi로 본 용지이고, 주소와 상관없이 이 값을 쓴다.
    let screenPercent = (() => {
      const n = Number(new URLSearchParams(location.search).get("hangul"));
      return Number.isFinite(n) && n > 0 ? Math.min(800, Math.max(10, Math.round(n))) : 100;
    })();
    let fitPageMode = false;
    let fitWidthMode = false;
    let zoomFit = "";
    // 기본은 쪽을 세로로 이어 붙인 스크롤 뷰다. pageview=1 이면 한 쪽씩 보여 준다.
    const scrollView = new URLSearchParams(location.search).get("pageview") !== "1";
    const pageGapCss = 0;
    // 쪽 계산은 저장된 lineseg 로만 한다. 너비 측정은 배치 가능 칸에, 가로에서 뺀 들여쓰기를 더한다.
    const lineCacheMode = true;

    function pixelHeightForPage(pageHeightHu) {
      if (pageHeightHu > 0) {
        return Math.max(1, Math.round((pageHeightHu * 96 * screenPercent) / 100 / 7200));
      }
      return 1;
    }

    let lastNotifiedPage = -1;
    let lastNotifiedPageCount = -1;
    let lastNotifiedPercent = -1;
    let lastNotifiedFitPage = false;
    let lastNotifiedFitWidth = false;

    function resolveCurrentPageIndex(scrollY = shownScrollY, hintPage = -1, scrollX = shownScrollX) {
      const count = Math.max(scenePages.length, pages.length, pageSelect?.options?.length || 0);
      if (Number.isInteger(hintPage) && hintPage >= 0 && (!count || hintPage < count)) {
        return hintPage;
      }
      const list = lastPaint?.pages;
      if (Array.isArray(list) && list.length) {
        const viewW = Math.max(1, Number(lastPaint?.viewW) || preview?.clientWidth || 1);
        const viewH = Math.max(1, Number(lastPaint?.viewH) || preview?.clientHeight || 1);
        const centerX = (Number(scrollX) || 0) + viewW * 0.5;
        const centerY = (Number(scrollY) || 0) + viewH * 0.5;
        let bestIndex = list[0].index | 0;
        let bestDistSq = Infinity;
        for (const p of list) {
          const left = Number(p.x) || 0;
          const right = left + Math.max(0, Number(p.w) || 0);
          const top = Number(p.y) || 0;
          const bottom = top + Math.max(0, Number(p.h) || 0);
          const dx = centerX < left ? left - centerX : centerX > right ? centerX - right : 0;
          const dy = centerY < top ? top - centerY : centerY > bottom ? centerY - bottom : 0;
          const distSq = dx * dx + dy * dy;
          if (distSq === 0) return p.index | 0;
          if (distSq < bestDistSq) {
            bestDistSq = distSq;
            bestIndex = p.index | 0;
          }
        }
        return bestIndex;
      }
      if (Number.isInteger(lastPaint?.page) && lastPaint.page >= 0) return lastPaint.page;
      return Math.max(0, pageSelect?.selectedIndex | 0);
    }

    function syncViewportInfo(hintPage = -1, forceNotify = false) {
      const count = Math.max(scenePages.length, pages.length, pageSelect?.options?.length || 0);
      const index = resolveCurrentPageIndex(shownScrollY, hintPage, shownScrollX);
      if (lastPaint && Number.isInteger(index) && index >= 0) {
        lastPaint.page = index;
      }
      if (scrollView && pageSelect && index >= 0 && index < pageSelect.options.length && pageSelect.selectedIndex !== index) {
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
      if (
        forceNotify ||
        page !== lastNotifiedPage ||
        count !== lastNotifiedPageCount ||
        percent !== lastNotifiedPercent ||
        fitPageMode !== lastNotifiedFitPage ||
        fitWidthMode !== lastNotifiedFitWidth
      ) {
        lastNotifiedPage = page;
        lastNotifiedPageCount = count;
        lastNotifiedPercent = percent;
        lastNotifiedFitPage = fitPageMode;
        lastNotifiedFitWidth = fitWidthMode;
        zoomFit = fitPageMode ? "page" : (fitWidthMode ? "width" : "");
        const zoomMode = fitPageMode ? "fitPage" : (fitWidthMode ? "fitWidth" : "percent");
        const zoomLabel = fitPageMode ? "쪽 맞춤" : (fitWidthMode ? "폭 맞춤" : `${percent}%`);
        const detail = {
          page,
          pageIndex: Math.max(0, activeIndex),
          pageCount: count,
          percent,
          fit: zoomFit,
          fitPage: fitPageMode,
          fitWidth: fitWidthMode,
          zoomMode,
          zoomLabel,
          scrollX: shownScrollX | 0,
          scrollY: shownScrollY | 0,
          gridMode: lastPaint?.gridMode || "auto",
          gridCols: lastPaint?.gridCols || 1,
          gridRows: lastPaint?.gridRows || 1,
          effectiveCols: lastPaint?.effectiveCols || 1,
          rowStepY: lastPaint?.rowStepY || 0,
          pageStepY: lastPaint?.pageStepY || 0,
        };
        window.dispatchEvent(new CustomEvent("noting-page-changed", { detail }));
        window.dispatchEvent(new CustomEvent("noting-viewport-changed", { detail }));
      }
    }

    function currentZoomPercent() {
      return screenPercent;
    }

    function syncZoomInput(hintPage = -1) {
      const percent = currentZoomPercent();
      zoomFit = fitPageMode ? "page" : (fitWidthMode ? "width" : "");
      const zoomMode = fitPageMode ? "fitPage" : (fitWidthMode ? "fitWidth" : "percent");
      const zoomLabel = fitPageMode ? "쪽 맞춤" : (fitWidthMode ? "폭 맞춤" : `${percent}%`);
      const shown = zoomFit === "width" ? "폭 맞춤" : zoomFit === "page" ? "쪽 맞춤" : String(percent);
      const info = document.getElementById("zoomInfo");
      const slider = document.getElementById("zoomSlider");
      if (info && document.activeElement !== info) info.value = shown;
      if (slider && document.activeElement !== slider) slider.value = String(percent);
      const count = Math.max(scenePages.length, pages.length, pageSelect?.options?.length || 0);
      const pageIndex = Math.max(0, resolveCurrentPageIndex(shownScrollY, hintPage, shownScrollX));
      const page = pageIndex + 1;
      window.dispatchEvent(new CustomEvent("noting-zoom-changed", {
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
          gridMode: lastPaint?.gridMode || "auto",
          gridCols: lastPaint?.gridCols || 1,
          gridRows: lastPaint?.gridRows || 1,
          effectiveCols: lastPaint?.effectiveCols || 1,
          rowStepY: lastPaint?.rowStepY || 0,
          pageStepY: lastPaint?.pageStepY || 0,
        },
      }));
      syncViewportInfo(pageIndex, false);
    }

    function fitZoom(mode) {
      const fitMode = mode === "width" ? "width" : "page";
      if (sceneReady() && screenLive && scrollView) {
        void sendInput({ type: "fit", mode: fitMode });
        return;
      }
      if (sceneReady()) {
        cacheEpoch += 1;
        ++scrollSerial;
        ensureViewport();
        withView(async () => {
          const serial = scrollSerial;
          const plan = await session.view(scenePatch({ fit: fitMode }));
          if (!plan) return;
          fitPageMode = typeof plan.fitPage === "boolean" ? plan.fitPage : fitMode === "page";
          fitWidthMode = typeof plan.fitWidth === "boolean" ? plan.fitWidth : fitMode === "width";
          zoomFit = fitPageMode ? "page" : (fitWidthMode ? "width" : "");
          screenPercent = Math.min(800, Math.max(10, (plan.percent || screenPercent) | 0));
          let trustShown = false;
          if (serial === scrollSerial) {
            shownScrollX = plan.scrollX || 0;
            shownScrollY = plan.scrollY || 0;
            trustShown = true;
          }
          syncZoomInput();
          applyView(plan, false, trustShown);
          pumpView();
          notePointer(0);
        });
        return;
      }
      const index = Math.max(0, pageSelect.selectedIndex | 0);
      const node = scenePages[index] || scenePages[0];
      const widthHu = (Number(node?.width) || 0) + (Number(node?.marginLeft) || 0) + (Number(node?.marginRight) || 0);
      const heightHu = (Number(node?.height) || 0) + (Number(node?.marginTop) || 0) + (Number(node?.marginBottom) || 0);
      if (widthHu <= 0 || heightHu <= 0) return;
      const box = preview.getBoundingClientRect();
      const roomW = Math.max(1, box.width - 32);
      const roomH = Math.max(1, box.height - 32);
      const widthPercent = (roomW * 100 * 7200) / (widthHu * 96);
      const heightPercent = (roomH * 100 * 7200) / (heightHu * 96);
      applyZoomPercent(fitMode === "width" ? widthPercent : Math.min(widthPercent, heightPercent));
    }

    function applyPageGrid(rawGrid) {
      const spec = typeof rawGrid === "string" ? { mode: rawGrid } : (rawGrid || {});
      const mode = typeof spec.mode === "string" ? spec.mode : "auto";
      const cols = Math.max(1, (Number(spec.cols) | 0) || (mode === "two" ? 2 : 1));
      const rows = Math.max(1, (Number(spec.rows) | 0) || 1);
      const fit = typeof spec.fit === "boolean" ? spec.fit : (mode === "grid");
      if (!sceneReady()) return;
      if (screenLive && scrollView) {
        void sendInput({ type: "grid", mode, cols, rows, fit });
        return;
      }
      cacheEpoch += 1;
      ++scrollSerial;
      ensureViewport();
      withView(async () => {
        const serial = scrollSerial;
        const plan = await session.view(scenePatch({ grid: { mode, cols, rows, fit } }));
        if (!plan) return;
        fitPageMode = typeof plan.fitPage === "boolean" ? plan.fitPage : !!fit;
        fitWidthMode = typeof plan.fitWidth === "boolean" ? plan.fitWidth : false;
        zoomFit = fitPageMode ? "page" : (fitWidthMode ? "width" : "");
        screenPercent = Math.min(800, Math.max(10, (plan.percent || screenPercent) | 0));
        let trustShown = false;
        if (serial === scrollSerial) {
          shownScrollX = plan.scrollX || 0;
          shownScrollY = plan.scrollY || 0;
          trustShown = true;
        }
        syncZoomInput();
        applyView(plan, false, trustShown);
        pumpView();
        notePointer(0);
      });
    }

    function placeSheet(sheet, width, height) {
      const stack = document.getElementById("pageStack");
      sheet.style.flexShrink = "0";
      sheet.style.width = `${width}px`;
      sheet.style.height = `${height}px`;
      sheet.style.maxWidth = "none";
      sheet.style.maxHeight = "none";
      if (stack) {
        stack.style.width = `${width}px`;
        stack.style.height = `${height}px`;
        stack.style.maxWidth = "none";
        stack.style.maxHeight = "none";
        stack.style.flex = "0 0 auto";
      }
    }

    function fullPageCss(node) {
      const dpr = window.devicePixelRatio || 1;
      const pixelH = pixelHeightForPage(node?.height || 0);
      const pixelW = node?.width && node?.height
        ? Math.max(1, Math.round((node.width * pixelH) / node.height))
        : 1;
      return {
        dpr,
        pixelW,
        pixelH,
        cssW: Math.max(1, Math.round(pixelW / dpr)),
        cssH: Math.max(1, Math.round(pixelH / dpr)),
      };
    }

    let viewTiles = new Map();
    let viewTilePages = new Map();
    let viewCanvasNode = null;
    let screenAttached = null;
    let screenLive = false;
    let presentToken = 0;
    let viewPumping = false;
    let viewDirty = false;
    let viewEpoch = 0;
    let viewLock = Promise.resolve();
    let applyingScroll = false;
    let pinchLive = false;
    let gestureActive = false;
    let scrollOwned = false;
    let scrollSerial = 0;
    let shownScrollX = 0;
    let shownScrollY = 0;
    let presentFlight = false;
    let presentAgain = false;
    let scrollPlanFlight = false;
    let selectFollowQueued = false;
    let caretBlink = 0;
    let lastPaint = null;
    let pointerEpoch = 0;
    let selectedText = "";
    let pointerFlight = false;
    let pointerQueued = null;
    let pointerHold = null;
    let selectionMarks = [];
    let caretImage = null;

    function withView(work) {
      const run = viewLock.then(work, work);
      viewLock = run.then(() => {}, () => {});
      return run;
    }

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

    function scenePatch(extra = {}) {
      const patch = { viewport: viewportPatch(), ...extra };
      if (scrollView) {
        const pages = [];
        scenePages.forEach((node, index) => {
          if (!node?.width || !node?.height) return;
          pages.push({
            index,
            widthHu: node.width | 0,
            heightHu: node.height | 0,
            marginLeftHu: Number.isFinite(node.marginLeft) ? (node.marginLeft | 0) : undefined,
            marginRightHu: Number.isFinite(node.marginRight) ? (node.marginRight | 0) : undefined,
            marginTopHu: Number.isFinite(node.marginTop) ? (node.marginTop | 0) : undefined,
            marginBottomHu: Number.isFinite(node.marginBottom) ? (node.marginBottom | 0) : undefined,
          });
        });
        if (pages.length) {
          patch.pages = pages;
          patch.gap = Math.round(pageGapCss * patch.viewport.dpr);
          // 핀치 중 배율을 다시 넣으면 코어가 제스처를 놓는다.
          if (!pinchLive && !fitPageMode && !fitWidthMode && !patch.fit && !patch.grid?.fit) patch.zoom = screenPercent;
        }
        return patch;
      }
      const index = pageSelect.selectedIndex;
      const node = index >= 0 ? scenePages[index] : null;
      if (node?.width && node?.height) {
        patch.page = {
          index,
          widthHu: node.width | 0,
          heightHu: node.height | 0,
          marginLeftHu: Number.isFinite(node.marginLeft) ? (node.marginLeft | 0) : undefined,
          marginRightHu: Number.isFinite(node.marginRight) ? (node.marginRight | 0) : undefined,
          marginTopHu: Number.isFinite(node.marginTop) ? (node.marginTop | 0) : undefined,
          marginBottomHu: Number.isFinite(node.marginBottom) ? (node.marginBottom | 0) : undefined,
        };
        if (!pinchLive && !fitPageMode && !fitWidthMode && !patch.fit && !patch.grid?.fit) patch.zoom = screenPercent;
      }
      return patch;
    }

    function scrollPatch() {
      if (!scrollView || pinchLive) return {};
      return { scroll: { x: shownScrollX, y: shownScrollY } };
    }

    function sceneReady() {
      if (scrollView) return scenePages.some((node) => node?.width && node?.height);
      const index = pageSelect.selectedIndex;
      return index >= 0 && !!scenePages[index]?.width && !!scenePages[index]?.height;
    }

    function sheetRects(plan) {
      if (scrollView && plan?.pages?.length) {
        const scrollX = plan.scrollX | 0;
        const scrollY = plan.scrollY | 0;
        return plan.pages.map((page) => ({
          index: page.index | 0,
          x: (page.x | 0) - scrollX,
          y: (page.y | 0) - scrollY,
          w: page.w | 0,
          h: page.h | 0,
        }));
      }
      return [{
        index: pageSelect.selectedIndex,
        x: plan?.paperX || 0,
        y: plan?.paperY || 0,
        w: plan?.paperW || 0,
        h: plan?.paperH || 0,
      }];
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

    function placeThumb(bar, scroll, maxScroll, vertical) {
      if (!bar?.visible) return bar;
      const travel = Math.max(0, (vertical ? bar.h - bar.thumbH : bar.w - bar.thumbW) | 0);
      const along = maxScroll > 0 ? Math.round((scroll / maxScroll) * travel) : 0;
      if (vertical) return { ...bar, thumbY: (bar.y | 0) + along };
      return { ...bar, thumbX: (bar.x | 0) + along };
    }

    function withThumbs(plan, scrollX, scrollY) {
      if (!plan?.barY && !plan?.barX) return plan;
      return {
        ...plan,
        barX: placeThumb(plan.barX, scrollX, plan.maxScrollX | 0, false),
        barY: placeThumb(plan.barY, scrollY, plan.maxScrollY | 0, true),
      };
    }

    function barAt(dx, dy) {
      const plan = lastPaint;
      if (!plan) return null;
      const hit = (bar, vertical) => {
        if (!bar?.visible || bar.w <= 0 || bar.h <= 0) return null;
        if (dx < bar.x || dy < bar.y || dx >= bar.x + bar.w || dy >= bar.y + bar.h) return null;
        const onThumb = dx >= bar.thumbX && dy >= bar.thumbY && dx < bar.thumbX + bar.thumbW && dy < bar.thumbY + bar.thumbH;
        return { vertical, bar, onThumb };
      };
      return hit(plan.barY, true) || hit(plan.barX, false);
    }

    function attachViewSurface(canvas) {
      if (screenAttached) return screenAttached;
      if (typeof canvas.transferControlToOffscreen !== "function") {
        logError("attachViewSurface", "canvas.transferControlToOffscreen 미지원");
        screenLive = false;
        screenAttached = Promise.resolve(false);
        return screenAttached;
      }
      let offscreen;
      try {
        offscreen = canvas.transferControlToOffscreen();
      } catch (error) {
        logError("transferControlToOffscreen", error);
        screenLive = false;
        screenAttached = Promise.resolve(false);
        return screenAttached;
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
        if (!screenLive) restoreMainCanvas();
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
      presentToken += 1;
      if (caretBlink) {
        clearInterval(caretBlink);
        caretBlink = 0;
      }
      selectionMarks = [];
      caretImage = null;
      viewTiles.clear();
      viewTilePages.clear();
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

    function storeTile(id, frame, page) {
      if (Number.isInteger(page)) viewTilePages.set(id, page);
      if (frame?.kept) {
        if ((frame.width | 0) > 0 && (frame.height | 0) > 0) viewTiles.set(id, { kept: true });
        else viewTiles.delete(id);
        return;
      }
      const width = frame?.width | 0;
      const height = frame?.height | 0;
      if (width <= 0 || height <= 0) {
        viewTiles.delete(id);
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const pixels = new Uint8ClampedArray(frame.pixels);
      if (pixels.length === width * height * 4) {
        canvas.getContext("2d").putImageData(new ImageData(pixels, width, height), 0, 0);
      }
      viewTiles.set(id, canvas);
      if (Number.isInteger(page)) viewTilePages.set(id, page);
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

    function visiblePageIndexes(plan) {
      const pages = plan?.pages || [];
      const y0 = plan.scrollY | 0;
      const y1 = y0 + (plan.viewH | 0);
      const indexes = [];
      for (const page of pages) {
        const top = page.y | 0;
        const bottom = top + (page.h | 0);
        if (bottom > y0 && top < y1) indexes.push(page.index | 0);
      }
      return indexes;
    }

    function paintLineMarks(ctx, plan) {
      const dpr = plan.dpr || 1;
      ctx.save();
      ctx.lineWidth = Math.max(1, dpr);
      for (const sheet of sheetRects(plan)) {
        const page = scenePages[sheet.index];
        const marks = paintedMarks(lineMarks.get(sheet.index + 1));
        if (!page?.width || !page?.height || !marks.length) continue;
        const sx = sheet.w / page.width;
        const sy = sheet.h / page.height;
        ctx.save();
        ctx.beginPath();
        ctx.rect(sheet.x, sheet.y, sheet.w, sheet.h);
        ctx.clip();
        const pageNo = sheet.index + 1;
        for (const mark of marks) {
          const picked = pickedMark === `${pageNo}:${mark.key}`;
          ctx.fillStyle = picked ? "rgba(214, 28, 28, 0.42)" : mark.warn ? "rgba(255, 170, 40, 0.32)" : "rgba(32, 112, 210, 0.12)";
          ctx.strokeStyle = picked ? "rgba(150, 0, 0, 0.95)" : mark.warn ? "rgba(186, 92, 0, 0.9)" : "rgba(20, 78, 160, 0.85)";
          const left = sheet.x + mark.x * sx;
          const top = sheet.y + mark.y * sy;
          const width = Math.max(1, mark.w * sx);
          const height = Math.max(1, mark.h * sy);
          ctx.fillRect(left, top, width, height);
          ctx.strokeRect(left + 0.5, top + 0.5, Math.max(0, width - 1), Math.max(0, height - 1));
        }
        ctx.restore();
      }
      ctx.restore();
    }

    function paintDebugOverlay(plan) {
      const slot = sheetSlot();
      if (!slot) return;
      let el = document.getElementById("viewDebug");
      const hasMarks = sheetRects(plan).some((sheet) => paintedMarks(lineMarks.get(sheet.index + 1)).length > 0);
      if (!hasMarks) {
        if (el instanceof HTMLCanvasElement && el.width > 0 && el.height > 0) {
          el.getContext("2d")?.clearRect(0, 0, el.width, el.height);
        }
        return;
      }
      if (!(el instanceof HTMLCanvasElement)) {
        el = document.createElement("canvas");
        el.id = "viewDebug";
        el.className = "view-canvas";
        el.style.zIndex = "3";
        el.style.pointerEvents = "none";
        slot.append(el);
      }
      const dpr = plan.dpr || 1;
      if (el.width !== plan.viewW || el.height !== plan.viewH) {
        el.width = plan.viewW;
        el.height = plan.viewH;
      }
      el.style.width = `${plan.viewW / dpr}px`;
      el.style.height = `${plan.viewH / dpr}px`;
      const ctx = el.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, el.width, el.height);
      paintLineMarks(ctx, plan);
    }

    function paintView(plan, alreadyPresented = false, restartCaret = false) {
      const canvas = document.getElementById("viewCanvas");
      if (!(canvas instanceof HTMLCanvasElement) || !plan?.viewW || !plan?.viewH) return;
      const dpr = plan.dpr || 1;
      canvas.style.width = `${plan.viewW / dpr}px`;
      canvas.style.height = `${plan.viewH / dpr}px`;
      if (screenLive) {
        canvas.style.transform = "";
        const debug = document.getElementById("viewDebug");
        if (debug instanceof HTMLCanvasElement) {
          debug.getContext("2d")?.clearRect(0, 0, debug.width, debug.height);
          debug.style.transform = "";
        }
        const caret = document.getElementById("viewCaret");
        if (caret) caret.hidden = true;
        return;
      }
      if (canvas.width !== plan.viewW || canvas.height !== plan.viewH) {
        canvas.width = plan.viewW;
        canvas.height = plan.viewH;
      }
      const ctx = canvas.getContext("2d");
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const sheets = sheetRects(plan);
      ctx.fillStyle = "#fff";
      for (const sheet of sheets) {
        if (sheet.w > 0 && sheet.h > 0) ctx.fillRect(sheet.x, sheet.y, sheet.w, sheet.h);
      }
      const items = [...(plan.draw || [])].sort((a, b) => {
        const an = a.nearest ? 0 : 1;
        const bn = b.nearest ? 0 : 1;
        if (an !== bn) return an - bn;
        return (a.layer | 0) - (b.layer | 0);
      });
      for (const item of items) {
        const tile = viewTiles.get(item.id);
        if (!(tile instanceof HTMLCanvasElement)) continue;
        ctx.imageSmoothingEnabled = !item.nearest;
        ctx.drawImage(tile, item.x, item.y, item.w, item.h);
      }
      ctx.imageSmoothingEnabled = false;
      for (const mark of selectionMarks) {
        const sheet = sheets.find((item) => item.index === mark.page);
        if (!sheet?.w || !sheet?.h || !mark.pageW || !mark.pageH || !mark.canvas) continue;
        const sx = sheet.w / mark.pageW;
        const sy = sheet.h / mark.pageH;
        ctx.drawImage(mark.canvas, sheet.x + mark.x * sx, sheet.y + mark.y * sy, mark.w * sx, mark.h * sy);
      }
      paintLineMarks(ctx, plan);
      showCaret(plan);
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
    let imeComposing = false;
    let lastQueuedCompSlot = null;
    let lastComposedData = "";
    let pendingCompCommit = false;
    let compEndSeq = 0;
    let editChain = Promise.resolve();
    const editKeyMap = {
      Backspace: 1,
      Delete: 2,
      Enter: 3,
      ArrowLeft: 4,
      ArrowRight: 5,
      ArrowUp: 6,
      ArrowDown: 7,
      Home: 8,
      End: 9,
      Tab: 10,
    };

    // 화면 위 토스트(Toast.jsx). kind 는 info · saved · undo · error 다.
    function notify(text, kind = "info", action = null) {
      window.dispatchEvent(new CustomEvent("noting-toast", { detail: { text, kind, action } }));
    }

    // 상태 줄의 저장 표시. clean 은 연 그대로, dirty 는 고친 뒤 저장 전, saved 는 저장한 뒤다.
    function emitDocState(state) {
      window.dispatchEvent(new CustomEvent("noting-doc-state", { detail: { state, name: openedName } }));
    }

    function applyEditResult(result) {
      if (!result) return;
      if (result.needsFontSwap) askFontSwap();
      if (result.documentChanged) emitDocState("dirty");
      if (result.documentChanged && Array.isArray(result.pages) && result.pages.length > 0) {
        scenePages = result.pages;
        if (result.pages.length !== pages.length) {
          const prevIdx = Math.min(pageSelect.selectedIndex, result.pages.length - 1);
          pages = Array.from({ length: result.pages.length }, () => "");
          pageSelect.replaceChildren();
          pages.forEach((_, pageIndex) => {
            const option = document.createElement("option");
            option.textContent = `${pageIndex + 1}쪽`;
            pageSelect.append(option);
          });
          if (pages.length) pageSelect.selectedIndex = Math.max(0, prevIdx);
          if (status && typeof status.textContent === "string") {
            status.textContent = status.textContent.replace(/·\s*\d+페이지/, `· ${result.pages.length}페이지`);
          }
        }
      }
      if (Number.isFinite(result.scrollX) && Number.isFinite(result.scrollY)) {
        const nextX = result.scrollX | 0;
        const nextY = result.scrollY | 0;
        if (nextX !== shownScrollX || nextY !== shownScrollY) {
          placeCameraScroll(nextX, nextY, true, Number.isInteger(result.page) ? result.page : -1);
        }
      }
      applyPointerResult(result, true);
      if (result.documentChanged) {
        const epoch = ++viewEpoch;
        void Promise.resolve(screenAttached).then(async (attached) => {
          if (!attached) {
            viewTiles.clear();
            viewTilePages.clear();
            pumpView();
            return;
          }
          // 캔버스에 다시 그리는 일과 캐럿이 보이게 스크롤하는 일은 코어가 한다.
          if (screenLive) return;
          if (!result.fullInvalidation && lastPaint && Array.isArray(lastPaint.pages)) {
            let needScroll = false;
            let targetX = shownScrollX;
            let targetY = shownScrollY;
            if (result.caret && Number.isInteger(result.page) && result.page >= 0) {
              const placed = lastPaint.pages.find((item) => item.index === result.page);
              const pageSpec = scenePages[result.page];
              const viewW = lastPaint.viewW || 0;
              const viewH = lastPaint.viewH || 0;
              if (placed && pageSpec && pageSpec.width > 0 && pageSpec.height > 0 && viewW > 0 && viewH > 0) {
                const scaleX = placed.w / pageSpec.width;
                const scaleY = placed.h / pageSpec.height;
                const caretLeft = placed.x + Math.round((result.caretX || 0) * scaleX);
                const caretRight = caretLeft + Math.max(4, Math.round(scaleX * 100));
                const caretTop = placed.y + Math.round((result.caretY || 0) * scaleY);
                const caretBottom = caretTop + Math.max(4, Math.round((result.caretH || 0) * scaleY));
                const marginX = Math.min(36, Math.max(16, Math.floor(viewW / 4)));
                const marginY = Math.min(32, Math.max(16, Math.floor(viewH / 4)));
                const viewLeft = shownScrollX;
                const viewRight = viewLeft + viewW;
                const viewTop = shownScrollY;
                const viewBottom = viewTop + viewH;
                if (caretLeft < viewLeft + marginX) {
                  targetX = Math.max(0, caretLeft - marginX);
                } else if (caretRight > viewRight - marginX) {
                  targetX = Math.max(0, caretRight - viewW + marginX);
                }
                if (caretTop < viewTop + marginY) {
                  targetY = Math.max(0, caretTop - marginY);
                } else if (caretBottom > viewBottom - marginY) {
                  if (placed.y > viewTop && caretBottom - placed.y <= viewH - marginY) {
                    targetY = Math.max(0, placed.y - 16);
                  } else {
                    targetY = Math.max(0, caretBottom - viewH + marginY);
                  }
                }
                if (Math.abs(targetX - viewLeft) > 1 || Math.abs(targetY - viewTop) > 1) {
                  needScroll = true;
                }
              }
            }
            if (!needScroll) return;
            shownScrollX = targetX;
            shownScrollY = targetY;
            const plan = await withView(() =>
              session.view({ scroll: { x: shownScrollX, y: shownScrollY } })
            );
            if (epoch !== viewEpoch || !plan) return;
            applyView(plan, false, true);
            return;
          }
          let plan = await withView(() => session.view({ ...scenePatch(), ...scrollPatch() }));
          if (epoch !== viewEpoch || !plan) return;
          if (result.caret && Number.isInteger(result.page) && result.page >= 0 && Array.isArray(plan.pages)) {
            const placed = plan.pages.find((item) => item.index === result.page);
            const pageSpec = scenePages[result.page];
            if (placed && pageSpec && pageSpec.width > 0 && pageSpec.height > 0 && plan.viewW > 0 && plan.viewH > 0) {
              const scaleX = placed.w / pageSpec.width;
              const scaleY = placed.h / pageSpec.height;
              const caretLeft = placed.x + Math.round((result.caretX || 0) * scaleX);
              const caretRight = caretLeft + Math.max(4, Math.round(scaleX * 100));
              const caretTop = placed.y + Math.round((result.caretY || 0) * scaleY);
              const caretBottom = caretTop + Math.max(4, Math.round((result.caretH || 0) * scaleY));
              const marginX = Math.min(36, Math.max(16, Math.floor(plan.viewW / 4)));
              const marginY = Math.min(32, Math.max(16, Math.floor(plan.viewH / 4)));
              const viewLeft = plan.scrollX;
              const viewRight = plan.scrollX + plan.viewW;
              const viewTop = plan.scrollY;
              const viewBottom = plan.scrollY + plan.viewH;
              let targetX = plan.scrollX;
              let targetY = plan.scrollY;
              if (caretLeft < viewLeft + marginX) {
                targetX = Math.max(0, caretLeft - marginX);
              } else if (caretRight > viewRight - marginX) {
                targetX = Math.max(0, caretRight - plan.viewW + marginX);
              }
              if (caretTop < viewTop + marginY) {
                targetY = Math.max(0, caretTop - marginY);
              } else if (caretBottom > viewBottom - marginY) {
                if (placed.y > viewTop && caretBottom - placed.y <= plan.viewH - marginY) {
                  targetY = Math.max(0, placed.y - 16);
                } else {
                  targetY = Math.max(0, caretBottom - plan.viewH + marginY);
                }
              }
              if (Math.abs(targetX - plan.scrollX) > 1 || Math.abs(targetY - plan.scrollY) > 1) {
                shownScrollX = targetX;
                shownScrollY = targetY;
                plan = await withView(() =>
                  session.view({ ...scenePatch(), scroll: { x: shownScrollX, y: shownScrollY } })
                );
                if (epoch !== viewEpoch || !plan) return;
              }
            }
          }
          shownScrollX = plan.scrollX || 0;
          shownScrollY = plan.scrollY || 0;
          applyView(plan, false, true);
        });
      }
    }

    function queueEdit(task) {
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
      if (editorInput instanceof HTMLTextAreaElement && editorInput.isConnected) return editorInput;
      const el = document.createElement("textarea");
      el.id = "viewEditorInput";
      el.setAttribute("autocapitalize", "off");
      el.setAttribute("autocomplete", "off");
      el.setAttribute("autocorrect", "off");
      el.setAttribute("spellcheck", "false");
      el.setAttribute("aria-hidden", "true");
      el.tabIndex = -1;
      el.style.cssText =
        "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;z-index:-1;padding:0;border:0;outline:none;resize:none;overflow:hidden;white-space:pre;";
      el.addEventListener("compositionstart", () => {
        imeComposing = true;
        lastQueuedCompSlot = null;
        lastComposedData = "";
      });
      el.addEventListener("compositionupdate", (event) => {
        imeComposing = true;
        const data = event.data ?? "";
        lastComposedData = data;
        if (lastQueuedCompSlot && !lastQueuedCompSlot.started) {
          lastQueuedCompSlot.data = data;
          return;
        }
        const slot = { data, started: false, commitFirst: pendingCompCommit };
        pendingCompCommit = false;
        lastQueuedCompSlot = slot;
        void queueEdit(async () => {
          slot.started = true;
          if (lastQueuedCompSlot === slot) lastQueuedCompSlot = null;
          if (slot.commitFirst) {
            await session.editCommit();
          }
          return session.editText(slot.data, true);
        });
      });
      el.addEventListener("compositionend", (event) => {
        const wasComposing = imeComposing;
        imeComposing = false;
        lastQueuedCompSlot = null;
        const endData = event.data ?? "";
        const prevComposed = lastComposedData;
        lastComposedData = "";
        el.value = "";
        if (!wasComposing) return;
        pendingCompCommit = true;
        const seq = ++compEndSeq;
        queueMicrotask(() => {
          if (seq !== compEndSeq || !pendingCompCommit) return;
          pendingCompCommit = false;
          if (imeComposing) return;
          if (endData === prevComposed) {
            void queueEdit(() => session.editCommit());
          } else {
            void queueEdit(() => session.editText(endData, false));
          }
        });
      });
      el.addEventListener("input", (event) => {
        if (
          event.isComposing ||
          imeComposing ||
          event.inputType === "insertCompositionText" ||
          event.inputType === "deleteCompositionText"
        ) {
          return;
        }
        lastQueuedCompSlot = null;
        if (event.inputType === "insertLineBreak" || event.inputType === "insertParagraph") {
          el.value = "";
          return;
        }
        const data = event.data ?? el.value;
        el.value = "";
        if (data) {
          const commitFirst = pendingCompCommit;
          pendingCompCommit = false;
          void queueEdit(async () => {
            if (commitFirst) await session.editCommit();
            return session.editText(data, false);
          });
        }
      });
      el.addEventListener("keydown", (event) => {
        if (event.isComposing || imeComposing || event.keyCode === 229) {
          if (event.key === "Enter") {
            event.preventDefault();
            imeComposing = false;
            lastQueuedCompSlot = null;
            lastComposedData = "";
            pendingCompCommit = false;
            el.value = "";
            const shift = !!event.shiftKey;
            void queueEdit(async () => {
              await session.editCommit();
              return session.editKey(3, shift, false, false);
            });
          }
          return;
        }
        lastQueuedCompSlot = null;
        if ((event.key === "c" || event.key === "C") && (event.ctrlKey || event.metaKey) && !event.altKey) {
          if (selectedText) {
            event.preventDefault();
            copySelectedText(selectedText);
          }
          return;
        }
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        // Esc 는 편집 입력칸에 있을 때만 코어로 보낸다(Shift+Esc 는 머리말·꼬리말 편집 끝내기). 대화 상자의 Esc 는 건드리지 않는다.
        const code = event.key === "Escape" ? 11 : editKeyMap[event.key];
        if (!code) return;
        event.preventDefault();
        el.value = "";
        void queueEdit(() => session.editKey(code, !!event.shiftKey, !!event.ctrlKey, !!event.altKey));
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
      window.__notingCursorStyle = cursorStyle;
      window.dispatchEvent(
        new CustomEvent("noting-cursor-style-changed", {
          detail: cursorStyle,
        }),
      );
      if (cursorStyle.caret) window.dispatchEvent(new CustomEvent("noting-caret-status", { detail: cursorStyle.caret }));
    }

    function normalizeFormatPatch(raw, defaultKey = null) {
      if (raw == null) return null;
      if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
        return defaultKey ? { [defaultKey]: raw } : null;
      }
      if (typeof raw !== "object") return null;
      const src = raw.patch && typeof raw.patch === "object" ? raw.patch : raw;
      const out = {};
      if (Number.isFinite(Number(src.styleId))) out.styleId = Number(src.styleId) | 0;
      if (typeof src.align === "string" && src.align) out.align = src.align.trim().toUpperCase();
      if (typeof src.lineSpacingType === "string" && src.lineSpacingType) {
        out.lineSpacingType = src.lineSpacingType.trim().toUpperCase();
      }
      if (Number.isFinite(Number(src.lineSpacing))) {
        out.lineSpacing = Math.max(1, Math.round(Number(src.lineSpacing)));
      }
      if (typeof src.font === "string" && src.font.trim()) out.font = src.font.trim();
      if (Number.isFinite(Number(src.fontSize))) {
        out.fontSize = Math.max(1, Math.round(Number(src.fontSize)));
      } else if (Number.isFinite(Number(src.fontSizePt))) {
        out.fontSize = Math.max(1, Math.round(Number(src.fontSizePt) * 100));
      }
      if (typeof src.bold === "boolean") out.bold = src.bold;
      if (typeof src.italic === "boolean") out.italic = src.italic;
      if (typeof src.underline === "boolean") out.underline = src.underline;
      if (typeof src.underlineType === "string" && src.underlineType) {
        out.underlineType = src.underlineType.trim().toUpperCase();
      }
      if (typeof src.strikeout === "boolean") out.strikeout = src.strikeout;
      if (typeof src.color === "string" && src.color.trim()) out.color = src.color.trim();
      // 대화 상자의 나머지 값은 이름 그대로 넘긴다. 이름과 단위는 코어가 정한다.
      for (const [key, value] of Object.entries(src)) {
        if (key in out || key === "patch" || key === "fontSizePt") continue;
        if (typeof value === "boolean" || typeof value === "string" || (typeof value === "number" && Number.isFinite(value))) {
          out[key] = value;
        }
      }
      return Object.keys(out).length > 0 ? out : null;
    }

    function applyFormatPatch(raw, defaultKey = null) {
      const patch = normalizeFormatPatch(raw, defaultKey);
      if (!patch) return Promise.resolve(null);
      return queueEdit(async () => {
        if (typeof patch.font === "string" && patch.font && !loadedFaces.has(patch.font)) {
          try {
            await receiveFonts([patch.font]);
            loadedFaces.add(patch.font);
          } catch {
            // 글꼴 파일이 없으면 대체 글꼴로 조판한다.
          }
        }
        return session.editStyle(patch);
      });
    }

    window.__notingApplyStyle = applyFormatPatch;
    // 글자 모양·문단 모양 대화 상자가 열릴 때 지금 자리의 값을 받는다.
    window.__notingFormatFields = async () => {
      await coreReady;
      return session.formatFields();
    };
    for (const eventName of [
      "noting-format",
      "noting-style",
      "noting-cursor-style",
      "noting-para-shape",
      "noting-char-shape",
    ]) {
      window.addEventListener(eventName, (event) => {
        void applyFormatPatch(event?.detail);
      });
    }
    window.addEventListener("noting-align", (event) => {
      void applyFormatPatch(event?.detail, "align");
    });
    window.addEventListener("noting-focus-editor", () => focusEditorInput());

    // 라이선스로 막힌 글꼴이 있으면 코어가 편집을 받지 않는다(needsFontSwap). 바꿀지 묻고, 바꾸면 한꺼번에 바꾼다.
    let fontSwapAsking = false;
    function askFontSwap() {
      if (fontSwapAsking) return;
      fontSwapAsking = true;
      // 조합 중이던 글자는 코어에 들어가지 않았다. 입력 칸을 비워 대화 상자 뒤로 남지 않게 한다.
      if (editorInput) {
        imeComposing = false;
        lastQueuedCompSlot = null;
        editorInput.value = "";
        editorInput.blur();
      }
      void session.licenseFontSwaps().then((swaps) => {
        if (!Array.isArray(swaps) || !swaps.length) {
          fontSwapAsking = false;
          return;
        }
        window.dispatchEvent(new CustomEvent("noting-font-swap-ask", { detail: { swaps } }));
      }, (error) => {
        fontSwapAsking = false;
        logError("licenseFontSwaps", error);
      });
    }
    // detail.chosen 은 대화 상자에서 고른 {막힌 글꼴: 바꿀 글꼴}이다. 고를 수 있는 글꼴인지는 코어가 다시 본다.
    window.addEventListener("noting-font-swap-apply", (event) => {
      const chosen = event?.detail?.chosen && typeof event.detail.chosen === "object" ? event.detail.chosen : {};
      void queueEdit(async () => {
        const swaps = await session.licenseFontSwaps();
        const targets = [...new Set((swaps || []).map((swap) => chosen[swap.from] || swap.to).filter(Boolean))];
        const missing = targets.filter((face) => !loadedFaces.has(face));
        if (missing.length) {
          try {
            await receiveFonts(missing);
            for (const face of missing) loadedFaces.add(face);
          } catch {
            // 글꼴 파일을 못 받으면 대체 글꼴로 조판한다.
          }
        }
        return session.editSwapFonts(chosen);
      }).then((result) => {
        if (result?.cursorStyle) emitCursorStyle(result.cursorStyle);
      }, (error) => logError("editSwapFonts", error)).finally(() => {
        fontSwapAsking = false;
        focusEditorInput();
      });
    });
    window.addEventListener("noting-font-swap-cancel", () => {
      fontSwapAsking = false;
      focusEditorInput();
    });

    function applyPointerResult(result, restartCaret) {
      appendEvent(result?.event);
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
        window.dispatchEvent(new CustomEvent("noting-selection-menu", {
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
      if (action === "cut" || action === "delete") {
        if (!selectedText) return;
        if (action === "cut") copySelectedText(selectedText);
        void queueEdit(() => session.editKey(editKeyMap.Backspace, false, false, false));
        return;
      }
      if (action === "paste") {
        const read = navigator.clipboard?.readText;
        if (!read) return;
        void read.call(navigator.clipboard).then((text) => {
          if (text) void queueEdit(() => session.editText(text, false));
        }).catch((error) => logError("paste", error));
      }
    }
    window.addEventListener("noting-selection-action", (event) => selectionAction(event.detail?.action));
    // 리본의 머리말·꼬리말 닫기. 입력칸의 Shift+Esc 와 같은 길이다.
    window.addEventListener("noting-leave-band", () => {
      focusEditorInput();
      void queueEdit(() => session.editKey(11, true, false, false));
    });

    function notePointer(kind, clientX, clientY, fromScroll = false) {
      if (kind === 4) {
        pointerEpoch += 1;
        pointerQueued = {
          kind: 4, page: -1, x: 0, y: 0, percent: screenPercent, epoch: pointerEpoch, restart: false, release: false,
        };
      } else if (kind === 3 && pointerQueued && (pointerQueued.kind === 1 || pointerQueued.kind === 2)) {
        if (pointerQueued.kind === 2) {
          const point = paperHu(clientX, clientY);
          if (point) {
            pointerQueued.page = point.page;
            pointerQueued.x = point.x;
            pointerQueued.y = point.y;
          }
        }
        pointerQueued.release = true;
        return;
      } else if (kind === 3 && pointerQueued && pointerQueued.kind === 4) {
        return;
      } else {
        let page = -1;
        let x = 0;
        let y = 0;
        if (kind === 1 || kind === 2) {
          const point = fromScroll ? selectionPoint(clientX, clientY) : paperHu(clientX, clientY);
          if (!point) {
            if (kind === 2) return;
          } else {
            page = point.page;
            x = point.x;
            y = point.y;
          }
        }
        const release = kind === 2 && !!pointerQueued?.release;
        pointerQueued = {
          kind, page, x, y, percent: screenPercent, epoch: pointerEpoch, restart: kind === 1, release,
        };
      }
      if (!pointerFlight) void drainPointer();
    }

    async function drainPointer() {
      pointerFlight = true;
      try {
        while (pointerQueued) {
          const job = pointerQueued;
          pointerQueued = null;
          let result = null;
          try {
            result = await session.pointer(job.kind, job.page, job.x, job.y, job.percent);
          } catch {
            continue;
          }
          if (job.epoch !== pointerEpoch) continue;
          applyPointerResult(result, job.restart);
          if (job.release && job.epoch === pointerEpoch) {
            try {
              const released = await session.pointer(3, -1, 0, 0, job.percent);
              appendEvent(released?.event);
            } catch {
              // 그림은 이미 반영했다. 드래그 끝만 코어에 못 전한 것이다.
            }
          }
        }
      } finally {
        pointerFlight = false;
        if (pointerQueued) void drainPointer();
      }
    }

    function paperHu(clientX, clientY) {
      const point = viewPoint(clientX, clientY);
      if (!point) return null;
      const sheet = sheetAt(point.plan, point.dx, point.dy);
      const page = sheet ? scenePages[sheet.index] : null;
      if (!sheet || !page?.width || !page?.height) return null;
      const sx = sheet.w / page.width;
      const sy = sheet.h / page.height;
      return {
        page: sheet.index,
        x: Math.round((point.dx - sheet.x) / sx),
        y: Math.round((point.dy - sheet.y) / sy),
      };
    }

    function selectionPoint(clientX, clientY) {
      const hit = paperHu(clientX, clientY);
      if (hit) return hit;
      const point = viewPoint(clientX, clientY);
      if (!point) return null;
      const sheets = sheetRects(point.plan).filter((sheet) => sheet.w > 0 && sheet.h > 0);
      if (!sheets.length) return null;
      let sheet = sheets[0];
      let best = Infinity;
      for (const item of sheets) {
        const cx = Math.max(item.x, Math.min(point.dx, item.x + item.w));
        const cy = Math.max(item.y, Math.min(point.dy, item.y + item.h));
        const dist = (cx - point.dx) * (cx - point.dx) + (cy - point.dy) * (cy - point.dy);
        if (dist < best) {
          best = dist;
          sheet = item;
        }
      }
      const page = scenePages[sheet.index];
      if (!page?.width || !page?.height) return null;
      const dx = Math.max(sheet.x, Math.min(point.dx, sheet.x + sheet.w));
      const dy = Math.max(sheet.y, Math.min(point.dy, sheet.y + sheet.h));
      return {
        page: sheet.index,
        x: Math.round((dx - sheet.x) / (sheet.w / page.width)),
        y: Math.round((dy - sheet.y) / (sheet.h / page.height)),
      };
    }

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

    function syncCaretBlink(restart = false) {
      const armed = !!(screenLive && caretImage && lastPaint);
      if (!armed) {
        if (caretBlink) {
          clearInterval(caretBlink);
          caretBlink = 0;
        }
        return;
      }
      if (caretBlink && restart) {
        clearInterval(caretBlink);
        caretBlink = 0;
      }
      if (caretBlink) return;
      caretBlink = setInterval(() => {
        if (!screenLive || !caretImage || !lastPaint) {
          clearInterval(caretBlink);
          caretBlink = 0;
          return;
        }
        paintView(lastPaint);
      }, 530);
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
      notePointer(4);
    }

    function placePdf(plan) {
      const frame = document.querySelector(".pdf-frame");
      if (!(frame instanceof HTMLElement) || frame.hidden || !plan) return;
      const dpr = plan.dpr || 1;
      const focus = scrollView ? (plan.page ?? pageSelect.selectedIndex) : pageSelect.selectedIndex;
      if (scrollView && Array.isArray(plan.pages) && plan.pages.length > 0) {
        const page = plan.pages.find((item) => item.index === focus) || plan.pages[0];
        if (!page) return;
        const x = page.x - (plan.scrollX || 0);
        const y = page.y - (plan.scrollY || 0);
        frame.style.right = "auto";
        frame.style.bottom = "auto";
        frame.style.left = `${x / dpr}px`;
        frame.style.top = `${y / dpr}px`;
        frame.style.width = `${Math.max(1, page.w / dpr)}px`;
        frame.style.height = `${Math.max(1, page.h / dpr)}px`;
        return;
      }
      const sheets = sheetRects(plan);
      const sheet = sheets.find((item) => item.index === focus) || sheets[0];
      if (!sheet) return;
      frame.style.right = "auto";
      frame.style.bottom = "auto";
      frame.style.left = `${sheet.x / dpr}px`;
      frame.style.top = `${sheet.y / dpr}px`;
      frame.style.width = `${Math.max(1, sheet.w / dpr)}px`;
      frame.style.height = `${Math.max(1, sheet.h / dpr)}px`;
    }

    function scrollerPlace() {
      const scroller = document.getElementById("viewScroller");
      if (!scroller) return null;
      const dpr = window.devicePixelRatio || 1;
      return {
        x: Math.round(scroller.scrollLeft * dpr),
        y: Math.round(scroller.scrollTop * dpr),
      };
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
      if (scroller.clientWidth !== beforeW || scroller.clientHeight !== beforeH) viewDirty = true;
      if (!keepPlace) {
        const left = (plan.scrollX || 0) / dpr;
        const top = (plan.scrollY || 0) / dpr;
        if (Math.abs(scroller.scrollLeft - left) >= 0.5 || Math.abs(scroller.scrollTop - top) >= 0.5) {
          scroller.scrollLeft = left;
          scroller.scrollTop = top;
        }
      }
    }

    function applyView(plan, retainScroll, trustShown) {
      if (!plan) return;
      const previousPercent = lastPaint ? (lastPaint.percent | 0) : (plan.percent | 0);
      let followLive = false;
      if (!trustShown && !scrollOwned) {
        const live = scrollerPlace();
        if (live && (live.x !== shownScrollX || live.y !== shownScrollY)) {
          shownScrollX = live.x;
          shownScrollY = live.y;
          retainScroll = true;
          followLive = true;
        }
      }
      const maxX = Math.max(0, plan.maxScrollX | 0);
      const maxY = Math.max(0, plan.maxScrollY | 0);
      if ((plan.percent | 0) !== previousPercent) {
        shownScrollX = plan.scrollX | 0;
        shownScrollY = plan.scrollY | 0;
        retainScroll = false;
        trustShown = true;
      }
      shownScrollX = Math.min(maxX, Math.max(0, shownScrollX | 0));
      shownScrollY = Math.min(maxY, Math.max(0, shownScrollY | 0));
      for (const id of plan.drop || []) {
        viewTiles.delete(id);
        viewTilePages.delete(id);
      }
      const planX = plan.scrollX || 0;
      const planY = plan.scrollY || 0;
      const keepPlace = !!retainScroll || (scrollView && (shownScrollX !== planX || shownScrollY !== planY));
      const shown = keepPlace
        ? withThumbs({ ...plan, scrollX: shownScrollX, scrollY: shownScrollY }, shownScrollX, shownScrollY)
        : plan;
      lastPaint = shown;
      if (!keepPlace) {
        shownScrollX = planX;
        shownScrollY = planY;
      }
      syncViewportInfo(!keepPlace && Number.isInteger(plan.page) ? plan.page : -1);
      paintView(shown);
      placePdf(shown);
      applySpacer(plan, keepPlace);
      applyCompare();
      if (followLive) queueScrollInput(shownScrollX, shownScrollY);
    }

    let maskDragging = false;
    let maskDragTimer = 0;
    let maskMore = false;

    function noteZoomDrag() {
      maskDragging = true;
      if (maskDragTimer) clearTimeout(maskDragTimer);
      maskDragTimer = setTimeout(() => {
        maskDragTimer = 0;
        maskDragging = false;
        requestPresent();
      }, 180);
    }

    function requestPresent() {
      if (!screenLive || !screenAttached || !lastPaint?.viewW || !lastPaint?.viewH) return;
      if (presentFlight) {
        presentAgain = true;
        return;
      }
      presentFlight = true;
      const token = ++presentToken;
      void screenAttached.then(async (ok) => {
        try {
          if (!ok || token !== presentToken) return;
          while (token === presentToken && lastPaint?.viewW && lastPaint?.viewH) {
            presentAgain = false;
            maskMore = false;
            const drawn = await session.present(
              lastPaint.viewW | 0,
              lastPaint.viewH | 0,
              lastPaint.scrollX | 0,
              lastPaint.scrollY | 0,
              screenPercent | 0,
              maskDragging,
            );
            if (token !== presentToken) return;
            const shown = drawn && drawn.ok !== false && drawn !== false;
            maskMore = !!(drawn && drawn.more);
            if (!shown) console.log("[noting 오류:present] 화면을 그리지 못했습니다.");
            if (!presentAgain) break;
          }
        } catch (error) {
          logError("requestPresent", error);
        } finally {
          presentFlight = false;
          if (presentAgain && token === presentToken) {
            presentAgain = false;
            requestPresent();
          } else {
            presentAgain = false;
            if (maskMore && token === presentToken) {
              requestAnimationFrame(() => {
                if (token === presentToken) requestPresent();
              });
            }
          }
        }
      });
    }

    function scheduleSelectFollow() {
      if (!pointerHold || selectFollowQueued) return;
      selectFollowQueued = true;
      requestAnimationFrame(() => {
        selectFollowQueued = false;
        if (!pointerHold) return;
        pointerHold.drag = true;
        notePointer(2, pointerHold.x, pointerHold.y, true);
      });
    }

    function shiftLastPaint(dx, dy) {
      if (!lastPaint || (!dx && !dy)) return;
      const plan = {
        ...lastPaint,
        scrollX: (lastPaint.scrollX || 0) + dx,
        scrollY: (lastPaint.scrollY || 0) + dy,
        paperX: (lastPaint.paperX || 0) - dx,
        paperY: (lastPaint.paperY || 0) - dy,
        draw: (lastPaint.draw || []).map((item) => ({ ...item, x: item.x - dx, y: item.y - dy })),
      };
      lastPaint = plan;
      paintView(plan);
      placePdf(plan);
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
      if (!screenLive) {
        shiftLastPaint(dx, dy);
        requestPresent();
      } else {
        lastPaint = withThumbs({ ...lastPaint, scrollX: x, scrollY: y }, x, y);
        placePdf(lastPaint);
      }
      syncViewportInfo();
      queueScrollInput(x, y);
      scheduleSelectFollow();
    }

    function logNext(turn, message) {
      if (!turn) return;
      pushRow("render", turn.page, `다음 ${turn.page}쪽 ${message} +${(Date.now() - turn.at).toFixed(1)}ms`);
    }
    function logTime(label, started, page) {
      pushRow("render", page, `${label} ${(Date.now() - started).toFixed(1)}ms`);
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
      },
      end(error) {
        if (this.done) return;
        this.done = true;
        const head = {
          idx: 0,
          문서: this.name,
          시작: 0,
          ms: Number((Date.now() - this.at).toFixed(1)),
        };
        if (error) head.오류 = String(error?.message || error);
        appendLog([head, ...this.steps]);
      },
    };
    const glyphWarmed = new Set();
    const framesReady = new Map();
    const baseReady = new Set();
    let cacheEpoch = 0;
    let glyphsReady = false;
    let glyphChain = Promise.resolve();
    let glyphEpoch = 0;
    let surroundToken = 0;

    function resetGlyphWarm() {
      glyphEpoch += 1;
      glyphsReady = false;
      glyphWarmed.clear();
      loadedFaces.clear();
      framesReady.clear();
      baseReady.clear();
      cacheEpoch += 1;
      surroundToken += 1;
      glyphChain = Promise.resolve();
    }

    const loadedFaces = new Set();

    function openingPageIndex(count) {
      const raw = new URLSearchParams(location.search).get("page");
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 1 || count <= 0) return 0;
      return Math.min(count - 1, (n | 0) - 1);
    }

    async function visiblePages() {
      const plan = await withView(() => session.view({ ...scenePatch(), ...scrollPatch() }));
      const indexes = plan ? visiblePageIndexes(plan) : [];
      if (indexes.length) return indexes;
      const selected = pageSelect.selectedIndex;
      return selected >= 0 ? [selected] : [];
    }

    async function warmPages(indexes) {
      const fresh = [];
      for (const page of indexes) {
        const index = page | 0;
        if (index < 0 || glyphWarmed.has(index)) continue;
        fresh.push(index);
      }
      if (!fresh.length) return;
      const names = [];
      for (const index of fresh) {
        await session.ensurePageSpans(index);
        const faces = JSON.parse(await session.pageFaces(index));
        if (!Array.isArray(faces)) continue;
        for (const name of faces) {
          if (name && !loadedFaces.has(name)) names.push(name);
        }
      }
      if (names.length) {
        await receiveFonts(names);
        for (const name of names) loadedFaces.add(name);
      }
      for (const index of fresh) {
        await session.warmGlyphs(index, screenPercent);
        glyphWarmed.add(index);
      }
      await session.readyPages([...glyphWarmed]);
    }

    async function warmNextRing() {
      const visible = lastPaint ? visiblePageIndexes(lastPaint) : [...glyphWarmed];
      if (!visible.length) return false;
      const origin = Math.min(...visible);
      const end = Math.max(...visible);
      for (let distance = 1; distance < scenePages.length; distance += 1) {
        const batch = [];
        if (end + distance < scenePages.length) batch.push(end + distance);
        if (origin - distance >= 0) batch.push(origin - distance);
        const pending = batch.filter((index) => !glyphWarmed.has(index));
        if (!pending.length) continue;
        await warmPages(pending);
        return true;
      }
      return false;
    }

    function ensureDocumentGlyphs() {
      glyphsReady = true;
      return Promise.resolve();
    }

    function warmAllPages() {
      // 쪽을 준비하고 캔버스에 올리는 일은 코어 프레임 루프가 한다.
    }
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
    function ensureScenePage(index) {
      if (index < 0) return null;
      return scenePages[index] || null;
    }

    async function pumpView() {
      if (screenLive && scrollView) {
        postViewport();
        return;
      }
      if (viewPumping) {
        viewDirty = true;
        return;
      }
      const epoch = viewEpoch;
      if (!sceneReady()) return;
      viewPumping = true;
      viewDirty = false;
      try {
        if (!glyphsReady && scenePages.length) await ensureDocumentGlyphs();
        if (epoch !== viewEpoch) return;
        if (screenAttached) await screenAttached;
        for (;;) {
          if (epoch !== viewEpoch || pinchLive) break;
          viewDirty = false;
          let plan;
          try {
            plan = await withView(() => {
              if (epoch !== viewEpoch || pinchLive) return null;
              return session.view({ ...scenePatch(), ...scrollPatch() });
            });
          } catch (error) {
            logError("pumpView.view", error);
            break;
          }
          if (!plan || epoch !== viewEpoch || pinchLive) break;
          applyView(plan, false, true);
          const job = plan.job;
          if (!job?.id) {
            if (!viewDirty && !pinchLive) {
              void warmAllPages();
            }
            break;
          }
          if (screenLive) {
            if (job.background) {
              if (!viewDirty && !pinchLive) void warmAllPages();
              break;
            }
            const at = (job.percent | 0) || plan.percent || screenPercent;
            const step = await session.preparePage(job.page, at, job.y | 0);
            if (epoch !== viewEpoch || pinchLive) break;
            if (at === 100 && step?.done) baseReady.add(job.page | 0);
            if (at === screenPercent && step?.done) framesReady.set(job.page | 0, at);
            const next = await withView(() => {
              if (epoch !== viewEpoch || pinchLive) return null;
              return session.view({ ...scenePatch(), ...scrollPatch() });
            });
            if (!next || epoch !== viewEpoch || pinchLive) break;
            applyView(next, false, true);
            if (!next.job?.id || next.job.background) {
              if (!viewDirty && !pinchLive) void warmAllPages();
              break;
            }
            if ((step?.made | 0) === 0 && next.job.id === job.id && (next.job.percent | 0) === at) {
              if (!viewDirty && !pinchLive) void warmAllPages();
              break;
            }
            continue;
          }
          const visibleAtStart = visiblePageIndexes(plan).join(",");
          const started = Date.now();
          let frame;
          try {
            frame = await session.render(job.page, job.pixelHeight, job);
          } catch (error) {
            logError("pumpView.render", error);
            break;
          }
          if (epoch !== viewEpoch) break;
          const visibleNow = visiblePageIndexes(lastPaint);
          const pageLeft = scrollView
            && visibleAtStart !== visibleNow.join(",")
            && visibleNow.length > 0
            && !visibleNow.includes(job.page | 0);
          const next = await withView(() => {
            if (epoch !== viewEpoch) return null;
            const patch = { ...scenePatch(), ...scrollPatch() };
            if (!pageLeft) patch.commit = job.id;
            return session.view(patch);
          });
          if (!next || epoch !== viewEpoch) break;
          if (pageLeft) {
            applyView(next);
            break;
          }
          if (next.committed) {
            storeTile(job.id, frame, job.page);
            const origin = (next.pages || []).find((item) => (item.index | 0) === (job.page | 0));
            const x = (origin ? origin.x : 0) + job.x;
            const y = (origin ? origin.y : 0) + job.y;
            const hits = x < next.scrollX + next.viewW && x + job.w > next.scrollX
              && y < next.scrollY + next.viewH && y + job.h > next.scrollY;
            logTime(`${job.page + 1}쪽 ${hits ? "보이는 칸" : "여유 칸"} ${frame.width}×${frame.height}`, started, job.page + 1);
          }
          applyView(next);
          if (!next.job?.id) {
            const turn = nextTurn;
            logNext(turn, "주변 칸");
            if (turn && turn === nextTurn) nextTurn = null;
            if (!viewDirty) {
              void warmAllPages();
              break;
            }
          }
        }
      } finally {
        viewPumping = false;
        if (viewDirty && epoch === viewEpoch) {
          viewDirty = false;
          pumpView();
        }
      }
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
      const sheet = sheetSlot()?.querySelector(".sheet") || preview.querySelector(".sheet");
      if (sheet instanceof HTMLCanvasElement && sheet.width > 0 && sheet.height > 0) {
        const dpr = window.devicePixelRatio || 1;
        placeSheet(sheet, Math.max(1, Math.round(sheet.width / dpr)), Math.max(1, Math.round(sheet.height / dpr)));
      } else if (sheet) {
        const aspect = sheet.style.aspectRatio || "";
        if (aspect.includes("/")) {
          const [a, b] = aspect.split("/").map((part) => Number(part.trim()));
          if (a > 0 && b > 0) {
            const height = Math.max(1, Math.round((b * 96 * screenPercent) / 100 / 7200));
            const width = Math.max(1, Math.round((a * 96 * screenPercent) / 100 / 7200));
            placeSheet(sheet, width, height);
          }
        }
      }
      const anchor = scrollAnchor;
      scrollAnchor = null;
      if (anchor) {
        requestAnimationFrame(() => {
          preview.scrollTop = anchor.top * Math.max(0, preview.scrollHeight - preview.clientHeight);
          preview.scrollLeft = anchor.left * Math.max(0, preview.scrollWidth - preview.clientWidth);
          applyCompare();
        });
      }
      applyCompare();
    }

    function applyZoomPercent(raw) {
      const n = Number(raw);
      const info = document.getElementById("zoomInfo");
      if (!Number.isFinite(n) || n <= 0) {
        syncZoomInput();
        return;
      }
      const percent = Math.min(800, Math.max(10, Math.round(n)));
      const shown = String(percent);
      if (info) info.value = shown;
      const slider = document.getElementById("zoomSlider");
      if (slider) slider.value = shown;
      if (!fitPageMode && !fitWidthMode && percent === screenPercent) return;
      fitPageMode = false;
      fitWidthMode = false;
      zoomFit = "";
      const index = pageSelect.selectedIndex;
      if (lineCacheMode && !scrollView) ensureScenePage(index);
      const scene = sceneReady();
      if (!scene) {
        const topRoom = Math.max(1, preview.scrollHeight - preview.clientHeight);
        const leftRoom = Math.max(1, preview.scrollWidth - preview.clientWidth);
        scrollAnchor = {
          top: preview.scrollTop / topRoom,
          left: preview.scrollLeft / leftRoom,
        };
      }
      screenPercent = percent;
      syncZoomInput();
      cacheEpoch += 1;
      if (location.search.includes("hangul")) {
        const url = new URL(location.href);
        url.searchParams.delete("hangul");
        history.replaceState(null, "", url);
      }
      if (scene) {
        ++scrollSerial;
        ensureViewport();
        if (screenLive && scrollView) {
          void sendInput({ type: "zoom", percent });
          return;
        }
        withView(async () => {
          const serial = scrollSerial;
          const patch = (screenLive && scrollView && lastPaint?.pages?.length)
            ? { viewport: viewportPatch(), zoom: percent }
            : scenePatch();
          const plan = await session.view(patch);
          let trustShown = false;
          if (serial === scrollSerial && plan) {
            shownScrollX = plan.scrollX || 0;
            shownScrollY = plan.scrollY || 0;
            trustShown = true;
          }
          applyView(plan, false, trustShown);
          if (!screenLive) pumpView();
          notePointer(0);
        });
        return;
      }
      layoutZoom();
    }


    function renderFromScene(index) {
      const node = scenePages[index];
      pageInfo.textContent = `${index + 1} / ${scenePages.length}쪽`;
      const sheet = renderSceneNode(node, true);
      sheet.classList.add("sheet");
      sheet.style.aspectRatio = `${node.width} / ${node.height}`;
      mountSheet(sheet);
      const scale = () => sheet.clientWidth / (node.width || 1);
      const place = (item) => {
        const parent = item.parentElement;
        const px = item.dataset.local === "1"
          ? ((parent.clientWidth || Number(parent.dataset.w) * scale()) / Number(parent.dataset.w || 1))
          : scale();
        const py = item.dataset.local === "1"
          ? ((parent.clientHeight || Number(parent.dataset.h) * scale()) / Number(parent.dataset.h || 1))
          : scale();
        const inlineChar = item.dataset.char === "1" && item.parentElement?.classList.contains("line");
        const ml = Number(item.dataset.marginLeft || 0);
        const mr = Number(item.dataset.marginRight || 0);
        const mt = Number(item.dataset.marginTop || 0);
        const mb = Number(item.dataset.marginBottom || 0);
        const isObject = item.classList.contains("obj");
        if (inlineChar) {
          item.style.position = "relative";
          item.style.display = "inline-block";
          item.style.verticalAlign = "top";
          item.style.left = "auto";
          item.style.top = "auto";
        } else {
          const shiftX = isObject ? ml : 0;
          const shiftY = isObject ? mt : 0;
          item.style.left = `${(Number(item.dataset.x) - shiftX) * px}px`;
          item.style.top = `${(Number(item.dataset.y) - shiftY) * py}px`;
        }
        if (item.dataset.w) item.style.width = `${Number(item.dataset.w) * px}px`;
        if (item.dataset.h) item.style.height = `${Number(item.dataset.h) * py}px`;
        if (item.classList.contains("para") || isObject) {
          item.style.marginLeft = ml ? `${ml * px}px` : "";
          item.style.marginRight = mr ? `${mr * px}px` : "";
          if (isObject) {
            item.style.marginTop = mt ? `${mt * py}px` : "";
            item.style.marginBottom = mb ? `${mb * py}px` : "";
          }
        }
      };
      const layout = () => {
        sheet.querySelectorAll(".body, .column, .para, .obj, .cell, .line").forEach(place);
        sheet.querySelectorAll("[data-border], [data-fill], [data-z]").forEach((item) => {
          const parent = item.parentElement;
          const px = item.dataset.local === "1"
            ? ((parent.clientWidth || Number(parent.dataset.w) * scale()) / Number(parent.dataset.w || 1))
            : scale();
          if (item.dataset.border) {
            const border = JSON.parse(item.dataset.border);
            for (const side of ["left", "right", "top", "bottom"]) {
              const edge = border[side];
              if (!edge?.type || edge.type === "NONE") continue;
              const css = side[0].toUpperCase() + side.slice(1);
              item.style[`border${css}Style`] = edge.type === "DASH" ? "dashed" : edge.type === "DOT" ? "dotted" : "solid";
              item.style[`border${css}Color`] = edge.color || "#000";
              item.style[`border${css}Width`] = `${Math.max(0.4, Number(edge.width) * px)}px`;
            }
          }
          if (item.dataset.fill && item.dataset.fill !== "none") item.style.background = item.dataset.fill;
          if (item.dataset.z != null) {
            item.style.zIndex = item.dataset.wrap === "BEHIND_TEXT" ? "0" : String(10 + Number(item.dataset.z));
          }
        });
        sheet.querySelectorAll(".line").forEach((item) => {
          const parent = item.parentElement;
          const px = (parent.clientWidth || Number(parent.dataset.w) * scale()) / Number(parent.dataset.w || 1);
          const em = Number(item.dataset.em || 1000);
          item.style.fontSize = `${em * px}px`;
          item.style.lineHeight = `${em * px}px`;
          item.querySelectorAll(":scope > span").forEach((span) => {
            const size = Number(span.dataset.em || em) * px;
            span.style.fontSize = `${size}px`;
            if (span.dataset.font) span.style.fontFamily = `"${span.dataset.font}", "함초롬바탕", "Malgun Gothic", sans-serif`;
            span.style.letterSpacing = "0";
            const ratio = Number(span.dataset.ratio || 100);
            const glyphs = span.querySelectorAll(":scope > .glyph");
            if (glyphs.length) {
              glyphs.forEach((glyph) => {
                glyph.style.display = "inline-block";
                glyph.style.verticalAlign = "baseline";
                glyph.style.overflow = "visible";
                glyph.style.width = `${Number(glyph.dataset.w) * px}px`;
                const gap = Number(glyph.dataset.gap || 0);
                glyph.style.marginRight = gap ? `${gap * px}px` : "";
                const offset = Number(span.dataset.offset || 0);
                const parts = [];
                if (ratio !== 100) parts.push(`scaleX(${ratio / 100})`);
                if (offset) parts.push(`translateY(${(size * offset) / 100}px)`);
                const face = glyph.querySelector(":scope > .glyph-ink") || glyph;
                face.style.display = "inline-block";
                face.style.transform = parts.length ? parts.join(" ") : "none";
                face.style.transformOrigin = "left center";
              });
              return;
            }
            if (span.dataset.w && span.dataset.tab !== "1") {
              span.style.display = "inline-block";
              span.style.verticalAlign = "baseline";
              span.style.overflow = "visible";
              span.style.width = `${Number(span.dataset.w) * px}px`;
              const gap = Number(span.dataset.gap || 0);
              span.style.marginRight = gap ? `${gap * px}px` : "";
              span.style.transform = "none";
            } else {
              span.style.transform = "";
            }
            if (span.dataset.tab === "1" && span.dataset.w) {
              const tabWidth = `${Number(span.dataset.w) * px}px`;
              span.style.display = "inline-block";
              span.style.boxSizing = "border-box";
              span.style.width = tabWidth;
              span.style.minWidth = tabWidth;
              span.style.maxWidth = tabWidth;
              span.style.fontSize = "0";
              span.style.letterSpacing = "0";
              span.style.transform = "none";
            }
          });
          const align = item.dataset.align || "JUSTIFY";
          const last = item.dataset.last === "1";
          item.style.textAlignLast = "";
          item.style.textJustify = "";
          if (align === "CENTER") item.style.textAlign = "center";
          else if (align === "RIGHT") item.style.textAlign = "right";
          else if (align === "LEFT") item.style.textAlign = "left";
          else if (align === "DISTRIBUTE") {
            item.style.textAlign = "justify";
            item.style.textAlignLast = "justify";
            item.style.textJustify = "inter-character";
          } else if (align === "DISTRIBUTE_SPACE") {
            item.style.textAlign = "justify";
            item.style.textAlignLast = "justify";
          } else if (last) item.style.textAlign = "left";
          else {
            item.style.textAlign = "justify";
            item.style.textAlignLast = "justify";
          }
        });
        applyCompare();
      };
      layout();
      layout();
      new ResizeObserver(layout).observe(sheet);
      sheetCache.set(index, sheet);
      sheetLayout.set(sheet, layout);
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
      if (lineCacheMode && !scrollView) ensureScenePage(index);
      if (sceneReady()) {
        ensureViewport();
        pumpView();
        return;
      }
      clearViewport();
      const page = sectionPage();
      const content = contentBox(page);
      pageInfo.textContent = `${index + 1} / ${pages.length}쪽`;
      const sheet = document.createElement("div");
      sheet.className = "sheet";
      sheet.style.aspectRatio = `${page.width} / ${page.height}`;
      mountSheet(sheet);
      const scale = () => sheet.clientWidth / page.width;

      const body = document.createElement("div");
      body.className = "body";
      body.dataset.x = String(content.left);
      body.dataset.y = String(content.top);
      body.dataset.w = String(content.width);
      body.dataset.h = String(content.height);
      sheet.append(body);

      const all = [];
      for (const section of (parsed ?? bodyDocument).sections ?? []) {
        for (const para of section.paragraphs ?? []) all.push(para);
      }
      const ranges = lineRanges[index] ?? [];
      let rangeAt = 0;
      let cursorY = 0;
      const frames = [];
      for (const paraIndex of paragraphPages[index] ?? []) {
        const para = all[paraIndex];
        if (!para) continue;
        const owned = [];
        while (rangeAt < ranges.length && ranges[rangeAt].paragraph === paraIndex) {
          owned.push(ranges[rangeAt]);
          rangeAt += 1;
        }
        if (!owned.length) owned.push({ start: 0, end: 0 });
        const chars = paragraphChars(para);
        const shape = paraShape(para);
        const lines = owned.map((range, lineIndex) => {
          const slice = chars.slice(range.start, range.end);
          const em = slice[0]?.em || 1000;
          return { slice, em, pitch: linePitch(em, para), first: lineIndex === 0, indent: shape.indent || 0 };
        });
        const h = lines.reduce((sum, line) => sum + line.pitch, 0);
        const paraNode = document.createElement("p");
        paraNode.className = "para";
        paraNode.dataset.local = "1";
        paraNode.dataset.x = "0";
        paraNode.dataset.y = String(cursorY);
        paraNode.dataset.w = String(content.width);
        paraNode.dataset.h = String(h);
        body.append(paraNode);
        frames.push({ paraIndex, paraNode, y: cursorY, h, lines });
        cursorY += h;
      }

      const controls = controlsOnPage(index)
        .map((item) => {
          const frame = frames.find((entry) => entry.paraIndex === item.paraIndex);
          const paraY = frame?.y || 0;
          const paraH = frame?.h || 0;
          const placement = item.control.placement;
          const host = objectHost(placement);
          const paperX = paperAxis(placement.horzRelTo, placement.horzAlign, placement.horzOffset,
            placement.width || 0, "x", page, content, paraY, paraH);
          const paperY = paperAxis(placement.vertRelTo, placement.vertAlign, placement.vertOffset,
            placement.height || 0, "y", page, content, paraY, paraH);
          const originX = host === "paper" ? 0 : content.left;
          const originY = host === "paper" ? 0 : content.top + (host === "para" ? paraY : 0);
          return { ...item, host, frame, paperX, paperY, x: paperX - originX, y: paperY - originY };
        })
        .sort((a, b) => (a.control.placement.zOrder || 0) - (b.control.placement.zOrder || 0));

      const flowObjects = [];
      const mount = (item) => {
        const node = document.createElement("div");
        const behind = item.control.placement.textWrap === "BEHIND_TEXT";
        node.className = "obj" + (item.control.kind === "picture" ? " picture" : "") + (behind ? " behind" : "");
        if (item.host !== "paper") node.dataset.local = "1";
        node.dataset.x = String(item.x);
        node.dataset.y = String(item.y);
        node.dataset.w = String(item.control.placement.width || 0);
        node.dataset.h = String(item.control.placement.height || 0);
        applyPaint(node, item.control);
        if (item.control.kind === "picture") putPicture(node, item.control);
        else if (item.control.kind === "table") drawTable(item.control, node);
        else fillBox(item.control, node);
        const parent = item.host === "paper" ? sheet : item.host === "para" ? item.frame?.paraNode ?? body : body;
        parent.append(node);
        if (item.control.placement.textWrap === "SQUARE" || item.control.placement.textWrap === "TOP_AND_BOTTOM") {
          flowObjects.push({
            placement: item.control.placement,
            x: item.paperX,
            y: item.paperY,
            w: Number(node.dataset.w) || item.control.placement.width || 0,
            h: Number(node.dataset.h) || item.control.placement.height || 0,
          });
        }
      };
      for (const item of controls) mount(item);

      for (const frame of frames) {
        let localY = 0;
        for (const lineInfo of frame.lines) {
          const paperY = content.top + frame.y + localY;
          const gaps = freeIntervals(paperY, lineInfo.pitch, content, flowObjects);
          const width = lineInfo.slice.reduce((sum, item) => sum + glyphWidth(item.ch, item.em), 0);
          let x = lineInfo.first && lineInfo.indent > 0 ? lineInfo.indent : 0;
          let room = content.width - x;
          for (const [left, right] of gaps) {
            const localLeft = left - content.left;
            if (right - left + 15 >= width) {
              x = Math.max(x, localLeft);
              room = right - content.left - x;
              break;
            }
          }
          const line = document.createElement("div");
          line.className = "line";
          line.dataset.local = "1";
          line.dataset.x = String(x);
          line.dataset.y = String(localY);
          line.dataset.em = String(lineInfo.em);
          line.dataset.h = String(lineInfo.pitch);
          line.dataset.room = String(Math.max(0, room));
          fillLineSpans(line, lineInfo.slice);
          frame.paraNode.append(line);
          localY += lineInfo.pitch;
        }
      }

      const layout = () => {
        const px = scale();
        sheet.querySelectorAll(".line").forEach((node) => {
          const parent = node.parentElement;
          const sx = (parent.clientWidth || Number(parent.dataset.w) * px) / Number(parent.dataset.w || 1);
          node.style.left = `${Number(node.dataset.x) * sx}px`;
          node.style.top = `${Number(node.dataset.y) * sx}px`;
          const em = Number(node.dataset.em || 1000);
          node.style.fontSize = `${em * sx}px`;
          node.style.lineHeight = `${em * sx}px`;
          if (node.dataset.h) node.style.height = `${Number(node.dataset.h) * sx}px`;
          if (node.dataset.room) node.style.maxWidth = `${Number(node.dataset.room) * sx}px`;
          node.querySelectorAll("span").forEach((span) => {
            const spanEm = Number(span.dataset.em || em);
            span.style.fontSize = `${spanEm * sx}px`;
          });
        });
        sheet.querySelectorAll(".body, .para, .obj").forEach((node) => {
          if (node.dataset.local === "1") {
            const parent = node.parentElement;
            const sx = (parent.clientWidth || Number(parent.dataset.w) * px) / Number(parent.dataset.w || 1);
            const sy = (parent.clientHeight || Number(parent.dataset.h) * px) / Number(parent.dataset.h || 1);
            node.style.left = `${Number(node.dataset.x) * sx}px`;
            node.style.top = `${Number(node.dataset.y) * sy}px`;
            node.style.width = `${Number(node.dataset.w) * sx}px`;
            node.style.height = `${Number(node.dataset.h) * sy}px`;
          } else {
            node.style.left = `${Number(node.dataset.x) * px}px`;
            node.style.top = `${Number(node.dataset.y) * px}px`;
            node.style.width = `${Number(node.dataset.w) * px}px`;
            node.style.height = `${Number(node.dataset.h) * px}px`;
          }
          const scale = node.dataset.local === "1"
            ? ((node.parentElement.clientWidth || Number(node.parentElement.dataset.w) * px) /
              Number(node.parentElement.dataset.w || 1))
            : px;
          if (node.dataset.strokeType === "NONE") node.style.borderStyle = "none";
          else if (node.dataset.stroke) {
            node.style.borderStyle = node.dataset.strokeType === "DASH" ? "dashed"
              : node.dataset.strokeType === "DOT" ? "dotted" : "solid";
            node.style.borderColor = node.dataset.strokeColor || "#000";
            node.style.borderWidth = `${Math.max(0.4, Number(node.dataset.stroke) * scale)}px`;
          }
          for (const side of ["Left", "Right", "Top", "Bottom"]) {
            const width = node.dataset["stroke" + side];
            if (width) node.style[`border${side}Width`] = `${Math.max(0.4, Number(width) * scale)}px`;
          }
          const inside = node.querySelector(":scope > .inside");
          if (inside) inside.style.fontSize = `${900 * px}px`;
        });
        sheet.querySelectorAll(".inner-line").forEach((node) => {
          const parent = node.parentElement;
          const sx = (parent.clientWidth || Number(parent.dataset.w) * px) / Number(parent.dataset.w || 1);
          const sy = (parent.clientHeight || Number(parent.dataset.h) * px) / Number(parent.dataset.h || 1);
          node.style.left = `${Number(node.dataset.x) * sx}px`;
          node.style.top = `${Number(node.dataset.y) * sy}px`;
          const em = Number(node.dataset.em || 1000);
          node.style.fontSize = `${em * sy}px`;
          node.style.lineHeight = `${em * sy}px`;
          const room = Number(node.dataset.room) || 0;
          if (room > 0) node.style.width = `${room * sx}px`;
          const align = node.dataset.align || "LEFT";
          if (align === "CENTER") node.style.textAlign = "center";
          else if (align === "RIGHT") node.style.textAlign = "right";
          else if (align === "JUSTIFY" && node.dataset.last !== "1") node.style.textAlign = "justify";
          else if (align === "DISTRIBUTE" || align === "DISTRIBUTE_SPACE") {
            node.style.textAlign = "justify";
            node.style.textAlignLast = "justify";
            if (align === "DISTRIBUTE") node.style.textJustify = "inter-character";
          }
        });
        sheet.querySelectorAll(".as-char").forEach((node) => {
          const parent = node.closest(".obj");
          const sx = parent.clientWidth / Number(parent.dataset.w || 1);
          const sy = parent.clientHeight / Number(parent.dataset.h || 1);
          if (node.dataset.w) node.style.width = `${Number(node.dataset.w) * sx}px`;
          if (node.dataset.h) node.style.height = `${Number(node.dataset.h) * sy}px`;
          node.style.fontSize = `${800 * px}px`;
        });
        applyCompare();
      };
      layout();
      layout();
      new ResizeObserver(layout).observe(sheet);
    }

    function showHangul() {
      const index = pageSelect.selectedIndex;
      const page = index >= 0 ? index + 1 : 0;
      const pageCount = Math.max(scenePages.length, pages.length, pageSelect?.options?.length || 0);
      const percent = currentZoomPercent();
      const url = "";
      window.dispatchEvent(new CustomEvent("noting-page", {
        detail: { url, page, pageIndex: Math.max(0, index), pageCount, percent },
      }));
    }

    function setPages(nextPages, index = 0) {
      const count = scenePages.length || nextPages.length;
      pages = Array.from({ length: count }, () => "");
      pageSelect.replaceChildren();
      pages.forEach((_, pageIndex) => {
        const option = document.createElement("option");
        option.textContent = `${pageIndex + 1}쪽`;
        pageSelect.append(option);
      });
      if (pages.length) pageSelect.selectedIndex = Math.min(Math.max(0, index | 0), pages.length - 1);
      hideCaret();
      showHangul();
      renderPreview();
    }

    document.getElementById("opacity")?.addEventListener("input", applyCompare);
    window.addEventListener("noting-page-ready", layoutZoom);
    new ResizeObserver(() => {
      if (sceneReady()) {
        ensureViewport();
        if (screenLive && scrollView) {
          postViewport();
          return;
        }
        withView(async () => {
          const plan = await session.view({ ...scenePatch(), ...scrollPatch() });
          applyView(plan);
          pumpView();
        });
        return;
      }
      layoutZoom();
    }).observe(preview);
    const zoomSlider = document.getElementById("zoomSlider");
    zoomSlider?.addEventListener("input", () => {
      noteZoomDrag();
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
      if (!scrollView) {
        const nextIndex = Math.max(0, Math.min(pages.length - 1, (pageSelect.selectedIndex | 0) + (dir < 0 ? -1 : 1)));
        if (nextIndex !== pageSelect.selectedIndex) {
          pageSelect.selectedIndex = nextIndex;
          turnPage();
        }
        return;
      }
      if (!sceneReady()) return;
      stopCoastFrame();
      cancelScrollInput();
      void sendInput({ type: "pageStep", dir: dir < 0 ? -1 : 1 }).then((camera) => {
        if (camera?.scrollChanged && !screenLive) pumpView();
      });
    }
    window.addEventListener("keydown", (event) => {
      if (event.isComposing || event.keyCode === 229 || imeComposing) return;
      const target = event.target;
      const foreign =
        target !== editorInput &&
        (target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement ||
          (target instanceof HTMLElement && target.isContentEditable));
      if (foreign) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const code = editKeyMap[event.key];
      if (!code || !sceneReady()) return;
      event.preventDefault();
      event.stopPropagation();
      void queueEdit(() => session.editKey(code, !!event.shiftKey, false, false));
    }, true);
    window.addEventListener("keydown", (event) => {
      const target = event.target;
      const inEditable =
        target !== editorInput &&
        (target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          target instanceof HTMLSelectElement ||
          (target instanceof HTMLElement && target.isContentEditable));
      if (!inEditable && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (event.key === "PageDown") {
          event.preventDefault();
          stepPageView(1);
          return;
        }
        if (event.key === "PageUp") {
          event.preventDefault();
          stepPageView(-1);
          return;
        }
      }
      if (event.key !== "c" && event.key !== "C") return;
      if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
      if (inEditable) return;
      if (!selectedText) return;
      event.preventDefault();
      copySelectedText(selectedText);
    });
    window.addEventListener("noting-page-grid", (event) => {
      applyPageGrid(event.detail);
    });
    // 눈금자는 코어가 화면 캔버스에 그린다. 셸은 켜고 끈 값만 넘기고 기억한다.
    function rulersShown() {
      try {
        return localStorage.getItem("noting.rulers") !== "0";
      } catch {
        return true;
      }
    }
    function showRulers(on) {
      try {
        localStorage.setItem("noting.rulers", on ? "1" : "0");
      } catch {}
      void sendInput({ type: "rulers", on });
      window.dispatchEvent(new CustomEvent("noting-rulers-changed", { detail: { on } }));
    }
    // 블록 마커는 따로 설정하지 않는다. 손가락이 주 입력인 화면(pointer: coarse)에서만 켜고,
    // 태블릿에 키보드·마우스를 붙이는 것처럼 주 입력이 바뀌면 따라간다.
    const coarsePointer = window.matchMedia?.("(pointer: coarse)");
    function syncPins() {
      void sendInput({ type: "pins", on: !!coarsePointer?.matches });
    }
    coarsePointer?.addEventListener?.("change", syncPins);
    window.addEventListener("noting-rulers", (event) => {
      const on = typeof event.detail?.on === "boolean" ? event.detail.on : !rulersShown();
      showRulers(on);
    });
    window.addEventListener("noting-zoom", (event) => {
      const raw = event.detail;
      if (typeof raw === "number" || typeof raw === "string") {
        applyZoomPercent(raw);
        return;
      }
      const detail = raw || {};
      if (detail.drag) noteZoomDrag();
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
      applyZoomPercent(screenPercent + step);
    });
    syncZoomInput();
    // 마우스, 터치, 펜은 같은 포인터로 코어에 넘긴다. 스크롤과 핀치와 선택은 코어가 가른다.
    const presses = new Map();
    function ownsTouch() {
      for (const press of presses.values()) {
        if (press.touch) return true;
      }
      return false;
    }
    let inputChain = Promise.resolve();
    let coastFrame = 0;
    let coastStamp = 0;
    let wheelEndTimer = 0;
    let wheelStamp = 0;
    let scrollByWheel = false;
    let panLive = false;
    let wheelBatch = null;
    let wheelFlush = 0;
    let wheelDiscrete = false;
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
      const activeTouchOrCoast = ownsTouch() || panLive || scrollByWheel;
      if (scroller && (!screenLive || settle || !activeTouchOrCoast)) {
        holdApplyingScroll();
        scroller.scrollLeft = x / dpr;
        scroller.scrollTop = y / dpr;
      }
      if (!lastPaint) {
        syncViewportInfo(hintPage);
        return;
      }
      if (!screenLive) {
        lastPaint = withThumbs({ ...lastPaint, scrollX: x, scrollY: y }, x, y);
        placePdf(lastPaint);
        requestPresent();
      } else {
        lastPaint.scrollX = x;
        lastPaint.scrollY = y;
        placePdf(lastPaint);
      }
      syncViewportInfo(hintPage);
    }
    function applyShellCamera(camera, fromFrame = false) {
      if (!camera) return;
      const prevPercent = screenPercent;
      const prevFitPage = fitPageMode;
      const prevFitWidth = fitWidthMode;
      const nextPercent = camera.percent | 0;
      if (nextPercent > 0) screenPercent = Math.min(800, Math.max(10, nextPercent));
      if (typeof camera.fitPage === "boolean") fitPageMode = camera.fitPage;
      if (typeof camera.fitWidth === "boolean") fitWidthMode = camera.fitWidth;
      const zoomChanged = screenPercent !== prevPercent || fitPageMode !== prevFitPage || fitWidthMode !== prevFitWidth;
      if (!gestureActive || fromFrame) pinchLive = !!camera.pinching;
      scrollByWheel = !!camera.wheeling || !!camera.coasting;
      panLive = !!camera.panning;
      const camPage = Number.isInteger(camera.page) ? (camera.page | 0) : -1;
      shownScrollX = camera.scrollX | 0;
      shownScrollY = camera.scrollY | 0;
      scrollOwned = scrollByWheel || panLive || pinchLive || !!camera.draggingBar || ownsTouch();
      const viewW = camera.viewW | 0;
      const viewH = camera.viewH | 0;
      if (screenLive && scrollView && viewW > 0 && viewH > 0) {
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
        const settled = !pinchLive && !camera.coasting && !camera.panning && !camera.wheeling && !gestureActive;
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
      if (zoomChanged) syncZoomInput(camPage);
      else syncViewportInfo(camPage);
      if (camera.coasting && !screenLive) scheduleCoast();
    }
    shellCameraHook = (camera) => applyShellCamera(camera, true);

    async function adoptCamera(camera) {
      if (camera?.select) applyPointerResult(camera, (camera.selectPhase | 0) === 1);
      if (screenLive && scrollView) {
        applyShellCamera(camera, false);
        return;
      }
      const wasPinch = pinchLive;
      const wasOwned = scrollOwned;
      const camPage = Number.isInteger(camera?.page) ? (camera.page | 0) : -1;
      pinchLive = !!camera?.pinching;
      scrollByWheel = !!camera?.wheeling || !!camera?.coasting;
      panLive = !!camera?.panning;
      scrollOwned = scrollByWheel || panLive || !!camera?.pinching || !!camera?.draggingBar || ownsTouch();
      if (scrollOwned || camera?.zoomChanged || wasPinch) cancelScrollInput();
      if (camera?.select) applyPointerResult(camera, (camera.selectPhase | 0) === 1);
      const pinchEnded = wasPinch && !pinchLive;
      if (!camera?.handled && !camera?.select && !pinchEnded) {
        if (wasOwned && !scrollOwned && !pinchLive && camera) {
          placeCameraScroll(camera.scrollX | 0, camera.scrollY | 0, true, camPage);
        }
        return;
      }
      if (camera?.zoomChanged || pinchEnded) {
        if (camera && typeof camera.fitPage === "boolean") {
          fitPageMode = camera.fitPage;
        }
        if (camera && typeof camera.fitWidth === "boolean") {
          fitWidthMode = camera.fitWidth;
        }
        zoomFit = fitPageMode ? "page" : (fitWidthMode ? "width" : "");
        const percent = Math.min(800, Math.max(10, (camera?.percent || screenPercent) | 0));
        screenPercent = percent;
        if (camera) {
          shownScrollX = camera.scrollX | 0;
          shownScrollY = camera.scrollY | 0;
        }
        syncZoomInput(camPage);
        if (camera?.coasting && !screenLive) scheduleCoast();
        // 핀치·줌 보간 중 view()는 포인터보다 무겁다. 배율은 카메라에 있고, 화면은 프레임 루프가 낸다.
        if (pinchLive || (screenLive && camera?.coasting)) return;
        holdApplyingScroll();
        const plan = await session.view({ viewport: viewportPatch() });
        if (plan && !pinchLive) {
          shownScrollX = plan.scrollX || 0;
          shownScrollY = plan.scrollY || 0;
          applyView(plan, false, true);
          const scroller = document.getElementById("viewScroller");
          if (scroller) {
            const dpr = plan.dpr || 1;
            holdApplyingScroll();
            scroller.scrollLeft = shownScrollX / dpr;
            scroller.scrollTop = shownScrollY / dpr;
          }
          if (!screenLive) pumpView();
        }
      } else if (camera?.scrollChanged) {
        if (pinchLive) {
          shownScrollX = camera.scrollX | 0;
          shownScrollY = camera.scrollY | 0;
          syncViewportInfo(camPage);
        } else {
          placeCameraScroll(camera.scrollX | 0, camera.scrollY | 0, !scrollOwned, camPage);
        }
      } else if (wasOwned && !scrollOwned && !pinchLive && camera) {
        placeCameraScroll(camera.scrollX | 0, camera.scrollY | 0, true, camPage);
      }
      if (camera?.coasting && !screenLive) scheduleCoast();
    }
    function sendInput(event) {
      if (screenLive && scrollView) {
        return coreReady.then(() => session.input(event)).then((camera) => {
          void adoptCamera(camera);
          return camera;
        });
      }
      const run = inputChain.then(async () => {
        await coreReady;
        const camera = await session.input(event);
        await adoptCamera(camera);
        return camera;
      });
      inputChain = run.then(() => {}, () => {});
      return run;
    }
    function scheduleCoast() {
      if (screenLive || coastFrame) return;
      coastStamp = performance.now();
      const step = (now) => {
        coastFrame = 0;
        if (screenLive) return;
        const dt = now - coastStamp;
        coastStamp = now;
        void sendInput({ type: "tick", dt });
      };
      coastFrame = requestAnimationFrame(step);
    }
    function stopCoastFrame() {
      if (!coastFrame) return;
      cancelAnimationFrame(coastFrame);
      coastFrame = 0;
    }
    function pointerDevice(event) {
      if (event.pointerType === "touch") return 1;
      if (event.pointerType === "pen") return 2;
      return 0;
    }
    let pointerMoveInFlight = false;
    function schedulePointerFlush() {
      if (pointerFlush || pointerMoveInFlight || !pointerPending.size) return;
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
      if (!screenLive && pointerMoveInFlight && !force) return;
      const items = Array.from(pointerPending.values());
      pointerPending.clear();
      if (screenLive && scrollView) {
        void (items.length === 1 ? sendInput(items[0]) : sendInput({ type: "pointers", items }));
        return;
      }
      pointerMoveInFlight = true;
      const lastRun =
        items.length === 1
          ? sendInput(items[0])
          : sendInput({ type: "pointers", items });
      if (lastRun) {
        lastRun.finally(() => {
          pointerMoveInFlight = false;
          schedulePointerFlush();
        });
      } else {
        pointerMoveInFlight = false;
      }
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
      if (imeComposing && editorInput) {
        imeComposing = false;
        editorInput.value = "";
        editorInput.blur();
      }
      pointerHold = null;
      stopCoastFrame();
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
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > 8) press.moved = true;
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
    let gestureMoveInFlight = false;
    const scheduleGestureFlush = () => {
      if (gestureFlush || gestureMoveInFlight || !gesturePending) return;
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
      if (!screenLive && gestureMoveInFlight && !force) return;
      const pending = gesturePending;
      gesturePending = null;
      if (screenLive && scrollView) {
        void sendInput(pending);
        return;
      }
      gestureMoveInFlight = true;
      const run = sendInput(pending);
      if (run) {
        run.finally(() => {
          gestureMoveInFlight = false;
          scheduleGestureFlush();
        });
      } else {
        gestureMoveInFlight = false;
      }
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
    function wheelDevicePixels(event) {
      const dpr = lastPaint?.dpr || window.devicePixelRatio || 1;
      let dx = event.deltaX;
      let dy = event.deltaY;
      if (event.deltaMode === 1) {
        dx *= 16;
        dy *= 16;
      } else if (event.deltaMode === 2) {
        const scroller = document.getElementById("viewScroller");
        dx *= scroller ? scroller.clientWidth : 1;
        dy *= scroller ? scroller.clientHeight : 1;
      }
      return { dx: dx * dpr, dy: dy * dpr };
    }
    function notchWheel(event) {
      if (event.deltaMode !== 0) return true;
      if (event.deltaX !== 0) return false;
      const absY = Math.abs(event.deltaY);
      const dpr = window.devicePixelRatio || lastPaint?.dpr || 1;
      const devY = absY * dpr;
      if ((event.ctrlKey || event.metaKey) && absY >= 40) return true;
      return absY >= 40 && (Number.isInteger(event.deltaY) || Math.abs(devY - Math.round(devY)) < 0.05);
    }
    function flushWheel() {
      if (wheelFlush) {
        cancelAnimationFrame(wheelFlush);
        wheelFlush = 0;
      }
      const batch = wheelBatch;
      wheelBatch = null;
      if (!batch) return;
      const dt = wheelStamp > 0 ? batch.t - wheelStamp : 0;
      wheelStamp = batch.t;
      let vx = 0;
      let vy = 0;
      if (!batch.discrete && dt >= 1 && dt < 80) {
        vx = Math.max(-8000, Math.min(8000, (batch.dx / dt) * 1000));
        vy = Math.max(-8000, Math.min(8000, (batch.dy / dt) * 1000));
      }
      void sendInput({
        type: "wheel",
        phase: 0,
        dx: batch.dx,
        dy: batch.dy,
        x: batch.x,
        y: batch.y,
        vx,
        vy,
        zoom: !!batch.zoom,
        discrete: batch.discrete,
      });
    }
    function finishWheel(discrete) {
      if (wheelEndTimer) clearTimeout(wheelEndTimer);
      wheelEndTimer = 0;
      flushWheel();
      wheelStamp = 0;
      void sendInput({ type: "wheel", phase: 2, discrete: !!discrete });
    }
    function sendWheel(event) {
      const point = contactPoint(event);
      const moved = wheelDevicePixels(event);
      const now = event.timeStamp || performance.now();
      const discrete = notchWheel(event);
      const zoom = !!(event.ctrlKey || event.metaKey);
      cacheEpoch += 1;
      if (zoom) pinchLive = true;
      else scrollByWheel = true;
      scrollOwned = true;
      cancelScrollInput();
      if (wheelBatch && (!!wheelBatch.zoom !== zoom || (zoom && discrete))) {
        flushWheel();
      }
      if (!wheelBatch) {
        wheelBatch = { dx: 0, dy: 0, x: point.x, y: point.y, zoom, discrete: true, t: now };
      }
      wheelBatch.dx += moved.dx;
      wheelBatch.dy += moved.dy;
      wheelBatch.x = point.x;
      wheelBatch.y = point.y;
      wheelBatch.zoom = zoom;
      wheelBatch.discrete = wheelBatch.discrete && discrete;
      wheelBatch.t = now;
      wheelDiscrete = wheelBatch.discrete;
      if (wheelEndTimer) clearTimeout(wheelEndTimer);
      wheelEndTimer = setTimeout(() => finishWheel(wheelDiscrete), wheelBatch.zoom ? 140 : 90);
      if (zoom && discrete) {
        if (wheelFlush) {
          cancelAnimationFrame(wheelFlush);
          wheelFlush = 0;
        }
        flushWheel();
        return;
      }
      if (wheelFlush) return;
      wheelFlush = requestAnimationFrame(() => {
        wheelFlush = 0;
        flushWheel();
      });
    }
    preview.addEventListener("wheel", (event) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        if (!pinchLive && !fitPageMode && !fitWidthMode &&
            ((event.deltaY > 0 && screenPercent <= 10) || (event.deltaY < 0 && screenPercent >= 800))) {
          return;
        }
        noteZoomDrag();
        if (!sceneReady()) {
          if (event.deltaY > 0) {
            const next = screenPercent <= 25 ? 10 : Math.floor((screenPercent - 1) / 25) * 25;
            applyZoomPercent(Math.max(10, next));
          } else if (event.deltaY < 0) {
            const next = screenPercent < 25 ? 25 : (Math.floor(screenPercent / 25) + 1) * 25;
            applyZoomPercent(Math.min(800, next));
          }
          return;
        }
      }
      sendWheel(event);
    }, { passive: false, capture: true });

    function scrollToPage(index) {
      const page = lastPaint?.pages?.find((item) => (item.index | 0) === index);
      const scroller = document.getElementById("viewScroller");
      if (!page || !scroller) return;
      const top = page.y / (lastPaint.dpr || 1);
      if (Math.abs(scroller.scrollTop - top) < 0.5) return;
      scroller.scrollTop = top;
    }

    function turnPage() {
      hideCaret();
      if (scrollView) {
        if (screenLive) {
          void sendInput({ type: "revealPage", page: pageSelect.selectedIndex | 0 });
        } else {
          scrollToPage(pageSelect.selectedIndex);
        }
        showHangul();
        return;
      }
      arrivePage(pageSelect.selectedIndex + 1);
      showHangul();
      renderPreview();
    }
    pageSelect.addEventListener("change", turnPage);
    prev.addEventListener("click", () => {
      if (pageSelect.selectedIndex > 0) {
        pageSelect.selectedIndex -= 1;
        turnPage();
      }
    });
    next.addEventListener("click", () => {
      if (pageSelect.selectedIndex < pages.length - 1) {
        nextTurn = { at: Date.now(), page: pageSelect.selectedIndex + 2 };
        pageSelect.selectedIndex += 1;
        turnPage();
        logNext(nextTurn, "클릭");
      }
    });

    async function receiveFonts(faces) {
      const started = Date.now();
      const jobs = await session.prefetchFonts(faces);
      const list = Array.isArray(jobs) ? jobs : [];
      let got = 0;
      await Promise.all(list.map(async (job) => {
        try {
          const response = await fetch(job.url);
          if (!response.ok) {
            console.log("[noting 오류:font-fetch]", job.face, job.url, response.status);
            return;
          }
          const bytes = new Uint8Array(await response.arrayBuffer());
          if (bytes.length < 12) return;
          await session.installFonts([{ face: job.face, faces: job.faces, bytes }]);
          for (const swap of job.replacements || []) {
            await session.replaceFontFace(swap.from, swap.to);
          }
          got += 1;
        } catch (error) {
          logError(`downloadFont:${job.face || job.url}`, error);
        }
      }));
      return { 요청: list.length, 받음: got, ms: Date.now() - started };
    }

    function documentFaceNames(document) {
      const names = [];
      const fonts = document?.header?.fonts;
      if (!fonts || typeof fonts !== "object") return names;
      for (const group of Object.values(fonts)) {
        if (!Array.isArray(group)) continue;
        for (const font of group) {
          if (typeof font?.face === "string" && font.face) names.push(font.face);
          if (typeof font?.subst === "string" && font.subst) names.push(font.subst);
        }
      }
      return names;
    }

    async function openBytes(bytes, name, openedAt) {
      if (openedAt == null) opening.begin(name, Date.now());
      let openError = null;
      try {
        paintSerial += 1;
        viewEpoch += 1;
        scrollSerial += 1;
        shownScrollX = 0;
        shownScrollY = 0;
        resetGlyphWarm();
        selectedText = "";
        selectionMarks = [];
        caretImage = null;
        pointerEpoch += 1;
        pointerQueued = null;
        pointerHold = null;
        viewTiles.clear();
        viewTilePages.clear();
        lastPaint = null;
        const coreStarted = Date.now();
        await coreReady;
        opening.mark("코어 준비", coreStarted);
        const resetStarted = Date.now();
        await withView(() => session.view({ reset: true }));
        opening.mark("화면 지우기", resetStarted);
        status.textContent = "파싱 중...";
        bodyDocument = null;
        parsed = null;
        fileBytes = null;
        for (const url of Object.values(images)) URL.revokeObjectURL(url);
        images = {};
        imageLoads.clear();
        sheetCache.clear();
        anchorPages = [];
        paragraphPages = [];
        lineRanges = [];
        scenePages = [];
        const openStarted = Date.now();
        openedName = "";
        const result = bytes ? await session.open(bytes, true) : await session.newDocument();
        if (result?.ok) {
          openedName = name;
          emitDocState("clean");
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
            const planned = await session.plan(true, measured);
            const plan = JSON.parse(planned.json);
            opening.mark("쪽 계산", layoutStarted, foldPageLog(planned.detail));
            const laid = Array.isArray(plan.pages) ? plan.pages : [];
            scenePages = laid;
            anchorPages = [];
            innerLines = [];
            paragraphPages = [];
            lineRanges = [];
            const openPage = openingPageIndex(scenePages.length);
            pages = Array.from({ length: scenePages.length }, () => "");
            pageSelect.replaceChildren();
            pages.forEach((_, pageIndex) => {
              const option = document.createElement("option");
              option.textContent = `${pageIndex + 1}쪽`;
              pageSelect.append(option);
            });
            if (pages.length) pageSelect.selectedIndex = openPage;
            ensureViewport();
            if (screenAttached) await screenAttached;
            await session.beginGrind();
            if (screenLive && scrollView) {
              await sendInput(viewportInput());
              if (openPage > 0) await sendInput({ type: "revealPage", page: openPage });
            } else if (scrollView && openPage > 0) {
              const probe = await withView(() => session.view({ ...scenePatch(), scroll: { x: 0, y: 0 } }));
              const found = probe?.pages?.find((item) => (item.index | 0) === openPage);
              if (found) {
                shownScrollY = found.y | 0;
              }
            }
            const glyphStarted = Date.now();
            await ensureDocumentGlyphs();
            opening.mark("보이는 쪽 글꼴·글리프", glyphStarted);
            setPages([], openPage);
          } catch (error) {
            logError("openBytes.plan", error);
            status.textContent = `배치 실패: ${error?.message || error}`;
            openError = error;
            return;
          }
        } else {
          innerLines = [];
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

    function saveFormat(name) {
      const lower = String(name || "").toLowerCase();
      if (lower.endsWith(".hwpx")) return "hwpx";
      if (lower.endsWith(".hwp")) return "hwp";
      return "";
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
      const format = saveFormat(openedName);
      if (!format) {
        status.textContent = "저장 형식을 알 수 없습니다.";
        return;
      }
      saving = true;
      status.textContent = "저장 중...";
      try {
        const bytes = await session.exportDocument(format);
        if (!(bytes instanceof Uint8Array) || bytes.length === 0) throw new Error("저장에 실패했습니다.");
        downloadBytes(bytes, openedName);
        status.textContent = `${openedName} · ${pages.length}페이지`;
        emitDocState("saved");
        notify("문서를 저장했어요.", "saved");
      } catch (error) {
        logError("saveAs", error);
        status.textContent = `저장 실패: ${error?.message || error}`;
        notify("저장하지 못했어요. 저장 공간을 확인해 주세요.", "error", { label: "다시 시도", run: () => void saveAsDownload() });
      } finally {
        saving = false;
      }
    }

    window.addEventListener("noting-save-as", () => {
      void saveAsDownload();
    });

    window.addEventListener("noting-new-document", () => {
      const openedAt = Date.now();
      opening.begin("빈 문서.hwpx", openedAt);
      status.textContent = "새 문서...";
      void openBytes(null, "빈 문서.hwpx", openedAt);
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
        "document.hwp";
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
      void sendInput({ type: "readOnly", on });
      if (on) {
        // 보기에서는 눈금자를 숨기되, 편집 때 쓰던 값(localStorage)은 건드리지 않는다.
        void sendInput({ type: "rulers", on: false });
        editorInput?.blur();
      } else {
        showRulers(rulersShown());
      }
    };
    applyReadOnly(readOnly);
    syncPins();
    void openFromQuery();
    renderPreview();
  
}
