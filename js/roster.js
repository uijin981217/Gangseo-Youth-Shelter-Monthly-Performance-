/* 근무표 엑셀 → 날짜별 근무자 (주간·중간·야간)
   양식: 요일 머리줄 아래로 [날짜 줄 + 근무 시간 줄 3개]가 주마다 반복.
   병합된 칸의 뜻: 09~18 칸이 12~21 칸까지 합쳐짐 → 주간 9시~21시(공휴일)
                   12~21 칸이 21~09 칸까지 합쳐짐 → 야간(주말 18시~9시) */
(function (global) {
  'use strict';
  const text = (v) => (global.Step1 ? Step1.cellText(v) : String(v ?? '')).trim();
  const isSlave = (c) => c.isMerged && c.master && c.master.address !== c.address;
  const masterOf = (c) => (isSlave(c) ? c.master : c);
  const hour = (s) => String(Number(s));           // '09' → '9'

  function parseShiftLabel(s) {                     // '09:00~18:00' → {start:'9', end:'18'}
    const m = String(s).replace(/\s/g, '').match(/^(\d{1,2})[:시.]?\d{0,2}~(?:익일)?(\d{1,2})[:시.]?\d{0,2}/);
    return m ? { start: hour(m[1]), end: hour(m[2]) } : null;
  }
  const splitNames = (s) => s.split(/[\/,·\s]+/).map((x) => x.trim()).filter(Boolean);

  async function parseRoster(file, year, month) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await file.arrayBuffer());
    const ws = wb.worksheets.find((w) => w.rowCount > 5) || wb.worksheets[0];
    const notes = [];

    // 요일 머리줄 → 열 번호
    const DOW = ['일', '월', '화', '수', '목', '금', '토'];
    let dowCols = null;
    for (let r = 1; r <= 10 && !dowCols; r++) {
      const cols = {};
      ws.getRow(r).eachCell((c, ci) => { const t = text(c.value); if (DOW.includes(t)) cols[t] = ci; });
      if (Object.keys(cols).length === 7) dowCols = DOW.map((d) => cols[d]);
    }
    if (!dowCols) throw new Error('근무표에서 요일(일~토) 머리줄을 찾지 못했어요.');
    const labelCol = Math.min(...dowCols) - 1 || 1;

    // 아래 메모: '주말 야간근무 18시 ~익일 9시', '9월 24,25,26일 공휴일 주간근무 09시 ~21시'
    let weekendNight = { start: '18', end: '9' }, holidayDays = [];
    ws.eachRow((row) => row.eachCell((c) => {
      const t = text(c.value);
      const wn = t.match(/주말\s*야간\s*근무\s*(\d{1,2})\s*시\s*~\s*(?:익일)?\s*(\d{1,2})\s*시/);
      if (wn) weekendNight = { start: hour(wn[1]), end: hour(wn[2]) };
      const hd = t.match(/([\d,\s]+)\s*일\s*공휴일/);
      if (hd) holidayDays = hd[1].split(/[,\s]+/).filter(Boolean).map(Number);
    }));

    const days = new Date(year, month, 0).getDate();
    const roster = {};          // 'YYYY-MM-DD' → { day:{names,start,end}, mid:{...}, night:{...}, holiday }
    let weeksFound = 0;
    for (let r = 1; r <= ws.rowCount; r++) {
      // 날짜 줄: 요일 열들 중 숫자가 하나라도 있고, 아래 줄들의 첫 칸이 근무 시간
      const nums = dowCols.map((c) => { const t = text(ws.getRow(r).getCell(c).value); return /^\d{1,2}$/.test(t) ? Number(t) : null; });
      if (!nums.some((n) => n)) continue;
      const shifts = [];
      for (let k = 1; k <= 4 && shifts.length < 3; k++) {
        const lab = parseShiftLabel(text(ws.getRow(r + k).getCell(labelCol).value));
        if (lab) shifts.push({ row: r + k, ...lab });
        else if (shifts.length) break;
      }
      if (shifts.length < 3) continue;
      weeksFound++;
      const [D, M, N] = shifts;
      dowCols.forEach((col, i) => {
        const d = nums[i];
        if (!d || d > days) return;
        const cell = (row) => ws.getRow(row).getCell(col);
        const cd = cell(D.row), cm = cell(M.row), cn = cell(N.row);
        const out = { day: null, mid: null, night: null, holiday: holidayDays.includes(d) };
        // 주간 (+ 중간 칸까지 합쳐졌으면 9시~21시)
        const dayNames = splitNames(text(cd.value));
        const dayMergedIntoMid = isSlave(cm) && cm.master.address === masterOf(cd).address;
        if (dayNames.length) out.day = { names: dayNames, start: D.start, end: dayMergedIntoMid ? M.end : D.end };
        // 중간 / 주말 야간(중간 칸이 야간 칸까지 합쳐짐)
        const midMergedIntoNight = !dayMergedIntoMid && isSlave(cn) && cn.master.address === masterOf(cm).address;
        if (!dayMergedIntoMid) {
          const midNames = splitNames(text(masterOf(cm).value));
          if (midNames.length) {
            if (midMergedIntoNight) out.night = { names: midNames, start: weekendNight.start, end: weekendNight.end };
            else out.mid = { names: midNames, start: M.start, end: M.end };
          }
        }
        // 야간
        if (!midMergedIntoNight && !isSlave(cn)) {
          const nNames = splitNames(text(cn.value));
          if (nNames.length) {
            const dow = new Date(year, month - 1, d).getDay();
            const weekend = (dow === 0 || dow === 6) && !dayMergedIntoMid;
            out.night = { names: nNames, start: weekend ? weekendNight.start : N.start, end: weekend ? weekendNight.end : N.end };
          }
        }
        roster[`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`] = out;
      });
    }
    const filled = Object.keys(roster).length;
    if (!weeksFound) throw new Error('근무표에서 날짜·근무 시간 줄을 찾지 못했어요.');
    if (filled < days) notes.push(`근무표에서 ${days}일 중 ${filled}일만 찾았어요`);
    const title = text(ws.getRow(1).getCell(1).value);
    const tm = title.match(/(\d{4})\s*년\s*(\d{1,2})\s*월/);
    if (tm && (Number(tm[1]) !== year || Number(tm[2]) !== month)) notes.push(`근무표 제목이 '${title}'이에요. ${year}년 ${month}월 것이 맞는지 확인해 주세요`);
    return { roster, notes, holidays: holidayDays };
  }

  /** 일지 근무자 칸에 들어갈 글자: '홍길동, 김철수 (9시 ~ 18시)' */
  function staffLines(entry) {
    const fmt = (s) => (s ? ` ${s.names.join(', ')} (${s.start}시 ~ ${s.end}시)` : '');
    return { day: fmt(entry?.day), mid: fmt(entry?.mid), night: fmt(entry?.night) };
  }

  const isRosterFileName = (n) => /근무표/.test(n);
  global.Roster = { parseRoster, staffLines, isRosterFileName };
})(window);
