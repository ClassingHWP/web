import { useEffect, useRef, useState } from "react";
import { Dialog as DialogPrimitive, Popover as PopoverPrimitive } from "radix-ui";
import { ChevronDown, ChevronLeft } from "lucide-react";
import { rememberColor, useColorMemory, useWide } from "./ui-actions.js";

// 시안(색 고르기)의 팔레트와 다른 색 대화 상자. 색은 #rrggbb, 빈 문자열은 색 없음이다.

const palette = [
  [["#ffffff", "흰색"], ["#f8d4d4", "아주 연한 빨강"], ["#fbdece", "아주 연한 주황"], ["#f4e8cd", "아주 연한 노랑"], ["#d0eddb", "아주 연한 초록"], ["#cfeae7", "아주 연한 청록"], ["#d3e0fb", "아주 연한 파랑"], ["#dcdafa", "아주 연한 남색"], ["#e9d6fb", "아주 연한 보라"], ["#f8d4e4", "아주 연한 분홍"]],
  [["#e5e5e5", "아주 연한 회색"], ["#ef9d9d", "연한 빨강"], ["#f6b492", "연한 주황"], ["#e7ca8e", "연한 노랑"], ["#96d6ae", "연한 초록"], ["#92cfc9", "연한 청록"], ["#9db9f6", "연한 파랑"], ["#b0acf3", "연한 남색"], ["#cea3f6", "연한 보라"], ["#ef9ec2", "연한 분홍"]],
  [["#a3a3a3", "연한 회색"], ["#e66767", "조금 연한 빨강"], ["#f08a55", "조금 연한 주황"], ["#daad4f", "조금 연한 노랑"], ["#5cbf80", "조금 연한 초록"], ["#56b4ac", "조금 연한 청록"], ["#6692f1", "조금 연한 파랑"], ["#847eed", "조금 연한 남색"], ["#b370f0", "조금 연한 보라"], ["#e668a0", "조금 연한 분홍"]],
  [["#737373", "회색"], ["#dc2626", "빨강"], ["#ea580c", "주황"], ["#ca8a04", "노랑"], ["#16a34a", "초록"], ["#0d9488", "청록"], ["#2563eb", "파랑"], ["#4f46e5", "남색"], ["#9333ea", "보라"], ["#db2777", "분홍"]],
  [["#404040", "진한 회색"], ["#a51c1c", "조금 진한 빨강"], ["#b04209", "조금 진한 주황"], ["#986803", "조금 진한 노랑"], ["#107a38", "조금 진한 초록"], ["#0a6f66", "조금 진한 청록"], ["#1c4ab0", "조금 진한 파랑"], ["#3b34ac", "조금 진한 남색"], ["#6e26b0", "조금 진한 보라"], ["#a41d59", "조금 진한 분홍"]],
  [["#000000", "검정"], ["#6e1313", "진한 빨강"], ["#752c06", "진한 주황"], ["#654502", "진한 노랑"], ["#0b5225", "진한 초록"], ["#064a44", "진한 청록"], ["#123276", "진한 파랑"], ["#282372", "진한 남색"], ["#4a1a75", "진한 보라"], ["#6e143c", "진한 분홍"]],
];

export function normalHex(value) {
  const text = String(value || "").trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(text)) return text;
  if (/^#[0-9a-f]{3}$/.test(text)) return `#${text[1]}${text[1]}${text[2]}${text[2]}${text[3]}${text[3]}`;
  return "";
}

function Swatch({ hex, name, selected, onPick, className = "size-[1.65em]" }) {
  return (
    <button
      type="button"
      aria-label={name}
      title={name}
      aria-selected={selected}
      className={`rounded-[0.35em] ${className}`}
      style={{
        background: hex,
        boxShadow: selected ? "0 0 0 2px #ffffff, 0 0 0 4px #171717" : "inset 0 0 0 1px rgba(0, 0, 0, 0.12)",
      }}
      onClick={() => onPick(hex)}
    />
  );
}

export function NoColorMark({ className = "size-[1.45em]" }) {
  return (
    <span aria-hidden="true" className={`relative block flex-none overflow-hidden rounded-[0.3em] shadow-[inset_0_0_0_1px_#d4d4d4] ${className}`}>
      <span className="absolute top-1/2 left-[-15%] h-[2px] w-[130%] -rotate-45 bg-[#dc2626]" />
    </span>
  );
}

// 팔레트 몸통. 색 없음(allowNone), 테마 색, 최근 사용한 색, 다른 색… 순서다.
export function ColorPalette({ value, onPick, allowNone = false, noneLabel = "색 없음", onMore }) {
  const current = normalHex(value);
  // 최근 색 목록은 코어가 들고 있다.
  const { recent } = useColorMemory();
  const pick = (hex) => {
    rememberColor(hex);
    onPick(hex);
  };
  const row = "ui-ghost flex h-[var(--ui-h)] items-center gap-[0.55em] rounded-[0.45em] px-[0.55em] text-left";
  return (
    <div className="flex w-max flex-col gap-[0.65em]">
      {allowNone ? (
        <button type="button" className={row} onClick={() => onPick("")}>
          <NoColorMark />
          {noneLabel}
        </button>
      ) : null}
      <div className="flex flex-col gap-[0.35em]">
        <span className="text-[0.8em] text-[#737373]">테마 색</span>
        <div role="grid" aria-label="테마 색" className="flex flex-col gap-[0.22em]">
          {palette.map((cells, index) => (
            <div key={index} role="row" className="flex gap-[0.22em]">
              {cells.map(([hex, name]) => (
                <Swatch key={hex} hex={hex} name={name} selected={hex === current} onPick={pick} />
              ))}
            </div>
          ))}
        </div>
      </div>
      {recent.length ? (
        <div className="flex flex-col gap-[0.35em]">
          <span className="text-[0.8em] text-[#737373]">최근 사용한 색</span>
          <div className="flex gap-[0.22em]">
            {recent.map((hex) => (
              <Swatch key={hex} hex={hex} name={`최근: ${hex}`} selected={hex === current} onPick={pick} />
            ))}
          </div>
        </div>
      ) : null}
      <button type="button" className={`${row} border-t border-[#e5e5e5]`} onClick={onMore}>
        <span
          aria-hidden="true"
          className="size-[1.45em] flex-none rounded-full"
          style={{ background: "conic-gradient(#ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)" }}
        />
        다른 색…
      </button>
    </div>
  );
}

function hsvToHex(h, s, v) {
  const f = (n) => {
    const k = (n + h / 60) % 6;
    return Math.round(255 * (v - v * s * Math.max(0, Math.min(k, 4 - k, 1))));
  };
  return `#${[f(5), f(3), f(1)].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

function hexToRgb(hex) {
  const text = normalHex(hex) || "#000000";
  return [1, 3, 5].map((i) => Number.parseInt(text.slice(i, i + 2), 16));
}

function hexToHsv(hex) {
  const [r, g, b] = hexToRgb(hex).map((x) => x / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

// 다른 색을 고르는 동안의 값. 대화 상자와 휴대폰 시트가 같이 쓴다.
function useColorDraft(open, initial) {
  const [hsv, setHsv] = useState(() => hexToHsv(initial || "#000000"));
  const [hexText, setHexText] = useState(initial || "#000000");

  useEffect(() => {
    if (!open) return;
    const start = normalHex(initial) || "#000000";
    setHsv(hexToHsv(start));
    setHexText(start);
  }, [open, initial]);

  const hex = hsvToHex(hsv.h, hsv.s, hsv.v);
  const rgb = hexToRgb(hex);

  function setFromHsv(next) {
    setHsv(next);
    setHexText(hsvToHex(next.h, next.s, next.v));
  }

  function typeHex(text) {
    setHexText(text);
    const next = normalHex(text);
    if (next) setHsv(hexToHsv(next));
  }

  function setRgb(index, text) {
    const next = [...rgb];
    next[index] = Math.min(255, Math.max(0, Number(text) || 0));
    const nextHex = `#${next.map((x) => x.toString(16).padStart(2, "0")).join("")}`;
    setHsv(hexToHsv(nextHex));
    setHexText(nextHex);
  }

  return { hsv, hex, rgb, hexText, setFromHsv, typeHex, setRgb };
}

// 밝기·채도 칸, 색상 띠, HEX·R·G·B 칸. phone 이면 휴대폰 시안의 크기와 칸 나눔이다.
function ColorDraftFields({ draft, phone = false }) {
  const area = useRef(null);
  const { hsv, rgb, hexText, setFromHsv, typeHex, setRgb } = draft;

  function dragArea(event) {
    const rect = area.current?.getBoundingClientRect();
    if (!rect) return;
    const s = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const v = 1 - Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    setFromHsv({ ...hsv, s, v });
  }

  const field = phone
    ? "ui-box h-11 w-full min-w-0 rounded-[8px] px-[10px] text-[17px] text-[#0a0a0a] outline-none"
    : "ui-box h-[var(--ui-h)] rounded-[0.45em] px-[0.55em] text-[1.2em] text-[#0a0a0a] outline-none";
  const label = phone ? "flex min-w-0 flex-col gap-1 text-[14px] text-[#737373]" : "flex flex-col gap-[0.2em] text-[0.8em] text-[#737373]";
  return (
    <>
      <div
        ref={area}
        aria-label="밝기와 채도"
        className={`relative w-full cursor-crosshair touch-none ${phone ? "h-[200px] rounded-[8px]" : "h-[12em] rounded-[0.45em]"}`}
        style={{ background: `linear-gradient(to top, #000000, rgba(0, 0, 0, 0)), linear-gradient(to right, #ffffff, hsl(${hsv.h}, 100%, 50%))` }}
        onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); dragArea(event); }}
        onPointerMove={(event) => { if (event.buttons) dragArea(event); }}
      >
        <span
          aria-hidden="true"
          className="absolute -mt-[11px] -ml-[11px] size-[22px] rounded-full shadow-[0_0_0_2px_#ffffff,0_0_0_3px_rgba(0,0,0,0.4)]"
          style={{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%` }}
        />
      </div>
      <label className={phone ? "flex flex-col gap-[10px] text-[14px] text-[#737373]" : "flex flex-col gap-[0.45em] text-[0.8em] text-[#737373]"}>
        색상
        <input
          type="range"
          min="0"
          max="359"
          value={Math.round(hsv.h)}
          className={`w-full cursor-pointer appearance-none rounded-full ${phone ? "h-4" : "h-[0.9em]"}`}
          style={{ background: "linear-gradient(to right,#ff0000,#ffff00,#00ff00,#00ffff,#0000ff,#ff00ff,#ff0000)" }}
          onChange={(event) => setFromHsv({ ...hsv, h: Number(event.target.value) })}
        />
      </label>
      <div className={phone ? "grid grid-cols-[2fr_1fr_1fr_1fr] gap-2" : "flex flex-wrap gap-[0.55em]"}>
        <label className={`${label} ${phone ? "" : "w-[6.5em]"}`}>
          HEX
          <input className={field} value={hexText} onChange={(event) => typeHex(event.target.value)} />
        </label>
        {["R", "G", "B"].map((name, index) => (
          <label key={name} className={`${label} ${phone ? "" : "w-[4em]"}`}>
            {name}
            <input className={field} inputMode="numeric" value={rgb[index]} onChange={(event) => setRgb(index, event.target.value)} />
          </label>
        ))}
      </div>
    </>
  );
}

// 다른 색 대화 상자. 밝기·채도 칸, 색상 띠, HEX·R·G·B 칸, 새 색과 지금 색을 보여 준다.
export function CustomColorDialog({ open, initial, onOk, onCancel }) {
  const draft = useColorDraft(open, initial);
  const { hex } = draft;
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[95] bg-black/30" />
        <DialogPrimitive.Content className="toolbar-ui ui-chrome fixed top-1/2 left-1/2 z-[95] flex w-[min(36em,calc(100vw-1.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col gap-[1.1em] rounded-[0.7em] bg-white p-[1.3em] shadow-[0_0_0_1px_#d4d4d4,0_20px_40px_rgba(0,0,0,0.18)] outline-none sm:flex-row">
          <DialogPrimitive.Description className="sr-only">새 색을 고릅니다.</DialogPrimitive.Description>
          <div className="flex min-w-0 flex-1 flex-col gap-[0.9em]">
            <DialogPrimitive.Title className="text-[1.15em] font-bold">다른 색</DialogPrimitive.Title>
            <ColorDraftFields draft={draft} />
          </div>
          <div className="flex flex-col gap-[0.45em] sm:w-[6.2em] sm:pt-[0.1em]">
            <button type="button" className="ui-primary h-[var(--ui-h)] rounded-[0.45em]" onClick={() => { rememberColor(hex); onOk(hex); }}>확인</button>
            <button type="button" className="ui-outline h-[var(--ui-h)] rounded-[0.45em]" onClick={onCancel}>취소</button>
            <div className="mt-[0.9em] flex flex-col overflow-hidden rounded-[0.45em] shadow-[inset_0_0_0_1px_#d4d4d4]">
              <span className="h-[2.6em]" style={{ background: hex }} />
              <span className="h-[2.6em]" style={{ background: normalHex(initial) || "#ffffff" }} />
            </div>
            <div className="flex justify-between text-[0.72em] text-[#737373]"><span>새 색</span><span>지금 색</span></div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// 휴대폰 시안(MColorPicker). 아래에서 올라오는 시트에 팔레트가 있고, 다른 색… 을 누르면 같은 시트가 다른 색 칸으로 바뀐다.
function ColorSheet({ open, title, value, allowNone, noneLabel = "색 없음", onPick, onClose }) {
  const [custom, setCustom] = useState(false);
  const current = normalHex(value);
  const draft = useColorDraft(open && custom, current || "#000000");
  useEffect(() => {
    if (open) setCustom(false);
  }, [open]);
  // 최근 색 목록은 코어가 들고 있다.
  const { recent } = useColorMemory();
  const pick = (hex) => {
    rememberColor(hex);
    onPick(hex);
  };
  const shown = custom ? draft.hex : current;
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[95] bg-black/45" />
        <DialogPrimitive.Content
          className="toolbar-ui ui-chrome fixed inset-x-0 bottom-0 z-[95] flex max-h-[calc(100dvh-40px)] flex-col gap-[14px] overflow-y-auto rounded-t-[18px] bg-white px-4 pt-2 pb-[max(28px,env(safe-area-inset-bottom))] text-[17px] shadow-[0_-8px_24px_rgba(0,0,0,0.12)] outline-none"
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <DialogPrimitive.Description className="sr-only">색을 고릅니다.</DialogPrimitive.Description>
          <div aria-hidden="true" className="mx-auto h-[5px] w-11 flex-none rounded-[3px] bg-[#d4d4d4]" />
          <div className="flex items-center gap-1">
            {custom ? (
              <button type="button" aria-label="팔레트로" className="ui-ghost flex size-11 items-center justify-center rounded-[10px]" onClick={() => setCustom(false)}>
                <ChevronLeft className="size-6" />
              </button>
            ) : null}
            <DialogPrimitive.Title className="flex-1 text-[20px] font-bold">{custom ? "다른 색" : title}</DialogPrimitive.Title>
            {shown ? (
              <span aria-label="고른 색" className="size-9 flex-none rounded-[8px] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)]" style={{ background: shown }} />
            ) : (
              <NoColorMark className="size-9" />
            )}
          </div>
          {custom ? (
            <div className="flex flex-col gap-4">
              <ColorDraftFields draft={draft} phone />
              <div className="flex gap-2">
                <button type="button" className="ui-outline h-[54px] flex-1 rounded-[10px]" onClick={() => setCustom(false)}>취소</button>
                <button type="button" className="ui-primary h-[54px] flex-1 rounded-[10px] font-medium" onClick={() => pick(draft.hex)}>이 색 쓰기</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-[14px]">
              {allowNone ? (
                <button type="button" className="ui-ghost flex h-[52px] items-center gap-3 rounded-[10px] px-[10px] text-left" onClick={() => onPick("")}>
                  <NoColorMark className="size-[30px]" />
                  {noneLabel}
                </button>
              ) : null}
              <div className="flex flex-col gap-2">
                <span className="text-[14px] text-[#737373]">테마 색</span>
                <div role="grid" aria-label="테마 색" className="flex flex-col gap-1">
                  {palette.map((cells, index) => (
                    <div key={index} role="row" className="flex gap-1">
                      {cells.map(([hex, name]) => (
                        <Swatch key={hex} hex={hex} name={name} selected={hex === current} onPick={pick} className="aspect-square min-w-0 flex-1" />
                      ))}
                    </div>
                  ))}
                </div>
              </div>
              {recent.length ? (
                <div className="flex flex-col gap-2">
                  <span className="text-[14px] text-[#737373]">최근 사용한 색</span>
                  <div className="flex gap-1">
                    {recent.map((hex) => (
                      <Swatch key={hex} hex={hex} name={`최근: ${hex}`} selected={hex === current} onPick={pick} className="size-[31px] flex-none" />
                    ))}
                  </div>
                </div>
              ) : null}
              <button type="button" className="flex h-[54px] items-center justify-center gap-[10px] rounded-[10px] bg-[#f5f5f5] font-medium" onClick={() => setCustom(true)}>
                <span
                  aria-hidden="true"
                  className="size-[26px] flex-none rounded-full"
                  style={{ background: "conic-gradient(#ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)" }}
                />
                다른 색…
              </button>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

// 팔레트를 띄우는 상자. 대화 상자 안의 색 칸과 서식 도구의 ▾ 가 같이 쓴다.
// 좁은 화면에서는 팔레트 대신 휴대폰 시트를 연다.
export function ColorPopover({ value, onPick, allowNone = false, noneLabel, title = "색 고르기", children, align = "start", layer = "z-[90]" }) {
  const wide = useWide();
  const [open, setOpen] = useState(false);
  const [more, setMore] = useState(false);
  if (!wide) {
    return (
      <>
        <span className="contents" onClickCapture={() => setOpen(true)}>{children}</span>
        <ColorSheet
          open={open}
          title={title}
          value={value}
          allowNone={allowNone}
          noneLabel={noneLabel}
          onPick={(hex) => { setOpen(false); onPick(hex); }}
          onClose={() => setOpen(false)}
        />
      </>
    );
  }
  return (
    <>
      {/* 바깥을 투명하게 막는다. 캔버스는 누름을 가로채 바깥 클릭을 알리지 않으니, 바깥 누름이 캔버스로 가지 않고 이 팝오버만 닫는다. */}
      <PopoverPrimitive.Root modal open={open} onOpenChange={setOpen}>
        <PopoverPrimitive.Trigger asChild>{children}</PopoverPrimitive.Trigger>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Content
            side="bottom"
            align={align}
            sideOffset={6}
            collisionPadding={8}
            className={`toolbar-ui ui-chrome ui-pop ${layer} rounded-[0.6em] p-[0.65em]`}
          >
            <ColorPalette
              value={value}
              allowNone={allowNone}
              noneLabel={noneLabel}
              onPick={(hex) => { setOpen(false); onPick(hex); }}
              onMore={() => { setOpen(false); setMore(true); }}
            />
          </PopoverPrimitive.Content>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
      <CustomColorDialog
        open={more}
        initial={normalHex(value) || "#000000"}
        onOk={(hex) => { setMore(false); onPick(hex); }}
        onCancel={() => setMore(false)}
      />
    </>
  );
}

// 대화 상자 안의 색 칸. 고른 색과 이름을 보여 주고, 누르면 팔레트가 뜬다.
export function ColorField({ value, onChange, allowNone = false, noneLabel = "색 없음", label, disabled = false, className = "w-[10em]" }) {
  const hex = normalHex(value);
  return (
    <ColorPopover value={hex} onPick={onChange} allowNone={allowNone} noneLabel={noneLabel} title={label || "색 고르기"}>
      <button
        type="button"
        aria-label={label}
        disabled={disabled}
        className={`ui-outline flex h-[var(--ui-h)] items-center gap-[0.5em] rounded-[0.45em] pr-[0.45em] pl-[0.6em] disabled:opacity-50 ${className}`}
      >
        {hex ? (
          <span aria-hidden="true" className="size-[1.2em] flex-none rounded-[0.25em] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.12)]" style={{ background: hex }} />
        ) : (
          <NoColorMark className="size-[1.2em]" />
        )}
        <span className="min-w-0 flex-1 truncate text-left">{hex || noneLabel}</span>
        <ChevronDown className="size-[0.85em] text-[#737373]" />
      </button>
    </ColorPopover>
  );
}
