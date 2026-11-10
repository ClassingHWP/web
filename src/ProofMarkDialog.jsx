import { useEffect, useState } from "react";
import { Frame, focusEditor } from "./TableTextDialog.jsx";
import { pageControl } from "./ui-actions.js";

// 교정 부호 넣기(한글 2024 검토-교정 부호). 고른 부호를 블록(범위 부호) 또는 커서 자리
// (자리 부호)에 넣는다. 블록이 필요한지·넣을 글이 맞는지·저장 모양은 코어가 정한다(pageControl insertProofMark).
// 한글 차례대로 둔다. 줄 이음표는 모양을 보지 못했고, 자리 바꿈표·줄 서로 바꿈표는 넣은 뒤 화면에서 자리를 짚어야 해서
// 막아 둔다. 자리 옮김표는 한글처럼 시작 위치·간격(pt)을 받는다.

export function openProofMarkDialog(kind) {
  window.dispatchEvent(new CustomEvent("chwp-open-proof-mark-dialog", { detail: kind || null }));
}

// [코어 이름, 한글 이름, 넣을 글이 있는가, 쓸 수 있는가]
const kinds = [
  ["space", "띄움표", false, true],
  ["insert", "넣음표", true, true],
  ["symbol", "부호 넣음표", true, true],
  ["lineSeparate", "줄 바꿈표", false, true],
  ["lineInsert", "줄 비움표", false, true],
  ["change", "메모 고침표", true, true],
  ["simpleChange", "고침표", true, true],
  ["clipping", "뺌표", false, true],
  ["delete", "지움표", false, true],
  ["attach", "붙임표", false, true],
  ["lineAttach", "줄 붙임표", false, true],
  ["lineLink", "줄 이음표", false, false],
  ["sawtooth", "톱니표", false, true],
  ["thinking", "생각표", false, true],
  ["praise", "칭찬표", false, true],
  ["line", "줄표", false, true],
  ["transfer", "자리 바꿈표", false, false],
  ["lineTransfer", "줄 서로 바꿈표", false, false],
  ["rightMove", "오른 자리 옮김표", false, true],
  ["leftMove", "왼 자리 옮김표", false, true],
];

export function ProofMarkDialog() {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("delete");
  const [text, setText] = useState("");
  const [start, setStart] = useState("0.0");
  const [gap, setGap] = useState("10.0");
  useEffect(() => {
    const onOpen = (event) => {
      if (event.detail && kinds.some(([key, , , ok]) => key === event.detail && ok)) setKind(event.detail);
      setText("");
      setOpen(true);
    };
    window.addEventListener("chwp-open-proof-mark-dialog", onOpen);
    return () => window.removeEventListener("chwp-open-proof-mark-dialog", onOpen);
  }, []);
  const close = () => {
    setOpen(false);
    focusEditor();
  };
  const current = kinds.find(([key]) => key === kind);
  const needsText = !!current?.[2];
  const move = kind === "rightMove" || kind === "leftMove";
  const apply = () => {
    const fields = { kind, text };
    if (move) {
      fields.start = Number(start);
      fields.gap = Number(gap);
    }
    if (kind === "change") {
      // 메모 고침표는 메모와 같은 모양이다. 작성자는 메모 대화 상자가 기억해 둔 이름을 쓴다.
      try {
        fields.author = window.localStorage.getItem("chwp-memo-author") || "";
      } catch {
        fields.author = "";
      }
    }
    // 넣지 못하면 pageControl 이 코어가 준 까닭을 알린다.
    void pageControl("insertProofMark", fields).then((result) => {
      if (result?.documentChanged) close();
    });
  };
  return (
    <Frame open={open} onClose={close} title="교정 부호" description="교정할 곳에 교정 부호를 넣습니다." onApply={apply}
      applyLabel="넣기(D)" disabled={needsText && !text}>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 lg:grid-cols-3" role="radiogroup" aria-label="교정 부호 선택">
        {kinds.map(([key, label, , ok]) => (
          <label key={key} className={`flex h-9 items-center gap-2 ${ok ? "" : "opacity-45"}`}>
            <input type="radio" name="proof-mark" className="size-4 accent-[#171717]" checked={kind === key} disabled={!ok}
              onChange={() => {
                setKind(key);
                // 한글 대화 상자의 처음 값: 오른 자리 0pt 부터, 왼 자리 10pt 부터, 간격 10pt.
                if (key === "rightMove") setStart("0.0");
                if (key === "leftMove") setStart("10.0");
              }} />
            {label}
          </label>
        ))}
      </div>
      {move && (
        <div className="flex flex-wrap items-center gap-2">
          <span>시작 위치</span>
          <input className="ui-box h-9 w-20 rounded-md px-2" aria-label="시작 위치(pt)" inputMode="decimal" value={start}
            onChange={(event) => setStart(event.target.value)} />
          <span>pt 부터</span>
          <input className="ui-box h-9 w-20 rounded-md px-2" aria-label="간격(pt)" inputMode="decimal" value={gap}
            onChange={(event) => setGap(event.target.value)} />
          <span>pt 간격만큼 옮김</span>
        </div>
      )}
      <label className="flex flex-col gap-1">
        <span>{kind === "change" ? "메모 내용" : "입력할 내용"}</span>
        <input className="ui-box h-9 rounded-md px-2 disabled:opacity-60" aria-label="입력할 내용" value={text}
          disabled={!needsText} onChange={(event) => setText(event.target.value)} />
      </label>
    </Frame>
  );
}
