/* 1단계: 개인별 엑셀 → 안전망 실적 엑셀
   모든 처리는 브라우저 안에서만 이루어집니다(파일 전송 없음). */
(function (global) {
  'use strict';

  // ── 설정: '실적 정리' 시트의 행 ↔ 서비스 키 ────────────────────────────
  // 키 = 서비스명에서 "(공통서비스)_"와 공백을 뺀 것
  const ROW_MAP = {
    7: '활동관련비용지원', 8: '이미용서비스',
    10: '건강검진', 11: '건강관리', 12: '의약품·의약외품', 13: '진단및치료', 14: '진단및치료-정신과', 15: '영양제지원',
    16: '가족회의', 17: '오!해피데이', 18: '생활안전교육', 19: '법률구제지원',
    22: '검정고시', 23: '기초학습', 24: '학업지원', 25: '학업관련비용지원', 26: '특기적성교육지원', 27: '검정고시학업지원',
    28: '인성교육', 29: '인권교육', 30: '약물중독예방', 31: '도박중독예방교육', 32: '생명존중교육', 33: '성교육',
    36: '취업', 37: '홀로서기', 38: '직업여행기', 39: '이미지메이킹', 40: '자립지원교육', 41: '우리가주인', 42: '집밥요리교실', 43: '가정복귀지원',
    46: '개인상담-대면', 47: '개인상담-전화', 48: '개인상담-사이버', 49: '가족상담', 50: '개인상담-외부기관', 51: '심리검사',
    52: '연극치료', 53: '집단미술치료', 54: '인터넷중독예방', 55: '너,나우리집단상담', 56: '마음놀이터', 57: '반갑다친구야',
    68: '신나는문화콘서트', 69: '우리함께놀자', 70: '청춘여행기', 71: '멘토링', 72: '우리들의기념일', 73: '가족여행', 74: '계절나들이', 75: '체육활동',
  };
  // 개인 파일에 없어서 직접 입력하는 행
  const MANUAL_ROWS = [
    { row: 58, label: '슈퍼비전' }, { row: 59, label: '사후관리' },
    { row: 61, label: '아웃리치 · 참여청소년' }, { row: 62, label: '아웃리치 · 청소년 상담' },
    { row: 63, label: '아웃리치 · 아웃리치 프로그램' }, { row: 64, label: '아웃리치 · 서울시 연합' },
    { row: 65, label: '아웃리치 · 학교' }, { row: 66, label: '사이버아웃리치' },
    { row: 77, label: '홍보사업' }, { row: 78, label: '지역사회연계' }, { row: 79, label: '자원봉사자 관리' },
  ];
  const SUMMARY_SHEET = '실적 정리';
  const RESIDENT_SHEET = '이용자현황';

  // ── 줄 번호 대신 항목 이름(B열 프로그램명 / C열 자원제공서비스)으로 찾기 ──
  // 위 번호는 이름으로 못 찾을 때만 쓰는 예비값. 이름이 서비스 키와 다른 것만 따로 적음.
  const ROW_ALIAS = {
    '개인상담-대면': [{ c: '대면상담' }], '개인상담-전화': [{ c: '전화상담' }], '개인상담-사이버': [{ c: '사이버상담' }],
    '개인상담-외부기관': [{ c: '외부기관상담' }], '진단및치료-정신과': [{ b: '진단및치료-정신과진료' }], '멘토링': [{ b: '멘토링' }],
  };
  const MANUAL_SPEC = {
    58: [{ b: '슈퍼비전' }], 59: [{ b: '사후관리' }],
    61: [{ b: '지역사회', c: '참여청소년' }], 62: [{ b: '지역사회', c: '청소년상담' }], 63: [{ b: '지역사회', c: '아웃리치프로그램' }],
    64: [{ b: '서울시연합' }], 65: [{ b: '학교' }], 66: [{ b: '사이버아웃리치' }],
    77: [{ b: '홍보사업' }], 78: [{ b: '지역사회연계' }], 79: [{ b: '자원봉사자관리' }],
  };
  const normLabel = (s) => String(s || '').replace(/^\(공통서비스\)_/, '').replace(/\s/g, '');

  /** 실적 정리 시트에서 서비스 키 → 줄 번호, 수기 항목 → 줄 번호를 이름으로 찾음 */
  function resolveRows(ss, month) {
    const cS = 8 + 2 * (month - 1);
    const rows = [];
    for (let r = 3; r <= ss.rowCount; r++) {
      const R = ss.getRow(r);
      // 소계 줄(이번 달 칸에 수식)은 제외 — 병합 칸은 수식으로 보지 않음
      rows.push({ r, b: normLabel(cellText(R.getCell(2).value)), c: normLabel(cellText(R.getCell(3).value)), sub: typeof R.getCell(cS).formula === 'string' });
    }
    const match = (x, s) => !x.sub && (!s.c || x.c === s.c) && (!s.b || x.b === s.b);
    const find = (specs) => {                 // 앞에 적은 조건부터 차례로 (C열 일치가 먼저)
      for (const s of specs) { const hit = rows.find((x) => match(x, s)); if (hit) return hit.r; }
      return null;
    };
    const notes = [];
    const svc = {};
    for (const [row, key] of Object.entries(ROW_MAP)) {
      const specs = ROW_ALIAS[key] || [{ c: key }, { b: key }];
      const r = find(specs);
      svc[key] = r || Number(row);
      if (!r) notes.push(`'실적 정리'에서 '${key}' 항목을 이름으로 찾지 못해 ${row}행에 넣었어요 — 확인해 주세요`);
    }
    const manual = MANUAL_ROWS.map((m) => {
      const r = find(MANUAL_SPEC[m.row] || []);
      if (!r) notes.push(`'실적 정리'에서 '${m.label}' 항목을 이름으로 찾지 못해 ${m.row}행을 썼어요 — 확인해 주세요`);
      return { ...m, key: m.row, row: r || m.row };   // key = 원래 줄 번호(항목 구분용)
    });
    return { svc, manual, notes };
  }

  const svcKey = (s) => s.replace(/^\(공통서비스\)_/, '').replace(/\s/g, '');
  const pad2 = (n) => String(n).padStart(2, '0');
  const ordinal = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

  function cellText(v) {
    if (v == null) return '';
    if (v instanceof Date) return `${v.getUTCFullYear()}-${pad2(v.getUTCMonth() + 1)}-${pad2(v.getUTCDate())}`;
    if (typeof v === 'object') {
      if (v.richText) return v.richText.map((t) => t.text).join('');
      if ('result' in v) return cellText(v.result);
      if ('text' in v) return String(v.text);
      if (v.error) return '';
      return '';
    }
    return String(v);
  }
  function dateText(v) {
    if (typeof v === 'number') { // 엑셀 일련번호
      const d = new Date(Math.round((v - 25569) * 86400000));
      return cellText(d);
    }
    return cellText(v).trim();
  }

  function subKind(r) {
    if (/^\s*\(외부기관/.test(r.title)) return '1외부기관';
    if (r.mode.startsWith('오프라인')) return '2대면';
    if (r.mode.includes('전화')) return '4전화';
    return '3사이버';
  }

  /** 파일 이름에서 이름/월 추출: "홍길동 9월.xlsx", "홍길동9월.xlsx" */
  function parsePersonalName(fileName) {
    const base = fileName.replace(/\.xlsx$/i, '').trim();
    const m = base.match(/^(\D+?)\s*0?(\d{1,2})\s*월\s*$/);
    if (m) return { person: m[1].trim(), month: Number(m[2]) };
    return { person: base, month: null };
  }

  function isSummaryFileName(name) { return /안전망/.test(name); }
  /** '홍길동 9월.xlsx'처럼 이름이 붙은 파일인지 (원본 '실행목록[…].xlsx'은 아님) */
  function isNamedPersonalFile(name) {
    const p = parsePersonalName(name);
    return p.month != null && !/실행목록/.test(name) && /[가-힣]/.test(p.person);
  }

  /** 파일에 들어 있는 서비스제공일의 달별 건수: [['2026-09', 116], …] (많은 순) */
  async function peekMonths(file) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    let hdr = 0, dc = 0;
    for (let r = 1; r <= Math.min(15, ws.rowCount) && !hdr; r++) ws.getRow(r).eachCell((c, ci) => { if (cellText(c.value).trim() === '서비스제공일' && !dc) { hdr = r; dc = ci; } });
    const n = {};
    if (hdr) for (let r = hdr + 1; r <= ws.rowCount; r++) { const d = dateText(ws.getRow(r).getCell(dc).value); if (/^\d{4}-\d{2}/.test(d)) n[d.slice(0, 7)] = (n[d.slice(0, 7)] || 0) + 1; }
    return Object.entries(n).sort((a, b) => b[1] - a[1]);
  }

  /** 개인 파일 하나 읽기 */
  async function readPersonal(file, year, month, personOverride) {
    const person = personOverride ?? parsePersonalName(file.name).person;
    let skipped = 0;
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    const warnings = [];
    let hdr = 0; const col = {};
    for (let r = 1; r <= Math.min(15, ws.rowCount) && !hdr; r++) {
      ws.getRow(r).eachCell((c, ci) => { if (cellText(c.value).trim() === '자원제공서비스명') hdr = r; });
    }
    if (!hdr) return { person, records: [], warnings: [`[${file.name}] 머리글(자원제공서비스명)을 찾지 못해 건너뜀`] };
    // 병합된 머리글은 오른쪽 칸에도 같은 글자가 보이므로 처음 나온 열만 사용
    ws.getRow(hdr).eachCell((c, ci) => { const t = cellText(c.value).trim(); if (t && !(t in col)) col[t] = ci; });
    for (const need of ['자원제공서비스명', '서비스 제공제목', '서비스제공일', '서비스제공시간', '제공방식', '집단서비스여부']) {
      if (!col[need]) return { person, records: [], warnings: [`[${file.name}] '${need}' 열이 없어 건너뜀`] };
    }
    const ym = `${year}-${pad2(month)}`;
    const records = [];
    for (let r = hdr + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const g = (name) => row.getCell(col[name]).value;
      const svc = cellText(g('자원제공서비스명')).trim();
      if (!svc) continue;
      const date = dateText(g('서비스제공일'));
      if (!date.startsWith(ym)) { skipped++; continue; }
      records.push({
        person, svc, key: svcKey(svc),
        title: cellText(g('서비스 제공제목')), date,
        time: cellText(g('서비스제공시간')).trim(), mode: cellText(g('제공방식')).trim(),
        group: cellText(g('집단서비스여부')).trim() === 'Y',
      });
    }
    if (skipped) warnings.push(`[${person || file.name}] ${month}월이 아닌 기록 ${skipped}건은 뺐어요`);
    return { person, records, warnings };
  }

  /** 회기 만들기: 집단(Y)은 같은 서비스·날짜·제목·시간끼리 1회기 */
  function buildSessions(records) {
    const sessions = [];
    const groups = new Map();
    for (const r of records) {
      if (!r.group) continue;
      const k = `${r.svc}|${r.date}|${r.title.trim()}|${r.time}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(r);
    }
    for (const list of groups.values()) {
      const f = list[0];
      sessions.push({ svc: f.svc, key: f.key, date: f.date, name: `${list.length}명`, persons: list.length,
        title: f.title, time: f.time, mode: f.mode, sub: '', people: list.map((x) => x.person) });
    }
    for (const r of records) {
      if (r.group) continue;
      let sub = '', key = r.key;
      if (r.key === '개인상담') { sub = subKind(r); key = '개인상담-' + sub.slice(1); }
      sessions.push({ svc: r.svc, key, date: r.date, name: r.person, persons: 1,
        title: r.title, time: r.time, mode: r.mode, sub, people: [r.person] });
    }
    return sessions;
  }

  function aggregate(sessions) {
    const agg = {};
    const add = (k, p) => { (agg[k] ||= [0, 0]); agg[k][0] += 1; agg[k][1] += p; };
    for (const s of sessions) {
      add(s.key, s.persons);
      if (s.key === '진단및치료' && /정신과/.test(s.title)) add('진단및치료-정신과', s.persons);
    }
    return agg;
  }

  /** 목록 시트용 줄 만들기 (서비스별 묶음, 묶음 사이 빈 줄) */
  function buildListLines(sessions) {
    const gk = (s) => `${s.svc}|${s.sub}`;
    const order = [...new Set(sessions.map(gk))].sort(ordinal);
    const lines = [];
    for (const k of order) {
      const items = sessions.filter((s) => gk(s) === k)
        .sort((a, b) => ordinal(a.date, b.date) || ordinal(a.time, b.time) || ordinal(a.name, b.name));
      items.forEach((s, i) => lines.push([i + 1, s.date, s.name, s.svc, s.title, s.time, s.mode]));
      lines.push(null);
    }
    lines.pop();
    return { lines, groupCount: order.length };
  }

  // 병합된 칸의 '종속' 칸(값은 첫 칸에 있음)
  const isMergedSlave = (cell) => cell.isMerged && cell.master && cell.master.address !== cell.address;
  // 쓰면 안 되는 칸: 수식이 있거나, 병합 종속 칸
  /** 목록 줄을 날짜순으로(같은 날은 목록 순서 유지), 날짜 사이 빈 줄, 날짜마다 번호 1부터 */
  function buildDateLines(lines) {
    const data = lines.filter(Boolean).map((l, i) => ({ l, i }));
    data.sort((a, b) => ordinal(a.l[1], b.l[1]) || a.i - b.i);
    const out = []; let prev = null, n = 0;
    for (const { l } of data) {
      if (prev !== null && l[1] !== prev) { out.push(null); n = 0; }
      prev = l[1]; n++;
      out.push([n, ...l.slice(1)]);
    }
    return out;
  }

  const hasFormula = (cell) => {
    if (isMergedSlave(cell)) return true;
    const v = cell.value;
    return v != null && typeof v === 'object' && ('formula' in v || 'sharedFormula' in v);
  };
  const clone = (o) => JSON.parse(JSON.stringify(o || {}));

  /** 템플릿(실적 파일) 정보 읽기: 수기 입력 행의 기존 값, 입소생 명단 */
  async function inspectTemplate(file, year, month) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const info = { manual: [], residents: [], sheets: wb.worksheets.map((w) => w.name) };
    const ss = wb.getWorksheet(SUMMARY_SHEET);
    if (ss) {
      const cS = 8 + 2 * (month - 1);
      const rr = resolveRows(ss, month);
      info.rowNotes = rr.notes;
      for (const m of rr.manual) {
        const a = ss.getRow(m.row).getCell(cS), b = ss.getRow(m.row).getCell(cS + 1);
        info.manual.push({ ...m, sessions: hasFormula(a) ? null : cellText(a.value), persons: hasFormula(b) ? null : cellText(b.value),
          sessionsIsFormula: hasFormula(a), personsIsFormula: hasFormula(b) });
      }
    }
    const rs = wb.getWorksheet(RESIDENT_SHEET);
    if (rs) {
      const mStart = `${year}-${pad2(month)}-01`;
      const mEnd = `${year}-${pad2(month)}-31`;
      const R = readResidents(rs);
      if (R) {
        info.admissions = R.left; info.discharges = R.right;
        const seen = new Map();
        for (const e of R.left) {
          if (e.inDate <= mEnd && (!e.end || e.end >= mStart)) seen.set(e.name, { name: e.name, inDate: e.inDate, end: e.end });
        }
        info.residents = [...seen.values()];
      }
    }
    return info;
  }

  // ── 이용자현황 시트 ─────────────────────────────────────
  /** 머리글 위치와 입소생(왼쪽)/퇴소생(오른쪽) 목록 읽기 */
  function readResidents(rs) {
    let hdr = 0;
    for (let r = 1; r <= 8 && !hdr; r++) rs.getRow(r).eachCell((c) => { if (cellText(c.value).trim() === '입소일') hdr = r; });
    if (!hdr) return null;
    const H = [];
    rs.getRow(hdr).eachCell((c, ci) => { if (!isMergedSlave(c)) H.push([ci, cellText(c.value).trim()]); });
    const find = (label, from = 0, to = 999) => (H.find(([ci, t]) => t === label && ci > from && ci < to) || [0])[0];
    const cIn = find('입소일'), cPeriod = find('입소기간'), cOut = find('퇴소날짜');
    const L = { no: Math.max(...H.filter(([ci, t]) => t === '번호' && ci < cIn).map(([ci]) => ci)), in: cIn,
      name: find('이름', cIn, cPeriod), age: find('만나이', cIn, cPeriod), cause: find('가출원인', cIn, cPeriod),
      school: find('학업현황', cIn, cPeriod), period: cPeriod };
    L.month = L.no - 1;
    const Rt = { no: find('번호', cPeriod, cOut), name: find('이름', cPeriod, cOut), out: cOut,
      reason: find('퇴소사유', cOut), indep: find('자립', cOut) };
    const left = [], right = [];
    let lastLeft = hdr, lastRight = hdr;
    for (let r = hdr + 1; r <= rs.rowCount; r++) {
      const row = rs.getRow(r);
      const g = (c) => (c ? cellText(row.getCell(c).value).trim() : '');
      const inDate = L.in ? dateText(row.getCell(L.in).value) : '';
      if (g(L.name) && /^\d{4}-\d{2}-\d{2}/.test(inDate)) {
        const period = g(L.period); const m = period.match(/~\s*(\d{4}-\d{2}-\d{2})/);
        left.push({ row: r, no: Number(g(L.no)) || 0, name: g(L.name), inDate, age: g(L.age), cause: g(L.cause), school: g(L.school), period, end: m ? m[1] : null });
        lastLeft = r;
      }
      const outDate = Rt.out ? dateText(row.getCell(Rt.out).value) : '';
      if (g(Rt.name) && /^\d{4}-\d{2}-\d{2}/.test(outDate)) {
        right.push({ row: r, no: Number(g(Rt.no)) || 0, name: g(Rt.name), outDate, reason: g(Rt.reason), indep: g(Rt.indep) });
        lastRight = r;
      }
    }
    return { hdr, L, Rt, left, right, lastLeft, lastRight };
  }

  /** 개인 기록에서 입소상담/퇴소상담 찾기 (서비스제공일 기준) */
  function detectMoves(records) {
    const moves = new Map();
    for (const r of records) {
      const m = r.title.match(/^\s*(입소|퇴소)\s*상담/);
      if (!m) continue;
      const type = m[1], k = `${type}|${r.person}`;
      const prev = moves.get(k);
      // 같은 사람이 여러 번이면 입소는 가장 이른 날, 퇴소는 가장 늦은 날
      if (!prev || (type === '입소' ? r.date < prev.date : r.date > prev.date)) moves.set(k, { type, name: r.person, date: r.date, count: (prev?.count || 0) + 1 });
      else prev.count++;
    }
    return [...moves.values()].sort((a, b) => ordinal(a.date, b.date));
  }

  const toDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
  const copyRowStyle = (rs, fromRow, toRow, c1, c2) => {
    for (let c = c1; c <= c2; c++) rs.getRow(toRow).getCell(c).style = clone(rs.getRow(fromRow).getCell(c).style);
  };

  /** 이용자현황 시트에 입·퇴소 반영. 이미 있는 기록은 빈 칸만 채움 */
  function applyMoves(rs, moves, notes) {
    const R = readResidents(rs);
    if (!R) { notes.push('이용자현황 시트의 머리글(입소일)을 찾지 못해 입·퇴소를 반영하지 못했어요'); return; }
    const { L, Rt } = R;
    const setIfBlank = (row, col, v) => { if (col && v && !cellText(rs.getRow(row).getCell(col).value).trim()) rs.getRow(row).getCell(col).value = v; };
    const monthOf = (d) => d.slice(0, 7);

    for (const mv of moves.filter((x) => x.type === '입소')) {
      const ex = R.left.find((e) => e.name === mv.name && e.inDate === mv.date);
      if (ex) { setIfBlank(ex.row, L.age, mv.age); setIfBlank(ex.row, L.cause, mv.cause); setIfBlank(ex.row, L.school, mv.school); continue; }
      const prev = R.left[R.left.length - 1];
      const r = R.lastLeft + 1;
      if (R.lastLeft > R.hdr) copyRowStyle(rs, R.lastLeft, r, L.month, L.period);   // 빈 표면 머리글 서식은 복사하지 않음
      const row = rs.getRow(r);
      row.getCell(L.no).value = (prev?.no || 0) + 1;
      row.getCell(L.in).value = toDate(mv.date);
      row.getCell(L.name).value = mv.name;
      if (L.age && mv.age) row.getCell(L.age).value = isNaN(mv.age) ? mv.age : Number(mv.age);
      if (L.cause && mv.cause) row.getCell(L.cause).value = mv.cause;
      if (L.school && mv.school) row.getCell(L.school).value = mv.school;
      row.getCell(L.period).value = '-';
      // 월 표시 칸: 바로 위와 같은 달이면 병합을 아래로 늘리고, 아니면 새로 'N월'
      const label = `${Number(mv.date.slice(5, 7))}월`;
      if (prev && monthOf(prev.inDate) === monthOf(mv.date) && prev.row === R.lastLeft) {
        const top = rs.getRow(prev.row).getCell(L.month);
        const start = top.isMerged && top.master ? top.master.row : prev.row;
        if (start < prev.row) rs.unMergeCells(start, L.month, prev.row, L.month);
        rs.getRow(r).getCell(L.month).value = null;
        rs.mergeCells(start, L.month, r, L.month);
      } else {
        row.getCell(L.month).value = label;
      }
      R.left.push({ row: r, no: (prev?.no || 0) + 1, name: mv.name, inDate: mv.date, period: '-', end: null });
      R.lastLeft = r;
      notes.push(`이용자현황: ${mv.name} 입소(${mv.date}) 추가`);
    }

    for (const mv of moves.filter((x) => x.type === '퇴소')) {
      const ex = R.right.find((e) => e.name === mv.name && e.outDate === mv.date);
      if (ex) { setIfBlank(ex.row, Rt.reason, mv.reason); setIfBlank(ex.row, Rt.indep, mv.indep); }
      else {
        const prev = R.right[R.right.length - 1];
        const r = R.lastRight + 1;
        if (R.lastRight > R.hdr) copyRowStyle(rs, R.lastRight, r, Rt.no, Math.max(Rt.out, Rt.reason, Rt.indep));
        const row = rs.getRow(r);
        row.getCell(Rt.no).value = (prev?.no || 0) + 1;
        row.getCell(Rt.name).value = mv.name;
        row.getCell(Rt.out).value = toDate(mv.date);
        if (Rt.reason && mv.reason) row.getCell(Rt.reason).value = mv.reason;
        if (Rt.indep && mv.indep) row.getCell(Rt.indep).value = mv.indep;
        R.right.push({ row: r, no: (prev?.no || 0) + 1, name: mv.name, outDate: mv.date });
        R.lastRight = r;
        notes.push(`이용자현황: ${mv.name} 퇴소(${mv.date}) 추가`);
      }
      // 왼쪽 입소기간 채우기: 이 사람의 가장 최근 입소 중 아직 '-' 인 것
      const cand = R.left.filter((e) => e.name === mv.name && e.inDate <= mv.date).sort((a, b) => ordinal(b.inDate, a.inDate))[0];
      if (!cand) { notes.push(`이용자현황: ${mv.name}의 입소 기록이 없어 입소기간을 채우지 못했어요 (직접 확인)`); continue; }
      if (!cand.end) {
        rs.getRow(cand.row).getCell(L.period).value = `${cand.inDate} ~ ${mv.date}`;
        cand.end = mv.date;
      } else if (cand.end !== mv.date) {
        notes.push(`이용자현황: ${mv.name}의 입소기간이 이미 '${cand.period}'로 적혀 있어 그대로 뒀어요 (퇴소상담일 ${mv.date})`);
      }
    }
  }

  /** 결과 엑셀 만들기 */
  async function buildWorkbook(templateFile, sessions, agg, year, month, manualValues, moves) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await templateFile.arrayBuffer());
    const notes = [];

    // ── 예전 날짜순 시트('(2)' 또는 '_날짜순정렬')는 지난 내용이 남지 않도록 빼고, 아래에서 새로 만듦
    for (const w of [...wb.worksheets]) {
      if (/안전망 실적\s*\(\d+\)\s*$/.test(w.name) || /_날짜순정렬$/.test(w.name)) {
        wb.removeWorksheet(w.id);
        if (!/_날짜순정렬$/.test(w.name)) notes.push(`'${w.name}' 시트는 '_날짜순정렬' 시트로 바꿨어요`);
      }
    }

    // ── 이용자현황
    const rs = wb.getWorksheet(RESIDENT_SHEET);
    if (rs && moves && moves.length) applyMoves(rs, moves, notes);

    // ── 목록 시트
    const listName = `${month}월 안전망 실적`;
    let ws = wb.getWorksheet(listName);
    if (!ws) { ws = wb.worksheets[0]; ws.name = listName; }
    ws.getCell('B1').value = `${year}년 ${month}월 안전망 실적`;

    let oldLast = 4;
    for (let r = ws.rowCount; r >= 4; r--) { if (cellText(ws.getRow(r).getCell(2).value).trim()) { oldLast = r; break; } }
    const style4 = []; for (let c = 1; c <= 8; c++) style4[c] = clone(ws.getRow(4).getCell(c).style);
    const height4 = ws.getRow(4).height;

    const { lines, groupCount } = buildListLines(sessions);
    const newLast = 3 + lines.length;
    for (let r = 4; r <= Math.max(oldLast, newLast); r++) {
      const row = ws.getRow(r);
      const data = r <= newLast ? lines[r - 4] : undefined;
      for (let c = 1; c <= 8; c++) {
        const cell = row.getCell(c);
        cell.value = data && c <= 7 ? data[c - 1] : null;
        cell.style = r <= newLast ? clone(style4[c]) : {};
      }
      if (r <= newLast && height4) row.height = height4;
    }

    // ── 날짜순정렬 시트: 목록과 같은 모양, 날짜별로 묶고 날짜마다 1번부터
    {
      const ds = wb.addWorksheet(`${listName}_날짜순정렬`);
      for (let c = 1; c <= 8; c++) { const w = ws.getColumn(c).width; if (w) ds.getColumn(c).width = w; }
      for (let r = 1; r <= 3; r++) {
        const src = ws.getRow(r), dst = ds.getRow(r);
        if (src.height) dst.height = src.height;
        for (let c = 1; c <= 8; c++) { const s = src.getCell(c); if (isMergedSlave(s)) continue; dst.getCell(c).value = s.value; dst.getCell(c).style = clone(s.style); }
      }
      for (let r = 1; r <= 3; r++) for (let c = 1; c <= 8; c++) {   // 병합 칸 서식(테두리)도 복사
        const s = ws.getRow(r).getCell(c); if (isMergedSlave(s)) ds.getRow(r).getCell(c).style = clone(s.style);
      }
      if (ws.getCell('B1').isMerged) ds.mergeCells('B1:G2');
      const dated = buildDateLines(lines);
      dated.forEach((line, i) => {
        const row = ds.getRow(4 + i);
        for (let c = 1; c <= 8; c++) {
          const cell = row.getCell(c);
          cell.value = line && c <= 7 ? line[c - 1] : null;
          cell.style = clone(style4[c]);
        }
        if (height4) row.height = height4;
      });
    }

    // ── 실적 정리 시트
    const ss = wb.getWorksheet(SUMMARY_SHEET);
    const unmapped = [];
    if (ss) {
      ss.getCell('B2').value = `${year}년 ${month}월 안전망 실적`;
      const f2 = ss.getCell('F2');                       // 연도 칸 (숫자일 때만)
      if (/^\d{4}$/.test(cellText(f2.value).trim()) && !hasFormula(f2)) f2.value = typeof f2.value === 'number' ? year : String(year);
      const cS = 8 + 2 * (month - 1);
      // 소계·합계 칸: 1월 열(H·I)에 수식이 있는데 이번 달 칸에 수식이 없으면(누가 숫자로 덮어씀) 같은 모양의 수식으로 되돌림
      const colL = (n) => { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
      const rr = resolveRows(ss, month);
      notes.push(...rr.notes);
      const mappedRows = new Set(Object.values(rr.svc));
      for (let r = 4; r <= ss.rowCount; r++) {
        if (mappedRows.has(r)) continue;
        for (const [src, dst] of [[8, cS], [9, cS + 1]]) {
          const s = ss.getRow(r).getCell(src), d = ss.getRow(r).getCell(dst);
          const f = typeof s.formula === 'string' ? s.formula : null;
          if (!f || hasFormula(d) || isMergedSlave(s)) continue;
          const re = new RegExp(`(^|[^A-Z$])${colL(src)}(\\$?\\d+)`, 'g');
          d.value = { formula: f.replace(re, `$1${colL(dst)}$2`) };
          notes.push(`실적 정리 ${colL(dst)}${r}: 수식이 숫자로 덮여 있어서 다른 달과 같은 수식(=${d.value.formula})으로 되돌렸어요`);
        }
      }
      const put = (row, a, b) => {
        const R = ss.getRow(row);
        if (!hasFormula(R.getCell(cS))) R.getCell(cS).value = a;
        if (!hasFormula(R.getCell(cS + 1))) R.getCell(cS + 1).value = b;
        if (!hasFormula(R.getCell(4))) R.getCell(4).value = a;   // 당월 D
        if (!hasFormula(R.getCell(5))) R.getCell(5).value = b;   // 당월 E
      };
      for (const [k, row] of Object.entries(rr.svc)) {
        const v = agg[k] || [0, 0];
        put(row, v[0], v[1]);
      }
      // 직접 입력 줄: 적은 칸만 넣고, 비운 칸은 그대로 둠. 당월(D·E)은 이번 달 값으로 맞춤(지난달 값이 남지 않게)
      for (const m of manualValues || []) {
        const num = (x) => (x === '' || x == null ? null : Number(x));
        const R = ss.getRow(m.row);
        for (const [k, c, dc] of [['sessions', cS, 4], ['persons', cS + 1, 5]]) {
          if (!(k in m)) continue;                         // 병합·수식 칸이라 입력 칸이 없음
          const v = num(m[k]);
          if (v != null && !hasFormula(R.getCell(c))) R.getCell(c).value = v;
          if (!hasFormula(R.getCell(dc))) R.getCell(dc).value = v ?? (hasFormula(R.getCell(c)) ? R.getCell(dc).value : (typeof R.getCell(c).value === 'number' ? R.getCell(c).value : null));
        }
      }
      const mapped = new Set(Object.values(ROW_MAP));
      for (const k of Object.keys(agg)) if (!mapped.has(k)) unmapped.push({ key: k, sessions: agg[k][0], persons: agg[k][1] });
    }
    wb.calcProperties = { ...(wb.calcProperties || {}), fullCalcOnLoad: true };
    const buffer = await wb.xlsx.writeBuffer();
    return { buffer, lineCount: sessions.length, groupCount, unmapped, notes, fileName: `${year}년 ${month}월 안전망 실적.xlsx` };
  }

  /**
   * 실적 파일을 빈 양식으로: 목록·날짜순 시트 내용, '실적 정리'의 숫자(수식은 그대로)를 비움.
   * clearResidents=true 이면 이용자현황 명단도 비움(내장 양식용), false 면 명단은 남김(새해 시작용).
   */
  async function blankTemplate(file, { clearResidents = false, name = '빈 안전망 실적.xlsx' } = {}) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    for (const w of [...wb.worksheets]) if (/안전망 실적\s*\(\d+\)\s*$|_날짜순정렬$/.test(w.name)) wb.removeWorksheet(w.id);
    const list = wb.worksheets.find((w) => /안전망 실적$/.test(w.name)) || wb.worksheets[0];
    if (list) {
      list.name = '안전망 실적';
      for (let r = 4; r <= list.rowCount; r++) for (let c = 1; c <= 8; c++) {
        const cell = list.getRow(r).getCell(c); cell.value = null; if (r > 4) cell.style = {};
      }
    }
    const ss = wb.getWorksheet(SUMMARY_SHEET);
    if (ss) for (let r = 4; r <= ss.rowCount; r++) for (let c = 4; c <= 31; c++) {
      const cell = ss.getRow(r).getCell(c);
      if (!hasFormula(cell) && typeof cell.value === 'number') cell.value = null;
    }
    const rs = wb.getWorksheet(RESIDENT_SHEET);
    if (rs && clearResidents) {
      const R = readResidents(rs);
      if (R) {
        for (const m of Object.keys(rs._merges || {})) {          // 명단 쪽 병합(월 표시) 풀기
          const top = Number(String(rs._merges[m].range || m).replace(/^[A-Z]+/, '').split(':')[0]);
          if (rs._merges[m].top > R.hdr || top > R.hdr) rs.unMergeCells(rs._merges[m].range || m);
        }
        for (let r = R.hdr + 1; r <= rs.rowCount; r++) rs.getRow(r).eachCell({ includeEmpty: true }, (cell) => { cell.value = null; });
      }
    }
    wb.calcProperties = { ...(wb.calcProperties || {}), fullCalcOnLoad: true };
    return new File([await wb.xlsx.writeBuffer()], name);
  }

  /** 만들어진 실적 엑셀에서 이용자현황(입소일·퇴소일) 읽기 — 운영일지 재소 인원 계산용 */
  async function residentsFromBuffer(buffer) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const rs = wb.getWorksheet(RESIDENT_SHEET);
    const R = rs && readResidents(rs);
    return R ? R.left.map((e) => ({ name: e.name, inDate: e.inDate, end: e.end })) : [];
  }

  global.Step1 = { residentsFromBuffer, blankTemplate, isNamedPersonalFile, peekMonths, ROW_MAP, MANUAL_ROWS, parsePersonalName, isSummaryFileName, readPersonal, buildSessions, aggregate,
    buildListLines, inspectTemplate, buildWorkbook, detectMoves, cellText };
})(window);
