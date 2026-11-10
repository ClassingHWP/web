import { useState } from "react";
import { FlipHorizontal2, FlipVertical2, MoveDiagonal, RefreshCw, RotateCcw, RotateCw } from "lucide-react";
import { Frame, focusEditor, useOpen } from "./TableTextDialog.jsx";
import { tableEdit } from "./ui-actions.js";

// 표 뒤집기(한글 2024 TableSwap 대화 상자): 대칭 — 줄 기준 뒤집기·칸 기준 뒤집기·줄/칸 뒤집기,
// 회전 — 반시계 방향 90도·180도·시계 방향 90도, 선택 사항 — 여백 뒤집기(C). 뒤집는 규칙은 코어(flipTable)가 한다.
// 번호는 한글 TableSwap 의 type 이다.

export function openTableFlipDialog() {
  window.dispatchEvent(new Event("chwp-open-table-flip-dialog"));
}

const groups = [
  ["대칭", [[0, "줄 기준 뒤집기", FlipVertical2], [1, "칸 기준 뒤집기", FlipHorizontal2], [2, "줄/칸 뒤집기", MoveDiagonal]]],
  ["회전", [[3, "반시계 방향 90도", RotateCcw], [4, "180도", RefreshCw], [5, "시계 방향 90도", RotateCw]]],
];

export function TableFlipDialog() {
  const [open, setOpen] = useOpen("chwp-open-table-flip-dialog");
  const [flip, setFlip] = useState(0);
  const [swapMargin, setSwapMargin] = useState(false);
  const close = () => {
    setOpen(false);
    focusEditor();
  };
  const apply = () => {
    void tableEdit("flip", { flip, swapMargin: swapMargin ? 1 : 0 }).then((result) => { if (result?.documentChanged) close(); });
  };
  return (
    <Frame open={open} onClose={close} title="표 뒤집기" description="캐럿이 든 표를 줄·칸 기준으로 뒤집거나 돌립니다." onApply={apply} applyLabel="뒤집기">
      {groups.map(([legend, items]) => (
        <fieldset key={legend} className="flex flex-col gap-1 rounded-md border border-[#e5e5e5] p-2">
          <legend className="px-1">{legend}</legend>
          <div className="grid grid-cols-3 gap-2">
            {items.map(([value, label, Icon]) => (
              <button key={value} type="button" aria-pressed={flip === value}
                className={`ui-rb flex min-h-16 flex-col items-center justify-center gap-1 rounded-md px-1 text-[0.9em] ${flip === value ? "on" : ""}`}
                onClick={() => setFlip(value)}>
                <Icon className="size-6" aria-hidden="true" />{label}
              </button>
            ))}
          </div>
        </fieldset>
      ))}
      <fieldset className="flex flex-col gap-1 rounded-md border border-[#e5e5e5] p-2">
        <legend className="px-1">선택 사항</legend>
        <label className="flex min-h-9 items-center gap-2">
          <input type="checkbox" checked={swapMargin} onChange={(event) => setSwapMargin(event.target.checked)} />여백 뒤집기(C)
        </label>
      </fieldset>
    </Frame>
  );
}
