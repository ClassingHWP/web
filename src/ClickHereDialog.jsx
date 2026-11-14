import { useEffect, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";

// 누름틀 고치기(한글 "필드 입력 고치기"의 누름틀 탭): 입력할 내용의 안내문, 메모 내용, 필드 이름, 양식 모드에서 편집 가능.
// 값과 규칙은 코어(clickHereView·editClickHere)가 정한다. 캐럿이 누름틀 안에 없으면 열지 않는다.

export function openClickHereDialog() {
  window.dispatchEvent(new Event("chwp-open-click-here-dialog"));
}

function fieldValue(view, name, fallback) {
  const value = view && Object.prototype.hasOwnProperty.call(view, name) ? view[name] : undefined;
  return value === undefined || value === null ? fallback : value;
}

export function ClickHereDialog() {
  const [open, setOpen] = useState(false);
  const [direction, setDirection] = useState("");
  const [memo, setMemo] = useState("");
  const [name, setName] = useState("");
  const [editable, setEditable] = useState(true);

  useEffect(() => {
    const onOpen = async () => {
      const view = typeof window.__chwpClickHereView === "function" ? await window.__chwpClickHereView() : null;
      if (!fieldValue(view, "found", false)) return;
      setDirection(String(fieldValue(view, "direction", "")));
      setMemo(String(fieldValue(view, "memo", "")));
      setName(String(fieldValue(view, "name", "")));
      setEditable(!!fieldValue(view, "editable", true));
      setOpen(true);
    };
    window.addEventListener("chwp-open-click-here-dialog", onOpen);
    return () => window.removeEventListener("chwp-open-click-here-dialog", onOpen);
  }, []);

  const close = () => {
    setOpen(false);
    window.dispatchEvent(new Event("chwp-focus-editor"));
  };
  const apply = () => {
    close();
    if (typeof window.__chwpClickHere === "function") {
      void window.__chwpClickHere({ direction, memo, name, editable });
    }
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/45" />
        <DialogPrimitive.Content
          className="toolbar-ui ui-chrome fixed inset-x-0 bottom-0 z-[80] flex flex-col gap-4 rounded-t-[18px] bg-white px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.12)] outline-none lg:inset-auto lg:top-1/2 lg:left-1/2 lg:w-[460px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[10px] lg:p-6 lg:shadow-[0_0_0_1px_#d4d4d4,0_20px_40px_rgba(0,0,0,0.18)]"
        >
          <DialogPrimitive.Description className="sr-only">누름틀의 안내문, 메모, 필드 이름을 고칩니다.</DialogPrimitive.Description>
          <div className="flex items-center">
            <DialogPrimitive.Title className="flex-1 text-[20px] font-bold">누름틀 고치기</DialogPrimitive.Title>
            <button type="button" className="ui-ghost flex size-12 items-center justify-center rounded-[10px] lg:hidden" aria-label="닫기" onClick={close}>
              <X className="size-6" />
            </button>
          </div>
          <label className="flex flex-col gap-1.5">
            <span>입력할 내용의 안내문</span>
            <input className="ui-box h-11 rounded-lg px-3" value={direction} onChange={(event) => setDirection(event.target.value)} autoFocus />
          </label>
          <label className="flex flex-col gap-1.5">
            <span>메모 내용</span>
            <textarea className="ui-box min-h-24 rounded-lg px-3 py-2" value={memo} onChange={(event) => setMemo(event.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5">
            <span>필드 이름</span>
            <input className="ui-box h-11 rounded-lg px-3" value={name} onChange={(event) => setName(event.target.value)} />
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" className="size-4" checked={editable} onChange={(event) => setEditable(event.target.checked)} />
            <span>양식 모드에서 편집 가능</span>
          </label>
          <div className="flex flex-row-reverse gap-2 border-t border-[#e5e5e5] pt-3">
            <button type="button" className="ui-primary h-11 flex-1 rounded-lg lg:flex-none lg:px-6" onClick={apply}>고치기(D)</button>
            <button type="button" className="ui-outline h-11 flex-1 rounded-lg lg:flex-none lg:px-6" onClick={close}>취소</button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
