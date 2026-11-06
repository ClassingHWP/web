import { createViewer } from "./viewer.js";
import { startEmbed } from "./embed.js";
import { fontBase } from "./font-base.js";

// 이 앱(편집기·보기 화면)의 보기 하나와 앱 화면(메뉴·리본·대화 상자·상태 줄)을 잇는다.
// 앱 화면은 창 사건(chwp-*)과 window.__chwp* 로 말하고, 보기는 제 알림과 메서드로 말한다. 여기서는 둘을 바꿔 넘긴다.
// 주소 인자(?file=, ?handler=, 개발용 인자)를 읽어 보기에 넘기는 일도 여기서 한다.

let viewer = null;
// 라우트(자식)의 effect 가 셸(부모)의 startAppViewer 보다 먼저 돌므로, 시작 전이면 값만 기억해 둔다.
let readOnlyWanted = true;

export function setReadOnly(on) {
  readOnlyWanted = !!on;
  viewer?.setReadOnly(readOnlyWanted);
}

// 보기 화면의 편집 단추. 보일지는 코어가 정하고(임베드 명령 edit), 바뀌면 chwp-edit-button 으로 알린다.
export function editButtonShown() {
  return !!viewer?.info.editButton;
}

function windowEvent(name, detail) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
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

// 화면 위 토스트(Toast.jsx). kind 는 info · saved · undo · error 다.
function notify(text, kind = "info", action = null) {
  windowEvent("chwp-toast", { text, kind, action });
}

async function saveAsDownload() {
  try {
    const saved = await viewer.save();
    downloadBytes(saved.bytes, saved.name);
    notify("문서를 저장했어요.", "saved");
  } catch (error) {
    notify(`저장하지 못했어요. ${error?.message || ""}`.trim(), "error", { label: "다시 시도", run: () => void saveAsDownload() });
  }
}

// ?handler= OneDrive 파일 핸들러. ?file= 브라우저가 직접 받을 수 있는 https 주소(같은 출처면 경로만 줘도 된다).
function openFromQuery(params) {
  const handler = params.get("handler") || (typeof window.__HWP_HANDLER__ === "string" ? window.__HWP_HANDLER__ : "");
  if (/^[A-Za-z0-9_-]{20,80}$/.test(handler)) {
    void viewer.open(`/api/hwp/file-handler/${handler}`, "document.hwp");
    return;
  }
  const file = params.get("file") || "";
  let direct = null;
  try {
    direct = file ? new URL(file, location.href) : null;
  } catch {}
  if (direct && (direct.protocol === "https:" || direct.origin === location.origin)) void viewer.open(direct.href);
}

export function startAppViewer(host) {
  if (viewer) return viewer;
  const params = new URLSearchParams(location.search);
  window.addEventListener("error", (event) => {
    console.log(`[Error]\nMessage: ${event.message}\nFile: ${event.filename}\nLine: ${event.lineno}`);
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    console.log(`[Error: unhandledrejection]\nMessage: ${reason?.stack || reason?.message || String(reason)}`);
  });
  viewer = createViewer(host, {
    readOnly: readOnlyWanted,
    ownsPage: true,
    query: location.search,
    fonts: fontBase,
    nogpu: params.get("nogpu") === "1",
    measured: params.get("measured") === "1",
    cacheBudget: params.get("cacheBudget") || "",
  });
  // ?debug=1 이면 캐시 사용량을 콘솔에서 볼 수 있게 한다: await __chwpCacheUsage()
  if (params.get("debug") === "1") window.__chwpCacheUsage = () => viewer.cacheUsage();
  // iframe 으로 넣은 보기면 넣은 페이지와 배율·쪽·쪽 모양을 주고받는다.
  startEmbed(viewer);

  // 보기 알림 → 창 사건. 늦게 붙는 화면이 읽도록 마지막 값을 window.__chwp* 에도 둔다.
  const relay = (type, name, global) => {
    viewer.addEventListener(type, (event) => {
      if (global) window[global] = event.detail;
      windowEvent(name, event.detail);
    });
  };
  viewer.addEventListener("viewport", (event) => {
    windowEvent("chwp-page-changed", event.detail);
    windowEvent("chwp-viewport-changed", event.detail);
  });
  relay("zoom", "chwp-zoom-changed");
  relay("docstate", "chwp-doc-state");
  relay("cursorstyle", "chwp-cursor-style-changed", "__chwpCursorStyle");
  relay("caretstatus", "chwp-caret-status");
  relay("fontlist", "chwp-font-list", "__chwpFontList");
  relay("stylelist", "chwp-style-list", "__chwpStyleList");
  relay("colors", "chwp-colors", "__chwpColors");
  relay("keybindings", "chwp-key-bindings", "__chwpKeyBindings");
  relay("zoomspec", "chwp-zoom-spec", "__chwpZoomSpec");
  relay("editbutton", "chwp-edit-button");
  relay("fontswapask", "chwp-font-swap-ask");
  relay("selectionmenu", "chwp-selection-menu");
  relay("formatdialog", "chwp-open-format-dialog");
  viewer.addEventListener("rulers", (event) => {
    window.__chwpRulersWanted = event.detail.on;
    windowEvent("chwp-rulers-changed", event.detail);
  });
  // 보기를 만들 때 이미 낸 알림(처음 배율·쪽)을 다시 알린다.
  if (viewer.info.zoom) windowEvent("chwp-zoom-changed", viewer.info.zoom);
  if (viewer.info.viewport) {
    windowEvent("chwp-page-changed", viewer.info.viewport);
    windowEvent("chwp-viewport-changed", viewer.info.viewport);
  }
  viewer.addEventListener("saverequest", () => void saveAsDownload());
  viewer.addEventListener("openrequest", () => document.getElementById("file")?.click());

  // 창 사건·window.__chwp* → 보기 메서드.
  window.__chwpApplyStyle = viewer.applyStyle;
  window.__chwpFormatView = viewer.formatView;
  window.__chwpFormatPreview = viewer.formatPreview;
  window.__chwpApplyFormatDialog = viewer.applyFormatDialog;
  window.__chwpFormatFields = viewer.formatFields;
  window.__chwpPageSetupFields = viewer.pageSetupFields;
  window.__chwpApplyPageSetup = viewer.applyPageSetup;
  window.__chwpDrawShape = viewer.drawShape;
  window.__chwpInsertPicture = viewer.insertPicture;
  window.__chwpInsertTable = viewer.insertTable;
  for (const name of ["chwp-format", "chwp-style", "chwp-cursor-style", "chwp-para-shape", "chwp-char-shape"]) {
    window.addEventListener(name, (event) => void viewer.applyStyle(event?.detail));
  }
  window.addEventListener("chwp-align", (event) => void viewer.applyStyle(event?.detail, "align"));
  window.addEventListener("chwp-focus-editor", () => viewer.focus());
  window.addEventListener("chwp-remember-color", (event) => void viewer.rememberColor(event.detail));
  window.addEventListener("chwp-font-swap-apply", (event) => void viewer.applyFontSwap(event?.detail?.chosen));
  window.addEventListener("chwp-font-swap-cancel", () => viewer.cancelFontSwap());
  window.addEventListener("chwp-selection-action", (event) => viewer.selectionAction(event.detail?.action));
  window.addEventListener("chwp-toggle-overwrite", () => void viewer.toggleOverwrite());
  window.addEventListener("chwp-leave-band", () => void viewer.leaveBand());
  window.addEventListener("chwp-page-grid", (event) => viewer.pageGrid(event.detail));
  window.addEventListener("chwp-rulers", () => void viewer.toggleRulers());
  window.addEventListener("chwp-zoom-dialog", (event) => void viewer.zoomDialog(event.detail || {}));
  window.addEventListener("chwp-save-as", () => void saveAsDownload());
  window.addEventListener("chwp-new-document", () => void viewer.newDocument());
  // 배율 메뉴·상태 줄 배율. 사건 모양을 풀어 맞는 명령으로 보낸다.
  window.addEventListener("chwp-zoom", (event) => {
    const raw = event.detail;
    if (typeof raw === "number" || typeof raw === "string") {
      viewer.setZoom(raw);
      return;
    }
    const detail = raw || {};
    if (detail.grid || detail.gridMode) {
      viewer.pageGrid(detail.grid || {
        mode: detail.gridMode,
        cols: detail.cols ?? detail.gridCols,
        rows: detail.rows ?? detail.gridRows,
        fit: detail.fit === true || detail.gridMode === "grid",
      });
      return;
    }
    if (detail.pageStep) {
      viewer.stepPage(Number(detail.pageStep));
      return;
    }
    if (detail.fit === "width" || detail.fit === "page") {
      viewer.fit(detail.fit);
      return;
    }
    const direct = detail.percent ?? detail.zoom ?? detail.value;
    if (direct != null && direct !== "") {
      viewer.setZoom(direct);
      return;
    }
    // 한 단계 크기(계단)는 코어가 정한다. 방향만 넘긴다.
    const step = Number(detail.step);
    if (Number.isFinite(step) && step !== 0) void viewer.stepZoom(step);
  });

  const fileInput = document.getElementById("file");
  fileInput?.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (file) void viewer.open(file, file.name);
  });

  openFromQuery(params);
  return viewer;
}
