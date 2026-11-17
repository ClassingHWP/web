import { useState } from "react";
import { Frame, focusEditor, useOpen } from "./TableTextDialog.jsx";
import { lineShapeLabels } from "./FormatDialogs.jsx";
import { tableEdit } from "./ui-actions.js";

// 셀 테두리/배경(한글 CellBorderFill). 캐럿 칸이나 칸 블록의 바깥 네 변·안쪽 가로·세로 선을 고른 선으로 바꾸고,
// 고르면 배경 색도 바꾼다. 어느 칸의 어느 변이 바뀌는지(이웃 칸 변까지)는 코어(setTableCellBorderFill)가 정한다.

export function openCellBorderFillDialog() {
  window.dispatchEvent(new Event("chwp-open-cell-border-fill-dialog"));
}

const lineTypes = ["SOLID", "DOT", "DASH", "DASH_DOT", "DASH_DOT_DOT", "LONG_DASH", "CIRCLE", "DOUBLE_SLIM", "SLIM_THICK",
  "THICK_SLIM", "SLIM_THICK_SLIM", "NONE"];
const lineWidths = [0.1, 0.12, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 1.0, 1.5, 2.0, 3.0, 4.0, 5.0]
  .map((mm) => [Math.round((mm * 7200) / 25.4), `${mm} mm`]);
const sides = [
  ["top", "위"], ["bottom", "아래"], ["left", "왼쪽"], ["right", "오른쪽"], ["insideHorz", "안쪽 가로"], ["insideVert", "안쪽 세로"],
];
const presets = [
  ["모두", ["top", "bottom", "left", "right", "insideHorz", "insideVert"]],
  ["바깥쪽", ["top", "bottom", "left", "right"]],
  ["안쪽", ["insideHorz", "insideVert"]],
];

export function CellBorderFillDialog() {
  const [open, setOpen] = useOpen("chwp-open-cell-border-fill-dialog");
  const [type, setType] = useState("SOLID");
  const [width, setWidth] = useState(lineWidths[1][0]);
  const [color, setColor] = useState("#000000");
  const [picked, setPicked] = useState(() => new Set());
  const [fill, setFill] = useState("keep");
  const [face, setFace] = useState("#FFFFFF");
  const close = () => {
    setOpen(false);
    focusEditor();
  };
  const toggle = (side) => {
    setPicked((now) => {
      const next = new Set(now);
      if (next.has(side)) next.delete(side);
      else next.add(side);
      return next;
    });
  };
  const apply = () => {
    const fields = {};
    for (const side of picked) {
      fields[`${side}.type`] = type;
      fields[`${side}.width`] = Number(width);
      fields[`${side}.color`] = color;
    }
    if (fill !== "keep") {
      fields.setFill = 1;
      fields.color = fill === "none" ? "none" : face;
    }
    if (!picked.size && fill === "keep") {
      close();
      return;
    }
    void tableEdit("cellBorderFill", fields).then((result) => { if (result?.documentChanged) close(); });
  };
  return (
    <Frame open={open} onClose={close} title="셀 테두리/배경" description="캐럿 칸이나 칸 블록의 테두리 선과 배경을 바꿉니다." onApply={apply}>
      <fieldset className="flex flex-col gap-2 rounded-md border border-[#e5e5e5] p-2">
        <legend className="px-1">테두리</legend>
        <label className="flex items-center justify-between gap-3">
          <span>종류</span>
          <select className="ui-box h-9 rounded-md px-2" value={type} onChange={(event) => setType(event.target.value)}>
            {lineTypes.map((name) => <option key={name} value={name}>{lineShapeLabels[name] || name}</option>)}
          </select>
        </label>
        <label className="flex items-center justify-between gap-3">
          <span>굵기</span>
          <select className="ui-box h-9 rounded-md px-2" value={width} disabled={type === "NONE"} onChange={(event) => setWidth(event.target.value)}>
            {lineWidths.map(([hu, label]) => <option key={hu} value={hu}>{label}</option>)}
          </select>
        </label>
        <label className="flex items-center justify-between gap-3">
          <span>색</span>
          <input type="color" className="h-9 w-16" value={color} disabled={type === "NONE"} onChange={(event) => setColor(event.target.value.toUpperCase())} />
        </label>
        <div className="flex flex-wrap gap-1.5">
          {presets.map(([label, list]) => (
            <button key={label} type="button" className="ui-outline h-8 rounded-md px-2.5" onClick={() => setPicked(new Set(list))}>{label}</button>
          ))}
          <button type="button" className="ui-outline h-8 rounded-md px-2.5" onClick={() => setPicked(new Set())}>고르지 않음</button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {sides.map(([side, label]) => (
            <button key={side} type="button" aria-pressed={picked.has(side)}
              className={`ui-rb h-9 rounded-md px-1 ${picked.has(side) ? "on" : ""}`} onClick={() => toggle(side)}>{label}</button>
          ))}
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-1 rounded-md border border-[#e5e5e5] p-2">
        <legend className="px-1">배경</legend>
        {[["keep", "그대로"], ["none", "색 채우기 없음"], ["color", "색"]].map(([value, label]) => (
          <label key={value} className="flex min-h-9 items-center gap-2">
            <input type="radio" name="cell-fill" checked={fill === value} onChange={() => setFill(value)} />{label}
            {value === "color" && (
              <input type="color" className="ml-2 h-8 w-14" value={face} disabled={fill !== "color"} onChange={(event) => setFace(event.target.value.toUpperCase())} />
            )}
          </label>
        ))}
      </fieldset>
    </Frame>
  );
}
