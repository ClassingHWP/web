import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useWide } from "./ui-actions.js";

// 시안(Toast·MToast·ToastSpec)의 토스트. 시안은 화면 맨 위지만 리본 단추를 가려서 아래로 옮겼다.
// 데스크톱은 상태 줄 위 오른쪽, 휴대폰은 아래 리본 띠(또는 서식 막대) 위에 꽉 차게 뜬다. 바닥은 data-toast-floor 인 띠다.
// 아래에서 올라오고, 여러 개면 새것이 맨 앞이고 먼저 온 것은 그 위로 10px 씩 비치며 작아진다.
// 마우스를 올리거나 손가락을 대면 위로 펼쳐지고 그동안은 사라지지 않는다.
// 위아래 여백은 시안보다 줄였다(높이 44px).
// 종류: info(알림) · saved(저장됨) · undo(되돌리기) · error(오류). 오류는 저절로 사라지지 않는다.

const lifetime = { info: 4000, saved: 4000, undo: 6000, error: 0 };
const maxShown = 3;
const leaveMs = 180;
const peek = 10;
const gap = 10;

function KindIcon({ kind }) {
  const common = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "#ffffff", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  if (kind === "saved") {
    return <svg {...common}><circle cx="12" cy="12" r="10" /><path d="m16 9-5.5 5.5L8 12" /></svg>;
  }
  if (kind === "error") {
    return <svg {...common}><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>;
  }
  return <svg {...common}><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>;
}

function ToastCard({ item, phone, hidden, onClose }) {
  const runAction = () => {
    onClose();
    item.action?.run?.();
  };
  return (
    <div
      role={item.kind === "error" ? "alert" : "status"}
      className={`box-border flex min-h-11 items-center rounded-[10px] py-1 pr-1 pl-4 leading-[1.35] text-white shadow-[0_10px_28px_rgba(0,0,0,0.22),0_2px_6px_rgba(0,0,0,0.12)] ${phone ? "w-full text-[17px]" : "ml-auto w-max max-w-full text-[18px]"}`}
      style={{ background: item.kind === "error" ? "#c42b1c" : "#171717" }}
    >
      <div className={`flex min-w-0 flex-1 items-center transition-opacity duration-200 ${hidden ? "opacity-0" : ""}`}>
        {item.kind !== "undo" ? (
          <span className="flex flex-none pr-[10px]">
            <KindIcon kind={item.kind} />
          </span>
        ) : null}
        <span className="min-w-0 flex-1">{item.text}</span>
        {item.action ? (
          <button
            type="button"
            tabIndex={hidden ? -1 : 0}
            className="ml-3 h-8 flex-none rounded-[7px] bg-white/[0.14] px-3 font-medium whitespace-nowrap text-white"
            onClick={runAction}
          >
            {item.action.label}
          </button>
        ) : null}
        <button
          type="button"
          aria-label="닫기"
          tabIndex={hidden ? -1 : 0}
          className="ml-1 flex size-9 flex-none items-center justify-center rounded-[7px] text-white/80"
          onClick={onClose}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function Toaster() {
  const wide = useWide();
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [heights, setHeights] = useState({});
  const [floor, setFloor] = useState(0);
  const timers = useRef(new Map());
  const stack = useRef(null);
  const nodes = useRef(new Map());
  const nextId = useRef(1);

  function remove(id) {
    window.clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    setItems((list) => list.map((item) => (item.id === id ? { ...item, leaving: true } : item)));
    window.setTimeout(() => setItems((list) => list.filter((item) => item.id !== id)), leaveMs);
  }

  function arm(item) {
    const ms = item.ms;
    if (!ms) return;
    window.clearTimeout(timers.current.get(item.id));
    timers.current.set(item.id, window.setTimeout(() => remove(item.id), ms));
  }

  // 새 토스트를 맨 앞에 넣는다. 보이는 것이 셋을 넘으면 가장 오래된 것부터 내보낸다.
  useEffect(() => {
    const onToast = (event) => {
      const detail = event.detail || {};
      const text = String(detail.text || "");
      if (!text) return;
      const kind = detail.kind || "info";
      const ms = Number.isFinite(detail.duration) ? detail.duration : lifetime[kind] ?? lifetime.info;
      const key = detail.key || "";
      // 같은 알림을 다시 띄우면 새로 쌓지 않고 남은 시간만 처음부터 센다.
      const same = key ? items.find((entry) => !entry.leaving && entry.key === key) : null;
      if (same) {
        if (!open) arm(same);
        return;
      }
      const item = { id: nextId.current++, kind, text, key, ms, action: detail.action || null, leaving: false };
      setItems((list) => {
        const live = list.filter((entry) => !entry.leaving);
        for (const old of live.slice(maxShown - 1)) window.setTimeout(() => remove(old.id), 0);
        return [item, ...list];
      });
      if (!open) arm(item);
    };
    window.addEventListener("chwp-toast", onToast);
    return () => window.removeEventListener("chwp-toast", onToast);
  });

  useEffect(() => () => {
    for (const timer of timers.current.values()) window.clearTimeout(timer);
  }, []);

  // 펼친 동안은 타이머를 멈추고, 접으면 다시 센다.
  useEffect(() => {
    if (open) {
      for (const timer of timers.current.values()) window.clearTimeout(timer);
      timers.current.clear();
    } else {
      for (const item of items) if (!item.leaving) arm(item);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 손가락으로 펼친 뒤 토스트 밖을 누르면 접는다.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = (event) => {
      if (stack.current && !stack.current.contains(event.target)) setOpen(false);
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [open]);

  useEffect(() => {
    if (!items.length) setOpen(false);
  }, [items.length]);

  // 바닥 띠(상태 줄·휴대폰 아래 띠·서식 막대) 위에 띄운다. 키보드가 뜨거나 창이 바뀌면 다시 잰다.
  useLayoutEffect(() => {
    if (!items.length) return undefined;
    const measure = () => {
      let top = window.innerHeight;
      for (const el of document.querySelectorAll("[data-toast-floor]")) {
        const rect = el.getBoundingClientRect();
        if (rect.height > 0 && rect.top < top) top = rect.top;
      }
      setFloor(Math.max(0, Math.round(window.innerHeight - top)));
    };
    measure();
    const view = window.visualViewport;
    window.addEventListener("resize", measure);
    view?.addEventListener("resize", measure);
    view?.addEventListener("scroll", measure);
    return () => {
      window.removeEventListener("resize", measure);
      view?.removeEventListener("resize", measure);
      view?.removeEventListener("scroll", measure);
    };
  }, [items.length, wide]);

  useLayoutEffect(() => {
    const next = {};
    let changed = false;
    for (const item of items) {
      const height = nodes.current.get(item.id)?.offsetHeight || 44;
      next[item.id] = height;
      if (heights[item.id] !== height) changed = true;
    }
    if (changed || Object.keys(heights).length !== items.length) setHeights(next);
  });

  if (!items.length) return null;
  const live = items.filter((item) => !item.leaving);
  const front = heights[live[0]?.id] || 44;
  let offset = 0;
  const places = new Map();
  // 사라지는 중인 것도 제자리를 지키다 내려간다. 먼저 온 것일수록 위로 간다.
  items.forEach((item, index) => {
    places.set(item.id, { index, y: open ? -offset : -peek * index });
    offset += (heights[item.id] || 44) + gap;
  });
  const height = open ? Math.max(0, offset - gap) : front + peek * Math.max(0, Math.min(live.length, maxShown) - 1);

  return (
    <div
      aria-live="polite"
      className={`toast-zone toolbar-ui pointer-events-none fixed z-[100] ${wide ? "right-4 w-[min(560px,calc(100vw-32px))]" : "right-[10px] left-[10px]"}`}
      style={{ bottom: floor + (wide ? 16 : 8) }}
    >
      <div
        ref={stack}
        className="pointer-events-auto relative transition-[height] duration-300"
        style={{ height }}
        onPointerEnter={(event) => { if (event.pointerType === "mouse") setOpen(true); }}
        onPointerLeave={(event) => { if (event.pointerType === "mouse") setOpen(false); }}
        onPointerDown={(event) => { if (event.pointerType !== "mouse") setOpen(true); }}
      >
        {items.map((item) => {
          const place = places.get(item.id) || { index: 0, y: 0 };
          const behind = !open && place.index > 0;
          const scale = behind ? 1 - 0.05 * Math.min(place.index, 2) : 1;
          return (
            <div
              key={item.id}
              className="toast-slot absolute right-0 bottom-0 left-0 origin-top"
              style={{
                zIndex: maxShown + 1 - place.index,
                transform: `translateY(${place.y}px) scale(${scale})`,
                visibility: place.index >= maxShown ? "hidden" : undefined,
              }}
            >
              <div
                ref={(node) => {
                  if (node) nodes.current.set(item.id, node);
                  else nodes.current.delete(item.id);
                }}
                className={item.leaving ? "toast-out" : "toast-in"}
              >
                <ToastCard item={item} phone={!wide} hidden={behind} onClose={() => remove(item.id)} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
