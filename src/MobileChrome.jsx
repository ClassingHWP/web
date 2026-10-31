import { useEffect, useRef, useState } from "react";
import { FilePlus, FolderOpen, Info, Menu, Save, SaveAll, X } from "lucide-react";
import { openAbout } from "./AboutDialog.jsx";
import { FormatBar } from "./FormatBar.jsx";
import { bandTab, MobileRibbon, ribbonTabs } from "./Ribbon.jsx";
import { newDocument, notReady, openFile, saveAs, toggleRulers, useRulersShown } from "./ui-actions.js";

// 시안(MobileEdit·MobileMenu·MobileFormat)의 휴대폰 화면.
// 위는 메뉴와 탭 칩 한 줄, 아래는 고른 탭의 리본 한 장 또는 키보드 위 서식 막대다.

// 키보드가 떠 있는가와 그 높이. 편집 입력 칸이나 서식 막대에 손가락 입력 포커스가 있으면 떠 있다고 본다.
// 실제 높이는 visualViewport 가 줄어든 만큼이다.
function useKeyboard() {
  const [keyboard, setKeyboard] = useState({ open: false, inset: 0 });
  useEffect(() => {
    const coarse = window.matchMedia("(pointer: coarse)");
    const view = window.visualViewport;
    let focused = false;
    const keeps = (node) =>
      node instanceof Element &&
      (node.id === "viewEditorInput" ||
        !!node.closest("[data-mobile-format], [data-font-list], [data-radix-popper-content-wrapper], [role='dialog']"));
    const update = () => {
      const inset = view ? Math.max(0, window.innerHeight - view.height - view.offsetTop) : 0;
      setKeyboard({ open: inset > 120 || (coarse.matches && focused), inset: inset > 120 ? inset : 0 });
    };
    const onFocus = (event) => {
      focused = keeps(event.target);
      update();
    };
    const onBlur = (event) => {
      if (!keeps(event.relatedTarget)) {
        // 다음 포커스가 정해진 뒤에 본다. 서식 막대 단추로 옮겨 가는 중이면 그대로 둔다.
        window.setTimeout(() => {
          focused = keeps(document.activeElement);
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

// 위 막대. 메뉴 단추와 탭 칩이 한 줄이다(문서 이름은 나중에 노치 쪽에 둔다).
// 머리말·꼬리말을 고치는 동안은 맨 앞에 그 칩이 생긴다.
export function MobileHeader({ tab, band = 0, onTab, onMenu }) {
  const tabs = band > 0 ? [bandTab, ...ribbonTabs] : ribbonTabs;
  return (
    <div className="flex h-[60px] items-center gap-[2px] border-b border-[#e5e5e5] pr-[6px] pl-1">
      <button type="button" className="ui-ghost flex size-12 flex-none items-center justify-center rounded-[10px]" aria-label="메뉴" onClick={onMenu}>
        <Menu className="size-6" />
      </button>
      <div role="tablist" aria-label="메뉴 탭" className="flex min-w-0 flex-1 gap-[2px]">
        {tabs.map((name) => {
          const isBand = name === bandTab;
          const picked = name === tab;
          const look = picked
            ? isBand ? "bg-[#1d4ed8] font-medium text-white" : "bg-[#171717] font-medium text-white"
            : isBand ? "text-[#1d4ed8]" : "text-[#404040]";
          return (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={picked}
              aria-label={isBand ? `${band === 1 ? "머리말" : "꼬리말"} 편집` : undefined}
              className={`h-11 rounded-[22px] p-0 whitespace-nowrap ${isBand ? "flex-none px-[10px]" : "min-w-0 flex-1"} ${look}`}
              onClick={() => onTab(name)}
            >
              {isBand ? (band === 1 ? "머리말" : "꼬리말") : name}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// 화면 아래. 키보드가 떠 있으면 그 바로 위에 서식 막대, 아니면 고른 탭의 리본 한 장이다.
export function MobileFooter({ tab }) {
  const keyboard = useKeyboard();
  if (keyboard.open) {
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
  return (
    <footer data-toast-floor="" className="toolbar-ui ui-chrome shrink-0" style={{ order: 1 }}>
      <MobileRibbon tab={tab} onUse={() => {}} />
    </footer>
  );
}

const fileItems = [
  { label: "새 문서", Icon: FilePlus, run: newDocument },
  { label: "열기", Icon: FolderOpen, run: openFile },
  { label: "저장", Icon: Save },
  { label: "다른 이름으로 저장", Icon: SaveAll, run: saveAs },
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
