import { useEffect, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { convertText } from "./ui-actions.js";

// 글자 바꾸기 → 대문자/소문자 바꾸기·전각/반각 바꾸기(한글 2024 편집 → 글자 바꾸기 ▾).
// 항목 이름은 한글 화면 글이다. 이 두 대화 상자는 한글 대화 상자 정의가 없어
// 단축 글자는 두지 않았다. 바꾸는 규칙·블록·되돌리기는 코어(editConvertText)가 한다. 고른 값은 다음에 열 때 남는다.

export function openCaseDialog() {
  window.dispatchEvent(new Event("chwp-open-case-dialog"));
}

export function openWidthDialog() {
  window.dispatchEvent(new Event("chwp-open-width-dialog"));
}

const shell = "toolbar-ui ui-chrome fixed inset-x-0 bottom-0 z-[80] flex max-h-[92dvh] flex-col gap-3 overflow-y-auto rounded-t-[18px] bg-white px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.12)] outline-none lg:inset-auto lg:top-1/2 lg:left-1/2 lg:w-[380px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[10px] lg:p-6 lg:shadow-[0_0_0_1px_#d4d4d4,0_20px_40px_rgba(0,0,0,0.18)]";
const focusEditor = () => window.dispatchEvent(new Event("chwp-focus-editor"));

function Frame({ open, onClose, title, description, children }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/45" />
        <DialogPrimitive.Content className={shell}>
          <DialogPrimitive.Description className="sr-only">{description}</DialogPrimitive.Description>
          <div className="flex items-center">
            <DialogPrimitive.Title className="flex-1 text-[20px] font-bold">{title}</DialogPrimitive.Title>
            <button type="button" className="ui-ghost flex size-12 items-center justify-center rounded-[10px] lg:hidden" aria-label="닫기" onClick={onClose}>
              <X className="size-6" />
            </button>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Buttons({ onApply, onClose, disabled }) {
  return (
    <div className="flex flex-row-reverse gap-2 border-t border-[#e5e5e5] pt-3">
      <button type="button" className="ui-primary h-11 flex-1 rounded-lg lg:flex-none lg:px-6" onClick={onApply} disabled={disabled}>바꾸기</button>
      <button type="button" className="ui-outline h-11 flex-1 rounded-lg lg:flex-none lg:px-6" onClick={onClose}>취소</button>
    </div>
  );
}

function useOpen(eventName) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(eventName, onOpen);
    return () => window.removeEventListener(eventName, onOpen);
  }, [eventName]);
  return [open, setOpen];
}

const CASE_MODES = [
  ["upper", "모두 대문자로"],
  ["lower", "모두 소문자로"],
  ["toggle", "대/소문자 서로 바꿈"],
  ["wordCap", "단어 첫 글자만 대문자로"],
  ["sentenceCap", "문장 첫 글자를 대문자로"],
  ["sentenceCapOnly", "문장 첫 글자만 대문자로"],
];

export function CaseDialog() {
  const [open, setOpen] = useOpen("chwp-open-case-dialog");
  const [mode, setMode] = useState("upper");
  const close = () => {
    setOpen(false);
    focusEditor();
  };
  const apply = () => {
    void convertText({ kind: "case", mode }).then((result) => { if (result?.documentChanged) close(); });
  };
  return (
    <Frame open={open} onClose={close} title="대문자/소문자 바꾸기" description="블록으로 지정한 부분의 영문을 대문자나 소문자로 바꿉니다.">
      <div role="radiogroup" aria-label="바꾸기 방식" className="flex flex-col gap-2">
        {CASE_MODES.map(([value, label]) => (
          <label key={value} className="flex min-h-9 items-center gap-2">
            <input type="radio" checked={mode === value} onChange={() => setMode(value)} />{label}
          </label>
        ))}
      </div>
      <Buttons onApply={apply} onClose={close} />
    </Frame>
  );
}

const WIDTH_TARGETS = [
  ["digit", "숫자"],
  ["latin", "영문자"],
  ["symbol", "기호"],
  ["kana", "가타카나"],
  ["jamo", "한글 자모"],
];

export function WidthDialog() {
  const [open, setOpen] = useOpen("chwp-open-width-dialog");
  const [to, setTo] = useState("half");
  const [targets, setTargets] = useState({ digit: true, latin: true, symbol: true, kana: false, jamo: false });
  const close = () => {
    setOpen(false);
    focusEditor();
  };
  const apply = () => {
    const fields = { kind: "width", to };
    for (const [key] of WIDTH_TARGETS) fields[key] = targets[key] ? 1 : 0;
    void convertText(fields).then((result) => { if (result?.documentChanged) close(); });
  };
  const none = WIDTH_TARGETS.every(([key]) => !targets[key]);
  return (
    <Frame open={open} onClose={close} title="전각/반각 바꾸기" description="블록으로 지정한 부분의 내용을 전각이나 반각으로 바꿉니다.">
      <div role="radiogroup" aria-label="바꿀 방향" className="flex items-center gap-4">
        <label className="flex min-h-9 items-center gap-2"><input type="radio" checked={to === "half"} onChange={() => setTo("half")} />모두 반각으로</label>
        <label className="flex min-h-9 items-center gap-2"><input type="radio" checked={to === "full"} onChange={() => setTo("full")} />모두 전각으로</label>
      </div>
      <fieldset className="flex flex-col gap-1 rounded-md border border-[#e5e5e5] p-2">
        <legend className="px-1">바꿀 대상</legend>
        <div className="grid grid-cols-2 gap-1">
          {WIDTH_TARGETS.map(([key, label]) => (
            <label key={key} className="flex min-h-9 items-center gap-2">
              <input type="checkbox" checked={targets[key]} onChange={(event) => setTargets((prev) => ({ ...prev, [key]: event.target.checked }))} />{label}
            </label>
          ))}
        </div>
      </fieldset>
      <Buttons onApply={apply} onClose={close} disabled={none} />
    </Frame>
  );
}
