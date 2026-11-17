import { useEffect, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Minus, Plus, X } from "lucide-react";
import { tableEdit } from "./ui-actions.js";

// 표 만들기. 줄·칸 개수, 너비(단에 맞춤·문단에 맞춤·임의 값), 높이(자동·임의 값), 글자처럼 취급을 받는다. 그 뜻과 표 모양(테두리 등)은
// 코어(editInsertTable)가 정한다. 고른 너비와 글자처럼 취급은 한글처럼 다음에 열 때도 남는다.
// 리본·메뉴는 openTableDialog 로 연다.

// mode 가 split 이면 셀 나누기(줄·칸 수를 받아 캐럿 칸을 나눈다)다.
export function openTableDialog(mode = "insert") {
  window.dispatchEvent(new CustomEvent("chwp-open-table-dialog", { detail: { mode: mode === "split" ? "split" : "insert" } }));
}

const clampCount = (value, max) => {
  const next = Math.round(Number(value));
  if (!Number.isFinite(next)) return 1;
  return Math.min(max, Math.max(1, next));
};

function CountField({ label, value, max, onValue }) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span>{label}</span>
      <span className="ui-box flex h-11 items-center overflow-hidden rounded-lg">
        <button type="button" className="ui-ghost flex h-full w-11 items-center justify-center" aria-label={`${label} 줄이기`} onClick={() => onValue(clampCount(value - 1, max))}>
          <Minus className="size-[18px]" />
        </button>
        <input
          className="h-full w-12 border-0 bg-transparent text-center outline-none"
          inputMode="numeric"
          aria-label={label}
          value={value}
          onChange={(event) => onValue(event.target.value === "" ? "" : clampCount(event.target.value, max))}
        />
        <button type="button" className="ui-ghost flex h-full w-11 items-center justify-center" aria-label={`${label} 늘리기`} onClick={() => onValue(clampCount(Number(value) + 1, max))}>
          <Plus className="size-[18px]" />
        </button>
      </span>
    </label>
  );
}

function SizeField({ value, disabled, onValue, label }) {
  return (
    <span className="flex items-center gap-1">
      <input className="ui-box h-10 w-20 rounded-md px-2 text-right disabled:opacity-50" type="number" step="0.1" min="1"
        aria-label={label} disabled={disabled} value={value} onChange={(event) => onValue(event.target.value)} />
      <span className="text-[0.9em] text-[#666]">mm</span>
    </span>
  );
}

export function TableDialog() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(1);
  const [cols, setCols] = useState(1);
  const [limits, setLimits] = useState({ rows: 1, cols: 1 });
  const [mode, setMode] = useState("insert");
  const [widthFit, setWidthFit] = useState("column");
  const [treatAsChar, setTreatAsChar] = useState(true);
  const [heightFit, setHeightFit] = useState("auto");
  const [width, setWidth] = useState(148);
  const [height, setHeight] = useState(22.6);

  useEffect(() => {
    // 처음 줄·칸 수와 한도는 코어가 준다. 셀 나누기는 한글처럼 1줄 2칸에서 시작한다.
    const onOpen = (event) => {
      const next = event?.detail?.mode === "split" ? "split" : "insert";
      setMode(next);
      if (next === "split") {
        setRows(1);
        setCols(2);
      }
      setOpen(true);
      void window.__chwpFormatView?.(3, {}).then((view) => {
        if (!view) return;
        setRows(next === "split" ? 1 : view.values.rows);
        setCols(next === "split" ? 2 : view.values.cols);
        setLimits({ rows: view.specs.rows?.max ?? 1, cols: view.specs.cols?.max ?? 1 });
        // 임의 값을 고르기 전에는 처음 값(코어: 단에 맞춤 폭, 자동 높이)을 흐리게 보인다.
        if (typeof view.values.width === "number") setWidth((now) => (widthFitRef.current === "custom" ? now : view.values.width));
        if (typeof view.values.height === "number") setHeight((now) => (heightFitRef.current === "custom" ? now : view.values.height));
      });
    };
    window.addEventListener("chwp-open-table-dialog", onOpen);
    return () => window.removeEventListener("chwp-open-table-dialog", onOpen);
  }, []);

  const widthFitRef = useRef(widthFit);
  const heightFitRef = useRef(heightFit);
  widthFitRef.current = widthFit;
  heightFitRef.current = heightFit;

  const close = () => {
    setOpen(false);
    window.dispatchEvent(new Event("chwp-focus-editor"));
  };

  const apply = () => {
    const r = clampCount(rows, limits.rows);
    const c = clampCount(cols, limits.cols);
    close();
    if (mode === "split") {
      tableEdit("splitCell", { rows: r, cols: c });
      return;
    }
    if (typeof window.__chwpInsertTable === "function") void window.__chwpInsertTable(r, c, {
      widthFit, treatAsChar,
      ...(widthFit === "custom" ? { width: Number(width) || 0 } : {}),
      ...(heightFit === "custom" ? { height: Number(height) || 0 } : {}),
    });
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/45" />
        <DialogPrimitive.Content
          className="toolbar-ui ui-chrome fixed inset-x-0 bottom-0 z-[80] flex flex-col gap-4 rounded-t-[18px] bg-white px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.12)] outline-none lg:inset-auto lg:top-1/2 lg:left-1/2 lg:w-[460px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:flex-row lg:gap-5 lg:rounded-[10px] lg:p-6 lg:shadow-[0_0_0_1px_#d4d4d4,0_20px_40px_rgba(0,0,0,0.18)]"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              apply();
            }
          }}
        >
          <DialogPrimitive.Description className="sr-only">{mode === "split" ? "칸을 나눌 줄과 칸 개수를 정합니다." : "넣을 표의 줄·칸 개수와 너비, 글자처럼 취급을 정합니다."}</DialogPrimitive.Description>
          <div className="flex min-w-0 flex-1 flex-col gap-3.5">
            <div className="flex items-center">
              <DialogPrimitive.Title className="flex-1 text-[20px] font-bold">{mode === "split" ? "셀 나누기" : "표 만들기"}</DialogPrimitive.Title>
              <button type="button" className="ui-ghost flex size-12 items-center justify-center rounded-[10px] lg:hidden" aria-label="닫기" onClick={close}>
                <X className="size-6" />
              </button>
            </div>
            <fieldset className="flex flex-col gap-2.5 rounded-lg border border-[#e5e5e5] px-3.5 pt-2 pb-3.5">
              <legend className="px-1.5 font-medium">줄/칸</legend>
              <CountField label="줄 개수" value={rows} max={limits.rows} onValue={setRows} />
              <CountField label="칸 개수" value={cols} max={limits.cols} onValue={setCols} />
            </fieldset>
            {mode === "insert" && (
              <fieldset className="flex flex-col gap-2.5 rounded-lg border border-[#e5e5e5] px-3.5 pt-2 pb-3.5">
                <legend className="px-1.5 font-medium">크기 지정</legend>
                <label className="flex items-center justify-between gap-3">
                  <span className="shrink-0">너비</span>
                  <select className="ui-box h-10 rounded-md px-2" value={widthFit} onChange={(event) => setWidthFit(event.target.value)}>
                    <option value="column">단에 맞춤</option>
                    <option value="paragraph">문단에 맞춤</option>
                    <option value="custom">임의 값</option>
                  </select>
                  <SizeField value={width} disabled={widthFit !== "custom"} onValue={setWidth} label="너비 mm" />
                </label>
                <label className="flex items-center justify-between gap-3">
                  <span className="shrink-0">높이</span>
                  <select className="ui-box h-10 rounded-md px-2" value={heightFit} onChange={(event) => setHeightFit(event.target.value)}>
                    <option value="auto">자동</option>
                    <option value="custom">임의 값</option>
                  </select>
                  <SizeField value={height} disabled={heightFit !== "custom"} onValue={setHeight} label="높이 mm" />
                </label>
              </fieldset>
            )}
            {mode === "insert" && (
              <fieldset className="flex flex-col gap-2.5 rounded-lg border border-[#e5e5e5] px-3.5 pt-2 pb-3.5">
                <legend className="px-1.5 font-medium">기타</legend>
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="size-4" checked={treatAsChar} onChange={(event) => setTreatAsChar(event.target.checked)} />
                  <span>글자처럼 취급</span>
                </label>
              </fieldset>
            )}
          </div>
          <div className="flex shrink-0 flex-row-reverse gap-2 border-t border-[#e5e5e5] pt-3 lg:w-[104px] lg:flex-col lg:border-0 lg:pt-11">
            <button type="button" className="ui-primary h-[54px] flex-1 rounded-[10px] lg:h-11 lg:flex-none lg:rounded-lg" onClick={apply}>{mode === "split" ? "나누기(D)" : "만들기(D)"}</button>
            <button type="button" className="ui-outline h-[54px] flex-1 rounded-[10px] lg:h-11 lg:flex-none lg:rounded-lg" onClick={close}>취소</button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
