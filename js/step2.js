/* 2단계: 실적 기록 → 쉼터 운영일지(.hwpx)
   .hwpx = zip 안의 XML. 날짜별 표(하루 1개)를 찾아 칸 내용을 바꿉니다. 모든 처리는 브라우저 안에서만. */
(function (global) {
  'use strict';
  const HP = 'http://www.hancom.co.kr/hwpml/2011/paragraph';

  // ── 설정: 서비스 → 일지 영역 ───────────────────────────────
  const SECTION_OF = {
    보호사업: ['활동관련비용지원', '이미용서비스', '건강검진', '건강관리', '의약품·의약외품', '진단및치료', '영양제지원', '가족회의', '오!해피데이', '생활안전교육', '법률구제지원'],
    교육지원: ['검정고시', '기초학습', '학업지원', '학업관련비용지원', '특기적성교육지원', '검정고시학업지원', '인성교육', '인권교육', '약물중독예방', '도박중독예방교육', '생명존중교육', '성교육'],
    자립지원: ['취업', '홀로서기', '직업여행기', '이미지메이킹', '자립지원교육', '우리가주인', '집밥요리교실', '가정복귀지원'],
    상담정서지원: ['개인상담-대면', '개인상담-전화', '개인상담-사이버', '개인상담-외부기관', '가족상담', '심리검사', '연극치료', '집단미술치료', '인터넷중독예방', '너,나우리집단상담', '마음놀이터', '반갑다친구야'],
    청소년활동지원: ['신나는문화콘서트', '우리함께놀자', '청춘여행기', '멘토링', '우리들의기념일', '가족여행', '계절나들이', '체육활동'],
  };
  // 일지에 쓸 때 앞에 붙이는 이름 (제목에 이미 '○○_' 가 있으면 제목 그대로 씀)
  const LABEL = {
    '의약품·의약외품': '의약품 지원', '진단및치료': '진단 및 치료', '이미용서비스': '이미용 서비스', '활동관련비용지원': '',
    '학업지원': '', '특기적성교육지원': '특기적성 교육지원', '검정고시학업지원': '검정고시 학습지도', '취업': '출근지도',
  };
  // 매일 반복이라 일지에 안 쓰는 서비스
  const SKIP = new Set(['우리가주인']);
  // 정해진 문장으로 쓰는 서비스
  const FIXED = { '영양제지원': '영양제 지급 - 입소생들의 영양균형 및 성장을 위해 유산균 및 멀티 비타민 제공' };
  // 내용을 비우는 칸 (개인 파일에 없는 정보 — 직접 입력)
  const CLEAR_ROWS = ['대외지원', '후원'];

  const keyToSection = {};
  for (const [sec, keys] of Object.entries(SECTION_OF)) keys.forEach((k) => (keyToSection[k] = sec));
  const DOW = ['일', '월', '화', '수', '목', '금', '토'];
  const pad2 = (n) => String(n).padStart(2, '0');
  const ord = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const svcDisplay = (svc) => svc.replace(/^\(공통서비스\)_/, '');
  const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim();

  function itemText(s) {
    const t = clean(s.title);
    const label = s.key in LABEL ? LABEL[s.key] : svcDisplay(s.svc);
    const u = t.indexOf('_');
    if (u > 0 && u <= 15) return t;                        // '기초학습_…', '홀로서기_…' 처럼 이미 머리말이 있음
    if (!label || t.replace(/\s/g, '').startsWith(label.replace(/\s/g, ''))) return t;
    return `${label}_${t}`;
  }
  // 상담 대상: '영원중학교 담임선생님_조퇴 건' → '영원중학교 담임선생님'
  function target(title) {
    const t = clean(title).replace(/^\(외부기관\s*상담\)\s*/, '');
    const m = t.split(/_| - | – /)[0].trim();
    return m || t;
  }

  /** '홀로서기_A', '홀로서기_B' → '홀로서기_A, B' (같은 머리말이 이어지면 한 번만) */
  function joinItems(items) {
    let prev = null;
    return items.map((it) => {
      const m = it.match(/^([^_]{1,15})_(.+)$/);
      const head = m ? m[1] : null;
      const s = head && head === prev ? m[2] : it;
      prev = head;
      return s;
    }).join(', ');
  }

  /** 하루치 회기 → 영역별 문장 */
  function dayLines(daySessions) {
    const out = { 보호사업: [], 교육지원: [], 자립지원: [], 상담정서지원: [], 청소년활동지원: [], 기타사업: [] };
    const unknown = new Set();
    const list = [...daySessions].sort((a, b) => ord(a.time, b.time));
    const personItems = {}; // section -> Map(name -> [items])
    const groupLines = {};
    const counsel = { 가족상담: new Map(), 대면: [], 전화: new Map(), 사이버: new Map(), 외부기관: new Map() };
    const addPerson = (sec, name, text) => {
      const m = (personItems[sec] ||= new Map());
      if (!m.has(name)) m.set(name, []);
      if (!m.get(name).includes(text)) m.get(name).push(text);
    };
    for (const s of list) {
      if (SKIP.has(s.key)) continue;
      let sec = keyToSection[s.key];
      if (!sec) { sec = '기타사업'; unknown.add(s.key); }
      if (FIXED[s.key]) { if (!out[sec].includes(` * ${FIXED[s.key]}`)) out[sec].push(` * ${FIXED[s.key]}`); continue; }
      const people = s.people || [s.name];
      if (s.key === '가족상담') { const t = target(s.title); counsel.가족상담.set(t, (counsel.가족상담.get(t) || 0) + 1); continue; }
      if (s.key === '개인상담-대면') { if (!counsel.대면.includes(s.name)) counsel.대면.push(s.name); continue; }
      const kind = { '개인상담-전화': '전화', '개인상담-사이버': '사이버', '개인상담-외부기관': '외부기관' }[s.key];
      if (kind) {
        const m = counsel[kind]; if (!m.has(s.name)) m.set(s.name, { targets: [], n: 0 });
        const e = m.get(s.name); e.n++; const t = target(s.title); if (!e.targets.includes(t)) e.targets.push(t);
        continue;
      }
      if (people.length > 1) (groupLines[sec] ||= []).push(` * ${itemText(s)} (${people.length}명)`);
      else addPerson(sec, people[0], itemText(s));
    }
    // 상담정서지원 머리 줄
    const c = [];
    if (counsel.가족상담.size) c.push(` * 가족상담 – ${[...counsel.가족상담].map(([t, n]) => (n > 1 ? `${t}(${n}회)` : t)).join(', ')}`);
    if (counsel.대면.length) c.push(` * 대면상담 – ${counsel.대면.join(', ')}`);
    for (const [kind, label] of [['전화', '전화상담'], ['사이버', '사이버상담'], ['외부기관', '외부기관상담']]) {
      if (!counsel[kind].size) continue;
      c.push(` * ${label} – ${[...counsel[kind]].map(([name, e]) => {
        const ts = e.targets.filter((t) => t !== name);          // 본인과 한 상담이면 대상 대신 이름만
        return ts.length ? `${ts.join(', ')}(${name}${e.n > 1 ? ` ${e.n}회` : ''})` : `${name}${e.n > 1 ? `(${e.n}회)` : ''}`;
      }).join(', ')}`);
    }
    out.상담정서지원.push(...c);
    for (const sec of Object.keys(out)) {
      out[sec].push(...(groupLines[sec] || []));
      for (const [name, items] of personItems[sec] || []) out[sec].push(` * ${name} – ${joinItems(items)}`);
    }
    return { lines: out, unknown: [...unknown] };
  }

  // ── XML 도우미 ─────────────────────────────────────────────
  const kids = (el, name) => [...el.children].filter((e) => e.localName === name);
  const textOf = (p) => [...p.getElementsByTagNameNS(HP, 't')].map((t) => t.textContent).join('');
  const isTextPara = (p) => textOf(p).trim().length > 0;

  function dropLineSegs(p) { kids(p, 'linesegarray').forEach((e) => e.remove()); }

  function setParaText(p, text) {
    const ts = [...p.getElementsByTagNameNS(HP, 't')].filter((t) => t.parentElement.parentElement === p);
    if (ts.length) {
      ts[0].textContent = text;
      ts.slice(1).forEach((t) => t.remove());
    } else if (text) {
      const runs = kids(p, 'run');
      const run = runs[runs.length - 1] || p.insertBefore(p.ownerDocument.createElementNS(HP, 'hp:run'), p.firstChild);
      const t = p.ownerDocument.createElementNS(HP, 'hp:t'); t.textContent = text; run.appendChild(t);
    }
    dropLineSegs(p);
  }

  function cellsOf(tbl) {
    return [...tbl.getElementsByTagNameNS(HP, 'tc')].map((tc) => {
      const a = kids(tc, 'cellAddr')[0], s = kids(tc, 'cellSpan')[0];
      const sub = kids(tc, 'subList')[0];
      const ps = sub ? kids(sub, 'p') : [];
      return { tc, sub, ps, row: +a.getAttribute('rowAddr'), col: +a.getAttribute('colAddr'), rs: +s.getAttribute('rowSpan'), text: ps.map(textOf).join('\n') };
    });
  }

  /** 칸 내용을 줄 목록으로 바꿈 (서식은 기존 문단을 본뜸) */
  function setCellLines(cell, lines, fallbackTpl) {
    const tpl = cell.ps.find(isTextPara) || fallbackTpl || cell.ps[0];
    if (!lines.length) {
      cell.ps.slice(1).forEach((p) => p.remove());
      setParaText(cell.ps[0], '');
      cell.ps = [cell.ps[0]];
      return;
    }
    const doc = cell.sub.ownerDocument;
    const textRun = kids(tpl, 'run').find((r) => kids(r, 't').some((t) => t.textContent.includes('*'))) || kids(tpl, 'run').slice(-1)[0];
    const charPr = textRun ? textRun.getAttribute('charPrIDRef') : '0';
    const fresh = lines.map((line, i) => {
      const p = tpl.cloneNode(false);              // 문단 속성만 복사
      p.setAttribute('id', i === 0 ? (tpl.getAttribute('id') || '0') : '0');
      const run = doc.createElementNS(HP, 'hp:run'); run.setAttribute('charPrIDRef', charPr);
      const t = doc.createElementNS(HP, 'hp:t'); t.textContent = line;
      run.appendChild(t); p.appendChild(run);
      return p;
    });
    cell.ps.forEach((p) => p.remove());
    fresh.forEach((p) => cell.sub.appendChild(p));
    cell.ps = fresh;
  }

  const norm = (s) => s.replace(/\s/g, '');

  /** 표 하나(하루) 채우기 */
  function fillDay(tbl, info, fallbackTpl) {
    const cells = cellsOf(tbl);
    const at = (r, c) => cells.find((x) => x.row === r && x.col === c);
    const label = (name) => cells.find((x) => x.col === 0 && norm(x.text).startsWith(name));
    const warn = [];

    const res = label('입소생');
    if (res) {
      const p = res.ps.find((q) => /\(총/.test(textOf(q)));
      if (p) setParaText(p, textOf(p).replace(/\(총\s*\d*\s*명\)/, `(총 ${info.residents.length} 명)`));
      const names = at(res.row, 1); if (names) setCellLines(names, [` ${info.residents.join(', ')}`], names.ps[0]);
      const io = at(res.row + res.rs - 1, 1);
      const who = (list) => (list.length ? `${list.length}(${list.join(', ')})` : '0');
      if (io && io !== names) setParaText(io.ps[0], textOf(io.ps[0])
        .replace(/입소\s*:\s*\d+(\([^)]*\))?/, `입소 : ${who(info.admitNames)}`)
        .replace(/퇴소\s*:\s*\d+(\([^)]*\))?/, `퇴소 : ${who(info.leaveNames)}`));
    } else warn.push('입소생 칸을 찾지 못함');

    const sections = [['보호사업', '보호사업'], ['교육지원', '교육지원'], ['자립지원', '자립지원'], ['상담정서지원', '상담정서지원'], ['청소년활동지원', '청소년활동지원'], ['기타사업', '기타사업']];
    for (const [lab, key] of sections) {
      const L = label(lab);
      if (!L) { if (info.lines[key]?.length) warn.push(`'${lab}' 칸을 찾지 못해 ${info.lines[key].length}줄을 못 넣음`); continue; }
      const content = at(L.row + L.rs - 1, 1);
      if (!content) continue;
      if (lab === '보호사업') {           // 식사·잠자리·목욕·세탁 인원
        for (const x of cells) if (x.row >= L.row && x.row < L.row + L.rs - 1 && x.col >= 1)
          for (const p of x.ps) if (/\d+\s*명/.test(textOf(p))) setParaText(p, textOf(p).replace(/\d+(\s*명)/, `${info.residents.length}$1`));
      }
      setCellLines(content, info.lines[key] || [], fallbackTpl);
    }
    for (const lab of CLEAR_ROWS) {
      const L = label(lab); const content = L && at(L.row + L.rs - 1, 1);
      if (content) setCellLines(content, [], fallbackTpl);
    }
    const SL = label('근무자');
    if (SL && (info.clearStaff || info.staff)) {
      const staffCells = cells.filter((x) => x.row >= SL.row && x.row < SL.row + SL.rs && x.col === 2).sort((a, b) => a.row - b.row);
      if (info.clearStaff) staffCells.forEach((x) => setCellLines(x, [], fallbackTpl));
      if (info.staff) {
        // '주간' 이름표 범위 안의 칸 = [주간, 중간], '야간' 이름표 줄의 칸 = 야간
        const night = cells.find((x) => x.col === 1 && norm(x.text) === '야간');
        const dayLab = cells.find((x) => x.col === 1 && norm(x.text) === '주간');
        const inDay = dayLab ? staffCells.filter((x) => x.row >= dayLab.row && x.row < dayLab.row + dayLab.rs) : staffCells.slice(0, 2);
        const nightCell = night ? staffCells.find((x) => x.row === night.row) : staffCells[2];
        const put = (cell, line) => cell && setCellLines(cell, line ? [line] : [], cell.ps.find(isTextPara) || fallbackTpl);
        put(inDay[0], info.staff.day); put(inDay[1], info.staff.mid); put(nightCell, info.staff.night);
      }
    }
    if (!fitRows(tbl, cells, label, at)) warn.push('내용이 많아 다음 쪽으로 넘어갈 수 있어요');
    return warn;
  }

  // ── 하루 1쪽 유지: 표 전체 높이는 그대로 두고, 내용 칸 높이를 줄 수에 맞춰 나눔 ──
  const LINE_H = 1600, GAP = 600, CELL_PAD = 282 + 200;
  function textWidth(s) {
    let w = 0;
    for (const ch of s) w += /[ᄀ-ᇿ　-鿿가-힯＀-￯–—·]/.test(ch) ? 1000 : 550;
    return w;
  }
  function needHeight(cell) {
    const sz = kids(cell.tc, 'cellSz')[0]; const width = (+sz.getAttribute('width') || 39491) - 400;
    const lines = cell.ps.reduce((n, p) => n + Math.max(1, Math.ceil((textWidth(textOf(p)) * 1.05) / width)), 0);
    return lines * LINE_H - GAP + CELL_PAD;
  }
  function fitRows(tbl, cells, label, at) {
    const labs = ['보호사업', '교육지원', '자립지원', '상담정서지원', '청소년활동지원', '기타사업', '대외지원', '후원'];
    const rows = [];
    for (const lab of labs) {
      const L = label(lab); const content = L && at(L.row + L.rs - 1, 1);
      if (!content) continue;
      const sz = kids(content.tc, 'cellSz')[0];
      // 이름표 칸('청소년 / 활동지원'처럼 두 줄)보다 낮아지면 한글이 줄을 다시 늘려 쪽이 넘침
      const labelNeed = L.rs === 1 ? L.ps.length * 1760 - 660 + CELL_PAD : 0;
      rows.push({ L, content, sz, h: +sz.getAttribute('height'), need: Math.max(needHeight(content), labelNeed) });
    }
    if (!rows.length) return true;
    const budget = Math.floor(rows.reduce((a, r) => a + r.h, 0) * 0.98);   // 2% 여유
    const needSum = rows.reduce((a, r) => a + r.need, 0);
    const fits = needSum <= budget;
    const extra = Math.max(0, budget - needSum);
    let assigned = 0;
    rows.forEach((r, i) => {
      r.nh = i === rows.length - 1 && fits ? budget - assigned : Math.round(r.need + extra * (r.h / budget));
      assigned += r.nh;
    });
    for (const r of rows) {
      const delta = r.nh - r.h;
      if (!delta) continue;
      r.sz.setAttribute('height', String(r.nh));
      // 같은 줄의 이름표 칸(또는 여러 줄을 합친 이름표 칸)도 같이 늘이고 줄임
      const lsz = kids(r.L.tc, 'cellSz')[0];
      lsz.setAttribute('height', String(+lsz.getAttribute('height') + delta));
    }
    if (!fits) { // 넘칠 때는 표 전체 높이도 늘림
      const tsz = kids(tbl, 'sz')[0];
      if (tsz) tsz.setAttribute('height', String(+tsz.getAttribute('height') + (assigned - budget)));
    }
    return fits;
  }

  /** 날짜별 재소 인원: 입소일 ≤ 날짜 < 퇴소일 (퇴소 당일은 빠짐) */
  function residentsOn(residents, ds, daySessions) {
    if (residents.length) {
      const inn = residents.filter((e) => e.inDate <= ds && (!e.end || ds < e.end)).sort((a, b) => ord(a.inDate, b.inDate));
      return [...new Set(inn.map((e) => e.name))];
    }
    return [...new Set(daySessions.flatMap((s) => s.people || [s.name]))];
  }

  /** 운영일지 만들기 */
  async function buildLog(hwpxFile, sessions, residents, year, month, opts = {}) {
    const zip = await JSZip.loadAsync(await hwpxFile.arrayBuffer());
    const secPath = Object.keys(zip.files).filter((n) => /^Contents\/section\d+\.xml$/i.test(n)).sort()[0];
    if (!secPath) throw new Error('hwpx 안에서 본문(section0.xml)을 찾지 못했어요. 한글에서 .hwpx로 저장한 파일인지 확인해 주세요.');
    const xmlText = await zip.file(secPath).async('string');
    const decl = (xmlText.match(/^<\?xml[^>]*\?>/) || ['<?xml version="1.0" encoding="UTF-8" standalone="yes" ?>'])[0];
    const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('일지 파일의 XML을 읽지 못했어요.');
    const root = doc.documentElement;

    // 하루 = [제목 문단?] + 날짜 문단 + 표 문단
    const paras = kids(root, 'p');
    const groups = [];
    paras.forEach((p, i) => {
      const tbl = p.getElementsByTagNameNS(HP, 'tbl')[0];
      if (!tbl) return;
      const g = { tblP: p, tbl, nodes: [p] };
      const d = paras[i - 1];
      if (d && /요일/.test(textOf(d))) { g.dateP = d; g.nodes.unshift(d);
        const h = paras[i - 2];
        if (h && /운\s*영\s*일\s*지/.test(textOf(h)) && !groups.some((x) => x.nodes.includes(h))) g.nodes.unshift(h);
      }
      groups.push(g);
    });
    if (!groups.length) throw new Error('일지 안에서 날짜별 표를 찾지 못했어요.');

    // 날짜 수 맞추기
    const days = new Date(year, month, 0).getDate();
    const notes = [];
    while (groups.length > days) {
      const g = groups.pop();
      g.nodes.forEach((n) => { if (!n.getElementsByTagNameNS(HP, 'secPr').length) n.remove(); });
    }
    while (groups.length < days) {
      const last = groups[groups.length - 1];
      const clones = last.nodes.map((n) => n.cloneNode(true));
      clones.forEach((n) => n.getElementsByTagNameNS(HP, 'secPr').length && [...n.getElementsByTagNameNS(HP, 'secPr')].forEach((s) => s.remove()));
      let ref = last.nodes[last.nodes.length - 1].nextSibling;
      clones.forEach((n) => root.insertBefore(n, ref));
      const tblP = clones.find((n) => n.getElementsByTagNameNS(HP, 'tbl').length);
      const tbl = tblP.getElementsByTagNameNS(HP, 'tbl')[0];
      tbl.setAttribute('id', String(1000000000 + Math.floor(Math.random() * 999999999)));
      groups.push({ tblP, tbl, nodes: clones, dateP: clones.find((n) => n !== tblP && /요일/.test(textOf(n))) });
      notes.push(`표가 모자라서 ${groups.length}일 표를 추가했어요`);
    }

    // 다른 칸에서 쓸 기본 문단 서식(빈 칸에 내용을 넣을 때)
    let fallbackTpl = null;
    for (const c of cellsOf(groups[0].tbl)) {
      if (c.col === 1 && c.ps.some((p) => textOf(p).includes('*'))) { fallbackTpl = c.ps.find((p) => textOf(p).includes('*')).cloneNode(true); break; }
    }

    const byDate = new Map();
    for (const s of sessions) { if (!byDate.has(s.date)) byDate.set(s.date, []); byDate.get(s.date).push(s); }
    const unknownAll = new Set();
    const summary = [];
    groups.forEach((g, i) => {
      const d = i + 1, ds = `${year}-${pad2(month)}-${pad2(d)}`;
      const dow = DOW[new Date(year, month - 1, d).getDay()];
      if (g.dateP) setParaText(g.dateP, textOf(g.dateP).replace(/\d{4}\s*년(\s*)\d{1,2}\s*월(\s*)\d{1,2}\s*일(\s*)\S\s*요일/, `${year}년$1${month}월$2${d}일$3${dow}요일`));
      const daySessions = byDate.get(ds) || [];
      const { lines, unknown } = dayLines(daySessions);
      unknown.forEach((u) => unknownAll.add(u));
      const info = {
        residents: residentsOn(residents, ds, daySessions), lines,
        admitNames: residents.filter((e) => e.inDate === ds).map((e) => e.name),
        leaveNames: residents.filter((e) => e.end === ds).map((e) => e.name),
      };
      info.admit = info.admitNames.length; info.leave = info.leaveNames.length;
      info.clearStaff = !!opts.clearStaff;
      if (opts.roster) info.staff = global.Roster.staffLines(opts.roster[ds]);
      const w = fillDay(g.tbl, info, fallbackTpl);
      w.forEach((x) => notes.push(`${d}일: ${x}`));
      summary.push({ date: ds, dow, residents: info.residents.length, lines: Object.values(lines).reduce((a, l) => a + l.length, 0), info });
    });
    if (unknownAll.size) notes.push(`일지 영역이 정해지지 않은 서비스는 '기타사업'에 넣었어요: ${[...unknownAll].join(', ')}`);

    const outXml = decl + new XMLSerializer().serializeToString(doc).replace(/^<\?xml[^>]*\?>\s*/, '');
    // 다시 압축: mimetype 은 맨 앞, 압축 없이
    const out = new JSZip();
    const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
    if (zip.file('mimetype')) out.file('mimetype', await zip.file('mimetype').async('uint8array'), { compression: 'STORE' });
    for (const n of names) {
      if (n === 'mimetype') continue;
      if (n === secPath) out.file(n, outXml, { compression: 'DEFLATE' });
      else out.file(n, await zip.file(n).async('uint8array'), { compression: 'DEFLATE' });
    }
    const blob = await out.generateAsync({ type: 'blob', mimeType: 'application/hwp+zip' });
    return { blob, notes, summary, fileName: `쉼터운영일지 ${year} ${month}월.hwpx` };
  }

  global.Step2 = { buildLog, dayLines, SECTION_OF, LABEL, SKIP, FIXED };
})(window);
