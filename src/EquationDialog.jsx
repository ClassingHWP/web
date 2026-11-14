import { useEffect, useRef, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { editEquation, equationPreview, equationView } from "./ui-actions.js";

// 수식 편집기(한글 2024 입력 → 수식, Ctrl+N,M. 고른 수식을 두 번 누르거나 고치기 Ctrl+N,K 로도 연다).
// 스크립트·글자 크기만 받고, 넣을지 고칠지·상자 크기·기준선은 코어(equationView·editEquation)가 정한다.
// 미리 보기는 코어가 그린 SVG 를 그대로 보인다. 아래 단추는 한글 수식 편집기 도구 상자의 자주 쓰는 틀을 스크립트에 끼운다.

export function openEquationDialog() {
  window.dispatchEvent(new Event("chwp-open-equation-dialog"));
}

// [이름, 끼울 글]. "#" 자리에 커서가 간다.
const templates = [
  ["분수", "{#} over {}"],
  ["근호", "sqrt {#}"],
  ["n제곱근", "root {#} of {}"],
  ["위첨자", "^{#}"],
  ["아래첨자", "_{#}"],
  ["합", "sum _{#} ^{}"],
  ["적분", "int _{#} ^{}"],
  ["극한", "lim _{# -> }"],
  ["괄호", "left ( # right )"],
  ["행렬", "{ matrix{# & # # & } }"],
  ["경우", "cases{# # }"],
  ["벡터", "vec {#}"],
];
const greek = ["alpha", "beta", "gamma", "delta", "theta", "lambda", "mu", "pi", "sigma", "omega", "infinity", "times", "div", "pm", "le", "ge", "ne", "approx"];
const sizes = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32];

export function EquationDialog() {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [script, setScript] = useState("");
  const [size, setSize] = useState(10);
  const [svg, setSvg] = useState("");
  const area = useRef(null);

  useEffect(() => {
    const onOpen = () => {
      void Promise.resolve(equationView()).then((view) => {
        const fields = view || {};
        setEditing(!!fields.editing);
        setScript(typeof fields.script === "string" ? fields.script : "");
        setSize(Math.round((Number(fields.baseUnit) || 1000) / 100));
        setSvg("");
        setOpen(true);
      });
    };
    window.addEventListener("chwp-open-equation-dialog", onOpen);
    return () => window.removeEventListener("chwp-open-equation-dialog", onOpen);
  }, []);

  // 미리 보기. 수식 글꼴을 아직 받는 중이면(ready 거짓) 조금 뒤 다시 묻는다.
  useEffect(() => {
    if (!open) return undefined;
    let alive = true;
    let timer = 0;
    const ask = (delay) => {
      timer = window.setTimeout(() => {
        void Promise.resolve(equationPreview(script, size * 100)).then((result) => {
          if (!alive) return;
          setSvg(result && typeof result.svg === "string" ? result.svg : "");
          if (result && result.ready === false) ask(500);
        });
      }, delay);
    };
    ask(150);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [open, script, size]);

  const close = () => {
    setOpen(false);
    window.dispatchEvent(new Event("chwp-focus-editor"));
  };
  const apply = () => {
    if (!script.trim()) return;
    close();
    editEquation(script, size * 100);
  };
  const put = (text) => {
    const el = area.current;
    const start = el ? el.selectionStart : script.length;
    const end = el ? el.selectionEnd : script.length;
    const before = script.slice(0, start);
    const pad = before && !/\s$/.test(before) ? " " : "";
    const mark = text.indexOf("#");
    const clean = text.replace(/#/g, "");
    const next = before + pad + clean + script.slice(end);
    setScript(next);
    const caret = start + pad.length + (mark >= 0 ? mark : clean.length);
    window.requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(caret, caret);
    });
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/45" />
        <DialogPrimitive.Content
          className="toolbar-ui ui-chrome fixed inset-x-0 bottom-0 z-[80] flex max-h-[92dvh] flex-col gap-3 overflow-y-auto rounded-t-[18px] bg-white px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.12)] outline-none lg:inset-auto lg:top-1/2 lg:left-1/2 lg:w-[640px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[10px] lg:p-6 lg:shadow-[0_0_0_1px_#d4d4d4,0_20px_40px_rgba(0,0,0,0.18)]"
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
              event.preventDefault();
              apply();
            }
          }}
        >
          <DialogPrimitive.Description className="sr-only">한글 수식 스크립트를 쓰고 미리 보기를 보며 수식을 넣거나 고칩니다.</DialogPrimitive.Description>
          <div className="flex items-center">
            <DialogPrimitive.Title className="flex-1 text-[20px] font-bold">{editing ? "수식 고치기" : "수식 편집기"}</DialogPrimitive.Title>
            <button type="button" className="ui-ghost flex size-12 items-center justify-center rounded-[10px] lg:hidden" aria-label="닫기" onClick={close}>
              <X className="size-6" />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {templates.map(([label, text]) => (
              <button key={label} type="button" className="ui-outline h-9 rounded-md px-2.5 text-[13px]" onClick={() => put(text)}>{label}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1">
            {greek.map((word) => (
              <button key={word} type="button" className="ui-ghost h-8 rounded-md px-2 text-[12px] text-[#444]" onClick={() => put(word + " ")}>{word}</button>
            ))}
          </div>
          <label className="flex flex-col gap-1.5">
            <span>수식 스크립트</span>
            <textarea
              ref={area}
              className="ui-box min-h-[96px] resize-y rounded-lg px-3 py-2 font-mono text-[14px]"
              value={script}
              onChange={(event) => setScript(event.target.value)}
              placeholder="예: x = {-b +- sqrt {b^2 - 4ac}} over {2a}"
              spellCheck={false}
              autoFocus
            />
          </label>
          <label className="flex items-center gap-2">
            <span>글자 크기</span>
            <select className="ui-box h-10 rounded-lg px-2" value={size} onChange={(event) => setSize(Number(event.target.value))}>
              {(sizes.includes(size) ? sizes : [...sizes, size].sort((a, b) => a - b)).map((pt) => (
                <option key={pt} value={pt}>{pt}pt</option>
              ))}
            </select>
          </label>
          <div className="flex min-h-[96px] items-center justify-center overflow-auto rounded-lg border border-[#e5e5e5] bg-[#fafafa] p-3" aria-label="미리 보기">
            {svg ? (
              <div
                className="max-w-full [&>svg]:h-auto [&>svg]:max-h-[220px] [&>svg]:max-w-full"
                style={{ width: "min(100%, 560px)" }}
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            ) : (
              <span className="text-[13px] text-[#888]">{script.trim() ? "미리 보기를 그리는 중…" : "스크립트를 쓰면 여기에 보입니다"}</span>
            )}
          </div>
          <div className="flex flex-row-reverse gap-2 border-t border-[#e5e5e5] pt-3">
            <button type="button" className="ui-primary h-11 flex-1 rounded-lg lg:flex-none lg:px-6" onClick={apply} disabled={!script.trim()}>{editing ? "고치기" : "넣기"}(Ctrl+Enter)</button>
            <button type="button" className="ui-outline h-11 flex-1 rounded-lg lg:flex-none lg:px-6" onClick={close}>취소</button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
