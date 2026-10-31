// 글꼴 바이트의 종류를 가린다. 확장자는 보지 않는다.
// 같은 글꼴인지는 head 의 checkSumAdjustment 로 본다.

const woff2Tags = [
  "cmap", "head", "hhea", "hmtx", "maxp", "name", "OS/2", "post", "cvt ", "fpgm",
  "glyf", "loca", "prep", "CFF ", "VORG", "EBDT", "EBLC", "gasp", "hdmx", "kern",
  "LTSH", "PCLT", "VDMX", "vhea", "vmtx", "BASE", "GDEF", "GPOS", "GSUB", "EBSC",
  "JSTF", "MATH", "CBDT", "CBLC", "COLR", "CPAL", "SVG ", "sbix", "acnt", "avar",
  "bdat", "bloc", "bsln", "cvar", "fdsc", "feat", "fmtx", "fvar", "gvar", "hsty",
  "just", "lcar", "mort", "morx", "opbd", "prop", "trak", "Zapf", "Silf", "Glat",
  "Gloc", "Feat", "Sill",
];

function u16(data, offset) {
  return (data[offset] << 8) | data[offset + 1];
}

function u32(data, offset) {
  return ((data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3]) >>> 0;
}

function tagAt(data, offset) {
  return String.fromCharCode(data[offset], data[offset + 1], data[offset + 2], data[offset + 3]);
}

// 맥 플랫폼 이름은 인코딩 번호대로 읽는다. 한글 글꼴의 맥 이름(3번)은 EUC-KR 이라 latin1 로 읽으면 깨진다.
const macEncodings = { 0: "macintosh", 1: "shift_jis", 2: "big5", 3: "euc-kr", 25: "gbk" };
// 윈도우 플랫폼 2~6번은 옛 2바이트 인코딩을 16비트 칸에 담는다. 앞 0 바이트를 빼고 읽는다.
const windowsEncodings = { 2: "shift_jis", 3: "gbk", 4: "big5", 5: "euc-kr" };

// 한글 바이트를 한 바이트씩 다른 인코딩 칸에 넣은 글꼴이 있다. 한글 음절이 나올 때만 EUC-KR 로 다시 읽는다.
function koreanFromBytes(bytes) {
  if (!bytes.some((byte) => byte >= 0x80)) return "";
  try {
    const text = new TextDecoder("euc-kr", { fatal: true }).decode(Uint8Array.from(bytes));
    return /[가-힣]/.test(text) ? text : "";
  } catch {
    return "";
  }
}

function utf16Name(raw) {
  const text = new TextDecoder("utf-16be").decode(raw);
  if ([...text].every((ch) => ch.charCodeAt(0) <= 0xff)) {
    const korean = koreanFromBytes([...text].map((ch) => ch.charCodeAt(0)));
    if (korean) return korean;
  }
  return text;
}

export function decodeNameRecord(platform, encoding, raw) {
  try {
    if (platform === 0) return utf16Name(raw);
    if (platform === 3) {
      const legacy = windowsEncodings[encoding];
      if (!legacy) return utf16Name(raw);
      const bytes = [];
      for (let i = 0; i + 1 < raw.length; i += 2) {
        if (raw[i]) bytes.push(raw[i]);
        bytes.push(raw[i + 1]);
      }
      return new TextDecoder(legacy, { fatal: true }).decode(Uint8Array.from(bytes));
    }
    if (platform === 1) {
      const label = macEncodings[encoding];
      if (encoding === 0) {
        const korean = koreanFromBytes([...raw]);
        if (korean) return korean;
      }
      // 모르는 맥 인코딩은 이름을 만들지 않는다. 깨진 이름이 목록에 들어간다.
      return label ? new TextDecoder(label, { fatal: true }).decode(raw) : "";
    }
  } catch {
    return "";
  }
  return "";
}

export function fontKind(data) {
  if (!data || data.length < 12) return "";
  const tag = tagAt(data, 0);
  if (tag === "wOFF" || tag === "wOF2" || tag === "OTTO" || tag === "ttcf" || tag === "true") return tag;
  if (data[0] === 0 && data[1] === 1 && data[2] === 0 && data[3] === 0) return "ttf";
  return "";
}

function namesFromTable(name) {
  if (!name || name.length < 6) return [];
  const count = u16(name, 2);
  const stringOffset = u16(name, 4);
  const faces = [];
  for (let i = 0; i < count; i += 1) {
    const rec = 6 + i * 12;
    if (rec + 12 > name.length) break;
    const platform = u16(name, rec);
    const nameId = u16(name, rec + 6);
    const length = u16(name, rec + 8);
    const offset = u16(name, rec + 10);
    if (nameId !== 1 && nameId !== 4 && nameId !== 16) continue;
    const start = stringOffset + offset;
    if (start + length > name.length) continue;
    const raw = name.subarray(start, start + length);
    const face = decodeNameRecord(platform, u16(name, rec + 2), raw);
    const trimmed = face.replace(/^[\u0000]+|[\u0000]+$/g, "");
    if (trimmed) faces.push(trimmed);
  }
  return faces;
}

function tableSlice(data, origin, tag) {
  if (origin + 12 > data.length) return null;
  const count = u16(data, origin + 4);
  for (let i = 0; i < count; i += 1) {
    const rec = origin + 12 + i * 16;
    if (rec + 16 > data.length) return null;
    if (tagAt(data, rec) !== tag) continue;
    const offset = u32(data, rec + 8);
    const length = u32(data, rec + 12);
    if (!offset || !length || offset + length > data.length) return null;
    return data.subarray(offset, offset + length);
  }
  return null;
}

function stampFromTables(head, name) {
  if (!head || head.length < 12 || !name) return null;
  return { checksum: u32(head, 8), faces: namesFromTable(name) };
}

function stampsFromSfnt(data) {
  const kind = fontKind(data);
  if (kind !== "ttf" && kind !== "OTTO" && kind !== "true" && kind !== "ttcf") return [];
  let origins = [0];
  if (kind === "ttcf") {
    const count = u32(data, 8);
    origins = [];
    for (let i = 0; i < count; i += 1) {
      if (12 + (i + 1) * 4 > data.length) break;
      origins.push(u32(data, 12 + i * 4));
    }
  }
  const out = [];
  for (const origin of origins) {
    const stamp = stampFromTables(tableSlice(data, origin, "head"), tableSlice(data, origin, "name"));
    if (stamp) out.push(stamp);
  }
  return out;
}

function readBase128(data, index) {
  let result = 0;
  for (let n = 0; n < 5; n += 1) {
    if (index >= data.length) return null;
    const byte = data[index];
    index += 1;
    if (result > 0x1ffffff) return null;
    result = (result << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) return [result >>> 0, index];
  }
  return null;
}

function woff2Directory(data) {
  if (data.length < 48 || tagAt(data, 0) !== "wOF2") return null;
  const numTables = u16(data, 12);
  const totalCompressedSize = u32(data, 20);
  let index = 48;
  const tables = [];
  for (let i = 0; i < numTables; i += 1) {
    if (index >= data.length) return null;
    const flags = data[index];
    index += 1;
    const tagIndex = flags & 0x3f;
    let tag = "";
    if (tagIndex === 63) {
      if (index + 4 > data.length) return null;
      tag = tagAt(data, index);
      index += 4;
    } else {
      tag = woff2Tags[tagIndex] || "";
    }
    const orig = readBase128(data, index);
    if (!orig) return null;
    index = orig[1];
    let length = orig[0];
    const version = flags >> 6;
    const transformed = tag === "glyf" || tag === "loca" ? version !== 3 : version !== 0;
    if (transformed) {
      const extra = readBase128(data, index);
      if (!extra) return null;
      length = extra[0];
      index = extra[1];
    }
    tables.push({ tag, length });
  }
  return { tables, index, totalCompressedSize };
}

function stampsFromInflated(tables, inflated) {
  let cursor = 0;
  let head = null;
  let name = null;
  for (const table of tables) {
    const next = cursor + table.length;
    if (next > inflated.length) return [];
    if (table.tag === "head") head = inflated.subarray(cursor, next);
    if (table.tag === "name") name = inflated.subarray(cursor, next);
    cursor = next;
  }
  const stamp = stampFromTables(head, name);
  return stamp ? [stamp] : [];
}

function concatBytes(parts) {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(size);
  let cursor = 0;
  for (const part of parts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

function packSfnt(tables) {
  tables.sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0));
  const header = new Uint8Array(12);
  header[1] = 1;
  header[4] = tables.length >> 8;
  header[5] = tables.length & 0xff;
  let offset = 12 + tables.length * 16;
  const directory = [];
  const body = [];
  for (const table of tables) {
    const record = new Uint8Array(16);
    record.set(new TextEncoder().encode(table.tag), 0);
    record[8] = (offset >>> 24) & 0xff;
    record[9] = (offset >>> 16) & 0xff;
    record[10] = (offset >>> 8) & 0xff;
    record[11] = offset & 0xff;
    record[12] = (table.bytes.length >>> 24) & 0xff;
    record[13] = (table.bytes.length >>> 16) & 0xff;
    record[14] = (table.bytes.length >>> 8) & 0xff;
    record[15] = table.bytes.length & 0xff;
    const pad = (4 - (table.bytes.length % 4)) % 4;
    directory.push(record);
    body.push(table.bytes, new Uint8Array(pad));
    offset += table.bytes.length + pad;
  }
  return concatBytes([header, ...directory, ...body]);
}

// codecs.inflate / codecs.brotli 는 압축 바이트를 푼 바이트로 돌려준다. 없으면 그 형식은 건너뛴다.
export function fontStampsFrom(data, codecs = {}) {
  const kind = fontKind(data);
  if (!kind) return [];
  if (kind !== "wOFF" && kind !== "wOF2") return stampsFromSfnt(data);
  try {
    if (kind === "wOFF") {
      if (!codecs.inflate || data.length < 44) return [];
      const numTables = u16(data, 12);
      const tables = [];
      for (let i = 0; i < numTables; i += 1) {
        const rec = 44 + i * 20;
        if (rec + 20 > data.length) return [];
        const tag = tagAt(data, rec);
        const offset = u32(data, rec + 4);
        const compLength = u32(data, rec + 8);
        const origLength = u32(data, rec + 12);
        if (offset + compLength > data.length) return [];
        const slice = data.subarray(offset, offset + compLength);
        const bytes = compLength === origLength ? slice : codecs.inflate(slice);
        tables.push({ tag, bytes });
      }
      const sfnt = packSfnt(tables);
      return stampsFromSfnt(sfnt);
    }
    const directory = woff2Directory(data);
    if (!directory || !codecs.brotli) return [];
    const end = directory.index + directory.totalCompressedSize;
    if (end > data.length) return [];
    const inflated = codecs.brotli(data.subarray(directory.index, end));
    return stampsFromInflated(directory.tables, inflated);
  } catch {
    return [];
  }
}

// 코어가 읽는 sfnt 로 만든다. 이미 sfnt 면 그대로 돌려준다. 풀 수 없으면 null.
// inflate 가 Promise 를 돌려주면 toSfnt 도 Promise 가 된다.
export function toSfnt(data, codecs = {}) {
  const kind = fontKind(data);
  if (!kind) return null;
  if (kind !== "wOFF" && kind !== "wOF2") return data;
  if (kind === "wOF2") return null;
  if (!codecs.inflate) return null;
  const numTables = u16(data, 12);
  const tables = [];
  let asyncInflate = false;
  for (let i = 0; i < numTables; i += 1) {
    const rec = 44 + i * 20;
    if (rec + 20 > data.length) return null;
    const tag = tagAt(data, rec);
    const offset = u32(data, rec + 4);
    const compLength = u32(data, rec + 8);
    const origLength = u32(data, rec + 12);
    if (offset + compLength > data.length) return null;
    const slice = data.subarray(offset, offset + compLength);
    const bytes = compLength === origLength ? slice : codecs.inflate(slice);
    if (bytes && typeof bytes.then === "function") asyncInflate = true;
    tables.push({ tag, bytes });
  }
  const finish = (ready) => packSfnt(ready);
  if (!asyncInflate) return finish(tables);
  return Promise.all(tables.map(async (table) => ({ tag: table.tag, bytes: await table.bytes }))).then(finish);
}
