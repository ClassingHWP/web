import { useState } from "react";
import { Frame, focusEditor, useOpen } from "./TableTextDialog.jsx";
import { toast } from "./ui-actions.js";

// 문서 암호 설정·변경/해제(한글 FilePasswordDlg·FilePasswordChangeDlg). 5자 이상, 지금 암호 확인, 암호 확인 칸이
// 같은지는 코어(editDocumentPassword)가 정한다. 셸은 칸의 글을 그대로 넘기고 코어가 준 까닭을 보인다.

export function openPasswordDialog(mode) {
  window.dispatchEvent(new CustomEvent("chwp-open-password-dialog", { detail: { mode } }));
}

function Field({ label, value, onChange, autoFocus }) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span>{label}</span>
      <input className="ui-box h-8 w-48 rounded-md px-2" type="password" autoComplete="new-password" value={value}
        autoFocus={autoFocus} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

export function PasswordDialog() {
  const [mode, setMode] = useState("set");
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [open, setOpen] = useOpen("chwp-open-password-dialog", (event) => {
    setMode(event?.detail?.mode === "change" ? "change" : "set");
    setCurrent("");
    setNext("");
    setConfirm("");
    setError("");
  });
  const close = () => {
    setOpen(false);
    focusEditor();
  };
  const send = (nextValue, confirmValue) => {
    if (typeof window.__chwpDocumentPassword !== "function") return;
    void window.__chwpDocumentPassword(current, nextValue, confirmValue).then((result) => {
      if (result?.documentChanged) {
        setOpen(false);
        toast(nextValue ? "문서 암호를 걸었습니다. 저장하면 이 암호로 잠깁니다." : "문서 암호를 풀었습니다.", "info", null, { key: "password" });
        focusEditor();
      } else {
        setError(result?.error || "");
      }
    });
  };
  const change = mode === "change";
  return (
    <Frame open={open} onClose={close} title={change ? "문서 암호 변경/해제" : "문서 암호 설정"}
      description="문서를 열 때 물을 암호를 정합니다." onApply={() => send(next, confirm)} applyLabel={change ? "변경(C)" : "설정(D)"}>
      <div className="flex flex-col gap-1.5">
        {change && <Field label="현재 암호" value={current} onChange={setCurrent} autoFocus />}
        <Field label="새 암호" value={next} onChange={setNext} autoFocus={!change} />
        <Field label="암호 확인" value={confirm} onChange={setConfirm} />
        <p className="text-[0.9em] text-[#666]">암호는 5자 이상 입력하세요. 암호를 잊어버리면 문서를 불러올 수 없습니다.</p>
        {error && <p className="text-[0.9em] text-[#c62828]">{error}</p>}
        {change && (
          <button type="button" className="ui-outline h-9 self-start rounded-lg px-4" onClick={() => send("", "")}>암호 해제(E)</button>
        )}
      </div>
    </Frame>
  );
}
