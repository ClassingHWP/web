import { useEffect, useState } from "react";

// 메뉴·리본·상태 줄이 같이 쓰는 명령. 셸 이벤트로 preview.js 에 넘긴다.

export function newDocument() {
  window.dispatchEvent(new Event("chwp-new-document"));
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

// 머리말·꼬리말 편집을 끝낸다. Shift+Esc 와 같다.
export function leaveBand() {
  window.dispatchEvent(new Event("chwp-leave-band"));
}

// 토스트를 띄운다. kind 는 info(알림) · saved(저장됨) · undo(되돌리기) · error(오류)이고,
// action 은 { label, run } 이다(되돌리기·다시 시도 단추). options.key 가 같은 알림은 새로 쌓지 않고,
// options.duration 은 머무는 밀리초다.
export function toast(text, kind = "info", action = null, options = {}) {
  window.dispatchEvent(new CustomEvent("chwp-toast", { detail: { text, kind, action, ...options } }));
}

// 시안에는 있지만 아직 없는 기능. 단추는 시안처럼 두고 누르면 알린다.
export function notReady(label) {
  const name = String(label || "").replace(/\.\.\.$/, "");
  toast(`${name} 기능은 아직 준비 중이에요.`, "info", null, { key: `not-ready:${name}`, duration: 2000 });
}
