import { useEffect, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { copyShape } from "./ui-actions.js";

// 모양 복사(한글 2024 편집 → 모양 복사, Alt+C).
// 본문 모양 복사: 글자 모양(L)·문단 모양(T)·글자 모양과 문단 모양 둘 다 복사(B)·글자 스타일(F)·문단 스타일(P),
// 셀 모양 복사: 셀 속성(C)·셀 테두리(O)·셀 배경(G), 표에서 적용 대상: 본문 모양과 셀 모양 둘 다(H)·셀 모양만(E), 복사(D).
// 블록을 잡고 Alt+C 를 다시 누르면 코어가 기억한 모양을 입힌다(editShortcut copyShape). 글자 스타일과 셀 모양은
// 아직 복사하지 못해 꺼 두었다.

export function openCopyShapeDialog() {
  window.dispatchEvent(new Event("chwp-open-copy-shape-dialog"));
}

const shell = "toolbar-ui ui-chrome fixed inset-x-0 bottom-0 z-[80] flex max-h-[92dvh] flex-col gap-3 overflow-y-auto rounded-t-[18px] bg-white px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.12)] outline-none lg:inset-auto lg:top-1/2 lg:left-1/2 lg:w-[380px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[10px] lg:p-6 lg:shadow-[0_0_0_1px_#d4d4d4,0_20px_40px_rgba(0,0,0,0.18)]";
const focusEditor = () => window.dispatchEvent(new Event("chwp-focus-editor"));

const BODY = [
  [0, "글자 모양(L)", true],
  [1, "문단 모양(T)", true],
  [2, "글자 모양과 문단 모양 둘 다 복사(B)", true],
  [3, "글자 스타일(F)", false],
  [4, "문단 스타일(P)", true],
];

export function CopyShapeDialog() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(0);
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("chwp-open-copy-shape-dialog", onOpen);
    return () => window.removeEventListener("chwp-open-copy-shape-dialog", onOpen);
  }, []);
  const close = () => {
    setOpen(false);
    focusEditor();
  };
  const apply = () => {
    void copyShape("copy", type).then((result) => { if (result?.handled) close(); });
  };
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/45" />
        <DialogPrimitive.Content className={shell}>
          <DialogPrimitive.Description className="sr-only">캐럿 자리 모양을 기억합니다. 블록을 잡고 Alt+C 를 누르면 입힙니다.</DialogPrimitive.Description>
          <div className="flex items-center">
            <DialogPrimitive.Title className="flex-1 text-[20px] font-bold">모양 복사</DialogPrimitive.Title>
            <button type="button" className="ui-ghost flex size-12 items-center justify-center rounded-[10px] lg:hidden" aria-label="닫기" onClick={close}>
              <X className="size-6" />
            </button>
          </div>
          <fieldset className="flex flex-col gap-1 rounded-md border border-[#e5e5e5] p-2" role="radiogroup">
            <legend className="px-1">본문 모양 복사</legend>
            {BODY.map(([value, label, ready]) => (
              <label key={value} className={`flex min-h-9 items-center gap-2 ${ready ? "" : "opacity-40"}`}>
                <input type="radio" checked={type === value} disabled={!ready} onChange={() => setType(value)} />{label}
              </label>
            ))}
          </fieldset>
          <fieldset className="flex flex-col gap-1 rounded-md border border-[#e5e5e5] p-2 opacity-40" disabled>
            <legend className="px-1">셀 모양 복사</legend>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-1"><input type="checkbox" disabled />셀 속성(C)</label>
              <label className="flex items-center gap-1"><input type="checkbox" disabled />셀 테두리(O)</label>
              <label className="flex items-center gap-1"><input type="checkbox" disabled />셀 배경(G)</label>
            </div>
          </fieldset>
          <p className="text-[13px] text-[#737373]">블록을 잡고 Alt+C 를 누르면 기억한 모양을 입힙니다.</p>
          <div className="flex flex-row-reverse gap-2 border-t border-[#e5e5e5] pt-3">
            <button type="button" className="ui-primary h-11 flex-1 rounded-lg lg:flex-none lg:px-6" onClick={apply}>복사(D)</button>
            <button type="button" className="ui-outline h-11 flex-1 rounded-lg lg:flex-none lg:px-6" onClick={close}>취소</button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
