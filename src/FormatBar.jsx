import { useEffect, useRef, useState } from "react";
import { Popover as PopoverPrimitive, Select as SelectPrimitive } from "radix-ui";
import {
  AlignHorizontalDistributeCenter,
  AlignHorizontalSpaceBetween,
  Check,
  ChevronDown,
  ChevronUp,
  TriangleAlert,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignJustify,
  TextAlignStart,
} from "lucide-react";
import { FontField } from "@/FontField";
import { notReady } from "@/ui-actions";
import { ColorPopover } from "@/ColorPicker";

const aligns = [
  { id: "JUSTIFY", label: "양쪽 정렬", Icon: TextAlignJustify },
  { id: "LEFT", label: "왼쪽 정렬", Icon: TextAlignStart },
  { id: "CENTER", label: "가운데 정렬", Icon: TextAlignCenter },
  { id: "RIGHT", label: "오른쪽 정렬", Icon: TextAlignEnd },
  { id: "DISTRIBUTE", label: "배분 정렬", Icon: AlignHorizontalDistributeCenter },
  { id: "DISTRIBUTE_SPACE", label: "나눔 정렬", Icon: AlignHorizontalSpaceBetween },
];

// 시안(팝오버 · 선택 목록)의 목록. 줄 높이 44px, 고른 줄 오른쪽에 체크를 둔다.
function PickList({ value, onValueChange, items, label, triggerClass, children, width = 196 }) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onValueChange}>
      <SelectPrimitive.Trigger className={triggerClass} aria-label={label}>
        {children}
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          align="start"
          sideOffset={6}
          className="toolbar-ui ui-chrome ui-pop z-[60] rounded-lg p-1"
          style={{ width }}
        >
          <SelectPrimitive.Viewport>
            {items.map((item) => (
              <SelectPrimitive.Item
                key={item.id}
                value={item.id}
                className="flex h-11 cursor-pointer items-center rounded-[6px] px-2 outline-none select-none data-[highlighted]:bg-[#f5f5f5] data-[state=checked]:bg-[#f5f5f5]"
              >
                <SelectPrimitive.ItemText>{item.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="ml-auto">
                  <Check className="size-[18px] text-[#171717]" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

const underlineTypes = [
  { id: "NONE", label: "없음" },
  { id: "BOTTOM", label: "아래선" },
  { id: "TOP", label: "위선" },
  { id: "CENTER", label: "가운데선" },
];

const strikeTypes = [
  { id: "NONE", label: "없음" },
  { id: "SINGLE", label: "취소선" },
];

function hexColor(value) {
  const text = String(value || "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(text)) return text.toLowerCase();
  return "#000000";
}

const sizeUnits = [
  { id: "pt", label: "포인트(pt)" },
  { id: "mm", label: "밀리미터(mm)" },
  { id: "cm", label: "센티미터(cm)" },
  { id: "inch", label: "인치(inch)" },
  { id: "px", label: "픽셀(px)" },
];

const sizeDigitUpem = 1000;
const sizeDigitAdvance = 521;
const sizeSlots = 6;

function formatSize(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "000.00";
  const rounded = Math.min(999.99, Math.max(0, Math.round(n * 100) / 100));
  const [whole, frac] = rounded.toFixed(2).split(".");
  return `${whole.padStart(3, "0")}.${frac}`;
}

function sizeGlyph(shown, index) {
  const char = shown[index];
  if (char !== "0" || index > 1) return char;
  const first = shown.slice(0, 3).search(/[1-9]/);
  if (first === -1 || index < first) return "";
  return char;
}

function SizeDigits({ value, onChange, onFocus, onBlur }) {
  const root = useRef(null);
  const field = useRef(null);
  const [slot, setSlot] = useState((sizeDigitAdvance * 16) / sizeDigitUpem);
  const [focused, setFocused] = useState(false);
  const [caret, setCaret] = useState(0);
  const shown = formatSize(value);
  const side = slot / 2;

  useEffect(() => {
    let cancel = false;
    document.fonts.load("16px 'Noto Sans KR'", "0123456789.").then(() => {
      if (cancel || !root.current) return;
      const fontSize = Number.parseFloat(getComputedStyle(root.current).fontSize) || 16;
      setSlot((sizeDigitAdvance * fontSize) / sizeDigitUpem);
    }).catch(() => {});
    return () => { cancel = true; };
  }, []);

  function moveCaret(pos) {
    const next = Math.max(0, Math.min(sizeSlots, pos));
    setCaret(next);
    field.current?.setSelectionRange(next, next);
  }

  useEffect(() => {
    if (!focused) return;
    field.current?.setSelectionRange(caret, caret);
  }, [shown, caret, focused]);

  function writeDigit(pos, digit, nextCaret) {
    const chars = shown.split("");
    chars[pos] = digit;
    onChange(chars.join(""));
    moveCaret(nextCaret);
  }

  function onKeyDown(event) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
      return;
    }
    const pos = field.current?.selectionStart ?? caret;
    if (event.key === "Backspace") {
      event.preventDefault();
      const target = pos <= 0 ? -1 : (shown[pos - 1] === "." ? pos - 2 : pos - 1);
      if (target < 0) return;
      writeDigit(target, "0", target);
      return;
    }
    if (event.key === "Delete") {
      event.preventDefault();
      const target = shown[pos] === "." ? pos + 1 : pos;
      if (target >= shown.length) return;
      writeDigit(target, "0", target + (shown[target + 1] === "." ? 2 : 1));
      return;
    }
    if (event.key === ".") {
      event.preventDefault();
      moveCaret(shown.indexOf(".") + 1);
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      moveCaret(pos + (event.key === "ArrowLeft" ? -1 : 1));
      return;
    }
    if (/^\d$/.test(event.key)) {
      event.preventDefault();
      const target = shown[pos] === "." ? pos + 1 : pos;
      if (target >= shown.length) return;
      const after = target + 1;
      writeDigit(target, event.key, shown[after] === "." ? after + 1 : after);
      return;
    }
    if (event.key.length === 1) event.preventDefault();
  }

  return (
    <div ref={root} className="relative h-full" style={{ width: slot * sizeSlots + side * 2, paddingLeft: side, paddingRight: side }}>
      <div className="pointer-events-none flex h-full items-center" aria-hidden="true">
        {Array.from({ length: sizeSlots }, (_, index) => (
          <span key={index} className="flex h-full items-center justify-center" style={{ width: slot }}>
            {sizeGlyph(shown, index)}
          </span>
        ))}
      </div>
      {focused ? (
        <span className="pointer-events-none absolute top-[22%] bottom-[22%] w-px bg-foreground" style={{ left: side + caret * slot }} />
      ) : null}
      <input
        ref={field}
        aria-label="글꼴 크기"
        inputMode="decimal"
        className="absolute inset-0 cursor-text bg-transparent text-transparent caret-transparent outline-none"
        value={shown}
        onFocus={() => { setFocused(true); onFocus(); }}
        onBlur={() => { setFocused(false); onBlur(); }}
        onMouseDown={(event) => {
          event.preventDefault();
          field.current?.focus();
          const rect = root.current?.getBoundingClientRect();
          if (!rect) return;
          moveCaret(Math.round((event.clientX - rect.left - side) / slot));
        }}
        onKeyDown={onKeyDown}
        onChange={() => { field.current?.setSelectionRange(caret, caret); }}
        onSelect={() => {}}
      />
    </div>
  );
}

function sizeHundredths(text) {
  const match = String(text).trim().match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) return null;
  const frac = (match[2] || "").slice(0, 2).padEnd(2, "0");
  return Number(match[1]) * 100 + Number(frac);
}

function huFromHundredths(hundredths, unit) {
  if (unit === "mm") return Math.round(hundredths * 360 / 127);
  if (unit === "cm") return Math.round(hundredths * 3600 / 127);
  if (unit === "inch") return hundredths * 72;
  if (unit === "px") return Math.round(hundredths * 3 / 4);
  return hundredths;
}

function sizeFromHu(hu, unit) {
  if (unit === "mm") return hu * 25.4 / 7200;
  if (unit === "cm") return hu * 2.54 / 7200;
  if (unit === "inch") return hu / 7200;
  if (unit === "px") return hu / 75;
  return hu / 100;
}

function huOf(source) {
  const hu = Number(source?.fontSize);
  if (Number.isFinite(hu) && hu > 0) return Math.round(hu);
  const pt = Number(source?.fontSizePt);
  if (Number.isFinite(pt) && pt > 0) return Math.round(pt * 100);
  return 1000;
}

function Stepper({ labelUp, labelDown, onUp, onDown }) {
  return (
    <span className="flex h-full flex-col border-l border-[#d4d4d4]">
      <button type="button" className="ui-ghost flex w-[1.25em] flex-1 items-center justify-center" aria-label={labelUp} onClick={onUp}>
        <ChevronUp className="size-[0.75em]" />
      </button>
      <button type="button" className="ui-ghost flex w-[1.25em] flex-1 items-center justify-center border-t border-[#d4d4d4]" aria-label={labelDown} onClick={onDown}>
        <ChevronDown className="size-[0.75em]" />
      </button>
    </span>
  );
}

export const defaultCursorStyle = {
  font: "",
  fontSwapTo: "",
  fontSize: 1000,
  fontSizePt: 10,
  styleName: "",
  bold: false,
  italic: false,
  underline: false,
  underlineType: "NONE",
  strikeout: false,
  color: "#000000",
  align: "JUSTIFY",
  lineSpacing: 160,
};

// 코어가 준 커서 스타일을 화면이 쓰는 꼴로 바꾼다.
function readCursorStyle(cursor) {
  if (!cursor || typeof cursor !== "object") return null;
  return {
    font: typeof cursor.font === "string" ? cursor.font : "",
    fontSwapTo: typeof cursor.fontSwapTo === "string" ? cursor.fontSwapTo : "",
    fontSize: huOf(cursor),
    fontSizePt: huOf(cursor) / 100,
    styleName: typeof cursor.styleName === "string" ? cursor.styleName : "",
    bold: !!cursor.bold,
    italic: !!cursor.italic,
    underline: !!cursor.underline,
    underlineType: cursor.underlineType || (cursor.underline ? "BOTTOM" : "NONE"),
    strikeout: !!cursor.strikeout,
    color: hexColor(cursor.color),
    align: cursor.align || "JUSTIFY",
    lineSpacing: Number.isFinite(Number(cursor.lineSpacing)) ? Number(cursor.lineSpacing) : 160,
  };
}

// 서식 도구 상자와 리본이 같이 쓰는 커서 스타일.
export function useCursorStyle() {
  const [style, setStyle] = useState(() => readCursorStyle(window.__notingCursorStyle) || defaultCursorStyle);
  useEffect(() => {
    const onStyle = (event) => {
      const next = readCursorStyle(event.detail);
      if (next) setStyle(next);
    };
    window.addEventListener("noting-cursor-style-changed", onStyle);
    return () => window.removeEventListener("noting-cursor-style-changed", onStyle);
  }, []);
  return style;
}

export function applyStyle(next) {
  const detail = { ...next };
  if (detail.lineSpacing != null && detail.lineSpacingType == null) detail.lineSpacingType = "PERCENT";
  if (typeof window.__notingApplyStyle === "function") {
    void window.__notingApplyStyle(detail);
  } else {
    window.dispatchEvent(new CustomEvent("noting-format", { detail }));
  }
}

// 마지막 글자의 받침으로 조사를 고른다. 한글이 아니면 받침 없는 쪽을 쓴다.
function lastFinal(word) {
  const code = String(word || "").trim().codePointAt(String(word || "").trim().length - 1) ?? 0;
  if (code < 0xac00 || code > 0xd7a3) return -1;
  return (code - 0xac00) % 28;
}

function topicJosa(word) {
  return lastFinal(word) > 0 ? "은" : "는";
}

function toJosa(word) {
  const final = lastFinal(word);
  return final > 0 && final !== 8 ? "으로" : "로";
}

// 라이선스로 막힌 글꼴 앞의 세모. 누르면 어떤 글꼴로 바뀌는지 알려 준다.
function FontSwapNotice({ face, swapTo }) {
  const [open, setOpen] = useState(false);
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          className="absolute top-0 left-0 z-[1] flex h-full w-[2.2em] items-center justify-center rounded-l-[0.5em] bg-[#fef3c7] text-[#b45309]"
          aria-label={`${face} 라이선스 안내`}
          aria-expanded={open}
          onMouseDown={(event) => event.preventDefault()}
        >
          <TriangleAlert className="size-[1.1em]" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="bottom"
          align="start"
          sideOffset={6}
          collisionPadding={8}
          className="toolbar-ui ui-chrome ui-pop z-[60] w-80 rounded-lg p-4 leading-[1.6]"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <p className="font-medium">
            “{face}”{topicJosa(face)} 라이선스 문제가 있어 “{swapTo}”{toJosa(swapTo)} 바뀝니다.
          </p>
          <p className="mt-2.5 text-[16px] text-[#737373]">
            편집을 시작하면 문서 안의 이 글꼴이 모두 “{swapTo}”{toJosa(swapTo)} 바뀝니다. 줄 간격 등 디자인이 달라질 수 있습니다.
          </p>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

// layout 이 mobile 이면 시안(MobileFormat)처럼 키보드 위 두 줄이다.
// 위 줄은 스타일·글꼴·크기, 아래 줄은 글자 모양 단추와 정렬 고르기다. 줄높이 칸은 넣지 않는다.
export function FormatBar({ layout = "bar" }) {
  const mobile = layout === "mobile";
  const [style, setStyle] = useState(defaultCursorStyle);
  const [fonts, setFonts] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [unit, setUnit] = useState("pt");
  const [sizeText, setSizeText] = useState("10.00");
  const [lineText, setLineText] = useState("160");
  const [pen, setPen] = useState(() => {
    try {
      const recent = JSON.parse(localStorage.getItem("noting.recentColors") || "[]");
      return Array.isArray(recent) && /^#[0-9a-f]{6}$/.test(recent[0]) ? recent[0] : "#c42b1c";
    } catch {
      return "#c42b1c";
    }
  });
  const sizeFocus = useRef(false);
  const lineFocus = useRef(false);

  useEffect(() => {
    // 목록은 코어가 준다. 라이선스로 막힌 글꼴은 빠져 있다.
    const take = (list) => {
      if (Array.isArray(list)) setCatalog(list);
    };
    const onList = (event) => take(event.detail);
    window.addEventListener("noting-font-list", onList);
    take(window.__notingFontList);
    return () => window.removeEventListener("noting-font-list", onList);
  }, []);

  useEffect(() => {
    const apply = (cursor) => {
      const next = readCursorStyle(cursor);
      if (!next) return;
      setStyle(next);
      // 문서에 있는 글꼴은 목록에 더한다. 막힌 글꼴은 고를 수 없게 넣지 않는다.
      if (next.font && !next.fontSwapTo) {
        setFonts((list) => (list.includes(next.font) ? list : [...list, next.font]));
      }
      if (!sizeFocus.current) setSizeText(formatSize(sizeFromHu(next.fontSize, unit)));
      if (!lineFocus.current) setLineText(String(next.lineSpacing));
    };
    const onStyle = (event) => apply(event.detail);
    window.addEventListener("noting-cursor-style-changed", onStyle);
    apply(window.__notingCursorStyle);
    return () => window.removeEventListener("noting-cursor-style-changed", onStyle);
  }, [unit]);

  function patch(next) {
    setStyle((current) => ({ ...current, ...next }));
    applyStyle(next);
  }

  function commitSize(text = sizeText) {
    const hundredths = sizeHundredths(text);
    if (hundredths == null) {
      setSizeText(formatSize(sizeFromHu(huOf(style), unit)));
      return;
    }
    const fontSize = Math.max(1, huFromHundredths(hundredths, unit));
    patch({ fontSize, fontSizePt: fontSize / 100 });
    setSizeText(formatSize(sizeFromHu(fontSize, unit)));
  }

  function stepSize(deltaPt) {
    const fontSize = Math.max(1, huOf(style) + deltaPt * 100);
    patch({ fontSize, fontSizePt: fontSize / 100 });
    setSizeText(formatSize(sizeFromHu(fontSize, unit)));
  }

  // 시안의 서식 도구 상자. 칸 높이는 --ui-h(넓은 화면은 낮게), 둥근 모서리, 연회색 테두리다.
  const boxClass = "ui-box flex h-[var(--ui-h)] items-center overflow-hidden rounded-[0.5em]";
  const splitClass = "flex h-[var(--ui-h)] items-center overflow-hidden rounded-[0.5em] shadow-[inset_0_0_0_1px_#d4d4d4]";
  const caretPart = "ui-part flex h-full w-[1.1em] items-center justify-center pr-[0.15em] outline-none";
  return (
    <div className={mobile ? "ui-chrome flex flex-wrap items-center gap-[6px] [--ui-h:48px]" : "ui-chrome flex flex-wrap items-center gap-[0.25em]"}>
      {/* 스타일: 한글처럼 글꼴 왼쪽. 문단 스타일 바꾸기는 아직 없어서 이름만 보인다 */}
      <button
        type="button"
        className={`ui-outline flex h-[var(--ui-h)] items-center justify-between gap-[0.3em] rounded-[0.5em] pr-[0.4em] pl-[0.6em] ${mobile ? "w-[96px] flex-none" : "w-[7em]"}`}
        aria-label="스타일"
        onClick={() => notReady("스타일")}
      >
        <span className="flex min-w-0 items-center gap-[0.35em]">
          <TextAlignJustify className="size-[0.9em] text-[#737373]" />
          <span className="truncate">{style.styleName || "바탕글"}</span>
        </span>
        <ChevronDown className="size-[0.8em] text-[#737373]" />
      </button>
      <FontField
        value={style.font}
        lead={style.fontSwapTo ? <FontSwapNotice face={style.font} swapTo={style.fontSwapTo} /> : null}
        fonts={[...new Set([...catalog, ...fonts].filter(Boolean))]}
        onPick={(font) => patch({ font })}
        onCommit={() => window.dispatchEvent(new Event("noting-focus-editor"))}
        className={mobile ? "min-w-0 flex-1" : undefined}
      />
      <div className={boxClass}>
        <SizeDigits
          value={sizeText}
          onChange={setSizeText}
          onFocus={() => { sizeFocus.current = true; }}
          onBlur={() => { sizeFocus.current = false; commitSize(); }}
        />
        <PickList
          value={unit}
          onValueChange={(nextUnit) => {
            setUnit(nextUnit);
            setSizeText(formatSize(sizeFromHu(huOf(style), nextUnit)));
          }}
          items={sizeUnits}
          label="글꼴 크기 단위"
          triggerClass="ui-ghost flex h-full items-center gap-[0.15em] px-[0.2em] outline-none"
        >
          {unit}
          <ChevronDown className="size-[0.8em] text-[#737373]" />
        </PickList>
        <Stepper labelUp="글꼴 크기 크게" labelDown="글꼴 크기 작게" onUp={() => stepSize(1)} onDown={() => stepSize(-1)} />
      </div>
      {mobile ? <span aria-hidden="true" className="h-0 basis-full" /> : null}
      <button type="button" className="ui-tg h-[var(--ui-h)] min-w-[var(--ui-h)] rounded-[0.5em] px-[0.3em] font-bold shadow-[inset_0_0_0_1px_#d4d4d4]" aria-label="두껍게" aria-pressed={style.bold} onClick={() => patch({ bold: !style.bold })}>
        가
      </button>
      <button type="button" className="ui-tg h-[var(--ui-h)] min-w-[var(--ui-h)] rounded-[0.5em] px-[0.3em] italic shadow-[inset_0_0_0_1px_#d4d4d4]" aria-label="이탤릭" aria-pressed={style.italic} onClick={() => patch({ italic: !style.italic })}>
        가
      </button>
      {/* 밑줄: 가 = 켜고 끄기, ▾ = 종류 고르기. 한 상자 안에서 누르는 곳만 나뉜다 */}
      <div className={splitClass}>
        <button
          type="button"
          className="ui-part h-full pr-[0.15em] pl-[0.4em]"
          aria-label="밑줄"
          aria-pressed={style.underline}
          onClick={() => {
            const on = !style.underline;
            patch({ underline: on, underlineType: on ? (style.underlineType === "NONE" ? "BOTTOM" : style.underlineType) : "NONE" });
          }}
        >
          <span className="underline underline-offset-[0.2em]">가</span>
        </button>
        <PickList
          value={style.underlineType}
          onValueChange={(id) => patch({ underline: id !== "NONE", underlineType: id })}
          items={underlineTypes}
          label="밑줄 종류"
          width={150}
          triggerClass={caretPart}
        >
          <ChevronDown className="size-[0.72em]" />
        </PickList>
      </div>
      <div className={splitClass}>
        <button type="button" className="ui-part h-full pr-[0.15em] pl-[0.4em]" aria-label="취소줄" aria-pressed={style.strikeout} onClick={() => patch({ strikeout: !style.strikeout })}>
          <span className="line-through">가</span>
        </button>
        <PickList
          value={style.strikeout ? "SINGLE" : "NONE"}
          onValueChange={(id) => patch({ strikeout: id !== "NONE" })}
          items={strikeTypes}
          label="취소줄 종류"
          width={150}
          triggerClass={caretPart}
        >
          <ChevronDown className="size-[0.72em]" />
        </PickList>
      </div>
      {/* 글꼴 색상: 가 = 펜 색 바로 넣기, ▾ = 팔레트에서 고르기. 고른 색이 다음 펜 색이 된다 */}
      <div className={splitClass}>
        <button
          type="button"
          className="ui-part flex h-full flex-col items-center justify-center pr-[0.15em] pl-[0.4em]"
          aria-label="글꼴 색상"
          title="글꼴 색상"
          onClick={() => patch({ color: pen })}
        >
          <span className="leading-none">가</span>
          <span className="mt-[0.1em] h-[0.25em] w-[0.9em] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)]" style={{ backgroundColor: pen }} />
        </button>
        <ColorPopover title="글자 색"
          value={style.color}
          align="end"
          onPick={(hex) => {
            const next = hex || "#000000";
            setPen(next);
            patch({ color: next });
          }}
        >
          <button type="button" className={caretPart} aria-label="글꼴 색상 선택">
            <ChevronDown className="size-[0.72em]" />
          </button>
        </ColorPopover>
      </div>
      {mobile ? (
        <PickList
          value={style.align}
          onValueChange={(id) => patch({ align: id })}
          items={aligns}
          label={`문단 정렬: ${(aligns.find((item) => item.id === style.align) || aligns[0]).label}`}
          width={180}
          triggerClass="ui-outline flex h-[var(--ui-h)] min-w-[64px] flex-1 items-center justify-center gap-[2px] rounded-[0.5em] outline-none"
        >
          {(() => {
            const Icon = (aligns.find((item) => item.id === style.align) || aligns[0]).Icon;
            return <Icon className="size-[1em]" />;
          })()}
          <ChevronDown className="size-[0.72em] text-[#737373]" />
        </PickList>
      ) : (
        <div role="group" aria-label="문단 정렬" className={splitClass}>
          {aligns.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={`ui-tg flex h-full w-[var(--ui-h)] items-center justify-center ${index ? "border-l border-[#d4d4d4]" : ""}`}
              aria-label={item.label}
              title={item.label}
              aria-pressed={style.align === item.id}
              onClick={() => patch({ align: item.id })}
            >
              <item.Icon className="size-[1em]" />
            </button>
          ))}
        </div>
      )}
      {mobile ? null : (
        <div className={boxClass}>
          <input
            className="h-full w-[3em] border-0 bg-transparent text-center outline-none"
            aria-label="줄높이"
            value={lineText}
            onFocus={() => { lineFocus.current = true; }}
            onBlur={() => {
              lineFocus.current = false;
              const n = Number(lineText);
              if (!Number.isFinite(n)) {
                setLineText(String(style.lineSpacing));
                return;
              }
              const next = Math.max(0, Math.round(n));
              patch({ lineSpacing: next });
              setLineText(String(next));
            }}
            onChange={(event) => setLineText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
          <span className="pr-[0.6em]">%</span>
          <Stepper
            labelUp="줄높이 크게"
            labelDown="줄높이 작게"
            onUp={() => {
              const next = style.lineSpacing + 10;
              patch({ lineSpacing: next });
              setLineText(String(next));
            }}
            onDown={() => {
              const next = Math.max(0, style.lineSpacing - 10);
              patch({ lineSpacing: next });
              setLineText(String(next));
            }}
          />
        </div>
      )}
    </div>
  );
}
