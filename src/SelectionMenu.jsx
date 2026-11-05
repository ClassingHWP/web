import { useEffect, useRef, useState } from "react";

// 블록 마커를 누르면 그 자리 위에 뜨는 메뉴. 고르면 chwp-selection-action 으로 셸에 넘긴다.
// 보기 전용이면 복사만 둔다.
const editActions = [
  { action: "cut", label: "잘라내기" },
  { action: "copy", label: "복사" },
  { action: "paste", label: "붙여넣기" },
  { action: "delete", label: "지우기" },
];
const viewActions = [{ action: "copy", label: "복사" }];

export function SelectionMenu() {
  const [menu, setMenu] = useState(null);
  const boxRef = useRef(null);

  useEffect(() => {
    const onMenu = (event) => {
      const detail = event.detail || {};
      setMenu({ x: Number(detail.x) || 0, y: Number(detail.y) || 0, readOnly: !!detail.readOnly });
    };
    window.addEventListener("chwp-selection-menu", onMenu);
    return () => window.removeEventListener("chwp-selection-menu", onMenu);
  }, []);

  useEffect(() => {
    if (!menu) return undefined;
    const onDown = (event) => {
      if (boxRef.current?.contains(event.target)) return;
      setMenu(null);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setMenu(null);
    };
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("wheel", onDown, { capture: true, passive: true });
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("wheel", onDown, true);
    };
  }, [menu]);

  if (!menu) return null;
  const actions = menu.readOnly ? viewActions : editActions;
  // 마커는 블록 아래에 달려 있으니 메뉴는 마커 아래에 띄워 블록 글자를 가리지 않는다.
  // 화면 아래가 모자라면 위로 올리고, 좌우는 화면 밖으로 나가지 않게 16px 안쪽에 둔다.
  const width = actions.length * 76;
  const height = 48;
  const left = Math.max(16, Math.min(menu.x - width / 2, window.innerWidth - width - 16));
  const below = menu.y + 24;
  const top = below + height + 16 <= window.innerHeight ? below : Math.max(16, menu.y - 96 - height);

  return (
    <div
      ref={boxRef}
      role="menu"
      // 시안(팝오버 · 블록 메뉴): 높이 48px 단추, 지우기는 빨강이다.
      className="toolbar-ui ui-chrome fixed z-50 flex overflow-hidden rounded-lg bg-white shadow-[0_0_0_1px_#d4d4d4,0_4px_12px_rgba(0,0,0,0.1)]"
      style={{ left, top }}
    >
      {actions.map((item, index) => (
        <button
          key={item.action}
          type="button"
          role="menuitem"
          className={`ui-ghost h-12 min-w-[76px] px-3 text-center active:bg-[#f5f5f5] ${index > 0 ? "border-l border-[#e5e5e5]" : ""} ${item.action === "delete" ? "text-[#c42b1c]" : ""}`}
          // 클립보드 쓰기·읽기는 사용자 탭 안에서만 된다. 그래서 pointerdown 이 아니라 click 에서 넘긴다.
          onClick={() => {
            window.dispatchEvent(new CustomEvent("chwp-selection-action", { detail: { action: item.action } }));
            setMenu(null);
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
