import { useEffect, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { TriangleAlert, X } from "lucide-react";
import { FontField } from "@/FontField";

// 막힌 글꼴마다 지난번에 고른 글꼴. 이 브라우저에만 남는다. 못 읽으면 기본 짝을 쓴다.
const choiceKey = "noting.fontSwapChoices";

function readChoices() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(choiceKey) || "{}");
    return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
  } catch {
    return {};
  }
}

// 기본 짝과 다르게 고른 것만 남긴다. 기본 짝으로 되돌리면 남긴 것을 지운다.
function saveChoices(swaps, chosen) {
  try {
    const saved = readChoices();
    for (const swap of swaps) {
      const pick = chosen[swap.from];
      if (pick && pick !== swap.to) saved[swap.from] = pick;
      else delete saved[swap.from];
    }
    window.localStorage.setItem(choiceKey, JSON.stringify(saved));
  } catch {
    // 저장하지 못해도 이번 바꾸기는 그대로 한다.
  }
}

// 라이선스로 막힌 글꼴이 있는 문서를 처음 고치려 할 때 뜬다.
// 코어가 편집을 받지 않고 needsFontSwap 을 돌려주면 preview.js 가 noting-font-swap-ask 로 바꿀 목록을 보낸다.
// 줄마다 바꿀 글꼴을 고를 수 있다. 처음 값은 지난번에 고른 글꼴, 없으면 코어가 정한 짝이다.
export function FontSwapDialog() {
  const [swaps, setSwaps] = useState(null);
  const [chosen, setChosen] = useState({});
  const applyRef = useRef(null);
  const [fonts, setFonts] = useState(() => (Array.isArray(window.__notingFontList) ? window.__notingFontList : []));

  useEffect(() => {
    const onList = (event) => {
      if (Array.isArray(event.detail)) setFonts(event.detail);
    };
    window.addEventListener("noting-font-list", onList);
    return () => window.removeEventListener("noting-font-list", onList);
  }, []);

  useEffect(() => {
    const onAsk = (event) => {
      const list = Array.isArray(event.detail?.swaps) ? event.detail.swaps : [];
      if (!list.length) return;
      const pickable = new Set(Array.isArray(window.__notingFontList) ? window.__notingFontList : []);
      const saved = readChoices();
      const start = {};
      for (const swap of list) start[swap.from] = pickable.has(saved[swap.from]) ? saved[swap.from] : swap.to;
      setChosen(start);
      setSwaps(list);
    };
    window.addEventListener("noting-font-swap-ask", onAsk);
    return () => window.removeEventListener("noting-font-swap-ask", onAsk);
  }, []);

  function answer(apply) {
    setSwaps(null);
    if (!apply) {
      window.dispatchEvent(new Event("noting-font-swap-cancel"));
      return;
    }
    saveChoices(swaps || [], chosen);
    window.dispatchEvent(new CustomEvent("noting-font-swap-apply", { detail: { chosen } }));
  }

  // 글꼴 목록은 body 에 뜨므로 모달로 두면 누를 수 없다. 모달을 끄고 덮개는 직접 깐다.
  // 모양은 시안(다이얼로그 · 글꼴 바꾸기)대로 너비 500px, 오른쪽 위 닫기, 회색 목록 상자다.
  return (
    <DialogPrimitive.Root modal={false} open={!!swaps} onOpenChange={(open) => (open ? null : answer(false))}>
      <DialogPrimitive.Portal>
        {swaps ? <div className="fixed inset-0 z-[70] bg-black/45" aria-hidden="true" /> : null}
        <DialogPrimitive.Content
          className="toolbar-ui ui-chrome fixed top-1/2 left-1/2 z-[70] flex max-h-[calc(100dvh-1.5rem)] w-[calc(100vw-1.5rem)] max-w-[500px] -translate-x-1/2 -translate-y-1/2 flex-col gap-3.5 overflow-y-auto rounded-[10px] bg-white p-6 leading-[1.6] shadow-[0_0_0_1px_#d4d4d4,0_20px_40px_rgba(0,0,0,0.18)] outline-none"
          // 치던 글자가 글꼴 칸에 들어가지 않게 처음 초점은 바꾸기 단추에 둔다.
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            applyRef.current?.focus();
          }}
          onInteractOutside={(event) => {
            const target = event.target;
            if (target instanceof Element && target.closest("[data-font-list]")) event.preventDefault();
          }}
        >
          <button type="button" className="ui-ghost absolute top-3 right-3 flex size-10 items-center justify-center rounded-lg" aria-label="닫기" onClick={() => answer(false)}>
            <X className="size-[18px] text-[#737373]" />
          </button>
          <DialogPrimitive.Title className="flex items-center gap-2.5 pr-10 text-[20px] font-bold">
            <TriangleAlert className="size-[22px] shrink-0 text-[#b45309]" aria-hidden="true" />
            글꼴을 바꾼 뒤 편집합니다
          </DialogPrimitive.Title>
          <DialogPrimitive.Description>
            이 문서에는 라이선스 문제로 쓸 수 없는 글꼴이 있습니다. 편집하려면 아래 글꼴을 문서 전체에서 한꺼번에 바꿔야 합니다. 바꿀 글꼴은 직접 고를 수 있습니다.
          </DialogPrimitive.Description>
          <ul className="max-h-72 overflow-y-auto rounded-lg bg-[#f7f7f7] px-3.5 py-2 shadow-[inset_0_0_0_1px_#f5f5f5]">
            {(swaps || []).map((swap, index) => (
              <li key={swap.from} className={`flex items-center gap-2.5 py-1 ${index ? "border-t border-[#e5e5e5]" : ""}`}>
                <span className="min-w-0 flex-1 truncate" title={swap.from}>
                  {swap.from}
                </span>
                <span className="text-[#737373]" aria-label="에서">→</span>
                <FontField
                  className="w-52 shrink-0"
                  layer="z-[80]"
                  value={chosen[swap.from] || swap.to}
                  fonts={fonts}
                  onPick={(face) => setChosen((current) => ({ ...current, [swap.from]: face }))}
                />
              </li>
            ))}
          </ul>
          <p className="text-[16px] text-[#737373]">
            글꼴이 바뀌면 글자 폭과 줄 간격이 달라져 줄 나눔·쪽 나눔 등 문서 디자인이 바뀔 수 있습니다.
          </p>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" className="ui-outline h-11 rounded-lg px-[18px]" onClick={() => answer(false)}>
              취소
            </button>
            <button ref={applyRef} type="button" className="ui-primary h-11 rounded-lg px-[18px]" onClick={() => answer(true)}>
              바꾸고 편집
            </button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
