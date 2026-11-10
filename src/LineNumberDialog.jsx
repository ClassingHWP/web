import { useEffect, useState } from "react";
import { Frame, focusEditor, useOpen } from "./TableTextDialog.jsx";
import { sectionSettingsView, setSectionSettings } from "./ui-actions.js";

// 줄 번호 설정(한글 2024): 시작 번호, 본문과의 간격, 번호 간격, 시작 번호 방식.
// 값은 캐럿 구역의 구역 설정이다(코어 sectionSettings 의 lineNumber*). 설정하면 줄 번호를 보인다.

export function openLineNumberDialog() {
  window.dispatchEvent(new Event("chwp-open-line-number-dialog"));
}

const restarts = [[1, "쪽마다 새 번호 시작(P)"], [2, "구역마다 새 번호 시작(S)"], [3, "이전 번호에 이어서 매기기(C)"]];
const box = "ui-box h-9 rounded-md px-2";

export function LineNumberDialog() {
  const [open, setOpen] = useOpen("chwp-open-line-number-dialog");
  const [values, setValues] = useState(null);
  const close = () => {
    setOpen(false);
    setValues(null);
    focusEditor();
  };
  useEffect(() => {
    if (!open) return undefined;
    let live = true;
    void sectionSettingsView().then((view) => { if (live && view) setValues(view); });
    return () => { live = false; };
  }, [open]);
  const v = values || {};
  const set = (patch) => setValues((old) => ({ ...old, ...patch }));
  const number = (key, label, step = 1, min = 1) => (
    <label className="flex min-h-9 items-center justify-between gap-2">
      <span>{label}</span>
      <input type="number" min={min} step={step} className={`${box} w-[6em] text-right`} aria-label={label}
        value={v[key] ?? ""} onChange={(event) => set({ [key]: Number(event.target.value) })} />
    </label>
  );
  const apply = () => {
    void setSectionSettings({
      lineNumberShow: true,
      lineNumberStart: Math.max(1, Math.round(Number(v.lineNumberStart) || 1)),
      lineNumberCountBy: Math.max(1, Math.round(Number(v.lineNumberCountBy) || 1)),
      lineNumberDistanceMm: Math.max(0, Number(v.lineNumberDistanceMm) || 0),
      lineNumberRestart: Number(v.lineNumberRestart) || 3,
    });
    close();
  };
  return (
    <Frame open={open && !!values} onClose={close} title="줄 번호 설정" description="구역의 줄 번호 모양을 정합니다." onApply={apply}>
      <fieldset className="flex flex-col gap-1 rounded-lg border border-[#e5e5e5] px-3 pt-1.5 pb-3">
        <legend className="px-1.5 font-medium">줄 번호 모양</legend>
        {number("lineNumberStart", "시작 번호(A)")}
        {number("lineNumberDistanceMm", "본문과의 간격(mm)(D)", 0.1, 0)}
        {number("lineNumberCountBy", "번호 간격(B)")}
      </fieldset>
      <fieldset className="flex flex-col gap-1 rounded-lg border border-[#e5e5e5] px-3 pt-1.5 pb-3">
        <legend className="px-1.5 font-medium">시작 번호 방식</legend>
        {restarts.map(([value, label]) => (
          <label key={value} className="flex min-h-9 items-center gap-2">
            <input type="radio" name="line-number-restart" checked={Number(v.lineNumberRestart) === value}
              onChange={() => set({ lineNumberRestart: value })} />
            {label}
          </label>
        ))}
      </fieldset>
    </Frame>
  );
}
