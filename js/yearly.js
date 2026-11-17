/* 연간 기록 파일 채우기
   ① 「2026년 이용자현황.xlsx」: 그 달 시트(날짜별 재소, 입·퇴소, 인원, 나이대별 연인원, 입·퇴소생 목록)
   ② 「2026년 학업, 자립, 법률,의료지원.xlsx」: 시트마다 그 달 묶음(연번·날짜·이름·서비스 내용·상세내역) + 정신과 진료 표
   재료: 개인 파일 기록, 이용자현황(입·퇴소일·가출원인·퇴소사유·자립), 지난달 시트의 나이 */
(function (global) {
  'use strict';
  const T = (v) => (global.Step1 ? Step1.cellText(v) : String(v ?? '')).trim();
  const clone = (o) => JSON.parse(JSON.stringify(o || {}));
  const colL = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const p2 = (n) => String(n).padStart(2, '0');
  const toDate = (ds) => new Date(Date.UTC(Number(ds.slice(0, 4)), Number(ds.slice(5, 7)) - 1, Number(ds.slice(8, 10))));
  const isSlave = (c) => c.isMerged && c.master && c.master.address !== c.address;

  const isUsersFile = (n) => /이용자\s*현황/.test(n) && /\.xlsx$/i.test(n) && !/안전망/.test(n);
  const isSupportFile = (n) => /\.xlsx$/i.test(n) && /(의료|학업|자립|법률).*지원|지원.*(의료|학업|자립|법률)/.test(n) && !/안전망/.test(n);

  function unmergeAll(ws) {
    for (const k of Object.keys(ws._merges || {})) { const m = ws._merges[k]; try { ws.unMergeCells(m.range || k); } catch { /* 무시 */ } }
  }
  function sheetOfMonth(wb, m) { return wb.worksheets.find((w) => w.name.replace(/\s/g, '') === `${m}월`); }

  /** 지난달(또는 그 전) 시트에서 '이름(나이)' 읽기 → { 이름: 나이 } */
  async function previousAges(file, month) {
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await file.arrayBuffer());
    const ages = {};
    const order = month === 1 ? [12] : Array.from({ length: month - 1 }, (_, i) => month - 1 - i);   // 1월이면 (작년에서 이어 쓰는) 12월 시트
    for (const m of order) {
      if (Object.keys(ages).length) break;
      const ws = sheetOfMonth(wb, m); if (!ws) continue;
      for (let r = 3; r <= 40; r++) { const t = T(ws.getRow(r).getCell(2).value); const x = t.match(/^(.+?)\s*\((\d{1,2})\)\s*$/); if (x) ages[x[1].trim()] = Number(x[2]); if (/입\s*소/.test(t)) break; }
    }
    return ages;
  }

  /** 시트 구조 읽기: 재소자 줄 수, 입소/퇴소/인원 줄, 아래 표 머리줄, 날짜 칸 수 */
  function layoutOf(ws) {
    let inRow = 0, fh = 0, days = 0;
    for (let r = 3; r <= Math.min(ws.rowCount, 80) && !inRow; r++) if (/^입\s*소$/.test(T(ws.getRow(r).getCell(2).value))) inRow = r;
    if (!inRow) return null;
    for (let r = inRow + 1; r <= Math.min(ws.rowCount, inRow + 10) && !fh; r++) if (/월\s*입소/.test(T(ws.getRow(r).getCell(3).value))) fh = r;
    for (let c = 3; c <= 40; c++) { if (/^\d{1,2}$/.test(T(ws.getRow(2).getCell(c).value))) days = c - 2; else if (days) break; }
    return { inRow, fh: fh || inRow + 4, days, countCol: 3 + days };
  }

  /**
   * 이용자현황 그 달 시트 만들기 (있으면 내용을 지우고 새로 씀)
   * people: [{ name, age, inDate, end }], admits: [{ name, age, cause }], leaves: [{ name, reason, indep }]
   */
  async function buildUsers(file, year, month, people, admits, leaves) {
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await file.arrayBuffer());
    const notes = [];
    let src = null, srcL = null;
    for (let m = month - 1; m >= 1 && !srcL; m--) { const w = sheetOfMonth(wb, m); const l = w && layoutOf(w); if (l) { src = w; srcL = l; } }
    let ws = sheetOfMonth(wb, month);
    if (!src) { src = ws; srcL = ws && layoutOf(ws); }
    if (!srcL) throw new Error('이용자현황 파일에서 본보기로 쓸 달 시트(입 소·인 원 줄이 있는 시트)를 찾지 못했어요.');
    if (!ws) { ws = wb.addWorksheet(`${month}월`); notes.push(`'${month}월' 시트가 없어서 새로 만들었어요`); }

    // 본보기 스타일 미리 복사 (같은 시트를 덮어쓸 수도 있으므로)
    const S = (r, c) => clone(src.getRow(r).getCell(c).style);
    const H = (r) => src.getRow(r).height;
    const st = {
      title: S(1, 2), titleH: H(1), r2b: S(2, 2), r2day: S(2, 3), r2cnt: S(2, srcL.countCol), r2H: H(2),
      pb: S(3, 2), pday: S(3, 3), pcnt: S(3, srcL.countCol), pH: H(3),
      rows: [0, 1, 2].map((i) => ({ b: S(srcL.inRow + i, 2), day: S(srcL.inRow + i, 3), cnt: S(srcL.inRow + i, srcL.countCol), h: H(srcL.inRow + i) })),
      foot: Array.from({ length: 6 }, (_, i) => ({ h: H(srcL.fh + i), cells: Array.from({ length: 28 }, (_, c) => S(srcL.fh + i, c + 1)) })),
      widths: { b: src.getColumn(2).width, day: src.getColumn(3).width, cnt: src.getColumn(srcL.countCol).width },
    };

    // 대상 시트 비우기
    unmergeAll(ws);
    const maxR = Math.max(ws.rowCount, 60);
    for (let r = 1; r <= maxR; r++) { const row = ws.getRow(r); row.height = undefined; for (let c = 1; c <= 45; c++) { const cell = row.getCell(c); cell.value = null; cell.style = {}; } }

    const D = new Date(year, month, 0).getDate(), N = people.length;
    const cntCol = 3 + D, last = colL(2 + D), cnt = colL(cntCol);
    const ms = `${year}-${p2(month)}-01`, me = `${year}-${p2(month)}-${p2(D)}`;
    ws.getColumn(2).width = st.widths.b;
    for (let c = 3; c <= 2 + D; c++) ws.getColumn(c).width = st.widths.day;
    ws.getColumn(cntCol).width = st.widths.cnt;

    // 1~2줄
    ws.getRow(1).height = st.titleH;
    ws.getCell('B1').value = `${month}월 이용자 현황`;
    for (let c = 2; c <= 2 + D; c++) ws.getRow(1).getCell(c).style = clone(st.title);
    ws.mergeCells(`B1:${last}1`);
    ws.getRow(2).height = st.r2H;
    ws.getRow(2).getCell(2).style = clone(st.r2b);
    for (let d = 1; d <= D; d++) { const c = ws.getRow(2).getCell(2 + d); c.value = d; c.style = clone(st.r2day); }
    ws.getRow(2).getCell(cntCol).value = '입소일'; ws.getRow(2).getCell(cntCol).style = clone(st.r2cnt);

    // 재소자 줄
    people.forEach((p, i) => {
      const r = 3 + i, row = ws.getRow(r); row.height = st.pH;
      row.getCell(2).value = `${p.name}(${p.age ?? ''})`; row.getCell(2).style = clone(st.pb);
      const from = p.inDate > ms ? p.inDate : ms, to = p.end && p.end < me ? p.end : me;
      for (let d = 1; d <= D; d++) {
        const ds = `${year}-${p2(month)}-${p2(d)}`, cell = row.getCell(2 + d);
        cell.style = clone(st.pday); cell.value = ds >= from && ds <= to ? 0 : null;    // 퇴소일도 재소로 셈
      }
      row.getCell(cntCol).value = { formula: `COUNT(C${r}:${last}${r})` }; row.getCell(cntCol).style = clone(st.pcnt);
    });
    const inR = 3 + N, outR = 4 + N, numR = 5 + N, lastP = 2 + N;
    [[inR, '입 소', (ds) => people.filter((p) => p.inDate === ds).length],
     [outR, '퇴 소', (ds) => people.filter((p) => p.end === ds).length]].forEach(([r, label, f], k) => {
      const row = ws.getRow(r); row.height = st.rows[k].h;
      row.getCell(2).value = label; row.getCell(2).style = clone(st.rows[k].b);
      for (let d = 1; d <= D; d++) { const n = f(`${year}-${p2(month)}-${p2(d)}`); const cell = row.getCell(2 + d); cell.style = clone(st.rows[k].day); cell.value = n || null; }
      row.getCell(cntCol).value = { formula: `SUM(C${r}:${last}${r})` }; row.getCell(cntCol).style = clone(st.rows[k].cnt);
    });
    { const row = ws.getRow(numR); row.height = st.rows[2].h;
      row.getCell(2).value = '인 원'; row.getCell(2).style = clone(st.rows[2].b);
      for (let d = 1; d <= D; d++) { const L = colL(2 + d), cell = row.getCell(2 + d); cell.style = clone(st.rows[2].day); cell.value = { formula: `COUNT(${L}3:${L}${lastP})` }; }
      row.getCell(cntCol).value = { formula: `SUM(${cnt}3:${cnt}${lastP})` }; row.getCell(cntCol).style = clone(st.rows[2].cnt); }

    // 아래 표: 나이대별 입소·연인원 + 입소생/퇴소생 목록
    const fh = numR + 2;
    const listN = Math.max(1, admits.length, leaves.length);
    const footRows = Math.max(6, listN + 1);
    for (let i = 0; i < footRows; i++) {
      const s = st.foot[Math.min(i, 5)], s2 = i < 6 ? s : st.foot[1];
      const row = ws.getRow(fh + i); row.height = s2.h;
      for (let c = 2; c <= Math.max(2 + D, 28); c++) row.getCell(c).style = clone(s2.cells[Math.min(c, 27) - 1]);
    }
    const put = (r, c, v) => { ws.getRow(r).getCell(c).value = v; };
    put(fh, 3, `${month}월입소`); put(fh, 5, '연인원'); put(fh, 9, '입소생'); put(fh, 13, '가출원인'); put(fh, 19, '퇴소생'); put(fh, 22, '퇴소사유 '); put(fh, 27, '퇴소후 자립');
    const groups = [['13세이하', (a) => a <= 13], ['14~16세', (a) => a >= 14 && a <= 16], ['17~18세', (a) => a >= 17 && a <= 18], ['19세이상', (a) => a >= 19]];
    groups.forEach(([label, test], i) => {
      const r = fh + 1 + i;
      put(r, 2, label);
      put(r, 3, admits.filter((a) => a.age != null && test(Number(a.age))).length);
      const refs = people.map((p, k) => (p.age != null && test(Number(p.age)) ? `${cnt}${3 + k}` : null)).filter(Boolean);
      put(r, 5, refs.length ? { formula: refs.join('+') } : 0);
    });
    put(fh + 5, 2, '합계'); put(fh + 5, 3, { formula: `SUM(C${fh + 1}:D${fh + 4})` }); put(fh + 5, 5, { formula: `SUM(E${fh + 1}:G${fh + 4})` });
    admits.forEach((a, i) => { put(fh + 1 + i, 9, a.name); put(fh + 1 + i, 13, a.cause || ''); });
    leaves.forEach((l, i) => { put(fh + 1 + i, 19, l.name); put(fh + 1 + i, 22, l.reason || ''); put(fh + 1 + i, 27, l.indep || ''); });
    for (let i = 0; i <= 5; i++) { ws.mergeCells(`C${fh + i}:D${fh + i}`); ws.mergeCells(`E${fh + i}:G${fh + i}`); }
    for (let i = 0; i <= Math.max(1, admits.length); i++) { ws.mergeCells(`I${fh + i}:L${fh + i}`); ws.mergeCells(`M${fh + i}:Q${fh + i}`); }
    for (let i = 0; i <= Math.max(1, leaves.length); i++) { ws.mergeCells(`S${fh + i}:U${fh + i}`); ws.mergeCells(`V${fh + i}:Z${fh + i}`); ws.mergeCells(`AA${fh + i}:${last}${fh + i}`); }

    const noAge = people.filter((p) => p.age == null).map((p) => p.name);
    if (noAge.length) notes.push(`나이를 몰라 나이대 연인원에서 빠진 사람: ${noAge.join(', ')} — 나이를 적어 주세요`);
    wb.calcProperties = { ...(wb.calcProperties || {}), fullCalcOnLoad: true };
    return { buffer: await wb.xlsx.writeBuffer(), notes };
  }

  // ── 학업·자립·법률·의료지원 ─────────────────────────────
  const SHEETS = {
    의료지원: { '의약품·의약외품': '의약품·의약외품', 진단및치료: '진단 및 치료', 건강관리: '건강관리', 건강검진: '건강검진' },
    자립지원: { 취업: '아르바이트 출근지도', 홀로서기: '홀로서기' },
    학업지원: { 학업지원: '학업지원', 특기적성교육지원: '특기적성 교육지원', 기초학습: '기초학습', 검정고시학업지원: '검정고시 학업지원', 검정고시: '검정고시', 학업관련비용지원: '학업관련비용 지원' },
    상담정서지원: { '개인상담-대면': '대면상담', '개인상담-전화': '전화상담', '개인상담-사이버': '사이버상담', '개인상담-외부기관': '외부기관상담', 가족상담: '가족상담' },
    법률지원: { 법률구제지원: '법률구제지원' },
  };
  /** 제목 → 상세내역: 서비스 이름 머리말은 떼고, 그 밖의 '○○_'는 '○○ - '로 */
  function detailText(title) {
    let t = String(title || '').replace(/\s+/g, ' ').trim().replace(/^\(외부기관\s*상담\)\s*/, '');
    t = t.replace(/^의약품\s*(지원|제공|지급)\s*[-–]\s*/, '');
    const m = t.match(/^([^_]{1,15})_\s*(.+)$/);
    if (!m) return t;
    const head = m[1].trim();
    if (/(지원|제공|지급|학습지도|기초학습|홀로서기|학업|특기적성|이미용)$/.test(head)) return m[2].trim();
    return `${head} - ${m[2].trim()}`;
  }

  function findBlocks(ws) {
    const heads = [];
    for (let r = 1; r <= ws.rowCount; r++) { const t = T(ws.getRow(r).getCell(1).value); const m = t.match(/^(\d{4})\s*년\s*(\d{1,2})\s*월/); if (m) heads.push({ row: r, year: Number(m[1]), month: Number(m[2]), text: t }); }
    return heads;
  }
  function lastDataRow(ws, fromRow) {
    let last = fromRow;
    for (let r = fromRow; r <= ws.rowCount; r++) if (T(ws.getRow(r).getCell(3).value)) last = r;
    return last;
  }

  async function buildSupport(file, year, month, sessions, ages) {
    const wb = new ExcelJS.Workbook(); await wb.xlsx.load(await file.arrayBuffer());
    const notes = [], counts = {};
    const ym = `${year}-${p2(month)}`;
    for (const [sheetName, map] of Object.entries(SHEETS)) {
      const ws = wb.getWorksheet(sheetName);
      if (!ws) { notes.push(`'${sheetName}' 시트가 없어서 건너뛰었어요`); continue; }
      const items = [];
      for (const s of sessions) {
        if (!s.date.startsWith(ym) || !(s.key in map)) continue;
        for (const name of s.people || [s.name]) items.push({ date: s.date, time: s.time || '', name, svc: map[s.key], detail: detailText(s.title), title: s.title, key: s.key });
      }
      items.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
      counts[sheetName] = items.length;
      const blocks = findBlocks(ws);
      if (!blocks.length) {                                   // 법률지원처럼 달 구분 없이 이어 쓰는 표
        if (!items.length) continue;
        let hdr = 0; for (let r = 1; r <= 10 && !hdr; r++) if (T(ws.getRow(r).getCell(1).value) === '연번') hdr = r;
        if (!hdr) { notes.push(`'${sheetName}' 시트의 표 머리줄(연번)을 찾지 못했어요`); continue; }
        let r0 = lastDataRow(ws, hdr + 1); const styleRow = r0 > hdr ? r0 : hdr + 1;
        let no = Number(T(ws.getRow(r0).getCell(1).value)) || 0;
        const sty = [1, 2, 3, 4].map((c) => clone(ws.getRow(styleRow).getCell(c).style));
        for (const it of items) { r0++; const row = ws.getRow(r0); [++no, toDate(it.date), it.name, it.detail ? `${it.svc} - ${it.detail}` : it.svc].forEach((v, i) => { row.getCell(i + 1).value = v; row.getCell(i + 1).style = clone(sty[i]); }); row.getCell(2).numFmt = 'm"월" d"일";@'; }
        notes.push(`${sheetName}: ${items.length}건을 표 끝에 이어 썼어요`);
        continue;
      }
      // 작년 파일을 복사해서 쓰므로, 머리에 적힌 '연도'로 구분: 올해보다 앞선 연도 묶음 = 지난해에 남은 것(지움)
      // 올해 이 달 묶음(다시 만들 때)도 지우고 새로 씀. 올해의 뒤 달 묶음이 이미 있으면 건드리지 않음
      const isOld = (b) => b.year < year || (b.year === year && b.month === month);
      if (blocks.some((b) => b.year === year && b.month > month)) { notes.push(`${sheetName}: ${month}월 뒤 달 묶음이 이미 있어서 그대로 뒀어요`); continue; }
      const prev = blocks.filter((b) => b.year === year && b.month < month).pop();
      const model = prev || blocks[0];                               // 새해 1월이면 지난해 묶음을 서식 본보기로
      const nextOf = (row) => (blocks.find((b) => b.row > row) || { row: ws.rowCount + 2 }).row;
      const dataEnd = (from, until) => { let e = from; for (let r = from; r < until; r++) if (T(ws.getRow(r).getCell(3).value)) e = r; return e; };
      const mHead = model.row, mHdr = model.row + 1, mData = model.row + 2;
      const sty = { head: [1, 2, 3, 4, 5].map((c) => clone(ws.getRow(mHead).getCell(c).style)), headH: ws.getRow(mHead).height,
        hdr: [1, 2, 3, 4, 5].map((c) => ({ v: ws.getRow(mHdr).getCell(c).value, s: clone(ws.getRow(mHdr).getCell(c).style) })), hdrH: ws.getRow(mHdr).height,
        data: [1, 2, 3, 4, 5].map((c) => clone(ws.getRow(mData).getCell(c).style)), dataH: ws.getRow(mData).height };
      const modelText = model.text;
      // 시작: 올해 지난달 묶음 한 줄 아래(지난해 묶음 머리가 바로 붙어 있으면 그 자리). 올해 묶음이 없으면 맨 위 묶음 자리
      const firstOld = blocks.find((b) => (!prev || b.row > prev.row) && isOld(b));
      let start = prev ? dataEnd(prev.row + 1, nextOf(prev.row)) + 2 : blocks[0].row;
      if (firstOld && firstOld.row < start) start = firstOld.row;
      const end = start + 1 + items.length;
      // 지울 범위: start 부터 시트 끝까지 남은 지난해 내용 전부 (순서가 섞여 올해 묶음이 나오면 그 앞까지)
      const keep = blocks.find((b) => b.row >= start && !isOld(b));
      let lastUsed = end;
      for (let r = start; r <= ws.rowCount; r++) for (let c = 1; c <= 5; c++) if (T(ws.getRow(r).getCell(c).value)) lastUsed = Math.max(lastUsed, r);
      const clearTo = keep ? keep.row - 1 : lastUsed;
      const removed = blocks.filter((b) => b.row >= start && b.row <= clearTo && b.year < year).map((b) => `${b.year}년 ${b.month}월`);
      for (const k of Object.keys(ws._merges || {})) { const m = ws._merges[k]; const top = m.top || 0; if (top >= start && top <= clearTo) { try { ws.unMergeCells(m.range || k); } catch { /* 무시 */ } } }
      for (let r = start; r <= clearTo; r++) {
        const row = ws.getRow(r);
        for (let c = 1; c <= 5; c++) { const cell = row.getCell(c); cell.value = null; if (r > end) cell.style = {}; }
        if (r > end) row.height = undefined;
      }
      // 새 묶음 쓰기
      const headRow = ws.getRow(start); headRow.height = sty.headH;
      for (let c = 1; c <= 5; c++) headRow.getCell(c).style = clone(sty.head[c - 1]);
      headRow.getCell(1).value = modelText.replace(/^\d{4}\s*년\s*\d{1,2}\s*월/, `${year}년 ${month}월`);
      ws.mergeCells(`A${start}:E${start}`);
      const hr = ws.getRow(start + 1); hr.height = sty.hdrH;
      sty.hdr.forEach((h, i) => { hr.getCell(i + 1).value = h.v; hr.getCell(i + 1).style = clone(h.s); });
      items.forEach((it, i) => {
        const row = ws.getRow(start + 2 + i); row.height = sty.dataH;
        [i + 1, toDate(it.date), it.name, it.svc, it.detail].forEach((v, k) => { row.getCell(k + 1).value = v; row.getCell(k + 1).style = clone(sty.data[k]); });
      });
      if (removed.length) notes.push(`${sheetName}: 지난해(작년 파일에서 남은) 묶음 ${removed.join(', ')}을(를) 지우고 ${month}월을 썼어요`);
      if (!items.length) notes.push(`${sheetName}: ${month}월 기록이 없어 빈 묶음만 만들었어요`);
    }
    // 의료지원 오른쪽 '정신과 진료' 표 (I~N)
    const med = wb.getWorksheet('의료지원');
    const psy = sessions.filter((s) => s.date.startsWith(ym) && s.key === '진단및치료' && /정신과/.test(s.title))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    if (med && psy.length) {
      let lastR = 0; for (let r = 1; r <= med.rowCount; r++) if (T(med.getRow(r).getCell(10).value)) lastR = r;
      if (lastR) {
        const sty = [9, 10, 11, 12, 13, 14].map((c) => clone(med.getRow(lastR).getCell(c).style));
        let no = Number(T(med.getRow(lastR).getCell(9).value)) || 0;
        const already = new Set(); for (let r = 3; r <= lastR; r++) { const v = med.getRow(r).getCell(11).value; if (v instanceof Date) already.add(`${T(med.getRow(r).getCell(10).value)}|${v.toISOString().slice(0, 10)}`); }
        let r = lastR, added = 0;
        for (const s of psy) {
          const name = (s.people || [s.name])[0];
          if (already.has(`${name}|${s.date}`)) continue;
          const t = String(s.title);
          const hosp = (t.match(/\(([^()]*의(학과|원)[^()]*)\)/) || t.match(/_\s*([^_()]*의(학과|원)[^_()]*)/) || [])[1] || '';
          r++; added++;
          const row = med.getRow(r);
          [++no, name, toDate(s.date), ages[name] != null ? `${ages[name]}세` : '', hosp.trim(), ''].forEach((v, i) => { row.getCell(9 + i).value = v; row.getCell(9 + i).style = clone(sty[i]); });
        }
        if (added) notes.push(`의료지원 '정신과 진료' 표에 ${added}건 추가 — 방문사유(처방/진료)는 직접 적어 주세요`);
      }
    }
    wb.calcProperties = { ...(wb.calcProperties || {}), fullCalcOnLoad: true };
    return { buffer: await wb.xlsx.writeBuffer(), notes, counts };
  }

  global.Yearly = { isUsersFile, isSupportFile, previousAges, buildUsers, buildSupport, detailText };
})(window);
