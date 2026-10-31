import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronUp } from "lucide-react";

// 시안(팝오버 · 글꼴 목록)대로 줄 높이 44px, 목록 너비는 칸보다 좁지 않게 300px 이상이다.
const fontRowHeight = 44;
const fontListHeight = 284;
const fontListWidth = 300;

// 글꼴 이름 칸. 치면 걸러 보이고, 아래 화살표나 단추로 전체 목록을 연다.
// lead 는 칸 왼쪽에 얹는 표시(라이선스 세모 등)이고, 목록이 열리면 숨긴다. 너비 40px 칸을 차지한다.
// 목록은 body 에 띄운다. layer 는 그 목록의 z 순서이고, 대화 상자 위에서 쓸 때 높인다.
// 목록에는 data-font-list 가 붙는다. 대화 상자는 그 안을 누른 것을 바깥 누르기로 보지 않아야 한다.
// onCommit 은 Enter 로 고른 뒤 부른다.
export function FontField({ value, fonts, onPick, lead = null, className = "w-[11em]", layer = "z-[60]", onCommit }) {
  const [text, setText] = useState(value || "");
  const [open, setOpen] = useState(false);
  const [browse, setBrowse] = useState(false);
  const [active, setActive] = useState(0);
  const focus = useRef(false);
  const box = useRef(null);
  const listRef = useRef(null);
  const closeTimer = useRef(0);
  const [place, setPlace] = useState(null);

  useEffect(() => {
    if (!focus.current) setText(value || "");
  }, [value]);

  useEffect(() => {
    if (!open || !box.current) return undefined;
    const rect = box.current.getBoundingClientRect();
    const width = Math.max(rect.width, fontListWidth);
    // 아래 자리가 모자라면(휴대폰 키보드 위 서식 막대) 목록을 위로 편다.
    const view = window.visualViewport;
    const viewBottom = view ? view.offsetTop + view.height : window.innerHeight;
    const up = viewBottom - rect.bottom < fontListHeight + 60 && rect.top > viewBottom - rect.bottom;
    setPlace({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      top: up ? undefined : rect.bottom + 6,
      bottom: up ? window.innerHeight - rect.top + 6 : undefined,
      width,
    });
    const onDown = (event) => {
      const target = event.target;
      if (box.current?.contains(target) || listRef.current?.contains(target)) return;
      setOpen(false);
      setBrowse(false);
      const field = box.current?.querySelector("input");
      if (field instanceof HTMLInputElement && document.activeElement === field) field.blur();
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [open, text, browse]);

  const query = text.trim().toLowerCase();
  const matches = browse ? fonts : query ? fonts.filter((face) => face.toLowerCase().includes(query)) : [];
  const activeIndex = Math.min(active, Math.max(0, matches.length - 1));
  // 목록은 글꼴이 수천 개라 보이는 줄과 그 위아래 몇 줄만 그린다.
  const [scrollTop, setScrollTop] = useState(0);
  const firstRow = Math.max(0, Math.floor(scrollTop / fontRowHeight) - 8);
  const lastRow = Math.min(matches.length, firstRow + Math.ceil(fontListHeight / fontRowHeight) + 16);
  const shown = open && matches.length > 0;

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const top = activeIndex * fontRowHeight;
    if (top < list.scrollTop) list.scrollTop = top;
    else if (top + fontRowHeight > list.scrollTop + list.clientHeight) list.scrollTop = top + fontRowHeight - list.clientHeight;
  }, [activeIndex, open, matches.length]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = 0;
    setScrollTop(0);
  }, [query, browse, open]);

  function choose(face) {
    window.clearTimeout(closeTimer.current);
    onPick(face);
    setText(face);
    setOpen(false);
    setBrowse(false);
  }

  // 걸러 볼 때는 시안처럼 목록 아래에 찾은 개수를 적는다.
  const list = (
    <div
      data-font-list=""
      role="listbox"
      aria-label="글꼴"
      className={`toolbar-ui ui-chrome ui-pop ${layer} flex flex-col rounded-lg p-1`}
      style={{ position: "fixed", left: place?.left, top: place?.top, bottom: place?.bottom, width: place?.width }}
    >
      <div
        ref={listRef}
        className="overflow-y-auto"
        style={{ maxHeight: fontListHeight }}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
      >
        <div className="relative" style={{ height: matches.length * fontRowHeight }}>
          {matches.slice(firstRow, lastRow).map((face, offset) => {
            const index = firstRow + offset;
            return (
              <button
                key={face}
                type="button"
                role="option"
                aria-selected={index === activeIndex}
                data-active={index === activeIndex ? "1" : "0"}
                className={`absolute left-0 flex w-full items-center rounded-[6px] px-2.5 text-left ${index === activeIndex ? "bg-[#f5f5f5]" : ""}`}
                style={{ top: index * fontRowHeight, height: fontRowHeight }}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(face)}
              >
                <span className="truncate">{face}</span>
              </button>
            );
          })}
        </div>
      </div>
      {!browse ? <div className="px-2.5 pt-2 pb-1.5 text-[14px] text-[#737373]">{matches.length}개 찾음</div> : null}
    </div>
  );

  return (
    <div ref={box} className={`ui-box relative flex h-[var(--ui-h)] items-center rounded-[0.5em] ${className}`}>
      {lead && !open ? lead : null}
      <input
        className={`h-full min-w-0 flex-1 border-0 bg-transparent pr-1 outline-none ${lead && !open ? "pl-[2.6em]" : "pl-[0.6em]"}`}
        aria-label="글꼴"
        aria-expanded={shown}
        value={text}
        onClick={(event) => event.currentTarget.select()}
        onFocus={(event) => {
          focus.current = true;
          setOpen(false);
          setBrowse(false);
          event.target.select();
        }}
        onBlur={() => {
          focus.current = false;
          closeTimer.current = window.setTimeout(() => setOpen(false), 150);
        }}
        onChange={(event) => {
          const next = event.target.value;
          setText(next);
          setBrowse(false);
          setActive(0);
          setOpen(next.trim().length > 0);
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            if (!open) {
              setBrowse(!text.trim());
              setActive(0);
              setOpen(true);
              return;
            }
            setActive(Math.min(matches.length - 1, activeIndex + 1));
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive(Math.max(0, activeIndex - 1));
            return;
          }
          if (event.key === "Enter" && open && matches[activeIndex]) {
            event.preventDefault();
            choose(matches[activeIndex]);
            event.currentTarget.blur();
            onCommit?.();
          }
        }}
      />
      <button
        type="button"
        className="ui-ghost mr-[0.2em] flex h-[80%] w-[1.6em] items-center justify-center rounded-[0.35em] text-[#737373]"
        aria-label="글꼴 목록"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          window.clearTimeout(closeTimer.current);
          setBrowse(true);
          setOpen((current) => !current);
        }}
      >
        {shown ? <ChevronUp className="size-[1em]" /> : <ChevronDown className="size-[1em]" />}
      </button>
      {shown && place ? createPortal(list, document.body) : null}
    </div>
  );
}
