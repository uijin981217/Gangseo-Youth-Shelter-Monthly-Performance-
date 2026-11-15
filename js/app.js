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
  };
  const ym = () => ({ year: Number($('#year').value), month: Number($('#month').value) });

  // ── 파일 받기 ───────────────────────────────────────────
  async function addFiles(fileList) {
    for (const f of fileList) {
      if (/\.hwpx$/i.test(f.name)) { state.logTpl = f; state.hwpWarn = false; continue; }
      if (/\.hwp$/i.test(f.name)) { state.hwpWarn = true; continue; }
      if (!/\.xlsx$/i.test(f.name) || f.name.startsWith('~$')) continue;
      if (Roster.isRosterFileName(f.name)) { state.rosterFile = f; continue; }
      if (Step1.isSummaryFileName(f.name)) state.templates = state.templates.filter((t) => t.name !== f.name).concat(f);
      else state.personal = state.personal.filter((p) => p.name !== f.name).concat(f);
    }
    guessPeriod();
    pickTemplate();
    await reload();
  }

  function guessPeriod() {
    const months = state.personal.map((f) => Step1.parsePersonalName(f.name).month).filter(Boolean);
    if (months.length) {
      const freq = {}; months.forEach((m) => (freq[m] = (freq[m] || 0) + 1));
      $('#month').value = Number(Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]);
    }
    for (const t of state.templates) { const y = t.name.match(/(\d{4})\s*년/); if (y) { $('#year').value = y[1]; break; } }
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
      try { state.parsed.push(await Step1.readPersonal(f, year, month)); }
      catch (e) { state.parsed.push({ person: Step1.parsePersonalName(f.name).person, records: [], warnings: [`[${f.name}] 읽지 못함: ${e.message}`] }); }
    }
    const tpl = state.templates[state.templateIdx];
    state.info = null;
    if (tpl) {
      try { state.info = await Step1.inspectTemplate(tpl, year, month); }
      catch (e) { state.info = { error: e.message, manual: [], residents: [], admissions: [], discharges: [] }; }
    }
    state.roster = null;
    if (state.rosterFile) {
      try { state.roster = await Roster.parseRoster(state.rosterFile, year, month); }
      catch (e) { state.roster = { error: e.message }; }
    }
    state.sessions = Step1.buildSessions(state.parsed.flatMap((p) => p.records));   // 규칙 미리보기용
    rebuildMoves();
    renderAll();
  }

  function renderAll() { renderSlots(); renderMoves(); renderCheck(); renderManual(); renderMake(); renderSteps(); if (rulesReady) RulesUI.render(); }
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
    slot('#slotPersonal', ICON.users, '개인 파일', p.length ? badge('ok', `${p.length}개`) : badge('mute', '필요'),
      `예: 홍길동 ${month}월.xlsx`,
      p.map((f) => `<span class="chip">${esc(Step1.parsePersonalName(f.name).person)}<button class="x" title="빼기" data-rm-p="${esc(f.name)}">×</button></span>`).join(''), !p.length);

    const t = state.templates;
    const tplName = t[state.templateIdx]?.name || '';
    const kind = !t.length ? badge('mute', '필요') : new RegExp(`0?${month}\\s*월`).test(tplName) ? badge('ok', '이번 달 파일') : badge('ok', '지난달 파일');
    slot('#slotSummary', ICON.sheet, '안전망 실적', kind, `예: 2026년 n월 안전망 실적.xlsx (지난달 것)`,
      t.length > 1 ? t.map((f, i) => `<label class="pick"><input type="radio" name="tpl" value="${i}" ${i === state.templateIdx ? 'checked' : ''}> ${esc(f.name)}</label>`).join('')
        : t.length ? `${esc(tplName)} <button class="x" title="빼기" data-rm-t="0">×</button>` : '', !t.length);

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

    $$('[data-rm-p]').forEach((b) => b.addEventListener('click', () => { state.personal = state.personal.filter((f) => f.name !== b.dataset.rmP); reload(); }));
    $$('[data-rm-t]').forEach((b) => b.addEventListener('click', () => { state.templates = []; reload(); }));
    $$('input[name=tpl]').forEach((el) => el.addEventListener('change', () => { state.templateIdx = Number(el.value); reload(); }));
    $('#rmRoster')?.addEventListener('click', () => { state.rosterFile = null; reload(); });
    $('#rmLog')?.addEventListener('click', () => { state.logTpl = null; renderAll(); });
    $('#fileCount').textContent = `개인 ${p.length} · 실적 ${t.length} · 근무표 ${state.rosterFile ? 1 : 0} · 일지 양식 ${state.logTpl ? 1 : 0}`;
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
    const got = new Set(state.parsed.map((p) => p.person));
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
    tbody.innerHTML = info.manual.map((m) => `
      <tr><td>${esc(m.label)} <span class="muted small">(${m.row}행)</span></td>
      <td><input type="number" min="0" data-row="${m.row}" data-k="sessions" value="${esc(m.sessions)}" ${m.sessionsIsFormula ? 'disabled title="병합되었거나 수식이 있는 칸"' : ''}></td>
      <td><input type="number" min="0" data-row="${m.row}" data-k="persons" value="${esc(m.persons)}" ${m.personsIsFormula ? 'disabled title="병합되었거나 수식이 있는 칸"' : ''}></td></tr>`).join('');
    $$('#manualBody input').forEach((el) => el.addEventListener('input', () => { clearResults(); renderManualSummary(); }));
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
  const ready = () => state.personal.length > 0 && state.templates.length > 0;
  function renderSteps() {
    const s1 = ready(), s3 = !!(state.result || state.result2);
    $$('#steps li').forEach((li) => {
      const n = Number(li.dataset.s);
      li.className = n === 1 ? (s1 ? 'done' : 'on') : n === 2 ? (s3 ? 'done' : s1 ? 'on' : '') : (s3 ? 'done' : s1 ? 'on' : '');
    });
  }
  function renderMake() {
    const need = !state.personal.length ? '개인 파일 필요' : !state.templates.length ? '실적 파일 필요' : '';
    $('#st1').innerHTML = state.result ? badge('ok', '완료') : need ? badge('mute', need) : badge('ok', '준비됨');
    $('#st2').innerHTML = state.result2 ? badge('ok', '완료') : need ? badge('mute', need) : badge('ok', '준비됨');
    const roster = state.roster && !state.roster.error;
    $('#desc2').textContent = `날짜별 표 · 입소생 · 영역별 내용 · 근무자 ${roster ? '(근무표로 채움)' : '(근무표 없으면 비어 있음)'}`;
  }
  function clearResults() {
    state.result = null; state.result2 = null;
    $('#res1').innerHTML = ''; $('#res2').innerHTML = ''; $('#msg').innerHTML = '';
    renderMake(); renderSteps();
  }
  function blockIfNotReady() {
    if (ready()) return false;
    $('#msg').innerHTML = `<span class="bad">${!state.personal.length ? '개인 파일' : '안전망 실적 파일'}을 먼저 넣어 주세요.</span>`;
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
      const res = await Step1.buildWorkbook(state.templates[state.templateIdx], sessions, agg, year, month, manualValues(), moves);
      res.unmapped.forEach((u) => warnings.push(`'실적 정리'에 맞는 행이 없는 서비스: ${u.key} (${u.sessions}회기/${u.persons}명) — 직접 확인 필요`));
      moves.filter((m) => moveMissing(m)).forEach((m) => warnings.push(`${m.name} ${m.type}: ${m.type === '퇴소' ? '퇴소사유·자립' : '만나이·가출원인·학업현황'} 칸이 비어 있어요`));
      state.result = { ...res, sessions, agg, records: all, year, month };
      const url = URL.createObjectURL(new Blob([res.buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const rev = Object.entries(Step1.ROW_MAP).map(([row, k]) => [Number(row), k, agg[k]]).filter((x) => x[2]);
      out.innerHTML = `
        <a class="btn dl" href="${url}" download="${esc(res.fileName)}">⬇ ${esc(res.fileName)}</a>
        <p class="muted small" style="margin:6px 0 0">개인 기록 ${all.length}건 → 목록 ${res.lineCount}줄 · 엑셀에서 열면 합계가 다시 계산돼요</p>
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
      const res = await Step2.buildLog(tpl.file, state.result.sessions, residents, year, month, { roster, rules: RulesUI.rules });
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
    try { await run(); await run2(); $('#msg').innerHTML = '<span class="good">두 파일을 만들었어요. 위에서 내려받으세요.</span>'; }
    catch { $('#msg').innerHTML = '<span class="bad">만들지 못한 파일이 있어요. 위 안내를 확인해 주세요.</span>'; }
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
      Object.assign(state, { personal: [], templates: [], parsed: [], info: null, moves: [], rosterFile: null, roster: null, logTpl: null, hwpWarn: false });
      clearResults(); renderAll();
    });
    $('#addIn').addEventListener('click', () => addManualMove('입소'));
    $('#addOut').addEventListener('click', () => addManualMove('퇴소'));
    $('#make1').addEventListener('click', () => { if (!blockIfNotReady()) { $('#msg').innerHTML = ''; run().catch(() => {}); } });
    $('#make2').addEventListener('click', () => { if (!blockIfNotReady()) { $('#msg').innerHTML = ''; run2().catch(() => {}); } });
    $('#makeAll').addEventListener('click', runAll);
    RulesUI.init({
      getSessions: () => state.sessions || [],
      getRoster: () => (state.roster && !state.roster.error ? state.roster.roster : null),
      getYM: ym,
      onChange: () => { state.result2 = null; $('#res2').innerHTML = ''; renderMake(); renderSteps(); },   // 규칙이 바뀌면 일지는 다시 만들어야 함
    });
    rulesReady = true;
    renderAll();
  }

  window.App = { addFiles, run, run2, runAll, state, reload };
  document.addEventListener('DOMContentLoaded', init);
})();
