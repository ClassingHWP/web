import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ChevronsDown, Ellipsis, Expand, Maximize2 } from "lucide-react";
import { ribbonIcons } from "./ribbon-icons.js";
import { applyStyle, useCursorStyle } from "./FormatBar.jsx";
import { drawShape, leaveBand, notReady, pickPicture, requestZoom, selectionAction, toggleRulers, useRulersShown } from "./ui-actions.js";
import { ColorPopover } from "./ColorPicker.jsx";
import { applyPageSetup, openFormatDialog, pageMarginPresets } from "./FormatDialogs.jsx";
import { openTableDialog } from "./TableDialog.jsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// 시안(한컴 스타일 A)의 리본. 탭마다 묶음을 한 줄로 두고 세로선으로 나눈다.
// 아직 없는 기능도 시안대로 두고, 누르면 준비 중이라고 알린다. 시안에서 흐린 단추만 disabled 다.

export const ribbonTabs = ["편집", "보기", "입력", "서식", "쪽", "보안"];

// 머리말·꼬리말을 고치는 동안만 편집 탭 왼쪽에 생기는 탭.
export const bandTab = "머리말/꼬리말";

function RibbonIcon({ name, className = "size-[1.45em]" }) {
  const body = ribbonIcons[name];
  if (!body) return null;
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: body }}
    />
  );
}

function run(item, onUse) {
  onUse?.();
  if (item.run) item.run();
  else notReady(item.label);
}

function Separator() {
  return <span aria-hidden="true" className="mx-[0.3em] h-[3.2em] w-px flex-none self-center bg-[#e5e5e5]" />;
}

// 아이콘 위, 이름 아래인 큰 단추. menu 가 있으면 이름 뒤에 ▾ 를 붙인다.
// menuItems 가 있으면 누를 때 그 목록을 펼친다. 없으면 run 을 부른다.
function BigButton({ item, onUse }) {
  const button = (
    <button
      type="button"
      className={`ui-rb flex h-[4.1em] min-w-[3.4em] flex-none flex-col items-center justify-start gap-[0.2em] rounded-[0.45em] px-[0.3em] pt-[0.35em] ${item.on ? "on" : ""}`}
      disabled={item.disabled}
      aria-pressed={item.on === undefined ? undefined : !!item.on}
      onClick={item.menuItems ? undefined : () => run(item, onUse)}
    >
      <RibbonIcon name={item.icon || item.label} />
      <span className="max-w-[6.4em] text-center text-[0.9em] leading-[1.15] break-keep">
        {item.label}
        {item.menu ? <ChevronDown className="ml-[0.05em] inline size-[0.75em] align-[-0.1em] text-[#737373]" /> : null}
      </span>
    </button>
  );
  if (!item.menuItems) return button;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {item.menuItems.map((entry, index) =>
          entry.type === "separator" ? (
            <DropdownMenuSeparator key={`sep-${index}`} />
          ) : (
            <DropdownMenuItem key={entry.label} onSelect={() => { onUse?.(); entry.run(); }}>
              {entry.label}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// 두 줄로 쌓는 작은 단추. 이름은 풍선 도움말로만 보인다.
function SmallButton({ item, onUse, children }) {
  return (
    <button
      type="button"
      className={`ui-rb flex h-[1.9em] items-center gap-[0.1em] rounded-[0.4em] px-[0.3em] ${item.on ? "on" : ""}`}
      aria-label={item.label}
      title={item.label}
      aria-pressed={item.on === undefined ? undefined : !!item.on}
      disabled={item.disabled}
      onClick={() => run(item, onUse)}
    >
      {children || <RibbonIcon name={item.icon || item.label} className="size-[1.15em]" />}
    </button>
  );
}

function SmallStack({ items, onUse }) {
  return (
    <div className="flex flex-none flex-col gap-[0.2em]">
      {items.map((item) => <SmallButton key={item.label} item={item} onUse={onUse} />)}
    </div>
  );
}

// 갤러리 오른쪽의 앞 줄·다음 줄·모두 펼치기.
function GalleryScroll({ onUse }) {
  const parts = [
    { label: "앞 줄", Icon: ChevronUp },
    { label: "다음 줄", Icon: ChevronDown },
    { label: "모두 펼치기", Icon: ChevronsDown },
  ];
  return (
    <div className="flex flex-col border-l border-[#e5e5e5]">
      {parts.map(({ label, Icon }, index) => (
        <button
          key={label}
          type="button"
          className={`ui-rb flex w-[1.3em] flex-1 items-center justify-center ${index ? "border-t border-[#e5e5e5]" : ""}`}
          aria-label={label}
          onClick={() => run({ label: "갤러리 넘기기" }, onUse)}
        >
          <Icon className="size-[0.8em] text-[#737373]" />
        </button>
      ))}
    </div>
  );
}

const shapes = ["글상자", "직사각형", "타원", "직선", "화살표", "곡선", "다각형", "삼각형", "그리기"];
// 그릴 수 있는 도형. 누르면 다음 끌기 한 번으로 그 도형을 그린다.
const shapeTools = { 직사각형: 1, 타원: 2, 직선: 3, 글상자: 4, "세로 글상자": 5 };
const drawRun = (label) => (shapeTools[label] ? { run: () => drawShape(shapeTools[label]) } : {});
const shapeMenu = {
  menu: true,
  menuItems: ["직사각형", "타원", "직선", "글상자", "세로 글상자"].map((label) => ({ label, ...drawRun(label) })),
};

function ShapeGallery({ onUse }) {
  return (
    <div role="group" aria-label="도형" className="flex h-[3.9em] flex-none overflow-hidden rounded-[0.45em] shadow-[inset_0_0_0_1px_#d4d4d4]">
      <div className="grid grid-cols-3 content-center px-[0.2em]">
        {shapes.map((label) => (
          <button
            key={label}
            type="button"
            className="ui-rb flex h-[1.2em] w-[1.9em] items-center justify-center rounded-[0.3em]"
            aria-label={label}
            title={label}
            onClick={() => run({ label, ...drawRun(label) }, onUse)}
          >
            <RibbonIcon name={label} className="size-[1em]" />
          </button>
        ))}
      </div>
      <GalleryScroll onUse={onUse} />
    </div>
  );
}

// 문서 스타일 표(코어). 갤러리에는 앞의 넷을 보인다.
function useStyleNames() {
  const [names, setNames] = useState(() => (Array.isArray(window.__chwpStyleList) ? window.__chwpStyleList : []));
  useEffect(() => {
    const onList = (event) => setNames(Array.isArray(event.detail) ? event.detail : []);
    window.addEventListener("chwp-style-list", onList);
    return () => window.removeEventListener("chwp-style-list", onList);
  }, []);
  return names;
}

function StyleGallery({ onUse }) {
  const style = useCursorStyle();
  const paraStyles = useStyleNames().slice(0, 4);
  return (
    <div role="listbox" aria-label="스타일" className="flex h-[3.9em] flex-none overflow-hidden rounded-[0.45em] shadow-[inset_0_0_0_1px_#d4d4d4]">
      <div className="grid grid-cols-2 content-center gap-x-[0.2em] gap-y-[0.1em] px-[0.2em]">
        {paraStyles.map((name) => (
          <button
            key={name}
            type="button"
            role="option"
            aria-selected={!style.mixedStyle && style.styleName === name}
            className={`ui-rb flex h-[1.8em] w-[6.4em] items-center gap-[0.45em] rounded-[0.3em] px-[0.5em] text-left text-[0.9em] ${!style.mixedStyle && style.styleName === name ? "on" : ""}`}
            onClick={() => run({ label: "스타일 바꾸기" }, onUse)}
          >
            <RibbonIcon name="문단 정렬" className="size-[1em] text-[#737373]" />
            {name}
          </button>
        ))}
      </div>
      <GalleryScroll onUse={onUse} />
    </div>
  );
}

function focusFontField() {
  const input = document.querySelector('header input[aria-label="글꼴"]');
  if (input instanceof HTMLInputElement) input.focus();
}

// 서식 탭의 글자 묶음. 위 줄은 언어·글꼴·크기, 아래 줄은 글자 모양 단추다.
function CharMini({ onUse }) {
  const style = useCursorStyle();
  const toggle = (patch) => ({ run: () => applyStyle(patch) });
  // 한 단계(1pt)와 범위는 코어가 정한다.
  const stepSize = (delta) => applyStyle({ fontSizeStep: Math.sign(delta) });
  const outline = "ui-outline flex h-[1.8em] items-center justify-between rounded-[0.4em] pr-[0.3em] pl-[0.5em] text-[0.9em]";
  return (
    <div className="flex flex-none flex-col gap-[0.25em]">
      <div className="flex items-center gap-[0.15em]">
        <button type="button" className={`${outline} w-[4.2em]`} aria-label="언어" onClick={() => run({ label: "언어 고르기" }, onUse)}>
          <span>대표</span>
          <ChevronDown className="size-[0.8em] text-[#737373]" />
        </button>
        <button type="button" className={`${outline} w-[6.6em]`} aria-label="글꼴" onClick={() => { onUse?.(); focusFontField(); }}>
          <span className="min-w-0 truncate">{style.font || "글꼴"}</span>
          <ChevronDown className="size-[0.8em] flex-none text-[#737373]" />
        </button>
        <div className="flex h-[1.8em] items-center overflow-hidden rounded-[0.4em] text-[0.9em] shadow-[inset_0_0_0_1px_#d4d4d4]">
          <span className="w-[2.8em] text-center">{style.mixedFontSize || !style.fontSizePt ? "" : style.fontSizePt.toFixed(1)}</span>
          <span className="pr-[0.3em] text-[#737373]">pt</span>
          <span className="flex h-full flex-col border-l border-[#d4d4d4]">
            <button type="button" className="ui-ghost flex flex-1 items-center px-[0.15em]" aria-label="글꼴 크기 크게" onClick={() => stepSize(100)}>
              <ChevronUp className="size-[0.7em]" />
            </button>
            <button type="button" className="ui-ghost flex flex-1 items-center border-t border-[#d4d4d4] px-[0.15em]" aria-label="글꼴 크기 작게" onClick={() => stepSize(-100)}>
              <ChevronDown className="size-[0.7em]" />
            </button>
          </span>
        </div>
      </div>
      <div className="flex items-center gap-[0.15em]">
        <SmallButton item={{ label: "진하게", on: style.bold, ...toggle({ toggle: "bold" }) }} onUse={onUse}>
          <span className="font-bold">가</span>
        </SmallButton>
        <SmallButton item={{ label: "기울임", on: style.italic, ...toggle({ toggle: "italic" }) }} onUse={onUse}>
          <span className="italic">가</span>
        </SmallButton>
        <SmallButton
          item={{
            label: "밑줄",
            on: style.underline,
            ...toggle({ toggle: "underline" }),
          }}
          onUse={onUse}
        >
          <span className="underline">가</span>
          <ChevronDown className="size-[0.7em] text-[#737373]" />
        </SmallButton>
        <SmallButton item={{ label: "취소선", on: style.strikeout, ...toggle({ toggle: "strikeout" }) }} onUse={onUse}>
          <span className="line-through">가</span>
          <ChevronDown className="size-[0.7em] text-[#737373]" />
        </SmallButton>
        <SmallButton item={{ label: "형광펜" }} onUse={onUse} />
        <ColorPopover title="글자 색" value={style.color} onPick={(hex) => { onUse?.(); applyStyle({ color: hex || "" }); }}>
          <button type="button" className="ui-rb flex h-[1.9em] items-center gap-[0.1em] rounded-[0.4em] px-[0.3em]" aria-label="글자 색" title="글자 색">
            <span className="flex flex-col items-center leading-none">
              가
              <span className="mt-[0.1em] h-[0.2em] w-[0.9em]" style={{ backgroundColor: style.color }} />
            </span>
            <ChevronDown className="size-[0.7em] text-[#737373]" />
          </button>
        </ColorPopover>
      </div>
    </div>
  );
}

// 한 단계는 문단의 간격 종류마다 다르다(10% 또는 1pt). 코어가 정한다.
function stepLineSpacing(style, delta) {
  applyStyle({ lineSpacingStep: Math.sign(delta) });
}

function LineSpacingStack({ onUse }) {
  const style = useCursorStyle();
  return (
    <SmallStack
      onUse={onUse}
      items={[
        { label: "줄 간격 늘리기", run: () => stepLineSpacing(style, 10) },
        { label: "줄 간격 줄이기", run: () => stepLineSpacing(style, -10) },
      ]}
    />
  );
}

// 보기 탭의 표시 상자. 눈금자만 실제로 켜고 끈다. 그림은 늘 보인다.
function ViewChecks({ onUse }) {
  const rulersOn = useRulersShown();
  const check = (label, checked, onChange) => (
    <label key={label} className="flex h-[1.35em] items-center gap-[0.45em] px-[0.3em] text-[0.9em] whitespace-nowrap">
      <input
        type="checkbox"
        className="m-0 size-[1.05em] accent-[#171717]"
        checked={checked}
        onChange={() => {
          onUse?.();
          if (onChange) onChange();
          else notReady(`${label} 보기`);
        }}
      />
      {label}
    </label>
  );
  return (
    <>
      <div className="grid flex-none grid-cols-2 gap-x-[0.6em] gap-y-[0.05em] px-[0.3em]">
        {check("문단 부호", false)}
        {check("그림", true)}
        {check("조판 부호", false)}
        {check("투명 선", false)}
        {check("교정 부호", false)}
        {check("메모", false)}
      </div>
      <Separator />
      <div className="flex flex-none flex-col gap-[0.05em]">
        {check("상황 선", false)}
        {check("문서 탭", false)}
        {check("눈금자", rulersOn, toggleRulers)}
      </div>
    </>
  );
}

function FitMark({ rotate, Icon }) {
  return (
    <span aria-hidden="true" className="relative flex size-[1.2em] items-center justify-center border border-current">
      <Icon className={`size-[0.6em] ${rotate ? "rotate-45" : ""}`} strokeWidth={1.5} />
    </span>
  );
}

function FitStack({ onUse }) {
  const fits = [
    { label: "쪽 맞춤", Icon: Expand, rotate: false, fit: "page" },
    { label: "폭 맞춤", Icon: Maximize2, rotate: true, fit: "width" },
  ];
  return (
    <div className="flex flex-none flex-col gap-[0.2em]">
      {fits.map((item) => (
        <button
          key={item.label}
          type="button"
          className="ui-rb flex h-[1.9em] items-center gap-[0.45em] rounded-[0.4em] px-[0.5em] text-[0.9em] whitespace-nowrap"
          onClick={() => { onUse?.(); requestZoom({ fit: item.fit }); }}
        >
          <FitMark Icon={item.Icon} rotate={item.rotate} />
          {item.label}
        </button>
      ))}
    </div>
  );
}

const big = (label, extra = {}) => ({ type: "big", label, ...extra });
const sep = { type: "sep" };
const custom = (Component) => ({ type: "custom", Component });

// 편집 용지. 세로·가로·쪽 여백은 커서가 있는 구역에 바로 적용한다.
const pageDialog = () => openFormatDialog("page");
const portrait = { run: () => applyPageSetup({ landscape: false }) };
const landscape = { run: () => applyPageSetup({ landscape: true }) };
const marginMenu = {
  menu: true,
  menuItems: [
    ...pageMarginPresets.map((label) => ({ label, run: () => applyPageSetup({ marginPreset: label }) })),
    { type: "separator" },
    { label: "쪽 여백 설정…", run: pageDialog },
  ],
};
// 글자 방향. 한글 쪽 탭의 목록과 같은 세 가지를 커서가 있는 구역에 바로 적용한다.
const textDirectionMenu = {
  menu: true,
  menuItems: [
    { label: "가로 쓰기", run: () => applyPageSetup({ textDirection: 0 }) },
    { label: "세로 쓰기(영문 눕힘)", run: () => applyPageSetup({ textDirection: 1 }) },
    { label: "세로 쓰기(영문 세움)", run: () => applyPageSetup({ textDirection: 2 }) },
  ],
};

// 탭별 리본. 시안 Main.dc.html 의 순서·묶음 그대로다.
const ribbons = {
  [bandTab]: [
    big("머리말", { menu: true }),
    big("꼬리말", { menu: true }),
    sep,
    big("이전 머리말/꼬리말", { icon: "이전" }),
    big("다음 머리말/꼬리말", { icon: "다음" }),
    sep,
    big("쪽 번호 넣기", { icon: "쪽 번호 매기기" }),
    big("현재 쪽만 감추기"),
    sep,
    big("머리말/꼬리말 지우기", { icon: "지우기" }),
    big("닫기", { run: leaveBand }),
  ],
  편집: [
    big("되돌리기", { run: () => selectionAction("undo") }),
    big("다시 실행", { run: () => selectionAction("redo") }),
    big("오려두기", { run: () => selectionAction("cut") }),
    big("복사하기", { run: () => selectionAction("copy") }),
    big("붙여넣기", { run: () => selectionAction("paste") }),
    big("찾기 및 바꾸기"),
    sep,
    big("글자 모양", { run: () => openFormatDialog("char") }),
    big("문단 모양", { run: () => openFormatDialog("para") }),
    big("스타일", { menu: true }),
    sep,
    big("세로", portrait),
    big("가로", landscape),
    big("쪽 여백", marginMenu),
    big("바탕쪽"),
    big("단", { menu: true }),
    sep,
    big("도형", shapeMenu),
    big("그림", { run: pickPicture }),
    big("표", { run: openTableDialog }),
    big("차트", { menu: true }),
  ],
  보기: [
    custom(ViewChecks),
    sep,
    big("격자", { menu: true }),
    big("안내선", { menu: true }),
    sep,
    big("축소", { run: () => requestZoom({ step: -1 }) }),
    big("확대", { run: () => requestZoom({ step: 1 }) }),
    big("100%", { run: () => requestZoom({ percent: 100 }) }),
    custom(FitStack),
  ],
  입력: [
    custom(ShapeGallery),
    sep,
    big("그림", { run: pickPicture }),
    big("표", { run: openTableDialog }),
    big("차트", { menu: true }),
    big("글맵시", { menu: true }),
    big("수식", { menu: true }),
    sep,
    big("각주"),
    big("미주"),
    big("메모"),
    sep,
    big("하이퍼링크"),
  ],
  서식: [
    custom(StyleGallery),
    sep,
    big("글자 모양", { run: () => openFormatDialog("char") }),
    custom(CharMini),
    sep,
    big("문단 모양", { run: () => openFormatDialog("para") }),
    big("문단 정렬", { menu: true }),
    { type: "stack", items: [{ label: "들여쓰기" }, { label: "내어쓰기" }] },
    sep,
    big("개요", { menu: true }),
    { type: "stack", items: [{ label: "문단 번호" }, { label: "글머리표" }] },
    sep,
    custom(LineSpacingStack),
  ],
  쪽: [
    big("편집 용지", { run: pageDialog }),
    big("세로", portrait),
    big("가로", landscape),
    big("쪽 여백", marginMenu),
    sep,
    big("글자 방향", textDirectionMenu),
    sep,
    big("바탕쪽"),
    big("머리말", { menu: true }),
    big("꼬리말", { menu: true }),
    big("쪽 테두리/배경"),
    big("쪽 번호 매기기"),
    big("새 번호로 시작"),
    big("현재 쪽만 감추기"),
    big("줄 번호", { menu: true }),
    sep,
    big("쪽 나누기", { disabled: true }),
    big("단 나누기"),
    big("쪽 지우기"),
    sep,
    big("단", { menu: true }),
    big("단 설정 나누기"),
    sep,
    big("구역 설정"),
    big("구역 나누기", { disabled: true }),
    sep,
    big("라벨", { menu: true }),
    big("원고지"),
  ],
  보안: [
    big("문서 암호 설정"),
    big("문서 암호 변경/해제", { disabled: true }),
    sep,
    big("배포용 문서로 저장"),
    big("배포용 문서 편집", { disabled: true }),
    big("배포용 문서 암호 변경/해제", { disabled: true }),
    sep,
    big("선택 글자 보호", { disabled: true }),
    big("개인 정보 찾아서 보호"),
    big("개인 정보 보호 해제", { disabled: true }),
    big("개인 정보 보호 암호 변경", { disabled: true }),
    sep,
    big("문서 보안 설정"),
  ],
};

// 탭 메뉴(▾)에 넣을 명령. 리본의 큰 단추를 순서대로 쓴다.
export function ribbonMenuItems(name) {
  const list = ribbons[name] || [];
  const items = [];
  for (const item of list) {
    if (item.type === "sep") {
      if (items.length && items[items.length - 1].type !== "separator") items.push({ type: "separator" });
    } else if (item.type === "big" && !items.some((entry) => entry.label === item.label)) {
      items.push({ label: item.label, disabled: item.disabled, onSelect: item.run || (() => notReady(item.label)) });
    }
  }
  while (items.length && items[items.length - 1].type === "separator") items.pop();
  return items;
}

export function RibbonBody({ name, onUse }) {
  const list = ribbons[name];
  if (!list) return null;
  return (
    <div role="toolbar" aria-label={name} className="flex w-max flex-nowrap items-center gap-[0.1em]">
      {list.map((item, index) => {
        if (item.type === "sep") return <Separator key={index} />;
        if (item.type === "custom") return <item.Component key={index} onUse={onUse} />;
        if (item.type === "stack") return <SmallStack key={index} items={item.items} onUse={onUse} />;
        return <BigButton key={`${item.label}-${index}`} item={item} onUse={onUse} />;
      })}
    </div>
  );
}

// 리본 테두리. 창이 좁아 넘치면 양끝에 ‹ › 가 생기고, 누르고 있는 동안 밀린다.
// 휠을 굴려도 가로로 밀린다.
export function RibbonFrame({ name, onUse }) {
  const viewport = useRef(null);
  const timer = useRef(0);
  const [edges, setEdges] = useState({ overflow: false, start: true, end: false });

  useEffect(() => {
    const el = viewport.current;
    if (!el) return undefined;
    el.scrollLeft = 0;
    const measure = () => {
      const max = el.scrollWidth - el.clientWidth;
      setEdges({ overflow: max > 1, start: el.scrollLeft <= 0, end: el.scrollLeft >= max - 1 });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    el.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", measure);
    };
  }, [name]);

  useEffect(() => () => window.clearInterval(timer.current), []);

  function hold(dir) {
    window.clearInterval(timer.current);
    const step = () => {
      if (viewport.current) viewport.current.scrollLeft += dir * 14;
    };
    step();
    timer.current = window.setInterval(step, 16);
  }

  function release() {
    window.clearInterval(timer.current);
  }

  const arrow = (dir, Icon, label, off) => (
    <button
      type="button"
      className={`ui-rb flex h-[4.1em] w-[1.6em] flex-none items-center justify-center rounded-[0.45em] ${off ? "opacity-30" : ""}`}
      aria-label={label}
      onPointerDown={(event) => { event.preventDefault(); hold(dir); }}
      onPointerUp={release}
      onPointerLeave={release}
      onPointerCancel={release}
    >
      <Icon className="size-[1.1em]" />
    </button>
  );

  return (
    <div className="mx-[0.6em] flex items-center gap-[0.2em] rounded-[0.6em] bg-white p-[0.15em] shadow-[0_0_0_1px_#d4d4d4,0_1px_2px_rgba(0,0,0,0.04)]">
      {edges.overflow ? arrow(-1, ChevronLeft, "리본 앞쪽으로", edges.start) : null}
      <div
        ref={viewport}
        className="min-w-0 flex-1 overflow-hidden"
        onWheel={(event) => {
          if (!edges.overflow) return;
          viewport.current.scrollLeft += event.deltaX || event.deltaY;
        }}
      >
        <RibbonBody name={name} onUse={onUse} />
      </div>
      {edges.overflow ? arrow(1, ChevronRight, "리본 뒤쪽으로", edges.end) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 모바일(시안 MobileEdit). 화면 아래에 고른 탭의 한 묶음씩 보이고, 양옆 ‹ › 나 밀기로 넘긴다.
// 묶음과 명령은 데스크톱 리본과 같고, 칸 모양만 손가락에 맞춘다.

// menuItems 가 있으면 데스크톱 큰 단추처럼 누를 때 그 목록을 펼친다.
function MobileTile({ item, onUse, children }) {
  const button = (
    <button
      type="button"
      className={`ui-rb flex h-[76px] min-w-0 flex-col items-center justify-start gap-[4px] rounded-[10px] px-[2px] pt-[10px] ${item.on ? "on" : ""}`}
      disabled={item.disabled}
      aria-pressed={item.on === undefined ? undefined : !!item.on}
      onClick={item.menuItems ? undefined : () => run(item, onUse)}
    >
      {children || <RibbonIcon name={item.icon || item.label} className="size-[26px]" />}
      <span className="flex flex-wrap items-center justify-center gap-[1px] text-center text-[12px] leading-[1.2] tracking-[-0.02em] break-keep">
        {item.label}
        {item.menu ? <ChevronDown className="size-[11px] text-[#737373]" /> : null}
      </span>
    </button>
  );
  if (!item.menuItems) return button;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {item.menuItems.map((entry, index) =>
          entry.type === "separator" ? (
            <DropdownMenuSeparator key={`sep-${index}`} />
          ) : (
            <DropdownMenuItem key={entry.label} onSelect={() => { onUse?.(); entry.run(); }}>
              {entry.label}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function GlyphMark({ children }) {
  return <span className="flex h-[26px] items-center justify-center text-[22px]">{children}</span>;
}

function MobileCheck({ label, checked, onChange, onUse }) {
  return (
    <label className="flex h-[76px] min-w-0 flex-col items-center justify-start gap-[6px] rounded-[10px] bg-[#fafafa] px-[2px] pt-[12px] text-center text-[13px] leading-[1.2] break-keep">
      <input
        type="checkbox"
        className="m-0 size-[22px] accent-[#171717]"
        checked={checked}
        onChange={() => {
          onUse?.();
          if (onChange) onChange();
          else notReady(`${label} 보기`);
        }}
      />
      {label}
    </label>
  );
}

function MobileViewChecks({ labels, onUse }) {
  const rulersOn = useRulersShown();
  return labels.map((label) => (
    <MobileCheck
      key={label}
      label={label}
      checked={label === "그림" || (label === "눈금자" && rulersOn)}
      onChange={label === "눈금자" ? toggleRulers : null}
      onUse={onUse}
    />
  ));
}

function MobileStyles({ onUse }) {
  const style = useCursorStyle();
  const paraStyles = useStyleNames().slice(0, 4);
  return paraStyles.map((name) => {
    const on = !style.mixedStyle && style.styleName === name;
    return (
      <button
        key={name}
        type="button"
        role="option"
        aria-selected={on}
        className={`flex h-[76px] min-w-0 items-center justify-center rounded-[10px] text-[15px] ${on ? "bg-[#f5f5f5] font-medium shadow-[inset_0_0_0_1px_#d4d4d4]" : "bg-[#fafafa]"}`}
        onClick={() => run({ label: "스타일 바꾸기" }, onUse)}
      >
        {name}
      </button>
    );
  });
}

function MobileCharTiles({ onUse }) {
  const style = useCursorStyle();
  const toggle = (patch) => () => applyStyle(patch);
  return (
    <>
      <MobileTile item={{ label: "글자 모양", run: () => openFormatDialog("char") }} onUse={onUse} />
      <MobileTile item={{ label: "진하게", on: style.bold, run: toggle({ toggle: "bold" }) }} onUse={onUse}>
        <GlyphMark><b>가</b></GlyphMark>
      </MobileTile>
      <MobileTile item={{ label: "기울임", on: style.italic, run: toggle({ toggle: "italic" }) }} onUse={onUse}>
        <GlyphMark><i>가</i></GlyphMark>
      </MobileTile>
      <MobileTile
        item={{ label: "밑줄", on: style.underline, run: toggle({ toggle: "underline" }) }}
        onUse={onUse}
      >
        <GlyphMark><u>가</u></GlyphMark>
      </MobileTile>
      <MobileTile item={{ label: "형광펜" }} onUse={onUse} />
      <ColorPopover title="글자 색" value={style.color} onPick={(hex) => { onUse?.(); applyStyle({ color: hex || "" }); }}>
        <button type="button" className="ui-rb flex h-[76px] min-w-0 flex-col items-center justify-start gap-[4px] rounded-[10px] px-[2px] pt-[10px]">
          <GlyphMark>
            <span className="flex flex-col items-center leading-none">
              가
              <span className="mt-[2px] h-[4px] w-[18px]" style={{ backgroundColor: style.color }} />
            </span>
          </GlyphMark>
          <span className="text-center text-[13px] leading-[1.2]">글자 색</span>
        </button>
      </ColorPopover>
    </>
  );
}

function MobileLineSpacing({ onUse }) {
  const style = useCursorStyle();
  return (
    <>
      <MobileTile item={{ label: "줄 간격 늘리기", run: () => stepLineSpacing(style, 10) }} onUse={onUse} />
      <MobileTile item={{ label: "줄 간격 줄이기", run: () => stepLineSpacing(style, -10) }} onUse={onUse} />
    </>
  );
}

function MobileFit({ onUse }) {
  return [
    { label: "쪽 맞춤", Icon: Expand, rotate: false, fit: "page" },
    { label: "폭 맞춤", Icon: Maximize2, rotate: true, fit: "width" },
  ].map((item) => (
    <MobileTile key={item.label} item={{ label: item.label, run: () => requestZoom({ fit: item.fit }) }} onUse={onUse}>
      <span className="flex h-[26px] items-center text-[22px]"><FitMark Icon={item.Icon} rotate={item.rotate} /></span>
    </MobileTile>
  ));
}

const tile = (label, extra = {}) => ({ type: "tile", label, ...extra });
const view = (Component, props = {}) => ({ type: "view", Component, props });
const charDialog = () => openFormatDialog("char");
const paraDialog = () => openFormatDialog("para");

// 시안의 장 나눔. [장 이름, 칸들, 칸 수(칸이 여럿인 묶음만)]
const mobilePages = {
  [bandTab]: [
    ["머리말/꼬리말", [tile("닫기", { run: leaveBand }), tile("머리말", { menu: true }), tile("꼬리말", { menu: true }), tile("이전", { icon: "이전" }), tile("다음", { icon: "다음" })]],
    ["넣기", [tile("쪽 번호 넣기", { icon: "쪽 번호 매기기" }), tile("현재 쪽만 감추기"), tile("지우기", { icon: "지우기" })]],
  ],
  편집: [
    ["기본", [tile("되돌리기", { run: () => selectionAction("undo") }), tile("다시 실행", { run: () => selectionAction("redo") }), tile("오려두기", { run: () => selectionAction("cut") }), tile("복사하기", { run: () => selectionAction("copy") }), tile("붙여넣기", { run: () => selectionAction("paste") }), tile("찾기 및 바꾸기")]],
    ["모양", [tile("글자 모양", { run: charDialog }), tile("문단 모양", { run: paraDialog }), tile("스타일", { menu: true })]],
    ["쪽", [tile("세로", portrait), tile("가로", landscape), tile("쪽 여백", { menu: true, run: pageDialog }), tile("바탕쪽"), tile("단", { menu: true })]],
    ["개체", [tile("도형", shapeMenu), tile("그림", { run: pickPicture }), tile("표", { run: openTableDialog }), tile("차트", { menu: true })]],
  ],
  보기: [
    ["표시", [view(MobileViewChecks, { labels: ["문단 부호", "그림", "조판 부호", "투명 선", "교정 부호", "메모"] })], 6],
    ["화면", [view(MobileViewChecks, { labels: ["상황 선", "문서 탭", "눈금자"] })], 3],
    ["격자", [tile("격자", { menu: true }), tile("안내선", { menu: true })]],
    ["배율", [tile("축소", { run: () => requestZoom({ step: -1 }) }), tile("확대", { run: () => requestZoom({ step: 1 }) }), tile("100%", { run: () => requestZoom({ percent: 100 }) }), view(MobileFit)], 5],
  ],
  입력: [
    ["도형", [tile("글상자", drawRun("글상자")), tile("직사각형", drawRun("직사각형")), tile("타원", drawRun("타원")), tile("직선", drawRun("직선")), tile("화살표"), tile("더 보기", { glyph: "more" })]],
    ["개체", [tile("그림", { run: pickPicture }), tile("표", { run: openTableDialog }), tile("차트", { menu: true }), tile("글맵시", { menu: true }), tile("수식", { menu: true })]],
    ["주석", [tile("각주"), tile("미주"), tile("메모")]],
    ["링크", [tile("하이퍼링크")]],
  ],
  서식: [
    ["스타일", [view(MobileStyles)], 4],
    ["글자", [view(MobileCharTiles)], 6],
    ["문단", [tile("문단 모양", { run: paraDialog }), tile("문단 정렬", { menu: true }), tile("들여쓰기"), tile("내어쓰기")]],
    ["개요", [tile("개요", { menu: true }), tile("문단 번호"), tile("글머리표")]],
    ["줄 간격", [view(MobileLineSpacing)], 2],
  ],
  쪽: [
    ["용지", [tile("편집 용지", { run: pageDialog }), tile("세로", portrait), tile("가로", landscape), tile("쪽 여백", { menu: true, run: pageDialog })]],
    ["방향", [tile("글자 방향", textDirectionMenu)]],
    ["쪽 꾸미기", [tile("바탕쪽"), tile("머리말", { menu: true }), tile("꼬리말", { menu: true }), tile("쪽 테두리/배경")]],
    ["번호", [tile("쪽 번호 매기기"), tile("새 번호로 시작"), tile("현재 쪽만 감추기"), tile("줄 번호", { menu: true })]],
    ["나누기", [tile("쪽 나누기", { disabled: true }), tile("단 나누기"), tile("쪽 지우기")]],
    ["단", [tile("단", { menu: true }), tile("단 설정 나누기")]],
    ["구역", [tile("구역 설정"), tile("구역 나누기", { disabled: true })]],
    ["특수 용지", [tile("라벨", { menu: true }), tile("원고지")]],
  ],
  보안: [
    ["암호", [tile("문서 암호 설정"), tile("문서 암호 변경/해제", { disabled: true })]],
    ["배포용", [tile("배포용 문서로 저장"), tile("배포용 문서 편집", { disabled: true }), tile("배포용 문서 암호 변경/해제", { disabled: true })]],
    ["개인 정보", [tile("선택 글자 보호", { disabled: true }), tile("개인 정보 찾아서 보호"), tile("개인 정보 보호 해제", { disabled: true }), tile("개인 정보 보호 암호 변경", { disabled: true })]],
    ["보안 설정", [tile("문서 보안 설정")]],
  ],
};

function MobilePage({ tab, name, items, columns, index, count, onUse }) {
  const cols = columns || items.length;
  return (
    <div
      role="group"
      aria-label={`${tab} ${name} (${index + 1}/${count})`}
      className="box-border grid flex-[0_0_100%] gap-[2px] px-[2px]"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {items.map((item, i) => {
        if (item.type === "view") return <item.Component key={i} {...item.props} onUse={onUse} />;
        if (item.glyph === "more") {
          return (
            <MobileTile key={i} item={item} onUse={onUse}>
              <Ellipsis className="size-[26px]" strokeWidth={1.75} />
            </MobileTile>
          );
        }
        return <MobileTile key={i} item={item} onUse={onUse} />;
      })}
    </div>
  );
}

// 화면 아래 리본 띠. 한 장이 데스크톱 리본의 한 묶음이다.
export function MobileRibbon({ tab, onUse }) {
  const pages = mobilePages[tab] || [];
  const [page, setPage] = useState(0);
  const startX = useRef(null);
  useEffect(() => setPage(0), [tab]);
  const last = Math.max(0, pages.length - 1);
  const at = Math.min(page, last);
  const go = (delta) => setPage((current) => Math.max(0, Math.min(last, current + delta)));
  const arrow = (delta, Icon, label, off) => (
    <button
      type="button"
      aria-label={label}
      className={`flex h-[76px] w-[26px] flex-none items-center justify-center rounded-[10px] ${off ? "opacity-25" : ""}`}
      onClick={() => go(delta)}
    >
      <Icon className="size-[22px]" />
    </button>
  );
  return (
    <div className="flex items-center gap-[2px] border-t border-[#e5e5e5] bg-white px-[4px] pt-[8px] pb-[max(12px,env(safe-area-inset-bottom))]">
      {arrow(-1, ChevronLeft, "이전 구간", at === 0)}
      <div className="min-w-0 flex-1 overflow-hidden">
        <div
          role="toolbar"
          aria-label={tab}
          className="flex transition-transform duration-[250ms] ease-out"
          style={{ transform: `translateX(-${at * 100}%)`, touchAction: "pan-y" }}
          onPointerDown={(event) => { startX.current = event.clientX; }}
          onPointerUp={(event) => {
            if (startX.current === null) return;
            const dx = event.clientX - startX.current;
            startX.current = null;
            if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
          }}
        >
          {pages.map(([name, items, columns], index) => (
            <MobilePage key={name} tab={tab} name={name} items={items} columns={columns} index={index} count={pages.length} onUse={onUse} />
          ))}
        </div>
      </div>
      {arrow(1, ChevronRight, "다음 구간", at === last)}
    </div>
  );
}
