/* 화면 로직: 1 파일 넣기 → 2 확인하기 → 3 만들기 */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const badge = (cls, text) => `<span class="badge b-${cls}">${esc(text)}</span>`;
  const ICON = {
    users: '<svg class="i" viewBox="0 0 24 24"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/></svg>',
    sheet: '<svg class="i" viewBox="0 0 24 24"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 9h16M4 15h16M10 3v18"/></svg>',
    cal: '<svg class="i" viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M8 14h2M12 14h2M8 17h2"/></svg>',
    doc: '<svg class="i" viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/></svg>',
  };

  const state = {
    personal: [], templates: [], templateIdx: 0, rosterFile: null, roster: null, logTpl: null, hwpWarn: false,
    parsed: [], info: null, moves: [], result: null, result2: null,
    outreachFile: null, outreach: null, outreachEdits: {}, manualEdits: {}, aftercareFile: null, aftercare: null,
    usersFile: null, supportFile: null, prevAges: {}, ageEdits: {}, result3: null,
    assign: new Map(),   // 원본 파일 id → { name } (사람이 고른 이름)
    auto: new Map(),     // 원본 파일 id → { name, reason } (추천)
  };
  const ym = () => ({ year: Number($('#year').value), month: Number($('#month').value) });
  const fileId = (f) => `${f.name}|${f.size}|${f.lastModified}`;
  const isRaw = (f) => !Step1.isNamedPersonalFile(f.name);

  // ── 파일 받기 ───────────────────────────────────────────
  async function addFiles(fileList) {
    for (const f of fileList) {
      if (Aftercare.isAftercareFileName(f.name)) { state.aftercareFile = f; continue; }   // 사후관리대장 (.hwp/.hwpx)
      if (/\.hwpx$/i.test(f.name)) { state.logTpl = f; state.hwpWarn = false; continue; }
      if (/\.hwp$/i.test(f.name)) { state.hwpWarn = true; continue; }
      if (!/\.xlsx$/i.test(f.name) || f.name.startsWith('~$')) continue;
      if (Yearly.isUsersFile(f.name)) { state.usersFile = f; continue; }          // 연간 이용자현황
      if (Yearly.isSupportFile(f.name)) { state.supportFile = f; continue; }      // 연간 학업·자립·법률·의료지원
      if (Outreach.isOutreachFileName(f.name)) { state.outreachFile = f; continue; }
      if (Roster.isRosterFileName(f.name)) { state.rosterFile = f; continue; }
      if (Step1.isSummaryFileName(f.name)) state.templates = state.templates.filter((t) => t.name !== f.name).concat(f);
      else {
        if (isRaw(f)) { try { f.__months = await Step1.peekMonths(f); } catch { f.__months = []; } }
        state.personal = state.personal.filter((p) => fileId(p) !== fileId(f)).concat(f);
      }
    }
    guessPeriod();
    pickTemplate();
    await reload();
  }

  function guessPeriod() {
    const months = state.personal.map((f) => Step1.parsePersonalName(f.name).month).filter(Boolean);
    const freq = {};
    if (months.length) months.forEach((m) => (freq[m] = (freq[m] || 0) + 1));
    else {                                   // 이름 없는 원본만 있으면 안에 든 날짜로 판단
      for (const f of state.personal) for (const [ymKey, n] of f.__months || []) freq[ymKey] = (freq[ymKey] || 0) + n;
    }
    const top = Object.entries(freq).sort((a, b) => b[1] - a[1])[0];
    if (top) {
      const [k] = top;
      if (String(k).includes('-')) { $('#year').value = Number(k.slice(0, 4)); $('#month').value = Number(k.slice(5, 7)); }
      else $('#month').value = Number(k);
    }
    if (months.length) for (const t of state.templates) { const y = t.name.match(/(\d{4})\s*년/); if (y) { $('#year').value = y[1]; break; } }
  }

  function pickTemplate() {
    const { year: y, month: m } = ym();
    const same = state.templates.findIndex((t) => new RegExp(`${y}\\s*년\\s*0?${m}\\s*월`).test(t.name));
    const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y;
    const prev = state.templates.findIndex((t) => new RegExp(`${py}\\s*년\\s*0?${pm}\\s*월`).test(t.name));
    state.templateIdx = same >= 0 ? same : prev >= 0 ? prev : 0;
  }

  /** 넣은 파일을 (다시) 읽고 화면 전체 갱신 */
  async function reload() {
    const { year, month } = ym();
    clearResults();
    state.parsed = [];
    for (const f of state.personal) {
      const raw = isRaw(f);
      let r;
      try { r = await Step1.readPersonal(f, year, month, raw ? '' : undefined); }
      catch (e) { r = { person: raw ? '' : Step1.parsePersonalName(f.name).person, records: [], warnings: [`[${f.name}] 읽지 못함: ${e.message}`] }; }
      state.parsed.push(Object.assign(r, { file: f, id: fileId(f), raw }));
    }
    state.tpl = await summaryTemplate(year, month);
    const tpl = state.tpl.file;
    state.info = null;
    if (tpl) {
      try { state.info = await Step1.inspectTemplate(tpl, year, month); }
      catch (e) { state.info = { error: e.message, manual: [], residents: [], admissions: [], discharges: [] }; }
    }
    state.prevAges = {};
    state.yUsers = yearlyFile('users'); state.ySupport = yearlyFile('support');
    if (state.yUsers) { try { state.prevAges = await Yearly.previousAges(state.yUsers.file, month); } catch { state.prevAges = {}; } }
    state.aftercare = null;
    if (state.aftercareFile) {
      try { state.aftercare = await Aftercare.parseAftercare(state.aftercareFile, year, month); }
      catch (e) { state.aftercare = { error: e.message, entries: [], warnings: [] }; }
    }
    state.outreach = null;
    if (state.outreachFile) {
      try { state.outreach = await Outreach.parseOutreach(state.outreachFile, year, month); }
      catch (e) { state.outreach = { error: e.message, acts: [], warnings: [] }; }
    }
    state.roster = null;
    if (state.rosterFile) {
      try { state.roster = await Roster.parseRoster(state.rosterFile, year, month); }
      catch (e) { state.roster = { error: e.message }; }
    }
    afterNames();
  }

  // ── 안전망 실적 양식: 넣은 파일 → 기억된 실적 → 내장 빈 양식 ──
  // 사이트가 실적을 만들 때마다 이 PC 브라우저에 복사본을 기억해 두고, 다음 달 바탕으로 씀
  const MEM_KEY = 'shelter-summary-memory-v1';
  const ymKey = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
  const b64ToFile = (b64, name) => { const bin = atob(b64); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new File([u], name); };
  function memLoad() { try { return JSON.parse(localStorage.getItem(MEM_KEY) || '{}') || {}; } catch { return {}; } }
  function memSave(y, m, buffer) {
    try {
      const mem = memLoad();
      let bin = ''; const u = new Uint8Array(buffer); for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
      mem[ymKey(y, m)] = { b64: btoa(bin), savedAt: new Date().toISOString() };
      for (const k of Object.keys(mem).sort().slice(0, -3)) delete mem[k];      // 최근 3달만
      localStorage.setItem(MEM_KEY, JSON.stringify(mem));
      return true;
    } catch { return false; }
  }
  function memForget() { try { localStorage.removeItem(MEM_KEY); } catch { /* 무시 */ } }

  // 연간 기록 파일(이용자현황 · 지원 내역)도 마지막으로 만든 것을 기억 → 다음 달엔 개인 파일만 넣으면 됨
  const YMEM = 'shelter-yearly-memory-v1';
  const ymemLoad = () => { try { return JSON.parse(localStorage.getItem(YMEM) || '{}') || {}; } catch { return {}; } };
  function ymemSave(kind, name, buffer, y, m) {
    try {
      const mem = ymemLoad();
      let bin = ''; const u = new Uint8Array(buffer); for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
      mem[kind] = { name, b64: btoa(bin), ym: ymKey(y, m), savedAt: new Date().toISOString() };
      localStorage.setItem(YMEM, JSON.stringify(mem));
      return true;
    } catch { return false; }
  }
  /** 'users' | 'support' → 넣은 파일이 우선, 없으면 이 PC가 기억한 파일 */
  function yearlyFile(kind) {
    const up = kind === 'users' ? state.usersFile : state.supportFile;
    if (up) return { file: up, from: 'upload' };
    const m = ymemLoad()[kind];
    return m?.b64 ? { file: b64ToFile(m.b64, m.name), from: 'memory', ym: m.ym } : null;
  }

  async function summaryTemplate(year, month) {
    if (state.templates.length) {
      const f = state.templates[state.templateIdx];
      return { file: f, kind: 'upload', label: f.name };
    }
    const target = ymKey(year, month), mem = memLoad();
    const keys = Object.keys(mem).filter((k) => k <= target).sort();
    if (keys.length) {
      const prev = ymKey(month === 1 ? year - 1 : year, month === 1 ? 12 : month - 1);
      const k = keys.includes(prev) ? prev : keys.filter((x) => x < target).pop() || keys.pop();
      const [ky, km] = k.split('-').map(Number);
      let file = b64ToFile(mem[k].b64, `${ky}년 ${km}월 안전망 실적(기억).xlsx`);
      const notes = [];
      if (ky < year) {            // 새해: 숫자는 비우고 이용자현황만 이어 씀
        file = await Step1.blankTemplate(file, { clearResidents: false, name: `${year}년 새 안전망 실적.xlsx` });
        notes.push(`새해라 '실적 정리' 숫자를 비우고 시작해요. 이용자현황은 ${ky}년 것을 이어 써요.`);
      } else if (k !== prev && k !== target) notes.push(`기억된 마지막 실적이 ${km}월 것이에요. 그 사이 달 실적은 없어요.`);
      return { file, kind: 'memory', label: `${ky}년 ${km}월 실적 (이 PC가 기억)`, notes };
    }
    return { file: b64ToFile(window.SUMMARY_TEMPLATE_B64 || '', '빈 안전망 실적.xlsx'), kind: 'builtin', label: '내장 빈 양식',
      notes: ['처음이라 이용자현황(입소생 명단)이 비어 있어요. 지난달 실적 파일을 한 번 넣어 주면 명단을 가져와요.'] };
  }

  // ── 이름 없는 원본 파일: 추천 + 사람이 고른 이름 반영 ─────
  function candidates() {
    const res = state.info && !state.info.error ? state.info.residents : [];
    const list = res.map((r) => ({ name: r.name, inDate: r.inDate, end: r.end }));
    for (const p of state.parsed) if (!p.raw && p.person && !list.some((c) => c.name === p.person)) list.push({ name: p.person });
    for (const a of state.assign.values()) if (a.name && !list.some((c) => c.name === a.name)) list.push({ name: a.name });
    return list;
  }
  function applyNames() {
    const { year, month } = ym();
    const raws = state.parsed.filter((p) => p.raw);
    const taken = [...state.parsed.filter((p) => !p.raw).map((p) => p.person), ...raws.map((p) => state.assign.get(p.id)?.name).filter(Boolean)];
    const need = raws.filter((p) => !state.assign.get(p.id));
    state.auto = need.length ? Naming.suggest(need.map((p) => ({ id: p.id, records: p.records })), candidates().filter((c) => c.inDate || c.end !== undefined), taken, year, month) : new Map();
    for (const p of raws) {
      const name = state.assign.get(p.id)?.name || state.auto.get(p.id)?.name || '';
      p.person = name;
      for (const r of p.records) r.person = name;
    }
  }
  /** 이름이 정해지거나 바뀐 뒤: 회기·입퇴소·화면 다시 계산 (파일은 다시 안 읽음) */
  function afterNames() {
    applyNames();
    state.sessions = Step1.buildSessions(state.parsed.flatMap((p) => p.records));   // 규칙 미리보기용
    rebuildMoves();
    renderAll();
    refreshEdu();
  }
  // 학업지원 문구: 지난 기록에서 찾은 자세한 문구를 보여 주고, 고친 문구는 이 PC가 기억(다음 달에도 같은 제목이면 그대로)
  const DMEM = 'shelter-edu-detail-v1';
  const dmemLoad = () => { try { return JSON.parse(localStorage.getItem(DMEM) || '{}') || {}; } catch { return {}; } };
  const dmemSet = (k, v) => { try { const m = dmemLoad(); if (v) m[k] = v; else delete m[k]; localStorage.setItem(DMEM, JSON.stringify(m)); } catch { /* 무시 */ } };
  let eduSeq = 0;
  async function refreshEdu() {
    const my = ++eduSeq; state.eduRows = [];
    if (state.ySupport && state.sessions?.length) {
      const { year, month } = ym();
      try { const rows = await Yearly.eduPreview(state.ySupport.file, year, month, state.sessions); if (my === eduSeq) state.eduRows = rows; } catch (e) { console.warn(e); }
    }
    if (my === eduSeq) renderEdu();
  }
  function renderEdu() {
    const box = $('#eduBox'); if (!box) return;
    const rows = state.eduRows || [];
    if (!rows.length) { box.innerHTML = ''; return; }
    const mem = dmemLoad(), miss = rows.filter((r) => !mem[r.key] && !r.how).length;
    box.innerHTML = `<details ${miss ? 'open' : ''} class="edu"><summary class="small"><b>학업지원 상세내역 문구</b> <span class="muted">— 지난달까지 쓴 기록에서 찾아 채웠어요. 고치면 이 PC가 기억해요${miss ? ` · <b class="bad">${miss}줄은 지난 기록이 없어 그대로예요</b>` : ''}</span></summary>
      <table class="edu-t"><thead><tr><th>이름</th><th>서비스</th><th>개인 파일 제목</th><th>지원 내역에 쓸 문구</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${esc(r.name)}</td><td class="small">${esc(r.svc)}</td><td class="small muted">${esc(r.title)}${r.n > 1 ? ` ×${r.n}` : ''}</td>
        <td><input data-edu="${esc(r.key)}" value="${esc(mem[r.key] ?? r.auto)}" placeholder="${esc(r.auto)}" class="${!mem[r.key] && !r.how ? 'miss' : ''}"><span class="small muted">${mem[r.key] ? '직접' : r.how === 'history' ? '지난 기록' : r.how === 'rule' ? '자동' : ''}</span></td></tr>`).join('')}
      </tbody></table>
      <p class="small muted" style="margin:4px 0 0">예) 등교지도 → 「OO고등학교 2학년 3반 등교」. 지운 칸은 자동 문구로 돌아가요.</p></details>`;
    $$('#eduBox [data-edu]').forEach((el) => el.addEventListener('change', () => {
      const r = rows.find((x) => x.key === el.dataset.edu);
      const v = el.value.trim(); dmemSet(el.dataset.edu, v && v !== r?.auto ? v : '');
      state.result3 = null; $('#res3').innerHTML = ''; renderEdu(); renderMake();
    }));
  }
  const unnamed = () => state.parsed.filter((p) => p.raw && !p.person);

  function renderAll() { renderSlots(); renderMoves(); renderCheck(); renderOutreach(); renderManual(); renderAges(); renderMake(); renderSteps(); if (rulesReady) RulesUI.render(); }

  // ── 2. 확인: 아웃리치 ───────────────────────────────────
  // 활동마다 일지에 적을 칸(장소·프로그램·참석기관 등). 종류별로 마지막에 쓴 프로그램·참석기관은 기억해 두고 미리 채움
  const OR_MEMO = 'shelter-outreach-memo-v1';
  const orMemo = () => { try { return JSON.parse(localStorage.getItem(OR_MEMO) || '{}') || {}; } catch { return {}; } };
  function outreachDetails() {
    const memo = orMemo(), out = {};
    for (const a of state.outreach?.acts || []) {
      const e = state.outreachEdits[a.id] || {};
      out[a.id] = { ...e, program: e.program ?? memo[a.type]?.program ?? '', orgs: e.orgs ?? memo[a.type]?.orgs ?? '',
        place: e.place ?? (a.place || memo[a.type]?.place || '') };
    }
    return out;
  }
  /** 개인 파일 밖에서 오는 일지 줄: 사후관리대장 + 아웃리치 → { 날짜: { 칸: [줄] } } */
  function extraLogLines() {
    const parts = [];
    if (state.aftercare?.entries?.length) parts.push(Aftercare.logLines(state.aftercare.entries));
    if (state.outreach?.acts?.length) parts.push(Outreach.logLines(state.outreach.acts, outreachDetails()));
    if (!parts.length) return null;
    const out = {};
    for (const p of parts) for (const [d, secs] of Object.entries(p)) for (const [sec, ls] of Object.entries(secs)) ((out[d] ||= {})[sec] ||= []).push(...ls);
    return out;
  }

  function renderOutreach() {
    const box = $('#outreachBox'), sum = $('#sumOutreach');
    const o = state.outreach;
    if (!state.outreachFile) { box.innerHTML = '<p class="muted small">「아웃리치」 파일을 넣으면 활동을 읽어 실적 정리 숫자와 일지 내용을 채워요.</p>'; sum.innerHTML = badge('mute', '선택'); return; }
    if (o?.error) { box.innerHTML = `<p class="bad small">아웃리치 파일을 읽지 못했어요: ${esc(o.error)}</p>`; sum.innerHTML = badge('bad', '읽지 못함'); return; }
    const acts = o.acts, det = outreachDetails();
    const n = (t) => acts.filter((a) => a.type === t).length;
    const parts = ['community', 'seoul', 'school', 'cyber'].filter((t) => n(t)).map((t) => `${Outreach.TYPE_LABEL[t]} ${n(t)}`);
    sum.innerHTML = o.warnings.some((w) => /확인 필요/.test(w)) ? badge('warn', `${parts.join(' · ')} · 확인 필요`) : acts.length ? badge('ok', parts.join(' · ')) : badge('mute', '이 달 활동 없음');
    const md = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
    const inp = (a, k, ph, w = 150) => `<input type="text" data-or="${esc(a.id)}" data-k="${k}" value="${esc(det[a.id][k] ?? a[k] ?? '')}" placeholder="${ph}" style="width:${w}px">`;
    box.innerHTML = `${o.warnings.length ? `<div class="warnbox small" style="margin-bottom:8px">${o.warnings.map(esc).join('<br>')}</div>` : ''}
      <div class="scroll"><table class="outreach"><thead><tr><th>날짜</th><th>구분</th><th>활동제목</th><th>일지에 들어갈 내용</th></tr></thead><tbody>${acts.map((a) => `
        <tr><td>${md(a.date)}</td>
          <td><span class="tag ${a.type === 'unknown' ? 'out' : 'in'}">${Outreach.TYPE_LABEL[a.type]}${a.region ? `·${esc(a.region)}` : ''}</span><div class="muted small">${esc(a.method)}</div></td>
          <td class="small">${esc(a.title)}</td>
          <td class="small">${a.type === 'community' ? `장소 ${inp(a, 'place', '장소 (확인 필요)', 170)} 상담 ${inp(a, 'counsel', '0', 44)}명<br>프로그램 ${inp(a, 'program', '비워 두면 빈칸')} 참석기관 ${inp(a, 'orgs', '비워 두면 빈칸', 200)}`
            : a.type === 'seoul' ? `제 ${inp(a, 'round', '57', 44)}회 · 장소 ${inp(a, 'place', '장소', 200)}<br>프로그램 ${inp(a, 'program', '관계신호등 확인 등', 200)}<br>참석기관 ${inp(a, 'orgs', '금천여자단기청소년쉼터 등', 320)}`
            : a.type === 'school' ? `장소 ${inp(a, 'place', '서울특별시 강서구 ○○고등학교', 220)}<br>프로그램 ${inp(a, 'program', '보드게임, 생명존중교육 등', 220)}<br>참석기관 ${inp(a, 'orgs', '참석기관', 300)}`
            : a.type === 'cyber' ? `페이스북 댓글 ${inp(a, 'people', '3', 44)}명` : '<span class="warn">일지·실적에서 빠져요</span>'}</td></tr>`).join('')}</tbody></table></div>
      <p class="muted small">프로그램·참석기관은 종류별로 마지막에 쓴 내용을 기억해서 다음에 미리 채워요.</p>`;
    $$('#outreachBox [data-or]').forEach((el) => el.addEventListener('input', () => {
      const a = acts.find((x) => x.id === el.dataset.or);
      (state.outreachEdits[a.id] ||= {})[el.dataset.k] = el.value;
      if (el.dataset.k === 'program' || el.dataset.k === 'orgs' || (el.dataset.k === 'place' && a.type !== 'community')) {
        try { const m = orMemo(); (m[a.type] ||= {})[el.dataset.k] = el.value; localStorage.setItem(OR_MEMO, JSON.stringify(m)); } catch { /* 저장 못 해도 진행 */ }
      }
      clearResults();
      if (el.dataset.k === 'counsel' || el.dataset.k === 'people') renderManual();
    }));
  }
  let rulesReady = false;

  // ── 1. 파일 칸 ──────────────────────────────────────────
  function slot(id, icon, title, status, ex, body, need) {
    const el = $(id);
    el.classList.toggle('need', !!need);
    el.innerHTML = `${icon}<div class="body"><div class="head">${title} ${status}</div><div class="ex">${ex}</div>${body ? `<div class="files">${body}</div>` : ''}</div>`;
  }

  function renderSlots() {
    const { month } = ym();
    const p = state.personal;
    const noName = unnamed().length;
    slot('#slotPersonal', ICON.users, '개인 파일',
      !p.length ? badge('mute', '필요') : noName ? badge('warn', `이름 확인 ${noName}개`) : badge('ok', `${p.length}개`),
      `원본(실행목록[…].xlsx) 그대로 또는 이름 붙인 파일(홍길동 ${month}월.xlsx)`,
      state.parsed.map((x) => `<span class="chip ${x.raw && !x.person ? 'miss' : ''}">${x.raw ? (x.person ? `${esc(x.person)}<span class="muted small">·원본</span>` : '이름 없음') : esc(x.person)}<button class="x" title="빼기" data-rm-p="${esc(x.id)}">×</button></span>`).join(''), !p.length);
    renderNames();

    const t = state.templates;
    const tplName = t[state.templateIdx]?.name || '';
    const tk = state.tpl?.kind;
    const kind = tk === 'upload' ? (new RegExp(`0?${month}\\s*월`).test(tplName) ? badge('ok', '이번 달 파일') : badge('ok', '지난달 파일'))
      : tk === 'memory' ? badge('ok', '기억된 실적 사용') : badge('mute', '선택 · 내장 양식');
    const tplNotes = (state.tpl?.notes || []).map((n) => `<div class="${tk === 'builtin' ? 'muted' : 'warn'} small">${esc(n)}</div>`).join('');
    slot('#slotSummary', ICON.sheet, '안전망 실적', kind, '없어도 돼요 — 지난번에 만든 실적을 이 PC가 기억해서 써요',
      (t.length > 1 ? t.map((f, i) => `<label class="pick"><input type="radio" name="tpl" value="${i}" ${i === state.templateIdx ? 'checked' : ''}> ${esc(f.name)}</label>`).join('')
        : t.length ? `${esc(tplName)} <button class="x" title="빼기" data-rm-t="0">×</button>`
        : `${esc(state.tpl?.label || '')}${tk === 'memory' ? ' <button class="link danger" id="forgetMem">기억 지우기</button>' : ''}`) + tplNotes);

    const r = state.roster;
    const rosterStatus = !state.rosterFile ? badge('mute', '선택') : r?.error ? badge('bad', '읽지 못함')
      : badge('ok', `${Object.keys(r?.roster || {}).length}일`);
    const rosterBody = !state.rosterFile ? '<span class="muted small">넣으면 일지 근무자 칸이 채워져요</span>'
      : `${esc(state.rosterFile.name)} <button class="x" title="빼기" id="rmRoster">×</button>`
        + (r?.error ? `<div class="bad small">${esc(r.error)}</div>` : '')
        + (r?.holidays?.length ? `<div class="muted small">공휴일 ${r.holidays.join(', ')}일</div>` : '')
        + (r?.notes?.length ? `<div class="warn small">${r.notes.map(esc).join('<br>')}</div>` : '');
    slot('#slotRoster', ICON.cal, '근무표', rosterStatus, '예: 2026년 n월 근무표.xlsx', rosterBody);

    const logBody = state.logTpl ? `${esc(state.logTpl.name)} <button class="x" title="빼고 내장 양식 쓰기" id="rmLog">×</button>`
      : `<span class="muted small">없어도 돼요. 내장 양식으로 만들어요</span>${state.hwpWarn ? '<div class="muted small">.hwp는 넣지 않아도 돼요(내장 양식 사용)</div>' : ''}`;
    slot('#slotLog', ICON.doc, '운영일지 양식', state.logTpl ? badge('ok', '넣은 양식') : badge('mute', '선택 · 내장 양식'), '예: 쉼터운영일지 2026 n월.hwpx', logBody);

    const o = state.outreach;
    const yf = [['yUsers', 'usersFile'], ['ySupport', 'supportFile']].filter(([k]) => state[k]);
    const memLabel = (y) => `${esc(y.file.name)} <span class="muted small">· 이 PC가 기억 (${Number(y.ym.slice(5))}월까지)</span>`;
    slot('#slotYearly', ICON.sheet, '연간 기록 파일',
      yf.length ? badge('ok', yf.some(([k]) => state[k].from === 'memory') ? '기억된 파일 사용' : `${yf.length}개`) : badge('mute', '선택'),
      '처음 한 번만 넣으면 돼요 — 다음 달부터는 이 PC가 기억해요',
      yf.length ? yf.map(([k, up]) => `<div>${state[k].from === 'memory' ? memLabel(state[k]) : esc(state[k].file.name)}${state[k].from === 'upload' ? ` <button class="x" title="빼기" data-rm-y="${up}">×</button>` : ''}</div>`).join('')
          + (yf.some(([k]) => state[k].from === 'memory') ? '<button class="link danger" id="forgetYearly">기억 지우기</button>' : '')
        : '<span class="muted small">2026년 이용자현황.xlsx · 2026년 학업, 자립, 법률,의료지원.xlsx</span>');

    const ac = state.aftercare;
    const acDates = ac?.entries ? [...new Set(ac.entries.map((e) => `${Number(e.date.slice(5, 7))}/${Number(e.date.slice(8, 10))}`))] : [];
    slot('#slotAftercare', ICON.doc, '사후관리대장',
      !state.aftercareFile ? badge('mute', '선택') : ac?.error ? badge('bad', '읽지 못함') : ac?.entries.length ? badge('ok', `${month}월 ${ac.entries.length}건`) : badge('warn', `${month}월 기록 없음`),
      '예: 사후관리대장 - 2026년.hwp (그대로)',
      state.aftercareFile ? `${esc(state.aftercareFile.name)} <button class="x" title="빼기" id="rmAftercare">×</button>`
        + (ac?.error ? `<div class="bad small">${esc(ac.error)}</div>` : '')
        + (acDates.length ? `<div class="muted small">상담한 날: ${acDates.join(', ')}</div>` : '')
        + (ac?.warnings?.length ? `<div class="warn small">${ac.warnings.map(esc).join('<br>')}</div>` : '')
        : '<span class="muted small">넣으면 사후관리 실적과 일지 내용이 채워져요</span>');

    slot('#slotOutreach', ICON.cal, '아웃리치',
      !state.outreachFile ? badge('mute', '선택') : o?.error ? badge('bad', '읽지 못함') : badge('ok', `${o?.acts.length || 0}건`),
      '예: 아웃리치[2026-11-15].xlsx (내보낸 그대로)',
      state.outreachFile ? `${esc(state.outreachFile.name)} <button class="x" title="빼기" id="rmOutreach">×</button>` : '<span class="muted small">넣으면 아웃리치 실적과 일지 내용이 채워져요</span>');

    $$('[data-rm-p]').forEach((b) => b.addEventListener('click', () => { state.personal = state.personal.filter((f) => fileId(f) !== b.dataset.rmP); state.assign.delete(b.dataset.rmP); reload(); }));
    $$('[data-rm-t]').forEach((b) => b.addEventListener('click', () => { state.templates = []; reload(); }));
    $('#forgetMem')?.addEventListener('click', () => {
      if (!confirm('이 PC가 기억하는 실적(이용자현황 포함)을 지울까요? 다음엔 지난달 실적 파일을 직접 넣어야 해요.')) return;
      memForget(); reload();
    });
    $$('input[name=tpl]').forEach((el) => el.addEventListener('change', () => { state.templateIdx = Number(el.value); reload(); }));
    $('#rmRoster')?.addEventListener('click', () => { state.rosterFile = null; reload(); });
    $('#rmOutreach')?.addEventListener('click', () => { state.outreachFile = null; state.outreachEdits = {}; reload(); });
    $('#rmAftercare')?.addEventListener('click', () => { state.aftercareFile = null; reload(); });
    $$('[data-rm-y]').forEach((b) => b.addEventListener('click', () => { state[b.dataset.rmY] = null; reload(); }));
    $('#forgetYearly')?.addEventListener('click', () => { if (!confirm('이 PC가 기억하는 연간 기록 파일을 지울까요? 다음엔 파일을 직접 넣어야 해요.')) return; try { localStorage.removeItem('shelter-yearly-memory-v1'); } catch { /* 무시 */ } reload(); });
    $('#rmLog')?.addEventListener('click', () => { state.logTpl = null; renderAll(); });
    $('#fileCount').textContent = `개인 ${p.length} · 실적 ${t.length} · 근무표 ${state.rosterFile ? 1 : 0} · 일지 양식 ${state.logTpl ? 1 : 0} · 아웃리치 ${state.outreachFile ? 1 : 0} · 사후관리 ${state.aftercareFile ? 1 : 0}`;
  }

  // ── 1. 이름 없는 원본 파일 → 아이 이름 정하기 ───────────────
  function renderNames() {
    const box = $('#nameBox');
    const raws = state.parsed.filter((p) => p.raw);
    if (!raws.length) { box.innerHTML = ''; return; }
    const md = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
    const cands = candidates().map((c) => c.name);
    const usedBy = (name, id) => state.parsed.some((q) => q.id !== id && q.person === name);
    box.innerHTML = `
      <div class="row between"><strong class="small">이름 없는 원본 파일 ${raws.length}개 — 아이 이름을 확인해 주세요</strong>
        <button id="dlNamed" class="btn">⬇ 이름 붙여 내려받기</button></div>
      <p class="muted small" style="margin:2px 0 6px">추천은 제목에 나온 이름, 입·퇴소일, 남은 사람으로 추측한 거예요. 틀리면 바꿔 주세요.${!cands.length ? ' 안전망 실적 파일을 넣으면 입소생 명단으로 추천해 드려요.' : ''}</p>
      <div class="scroll"><table class="names"><thead><tr><th>파일</th><th>기록</th><th>아이 이름</th><th>근거</th></tr></thead><tbody>${raws.map((p) => {
        const dates = p.records.map((r) => r.date).sort();
        const man = state.assign.get(p.id), sug = state.auto.get(p.id);
        const cur = p.person;
        const opts = [...new Set([...cands, ...(cur ? [cur] : [])])];
        return `<tr data-id="${esc(p.id)}">
          <td class="small">${esc(p.file.name)}</td>
          <td class="small">${p.records.length}건${dates.length ? ` · ${md(dates[0])}~${md(dates[dates.length - 1])}` : ''}${
            p.records.filter((r) => /^\s*(입소|퇴소)\s*상담/.test(r.title)).map((r) => `<div class="warn">${esc(r.title.trim().slice(0, 4))} ${md(r.date)}</div>`).join('')}</td>
          <td><select data-name><option value="">— 고르세요 —</option>${opts.map((n) => `<option value="${esc(n)}" ${n === cur ? 'selected' : ''}>${esc(n)}${usedBy(n, p.id) ? ' (다른 파일에 있음)' : ''}</option>`).join('')}<option value="__custom">직접 입력…</option></select></td>
          <td class="small">${man ? badge('mute', '직접 고름') : sug ? `${badge('ok', '추천')} <span class="muted">${esc(sug.reason || '')}</span>` : badge('warn', '추천 없음')}
            ${cur && usedBy(cur, p.id) ? '<div class="warn">같은 이름이 다른 파일에도 있어요</div>' : ''}</td></tr>`;
      }).join('')}</tbody></table></div>`;
    $$('#nameBox select[data-name]').forEach((sel) => sel.addEventListener('change', () => {
      const id = sel.closest('tr').dataset.id;
      let v = sel.value;
      if (v === '__custom') { v = (prompt('아이 이름을 입력해 주세요') || '').trim(); if (!v) { renderNames(); return; } }
      if (v) state.assign.set(id, { name: v }); else state.assign.delete(id);
      clearResults(); afterNames();
    }));
    $('#dlNamed').addEventListener('click', downloadNamed);
  }

  /** 개인 파일을 '이름 n월.xlsx'로 이름 붙여 한 번에 내려받기 (내용은 그대로) */
  async function downloadNamed() {
    const { year, month } = ym();
    if (unnamed().length) { alert('이름을 정하지 않은 파일이 있어요. 먼저 아이 이름을 골라 주세요.'); return; }
    const zip = new JSZip(), used = new Set();
    for (const p of state.parsed) {
      let name = p.raw ? `${p.person} ${month}월.xlsx` : p.file.name;
      for (let i = 2; used.has(name); i++) name = name.replace(/( \(\d+\))?\.xlsx$/i, ` (${i}).xlsx`);
      used.add(name);
      zip.file(name, await p.file.arrayBuffer());
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `개인 파일 ${year}년 ${month}월.zip`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // ── 2. 확인: 입·퇴소 ────────────────────────────────────
  function rebuildMoves() {
    const keep = new Map(state.moves.map((m) => [`${m.type}|${m.name}`, m]));
    const manual = state.moves.filter((m) => !m.auto);
    const detected = Step1.detectMoves(state.parsed.flatMap((p) => p.records));
    const info = state.info || {};
    state.moves = detected.map((d) => {
      const old = keep.get(`${d.type}|${d.name}`) || {};
      const exL = (info.admissions || []).find((e) => e.name === d.name && e.inDate === d.date);
      const exR = (info.discharges || []).find((e) => e.name === d.name && e.outDate === d.date);
      return {
        type: d.type, name: d.name, date: d.date, auto: true, count: d.count, include: old.include ?? true,
        exists: d.type === '입소' ? !!exL : !!exR,
        age: old.age ?? exL?.age ?? '', cause: old.cause ?? exL?.cause ?? '', school: old.school ?? exL?.school ?? '',
        reason: old.reason ?? exR?.reason ?? '', indep: old.indep ?? exR?.indep ?? '',
      };
    }).concat(manual);
  }

  const datalist = (id, values) => `<datalist id="${id}">${[...new Set(values.filter(Boolean))].map((v) => `<option value="${esc(v)}">`).join('')}</datalist>`;
  const moveMissing = (m) => (m.type === '퇴소' ? !m.reason || !m.indep : !m.age || !m.cause || !m.school);

  function renderMoves() {
    const info = state.info || {};
    const box = $('#movesBox');
    const lists = datalist('dl-cause', (info.admissions || []).map((e) => e.cause)) +
      datalist('dl-school', (info.admissions || []).map((e) => e.school)) +
      datalist('dl-reason', ['가정복귀', '강제퇴소', '타 시설 입소', '취업', '입원', '법률형 집행', ...(info.discharges || []).map((e) => e.reason)]) +
      datalist('dl-indep', ['미자립', '취업(정규직)', '취∙창업준비', '군입대예정', ...(info.discharges || []).map((e) => e.indep)]);
    if (!state.moves.length) {
      box.innerHTML = `<p class="muted small">이 달 개인 파일에서 「입소상담」·「퇴소상담」 기록을 찾지 못했어요.</p>${lists}`;
    } else {
      box.innerHTML = lists + `<div class="scroll"><table class="moves"><thead><tr><th>반영</th><th>구분</th><th>이름</th><th>날짜</th><th>이용자현황에 들어갈 내용</th><th>상태</th></tr></thead><tbody>${
        state.moves.map((m, i) => `
          <tr class="${m.include ? '' : 'off'}">
            <td><input type="checkbox" data-i="${i}" data-k="include" ${m.include ? 'checked' : ''} aria-label="반영"></td>
            <td><span class="tag ${m.type === '입소' ? 'in' : 'out'}">${m.type}</span></td>
            <td>${m.auto ? esc(m.name) : `<input data-i="${i}" data-k="name" value="${esc(m.name)}" placeholder="이름" class="w-name">`}</td>
            <td><input type="date" data-i="${i}" data-k="date" value="${esc(m.date)}"></td>
            <td>${m.type === '입소'
              ? `<input data-i="${i}" data-k="age" value="${esc(m.age)}" placeholder="만나이" class="w-age"><input data-i="${i}" data-k="cause" value="${esc(m.cause)}" placeholder="가출원인" list="dl-cause"><input data-i="${i}" data-k="school" value="${esc(m.school)}" placeholder="학업현황" list="dl-school">`
              : `<input data-i="${i}" data-k="reason" value="${esc(m.reason)}" placeholder="퇴소사유" list="dl-reason"><input data-i="${i}" data-k="indep" value="${esc(m.indep)}" placeholder="자립" list="dl-indep">`}</td>
            <td class="small">${m.auto ? (m.exists ? '<span class="muted">이미 기록됨</span>' : '<span class="good">새로 추가</span>') : '<span class="warn">직접 추가</span>'}
              ${m.count > 1 ? `<br><span class="warn">상담 ${m.count}회 — ${m.type === '입소' ? '가장 이른' : '가장 늦은'} 날짜 사용</span>` : ''}
              ${!m.auto ? `<br><button class="link danger" data-del="${i}">삭제</button>` : ''}</td>
          </tr>`).join('')}</tbody></table></div>`;
    }
    $$('#movesBox [data-i]').forEach((el) => el.addEventListener('input', () => {
      const m = state.moves[Number(el.dataset.i)];
      m[el.dataset.k] = el.type === 'checkbox' ? el.checked : el.value;
      if (el.dataset.k === 'include') el.closest('tr').classList.toggle('off', !el.checked);
      clearResults();
      renderMovesSummary(); if (el.dataset.k === 'name') renderCheck();
    }));
    $$('#movesBox [data-del]').forEach((b) => b.addEventListener('click', () => { state.moves.splice(Number(b.dataset.del), 1); renderMoves(); renderCheck(); }));
    renderMovesSummary();
  }

  function renderMovesSummary() {
    const on = state.moves.filter((m) => m.include);
    const nIn = on.filter((m) => m.type === '입소').length, nOut = on.filter((m) => m.type === '퇴소').length;
    const need = on.filter(moveMissing).length;
    const parts = [nIn && `입소 ${nIn}건`, nOut && `퇴소 ${nOut}건`].filter(Boolean).join(' · ');
    $('#sumMoves').innerHTML = !state.parsed.length ? badge('mute', '개인 파일 필요')
      : !on.length ? badge('ok', '이번 달 없음') : need ? badge('warn', `${parts} · 빈 칸 ${need}건`) : badge('ok', parts);
  }

  function addManualMove(type) {
    const { year, month } = ym();
    state.moves.push({ type, name: '', date: `${year}-${String(month).padStart(2, '0')}-01`, auto: false, include: true, age: '', cause: '', school: '', reason: '', indep: '' });
    $('#chkMoves').open = true;
    renderMoves();
  }

  // ── 2. 확인: 도착 ───────────────────────────────────────
  function arrival() {
    const info = state.info;
    if (!info || info.error) return null;
    const got = new Set(state.parsed.map((p) => p.person).filter(Boolean));
    const expected = [...new Set([...info.residents.map((r) => r.name), ...state.moves.filter((m) => m.type === '입소' && m.include && m.name).map((m) => m.name)])];
    return { got, expected, missing: expected.filter((n) => !got.has(n)), extra: [...got].filter((n) => !expected.includes(n)) };
  }

  function renderCheck() {
    const box = $('#checkBox'), sum = $('#sumArrive');
    const info = state.info;
    if (!info) { box.innerHTML = '<p class="muted small">안전망 실적 파일을 넣으면 그 달 입소생 명단과 비교해 드려요.</p>'; sum.innerHTML = badge('mute', '실적 파일 필요'); return; }
    if (info.error) { box.innerHTML = `<p class="bad small">실적 파일을 읽지 못했어요: ${esc(info.error)}</p>`; sum.innerHTML = badge('bad', '읽지 못함'); return; }
    const a = arrival();
    box.innerHTML = `
      <div>${a.expected.map((n) => `<span class="chip solo ${a.got.has(n) ? 'ok' : 'miss'}">${a.got.has(n) ? '✓' : '✕'} ${esc(n)}</span>`).join('') || '<span class="muted small">이 달 입소생을 찾지 못했어요.</span>'}</div>
      ${a.missing.length ? `<p class="bad small">아직 안 온 파일: ${a.missing.map(esc).join(', ')}</p>` : ''}
      ${a.extra.length ? `<p class="warn small">입소생 명단에 없는 이름: ${a.extra.map(esc).join(', ')} — 입소상담 기록이 없다면 「입·퇴소」에서 직접 추가해 주세요.</p>` : ''}
      <p class="muted small">명단 = 이용자현황 시트에서 이 달에 머문 사람 + 이번 달 입소</p>`;
    sum.innerHTML = a.missing.length ? badge('bad', `${a.missing.length}명 안 옴`)
      : a.extra.length ? badge('warn', `명단 밖 ${a.extra.length}명`) : a.expected.length ? badge('ok', `${a.expected.length}명 모두`) : badge('mute', '명단 없음');
  }

  // ── 2. 확인: 직접 입력 ──────────────────────────────────
  function renderManual() {
    const info = state.info;
    const tbody = $('#manualBody');
    if (!info || !info.manual?.length) { tbody.innerHTML = '<tr><td colspan="3" class="muted small">안전망 실적 파일을 넣으면 표시돼요.</td></tr>'; $('#sumManual').innerHTML = badge('mute', '실적 파일 필요'); return; }
    // 아웃리치 파일이 있으면 계산된 숫자를 미리 채움 (사람이 고친 값이 우선)
    const auto = state.outreach?.acts ? Outreach.summaryCounts(state.outreach.acts, state.outreachEdits) : {};
    if (state.aftercare && !state.aftercare.error) auto[59] = [state.aftercare.entries.length, state.aftercare.entries.length];   // 사후관리: 1번에 1회기 1명
    const cell = (m, k, i, disabled) => {
      const key = `${m.key}|${k}`;
      const a = auto[m.key]?.[i];
      const typed = state.manualEdits[key];
      const val = typed ?? (a != null ? a : m[k]);
      const tag = typed == null && a != null ? ' class="autofill" title="아웃리치 파일로 계산"' : '';
      return `<td><input type="number" min="0" data-row="${m.row}" data-key="${key}" data-k="${k}" value="${esc(val)}"${tag} ${disabled ? 'disabled title="병합되었거나 수식이 있는 칸"' : ''}></td>`;
    };
    tbody.innerHTML = info.manual.map((m) => `
      <tr><td>${esc(m.label)} <span class="muted small">(${m.row}행)</span>${auto[m.key] ? ' <span class="badge b-ok">아웃리치</span>' : ''}</td>
      ${cell(m, 'sessions', 0, m.sessionsIsFormula)}${cell(m, 'persons', 1, m.personsIsFormula)}</tr>`).join('');
    $$('#manualBody input').forEach((el) => el.addEventListener('input', () => {
      state.manualEdits[el.dataset.key] = el.value; el.classList.remove('autofill');
      clearResults(); renderManualSummary();
    }));
    renderManualSummary();
  }
  function renderManualSummary() {
    const inputs = $$('#manualBody input:not([disabled])');
    const rows = new Set(inputs.map((i) => i.dataset.row));
    const filled = new Set(inputs.filter((i) => i.value !== '').map((i) => i.dataset.row));
    $('#sumManual').innerHTML = filled.size >= rows.size ? badge('ok', `${rows.size}개 항목`) : badge('mute', `${filled.size}/${rows.size}개 입력`);
  }
  function manualValues() {
    const map = {};
    $$('#manualBody input:not([disabled])').forEach((el) => { const r = el.dataset.row; (map[r] ||= { row: Number(r) })[el.dataset.k] = el.value; });
    return Object.values(map);
  }

  // ── 단계 표시 · 만들기 상태 ─────────────────────────────
  const ready = () => state.personal.length > 0 && unnamed().length === 0;
  function renderSteps() {
    const s1 = ready(), s3 = !!(state.result || state.result2);
    $$('#steps li').forEach((li) => {
      const n = Number(li.dataset.s);
      li.className = n === 1 ? (s1 ? 'done' : 'on') : n === 2 ? (s3 ? 'done' : s1 ? 'on' : '') : (s3 ? 'done' : s1 ? 'on' : '');
    });
  }
  function renderMake() {
    const need = !state.personal.length ? '개인 파일 필요' : unnamed().length ? '이름 확인 필요' : '';
    $('#st1').innerHTML = state.result ? badge('ok', '완료') : need ? badge('mute', need) : badge('ok', '준비됨');
    $('#st2').innerHTML = state.result2 ? badge('ok', '완료') : need ? badge('mute', need) : badge('ok', '준비됨');
    $('#st3').innerHTML = state.result3 ? badge('ok', '완료') : !(state.yUsers || state.ySupport) ? badge('mute', '파일 넣으면 만들어요') : need ? badge('mute', need) : badge('ok', '준비됨');
    const roster = state.roster && !state.roster.error;
    $('#desc2').textContent = `날짜별 표 · 입소생 · 영역별 내용 · 근무자 ${roster ? '(근무표로 채움)' : '(근무표 없으면 비어 있음)'}`;
  }
  function clearResults() {
    state.result = null; state.result2 = null;
    $('#res1').innerHTML = ''; $('#res2').innerHTML = ''; $('#res3').innerHTML = ''; $('#msg').innerHTML = ''; state.result3 = null;
    renderMake(); renderSteps();
  }
  function blockIfNotReady() {
    if (ready()) return false;
    $('#msg').innerHTML = `<span class="bad">${!state.personal.length ? '개인 파일을 먼저 넣어 주세요.' : '아이 이름을 정하지 않은 파일이 있어요. 1번에서 골라 주세요.'}</span>`;
    return true;
  }
  const list = (items) => `<ul>${items.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>`;

  // ── 만들기: 실적 엑셀 ───────────────────────────────────
  async function run() {
    const { year, month } = ym();
    const out = $('#res1');
    out.innerHTML = '<p class="muted">만드는 중…</p>';
    try {
      const all = state.parsed.flatMap((p) => p.records);
      const warnings = state.parsed.flatMap((p) => p.warnings);
      const sessions = Step1.buildSessions(all);
      const agg = Step1.aggregate(sessions);
      const moves = state.moves.filter((m) => m.include && m.name && /^\d{4}-\d{2}-\d{2}$/.test(m.date));
      const res = await Step1.buildWorkbook(state.tpl.file, sessions, agg, year, month, manualValues(), moves);
      const remembered = memSave(year, month, res.buffer);   // 다음 달 바탕으로 기억
      res.unmapped.forEach((u) => warnings.push(`'실적 정리'에 맞는 행이 없는 서비스: ${u.key} (${u.sessions}회기/${u.persons}명) — 직접 확인 필요`));
      moves.filter((m) => moveMissing(m)).forEach((m) => warnings.push(`${m.name} ${m.type}: ${m.type === '퇴소' ? '퇴소사유·자립' : '만나이·가출원인·학업현황'} 칸이 비어 있어요`));
      state.result = { ...res, sessions, agg, records: all, year, month };
      const url = URL.createObjectURL(new Blob([res.buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const rev = Object.entries(Step1.ROW_MAP).map(([row, k]) => [Number(row), k, agg[k]]).filter((x) => x[2]);
      out.innerHTML = `
        <a class="btn dl" href="${url}" download="${esc(res.fileName)}">⬇ ${esc(res.fileName)}</a>
        <p class="muted small" style="margin:6px 0 0">개인 기록 ${all.length}건 → 목록 ${res.lineCount}줄 · 엑셀에서 열면 합계가 다시 계산돼요</p>
        <p class="small" style="margin:2px 0 0">${remembered ? `<span class="good">✓ 이 PC가 ${month}월 실적을 기억했어요 — 다음 달엔 실적 파일을 안 넣어도 돼요</span>` : `<span class="warn">이 브라우저에는 기억할 수 없어요 — 내려받은 파일을 다음 달에 넣어 주세요</span>`}</p>
        ${warnings.length ? `<details open class="warnbox"><summary>확인 필요 ${warnings.length}건</summary>${list(warnings)}</details>` : ''}
        ${res.notes.length ? `<details><summary>바뀐 내용 ${res.notes.length}건</summary>${list(res.notes)}</details>` : ''}
        <details><summary>'실적 정리'에 들어간 숫자</summary><div class="scroll"><table class="mini"><thead><tr><th>행</th><th>서비스</th><th>회기</th><th>명</th></tr></thead>
          <tbody>${rev.map(([r, k, v]) => `<tr><td>${r}</td><td>${esc(k)}</td><td>${v[0]}</td><td>${v[1]}</td></tr>`).join('')}</tbody></table></div></details>`;
      return state.result;
    } catch (e) {
      console.error(e);
      out.innerHTML = `<p class="bad small">만들지 못했어요: ${esc(e.message)}</p>`;
      throw e;
    } finally { renderMake(); renderSteps(); }
  }

  // ── 만들기: 운영일지 ────────────────────────────────────
  function logTemplate() {
    if (state.logTpl) return { file: state.logTpl, builtIn: false };
    const bin = atob(window.LOG_TEMPLATE_B64 || '');
    const bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { file: new File([bytes], '운영일지 양식.hwpx'), builtIn: true };
  }

  async function run2() {
    const out = $('#res2');
    out.innerHTML = '<p class="muted">만드는 중…</p>';
    try {
      if (!state.result) await run();          // 일지는 실적 결과(이용자현황)가 필요
      const { year, month } = state.result;
      const residents = await Step1.residentsFromBuffer(state.result.buffer);
      const tpl = logTemplate();
      const roster = state.roster && !state.roster.error ? state.roster.roster : null;
      const outreach = extraLogLines();
      const res = await Step2.buildLog(tpl.file, state.result.sessions, residents, year, month, { roster, rules: RulesUI.rules, outreach });
      state.result2 = res;
      const url = URL.createObjectURL(res.blob);
      const sample = res.summary.find((s) => s.lines > 0) || res.summary[0];
      const todo = [roster ? null : '근무자 칸 — 근무표 엑셀을 넣으면 자동으로 채워져요', '대외지원 · 후원 칸'].filter(Boolean);
      out.innerHTML = `
        <a class="btn dl" href="${url}" download="${esc(res.fileName)}">⬇ ${esc(res.fileName)}</a>
        <p class="muted small" style="margin:6px 0 0">${res.summary.length}일치 표를 채웠어요 · .hwp가 필요하면 한글에서 「다른 이름으로 저장」</p>
        <details open class="warnbox"><summary>직접 채울 칸</summary>${list(todo)}</details>
        ${res.notes.length ? `<details><summary>참고 ${res.notes.length}건</summary>${list(res.notes)}</details>` : ''}
        <details><summary>날짜별 미리보기</summary>
          <select id="pvDay" style="margin-top:8px;max-width:100%">${res.summary.map((s, i) => `<option value="${i}" ${s === sample ? 'selected' : ''}>${s.date.slice(5)} (${s.dow}) · 재소 ${s.residents}명 · ${s.lines}줄</option>`).join('')}</select>
          <div id="pvBox" class="preview"></div>
        </details>`;
      const show = () => {
        const s = res.summary[Number($('#pvDay').value)], st = s.info.staff;
        const secs = Object.entries(s.info.lines).filter(([, l]) => l.length).map(([k, l]) => `<div class="pv">${esc(k)}</div>${l.map((x) => `<div>${esc(x)}</div>`).join('')}`).join('');
        $('#pvBox').innerHTML = (st ? `<div class="pv">근무자</div><div>주간 ${esc(st.day || '–')}</div>${st.mid ? `<div>중간 ${esc(st.mid)}</div>` : ''}<div>야간 ${esc(st.night || '–')}</div>` : '')
          + `<div class="pv">입소생 (총 ${s.info.residents.length} 명)</div><div>${esc(s.info.residents.join(', '))}</div><div class="muted small">입소 ${s.info.admit} · 퇴소 ${s.info.leave}</div>`
          + (secs || '<div class="muted">기록 없음</div>');
      };
      $('#pvDay').addEventListener('change', show); show();
      return res;
    } catch (e) {
      console.error(e);
      out.innerHTML = `<p class="bad small">만들지 못했어요: ${esc(e.message)}</p>`;
      throw e;
    } finally { renderMake(); renderSteps(); }
  }

  async function runAll() {
    if (blockIfNotReady()) return;
    $('#msg').innerHTML = '<span class="muted">만드는 중…</span>';
    try {
      await run(); await run2();
      const yearly = state.yUsers || state.ySupport;
      if (yearly) await run3();
      $('#msg').innerHTML = `<span class="good">${yearly ? '실적 엑셀, 운영일지, 연간 기록 파일' : '두 파일'}을 만들었어요. 위에서 내려받으세요.</span>`;
    } catch { $('#msg').innerHTML = '<span class="bad">만들지 못한 파일이 있어요. 위 안내를 확인해 주세요.</span>'; }
  }

  // ── 만들기: 연간 기록 파일 (이용자현황 · 학업·자립·법률·의료지원) ──
  const ymRange = () => { const { year, month } = ym(); const D = new Date(year, month, 0).getDate(); return { ms: `${year}-${String(month).padStart(2, '0')}-01`, me: `${year}-${String(month).padStart(2, '0')}-${D}` }; };
  /** 그 달 재소자 이름과 나이(지난달 시트 → 이용자현황 입소 때 만나이 → 직접 입력 순) — 만들기 전 화면 표시용 */
  function monthPeople() {
    const { ms, me } = ymRange();
    const adm = state.info?.admissions || [];
    const names = [];
    for (const e of adm) if (e.inDate <= me && (!e.end || e.end >= ms) && !names.includes(e.name)) names.push(e.name);
    for (const m of state.moves) if (m.type === '입소' && m.include && m.name && !names.includes(m.name)) names.push(m.name);
    const order = Object.keys(state.prevAges || {});
    names.sort((a, b) => (order.indexOf(a) + 1 || 999) - (order.indexOf(b) + 1 || 999));
    return names.map((n) => {
      const mv = state.moves.find((m) => m.type === '입소' && m.name === n);
      const fallback = state.prevAges?.[n] ?? (adm.filter((e) => e.name === n).pop()?.age || mv?.age || '');
      return { name: n, age: state.ageEdits[n] ?? String(fallback ?? ''), from: state.ageEdits[n] != null ? '직접' : state.prevAges?.[n] != null ? '지난달 시트' : fallback ? '입소 때 나이' : '' };
    });
  }
  function renderAges() {
    const box = $('#agesBox');
    if (!state.yUsers) { box.innerHTML = ''; return; }
    const ppl = monthPeople();
    box.innerHTML = ppl.length ? `<p class="small" style="margin:0 0 4px"><b>나이 확인</b> <span class="muted">— 나이대별 연인원에 쓰여요. 생일이 지났으면 고쳐 주세요.</span></p>
      <div class="ages">${ppl.map((p) => `<label>${esc(p.name)} <input type="number" min="5" max="30" data-age="${esc(p.name)}" value="${esc(p.age)}"><span class="muted small">${esc(p.from)}</span></label>`).join('')}</div>` : '';
    $$('#agesBox [data-age]').forEach((el) => el.addEventListener('input', () => { state.ageEdits[el.dataset.age] = el.value; state.result3 = null; $('#res3').innerHTML = ''; renderMake(); }));
  }

  async function run3() {
    const out = $('#res3');
    if (!state.yUsers && !state.ySupport) { out.innerHTML = '<p class="bad small">연간 기록 파일(이용자현황 / 학업·자립·법률·의료지원)을 먼저 넣어 주세요.</p>'; return; }
    out.innerHTML = '<p class="muted">만드는 중…</p>';
    try {
      if (!state.result) await run();
      const { year, month } = state.result;
      const { ms, me } = ymRange();
      const det = await Step1.residentsDetailFromBuffer(state.result.buffer);
      const ageOf = (n, fb) => { const v = state.ageEdits[n] ?? state.prevAges?.[n] ?? fb; return v === '' || v == null ? null : Number(v); };
      const order = Object.keys(state.prevAges || {});
      const people = det.left.filter((e) => e.inDate <= me && (!e.end || e.end >= ms))
        .map((e) => ({ name: e.name, age: ageOf(e.name, e.age), inDate: e.inDate, end: e.end }))
        .sort((a, b) => ((order.indexOf(a.name) + 1 || 999) - (order.indexOf(b.name) + 1 || 999)) || (a.inDate < b.inDate ? -1 : 1));
      const admits = det.left.filter((e) => e.inDate >= ms && e.inDate <= me).map((e) => ({ name: e.name, age: ageOf(e.name, e.age), cause: e.cause }));
      const leaves = det.right.filter((e) => e.outDate >= ms && e.outDate <= me).map((e) => ({ name: e.name, reason: e.reason, indep: e.indep }));
      const ages = Object.fromEntries(people.map((p) => [p.name, p.age]));
      const links = [], notes = [];
      if (state.yUsers) {
        const r = await Yearly.buildUsers(state.yUsers.file, year, month, people, admits, leaves);
        links.push([r.buffer, state.yUsers.file.name, 'users']); notes.push(...r.notes);
      }
      if (state.ySupport) {
        const r = await Yearly.buildSupport(state.ySupport.file, year, month, state.result.sessions, ages, { overrides: dmemLoad() });
        links.push([r.buffer, state.ySupport.file.name, 'support']); notes.push(...r.notes);
        notes.unshift(`지원 내역 ${month}월: ` + Object.entries(r.counts).map(([k, v]) => `${k} ${v}건`).join(', '));
      }
      state.result3 = true;
      const kept = links.map(([buf, name, kind]) => ymemSave(kind, name, buf, year, month)).every(Boolean);
      notes.push(kept ? `이 PC가 ${month}월까지 채운 연간 기록 파일을 기억했어요 — 다음 달엔 개인 파일만 넣으면 돼요` : '이 브라우저에는 연간 기록 파일을 기억할 수 없어요 — 내려받은 파일을 다음 달에 넣어 주세요');
      out.innerHTML = links.map(([buf, name]) => `<a class="btn dl" style="margin:0 6px 6px 0" href="${URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))}" download="${esc(name)}">⬇ ${esc(name)}</a>`).join('')
        + `<p class="muted small" style="margin:4px 0 0">넣은 파일에 ${month}월 시트·묶음을 채운 새 파일이에요. 원래 파일은 바뀌지 않아요.</p>`
        + (notes.length ? `<details open><summary>안내 ${notes.length}건</summary>${list(notes)}</details>` : '');
      state.result3Files = links;
    } catch (e) {
      console.error(e);
      out.innerHTML = `<p class="bad small">만들지 못했어요: ${esc(e.message)}</p>`;
      throw e;
    } finally { renderMake(); }
  }

  // ── 시작 ────────────────────────────────────────────────
  function init() {
    const now = new Date();
    const y = $('#year'), m = $('#month');
    for (let i = now.getFullYear() - 2; i <= now.getFullYear() + 1; i++) y.add(new Option(`${i}년`, i));
    for (let i = 1; i <= 12; i++) m.add(new Option(`${i}월`, i));
    const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    y.value = last.getFullYear(); m.value = last.getMonth() + 1;
    [y, m].forEach((el) => el.addEventListener('change', () => { pickTemplate(); reload(); }));

    const dz = $('#drop');
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('over'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('over'));
    dz.addEventListener('drop', (e) => { e.preventDefault(); dz.classList.remove('over'); addFiles([...e.dataTransfer.files]); });
    $('#fileInput').addEventListener('change', (e) => { addFiles([...e.target.files]); e.target.value = ''; });
    $('#clear').addEventListener('click', () => {
      Object.assign(state, { personal: [], templates: [], parsed: [], info: null, moves: [], rosterFile: null, roster: null, logTpl: null, hwpWarn: false, outreachFile: null, outreach: null, outreachEdits: {}, manualEdits: {}, aftercareFile: null, aftercare: null, usersFile: null, supportFile: null, prevAges: {}, ageEdits: {} });
      state.yUsers = yearlyFile('users'); state.ySupport = yearlyFile('support');
      clearResults(); renderAll();
    });
    $('#addIn').addEventListener('click', () => addManualMove('입소'));
    $('#addOut').addEventListener('click', () => addManualMove('퇴소'));
    $('#make1').addEventListener('click', () => { if (!blockIfNotReady()) { $('#msg').innerHTML = ''; run().catch(() => {}); } });
    $('#make2').addEventListener('click', () => { if (!blockIfNotReady()) { $('#msg').innerHTML = ''; run2().catch(() => {}); } });
    $('#make3').addEventListener('click', () => { if (!blockIfNotReady()) { $('#msg').innerHTML = ''; run3().catch(() => {}); } });
    $('#makeAll').addEventListener('click', runAll);
    RulesUI.init({
      getSessions: () => state.sessions || [],
      getRoster: () => (state.roster && !state.roster.error ? state.roster.roster : null),
      getOutreach: (ds) => extraLogLines()?.[ds] || null,
      getYM: ym,
      onChange: () => { state.result2 = null; $('#res2').innerHTML = ''; renderMake(); renderSteps(); },   // 규칙이 바뀌면 일지는 다시 만들어야 함
    });
    rulesReady = true;
    renderAll();
  }

  window.App = { addFiles, run, run2, runAll, state, reload };
  document.addEventListener('DOMContentLoaded', init);
})();
