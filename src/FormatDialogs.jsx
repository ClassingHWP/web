import { useEffect, useRef, useState } from "react";
import { Dialog as DialogPrimitive, Select as SelectPrimitive } from "radix-ui";
import {
  AlignHorizontalDistributeCenter,
  AlignHorizontalSpaceBetween,
  ChevronDown,
  ChevronUp,
  Check as CheckMark,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignJustify,
  TextAlignStart,
  X,
} from "lucide-react";
import { ColorField } from "./ColorPicker.jsx";
import { EmphasisIcon, HatchIcon, LineTypeIcon, LineWidthIcon, OutlineIcon, UnderlinePlaceIcon } from "./ShapeIcons.jsx";
import { FontField } from "./FontField.jsx";
import { notReady, pickPicture, useWide } from "./ui-actions.js";
import { openTableDialog, TableDialog } from "./TableDialog.jsx";
import { PageControlDialog } from "./PageDialogs.jsx";
import { SymbolDialog } from "./SymbolDialog.jsx";
import { HyperlinkDialog, openHyperlinkDialog } from "./HyperlinkDialog.jsx";
import { ColumnDialog } from "./ColumnDialog.jsx";
import { GridDialog, MoveGuideDialog } from "./GuideDialogs.jsx";
import { SectionDialog, openSectionDialog } from "./SectionDialog.jsx";
import { TablePropertiesDialog } from "./TablePropertiesDialog.jsx";
import { BookmarkDialog, GoToDialog, openBookmarkDialog, openGoToDialog } from "./BookmarkDialog.jsx";
import { ComposeDialog, RubyDialog, openComposeDialog, openRubyDialog } from "./GlyphGroupDialog.jsx";
import { CaseDialog, WidthDialog } from "./TextConvertDialog.jsx";
import { HeaderFooterDialog, openHeaderFooterDialog } from "./HeaderFooterDialog.jsx";
import { CopyShapeDialog, openCopyShapeDialog } from "./CopyShapeDialog.jsx";
import { TableToTextDialog, TextToTableDialog } from "./TableTextDialog.jsx";
import { TableFlipDialog } from "./TableFlipDialog.jsx";
import { TableSortDialog } from "./TableSortDialog.jsx";
import { TableFormulaDialog } from "./TableFormulaDialog.jsx";
import { MasterPageDialog } from "./MasterPageDialog.jsx";
import { LineNumberDialog } from "./LineNumberDialog.jsx";
import { DeletePageDialog } from "./DeletePageDialog.jsx";
import { MemoDialog } from "./MemoDialog.jsx";
import { ProofMarkDialog } from "./ProofMarkDialog.jsx";
import { BlockCalcDialog } from "./BlockCalcDialog.jsx";
import { DeleteMarksDialog } from "./DeleteMarksDialog.jsx";
import { NoteShapeDialog } from "./NoteShapeDialog.jsx";
import { FindDialog, openFindDialog } from "./FindDialog.jsx";

// 시안(글자 모양·문단 모양·편집 용지 대화 상자). 칸 이름과 칸에 친 값을 그대로 코어에 넘기고,
// 코어가 준 값과 칸 설명(단위·범위·고를 수 있는 값)을 그대로 보인다. 단위 바꾸기와 함께 바뀌는 값도 코어가 정한다.
// 설정을 누르면 고친 칸을 고친 차례대로 넘긴다.

// lang 을 주면 글자 모양 대화 상자를 그 언어(한글·영문 등)의 언어별 설정으로 연다.
export function openFormatDialog(name, lang = "") {
  window.dispatchEvent(new CustomEvent("chwp-open-format-dialog", { detail: { name, lang } }));
}


const dialogKinds = { char: 0, para: 1, page: 2, pageBorder: 4 };

// 편집 용지 칸을 바로 적용한다(리본의 세로·가로·쪽 여백·글자 방향). whole 이면 모든 구역에 적용한다.
export function applyPageSetup(patch, whole = false) {
  if (typeof window.__chwpApplyFormatDialog !== "function") return;
  void window.__chwpApplyFormatDialog(dialogKinds.page, patch, whole);
}

// 쪽 여백 메뉴의 여백 묶음 이름. 여백 값은 코어가 갖고 있다(marginPreset).
export const pageMarginPresets = ["기본", "좁게", "보통", "넓게"];

// 대화 상자 칸. 고친 칸을 고친 차례대로 모으고, 그때마다 코어가 준 값과 칸 설명을 받는다.
function useCoreForm(kind, open) {
  const patchRef = useRef({});
  const askRef = useRef(0);
  const [view, setView] = useState({ values: {}, specs: {} });
  const show = (patch) => {
    const token = ++askRef.current;
    if (typeof window.__chwpFormatView !== "function") return;
    void window.__chwpFormatView(kind, patch).then((got) => {
      if (!got || token !== askRef.current) return;
      // 탭 목록 명령은 한 번만 적용한다. 받은 목록으로 바꿔 둔다.
      if ("tabAdd" in patch || "tabRemove" in patch || "tabClear" in patch) {
        const next = { ...patch };
        delete next.tabAdd;
        delete next.tabRemove;
        delete next.tabClear;
        delete next.tabStops;
        next.tabStops = got.values?.tabStops ?? "";
        patchRef.current = next;
      }
      setView(got);
    });
  };
  useEffect(() => {
    if (!open) return;
    patchRef.current = {};
    show({});
  }, [open]);
  const set = (key, value) => {
    const next = { ...patchRef.current };
    delete next[key];
    next[key] = value;
    patchRef.current = next;
    show(next);
  };
  return { patch: () => patchRef.current, values: view.values || {}, specs: view.specs || {}, set };
}

// 코어가 준 고를 수 있는 값에 이름을 붙인다. 코어가 이름을 주면 그 이름을 쓴다.
function optionsOf(form, key, labels = {}) {
  const spec = form.specs[key];
  if (!spec?.options) return [];
  return spec.options.map(([id, label]) => [id, label || labels[id] || id]);
}

// 코어 칸 설명대로 숫자 칸을 그린다.
function FieldNumber({ form, name, label, width, disabled = false }) {
  const spec = form.specs[name] || {};
  return (
    <NumberBox
      label={label}
      value={form.values[name] ?? 0}
      unit={spec.unit}
      step={spec.step ?? 1}
      digits={spec.digits ?? 0}
      min={spec.min ?? -100000}
      max={spec.max ?? 100000}
      width={width}
      disabled={disabled}
      onChange={(n) => form.set(name, n)}
    />
  );
}

// 코어가 그린 미리보기. 고친 칸이 바뀔 때마다 다시 받는다.
function CorePreview({ kind, form, height }) {
  const canvas = useRef(null);
  const patch = JSON.stringify(form.patch());
  const values = form.values;
  useEffect(() => {
    const node = canvas.current;
    if (!node || typeof window.__chwpFormatPreview !== "function") return;
    let alive = true;
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(64, Math.round(node.clientWidth * dpr));
    const h = Math.max(64, Math.round(node.clientHeight * dpr));
    void window.__chwpFormatPreview(kind, JSON.parse(patch), w, h).then((frame) => {
      if (!alive || !frame || !(frame.width > 0) || !(frame.height > 0)) return;
      node.width = frame.width;
      node.height = frame.height;
      const pixels = new Uint8ClampedArray(frame.pixels);
      if (pixels.length === frame.width * frame.height * 4) {
        node.getContext("2d")?.putImageData(new ImageData(pixels, frame.width, frame.height), 0, 0);
      }
    });
    return () => { alive = false; };
  }, [kind, patch, values]);
  return (
    <canvas
      ref={canvas}
      aria-label="미리보기"
      className="block w-full rounded-[0.45em] bg-[#fafafa] shadow-[inset_0_0_0_1px_#e5e5e5]"
      style={{ height }}
    />
  );
}

// ---------------------------------------------------------------------------
// 부품

function Section({ title, children, note }) {
  return (
    <section className="flex flex-col gap-[0.65em]">
      <div className="flex items-center gap-[0.65em] font-bold">
        <span>{title}</span>
        <span aria-hidden="true" className="h-px flex-1 bg-[#e5e5e5]" />
      </div>
      {note ? <p className="text-[0.85em] text-[#737373]">{note}</p> : null}
      {children}
    </section>
  );
}

function Row({ label, children, width = "5.2em" }) {
  return (
    <div className="flex flex-wrap items-center gap-[0.55em]">
      <span className="flex-none" style={{ width }}>{label}</span>
      {children}
    </div>
  );
}

function formatNumber(value, digits) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return digits > 0 ? n.toFixed(digits) : String(Math.round(n));
}

// 숫자 칸. 값은 화면 단위(pt·%·mm)이고, 바뀐 값은 칸을 떠날 때 넘긴다.
function NumberBox({ label, value, unit, step = 1, digits = 0, min = -100000, max = 100000, onChange, width = "8.3em", disabled = false }) {
  const [text, setText] = useState(formatNumber(value, digits));
  const focused = useRef(false);
  useEffect(() => {
    if (!focused.current) setText(formatNumber(value, digits));
  }, [value, digits]);
  const commit = (next) => {
    const n = Math.min(max, Math.max(min, Number(next)));
    if (!Number.isFinite(n)) {
      setText(formatNumber(value, digits));
      return;
    }
    setText(formatNumber(n, digits));
    onChange(n);
  };
  const stepBy = (delta) => commit(Math.round((Number(value) + delta) * 100) / 100);
  return (
    <label className={`ui-box flex h-[var(--ui-h)] flex-none items-center overflow-hidden rounded-[0.45em] ${disabled ? "pointer-events-none opacity-50" : ""}`} style={{ width }}>
      <span className="sr-only">{label}</span>
      <input
        className="h-full min-w-0 flex-1 border-0 bg-transparent px-[0.55em] outline-none"
        inputMode="decimal"
        value={text}
        disabled={disabled}
        onFocus={() => { focused.current = true; }}
        onBlur={() => { focused.current = false; commit(text); }}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
      />
      {unit ? <span className="pr-[0.4em] text-[#737373]">{unit}</span> : null}
      <span className="flex h-full flex-col border-l border-[#d4d4d4]">
        <button type="button" tabIndex={-1} className="ui-ghost flex w-[1.3em] flex-1 items-center justify-center" aria-label={`${label} 크게`} onClick={() => stepBy(step)}>
          <ChevronUp className="size-[0.75em]" />
        </button>
        <button type="button" tabIndex={-1} className="ui-ghost flex w-[1.3em] flex-1 items-center justify-center border-t border-[#d4d4d4]" aria-label={`${label} 작게`} onClick={() => stepBy(-step)}>
          <ChevronDown className="size-[0.75em]" />
        </button>
      </span>
    </label>
  );
}

// 대화 상자 목록. 시스템 목록 대신 앱 모양으로 연다. icon 을 주면 항목과 고른 값 앞에 그 모양 그림을 그린다.
// Radix 목록은 빈 값을 못 받아서 빈 값은 따로 바꿔 넘긴다.
const EMPTY_CHOICE = "__empty__";

export function Choice({ label, value, options, onChange, width = "10em", disabled = false, icon = null }) {
  const encode = (id) => (id === "" ? EMPTY_CHOICE : String(id));
  const decode = (id) => (id === EMPTY_CHOICE ? "" : id);
  const current = options.find(([id]) => String(id) === String(value));
  return (
    <span className={`relative flex-none ${disabled ? "opacity-50" : ""}`} style={{ width }}>
      <SelectPrimitive.Root value={encode(value ?? "")} onValueChange={(id) => onChange(decode(id))} disabled={disabled}>
        <SelectPrimitive.Trigger
          aria-label={label}
          className="ui-outline flex h-[var(--ui-h)] w-full cursor-pointer items-center gap-[0.5em] rounded-[0.45em] pr-[1.8em] pl-[0.6em] text-left outline-none disabled:cursor-default"
        >
          {icon && current ? icon(current[0]) : null}
          <span className="min-w-0 flex-1 truncate">{current ? current[1] : ""}</span>
          <ChevronDown aria-hidden="true" className="pointer-events-none absolute top-1/2 right-[0.5em] size-[0.85em] -translate-y-1/2 text-[#737373]" />
        </SelectPrimitive.Trigger>
        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            align="start"
            sideOffset={4}
            className="toolbar-ui ui-chrome ui-pop z-[95] max-h-[min(22em,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-lg p-1"
          >
            <SelectPrimitive.Viewport>
              {options.map(([id, text]) => (
                <SelectPrimitive.Item
                  key={encode(id)}
                  value={encode(id)}
                  className="flex min-h-[2.2em] cursor-pointer items-center gap-[0.6em] rounded-[6px] px-[0.55em] outline-none select-none data-[highlighted]:bg-[#f5f5f5] data-[state=checked]:bg-[#f5f5f5]"
                >
                  {icon ? icon(id) : null}
                  <SelectPrimitive.ItemText>{text}</SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator className="ml-auto pl-[0.5em]">
                    <CheckMark className="size-[1em] text-[#171717]" />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    </span>
  );
}

function Check({ checked, onChange, children, disabled = false }) {
  return (
    <label className={`flex min-h-[1.9em] items-center gap-[0.55em] ${disabled ? "text-[#a3a3a3]" : ""}`}>
      <input
        type="checkbox"
        className="m-0 size-[1.2em] flex-none accent-[#171717]"
        checked={!!checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      {children}
    </label>
  );
}

function Radio({ name, checked, onChange, children, disabled = false }) {
  return (
    <label className={`flex min-h-[1.9em] items-center gap-[0.55em] ${disabled ? "text-[#a3a3a3]" : ""}`}>
      <input type="radio" name={name} className="ui-radio" checked={checked} disabled={disabled} onChange={onChange} />
      {children}
    </label>
  );
}

// 선 모양 이름. 고를 수 있는 값은 코어가 준다.
export const lineShapeLabels = {
  SOLID: "실선", DASH: "파선", DOT: "점선", DASH_DOT: "일점쇄선", DASH_DOT_DOT: "이점쇄선", LONG_DASH: "긴 파선",
  CIRCLE: "원형 점선", DOUBLE_SLIM: "이중 실선", SLIM_THICK: "얇고 굵은 이중선", THICK_SLIM: "굵고 얇은 이중선",
  SLIM_THICK_SLIM: "얇고 굵고 얇은 삼중선", WAVE: "물결", DOUBLE_WAVE: "이중 물결", NONE: "없음",
};
// SLASH 는 \ 모양, BACK_SLASH 는 / 모양이다(한글 2024).
const patternLabels = {
  NONE: "없음", HORIZONTAL: "가로줄", VERTICAL: "세로줄", SLASH: "대각선 \\", BACK_SLASH: "대각선 /", CROSS: "격자",
  CROSS_DIAGONAL: "대각 격자",
};
const borderSides = [["Top", "위"], ["Bottom", "아래"], ["Left", "왼쪽"], ["Right", "오른쪽"]];

// 테두리/배경. 값은 코어의 "char." · "para." 이름 그대로다. 고른 선(펜)을 변 단추로 붙이고 뗀다.
// 펜의 처음 모양과 굵기 목록·맞추기는 코어가 준다.
function BorderFillPanel({ prefix, form, extra, borderOnly = false, fillOnly = false }) {
  const values = form.values;
  const key = (name) => `${prefix}.${name}`;
  const inked = (side) => {
    const type = values[key(`border${side}Type`)];
    return Boolean(type) && type !== "NONE";
  };
  const [line, setLine] = useState(() => ({
    type: values[key("penType")] || "SOLID",
    width: String(values[key("penWidth")] || ""),
    color: values[key("penColor")] || "#000000",
  }));
  const [live, setLive] = useState(true);
  const putSide = (side, next) => {
    form.set(key(`border${side}Type`), next ? next.type : "NONE");
    if (next) {
      form.set(key(`border${side}Width`), Number(next.width));
      form.set(key(`border${side}Color`), next.color);
    }
  };
  const changeLine = (patch) => {
    const next = { ...line, ...patch };
    setLine(next);
    // 선 모양 바로 적용: 이미 선이 있는 변에 바로 넣는다.
    if (live) borderSides.forEach(([side]) => { if (inked(side)) putSide(side, next); });
  };
  const sameAsLine = (side) =>
    inked(side) && values[key(`border${side}Type`)] === line.type &&
    String(values[key(`border${side}WidthView`)]) === line.width &&
    String(values[key(`border${side}Color`)] || "").toUpperCase() === line.color.toUpperCase();
  const toggle = (side) => putSide(side, sameAsLine(side) ? null : line);
  const edgeButton = (label, active, onClick) => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="ui-tg h-[2.3em] min-w-[3.2em] rounded-[0.4em] px-[0.5em] text-[0.8em] shadow-[inset_0_0_0_1px_#d4d4d4]"
      title={`${label} 테두리`}
    >
      {label}
    </button>
  );
  const hatch = values[key("fillHatchStyle")] || "NONE";
  return (
    <>
      {fillOnly ? null : <Section title="테두리">
        <div className="flex flex-wrap items-start gap-[1.5em]">
          <div className="flex flex-col gap-[0.55em]">
            <Row label="종류"><Choice label="테두리 종류" value={line.type} options={optionsOf(form, key("penType"), lineShapeLabels)} width="12em" icon={(id) => <LineTypeIcon type={id} />} onChange={(type) => changeLine({ type })} /></Row>
            <Row label="굵기"><Choice label="테두리 굵기" value={line.width} options={optionsOf(form, key("penWidth"))} width="12em" icon={(id) => <LineWidthIcon hu={id} />} onChange={(width) => changeLine({ width })} /></Row>
            <Row label="색"><ColorField label="테두리 색" value={line.color} onChange={(hex) => changeLine({ color: hex })} /></Row>
            <Check checked={live} onChange={setLive}>선 모양 바로 적용</Check>
            {extra}
          </div>
          <div className="flex max-w-[15em] flex-wrap gap-[0.35em]">
            {borderSides.map(([side, label]) => edgeButton(label, inked(side), () => toggle(side)))}
            {edgeButton("모두", borderSides.every(([side]) => sameAsLine(side)), () => borderSides.forEach(([side]) => putSide(side, line)))}
            {edgeButton("없음", borderSides.every(([side]) => !inked(side)), () => borderSides.forEach(([side]) => putSide(side, null)))}
          </div>
        </div>
      </Section>}
      {borderOnly ? null : <Section title="배경">
        <div className="flex flex-col gap-[0.55em]">
          <Row label="면 색"><ColorField label="면 색" value={values[key("fillFaceColor")] || ""} allowNone noneLabel="면 색 없음" onChange={(hex) => form.set(key("fillFaceColor"), hex || "")} /></Row>
          <Row label="무늬 모양"><Choice label="무늬 모양" value={hatch} options={optionsOf(form, key("fillHatchStyle"), patternLabels)} icon={(id) => <HatchIcon style={id} />} onChange={(style) => form.set(key("fillHatchStyle"), style)} /></Row>
          <Row label="무늬 색"><ColorField label="무늬 색" value={values[key("fillHatchColor")] || ""} disabled={hatch === "NONE"} onChange={(hex) => form.set(key("fillHatchColor"), hex)} /></Row>
        </div>
      </Section>}
    </>
  );
}

// 휴대폰 시안(MCharDialog·MParaDialog). 거의 전체 화면 시트이고, 위는 제목·탭, 가운데는 밀어 보는 내용, 아래는 취소·설정이다.
function SheetFrame({ open, title, tabs, tab, onTab, onApply, onClose, children }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/45" />
        <DialogPrimitive.Content
          className="toolbar-ui ui-chrome fixed inset-x-0 top-[40px] bottom-0 z-[80] flex flex-col rounded-t-[18px] bg-white text-[17px] text-[#0a0a0a] outline-none"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <DialogPrimitive.Description className="sr-only">{title} 값을 고칩니다.</DialogPrimitive.Description>
          <div className="flex h-[54px] flex-none items-center pt-[10px] pr-[8px] pl-[20px]">
            <DialogPrimitive.Title className="flex-1 text-[20px] font-bold">{title}</DialogPrimitive.Title>
            <button type="button" className="ui-ghost flex size-12 items-center justify-center rounded-[10px]" aria-label="닫기" onClick={onClose}>
              <X className="size-6" />
            </button>
          </div>
          <div role="tablist" className="mx-[14px] mt-[8px] mb-[4px] flex flex-none gap-1 rounded-[12px] bg-[#f5f5f5] p-1">
            {tabs.map((name) => (
              <button
                key={name}
                type="button"
                role="tab"
                aria-selected={name === tab}
                className={`h-11 min-w-0 flex-1 rounded-[9px] px-[2px] text-[15px] whitespace-nowrap ${name === tab ? "bg-white font-medium shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[#737373]"}`}
                onClick={() => onTab(name)}
              >
                {name}
              </button>
            ))}
          </div>
          <div role="tabpanel" aria-label={tab} className="flex min-h-0 flex-1 flex-col gap-[22px] overflow-y-auto px-[18px] pt-4 pb-6 [scrollbar-width:thin] [&>*]:shrink-0">
            {children}
          </div>
          <div className="flex flex-none gap-2 border-t border-[#e5e5e5] px-4 pt-3 pb-[max(28px,env(safe-area-inset-bottom))]">
            <button type="button" className="ui-outline h-[54px] flex-1 rounded-[10px]" onClick={onClose}>취소</button>
            <button type="button" className="ui-primary h-[54px] flex-1 rounded-[10px] font-medium" onClick={onApply}>설정</button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// 제목·닫기·탭·본문·대화 상자 설정 줄과 오른쪽 설정/취소 단추. 좁은 화면은 휴대폰 시트로 연다.
function DialogFrame(props) {
  const wide = useWide();
  if (!wide) return <SheetFrame {...props} />;
  const { open, title, tabs, tab, onTab, onApply, onClose, children } = props;
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/45" />
        <DialogPrimitive.Content
          className="toolbar-ui ui-chrome fixed top-1/2 left-1/2 z-[80] flex max-h-[calc(100dvh-1.5rem)] w-[min(54em,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-[0.9em] overflow-y-auto rounded-[0.7em] bg-white px-[1.35em] pt-[1.2em] pb-[1.35em] shadow-[0_0_0_1px_#d4d4d4,0_20px_40px_rgba(0,0,0,0.18)] outline-none"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <DialogPrimitive.Description className="sr-only">{title} 값을 고칩니다.</DialogPrimitive.Description>
          <div className="flex items-center">
            <DialogPrimitive.Title className="flex-1 text-[1.15em] font-bold">{title}</DialogPrimitive.Title>
            <button type="button" className="ui-ghost flex size-[var(--ui-h)] items-center justify-center rounded-[0.45em]" aria-label="닫기" onClick={onClose}>
              <X className="size-[1.1em]" />
            </button>
          </div>
          <div className="flex flex-col gap-[1.1em] sm:flex-row sm:items-start">
            <div className="flex min-w-0 flex-1 flex-col gap-[1em]">
              <div role="tablist" className="flex gap-[0.22em] rounded-[0.55em] bg-[#f5f5f5] p-[0.22em]">
                {tabs.map((name) => (
                  <button
                    key={name}
                    type="button"
                    role="tab"
                    aria-selected={name === tab}
                    className={`h-[calc(var(--ui-h)-0.2em)] flex-1 rounded-[0.45em] ${name === tab ? "bg-white font-medium shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-[#737373]"}`}
                    onClick={() => onTab(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
              <div role="tabpanel" aria-label={tab} className="flex min-h-[26em] flex-col gap-[1em]">
                {children}
              </div>
              <div className="flex flex-wrap items-center gap-[0.55em] border-t border-[#e5e5e5] pt-[0.8em]">
                <span className="flex-none">대화 상자 설정</span>
                <button type="button" className="ui-outline flex h-[var(--ui-h)] w-[13em] items-center gap-[0.45em] rounded-[0.45em] pr-[0.55em] pl-[0.65em]" onClick={() => notReady("대화 상자 설정")}>
                  <span className="min-w-0 flex-1 truncate text-left">사용자 지정</span>
                  <ChevronDown className="size-[0.85em] text-[#737373]" />
                </button>
                <button type="button" className="ui-outline h-[var(--ui-h)] rounded-[0.45em] px-[0.9em]" onClick={() => notReady("대화 상자 구성")}>구성…</button>
              </div>
            </div>
            <div className="flex flex-none gap-[0.45em] sm:w-[6.2em] sm:flex-col sm:pt-[0.1em]">
              <button type="button" className="ui-primary h-[var(--ui-h)] flex-1 rounded-[0.45em] sm:flex-none" onClick={onApply}>설정(D)</button>
              <button type="button" className="ui-outline h-[var(--ui-h)] flex-1 rounded-[0.45em] sm:flex-none" onClick={onClose}>취소</button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// ---------------------------------------------------------------------------
// 글자 모양

// 속성 단추. 누르면 그 칸을 뒤집어 넘긴다. 함께 꺼지는 속성(양각·음각, 위·아래 첨자)과 보통 모양은 코어가 정한다.
const charAttrs = [
  { key: "bold", label: "진하게", glyph: <b>가</b> },
  { key: "italic", label: "기울임", glyph: <i>가</i> },
  { key: "underlineOn", label: "밑줄", glyph: <u>가</u> },
  { key: "strikeout", label: "취소선", glyph: <s>가</s> },
  { key: "outlineOn", label: "외곽선", glyph: <span style={{ color: "#ffffff", WebkitTextStroke: "1px #0a0a0a" }}>가</span> },
  { key: "shadowOn", label: "그림자", glyph: <span style={{ textShadow: "2px 2px 0 #a3a3a3" }}>가</span> },
  { key: "emboss", label: "양각", glyph: <span style={{ textShadow: "-1px -1px 0 #ffffff, 1px 1px 0 #737373" }}>가</span> },
  { key: "engrave", label: "음각", glyph: <span style={{ textShadow: "1px 1px 0 #ffffff, -1px -1px 0 #737373" }}>가</span> },
  { key: "superscript", label: "위 첨자", glyph: <span>가<sup className="text-[0.6em]">가</sup></span> },
  { key: "subscript", label: "아래 첨자", glyph: <span>가<sub className="text-[0.6em]">가</sub></span> },
  { key: "plain", label: "보통 모양", glyph: <span>가</span> },
];

const underlinePlaceLabels = { NONE: "없음", BOTTOM: "아래쪽", TOP: "위쪽" };
const outlineLabels = { 0: "없음", 1: "실선", 2: "점선", 3: "굵은 실선", 4: "파선", 5: "일점쇄선", 6: "이점쇄선" };
const emphasisLabels = { 0: "없음", 1: "채운 동그라미", 2: "빈 동그라미", 3: "꺾쇠", 4: "물결", 5: "가운뎃점", 6: "쌍점" };
const shadowLabels = { 0: "없음", 1: "비연속", 2: "연속" };
const languages = [["대표", "대표"], ["한글", "한글"], ["영문", "영문"], ["한자", "한자"], ["일어", "일어"], ["외국어", "외국어"], ["기호", "기호"], ["사용자", "사용자"]];
// 언어별 값 이름에 붙는 코어 언어 이름. 대표는 붙이지 않아 모든 언어에 같은 값이 들어간다.
const languageKeys = { 한글: "HANGUL", 영문: "LATIN", 한자: "HANJA", 일어: "JAPANESE", 외국어: "OTHER", 기호: "SYMBOL", 사용자: "USER" };

function CharDialog({ open, fonts, onClose, startLang = "대표" }) {
  const [tab, setTab] = useState("기본");
  const [lang, setLang] = useState("대표");
  const form = useCoreForm(dialogKinds.char, open);
  const v = form.values;
  // 고른 언어의 값 이름. 대표면 그대로다.
  const langKey = (name) => (languageKeys[lang] ? `${name}.${languageKeys[lang]}` : name);
  useEffect(() => {
    if (open) {
      setTab("기본");
      setLang(languageKeys[startLang] ? startLang : "대표");
    }
  }, [open, startLang]);

  function apply() {
    const patch = form.patch();
    onClose();
    if (Object.keys(patch).length && typeof window.__chwpApplyFormatDialog === "function") {
      void window.__chwpApplyFormatDialog(dialogKinds.char, patch);
    }
  }

  return (
    <DialogFrame open={open} title="글자 모양" tabs={["기본", "확장", "테두리/배경"]} tab={tab} onTab={setTab} onApply={apply} onClose={onClose}>
      {tab === "기본" ? (
        <>
          <Row label="기준 크기"><FieldNumber form={form} name="fontSize@pt" label="기준 크기" /></Row>
          <Section title="언어별 설정">
            <div className="flex flex-col gap-[0.55em]">
              <Row label="언어">
                <Choice label="언어" value={lang} options={languages} width="8.3em" onChange={setLang} />
              </Row>
              <Row label="글꼴">
                <FontField value={v[langKey("font")] || ""} fonts={fonts} className="w-[16.5em]" layer="z-[90]" onPick={(font) => form.set(langKey("font"), font)} />
              </Row>
              <div className="grid grid-cols-1 gap-[0.55em] sm:grid-cols-2">
                <Row label="상대크기"><FieldNumber form={form} name={langKey("relSize")} label="상대크기" /></Row>
                <Row label="글자 위치"><FieldNumber form={form} name={langKey("charOffset")} label="글자 위치" /></Row>
                <Row label="장평"><FieldNumber form={form} name={langKey("ratio")} label="장평" /></Row>
                <Row label="자간"><FieldNumber form={form} name={langKey("spacing")} label="자간" /></Row>
              </div>
            </div>
          </Section>
          <Section title="속성">
            <div className="flex flex-col gap-[0.75em]">
              <div className="flex flex-wrap gap-[0.45em]">
                {charAttrs.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className="ui-tg h-[var(--ui-h)] w-[2.75em] rounded-[0.45em] text-[1.05em] shadow-[inset_0_0_0_1px_#d4d4d4]"
                    aria-label={item.label}
                    title={item.label}
                    aria-pressed={item.key === "plain" ? false : !!v[item.key]}
                    onClick={() => form.set(item.key, item.key === "plain" ? true : !v[item.key])}
                  >
                    {item.glyph}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-x-[1.5em] gap-y-[0.55em]">
                <Row label="글자 색"><ColorField label="글자 색" value={v.color} onChange={(hex) => form.set("color", hex)} /></Row>
                <Row label="음영 색"><ColorField label="음영 색" value={v.shadeColor} allowNone noneLabel="음영 색 없음" onChange={(hex) => form.set("shadeColor", hex)} /></Row>
              </div>
            </div>
          </Section>
          <CorePreview kind={dialogKinds.char} form={form} height="6.6em" />
        </>
      ) : null}
      {tab === "확장" ? (
        <>
          <Section title="그림자">
            <div className="flex flex-col gap-[0.55em]">
              <div className="flex flex-wrap items-center gap-[1.1em]">
                {optionsOf(form, "shadow", shadowLabels).map(([id, text]) => (
                  <Radio key={id} name="char-shadow" checked={String(v.shadow ?? 0) === id} onChange={() => form.set("shadow", Number(id))}>{text}</Radio>
                ))}
              </div>
              <div className="flex flex-wrap gap-x-[1.5em] gap-y-[0.55em]">
                <Row label="X 방향"><FieldNumber form={form} name="shadowOffsetX" label="X 방향" width="7.2em" disabled={!Number(v.shadow)} /></Row>
                <Row label="Y 방향"><FieldNumber form={form} name="shadowOffsetY" label="Y 방향" width="7.2em" disabled={!Number(v.shadow)} /></Row>
                <Row label="색"><ColorField label="그림자 색" value={v.shadowColor} disabled={!Number(v.shadow)} onChange={(hex) => form.set("shadowColor", hex)} /></Row>
              </div>
            </div>
          </Section>
          <div className="grid grid-cols-1 gap-[1.5em] sm:grid-cols-2">
            <Section title="밑줄">
              <div className="flex flex-col gap-[0.55em]">
                <Row label="위치"><Choice label="밑줄 위치" value={v.underlineType} options={optionsOf(form, "underlineType", underlinePlaceLabels)} icon={(id) => <UnderlinePlaceIcon place={id} />} onChange={(id) => form.set("underlineType", id)} /></Row>
                <Row label="모양"><Choice label="밑줄 모양" value={v.underlineShape} options={optionsOf(form, "underlineShape", lineShapeLabels)} width="13em" icon={(id) => <LineTypeIcon type={id} />} onChange={(id) => form.set("underlineShape", id)} /></Row>
                <Row label="색"><ColorField label="밑줄 색" value={v.underlineColor} allowNone noneLabel="글자 색과 같음" onChange={(hex) => form.set("underlineColor", hex)} /></Row>
              </div>
            </Section>
            <Section title="취소선">
              <div className="flex flex-col gap-[0.55em]">
                <Row label="모양">
                  <Choice label="취소선 모양" value={v.strikeView} options={optionsOf(form, "strikeView", lineShapeLabels)} width="13em" icon={(id) => <LineTypeIcon type={id} />} onChange={(id) => form.set("strikeView", id)} />
                </Row>
                <Row label="색"><ColorField label="취소선 색" value={v.strikeColor} allowNone noneLabel="글자 색과 같음" onChange={(hex) => form.set("strikeColor", hex)} /></Row>
              </div>
            </Section>
          </div>
          <Section title="기타">
            <div className="grid grid-cols-1 gap-[1.5em] sm:grid-cols-2">
              <div className="flex flex-col gap-[0.55em]">
                <Row label="외곽선"><Choice label="외곽선" value={String(v.outline ?? 0)} options={optionsOf(form, "outline", outlineLabels)} icon={(id) => <OutlineIcon kind={id} />} onChange={(id) => form.set("outline", Number(id))} /></Row>
                <Row label="강조점"><Choice label="강조점" value={String(v.emphasis ?? 0)} options={optionsOf(form, "emphasis", emphasisLabels)} icon={(id) => <EmphasisIcon kind={id} />} onChange={(id) => form.set("emphasis", Number(id))} /></Row>
              </div>
              <div className="flex flex-col gap-[0.2em]">
                <Check checked={v.useFontSpace} onChange={(on) => form.set("useFontSpace", on)}>글꼴에 어울리는 빈칸</Check>
                <Check checked={v.useKerning} onChange={(on) => form.set("useKerning", on)}>커닝</Check>
              </div>
            </div>
          </Section>
          <CorePreview kind={dialogKinds.char} form={form} height="6.6em" />
        </>
      ) : null}
      {tab === "테두리/배경" ? <BorderFillPanel prefix="char" form={form} /> : null}
    </DialogFrame>
  );
}

// ---------------------------------------------------------------------------
// 문단 모양

const alignIcons = {
  JUSTIFY: ["양쪽 정렬", TextAlignJustify],
  LEFT: ["왼쪽 정렬", TextAlignStart],
  CENTER: ["가운데 정렬", TextAlignCenter],
  RIGHT: ["오른쪽 정렬", TextAlignEnd],
  DISTRIBUTE: ["배분 정렬", AlignHorizontalDistributeCenter],
  DISTRIBUTE_SPACE: ["나눔 정렬", AlignHorizontalSpaceBetween],
};
const lineSpacingLabels = { PERCENT: "글자에 따라", FIXED: "고정 값", BETWEEN_LINES: "여백만 지정", AT_LEAST: "최소" };
const indentLabels = { normal: "보통", in: "들여쓰기", out: "내어쓰기" };
const hangulBreakLabels = { word: "어절", char: "글자" };
const latinBreakLabels = { word: "단어", hyphen: "하이픈", char: "글자" };
const vertAlignLabels = { BASELINE: "글꼴 기준", TOP: "위쪽", CENTER: "가운데", BOTTOM: "아래쪽" };
const levelLabels = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i), `${i + 1} 수준`]));

// 탭 설정. 목록은 코어가 칸마다 나눠 준다(tab.n.*). 더하기·지우기도 코어가 한다.
const tabKindLabels = { LEFT: "왼쪽", RIGHT: "오른쪽", CENTER: "가운데", DECIMAL: "소수점" };

function TabPanel({ form }) {
  const v = form.values;
  const count = Number(v.tabCount) || 0;
  const stops = Array.from({ length: count }, (_, i) => ({
    pos: v[`tab.${i}.pos@pt`],
    type: v[`tab.${i}.type`],
    leader: v[`tab.${i}.leader`],
  }));
  const [selected, setSelected] = useState(-1);
  const [kind, setKind] = useState("LEFT");
  const [leader, setLeader] = useState("NONE");
  const [pos, setPos] = useState(0);
  const posSpec = form.specs["tabPos@pt"] || {};
  const pick = (index) => {
    setSelected(index);
    const stop = stops[index];
    if (!stop) return;
    setKind(stop.type);
    setLeader(stop.leader);
    setPos(stop.pos);
  };
  return (
    <>
      <Section title="탭 종류">
        <div className="flex flex-wrap items-center gap-x-[1.1em] gap-y-[0.4em]">
          {optionsOf(form, "tabType", tabKindLabels).map(([id, name]) => (
            <Radio key={id} name="tab-kind" checked={kind === id} onChange={() => setKind(id)}>{name}</Radio>
          ))}
        </div>
        <div className="flex flex-wrap gap-x-[1.5em] gap-y-[0.55em]">
          <Row label="채울 모양"><Choice label="채울 모양" value={leader} options={optionsOf(form, "tabLeader", { ...lineShapeLabels, NONE: "선 없음" })} width="12em" icon={(id) => <LineTypeIcon type={id} />} onChange={setLeader} /></Row>
          <Row label="탭 위치">
            <NumberBox label="탭 위치" value={pos} unit={posSpec.unit} digits={posSpec.digits ?? 1} min={posSpec.min ?? 0} max={posSpec.max ?? 100000} onChange={setPos} />
            <button type="button" onClick={() => { form.set("tabAdd", `${pos},${kind},${leader}`); setSelected(-1); }} className="ui-outline h-[var(--ui-h)] rounded-[0.45em] px-[0.9em]">추가</button>
          </Row>
        </div>
      </Section>
      <Section title="탭 목록">
        <div className="flex flex-wrap items-start gap-[0.8em]">
          <div className="h-[8em] w-[16em] overflow-y-auto rounded-[0.45em] shadow-[inset_0_0_0_1px_#e5e5e5]">
            <div className="flex border-b border-[#e5e5e5] px-[0.7em] py-[0.35em] text-[0.85em] text-[#737373]"><span className="flex-1">위치</span><span className="flex-1">종류</span></div>
            {stops.map((stop, index) => (
              <button
                key={`${index}-${stop.pos}`}
                type="button"
                onClick={() => pick(index)}
                aria-pressed={index === selected}
                className="ui-tg flex w-full px-[0.7em] py-[0.25em] text-left text-[0.9em]"
              >
                <span className="flex-1">{stop.pos} {posSpec.unit}</span>
                <span className="flex-1">{tabKindLabels[stop.type] || stop.type}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-[0.45em]">
            <button type="button" disabled={selected < 0} onClick={() => { form.set("tabRemove", selected); setSelected(-1); }} className="ui-outline h-[var(--ui-h)] rounded-[0.45em] px-[0.9em] disabled:text-[#a3a3a3]">지우기</button>
            <button type="button" disabled={!stops.length} onClick={() => { form.set("tabClear", true); setSelected(-1); }} className="ui-outline h-[var(--ui-h)] rounded-[0.45em] px-[0.9em] disabled:text-[#a3a3a3]">모두 지우기</button>
          </div>
        </div>
      </Section>
      <div className="grid grid-cols-1 gap-[1.5em] sm:grid-cols-2">
        <Section title="자동 탭">
          <Check checked={Boolean(v.tabAutoLeft)} onChange={(on) => form.set("tabAutoLeft", on)}>내어쓰기용 자동 탭</Check>
          <Check checked={Boolean(v.tabAutoRight)} onChange={(on) => form.set("tabAutoRight", on)}>문단 오른쪽 끝 자동 탭</Check>
        </Section>
        <Section title="기본 탭">
          <Row label="구역 기본 탭 간격" width="8em"><FieldNumber form={form} name="sectionDefaultTab@pt" label="구역 기본 탭 간격" width="7.2em" /></Row>
        </Section>
      </div>
    </>
  );
}

function ParaDialog({ open, onClose }) {
  const [tab, setTab] = useState("기본");
  const form = useCoreForm(dialogKinds.para, open);
  const v = form.values;
  useEffect(() => {
    if (open) setTab("기본");
  }, [open]);
  const kind = v.headingType || "NONE";

  function apply() {
    const patch = form.patch();
    onClose();
    if (Object.keys(patch).length && typeof window.__chwpApplyFormatDialog === "function") {
      void window.__chwpApplyFormatDialog(dialogKinds.para, patch);
    }
  }

  return (
    <DialogFrame open={open} title="문단 모양" tabs={["기본", "확장", "탭 설정", "테두리/배경"]} tab={tab} onTab={setTab} onApply={apply} onClose={onClose}>
      {tab === "기본" ? (
        <>
          <Section title="일반">
            <Row label="정렬">
              <div role="group" aria-label="정렬" className="flex overflow-hidden rounded-[0.45em] shadow-[inset_0_0_0_1px_#d4d4d4]">
                {optionsOf(form, "align").map(([id], index) => {
                  const [label, Icon] = alignIcons[id] || [id, TextAlignJustify];
                  return (
                    <button
                      key={id}
                      type="button"
                      className={`ui-tg flex h-[var(--ui-h)] w-[2.9em] items-center justify-center ${index ? "border-l border-[#d4d4d4]" : ""}`}
                      aria-label={label}
                      title={label}
                      aria-pressed={v.align === id}
                      onClick={() => form.set("align", id)}
                    >
                      <Icon className="size-[1.05em]" />
                    </button>
                  );
                })}
              </div>
            </Row>
          </Section>
          <div className="grid grid-cols-1 gap-[1.5em] sm:grid-cols-2">
            <Section title="여백">
              <div className="flex flex-col gap-[0.55em]">
                <Row label="왼쪽"><FieldNumber form={form} name="marginLeft@pt" label="왼쪽 여백" /></Row>
                <Row label="오른쪽"><FieldNumber form={form} name="marginRight@pt" label="오른쪽 여백" /></Row>
              </div>
            </Section>
            <Section title="첫 줄">
              <div className="flex flex-col gap-[0.35em]">
                <div className="flex flex-wrap gap-x-[1.1em]">
                  {optionsOf(form, "indentMode", indentLabels).map(([id, text]) => (
                    <Radio key={id} name="para-indent" checked={v.indentMode === id} onChange={() => form.set("indentMode", id)}>{text}</Radio>
                  ))}
                </div>
                <FieldNumber form={form} name="indentValue@pt" label="첫 줄 값" width="7.2em" disabled={v.indentMode === "normal"} />
              </div>
            </Section>
          </div>
          <Section title="간격">
            <div className="flex flex-col gap-[0.55em]">
              <div className="flex flex-wrap items-center gap-[0.55em]">
                <span className="w-[5.2em] flex-none">줄 간격</span>
                <Choice label="줄 간격 종류" value={v.lineSpacingType} options={optionsOf(form, "lineSpacingType", lineSpacingLabels)} width="9.5em" onChange={(type) => form.set("lineSpacingType", type)} />
                <FieldNumber form={form} name="lineSpacingView" label="줄 간격 값" width="9.5em" />
                <Check checked={v.snapToGrid} onChange={(on) => form.set("snapToGrid", on)}>편집 용지의 줄 격자 사용</Check>
              </div>
              <div className="flex flex-wrap gap-x-[1.5em] gap-y-[0.55em]">
                <Row label="문단 위"><FieldNumber form={form} name="spacingPrev@pt" label="문단 위 간격" /></Row>
                <Row label="문단 아래"><FieldNumber form={form} name="spacingNext@pt" label="문단 아래 간격" /></Row>
              </div>
            </div>
          </Section>
          <Section title="줄 나눔 기준">
            <div className="flex flex-wrap gap-x-[1.5em] gap-y-[0.55em]">
              <Row label="한글 단위"><Choice label="한글 단위" value={v.hangulBreak} options={optionsOf(form, "hangulBreak", hangulBreakLabels)} width="8.8em" onChange={(id) => form.set("hangulBreak", id)} /></Row>
              <Row label="영어 단위"><Choice label="영어 단위" value={v.latinBreak} options={optionsOf(form, "latinBreak", latinBreakLabels)} width="8.8em" onChange={(id) => form.set("latinBreak", id)} /></Row>
              <Row label="최소 공백"><FieldNumber form={form} name="condenseMin" label="최소 공백" /></Row>
            </div>
          </Section>
          <CorePreview kind={dialogKinds.para} form={form} height="10em" />
        </>
      ) : null}
      {tab === "확장" ? (
        <>
          <Section title="문단 종류">
            <div className="flex flex-col gap-[0.2em]">
              <Radio name="para-kind" checked={kind === "NONE"} onChange={() => form.set("headingType", "NONE")}>없음</Radio>
              <div className="flex items-center gap-[0.8em]">
                <Radio name="para-kind" checked={kind === "OUTLINE"} onChange={() => form.set("headingType", "OUTLINE")}>개요 문단</Radio>
                <Choice label="개요 수준" value={String(v.headingLevel ?? 0)} options={optionsOf(form, "headingLevel", levelLabels)} width="8.3em" disabled={kind !== "OUTLINE"} onChange={(n) => form.set("headingLevel", Number(n))} />
              </div>
              <div className="flex items-center gap-[0.8em]">
                <Radio name="para-kind" checked={kind === "NUMBER"} onChange={() => form.set("headingType", "NUMBER")}>번호 문단</Radio>
                <Choice label="번호 수준" value={String(v.headingLevel ?? 0)} options={optionsOf(form, "headingLevel", levelLabels)} width="8.3em" disabled={kind !== "NUMBER"} onChange={(n) => form.set("headingLevel", Number(n))} />
              </div>
              <Radio name="para-kind" checked={kind === "BULLET"} onChange={() => form.set("headingType", "BULLET")}>글머리표 문단</Radio>
            </div>
          </Section>
          <Section title="기타">
            <div className="grid grid-cols-1 gap-x-[1.5em] sm:grid-cols-2">
              <Check checked={v.widowOrphan} onChange={(on) => form.set("widowOrphan", on)}>외톨이줄 보호</Check>
              <Check checked={v.keepWithNext} onChange={(on) => form.set("keepWithNext", on)}>다음 문단과 함께</Check>
              <Check checked={v.keepLines} onChange={(on) => form.set("keepLines", on)}>문단 보호</Check>
              <Check checked={v.pageBreakBefore} onChange={(on) => form.set("pageBreakBefore", on)}>문단 앞에서 항상 쪽 나눔</Check>
              <Check checked={v.fontLineHeight} onChange={(on) => form.set("fontLineHeight", on)}>글꼴에 어울리는 줄 높이</Check>
              <Check checked={v.oneLine} onChange={(on) => form.set("oneLine", on)}>한 줄로 입력</Check>
              <Check checked={v.autoSpacingEng} onChange={(on) => form.set("autoSpacingEng", on)}>한글과 영어 간격을 자동 조절</Check>
              <Check checked={v.autoSpacingNum} onChange={(on) => form.set("autoSpacingNum", on)}>한글과 숫자 간격을 자동 조절</Check>
            </div>
            <Row label="세로 정렬"><Choice label="세로 정렬" value={v.vertAlign} options={optionsOf(form, "vertAlign", vertAlignLabels)} width="8.8em" onChange={(id) => form.set("vertAlign", id)} /></Row>
          </Section>
        </>
      ) : null}
      {tab === "탭 설정" ? <TabPanel form={form} /> : null}
      {tab === "테두리/배경" ? (
        <>
          <BorderFillPanel
            prefix="para"
            form={form}
            extra={<Check checked={v.borderConnect} onChange={(on) => form.set("borderConnect", on)}>문단 테두리 연결</Check>}
          />
          <Section title="간격">
            <div className="grid grid-cols-1 gap-[0.55em] sm:grid-cols-2">
              {[["borderOffsetLeft", "왼쪽"], ["borderOffsetRight", "오른쪽"], ["borderOffsetTop", "위쪽"], ["borderOffsetBottom", "아래쪽"]].map(([key, label]) => (
                <Row key={key} label={label}><FieldNumber form={form} name={`${key}@mm`} label={`${label} 간격`} /></Row>
              ))}
            </div>
            <Check checked={v.borderIgnoreMargin} onChange={(on) => form.set("borderIgnoreMargin", on)}>문단 여백 무시</Check>
          </Section>
        </>
      ) : null}
    </DialogFrame>
  );
}

// ---------------------------------------------------------------------------
// 편집 용지(F7). 기본 탭은 용지·방향·제본·여백, 줄 격자 탭은 줄 격자·글자 격자·원고지 정서법이다.
// 폭·길이는 한글처럼 좁게(세로) 놓은 크기이고, 가로면 코어가 눕힌다. 용지 종류·격자 수는 코어가 정한다.

// 큰 아이콘 단추 묶음(용지 방향·제본). 고른 것은 검게 눌린다.
function TileChoice({ label, value, options, onChange }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-[0.6em]">
      {options.map(([id, text, Mark]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-label={text}
          aria-checked={value === id}
          className={`flex w-[4.6em] flex-col items-center gap-[0.35em] rounded-[0.5em] p-[0.4em] ${value === id ? "bg-[#f0f0f0] shadow-[inset_0_0_0_1.5px_#171717]" : "ui-ghost"}`}
          onClick={() => onChange(id)}
        >
          <Mark />
          <span className="text-[0.9em]">{text}</span>
        </button>
      ))}
    </div>
  );
}

function SheetMark({ wide = false, children }) {
  return (
    <svg viewBox="0 0 40 40" className="size-[2.6em]" aria-hidden="true">
      <rect x={wide ? 4 : 9} y={wide ? 9 : 4} width={wide ? 32 : 22} height={wide ? 22 : 32} rx="1.5" fill="#fff" stroke="#525252" strokeWidth="1.4" />
      {children}
    </svg>
  );
}

const lines = (x0, x1, ys) => ys.map((y) => <line key={y} x1={x0} x2={x1} y1={y} y2={y} stroke="#a3a3a3" strokeWidth="1.2" />);
const orientations = [
  ["portrait", "세로", () => <SheetMark>{lines(13, 27, [10, 14, 18, 22, 26, 30])}</SheetMark>],
  ["landscape", "가로", () => <SheetMark wide>{lines(8, 32, [14, 18, 22, 26])}</SheetMark>],
];
const gutterKinds = [
  ["0", "한쪽", () => <SheetMark><rect x="9" y="4" width="5" height="32" fill="#dbeafe" />{lines(16, 27, [10, 15, 20, 25, 30])}</SheetMark>],
  ["1", "맞쪽", () => (
    <svg viewBox="0 0 40 40" className="size-[2.6em]" aria-hidden="true">
      <rect x="3" y="7" width="16" height="26" rx="1.5" fill="#fff" stroke="#525252" strokeWidth="1.4" />
      <rect x="21" y="7" width="16" height="26" rx="1.5" fill="#fff" stroke="#525252" strokeWidth="1.4" />
      <rect x="15" y="7" width="4" height="26" fill="#dbeafe" />
      <rect x="21" y="7" width="4" height="26" fill="#dbeafe" />
    </svg>
  )],
  ["2", "위로", () => <SheetMark><rect x="9" y="4" width="22" height="5" fill="#dbeafe" />{lines(13, 27, [14, 19, 24, 29])}</SheetMark>],
];

// 종이와 본문 칸을 줄여 그린다. 자리(mm)는 코어가 준다. 제본 여백은 파랗게 칠한다(홀수 쪽 기준).
function PagePreview({ v }) {
  const paperW = Number(v.sheetW) || 0;
  const paperH = Number(v.sheetH) || 0;
  if (!paperW || !paperH) return null;
  const scale = 120 / Math.max(paperW, paperH);
  const n = (key) => (Number(v[key]) || 0) * scale;
  const w = paperW * scale;
  const h = paperH * scale;
  const left = n("sheetBodyX");
  const top = n("sheetBodyY");
  const bodyW = Math.max(2, n("sheetBodyW"));
  const bodyH = Math.max(2, n("sheetBodyH"));
  const rows = [];
  for (let y = top + 3; y < top + bodyH - 1; y += 4.5) rows.push(y);
  return (
    <svg viewBox={`-4 -4 ${w + 8} ${h + 8}`} className="h-[9.5em] w-[9.5em]" aria-label="용지 미리보기">
      <rect x="0" y="0" width={w} height={h} fill="#fff" stroke="#525252" strokeWidth="1" />
      {n("sheetGutterW") > 0 && n("sheetGutterH") > 0 && Number(v.marginGutter) > 0
        ? <rect x={n("sheetGutterX")} y={n("sheetGutterY")} width={n("sheetGutterW")} height={n("sheetGutterH")} fill="#dbeafe" />
        : null}
      {rows.map((y) => <line key={y} x1={left} x2={left + bodyW} y1={y} y2={y} stroke="#262626" strokeWidth="1.1" />)}
    </svg>
  );
}

const gridLabels = { none: "격자 설정 안 함", line: "줄 격자 설정", both: "줄 격자와 글자 격자 설정" };
const scopeLabels = { section: "현재 구역", document: "문서 전체" };

// 쪽 테두리/배경(한글 2024 쪽 테두리/배경 대화 상자). 값과 칸 설명, 고른 종류(양쪽·홀수·짝수)의 값은 코어가 준다.
function PageBorderDialog({ open, onClose }) {
  const [tab, setTab] = useState("테두리");
  const form = useCoreForm(dialogKinds.pageBorder, open);
  const v = form.values;
  const [whole, setWhole] = useState(null);
  useEffect(() => {
    if (!open) return;
    setTab("테두리");
    setWhole(null);
  }, [open]);
  const wholeNow = whole ?? !(Number(v.sectionCount) > 1);
  function apply() {
    const patch = { ...form.patch(), which: v.which || "BOTH" };
    onClose();
    if (typeof window.__chwpApplyFormatDialog === "function") void window.__chwpApplyFormatDialog(dialogKinds.pageBorder, patch, wholeNow);
  }
  const gap = (key, label) => (
    <Row label={label}><FieldNumber form={form} name={key} label={`${label} 간격`} width="7em" /></Row>
  );
  const which = (
    <Section title="테두리/배경 종류">
      <Choice label="테두리/배경 종류" value={v.which || "BOTH"} options={optionsOf(form, "which")} width="10em" onChange={(id) => form.set("which", id)} />
    </Section>
  );
  return (
    <DialogFrame open={open} title="쪽 테두리/배경" tabs={["테두리", "배경"]} tab={tab} onTab={setTab} onApply={apply} onClose={onClose}>
      {which}
      {tab === "테두리" ? (
        <>
          <BorderFillPanel prefix="page" form={form} borderOnly />
          <Section title="위치">
            <Choice label="위치 기준" value={v.basis || "PAPER"} options={optionsOf(form, "basis")} width="10em" onChange={(id) => form.set("basis", id)} />
            <div className="flex flex-wrap gap-x-[1.5em] gap-y-[0.45em]">
              {gap("offsetLeft", "왼쪽")}{gap("offsetTop", "위쪽")}{gap("offsetRight", "오른쪽")}{gap("offsetBottom", "아래쪽")}
            </div>
            <div className="flex gap-[1.5em]">
              <Check checked={!!v.headerInside} onChange={(on) => form.set("headerInside", on)}>머리말 포함</Check>
              <Check checked={!!v.footerInside} onChange={(on) => form.set("footerInside", on)}>꼬리말 포함</Check>
            </div>
          </Section>
          <Section title="적용 쪽">
            <Choice label="적용 쪽" value={v.applyPages || "ALL"} options={optionsOf(form, "applyPages")} width="10em" onChange={(id) => form.set("applyPages", id)} />
          </Section>
        </>
      ) : (
        <>
          <BorderFillPanel prefix="page" form={form} fillOnly />
          <Section title="채울 영역">
            <Choice label="채울 영역" value={v.fillArea || "PAPER"} options={optionsOf(form, "fillArea")} width="10em" onChange={(id) => form.set("fillArea", id)} />
          </Section>
        </>
      )}
      <div className="border-t border-[#e5e5e5] pt-[0.8em]">
        <Row label="적용 범위">
          <Choice label="적용 범위" value={wholeNow ? "document" : "section"} options={optionsOf(form, "scope", scopeLabels)} width="10em" onChange={(id) => setWhole(id === "document")} />
        </Row>
      </div>
    </DialogFrame>
  );
}

function PageDialog({ open, onClose }) {
  const [tab, setTab] = useState("기본");
  const form = useCoreForm(dialogKinds.page, open);
  const v = form.values;
  const [whole, setWhole] = useState(null);
  useEffect(() => {
    if (!open) return;
    setTab("기본");
    setWhole(null);
  }, [open]);
  // 적용 범위의 처음 값은 코어가 준다(구역이 하나면 문서 전체).
  const wholeNow = whole ?? !!v.wholeDefault;
  const gridMode = v.gridMode || "none";
  const scope = (
    <Row label="적용 범위">
      <Choice label="적용 범위" value={wholeNow ? "document" : "section"} options={optionsOf(form, "scope", scopeLabels)} width="10em" onChange={(id) => setWhole(id === "document")} />
    </Row>
  );

  function apply() {
    const patch = form.patch();
    onClose();
    if (Object.keys(patch).length) applyPageSetup(patch, wholeNow);
  }

  const margin = (key, label) => (
    <div className="flex items-center gap-[0.5em]">
      <span className="w-[3.4em] flex-none text-right">{label}</span>
      <FieldNumber form={form} name={`${key}@mm`} label={label} width="7.6em" />
    </div>
  );

  return (
    <DialogFrame open={open} title="편집 용지" tabs={["기본", "줄 격자"]} tab={tab} onTab={setTab} onApply={apply} onClose={onClose}>
      {tab === "기본" ? (
        <>
          <Section title="용지 종류">
            <Row label="종류">
              <Choice label="용지 종류" value={v.paperKind} options={optionsOf(form, "paperKind")} width="15em" onChange={(id) => form.set("paperKind", id)} />
            </Row>
            <div className="flex flex-wrap gap-x-[1.5em] gap-y-[0.55em]">
              <Row label="폭"><FieldNumber form={form} name="paperWidth@mm" label="용지 폭" width="7.6em" /></Row>
              <Row label="길이" width="2.6em"><FieldNumber form={form} name="paperHeight@mm" label="용지 길이" width="7.6em" /></Row>
            </div>
          </Section>
          <div className="flex flex-wrap gap-x-[2.5em] gap-y-[1em]">
            <Section title="용지 방향">
              <TileChoice label="용지 방향" value={v.landscape ? "landscape" : "portrait"} options={orientations} onChange={(id) => form.set("landscape", id === "landscape")} />
            </Section>
            <Section title="제본">
              <TileChoice label="제본" value={String(Number(v.gutterType) || 0)} options={gutterKinds} onChange={(id) => form.set("gutterType", Number(id))} />
            </Section>
          </div>
          <Section title="용지 여백">
            <div className="grid grid-cols-[auto_auto_auto] items-center justify-center gap-x-[0.8em] gap-y-[0.45em]">
              <span />
              <div className="flex flex-col items-center gap-[0.45em]">{margin("marginTop", "위쪽")}{margin("marginHeader", "머리말")}</div>
              <span />
              <div className="flex flex-col gap-[0.45em]">{margin("marginLeft", "왼쪽")}{margin("marginGutter", "제본")}</div>
              <div className="flex items-center justify-center rounded-[0.4em] bg-[#f5f5f5] p-[0.4em]"><PagePreview v={v} /></div>
              <div className="flex flex-col gap-[0.45em]">{margin("marginRight", "오른쪽")}</div>
              <span />
              <div className="flex flex-col items-center gap-[0.45em]">{margin("marginFooter", "꼬리말")}{margin("marginBottom", "아래쪽")}</div>
              <span />
            </div>
          </Section>
          <div className="border-t border-[#e5e5e5] pt-[0.8em]">{scope}</div>
        </>
      ) : null}
      {tab === "줄 격자" ? (
        <>
          <div className="flex flex-col gap-[0.2em]">
            {optionsOf(form, "gridMode", gridLabels).map(([id, text]) => (
              <Radio key={id} name="page-grid" checked={gridMode === id} onChange={() => form.set("gridMode", id)}>{text}</Radio>
            ))}
          </div>
          <Section title="줄 수 지정">
            <div className="flex flex-wrap gap-x-[1.5em] gap-y-[0.55em]">
              <Row label="한 쪽의 줄 수" width="7em"><FieldNumber form={form} name="lineCount" label="한 쪽의 줄 수" disabled={gridMode === "none"} /></Row>
              <Row label="줄 간격" width="4.2em"><FieldNumber form={form} name="lineGrid@pt" label="줄 격자 간격" disabled={gridMode === "none"} /></Row>
            </div>
          </Section>
          <Section title="글자 수 지정">
            <div className="flex flex-wrap gap-x-[1.5em] gap-y-[0.55em]">
              <Row label="한 줄당 눈금 수" width="7em"><FieldNumber form={form} name="cellCount" label="한 줄당 눈금 수" disabled={gridMode !== "both"} /></Row>
              <Row label="글자 간격" width="4.2em"><FieldNumber form={form} name="charGrid@pt" label="글자 격자 간격" disabled={gridMode !== "both"} /></Row>
            </div>
            <Check checked={v.wongoji} disabled={gridMode !== "both"} onChange={(on) => form.set("wongoji", on)}>원고지 정서법 적용</Check>
          </Section>
          <div className="border-t border-[#e5e5e5] pt-[0.8em]">{scope}</div>
        </>
      ) : null}
    </DialogFrame>
  );
}

// ---------------------------------------------------------------------------
// 대화 상자 자리. 리본·메뉴·단축키(Alt+L, Alt+T, F7)가 chwp-open-format-dialog 로 연다.

export function FormatDialogs() {
  const [open, setOpen] = useState("");
  const [charLang, setCharLang] = useState("대표");
  const [fonts, setFonts] = useState(() => (Array.isArray(window.__chwpFontList) ? window.__chwpFontList : []));

  useEffect(() => {
    const onList = (event) => {
      if (Array.isArray(event.detail)) setFonts(event.detail);
    };
    window.addEventListener("chwp-font-list", onList);
    return () => window.removeEventListener("chwp-font-list", onList);
  }, []);

  useEffect(() => {
    let alive = true;
    const show = (name) => {
      if (typeof window.__chwpFormatView !== "function") {
        notReady(name === "char" ? "글자 모양" : name === "page" ? "편집 용지" : "문단 모양");
        return;
      }
      if (alive) setOpen(name);
    };
    const onOpen = (event) => {
      const name = event.detail?.name;
      if (name === "char") setCharLang(event.detail?.lang || "대표");
      if (name === "char" || name === "para" || name === "page" || name === "pageBorder") show(name);
      // 단축키가 여는 다른 대화 상자(Ctrl+F·Ctrl+H 찾기, 칸 블록 S 셀 나누기).
      if (name === "find" || name === "replace") openFindDialog();
      if (name === "splitCell") openTableDialog("split");
      if (name === "goTo") openGoToDialog();
      if (name === "bookmark") openBookmarkDialog();
      if (name === "ruby") openRubyDialog();
      if (name === "compose") openComposeDialog();
      if (name === "hyperlink") openHyperlinkDialog();
      if (name === "table") openTableDialog();
      if (name === "picture") pickPicture();
      if (name === "section") openSectionDialog();
      if (name === "headerFooter") openHeaderFooterDialog();
      if (name === "copyShape") openCopyShapeDialog();
      if (name === "rubyEdit") openRubyDialog(true);
      if (name === "composeEdit") openComposeDialog(true);
    };
    window.addEventListener("chwp-open-format-dialog", onOpen);
    return () => {
      alive = false;
      window.removeEventListener("chwp-open-format-dialog", onOpen);
    };
  }, []);

  const close = () => {
    setOpen("");
    window.dispatchEvent(new Event("chwp-focus-editor"));
  };

  return (
    <>
      <CharDialog open={open === "char"} fonts={fonts} onClose={close} startLang={charLang} />
      <ParaDialog open={open === "para"} onClose={close} />
      <PageDialog open={open === "page"} onClose={close} />
      <PageBorderDialog open={open === "pageBorder"} onClose={close} />
      <TableDialog />
      <PageControlDialog />
      <SymbolDialog />
      <HyperlinkDialog />
      <ColumnDialog />
      <GridDialog />
      <MoveGuideDialog />
      <SectionDialog />
      <TablePropertiesDialog />
      <BookmarkDialog />
      <GoToDialog />
      <RubyDialog />
      <ComposeDialog />
      <CaseDialog />
      <WidthDialog />
      <HeaderFooterDialog />
      <CopyShapeDialog />
      <TableToTextDialog />
      <TextToTableDialog />
      <TableFlipDialog />
      <TableSortDialog />
      <TableFormulaDialog />
      <MasterPageDialog />
      <LineNumberDialog />
      <DeletePageDialog />
      <MemoDialog />
      <ProofMarkDialog />
      <BlockCalcDialog />
      <DeleteMarksDialog />
      <NoteShapeDialog />
      <FindDialog />
    </>
  );
}
