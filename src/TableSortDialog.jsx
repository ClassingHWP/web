import { useEffect, useRef, useState } from "react";
import { Frame, focusEditor, useOpen } from "./TableTextDialog.jsx";
import { sortParagraphs, sortView, tableEdit, toast } from "./ui-actions.js";

// 정렬(한글 2024). 편집 탭·편집 메뉴·표 탭이 같은 대화 상자를 연다. 칸 블록이면 표 정렬, 글 블록이면 본문 정렬이고,
// 무엇인지와 필드 수는 코어(sortView)가 정한다. 정렬 기준 셋(위치·형식: 한글 대화 상자 차례), 필드 구분(탭·쉼표·빈칸·기호,
// 연속된 구분 기호 무시), 정렬 설정(고어 정렬·뒤부터 앞으로 비교·종성/중성/초성 순으로 비교·각 문단별 단어 정렬·두 자리 연도 기준)은
// 한글 대화 상자 차례다. 비교와 차례 정하기는 코어(sortTableRows·paragraphSortOrder·sortParagraphWords)가 한글과 같게 한다.

export function openTableSortDialog() {
  window.dispatchEvent(new Event("chwp-open-table-sort-dialog"));
}
export const openSortDialog = openTableSortDialog;

const formats = ["글자(가나다)", "글자(하파타)", "숫자(012)", "숫자(987)", "날짜순", "날짜 역순", "코드(가나다)", "코드(하파타)"];
const columns = Array.from({ length: 20 }, (_, i) => i + 1);
const select = "ui-box h-9 rounded-md px-2";
const WORD = 2147483647;
const delimiters = [[0, "탭(T)"], [1, "쉼표(C)"], [2, "빈칸(S)"], [3, "기호(H)"]];

export function TableSortDialog() {
  const [open, setOpen] = useOpen("chwp-open-table-sort-dialog");
  const [mode, setMode] = useState("");
  const [fieldCount, setFieldCount] = useState(1);
  const [keys, setKeys] = useState([{ column: 1, method: 0 }, { column: 0, method: 0 }, { column: 0, method: 0 }]);
  const [delimiter, setDelimiter] = useState(0);
  const [delimiterChars, setDelimiterChars] = useState("");
  const [ignoreMulti, setIgnoreMulti] = useState(true);
  const [fromRear, setFromRear] = useState(false);
  const [oldHangul, setOldHangul] = useState(false);
  const [finalFirst, setFinalFirst] = useState(false);
  const [eachPara, setEachPara] = useState(true);
  const [extendYear, setExtendYear] = useState(true);
  const [yearBase, setYearBase] = useState(1930);
  const [confirmWord, setConfirmWord] = useState(false);
  const modeRef = useRef("");
  const text = mode === "text";
  const close = () => {
    setOpen(false);
    setMode("");
    modeRef.current = "";
    setConfirmWord(false);
    focusEditor();
  };
  const separator = { delimiter, delimiterChars, ignoreMulti: ignoreMulti ? 1 : 0 };
  // 열 때 블록 종류를, 필드 구분이 바뀔 때 필드 수를 코어에 묻는다.
  useEffect(() => {
    if (!open) return;
    let live = true;
    void sortView(separator).then((view) => {
      if (!live) return;
      const kind = view?.mode || "";
      if (!kind) {
        toast("정렬할 문단이나 표의 칸을 블록으로 정하세요.", "info", null, { key: "sort" });
        setOpen(false);
        focusEditor();
        return;
      }
      if (modeRef.current !== kind) {
        modeRef.current = kind;
        setMode(kind);
        setKeys([{ column: kind === "text" ? 0 : 1, method: 0 }, { column: 0, method: 0 }, { column: 0, method: 0 }]);
      }
      setFieldCount(Math.max(1, Number(view?.fields) || 1));
    });
    return () => { live = false; };
  }, [open, delimiter, delimiterChars, ignoreMulti]);
  const setKey = (index, patch) => {
    setConfirmWord(false);
    setKeys((list) => list.map((k, i) => (i === index ? { ...k, ...patch } : k)));
  };
  const positions = (index) => {
    if (!text) return [...(index > 0 ? [[0, "없음"]] : []), ...columns.map((c) => [c, `칸 ${c}`])];
    const fields = Array.from({ length: fieldCount }, (_, i) => [i + 1, `필드 ${i + 1}`]);
    return index === 0 ? [[0, "문단"], [WORD, "단어"], ...fields] : [[0, "없음"], ...fields];
  };
  const apply = () => {
    const fields = {
      fromRear: fromRear ? 1 : 0,
      oldHangul: oldHangul ? 1 : 0,
      finalFirst: finalFirst ? 1 : 0,
      extendYear: extendYear ? 1 : 0,
      yearBase: Number(yearBase) || 1930,
    };
    keys.forEach((k, i) => {
      fields[`key${i + 1}${text ? "Position" : "Column"}`] = k.column;
      fields[`key${i + 1}Format`] = Math.floor(k.method / 2);
      fields[`key${i + 1}Desc`] = k.method % 2;
    });
    if (!text) {
      void tableEdit("sort", fields).then((result) => { if (result?.documentChanged) close(); });
      return;
    }
    // 단어 정렬은 한글처럼 개체가 빠질 수 있다고 한 번 묻는다.
    if (keys[0].column === WORD && !confirmWord) {
      setConfirmWord(true);
      return;
    }
    Object.assign(fields, separator, { eachPara: eachPara ? 1 : 0 });
    void sortParagraphs(fields).then((result) => { if (result && !result.error) close(); });
  };
  const check = (label, value, set, disabled = false) => (
    <label className={`flex min-h-9 items-center gap-2 ${disabled ? "text-[#a3a3a3]" : ""}`}>
      <input type="checkbox" checked={value} disabled={disabled} onChange={(event) => { setConfirmWord(false); set(event.target.checked); }} />{label}
    </label>
  );
  return (
    <Frame open={open && !!mode} onClose={close} title="정렬"
      description={text ? "블록의 문단을 기준대로 정렬합니다." : "칸 블록의 줄을 기준 칸의 글로 정렬합니다."}
      onApply={apply} applyLabel={confirmWord ? "계속(D)" : "실행(D)"}>
      <fieldset className="flex flex-col gap-2 rounded-md border border-[#e5e5e5] p-2">
        <legend className="px-1">정렬 기준</legend>
        <div className="grid grid-cols-[3em_1fr_1.6fr] items-center gap-2 text-[0.9em] text-[#525252]">
          <span>기준</span><span>위치</span><span>형식</span>
        </div>
        {keys.map((k, i) => {
          const list = positions(i);
          const value = list.some(([v]) => v === k.column) ? k.column : list[0][0];
          return (
            <div key={i} className="grid grid-cols-[3em_1fr_1.6fr] items-center gap-2">
              <span className="text-center">{i + 1}</span>
              <select className={select} aria-label={`기준 ${i + 1} 위치`} value={value} onChange={(event) => setKey(i, { column: Number(event.target.value) })}>
                {list.map(([v, label]) => <option key={v} value={v}>{label}</option>)}
              </select>
              <select className={select} aria-label={`기준 ${i + 1} 형식`} value={k.method} disabled={i > 0 && !value}
                onChange={(event) => setKey(i, { method: Number(event.target.value) })}>
                {formats.map((label, v) => <option key={v} value={v}>{label}</option>)}
              </select>
            </div>
          );
        })}
      </fieldset>
      <fieldset className={`flex flex-col gap-1 rounded-md border border-[#e5e5e5] p-2 ${text ? "" : "text-[#a3a3a3]"}`} role="radiogroup" disabled={!text}>
        <legend className="px-1">필드 구분</legend>
        <div className="flex flex-wrap items-center gap-x-3">
          {delimiters.map(([v, label]) => (
            <label key={v} className="flex min-h-9 items-center gap-2">
              <input type="radio" checked={delimiter === v} onChange={() => { setConfirmWord(false); setDelimiter(v); }} />{label}
            </label>
          ))}
          <input className={`${select} w-20`} value={delimiterChars} disabled={!text || delimiter !== 3} aria-label="구분 기호"
            onChange={(event) => { setConfirmWord(false); setDelimiterChars(event.target.value); }} />
        </div>
        {check("연속된 구분 기호 무시", ignoreMulti, setIgnoreMulti, !text)}
      </fieldset>
      <fieldset className="flex flex-col gap-1 rounded-md border border-[#e5e5e5] p-2">
        <legend className="px-1">정렬 설정</legend>
        {check("고어 정렬", oldHangul, setOldHangul)}
        {check("뒤부터 앞으로 비교", fromRear, setFromRear)}
        {check("종성/중성/초성 순으로 비교", finalFirst, setFinalFirst)}
        {check("각 문단별 단어 정렬", eachPara, setEachPara, !text)}
        {check("두 자리 연도 기준 적용", extendYear, setExtendYear)}
        <label className="flex min-h-9 items-center gap-2 pl-6">
          <input className={`${select} w-24`} type="number" min={1} max={9900} value={yearBase} disabled={!extendYear}
            aria-label="연도 범위 첫 해" onChange={(event) => setYearBase(event.target.value)} />
          {`~ ${(Number(yearBase) || 1930) + 99}`}
        </label>
      </fieldset>
      {confirmWord && (
        <p role="alert" className="rounded-md bg-[#fff7e6] p-2 text-[0.95em]">
          단어 정렬 시 블록으로 선택한 영역에 포함된 누름틀, 하이퍼링크와 같은 일부 개체가 손실될 수 있습니다. 계속할까요?
        </p>
      )}
    </Frame>
  );
}
