import { useEffect, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { columnView, setColumns } from "./ui-actions.js";
import { ColorField } from "./ColorPicker.jsx";
import { lineShapeLabels } from "./FormatDialogs.jsx";

// 단 설정 대화 상자(한글 2024 단 설정과 같은 칸). 너비·간격 계산과 모양 판정은 코어(columnView)가 한다.
// 셸은 고른 값을 코어에 넘기고, 코어가 다시 계산해 준 값을 보인다.

export function openColumnDialog() {
  window.dispatchEvent(new Event("chwp-open-column-dialog"));
}

const kinds = [["NEWSPAPER", "일반 단"], ["BALANCED_NEWSPAPER", "배분 단"], ["PARALLEL", "평행 단"]];
const presets = [["one", "하나"], ["two", "둘"], ["three", "셋"], ["left", "왼쪽"], ["right", "오른쪽"]];
const directions = [["LEFT", "왼쪽부터"], ["RIGHT", "오른쪽부터"], ["MIRROR", "맞쪽"]];
const applyTargets = [["WHOLE", "문서 전체"], ["NEW_PAGE", "새 쪽으로"], ["NEW_COLUMN", "새 단으로"]];
const lineTypes = ["SOLID", "DOT", "DASH", "DASH_DOT", "DASH_DOT_DOT", "LONG_DASH", "CIRCLE", "DOUBLE_SLIM", "SLIM_THICK",
  "THICK_SLIM", "SLIM_THICK_SLIM"];
// 구분선 굵기(mm 목록, 한글 굵기 목록 앞 칸). 값은 HWPUNIT.
const lineWidths = [0.1, 0.12, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5].map((mm) => [Math.round((mm * 7200) / 25.4), `${mm} mm`]);

function PresetIcon({ name }) {
  const bars = { one: [[2, 20]], two: [[2, 9], [13, 9]], three: [[2, 5.5], [9.25, 5.5], [16.5, 5.5]], left: [[2, 6], [10, 12]], right: [[2, 12], [16, 6]] }[name];
  return (
    <svg viewBox="0 0 24 24" className="size-[28px]" aria-hidden="true">
      {bars.map(([x, w]) => [5, 8, 11, 14, 17].map((y) => <rect key={`${x}-${y}`} x={x} y={y} width={w} height="1.4" fill="currentColor" />))}
    </svg>
  );
}

export function ColumnDialog() {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(null);
  const asked = useRef({});

  // 고른 값을 쌓아 코어에 다시 계산을 맡긴다.
  const refresh = (patch) => {
    const next = { ...asked.current, ...patch };
    for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
    asked.current = next;
    void columnView(asked.current).then((next) => { if (next) setView(next); });
  };

  useEffect(() => {
    const onOpen = () => {
      asked.current = {};
      setView(null);
      setOpen(true);
      refresh({});
    };
    window.addEventListener("chwp-open-column-dialog", onOpen);
    return () => window.removeEventListener("chwp-open-column-dialog", onOpen);
  }, []);

  const close = () => {
    setOpen(false);
    window.dispatchEvent(new Event("chwp-focus-editor"));
  };
  // 대화 상자에 보인 값은 코어가 같은 고른 값으로 계산한 것이다. 넣을 때도 그 고른 값을 넘긴다.
  const apply = () => {
    const fields = { ...asked.current };
    close();
    void setColumns(fields);
  };

  const v = view || {};
  const count = Number(v.count) || 1;
  const sameSize = v.sameSize !== false;
  const rows = Array.from({ length: Math.max(count, 3) }, (_, i) => i);
  const num = "ui-box h-9 w-[5.5em] rounded-md px-2 text-right disabled:opacity-40";

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/45" />
        <DialogPrimitive.Content className="toolbar-ui ui-chrome fixed inset-x-0 bottom-0 z-[80] flex max-h-[92dvh] flex-col gap-3 overflow-y-auto rounded-t-[18px] bg-white px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.12)] outline-none lg:inset-auto lg:top-1/2 lg:left-1/2 lg:w-[560px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[10px] lg:p-6 lg:shadow-[0_0_0_1px_#d4d4d4,0_20px_40px_rgba(0,0,0,0.18)]">
          <DialogPrimitive.Description className="sr-only">단 수와 너비, 간격, 구분선, 적용 범위를 정합니다.</DialogPrimitive.Description>
          <div className="flex items-center">
            <DialogPrimitive.Title className="flex-1 text-[20px] font-bold">단 설정</DialogPrimitive.Title>
            <button type="button" className="ui-ghost flex size-12 items-center justify-center rounded-[10px] lg:hidden" aria-label="닫기" onClick={close}>
              <X className="size-6" />
            </button>
          </div>
          <fieldset className="flex gap-4 rounded-lg border border-[#e5e5e5] px-3 pt-1.5 pb-3">
            <legend className="px-1.5 font-medium">단 종류</legend>
            {kinds.map(([value, label]) => (
              <label key={value} className="flex items-center gap-2">
                <input type="radio" name="colType" checked={(v.type || "NEWSPAPER") === value} onChange={() => refresh({ type: value })} />
                {label}
              </label>
            ))}
          </fieldset>
          <fieldset className="rounded-lg border border-[#e5e5e5] px-3 pt-1.5 pb-3">
            <legend className="px-1.5 font-medium">자주 쓰이는 모양</legend>
            <div className="flex justify-between">
              {presets.map(([value, label]) => (
                <button key={value} type="button" className={`ui-rb flex w-[4.4em] flex-col items-center gap-1 rounded-md py-1 ${v.preset === value ? "on" : ""}`} aria-pressed={v.preset === value} onClick={() => refresh({ preset: value, count: undefined, sameSize: undefined })}>
                  <PresetIcon name={value} />
                  <span className="text-[0.9em]">{label}</span>
                </button>
              ))}
            </div>
            <label className="mt-2 flex items-center gap-2">
              <span>단 개수</span>
              <input type="number" min={1} max={v.maxCount || 1} className="ui-box h-9 w-[4.5em] rounded-md px-2 text-right" value={count} onChange={(event) => refresh({ preset: undefined, count: Number(event.target.value) || 1 })} />
            </label>
          </fieldset>
          <fieldset className="grid grid-cols-[auto_1fr] items-center gap-2 rounded-lg border border-[#e5e5e5] px-3 pt-1.5 pb-3">
            <legend className="px-1.5 font-medium">구분선</legend>
            <label className="col-span-2 flex items-center gap-2">
              <input type="checkbox" checked={!!v.line} onChange={(event) => refresh({ line: event.target.checked })} />
              구분선 넣기
            </label>
            <span>종류</span>
            <select className="ui-box h-9 rounded-md px-2" disabled={!v.line} value={v.lineType || "SOLID"} onChange={(event) => refresh({ lineType: event.target.value })}>
              {lineTypes.map((type) => <option key={type} value={type}>{lineShapeLabels[type] || type}</option>)}
            </select>
            <span>굵기</span>
            <select className="ui-box h-9 rounded-md px-2" disabled={!v.line} value={v.lineWidth || 34} onChange={(event) => refresh({ lineWidth: Number(event.target.value) })}>
              {lineWidths.map(([hu, label]) => <option key={hu} value={hu}>{label}</option>)}
            </select>
            <span>색</span>
            <ColorField value={v.lineColor || "#000000"} disabled={!v.line} onChange={(hex) => refresh({ lineColor: hex || "#000000" })} label="구분선 색" />
          </fieldset>
          <fieldset className="rounded-lg border border-[#e5e5e5] px-3 pt-1.5 pb-3">
            <legend className="px-1.5 font-medium">너비 및 간격</legend>
            <div className="grid grid-cols-[3em_auto_auto] items-center gap-x-3 gap-y-1.5">
              <span className="text-[#737373]">단 번호</span><span className="text-[#737373]">너비(mm)</span><span className="text-[#737373]">간격(mm)</span>
              {rows.map((i) => {
                const live = i < count;
                const width = v[`widthMm.${i}`];
                const gap = sameSize ? v.gapMm : v[`gapMm.${i}`];
                return [
                  <span key={`n${i}`} className={live ? "" : "text-[#a3a3a3]"}>{live ? i + 1 : ""}</span>,
                  <input key={`w${i}`} type="number" step="0.1" className={num} disabled={!live || sameSize} value={live ? width ?? "" : ""}
                    onChange={(event) => refresh({ [`widthMm.${i}`]: Number(event.target.value) })} />,
                  <input key={`g${i}`} type="number" step="0.1" className={num} disabled={!live || i + 1 >= count || (sameSize && i > 0)}
                    value={live && i + 1 < count ? gap ?? "" : ""}
                    onChange={(event) => refresh(sameSize ? { gapMm: Number(event.target.value) } : { [`gapMm.${i}`]: Number(event.target.value) })} />,
                ];
              })}
            </div>
            <label className="mt-2 flex items-center gap-2">
              <input type="checkbox" checked={sameSize} onChange={(event) => refresh({ preset: undefined, sameSize: event.target.checked })} />
              단 너비 동일하게
            </label>
          </fieldset>
          <fieldset className="flex gap-4 rounded-lg border border-[#e5e5e5] px-3 pt-1.5 pb-3">
            <legend className="px-1.5 font-medium">단 방향</legend>
            {directions.map(([value, label]) => (
              <label key={value} className="flex items-center gap-2">
                <input type="radio" name="colDir" checked={(v.direction || "LEFT") === value} onChange={() => refresh({ direction: value })} />
                {label}
              </label>
            ))}
          </fieldset>
          <label className="flex items-center gap-3">
            <span>적용 범위</span>
            <select className="ui-box h-9 rounded-md px-2" value={v.applyTo || "WHOLE"} onChange={(event) => refresh({ applyTo: event.target.value })}>
              {applyTargets.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <div className="flex flex-row-reverse gap-2 border-t border-[#e5e5e5] pt-3">
            <button type="button" className="ui-primary h-11 flex-1 rounded-lg lg:flex-none lg:px-6" onClick={apply} disabled={!view}>설정(D)</button>
            <button type="button" className="ui-outline h-11 flex-1 rounded-lg lg:flex-none lg:px-6" onClick={close}>취소</button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
