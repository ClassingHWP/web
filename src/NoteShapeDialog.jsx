import { useEffect, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { noteShapeView, setNoteShape } from "./ui-actions.js";
import { ColorField } from "./ColorPicker.jsx";
import { lineShapeLabels } from "./FormatDialogs.jsx";

// 주석 모양(한글 2024 주석 모양 대화 상자의 각주 모양·미주 모양 탭). 처음 값은 코어가 준다.

export function openNoteShapeDialog(endnote = false) {
  window.dispatchEvent(new CustomEvent("chwp-open-note-shape-dialog", { detail: { endnote: !!endnote } }));
}

// 번호 모양 목록(한글 목록 차례 0~16 번). 기호 묶음(17~20 번)은 아직 고르지 않는다.
const numFormats = [
  ["DIGIT", "1,2,3"], ["CIRCLED_DIGIT", "①,②,③"], ["ROMAN_CAPITAL", "I,II,III"], ["ROMAN_SMALL", "i,ii,iii"],
  ["LATIN_CAPITAL", "A,B,C"], ["LATIN_SMALL", "a,b,c"], ["CIRCLED_LATIN_CAPITAL", "Ⓐ,Ⓑ,Ⓒ"], ["CIRCLED_LATIN_SMALL", "ⓐ,ⓑ,ⓒ"],
  ["HANGUL_SYLLABLE", "가,나,다"], ["CIRCLED_HANGUL_SYLLABLE", "㉮,㉯,㉰"], ["HANGUL_JAMO", "ㄱ,ㄴ,ㄷ"],
  ["CIRCLED_HANGUL_JAMO", "㉠,㉡,㉢"], ["HANGUL_PHONETIC", "일,이,삼"], ["IDEOGRAPH", "一,二,三"],
  ["CIRCLED_IDEOGRAPH", "㊀,㊁,㊂"], ["DECAGON", "갑,을,병"], ["DECAGON_HANJA", "甲,乙,丙"],
];
const lengths = [["5CM", "5 cm"], ["2CM", "2 cm"], ["THIRD", "단 너비의 1/3"], ["COLUMN", "단 너비"], ["USER", "사용자"]];
const lineTypes = ["SOLID", "DOT", "DASH", "DASH_DOT", "DASH_DOT_DOT", "LONG_DASH", "CIRCLE", "DOUBLE_SLIM", "SLIM_THICK",
  "THICK_SLIM", "SLIM_THICK_SLIM"];
const lineWidths = [0.1, 0.12, 0.15, 0.2, 0.25, 0.3, 0.4, 0.5].map((mm) => [Math.round((mm * 7200) / 25.4), `${mm} mm`]);
const numberings = [["CONTINUOUS", "앞 구역에 이어서"], ["ON_SECTION", "현재 구역부터 새로 시작"], ["ON_PAGE", "쪽마다 새로 시작"]];
const footPlaces = [["EACH_COLUMN", "각 단 아래"], ["MERGED_COLUMN", "전단"], ["RIGHT_MOST_COLUMN", "오른쪽 단 아래"]];
const endPlaces = [["END_OF_DOCUMENT", "문서의 끝"], ["END_OF_SECTION", "구역의 끝"]];

export function NoteShapeDialog() {
  const [open, setOpen] = useState(false);
  const [endnote, setEndnote] = useState(false);
  const [values, setValues] = useState(null);
  const [whole, setWhole] = useState(true);

  const load = (which) => {
    setValues(null);
    void noteShapeView(which).then((view) => {
      if (!view) return;
      setValues(view);
      setWhole(!(Number(view.sectionCount) > 1));
    });
  };
  useEffect(() => {
    const onOpen = (event) => {
      const which = !!event.detail?.endnote;
      setEndnote(which);
      setOpen(true);
      load(which);
    };
    window.addEventListener("chwp-open-note-shape-dialog", onOpen);
    return () => window.removeEventListener("chwp-open-note-shape-dialog", onOpen);
  }, []);

  const set = (patch) => setValues((old) => ({ ...old, ...patch }));
  const close = () => {
    setOpen(false);
    window.dispatchEvent(new Event("chwp-focus-editor"));
  };
  const apply = () => {
    const fields = { ...values };
    delete fields.sectionCount;
    close();
    void setNoteShape(fields, endnote, whole);
  };

  const v = values || {};
  const box = "ui-box h-9 rounded-md px-2";
  const mm = (key, label) => (
    <label className="flex items-center gap-2">
      <span className="w-[6em]">{label}</span>
      <input type="number" step="0.1" className={`${box} w-[5.5em] text-right`} value={v[key] ?? ""} onChange={(event) => set({ [key]: Number(event.target.value) })} />
      <span>mm</span>
    </label>
  );
  const radios = (name, options, key) => (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {options.map(([value, label]) => (
        <label key={value} className="flex items-center gap-2">
          <input type="radio" name={name} checked={v[key] === value} onChange={() => set({ [key]: value })} />
          {label}
        </label>
      ))}
    </div>
  );
  const name = endnote ? "미주" : "각주";

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/45" />
        <DialogPrimitive.Content className="toolbar-ui ui-chrome fixed inset-x-0 bottom-0 z-[80] flex max-h-[92dvh] flex-col gap-3 overflow-y-auto rounded-t-[18px] bg-white px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.12)] outline-none lg:inset-auto lg:top-1/2 lg:left-1/2 lg:w-[520px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[10px] lg:p-6 lg:shadow-[0_0_0_1px_#d4d4d4,0_20px_40px_rgba(0,0,0,0.18)]">
          <DialogPrimitive.Description className="sr-only">각주·미주의 번호 모양, 구분선, 여백, 번호 매기기와 위치를 정합니다.</DialogPrimitive.Description>
          <div className="flex items-center">
            <DialogPrimitive.Title className="flex-1 text-[20px] font-bold">주석 모양</DialogPrimitive.Title>
            <button type="button" className="ui-ghost flex size-12 items-center justify-center rounded-[10px] lg:hidden" aria-label="닫기" onClick={close}>
              <X className="size-6" />
            </button>
          </div>
          <div role="tablist" className="flex gap-1 rounded-[10px] bg-[#f5f5f5] p-1">
            {[[false, "각주 모양"], [true, "미주 모양"]].map(([which, label]) => (
              <button key={label} type="button" role="tab" aria-selected={endnote === which}
                className={`h-9 flex-1 rounded-[8px] ${endnote === which ? "bg-white font-medium shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[#737373]"}`}
                onClick={() => { if (endnote !== which) { setEndnote(which); load(which); } }}>
                {label}
              </button>
            ))}
          </div>
          <fieldset className="grid grid-cols-[auto_1fr] items-center gap-2 rounded-lg border border-[#e5e5e5] px-3 pt-1.5 pb-3">
            <legend className="px-1.5 font-medium">번호 서식</legend>
            <span>번호 모양</span>
            <select className={box} value={v.numFormat || "DIGIT"} onChange={(event) => set({ numFormat: event.target.value })}>
              {numFormats.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <span>앞 장식 문자</span>
            <input className={`${box} w-[4em]`} maxLength={1} value={v.prefix ?? ""} onChange={(event) => set({ prefix: event.target.value })} />
            <span>뒷 장식 문자</span>
            <input className={`${box} w-[4em]`} maxLength={1} value={v.suffix ?? ""} onChange={(event) => set({ suffix: event.target.value })} />
          </fieldset>
          <fieldset className="grid grid-cols-[auto_1fr] items-center gap-2 rounded-lg border border-[#e5e5e5] px-3 pt-1.5 pb-3">
            <legend className="px-1.5 font-medium">구분선</legend>
            <label className="col-span-2 flex items-center gap-2">
              <input type="checkbox" checked={!!v.line} onChange={(event) => set({ line: event.target.checked })} />
              구분선 넣기
            </label>
            <span>종류</span>
            <select className={box} disabled={!v.line} value={v.lineType || "SOLID"} onChange={(event) => set({ lineType: event.target.value })}>
              {lineTypes.map((type) => <option key={type} value={type}>{lineShapeLabels[type] || type}</option>)}
            </select>
            <span>길이</span>
            <div className="flex items-center gap-2">
              <select className={box} disabled={!v.line} value={v.lineLength || "5CM"} onChange={(event) => set({ lineLength: event.target.value })}>
                {lengths.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <input type="number" step="0.1" className={`${box} w-[5.5em] text-right disabled:opacity-40`} disabled={!v.line || v.lineLength !== "USER"}
                value={v.lineLengthMm ?? ""} onChange={(event) => set({ lineLengthMm: Number(event.target.value) })} />
              <span>mm</span>
            </div>
            <span>굵기</span>
            <select className={box} disabled={!v.line} value={v.lineWidth || 34} onChange={(event) => set({ lineWidth: Number(event.target.value) })}>
              {lineWidths.map(([hu, label]) => <option key={hu} value={hu}>{label}</option>)}
            </select>
            <span>색</span>
            <ColorField value={v.lineColor || "#000000"} disabled={!v.line} onChange={(hex) => set({ lineColor: hex || "#000000" })} label="구분선 색" />
          </fieldset>
          <fieldset className="flex flex-col gap-2 rounded-lg border border-[#e5e5e5] px-3 pt-1.5 pb-3">
            <legend className="px-1.5 font-medium">여백</legend>
            {mm("aboveMm", "구분선 위")}
            {mm("betweenMm", `${name} 사이`)}
            {mm("belowMm", "구분선 아래")}
          </fieldset>
          <fieldset className="flex flex-col gap-2 rounded-lg border border-[#e5e5e5] px-3 pt-1.5 pb-3">
            <legend className="px-1.5 font-medium">번호 매기기</legend>
            {radios(`${name}-numbering`, numberings, "numbering")}
            <label className="flex items-center gap-2">
              <span>시작 번호</span>
              <input type="number" min={1} className={`${box} w-[5em] text-right disabled:opacity-40`} disabled={v.numbering !== "ON_SECTION"}
                value={v.startNumber ?? 1} onChange={(event) => set({ startNumber: Number(event.target.value) })} />
            </label>
          </fieldset>
          {endnote ? null : (
            <>
              <fieldset className="flex flex-col gap-2 rounded-lg border border-[#e5e5e5] px-3 pt-1.5 pb-3">
                <legend className="px-1.5 font-medium">각주 내용 번호 속성</legend>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2"><input type="radio" name="superscript" checked={!v.superscript} onChange={() => set({ superscript: false })} />보통</label>
                  <label className="flex items-center gap-2"><input type="radio" name="superscript" checked={!!v.superscript} onChange={() => set({ superscript: true })} />작게</label>
                </div>
              </fieldset>
              <fieldset className="flex flex-col gap-2 rounded-lg border border-[#e5e5e5] px-3 pt-1.5 pb-3">
                <legend className="px-1.5 font-medium">각주 세로 위치</legend>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2"><input type="radio" name="beneath" checked={!v.beneathText} onChange={() => set({ beneathText: false })} />꼬리말 바로 위</label>
                  <label className="flex items-center gap-2"><input type="radio" name="beneath" checked={!!v.beneathText} onChange={() => set({ beneathText: true })} />본문 아래</label>
                </div>
              </fieldset>
            </>
          )}
          <fieldset className="flex flex-col gap-2 rounded-lg border border-[#e5e5e5] px-3 pt-1.5 pb-3">
            <legend className="px-1.5 font-medium">{endnote ? "미주 위치" : "단 각주 위치"}</legend>
            {radios(`${name}-place`, endnote ? endPlaces : footPlaces, "place")}
          </fieldset>
          {Number(v.sectionCount) > 1 ? (
            <label className="flex items-center gap-3">
              <span>적용 범위</span>
              <select className={box} value={whole ? "document" : "section"} onChange={(event) => setWhole(event.target.value === "document")}>
                <option value="section">현재 구역</option>
                <option value="document">문서 전체</option>
              </select>
            </label>
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
