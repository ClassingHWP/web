import { useEffect, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Minus, Plus, Search, X } from "lucide-react";
import { Choice } from "./FormatDialogs.jsx";

// 미리 정한 배율·한 걸음·칸 수는 코어가 준다(zoomDialogSpec).
function useZoomSpec() {
  const [spec, setSpec] = useState(() => window.__chwpZoomSpec || null);
  useEffect(() => {
    const onSpec = (event) => setSpec(event.detail || null);
    window.addEventListener("chwp-zoom-spec", onSpec);
    return () => window.removeEventListener("chwp-zoom-spec", onSpec);
  }, []);
  return spec || { presets: [], step: 10, minPercent: 1, maxGrid: 8, cols: 4, rows: 3 };
}

const zoomSections = [
  { id: "zoom", label: "배율" },
  { id: "shape", label: "쪽 모양" },
  { id: "move", label: "쪽 이동" },
];

const pageShapes = [
  { id: "auto", label: "자동" },
  { id: "grid", label: "여러 쪽" },
  { id: "single", label: "한 쪽" },
  { id: "two", label: "두 쪽" },
  { id: "fit", label: "맞춤" },
];

// 쪽 모양과 배율을 함께 넘긴다. 어떻게 맞출지는 코어가 정한다.
function requestZoomDialog(detail) {
  window.dispatchEvent(new CustomEvent("chwp-zoom-dialog", { detail }));
}

export function ZoomAdjust({ value, onValue, onStep, step = 10, disabled = false }) {
  return (
    <div className={`ui-box flex h-11 max-w-full items-center self-start overflow-hidden rounded-lg ${disabled ? "pointer-events-none opacity-50" : ""}`}>
      <button type="button" className="ui-ghost flex h-full w-11 items-center justify-center" aria-label="배율 줄이기" disabled={disabled} onClick={() => onStep(-step)}>
        <Minus className="size-[18px]" />
      </button>
      <label className="flex h-full items-center gap-0.5 pr-2">
        <span className="sr-only">사용자 정의 배율</span>
        <input
          className="h-full w-11 border-0 bg-transparent text-center outline-none"
          value={value}
          disabled={disabled}
          onChange={(event) => onValue(event.target.value)}
        />
        %
      </label>
      <button type="button" className="ui-ghost flex h-full w-11 items-center justify-center" aria-label="배율 높이기" disabled={disabled} onClick={() => onStep(step)}>
        <Plus className="size-[18px]" />
      </button>
    </div>
  );
}

function Radio({ name, value, checked, onChange, children, disabled = false }) {
  return (
    <label className={`flex min-h-8 items-center gap-2.5 ${disabled ? "text-[#a3a3a3]" : ""}`}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        disabled={disabled}
        className="ui-radio"
        onChange={() => onChange(value)}
      />
      {children}
    </label>
  );
}

function shapeFromGrid(mode) {
  if (mode === "auto" || mode === "grid" || mode === "two" || mode === "single") return mode;
  return "auto";
}

// 지금 배율·맞춤·쪽 모양. 상태 줄 도구와 모바일 위 막대의 확대/축소가 같이 쓴다.
// zoomFocus 가 참이면(배율 칸을 고치는 중) 배율 글은 바꾸지 않는다.
export function useZoomState(zoomFocus) {
  const [zoomText, setZoomText] = useState("100");
  const [zoomFit, setZoomFit] = useState("");
  const [grid, setGrid] = useState({ mode: "auto", cols: 1, rows: 1 });

  useEffect(() => {
    const onZoom = (event) => {
      const detail = event.detail || {};
      if (detail.zoomMode === "fitPage" || detail.fitPage) setZoomFit("쪽 맞춤");
      else if (detail.zoomMode === "fitWidth" || detail.fitWidth) setZoomFit("폭 맞춤");
      else setZoomFit("");
      const next = Number(detail.percent);
      if (!zoomFocus?.current && Number.isFinite(next)) setZoomText(String(next));
      if (typeof detail.gridMode === "string") {
        setGrid({
          mode: detail.gridMode,
          cols: Number(detail.gridCols) || 1,
          rows: Number(detail.gridRows) || 1,
        });
      }
    };
    window.addEventListener("chwp-zoom-changed", onZoom);
    window.addEventListener("chwp-viewport-changed", onZoom);
    return () => {
      window.removeEventListener("chwp-zoom-changed", onZoom);
      window.removeEventListener("chwp-viewport-changed", onZoom);
    };
  }, [zoomFocus]);
  return { zoomText, setZoomText, zoomFit, setZoomFit, grid };
}

// trigger 를 주면 그 단추로 연다(모바일 위 막대). 좁은 화면에서는 시안(MobileZoom)처럼 아래에서 올라오는 시트다.
export function ZoomDialog({ zoomText, zoomFit, grid, trigger = null }) {
  const spec = useZoomSpec();
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState("100");
  const [custom, setCustom] = useState(zoomText);
  const [shape, setShape] = useState("auto");
  const [cols, setCols] = useState(4);
  const [rows, setRows] = useState(3);
  const [move, setMove] = useState("vertical");
  const [section, setSection] = useState("zoom");

  useEffect(() => {
    if (!open) return;
    setSection("zoom");
    const percent = Number(zoomText);
    if (zoomFit === "쪽 맞춤") setZoom("page");
    else if (zoomFit === "폭 맞춤") setZoom("width");
    else if (spec.presets.includes(percent)) setZoom(String(percent));
    else setZoom("custom");
    setCustom(zoomText || "100");
    setShape(shapeFromGrid(grid.mode));
    setCols(grid.cols > 1 ? grid.cols : spec.cols);
    setRows(grid.rows > 1 ? grid.rows : spec.rows);
    setMove("vertical");
  }, [open, zoomText, zoomFit, grid, spec]);

  function apply() {
    // 쪽 모양 "맞춤"의 뜻과 배율 범위는 코어가 정한다.
    requestZoomDialog({
      shape,
      cols,
      rows,
      zoom: zoom === "page" || zoom === "width" ? zoom : "",
      percent: Number(zoom === "custom" ? custom : zoom) || 0,
    });
    setOpen(false);
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        {trigger || (
          <button type="button" className="ui-outline flex size-[var(--ui-sh)] items-center justify-center rounded-[0.5em]" aria-label="확대/축소">
            <Search className="size-[1em]" />
          </button>
        )}
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-black/45" />
        {/* 시안(다이얼로그 · 확대/축소): 너비 640px, 왼쪽 묶음 셋, 오른쪽 단추 줄 */}
        <DialogPrimitive.Content
          className="toolbar-ui ui-chrome fixed inset-x-0 top-[44px] bottom-0 z-[70] flex flex-col gap-4 overflow-y-auto rounded-t-[18px] bg-white px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.12)] outline-none lg:inset-auto lg:top-1/2 lg:left-1/2 lg:w-[640px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:flex-row lg:gap-5 lg:overflow-visible lg:rounded-[10px] lg:p-6 lg:shadow-[0_0_0_1px_#d4d4d4,0_20px_40px_rgba(0,0,0,0.18)]"
        >
          <DialogPrimitive.Description className="sr-only">배율과 쪽 모양을 고릅니다.</DialogPrimitive.Description>
          <div className="flex min-w-0 flex-1 flex-col gap-3.5">
            <div className="flex items-center">
              <DialogPrimitive.Title className="flex-1 text-[20px] font-bold">확대/축소</DialogPrimitive.Title>
              <DialogPrimitive.Close asChild>
                <button type="button" className="ui-ghost flex size-12 items-center justify-center rounded-[10px] lg:hidden" aria-label="닫기">
                  <X className="size-6" />
                </button>
              </DialogPrimitive.Close>
            </div>
            <div role="tablist" aria-label="확대/축소 구분" className="grid grid-cols-3 gap-1 rounded-[0.6em] bg-[#f5f5f5] p-[0.2em] lg:hidden">
              {zoomSections.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={section === item.id}
                  className={`h-10 rounded-[0.45em] ${section === item.id ? "bg-white font-medium shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[#737373]"}`}
                  onClick={() => setSection(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <fieldset className={`rounded-lg border border-[#e5e5e5] px-3.5 pt-2 pb-3.5 ${section === "zoom" ? "" : "max-lg:hidden"}`}>
              <legend className="px-1.5 font-medium">배율</legend>
              <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:gap-x-6">
                <div className="flex flex-col gap-2.5">
                  {spec.presets.map((percent) => (
                    <Radio key={percent} name="zoom" value={String(percent)} checked={zoom === String(percent)} onChange={setZoom}>
                      {percent}%
                    </Radio>
                  ))}
                </div>
                <div className="flex flex-col gap-2.5">
                  <Radio name="zoom" value="page" checked={zoom === "page"} onChange={setZoom}>쪽 맞춤</Radio>
                  <Radio name="zoom" value="width" checked={zoom === "width"} onChange={setZoom}>폭 맞춤</Radio>
                  <Radio name="zoom" value="custom" checked={zoom === "custom"} onChange={setZoom}>사용자 정의</Radio>
                  <ZoomAdjust
                    value={custom}
                    step={spec.step}
                    disabled={zoom !== "custom"}
                    onValue={(next) => { setZoom("custom"); setCustom(next); }}
                    onStep={(delta) => {
                      setZoom("custom");
                      // 칸 안에서 숫자만 옮긴다. 범위는 적용할 때 코어가 자른다.
                      setCustom(String(Math.max(spec.minPercent, Math.round((Number(custom) || 0) + delta))));
                    }}
                  />
                </div>
              </div>
            </fieldset>
            <fieldset className={`rounded-lg border border-[#e5e5e5] px-3.5 pt-2 pb-3.5 ${section === "shape" ? "" : "max-lg:hidden"}`}>
              <legend className="px-1.5 font-medium">쪽 모양</legend>
              <div className="flex flex-col gap-2.5">
                {pageShapes.map((item) => (
                  <Radio key={item.id} name="shape" value={item.id} checked={shape === item.id} onChange={setShape}>
                    {item.id === "grid" ? (
                      <span className="flex flex-wrap items-center gap-2">
                        여러 쪽
                        <Choice label="가로 쪽 수" value={String(cols)} options={Array.from({ length: spec.maxGrid }, (_, index) => [String(index + 1), String(index + 1)])} width="4.5em" disabled={shape !== "grid"} onChange={(n) => setCols(Number(n))} />
                        x
                        <Choice label="세로 쪽 수" value={String(rows)} options={Array.from({ length: spec.maxGrid }, (_, index) => [String(index + 1), String(index + 1)])} width="4.5em" disabled={shape !== "grid"} onChange={(n) => setRows(Number(n))} />
                      </span>
                    ) : item.label}
                  </Radio>
                ))}
              </div>
            </fieldset>
            <fieldset className={`rounded-lg border border-[#e5e5e5] px-3.5 pt-2 pb-3.5 ${section === "move" ? "" : "max-lg:hidden"}`}>
              <legend className="px-1.5 font-medium">쪽 이동</legend>
              <div className="flex flex-col gap-2.5">
                <Radio name="move" value="vertical" checked={move === "vertical"} onChange={setMove}>세로 방향</Radio>
                <Radio name="move" value="horizontal" checked={move === "horizontal"} onChange={setMove}>가로 방향</Radio>
                <label className="flex items-start gap-2.5 text-[16px] text-[#a3a3a3]">
                  <input type="checkbox" disabled className="mt-0.5 size-5 shrink-0 accent-[#171717]" />
                  <span>마우스 휠을 사용하여 좌우로 스크롤 하기</span>
                </label>
              </div>
            </fieldset>
          </div>
          <div className="mt-auto flex shrink-0 flex-row-reverse gap-2 border-t border-[#e5e5e5] pt-3 lg:mt-0 lg:w-[104px] lg:flex-col lg:border-0 lg:pt-11">
            <button type="button" className="ui-primary h-[54px] flex-1 rounded-[10px] lg:h-11 lg:flex-none lg:rounded-lg" onClick={apply}>설정(D)</button>
            <DialogPrimitive.Close asChild>
              <button type="button" className="ui-outline h-[54px] flex-1 rounded-[10px] lg:h-11 lg:flex-none lg:rounded-lg">취소</button>
            </DialogPrimitive.Close>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
