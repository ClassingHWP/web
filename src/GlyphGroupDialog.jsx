import { useEffect, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { glyphGroupView, setGlyphGroup } from "./ui-actions.js";

// 덧말 넣기와 글자 겹치기(한글 2024 입력 → 덧말 넣기, 입력 도우미 → 글자 겹치기).
// 항목·단축 글자는 한글 2024 대화 상자를 따른다.
// 덧말: 본말(B)·덧말(Y), 덧말 위치 위(A)·아래(U) 단추, 덧말 스타일의 적용할 스타일(S), 넣기(D)·취소, 고칠 때 덧말 지움(E).
// 글자 겹치기: 겹쳐 쓸 글자(E), 겹치기 종류의 모양 단추 14개(테두리 없음 포함), 글자 크기 조절(I) 50~150% 10 씩,
// 모양 안에 글자 겹치기(Y), 넣기(D)·취소. 겹쳐 쓸 글자 칸에는 길이 한도가 없다.
// 처음 값·고칠 대상·넣는 규칙은 코어가 정한다. edit 면 캐럿 뒤(또는 고른) 덧말·겹치기를 고친다.

export function openRubyDialog(edit = false) {
  window.dispatchEvent(new CustomEvent("chwp-open-ruby-dialog", { detail: { edit } }));
}

export function openComposeDialog(edit = false) {
  window.dispatchEvent(new CustomEvent("chwp-open-compose-dialog", { detail: { edit } }));
}

const shell = "toolbar-ui ui-chrome fixed inset-x-0 bottom-0 z-[80] flex max-h-[92dvh] flex-col gap-3 overflow-y-auto rounded-t-[18px] bg-white px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.12)] outline-none lg:inset-auto lg:top-1/2 lg:left-1/2 lg:w-[420px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[10px] lg:p-6 lg:shadow-[0_0_0_1px_#d4d4d4,0_20px_40px_rgba(0,0,0,0.18)]";
const box = "ui-box h-9 rounded-md px-2";

function Frame({ open, onClose, title, description, children }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/45" />
        <DialogPrimitive.Content className={shell}>
          <DialogPrimitive.Description className="sr-only">{description}</DialogPrimitive.Description>
          <div className="flex items-center">
            <DialogPrimitive.Title className="flex-1 text-[20px] font-bold">{title}</DialogPrimitive.Title>
            <button type="button" className="ui-ghost flex size-12 items-center justify-center rounded-[10px] lg:hidden" aria-label="닫기" onClick={onClose}>
              <X className="size-6" />
            </button>
          </div>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function Buttons({ onApply, onClose, disabled, applyLabel, extra }) {
  return (
    <div className="flex flex-row-reverse flex-wrap gap-2 border-t border-[#e5e5e5] pt-3">
      <button type="button" className="ui-primary h-11 flex-1 rounded-lg lg:flex-none lg:px-5" onClick={onApply} disabled={disabled}>{applyLabel}</button>
      {extra}
      <button type="button" className="ui-outline h-11 flex-1 rounded-lg lg:flex-none lg:px-5" onClick={onClose}>취소</button>
    </div>
  );
}

function Row({ label, children }) {
  return (
    <label className="flex items-center gap-2">
      <span className="min-w-[6.5em] shrink-0 whitespace-nowrap">{label}</span>
      {children}
    </label>
  );
}

const focusEditor = () => window.dispatchEvent(new Event("chwp-focus-editor"));

export function RubyDialog() {
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(false);
  const [styles, setStyles] = useState([]);
  const [form, setForm] = useState({ mainText: "", subText: "", pos: "TOP", style: -1 });
  useEffect(() => {
    const onOpen = (event) => {
      void glyphGroupView().then((view) => {
        const editing = !!event?.detail?.edit && view?.editKind === "ruby";
        setEdit(editing);
        setStyles(String(view?.styles || "").split("\n"));
        setForm(editing
          ? { mainText: String(view?.editMainText ?? ""), subText: String(view?.editSubText ?? ""), pos: String(view?.editPos || "TOP"), style: Number(view?.editStyle ?? -1) }
          : { mainText: String(view?.mainText ?? ""), subText: "", pos: String(view?.pos || "TOP"), style: Number(view?.style ?? -1) });
        setOpen(true);
      });
    };
    window.addEventListener("chwp-open-ruby-dialog", onOpen);
    return () => window.removeEventListener("chwp-open-ruby-dialog", onOpen);
  }, []);
  const close = () => {
    setOpen(false);
    focusEditor();
  };
  const set = (key) => (event) => setForm((prev) => ({ ...prev, [key]: event.target.value }));
  const run = (fields) => {
    void setGlyphGroup(fields).then((result) => {
      if (result?.documentChanged) close();
    });
  };
  const apply = () => run({ kind: "ruby", action: edit ? "modify" : "insert", mainText: form.mainText, subText: form.subText, pos: form.pos, style: Number(form.style) });
  const enter = (event) => { if (event.key === "Enter") apply(); };
  return (
    <Frame open={open} onClose={close} title={edit ? "덧말 편집" : "덧말 넣기"} description="본말 위쪽이나 아래쪽에 덧말을 넣습니다.">
      <Row label="본말(B)"><input className={`${box} flex-1`} value={form.mainText} onChange={set("mainText")} onKeyDown={enter} autoFocus={!form.mainText} /></Row>
      <Row label="덧말(Y)"><input className={`${box} flex-1`} value={form.subText} onChange={set("subText")} onKeyDown={enter} autoFocus={!!form.mainText} /></Row>
      <fieldset className="flex flex-col gap-2 rounded-md border border-[#e5e5e5] p-2">
        <legend className="px-1">덧말 위치</legend>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="덧말 위치">
          {[["TOP", "위(A)"], ["BOTTOM", "아래(U)"]].map(([value, label]) => (
            <button key={value} type="button" role="radio" aria-checked={form.pos === value}
              className={`h-10 rounded-md border ${form.pos === value ? "border-[#2563eb] bg-[#e8efff]" : "border-[#e5e5e5]"}`}
              onClick={() => setForm((prev) => ({ ...prev, pos: value }))}>
              {label}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-2 rounded-md border border-[#e5e5e5] p-2">
        <legend className="px-1">덧말 스타일</legend>
        <Row label="적용할 스타일(S)">
          <select className={`${box} flex-1`} value={form.style} onChange={set("style")}>
            <option value={-1}>(없음)</option>
            {styles.map((name, index) => (name ? <option key={index} value={index}>{name}</option> : null))}
          </select>
        </Row>
      </fieldset>
      <Buttons onApply={apply} onClose={close} disabled={!form.mainText || !form.subText} applyLabel={edit ? "고치기(D)" : "넣기(D)"}
        extra={edit ? <button type="button" className="ui-outline h-11 flex-1 rounded-lg lg:flex-none lg:px-5" onClick={() => run({ action: "remove" })}>덧말 지움(E)</button> : null} />
    </Frame>
  );
}

// 모양 이름은 코어(model::composeCircleName) 표와 같다. 보이는 글자는 한글이 모양으로 찍는 글자다.
const SHAPES = [
  ["CHAR", "가", "테두리 없음"], ["SHAPE_CIRCLE", "◯", "원 문자"], ["SHAPE_REVERSAL_CIRCLE", "●", "반전된 원 문자"], ["SHAPE_RECTANGLE", "□", "사각형 문자"],
  ["SHAPE_REVERSAL_RECTANGLE", "■", "반전된 사각형 문자"], ["SHAPE_TRIANGLE", "△", "삼각형 문자"], ["SHAPE_REVERSAL_TIRANGLE", "▲", "반전된 삼각형 문자"],
  ["SHAPE_LIGHT", "☼", "해모양 문자"], ["SHAPE_RHOMBUS", "◇", "마름모 문자"], ["SHAPE_REVERSAL_RHOMBUS", "◆", "반전된 마름모 문자"],
  ["SHAPE_ROUNDED_RECTANGLE", "▢", "모서리가 둥근 네모 문자"], ["SHAPE_EMPTY_CIRCULATE_TRIANGLE", "♲", "빈 재활용 글자"],
  ["SHAPE_THIN_CIRCULATE_TRIANGLE", "♺", "재활용 글자"], ["SHAPE_THICK_CIRCULATE_TRIANGLE", "♻", "반전된 재활용 글자"],
];
// 글자 크기 조절 50%~150%, 10 씩. 코어 값은 (퍼센트 − 100) ÷ 10 이다.
const SIZES = [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];

// 글자 겹치기 대화 상자. 한글처럼 글자 겹치기만 두 개 이상 든 블록에서 열면 "모양 바꾸기"(
// 모든 문자에 동일한 모양 적용, 모양 14가지, 모양 안에 글자 겹치기, 적용(D))이고, 겹치기 하나를 블록으로 고르고 열면
// 그 값을 채워 고친다. 어느 쪽인지는 코어(glyphGroupView 의 editKind)가 정한다.
export function ComposeDialog() {
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(false);
  const [reshape, setReshape] = useState(false);
  const [form, setForm] = useState({ chars: "", circle: "CHAR", size: -3, type: "OVERLAP" });
  useEffect(() => {
    const onOpen = (event) => {
      void glyphGroupView().then((view) => {
        const shape = view?.editKind === "composeShape";
        const editing = !shape && view?.editKind === "compose" && (!!event?.detail?.edit || !!view?.editFromBlock);
        setReshape(shape);
        setEdit(editing);
        const next = shape
          ? { chars: "", circle: String(view?.editCircle || "CHAR"), size: -3, type: String(view?.editType || "SPREAD") }
          : editing
          ? { chars: String(view?.editChars ?? ""), circle: String(view?.editCircle || "CHAR"), size: Number(view?.editSize ?? -3), type: String(view?.editType || "OVERLAP") }
          : { chars: String(view?.chars ?? ""), circle: String(view?.circle || "CHAR"), size: Number(view?.size ?? -3), type: String(view?.type || "OVERLAP") };
        setForm(next);
        setOpen(true);
      });
    };
    window.addEventListener("chwp-open-compose-dialog", onOpen);
    return () => window.removeEventListener("chwp-open-compose-dialog", onOpen);
  }, []);
  const close = () => {
    setOpen(false);
    focusEditor();
  };
  const apply = () => {
    const fields = reshape
      ? { kind: "compose", action: "reshape", circle: form.circle, type: form.type }
      : { kind: "compose", action: edit ? "modify" : "insert", chars: form.chars, circle: form.circle, size: Number(form.size), type: form.type };
    void setGlyphGroup(fields).then((result) => {
      if (result?.documentChanged) close();
    });
  };
  const count = [...form.chars].length;
  const shapeButtons = (
    <div className="grid grid-cols-5 gap-1" role="radiogroup" aria-label="겹치기 모양">
      {SHAPES.map(([value, glyph, label]) => (
        <button key={value} type="button" role="radio" aria-checked={form.circle === value} aria-label={label} title={label}
          className={`h-10 rounded-md border text-[17px] ${form.circle === value ? "border-[#2563eb] bg-[#e8efff]" : "border-[#e5e5e5]"}`}
          onClick={() => setForm((prev) => ({ ...prev, circle: value }))}>
          {glyph}
        </button>
      ))}
    </div>
  );
  const overlapCheck = (
    <label className="flex items-center gap-1">
      <input type="checkbox" checked={form.type === "OVERLAP"} onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.checked ? "OVERLAP" : "SPREAD" }))} />
      모양 안에 글자 겹치기(Y)
    </label>
  );
  if (reshape) {
    return (
      <Frame open={open} onClose={close} title="모양 바꾸기" description="블록 안 글자 겹치기 모두에 같은 모양을 줍니다.">
        <fieldset className="flex flex-col gap-2 rounded-md border border-[#e5e5e5] p-2">
          <legend className="px-1">모든 문자에 동일한 모양 적용</legend>
          {shapeButtons}
          {overlapCheck}
        </fieldset>
        <Buttons onApply={apply} onClose={close} applyLabel="적용(D)" />
      </Frame>
    );
  }
  return (
    <Frame open={open} onClose={close} title="글자 겹치기" description="두 개나 세 개의 글자를 같은 자리에 겹쳐서 새로운 글자를 만듭니다.">
      <Row label="겹쳐 쓸 글자(E)">
        <input className={`${box} flex-1`} value={form.chars} autoFocus onChange={(event) => setForm((prev) => ({ ...prev, chars: event.target.value }))}
          onKeyDown={(event) => { if (event.key === "Enter") apply(); }} />
      </Row>
      <fieldset className="flex flex-col gap-2 rounded-md border border-[#e5e5e5] p-2">
        <legend className="px-1">겹치기 종류</legend>
        {shapeButtons}
        <Row label="글자 크기 조절(I)">
        <select className={`${box} flex-1`} value={form.size} onChange={(event) => setForm((prev) => ({ ...prev, size: Number(event.target.value) }))}>
          {SIZES.map((size) => <option key={size} value={size}>{100 + size * 10}%</option>)}
        </select>
        </Row>
        {overlapCheck}
      </fieldset>
      <Buttons onApply={apply} onClose={close} disabled={count === 0} applyLabel={edit ? "고치기(D)" : "넣기(D)"} />
    </Frame>
  );
}
