/* 아웃리치 파일(아웃리치[…].xlsx) → 실적 정리 숫자 + 운영일지 문장
   활동제목으로 종류를 나눔: 지역사회 연합아웃리치 / 서울시 연합 / 학교 / 사이버 */
(function (global) {
  'use strict';
  const text = (v) => (global.Step1 ? Step1.cellText(v) : String(v ?? '')).trim();

  // 지역사회 지역 → 일지 장소
  const REGION_PLACE = { 화곡: '강서구 볏골어린이공원', 고척: '구로구 고척근린공원', 금천: '금천구 독산동마을공원' };
  // 서울시·학교 활동제목 괄호 속 장소 → 전체 주소
  const PLACE_FULL = { 볏골어린이공원: '서울특별시 강서구 볏골어린이공원', 고척근린공원: '서울특별시 구로구 고척근린공원', 독산동마을공원: '서울특별시 금천구 독산동마을공원' };
  const TYPE_LABEL = { community: '지역사회', seoul: '서울시 연합', school: '학교', cyber: '사이버', unknown: '알 수 없음' };
  // 한 번 활동할 때 숫자 (사용자가 정한 규칙)
  const PER = { communityPeople: 50, promoCommunity: 50, promoSeoul: 200, school: 200, promoSchool: 200, cyber: 3 };

  const isOutreachFileName = (n) => /아웃리치/.test(n);

  function classify(title) {
    if (/사이버/.test(title)) return 'cyber';
    if (/서울시/.test(title)) return 'seoul';
    if (/학교/.test(title)) return 'school';
    if (/지역사회/.test(title)) return 'community';
    return 'unknown';
  }

  async function parseOutreach(file, year, month) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets[0];
    let hdr = 0; const col = {};
    for (let r = 1; r <= Math.min(15, ws.rowCount) && !hdr; r++) ws.getRow(r).eachCell((c) => { if (text(c.value) === '활동제목') hdr = r; });
    if (!hdr) throw new Error('아웃리치 파일에서 「활동제목」 머리글을 찾지 못했어요.');
    ws.getRow(hdr).eachCell((c, ci) => { const t = text(c.value); if (t && !(t in col)) col[t] = ci; });
    const ym = `${year}-${String(month).padStart(2, '0')}`;
    const acts = [], warnings = [];
    let skipped = 0;
    for (let r = hdr + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const title = text(row.getCell(col['활동제목']).value);
      if (!title) continue;
      const v = row.getCell(col['활동일자']).value;
      const date = v instanceof Date ? `${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, '0')}-${String(v.getUTCDate()).padStart(2, '0')}` : text(v);
      if (!date.startsWith(ym)) { skipped++; continue; }
      const type = classify(title);
      const paren = [...title.matchAll(/\(([^()]*)\)/g)].map((m) => m[1].trim());
      const a = { id: `${date}|${r}|${title}`, date, title, type, method: text(row.getCell(col['활동방법구분'] || 0).value || '') };
      if (type === 'community') {
        a.region = paren.find((p) => REGION_PLACE[p]) || paren.find((p) => !/상담인원/.test(p)) || '';
        a.place = REGION_PLACE[a.region] || '';
        const m = title.match(/상담인원\s*(\d+)\s*명/);
        a.counsel = m ? Number(m[1]) : 0;
        if (!a.place) warnings.push(`${date} 「${title}」: 모르는 지역${a.region ? `(${a.region})` : ''}이라 장소를 비웠어요 — 확인 필요`);
        if (!m) warnings.push(`${date} 「${title}」: 상담인원을 찾지 못해 0명으로 셌어요 — 확인 필요`);
      } else if (type === 'seoul') {
        const m = title.match(/제\s*(\d+)\s*회/);
        a.round = m ? m[1] : '';
        const p = paren[0] || '';
        a.place = PLACE_FULL[p] || p;
      } else if (type === 'school') {
        const p = paren[0] || '';
        a.place = PLACE_FULL[p] || p;
      } else if (type === 'cyber') {
        const ms = [...title.matchAll(/\((\d+)\s*명\)/g)];
        a.people = ms.length ? Number(ms[ms.length - 1][1]) : PER.cyber;
      } else warnings.push(`${date} 「${title}」: 어떤 아웃리치인지 몰라서 뺐어요 — 확인 필요`);
      acts.push(a);
    }
    acts.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
    if (skipped) warnings.push(`${month}월이 아닌 아웃리치 ${skipped}건은 뺐어요`);
    return { acts, warnings };
  }

  /** 실적 정리 직접입력 줄(번호=원래 줄)에 들어갈 숫자. null = 사람이 직접 */
  function summaryCounts(acts, edits = {}) {
    const by = (t) => acts.filter((a) => a.type === t);
    const com = by('community'), seoul = by('seoul'), school = by('school'), cyber = by('cyber');
    const counsel = com.reduce((s, a) => s + Number(edits[a.id]?.counsel ?? a.counsel ?? 0), 0);
    const cyberPeople = cyber.reduce((s, a) => s + Number(edits[a.id]?.people ?? a.people ?? PER.cyber), 0);
    return {
      61: [com.length, com.length * PER.communityPeople],                    // 지역사회 / 참여청소년
      62: [null, counsel],                                                   // 지역사회 / 청소년 상담 (회기 칸은 61과 합쳐짐)
      64: [seoul.length, null],                                              // 서울시 연합 / 참여 청소년 (인원은 직접)
      65: [school.length, school.length * PER.school],                       // 학교 / 참여 청소년
      66: [cyber.length, cyberPeople],                                       // 사이버아웃리치
      77: [com.length + seoul.length + school.length,                        // 홍보사업
        com.length * PER.promoCommunity + seoul.length * PER.promoSeoul + school.length * PER.promoSchool],
    };
  }

  /** 날짜별 일지 줄: { 'YYYY-MM-DD': { 상담정서지원: [...], 기타사업: [...] } } */
  function logLines(acts, edits = {}) {
    const out = {};
    const add = (d, sec, lines) => { ((out[d] ||= {})[sec] ||= []).push(...lines); };
    for (const a of acts) {
      const e = { ...a, ...(edits[a.id] || {}) };
      const 기관 = e.orgs || '', 프로그램 = e.program || '';
      if (a.type === 'community') {
        add(a.date, '상담정서지원', ['* 지역사회 연합아웃리치', `  - 장소 : ${e.place || ''}`, `  - 활동내용 : 상담 ${Number(e.counsel || 0)}명, 프로그램(${프로그램}), 홍보 등`, `  - 참석기관 : ${기관}`]);
        add(a.date, '기타사업', [`* 홍보사업 – 아웃리치 홍보물품 키트(리플릿, 간식 등) ${PER.promoCommunity}개 배포`]);
      } else if (a.type === 'seoul') {
        add(a.date, '상담정서지원', [`* ${e.round ? `제${e.round}회 ` : ''}서울시 청소년시설 연합아웃리치`, `  - 장소 : ${e.place || ''}`, `  - 활동내용 : 상담, 프로그램(${프로그램}), 홍보 등`, `  - 참석기관 : ${기관}`]);
        add(a.date, '기타사업', [`* 홍보사업 – 서울시 연합아웃리치 홍보물품 키트(리플릿, 간식 등) ${PER.promoSeoul}개 배포`]);
      } else if (a.type === 'school') {
        add(a.date, '상담정서지원', ['* 지역사회 연합 학교 아웃리치', `  - 장소 : ${e.place || ''}`, `  - 활동내용 : 프로그램(${프로그램}), 홍보 등`, `  - 참석기관 : ${기관}`]);
        add(a.date, '기타사업', [`* 홍보사업 – 학교 아웃리치 홍보물품 키트(리플릿, 간식 등) ${PER.promoSchool}개 배포`]);
      } else if (a.type === 'cyber') {
        add(a.date, '상담정서지원', [`* 사이버 아웃리치 - 페이스북 댓글 ${Number(e.people ?? PER.cyber)}명`]);
      }
    }
    return out;
  }

  global.Outreach = { isOutreachFileName, parseOutreach, summaryCounts, logLines, TYPE_LABEL, REGION_PLACE, PER };
})(window);
