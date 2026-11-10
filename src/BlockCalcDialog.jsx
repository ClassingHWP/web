import { useEffect, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { focusEditor } from "./TableTextDialog.jsx";
import { pageControl, pageControlFields, toast } from "./ui-actions.js";

// 블록 계산(도구 > 블록 합계·블록 평균). 블록 글에서 어떤 수를 읽고 어떻게 쓸지, 넣을 자리는 코어가 정한다
// (pageControl blockCalc, 규칙은 core model/block_calc.hpp). 셸은 값을 보이고 [넣기]·[복사]만 넘긴다.
// 복사는 플랫폼 일(클립보드)이라 셸이 한다.

export function openBlockCalcDialog(mode = "sum") {
  window.dispatchEvent(new CustomEvent("chwp-open-block-calc-dialog", { detail: mode }));
}

function copyText(text) {
  const fallback = () => {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.left = "-9999px";
    document.body.append(field);
    field.select();
    document.execCommand("copy");
    field.remove();
  };
  const write = navigator.clipboard?.writeText;
  if (write) {
    void write.call(navigator.clipboard, text).catch(fallback);
    return;
  }
  fallback();
}

const shell = "toolbar-ui ui-chrome fixed inset-x-0 bottom-0 z-[80] flex max-h-[92dvh] flex-col gap-3 overflow-y-auto rounded-t-[18px] bg-white px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.12)] outline-none lg:inset-auto lg:top-1/2 lg:left-1/2 lg:w-[380px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[10px] lg:p-6 lg:shadow-[0_0_0_1px_#d4d4d4,0_20px_40px_rgba(0,0,0,0.18)]";

export function BlockCalcDialog() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("sum");
  const [view, setView] = useState(null);
  useEffect(() => {
    const onOpen = (event) => {
      const next = event.detail === "average" ? "average" : "sum";
      void pageControlFields("blockCalc").then((fields) => {
        if (!fields?.ok) {
          toast("계산할 블록을 먼저 잡으십시오.", "info", null, { key: "blockCalc" });
          return;
        }
        if (!(fields.count > 0)) {
          toast("블록에 수가 없습니다.", "info", null, { key: "blockCalc" });
          return;
        }
        setMode(next);
        setView(fields);
        setOpen(true);
      });
    };
    window.addEventListener("chwp-open-block-calc-dialog", onOpen);
    return () => window.removeEventListener("chwp-open-block-calc-dialog", onOpen);
  }, []);
  const close = () => {
    setOpen(false);
    focusEditor();
  };
  const value = view ? (mode === "average" ? view.average : view.sum) : "";
  const label = mode === "average" ? "평균" : "합계";
  const insert = () => {
    void pageControl("blockCalc", { mode }).then((result) => {
      if (result?.documentChanged) close();
    });
  };
  const copy = () => {
    copyText(value);
    toast(`${label} ${value} 을(를) 복사했습니다.`, "info", null, { key: "blockCalc" });
    close();
  };
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/45" />
        <DialogPrimitive.Content className={shell} onCloseAutoFocus={(event) => { event.preventDefault(); focusEditor(); }}>
          <DialogPrimitive.Description className="sr-only">
            블록 안의 수를 더하거나 평균을 내어 블록 뒤에 넣거나 복사합니다.
          </DialogPrimitive.Description>
          <div className="flex items-center">
            <DialogPrimitive.Title className="flex-1 text-[20px] font-bold">{`블록 ${label}`}</DialogPrimitive.Title>
            <button type="button" className="ui-ghost flex size-12 items-center justify-center rounded-[10px] lg:hidden" aria-label="닫기" onClick={close}>
              <X className="size-6" />
            </button>
          </div>
          <div className="flex gap-2" role="radiogroup" aria-label="계산">
            {[["sum", "합계"], ["average", "평균"]].map(([key, text]) => (
              <button key={key} type="button" role="radio" aria-checked={mode === key}
                className={`h-9 flex-1 rounded-md ${mode === key ? "ui-primary" : "ui-outline"}`} onClick={() => setMode(key)}>
                {text}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-1 rounded-lg bg-[#f5f5f5] p-4">
            <span className="text-[13px] text-[#525252]">{`${label} (수 ${view?.count ?? 0}개)`}</span>
            <output className="text-[28px] font-semibold tabular-nums break-all" aria-live="polite">{value}</output>
          </div>
          {view?.cells && <p className="text-[13px] text-[#525252]">칸 블록의 결과는 복사해서 쓰십시오.</p>}
          <div className="flex flex-row-reverse gap-2 border-t border-[#e5e5e5] pt-3">
            <button type="button" className="ui-primary h-11 flex-1 rounded-lg lg:flex-none lg:px-6" onClick={insert}
              disabled={!view?.canInsert}>넣기</button>
            <button type="button" className="ui-outline h-11 flex-1 rounded-lg lg:flex-none lg:px-6" onClick={copy}>복사</button>
            <button type="button" className="ui-outline h-11 flex-1 rounded-lg lg:flex-none lg:px-6" onClick={close}>닫기</button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
