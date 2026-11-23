import { useState } from "react";
import { Frame, focusEditor, useOpen } from "./TableTextDialog.jsx";
import { runShortcut, toast } from "./ui-actions.js";

// 문단 첫 글자 장식(한글 DropCapDlg). 모양(없음·2줄·3줄·여백)과 본문과의 간격을 골라 캐럿 문단에 건다.
// 상자 크기·글자 모양·배치는 코어(dropCap)가 정한다. 셸은 mm 를 HWPUNIT 로 바꿔 넘긴다.

export function openDropCapDialog() {
  window.dispatchEvent(new Event("chwp-open-drop-cap-dialog"));
}

const huPerMm = 7200 / 25.4;
const shapes = [[0, "없음"], [1, "2줄"], [2, "3줄"], [3, "여백"]];

function ShapeIcon({ style }) {
  const lines = [0, 1, 2, 3, 4];
  const big = style === 1 ? 2 : style >= 2 ? 3 : 0;
  return (
    <svg viewBox="-22 0 70 40" className="h-10 w-16" aria-hidden="true">
      {lines.map((i) => {
        const y = 6 + i * 7;
        const left = big && i < big ? (style === 3 ? 6 : big === 2 ? 22 : 27) : 6;
        return <line key={i} x1={left} y1={y} x2={44} y2={y} stroke="#9a9a9a" strokeWidth="2" />;
      })}
      {big ? <text x={style === 3 ? -19 : 4} y={big === 2 ? 17 : 24} fontSize={big === 2 ? 15 : 21} fontWeight="700" fill="#333">가</text> : null}
    </svg>
  );
}

export function DropCapDialog() {
  const [style, setStyle] = useState(1);
  const [gap, setGap] = useState(3);
  const [open, setOpen] = useOpen("chwp-open-drop-cap-dialog");
  const close = () => {
    setOpen(false);
    focusEditor();
  };
  const apply = () => {
    const hu = Math.max(0, Math.round(Number(gap) * huPerMm));
    setOpen(false);
    void runShortcut(`dropCap:${style}:${hu}`).then((result) => {
      if (result && !result.documentChanged && result.error) toast(result.error, "info", null, { key: "dropCap" });
      focusEditor();
    });
  };
  return (
    <Frame open={open} onClose={close} title="문단 첫 글자 장식" description="캐럿 문단의 첫 글자를 크게 꾸밉니다." onApply={apply}>
      <fieldset className="rounded-lg border border-[#e5e5e5] p-3">
        <legend className="px-1">모양</legend>
        <div className="grid grid-cols-4 gap-2">
          {shapes.map(([id, label]) => (
            <button key={id} type="button" onClick={() => setStyle(id)}
              className={`flex flex-col items-center gap-1 rounded-md border p-2 ${style === id ? "border-[#1d4ed8] bg-[#eef3ff]" : "border-[#e5e5e5]"}`}
              aria-pressed={style === id}>
              <ShapeIcon style={id} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center justify-between gap-2">
        <span>본문과의 간격</span>
        <span className="flex items-center gap-1">
          <input className="ui-box h-8 w-24 rounded-md px-2 text-right" type="number" step="0.1" min="0" value={gap}
            onChange={(event) => setGap(event.target.value)} />
          <span className="w-6 text-[0.9em] text-[#666]">mm</span>
        </span>
      </label>
    </Frame>
  );
}
