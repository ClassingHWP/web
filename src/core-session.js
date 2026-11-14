import { createDefaultWorker } from "./default-worker.js";

// UI 가 코어에 시키는 순서.
// 웹은 이 파일을 통해 워커와 이야기하고, 앱은 같은 호출을 자기 통신으로 바꾸면 된다.
// 포인터·휠·제스처는 값만 바꿔 input 으로 넘긴다. 무엇을 할지는 코어가 정한다.
//
// 1. boot        코어를 올린다
//    fetchFonts     코어가 고른 글꼴 파일을 받아 넣는다
//    fontFiles      코어가 요청한 글꼴이 도착해 코어에 들어갔는지 본다
// 2. parse/open  문서를 읽고, 코어가 글꼴 이름을 셸에 알린다
// 3. plan        쪽 수. 구조는 우리 조판. lineseg 면 저장된 줄 높이만 빌린다. 글리프 윤곽은 없다
//    beginGrind  글꼴을 넣은 다음 부른다. 화면 스레드를 남기고 나머지가 칸을 굽는다
//    코어가 글꼴 이름을 알리면 셸이 받아 도착하는 대로 넣고, 쪽 계산은 그 받기가 끝난 뒤에 한다
// 4. surface     화면을 붙인다. 그리기는 코어 프레임 루프가 한다

// workerUrl 은 코어 워커 시작 파일(core-worker-boot.js) 주소다. 없으면 이 앱 빌드가 묶은 워커를 쓴다.
export function createCoreSession(onLog, onCamera, onFontFaces, onScreenOps, workerUrl = null) {
  // ?threads=1 이면 스레드를 쓸 수 있어도 단일 스레드 WASM 으로 띄운다(시험용).
  const single = new URLSearchParams(globalThis.location?.search || "").get("threads") === "1";
  // 작은 시작 파일을 먼저 띄우고 그 안에서 코어 워커를 불러온다(core-worker-boot.js 에 까닭).
  const worker = workerUrl
    ? new Worker(workerUrl, { type: "module", name: single ? "single" : "core" })
    : createDefaultWorker(single);
  let seq = 0;
  const pending = new Map();
  worker.onmessage = (event) => {
    const msg = event.data || {};
    if (msg.errorLog != null && msg.id == null) console.log(msg.errorLog);
    if (msg.log != null && msg.id == null) {
      console.log(msg.log);
      onLog?.(msg.log);
      return;
    }
    if (msg.errorLog != null && msg.id == null) return;
    if (msg.camera && msg.id == null) {
      onCamera?.(msg.camera);
      return;
    }
    if (typeof msg.openUrl === "string" && msg.id == null) {
      // 플랫폼 일: 브라우저 새 탭으로 연다.
      globalThis.open?.(msg.openUrl, "_blank", "noopener");
      return;
    }
    if (msg.screenOps && msg.id == null) {
      onScreenOps?.(msg.screenOps);
      return;
    }
    if (Array.isArray(msg.fontFaces) && msg.id == null) {
      onFontFaces?.(msg.fontFaces);
      return;
    }
    const wait = pending.get(msg.id);
    if (!wait) return;
    pending.delete(msg.id);
    if (msg.ok) wait.resolve(msg.result);
    else {
      console.log(`[Worker Error]\nMessage: ${msg.error || "코어 오류"}`);
      wait.reject(new Error(msg.error || "코어 오류"));
    }
  };
  worker.onerror = function (errorEvent) {
    const errorData = `[Worker Error]\nMessage: ${errorEvent.message}\nFile: ${errorEvent.filename}\nLine: ${errorEvent.lineno}`;
    console.log(errorData);
    const error = new Error(errorEvent.message || "코어 워커 오류");
    for (const wait of pending.values()) wait.reject(error);
    pending.clear();
  };

  let closed = false;
  function call(op, payload = {}, transfer) {
    if (closed) return new Promise(() => {});
    const id = ++seq;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      worker.postMessage({ id, op, ...payload }, transfer || []);
    });
  }

  function copyBytes(bytes) {
    return bytes.slice();
  }

  return {
    // 워커를 닫는다. 기다리던 일과 뒤에 부른 일은 끝나지 않고 버려진다(닫은 보기가 오류를 내지 않게).
    close() {
      worker.terminate();
      pending.clear();
      closed = true;
    },
    // fonts 는 글꼴 서버 주소 또는 { base, index, licenseSwap, replace } 다(core-worker.js setFonts).
    boot: (fonts) => call("boot", { fonts }),
    trimCaches: (level) => call("trimCaches", { level }),
    setCacheBudget: (name, bytes) => call("setCacheBudget", { name, bytes }),
    cacheUsage: () => call("cacheUsage"),
    frameStats: () => call("frameStats"),
    memory: () => call("memory"),
    fetchFonts: (faces) => call("fetchFonts", { faces }),
    fontFiles: () => call("fontFiles"),
    parse(bytes, pretty, lineSegs) {
      const copy = copyBytes(bytes);
      return call("parse", { bytes: copy, pretty, lineSegs }, [copy.buffer]);
    },
    newDocument: () => call("new"),
    open(bytes, transfer = false) {
      const payload = transfer && bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
        ? bytes
        : copyBytes(bytes);
      return call("open", { bytes: payload }, [payload.buffer]);
    },
    // 암호를 기다리는 문서(open 이 needPassword 를 준 문서)를 이 암호로 연다.
    unlock: (password) => call("unlock", { password: String(password ?? "") }),
    // 열린 문서를 저장한다. 형식과 내려받을 이름(끝 붙이기)은 코어가 정한다. { bytes, name } 을 돌려준다.
    saveDocument: (name) => call("save", { name: String(name || "") }),
    // 저장된 줄 높이를 빌릴지는 core 가 정한다. measured 는 한글과 견주는 시험용이다.
    plan: (measured = false) => call("plan", { measured: !!measured }),
    beginGrind: () => call("beginGrind"),
    surface: (canvas, nogpu = false) => call("surface", { canvas, nogpu: !!nogpu }, [canvas]),
    // 캔버스를 넘길 수 없을 때. 코어가 정한 2D 그림 목록을 onScreenOps 로 받는다.
    surfaceRemote: () => call("surface", { remote: true }),
    view: (patch) => call("view", { patch }),
    // 화면 잡 한 걸음. 무엇을 굽고 그릴지, 언제 멈출지는 core 가 정한다.
    // 단축키 표(키 → 명령). 셸은 받아 두고 키를 누를 때 찾아본다.
    keyBindings: () => call("keyBindings"),
    // 배율 대화 상자의 값(미리 정한 배율, 한 걸음, 칸 수). 적용은 input { type: "zoomDialog" } 이다.
    zoomDialogSpec: () => call("zoomDialogSpec"),
    // 입력칸 규칙 표(사건 → 그 자리에서 할 일). 셸은 받아 두고 입력칸 사건마다 찾아본다.
    fieldRules: () => call("fieldRules"),
    styleNames: () => call("styleNames"),
    // 막힌 글꼴 대체 기억. 저장은 셸, 규칙은 코어다.
    setFontSwapPreferences: (json) => call("setFontSwapPreferences", { json: String(json || "{}") }),
    setRecentColors: (saved) => call("setRecentColors", { saved: String(saved || "") }),
    rememberColor: (hex) => call("rememberColor", { hex: String(hex || "") }),
    fontSwapPreferences: () => call("fontSwapPreferences"),
    // 서식 대화 상자(0 글자, 1 문단, 2 편집 용지). 단위·범위·함께 바뀌는 값은 코어가 정한다.
    formatView: (kind, patch) => call("formatView", { kind, patch }),
    formatPreview: (kind, patch, w, h) => call("formatPreview", { kind, patch, w, h }),
    editFormatDialog: (kind, patch, whole) => call("editFormatDialog", { kind, patch, whole: !!whole }),
    // 마우스가 올라간 자리의 CSS 커서. 좌표는 뷰포트 장치 픽셀이다.
    hover: (x, y) => call("hover", { x, y }),
    pointer: (kind, page, x, y, percent) => call("pointer", { kind, page, x, y, percent }),
    // 입력기 사건(start·update·end·settle·insert·enter). 확정·바꿔 넣기는 코어가 정한다.
    // 편집 입력칸 사건. 무엇을 넣고 지울지, 입력칸을 언제 비울지는 코어가 정한다.
    // { field: 입력칸에 할 일, edit: 편집 결과(문서·캐럿을 건드리지 않았으면 null) } 를 돌려준다.
    editField: (event) => call("editField", { event: event || {} }),
    editText: (text, composing = false) => call("editText", { text: String(text ?? ""), composing: !!composing }),
    // 고른 글 지우기(오려두기·블록 지우기). 고른 글이 없으면 코어가 아무것도 하지 않는다.
    editDeleteSelection: () => call("editDeleteSelection"),
    editKey: (key, shift = false, ctrl = false, alt = false) =>
      call("editKey", { key: key | 0, shift: !!shift, ctrl: !!ctrl, alt: !!alt }),
    editStyle: (patch) => call("editStyle", { patch: patch || {} }),
    // 되돌리기·다시 실행. 남길 칸과 되돌릴 자리는 코어가 정한다.
    editUndo: () => call("editUndo"),
    editRedo: () => call("editRedo"),
    // 표 넣기. 표 모양은 코어가 정한다.
    editInsertTable: (rows, cols) => call("editInsertTable", { rows: rows | 0, cols: cols | 0 }),
    // 나누기(page, column, columnDef, section). 자리와 규칙은 코어가 정한다.
    editInsertBreak: (kind) => call("editInsertBreak", { kind: String(kind) }),
    // 쪽 탭 컨트롤(header, footer, deleteBand, pageNumber, newNumber, pageHiding). 자리와 규칙은 코어가 정한다.
    // 각주(endnote 면 미주) 넣기. 자리와 모양은 코어가 정한다.
    editInsertNote: (endnote) => call("editInsertNote", { endnote: !!endnote }),
    // 단 설정. 값 이름과 계산은 코어(columnView·editColumns)가 정한다.
    editColumns: (fields) => call("editColumns", { fields: fields || {} }),
    // 구역 설정. 값 이름과 규칙은 코어(sectionSettingsView·editSectionSettings)가 정한다.
    editSectionSettings: (fields) => call("editSectionSettings", { fields: fields || {} }),
    sectionSettingsView: () => call("sectionSettingsView", {}),
    // 캡션(고른 개체, 아니면 캐럿 표). 규칙은 코어(editCaption)가 정한다.
    editCaption: (caption) => call("editCaption", { caption: String(caption) }),
    // 책갈피·찾아가기. 규칙은 코어(editBookmark·editGoToPage)가 정한다.
    editBookmark: (action, name, newName) => call("editBookmark", { action: String(action), name: String(name ?? ""), newName: String(newName ?? "") }),
    editGoToPage: (page) => call("editGoToPage", { page: Number(page) | 0 }),
    editGoToSection: (section) => call("editGoToSection", { section: Number(section) | 0 }),
    editGoTo: (fields) => call("editGoTo", { fields: fields || {} }),
    goToView: () => call("goToView", {}),
    editExchangeNotes: (mode) => call("editExchangeNotes", { mode: Number(mode) | 0 }),
    editTableText: (fields) => call("editTableText", { fields: fields || {} }),
    editDeleteMarks: (fields) => call("editDeleteMarks", { fields: fields || {} }),
    editCopyShape: (action, type) => call("editCopyShape", { action: String(action), type: Number(type) | 0 }),
    bookmarkView: () => call("bookmarkView", {}),
    // 누름틀 고치기. 값 이름(direction, memo, name, editable)과 규칙은 코어가 정한다.
    clickHereView: () => call("clickHereView", {}),
    editClickHere: (fields) => call("editClickHere", { fields: fields || {} }),
    // 스타일 대화 상자. 목록·정보·초안과 명령 규칙은 코어(styleViewNow·editStyleCommand)가 정한다.
    styleView: (styleId) => call("styleView", { styleId: Number(styleId) | 0 }),
    styleCommand: (action, fields) => call("styleCommand", { action: String(action), fields: fields || {} }),
    // 차례 만들기·새로 고침. 규칙은 코어(editToc)가 정한다.
    tocCommand: (action, fields) => call("tocCommand", { action: String(action), fields: fields || {} }),
    // 스타일 가져오기 파일(바이트)과 스타일 내보내기(HWPX 바이트).
    openStyleSource: (bytes) => call("openStyleSource", { bytes }),
    exportStyles: () => call("exportStyles", {}),
    // 표/셀 속성. 값 이름과 규칙은 코어(tablePropertiesView·editTableProperties)가 정한다.
    editTableProperties: (fields) => call("editTableProperties", { fields: fields || {} }),
    tablePropertiesView: () => call("tablePropertiesView", {}),
    // 덧말 넣기·글자 겹치기. 값 이름과 규칙은 코어(glyphGroupView·editGlyphGroup)가 정한다.
    editGlyphGroup: (fields) => call("editGlyphGroup", { fields: fields || {} }),
    glyphGroupView: () => call("glyphGroupView", {}),
    // 글자 바꾸기(대문자/소문자·전각/반각). 바꾸는 규칙은 코어(editConvertText)가 정한다.
    editConvertText: (fields) => call("editConvertText", { fields: fields || {} }),
    // 정렬(글 블록은 본문 정렬, 칸 블록은 표 정렬). 무엇을 어떤 차례로 할지는 코어(editSortParagraphs·sortView)가 정한다.
    editSortParagraphs: (fields) => call("editSortParagraphs", { fields: fields || {} }),
    sortView: (fields) => call("sortView", { fields: fields || {} }),
    // 계산식 대화 상자 값(캐럿 칸 이름, 캐럿이 계산식 결과 안이면 그 식과 형식).
    tableFormulaView: () => call("tableFormulaView", {}),
    // 주석 모양. 값 이름과 규칙은 코어(noteShapeView·editNoteShape)가 정한다.
    editNoteShape: (fields, endnote, whole) => call("editNoteShape", { fields: fields || {}, endnote: !!endnote, whole: !!whole }),
    noteShapeView: (endnote) => call("noteShapeView", { endnote: !!endnote }),
    columnView: (fields) => call("columnView", { fields: fields || {} }),
    // 보기 격자·안내선. 값 이름과 계산은 코어(viewGuides·applyViewGuides)가 정한다.
    viewGuides: (fields) => call("viewGuides", { fields: fields || {} }),
    applyViewGuides: (fields) => call("applyViewGuides", { fields: fields || {} }),
    // 하이퍼링크 넣기. 필드와 글자 모양은 코어가 정한다.
    editInsertHyperlink: (text, url) => call("editInsertHyperlink", { text: String(text ?? ""), url: String(url ?? "") }),
    // PDF 바이트(ArrayBuffer). 쪽을 어떻게 그려 묶을지는 코어가 정한다.
    exportPdf: (dpi) => call("exportPdf", { dpi: Number(dpi) || 200 }),
    // 수식 편집기. 넣을지·고칠지와 크기는 코어(equationView·editEquation)가 정하고, 미리 보기는 코어가 그린 SVG 다.
    equationView: () => call("equationView", {}),
    editEquation: (script, baseUnit) => call("editEquation", { script: String(script ?? ""), baseUnit: Number(baseUnit) || 0 }),
    equationPreview: (script, baseUnit) => call("equationPreview", { script: String(script ?? ""), baseUnit: Number(baseUnit) || 1000 }),
    editPageControl: (kind, fields) => call("editPageControl", { kind: String(kind), fields: fields || {} }),
    pageControlFields: (kind) => call("pageControlFields", { kind: String(kind) }),
    editShortcut: (command) => call("editShortcut", { command: String(command) }),
    editFindReplace: (mode, text, replacement, matchCase) =>
      call("editFindReplace", { mode: String(mode), text: String(text ?? ""), replacement: String(replacement ?? ""), matchCase: !!matchCase }),
    // 표 구조 편집. 칸(캐럿·칸 블록)과 규칙은 코어가 정한다.
    // 이름-값은 코어 TableEditCommand 의 필드 이름이다.
    editTable: (kind, fields = {}) => call("editTableFields", { kind: String(kind), fields: { after: true, count: 1, rows: 1, cols: 1, ...fields } }),
    // 도형 그리기 도구. 1 직사각형, 2 타원, 3 직선, 4 글상자, 5 세로 글상자, 0 끔. 끌기는 포인터 입력으로 간다.
    setDrawTool: (tool) => call("setDrawTool", { tool: tool | 0 }),
    // 그림 넣기. 파일 바이트만 넘긴다.
    editInsertPicture: (bytes) => {
      const payload = bytes instanceof Uint8Array ? bytes.slice() : new Uint8Array(bytes);
      return call("editInsertPicture", { bytes: payload }, [payload.buffer]);
    },
    // 글꼴 고르기 목록. 라이선스로 막힌 글꼴은 코어가 빼고 준다.
    pickableFonts: () => call("pickableFonts"),
    // 문서에서 막힌 글꼴과 편집할 때 바뀔 글꼴 [{ from, to }].
    licenseFontSwaps: () => call("licenseFontSwaps"),
    formatFields: () => call("formatFields"),
    // 편집 용지. 값 이름과 단위(HWPUNIT)는 코어가 정한다. whole 이면 모든 구역에 적용한다.
    pageSetupFields: () => call("pageSetupFields"),
    editPageSetup: (patch, whole = false) => call("editPageSetup", { patch: patch || {}, whole: !!whole }),
    editSwapFonts: (chosen) => call("editSwapFonts", { chosen }),
    // 글꼴 바꾸기를 그만두면 묻는 동안 남겨 둔 개체 넣기(표·그림·그린 도형)를 버린다.
    dropPendingInsert: () => call("dropPendingInsert"),
    // 포인터·휠·제스처·틱·스크롤·배율. 코어가 스크롤과 배율을 바꾸고 막대 사각형을 돌려준다.
    input: (event) => call("input", { event }),
  };
}
