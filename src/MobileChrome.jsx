import { useEffect, useRef, useState } from "react";
import { FileDown, FilePlus, FolderOpen, Info, Menu, Printer, Redo2, Save, SaveAll, Undo2, X } from "lucide-react";
import { openAbout } from "./AboutDialog.jsx";
import { FormatBar } from "./FormatBar.jsx";
import { newDocument, notReady, openFile, printDocument, saveAs, savePdf, selectionAction, toggleRulers, useRulersShown } from "./ui-actions.js";

// 시안(MobileEdit·MobileMenu·MobileFormat)의 휴대폰 화면.
// 위는 메뉴·탭 칩·되돌리기 한 줄이고, 탭을 누르면 그 탭의 메뉴 판이 올라온다. 키보드가 뜨면 그 위에 서식 막대다.

// 키보드가 떠 있는가와 그 높이. 편집 입력 칸이나 서식 막대에 손가락 입력 포커스가 있으면 떠 있다고 본다.
// 실제 높이는 visualViewport 가 줄어든 만큼이다.
export function useKeyboard() {
  const [keyboard, setKeyboard] = useState({ open: false, inset: 0 });
  useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)");
    const view = window.visualViewport;
    let focused = false;
    // 떠 있는 목록·대화 상자는 서식 막대가 이미 떠 있을 때만 그대로 둔다. 리본에서 연 목록이 서식 막대를 띄우면
    // 리본이 사라지며 목록도 닫힌다.
    const keeps = (node, already) =>
      node instanceof Element &&
      (node.id === "viewEditorInput" ||
        !!node.closest("[data-mobile-format], [data-font-list]") ||
        (already && !!node.closest("[data-radix-popper-content-wrapper], [role='dialog']")));
    const update = () => {
      const inset = view ? Math.max(0, window.innerHeight - view.height - view.offsetTop) : 0;
      setKeyboard({ open: inset > 120 || (coarse.matches && focused), inset: inset > 120 ? inset : 0 });
    };
    const onFocus = (event) => {
      focused = keeps(event.target, focused);
      update();
    };
    const onBlur = (event) => {
      if (!keeps(event.relatedTarget, focused)) {
        // 다음 포커스가 정해진 뒤에 본다. 서식 막대 단추로 옮겨 가는 중이면 그대로 둔다.
        window.setTimeout(() => {
          focused = keeps(document.activeElement, focused);
          update();
        }, 0);
      }
    };
    window.addEventListener("focusin", onFocus);
    window.addEventListener("focusout", onBlur);
    view?.addEventListener("resize", update);
    view?.addEventListener("scroll", update);
    update();
    return () => {
      window.removeEventListener("focusin", onFocus);
      window.removeEventListener("focusout", onBlur);
      view?.removeEventListener("resize", update);
      view?.removeEventListener("scroll", update);
    };
  }, []);
  return keyboard;
}

// 위 막대. 메뉴 단추, 탭 칩, 되돌리기·다시 실행이 한 줄이다. 탭을 누르면 그 탭의 메뉴 판이 올라온다(MobilePanel).
// 표 칸·개체·머리말·주석·바탕쪽 안이면 그 탭이 맨 앞에 파란색으로 생긴다.
export function MobileHeader({ tabs, contextTabs = [], labels = {}, open, onTab, onMenu }) {
  return (
    <div className="flex h-12 items-center gap-0 border-b border-[#e5e5e5] bg-white px-[2px]">
      <button type="button" className="ui-ghost flex size-9 flex-none items-center justify-center rounded-[10px]" aria-label="메뉴" onClick={onMenu}>
        <Menu className="size-[22px]" />
      </button>
      <div role="tablist" aria-label="메뉴 탭" className="flex min-w-0 flex-1 gap-0 overflow-x-auto [scrollbar-width:none] [&>:first-child]:ms-auto [&>:last-child]:me-auto">
        {[...contextTabs, ...tabs].map((name) => {
          const context = contextTabs.includes(name);
          const picked = name === open;
          const look = picked
            ? context ? "bg-[#1d4ed8] font-medium text-white" : "bg-[#171717] font-medium text-white"
            : context ? "text-[#1d4ed8]" : "text-[#404040]";
          return (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={picked}
              className={`h-[34px] max-w-[88px] flex-1 shrink-0 rounded-[17px] px-[6px] text-[15px] whitespace-nowrap ${look}`}
              onClick={() => onTab(name)}
            >
              {labels[name] || name}
            </button>
          );
        })}
      </div>
      <button type="button" aria-label="되돌리기" className="ui-ghost flex size-9 flex-none items-center justify-center rounded-[10px]" onClick={() => selectionAction("undo")}>
        <Undo2 className="size-5" />
      </button>
      <button type="button" aria-label="다시 실행" className="ui-ghost flex size-9 flex-none items-center justify-center rounded-[10px]" onClick={() => selectionAction("redo")}>
        <Redo2 className="size-5" />
      </button>
    </div>
  );
}

// 화면 아래. 키보드가 떠 있으면 그 바로 위에 서식 막대를 둔다. 아니면 아래 띠 없이 문서를 넓게 쓴다.
export function MobileFooter() {
  const keyboard = useKeyboard();
  if (!keyboard.open) return null;
  return (
    <div
      data-mobile-format=""
      data-toast-floor=""
      className="toolbar-ui fixed inset-x-0 z-40 border-t border-[#e5e5e5] bg-white p-2"
      style={{ bottom: keyboard.inset }}
    >
      <FormatBar layout="mobile" />
    </div>
  );
}

const fileItems = [
  { label: "새 문서", Icon: FilePlus, run: newDocument },
  { label: "열기", Icon: FolderOpen, run: openFile },
  { label: "저장", Icon: Save },
  { label: "다른 이름으로 저장", Icon: SaveAll, run: saveAs },
  { label: "PDF로 저장", Icon: FileDown, run: savePdf },
  { label: "인쇄", Icon: Printer, run: printDocument },
  { label: "ClassingHWP 정보", Icon: Info, run: openAbout },
  { label: "문서 닫기", Icon: X, disabled: true },
];

// ☰ 를 누르면 아래에서 올라오는 시트. 파일 메뉴와 보기 설정이다.
export function MobileMenuSheet({ open, onClose }) {
  const rulersOn = useRulersShown();
  const sheet = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const row = "ui-ghost flex h-14 w-full items-center gap-[14px] rounded-[10px] px-[10px] text-left disabled:text-[#a3a3a3]";
  return (
    <div className="toolbar-ui ui-chrome fixed inset-0 z-[75]">
      <div aria-hidden="true" className="absolute inset-0 bg-black/45" onPointerDown={onClose} />
      <div
        ref={sheet}
        role="dialog"
        aria-modal="true"
        aria-label="메뉴"
        className="absolute inset-x-0 bottom-0 rounded-t-[18px] bg-white px-3 pt-2 pb-[max(26px,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.12)]"
      >
        <div aria-hidden="true" className="mx-auto mb-[10px] h-[5px] w-11 rounded-[3px] bg-[#d4d4d4]" />
        <div className="px-2 pb-[6px] text-[15px] font-medium text-[#737373]">파일</div>
        {fileItems.map((item) => (
          <button
            key={item.label}
            type="button"
            className={row}
            disabled={item.disabled}
            onClick={() => {
              onClose();
              if (item.run) item.run();
              else notReady(item.label);
            }}
          >
            <item.Icon className={`size-6 ${item.disabled ? "text-[#a3a3a3]" : "text-[#737373]"}`} />
            <span className="flex-1">{item.label}</span>
          </button>
        ))}
        <div aria-hidden="true" className="my-2 h-px bg-[#e5e5e5]" />
        <div className="px-2 pt-1 pb-[6px] text-[15px] font-medium text-[#737373]">보기</div>
        <label className="flex h-14 items-center gap-[14px] px-[10px]">
          <span className="flex-1">눈금자</span>
          <span className={`relative h-[30px] w-[52px] rounded-[15px] ${rulersOn ? "bg-[#171717]" : "bg-[#d4d4d4]"}`}>
            <input
              type="checkbox"
              aria-label="눈금자"
              className="absolute inset-0 m-0 cursor-pointer opacity-0"
              checked={rulersOn}
              onChange={toggleRulers}
            />
            <span
              aria-hidden="true"
              className={`absolute top-[3px] size-6 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-[left] ${rulersOn ? "left-[25px]" : "left-[3px]"}`}
            />
          </span>
        </label>
        <button type="button" className="mt-[10px] h-[52px] w-full rounded-[10px] bg-[#f5f5f5] text-center font-medium" onClick={onClose}>
          닫기
        </button>
      </div>
    </div>
  );
}
