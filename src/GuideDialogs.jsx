import { useEffect, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { applyViewGuides, viewGuidesView } from "./ui-actions.js";

// 격자 설정·개체 이동 안내선 설정 대화 상자(한글 2024 와 같은 칸). 값의 범위·기준 위치 바꾸기 계산은 코어(viewGuides)가 한다.
// 셸은 고른 값을 코어에 넘기고, 코어가 다시 계산해 준 값을 보인다.

export function openGridDialog() {
  window.dispatchEvent(new Event("chwp-open-grid-dialog"));
}

export function openMoveGuideDialog() {
  window.dispatchEvent(new Event("chwp-open-move-guide-dialog"));
}

const gridKinds = [["DOTS", "점"], ["HORIZONTAL", "가로선"], ["VERTICAL", "세로선"], ["BOTH", "가로/세로선"]];
const gridSnaps = [["FREE", "격자에 상관 없이"], ["MAGNET", "격자 자석 효과"], ["ONLY", "격자에만 붙이기"]];

function GridKindIcon({ kind }) {
  const lines = [4, 8, 12, 16, 20];
  return (
    <svg viewBox="0 0 24 24" className="size-[26px]" aria-hidden="true">
      {kind === "DOTS"
        ? lines.flatMap((y) => lines.map((x) => <rect key={`${x}-${y}`} x={x - 0.7} y={y - 0.7} width="1.4" height="1.4" fill="currentColor" />))
        : null}
      {kind === "HORIZONTAL" || kind === "BOTH" ? lines.map((y) => <rect key={`h${y}`} x="3" y={y - 0.5} width="18" height="1" fill="currentColor" />) : null}
      {kind === "VERTICAL" || kind === "BOTH" ? lines.map((x) => <rect key={`v${x}`} x={x - 0.5} y="3" width="1" height="18" fill="currentColor" />) : null}
    </svg>
  );
}

// 고른 값을 쌓아 코어에 다시 계산을 맡기는 대화 상자 틀.
function useGuideDialog(eventName) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(null);
  const asked = useRef({});
  const refresh = (patch) => {
    const next = { ...asked.current, ...patch };
    for (const key of Object.keys(next)) if (next[key] === undefined) delete next[key];
    asked.current = next;
    void viewGuidesView(asked.current).then((next) => { if (next) setView(next); });
  };
  useEffect(() => {
    const onOpen = () => {
      asked.current = {};
      setView(null);
      setOpen(true);
      refresh({});
    };
    window.addEventListener(eventName, onOpen);
    return () => window.removeEventListener(eventName, onOpen);
  }, []);
  const close = () => {
    setOpen(false);
    window.dispatchEvent(new Event("chwp-focus-editor"));
  };
  // 대화 상자에 보인 값은 코어가 같은 고른 값으로 계산한 것이다. 넣을 때도 그 고른 값을 넘긴다.
  const apply = () => {
    const fields = { ...asked.current };
    close();
    void applyViewGuides(fields);
  };
  return { open, view, refresh, close, apply };
}

function DialogFrame({ title, description, open, close, apply, ready, children }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/45" />
        <DialogPrimitive.Content className="toolbar-ui ui-chrome fixed inset-x-0 bottom-0 z-[80] flex max-h-[92dvh] flex-col gap-3 overflow-y-auto rounded-t-[18px] bg-white px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.12)] outline-none lg:inset-auto lg:top-1/2 lg:left-1/2 lg:w-[460px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[10px] lg:p-6 lg:shadow-[0_0_0_1px_#d4d4d4,0_20px_40px_rgba(0,0,0,0.18)]">
          <DialogPrimitive.Description className="sr-only">{description}</DialogPrimitive.Description>
          <div className="flex items-center">
            <DialogPrimitive.Title className="flex-1 text-[20px] font-bold">{title}</DialogPrimitive.Title>
            <button type="button" className="ui-ghost flex size-12 items-center justify-center rounded-[10px] lg:hidden" aria-label="닫기" onClick={close}>
              <X className="size-6" />
            </button>
          </div>
          {children}
          <div className="flex flex-row-reverse gap-2 border-t border-[#e5e5e5] pt-3">
            <button type="button" className="ui-primary h-11 flex-1 rounded-lg lg:flex-none lg:px-6" onClick={apply} disabled={!ready}>설정(D)</button>
            <button type="button" className="ui-outline h-11 flex-1 rounded-lg lg:flex-none lg:px-6" onClick={close}>취소</button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

const group = "rounded-lg border border-[#e5e5e5] px-3 pt-1.5 pb-3";
const num = "ui-box h-9 w-[6em] rounded-md px-2 text-right disabled:opacity-40";

// 가로·세로 mm 두 칸.
function MmPair({ x, y, onX, onY, disabled }) {
  return (
    <div className="flex items-center gap-2">
      <span>가로</span>
      <input type="number" step="0.01" className={num} disabled={disabled} value={x ?? ""} onChange={(event) => onX(Number(event.target.value))} />
      <span className="text-[#737373]">mm</span>
      <span className="ml-2">세로</span>
      <input type="number" step="0.01" className={num} disabled={disabled} value={y ?? ""} onChange={(event) => onY(Number(event.target.value))} />
      <span className="text-[#737373]">mm</span>
    </div>
  );
}

export function GridDialog() {
  const { open, view, refresh, close, apply } = useGuideDialog("chwp-open-grid-dialog");
  const v = view || {};
  const shown = !!v.gridShow;
  return (
    <DialogFrame title="격자 설정" description="격자 모양과 위치, 방식, 간격, 기준 위치를 정합니다." open={open} close={close} apply={apply} ready={!!view}>
      <fieldset className={group}>
        <legend className="px-1.5 font-medium">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={shown} onChange={(event) => refresh({ gridShow: event.target.checked })} />
            격자 보기
          </label>
        </legend>
        <div className="flex justify-between">
          {gridKinds.map(([value, label]) => (
            <button key={value} type="button" disabled={!shown} className={`ui-rb flex w-[5.2em] flex-col items-center gap-1 rounded-md py-1 disabled:opacity-40 ${v.gridKind === value ? "on" : ""}`}
              aria-pressed={v.gridKind === value} onClick={() => refresh({ gridKind: value })}>
              <GridKindIcon kind={value} />
              <span className="text-[0.9em]">{label}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className={`flex gap-4 ${group}`}>
        <legend className="px-1.5 font-medium">격자 위치</legend>
        {[[false, "글 뒤"], [true, "글 앞"]].map(([front, label]) => (
          <label key={label} className="flex items-center gap-2">
            <input type="radio" name="gridFront" checked={!!v.gridFront === front} onChange={() => refresh({ gridFront: front })} />
            {label}
          </label>
        ))}
      </fieldset>
      <fieldset className={`flex flex-col gap-1.5 ${group}`}>
        <legend className="px-1.5 font-medium">격자 방식</legend>
        {gridSnaps.map(([value, label]) => (
          <label key={value} className="flex items-center gap-2">
            <input type="radio" name="gridSnap" checked={(v.gridSnap || "FREE") === value} onChange={() => refresh({ gridSnap: value })} />
            {label}
          </label>
        ))}
      </fieldset>
      <fieldset className={group}>
        <legend className="px-1.5 font-medium">격자 간격</legend>
        <MmPair x={v.gridSpanX} y={v.gridSpanY} onX={(mm) => refresh({ gridSpanX: mm })} onY={(mm) => refresh({ gridSpanY: mm })} />
      </fieldset>
      <fieldset className={`flex flex-col gap-2 ${group}`}>
        <legend className="px-1.5 font-medium">격자 기준 위치</legend>
        <div className="flex gap-4">
          {[["PAGE", "쪽"], ["PAPER", "종이"]].map(([value, label]) => (
            <label key={value} className="flex items-center gap-2">
              <input type="radio" name="gridBase" checked={(v.gridBase || "PAGE") === value}
                onChange={() => refresh({ gridBase: value, gridOriginX: undefined, gridOriginY: undefined })} />
              {label}
            </label>
          ))}
        </div>
        <MmPair x={v.gridOriginX} y={v.gridOriginY} onX={(mm) => refresh({ gridOriginX: mm })} onY={(mm) => refresh({ gridOriginY: mm })} />
      </fieldset>
      <fieldset className={group}>
        <legend className="px-1.5 font-medium">격자 자석 범위</legend>
        <MmPair x={v.gridMagnetX} y={v.gridMagnetY} disabled={v.gridSnap !== "MAGNET"}
          onX={(mm) => refresh({ gridMagnetX: mm })} onY={(mm) => refresh({ gridMagnetY: mm })} />
      </fieldset>
    </DialogFrame>
  );
}

export function MoveGuideDialog() {
  const { open, view, refresh, close, apply } = useGuideDialog("chwp-open-move-guide-dialog");
  const v = view || {};
  const shown = !!v.moveGuides;
  return (
    <DialogFrame title="개체 이동 안내선 설정" description="개체 이동 안내선 모양과 방식, 기준 위치, 선택 사항을 정합니다." open={open} close={close} apply={apply} ready={!!view}>
      <fieldset className={group}>
        <legend className="px-1.5 font-medium">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={shown} onChange={(event) => refresh({ moveGuides: event.target.checked })} />
            개체 이동 안내선 보기
          </label>
        </legend>
        <div className="flex gap-4">
          {[[false, "실선"], [true, "점선"]].map(([dashed, label]) => (
            <label key={label} className={`flex items-center gap-2 ${shown ? "" : "opacity-40"}`}>
              <input type="radio" name="moveDashed" disabled={!shown} checked={!!v.moveDashed === dashed} onChange={() => refresh({ moveDashed: dashed })} />
              {label}
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className={`flex flex-col gap-1.5 ${group}`}>
        <legend className="px-1.5 font-medium">안내선 방식</legend>
        {[[false, "선택 개체에 맞춰 이동"], [true, "선택 개체를 다른 개체에 맞춰 이동"]].map(([others, label]) => (
          <label key={label} className="flex items-center gap-2">
            <input type="radio" name="moveOthers" checked={!!v.moveOthers === others} onChange={() => refresh({ moveOthers: others })} />
            {label}
          </label>
        ))}
      </fieldset>
      <fieldset className={`flex gap-4 ${group}`}>
        <legend className="px-1.5 font-medium">안내선 기준 위치</legend>
        {[["PAGE", "쪽"], ["PAPER", "종이"]].map(([value, label]) => (
          <label key={value} className="flex items-center gap-2">
            <input type="radio" name="moveBase" checked={(v.moveBase || "PAPER") === value} onChange={() => refresh({ moveBase: value })} />
            {label}
          </label>
        ))}
      </fieldset>
      <fieldset className={`flex flex-col gap-1.5 ${group}`}>
        <legend className="px-1.5 font-medium">선택 사항</legend>
        {[["moveMagnet", "이동 안내선에 자석 효과"], ["moveTipPosition", "위치 정보 풍선 도움말 표시"], ["moveTipSize", "크기 정보 풍선 도움말 표시"]].map(([key, label]) => (
          <label key={key} className="flex items-center gap-2">
            <input type="checkbox" checked={!!v[key]} onChange={(event) => refresh({ [key]: event.target.checked })} />
            {label}
          </label>
        ))}
      </fieldset>
    </DialogFrame>
  );
}
