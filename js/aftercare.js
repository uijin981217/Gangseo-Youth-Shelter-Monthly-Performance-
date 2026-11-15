/* 사후관리대장(.hwp / .hwpx) → 이 달 사후관리 기록(날짜·이름)
   .hwp 는 한컴 문서 형식(복합 파일 안에 압축된 본문)이라, 본문 글자만 브라우저에서 직접 꺼냅니다. 파일은 밖으로 나가지 않아요. */
(function (global) {
  'use strict';
  const isAftercareFileName = (n) => /사후관리/.test(n) && /\.hwpx?$/i.test(n);

  // ── .hwp: 복합 파일(CFB) 읽기 ───────────────────────────
  function readCFB(buf) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf);
    const sig = [0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1];
    if (!sig.every((b, i) => u8[i] === b)) throw new Error('한글(.hwp) 파일 형식이 아니에요.');
    const secSize = 1 << dv.getUint16(0x1E, true), miniSize = 1 << dv.getUint16(0x20, true);
    const dirStart = dv.getUint32(0x30, true), cutoff = dv.getUint32(0x38, true);
    const miniFatStart = dv.getUint32(0x3C, true), difatStart = dv.getUint32(0x44, true), nDifat = dv.getUint32(0x48, true);
    const END = 0xFFFFFFFE, FREE = 0xFFFFFFFF;
    const off = (sid) => (sid + 1) * secSize;
    const fatSecs = [];
    for (let i = 0; i < 109; i++) { const s = dv.getUint32(0x4C + i * 4, true); if (s !== FREE) fatSecs.push(s); }
    let d = difatStart;
    for (let k = 0; k < nDifat && d !== END && d !== FREE; k++) {
      const per = secSize / 4 - 1;
      for (let i = 0; i < per; i++) { const s = dv.getUint32(off(d) + i * 4, true); if (s !== FREE) fatSecs.push(s); }
      d = dv.getUint32(off(d) + per * 4, true);
    }
    const fat = [];
    for (const s of fatSecs) for (let i = 0; i < secSize / 4; i++) fat.push(dv.getUint32(off(s) + i * 4, true));
    const chain = (start) => { const out = []; let s = start; for (let n = 0; s !== END && s !== FREE && n < 1e6; n++) { out.push(s); s = fat[s]; } return out; };
    const readChain = (start, size) => {
      const secs = chain(start), out = new Uint8Array(secs.length * secSize);
      secs.forEach((s, i) => out.set(u8.subarray(off(s), off(s) + secSize), i * secSize));
      return size != null ? out.subarray(0, size) : out;
    };
    const dir = readChain(dirStart);
    const ddv = new DataView(dir.buffer, dir.byteOffset, dir.byteLength);
    const entries = [];
    for (let p = 0; p + 128 <= dir.length; p += 128) {
      const nameLen = ddv.getUint16(p + 0x40, true);
      let name = ''; for (let i = 0; i < Math.max(0, nameLen / 2 - 1); i++) name += String.fromCharCode(ddv.getUint16(p + i * 2, true));
      entries.push({ name, type: dir[p + 0x42], left: ddv.getUint32(p + 0x44, true), right: ddv.getUint32(p + 0x48, true),
        child: ddv.getUint32(p + 0x4C, true), start: ddv.getUint32(p + 0x74, true), size: ddv.getUint32(p + 0x78, true) });
    }
    const root = entries[0];
    const miniStream = readChain(root.start, root.size);
    const miniFat = []; if (miniFatStart !== END) { const mf = readChain(miniFatStart); const mdv = new DataView(mf.buffer, mf.byteOffset, mf.byteLength); for (let i = 0; i + 4 <= mf.length; i += 4) miniFat.push(mdv.getUint32(i, true)); }
    const readStream = (e) => {
      if (e.size >= cutoff) return readChain(e.start, e.size);
      const out = new Uint8Array(e.size); let s = e.start, w = 0;
      while (s !== END && s !== FREE && w < e.size) { const n = Math.min(miniSize, e.size - w); out.set(miniStream.subarray(s * miniSize, s * miniSize + n), w); w += n; s = miniFat[s]; }
      return out;
    };
    const kids = (idx) => { const out = []; const walk = (i) => { if (i === FREE || i >= entries.length) return; walk(entries[i].left); out.push(entries[i]); walk(entries[i].right); }; walk(entries[idx].child); return out; };
    return { entries, kids, readStream, indexOf: (e) => entries.indexOf(e) };
  }

  // 압축 풀기. 한글 파일은 압축 데이터 뒤에 여분 바이트가 붙어 있을 수 있는데, 브라우저는 그러면 오류를 내며
  // 마지막 부분을 버림 → 압축 데이터가 정확히 끝나는 위치를 찾아(이분 탐색) 그만큼만 풂
  // 풀린 만큼 모아서 돌려줌 (오류가 나도 그 전까지 받은 내용은 유지)
  async function tryInflate(data) {
    const reader = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
    const chunks = []; let total = 0, err = null;
    try { for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); total += value.length; } }
    catch (e) { err = String(e && e.message || e); }
    const out = new Uint8Array(total); let o = 0; for (const c of chunks) { out.set(c, o); o += c.length; }
    return { out, err };
  }
  async function inflateRaw(data) {
    const full = await tryInflate(data);
    if (!full.err) return full.out;
    if (!/junk/i.test(full.err)) throw new Error('한글 파일 본문의 압축을 풀지 못했어요.');
    // 너무 길면 'Junk'(뒤에 여분), 짧으면 '잘림' → 끝 위치를 이분 탐색. 잘린 경우도 그때까지 푼 내용은 온전함
    let lo = 1, hi = data.length - 1, best = full.out;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const r = await tryInflate(data.subarray(0, mid));
      if (!r.err) return r.out;
      if (/junk/i.test(r.err)) hi = mid - 1;
      else { if (r.out.length > best.length) best = r.out; lo = mid + 1; }
    }
    return best;
  }

  // 본문 레코드에서 문단 글자 꺼내기 (문단마다 한 줄, 빈 문단도 빈 줄)
  function paragraphs(rec) {
    const dv = new DataView(rec.buffer, rec.byteOffset, rec.byteLength), lines = [];
    const EXT = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 12, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]);   // 8글자짜리 조판 부호
    for (let p = 0; p + 4 <= rec.length;) {
      const h = dv.getUint32(p, true); p += 4;
      const tag = h & 0x3FF; let size = (h >>> 20) & 0xFFF;
      if (size === 0xFFF) { size = dv.getUint32(p, true); p += 4; }
      if (tag === 66) lines.push('');                               // 문단 시작
      else if (tag === 67) {                                        // 문단 글자
        let s = '';
        for (let i = 0; i + 1 < size;) {
          const c = dv.getUint16(p + i, true);
          if (c < 32) { i += EXT.has(c) ? 16 : 2; if (c === 10) s += ' '; continue; }
          s += String.fromCharCode(c); i += 2;
        }
        if (lines.length) lines[lines.length - 1] = s; else lines.push(s);
      }
      p += size;
    }
    return lines;
  }

  async function hwpLines(buf) {
    const cfb = readCFB(buf);
    const top = cfb.kids(0);
    const fh = top.find((e) => e.name === 'FileHeader');
    let compressed = true;
    if (fh) {
      const h = cfb.readStream(fh); const flags = new DataView(h.buffer, h.byteOffset, h.byteLength).getUint32(36, true);
      if (flags & 2) throw new Error('암호가 걸린 한글 파일이라 읽을 수 없어요.');
      if (flags & 4) throw new Error('배포용 한글 파일이라 읽을 수 없어요. 일반 문서로 저장해 주세요.');
      compressed = !!(flags & 1);
    }
    const body = top.find((e) => e.name === 'BodyText');
    if (!body) throw new Error('한글 파일에서 본문을 찾지 못했어요.');
    const secs = cfb.kids(cfb.indexOf(body)).filter((e) => /^Section\d+$/.test(e.name)).sort((a, b) => Number(a.name.slice(7)) - Number(b.name.slice(7)));
    const lines = [];
    for (const s of secs) { let data = cfb.readStream(s); if (compressed) data = await inflateRaw(data); lines.push(...paragraphs(data)); }
    return lines;
  }

  async function hwpxLines(buf) {
    const zip = await JSZip.loadAsync(buf);
    const names = Object.keys(zip.files).filter((n) => /^Contents\/section\d+\.xml$/i.test(n)).sort();
    const lines = [];
    for (const n of names) {
      const doc = new DOMParser().parseFromString(await zip.file(n).async('string'), 'application/xml');
      for (const p of doc.getElementsByTagNameNS('*', 'p')) {
        let s = '';
        for (const run of [...p.children].filter((e) => e.localName === 'run')) for (const t of [...run.children].filter((e) => e.localName === 't')) s += t.textContent;
        lines.push(s);
      }
    }
    return lines;
  }

  /** 사후관리대장 → { entries:[{date,name}], warnings } (그 달만) */
  async function parseAftercare(file, year, month) {
    const buf = await file.arrayBuffer();
    const lines = (/\.hwpx$/i.test(file.name) ? await hwpxLines(buf) : await hwpLines(buf)).map((l) => l.trim());
    let secYear = year, secMonth = null; const all = [];
    for (let i = 0; i < lines.length; i++) {
      const h = lines[i].match(/^(\d{4})\s*년\s*(\d{1,2})\s*월\s*사후\s*관리/);
      if (h) { secYear = Number(h[1]); secMonth = Number(h[2]); continue; }
      // 표 한 줄: 연번 → 날짜(9/5) → 이름 (빈 줄은 건너뜀)
      if (!/^\d{1,3}$/.test(lines[i])) continue;
      let j = i + 1; while (j < lines.length && lines[j] === '') j++;
      const dm = (lines[j] || '').match(/^(\d{1,2})\s*[/.]\s*(\d{1,2})$/);
      if (!dm) continue;
      let k = j + 1; while (k < lines.length && lines[k] === '') k++;
      const name = (lines[k] || '').trim();
      if (!name || /^\d/.test(name)) continue;
      all.push({ year: secYear, month: Number(dm[1]), day: Number(dm[2]), secMonth, name });
      i = k;
    }
    const p2 = (n) => String(n).padStart(2, '0');
    const entries = all.filter((e) => e.year === year && e.month === month).map((e) => ({ date: `${year}-${p2(month)}-${p2(e.day)}`, name: e.name }));
    const warnings = [];
    if (!all.length) warnings.push('사후관리대장에서 기록(연번·날짜·이름)을 찾지 못했어요 — 파일을 확인해 주세요');
    else if (!entries.length) warnings.push(`사후관리대장에 ${year}년 ${month}월 기록이 없어요`);
    const odd = all.filter((e) => e.secMonth && e.secMonth !== e.month && e.month === month);
    if (odd.length) warnings.push(`다른 달 칸에 적힌 ${month}월 기록 ${odd.length}건도 포함했어요`);
    return { entries, warnings, total: all.length };
  }

  /** 날짜별 일지 줄 { 'YYYY-MM-DD': { 상담정서지원: ['* 사후관리 - 이름, 이름'] } } */
  function logLines(entries) {
    const byDate = new Map();
    for (const e of entries) { if (!byDate.has(e.date)) byDate.set(e.date, []); const l = byDate.get(e.date); if (!l.includes(e.name)) l.push(e.name); }
    const out = {};
    for (const [d, names] of byDate) out[d] = { 상담정서지원: [`* 사후관리 - ${names.join(', ')}`] };
    return out;
  }

  global.Aftercare = { isAftercareFileName, parseAftercare, logLines };
})(window);
