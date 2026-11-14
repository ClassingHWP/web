import { useEffect, useRef, useState } from "react";
import { Frame, focusEditor, useOpen } from "./TableTextDialog.jsx";
import { tableEdit, tableFormulaView, toast } from "./ui-actions.js";

// 계산식(한글 2024 TableFormulaDlg): 계산식 입력, 함수, 쉬운 범위, 형식(기본·정수형·소수점 이하 한~네 자리), 세 자리마다 쉼표.
// 캐럿이 계산식 결과 안이면 그 식을 불러와 고친다. 계산·넣기·고치기는 코어(tableEdit formula, custom)가 한다.

export function openTableFormulaDialog() {
  window.dispatchEvent(new Event("chwp-open-table-formula-dialog"));
}

const functions = ["SUM", "AVERAGE", "PRODUCT", "MIN", "MAX", "COUNT", "ROUND", "MOD", "ABS", "SQRT", "EXP", "LN", "LOG",
  "SIN", "COS", "TAN", "ASIN", "ACOS", "ATAN", "DEGTORAD", "RADTODEG", "SIGN", "CEILING", "FLOOR", "INT"];
const ranges = ["LEFT", "RIGHT", "ABOVE", "BELOW"];
const formats = [["%g", "기본 형식"], ["%.0f", "정수형"], ["%.1f", "소수점 이하 한 자리"], ["%.2f", "소수점 이하 두 자리"],
  ["%.3f", "소수점 이하 세 자리"], ["%.4f", "소수점 이하 네 자리"]];
const box = "ui-box h-9 rounded-md px-2";

export function TableFormulaDialog() {
  const [open, setOpen] = useOpen("chwp-open-table-formula-dialog");
  const [ready, setReady] = useState(false);
  const [cell, setCell] = useState("");
  const [formula, setFormula] = useState("=");
  const [format, setFormat] = useState("%g");
  const [comma, setComma] = useState(true);
  const input = useRef(null);
  const close = () => {
    setOpen(false);
    setReady(false);
    focusEditor();
  };
  useEffect(() => {
    if (!open) return;
    let live = true;
    void tableFormulaView().then((view) => {
      if (!live) return;
      if (!view?.inTable) {
        toast("계산식은 표 안에서 넣습니다.", "info", null, { key: "formula" });
        setOpen(false);
        focusEditor();
        return;
      }
      setCell(view.cell || "");
      const saved = typeof view.format === "string" ? view.format : "%g,";
      setFormula(typeof view.formula === "string" ? view.formula : "=");
      setComma(saved.includes(","));
      const base = saved.replace(",", "");
      setFormat(formats.some(([v]) => v === base) ? base : "%g");
      setReady(true);
    });
    return () => { live = false; };
  }, [open]);
  // 함수·쉬운 범위는 계산식 입력 상자의 캐럿 자리에 넣는다. 함수는 괄호 안에 캐럿을 둔다.
  const insert = (text, back = 0) => {
    const el = input.current;
    const at = el ? el.selectionStart ?? formula.length : formula.length;
    const end = el ? el.selectionEnd ?? at : at;
    const next = formula.slice(0, at) + text + formula.slice(end);
    setFormula(next);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      const caret = at + text.length - back;
      el.setSelectionRange(caret, caret);
    });
  };
  const apply = () => {
    void tableEdit("formula", { formulaMode: "custom", formula, format: format + (comma ? "," : "") }).then((result) => {
      if (result?.documentChanged) close();
    });
  };
  return (
    <Frame open={open && ready} onClose={close} title="계산식" description="표 칸에 계산식을 넣거나 고칩니다." onApply={apply}
      disabled={!formula.replace(/[=@\s]/g, "")}>
      {cell && <p className="text-[0.9em] text-[#525252]">{`셀 ${cell}`}</p>}
      <label className="flex flex-col gap-1">
        <span>계산식(E)</span>
        <input ref={input} className={box} value={formula} aria-label="계산식" onChange={(event) => setFormula(event.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span>함수(F)</span>
          <select className={box} aria-label="함수" value="" onChange={(event) => { if (event.target.value) insert(`${event.target.value}()`, 1); }}>
            <option value="">함수 고르기</option>
            {functions.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span>쉬운 범위(R)</span>
          <select className={box} aria-label="쉬운 범위" value="" onChange={(event) => { if (event.target.value) insert(event.target.value); }}>
            <option value="">범위 고르기</option>
            {ranges.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span>형식(M)</span>
        <select className={box} aria-label="형식" value={format} onChange={(event) => setFormat(event.target.value)}>
          {formats.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </label>
      <label className="flex min-h-9 items-center gap-2">
        <input type="checkbox" checked={comma} onChange={(event) => setComma(event.target.checked)} />세 자리마다 쉼표로 자리 구분(C)
      </label>
    </Frame>
  );
}
