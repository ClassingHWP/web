import { useEffect, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { tableText } from "./ui-actions.js";

// 표를 문자열로·문자열을 표로(한글 2024 표 ↔ 문자열 바꾸기).
// 표를 문자열로: 분리 방법 지정 — 탭(T)·쉼표(C)·빈칸(B)·기타 문자열(U)+칸(F), 설정(D).
// 문자열을 표로: 자동으로 넣기(A) / 분리 방법 지정(M) — 탭(T)·쉼표(C)·3칸 이상의 빈칸(B)·선 그리기 문자(L)·
//   기타 문자(E)+칸(F)·문자열(U)+칸(G), 선택 사항: 구분자 유지(K), 설정(D).
// 나누고 붙이는 규칙은 코어(editTableText)가 한다. 선 그리기 문자는 한글에서도 확인하지 못해 꺼 두었다.

export function openTableToTextDialog() {
  window.dispatchEvent(new Event("chwp-open-table-to-text-dialog"));
}

export function openTextToTableDialog() {
  window.dispatchEvent(new Event("chwp-open-text-to-table-dialog"));
}

const shell = "toolbar-ui ui-chrome fixed inset-x-0 bottom-0 z-[80] flex max-h-[92dvh] flex-col gap-3 overflow-y-auto rounded-t-[18px] bg-white px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.12)] outline-none lg:inset-auto lg:top-1/2 lg:left-1/2 lg:w-[380px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[10px] lg:p-6 lg:shadow-[0_0_0_1px_#d4d4d4,0_20px_40px_rgba(0,0,0,0.18)]";
const box = "ui-box h-9 rounded-md px-2";
export const focusEditor = () => window.dispatchEvent(new Event("chwp-focus-editor"));

export function Frame({ open, onClose, title, description, children, onApply, disabled, applyLabel = "설정(D)" }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/45" />
        {/* 닫힐 때 대화 상자 라이브러리가 초점을 연 단추(사라진 메뉴면 body)로 돌리면 친 글이 편집기에 가지 않는다. */}
        <DialogPrimitive.Content className={shell} onCloseAutoFocus={(event) => { event.preventDefault(); focusEditor(); }}>
          <DialogPrimitive.Description className="sr-only">{description}</DialogPrimitive.Description>
          <div className="flex items-center">
            <DialogPrimitive.Title className="flex-1 text-[20px] font-bold">{title}</DialogPrimitive.Title>
            <button type="button" className="ui-ghost flex size-12 items-center justify-center rounded-[10px] lg:hidden" aria-label="닫기" onClick={onClose}>
              <X className="size-6" />
            </button>
          </div>
          {children}
          <div className="flex flex-row-reverse gap-2 border-t border-[#e5e5e5] pt-3">
            <button type="button" className="ui-primary h-11 flex-1 rounded-lg lg:flex-none lg:px-6" onClick={onApply} disabled={disabled}>{applyLabel}</button>
            <button type="button" className="ui-outline h-11 flex-1 rounded-lg lg:flex-none lg:px-6" onClick={onClose}>취소</button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function useOpen(name) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(name, onOpen);
    return () => window.removeEventListener(name, onOpen);
  }, [name]);
  return [open, setOpen];
}

export function TableToTextDialog() {
  const [open, setOpen] = useOpen("chwp-open-table-to-text-dialog");
  const [delimiter, setDelimiter] = useState("tab");
  const [text, setText] = useState("");
  const close = () => {
    setOpen(false);
    focusEditor();
  };
  const apply = () => {
    void tableText({ action: "tableToText", delimiter, text }).then((result) => { if (result?.documentChanged) close(); });
  };
  const choices = [["tab", "탭(T)"], ["comma", "쉼표(C)"], ["space", "빈칸(B)"], ["other", "기타 문자열(U)"]];
  return (
    <Frame open={open} onClose={close} title="표를 문자열로" description="캐럿이 든 표를 줄마다 문단으로 바꿉니다." onApply={apply}
      disabled={delimiter === "other" && !text}>
      <fieldset className="flex flex-col gap-1 rounded-md border border-[#e5e5e5] p-2" role="radiogroup">
        <legend className="px-1">분리 방법 지정</legend>
        {choices.map(([value, label]) => (
          <label key={value} className="flex min-h-9 items-center gap-2">
            <input type="radio" checked={delimiter === value} onChange={() => setDelimiter(value)} />{label}
          </label>
        ))}
        <input className={box} value={text} disabled={delimiter !== "other"} aria-label="기타 문자열" onChange={(event) => setText(event.target.value)} />
      </fieldset>
    </Frame>
  );
}

export function TextToTableDialog() {
  const [open, setOpen] = useOpen("chwp-open-text-to-table-dialog");
  const [auto, setAuto] = useState(true);
  const [delimiter, setDelimiter] = useState("tab");
  const [charText, setCharText] = useState("");
  const [stringText, setStringText] = useState("");
  const [keep, setKeep] = useState(false);
  const close = () => {
    setOpen(false);
    focusEditor();
  };
  const apply = () => {
    const how = auto ? "auto" : delimiter;
    const text = how === "char" ? charText : how === "string" ? stringText : "";
    void tableText({ action: "textToTable", delimiter: how, text, keep: keep ? 1 : 0 }).then((result) => { if (result?.documentChanged) close(); });
  };
  const choices = [["tab", "탭(T)", true], ["comma", "쉼표(C)", true], ["space", "3칸 이상의 빈칸(B)", true], ["line", "선 그리기 문자(L)", false]];
  return (
    <Frame open={open} onClose={close} title="문자열을 표로" description="블록의 문단을 줄로, 구분자로 나눈 글을 칸으로 하는 표를 만듭니다." onApply={apply}>
      <label className="flex min-h-9 items-center gap-2"><input type="radio" checked={auto} onChange={() => setAuto(true)} />자동으로 넣기(A)</label>
      <label className="flex min-h-9 items-center gap-2"><input type="radio" checked={!auto} onChange={() => setAuto(false)} />분리 방법 지정(M)</label>
      <fieldset className="flex flex-col gap-1 rounded-md border border-[#e5e5e5] p-2" role="radiogroup" disabled={auto}>
        {choices.map(([value, label, ready]) => (
          <label key={value} className={`flex min-h-9 items-center gap-2 ${ready ? "" : "opacity-40"}`}>
            <input type="radio" checked={!auto && delimiter === value} disabled={!ready} onChange={() => setDelimiter(value)} />{label}
          </label>
        ))}
        <label className="flex min-h-9 items-center gap-2">
          <input type="radio" checked={!auto && delimiter === "char"} onChange={() => setDelimiter("char")} />기타 문자(E)
          <input className={`${box} w-16`} maxLength={1} value={charText} aria-label="기타 문자" onChange={(event) => setCharText(event.target.value)} />
        </label>
        <label className="flex min-h-9 items-center gap-2">
          <input type="radio" checked={!auto && delimiter === "string"} onChange={() => setDelimiter("string")} />문자열(U)
          <input className={`${box} flex-1`} value={stringText} aria-label="문자열" onChange={(event) => setStringText(event.target.value)} />
        </label>
      </fieldset>
      <label className="flex items-center gap-2"><input type="checkbox" checked={keep} onChange={(event) => setKeep(event.target.checked)} />구분자 유지(K)</label>
    </Frame>
  );
}
