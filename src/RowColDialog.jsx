import { useState } from "react";
import { Frame, focusEditor, useOpen } from "./TableTextDialog.jsx";
import { tableEdit } from "./ui-actions.js";

// 줄/칸 추가하기(한글 InsertTableRowColumnDlg, 표 안 Alt+Insert)와 줄/칸 지우기(DeleteTableRowColumnDlg, Alt+Delete).
// 넣을 자리·개수만 고르고, 넣고 지우는 규칙(합친 칸, 새 줄 모양)은 코어(editTable insertRows·insertColumns·
// deleteRows·deleteColumns)가 정한다.

export function openRowColDialog(mode = "insert") {
  window.dispatchEvent(new CustomEvent("chwp-open-rowcol-dialog", { detail: { mode: mode === "delete" ? "delete" : "insert" } }));
}

const places = [
  ["above", "위쪽에 줄 추가하기", "insertRows", false],
  ["below", "아래쪽에 줄 추가하기", "insertRows", true],
  ["left", "왼쪽에 칸 추가하기", "insertColumns", false],
  ["right", "오른쪽에 칸 추가하기", "insertColumns", true],
];

export function RowColDialog() {
  const [mode, setMode] = useState("insert");
  const [open, setOpen] = useOpen("chwp-open-rowcol-dialog", (event) => setMode(event?.detail?.mode === "delete" ? "delete" : "insert"));
  const [place, setPlace] = useState("below");
  const [count, setCount] = useState(1);
  const [target, setTarget] = useState("rows");
  const close = () => {
    setOpen(false);
    focusEditor();
  };
  const apply = () => {
    if (mode === "delete") {
      void tableEdit(target === "rows" ? "deleteRows" : "deleteColumns").then((result) => { if (result?.documentChanged) close(); });
      return;
    }
    const [, , kind, after] = places.find(([key]) => key === place) || places[1];
    const n = Math.max(1, Math.round(Number(count)) || 1);
    void tableEdit(kind, { after, count: n }).then((result) => { if (result?.documentChanged) close(); });
  };
  if (mode === "delete") {
    return (
      <Frame open={open} onClose={close} title="줄/칸 지우기" description="캐럿이나 칸 블록이 걸친 줄 또는 칸을 지웁니다." onApply={apply} applyLabel="지우기">
        <fieldset className="flex flex-col gap-1 rounded-md border border-[#e5e5e5] p-2">
          <legend className="px-1">지우기</legend>
          {[["rows", "줄(R)"], ["cols", "칸(C)"]].map(([value, label]) => (
            <label key={value} className="flex min-h-9 items-center gap-2">
              <input type="radio" name="rowcol-delete" checked={target === value} onChange={() => setTarget(value)} />{label}
            </label>
          ))}
        </fieldset>
      </Frame>
    );
  }
  return (
    <Frame open={open} onClose={close} title="줄/칸 추가하기" description="캐럿이 든 칸 둘레에 줄이나 칸을 정한 개수만큼 넣습니다." onApply={apply} applyLabel="추가">
      <fieldset className="flex flex-col gap-1 rounded-md border border-[#e5e5e5] p-2">
        <legend className="px-1">추가할 자리</legend>
        {places.map(([value, label]) => (
          <label key={value} className="flex min-h-9 items-center gap-2">
            <input type="radio" name="rowcol-insert" checked={place === value} onChange={() => setPlace(value)} />{label}
          </label>
        ))}
      </fieldset>
      <label className="flex items-center justify-between gap-3">
        <span>{place === "above" || place === "below" ? "줄 수" : "칸 수"}</span>
        <input className="ui-box h-9 w-20 rounded-md px-2 text-right" inputMode="numeric" type="number" min={1} max={500}
          value={count} onChange={(event) => setCount(event.target.value)} />
      </label>
    </Frame>
  );
}
