import { useEffect, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import {
  AlignHorizontalDistributeCenter,
  AlignHorizontalSpaceBetween,
  ChevronDown,
  ChevronUp,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignJustify,
  TextAlignStart,
  X,
} from "lucide-react";
import { ColorField } from "./ColorPicker.jsx";
import { FontField } from "./FontField.jsx";
import { applyStyle } from "./FormatBar.jsx";
import { notReady, useWide } from "./ui-actions.js";

// 시안(글자 모양·문단 모양 대화 상자). 값 이름과 단위는 코어(formatFields·editStyle)와 같다.
// 길이는 HWPUNIT(1pt = 100)으로 오가고, 화면에서만 pt·mm 로 바꿔 보인다.
// 설정을 누르면 연 뒤 바뀐 값만 코어에 넘긴다.

export function openFormatDialog(name) {
  window.dispatchEvent(new CustomEvent("noting-open-format-dialog", { detail: { name } }));
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

function Choice({ label, value, options, onChange, width = "10em", disabled = false }) {
  return (
    <span className={`relative flex-none ${disabled ? "opacity-50" : ""}`} style={{ width }}>
      <select
        aria-label={label}
        className="ui-outline h-[var(--ui-h)] w-full cursor-pointer appearance-none rounded-[0.45em] pr-[1.8em] pl-[0.6em] outline-none disabled:cursor-default"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}
      </select>
      <ChevronDown aria-hidden="true" className="pointer-events-none absolute top-1/2 right-[0.5em] size-[0.85em] -translate-y-1/2 text-[#737373]" />
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

// 테두리 여섯 칸(위·아래·왼쪽·오른쪽·안쪽·바깥). 아직 문서에 넣지 못해 흐리게 둔다.
function EdgeButtons() {
  const edges = ["위", "아래", "왼쪽", "오른쪽", "모두", "없음"];
  return (
    <div className="flex flex-wrap gap-[0.35em]">
      {edges.map((edge) => (
        <button key={edge} type="button" disabled className="ui-outline size-[2.3em] rounded-[0.4em] text-[0.8em] text-[#a3a3a3]" title={`${edge} 테두리`}>
          {edge}
        </button>
      ))}
    </div>
  );
}

const borderTypes = [["NONE", "없음"], ["SOLID", "실선"], ["DASH", "파선"], ["DOT", "점선"], ["DOUBLE_SLIM", "이중 실선"]];
const borderWidths = [["0.1", "0.1mm"], ["0.12", "0.12mm"], ["0.15", "0.15mm"], ["0.2", "0.2mm"], ["0.3", "0.3mm"], ["0.4", "0.4mm"], ["0.5", "0.5mm"]];
const patternTypes = [["NONE", "없음"], ["HORIZONTAL", "가로줄"], ["VERTICAL", "세로줄"], ["CROSS", "격자"]];

function BorderFillPanel({ extra }) {
  return (
    <>
      <Section title="테두리" note="테두리·배경은 아직 준비 중이에요. 지금은 문서에 들어가지 않아요.">
        <div className="flex flex-wrap items-start gap-[1.5em]">
          <div className="flex flex-col gap-[0.55em]">
            <Row label="종류"><Choice label="테두리 종류" value="NONE" options={borderTypes} onChange={() => {}} disabled /></Row>
            <Row label="굵기"><Choice label="테두리 굵기" value="0.1" options={borderWidths} onChange={() => {}} disabled /></Row>
            <Row label="색"><ColorField label="테두리 색" value="#0a0a0a" onChange={() => {}} disabled /></Row>
            {extra}
          </div>
          <EdgeButtons />
        </div>
      </Section>
      <Section title="배경">
        <div className="flex flex-col gap-[0.55em]">
          <Row label="면 색"><ColorField label="면 색" value="" allowNone noneLabel="면 색 없음" onChange={() => {}} disabled /></Row>
          <Row label="무늬 색"><ColorField label="무늬 색" value="#a3a3a3" onChange={() => {}} disabled /></Row>
          <Row label="무늬 모양"><Choice label="무늬 모양" value="NONE" options={patternTypes} onChange={() => {}} disabled /></Row>
        </div>
      </Section>
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

// 연 뒤 바뀐 값만 고른다.
function changedFields(initial, values) {
  const out = {};
  for (const [key, value] of Object.entries(values)) {
    if (initial[key] !== value) out[key] = value;
  }
  return out;
}

const previewText = "한글Eng123漢字あいう※☉";

// ---------------------------------------------------------------------------
// 글자 모양

const charAttrs = [
  { key: "bold", label: "진하게", glyph: <b>가</b> },
  { key: "italic", label: "기울임", glyph: <i>가</i> },
  { key: "underline", label: "밑줄", glyph: <u>가</u> },
  { key: "strikeout", label: "취소선", glyph: <s>가</s> },
  { key: "outline", label: "외곽선", glyph: <span style={{ color: "#ffffff", WebkitTextStroke: "1px #0a0a0a" }}>가</span> },
  { key: "shadow", label: "그림자", glyph: <span style={{ textShadow: "2px 2px 0 #a3a3a3" }}>가</span> },
  { key: "emboss", label: "양각", glyph: <span style={{ textShadow: "-1px -1px 0 #ffffff, 1px 1px 0 #737373" }}>가</span> },
  { key: "engrave", label: "음각", glyph: <span style={{ textShadow: "1px 1px 0 #ffffff, -1px -1px 0 #737373" }}>가</span> },
  { key: "superscript", label: "위 첨자", glyph: <span>가<sup className="text-[0.6em]">가</sup></span> },
  { key: "subscript", label: "아래 첨자", glyph: <span>가<sub className="text-[0.6em]">가</sub></span> },
  { key: "plain", label: "보통 모양", glyph: <span>가</span> },
];

const underlinePlaces = [["NONE", "없음"], ["BOTTOM", "아래쪽"], ["TOP", "위쪽"]];
const lineShapes = [
  ["SOLID", "실선"], ["DASH", "파선"], ["DOT", "점선"], ["DASH_DOT", "일점쇄선"], ["DASH_DOT_DOT", "이점쇄선"],
  ["LONG_DASH", "긴 파선"], ["CIRCLE", "원형 점선"], ["DOUBLE_SLIM", "이중 실선"], ["SLIM_THICK", "얇고 굵은 이중선"],
  ["THICK_SLIM", "굵고 얇은 이중선"], ["SLIM_THICK_SLIM", "얇고 굵고 얇은 삼중선"], ["WAVE", "물결"], ["DOUBLE_WAVE", "이중 물결"],
];
const outlineKinds = [["0", "없음"], ["1", "실선"], ["2", "점선"], ["3", "굵은 실선"], ["4", "파선"], ["5", "일점쇄선"], ["6", "이점쇄선"]];
const emphasisKinds = [["0", "없음"], ["1", "●"], ["2", "○"], ["3", "ˇ"], ["4", "˜"], ["5", "･"], ["6", ":"]];

function attrOn(values, key) {
  if (key === "underline") return values.underlineType && values.underlineType !== "NONE";
  if (key === "outline" || key === "shadow") return Number(values[key]) > 0;
  if (key === "plain") return false;
  return !!values[key];
}

function toggleAttr(values, key) {
  if (key === "plain") {
    return {
      ...values,
      bold: false, italic: false, underlineType: "NONE", strikeout: false, outline: 0, shadow: 0,
      emboss: false, engrave: false, superscript: false, subscript: false,
    };
  }
  const on = !attrOn(values, key);
  if (key === "underline") return { ...values, underlineType: on ? "BOTTOM" : "NONE" };
  if (key === "outline" || key === "shadow") return { ...values, [key]: on ? 1 : 0 };
  const next = { ...values, [key]: on };
  if (on && key === "emboss") next.engrave = false;
  if (on && key === "engrave") next.emboss = false;
  if (on && key === "superscript") next.subscript = false;
  if (on && key === "subscript") next.superscript = false;
  return next;
}

function CharPreview({ values }) {
  const decorations = [];
  if (values.underlineType && values.underlineType !== "NONE") decorations.push(values.underlineType === "TOP" ? "overline" : "underline");
  if (values.strikeout) decorations.push("line-through");
  const shadows = [];
  if (Number(values.shadow) > 0) shadows.push(`${(Number(values.shadowOffsetX) || 10) / 10}px ${(Number(values.shadowOffsetY) || 10) / 10}px 0 ${values.shadowColor || "#b2b2b2"}`);
  if (values.emboss) shadows.push("-1px -1px 0 #ffffff, 1px 1px 0 #737373");
  if (values.engrave) shadows.push("1px 1px 0 #ffffff, -1px -1px 0 #737373");
  const size = Math.min(40, Math.max(8, ((Number(values.fontSize) || 1000) / 100) * 1.6 * ((Number(values.relSize) || 100) / 100)));
  return (
    <div aria-label="미리보기" className="h-[6.6em] overflow-hidden rounded-[0.45em] bg-[#fafafa] px-[0.9em] py-[0.75em] shadow-[inset_0_0_0_1px_#e5e5e5]">
      <div className="flex h-full items-end whitespace-nowrap">
        <span
          style={{
            fontFamily: `"${values.font}", "Noto Serif KR", serif`,
            fontSize: size,
            fontWeight: values.bold ? 700 : 400,
            fontStyle: values.italic ? "italic" : "normal",
            textDecoration: decorations.join(" ") || "none",
            color: values.color || "#000000",
            background: values.shadeColor || "transparent",
            letterSpacing: `${(Number(values.spacing) || 0) / 100}em`,
            display: "inline-block",
            transform: `scaleX(${(Number(values.ratio) || 100) / 100}) translateY(${-(Number(values.charOffset) || 0) / 100}em)`,
            transformOrigin: "left bottom",
            textShadow: shadows.join(", ") || "none",
            WebkitTextStroke: Number(values.outline) > 0 ? "1px currentColor" : undefined,
            verticalAlign: values.superscript ? "super" : values.subscript ? "sub" : "baseline",
          }}
        >
          {previewText}
        </span>
      </div>
    </div>
  );
}

function CharDialog({ open, fields, fonts, onClose }) {
  const [tab, setTab] = useState("기본");
  const [values, setValues] = useState(fields);
  useEffect(() => {
    if (open) {
      setValues(fields);
      setTab("기본");
    }
  }, [open, fields]);
  const set = (key, value) => setValues((current) => ({ ...current, [key]: value }));
  const v = values || {};

  function apply() {
    const diff = changedFields(fields, values);
    onClose();
    if (Object.keys(diff).length) applyStyle(diff);
  }

  return (
    <DialogFrame open={open} title="글자 모양" tabs={["기본", "확장", "테두리/배경"]} tab={tab} onTab={setTab} onApply={apply} onClose={onClose}>
      {tab === "기본" ? (
        <>
          <Row label="기준 크기">
            <NumberBox label="기준 크기" value={(Number(v.fontSize) || 1000) / 100} unit="pt" step={1} digits={1} min={1} max={4096} onChange={(pt) => set("fontSize", Math.round(pt * 100))} />
          </Row>
          <Section title="언어별 설정">
            <div className="flex flex-col gap-[0.55em]">
              <Row label="언어">
                <Choice label="언어" value="대표" options={[["대표", "대표"], ["한글", "한글"], ["영문", "영문"], ["한자", "한자"], ["일어", "일어"], ["외국어", "외국어"], ["기호", "기호"], ["사용자", "사용자"]]} width="8.3em" onChange={(lang) => { if (lang !== "대표") notReady("언어별 글자 모양"); }} />
              </Row>
              <Row label="글꼴">
                <FontField value={v.font || ""} fonts={fonts} className="w-[16.5em]" layer="z-[90]" onPick={(font) => set("font", font)} />
              </Row>
              <div className="grid grid-cols-1 gap-[0.55em] sm:grid-cols-2">
                <Row label="상대크기"><NumberBox label="상대크기" value={v.relSize ?? 100} unit="%" min={10} max={250} onChange={(n) => set("relSize", n)} /></Row>
                <Row label="글자 위치"><NumberBox label="글자 위치" value={v.charOffset ?? 0} unit="%" min={-100} max={100} onChange={(n) => set("charOffset", n)} /></Row>
                <Row label="장평"><NumberBox label="장평" value={v.ratio ?? 100} unit="%" min={50} max={200} onChange={(n) => set("ratio", n)} /></Row>
                <Row label="자간"><NumberBox label="자간" value={v.spacing ?? 0} unit="%" min={-50} max={50} onChange={(n) => set("spacing", n)} /></Row>
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
                    aria-pressed={attrOn(v, item.key)}
                    onClick={() => setValues((current) => toggleAttr(current, item.key))}
                  >
                    {item.glyph}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap gap-x-[1.5em] gap-y-[0.55em]">
                <Row label="글자 색"><ColorField label="글자 색" value={v.color} onChange={(hex) => set("color", hex || "#000000")} /></Row>
                <Row label="음영 색"><ColorField label="음영 색" value={v.shadeColor} allowNone noneLabel="음영 색 없음" onChange={(hex) => set("shadeColor", hex)} /></Row>
              </div>
            </div>
          </Section>
          <CharPreview values={v} />
        </>
      ) : null}
      {tab === "확장" ? (
        <>
          <Section title="그림자">
            <div className="flex flex-col gap-[0.55em]">
              <div className="flex flex-wrap items-center gap-[1.1em]">
                {[["0", "없음"], ["1", "비연속"], ["2", "연속"]].map(([id, text]) => (
                  <Radio key={id} name="char-shadow" checked={String(v.shadow ?? 0) === id} onChange={() => set("shadow", Number(id))}>{text}</Radio>
                ))}
              </div>
              <div className="flex flex-wrap gap-x-[1.5em] gap-y-[0.55em]">
                <Row label="X 방향"><NumberBox label="X 방향" value={v.shadowOffsetX ?? 10} unit="%" min={-100} max={100} width="7.2em" disabled={!Number(v.shadow)} onChange={(n) => set("shadowOffsetX", n)} /></Row>
                <Row label="Y 방향"><NumberBox label="Y 방향" value={v.shadowOffsetY ?? 10} unit="%" min={-100} max={100} width="7.2em" disabled={!Number(v.shadow)} onChange={(n) => set("shadowOffsetY", n)} /></Row>
                <Row label="색"><ColorField label="그림자 색" value={v.shadowColor || "#b2b2b2"} disabled={!Number(v.shadow)} onChange={(hex) => set("shadowColor", hex || "#b2b2b2")} /></Row>
              </div>
            </div>
          </Section>
          <div className="grid grid-cols-1 gap-[1.5em] sm:grid-cols-2">
            <Section title="밑줄">
              <div className="flex flex-col gap-[0.55em]">
                <Row label="위치"><Choice label="밑줄 위치" value={v.underlineType || "NONE"} options={underlinePlaces} onChange={(id) => set("underlineType", id)} /></Row>
                <Row label="모양"><Choice label="밑줄 모양" value={v.underlineShape || "SOLID"} options={lineShapes} onChange={(id) => set("underlineShape", id)} /></Row>
                <Row label="색"><ColorField label="밑줄 색" value={v.underlineColor} allowNone noneLabel="글자 색과 같음" onChange={(hex) => set("underlineColor", hex)} /></Row>
              </div>
            </Section>
            <Section title="취소선">
              <div className="flex flex-col gap-[0.55em]">
                <Row label="모양">
                  <Choice
                    label="취소선 모양"
                    value={v.strikeout ? (v.strikeShape || "SOLID") : "NONE"}
                    options={[["NONE", "없음"], ...lineShapes]}
                    onChange={(id) => setValues((current) => (id === "NONE" ? { ...current, strikeout: false } : { ...current, strikeout: true, strikeShape: id }))}
                  />
                </Row>
                <Row label="색"><ColorField label="취소선 색" value={v.strikeColor} allowNone noneLabel="글자 색과 같음" onChange={(hex) => set("strikeColor", hex)} /></Row>
              </div>
            </Section>
          </div>
          <Section title="기타">
            <div className="grid grid-cols-1 gap-[1.5em] sm:grid-cols-2">
              <div className="flex flex-col gap-[0.55em]">
                <Row label="외곽선"><Choice label="외곽선" value={String(v.outline ?? 0)} options={outlineKinds} onChange={(id) => set("outline", Number(id))} /></Row>
                <Row label="강조점"><Choice label="강조점" value={String(v.emphasis ?? 0)} options={emphasisKinds} onChange={(id) => set("emphasis", Number(id))} /></Row>
              </div>
              <div className="flex flex-col gap-[0.2em]">
                <Check checked={v.useFontSpace} onChange={(on) => set("useFontSpace", on)}>글꼴에 어울리는 빈칸</Check>
                <Check checked={v.useKerning} onChange={(on) => set("useKerning", on)}>커닝</Check>
              </div>
            </div>
          </Section>
          <CharPreview values={v} />
        </>
      ) : null}
      {tab === "테두리/배경" ? <BorderFillPanel /> : null}
    </DialogFrame>
  );
}

// ---------------------------------------------------------------------------
// 문단 모양

const aligns = [
  ["JUSTIFY", "양쪽 정렬", TextAlignJustify],
  ["LEFT", "왼쪽 정렬", TextAlignStart],
  ["CENTER", "가운데 정렬", TextAlignCenter],
  ["RIGHT", "오른쪽 정렬", TextAlignEnd],
  ["DISTRIBUTE", "배분 정렬", AlignHorizontalDistributeCenter],
  ["DISTRIBUTE_SPACE", "나눔 정렬", AlignHorizontalSpaceBetween],
];
const lineSpacingTypes = [["PERCENT", "글자에 따라"], ["FIXED", "고정 값"], ["BETWEEN_LINES", "여백만 지정"], ["AT_LEAST", "최소"]];
const hangulBreaks = [["KEEP_WORD", "어절"], ["BREAK_WORD", "글자"]];
const latinBreaks = [["KEEP_WORD", "단어"], ["HYPHENATION", "하이픈"], ["BREAK_WORD", "글자"]];
const vertAligns = [["BASELINE", "글꼴 기준"], ["TOP", "위쪽"], ["CENTER", "가운데"], ["BOTTOM", "아래쪽"]];

const huPerMm = 7200 / 25.4;
const pt = (hu) => (Number(hu) || 0) / 100;
const mm = (hu) => (Number(hu) || 0) / huPerMm;

function ParaPreview({ values }) {
  const scale = 0.45;
  const percent = values.lineSpacingType === "PERCENT";
  const lineHeight = percent ? `${(Number(values.lineSpacing) || 160) / 100}` : `${Math.max(10, pt(values.lineSpacing) * 1.333 * scale + 9)}px`;
  const align = { JUSTIFY: "justify", LEFT: "left", CENTER: "center", RIGHT: "right", DISTRIBUTE: "justify", DISTRIBUTE_SPACE: "justify" }[values.align] || "justify";
  const px = (hu) => pt(hu) * 1.333 * scale;
  const muted = "text-[#a3a3a3]";
  return (
    <div aria-label="미리보기" className="flex h-[10em] flex-col gap-[0.3em] overflow-hidden rounded-[0.45em] bg-[#fafafa] px-[0.9em] py-[0.75em] text-[0.72em] leading-[1.5] shadow-[inset_0_0_0_1px_#e5e5e5]">
      <p className={muted}>이전 문단 이전 문단 이전 문단 이전 문단 이전 문단 이전 문단 이전 문단</p>
      <p
        style={{
          textAlign: align,
          textAlignLast: values.align === "DISTRIBUTE" || values.align === "DISTRIBUTE_SPACE" ? "justify" : undefined,
          marginLeft: px(values.marginLeft),
          marginRight: px(values.marginRight),
          textIndent: px(values.indent),
          paddingLeft: Number(values.indent) < 0 ? -px(values.indent) : 0,
          marginTop: px(values.spacingPrev),
          marginBottom: px(values.spacingNext),
          lineHeight,
        }}
      >
        가나다라AaBbCc12345 가나다라AaBbCc12345 가나다라AaBbCc12345 가나다라AaBbCc12345 가나다라AaBbCc12345
      </p>
      <p className={muted}>다음 문단 다음 문단 다음 문단 다음 문단 다음 문단 다음 문단 다음 문단</p>
    </div>
  );
}

function ParaDialog({ open, fields, onClose }) {
  const [tab, setTab] = useState("기본");
  const [values, setValues] = useState(fields);
  useEffect(() => {
    if (open) {
      setValues(fields);
      setTab("기본");
    }
  }, [open, fields]);
  const set = (key, value) => setValues((current) => ({ ...current, [key]: value }));
  const v = values || {};
  const indent = Number(v.indent) || 0;
  const indentMode = indent > 0 ? "in" : indent < 0 ? "out" : "normal";
  const percent = (v.lineSpacingType || "PERCENT") === "PERCENT";

  function apply() {
    const diff = changedFields(fields, values);
    onClose();
    if (Object.keys(diff).length) applyStyle(diff);
  }

  return (
    <DialogFrame open={open} title="문단 모양" tabs={["기본", "확장", "탭 설정", "테두리/배경"]} tab={tab} onTab={setTab} onApply={apply} onClose={onClose}>
      {tab === "기본" ? (
        <>
          <Section title="일반">
            <Row label="정렬">
              <div role="group" aria-label="정렬" className="flex overflow-hidden rounded-[0.45em] shadow-[inset_0_0_0_1px_#d4d4d4]">
                {aligns.map(([id, label, Icon], index) => (
                  <button
                    key={id}
                    type="button"
                    className={`ui-tg flex h-[var(--ui-h)] w-[2.9em] items-center justify-center ${index ? "border-l border-[#d4d4d4]" : ""}`}
                    aria-label={label}
                    title={label}
                    aria-pressed={(v.align || "JUSTIFY") === id}
                    onClick={() => set("align", id)}
                  >
                    <Icon className="size-[1.05em]" />
                  </button>
                ))}
              </div>
            </Row>
          </Section>
          <div className="grid grid-cols-1 gap-[1.5em] sm:grid-cols-2">
            <Section title="여백">
              <div className="flex flex-col gap-[0.55em]">
                <Row label="왼쪽"><NumberBox label="왼쪽 여백" value={pt(v.marginLeft)} unit="pt" digits={1} onChange={(n) => set("marginLeft", Math.round(n * 100))} /></Row>
                <Row label="오른쪽"><NumberBox label="오른쪽 여백" value={pt(v.marginRight)} unit="pt" digits={1} onChange={(n) => set("marginRight", Math.round(n * 100))} /></Row>
              </div>
            </Section>
            <Section title="첫 줄">
              <div className="flex flex-col gap-[0.35em]">
                <div className="flex flex-wrap gap-x-[1.1em]">
                  <Radio name="para-indent" checked={indentMode === "normal"} onChange={() => set("indent", 0)}>보통</Radio>
                  <Radio name="para-indent" checked={indentMode === "in"} onChange={() => set("indent", Math.abs(indent) || 1000)}>들여쓰기</Radio>
                  <Radio name="para-indent" checked={indentMode === "out"} onChange={() => set("indent", -(Math.abs(indent) || 1000))}>내어쓰기</Radio>
                </div>
                <NumberBox
                  label="첫 줄 값"
                  value={pt(Math.abs(indent))}
                  unit="pt"
                  digits={1}
                  min={0}
                  width="7.2em"
                  disabled={indentMode === "normal"}
                  onChange={(n) => set("indent", (indentMode === "out" ? -1 : 1) * Math.round(n * 100))}
                />
              </div>
            </Section>
          </div>
          <Section title="간격">
            <div className="flex flex-col gap-[0.55em]">
              <div className="flex flex-wrap items-center gap-[0.55em]">
                <span className="w-[5.2em] flex-none">줄 간격</span>
                <Choice
                  label="줄 간격 종류"
                  value={v.lineSpacingType || "PERCENT"}
                  options={lineSpacingTypes}
                  width="9.5em"
                  onChange={(type) => setValues((current) => ({ ...current, lineSpacingType: type, lineSpacing: type === "PERCENT" ? 160 : type === "BETWEEN_LINES" ? 0 : 1000 }))}
                />
                <NumberBox
                  label="줄 간격 값"
                  value={percent ? Number(v.lineSpacing) || 160 : pt(v.lineSpacing)}
                  unit={percent ? "%" : "pt"}
                  digits={percent ? 0 : 1}
                  step={percent ? 10 : 1}
                  min={0}
                  width="9.5em"
                  onChange={(n) => set("lineSpacing", percent ? Math.round(n) : Math.round(n * 100))}
                />
                <Check checked={v.snapToGrid} onChange={(on) => set("snapToGrid", on)}>편집 용지의 줄 격자 사용</Check>
              </div>
              <div className="flex flex-wrap gap-x-[1.5em] gap-y-[0.55em]">
                <Row label="문단 위"><NumberBox label="문단 위 간격" value={pt(v.spacingPrev)} unit="pt" digits={1} onChange={(n) => set("spacingPrev", Math.round(n * 100))} /></Row>
                <Row label="문단 아래"><NumberBox label="문단 아래 간격" value={pt(v.spacingNext)} unit="pt" digits={1} onChange={(n) => set("spacingNext", Math.round(n * 100))} /></Row>
              </div>
            </div>
          </Section>
          <Section title="줄 나눔 기준">
            <div className="flex flex-wrap gap-x-[1.5em] gap-y-[0.55em]">
              <Row label="한글 단위"><Choice label="한글 단위" value={v.breakNonLatinWord || "KEEP_WORD"} options={hangulBreaks} width="8.8em" onChange={(id) => set("breakNonLatinWord", id)} /></Row>
              <Row label="영어 단위"><Choice label="영어 단위" value={v.breakLatinWord || "KEEP_WORD"} options={latinBreaks} width="8.8em" onChange={(id) => set("breakLatinWord", id)} /></Row>
              <Row label="최소 공백"><NumberBox label="최소 공백" value={100 - (Number(v.condense) || 0)} unit="%" min={25} max={100} onChange={(n) => set("condense", 100 - Math.round(n))} /></Row>
            </div>
          </Section>
          <ParaPreview values={v} />
        </>
      ) : null}
      {tab === "확장" ? (
        <>
          <Section title="문단 종류" note="문단 종류 바꾸기는 아직 준비 중이에요.">
            <div className="flex flex-col gap-[0.2em]">
              <Radio name="para-kind" checked={false} disabled onChange={() => {}}>없음</Radio>
              <div className="flex items-center gap-[0.8em]">
                <Radio name="para-kind" checked={false} disabled onChange={() => {}}>개요 문단</Radio>
                <Choice label="개요 수준" value="1" options={[["1", "1 수준"]]} width="8.3em" disabled onChange={() => {}} />
              </div>
              <div className="flex items-center gap-[0.8em]">
                <Radio name="para-kind" checked={false} disabled onChange={() => {}}>번호 문단</Radio>
                <Choice label="번호 수준" value="1" options={[["1", "1 수준"]]} width="8.3em" disabled onChange={() => {}} />
              </div>
              <Radio name="para-kind" checked={false} disabled onChange={() => {}}>글머리표 문단</Radio>
            </div>
          </Section>
          <Section title="기타">
            <div className="grid grid-cols-1 gap-x-[1.5em] sm:grid-cols-2">
              <Check checked={v.widowOrphan} onChange={(on) => set("widowOrphan", on)}>외톨이줄 보호</Check>
              <Check checked={v.keepWithNext} onChange={(on) => set("keepWithNext", on)}>다음 문단과 함께</Check>
              <Check checked={v.keepLines} onChange={(on) => set("keepLines", on)}>문단 보호</Check>
              <Check checked={v.pageBreakBefore} onChange={(on) => set("pageBreakBefore", on)}>문단 앞에서 항상 쪽 나눔</Check>
              <Check checked={v.fontLineHeight} onChange={(on) => set("fontLineHeight", on)}>글꼴에 어울리는 줄 높이</Check>
              <Check checked={v.lineWrap === "SQUEEZE"} onChange={(on) => set("lineWrap", on ? "SQUEEZE" : "BREAK")}>한 줄로 입력</Check>
              <Check checked={v.autoSpacingEng} onChange={(on) => set("autoSpacingEng", on)}>한글과 영어 간격을 자동 조절</Check>
              <Check checked={v.autoSpacingNum} onChange={(on) => set("autoSpacingNum", on)}>한글과 숫자 간격을 자동 조절</Check>
            </div>
            <Row label="세로 정렬"><Choice label="세로 정렬" value={v.vertAlign || "BASELINE"} options={vertAligns} width="8.8em" onChange={(id) => set("vertAlign", id)} /></Row>
          </Section>
        </>
      ) : null}
      {tab === "탭 설정" ? (
        <>
          <Section title="탭 종류" note="탭 설정은 아직 준비 중이에요.">
            <div className="flex flex-wrap items-center gap-x-[1.1em] gap-y-[0.4em]">
              {["왼쪽", "오른쪽", "가운데", "소수점"].map((name, index) => (
                <Radio key={name} name="tab-kind" checked={index === 0} disabled onChange={() => {}}>{name}</Radio>
              ))}
            </div>
            <div className="flex flex-wrap gap-x-[1.5em] gap-y-[0.55em]">
              <Row label="채울 모양"><Choice label="채울 모양" value="NONE" options={[["NONE", "없음"]]} disabled onChange={() => {}} /></Row>
              <Row label="탭 위치">
                <NumberBox label="탭 위치" value={0} unit="pt" digits={1} disabled onChange={() => {}} />
                <button type="button" disabled className="ui-outline h-[var(--ui-h)] rounded-[0.45em] px-[0.9em] text-[#a3a3a3]">추가</button>
              </Row>
            </div>
          </Section>
          <Section title="탭 목록">
            <div className="flex flex-wrap items-start gap-[0.8em]">
              <div className="h-[8em] w-[16em] rounded-[0.45em] shadow-[inset_0_0_0_1px_#e5e5e5]">
                <div className="flex border-b border-[#e5e5e5] px-[0.7em] py-[0.35em] text-[0.85em] text-[#737373]"><span className="flex-1">위치</span><span className="flex-1">종류</span></div>
              </div>
              <div className="flex flex-col gap-[0.45em]">
                <button type="button" disabled className="ui-outline h-[var(--ui-h)] rounded-[0.45em] px-[0.9em] text-[#a3a3a3]">지우기</button>
                <button type="button" disabled className="ui-outline h-[var(--ui-h)] rounded-[0.45em] px-[0.9em] text-[#a3a3a3]">모두 지우기</button>
              </div>
            </div>
          </Section>
          <div className="grid grid-cols-1 gap-[1.5em] sm:grid-cols-2">
            <Section title="자동 탭">
              <Check checked={false} disabled onChange={() => {}}>내어쓰기용 자동 탭</Check>
              <Check checked={false} disabled onChange={() => {}}>문단 오른쪽 끝 자동 탭</Check>
            </Section>
            <Section title="기본 탭">
              <Row label="구역 기본 탭 간격" width="8em">
                <NumberBox label="구역 기본 탭 간격" value={40} unit="pt" digits={1} width="7.2em" disabled onChange={() => {}} />
              </Row>
            </Section>
          </div>
        </>
      ) : null}
      {tab === "테두리/배경" ? (
        <>
          <BorderFillPanel
            extra={(
              <>
                <Check checked={v.borderConnect} onChange={(on) => set("borderConnect", on)}>문단 테두리 연결</Check>
                <Check checked={false} disabled onChange={() => {}}>선 모양 바로 적용</Check>
              </>
            )}
          />
          <Section title="간격">
            <div className="grid grid-cols-1 gap-[0.55em] sm:grid-cols-2">
              {[["borderOffsetLeft", "왼쪽"], ["borderOffsetRight", "오른쪽"], ["borderOffsetTop", "위쪽"], ["borderOffsetBottom", "아래쪽"]].map(([key, label]) => (
                <Row key={key} label={label}>
                  <NumberBox label={`${label} 간격`} value={Math.round(mm(v[key]) * 100) / 100} unit="mm" step={0.5} digits={2} min={0} onChange={(n) => set(key, Math.round(n * huPerMm))} />
                </Row>
              ))}
            </div>
            <Check checked={v.borderIgnoreMargin} onChange={(on) => set("borderIgnoreMargin", on)}>문단 여백 무시</Check>
          </Section>
        </>
      ) : null}
    </DialogFrame>
  );
}

// ---------------------------------------------------------------------------
// 대화 상자 자리. 리본·메뉴·단축키(Alt+L, Alt+T)가 noting-open-format-dialog 로 연다.

export function FormatDialogs() {
  const [open, setOpen] = useState("");
  const [fields, setFields] = useState({});
  const [fonts, setFonts] = useState(() => (Array.isArray(window.__notingFontList) ? window.__notingFontList : []));

  useEffect(() => {
    const onList = (event) => {
      if (Array.isArray(event.detail)) setFonts(event.detail);
    };
    window.addEventListener("noting-font-list", onList);
    return () => window.removeEventListener("noting-font-list", onList);
  }, []);

  useEffect(() => {
    let alive = true;
    const show = async (name) => {
      if (typeof window.__notingFormatFields !== "function") return;
      try {
        const next = await window.__notingFormatFields();
        if (!alive || !next) return;
        setFields(next);
        setOpen(name);
      } catch {
        notReady(name === "char" ? "글자 모양" : "문단 모양");
      }
    };
    const onOpen = (event) => {
      const name = event.detail?.name;
      if (name === "char" || name === "para") void show(name);
    };
    // 한글처럼 Alt+L 은 글자 모양, Alt+T 는 문단 모양이다. 편집 입력 칸에 들어가기 전에 가로챈다.
    const onKey = (event) => {
      if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      const key = event.code === "KeyL" ? "char" : event.code === "KeyT" ? "para" : "";
      if (!key) return;
      event.preventDefault();
      event.stopPropagation();
      void show(key);
    };
    window.addEventListener("noting-open-format-dialog", onOpen);
    window.addEventListener("keydown", onKey, true);
    return () => {
      alive = false;
      window.removeEventListener("noting-open-format-dialog", onOpen);
      window.removeEventListener("keydown", onKey, true);
    };
  }, []);

  const close = () => {
    setOpen("");
    window.dispatchEvent(new Event("noting-focus-editor"));
  };

  return (
    <>
      <CharDialog open={open === "char"} fields={fields} fonts={fonts} onClose={close} />
      <ParaDialog open={open === "para"} fields={fields} onClose={close} />
    </>
  );
}
