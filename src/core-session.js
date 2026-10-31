// UI 가 코어에 시키는 순서.
// 웹은 이 파일을 통해 워커와 이야기하고, 앱은 같은 호출을 자기 통신으로 바꾸면 된다.
// 포인터, 휠, 제스처 구분은 셸이 한다. 스크롤과 핀치 배율은 input 으로 코어에 맡긴다.
//
// 1. boot        코어를 올린다
// 2. fonts       글꼴 목록이 끝날 때까지 기다린다. 목록 요청 자체는 boot 에서 이미 나가 있다
//    prefetchFonts  목록에 있는 글꼴의 주소만 받는다. 없는 글꼴은 주소가 없다
//    installFonts   본문이 받아 온 글꼴 바이트를 코어에 넣는다
//    fontFiles      코어가 요청한 글꼴이 도착해 코어에 들어갔는지 본다
// 3. parse/open  문서를 읽고, 코어가 글꼴 이름을 셸에 알린다
//    exportDocument  열린 문서를 hwp 또는 hwpx 바이트로 받는다
// 4. plan        쪽 수. 구조는 우리 조판. lineseg 면 저장된 줄 높이만 빌린다. 글리프 윤곽은 없다
//    beginGrind  글꼴을 넣은 다음 부른다. 화면 스레드를 남기고 나머지가 칸을 굽는다
//    코어가 글꼴 이름을 알리면 셸이 받아 도착하는 대로 넣고, 쪽 계산은 그 받기가 끝난 뒤에 한다
// 5. render      요청한 줄이나 개체만 그린다

export function createCoreSession(onLog, onCamera, onFontFaces) {
  // ?threads=1 이면 스레드를 쓸 수 있어도 단일 스레드 WASM 으로 띄운다(시험용).
  const single = new URLSearchParams(globalThis.location?.search || "").get("threads") === "1";
  const worker = new Worker(new URL("./core-worker.js", import.meta.url), {
    type: "module",
    name: single ? "single" : "core",
  });
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

  function call(op, payload = {}, transfer) {
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
    boot: () => call("boot"),
    trimCaches: (level) => call("trimCaches", { level }),
    setCacheBudget: (name, bytes) => call("setCacheBudget", { name, bytes }),
    cacheUsage: () => call("cacheUsage"),
    fonts: () => call("fonts"),
    prefetchFonts: (faces) => call("prefetchFonts", { faces }),
    installFonts(files) {
      const payload = (files || []).map((item) => ({ face: item.face, faces: item.faces, bytes: item.bytes }));
      return call("installFonts", { files: payload }, payload.map((item) => item.bytes.buffer));
    },
    fontFiles: () => call("fontFiles"),
    ensurePageSpans: (page) => call("ensurePageSpans", { page }),
    pageFaces: (page) => call("pageFaces", { page }),
    documentFaces: () => call("documentFaces"),
    warmDocument: (percent) => call("warmDocument", { percent }),
    warmGlyphs: (page, percent) => call("warmGlyphs", { page, percent }),
    preparePage: (page, percent, focusY) => call("preparePage", { page, percent, focusY }),
    idle: (patch) => call("idle", { patch }),
    readyPages: (pages) => call("readyPages", { pages }),
    parse(bytes, pretty, lineSegs) {
      const copy = copyBytes(bytes);
      return call("parse", { bytes: copy, pretty, lineSegs }, [copy.buffer]);
    },
    replaceFontFace: (from, to) => call("replaceFontFace", { from: String(from || ""), to: String(to || "") }),
    newDocument: () => call("new"),
    open(bytes, transfer = false) {
      const payload = transfer && bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
        ? bytes
        : copyBytes(bytes);
      return call("open", { bytes: payload }, [payload.buffer]);
    },
    exportDocument: (format) => call("export", { format: String(format || "") }),
    plan: (lineSeg, measured = false) => call("plan", { lineSeg, measured: !!measured }),
    beginGrind: () => call("beginGrind"),
    render: (page, pixelHeight, view) => call("render", { page, pixelHeight, view, tile: view?.id | 0, frame: view?.frame | 0 }),
    surface: (canvas, nogpu = false) => call("surface", { canvas, nogpu: !!nogpu }, [canvas]),
    present: (w, h, scrollX, scrollY, layoutZoom, dragging) =>
      call("present", { w, h, scrollX, scrollY, layoutZoom, dragging: !!dragging }),
    view: (patch) => call("view", { patch }),
    caret: (page, x, y) => call("caret", { page, x, y }),
    caretStory: (page, x, y, story) => call("caretStory", { page, x, y, story }),
    cursorStyle: () => call("cursorStyle"),
    // 마우스가 올라간 자리의 CSS 커서. 좌표는 뷰포트 장치 픽셀이다.
    hover: (x, y) => call("hover", { x, y }),
    block: (story, aPara, aOff, bPara, bOff) => call("block", { story, aPara, aOff, bPara, bOff }),
    pointer: (kind, page, x, y, percent) => call("pointer", { kind, page, x, y, percent }),
    editText: (text, composing = false) => call("editText", { text: String(text ?? ""), composing: !!composing }),
    editCommit: () => call("editCommit"),
    editKey: (key, shift = false, ctrl = false, alt = false) =>
      call("editKey", { key: key | 0, shift: !!shift, ctrl: !!ctrl, alt: !!alt }),
    editStyle: (patch) => call("editStyle", { patch: patch || {} }),
    // 글꼴 고르기 목록. 라이선스로 막힌 글꼴은 코어가 빼고 준다.
    pickableFonts: () => call("pickableFonts"),
    // 문서에서 막힌 글꼴과 편집할 때 바뀔 글꼴 [{ from, to }].
    licenseFontSwaps: () => call("licenseFontSwaps"),
    formatFields: () => call("formatFields"),
    editSwapFonts: (chosen) => call("editSwapFonts", { chosen }),
    // 포인터·휠·제스처·틱·스크롤·배율. 코어가 스크롤과 배율을 바꾸고 막대 사각형을 돌려준다.
    input: (event) => call("input", { event }),
  };
}
