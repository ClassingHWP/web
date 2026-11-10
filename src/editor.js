// 보기(viewer.js)에 붙는 편집 셸. 숨은 입력칸(입력기), 편집 차례, 서식·개체 넣기, 막힌 글꼴 바꾸기, 최근 색을 맡는다.
// 무엇을 넣고 지울지, 서식의 단위·범위, 기억할 값은 코어가 정한다. 여기서는 플랫폼 사건을 바꿔 넘기고 결과를 옮긴다.
//
// ctx 는 보기가 넘긴다: session, coreReady, readOnly(), sceneReady(), applyEditResult(result), emit(type, detail),
// emitCursorStyle(style), findKey(event), keyBindings(), logError(stage, error).

export function attachEditor(ctx) {
  const { session, coreReady, logError } = ctx;

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
  function resetInput(endComposition = false) {
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
    if (!fromField) resetInput();
    const run = editChain.then(async () => {
      await coreReady;
      const result = await task();
      ctx.applyEditResult(result);
      return result;
    });
    editChain = run.then(() => {}, () => {});
    return run;
  }

  function ensureInput() {
    if (editorInput instanceof HTMLInputElement && editorInput.isConnected) return editorInput;
    // 한 줄 입력칸이다. 아이패드 크롬은 여러 줄 입력칸(textarea)에 한글을 치면 키마다 메인 스레드를
    // 수백 ms 붙잡아 키가 줄을 선다(같은 기기에서 input 은 대기 중간값 10ms, textarea 는 1.5초). 줄 바꿈은 Enter 키로 온다.
    const el = document.createElement("input");
    el.type = "text";
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
      // 편집 키와 단축키는 보기의 단축키 처리(window keydown)가 맡는다. 입력칸에서만 쓰는 키는 여기서 보낸다.
      const binding = ctx.findKey(event);
      if (!binding?.editorOnly || binding.command !== "editKey") return;
      event.preventDefault();
      editKey(binding, event);
    });
    document.body.append(el);
    editorInput = el;
    return el;
  }

  function focusInput() {
    // 보기 전용에서는 입력칸을 쓰지 않는다. 터치에서 화면 자판이 뜨지 않게 한다.
    if (ctx.readOnly()) return;
    const el = ensureInput();
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

  function editKey(binding, event) {
    return queueEdit(() =>
      session.editKey(binding.editKey, !!event.shiftKey, !!(event.ctrlKey || event.metaKey), !!event.altKey));
  }
  function editKeyNamed(name, shift = false) {
    const code = ctx.keyBindings().find((item) => item.key === name && item.command === "editKey")?.editKey | 0;
    return queueEdit(() => session.editKey(code, shift, false, false));
  }

  // 화면 사건 모양만 풀어서 이름·값을 그대로 넘긴다. 이름·단위·범위는 코어(setFormatField)가 정한다.
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

  function applyStyle(raw, defaultKey = null) {
    const patch = normalizeFormatPatch(raw, defaultKey);
    if (!patch) return Promise.resolve(null);
    // 고른 글꼴은 편집한 뒤 코어가 받으라고 부르고, 받으면 문서를 다시 놓는다.
    return queueEdit(() => session.editStyle(patch));
  }

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
    ctx.emit("colors", memory);
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
  void coreReady.then(() => session.fieldRules()).then((list) => {
    if (Array.isArray(list)) fieldTable = list;
  }).catch((error) => logError("fieldRules", error));

  // 라이선스로 막힌 글꼴이 있으면 코어가 편집을 받지 않는다(needsFontSwap). 바꿀지 묻고, 바꾸면 한꺼번에 바꾼다.
  let fontSwapAsking = false;
  function askFontSwap() {
    if (fontSwapAsking) return;
    fontSwapAsking = true;
    // 조합 중이던 글자는 코어에 들어가지 않았다. 입력 칸을 비워 대화 상자 뒤로 남지 않게 한다.
    if (editorInput) {
      resetInput(true);
      editorInput.blur();
    }
    void session.licenseFontSwaps().then((swaps) => {
      if (!Array.isArray(swaps) || !swaps.length) {
        fontSwapAsking = false;
        return;
      }
      ctx.emit("fontswapask", { swaps });
    }, (error) => {
      fontSwapAsking = false;
      logError("licenseFontSwaps", error);
    });
  }
  // chosen 은 대화 상자에서 고른 {막힌 글꼴: 바꿀 글꼴}이다. 고를 수 있는 글꼴인지는 코어가 다시 본다.
  function applyFontSwap(chosen) {
    const picked = chosen && typeof chosen === "object" ? chosen : {};
    return queueEdit(async () => {
      // 바꿔 넣을 글꼴은 바꾼 뒤 코어가 받으라고 부르고, 받으면 문서를 다시 놓는다.
      const result = await session.editSwapFonts(picked);
      try {
        window.localStorage.setItem(swapChoiceKey, await session.fontSwapPreferences());
      } catch {
        // 저장하지 못해도 이번 바꾸기는 그대로 한다.
      }
      return result;
    }).then((result) => {
      if (result?.cursorStyle) ctx.emitCursorStyle(result.cursorStyle);
    }, (error) => logError("editSwapFonts", error)).finally(() => {
      fontSwapAsking = false;
      focusInput();
    });
  }
  function cancelFontSwap() {
    fontSwapAsking = false;
    void session.dropPendingInsert().catch((error) => logError("dropPendingInsert", error));
    focusInput();
  }

  // 고른 글에 하는 편집. 복사는 보기가 한다.
  function selectionAction(action, selectedText, copyText) {
    if (ctx.readOnly()) return;
    if (action === "undo" || action === "redo") {
      if (!ctx.sceneReady()) return;
      void queueEdit(() => (action === "undo" ? session.editUndo() : session.editRedo()));
      return;
    }
    if (action === "cut" || action === "delete") {
      // 클립보드에 넣는 일은 플랫폼 일이라 누른 그 자리에서 한다. 지우기는 코어가 고른 글을 보고 한다.
      if (action === "cut" && selectedText) copyText(selectedText);
      void queueEdit(() => session.editDeleteSelection());
      return;
    }
    if (action === "paste") {
      const read = navigator.clipboard?.readText;
      if (!read) return;
      // 메뉴 붙여 넣기도 키보드 붙여 넣기와 같은 입력칸 사건이다.
      void read.call(navigator.clipboard).then((text) => {
        if (!text) return;
        ensureInput();
        fieldEvent({ kind: "paste", data: text });
      }).catch((error) => logError("paste", error));
    }
  }

  const blocked = () => ctx.readOnly() || !ctx.sceneReady();
  return {
    isInput: (target) => !!editorInput && target === editorInput,
    composing: () => fieldComposing,
    // 입력칸에 맡길 키(글이 남은 입력칸의 지우기)인지.
    keyGoesToField: (event) => fieldActions(fieldKeyEvent(event)).toField,
    focusInput,
    resetInput,
    blurInput: () => editorInput?.blur(),
    editKey,
    queueEdit,
    afterEdits,
    askFontSwap,
    applyFontSwap,
    cancelFontSwap,
    selectionAction,
    applyStyle,
    // 상태 줄의 삽입/수정 단추. Insert 키와 같은 길이다.
    toggleOverwrite() {
      focusInput();
      return editKeyNamed("Insert");
    },
    // 리본의 머리말·꼬리말 닫기. 입력칸의 Shift+Esc 와 같은 길이다.
    // 각주·미주에서 나가기(주석 탭 닫기). 무엇을 할지는 코어 단축키 명령 leaveNote 가 정한다.
    leaveNote() {
      if (blocked()) return Promise.resolve(null);
      return queueEdit(() => session.editShortcut("leaveNote"));
    },
    leaveBand() {
      focusInput();
      return editKeyNamed("Escape", true);
    },
    rememberColor(hex) {
      return session.rememberColor(hex).then(publishColors).catch((error) => logError("rememberColor", error));
    },
    // 서식 대화 상자. 칸 이름과 칸에 친 값을 그대로 넘기고, 받은 값을 그대로 보인다.
    async formatView(kind, patch) {
      await coreReady;
      return session.formatView(kind, patch || {});
    },
    async formatPreview(kind, patch, w, h) {
      await coreReady;
      return session.formatPreview(kind, patch || {}, w, h);
    },
    applyFormatDialog(kind, patch, whole = false) {
      if (!patch || typeof patch !== "object" || Object.keys(patch).length === 0) return Promise.resolve(null);
      return queueEdit(() => session.editFormatDialog(kind, patch, whole));
    },
    // 글자 모양·문단 모양 대화 상자가 열릴 때 지금 자리의 값을 받는다.
    async formatFields() {
      await coreReady;
      return session.formatFields();
    },
    // 편집 용지 대화 상자·세로/가로·쪽 여백 메뉴. 값은 고친 것만 넘긴다.
    async pageSetupFields() {
      await coreReady;
      return session.pageSetupFields();
    },
    applyPageSetup(patch, whole = false) {
      if (!patch || typeof patch !== "object" || Object.keys(patch).length === 0) return Promise.resolve(null);
      return queueEdit(() => session.editPageSetup(patch, whole));
    },
    // 도형 그리기. 도구만 켜고, 끌기와 넣기는 코어가 포인터 입력으로 한다.
    drawShape(tool) {
      if (blocked()) return Promise.resolve(null);
      return session.setDrawTool(tool);
    },
    // 그림 넣기. 고른 파일 바이트를 그대로 코어에 넘긴다. 모르는 파일이면 코어가 넣지 않는다.
    insertPicture(bytes) {
      if (blocked() || !bytes) return Promise.resolve(null);
      return queueEdit(() => session.editInsertPicture(bytes));
    },
    // 표 만들기 대화 상자.
    insertTable(rows, cols) {
      if (blocked()) return Promise.resolve(null);
      return queueEdit(() => session.editInsertTable(rows, cols));
    },
    // 단축키 편집 명령(코어 keyBindings 의 command). 무엇을 할지는 코어가 캐럿 상태를 보고 정한다.
    shortcut(command) {
      if (command !== "repeatFind" && blocked()) return Promise.resolve(null);
      return queueEdit(() => session.editShortcut(command));
    },
    // 나누기: page, column, columnDef, section.
    insertBreak(kind) {
      if (blocked()) return Promise.resolve(null);
      return queueEdit(() => session.editInsertBreak(kind));
    },
    // 문자표에서 고른 글자. 붙여 넣기와 같은 입력칸 사건이다.
    insertSymbol(text) {
      if (blocked() || !text) return;
      ensureInput();
      fieldEvent({ kind: "paste", data: String(text) });
    },
    // 하이퍼링크 넣기.
    insertHyperlink(text, url) {
      if (blocked()) return Promise.resolve(null);
      return queueEdit(() => session.editInsertHyperlink(text, url));
    },
    // 주석 모양.
    noteShape(fields, endnote, whole) {
      if (blocked()) return Promise.resolve(null);
      return queueEdit(() => session.editNoteShape(fields, endnote, whole));
    },
    async noteShapeView(endnote) {
      await coreReady;
      return session.noteShapeView(endnote);
    },
    // 캡션.
    caption(caption) {
      if (blocked()) return Promise.resolve(null);
      return queueEdit(() => session.editCaption(caption));
    },
    // 책갈피·찾아가기. 이동(goto·쪽)은 읽기 전용에서도 한다.
    bookmark(action, name, newName) {
      if (action !== "goto" && blocked()) return Promise.resolve(null);
      return queueEdit(() => session.editBookmark(action, name, newName));
    },
    goTo(fields) {
      return queueEdit(() => session.editGoTo(fields));
    },
    deleteMarks(fields) {
      if (blocked()) return Promise.resolve(null);
      return queueEdit(() => session.editDeleteMarks(fields));
    },
    tableText(fields) {
      if (blocked()) return Promise.resolve(null);
      return queueEdit(() => session.editTableText(fields));
    },
    copyShape(action, type) {
      if (blocked()) return Promise.resolve(null);
      return queueEdit(() => session.editCopyShape(action, type));
    },
    exchangeNotes(mode) {
      if (blocked()) return Promise.resolve(null);
      return queueEdit(() => session.editExchangeNotes(mode));
    },
    async goToView() {
      return session.goToView();
    },
    goToSection(section) {
      return queueEdit(() => session.editGoToSection(section));
    },
    goToPage(page) {
      return queueEdit(() => session.editGoToPage(page));
    },
    async bookmarkView() {
      await coreReady;
      return session.bookmarkView();
    },
    // 표/셀 속성.
    tableProperties(fields) {
      if (blocked()) return Promise.resolve(null);
      return queueEdit(() => session.editTableProperties(fields));
    },
    async tablePropertiesView() {
      await coreReady;
      return session.tablePropertiesView();
    },
    // 덧말 넣기·글자 겹치기.
    glyphGroup(fields) {
      if (blocked()) return Promise.resolve(null);
      return queueEdit(() => session.editGlyphGroup(fields));
    },
    // 글자 바꾸기.
    convertText(fields) {
      if (blocked()) return Promise.resolve(null);
      return queueEdit(() => session.editConvertText(fields));
    },
    sortParagraphs(fields) {
      if (blocked()) return Promise.resolve(null);
      return queueEdit(() => session.editSortParagraphs(fields));
    },
    async tableFormulaView() {
      await coreReady;
      return session.tableFormulaView();
    },
    async sortView(fields) {
      await coreReady;
      return session.sortView(fields);
    },
    async glyphGroupView() {
      await coreReady;
      return session.glyphGroupView();
    },
    // 구역 설정.
    sectionSettings(fields) {
      if (blocked()) return Promise.resolve(null);
      return queueEdit(() => session.editSectionSettings(fields));
    },
    async sectionSettingsView() {
      await coreReady;
      return session.sectionSettingsView();
    },
    // 단 설정.
    columns(fields) {
      if (blocked()) return Promise.resolve(null);
      return queueEdit(() => session.editColumns(fields));
    },
    async columnView(fields) {
      await coreReady;
      return session.columnView(fields);
    },
    // 각주·미주 넣기.
    insertNote(endnote) {
      if (blocked()) return Promise.resolve(null);
      return queueEdit(() => session.editInsertNote(endnote));
    },
    // 쪽 탭 컨트롤: header, footer, deleteBand, pageNumber, newNumber, pageHiding.
    pageControl(kind, fields) {
      if (blocked()) return Promise.resolve(null);
      return queueEdit(() => session.editPageControl(kind, fields));
    },
    async pageControlFields(kind) {
      await coreReady;
      return session.pageControlFields(kind);
    },
    // 찾기·바꾸기: find, findBack, replace, replaceAll. 찾기는 읽기 전용 문서에서도 한다.
    findReplace(mode, text, replacement, matchCase) {
      if (mode !== "find" && mode !== "findBack" && blocked()) return Promise.resolve(null);
      return queueEdit(() => session.editFindReplace(mode, text, replacement, matchCase));
    },
    // 표 구조 편집: insertRows, insertColumns, deleteRows, deleteColumns, mergeCells, splitCell.
    tableEdit(kind, options) {
      if (blocked()) return Promise.resolve(null);
      return queueEdit(() => session.editTable(kind, options));
    },
    destroy() {
      for (const timer of fieldTimers.values()) clearTimeout(timer);
      fieldTimers.clear();
      editorInput?.remove();
      editorInput = null;
    },
  };
}
