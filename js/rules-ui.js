/* 화면: 운영일지 작성 규칙 + 일지에 직접 넣을 내용 */
(function (global) {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const badge = (cls, text) => `<span class="badge b-${cls}">${esc(text)}</span>`;
  const DOWS = ['일', '월', '화', '수', '목', '금', '토'];
  const COMMON = [
    ['personLine', '한 사람 줄', '사람마다 그날 항목을 묶은 줄'],
    ['groupLine', '단체 활동 줄', '여러 명이 함께 받은 서비스'],
    ['staffLine', '근무자 칸', '근무표에서 가져온 근무 한 칸'],
  ];

  let hooks = null;
  let rules = Rules.load();
  let showAll = false;
  let lastEditor = null;

  // ── 자리표시 편집기: '{이름}' ↔ 파란 덩어리 ─────────────────
  function toHTML(tpl) {
    return esc(tpl).replace(/\{([^{}]+)\}/g, (m, t) => `<span class="tk" contenteditable="false" data-t="${t}">${t}</span>`);
  }
  function fromEditor(el) {
    let s = '';
    el.childNodes.forEach(function walk(n) {
      if (n.nodeType === 3) s += n.textContent;
      else if (n.dataset && n.dataset.t) s += `{${n.dataset.t}}`;
      else if (n.nodeName === 'BR') s += '';
      else n.childNodes.forEach(walk);
    });
    return s.replace(/ /g, ' ').replace(/\n/g, ' ');
  }
  function insertToken(el, t) {
    el.focus();
    const sel = window.getSelection();
    let range = sel.rangeCount ? sel.getRangeAt(0) : null;
    if (!range || !el.contains(range.commonAncestorContainer)) { range = document.createRange(); range.selectNodeContents(el); range.collapse(false); }
    range.deleteContents();
    const span = document.createElement('span');
    span.className = 'tk'; span.contentEditable = 'false'; span.dataset.t = t; span.textContent = t;
    range.insertNode(span);
    range.setStartAfter(span); range.collapse(true);
    sel.removeAllRanges(); sel.addRange(range);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function showTokens(el) {
    lastEditor = el;
    const kind = el.dataset.kind;
    const list = kind === 'svc' ? [...Rules.TOKENS.item, ...Rules.TOKENS.agg] : Rules.TOKENS[kind] || [];
    $('#tokBar').innerHTML = `<span class="muted small">넣을 자리:</span>` + list.map(([t, d]) => `<button type="button" data-tok="${t}" title="${esc(d)}">${t}<small>${esc(d)}</small></button>`).join('');
    $$('#tokBar [data-tok]').forEach((b) => {
      b.addEventListener('mousedown', (e) => e.preventDefault());       // 커서 위치 유지
      b.addEventListener('click', () => lastEditor && insertToken(lastEditor, b.dataset.tok));
    });
  }
  function wireEditor(el, onChange) {
    el.addEventListener('focus', () => showTokens(el));
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });
    el.addEventListener('paste', (e) => { e.preventDefault(); document.execCommand('insertText', false, (e.clipboardData || window.clipboardData).getData('text').replace(/\s+/g, ' ')); });
    el.addEventListener('input', () => onChange(fromEditor(el)));
  }

  // ── 저장 · 알림 ─────────────────────────────────────────
  let saveTimer = null;
  function changed() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const ok = Rules.save(rules);
      $('#rulesMsg').innerHTML = ok ? '<span class="good">저장됨</span>' : '<span class="warn">이 브라우저에는 저장할 수 없어요 — 「규칙 파일 내보내기」로 보관해 주세요</span>';
    }, 300);
    hooks.onChange();
    renderSummary(); renderExamples(); renderPreview();
  }

  // ── 규칙 표 ─────────────────────────────────────────────
  function sessions() { return hooks.getSessions(); }
  function counts() { const c = {}; for (const s of sessions()) c[s.key] = (c[s.key] || 0) + 1; return c; }

  function render() {
    const c = counts();
    const known = Object.keys(rules.services);
    const unknown = Object.keys(c).filter((k) => !known.includes(k));
    const used = known.filter((k) => c[k]);
    const keys = [...unknown, ...(showAll ? known : used.length ? used : known)];
    const secOpts = (cur) => [...Rules.SECTIONS, Rules.SKIP].map((s) => `<option ${s === cur ? 'selected' : ''}>${s}</option>`).join('');
    $('#rulesBody').innerHTML = keys.map((k) => {
      const r = rules.services[k] || { name: sessions().find((s) => s.key === k)?.svc || k, section: '기타사업', format: '{서비스}_{제목}' };
      const isNew = !rules.services[k];
      const custom = !Rules.defaults().services[k] && rules.services[k];
      return `<tr data-key="${esc(k)}" class="${c[k] ? '' : 'unused'}">
        <td>${esc(r.name)}${isNew ? '<span class="newtag">새 서비스</span>' : ''}${c[k] ? ` <span class="muted small">${c[k]}건</span>` : ''}${custom ? ` <button class="link danger" data-del-svc="${esc(k)}">삭제</button>` : ''}</td>
        <td><select data-sec>${secOpts(r.section)}</select></td>
        <td><div class="tpl" contenteditable="true" data-kind="svc" spellcheck="false">${toHTML(r.format)}</div></td>
        <td class="ex" data-ex></td></tr>`;
    }).join('') || '<tr><td colspan="4" class="muted small">개인 파일을 넣으면 이번 달 서비스가 나와요.</td></tr>';
    const hidden = known.length - used.length;
    $('#toggleAllRules').textContent = showAll ? '이번 달 서비스만 보기' : hidden > 0 ? `다른 서비스도 보기 (${hidden}개)` : '';

    $$('#rulesBody tr[data-key]').forEach((tr) => {
      const k = tr.dataset.key;
      const ensure = () => (rules.services[k] ||= { name: sessions().find((s) => s.key === k)?.svc || k, section: '기타사업', format: '{서비스}_{제목}' });
      tr.querySelector('[data-sec]').addEventListener('change', (e) => { ensure().section = e.target.value; tr.querySelector('.newtag')?.remove(); changed(); });
      wireEditor(tr.querySelector('.tpl'), (v) => { ensure().format = v; tr.querySelector('.newtag')?.remove(); changed(); });
      tr.querySelector('[data-del-svc]')?.addEventListener('click', () => { delete rules.services[k]; render(); changed(); });
    });

    $('#commonBody').innerHTML = COMMON.map(([k, label, desc]) => `<tr data-common="${k}"><td>${label}<div class="muted small">${desc}</div></td><td colspan="2"><div class="tpl" contenteditable="true" data-kind="${k}" spellcheck="false">${toHTML(rules[k])}</div></td><td class="ex" data-ex></td></tr>`).join('');
    $$('#commonBody tr').forEach((tr) => wireEditor(tr.querySelector('.tpl'), (v) => { rules[tr.dataset.common] = v; changed(); }));

    renderExtras(); renderSummary(); renderExamples(); renderPreviewDays(); renderPreview();
  }

  function renderExamples() {
    const ss = sessions();
    $$('#rulesBody tr[data-key]').forEach((tr) => {
      const ex = Rules.exampleFor(rules, tr.dataset.key, ss);
      const r = rules.services[tr.dataset.key];
      tr.querySelector('[data-ex]').innerHTML = r && r.section === Rules.SKIP ? '<span class="muted">일지에 넣지 않음</span>'
        : !ex ? '<span class="muted">이번 달 기록 없음</span>'
        : `<span class="muted">${ex.date.slice(5)}</span> ${ex.lines.map((l) => esc(l.trim())).join('<br>')}`;
    });
    const sample = { names: ['홍길동', '김철수'], start: '9', end: '18' };
    const ex = { personLine: fillPreview(rules.personLine, { 이름: '홍길동', 항목들: '기초학습_수학 문제 풀이, 등교지도' }),
      groupLine: fillPreview(rules.groupLine, { 항목: '생활안전교육_화재교육', 인원: 7 }), staffLine: Rules.staffText(rules.staffLine, sample).trim() };
    $$('#commonBody tr').forEach((tr) => { tr.querySelector('[data-ex]').textContent = ex[tr.dataset.common]; });
  }
  const fillPreview = (fmt, v) => String(fmt).replace(/\{([^{}]+)\}/g, (m, k) => (k in v ? v[k] : m)).replace(/\s+/g, ' ').trim();

  function renderSummary() {
    const n = Rules.changedCount(rules);
    const unknown = Object.keys(counts()).filter((k) => !rules.services[k]).length;
    $('#sumRules').innerHTML = unknown ? badge('warn', `새 서비스 ${unknown}개 · 칸 정하기`) : n ? badge('ok', `고친 규칙 ${n}개`) : badge('mute', '기본값');
    const { year, month } = hooks.getYM();
    const ym = `${year}-${String(month).padStart(2, '0')}`;
    const act = (rules.extras || []).filter((e) => e.text && (e.when !== 'date' || (e.date || '').startsWith(ym)));
    $('#sumExtras').innerHTML = act.length ? badge('ok', `${act.length}건`) : badge('mute', '없음');
  }

  // ── 미리보기 ────────────────────────────────────────────
  function renderPreviewDays() {
    const { year, month } = hooks.getYM();
    const days = new Date(year, month, 0).getDate();
    const sel = $('#rulePvDay');
    const cur = sel.value;
    const counts = {}; for (const s of sessions()) counts[s.date] = (counts[s.date] || 0) + 1;
    sel.innerHTML = Array.from({ length: days }, (_, i) => {
      const ds = `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`;
      return `<option value="${ds}">${month}/${i + 1} (${DOWS[new Date(year, month - 1, i + 1).getDay()]})${counts[ds] ? ` · 기록 ${counts[ds]}건` : ''}</option>`;
    }).join('');
    const firstWith = Object.keys(counts).sort()[0];
    sel.value = [...sel.options].some((o) => o.value === cur) ? cur : firstWith || sel.options[0]?.value;
  }
  function renderPreview() {
    const ds = $('#rulePvDay').value;
    if (!ds) return;
    const day = sessions().filter((s) => s.date === ds);
    const { lines } = Rules.dayLines(day, rules, ds);
    for (const [sec, ls] of Object.entries(hooks.getOutreach?.(ds) || {})) (lines[sec] ||= []).push(...ls.map((l) => ` ${l}`));
    const roster = hooks.getRoster();
    const st = roster && roster[ds] ? Roster.staffLines(roster[ds], rules.staffLine) : null;
    const secs = Object.entries(lines).filter(([, l]) => l.length).map(([k, l]) => `<div class="pv">${esc(k)}</div>${l.map((x) => `<div>${esc(x)}</div>`).join('')}`).join('');
    $('#rulePv').innerHTML = (st ? `<div class="pv">근무자</div><div>주간 ${esc(st.day || '–')}</div>${st.mid ? `<div>중간 ${esc(st.mid)}</div>` : ''}<div>야간 ${esc(st.night || '–')}</div>` : '')
      + (secs || '<div class="muted">이 날짜에 들어갈 내용이 없어요</div>');
  }

  // ── 일지에 직접 넣을 내용 ───────────────────────────────
  function renderExtras() {
    const { year, month } = hooks.getYM();
    const ym = `${year}-${String(month).padStart(2, '0')}`;
    rules.extras ||= [];
    const shown = rules.extras.filter((e) => e.when !== 'date' || !e.date || e.date.startsWith(ym));
    const hiddenN = rules.extras.length - shown.length;
    $('#extrasHidden').textContent = hiddenN ? `다른 달 날짜 항목 ${hiddenN}개는 숨겨져 있어요` : '';
    const secOpts = (cur) => Rules.EXTRA_SECTIONS.map((s) => `<option ${s === cur ? 'selected' : ''}>${s}</option>`).join('');
    $('#extrasBody').innerHTML = shown.map((e) => `<tr data-id="${e.id}">
        <td><select data-f="when"><option value="date" ${e.when === 'date' ? 'selected' : ''}>그날 하루</option><option value="daily" ${e.when === 'daily' ? 'selected' : ''}>매일</option><option value="weekly" ${e.when === 'weekly' ? 'selected' : ''}>매주</option></select></td>
        <td>${e.when === 'date' ? `<input type="date" data-f="date" value="${esc(e.date)}">`
          : e.when === 'weekly' ? `<select data-f="dow">${DOWS.map((d, i) => `<option value="${i}" ${Number(e.dow) === i ? 'selected' : ''}>${d}요일</option>`).join('')}</select>`
          : '<span class="muted small">매일</span>'}</td>
        <td><select data-f="section">${secOpts(e.section)}</select></td>
        <td><input type="text" data-f="text" value="${esc(e.text)}" placeholder="* 사후관리 – 홍길동"></td>
        <td><button class="x" title="지우기" data-del-extra>×</button></td></tr>`).join('')
      || '<tr><td colspan="5" class="muted small">아직 없어요. 「+ 줄 추가」로 넣어 보세요.</td></tr>';
    $$('#extrasBody tr[data-id]').forEach((tr) => {
      const e = rules.extras.find((x) => x.id === tr.dataset.id);
      tr.querySelectorAll('[data-f]').forEach((el) => el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => {
        e[el.dataset.f] = el.value;
        if (el.dataset.f === 'when') renderExtras();
        changed();
      }));
      tr.querySelector('[data-del-extra]').addEventListener('click', () => { rules.extras = rules.extras.filter((x) => x.id !== e.id); renderExtras(); changed(); });
    });
  }
  function addExtra() {
    const { year, month } = hooks.getYM();
    rules.extras.push({ id: Math.random().toString(36).slice(2, 10), when: 'date', date: `${year}-${String(month).padStart(2, '0')}-01`, dow: 1, section: '상담정서지원', text: '' });
    renderExtras(); changed();
    $('#extrasBody tr:last-child input[type=text]')?.focus();
  }

  // ── 서비스 추가 · 내보내기 · 가져오기 · 되돌리기 ───────────
  function addService() {
    const name = $('#newSvc').value.trim();
    if (!name) { $('#rulesMsg').innerHTML = '<span class="bad">서비스 이름을 적어 주세요</span>'; return; }
    const key = Rules.keyOf(name);
    if (!rules.services[key]) rules.services[key] = { name, section: '기타사업', format: '{서비스}_{제목}' };
    $('#newSvc').value = '';
    showAll = true; render(); changed();
    const tr = $(`#rulesBody tr[data-key="${CSS.escape(key)}"]`);
    tr?.scrollIntoView({ block: 'center' }); tr?.querySelector('select')?.focus();
    $('#rulesMsg').innerHTML = `<span class="good">'${esc(name)}' 규칙을 추가했어요. 들어갈 칸과 문장을 정해 주세요</span>`;
  }
  function exportRules() {
    const blob = new Blob([JSON.stringify(rules, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = '운영일지 작성 규칙.json'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  async function importRules(file) {
    try {
      const data = JSON.parse(await file.text());
      if (!data || data.version !== 1 || typeof data.services !== 'object') throw new Error('형식이 달라요');
      rules = Rules.merge(Rules.defaults(), data);
      render(); changed();
      $('#rulesMsg').innerHTML = '<span class="good">규칙 파일을 가져왔어요</span>';
    } catch (e) { $('#rulesMsg').innerHTML = `<span class="bad">규칙 파일을 읽지 못했어요: ${esc(e.message)}</span>`; }
  }
  function resetRules() {
    if (!confirm('작성 규칙을 기본값으로 되돌릴까요? 직접 넣은 내용(매일·매주 포함)은 그대로 둬요.')) return;
    const extras = rules.extras;
    rules = { ...Rules.defaults(), extras };
    render(); changed();
    $('#rulesMsg').innerHTML = '<span class="good">기본값으로 되돌렸어요</span>';
  }

  function init(h) {
    hooks = h;
    $('#toggleAllRules').addEventListener('click', () => { showAll = !showAll; render(); });
    $('#addSvc').addEventListener('click', addService);
    $('#newSvc').addEventListener('keydown', (e) => { if (e.key === 'Enter') addService(); });
    $('#exportRules').addEventListener('click', exportRules);
    $('#importRules').addEventListener('change', (e) => { if (e.target.files[0]) importRules(e.target.files[0]); e.target.value = ''; });
    $('#resetRules').addEventListener('click', resetRules);
    $('#addExtra').addEventListener('click', addExtra);
    $('#rulePvDay').addEventListener('change', renderPreview);
    render();
  }

  global.RulesUI = { init, render, get rules() { return rules; } };
})(window);
