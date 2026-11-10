import { useEffect, useMemo, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";

// 문자표. 고른 글자는 붙여 넣기와 같은 입력칸 사건으로 코어에 넘긴다(넣을 자리·모양은 코어가 정한다).
// 리본·메뉴는 openSymbolDialog 로 연다.

export function openSymbolDialog() {
  window.dispatchEvent(new Event("chwp-open-symbol-dialog"));
}

const range = (from, to) => {
  const out = [];
  for (let cp = from; cp <= to; cp += 1) out.push(String.fromCodePoint(cp));
  return out;
};
const chars = (text) => Array.from(text);

// 한글 문자표의 자주 쓰는 묶음. 유니코드 영역에서 그대로 가져온다.
const groups = [
  ["전각 기호", chars("※★☆○●◎◇◆□■△▲▽▼→←↑↓↔〓◁◀▷▶♤♠♡♥♧♣⊙◈▣◐◑▒▤▥▨▧▦▩♨☏☎☜☞¶†‡↕↗↙↖↘♭♩♪♬㉿㈜№㏇™㏂㏘℡€®©‰§·…‥〃‘’“”〔〕〈〉《》「」『』【】")],
  ["원문자", [...range(0x2460, 0x2473), ...range(0x3260, 0x326d), ...range(0x326e, 0x327b), ...range(0x24d0, 0x24e9), ...range(0x24b6, 0x24cf)]],
  ["괄호 문자", [...range(0x2474, 0x2487), ...range(0x3200, 0x320d), ...range(0x320e, 0x321b), ...range(0x249c, 0x24b5)]],
  ["단위", [...chars("℃℉°′″Å￠￡￥¤"), ...range(0x3380, 0x33dd), ...chars("ℓΩ")]],
  ["수학 기호", chars("±×÷≠≤≥∞∴∵∠⊥⌒∂∇≡≒≪≫√∽∝∫∬∈∋⊆⊇⊂⊃∪∩∧∨￢⇒⇔∀∃∮∑∏½⅓⅔¼¾⅛⅜⅝⅞¹²³⁴ⁿ₁₂₃₄")],
  ["화살표", range(0x2190, 0x21ff)],
  ["그리스 문자", [...range(0x0391, 0x03a1), ...range(0x03a3, 0x03a9), ...range(0x03b1, 0x03c1), ...range(0x03c3, 0x03c9)]],
  ["로마 숫자", [...range(0x2160, 0x216b), ...range(0x2170, 0x217b)]],
  ["한글 자모", [...range(0x3131, 0x314e), ...range(0x314f, 0x3163), ...range(0x3165, 0x318e)]],
  ["도형", range(0x25a0, 0x25ff)],
  ["괘선", range(0x2500, 0x257f)],
];

export function SymbolDialog() {
  const [open, setOpen] = useState(false);
  const [group, setGroup] = useState(0);
  const [picked, setPicked] = useState("");

  useEffect(() => {
    const onOpen = () => {
      setPicked("");
      setOpen(true);
    };
    window.addEventListener("chwp-open-symbol-dialog", onOpen);
    return () => window.removeEventListener("chwp-open-symbol-dialog", onOpen);
  }, []);

  const list = useMemo(() => groups[group][1], [group]);
  const close = () => {
    setOpen(false);
    window.dispatchEvent(new Event("chwp-focus-editor"));
  };
  const apply = () => {
    const text = picked;
    close();
    if (text && typeof window.__chwpInsertSymbol === "function") window.__chwpInsertSymbol(text);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/45" />
        <DialogPrimitive.Content
          className="toolbar-ui ui-chrome fixed inset-x-0 bottom-0 z-[80] flex max-h-[85vh] flex-col gap-3 rounded-t-[18px] bg-white px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.12)] outline-none lg:inset-auto lg:top-1/2 lg:left-1/2 lg:w-[560px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[10px] lg:p-6 lg:shadow-[0_0_0_1px_#d4d4d4,0_20px_40px_rgba(0,0,0,0.18)]"
          onOpenAutoFocus={(event) => event.preventDefault()}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              apply();
            }
          }}
        >
          <DialogPrimitive.Description className="sr-only">넣을 기호를 고릅니다. 여러 개를 골라 한 번에 넣을 수 있습니다.</DialogPrimitive.Description>
          <div className="flex items-center">
            <DialogPrimitive.Title className="flex-1 text-[20px] font-bold">문자표</DialogPrimitive.Title>
            <button type="button" className="ui-ghost flex size-12 items-center justify-center rounded-[10px] lg:hidden" aria-label="닫기" onClick={close}>
              <X className="size-6" />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 gap-3">
            <div className="flex w-[7.5em] flex-none flex-col gap-1 overflow-y-auto" role="tablist" aria-label="문자 영역">
              {groups.map(([name], index) => (
                <button
                  key={name}
                  type="button"
                  role="tab"
                  aria-selected={group === index}
                  className={`ui-rb rounded-md px-2 py-1.5 text-left ${group === index ? "on" : ""}`}
                  onClick={() => setGroup(index)}
                >
                  {name}
                </button>
              ))}
            </div>
            <div className="grid min-h-0 flex-1 auto-rows-[2.4em] grid-cols-8 gap-1 overflow-y-auto lg:max-h-[340px] lg:grid-cols-10" role="listbox" aria-label={groups[group][0]}>
              {list.map((ch) => (
                <button
                  key={ch}
                  type="button"
                  role="option"
                  aria-selected={false}
                  title={`U+${ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0")}`}
                  className="ui-box flex items-center justify-center rounded-md text-[1.25em] hover:bg-[#eff6ff]"
                  onClick={() => setPicked((old) => old + ch)}
                  onDoubleClick={() => {
                    close();
                    if (typeof window.__chwpInsertSymbol === "function") window.__chwpInsertSymbol(ch);
                  }}
                >
                  {ch}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2">
            <span className="flex-none">입력 문자</span>
            <input className="ui-box h-10 min-w-0 flex-1 rounded-lg px-2 text-[1.1em]" aria-label="입력 문자" value={picked} onChange={(event) => setPicked(event.target.value)} />
          </label>
          <div className="flex flex-row-reverse gap-2 border-t border-[#e5e5e5] pt-3">
            <button type="button" className="ui-primary h-11 flex-1 rounded-lg lg:flex-none lg:px-6" onClick={apply} disabled={!picked}>넣기(D)</button>
            <button type="button" className="ui-outline h-11 flex-1 rounded-lg lg:flex-none lg:px-6" onClick={close}>취소</button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
