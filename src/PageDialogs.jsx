import { useEffect, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { Minus, Plus, X } from "lucide-react";
import { pageControl, pageControlFields } from "./ui-actions.js";

// 쪽 번호 매기기·새 번호로 시작·현재 쪽만 감추기. 처음 값과 넣을 자리는 코어(editPageControl)가 정하고,
// 셸은 고른 값을 이름 그대로 넘긴다. 리본·메뉴는 openPageDialog 로 연다.

export function openPageDialog(kind) {
  window.dispatchEvent(new CustomEvent("chwp-open-page-dialog", { detail: { kind } }));
}

const titles = { pageNumber: "쪽 번호 매기기", newNumber: "새 번호로 시작", pageHiding: "감추기" };
const descriptions = {
  pageNumber: "쪽 번호의 위치와 모양을 정합니다.",
  newNumber: "캐럿이 있는 쪽부터 새로 시작할 번호를 정합니다.",
  pageHiding: "캐럿이 있는 쪽에서만 감출 것을 고릅니다.",
};

// 번호 위치. 한글 대화 상자처럼 위 줄·아래 줄로 놓는다. [값, 이름, 가로(0 왼 1 가운데 2 오른, -1 바깥 -2 안), 위?]
const positionRows = [
  [["TOP_LEFT", "왼쪽 위", 0, true], ["TOP_CENTER", "가운데 위", 1, true], ["TOP_RIGHT", "오른쪽 위", 2, true], ["OUTSIDE_TOP", "바깥쪽 위", -1, true], ["INSIDE_TOP", "안쪽 위", -2, true]],
  [["BOTTOM_LEFT", "왼쪽 아래", 0, false], ["BOTTOM_CENTER", "가운데 아래", 1, false], ["BOTTOM_RIGHT", "오른쪽 아래", 2, false], ["OUTSIDE_BOTTOM", "바깥쪽 아래", -1, false], ["INSIDE_BOTTOM", "안쪽 아래", -2, false]],
];

const numberFormats = [
  ["DIGIT", "1, 2, 3"],
  ["CIRCLED_DIGIT", "①, ②, ③"],
  ["ROMAN_CAPITAL", "I, II, III"],
  ["ROMAN_SMALL", "i, ii, iii"],
  ["LATIN_CAPITAL", "A, B, C"],
  ["LATIN_SMALL", "a, b, c"],
  ["HANGUL_SYLLABLE", "가, 나, 다"],
  ["HANGUL_JAMO", "ㄱ, ㄴ, ㄷ"],
  ["IDEOGRAPH", "一, 二, 三"],
];

const numberKinds = [["PAGE", "쪽 번호"], ["FOOTNOTE", "각주 번호"], ["ENDNOTE", "미주 번호"], ["PICTURE", "그림 번호"], ["TABLE", "표 번호"], ["EQUATION", "수식 번호"]];

const hideItems = [["hideHeader", "머리말"], ["hideFooter", "꼬리말"], ["hideMaster", "바탕쪽"], ["hideBorder", "테두리"], ["hideFill", "배경"], ["hidePageNum", "쪽 번호"]];

// 맞쪽 두 장 그림. 바깥·안쪽은 두 쪽에서 서로 반대편이다.
function PositionMark({ x, top }) {
  const dot = (page) => {
    const side = x === -1 ? (page === 0 ? 0 : 2) : x === -2 ? (page === 0 ? 2 : 0) : x;
    return <rect x={page * 15 + 3 + side * 3.5} y={top ? 3 : 15} width="3" height="2" rx="0.5" fill="currentColor" />;
  };
  return (
    <svg viewBox="0 0 30 20" className="h-[22px] w-[33px]" aria-hidden="true">
      <rect x="0.5" y="0.5" width="13" height="19" rx="1" fill="none" stroke="currentColor" strokeWidth="0.8" />
      <rect x="15.5" y="0.5" width="13" height="19" rx="1" fill="none" stroke="currentColor" strokeWidth="0.8" />
      {dot(0)}
      {dot(1)}
    </svg>
  );
}

function PageNumberFields({ values, set }) {
  return (
    <>
      <fieldset className="flex flex-col gap-2 rounded-lg border border-[#e5e5e5] px-3 pt-1.5 pb-3">
        <legend className="px-1.5 font-medium">번호 위치</legend>
        {positionRows.map((row, index) => (
          <div key={index} className="grid grid-cols-5 gap-1.5">
            {row.map(([value, label, x, top]) => (
              <button
                key={value}
                type="button"
                title={label}
                aria-label={label}
                aria-pressed={values.pos === value}
                className={`ui-rb flex h-10 items-center justify-center rounded-md border ${values.pos === value ? "on border-[#2563eb] text-[#2563eb]" : "border-[#e5e5e5]"}`}
                onClick={() => set({ pos: value })}
              >
                <PositionMark x={x} top={top} />
              </button>
            ))}
          </div>
        ))}
        <button
          type="button"
          aria-pressed={values.pos === "NONE"}
          className={`ui-rb h-9 rounded-md border ${values.pos === "NONE" ? "on border-[#2563eb] text-[#2563eb]" : "border-[#e5e5e5]"}`}
          onClick={() => set({ pos: "NONE" })}
        >
          없음
        </button>
      </fieldset>
      <fieldset className="flex flex-col gap-2.5 rounded-lg border border-[#e5e5e5] px-3 pt-1.5 pb-3">
        <legend className="px-1.5 font-medium">번호 모양</legend>
        <select
          className="ui-box h-10 rounded-lg px-2"
          aria-label="번호 모양"
          value={values.format ?? "DIGIT"}
          onChange={(event) => set({ format: event.target.value })}
        >
          {numberFormats.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={values.sideChar === "-"} onChange={(event) => set({ sideChar: event.target.checked ? "-" : "" })} />
          줄표 넣기
        </label>
      </fieldset>
      {/* 1 이 아니면 쪽 번호와 같은 자리에 쪽 새 번호를 둔다(코어가 한다) */}
      <StartNumber value={values.start ?? ""} onChange={(start) => set({ start })} />
    </>
  );
}

const clampNumber = (value) => {
  const next = Math.round(Number(value));
  if (!Number.isFinite(next)) return 1;
  return Math.min(65535, Math.max(1, next));
};

// 시작 번호 칸. 번호의 범위는 1~65535 다.
function StartNumber({ value, onChange }) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span>시작 번호</span>
      <span className="ui-box flex h-11 items-center overflow-hidden rounded-lg">
        <button type="button" className="ui-ghost flex h-full w-11 items-center justify-center" aria-label="시작 번호 줄이기" onClick={() => onChange(clampNumber(value - 1))}>
          <Minus className="size-[18px]" />
        </button>
        <input
          className="h-full w-14 border-0 bg-transparent text-center outline-none"
          inputMode="numeric"
          aria-label="시작 번호"
          value={value}
          onChange={(event) => onChange(event.target.value === "" ? "" : clampNumber(event.target.value))}
        />
        <button type="button" className="ui-ghost flex h-full w-11 items-center justify-center" aria-label="시작 번호 늘리기" onClick={() => onChange(clampNumber(Number(value) + 1))}>
          <Plus className="size-[18px]" />
        </button>
      </span>
    </label>
  );
}

function NewNumberFields({ values, set }) {
  return (
    <>
      <fieldset className="grid grid-cols-2 gap-2 rounded-lg border border-[#e5e5e5] px-3 pt-1.5 pb-3">
        <legend className="px-1.5 font-medium">번호 종류</legend>
        {numberKinds.map(([value, label]) => (
          <label key={value} className="flex items-center gap-2">
            <input type="radio" name="numType" checked={values.numType === value} onChange={() => set({ numType: value })} />
            {label}
          </label>
        ))}
      </fieldset>
      <StartNumber value={values.number ?? ""} onChange={(number) => set({ number })} />
    </>
  );
}

function HidingFields({ values, set }) {
  return (
    <fieldset className="grid grid-cols-2 gap-2.5 rounded-lg border border-[#e5e5e5] px-3 pt-1.5 pb-3">
      <legend className="px-1.5 font-medium">감출 내용</legend>
      {hideItems.map(([key, label]) => (
        <label key={key} className="flex items-center gap-2">
          <input type="checkbox" checked={!!values[key]} onChange={(event) => set({ [key]: event.target.checked })} />
          {label}
        </label>
      ))}
    </fieldset>
  );
}

export function PageControlDialog() {
  const [kind, setKind] = useState(null);
  const [values, setValues] = useState({});

  useEffect(() => {
    const onOpen = (event) => {
      const next = event?.detail?.kind;
      if (!titles[next]) return;
      setValues({});
      setKind(next);
      void pageControlFields(next).then((fields) => {
        if (fields) setValues(fields);
      });
    };
    window.addEventListener("chwp-open-page-dialog", onOpen);
    return () => window.removeEventListener("chwp-open-page-dialog", onOpen);
  }, []);

  const set = (patch) => setValues((old) => ({ ...old, ...patch }));
  const close = () => {
    setKind(null);
    window.dispatchEvent(new Event("chwp-focus-editor"));
  };
  const apply = () => {
    const done = kind;
    const fields = { ...values };
    delete fields.exists;
    if (done === "newNumber") fields.number = clampNumber(fields.number);
    if (done === "pageNumber") fields.start = clampNumber(fields.start);
    close();
    void pageControl(done, fields);
  };

  const open = kind !== null;
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/45" />
        <DialogPrimitive.Content
          className="toolbar-ui ui-chrome fixed inset-x-0 bottom-0 z-[80] flex flex-col gap-4 rounded-t-[18px] bg-white px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.12)] outline-none lg:inset-auto lg:top-1/2 lg:left-1/2 lg:w-[460px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:flex-row lg:gap-5 lg:rounded-[10px] lg:p-6 lg:shadow-[0_0_0_1px_#d4d4d4,0_20px_40px_rgba(0,0,0,0.18)]"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onKeyDown={(event) => {
            if (event.key === "Enter" && event.target?.tagName !== "SELECT") {
              event.preventDefault();
              apply();
            }
          }}
        >
          <DialogPrimitive.Description className="sr-only">{open ? descriptions[kind] : ""}</DialogPrimitive.Description>
          <div className="flex min-w-0 flex-1 flex-col gap-3.5">
            <div className="flex items-center">
              <DialogPrimitive.Title className="flex-1 text-[20px] font-bold">{open ? titles[kind] : ""}</DialogPrimitive.Title>
              <button type="button" className="ui-ghost flex size-12 items-center justify-center rounded-[10px] lg:hidden" aria-label="닫기" onClick={close}>
                <X className="size-6" />
              </button>
            </div>
            {kind === "pageNumber" ? <PageNumberFields values={values} set={set} /> : null}
            {kind === "newNumber" ? <NewNumberFields values={values} set={set} /> : null}
            {kind === "pageHiding" ? <HidingFields values={values} set={set} /> : null}
          </div>
          <div className="flex shrink-0 flex-row-reverse gap-2 border-t border-[#e5e5e5] pt-3 lg:w-[104px] lg:flex-col lg:border-0 lg:pt-11">
            <button type="button" className="ui-primary h-[54px] flex-1 rounded-[10px] lg:h-11 lg:flex-none lg:rounded-lg" onClick={apply}>{kind === "pageHiding" ? "설정(D)" : "넣기(D)"}</button>
            <button type="button" className="ui-outline h-[54px] flex-1 rounded-[10px] lg:h-11 lg:flex-none lg:rounded-lg" onClick={close}>취소</button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
