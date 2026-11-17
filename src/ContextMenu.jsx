import { useEffect, useRef, useState } from "react";
import { openFormatDialog } from "./FormatDialogs.jsx";
import { openSymbolDialog } from "./SymbolDialog.jsx";
import { openHyperlinkDialog } from "./HyperlinkDialog.jsx";
import { openMemoDialog } from "./MemoDialog.jsx";
import { openTablePropertiesDialog } from "./TablePropertiesDialog.jsx";
import { openTableDialog } from "./TableDialog.jsx";
import { openRowColDialog } from "./RowColDialog.jsx";
import { openTableFlipDialog } from "./TableFlipDialog.jsx";
import { openCellBorderFillDialog } from "./CellBorderFillDialog.jsx";
import { printDocument, runShortcut, selectionAction, tableEdit } from "./ui-actions.js";

// 오른쪽 클릭 상황 메뉴. 갈래(kind)는 코어(contextMenuKind)가 고른 상태를 보고 정하고, 항목 차례는 한글 2024
// 상황 메뉴(hwp_context_menus.xml 의 IDC_Edit_Body·IDC_Body_Block·IDC_Table·IDC_Cell_Block·IDC_Picture·
// IDC_Drawing_Object)에서 ClassingHWP 에 있는 명령만 둔다. 각 항목은 리본·메뉴와 같은 동작을 부른다.

const cut = { label: "오려 두기", run: () => selectionAction("cut") };
const copy = { label: "복사하기", run: () => selectionAction("copy") };
const paste = { label: "붙이기", run: () => selectionAction("paste") };
const clear = { label: "지우기", run: () => selectionAction("delete") };
const symbol = { label: "문자표...", run: openSymbolDialog };
const print = { label: "인쇄...", run: printDocument };
const charShape = { label: "글자 모양...", run: () => openFormatDialog("char") };
const paraShape = { label: "문단 모양...", run: () => openFormatDialog("para") };
const style = { label: "스타일...", run: () => openFormatDialog("style") };
const hyperlink = { label: "하이퍼링크...", run: openHyperlinkDialog };
const memo = { label: "메모 넣기", run: () => openMemoDialog("insert") };
const cellProps = { label: "표/셀 속성...", run: openTablePropertiesDialog };
const cellFill = { label: "셀 테두리/배경...", run: openCellBorderFillDialog };
const splitCell = { label: "셀 나누기...", run: () => openTableDialog("split") };
const addRowCol = { label: "줄/칸 추가하기...", run: () => openRowColDialog("insert") };
const delRowCol = { label: "줄/칸 지우기...", run: () => openRowColDialog("delete") };
const flip = { label: "표 뒤집기...", run: openTableFlipDialog };
const caption = { label: "캡션 넣기", run: () => runShortcut("captionToggle") };
const sep = { separator: true };

const menus = {
  body: [paste, symbol, sep, print, sep, charShape, paraShape, style, sep, hyperlink, memo],
  block: [cut, copy, paste, clear, sep, charShape, paraShape, style, sep, hyperlink, memo],
  table: [paste, symbol, sep, charShape, paraShape, style, sep, memo, sep, cellProps, cellFill, sep, splitCell, addRowCol, delRowCol, sep, flip],
  cellBlock: [
    cut, copy, sep, charShape, paraShape, style, sep, cellProps, cellFill, sep,
    { label: "셀 높이를 같게", run: () => tableEdit("equalHeight") },
    { label: "셀 너비를 같게", run: () => tableEdit("equalWidth") },
    { label: "셀 합치기", run: () => tableEdit("mergeCells") },
    splitCell, addRowCol, delRowCol,
  ],
  picture: [cut, copy, clear, sep, caption],
  shape: [cut, copy, clear, sep, caption],
};

export function ContextMenu() {
  const [menu, setMenu] = useState(null);
  const boxRef = useRef(null);

  useEffect(() => {
    const onMenu = (event) => {
      const detail = event.detail || {};
      if (!menus[detail.kind]) return;
      setMenu({ x: Number(detail.x) || 0, y: Number(detail.y) || 0, kind: detail.kind });
    };
    window.addEventListener("chwp-context-menu", onMenu);
    return () => window.removeEventListener("chwp-context-menu", onMenu);
  }, []);

  useEffect(() => {
    if (!menu) return undefined;
    const close = (event) => {
      if (event?.target && boxRef.current?.contains(event.target)) return;
      setMenu(null);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setMenu(null);
    };
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("wheel", close, { capture: true, passive: true });
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("wheel", close, true);
      window.removeEventListener("resize", close);
    };
  }, [menu]);

  // 화면 밖으로 나가지 않게 연 뒤 자리를 맞춘다.
  const [place, setPlace] = useState(null);
  useEffect(() => {
    if (!menu || !boxRef.current) {
      setPlace(null);
      return;
    }
    const box = boxRef.current.getBoundingClientRect();
    const left = Math.max(8, Math.min(menu.x, window.innerWidth - box.width - 8));
    const top = menu.y + box.height + 8 <= window.innerHeight ? menu.y : Math.max(8, menu.y - box.height);
    setPlace({ left, top });
  }, [menu]);

  if (!menu) return null;
  const items = menus[menu.kind];
  return (
    <div
      ref={boxRef}
      role="menu"
      aria-label="상황 메뉴"
      className="toolbar-ui ui-chrome fixed z-[70] min-w-[13em] rounded-lg bg-white py-1 text-[0.95em] shadow-[0_0_0_1px_#d4d4d4,0_6px_18px_rgba(0,0,0,0.14)]"
      style={{ left: place?.left ?? menu.x, top: place?.top ?? menu.y, visibility: place ? "visible" : "hidden" }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item, index) =>
        item.separator ? (
          <div key={`sep-${index}`} role="separator" className="my-1 h-px bg-[#e5e5e5]" />
        ) : (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            className="ui-ghost flex h-9 w-full items-center px-3.5 text-left"
            onClick={() => {
              setMenu(null);
              item.run();
            }}
          >
            {item.label}
          </button>
        ),
      )}
    </div>
  );
}
