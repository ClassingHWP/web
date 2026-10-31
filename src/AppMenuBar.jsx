import { useEffect, useRef, useState } from "react";
import {
  ALargeSmall,
  ChevronDown,
  ClipboardPaste,
  Columns2,
  Copy,
  Expand,
  FileCog,
  FilePlus,
  Info,
  FileText,
  FolderOpen,
  Grid3x3,
  Hash,
  Image,
  Maximize2,
  Minus,
  Omega,
  Palette,
  Pilcrow,
  Plus,
  Redo2,
  Ruler,
  Save,
  SaveAll,
  Scan,
  Scissors,
  Search,
  SeparatorHorizontal,
  Table,
  Type,
  Undo2,
  X,
} from "lucide-react";
import { FormatBar } from "./FormatBar.jsx";
import { useZoomState, ZoomDialog } from "./ZoomDialog.jsx";
import { bandTab, RibbonFrame, ribbonMenuItems, ribbonTabs } from "./Ribbon.jsx";
import { FormatDialogs, openFormatDialog } from "./FormatDialogs.jsx";
import { MobileFooter, MobileHeader, MobileMenuSheet } from "./MobileChrome.jsx";
import { Toaster } from "./Toast.jsx";
import { AboutDialog, openAbout } from "./AboutDialog.jsx";
import { newDocument, notReady, openFile, requestZoom, saveAs, selectionAction, toggleRulers, useBand, useRulersShown, useWide } from "./ui-actions.js";
import {
  Menubar,
  MenubarCheckboxItem,
  MenubarContent,
  MenubarItem,
  MenubarMenu,
  MenubarSeparator,
  MenubarShortcut,
  MenubarTrigger,
} from "@/components/ui/menubar";

// 탭의 ▾ 메뉴. 아이콘은 시안과 같은 lucide 다. onSelect 가 없는 명령은 아직 없는 기능이라
// 누르면 준비 중이라고 알린다. 보안은 리본 명령을 그대로 메뉴로 쓴다.
const menus = [
  {
    label: "파일",
    items: [
      { label: "새 문서", Icon: FilePlus, onSelect: newDocument },
      { type: "separator" },
      { label: "열기", Icon: FolderOpen, shortcut: "Ctrl+O", onSelect: openFile },
      { type: "separator" },
      { label: "저장", Icon: Save, shortcut: "Ctrl+S" },
      { label: "다른 이름으로 저장", Icon: SaveAll, onSelect: saveAs },
      { type: "separator" },
      { label: "ClassingHWP 정보", Icon: Info, onSelect: openAbout },
      { label: "문서 닫기", Icon: X },
    ],
  },
  {
    label: "편집",
    items: [
      { label: "되돌리기", Icon: Undo2, shortcut: "Ctrl+Z" },
      { label: "다시 실행", Icon: Redo2, shortcut: "Ctrl+Y" },
      { type: "separator" },
      { label: "오려두기", Icon: Scissors, shortcut: "Ctrl+X", onSelect: () => selectionAction("cut") },
      { label: "복사하기", Icon: Copy, shortcut: "Ctrl+C", onSelect: () => selectionAction("copy") },
      { label: "붙여넣기", Icon: ClipboardPaste, shortcut: "Ctrl+V", onSelect: () => selectionAction("paste") },
      { type: "separator" },
      { label: "찾기 및 바꾸기", Icon: Search, shortcut: "Ctrl+H" },
    ],
  },
  {
    label: "보기",
    items: [
      { label: "눈금자", Icon: Ruler, type: "rulers", onSelect: toggleRulers },
      { label: "격자", Icon: Grid3x3 },
      { label: "쪽 윤곽", Icon: FileText },
      { type: "separator" },
      { label: "전체 화면", Icon: Scan, shortcut: "F11" },
    ],
  },
  {
    label: "입력",
    items: [
      { label: "표...", Icon: Table },
      { label: "그림...", Icon: Image },
      { label: "글상자", Icon: Type },
      { label: "문자표...", Icon: Omega },
    ],
  },
  {
    label: "서식",
    items: [
      { label: "글자 모양...", Icon: ALargeSmall, shortcut: "Alt+L", onSelect: () => openFormatDialog("char") },
      { label: "문단 모양...", Icon: Pilcrow, shortcut: "Alt+T", onSelect: () => openFormatDialog("para") },
      { label: "스타일...", Icon: Palette },
    ],
  },
  {
    label: "쪽",
    items: [
      { label: "쪽 나누기", Icon: SeparatorHorizontal },
      { label: "단 나누기", Icon: Columns2 },
      { type: "separator" },
      { label: "쪽 설정...", Icon: FileCog },
      { label: "쪽 번호...", Icon: Hash },
    ],
  },
  { label: "보안", items: ribbonMenuItems("보안") },
];

function FitWidthMark() {
  return (
    <span className="relative flex size-full items-center justify-center">
      <span className="absolute top-[15%] left-[15%] size-[70%] border border-[#0a0a0a]" />
      <Maximize2 className="relative size-[0.8em] rotate-45" strokeWidth={1.75} />
    </span>
  );
}

function FitPageMark() {
  return (
    <span className="relative flex size-full items-center justify-center">
      <span className="absolute top-[15%] left-[15%] size-[70%] border border-[#0a0a0a]" />
      <Expand className="relative size-[0.8em]" strokeWidth={1.75} />
    </span>
  );
}

// 상태 줄 오른쪽의 보기 도구. 시안처럼 확대/축소 창, 배율, 폭·쪽 맞춤이다.
// 칸 높이는 --ui-sh 다. 넓은 화면에서는 상태 줄이 낮아진다.
function MenuTools({ onUse }) {
  const zoomFocus = useRef(false);
  const { zoomText, setZoomText, zoomFit, setZoomFit, grid } = useZoomState(zoomFocus);

  function useTool(action) {
    onUse();
    action();
  }

  function commitZoom() {
    const next = Number(zoomText);
    if (!Number.isFinite(next)) return;
    setZoomFit("");
    requestZoom({ percent: next });
  }

  const square = "ui-outline relative flex size-[var(--ui-sh)] items-center justify-center rounded-[0.5em]";
  return (
    <div className="flex flex-wrap items-center gap-[0.4em] py-[0.15em]">
      <ZoomDialog zoomText={zoomText} zoomFit={zoomFit} grid={grid} />
      <div className="ui-box flex h-[var(--ui-sh)] items-center overflow-hidden rounded-[0.5em]">
        <button type="button" className="ui-ghost flex h-full w-[var(--ui-sh)] items-center justify-center" aria-label="배율 줄이기" onClick={() => useTool(() => { setZoomFit(""); requestZoom({ step: -10 }); })}>
          <Minus className="size-[1em]" />
        </button>
        {zoomFit ? (
          <span className="flex h-full items-center px-1 whitespace-nowrap">{zoomFit}</span>
        ) : (
          <label className="flex h-full items-center">
            <span className="sr-only">배율</span>
            <input
              className="h-full w-[2.4em] border-0 bg-transparent text-center outline-none"
              value={zoomText}
              onFocus={() => { zoomFocus.current = true; }}
              onBlur={() => { zoomFocus.current = false; commitZoom(); }}
              onChange={(event) => setZoomText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") event.currentTarget.blur();
              }}
            />
            <span className="pr-[0.3em]">%</span>
          </label>
        )}
        <button type="button" className="ui-ghost flex h-full w-[var(--ui-sh)] items-center justify-center" aria-label="배율 높이기" onClick={() => useTool(() => { setZoomFit(""); requestZoom({ step: 10 }); })}>
          <Plus className="size-[1em]" />
        </button>
      </div>
      <span aria-hidden="true" className="h-[1em] w-px bg-[#e5e5e5]" />
      <button type="button" className={square} title="폭 맞춤" aria-label="폭 맞춤" onClick={() => useTool(() => requestZoom({ fit: "width" }))}>
        <FitWidthMark />
      </button>
      <button type="button" className={square} title="쪽 맞춤" aria-label="쪽 맞춤" onClick={() => useTool(() => requestZoom({ fit: "page" }))}>
        <FitPageMark />
      </button>
    </div>
  );
}

// 삽입/수정 표시. 지금은 화면 표시만 바뀐다.
function TextModeButton() {
  const [textMode, setTextMode] = useState("insert");
  return (
    <button
      type="button"
      className="ui-ghost -mx-[0.35em] rounded-[0.3em] px-[0.35em] py-[0.15em]"
      title="눌러서 삽입/수정 전환"
      onClick={() => setTextMode((mode) => (mode === "insert" ? "overwrite" : "insert"))}
    >
      {textMode === "insert" ? "삽입" : "수정"}
    </button>
  );
}

const docStateText = { dirty: "저장하지 않은 변경 있음", saved: "변경 내용 저장됨" };

// 시안의 상태 줄. 왼쪽은 한글처럼 쪽·단·줄·칸·구역·삽입/수정·저장 상태, 오른쪽은 보기 도구다.
// 단·줄·칸·구역은 코어가 캐럿 자리로 알려 준다(noting-caret-status).
// #root 는 세로 flex 라서 order 로 문서 영역 아래에 둔다.
function StatusBar() {
  const [page, setPage] = useState({ page: 0, count: 0 });
  const [caret, setCaret] = useState(null);
  const [docState, setDocState] = useState("clean");

  useEffect(() => {
    const onPage = (event) => {
      const detail = event.detail || {};
      const count = Number(detail.pageCount) || 0;
      const index = Number.isFinite(Number(detail.page)) && Number(detail.page) > 0 ? Number(detail.page) : (Number(detail.pageIndex) || 0) + 1;
      if (count > 0) setPage({ page: Math.min(index, count), count });
    };
    const onCaret = (event) => {
      const detail = event.detail;
      setCaret(detail && detail.active ? detail : null);
    };
    const onDoc = (event) => setDocState(event.detail?.state || "clean");
    window.addEventListener("noting-page-changed", onPage);
    window.addEventListener("noting-zoom-changed", onPage);
    window.addEventListener("noting-caret-status", onCaret);
    window.addEventListener("noting-doc-state", onDoc);
    return () => {
      window.removeEventListener("noting-page-changed", onPage);
      window.removeEventListener("noting-zoom-changed", onPage);
      window.removeEventListener("noting-caret-status", onCaret);
      window.removeEventListener("noting-doc-state", onDoc);
    };
  }, []);

  return (
    <footer data-toast-floor="" className="toolbar-ui ui-chrome flex shrink-0 flex-wrap items-center gap-x-[1.4em] border-t border-[#e5e5e5] bg-white pr-[0.6em] pl-[1em]" style={{ order: 1 }}>
      <div className="flex flex-wrap items-center gap-x-[1.4em] text-[0.9em] text-[#404040]">
        {page.count > 0 ? <span>{page.page} / {page.count}쪽</span> : null}
        {caret?.band ? (
          <span className="font-medium text-[#1d4ed8]">{caret.band === 1 ? "머리말" : "꼬리말"} 편집 중 · Shift+Esc 로 나가기</span>
        ) : null}
        {caret ? (
          <>
            <span>{caret.column}단</span>
            <span>{caret.line}줄 {caret.char}칸</span>
            <span>{caret.section} / {caret.sectionCount}구역</span>
          </>
        ) : null}
        <TextModeButton />
        {docStateText[docState] ? <span className="text-[#737373]">{docStateText[docState]}</span> : null}
      </div>
      <div className="ml-auto">
        <MenuTools onUse={() => {}} />
      </div>
    </footer>
  );
}

// 시안에 없는 기능을 눌렀을 때 화면 아래에 잠깐 뜨는 알림.
const menuItemClass = "h-[2.3em] gap-3 rounded-[6px] px-3 text-[1em] data-disabled:text-[#a3a3a3]";

function RulersEntry({ item }) {
  const on = useRulersShown();
  return (
    <MenubarCheckboxItem
      checked={on}
      onCheckedChange={() => item.onSelect?.()}
      className="h-[2.3em] gap-3 rounded-[6px] py-0 pr-3 pl-[2.4em] text-[1em] [&>span:first-child]:left-3 [&>span:first-child]:size-[1.1em] [&_svg]:size-[1.1em]"
    >
      {item.label}
    </MenubarCheckboxItem>
  );
}

function MenuEntry({ item }) {
  if (item.type === "separator") return <MenubarSeparator className="my-1 bg-[#e5e5e5]" />;
  if (item.type === "rulers") return <RulersEntry item={item} />;
  const Icon = item.Icon;
  return (
    <MenubarItem disabled={item.disabled} onSelect={item.onSelect || (() => notReady(item.label))} className={menuItemClass}>
      {Icon ? <Icon className="size-[1.1em] text-[#737373]" strokeWidth={2} /> : <span className="size-[1.1em]" />}
      <span className="flex-1">{item.label}</span>
      {item.shortcut ? <MenubarShortcut className="text-[0.8em] tracking-[0.08em] text-[#737373]">{item.shortcut}</MenubarShortcut> : null}
    </MenubarItem>
  );
}

function MenuItems({ menu }) {
  return menu.items.map((item, index) => <MenuEntry key={item.label || `sep-${index}`} item={item} />);
}

// 고른 리본 탭. 고른 탭을 다시 누르면 리본을 접는다(빈 문자열). 다음에 열 때도 그대로다.
function storedRibbon() {
  try {
    const value = localStorage.getItem("noting.ribbon");
    if (value === "" || ribbonTabs.includes(value)) return value;
  } catch {
    // 저장소를 못 쓰면 시안처럼 편집 탭을 연다.
  }
  return "편집";
}

function storeRibbon(value) {
  try {
    localStorage.setItem("noting.ribbon", value);
  } catch {
    // 기억하지 못해도 화면은 그대로 쓴다.
  }
}

const popClass = "ui-pop toolbar-ui ui-chrome w-72 rounded-lg border-0 p-1 shadow-[0_0_0_1px_rgba(10,10,10,0.1),0_4px_12px_rgba(0,0,0,0.1)]";

export function AppMenuBar() {
  const wide = useWide();
  const headerRef = useRef(null);
  const [openMenu, setOpenMenu] = useState("");
  const [ribbon, setRibbon] = useState(storedRibbon);
  const [sheet, setSheet] = useState(false);
  const [overlayTop, setOverlayTop] = useState(36);
  // 머리말·꼬리말에 들어가면 그 탭을 고른다. 다른 탭을 고르면 그 탭이 보이고, 나오면 원래 탭으로 돌아간다.
  const band = useBand();
  const [bandPicked, setBandPicked] = useState(false);
  useEffect(() => setBandPicked(band > 0), [band]);
  const shown = band > 0 && bandPicked ? bandTab : ribbon;

  useEffect(() => {
    const el = headerRef.current;
    if (!el) return undefined;
    const update = () => setOverlayTop(el.getBoundingClientRect().height);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [shown, wide]);

  function pickRibbon(label) {
    setOpenMenu("");
    const fromBand = band > 0 && bandPicked;
    setBandPicked(false);
    setRibbon((current) => {
      const next = current === label && !fromBand ? "" : label;
      storeRibbon(next);
      return next;
    });
  }

  // 휴대폰은 리본을 접지 않는다. 접어 둔 상태로 들어오면 편집 탭을 보인다.
  const mobileTab = shown || "편집";

  if (!wide) {
    return (
      <>
        <header ref={headerRef} className="toolbar-ui ui-chrome relative z-50 flex shrink-0 flex-col bg-white">
          <MobileHeader
            tab={mobileTab}
            band={band}
            onTab={(label) => {
              setBandPicked(label === bandTab);
              if (label === bandTab) return;
              setRibbon(label);
              storeRibbon(label);
            }}
            onMenu={() => setSheet(true)}
          />
        </header>
        <MobileFooter tab={mobileTab} />
        <MobileMenuSheet open={sheet} onClose={() => setSheet(false)} />
        <Toaster />
        <FormatDialogs />
        <AboutDialog />
      </>
    );
  }

  return (
    <>
      <header ref={headerRef} className="toolbar-ui ui-chrome relative z-50 flex shrink-0 flex-col border-b border-[#e5e5e5] bg-white">
        {/* 메뉴 탭 줄: 파일은 검은 단추, 나머지는 탭이고 ▾ 로 메뉴를 연다. 세로 여백은 줄였다 */}
        <div className="flex items-center gap-[0.5em] overflow-x-auto px-[0.6em] py-[0.12em]">
          <Menubar className="h-auto w-auto shrink-0 gap-[0.5em] border-0 bg-transparent p-0" value={openMenu} onValueChange={setOpenMenu}>
            {menus.slice(0, 1).map((menu) => (
              <MenubarMenu key={menu.label} value={menu.label}>
                <MenubarTrigger className="h-[1.85em] rounded-[0.45em] bg-[#171717] px-[1em] text-[1em] font-medium text-white hover:bg-[#262626] aria-expanded:bg-[#404040]">
                  {menu.label}
                </MenubarTrigger>
                <MenubarContent className={popClass} sideOffset={6}>
                  <MenuItems menu={menu} />
                </MenubarContent>
              </MenubarMenu>
            ))}
            <div role="tablist" aria-label="메뉴" className="flex items-center gap-[0.15em] rounded-[0.55em] bg-[#f5f5f5] p-[0.1em]">
              {band > 0 ? (
                <div className={`flex items-center rounded-[0.45em] ${shown === bandTab ? "bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : ""}`}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={shown === bandTab}
                    title="머리말·꼬리말 편집 중 (Shift+Esc 로 나가기)"
                    className={`h-[1.65em] px-[0.8em] text-[#1d4ed8] ${shown === bandTab ? "font-medium" : ""}`}
                    onClick={() => {
                      setOpenMenu("");
                      setBandPicked(true);
                    }}
                  >
                    {bandTab}
                  </button>
                </div>
              ) : null}
              {menus.slice(1).map((menu) => {
                const selected = shown === menu.label;
                return (
                  <MenubarMenu key={menu.label} value={menu.label}>
                    <div className={`flex items-center rounded-[0.45em] ${selected ? "bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : ""}`}>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={selected}
                        className={`h-[1.65em] pr-[0.3em] pl-[0.8em] ${selected ? "font-medium" : "text-[#737373]"}`}
                        onClick={() => pickRibbon(menu.label)}
                      >
                        {menu.label}
                      </button>
                      <MenubarTrigger
                        className="ui-ghost h-[1.65em] w-[1.7em] justify-center rounded-[0.45em] p-0 aria-expanded:bg-[#d4d4d4]"
                        aria-label={`${menu.label} 메뉴`}
                        onPointerEnter={(event) => event.preventDefault()}
                      >
                        <ChevronDown className="size-[0.8em] text-[#737373]" />
                      </MenubarTrigger>
                    </div>
                    <MenubarContent className={popClass} sideOffset={6}>
                      <MenuItems menu={menu} />
                    </MenubarContent>
                  </MenubarMenu>
                );
              })}
            </div>
          </Menubar>
        </div>
        {shown ? <RibbonFrame name={shown} onUse={() => setOpenMenu("")} /> : null}
        {/* 서식 도구 상자. 넓은 화면에서는 글자와 칸을 한 단계 더 작게 둔다(format-compact) */}
        <div className="format-compact overflow-x-auto px-[0.6em] py-[0.2em]">
          <FormatBar />
        </div>
      </header>
      <StatusBar />
      <Toaster />
      <FormatDialogs />
      <AboutDialog />
      {openMenu ? (
        <div
          className="fixed inset-x-0 bottom-0 z-40"
          style={{ top: overlayTop }}
          onPointerDown={() => setOpenMenu("")}
        />
      ) : null}
    </>
  );
}
