import { useEffect, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { insertHyperlink } from "./ui-actions.js";

// 하이퍼링크 넣기. 보일 글(처음 값은 고른 글)과 주소만 받고, 필드·글자 모양은 코어가 정한다.

export function openHyperlinkDialog() {
  window.dispatchEvent(new Event("chwp-open-hyperlink-dialog"));
}

export function HyperlinkDialog() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");

  useEffect(() => {
    const onOpen = () => {
      const selected = typeof window.__chwpSelectedText === "function" ? window.__chwpSelectedText() : "";
      setText(typeof selected === "string" ? selected : "");
      setUrl("");
      setOpen(true);
    };
    window.addEventListener("chwp-open-hyperlink-dialog", onOpen);
    return () => window.removeEventListener("chwp-open-hyperlink-dialog", onOpen);
  }, []);

  const close = () => {
    setOpen(false);
    window.dispatchEvent(new Event("chwp-focus-editor"));
  };
  const apply = () => {
    const target = url.trim();
    if (!target) return;
    close();
    insertHyperlink(text, target);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/45" />
        <DialogPrimitive.Content
          className="toolbar-ui ui-chrome fixed inset-x-0 bottom-0 z-[80] flex flex-col gap-4 rounded-t-[18px] bg-white px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.12)] outline-none lg:inset-auto lg:top-1/2 lg:left-1/2 lg:w-[460px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[10px] lg:p-6 lg:shadow-[0_0_0_1px_#d4d4d4,0_20px_40px_rgba(0,0,0,0.18)]"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              apply();
            }
          }}
        >
          <DialogPrimitive.Description className="sr-only">보일 글과 연결할 웹 주소를 정합니다.</DialogPrimitive.Description>
          <div className="flex items-center">
            <DialogPrimitive.Title className="flex-1 text-[20px] font-bold">하이퍼링크</DialogPrimitive.Title>
            <button type="button" className="ui-ghost flex size-12 items-center justify-center rounded-[10px] lg:hidden" aria-label="닫기" onClick={close}>
              <X className="size-6" />
            </button>
          </div>
          <label className="flex flex-col gap-1.5">
            <span>표시할 문자열</span>
            <input className="ui-box h-11 rounded-lg px-3" value={text} onChange={(event) => setText(event.target.value)} placeholder="비우면 주소를 보입니다" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span>웹 주소</span>
            <input className="ui-box h-11 rounded-lg px-3" value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://" inputMode="url" autoFocus />
          </label>
          <div className="flex flex-row-reverse gap-2 border-t border-[#e5e5e5] pt-3">
            <button type="button" className="ui-primary h-11 flex-1 rounded-lg lg:flex-none lg:px-6" onClick={apply} disabled={!url.trim()}>넣기(D)</button>
            <button type="button" className="ui-outline h-11 flex-1 rounded-lg lg:flex-none lg:px-6" onClick={close}>취소</button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
