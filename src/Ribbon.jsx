import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ChevronsDown, Ellipsis, Expand, Maximize2 } from "lucide-react";
import { ribbonIcons } from "./ribbon-icons.js";
import { aligns, applyStyle, useCursorStyle, useStyleNames } from "./FormatBar.jsx";
import { applyViewGuides, exchangeNotes, runShortcut, setColumns, setCaption, setNoteShape, leaveNote, cellBorder, drawShape, fontLanguages, fontOfLanguage, insertNote, leaveBand, notReady, pageControl, toggleMasterOption, toggleLineNumbers, toggleSuppressLineNumbers, pickPicture, requestZoom, selectionAction, setFontLanguage, setTablePen, tableEdit, insertBreak, toggleRulers, useFontLanguage, useRulersShown, useTablePen, useViewGuides } from "./ui-actions.js";
import { ColorPalette, ColorPopover } from "./ColorPicker.jsx";
import { applyPageSetup, lineShapeLabels, openFormatDialog, pageMarginPresets } from "./FormatDialogs.jsx";
import { LineTypeIcon, LineWidthIcon } from "./ShapeIcons.jsx";
import { openTableDialog } from "./TableDialog.jsx";
import { openPageDialog } from "./PageDialogs.jsx";
import { openSymbolDialog } from "./SymbolDialog.jsx";
import { openHyperlinkDialog } from "./HyperlinkDialog.jsx";
import { openEquationDialog } from "./EquationDialog.jsx";
import { openColumnDialog } from "./ColumnDialog.jsx";
import { openGridDialog, openMoveGuideDialog } from "./GuideDialogs.jsx";
import { openSectionDialog } from "./SectionDialog.jsx";
import { openTablePropertiesDialog } from "./TablePropertiesDialog.jsx";
import { openBookmarkDialog, openGoToDialog } from "./BookmarkDialog.jsx";
import { openComposeDialog, openRubyDialog } from "./GlyphGroupDialog.jsx";
import { openCaseDialog, openWidthDialog } from "./TextConvertDialog.jsx";
import { openTableToTextDialog, openTextToTableDialog } from "./TableTextDialog.jsx";
import { openTableFlipDialog } from "./TableFlipDialog.jsx";
import { openTableSortDialog } from "./TableSortDialog.jsx";
import { openTableFormulaDialog } from "./TableFormulaDialog.jsx";
import { openDeleteMarksDialog } from "./DeleteMarksDialog.jsx";
import { openHeaderFooterDialog } from "./HeaderFooterDialog.jsx";
import { openMasterPageDialog } from "./MasterPageDialog.jsx";
import { openLineNumberDialog } from "./LineNumberDialog.jsx";
import { deleteCurrentPage, openDeletePageDialog } from "./DeletePageDialog.jsx";
import { deleteMemo, openMemoDialog } from "./MemoDialog.jsx";
import { openBlockCalcDialog } from "./BlockCalcDialog.jsx";
import { openTocDialog, updateToc } from "./TocDialog.jsx";
import { openProofMarkDialog } from "./ProofMarkDialog.jsx";
import { openNoteShapeDialog } from "./NoteShapeDialog.jsx";
import { openFindDialog } from "./FindDialog.jsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// 시안(한컴 스타일 A)의 리본. 탭마다 묶음을 한 줄로 두고 세로선으로 나눈다.
// 아직 없는 기능도 시안대로 두고, 누르면 준비 중이라고 알린다. 시안에서 흐린 단추만 disabled 다.

export const ribbonTabs = ["편집", "보기", "입력", "서식", "쪽", "보안", "검토", "도구"];

// 머리말·꼬리말을 고치는 동안만 편집 탭 왼쪽에 생기는 탭.
export const bandTab = "머리말/꼬리말";

// 캐럿이 각주·미주 안일 때만 생기는 탭(한글 2024 주석 상황 탭).
export const noteTab = "주석";
// 바탕쪽 편집 중에만 보이는 탭(한글 바탕쪽 도구 상자).
export const masterTab = "바탕쪽";

// 캐럿이 표 칸 안에 있을 때만 생기는 두 탭(한글 2024 의 표 디자인·표 레이아웃, hwp_frame.xml 차례).
export const tableDesignTab = "표 디자인";
export const tableLayoutTab = "표 레이아웃";
export const tableTabs = [tableDesignTab, tableLayoutTab];

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
              <MenuCheck entry={entry} />
              {entry.label}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// 켜고 끄는 펼침 항목(checked 가 있는 항목)의 체크 표시. 값은 연 때마다 다시 읽는다.
function MenuCheck({ entry }) {
  if (typeof entry.checked !== "function") return null;
  return <Check className={`size-[1em] ${entry.checked() ? "" : "invisible"}`} aria-hidden="true" />;
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

// 서식 탭의 밑줄·취소선·글자 테두리. 앞은 켜고 끄기, ▾ 는 선 모양 목록과 색(한글 2024 UnderlineButton·
// StrikeOutButton·TextBorderButton). 고른 모양·색을 기억해 켜는 일은 코어가 한다.
// 목록 차례는 한글 목록 번호 차례다(0 실선, 1 DOT, 2 DASH …, 한글 2024 에서 잰 것).
const hangulLineShapes = ["SOLID", "DOT", "DASH", "DASH_DOT", "DASH_DOT_DOT", "LONG_DASH", "CIRCLE", "DOUBLE_SLIM",
  "SLIM_THICK", "THICK_SLIM", "SLIM_THICK_SLIM"];
function LineSplitButton({ label, on, glyph, toggle, shapes, pickShape, pickColor, colorTitle, onUse }) {
  return (
    <span className="flex items-center">
      <SmallButton item={{ label, on, run: toggle }} onUse={onUse}>{glyph}</SmallButton>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className="ui-rb flex h-[1.9em] items-center rounded-[0.4em] px-[0.05em]" aria-label={`${label} 모양`} title={`${label} 모양`}>
            <ChevronDown className="size-[0.7em] text-[#737373]" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {shapes.map((shape) => (
            <DropdownMenuItem key={shape} onSelect={() => { onUse?.(); pickShape(shape); }} title={lineShapeLabels[shape] || shape}>
              <span className="flex w-[7em] items-center"><LineTypeIcon type={shape} /></span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <div className="px-[0.4em] pb-[0.3em] text-[0.85em] text-[#737373]">{colorTitle}</div>
          <ColorPalette onPick={(hex) => { onUse?.(); if (hex) pickColor(hex); }} />
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  );
}

function SmallStack({ items, onUse }) {
  return (
    <div className="flex flex-none flex-col gap-[0.2em]">
      {items.map((item) => <SmallButton key={item.label} item={item} onUse={onUse} />)}
    </div>
  );
}

// 갤러리 오른쪽의 앞 줄·다음 줄·모두 펼치기. runs 가 없는 단추는 준비 중이다.
// allItems 가 있으면 모두 펼치기는 그 목록을 펼친다.
function GalleryScroll({ onUse, runs = {}, allItems = null }) {
  const parts = [
    { key: "up", label: "앞 줄", Icon: ChevronUp },
    { key: "down", label: "다음 줄", Icon: ChevronDown },
    { key: "all", label: "모두 펼치기", Icon: ChevronsDown },
  ];
  return (
    <div className="flex flex-col border-l border-[#e5e5e5]">
      {parts.map(({ key, label, Icon }, index) => {
        const button = (
          <button
            key={label}
            type="button"
            className={`ui-rb flex w-[1.3em] flex-1 items-center justify-center ${index ? "border-t border-[#e5e5e5]" : ""}`}
            aria-label={label}
            onClick={key === "all" && allItems ? undefined : () => run({ label: "갤러리 넘기기", run: runs[key] }, onUse)}
          >
            <Icon className="size-[0.8em] text-[#737373]" />
          </button>
        );
        if (key !== "all" || !allItems) return button;
        return (
          <DropdownMenu key={label}>
            <DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {allItems.map((entry) => (
                <DropdownMenuItem key={entry.label} onSelect={() => { onUse?.(); entry.run(); }}>
                  {entry.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}
    </div>
  );
}

// 한글 2024 도형 갤러리 차례: 가로 글상자, 세로 글상자, 직사각형, 타원, 직선, 호, 다각형, 곡선, 자유선.
const shapes = ["글상자", "세로 글상자", "직사각형", "타원", "직선", "호", "다각형", "곡선", "자유선"];
// 그릴 도형 번호(코어 setDrawTool). 상자 도형·호는 한 번 끌기, 다각형·곡선은 점을 누르고 두 번 눌러 끝내기, 자유선은 끈 자취.
const shapeTools = { 직사각형: 1, 타원: 2, 직선: 3, 글상자: 4, "세로 글상자": 5, 호: 6, 다각형: 7, 곡선: 8, 자유선: 9 };
const drawRun = (label) => (shapeTools[label] ? { run: () => drawShape(shapeTools[label]) } : {});
const shapeMenu = {
  menu: true,
  menuItems: ["직사각형", "타원", "직선", "호", "다각형", "곡선", "자유선", "글상자", "세로 글상자"].map((label) => ({ label, ...drawRun(label) })),
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


// 스타일 갤러리. 두 칸씩 두 줄이고, 앞 줄·다음 줄로 한 줄씩 넘긴다. 고르면 코어가 그 스타일을 입힌다.
function StyleGallery({ onUse }) {
  const style = useCursorStyle();
  const names = useStyleNames();
  const [first, setFirst] = useState(0);
  const lastStart = 2 * Math.max(0, Math.ceil(names.length / 2) - 2);
  const start = Math.min(first, lastStart);
  const paraStyles = names.slice(start, start + 4);
  const runs = {
    up: () => setFirst(Math.max(0, start - 2)),
    down: () => setFirst(Math.min(lastStart, start + 2)),
  };
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
            onClick={() => run({ label: "스타일 바꾸기", run: () => applyStyle({ styleName: name }) }, onUse)}
          >
            <RibbonIcon name="문단 정렬" className="size-[1em] text-[#737373]" />
            {name}
          </button>
        ))}
      </div>
      <GalleryScroll onUse={onUse} runs={runs} allItems={styleItems(names).slice(1)} />
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
  const fontLang = useFontLanguage();
  const toggle = (patch) => ({ run: () => applyStyle(patch) });
  // 한 단계(1pt)와 범위는 코어가 정한다.
  const stepSize = (delta) => applyStyle({ fontSizeStep: Math.sign(delta) });
  const outline = "ui-outline flex h-[1.8em] items-center justify-between rounded-[0.4em] pr-[0.3em] pl-[0.5em] text-[0.9em]";
  return (
    <div className="flex flex-none flex-col gap-[0.25em]">
      <div className="flex items-center gap-[0.15em]">
        {/* 글꼴 칸이 고치는 언어. 서식 막대의 언어 칸과 같은 선택이다 */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={`${outline} w-[4.2em]`} aria-label="언어">
              <span>{fontLang}</span>
              <ChevronDown className="size-[0.8em] text-[#737373]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {fontLanguages.map(([lang]) => (
              <DropdownMenuItem key={lang} onSelect={() => { onUse?.(); setFontLanguage(lang); }}>
                {lang}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <button type="button" className={`${outline} w-[6.6em]`} aria-label="글꼴" onClick={() => { onUse?.(); focusFontField(); }}>
          <span className="min-w-0 truncate">{fontOfLanguage(style, fontLang) || "글꼴"}</span>
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
        <LineSplitButton
          label="밑줄" on={style.underline} glyph={<span className="underline">가</span>} onUse={onUse}
          toggle={() => applyStyle({ toggle: "underline" })}
          shapes={[...hangulLineShapes, "WAVE", "DOUBLE_WAVE"]}
          pickShape={(shape) => applyStyle({ pickUnderlineShape: shape })}
          pickColor={(hex) => applyStyle({ pickUnderlineColor: hex })} colorTitle="밑줄 색"
        />
        <LineSplitButton
          label="취소선" on={style.strikeout} glyph={<span className="line-through">가</span>} onUse={onUse}
          toggle={() => applyStyle({ toggle: "strikeout" })}
          shapes={hangulLineShapes}
          pickShape={(shape) => applyStyle({ pickStrikeShape: shape })}
          pickColor={(hex) => applyStyle({ pickStrikeColor: hex })} colorTitle="취소선 색"
        />
        <SmallButton item={{ label: "아래 첨자", on: style.subscript, ...toggle({ toggle: "subscript" }) }} onUse={onUse}>
          <span>가<sub className="text-[0.6em]">2</sub></span>
        </SmallButton>
        <SmallButton item={{ label: "위 첨자", on: style.superscript, ...toggle({ toggle: "superscript" }) }} onUse={onUse}>
          <span>가<sup className="text-[0.6em]">2</sup></span>
        </SmallButton>
        <LineSplitButton
          label="글자 테두리" on={style.charBorder} onUse={onUse}
          glyph={<span className="border border-current px-[0.1em] leading-none">가</span>}
          toggle={() => applyStyle({ toggle: "charBorder" })}
          shapes={["NONE", ...hangulLineShapes]}
          pickShape={(shape) => applyStyle({ pickCharBorderType: shape })}
          pickColor={(hex) => applyStyle({ pickCharBorderColor: hex })} colorTitle="테두리 색"
        />
        {/* 형광펜: 고른 글자에 색을 칠한다. 지우기는 색 없음이다. 블록이 없으면 코어가 칠하지 않는다 */}
        <ColorPopover title="형광펜" value="#ffff00" allowNone noneLabel="형광펜 지우기" onPick={(hex) => { onUse?.(); applyStyle({ markpen: hex || "" }); }}>
          <button type="button" className="ui-rb flex h-[1.9em] items-center gap-[0.1em] rounded-[0.4em] px-[0.3em]" aria-label="형광펜" title="형광펜">
            <RibbonIcon name="형광펜" className="size-[1.15em]" />
            <ChevronDown className="size-[0.7em] text-[#737373]" />
          </button>
        </ColorPopover>
        <ColorPopover title="글자 색" value={style.color} onPick={(hex) => { onUse?.(); applyStyle({ color: hex || "" }); }}>
          <button type="button" className="ui-rb flex h-[1.9em] items-center gap-[0.1em] rounded-[0.4em] px-[0.3em]" aria-label="글자 색" title="글자 색">
            <span className="flex flex-col items-center leading-none">
              가
              <span className="mt-[0.1em] h-[0.2em] w-[0.9em]" style={{ backgroundColor: style.color }} />
            </span>
            <ChevronDown className="size-[0.7em] text-[#737373]" />
          </button>
        </ColorPopover>
        <SmallButton item={{ label: "자간 좁게", ...toggle({ spacingStep: -1 }) }} onUse={onUse}>
          <span className="tracking-[-0.15em]">가가</span>
        </SmallButton>
        <SmallButton item={{ label: "자간 넓게", ...toggle({ spacingStep: 1 }) }} onUse={onUse}>
          <span className="tracking-[0.15em]">가가</span>
        </SmallButton>
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

// 보기 표시(문단 부호·조판 부호·투명 선·메모) 상자 이름 → 코어 보기 값 이름. 켜고 끄기와 값은 코어가 정한다.
const viewMarkKeys = { "문단 부호": "paraMarks", "조판 부호": "ctrlMarks", "투명 선": "transparentLines", 메모: "memos", "교정 부호": "proofMarks" };

// 이 보기 표시 상자가 켜졌는지와 누를 때 할 일. 보기 표시가 아니면 null 이다.
function viewMarkCheck(label, guides) {
  const key = viewMarkKeys[label];
  if (!key) return null;
  return { checked: !!guides?.[key], onChange: () => applyViewGuides({ toggle: key }) };
}

// 보기 탭의 표시 상자. 눈금자와 보기 표시를 켜고 끈다. 그림은 늘 보인다.
function ViewChecks({ onUse }) {
  const rulersOn = useRulersShown();
  const guides = useViewGuides();
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
        {["문단 부호", "그림", "조판 부호", "투명 선", "교정 부호", "메모"].map((label) => {
          const mark = viewMarkCheck(label, guides);
          if (mark) return check(label, mark.checked, mark.onChange);
          return check(label, label === "그림");
        })}
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

// 보기 격자·안내선(한글 2024 GridButton·ShapeGuidelineButton 펼침 목록). 켜고 끄기와 값은 코어가 정한다.
const guideOn = (key) => () => !!window.__chwpViewGuides?.[key];
const gridMenu = {
  menu: true,
  menuItems: [
    { label: "격자 보기", checked: guideOn("gridShow"), run: () => applyViewGuides({ toggle: "grid" }) },
    { label: "격자 설정...", run: openGridDialog },
  ],
};
const guideMenu = {
  menu: true,
  menuItems: [
    { label: "그리기 안내선 보기", checked: guideOn("drawGuides"), run: () => applyViewGuides({ toggle: "drawGuides" }) },
    { label: "개체 이동 안내선 보기", checked: guideOn("moveGuides"), run: () => applyViewGuides({ toggle: "moveGuides" }) },
    { label: "개체 이동 안내선 설정...", run: openMoveGuideDialog },
  ],
};

// 문단 단추. 무엇을 켜고 끌지, 한 단계가 얼마인지는 코어가 정한다(한글 2024 단추와 같다).
const alignMenu = {
  menu: true,
  menuItems: aligns.map(({ id, label }) => ({ label, run: () => applyStyle({ align: id }) })),
};
const indentIn = { run: () => applyStyle({ indentStep: 1 }) };
const indentOut = { run: () => applyStyle({ indentStep: -1 }) };
// 왼쪽 여백 한 단계(한글 DecreaseLeftMargin·IncreaseLeftMargin). 한 단계와 끝값은 코어가 정한다.
const marginLeftDown = { run: () => applyStyle({ marginLeftStep: -1 }) };
const marginLeftUp = { run: () => applyStyle({ marginLeftStep: 1 }) };
const numberRun = { run: () => applyStyle({ headingToggle: "NUMBER" }) };
const bulletRun = { run: () => applyStyle({ headingToggle: "BULLET" }) };
const outlineMenu = {
  menu: true,
  menuItems: [
    { label: "개요 적용/해제", run: () => applyStyle({ headingToggle: "OUTLINE" }) },
    { type: "separator" },
    { label: "한 수준 아래로", run: () => applyStyle({ headingLevelStep: 1 }) },
    { label: "한 수준 위로", run: () => applyStyle({ headingLevelStep: -1 }) },
  ],
};
// 스타일 단추 메뉴: 스타일 대화 상자(F6)와 문서 스타일들.
const styleItems = (names) => [
  { label: "스타일...", run: () => openFormatDialog("style") },
  ...names.map((name) => ({ label: name, run: () => applyStyle({ styleName: name }) })),
];

// 문단 번호·글머리표. 커서 문단의 머리 종류면 눌린 모양이다.
function HeadingStack({ onUse }) {
  const style = useCursorStyle();
  return (
    <SmallStack
      items={[
        { label: "문단 번호", on: style.headingType === "NUMBER", ...numberRun },
        { label: "글머리표", on: style.headingType === "BULLET", ...bulletRun },
      ]}
      onUse={onUse}
    />
  );
}

// 스타일 단추(▾). 문서 스타일을 모두 펼친다.
function StyleMenuButton({ onUse }) {
  const names = useStyleNames();
  return <BigButton item={{ type: "big", label: "스타일", menu: true, menuItems: styleItems(names) }} onUse={onUse} />;
}

function MobileStyleTile({ onUse }) {
  const names = useStyleNames();
  return <MobileTile item={{ label: "스타일", menu: true, menuItems: styleItems(names) }} onUse={onUse} />;
}

// 표 구조 명령. 칸은 캐럿(칸 블록이면 그 범위)이고 규칙은 코어가 정한다.
const tableRun = (kind, options) => ({ run: () => tableEdit(kind, options) });

// 표 레이아웃 탭의 펼침 목록. 한글 TextAlignButton·TableTextDirectionButton·TableMarginButton·InsertCaptionButton 의
// 차례와 이름이다. 무엇을 바꿀지는 코어가 정한다.
const cellAlignMenu = {
  menu: true,
  menuItems: [
    { label: "위쪽 정렬", run: () => tableEdit("cellAlign", { vertAlign: "TOP" }) },
    { label: "세로 가운데 정렬", run: () => tableEdit("cellAlign", { vertAlign: "CENTER" }) },
    { label: "아래쪽 정렬", run: () => tableEdit("cellAlign", { vertAlign: "BOTTOM" }) },
    { type: "separator" },
    ...[["위", "TOP"], ["가운데", "CENTER"], ["아래", "BOTTOM"]].flatMap(([v, vert]) =>
      [["왼쪽", "LEFT"], ["가운데", "CENTER"], ["오른쪽", "RIGHT"]].map(([h, horz]) => ({
        label: `${v} ${h} 정렬`,
        run: () => tableEdit("cellAlign", { vertAlign: vert, horzAlign: horz }),
      })),
    ),
  ],
};
const cellDirectionMenu = {
  menu: true,
  menuItems: [
    { label: "가로", run: () => tableEdit("cellDirection", { direction: 0 }) },
    { label: "세로 - 영문 눕힘", run: () => tableEdit("cellDirection", { direction: 1 }) },
    { label: "세로 - 영문 세움", run: () => tableEdit("cellDirection", { direction: 2 }) },
  ],
};
const marginNames = [["보통", "normal"], ["넓게", "wide"], ["좁게", "narrow"], ["없음", "none"]];
const tableMarginMenu = {
  menu: true,
  menuItems: [
    ...marginNames.map(([label, preset]) => ({ label: `표 바깥 여백 ${label}`, run: () => tableEdit("tableMargin", { margin: "outer", preset }) })),
    { type: "separator" },
    ...marginNames.map(([label, preset]) => ({ label: `모든 셀의 안 여백 ${label}`, run: () => tableEdit("tableMargin", { margin: "inner", preset }) })),
  ],
};
const captionMenu = {
  menu: true,
  menuItems: [
    ...[["위", "TOP"], ["왼쪽 위", "LEFT_TOP"], ["왼쪽 가운데", "LEFT_CENTER"], ["왼쪽 아래", "LEFT_BOTTOM"], ["오른쪽 위", "RIGHT_TOP"], ["오른쪽 가운데", "RIGHT_CENTER"], ["오른쪽 아래", "RIGHT_BOTTOM"], ["아래", "BOTTOM"]].map(([label, caption]) => ({
      label,
      run: () => setCaption(caption),
    })),
    { type: "separator" },
    { label: "캡션 없음", run: () => setCaption("NONE") },
  ],
};
// 주석 탭(한글 2024 주석 상황 탭: 각주▾·미주▾·단 각주▾·각주/미주 모양·번호 모양▾·보통/작게·닫기).
// 고치는 값은 주석 모양 대화 상자와 같은 이름이고, 넣는 일은 코어가 한다.
const inEndnote = () => Number(window.__chwpCursorStyle?.caret?.note) === 2;
const noteMenu = (endnote, items) => ({
  menu: true,
  menuItems: items.map(([label, patch]) => ({ label, run: () => setNoteShape(patch, endnote, true) })),
});
const noteNumberFormats = [
  ["1,2,3", "DIGIT"], ["①,②,③", "CIRCLED_DIGIT"], ["I,II,III", "ROMAN_CAPITAL"], ["i,ii,iii", "ROMAN_SMALL"],
  ["A,B,C", "LATIN_CAPITAL"], ["a,b,c", "LATIN_SMALL"], ["가,나,다", "HANGUL_SYLLABLE"], ["ㄱ,ㄴ,ㄷ", "HANGUL_JAMO"],
  ["일,이,삼", "HANGUL_PHONETIC"], ["一,二,三", "IDEOGRAPH"],
];
// 메모(한글 입력 탭 메모 펼침: 메모 넣기·고치기·지우기).
const memoMenu = {
  menu: true,
  run: () => openMemoDialog("insert"),
  menuItems: [
    { label: "메모 넣기", run: () => openMemoDialog("insert") },
    { label: "메모 고치기", run: () => openMemoDialog("edit") },
    { label: "메모 지우기", run: () => void deleteMemo() },
  ],
};

// 블록 계산(한글 도구 탭 블록 계산 펼침: 블록 합계·블록 평균). 수를 읽는 규칙과 넣을 자리는 코어가 정한다.
// 제목 차례(한글 도구 탭 제목 차례 펼침): 차례 만들기, 차례 새로 고침(캐럿 차례 Ctrl+K,U·모든 차례 Ctrl+K,A).
const tocMenu = {
  menu: true,
  icon: "개요",
  run: () => openTocDialog(),
  menuItems: [
    { label: "차례 만들기...", run: () => openTocDialog() },
    { label: "차례 새로 고침", run: () => updateToc(false) },
    { label: "모든 차례 새로 고침", run: () => updateToc(true) },
  ],
};

const blockCalcMenu = {
  menu: true,
  icon: "계산식",
  run: () => openBlockCalcDialog("sum"),
  menuItems: [
    { label: "블록 합계", run: () => openBlockCalcDialog("sum") },
    { label: "블록 평균", run: () => openBlockCalcDialog("average") },
  ],
};

// 줄 번호(한글 쪽 탭 줄 번호 펼침: ShowLineNumbers·SuppressLineNumbers·SetLineNumbersDlg).
const lineNumberMenu = {
  menu: true,
  menuItems: [
    { label: "줄 번호 표시", run: () => void toggleLineNumbers() },
    { label: "현재 문단에서 줄 번호 숨기기", run: () => void toggleSuppressLineNumbers() },
    { type: "separator" },
    { label: "줄 번호 설정...", run: openLineNumberDialog },
  ],
};

// 바탕쪽 도구 상자(한글 MasterPageType*·MasterPageToPrev/Next·DeleteMasterPage*·MasterPageFront·DuplicateMasterPage·
// ExcludeFirstPage). 종류 단추는 그 종류 바탕쪽으로 옮기고, 없으면 만든다.
const masterType = (type) => ({ run: () => pageControl("masterPage", { type }) });
const masterDeleteMenu = {
  menu: true,
  menuItems: [
    { label: "현재 바탕쪽 지우기", run: () => pageControl("deleteMaster", { scope: "current" }) },
    { label: "현재 구역의 바탕쪽 지우기", run: () => pageControl("deleteMaster", { scope: "section" }) },
    { label: "문서 전체의 바탕쪽 지우기", run: () => pageControl("deleteMaster", { scope: "document" }) },
  ],
};
const masterTabItems = [
  big("양쪽", { icon: "바탕쪽", ...masterType("BOTH") }),
  big("홀수 쪽", { icon: "바탕쪽", ...masterType("ODD") }),
  big("짝수 쪽", { icon: "바탕쪽", ...masterType("EVEN") }),
  big("마지막 쪽", { icon: "바탕쪽", ...masterType("LAST_PAGE") }),
  big("임의 쪽", { icon: "바탕쪽", run: openMasterPageDialog }),
  sep,
  big("이전 바탕쪽", { icon: "이전", run: () => pageControl("prevMaster") }),
  big("다음 바탕쪽", { icon: "다음", run: () => pageControl("nextMaster") }),
  sep,
  big("인쇄 시 맨 위로", { icon: "바탕쪽", run: () => toggleMasterOption("front") }),
  big("겹치게 하기", { icon: "바탕쪽", run: () => toggleMasterOption("duplicate") }),
  big("첫 쪽 제외", { icon: "바탕쪽", run: () => toggleMasterOption("excludeFirst") }),
  sep,
  big("바탕쪽 지우기", { icon: "지우기", ...masterDeleteMenu }),
  big("닫기", { run: () => pageControl("closeMaster") }),
];

const noteTabItems = [
  big("각주", noteMenu(false, [["꼬리말 바로 위", { beneathText: false }], ["본문 아래", { beneathText: true }]])),
  big("미주", noteMenu(true, [["문서의 끝", { place: "END_OF_DOCUMENT" }], ["구역의 끝", { place: "END_OF_SECTION" }]])),
  big("단 각주", { icon: "각주", ...noteMenu(false, [["각 단 아래", { place: "EACH_COLUMN" }], ["전단", { place: "MERGED_COLUMN" }], ["오른쪽 단 아래", { place: "RIGHT_MOST_COLUMN" }]]) }),
  big("각주/미주 모양", { icon: "각주", run: () => openNoteShapeDialog(inEndnote()) }),
  sep,
  big("번호 모양", {
    icon: "문단 번호",
    menu: true,
    menuItems: noteNumberFormats.map(([label, numFormat]) => ({ label, run: () => setNoteShape({ numFormat }, inEndnote(), true) })),
  }),
  big("보통", { icon: "글자 모양", run: () => setNoteShape({ superscript: false }, inEndnote(), true) }),
  big("작게", { icon: "위 첨자", run: () => setNoteShape({ superscript: true }, inEndnote(), true) }),
  sep,
  big("모든 각주를 미주로", { icon: "미주", run: () => exchangeNotes(0) }),
  big("모든 미주를 각주로", { icon: "각주", run: () => exchangeNotes(1) }),
  big("각주↔미주", { icon: "각주", run: () => exchangeNotes(2) }),
  sep,
  big("닫기", { run: leaveNote }),
];

// 단 ▾(한글 ColumnListButton: 하나·둘·셋·왼쪽·오른쪽, 다단 설정). 목록은 문서 전체에 넣는다(한글 MultiColumnPreset 의
// 적용 범위 첫 칸). 너비는 코어가 정한다.
const columnMenu = {
  menu: true,
  menuItems: [
    ...[["하나", "one"], ["둘", "two"], ["셋", "three"], ["왼쪽", "left"], ["오른쪽", "right"]].map(([label, preset]) => ({
      label,
      run: () => setColumns({ preset, applyTo: "WHOLE" }),
    })),
    { type: "separator" },
    { label: "단 설정...", run: openColumnDialog },
  ],
};

// 1,000 단위 구분 쉼표(한글 ThousandsSeparatorButton: 자릿점 넣기·빼기). 칸 블록에만 한다.
// 계산식(한글 FormulaButton): 블록 계산식(블록 합계·평균·곱), 쉬운 계산식(가로·세로 합계·평균·곱), 계산식 대화 상자.
// 어디에 어떤 식을 넣을지는 코어(tableEdit formula)가 정한다.
const formulaRun = (formulaMode, formulaFunc) => tableRun("formula", { formulaMode, formulaFunc });
const formulaMenu = {
  menu: true,
  menuItems: [
    { label: "블록 합계", ...formulaRun("block", 0) },
    { label: "블록 평균", ...formulaRun("block", 1) },
    { label: "블록 곱", ...formulaRun("block", 2) },
    { type: "separator" },
    { label: "가로 합계", ...formulaRun("horizontal", 0) },
    { label: "세로 합계", ...formulaRun("vertical", 0) },
    { label: "가로 평균", ...formulaRun("horizontal", 1) },
    { label: "세로 평균", ...formulaRun("vertical", 1) },
    { label: "가로 곱", ...formulaRun("horizontal", 2) },
    { label: "세로 곱", ...formulaRun("vertical", 2) },
    { type: "separator" },
    { label: "계산식...", run: openTableFormulaDialog },
  ],
};
const commaMenu = {
  menu: true,
  menuItems: [
    { label: "자릿점 넣기", run: () => tableEdit("comma", { comma: "insert" }) },
    { label: "자릿점 빼기", run: () => tableEdit("comma", { comma: "delete" }) },
  ],
};
const wrapMenu = {
  menu: true,
  menuItems: [
    { label: "어울림", run: () => tableEdit("wrap", { wrap: "SQUARE" }) },
    { label: "자리 차지", run: () => tableEdit("wrap", { wrap: "TOP_AND_BOTTOM" }) },
    { label: "글 앞으로", run: () => tableEdit("wrap", { wrap: "IN_FRONT_OF_TEXT" }) },
    { label: "글 뒤로", run: () => tableEdit("wrap", { wrap: "BEHIND_TEXT" }) },
  ],
};

// 머리말·꼬리말 만들기(한글 HeaderNormal·FooterNormal 의 양쪽·홀수 쪽·짝수 쪽). 넣을 자리는 코어가 정하고,
// 만든 뒤 그 쪽 머리말 편집으로 들어간다.
const bandMenu = (kind) => ({
  menu: true,
  menuItems: [
    { label: "양쪽", run: () => pageControl(kind, { apply: "BOTH" }) },
    { label: "홀수 쪽", run: () => pageControl(kind, { apply: "ODD" }) },
    { label: "짝수 쪽", run: () => pageControl(kind, { apply: "EVEN" }) },
    { type: "separator" },
    { label: "머리말/꼬리말...", run: openHeaderFooterDialog },
  ],
});
const headerMenu = bandMenu("header");
const footerMenu = bandMenu("footer");
const pageDialogRun = (kind) => ({ run: () => openPageDialog(kind) });
const deleteBand = { run: () => pageControl("deleteBand") };

// 셀 테두리 단추. 한글 CellBorderButton 의 펼침 차례다. 켜고 끄기와 이웃 칸 처리는 코어가 정한다.
const cellBorderItems = [
  ["테두리 없음", "none"], ["모든 테두리", "all"], ["바깥쪽 테두리", "outside"], ["안쪽 테두리", "inside"],
  { type: "separator" },
  ["위쪽 테두리", "top"], ["아래쪽 테두리", "bottom"], ["왼쪽 테두리", "left"], ["오른쪽 테두리", "right"],
  { type: "separator" },
  ["안쪽 가로 테두리", "insideHorz"], ["안쪽 세로 테두리", "insideVert"], ["대각선 ╲", "diagonalDown"], ["대각선 ╱", "diagonalUp"],
].map((entry) => (Array.isArray(entry) ? { label: entry[0], run: () => cellBorder(entry[1]) } : entry));
const cellBorderMenu = { menu: true, menuItems: cellBorderItems };

// 표 채우기: 블록 칸 배경. 채우기 없음이면 배경을 지운다.
const pickTableFill = (hex) => tableEdit("cellFill", { color: hex || "none" });

// 테두리 종류·굵기 목록은 코어가 준다(문단 모양 테두리와 같은 목록).
function usePenChoices() {
  const [choices, setChoices] = useState({ types: [], widths: [] });
  useEffect(() => {
    let alive = true;
    void Promise.resolve(window.__chwpFormatView?.(1, {}))
      .then((view) => {
        if (!alive || !view?.specs) return;
        const options = (key) => view.specs[key]?.options || [];
        setChoices({ types: options("para.penType"), widths: options("para.penWidth") });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return choices;
}

const penTypeLabel = (id, label) => label || lineShapeLabels[id] || id;

// 표 디자인 탭 오른쪽 묶음(한글: 표 채우기·테두리·셀 음영 / 테두리 종류·굵기·색). 두 칸 세 줄이다.
function TablePenGrid({ onUse }) {
  const pen = useTablePen();
  const { types, widths } = usePenChoices();
  const row = "ui-rb flex h-[1.35em] items-center gap-[0.35em] rounded-[0.4em] px-[0.35em] text-[0.9em] whitespace-nowrap";
  const caret = <ChevronDown className="size-[0.75em] text-[#737373]" />;
  const menu = (label, icon, items) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className={row} title={label}>{icon}{label}{caret}</button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {items.map((entry, index) =>
          entry.type === "separator" ? (
            <DropdownMenuSeparator key={`sep-${index}`} />
          ) : (
            <DropdownMenuItem key={entry.label} onSelect={() => { onUse?.(); entry.run(); }}>
              {entry.icon || null}
              {entry.label}
            </DropdownMenuItem>
          ),
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const typeItems = types.map(([id, label]) => ({ label: penTypeLabel(id, label), icon: <LineTypeIcon type={id} />, run: () => setTablePen({ lineType: id }) }));
  const widthItems = widths.map(([id, label]) => ({ label: label || id, icon: <LineWidthIcon hu={id} />, run: () => setTablePen({ lineWidth: Number(id) || 0 }) }));
  const small = (name) => <RibbonIcon name={name} className="size-[1.1em]" />;
  return (
    <div className="grid flex-none grid-cols-2 grid-rows-3 gap-x-[0.2em] gap-y-[0.15em]">
      <ColorPopover title="표 채우기" value="#ffff00" allowNone noneLabel="채우기 없음" onPick={(hex) => { onUse?.(); pickTableFill(hex); }}>
        <button type="button" className={row} title="표 채우기">{small("셀 배경색")}표 채우기{caret}</button>
      </ColorPopover>
      {menu("테두리 종류", <LineTypeIcon type={pen.lineType || "SOLID"} />, typeItems)}
      {menu("테두리", small("셀 테두리"), cellBorderItems)}
      {menu("테두리 굵기", <LineWidthIcon hu={pen.lineWidth || 34} />, widthItems)}
      <button type="button" className={row} title="셀 음영" onClick={() => run({ label: "셀 음영" }, onUse)}>{small("셀 음영")}셀 음영{caret}</button>
      <ColorPopover title="테두리 색" value={pen.lineColor || "#000000"} onPick={(hex) => { onUse?.(); setTablePen({ lineColor: hex || "" }); }}>
        <button type="button" className={row} title="테두리 색">
          <span className="h-[0.9em] w-[1.1em] rounded-[2px] border border-[#d4d4d4]" style={{ backgroundColor: pen.lineColor || "#000000" }} />
          테두리 색{caret}
        </button>
      </ColorPopover>
    </div>
  );
}

// 표 스타일 적용 옵션(한글 ApplyTable* 체크 상자). 표 스타일이 아직 없어 누르면 준비 중이다.
function TableStyleOptions({ onUse }) {
  const names = ["테두리", "회색조", "첫째 칸", "글자/문단 모양", "제목 줄", "마지막 칸", "셀 배경", "마지막 줄", "처음 값으로"];
  return (
    <div className="grid flex-none grid-cols-3 gap-x-[0.6em] gap-y-[0.15em] text-[0.9em] text-[#a3a3a3]">
      {names.map((name) => (
        <button key={name} type="button" className="flex h-[1.35em] items-center gap-[0.3em] whitespace-nowrap" onClick={() => run({ label: `표 스타일 ${name}` }, onUse)}>
          {name === "처음 값으로" ? null : <span className="size-[0.85em] rounded-[2px] border border-[#d4d4d4]" />}
          {name}
        </button>
      ))}
    </div>
  );
}

function MobileTableFill({ onUse }) {
  return (
    <ColorPopover title="표 채우기" value="#ffff00" allowNone noneLabel="채우기 없음" onPick={(hex) => { onUse?.(); pickTableFill(hex); }}>
      <button type="button" className="ui-rb flex h-[76px] min-w-0 flex-col items-center justify-start gap-[4px] rounded-[10px] px-[2px] pt-[10px]">
        <RibbonIcon name="셀 배경색" className="size-[26px]" />
        <span className="text-center text-[12px] leading-[1.2]">표 채우기</span>
      </button>
    </ColorPopover>
  );
}

function MobilePenColor({ onUse }) {
  const pen = useTablePen();
  return (
    <ColorPopover title="테두리 색" value={pen.lineColor || "#000000"} onPick={(hex) => { onUse?.(); setTablePen({ lineColor: hex || "" }); }}>
      <button type="button" className="ui-rb flex h-[76px] min-w-0 flex-col items-center justify-start gap-[4px] rounded-[10px] px-[2px] pt-[10px]">
        <span className="mt-[3px] h-[20px] w-[26px] rounded-[3px] border border-[#d4d4d4]" style={{ backgroundColor: pen.lineColor || "#000000" }} />
        <span className="text-center text-[12px] leading-[1.2]">테두리 색</span>
      </button>
    </ColorPopover>
  );
}

function MobilePenMenu({ kind, onUse }) {
  const { types, widths } = usePenChoices();
  const items = kind === "type"
    ? types.map(([id, label]) => ({ label: penTypeLabel(id, label), run: () => setTablePen({ lineType: id }) }))
    : widths.map(([id, label]) => ({ label: label || id, run: () => setTablePen({ lineWidth: Number(id) || 0 }) }));
  const label = kind === "type" ? "테두리 종류" : "테두리 굵기";
  return <MobileTile item={{ label, icon: "셀 테두리", menu: true, menuItems: items }} onUse={onUse} />;
}

const tableInsertItems = [
  { label: "위에 줄 추가하기", icon: "위에 줄 넣기", ...tableRun("insertRows", { after: false }) },
  { label: "아래에 줄 추가하기", icon: "아래에 줄 넣기", ...tableRun("insertRows", { after: true }) },
  { label: "왼쪽에 칸 추가하기", icon: "왼쪽에 칸 넣기", ...tableRun("insertColumns", { after: false }) },
  { label: "오른쪽에 칸 추가하기", icon: "오른쪽에 칸 넣기", ...tableRun("insertColumns", { after: true }) },
];

// 탭별 리본. 시안 Main.dc.html 의 순서·묶음 그대로다.
const ribbons = {
  [tableDesignTab]: [
    big("표 만들기", { icon: "표", run: openTableDialog }),
    { type: "stack", items: [{ label: "표 그리기", icon: "셀 테두리" }, { label: "표 지우개", icon: "줄 지우기" }] },
    sep,
    big("차트 만들기", { icon: "차트" }),
    big("표 속성", { icon: "표", run: openTablePropertiesDialog }),
    sep,
    custom(TableStyleOptions),
    sep,
    big("표 스타일", { icon: "표", menu: true }),
    sep,
    custom(TablePenGrid),
    sep,
    big("표마당", { icon: "표" }),
  ],
  [tableLayoutTab]: [
    big("투명 선", { icon: "셀 테두리" }),
    sep,
    big("줄/칸 추가하기", { icon: "아래에 줄 넣기", menu: true, menuItems: tableInsertItems }),
    { type: "stack", items: tableInsertItems.slice(0, 2) },
    { type: "stack", items: tableInsertItems.slice(2) },
    { type: "stack", items: [{ label: "칸 지우기", ...tableRun("deleteColumns") }, { label: "줄 지우기", ...tableRun("deleteRows") }] },
    sep,
    big("셀 나누기", { run: () => openTableDialog("split") }),
    big("셀 합치기", tableRun("mergeCells")),
    sep,
    big("셀 너비를 같게", tableRun("equalWidth")),
    big("셀 높이를 같게", tableRun("equalHeight")),
    sep,
    big("글자 방향", cellDirectionMenu),
    big("내용 정렬", cellAlignMenu),
    sep,
    big("표 여백", tableMarginMenu),
    big("표 뒤집기", { run: openTableFlipDialog }),
    big("표 나누기", tableRun("splitTable")),
    big("표 붙이기", tableRun("mergeTable")),
    sep,
    big("표를 문자열로", { icon: "표", run: openTableToTextDialog }),
    big("문자열을 표로", { icon: "표", run: openTextToTableDialog }),
    sep,
    big("채우기", { ...tableRun("autoFill"), menu: true, menuItems: [{ label: "표 자동 채우기", ...tableRun("autoFill") }] }),
    big("계산식", formulaMenu),
    big("1,000 단위 구분 쉼표", { icon: "계산식", ...commaMenu }),
    big("정렬", { run: openTableSortDialog }),
    sep,
    big("표를 문자열로", { icon: "표", run: openTableToTextDialog }),
    big("문자열을 표로", { icon: "표", run: openTextToTableDialog }),
    sep,
    big("글자처럼 취급", tableRun("treatAsChar")),
    big("배치", { icon: "글자처럼 취급", ...wrapMenu }),
    big("캡션", captionMenu),
  ],
  [noteTab]: noteTabItems,
  [masterTab]: masterTabItems,
  [bandTab]: [
    big("머리말", headerMenu),
    big("꼬리말", footerMenu),
    sep,
    big("이전 머리말/꼬리말", { icon: "이전", run: () => pageControl("prevBand") }),
    big("다음 머리말/꼬리말", { icon: "다음", run: () => pageControl("nextBand") }),
    sep,
    big("쪽 번호 넣기", { icon: "쪽 번호 매기기", run: () => pageControl("insertPageNum") }),
    big("현재 쪽만 감추기", pageDialogRun("pageHiding")),
    sep,
    big("머리말/꼬리말 지우기", { icon: "지우기", ...deleteBand }),
    big("닫기", { run: leaveBand }),
  ],
  편집: [
    big("되돌리기", { run: () => selectionAction("undo") }),
    big("다시 실행", { run: () => selectionAction("redo") }),
    big("오려두기", { run: () => selectionAction("cut") }),
    big("복사하기", { run: () => selectionAction("copy") }),
    big("붙여넣기", { run: () => selectionAction("paste") }),
    big("모양 복사", { run: () => runShortcut("copyShape") }),
    big("조판 부호 지우기", { icon: "지우기", run: openDeleteMarksDialog }),
    big("찾기 및 바꾸기", { run: openFindDialog }),
    big("찾아가기", { run: openGoToDialog }),
    big("글자 바꾸기", { menu: true, menuItems: [{ label: "대문자/소문자 바꾸기", run: openCaseDialog }, { label: "전각/반각 바꾸기", run: openWidthDialog }] }),
    big("정렬", { run: openTableSortDialog }),
    sep,
    big("글자 모양", { run: () => openFormatDialog("char") }),
    big("문단 모양", { run: () => openFormatDialog("para") }),
    custom(StyleMenuButton),
    sep,
    big("세로", portrait),
    big("가로", landscape),
    big("쪽 여백", marginMenu),
    big("바탕쪽", { run: openMasterPageDialog }),
    big("단", columnMenu),
    sep,
    big("도형", shapeMenu),
    big("그림", { run: pickPicture }),
    big("표", { run: openTableDialog, menu: true, menuItems: [{ label: "표 만들기...", run: openTableDialog }, { type: "separator" }, { label: "문자열을 표로...", run: openTextToTableDialog }, { label: "표를 문자열로...", run: openTableToTextDialog }] }),
    big("차트", { menu: true }),
  ],
  보기: [
    custom(ViewChecks),
    sep,
    big("격자", gridMenu),
    big("안내선", guideMenu),
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
    big("표", { run: openTableDialog, menu: true, menuItems: [{ label: "표 만들기...", run: openTableDialog }, { type: "separator" }, { label: "문자열을 표로...", run: openTextToTableDialog }, { label: "표를 문자열로...", run: openTableToTextDialog }] }),
    big("캡션", { icon: "글상자", ...captionMenu }),
    big("차트", { menu: true }),
    big("수식", { run: openEquationDialog }),
    // 한글 InsertFieldCtrl: 한글 기본 안내문으로 누름틀을 바로 넣는다. 고치기는 캐럿이 든 누름틀(Ctrl+N,K 와 같다).
    big("누름틀", { run: () => runShortcut("insertClickHere"), menu: true, menuItems: [{ label: "누름틀 넣기", run: () => runShortcut("insertClickHere") }, { label: "누름틀 고치기...", run: () => runShortcut("clickHereEdit") }] }),
    sep,
    big("각주", { run: () => insertNote(false) }),
    big("미주", { run: () => insertNote(true) }),
    big("메모", memoMenu),
    sep,
    big("문자표", { run: openSymbolDialog }),
    big("하이퍼링크", { run: openHyperlinkDialog }),
    // 한글 HyperlinkPrev·HyperlinkNext: 따라간 링크 이력의 앞·뒤(Ctrl+Q,B / Ctrl+Q,R).
    { type: "stack", items: [{ label: "이전", run: () => runShortcut("linkBack") }, { label: "다음", run: () => runShortcut("linkForward") }] },
    big("책갈피", { run: openBookmarkDialog }),
    sep,
    big("덧말 넣기", { run: openRubyDialog }),
    big("입력 도우미", { menu: true, menuItems: [{ label: "글자 겹치기", run: openComposeDialog }] }),
  ],
  서식: [
    custom(StyleGallery),
    sep,
    big("글자 모양", { run: () => openFormatDialog("char") }),
    custom(CharMini),
    sep,
    big("문단 모양", { run: () => openFormatDialog("para") }),
    big("문단 정렬", alignMenu),
    { type: "stack", items: [{ label: "왼쪽 여백 줄이기", ...marginLeftDown }, { label: "왼쪽 여백 늘리기", ...marginLeftUp }] },
    { type: "stack", items: [{ label: "들여쓰기", ...indentIn }, { label: "내어쓰기", ...indentOut }] },
    sep,
    big("개요", outlineMenu),
    custom(HeadingStack),
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
    big("바탕쪽", { run: openMasterPageDialog }),
    big("머리말", headerMenu),
    big("꼬리말", footerMenu),
    big("쪽 테두리/배경", { run: () => openFormatDialog("pageBorder") }),
    big("쪽 번호 매기기", pageDialogRun("pageNumber")),
    big("새 번호로 시작", pageDialogRun("newNumber")),
    big("현재 쪽만 감추기", pageDialogRun("pageHiding")),
    big("줄 번호", { icon: "문단 번호", ...lineNumberMenu }),
    sep,
    big("쪽 나누기", { run: () => insertBreak("page") }),
    big("단 나누기", { run: () => insertBreak("column") }),
    big("쪽 지우기", { icon: "지우기", menu: true, menuItems: [
      { label: "현재 쪽 지우기", run: () => void deleteCurrentPage() },
      { label: "쪽 지우기...", run: openDeletePageDialog },
    ] }),
    sep,
    big("단", columnMenu),
    big("단 설정 나누기", { run: () => insertBreak("columnDef") }),
    sep,
    big("구역 설정", { run: openSectionDialog }),
    big("구역 나누기", { run: () => insertBreak("section") }),
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
  // 한글 검토 탭: 변경 내용 추적(기록 켜기·끄기), 적용·적용 안 함(캐럿 자리·모두), 이전·다음 바뀜. 규칙은 코어가 정한다.
  검토: [
    big("변경 내용 추적", { run: () => runShortcut("trackChanges") }),
    sep,
    // 큰 단추는 한글처럼 "적용(취소) 후 다음으로 이동"이다.
    big("적용", { run: () => runShortcut("acceptAndMove"), menu: true, menuItems: [{ label: "적용 후 다음으로 이동", run: () => runShortcut("acceptAndMove") }, { label: "변경 내용 적용", run: () => runShortcut("acceptChange") }, { label: "표시된 변경 내용 모두 적용", run: () => runShortcut("acceptAllChanges") }, { label: "문서에서 변경 내용 모두 적용", run: () => runShortcut("acceptAllChanges") }] }),
    big("적용 안 함", { run: () => runShortcut("rejectAndMove"), menu: true, menuItems: [{ label: "취소 후 다음으로 이동", run: () => runShortcut("rejectAndMove") }, { label: "변경 내용 취소", run: () => runShortcut("rejectChange") }, { label: "표시된 변경 내용 모두 취소", run: () => runShortcut("rejectAllChanges") }, { label: "문서에서 변경 내용 모두 취소", run: () => runShortcut("rejectAllChanges") }] }),
    { type: "stack", items: [{ label: "이전", run: () => runShortcut("prevChange") }, { label: "다음", run: () => runShortcut("nextChange") }] },
    sep,
    big("메모", memoMenu),
  ],
  도구: [
    big("제목 차례", tocMenu),
    big("블록 계산", blockCalcMenu),
    big("교정 부호", { icon: "메모", run: () => openProofMarkDialog() }),
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
              <MenuCheck entry={entry} />
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
  const guides = useViewGuides();
  return labels.map((label) => {
    const mark = viewMarkCheck(label, guides);
    return (
      <MobileCheck
        key={label}
        label={label}
        checked={mark ? mark.checked : label === "그림" || (label === "눈금자" && rulersOn)}
        onChange={mark ? mark.onChange : label === "눈금자" ? toggleRulers : null}
        onUse={onUse}
      />
    );
  });
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
        onClick={() => run({ label: "스타일 바꾸기", run: () => applyStyle({ styleName: name }) }, onUse)}
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
      <ColorPopover title="형광펜" value="#ffff00" allowNone noneLabel="형광펜 지우기" onPick={(hex) => { onUse?.(); applyStyle({ markpen: hex || "" }); }}>
        <button type="button" className="ui-rb flex h-[76px] min-w-0 flex-col items-center justify-start gap-[4px] rounded-[10px] px-[2px] pt-[10px]">
          <RibbonIcon name="형광펜" className="size-[26px]" />
          <span className="text-center text-[12px] leading-[1.2]">형광펜</span>
        </button>
      </ColorPopover>
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
  [tableDesignTab]: [
    ["표", [tile("표 만들기", { icon: "표", run: openTableDialog }), tile("표 속성", { icon: "표", run: openTablePropertiesDialog }), tile("표 스타일", { icon: "표", menu: true }), tile("표마당", { icon: "표" })]],
    ["테두리", [tile("테두리", { icon: "셀 테두리", ...cellBorderMenu }), view(MobilePenMenu, { kind: "type" }), view(MobilePenMenu, { kind: "width" }), view(MobilePenColor)]],
    ["채우기", [view(MobileTableFill), tile("셀 음영", { icon: "셀 배경색" })]],
  ],
  [tableLayoutTab]: [
    ["추가", tableInsertItems.map((item) => tile(item.label, item))],
    ["지우기", [tile("줄 지우기", tableRun("deleteRows")), tile("칸 지우기", tableRun("deleteColumns"))]],
    ["셀", [tile("셀 나누기", { run: () => openTableDialog("split") }), tile("셀 합치기", tableRun("mergeCells")), tile("셀 너비를 같게", tableRun("equalWidth")), tile("셀 높이를 같게", tableRun("equalHeight")), tile("표 자동 채우기", tableRun("autoFill")), tile("정렬", { run: openTableSortDialog }), tile("블록 합계", formulaRun("block", 0)), tile("계산식", { run: openTableFormulaDialog })]],
    ["표", [tile("글자 방향", cellDirectionMenu), tile("내용 정렬", cellAlignMenu), tile("표 여백", tableMarginMenu), tile("표 뒤집기", { run: openTableFlipDialog }), tile("캡션", captionMenu)]],
    ["배치", [tile("글자처럼 취급", tableRun("treatAsChar")), tile("배치", { icon: "글자처럼 취급", ...wrapMenu }), tile("표 나누기", tableRun("splitTable")), tile("표 붙이기", tableRun("mergeTable"))]],
  ],
  [masterTab]: [
    ["바탕쪽", [tile("닫기", { run: () => pageControl("closeMaster") }), tile("양쪽", { icon: "바탕쪽", ...masterType("BOTH") }),
      tile("홀수 쪽", { icon: "바탕쪽", ...masterType("ODD") }), tile("짝수 쪽", { icon: "바탕쪽", ...masterType("EVEN") }),
      tile("마지막 쪽", { icon: "바탕쪽", ...masterType("LAST_PAGE") }), tile("임의 쪽", { icon: "바탕쪽", run: openMasterPageDialog })]],
    ["이동", [tile("이전", { icon: "이전", run: () => pageControl("prevMaster") }), tile("다음", { icon: "다음", run: () => pageControl("nextMaster") })]],
    ["속성", [tile("맨 위로", { icon: "바탕쪽", run: () => toggleMasterOption("front") }), tile("겹치게", { icon: "바탕쪽", run: () => toggleMasterOption("duplicate") }),
      tile("첫 쪽 제외", { icon: "바탕쪽", run: () => toggleMasterOption("excludeFirst") }), tile("지우기", { icon: "지우기", ...masterDeleteMenu })]],
  ],
  [bandTab]: [
    ["머리말/꼬리말", [tile("닫기", { run: leaveBand }), tile("머리말", headerMenu), tile("꼬리말", footerMenu), tile("이전", { icon: "이전", run: () => pageControl("prevBand") }), tile("다음", { icon: "다음", run: () => pageControl("nextBand") })]],
    ["넣기", [tile("쪽 번호 넣기", { icon: "쪽 번호 매기기", run: () => pageControl("insertPageNum") }), tile("현재 쪽만 감추기", pageDialogRun("pageHiding")), tile("지우기", { icon: "지우기", ...deleteBand })]],
  ],
  // 주석 탭(데스크톱 noteTabItems 와 같은 항목). 펼침 목록과 값은 같은 noteMenu 를 쓴다.
  [noteTab]: [
    ["주석", [
      tile("각주", noteMenu(false, [["꼬리말 바로 위", { beneathText: false }], ["본문 아래", { beneathText: true }]])),
      tile("미주", noteMenu(true, [["문서의 끝", { place: "END_OF_DOCUMENT" }], ["구역의 끝", { place: "END_OF_SECTION" }]])),
      tile("단 각주", { icon: "각주", ...noteMenu(false, [["각 단 아래", { place: "EACH_COLUMN" }], ["전단", { place: "MERGED_COLUMN" }], ["오른쪽 단 아래", { place: "RIGHT_MOST_COLUMN" }]]) }),
      tile("각주/미주 모양", { icon: "각주", run: () => openNoteShapeDialog(inEndnote()) }),
    ]],
    ["번호", [
      tile("번호 모양", { icon: "문단 번호", menu: true, menuItems: noteNumberFormats.map(([label, numFormat]) => ({ label, run: () => setNoteShape({ numFormat }, inEndnote(), true) })) }),
      tile("보통", { icon: "글자 모양", run: () => setNoteShape({ superscript: false }, inEndnote(), true) }),
      tile("작게", { icon: "위 첨자", run: () => setNoteShape({ superscript: true }, inEndnote(), true) }),
    ]],
    ["닫기", [tile("닫기", { run: leaveNote })]],
  ],
  편집: [
    ["기본", [tile("되돌리기", { run: () => selectionAction("undo") }), tile("다시 실행", { run: () => selectionAction("redo") }), tile("오려두기", { run: () => selectionAction("cut") }), tile("복사하기", { run: () => selectionAction("copy") }), tile("붙여넣기", { run: () => selectionAction("paste") }), tile("찾기 및 바꾸기", { run: openFindDialog }), tile("찾아가기", { run: openGoToDialog }), tile("대문자/소문자", { run: openCaseDialog }), tile("전각/반각", { run: openWidthDialog }), tile("정렬", { run: openTableSortDialog })]],
    ["모양", [tile("글자 모양", { run: charDialog }), tile("문단 모양", { run: paraDialog }), view(MobileStyleTile)]],
    ["쪽", [tile("세로", portrait), tile("가로", landscape), tile("쪽 여백", { menu: true, run: pageDialog }), tile("바탕쪽", { run: openMasterPageDialog }), tile("단", columnMenu)]],
    ["개체", [tile("도형", shapeMenu), tile("그림", { run: pickPicture }), tile("표", { run: openTableDialog }), tile("차트", { menu: true })]],
  ],
  보기: [
    ["표시", [view(MobileViewChecks, { labels: ["문단 부호", "그림", "조판 부호", "투명 선", "교정 부호", "메모"] })], 6],
    ["화면", [view(MobileViewChecks, { labels: ["상황 선", "문서 탭", "눈금자"] })], 3],
    ["격자", [tile("격자", gridMenu), tile("안내선", guideMenu)]],
    ["배율", [tile("축소", { run: () => requestZoom({ step: -1 }) }), tile("확대", { run: () => requestZoom({ step: 1 }) }), tile("100%", { run: () => requestZoom({ percent: 100 }) }), view(MobileFit)], 5],
  ],
  입력: [
    ["도형", [tile("글상자", drawRun("글상자")), tile("직사각형", drawRun("직사각형")), tile("타원", drawRun("타원")), tile("직선", drawRun("직선")), tile("화살표"), tile("더 보기", { glyph: "more" })]],
    ["개체", [tile("그림", { run: pickPicture }), tile("표", { run: openTableDialog }), tile("차트", { menu: true }), tile("수식", { run: openEquationDialog })]],
    ["주석", [tile("각주", { run: () => insertNote(false) }), tile("미주", { run: () => insertNote(true) }), tile("메모", memoMenu)]],
    ["링크", [tile("문자표", { run: openSymbolDialog }), tile("하이퍼링크", { run: openHyperlinkDialog }), tile("누름틀", { run: () => runShortcut("insertClickHere") }), tile("이전", { run: () => runShortcut("linkBack") }), tile("다음", { run: () => runShortcut("linkForward") }), tile("책갈피", { run: openBookmarkDialog })]],
    ["글자", [tile("덧말 넣기", { run: openRubyDialog }), tile("글자 겹치기", { run: openComposeDialog })]],
  ],
  서식: [
    ["스타일", [view(MobileStyles)], 4],
    ["글자", [view(MobileCharTiles)], 6],
    ["문단", [tile("문단 모양", { run: paraDialog }), tile("문단 정렬", alignMenu), tile("들여쓰기", indentIn), tile("내어쓰기", indentOut)]],
    ["개요", [tile("개요", outlineMenu), tile("문단 번호", numberRun), tile("글머리표", bulletRun)]],
    ["줄 간격", [view(MobileLineSpacing)], 2],
  ],
  쪽: [
    ["용지", [tile("편집 용지", { run: pageDialog }), tile("세로", portrait), tile("가로", landscape), tile("쪽 여백", { menu: true, run: pageDialog })]],
    ["방향", [tile("글자 방향", textDirectionMenu)]],
    ["쪽 꾸미기", [tile("바탕쪽", { run: openMasterPageDialog }), tile("머리말", headerMenu), tile("꼬리말", footerMenu), tile("쪽 테두리/배경", { run: () => openFormatDialog("pageBorder") })]],
    ["번호", [tile("쪽 번호 매기기", pageDialogRun("pageNumber")), tile("새 번호로 시작", pageDialogRun("newNumber")), tile("현재 쪽만 감추기", pageDialogRun("pageHiding")), tile("줄 번호", { icon: "문단 번호", ...lineNumberMenu })]],
    ["나누기", [tile("쪽 나누기", { run: () => insertBreak("page") }), tile("단 나누기", { run: () => insertBreak("column") }), tile("쪽 지우기", { icon: "지우기", run: openDeletePageDialog })]],
    ["단", [tile("단", columnMenu), tile("단 설정 나누기", { run: () => insertBreak("columnDef") })]],
    ["구역", [tile("구역 설정", { run: openSectionDialog }), tile("구역 나누기", { run: () => insertBreak("section") })]],
    ["특수 용지", [tile("라벨", { menu: true }), tile("원고지")]],
  ],
  보안: [
    ["암호", [tile("문서 암호 설정"), tile("문서 암호 변경/해제", { disabled: true })]],
    ["배포용", [tile("배포용 문서로 저장"), tile("배포용 문서 편집", { disabled: true }), tile("배포용 문서 암호 변경/해제", { disabled: true })]],
    ["개인 정보", [tile("선택 글자 보호", { disabled: true }), tile("개인 정보 찾아서 보호"), tile("개인 정보 보호 해제", { disabled: true }), tile("개인 정보 보호 암호 변경", { disabled: true })]],
    ["보안 설정", [tile("문서 보안 설정")]],
  ],
  검토: [
    ["변경 내용", [tile("변경 내용 추적", { run: () => runShortcut("trackChanges") }), tile("이전", { run: () => runShortcut("prevChange") }), tile("다음", { run: () => runShortcut("nextChange") })]],
    ["적용", [tile("적용", { run: () => runShortcut("acceptAndMove") }), tile("적용 안 함", { run: () => runShortcut("rejectAndMove") }), tile("모두 적용", { icon: "적용", run: () => runShortcut("acceptAllChanges") }), tile("모두 적용 안 함", { icon: "적용 안 함", run: () => runShortcut("rejectAllChanges") })]],
  ],
  도구: [
    ["차례", [tile("차례 만들기", { icon: "개요", run: openTocDialog }), tile("차례 새로 고침", { icon: "개요", run: () => updateToc(true) })]],
    ["계산", [tile("블록 합계", { icon: "계산식", run: () => openBlockCalcDialog("sum") }), tile("블록 평균", { icon: "계산식", run: () => openBlockCalcDialog("average") })]],
    ["교정", [tile("교정 부호", { icon: "메모", run: () => openProofMarkDialog() })]],
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
