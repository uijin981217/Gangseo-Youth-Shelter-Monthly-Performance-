/* 이름 없는 원본 파일(실행목록[…].xlsx)에 아이 이름 추천.
   원본에는 아이 정보가 없어서 단서로 추측하고, 사람이 확인·변경합니다.
   단서: ① 개인 기록 제목에 나온 이름  ② 기록 시작·끝 날짜와 입소일·퇴소일  ③ 남은 사람 */
(function (global) {
  'use strict';
  const md = (d) => `${Number(d.slice(5, 7))}/${Number(d.slice(8, 10))}`;
  const addDays = (ds, n) => {                // 현지 날짜로 계산 (UTC로 바꾸면 하루 밀림)
    const d = new Date(Number(ds.slice(0, 4)), Number(ds.slice(5, 7)) - 1, Number(ds.slice(8, 10)) + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  function score(file, cand, monthStart, monthEnd) {
    let s = 0; const why = [];
    const own = file.records.filter((r) => !r.group);
    const hits = own.filter((r) => String(r.title).includes(cand.name)).length;
    if (hits) { s += Math.min(30, hits * 3); why.push(`제목에 이름 ${hits}번`); }
    const dates = file.records.map((r) => r.date).sort();
    if (dates.length) {
      const first = dates[0], last = dates[dates.length - 1];
      if (cand.end && cand.end >= monthStart && cand.end <= monthEnd) {
        if (last === cand.end) { s += 8; why.push(`기록이 퇴소일(${md(cand.end)})에 끝남`); }
        else if (last > addDays(cand.end, 1)) s -= 8;            // 퇴소 뒤에도 기록 → 아닐 가능성
        else if (last < addDays(cand.end, -3)) s -= 2;
      } else if (!cand.end && last < addDays(monthEnd, -5)) s -= 3;   // 계속 있는데 기록이 일찍 끝남
      if (cand.inDate && cand.inDate >= monthStart && cand.inDate <= monthEnd) {
        if (first === cand.inDate) { s += 8; why.push(`기록이 입소일(${md(cand.inDate)})에 시작`); }
        else if (first < addDays(cand.inDate, -1)) s -= 8;
      }
    }
    return { s, why };
  }

  /**
   * files: [{ id, records }]  — 이름을 아직 안 정한 파일
   * cands: [{ name, inDate, end }] — 그 달 입소생 후보
   * taken: 이미 다른 파일에 쓰인 이름들
   * → Map(id → { name, reason })
   */
  function suggest(files, cands, taken, year, month) {
    const p2 = (n) => String(n).padStart(2, '0');
    const monthStart = `${year}-${p2(month)}-01`, monthEnd = `${year}-${p2(month)}-${p2(new Date(year, month, 0).getDate())}`;
    const free = cands.filter((c) => !taken.includes(c.name));
    const pairs = [];
    for (const f of files) for (const c of free) { const { s, why } = score(f, c, monthStart, monthEnd); if (s > 0) pairs.push({ f, c, s, why }); }
    pairs.sort((a, b) => b.s - a.s);
    const out = new Map(), usedNames = new Set();
    for (const p of pairs) {
      if (out.has(p.f.id) || usedNames.has(p.c.name)) continue;
      out.set(p.f.id, { name: p.c.name, reason: p.why.join(', ') });
      usedNames.add(p.c.name);
    }
    const restFiles = files.filter((f) => !out.has(f.id)), restNames = free.filter((c) => !usedNames.has(c.name));
    if (restFiles.length === 1 && restNames.length === 1) out.set(restFiles[0].id, { name: restNames[0].name, reason: '남은 사람' });
    return out;
  }

  global.Naming = { suggest };
})(window);
