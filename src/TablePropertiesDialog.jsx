import { useEffect, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { setTableProperties, tablePropertiesView, toast } from "./ui-actions.js";

// 표/셀 속성(한글 2024 표/셀 속성 대화 상자의 기본·여백/캡션·표·셀 탭). 처음 값과 고치는 규칙은 코어가 정한다.
// 크기는 보기만 한다(셀 크기를 한 칸에 줄 때의 한글 규칙을 아직 확인하지 못했다).

export function openTablePropertiesDialog() {
  window.dispatchEvent(new Event("chwp-open-table-properties"));
}

const tabs = ["기본", "여백/캡션", "표", "셀"];
const wraps = [["SQUARE", "어울림"], ["TOP_AND_BOTTOM", "자리 차지"], ["BEHIND_TEXT", "글 뒤로"], ["IN_FRONT_OF_TEXT", "글 앞으로"]];
const horzRels = [["PAPER", "종이"], ["PAGE", "쪽"], ["COLUMN", "단"], ["PARA", "문단"]];
const vertRels = [["PAPER", "종이"], ["PAGE", "쪽"], ["PARA", "문단"]];
const horzAligns = [["LEFT", "왼쪽"], ["CENTER", "가운데"], ["RIGHT", "오른쪽"], ["INSIDE", "안쪽"], ["OUTSIDE", "바깥쪽"]];
const vertAligns = [["TOP", "위"], ["CENTER", "가운데"], ["BOTTOM", "아래"]];
const numberings = [["NONE", "없음"], ["PICTURE", "그림"], ["TABLE", "표"], ["EQUATION", "수식"]];
const captions = [
  ["NONE", "캡션 없음"], ["TOP", "위"], ["BOTTOM", "아래"],
  ["LEFT_TOP", "왼쪽 위"], ["LEFT_CENTER", "왼쪽 가운데"], ["LEFT_BOTTOM", "왼쪽 아래"],
  ["RIGHT_TOP", "오른쪽 위"], ["RIGHT_CENTER", "오른쪽 가운데"], ["RIGHT_BOTTOM", "오른쪽 아래"],
];
// 한글 2024 표/셀 속성 [표] 탭으로 확인한 짝: 파일 값 CELL(HWP 2) 이 "나눔", TABLE(HWP 1) 이 "셀 단위로 나눔"이다.
const pageBreaks = [["CELL", "나눔"], ["TABLE", "셀 단위로 나눔"], ["NONE", "나누지 않음"]];
const directions = [[0, "가로"], [1, "세로 - 영문 눕힘"], [2, "세로 - 영문 세움"]];
const sides = [["Left", "왼쪽"], ["Right", "오른쪽"], ["Top", "위쪽"], ["Bottom", "아래쪽"]];

export function TablePropertiesDialog() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(tabs[0]);
  const [values, setValues] = useState(null);
  const [changed, setChanged] = useState({});

  useEffect(() => {
    const onOpen = () => {
      void tablePropertiesView().then((view) => {
        if (!view || Object.keys(view).length === 0) {
          toast("캐럿이 표 칸에 있어야 합니다.", "info", null, { key: "tableProps" });
          return;
        }
        setValues(view);
        setChanged({});
        setTab(tabs[0]);
        setOpen(true);
      });
    };
    window.addEventListener("chwp-open-table-properties", onOpen);
    return () => window.removeEventListener("chwp-open-table-properties", onOpen);
  }, []);

  // 고친 칸만 보낸다. 칸 블록의 셀 값은 첫 칸 값이라 건드리지 않은 칸은 그대로 둔다.
  const set = (patch) => {
    setValues((old) => ({ ...old, ...patch }));
    setChanged((old) => ({ ...old, ...patch }));
  };
  const close = () => {
    setOpen(false);
    window.dispatchEvent(new Event("chwp-focus-editor"));
  };
  const apply = () => {
    const fields = { ...changed };
    if (Object.keys(fields).some((key) => key.startsWith("cell") && key !== "cellVertAlign")) {
      fields.cellMargin = !!values.cellMargin;
      for (const [side] of sides) fields[`cell${side}Mm`] = Number(values[`cell${side}Mm`]) || 0;
    }
    close();
    if (Object.keys(fields).length) void setTableProperties(fields);
  };

  const v = values || {};
  const box = "ui-box h-9 rounded-md px-2";
  const select = (key, list, disabled) => (
    <select className={`${box} disabled:opacity-40`} disabled={disabled} value={v[key] ?? ""}
      onChange={(event) => set({ [key]: typeof list[0][0] === "number" ? Number(event.target.value) : event.target.value })}>
      {list.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select>
  );
  const mm = (key, disabled) => (
    <span className="flex items-center gap-1">
      <input type="number" step="0.1" className={`${box} w-[5.5em] text-right disabled:opacity-40`} disabled={disabled}
        value={v[key] ?? ""} onChange={(event) => set({ [key]: Number(event.target.value) })} />
      <span>mm</span>
    </span>
  );
  const check = (key, label, disabled) => (
    <label className={`flex items-center gap-2 ${disabled ? "opacity-40" : ""}`}>
      <input type="checkbox" disabled={disabled} checked={!!v[key]} onChange={(event) => set({ [key]: event.target.checked })} />
      {label}
    </label>
  );
  const group = (legend, children, grid = "grid grid-cols-[auto_1fr] items-center gap-2") => (
    <fieldset className={`${grid} rounded-lg border border-[#e5e5e5] px-3 pt-1.5 pb-3`}>
      <legend className="px-1.5 font-medium">{legend}</legend>
      {children}
    </fieldset>
  );
  const margins = (prefix, disabled) => sides.flatMap(([side, label]) => [
    <span key={`${prefix}${side}-l`} className={disabled ? "opacity-40" : ""}>{label}</span>,
    <span key={`${prefix}${side}-v`}>{mm(`${prefix}${side}Mm`, disabled)}</span>,
  ]);
  const floating = !v.treatAsChar;
  const sideCaption = String(v.caption || "").startsWith("LEFT") || String(v.caption || "").startsWith("RIGHT");

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/45" />
        <DialogPrimitive.Content className="toolbar-ui ui-chrome fixed inset-x-0 bottom-0 z-[80] flex max-h-[92dvh] flex-col gap-3 overflow-y-auto rounded-t-[18px] bg-white px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.12)] outline-none lg:inset-auto lg:top-1/2 lg:left-1/2 lg:w-[520px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[10px] lg:p-6 lg:shadow-[0_0_0_1px_#d4d4d4,0_20px_40px_rgba(0,0,0,0.18)]">
          <DialogPrimitive.Description className="sr-only">표의 배치·여백·캡션과 쪽 나눔, 셀의 여백·정렬·방향·필드 이름을 정합니다.</DialogPrimitive.Description>
          <div className="flex items-center">
            <DialogPrimitive.Title className="flex-1 text-[20px] font-bold">표/셀 속성</DialogPrimitive.Title>
            <button type="button" className="ui-ghost flex size-12 items-center justify-center rounded-[10px] lg:hidden" aria-label="닫기" onClick={close}>
              <X className="size-6" />
            </button>
          </div>
          <div role="tablist" className="flex gap-1 border-b border-[#e5e5e5]">
            {tabs.map((name) => (
              <button key={name} type="button" role="tab" aria-selected={tab === name}
                className={`h-9 px-3 ${tab === name ? "border-b-2 border-[#1d4ed8] font-medium text-[#1d4ed8]" : ""}`}
                onClick={() => setTab(name)}>{name}</button>
            ))}
          </div>
          {tab === "기본" ? (
            <>
              {group("크기", [
                <span key="w">너비</span>, <span key="wv">{v.widthMm} mm</span>,
                <span key="h">높이</span>, <span key="hv">{v.heightMm} mm</span>,
              ])}
              {group("위치", [
                <span key="c" className="col-span-2">{check("treatAsChar", "글자처럼 취급")}</span>,
                <span key="wl" className={floating ? "" : "opacity-40"}>본문과의 배치</span>, <span key="wv">{select("wrap", wraps, !floating)}</span>,
                <span key="hl" className={floating ? "" : "opacity-40"}>가로</span>,
                <span key="hv" className="flex flex-wrap items-center gap-1">{select("horzRelTo", horzRels, !floating)}의 {select("horzAlign", horzAligns, !floating)} 기준 {mm("horzOffsetMm", !floating)}</span>,
                <span key="vl" className={floating ? "" : "opacity-40"}>세로</span>,
                <span key="vv" className="flex flex-wrap items-center gap-1">{select("vertRelTo", vertRels, !floating)}의 {select("vertAlign", vertAligns, !floating)} 기준 {mm("vertOffsetMm", !floating)}</span>,
                <span key="f" className="col-span-2 flex flex-wrap gap-4">{check("flowWithText", "쪽 영역 안으로 제한", !floating)}{check("allowOverlap", "서로 겹침 허용", !floating)}</span>,
              ])}
              {group("개체 번호", [<span key="l">번호 종류</span>, <span key="v">{select("numberingType", numberings)}</span>])}
            </>
          ) : null}
          {tab === "여백/캡션" ? (
            <>
              {group("바깥 여백", margins("out"), "grid grid-cols-[auto_1fr_auto_1fr] items-center gap-2")}
              {group("캡션", [
                <span key="p">위치</span>, <span key="pv">{select("caption", captions)}</span>,
                <span key="w" className={sideCaption ? "" : "opacity-40"}>크기</span>, <span key="wv">{mm("captionWidthMm", !sideCaption || v.caption === "NONE")}</span>,
                <span key="g">개체와의 간격</span>, <span key="gv">{mm("captionGapMm", v.caption === "NONE")}</span>,
                <span key="f" className="col-span-2">{check("captionFullSize", "여백 부분까지 너비 확대", sideCaption || v.caption === "NONE")}</span>,
              ])}
            </>
          ) : null}
          {tab === "표" ? (
            <>
              {group("여러 쪽 지원", [
                <span key="b">쪽 경계에서</span>, <span key="bv">{select("pageBreak", pageBreaks)}</span>,
                <span key="r" className="col-span-2">{check("repeatHeader", "제목 줄 자동 반복")}</span>,
              ])}
              {group("모든 셀의 안 여백", margins("in"), "grid grid-cols-[auto_1fr_auto_1fr] items-center gap-2")}
            </>
          ) : null}
          {tab === "셀" ? (
            <>
              {group("셀 크기", [
                <span key="w">너비</span>, <span key="wv">{v.cellWidthMm} mm</span>,
                <span key="h">높이</span>, <span key="hv">{v.cellHeightMm} mm</span>,
              ])}
              {group("안 여백", [
                <span key="c" className="col-span-4">{check("cellMargin", "안 여백 지정")}</span>,
                ...margins("cell", !v.cellMargin),
              ], "grid grid-cols-[auto_1fr_auto_1fr] items-center gap-2")}
              {group("속성", [
                <span key="h" className="col-span-2">{check("header", "제목 셀")}</span>,
                <span key="d">글자 방향</span>, <span key="dv">{select("direction", directions)}</span>,
                <span key="a">세로 정렬</span>, <span key="av">{select("cellVertAlign", vertAligns)}</span>,
              ])}
              {group("필드", [
                <span key="n">필드 이름</span>,
                <input key="nv" className={box} aria-label="필드 이름" value={v.fieldName ?? ""}
                  onChange={(event) => set({ fieldName: event.target.value })} />,
              ])}
            </>
          ) : null}
          <div className="flex flex-row-reverse gap-2 border-t border-[#e5e5e5] pt-3">
            <button type="button" className="ui-primary h-11 flex-1 rounded-lg lg:flex-none lg:px-6" onClick={apply} disabled={!values}>설정(D)</button>
            <button type="button" className="ui-outline h-11 flex-1 rounded-lg lg:flex-none lg:px-6" onClick={close}>취소</button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
