import { useEffect, useState } from "react";

// 메뉴·리본·상태 줄이 같이 쓰는 명령. 창 사건으로 보기(app-viewer.js)에 넘긴다.

export function newDocument() {
  window.dispatchEvent(new Event("chwp-new-document"));
}

// 전체 화면 켜고 끄기. 화면을 차지하는 일은 플랫폼(브라우저) 일이다.
export function toggleFullScreen() {
  const doc = document;
  if (doc.fullscreenElement) {
    void doc.exitFullscreen?.().catch(() => {});
    return;
  }
  void doc.documentElement.requestFullscreen?.().catch(() => toast("전체 화면으로 바꿀 수 없습니다.", "info", null, { key: "fullscreen" }));
}

export function openFile() {
  const input = document.getElementById("file");
  if (input instanceof HTMLInputElement) input.click();
}

// 도형 그리기. 다음 끌기 한 번으로 그 도형을 그린다. 1 직사각형, 2 타원, 3 직선, 4 글상자, 5 세로 글상자.
export function drawShape(tool) {
  if (typeof window.__chwpDrawShape === "function") void window.__chwpDrawShape(tool);
}

// 그림 넣기. 파일을 고르면 그 바이트를 편집기에 넘긴다.
export function pickPicture() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/png,image/jpeg,image/gif,image/bmp,.png,.jpg,.jpeg,.gif,.bmp";
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file || typeof window.__chwpInsertPicture !== "function") return;
    void file.arrayBuffer().then((buffer) => window.__chwpInsertPicture(new Uint8Array(buffer)));
  });
  input.click();
}

export function saveAs() {
  window.dispatchEvent(new Event("chwp-save-as"));
}

// 눈금자 켜고 끄기. 켠 값은 코어가 들고 있고 바뀌면 chwp-rulers-changed 로 알린다.
export function toggleRulers() {
  window.dispatchEvent(new Event("chwp-rulers"));
}

export function useRulersShown() {
  const [on, setOn] = useState(() => !!window.__chwpRulersWanted);
  useEffect(() => {
    const onChange = (event) => setOn(!!event.detail?.on);
    window.addEventListener("chwp-rulers-changed", onChange);
    return () => window.removeEventListener("chwp-rulers-changed", onChange);
  }, []);
  return on;
}

// 보기 격자·안내선. 값과 켜고 끄기는 코어가 정하고, 바뀌면 chwp-guides-changed 로 알린다.
export function applyViewGuides(fields) {
  if (typeof window.__chwpApplyViewGuides !== "function") return Promise.resolve(null);
  return Promise.resolve(window.__chwpApplyViewGuides(fields));
}

// 격자·안내선 대화 상자 값(고른 값을 얹어 코어가 다시 계산한 값). 바꾸지는 않는다.
export function viewGuidesView(fields) {
  if (typeof window.__chwpViewGuidesView !== "function") return Promise.resolve(null);
  return Promise.resolve(window.__chwpViewGuidesView(fields));
}

export function useViewGuides() {
  const [fields, setFields] = useState(() => window.__chwpViewGuides || null);
  useEffect(() => {
    const onChange = (event) => setFields(event.detail || null);
    window.addEventListener("chwp-guides-changed", onChange);
    return () => window.removeEventListener("chwp-guides-changed", onChange);
  }, []);
  return fields;
}

export function requestZoom(detail) {
  window.dispatchEvent(new CustomEvent("chwp-zoom", { detail }));
}

// 블록 메뉴와 같은 길로 오려두기·복사하기·붙여넣기를 한다.
export function selectionAction(action) {
  window.dispatchEvent(new CustomEvent("chwp-selection-action", { detail: { action } }));
}

// 넓은 화면(데스크톱 배치)인가. 좁으면 휴대폰 시안을 쓴다.
export function useWide() {
  const query = "(min-width: 64rem)";
  const [wide, setWide] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const media = window.matchMedia(query);
    // 기기 크기 흉내 등으로 change 가 오지 않을 때가 있어 창 크기 바뀜에도 다시 본다.
    const onChange = () => setWide(window.matchMedia(query).matches);
    media.addEventListener("change", onChange);
    window.addEventListener("resize", onChange);
    return () => {
      media.removeEventListener("change", onChange);
      window.removeEventListener("resize", onChange);
    };
  }, []);
  return wide;
}

// 머리말·꼬리말 편집 상태. 코어 커서 상태의 band 다(0 본문, 1 머리말, 2 꼬리말).
export function useBand() {
  const [band, setBand] = useState(() => Number(window.__chwpCursorStyle?.caret?.band) || 0);
  useEffect(() => {
    const onCaret = (event) => setBand(Number(event.detail?.band) || 0);
    window.addEventListener("chwp-caret-status", onCaret);
    return () => window.removeEventListener("chwp-caret-status", onCaret);
  }, []);
  return band;
}

// 최근 색과 글자 색 단추의 처음 색. 코어가 정해 알려 준다.
export function useColorMemory() {
  const [memory, setMemory] = useState(() => window.__chwpColors || { recent: [], pen: "" });
  useEffect(() => {
    const onColors = (event) => setMemory(event.detail);
    window.addEventListener("chwp-colors", onColors);
    return () => window.removeEventListener("chwp-colors", onColors);
  }, []);
  return memory;
}

// 고른 색을 최근 색에 넣는다.
export function rememberColor(hex) {
  window.dispatchEvent(new CustomEvent("chwp-remember-color", { detail: hex }));
}

// 삽입·수정 모드. 코어 커서 상태의 overwrite 다.
export function useOverwrite() {
  const [on, setOn] = useState(() => !!window.__chwpCursorStyle?.caret?.overwrite);
  useEffect(() => {
    const onCaret = (event) => setOn(!!event.detail?.overwrite);
    window.addEventListener("chwp-caret-status", onCaret);
    return () => window.removeEventListener("chwp-caret-status", onCaret);
  }, []);
  return on;
}

// 삽입·수정을 바꾼다. Insert 키와 같다.
export function toggleOverwrite() {
  window.dispatchEvent(new Event("chwp-toggle-overwrite"));
}

// 바탕쪽 편집 중인가(코어 caret.master). 바탕쪽 탭을 보일지 정한다.
export function useMaster() {
  const [master, setMaster] = useState(() => !!window.__chwpCursorStyle?.caret?.master);
  useEffect(() => {
    const onCaret = (event) => setMaster(!!event.detail?.master);
    window.addEventListener("chwp-caret-status", onCaret);
    return () => window.removeEventListener("chwp-caret-status", onCaret);
  }, []);
  return master;
}

// 바탕쪽 도구 상자의 켜고 끄기(front 맨 위로·duplicate 겹치게 하기·excludeFirst 첫 쪽 제외). 지금 값은 코어에서 받아 뒤집는다.
export function toggleMasterOption(key) {
  return pageControlFields("masterOptions").then((view) => (view?.inMaster ? pageControl("masterOptions", { [key]: !view[key] }) : null));
}

// 줄 번호 표시 켜고 끄기(한글 ShowLineNumbers). 캐럿 구역의 구역 설정이다. 처음 켜면 코어가 한글 기본값을 넣는다.
export function toggleLineNumbers() {
  return sectionSettingsView().then((view) => (view ? setSectionSettings({ lineNumberShow: !view.lineNumberShow }) : null));
}

// 현재 문단에서 줄 번호 숨기기(한글 SuppressLineNumbers). 캐럿·블록 문단의 문단 모양이다.
export function toggleSuppressLineNumbers() {
  if (typeof window.__chwpFormatView !== "function" || typeof window.__chwpApplyFormatDialog !== "function") return Promise.resolve(null);
  return Promise.resolve(window.__chwpFormatView(1, {})).then((view) =>
    window.__chwpApplyFormatDialog(1, { suppressLineNumbers: !view?.values?.suppressLineNumbers }));
}

// 머리말·꼬리말 편집을 끝낸다. Shift+Esc 와 같다.
export function leaveBand() {
  window.dispatchEvent(new Event("chwp-leave-band"));
}

// 각주·미주에서 나간다(주석 탭 닫기).
export function leaveNote() {
  window.dispatchEvent(new Event("chwp-leave-note"));
}

// 캐럿이 각주(1)·미주(2) 안인가(코어 caret.note). 주석 탭을 보일지 정한다.
export function useNote() {
  const [note, setNote] = useState(() => Number(window.__chwpCursorStyle?.caret?.note) || 0);
  useEffect(() => {
    const onCaret = (event) => setNote(Number(event.detail?.note) || 0);
    window.addEventListener("chwp-caret-status", onCaret);
    return () => window.removeEventListener("chwp-caret-status", onCaret);
  }, []);
  return note;
}

// 토스트를 띄운다. kind 는 info(알림) · saved(저장됨) · undo(되돌리기) · error(오류)이고,
// action 은 { label, run } 이다(되돌리기·다시 시도 단추). options.key 가 같은 알림은 새로 쌓지 않고,
// options.duration 은 머무는 밀리초다.
export function toast(text, kind = "info", action = null, options = {}) {
  window.dispatchEvent(new CustomEvent("chwp-toast", { detail: { text, kind, action, ...options } }));
}

// 표 구조 편집(insertRows, insertColumns, deleteRows, deleteColumns, mergeCells, splitCell).
// 칸은 캐럿·칸 블록이고 규칙은 코어가 정한다. 고치지 못하면 코어가 준 까닭을 알린다.
export function tableEdit(kind, options = {}) {
  if (typeof window.__chwpTableEdit !== "function") return Promise.resolve(null);
  return Promise.resolve(window.__chwpTableEdit(kind, options)).then((result) => {
    if (result && !result.documentChanged && result.error) toast(result.error, "info", null, { key: `table:${kind}` });
    return result;
  });
}

// 나누기(page, column, columnDef, section). 본문 밖이면 코어가 까닭을 준다.
export function insertBreak(kind) {
  if (typeof window.__chwpInsertBreak !== "function") return;
  void Promise.resolve(window.__chwpInsertBreak(kind)).then((result) => {
    if (result && !result.documentChanged && result.error) toast(result.error, "info", null, { key: `break:${kind}` });
  });
}

// 쪽 탭 컨트롤(header, footer, deleteBand, pageNumber, newNumber, pageHiding). 넣을 자리와 규칙은 코어가 정하고,
// 하지 못하면 코어가 준 까닭을 알린다.
export function pageControl(kind, fields = {}) {
  if (typeof window.__chwpPageControl !== "function") return Promise.resolve(null);
  return Promise.resolve(window.__chwpPageControl(kind, fields)).then((result) => {
    if (result && !result.documentChanged && result.error) toast(result.error, "info", null, { key: `page:${kind}` });
    return result;
  });
}

// 각주(endnote 면 미주) 넣기. 넣지 못하는 자리면 코어가 준 까닭을 알린다.
export function insertNote(endnote = false) {
  if (typeof window.__chwpInsertNote !== "function") return;
  void Promise.resolve(window.__chwpInsertNote(!!endnote)).then((result) => {
    if (result && !result.documentChanged && result.error) toast(result.error, "info", null, { key: "note" });
  });
}

// 주석 모양. 넣지 못하면 코어가 준 까닭을 알린다.
export function setNoteShape(fields, endnote, whole) {
  if (typeof window.__chwpNoteShape !== "function") return Promise.resolve(null);
  return Promise.resolve(window.__chwpNoteShape(fields, endnote, whole)).then((result) => {
    if (result && !result.documentChanged && result.error) toast(result.error, "info", null, { key: "noteShape" });
    return result;
  });
}

export function noteShapeView(endnote) {
  if (typeof window.__chwpNoteShapeView !== "function") return Promise.resolve(null);
  return Promise.resolve(window.__chwpNoteShapeView(endnote));
}

// 캡션(고른 개체, 아니면 캐럿 표). 하지 못하면 코어가 준 까닭을 알린다.
export function setCaption(caption) {
  if (typeof window.__chwpCaption !== "function") return Promise.resolve(null);
  return Promise.resolve(window.__chwpCaption(caption)).then((result) => {
    if (result && !result.documentChanged && result.error) toast(result.error, "info", null, { key: "caption" });
    return result;
  });
}

// 책갈피(insert·delete·goto·rename)·찾아가기. 하지 못하면 코어가 준 까닭을 알린다.
export function bookmark(action, name, newName) {
  if (typeof window.__chwpBookmark !== "function") return Promise.resolve(null);
  return Promise.resolve(window.__chwpBookmark(action, name, newName)).then((result) => {
    if (result && result.error) toast(result.error, "info", null, { key: "bookmark" });
    return result;
  });
}

// 찾아가기의 줄·스타일·조판 부호(fields.kind 가 line·style·mark). 못 찾으면 코어가 준 까닭을 알린다.
export function goTo(fields) {
  if (typeof window.__chwpGoTo !== "function") return Promise.resolve(null);
  return Promise.resolve(window.__chwpGoTo(fields)).then((result) => {
    if (result && !result.handled && result.error) toast(result.error, "info", null, { key: "goto" });
    return result;
  });
}

// 단축키와 같은 코어 명령(keyBindings 의 command)을 메뉴·리본에서 부른다.
export function runShortcut(command) {
  if (typeof window.__chwpShortcut !== "function") return Promise.resolve(null);
  return Promise.resolve(window.__chwpShortcut(command));
}

// 조판 부호 지우기(fields.marks 는 이름 줄). 지울 것이 없으면 코어가 준 까닭을 알린다.
export function deleteMarks(fields) {
  if (typeof window.__chwpDeleteMarks !== "function") return Promise.resolve(null);
  return Promise.resolve(window.__chwpDeleteMarks(fields)).then((result) => {
    if (result && !result.documentChanged && result.error) toast(result.error, "info", null, { key: "deleteMarks" });
    return result;
  });
}

// 표를 문자열로·문자열을 표로(fields.action 이 tableToText·textToTable). 못 하면 코어가 준 까닭을 알린다.
export function tableText(fields) {
  if (typeof window.__chwpTableText !== "function") return Promise.resolve(null);
  return Promise.resolve(window.__chwpTableText(fields)).then((result) => {
    if (result && !result.documentChanged && result.error) toast(result.error, "info", null, { key: "tableText" });
    return result;
  });
}

// 모양 복사(action copy·paste). 못 하면 코어가 준 까닭을 알린다.
export function copyShape(action, type = 0) {
  if (typeof window.__chwpCopyShape !== "function") return Promise.resolve(null);
  return Promise.resolve(window.__chwpCopyShape(action, type)).then((result) => {
    if (result && result.error) toast(result.error, "info", null, { key: "copyShape" });
    return result;
  });
}

// 각주↔미주 바꾸기(0 각주→미주, 1 미주→각주, 2 서로). 바꿀 것이 없으면 코어가 준 까닭을 알린다.
export function exchangeNotes(mode) {
  if (typeof window.__chwpExchangeNotes !== "function") return Promise.resolve(null);
  return Promise.resolve(window.__chwpExchangeNotes(mode)).then((result) => {
    if (result && !result.documentChanged && result.error) toast(result.error, "info", null, { key: "noteExchange" });
    return result;
  });
}

export function goToView() {
  if (typeof window.__chwpGoToView !== "function") return Promise.resolve(null);
  return Promise.resolve(window.__chwpGoToView());
}

export function goToSection(section) {
  if (typeof window.__chwpGoToSection !== "function") return Promise.resolve(null);
  return Promise.resolve(window.__chwpGoToSection(section)).then((result) => {
    if (result && !result.handled && result.error) toast(result.error, "info", null, { key: "goto" });
    return result;
  });
}

export function goToPage(page) {
  if (typeof window.__chwpGoToPage !== "function") return Promise.resolve(null);
  return Promise.resolve(window.__chwpGoToPage(page)).then((result) => {
    if (result && result.error) toast(result.error, "info", null, { key: "goto" });
    return result;
  });
}

export function bookmarkView() {
  if (typeof window.__chwpBookmarkView !== "function") return Promise.resolve(null);
  return Promise.resolve(window.__chwpBookmarkView());
}

// 표/셀 속성. 넣지 못하면 코어가 준 까닭을 알린다.
export function setTableProperties(fields) {
  if (typeof window.__chwpTableProperties !== "function") return Promise.resolve(null);
  return Promise.resolve(window.__chwpTableProperties(fields)).then((result) => {
    if (result && !result.documentChanged && result.error) toast(result.error, "info", null, { key: "tableProps" });
    return result;
  });
}

export function tablePropertiesView() {
  if (typeof window.__chwpTablePropertiesView !== "function") return Promise.resolve(null);
  return Promise.resolve(window.__chwpTablePropertiesView());
}

// 덧말 넣기·글자 겹치기(fields.kind 가 ruby·compose). 넣지 못하면 코어가 준 까닭을 알린다.
export function setGlyphGroup(fields) {
  if (typeof window.__chwpGlyphGroup !== "function") return Promise.resolve(null);
  return Promise.resolve(window.__chwpGlyphGroup(fields)).then((result) => {
    if (result && !result.documentChanged && result.error) toast(result.error, "info", null, { key: "glyphGroup" });
    return result;
  });
}

// 글자 바꾸기(fields.kind 가 case·width). 바꾸지 못하면 코어가 준 까닭을 알린다.
export function convertText(fields) {
  if (typeof window.__chwpConvertText !== "function") return Promise.resolve(null);
  return Promise.resolve(window.__chwpConvertText(fields)).then((result) => {
    if (result && !result.documentChanged && result.error) toast(result.error, "info", null, { key: "convertText" });
    return result;
  });
}

// 본문 정렬(글 블록). 하지 못하면 코어가 준 까닭을 알린다.
export function sortParagraphs(fields) {
  if (typeof window.__chwpSortParagraphs !== "function") return Promise.resolve(null);
  return Promise.resolve(window.__chwpSortParagraphs(fields)).then((result) => {
    if (result && !result.documentChanged && result.error) toast(result.error, "info", null, { key: "sortParagraphs" });
    return result;
  });
}

// 정렬 대화 상자 값(mode: table·text·빈 값, text 면 paragraphs·fields).
export function sortView(fields) {
  if (typeof window.__chwpSortView !== "function") return Promise.resolve(null);
  return Promise.resolve(window.__chwpSortView(fields || {}));
}

// 계산식 대화 상자 값(inTable, cell, 캐럿이 계산식 결과 안이면 formula·format).
export function tableFormulaView() {
  if (typeof window.__chwpTableFormulaView !== "function") return Promise.resolve(null);
  return Promise.resolve(window.__chwpTableFormulaView());
}

export function glyphGroupView() {
  if (typeof window.__chwpGlyphGroupView !== "function") return Promise.resolve(null);
  return Promise.resolve(window.__chwpGlyphGroupView());
}

// 구역 설정. 넣지 못하면 코어가 준 까닭을 알린다.
export function setSectionSettings(fields) {
  if (typeof window.__chwpSectionSettings !== "function") return Promise.resolve(null);
  return Promise.resolve(window.__chwpSectionSettings(fields)).then((result) => {
    if (result && !result.documentChanged && result.error) toast(result.error, "info", null, { key: "section" });
    return result;
  });
}

export function sectionSettingsView() {
  if (typeof window.__chwpSectionSettingsView !== "function") return Promise.resolve(null);
  return Promise.resolve(window.__chwpSectionSettingsView());
}

// 단 설정. 넣지 못하면 코어가 준 까닭을 알린다.
export function setColumns(fields) {
  if (typeof window.__chwpColumns !== "function") return Promise.resolve(null);
  return Promise.resolve(window.__chwpColumns(fields)).then((result) => {
    if (result && !result.documentChanged && result.error) toast(result.error, "info", null, { key: "columns" });
    return result;
  });
}

// 단 설정 대화 상자 값(고른 값을 얹어 코어가 다시 계산한 값).
export function columnView(fields) {
  if (typeof window.__chwpColumnView !== "function") return Promise.resolve(null);
  return Promise.resolve(window.__chwpColumnView(fields));
}

// 하이퍼링크 넣기. 넣지 못하면 코어가 준 까닭을 알린다.
export function insertHyperlink(text, url) {
  if (typeof window.__chwpInsertHyperlink !== "function") return;
  void Promise.resolve(window.__chwpInsertHyperlink(text, url)).then((result) => {
    if (result && !result.documentChanged && result.error) toast(result.error, "info", null, { key: "hyperlink" });
  });
}

// 쪽 번호·새 번호·감추기 대화 상자를 열 때 채울 값.
export function pageControlFields(kind) {
  if (typeof window.__chwpPageControlFields !== "function") return Promise.resolve(null);
  return Promise.resolve(window.__chwpPageControlFields(kind));
}

// 찾기·바꾸기(find, findBack, replace, replaceAll). 어디서 찾고 무엇을 고를지는 코어가 정하고,
// 못 찾음·처음부터 다시 찾음·바꾼 수는 코어가 준 알림 글을 띄운다.
export function findReplace(mode, text, replacement = "", matchCase = false) {
  if (typeof window.__chwpFindReplace !== "function" || !text) return Promise.resolve(null);
  return Promise.resolve(window.__chwpFindReplace(mode, text, replacement, matchCase)).then((result) => {
    if (result?.notice) toast(result.notice, "info", null, { key: "find" });
    return result;
  });
}

// 표 디자인 탭의 테두리 선(종류·굵기·색). 고른 값은 화면 상태라 셸이 들고, 테두리 단추가 코어에 넘긴다.
// 비어 있으면 코어 기본(실선 0.12mm 검정)이다. lineWidth 는 코어가 준 굵기 값(HWPUNIT)이다.
let tablePenNow = { lineType: "", lineWidth: 0, lineColor: "" };

export function tablePen() {
  return tablePenNow;
}

export function setTablePen(patch) {
  tablePenNow = { ...tablePenNow, ...patch };
  window.dispatchEvent(new CustomEvent("chwp-table-pen", { detail: tablePenNow }));
}

export function useTablePen() {
  const [pen, setPen] = useState(tablePenNow);
  useEffect(() => {
    const onPen = (event) => setPen(event.detail);
    window.addEventListener("chwp-table-pen", onPen);
    return () => window.removeEventListener("chwp-table-pen", onPen);
  }, []);
  return pen;
}

// 셀 테두리 단추. 지금 고른 선으로 긋는다.
export function cellBorder(border) {
  tableEdit("cellBorder", { border, ...tablePenNow });
}

// 캐럿이 표 칸 안인가(코어 caret.table). 표 탭을 보일지 정한다.
export function useInTable() {
  const [on, setOn] = useState(() => !!window.__chwpCursorStyle?.caret?.table);
  useEffect(() => {
    const onCaret = (event) => setOn(!!event.detail?.table);
    window.addEventListener("chwp-caret-status", onCaret);
    return () => window.removeEventListener("chwp-caret-status", onCaret);
  }, []);
  return on;
}

// 서식 막대·리본 글꼴 칸이 고치는 언어(한글 서식 도구 상자의 언어 칸). 대표는 모든 언어다.
// 고른 언어는 화면 상태라 셸이 들고, 넣을 값 이름(font.LATIN 등)과 넣는 일은 코어가 정한다.
export const fontLanguages = [
  ["대표", ""], ["한글", "HANGUL"], ["영문", "LATIN"], ["한자", "HANJA"],
  ["일어", "JAPANESE"], ["외국어", "OTHER"], ["기호", "SYMBOL"], ["사용자", "USER"],
];

export function setFontLanguage(name) {
  window.__chwpFontLang = name;
  window.dispatchEvent(new CustomEvent("chwp-font-lang", { detail: name }));
}

export function useFontLanguage() {
  const [lang, setLang] = useState(() => window.__chwpFontLang || "대표");
  useEffect(() => {
    const onLang = (event) => setLang(event.detail || "대표");
    window.addEventListener("chwp-font-lang", onLang);
    return () => window.removeEventListener("chwp-font-lang", onLang);
  }, []);
  return lang;
}

// 고른 언어의 글꼴 칸 값. 블록 안에서 섞였으면 빈칸이다(코어 cursor.mixed).
export function fontOfLanguage(style, lang) {
  const index = fontLanguages.findIndex(([name]) => name === lang) - 1;
  if (index < 0) return style.font || "";
  return (style.langFonts || [])[index] || "";
}

// 고른 언어에 글꼴을 넣는 서식 값.
export function fontPatchOf(lang, face) {
  const key = (fontLanguages.find(([name]) => name === lang) || ["", ""])[1];
  return key ? { [`font.${key}`]: face } : { font: face };
}

// 시안에는 있지만 아직 없는 기능. 단추는 시안처럼 두고 누르면 알린다.
export function notReady(label) {
  const name = String(label || "").replace(/\.\.\.$/, "");
  toast(`${name} 기능은 아직 준비 중이에요.`, "info", null, { key: `not-ready:${name}`, duration: 2000 });
}
