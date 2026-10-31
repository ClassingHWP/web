import { useEffect, useState } from "react";

// 메뉴·리본·상태 줄이 같이 쓰는 명령. 셸 이벤트로 preview.js 에 넘긴다.

export function newDocument() {
  window.dispatchEvent(new Event("noting-new-document"));
}

export function openFile() {
  const input = document.getElementById("file");
  if (input instanceof HTMLInputElement) input.click();
}

export function saveAs() {
  window.dispatchEvent(new Event("noting-save-as"));
}

export function rulersShown() {
  try {
    return localStorage.getItem("noting.rulers") !== "0";
  } catch {
    return true;
  }
}

export function toggleRulers() {
  window.dispatchEvent(new CustomEvent("noting-rulers", { detail: { on: !rulersShown() } }));
}

export function useRulersShown() {
  const [on, setOn] = useState(rulersShown);
  useEffect(() => {
    const onChange = (event) => setOn(!!event.detail?.on);
    window.addEventListener("noting-rulers-changed", onChange);
    return () => window.removeEventListener("noting-rulers-changed", onChange);
  }, []);
  return on;
}

export function requestZoom(detail) {
  window.dispatchEvent(new CustomEvent("noting-zoom", { detail }));
}

// 블록 메뉴와 같은 길로 오려두기·복사하기·붙여넣기를 한다.
export function selectionAction(action) {
  window.dispatchEvent(new CustomEvent("noting-selection-action", { detail: { action } }));
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
  const [band, setBand] = useState(() => Number(window.__notingCursorStyle?.caret?.band) || 0);
  useEffect(() => {
    const onCaret = (event) => setBand(Number(event.detail?.band) || 0);
    window.addEventListener("noting-caret-status", onCaret);
    return () => window.removeEventListener("noting-caret-status", onCaret);
  }, []);
  return band;
}

// 머리말·꼬리말 편집을 끝낸다. Shift+Esc 와 같다.
export function leaveBand() {
  window.dispatchEvent(new Event("noting-leave-band"));
}

// 토스트를 띄운다. kind 는 info(알림) · saved(저장됨) · undo(되돌리기) · error(오류)이고,
// action 은 { label, run } 이다(되돌리기·다시 시도 단추). options.key 가 같은 알림은 새로 쌓지 않고,
// options.duration 은 머무는 밀리초다.
export function toast(text, kind = "info", action = null, options = {}) {
  window.dispatchEvent(new CustomEvent("noting-toast", { detail: { text, kind, action, ...options } }));
}

// 시안에는 있지만 아직 없는 기능. 단추는 시안처럼 두고 누르면 알린다.
export function notReady(label) {
  const name = String(label || "").replace(/\.\.\.$/, "");
  toast(`${name} 기능은 아직 준비 중이에요.`, "info", null, { key: `not-ready:${name}`, duration: 2000 });
}
