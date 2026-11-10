import { useEffect, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { deleteMarks, goToView } from "./ui-actions.js";

// 조판 부호 지우기(한글 2024 편집 → 조판 부호 지우기): 조판 부호 목록(L, 고를 수 있는 목록),
// 모두 선택(C), 지우기(D)·취소. 한글 화면으로 확인: 목록은 늘 모든 종류이고 처음엔 모두 꺼져 있으며, 하나라도 골라야
// 지우기가 켜진다. 블록이 있으면 블록 안, 없으면 문서 전체에서 지운다(코어 editDeleteMarks).

export function openDeleteMarksDialog() {
  window.dispatchEvent(new Event("chwp-open-delete-marks-dialog"));
}

const shell = "toolbar-ui ui-chrome fixed inset-x-0 bottom-0 z-[80] flex max-h-[92dvh] flex-col gap-3 overflow-y-auto rounded-t-[18px] bg-white px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.12)] outline-none lg:inset-auto lg:top-1/2 lg:left-1/2 lg:w-[360px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[10px] lg:p-6 lg:shadow-[0_0_0_1px_#d4d4d4,0_20px_40px_rgba(0,0,0,0.18)]";
const focusEditor = () => window.dispatchEvent(new Event("chwp-focus-editor"));

export function DeleteMarksDialog() {
  const [open, setOpen] = useState(false);
  const [names, setNames] = useState([]);
  const [checked, setChecked] = useState(() => new Set());
  useEffect(() => {
    const onOpen = () => {
      void goToView().then((view) => {
        // 찾아가기 목록의 첫 줄 "[모든 조판 부호…]"는 이 목록에 없다.
        setNames(String(view?.marks || "").split("\n").filter(Boolean).slice(1));
        setChecked(new Set());
        setOpen(true);
      });
    };
    window.addEventListener("chwp-open-delete-marks-dialog", onOpen);
    return () => window.removeEventListener("chwp-open-delete-marks-dialog", onOpen);
  }, []);
  const close = () => {
    setOpen(false);
    focusEditor();
  };
  const toggle = (name) => setChecked((prev) => {
    const next = new Set(prev);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    return next;
  });
  const all = names.length > 0 && names.every((name) => checked.has(name));
  const apply = () => {
    void deleteMarks({ marks: names.filter((name) => checked.has(name)).join("\n") }).then((result) => { if (result?.documentChanged) close(); });
  };
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/45" />
        <DialogPrimitive.Content className={shell}>
          <DialogPrimitive.Description className="sr-only">고른 종류의 조판 부호를 블록(없으면 문서 전체)에서 지웁니다.</DialogPrimitive.Description>
          <div className="flex items-center">
            <DialogPrimitive.Title className="flex-1 text-[20px] font-bold">조판 부호 지우기</DialogPrimitive.Title>
            <button type="button" className="ui-ghost flex size-12 items-center justify-center rounded-[10px] lg:hidden" aria-label="닫기" onClick={close}>
              <X className="size-6" />
            </button>
          </div>
          <span>조판 부호 목록(L)</span>
          <div className="flex max-h-[18em] min-h-[8em] flex-col overflow-y-auto rounded-md border border-[#e5e5e5] p-1" role="group" aria-label="조판 부호 목록">
            {names.map((name) => (
              <label key={name} className="flex min-h-8 items-center gap-2 px-1">
                <input type="checkbox" checked={checked.has(name)} onChange={() => toggle(name)} />{name}
              </label>
            ))}
          </div>
          <button type="button" aria-pressed={all} className={`ui-outline h-10 self-start rounded-lg px-4 ${all ? "bg-[#e8efff]" : ""}`}
            onClick={() => setChecked(all ? new Set() : new Set(names))}>모두 선택(C)</button>
          <div className="flex flex-row-reverse gap-2 border-t border-[#e5e5e5] pt-3">
            <button type="button" className="ui-primary h-11 flex-1 rounded-lg disabled:opacity-40 lg:flex-none lg:px-6" onClick={apply} disabled={checked.size === 0}>지우기(D)</button>
            <button type="button" className="ui-outline h-11 flex-1 rounded-lg lg:flex-none lg:px-6" onClick={close}>취소</button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
