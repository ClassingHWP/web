// 대화 상자 목록에 붙이는 모양 그림. 선 종류·굵기·무늬·강조점이 실제로 어떻게 보이는지 고르기 전에 보인다.
// 무늬 비율은 코어가 그리는 것과 같다. 파선은 5칸 긋고 2칸 비우고, 긴 파선과 쇄선의 긴 획은 10칸이다.

const W = 56;
const H = 14;
const MID = H / 2;

function Frame({ children, width = W, height = H, label }) {
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden={label ? undefined : "true"} role={label ? "img" : undefined} aria-label={label} className="flex-none text-[#0a0a0a]">
      {children}
    </svg>
  );
}

// 한 줄을 dash 무늬로 긋는다. 단위는 SVG 픽셀이다.
function Stroke({ y = MID, width = 1, dash, cap = "butt" }) {
  return <line x1="1" x2={W - 1} y1={y} y2={y} stroke="currentColor" strokeWidth={width} strokeDasharray={dash} strokeLinecap={cap} />;
}

function Wave({ y = MID, width = 1 }) {
  let d = `M1 ${y}`;
  for (let x = 1; x < W - 1; x += 6) d += ` q1.5 -2.5 3 0 t3 0`;
  return <path d={d} fill="none" stroke="currentColor" strokeWidth={width} />;
}

// 선 종류. 테두리·밑줄·취소선·탭 채움이 같이 쓴다.
export function LineTypeIcon({ type }) {
  switch (type) {
    case "NONE":
      return <Frame><line x1="4" x2={W - 4} y1="2" y2={H - 2} stroke="#d4d4d4" strokeWidth="1" /></Frame>;
    case "SOLID":
      return <Frame><Stroke /></Frame>;
    case "DASH":
      return <Frame><Stroke dash="5 2" /></Frame>;
    case "DOT":
      return <Frame><Stroke dash="1 2" /></Frame>;
    case "DASH_DOT":
      return <Frame><Stroke dash="10 2 1 2" /></Frame>;
    case "DASH_DOT_DOT":
      return <Frame><Stroke dash="10 2 1 2 1 2" /></Frame>;
    case "LONG_DASH":
      return <Frame><Stroke dash="10 2" /></Frame>;
    case "CIRCLE":
      return <Frame><Stroke width={2} dash="0 4" cap="round" /></Frame>;
    case "DOUBLE_SLIM":
      return <Frame><Stroke y={MID - 1.5} /><Stroke y={MID + 1.5} /></Frame>;
    case "SLIM_THICK":
      return <Frame><Stroke y={MID - 2} /><Stroke y={MID + 1} width={2.5} /></Frame>;
    case "THICK_SLIM":
      return <Frame><Stroke y={MID - 1} width={2.5} /><Stroke y={MID + 2} /></Frame>;
    case "SLIM_THICK_SLIM":
      return <Frame><Stroke y={MID - 3} /><Stroke y={MID} width={2} /><Stroke y={MID + 3} /></Frame>;
    case "WAVE":
      return <Frame><Wave /></Frame>;
    case "DOUBLE_WAVE":
      return <Frame><Wave y={MID - 2} /><Wave y={MID + 2} /></Frame>;
    default:
      return <Frame><Stroke /></Frame>;
  }
}

// 굵기. 값은 HWPUNIT 이고 7200 이 1인치다. 그림 1픽셀을 0.1mm 쯤으로 잡고 1픽셀보다 가늘게는 그리지 않는다.
export function LineWidthIcon({ hu }) {
  const mm = (Number(hu) || 0) * 25.4 / 7200;
  const px = Math.max(0.75, Math.min(H - 2, mm * 2.4));
  return <Frame><Stroke width={px} /></Frame>;
}

// 테두리/배경 무늬. SLASH 는 \ 모양, BACK_SLASH 는 / 모양이다(한글 2024).
export function HatchIcon({ style }) {
  const size = 16;
  const lines = [];
  const step = 4;
  const add = (key, x1, y1, x2, y2) => lines.push(<line key={key} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth="1" />);
  if (style === "HORIZONTAL" || style === "CROSS") for (let y = step - 0.5; y < size; y += step) add(`h${y}`, 0, y, size, y);
  if (style === "VERTICAL" || style === "CROSS") for (let x = step - 0.5; x < size; x += step) add(`v${x}`, x, 0, x, size);
  if (style === "SLASH" || style === "CROSS_DIAGONAL") for (let o = -size; o < size; o += step) add(`s${o}`, o, 0, o + size, size);
  if (style === "BACK_SLASH" || style === "CROSS_DIAGONAL") for (let o = 0; o < size * 2; o += step) add(`b${o}`, o, 0, o - size, size);
  return (
    <Frame width={size} height={size}>
      <defs>
        <clipPath id={`hatch-${style}`}><rect x="0.5" y="0.5" width={size - 1} height={size - 1} /></clipPath>
      </defs>
      <g clipPath={`url(#hatch-${style})`}>{lines}</g>
      <rect x="0.5" y="0.5" width={size - 1} height={size - 1} fill="none" stroke="#a3a3a3" strokeWidth="1" />
    </Frame>
  );
}

// 글자 하나에 장식을 붙인 그림. 밑줄 위치·외곽선·강조점이 쓴다.
function Glyph({ children, outline, dash }) {
  return (
    <text x="12" y="17" textAnchor="middle" fontSize="15" fontFamily="sans-serif" fill={outline ? "none" : "currentColor"}
      stroke={outline ? "currentColor" : "none"} strokeWidth={outline} strokeDasharray={dash}>
      {children}
    </text>
  );
}

export function UnderlinePlaceIcon({ place }) {
  return (
    <Frame width={24} height={22}>
      <Glyph>가</Glyph>
      {place === "BOTTOM" ? <line x1="3" x2="21" y1="20.5" y2="20.5" stroke="currentColor" /> : null}
      {place === "TOP" ? <line x1="3" x2="21" y1="1.5" y2="1.5" stroke="currentColor" /> : null}
    </Frame>
  );
}

// 외곽선 0 없음, 1 실선, 2 점선, 3 굵은 실선, 4 파선, 5 일점쇄선, 6 이점쇄선.
export function OutlineIcon({ kind }) {
  const k = Number(kind) || 0;
  const dash = { 2: "1 1.5", 4: "3 1.5", 5: "4 1.5 1 1.5", 6: "4 1.5 1 1.5 1 1.5" }[k];
  return (
    <Frame width={24} height={22}>
      {k === 0 ? <Glyph>가</Glyph> : <Glyph outline={k === 3 ? 1.4 : 0.8} dash={dash}>가</Glyph>}
    </Frame>
  );
}

// 강조점 0 없음, 1 채운 동그라미, 2 빈 동그라미, 3 ˇ, 4 ˜, 5 ·, 6 :.
export function EmphasisIcon({ kind }) {
  const k = Number(kind) || 0;
  const mark = {
    1: <circle cx="12" cy="3" r="1.6" fill="currentColor" />,
    2: <circle cx="12" cy="3" r="1.6" fill="none" stroke="currentColor" strokeWidth="0.8" />,
    3: <path d="M9.5 1.5 L12 4 L14.5 1.5" fill="none" stroke="currentColor" strokeWidth="0.9" />,
    4: <path d="M9 3.5 q1.5 -2 3 0 t3 0" fill="none" stroke="currentColor" strokeWidth="0.9" />,
    5: <circle cx="12" cy="3" r="0.9" fill="currentColor" />,
    6: <g fill="currentColor"><circle cx="12" cy="1.5" r="0.8" /><circle cx="12" cy="4.5" r="0.8" /></g>,
  }[k];
  return (
    <Frame width={24} height={24}>
      <text x="12" y="21" textAnchor="middle" fontSize="14" fontFamily="sans-serif" fill="currentColor">가</text>
      {mark}
    </Frame>
  );
}
