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
