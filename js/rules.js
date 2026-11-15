/* 운영일지 작성 규칙: 서비스마다 「들어갈 칸」과 「문장 형식」.
   화면에서 고칠 수 있고, 이 PC 브라우저에 저장됩니다. 기본값 = 지금까지의 일지 작성 방식. */
(function (global) {
  'use strict';
  const SECTIONS = ['보호사업', '교육지원', '자립지원', '상담정서지원', '청소년활동지원', '기타사업'];
  const EXTRA_SECTIONS = [...SECTIONS, '대외지원', '후원'];
  const SKIP = '넣지 않음';
  const STORE_KEY = 'shelter-log-rules-v1';

  // [키, 화면 이름, 칸, 문장 형식]
  const DEFAULT_SERVICES = [
    ['영양제지원', '영양제지원', '보호사업', '* 영양제 지급 - 입소생들의 영양균형 및 성장을 위해 유산균 및 멀티 비타민 제공'],
    ['활동관련비용지원', '(공통서비스)_활동 관련 비용지원', '보호사업', '{제목}'],
    ['이미용서비스', '이미용서비스', '보호사업', '이미용 서비스_{제목}'],
    ['건강검진', '(공통서비스)_건강검진', '보호사업', '{서비스}_{제목}'],
    ['건강관리', '(공통서비스)_건강관리', '보호사업', '{서비스}_{제목}'],
    ['의약품·의약외품', '(공통서비스)_의약품·의약외품', '보호사업', '의약품 지원_{제목}'],
    ['진단및치료', '(공통서비스)_진단 및 치료', '보호사업', '진단 및 치료_{제목}'],
    ['가족회의', '가족회의', '보호사업', '{서비스}_{제목}'],
    ['오!해피데이', '오!해피데이', '보호사업', '{서비스}_{제목}'],
    ['생활안전교육', '생활안전교육', '보호사업', '{서비스}_{제목}'],
    ['법률구제지원', '법률구제지원', '보호사업', '{서비스}_{제목}'],
    ['학업지원', '학업지원', '교육지원', '{제목}'],
    ['기초학습', '(공통서비스)_기초학습', '교육지원', '{서비스}_{제목}'],
    ['검정고시', '(공통서비스)_검정고시', '교육지원', '{서비스}_{제목}'],
    ['검정고시학업지원', '검정고시 학업지원', '교육지원', '검정고시 학습지도_{제목}'],
    ['특기적성교육지원', '특기적성 교육지원', '교육지원', '특기적성 교육지원_{제목}'],
    ['학업관련비용지원', '학업관련비용 지원', '교육지원', '{서비스}_{제목}'],
    ['인성교육', '인성교육', '교육지원', '{서비스}_{제목}'],
    ['인권교육', '인권교육', '교육지원', '{서비스}_{제목}'],
    ['약물중독예방', '약물중독예방', '교육지원', '{서비스}_{제목}'],
    ['도박중독예방교육', '도박중독예방교육', '교육지원', '{서비스}_{제목}'],
    ['생명존중교육', '생명존중교육', '교육지원', '{서비스}_{제목}'],
    ['성교육', '성교육', '교육지원', '{서비스}_{제목}'],
    ['취업', '(공통서비스)_취업', '자립지원', '출근지도_{제목}'],
    ['홀로서기', '홀로서기', '자립지원', '{서비스}_{제목}'],
    ['가정복귀지원', '가정복귀지원', '자립지원', '{서비스}_{제목}'],
    ['직업여행기', '직업여행기', '자립지원', '{서비스}_{제목}'],
    ['이미지메이킹', '이미지메이킹', '자립지원', '{서비스}_{제목}'],
    ['자립지원교육', '자립지원교육', '자립지원', '{서비스}_{제목}'],
    ['집밥요리교실', '집밥요리교실', '자립지원', '{서비스}_{제목}'],
    ['우리가주인', '우리가 주인', SKIP, '{서비스}_{제목}'],
    ['가족상담', '(공통서비스)_가족상담', '상담정서지원', '* 가족상담 – {대상목록}'],
    ['개인상담-대면', '(공통서비스)_개인상담 · 대면', '상담정서지원', '* 대면상담 – {이름들}'],
    ['개인상담-전화', '(공통서비스)_개인상담 · 전화', '상담정서지원', '* 전화상담 – {목록}'],
    ['개인상담-사이버', '(공통서비스)_개인상담 · 문자·사이버', '상담정서지원', '* 사이버상담 – {목록}'],
    ['개인상담-외부기관', '(공통서비스)_개인상담 · 외부기관', '상담정서지원', '* 외부기관상담 – {목록}'],
    ['심리검사', '(공통서비스)_심리검사', '상담정서지원', '{서비스}_{제목}'],
    ['마음놀이터', '마음놀이터', '상담정서지원', '{서비스}_{제목}'],
    ['반갑다친구야', '반갑다 친구야', '상담정서지원', '{서비스}_{제목}'],
    ['연극치료', '연극치료', '상담정서지원', '{서비스}_{제목}'],
    ['집단미술치료', '집단미술치료', '상담정서지원', '{서비스}_{제목}'],
    ['인터넷중독예방', '인터넷 중독예방', '상담정서지원', '{서비스}_{제목}'],
    ['너,나우리집단상담', '너, 나 우리 집단상담', '상담정서지원', '{서비스}_{제목}'],
    ['신나는문화콘서트', '신나는 문화콘서트', '청소년활동지원', '{서비스}_{제목}'],
    ['멘토링', '멘토링', '청소년활동지원', '{서비스}_{제목}'],
    ['우리들의기념일', '우리들의 기념일', '청소년활동지원', '{서비스}_{제목}'],
    ['우리함께놀자', '우리함께 놀자', '청소년활동지원', '{서비스}_{제목}'],
    ['청춘여행기', '청춘여행기', '청소년활동지원', '{서비스}_{제목}'],
    ['가족여행', '가족여행', '청소년활동지원', '{서비스}_{제목}'],
    ['계절나들이', '계절나들이', '청소년활동지원', '{서비스}_{제목}'],
    ['체육활동', '(공통서비스)_체육활동', '청소년활동지원', '{서비스}_{제목}'],
  ];
  const DEFAULT_COMMON = {
    personLine: '* {이름} – {항목들}',
    groupLine: '* {항목} ({인원}명)',
    staffLine: '{이름들} ({시작}시 ~ {끝}시)',
  };
  // 자리표시 설명 (화면 버튼용)
  const TOKENS = {
    item: [['이름', '받은 사람'], ['제목', '서비스 제공제목'], ['서비스', '서비스 이름'], ['시간', '서비스제공시간'], ['방식', '제공방식'], ['인원', '단체일 때 인원']],
    agg: [['이름들', '그날 받은 사람들'], ['목록', '대상(이름 n회) 목록'], ['대상목록', '대상(n회) 목록'], ['횟수', '그날 건수']],
    personLine: [['이름', '사람'], ['항목들', '그 사람의 항목들']],
    groupLine: [['항목', '서비스 문장'], ['인원', '인원']],
    staffLine: [['이름들', '근무자들'], ['시작', '시작 시각'], ['끝', '끝 시각']],
  };

  const keyOf = (svc) => String(svc).replace(/^\(공통서비스\)_/, '').replace(/\s/g, '');
  const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim();
  const fill = (fmt, vars) => String(fmt).replace(/\{([^{}]+)\}/g, (m, k) => (k in vars ? vars[k] : m));
  const hasAny = (fmt, names) => names.some((n) => String(fmt).includes(`{${n}}`));
  const isFixed = (fmt) => !/\{[^{}]+\}/.test(String(fmt));
  const isAggregate = (fmt) => hasAny(fmt, ['이름들', '목록', '대상목록', '횟수']);

  function defaults() {
    const services = {};
    for (const [key, name, section, format] of DEFAULT_SERVICES) services[key] = { name, section, format };
    return { version: 1, services, ...DEFAULT_COMMON, extras: [] };
  }

  /** 저장된 규칙 + 기본값(새로 생긴 기본 서비스는 자동 추가) */
  function load() {
    const d = defaults();
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (saved && saved.version === 1) return merge(d, saved);
    } catch { /* 저장소를 못 쓰는 환경이면 기본값 */ }
    return d;
  }
  function merge(d, s) {
    return {
      version: 1,
      services: { ...d.services, ...(s.services || {}) },
      personLine: s.personLine ?? d.personLine, groupLine: s.groupLine ?? d.groupLine, staffLine: s.staffLine ?? d.staffLine,
      extras: Array.isArray(s.extras) ? s.extras : [],
    };
  }
  function save(rules) { try { localStorage.setItem(STORE_KEY, JSON.stringify(rules)); return true; } catch { return false; } }
  function isDefault(rules, key) {
    const d = defaults().services[key], r = rules.services[key];
    return !!d && !!r && d.section === r.section && d.format === r.format;
  }
  function changedCount(rules) {
    const d = defaults();
    let n = 0;
    for (const k of Object.keys(rules.services)) if (!d.services[k] || !isDefault(rules, k)) n++;
    for (const k of ['personLine', 'groupLine', 'staffLine']) if (rules[k] !== d[k]) n++;
    return n;
  }

  /** 기록 한 건의 문장. '○○_{제목}'인데 제목에 이미 '머리말_'이 있으면 제목만 씀 */
  function itemText(fmt, s) {
    const title = clean(s.title);
    const vars = { 이름: s.name, 제목: title, 서비스: String(s.svc || '').replace(/^\(공통서비스\)_/, ''), 시간: s.time || '', 방식: s.mode || '', 인원: String((s.people || []).length || 1) };
    const m = String(fmt).match(/^(.*?)_\{제목\}(.*)$/);   // '머리말_{제목}뒤' 모양
    if (m) {
      const head = fill(m[1], vars).trim(), tail = fill(m[2], vars);
      const u = title.indexOf('_');
      const body = (u > 0 && u <= 15) || !head || title.replace(/\s/g, '').startsWith(head.replace(/\s/g, '')) ? title : `${head}_${title}`;
      return clean(body + tail);
    }
    return clean(fill(fmt, vars));
  }

  // 상담 대상: '영원중학교 담임선생님_조퇴 건' → '영원중학교 담임선생님'
  function target(title) {
    const t = clean(title).replace(/^\(외부기관\s*상담\)\s*/, '');
    return t.split(/_| - | – /)[0].trim() || t;
  }
  /** '홀로서기_A', '홀로서기_B' → '홀로서기_A, B' */
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

  /** 같은 날 '직접 넣는 내용' 중 해당하는 것 */
  function extrasFor(rules, ds) {
    const dow = new Date(ds + 'T00:00:00').getDay();
    return (rules.extras || []).filter((e) => e.text && (
      (e.when === 'date' && e.date === ds) || e.when === 'daily' || (e.when === 'weekly' && Number(e.dow) === dow)));
  }

  /** 하루치 회기 → 칸별 줄 (앞 공백 포함) */
  function dayLines(daySessions, rules, ds) {
    const out = Object.fromEntries(EXTRA_SECTIONS.map((s) => [s, []]));
    const unknown = new Set();
    const svcOrder = Object.keys(rules.services);
    const list = [...daySessions].sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
    const fixed = {}, agg = {}, groups = {}, persons = {};
    for (const s of list) {
      let r = rules.services[s.key];
      if (!r) { unknown.add(s.key); r = { section: '기타사업', format: '{서비스}_{제목}' }; }
      const sec = r.section;
      if (!sec || sec === SKIP || !out[sec]) continue;
      const people = s.people || [s.name];
      if (isFixed(r.format)) { (fixed[sec] ||= new Set()).add(clean(r.format)); continue; }
      if (isAggregate(r.format)) {
        const a = ((agg[sec] ||= {})[s.key] ||= { fmt: r.format, names: [], per: new Map(), targets: new Map(), n: 0 });
        a.n++;
        for (const p of people) if (!a.names.includes(p)) a.names.push(p);
        const t = target(s.title);
        a.targets.set(t, (a.targets.get(t) || 0) + 1);
        const e = a.per.get(s.name) || { targets: [], n: 0 }; e.n++; if (!e.targets.includes(t)) e.targets.push(t); a.per.set(s.name, e);
        continue;
      }
      const item = itemText(r.format, s);
      if (people.length > 1) (groups[sec] ||= []).push(clean(fill(rules.groupLine, { 항목: item, 인원: people.length })));
      else {
        const m = (persons[sec] ||= new Map());
        if (!m.has(people[0])) m.set(people[0], []);
        if (!m.get(people[0]).includes(item)) m.get(people[0]).push(item);
      }
    }
    for (const sec of SECTIONS) {
      for (const t of fixed[sec] || []) out[sec].push(t);
      for (const key of svcOrder.concat(Object.keys(agg[sec] || {}).filter((k) => !svcOrder.includes(k)))) {
        const a = agg[sec]?.[key]; if (!a) continue;
        const 목록 = [...a.per].map(([name, e]) => {
          const ts = e.targets.filter((t) => t !== name);
          return ts.length ? `${ts.join(', ')}(${name}${e.n > 1 ? ` ${e.n}회` : ''})` : `${name}${e.n > 1 ? `(${e.n}회)` : ''}`;
        }).join(', ');
        const 대상목록 = [...a.targets].map(([t, n]) => (n > 1 ? `${t}(${n}회)` : t)).join(', ');
        out[sec].push(clean(fill(a.fmt, { 이름들: a.names.join(', '), 목록, 대상목록, 횟수: a.n })));
      }
      out[sec].push(...(groups[sec] || []));
      for (const [name, items] of persons[sec] || []) out[sec].push(clean(fill(rules.personLine, { 이름: name, 항목들: joinItems(items) })));
    }
    for (const e of extrasFor(rules, ds)) if (out[e.section]) out[e.section].push(clean(e.text));
    for (const sec of Object.keys(out)) out[sec] = out[sec].map((l) => ` ${l}`);
    return { lines: out, unknown: [...unknown] };
  }

  /** 이번 달 기록 중 그 서비스의 첫날로 만든 예시 줄 */
  function exampleFor(rules, key, sessions) {
    const mine = sessions.filter((s) => s.key === key);
    if (!mine.length) return null;
    const ds = mine.map((s) => s.date).sort()[0];        // 가장 이른 날
    const r = rules.services[key] || { section: '기타사업', format: '{서비스}_{제목}' };
    if (r.section === SKIP) return { date: ds, lines: [] };
    const only = { ...rules, extras: [], services: { [key]: r } };
    const { lines } = dayLines(mine.filter((s) => s.date === ds), only, ds);
    return { date: ds, lines: lines[r.section] || [] };
  }

  function staffText(fmt, shift) {
    return shift ? ` ${clean(fill(fmt, { 이름들: shift.names.join(', '), 시작: shift.start, 끝: shift.end }))}` : '';
  }

  global.Rules = { SECTIONS, EXTRA_SECTIONS, SKIP, TOKENS, STORE_KEY, defaults, load, save, merge, isDefault, changedCount, dayLines, exampleFor, staffText, keyOf, isFixed, isAggregate, extrasFor };
})(window);
