import { useEffect, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { findReplace } from "./ui-actions.js";

// 찾기 및 바꾸기. 찾을 글·바꿀 글·대소문자 구별만 받는다.
// 어디서부터 찾을지, 무엇을 고를지, 글자 모양을 어떻게 남길지는 코어(editFindReplace)가 정한다.
// 찾은 곳이 보이도록 문서를 덮지 않는 창이다. 리본·메뉴는 openFindDialog 로 연다.

export function openFindDialog() {
  window.dispatchEvent(new Event("chwp-open-find-dialog"));
}

export function FindDialog() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [replacement, setReplacement] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const findInput = useRef(null);

  useEffect(() => {
    // 고른 글이 한 줄이면 찾을 글로 넣는다(한글과 같다).
    const onOpen = () => {
      const picked = typeof window.__chwpSelectedText === "function" ? window.__chwpSelectedText() : "";
      if (picked && !/[\r\n]/.test(picked)) setText(picked);
      setOpen(true);
      setTimeout(() => {
        findInput.current?.focus();
        findInput.current?.select();
      }, 0);
    };
    window.addEventListener("chwp-open-find-dialog", onOpen);
    return () => window.removeEventListener("chwp-open-find-dialog", onOpen);
  }, []);

  const close = () => {
    setOpen(false);
    window.dispatchEvent(new Event("chwp-focus-editor"));
  };

  const run = (mode) => {
    if (!text) {
      findInput.current?.focus();
      return;
    }
    void findReplace(mode, text, replacement, matchCase);
  };

  const field = "ui-box h-11 w-full rounded-lg px-3 outline-none";
  const button = "ui-outline h-11 rounded-lg px-3 whitespace-nowrap";

  return (
    <DialogPrimitive.Root open={open} modal={false} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Content
          className="toolbar-ui ui-chrome fixed inset-x-0 bottom-0 z-[80] flex flex-col gap-3 rounded-t-[18px] bg-white px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.12)] outline-none lg:inset-auto lg:top-[140px] lg:right-6 lg:w-[380px] lg:rounded-[10px] lg:p-5 lg:shadow-[0_0_0_1px_#d4d4d4,0_20px_40px_rgba(0,0,0,0.18)]"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              run(event.shiftKey ? "findBack" : "find");
            }
          }}
        >
          <DialogPrimitive.Description className="sr-only">찾을 글과 바꿀 글을 넣고 찾거나 바꿉니다.</DialogPrimitive.Description>
          <div className="flex items-center">
            <DialogPrimitive.Title className="flex-1 text-[20px] font-bold">찾기 및 바꾸기</DialogPrimitive.Title>
            <button type="button" className="ui-ghost flex size-10 items-center justify-center rounded-[10px]" aria-label="닫기" onClick={close}>
              <X className="size-5" />
            </button>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="font-medium">찾을 내용</span>
            <input ref={findInput} className={field} value={text} onChange={(event) => setText(event.target.value)} aria-label="찾을 내용" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="font-medium">바꿀 내용</span>
            <input className={field} value={replacement} onChange={(event) => setReplacement(event.target.value)} aria-label="바꿀 내용" />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="size-4" checked={matchCase} onChange={(event) => setMatchCase(event.target.checked)} />
            <span>대소문자 구별</span>
          </label>
          <div className="grid grid-cols-2 gap-2 border-t border-[#e5e5e5] pt-3">
            <button type="button" className={button} onClick={() => run("findBack")}>앞으로 찾기</button>
            <button type="button" className="ui-primary h-11 rounded-lg px-3 whitespace-nowrap" onClick={() => run("find")}>다음 찾기</button>
            <button type="button" className={button} onClick={() => run("replace")}>바꾸기</button>
            <button type="button" className={button} onClick={() => run("replaceAll")}>모두 바꾸기</button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
