import { useEffect, useState } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { pageControl, pageControlFields } from "./ui-actions.js";

// 머리말/꼬리말 대화 상자(한글 2024 쪽 → 머리말/꼬리말, Ctrl+N,H). 항목은 한글 대화 상자와 같다:
// 종류 머리말(H)·꼬리말(F), 위치 양쪽(B)·홀수 쪽(O)·짝수 쪽(E), 만들기(D)·취소·편집(R).
// 머리말/꼬리말 마당(서식 목록)·미리 보기·쪽 번호 모양은 한컴 서식이라 두지 않았다.
// 만들기는 코어 header·footer(캐럿 문단 맨 앞에 새로 넣고 들어간다), 편집은 코어 editBand 다.
// 한글 2024 화면으로 확인한 것: 열 때마다 종류는 머리말, 위치는 양쪽이다. 편집 단추는 문서에 머리말·꼬리말이
// 하나라도 있을 때만 보인다. 고른 종류·위치의 것이 없으면 "지정한 모양의 머리말/꼬리말이 없습니다. 새로 만들까요?"를
// 묻고, 만들기면 새로 만든다. 있으면 캐럿 쪽(없으면 앞쪽, 그다음 뒤쪽)의 그것으로 들어간다(코어 editBand).

export function openHeaderFooterDialog() {
  window.dispatchEvent(new Event("chwp-open-header-footer-dialog"));
}

const shell = "toolbar-ui ui-chrome fixed inset-x-0 bottom-0 z-[80] flex max-h-[92dvh] flex-col gap-3 overflow-y-auto rounded-t-[18px] bg-white px-4 pt-3 pb-[max(16px,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(0,0,0,0.12)] outline-none lg:inset-auto lg:top-1/2 lg:left-1/2 lg:w-[380px] lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-[10px] lg:p-6 lg:shadow-[0_0_0_1px_#d4d4d4,0_20px_40px_rgba(0,0,0,0.18)]";
const focusEditor = () => window.dispatchEvent(new Event("chwp-focus-editor"));

const BANDS = [["header", "머리말(H)"], ["footer", "꼬리말(F)"]];
const APPLIES = [["BOTH", "양쪽(B)"], ["ODD", "홀수 쪽(O)"], ["EVEN", "짝수 쪽(E)"]];

function valueOf(fields, key) {
  if (!fields) return undefined;
  if (Array.isArray(fields)) {
    const found = fields.find((item) => item && (item[0] === key || item.name === key));
    return found ? (Array.isArray(found) ? found[1] : found.value) : undefined;
  }
  return fields[key];
}

export function HeaderFooterDialog() {
  const [open, setOpen] = useState(false);
  const [band, setBand] = useState("header");
  const [apply, setApply] = useState("BOTH");
  const [shown, setShown] = useState(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    const onOpen = () => {
      void pageControlFields("editBand").then((fields) => {
        setShown(fields || null);
        setBand("header");
        setApply("BOTH");
        setAsking(false);
        setOpen(true);
      });
    };
    window.addEventListener("chwp-open-header-footer-dialog", onOpen);
    return () => window.removeEventListener("chwp-open-header-footer-dialog", onOpen);
  }, []);

  const close = () => {
    setOpen(false);
    focusEditor();
  };
  const make = () => {
    void pageControl(band, { apply }).then((result) => { if (result?.documentChanged) close(); });
  };
  const edit = () => {
    if (!valueOf(shown, `${band}${apply}`)) {
      setAsking(true);
      return;
    }
    void pageControl("editBand", { band, apply }).then((result) => { if (result?.handled && !result?.error) close(); });
  };
  const anyBand = BANDS.some(([b]) => APPLIES.some(([a]) => !!valueOf(shown, `${b}${a}`)));
  const inBand = !!valueOf(shown, "inBand");

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-black/45" />
        <DialogPrimitive.Content className={shell}>
          <DialogPrimitive.Description className="sr-only">머리말이나 꼬리말을 만들거나 편집합니다.</DialogPrimitive.Description>
          <div className="flex items-center">
            <DialogPrimitive.Title className="flex-1 text-[20px] font-bold">머리말/꼬리말</DialogPrimitive.Title>
            <button type="button" className="ui-ghost flex size-12 items-center justify-center rounded-[10px] lg:hidden" aria-label="닫기" onClick={close}>
              <X className="size-6" />
            </button>
          </div>
          <fieldset className="flex flex-wrap items-center gap-4 rounded-md border border-[#e5e5e5] p-2">
            <legend className="px-1">종류</legend>
            {BANDS.map(([value, label]) => (
              <label key={value} className="flex min-h-9 items-center gap-2"><input type="radio" checked={band === value} onChange={() => setBand(value)} />{label}</label>
            ))}
          </fieldset>
          <fieldset className="flex flex-wrap items-center gap-4 rounded-md border border-[#e5e5e5] p-2">
            <legend className="px-1">위치</legend>
            {APPLIES.map(([value, label]) => (
              <label key={value} className="flex min-h-9 items-center gap-2"><input type="radio" checked={apply === value} onChange={() => setApply(value)} />{label}</label>
            ))}
          </fieldset>
          {asking ? (
            <div role="alertdialog" className="flex flex-col gap-3 border-t border-[#e5e5e5] pt-3">
              <p>지정한 모양의 머리말/꼬리말이 없습니다. 새로 만들까요?</p>
              <div className="flex flex-row-reverse gap-2">
                <button type="button" className="ui-primary h-11 flex-1 rounded-lg lg:flex-none lg:px-5" onClick={make}>만들기(Y)</button>
                <button type="button" className="ui-outline h-11 flex-1 rounded-lg lg:flex-none lg:px-5" onClick={() => setAsking(false)}>취소(N)</button>
              </div>
            </div>
          ) : (
            <div className="flex flex-row-reverse flex-wrap gap-2 border-t border-[#e5e5e5] pt-3">
              <button type="button" className="ui-primary h-11 flex-1 rounded-lg lg:flex-none lg:px-5" onClick={make} disabled={inBand}>만들기(D)</button>
              <button type="button" className="ui-outline h-11 flex-1 rounded-lg lg:flex-none lg:px-5" onClick={close}>취소</button>
              {anyBand ? (
                <button type="button" className="ui-outline h-11 flex-1 rounded-lg disabled:opacity-40 lg:mr-auto lg:flex-none lg:px-5" onClick={edit} disabled={inBand}>편집(R)</button>
              ) : null}
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
