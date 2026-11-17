import { useState } from "react";
import { Frame, focusEditor, useOpen } from "./TableTextDialog.jsx";
import { applyStyle } from "./FormatBar.jsx";

// 글머리표 및 문단 번호(한글 ParaNumberBulletDlg, Ctrl+K,N). 한글 대화 상자의 모양 칸(번호·글머리표·확인용 글머리표)을
// 고르거나, 글머리표 문자·캐럿 문단 수준의 번호 모양을 직접 정해 블록(또는 캐럿) 문단에 입힌다.
// 모양 목록과 정의를 만들고 다시 쓰는 규칙(같은 목록이면 정의를 바꾸고, 새 번호 목록이면 새 정의)은
// 코어(문단 모양 보기의 headingNumberPreset·headingBulletPreset·headingCheckPreset, applyParaHeadingFields)가 정한다.

export function openHeadingShapeDialog(tab = "bullet") {
  window.dispatchEvent(new CustomEvent("chwp-open-heading-shape-dialog", { detail: { tab } }));
}

const numberTypes = [
  ["DIGIT", "1, 2, 3"], ["CIRCLED_DIGIT", "①, ②, ③"], ["HANGUL_SYLLABLE", "가, 나, 다"],
  ["CIRCLED_HANGUL_SYLLABLE", "㉮, ㉯, ㉰"], ["HANGUL_JAMO", "ㄱ, ㄴ, ㄷ"], ["CIRCLED_HANGUL_JAMO", "㉠, ㉡, ㉢"],
  ["ROMAN_CAPITAL", "I, II, III"], ["ROMAN_SMALL", "i, ii, iii"], ["LATIN_CAPITAL", "A, B, C"], ["LATIN_SMALL", "a, b, c"],
];
const numberForms = [["^N.", "1."], ["^N)", "1)"], ["(^N)", "(1)"], ["^N", "1"]];

function presetsOf(view, key) {
  const spec = Array.isArray(view?.specs) ? view.specs.find((item) => item.key === key) : view?.specs?.[key];
  return Array.isArray(spec?.options) ? spec.options.map((option) => (Array.isArray(option) ? option : [option.value, option.label])) : [];
}

function PresetGrid({ items, value, onPick, lines = false }) {
  return (
    <div className="grid grid-cols-4 gap-1.5">
      {items.map(([key, label]) => (
        <button key={key} type="button" aria-pressed={value === key} aria-label={label.replace(/\n/g, " ")}
          className={`ui-rb rounded-md ${lines ? "h-[5.2em] whitespace-pre px-2 text-left text-[0.85em] leading-tight" : "h-10 text-[1.2em]"} ${value === key ? "on" : ""}`}
          onClick={() => onPick(key)}>{label}</button>
      ))}
    </div>
  );
}

export function HeadingShapeDialog() {
  const [tab, setTab] = useState("bullet");
  const [presets, setPresets] = useState({ number: [], bullet: [], check: [] });
  // 고른 것: { kind: "preset", key } 또는 직접 정한 값.
  const [bulletPick, setBulletPick] = useState(null);
  const [customBullet, setCustomBullet] = useState("");
  const [numberPick, setNumberPick] = useState(null);
  const [newList, setNewList] = useState(false);
  const [numberType, setNumberType] = useState("DIGIT");
  const [numberForm, setNumberForm] = useState("^N.");
  const [pictureFile, setPictureFile] = useState(null);
  const [open, setOpen] = useOpen("chwp-open-heading-shape-dialog", (event) => {
    const wanted = event?.detail?.tab;
    setTab(wanted === "number" || wanted === "picture" ? wanted : "bullet");
    setBulletPick(null);
    setCustomBullet("");
    setNumberPick(null);
    setNewList(false);
    setPictureFile(null);
    if (typeof window.__chwpFormatView === "function") {
      void Promise.resolve(window.__chwpFormatView(1, {})).then((view) => setPresets({
        number: presetsOf(view, "headingNumberPreset"),
        bullet: presetsOf(view, "headingBulletPreset"),
        check: presetsOf(view, "headingCheckPreset"),
      }));
    }
  });
  const close = () => {
    setOpen(false);
    focusEditor();
  };
  const apply = () => {
    if (tab === "picture") {
      if (!pictureFile || typeof window.__chwpPictureBullet !== "function") return;
      void pictureFile.arrayBuffer().then((buffer) => window.__chwpPictureBullet(new Uint8Array(buffer)));
      close();
      return;
    }
    if (tab === "bullet") {
      const ch = Array.from(customBullet.trim())[0];
      if (ch) applyStyle({ headingType: "BULLET", headingBullet: ch });
      else if (bulletPick) applyStyle({ headingType: "BULLET", headingBulletPreset: bulletPick });
      else return;
    } else if (numberPick === "custom") {
      applyStyle({ headingType: "NUMBER", headingNumberFormat: numberForm, headingNumberType: numberType });
    } else if (numberPick) {
      applyStyle({ headingType: "NUMBER", headingNumberPreset: numberPick, headingNewList: newList });
    } else {
      return;
    }
    close();
  };
  return (
    <Frame open={open} onClose={close} title="글머리표 및 문단 번호" description="블록이나 캐럿 문단의 글머리표나 문단 번호 모양을 정합니다." onApply={apply}>
      <div role="tablist" className="flex gap-1">
        {[["bullet", "글머리표"], ["number", "문단 번호"], ["picture", "그림 글머리표"]].map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key}
            className={`ui-rb h-9 flex-1 rounded-md ${tab === key ? "on" : ""}`} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>
      {tab === "picture" ? (
        <fieldset className="flex flex-col gap-2 rounded-md border border-[#e5e5e5] p-2">
          <legend className="px-1">그림 글머리표</legend>
          <p className="text-[0.9em] text-[#666]">그림 파일(PNG·JPG·GIF·BMP)을 골라 글머리표로 씁니다.</p>
          <input type="file" accept="image/png,image/jpeg,image/gif,image/bmp" onChange={(event) => setPictureFile(event.target.files?.[0] || null)} />
        </fieldset>
      ) : tab === "bullet" ? (
        <>
          <fieldset className="flex flex-col gap-2 rounded-md border border-[#e5e5e5] p-2">
            <legend className="px-1">글머리표 모양</legend>
            <PresetGrid items={presets.bullet} value={bulletPick} onPick={(key) => { setBulletPick(key); setCustomBullet(""); }} />
          </fieldset>
          <fieldset className="flex flex-col gap-2 rounded-md border border-[#e5e5e5] p-2">
            <legend className="px-1">확인용 글머리표 모양</legend>
            <PresetGrid items={presets.check} value={bulletPick} onPick={(key) => { setBulletPick(key); setCustomBullet(""); }} />
          </fieldset>
          <label className="flex items-center justify-between gap-2">
            <span>글머리표 문자 직접 입력</span>
            <input className="ui-box h-9 w-16 rounded-md px-2 text-center text-[1.2em]" maxLength={2} value={customBullet}
              onChange={(event) => setCustomBullet(event.target.value)} />
          </label>
        </>
      ) : (
        <>
          <fieldset className="flex flex-col gap-2 rounded-md border border-[#e5e5e5] p-2">
            <legend className="px-1">문단 번호 모양</legend>
            <PresetGrid items={presets.number} value={numberPick} onPick={setNumberPick} lines />
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={newList} onChange={(event) => setNewList(event.target.checked)} />새 번호 목록 시작
            </label>
          </fieldset>
          <fieldset className="flex flex-col gap-2 rounded-md border border-[#e5e5e5] p-2">
            <legend className="px-1">
              <label className="flex items-center gap-2">
                <input type="radio" name="heading-number-custom" checked={numberPick === "custom"} onChange={() => setNumberPick("custom")} />
                캐럿 문단 수준만 바꾸기
              </label>
            </legend>
            <label className="flex items-center justify-between gap-2">
              <span>번호 종류</span>
              <select className="ui-box h-9 rounded-md px-2" value={numberType} onChange={(event) => { setNumberType(event.target.value); setNumberPick("custom"); }}>
                {numberTypes.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {numberForms.map(([value, label]) => (
                <button key={value} type="button" aria-pressed={numberPick === "custom" && numberForm === value}
                  className={`ui-rb h-9 rounded-md ${numberPick === "custom" && numberForm === value ? "on" : ""}`}
                  onClick={() => { setNumberForm(value); setNumberPick("custom"); }}>{label}</button>
              ))}
            </div>
          </fieldset>
        </>
      )}
    </Frame>
  );
}
