import { useEffect, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { toast } from "./ui-actions.js";

// 차례 만들기(한글 2024 차례 만들기 대화 상자)와 차례 새로 고침. 무엇을 모으고 어떻게 넣는지는 코어(editToc)가 정한다.
// 셸은 고른 값을 그대로 넘긴다. 처음 값은 한글 대화 상자 처음 값이다.

export function openTocDialog() {
  window.dispatchEvent(new Event("chwp-open-toc-dialog"));
}

function tocCommand(action, fields = {}) {
  if (typeof window.__chwpTocCommand !== "function") return Promise.resolve(null);
  return Promise.resolve(window.__chwpTocCommand(action, fields)).then((result) => {
    if (result && !result.documentChanged && result.error) toast(result.error, "info", null, { key: "toc" });
    return result;
  });
}

// 차례 새로 고침: 캐럿이 있는 차례(update) 또는 모든 차례(updateAll).
export function updateToc(all = false) {
  return tocCommand(all ? "updateAll" : "update");
}

const shell = "toolbar-ui ui-chrome fixed inset-x-0 bottom-0 z-[80] flex max-h-[92dvh] flex-col gap-3 overflow-y-auto rounded-t-[18px] bg-white px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.12)] outline-none lg:inset-auto lg:top-1/2 lg:left-1/2 lg:w-[460px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[10px] lg:p-6 lg:shadow-[0_0_0_1px_#d4d4d4,0_20px_40px_rgba(0,0,0,0.18)]";
const box = "ui-box h-9 rounded-md px-2";

// 채울 모양(탭 채움 번호). 3 은 한글 차례 처음 값(파선)이다.
const leaders = [[0, "없음"], [1, "실선"], [2, "점선"], [3, "파선"], [4, "일점쇄선"], [5, "이점쇄선"]];
const startOptions = {
  field: true, outline: true, level: 2, byStyle: false, styles: [], tables: true, pictures: true, equations: true,
  autoTab: false, leader: 3, hyperlink: true,
};

function Group({ title, children }) {
  return (
    <div className="flex flex-col gap-2 border-t border-[#e5e5e5] pt-2">
      <span className="font-medium">{title}</span>
      {children}
    </div>
  );
}

function Check({ checked, onChange, disabled = false, children }) {
  return (
    <label className={`flex items-center gap-2 ${disabled ? "opacity-40" : ""}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      {children}
    </label>
  );
}

export function TocDialog() {
  const [open, setOpen] = useState(false);
  const [o, setO] = useState(startOptions);
  const [styleNames, setStyleNames] = useState([]);
  useEffect(() => {
    const onOpen = () => {
      setO(startOptions);
      const view = typeof window.__chwpStyleView === "function" ? window.__chwpStyleView(-1) : Promise.resolve(null);
      void Promise.resolve(view).then((got) => {
        const names = String(got?.rows || "").split("\n").filter(Boolean).map((line) => line.split("\t"))
          .filter((cols) => cols[3] !== "CHAR").map((cols) => cols[1]);
        setStyleNames(names);
        setOpen(true);
      });
    };
    window.addEventListener("chwp-open-toc-dialog", onOpen);
    return () => window.removeEventListener("chwp-open-toc-dialog", onOpen);
  }, []);
  const set = (key, value) => setO((prev) => ({ ...prev, [key]: value }));
  const close = () => {
    setOpen(false);
    window.dispatchEvent(new Event("chwp-focus-editor"));
  };
  const make = () => {
    const fields = { ...o, styles: o.styles.join("\n") };
    void tocCommand("make", fields).then((result) => {
      if (result?.documentChanged) close();
    });
  };
  const toggleStyle = (name) => set("styles", o.styles.includes(name) ? o.styles.filter((n) => n !== name) : [...o.styles, name]);
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/45" />
        <DialogPrimitive.Content className={shell} onOpenAutoFocus={(event) => event.preventDefault()}>
          <DialogPrimitive.Description className="sr-only">개요 문단·스타일·표·그림·수식으로 차례를 만듭니다.</DialogPrimitive.Description>
          <div className="flex items-center">
            <DialogPrimitive.Title className="flex-1 text-[20px] font-bold">차례 만들기</DialogPrimitive.Title>
            <button type="button" className="ui-ghost flex size-10 items-center justify-center rounded-[10px]" aria-label="닫기" onClick={close}>
              <X className="size-5" />
            </button>
          </div>
          <Group title="차례 형식">
            <div className="flex gap-4">
              <label className="flex items-center gap-1"><input type="radio" checked={o.field} onChange={() => set("field", true)} />필드로 넣기</label>
              <label className="flex items-center gap-1"><input type="radio" checked={!o.field} onChange={() => set("field", false)} />문자열로 넣기</label>
            </div>
          </Group>
          <Group title="만들 차례">
            <Check checked={o.outline} onChange={(v) => set("outline", v)}>개요 문단으로 모으기</Check>
            <label className={`flex items-center gap-2 pl-6 ${o.outline ? "" : "opacity-40"}`}>
              <span>개요 수준</span>
              <select className={box} value={o.level} disabled={!o.outline} onChange={(event) => set("level", Number(event.target.value))}>
                {Array.from({ length: 10 }, (_, i) => <option key={i} value={i}>{i + 1} 수준</option>)}
              </select>
              <span>까지</span>
            </label>
            <Check checked={o.byStyle} onChange={(v) => set("byStyle", v)}>스타일로 모으기</Check>
            <div className={`ml-6 flex max-h-[8em] flex-col overflow-y-auto rounded-md border border-[#e5e5e5] ${o.byStyle ? "" : "opacity-40"}`}>
              {styleNames.map((name) => (
                <label key={name} className="flex items-center gap-2 px-2 py-0.5">
                  <input type="checkbox" disabled={!o.byStyle} checked={o.styles.includes(name)} onChange={() => toggleStyle(name)} />
                  {name}
                </label>
              ))}
            </div>
            <Check checked={o.tables} onChange={(v) => set("tables", v)}>표 차례</Check>
            <Check checked={o.pictures} onChange={(v) => set("pictures", v)}>그림 차례</Check>
            <Check checked={o.equations} onChange={(v) => set("equations", v)}>수식 차례</Check>
          </Group>
          <Group title="탭 모양">
            <label className="flex items-center gap-1"><input type="radio" checked={o.autoTab} onChange={() => set("autoTab", true)} />문단 오른쪽 끝 자동 탭</label>
            <label className="flex items-center gap-1"><input type="radio" checked={!o.autoTab} onChange={() => set("autoTab", false)} />오른쪽 탭</label>
            <label className={`flex items-center gap-2 pl-6 ${o.autoTab ? "opacity-40" : ""}`}>
              <span>채울 모양</span>
              <select className={box} value={o.leader} disabled={o.autoTab} onChange={(event) => set("leader", Number(event.target.value))}>
                {leaders.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </label>
          </Group>
          <Group title="기타">
            <Check checked={o.hyperlink && !o.byStyle} disabled={o.byStyle} onChange={(v) => set("hyperlink", v)}>하이퍼링크 만들기</Check>
          </Group>
          <div className="flex flex-row-reverse gap-2 border-t border-[#e5e5e5] pt-3">
            <button type="button" className="ui-primary h-10 rounded-lg px-5" onClick={make}>만들기</button>
            <button type="button" className="ui-outline h-10 rounded-lg px-5" onClick={close}>취소</button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
