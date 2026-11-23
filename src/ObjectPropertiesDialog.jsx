import { useState } from "react";
import { Frame, focusEditor, useOpen } from "./TableTextDialog.jsx";
import { objectPropertiesView, setObjectProperties } from "./ui-actions.js";

// 개체 속성(한글 ObjectPropertyDlg). 고른 그림·도형의 크기, 글자처럼 취급, 본문과의 배치, 위치, 바깥 여백,
// 그림이면 밝기·대비·효과를 보인다. 처음 값과 고치는 규칙(크기를 바꾸면 안의 점·글상자를 같이 바꾸는 것 등)은
// 코어(objectPropertiesView·objectProperties)가 정한다. 셸은 mm 와 HWPUNIT 만 바꿔 넘긴다.

export function openObjectPropertiesDialog() {
  window.dispatchEvent(new Event("chwp-open-object-properties-dialog"));
}

const huPerMm = 7200 / 25.4;
const toMm = (hu) => Math.round((Number(hu) / huPerMm) * 100) / 100;
const toHu = (mm) => Math.round(Number(mm) * huPerMm);
const wraps = [["SQUARE", "어울림"], ["TOP_AND_BOTTOM", "자리 차지"], ["IN_FRONT_OF_TEXT", "글 앞으로"], ["BEHIND_TEXT", "글 뒤로"]];
const horzRels = [["PAPER", "종이"], ["PAGE", "쪽"], ["COLUMN", "단"], ["PARA", "문단"]];
const vertRels = [["PAPER", "종이"], ["PAGE", "쪽"], ["PARA", "문단"]];
const effects = [[0, "원래 그림"], [1, "회색조"], [2, "흑백"]];
const shapeLineTypes = [["SOLID", "실선"], ["DASH", "파선"], ["DOT", "점선"], ["DASH_DOT", "일점쇄선"], ["DASH_DOT_DOT", "이점쇄선"],
  ["LONG_DASH", "긴 파선"], ["DOUBLE_SLIM", "이중 실선"], ["NONE", "선 없음"]];
const textMargins = [["textMarginLeft", "왼쪽"], ["textMarginRight", "오른쪽"], ["textMarginTop", "위쪽"], ["textMarginBottom", "아래쪽"]];
const margins = [["marginLeft", "왼쪽"], ["marginRight", "오른쪽"], ["marginTop", "위쪽"], ["marginBottom", "아래쪽"]];

function Num({ label, value, onChange, unit = "mm", min, max, step = "0.01" }) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <span className="flex items-center gap-1">
        <input className="ui-box h-8 w-24 rounded-md px-2 text-right" type="number" step={step} min={min} max={max}
          value={value} onChange={(event) => onChange(event.target.value)} />
        {unit && <span className="w-6 text-[0.9em] text-[#666]">{unit}</span>}
      </span>
    </label>
  );
}

export function ObjectPropertiesDialog() {
  const [values, setValues] = useState(null);
  const [edit, setEdit] = useState({});
  const [open, setOpen] = useOpen("chwp-open-object-properties-dialog", () => {
    setValues(null);
    setEdit({});
    void objectPropertiesView().then((view) => {
      const out = {};
      if (Array.isArray(view)) for (const [k, v] of view) out[k] = v;
      else if (view && typeof view === "object") Object.assign(out, view.values || view);
      setValues(Object.keys(out).length ? out : {});
    });
  });
  const close = () => {
    setOpen(false);
    focusEditor();
  };
  const v = { ...(values || {}), ...edit };
  const set = (patch) => setEdit((now) => ({ ...now, ...patch }));
  const apply = () => {
    if (!Object.keys(edit).length) {
      close();
      return;
    }
    void setObjectProperties(edit).then((result) => { if (result?.documentChanged) close(); });
  };
  const ready = values && Object.keys(values).length > 0;
  const picture = v.kind === "picture";
  return (
    <Frame open={open} onClose={close} title="개체 속성" description="고른 그림·도형의 크기, 배치, 위치, 여백을 바꿉니다." onApply={apply} disabled={!ready}>
      {!values ? <p>읽는 중…</p> : !ready ? <p>고른 개체가 없습니다. 그림이나 도형을 누른 뒤 여세요.</p> : (
        <>
          <fieldset className="flex flex-col gap-1.5 rounded-md border border-[#e5e5e5] p-2">
            <legend className="px-1">크기</legend>
            <Num label="너비" value={toMm(v.width)} onChange={(mm) => set({ width: toHu(mm) })} min="0.1" />
            <Num label="높이" value={toMm(v.height)} onChange={(mm) => set({ height: toHu(mm) })} min="0.1" />
          </fieldset>
          <fieldset className="flex flex-col gap-1.5 rounded-md border border-[#e5e5e5] p-2">
            <legend className="px-1">위치</legend>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={!!v.treatAsChar} onChange={(event) => set({ treatAsChar: event.target.checked })} />글자처럼 취급
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {wraps.map(([value, label]) => (
                <label key={value} className="flex min-h-8 items-center gap-2">
                  <input type="radio" name="object-wrap" disabled={!!v.treatAsChar} checked={v.textWrap === value} onChange={() => set({ textWrap: value })} />{label}
                </label>
              ))}
            </div>
            <label className="flex items-center justify-between gap-2">
              <span>가로 기준</span>
              <select className="ui-box h-8 rounded-md px-2" disabled={!!v.treatAsChar} value={v.horzRelTo || "COLUMN"} onChange={(event) => set({ horzRelTo: event.target.value })}>
                {horzRels.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <Num label="가로 위치" value={toMm(v.horzOffset || 0)} onChange={(mm) => set({ horzOffset: toHu(mm) })} />
            <label className="flex items-center justify-between gap-2">
              <span>세로 기준</span>
              <select className="ui-box h-8 rounded-md px-2" disabled={!!v.treatAsChar} value={v.vertRelTo || "PARA"} onChange={(event) => set({ vertRelTo: event.target.value })}>
                {vertRels.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <Num label="세로 위치" value={toMm(v.vertOffset || 0)} onChange={(mm) => set({ vertOffset: toHu(mm) })} />
            {v.kind !== "table" && v.kind !== "equation" && (
              <>
                <Num label="회전각" unit="°" step="1" min="0" max="359" value={v.rotation ?? 0}
                  onChange={(n) => set({ rotation: ((Math.round(Number(n) || 0) % 360) + 360) % 360 })} />
                <Num label="기울이기 가로" unit="°" step="1" min="-89" max="89" value={v.skewX ?? 0}
                  onChange={(n) => set({ skewX: Math.max(-89, Math.min(89, Math.round(Number(n) || 0))) })} />
                <Num label="기울이기 세로" unit="°" step="1" min="-89" max="89" value={v.skewY ?? 0}
                  onChange={(n) => set({ skewY: Math.max(-89, Math.min(89, Math.round(Number(n) || 0))) })} />
              </>
            )}
          </fieldset>
          <fieldset className="flex flex-col gap-1.5 rounded-md border border-[#e5e5e5] p-2">
            <legend className="px-1">바깥 여백</legend>
            {margins.map(([key, label]) => (
              <Num key={key} label={label} value={toMm(v[key] || 0)} onChange={(mm) => set({ [key]: Math.max(0, toHu(mm)) })} min="0" />
            ))}
          </fieldset>
          {v.textMarginLeft !== undefined && (
            // 글상자(한글 개체 속성 [글상자]): 안쪽 여백, 세로 정렬, 글자 방향.
            <fieldset className="flex flex-col gap-1.5 rounded-md border border-[#e5e5e5] p-2">
              <legend className="px-1">글상자</legend>
              {textMargins.map(([key, label]) => (
                <Num key={key} label={`안쪽 ${label}`} value={toMm(v[key] || 0)} onChange={(mm) => set({ [key]: Math.max(0, toHu(mm)) })} min="0" />
              ))}
              <label className="flex items-center justify-between gap-2">
                <span>세로 정렬</span>
                <select className="ui-box h-8 rounded-md px-2" value={v.textVertAlign || "TOP"} onChange={(event) => set({ textVertAlign: event.target.value })}>
                  {[["TOP", "위"], ["CENTER", "가운데"], ["BOTTOM", "아래"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="flex items-center justify-between gap-2">
                <span>글자 방향</span>
                <select className="ui-box h-8 rounded-md px-2" value={Number(v.textDirection) || 0} onChange={(event) => set({ textDirection: Number(event.target.value) })}>
                  {[[0, "가로쓰기"], [1, "세로쓰기(영문 눕힘)"], [2, "세로쓰기(영문 세움)"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
            </fieldset>
          )}
          {v.kind === "shape" && (
            <fieldset className="flex flex-col gap-1.5 rounded-md border border-[#e5e5e5] p-2">
              <legend className="px-1">선·채우기</legend>
              <label className="flex items-center justify-between gap-2">
                <span>선 종류</span>
                <select className="ui-box h-8 rounded-md px-2" value={v.lineType || "SOLID"} onChange={(event) => set({ lineType: event.target.value })}>
                  {shapeLineTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <label className="flex items-center justify-between gap-2">
                <span>선 색</span>
                <input type="color" className="h-8 w-16" value={(v.lineColor || "#000000").toLowerCase()} onChange={(event) => set({ lineColor: event.target.value.toUpperCase() })} />
              </label>
              <Num label="선 굵기" value={toMm(v.lineWidth || 0)} onChange={(mm) => set({ lineWidth: Math.max(0, toHu(mm)) })} min="0" />
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={(v.fillColor || "none") !== "none"} onChange={(event) => set({ fillColor: event.target.checked ? "#FFFFFF" : "none" })} />채우기
                <input type="color" className="ml-auto h-8 w-16" disabled={(v.fillColor || "none") === "none"}
                  value={((v.fillColor && v.fillColor !== "none") ? v.fillColor : "#ffffff").toLowerCase()} onChange={(event) => set({ fillColor: event.target.value.toUpperCase() })} />
              </label>
            </fieldset>
          )}
          {picture && (
            <fieldset className="flex flex-col gap-1.5 rounded-md border border-[#e5e5e5] p-2">
              <legend className="px-1">그림</legend>
              <Num label="밝기" unit="%" step="1" min="-100" max="100" value={v.bright ?? 0} onChange={(n) => set({ bright: Math.max(-100, Math.min(100, Math.round(Number(n) || 0))) })} />
              <Num label="대비" unit="%" step="1" min="-100" max="100" value={v.contrast ?? 0} onChange={(n) => set({ contrast: Math.max(-100, Math.min(100, Math.round(Number(n) || 0))) })} />
              {[["cropLeft", "왼쪽 자르기"], ["cropRight", "오른쪽 자르기"], ["cropTop", "위쪽 자르기"], ["cropBottom", "아래쪽 자르기"]].map(([key, label]) => (
                // 한글 그림 자르기는 mm 를 HWPUNIT 으로 버려 넘긴다(10mm → 2834).
                <Num key={key} label={label} value={toMm(v[key] || 0)} onChange={(mm) => set({ [key]: Math.max(0, Math.floor(Number(mm) * huPerMm + 1e-6)) })} min="0" />
              ))}
              <label className="flex items-center justify-between gap-2">
                <span>그림 효과</span>
                <select className="ui-box h-8 rounded-md px-2" value={Number(v.effect) || 0} onChange={(event) => set({ effect: Number(event.target.value) })}>
                  {effects.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
            </fieldset>
          )}
        </>
      )}
    </Frame>
  );
}
