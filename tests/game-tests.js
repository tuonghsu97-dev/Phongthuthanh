// Bộ test tự động cho Thành Trì Văn Minh — chạy NGAY TRONG trang game (dùng hàm/biến nội bộ của index.html).
// Cách chạy: mở game qua dev server (.claude/serve.js phục vụ thư mục này ở /__tests/), rồi trong console:
//   await import('/__tests/game-tests.js'); const r = await runGameTests();
// Kết quả: { total, passed, failed, skipped, rows: [{ id, name, status, expected, actual, feature }] }
/* global G, R, M, S, A, UI, Tut, TUT, CONFIG, BOSS, BOSSES, UPG, Music, World, genWave, spawnBoss, spawnMon, dealDamage, killMon, bossSlam,
   applyStun, rollUpgrades, pickUpgrade, soldierCap, winWave, loseWave, newGame, startGameScene, placeTower, shoot, hitstop, recalc,
   fieldHeroes, placeHeroAt, allWeapons, saveGame, loadGame, render, renderFast, game */
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms = 8000) { const t0 = performance.now(); while (performance.now() - t0 < ms) { try { if (fn()) return true; } catch (e) { } await sleep(50); } return false; }

// Khởi tạo 1 trận sạch: đặt thành, chọn thẻ, vào ban ngày
async function freshGame({ civ = 'eng', tut = false, wave = 1 } = {}) {
  if (game.scene.isActive('Game')) { game.scene.stop('Game'); await sleep(200); }
  closePanel(); World.pause(false);   // như khi người chơi về menu: không để sót bảng của trận trước
  newGame({ diff: 'normal', mut: {}, civ, zone: 7, tut });
  document.getElementById('menu').classList.add('hide');
  startGameScene();
  await waitFor(() => G.phase === 'place' && R.map);
  if (tut) return;
  placeTower(R.map.spots[0]);
  await waitFor(() => G.phase === 'dawn' && R.waitCard);
  G.wave = wave; A.card(R.cards[0]);
  await waitFor(() => G.phase === 'day');
}
// vào đêm ngay với hàng đợi quái rỗng (để test tự đặt quái)
async function emptyNight() {
  World.ready(); World.ready(); await waitFor(() => G.phase === 'night');
  R.plan.q = []; R.spawnIdx = 0; for (const m of R.monsters.slice()) killMon(m, { silent: 1 });
}
const keepAlive = () => { R.phaseT = 999; };   // giữ pha đêm không hết giờ trong lúc test

const TESTS = [
  { id: 'T01', feature: 'Sửa lỗi đạn kẹt (pool)', name: 'Đạn lấy lại từ pool không đứng im trên màn hình', async run() {
    await freshGame(); await emptyNight(); keepAlive();
    const m = spawnMon('walker', R.lanes[0], false); m.hp = m.maxHp = 1e9;
    G.soldiers = 0;   // tắt lính trên tòa để chỉ đo đạn của test
    const sizes = [];
    for (let round = 0; round < 3; round++) { for (let i = 0; i < 15; i++) shoot('p_arrow', { x: R.tower.x, y: R.tower.y }, m, 600, () => { }); await sleep(1500); sizes.push(R.projPool.length); }
    const stuck = R.projPool.filter(p => p.visible && !R.projs.includes(p)).length;
    return { pass: stuck === 0 && sizes[2] === sizes[0], expected: '0 viên đạn đứng im; pool không phình thêm qua 3 lượt × 15 phát', actual: `${stuck} viên đứng im; kích thước pool sau mỗi lượt: ${sizes.join(' → ')}` };
  } },
  { id: 'T02', feature: 'Boss mỗi 5 wave', name: 'Wave 5 có boss trong kế hoạch, wave 4 không có', async run() {
    const p5 = genWave(5), p4 = genWave(4), b = p5.q.filter(e => e.boss);
    return { pass: p5.boss && b.length === 1 && !p4.boss && !p4.q.some(e => e.boss), expected: 'wave5: 1 boss; wave4: 0', actual: `wave5: ${b.length} boss (${p5.boss}); wave4: ${p4.q.filter(e => e.boss).length}` };
  } },
  { id: 'T03', feature: 'Boss mỗi 5 wave', name: 'Sinh boss: máu lớn, có thanh máu boss trên HUD', async run() {
    await freshGame({ wave: 5 }); await emptyNight(); keepAlive();
    const m = spawnBoss(R.plan.fac, R.lanes[0]); renderFast();
    const barShown = !document.getElementById('bossBar').classList.contains('hide');
    return { pass: m.boss && m.maxHp >= BOSS.hp && m.phase === 1 && barShown && Music.mode === 'boss', expected: `boss=true, HP ≥ ${BOSS.hp}, giai đoạn 1, #bossBar hiện, nhạc boss`, actual: `boss=${m.boss}, HP=${Math.round(m.maxHp)}, gđ=${m.phase}, bossBar=${barShown}, nhạc=${Music.mode}` };
  } },
  { id: 'T04', feature: 'Boss mỗi 5 wave', name: 'Boss xuống 60% máu → giai đoạn 2 và gọi thêm quái', async run() {
    const m = R.monsters.find(x => x.boss); const n0 = R.monsters.length, spd0 = m.spd;
    dealDamage(m, m.maxHp * .4 + 1, { dt: 'true' });
    return { pass: m.phase === 2 && R.monsters.length > n0 && m.spd > spd0, expected: 'giai đoạn 2, thêm quái, tốc độ tăng', actual: `gđ=${m.phase}, quái ${n0}→${R.monsters.length}, tốc ${spd0}→${m.spd.toFixed(1)}` };
  } },
  { id: 'T05', feature: 'Boss mỗi 5 wave', name: 'Đập Đất: có vòng cảnh báo; tướng trong vòng mất máu, ngoài vòng không', async run() {
    const m = R.monsters.find(x => x.boss);
    // đưa 1 tướng ra trận
    const h = G.heroes[0]; h.loc = 'field'; h.x = R.tower.x + 100; h.y = R.tower.y + 80; recalc(); World.syncHeroes();
    const rt = World.heroRT(h.uid); rt.x = m.x; rt.y = m.y; m.slamT = 0; m.stun = 0;
    const hpIn0 = rt.hp; const casting = (() => { const r = window.bossUpdate ? true : true; return r; })();
    bossUpdate(m, .016); const warned = R.warns.length === 1 && !!m.cast;
    const c = m.cast; rt.x = c.x; rt.y = c.y; bossSlam(m, c); m.cast = null; const lostIn = hpIn0 - rt.hp;
    rt.hp = rt.st.hp; const hp1 = rt.hp; rt.x = c.x + c.r + 80; rt.y = c.y; bossSlam(m, c); const lostOut = hp1 - rt.hp;
    return { pass: casting && warned && lostIn > 0 && lostOut === 0 && R.warns.length === 0, expected: 'có 1 vòng cảnh báo; trong vòng mất máu > 0; ngoài vòng mất 0', actual: `cảnh báo=${warned}; trong vòng −${Math.round(lostIn)}; ngoài vòng −${Math.round(lostOut)}` };
  } },
  { id: 'T06', feature: 'Boss mỗi 5 wave', name: 'Khống chế lên boss giảm còn 30%', async run() {
    const m = R.monsters.find(x => x.boss); m.stun = 0; applyStun(m, 2); const exp = 2 * (1 + M.cc) * BOSS.cc * (m.f === 'alien' ? 1.5 : 1);
    const ok = Math.abs(m.stun - exp) < 1e-6; m.stun = 0;
    return { pass: ok, expected: `choáng ${exp.toFixed(2)}s (2s × 30%)`, actual: `choáng ${m.stun === 0 && ok ? exp.toFixed(2) : m.stun.toFixed(2)}s` };
  } },
  { id: 'T07', feature: 'Boss mỗi 5 wave', name: 'Hạ boss: thưởng 💎🔋💰 + vũ khí, xóa cảnh báo, nhạc về đêm', async run() {
    const m = R.monsters.find(x => x.boss); const d0 = G.res.dia, c0 = G.res.core, g0 = G.res.gold, w0 = allWeapons().length + G.ground.length;
    m.slamT = 0; bossUpdate(m, .016);
    dealDamage(m, m.hp + 1e6, { dt: 'true' });
    const w1 = allWeapons().length + G.ground.length;
    return { pass: m.dead && G.res.dia - d0 >= 10 && G.res.core - c0 >= 1 && G.res.gold - g0 >= 10 && w1 === w0 + 1 && R.warns.length === 0 && Music.mode === 'night' && R.hitstop > 0,
      expected: '+10💎 +1🔋 +10💰 +1 vũ khí, 0 vòng cảnh báo, nhạc night, có khựng hình', actual: `+${G.res.dia - d0}💎 +${G.res.core - c0}🔋 +${G.res.gold - g0}💰 +${w1 - w0} vũ khí, ${R.warns.length} cảnh báo, nhạc ${Music.mode}, hitstop ${R.hitstop.toFixed(2)}` };
  } },
  { id: 'T08', feature: 'Game feel (khựng hình)', name: 'Hitstop đóng băng thời gian game rồi chạy lại', async run() {
    await sleep(500); hitstop(.4); const t0 = R.time; await sleep(150); const t1 = R.time; await sleep(700); const t2 = R.time;
    return { pass: t1 === t0 && t2 > t1, expected: 'R.time đứng yên trong lúc khựng, sau đó tăng', actual: `t0=${t0.toFixed(2)}, sau 150ms=${t1.toFixed(2)}, sau 850ms=${t2.toFixed(2)}` };
  } },
  { id: 'T09', feature: 'Game feel (số chí mạng)', name: 'Đòn chí mạng hiện số to (≥16px) có dấu !', async run() {
    const m = spawnMon('walker', R.lanes[0], false); m.hp = m.maxHp = 1e6; m.arm = 0;
    dealDamage(m, 80, { dt: 'true', crit: true });
    const f = R.floats.find(t => t.visible && /!$/.test(t.text));
    killMon(m, { silent: 1 });
    return { pass: !!f && parseInt(f.style.fontSize) >= 16, expected: 'chữ "80!" cỡ ≥16px', actual: f ? `"${f.text}" cỡ ${f.style.fontSize}` : 'không thấy số chí mạng' };
  } },
  { id: 'T10', feature: 'Nâng cấp roguelike', name: 'Thắng đêm → 3 nâng cấp khác nhau, phải chọn trước khi chọn thẻ', async run() {
    await freshGame(); await emptyNight();
    winWave(); await waitFor(() => G.phase === 'dawn');
    const offer = (R.upgOffer || []).slice(), uniq = new Set(offer).size, cards = document.querySelectorAll('#pbody .upgs .card.upg').length;
    A.card(R.cards[0]); const blocked = G.card === null || G.card === undefined;
    return { pass: offer.length === 3 && uniq === 3 && cards === 3 && blocked && G.pendUpg && G.pendUpg.length === 3, expected: '3 lựa chọn khác nhau, 3 thẻ trên bảng, chọn thẻ sự kiện bị chặn, lưu vào G.pendUpg', actual: `${offer.length} lựa chọn (${uniq} khác nhau), ${cards} thẻ, chặn thẻ=${blocked}, pendUpg=${(G.pendUpg || []).length}` };
  } },
  { id: 'T11', feature: 'Nâng cấp roguelike', name: 'Chọn nâng cấp → sang bước thẻ sự kiện, chỉ số tăng', async run() {
    const id = R.upgOffer[0]; const atk0 = M.atk; A.upg(id); const n = G.upg[id];
    const stage2 = !!document.querySelector('#pbody .cards:not(.upgs)') && !R.upgOffer && !G.pendUpg;
    pickUpgrade('sharp'); const atk1 = M.atk; pickUpgrade('sharp');
    const step = M.atk - atk1;
    return { pass: n === 1 && stage2 && Math.abs(step - .12) < 1e-9, expected: `${id} ×1, hiện Thẻ Sự Kiện, mỗi "Mũi Tên Tẩm Thép" +12% ATK`, actual: `${id} ×${n}, bước thẻ=${stage2}, +ATK mỗi lần=${(step * 100).toFixed(1)}% (atk ${atk0.toFixed(2)}→${M.atk.toFixed(2)})` };
  } },
  { id: 'T12', feature: 'Nâng cấp roguelike', name: 'Nâng cấp đã tối đa không xuất hiện lại', async run() {
    G.upg.execute = 1; let seen = 0; for (let i = 0; i < 300; i++) if (rollUpgrades(3).includes('execute')) seen++;
    return { pass: seen === 0, expected: '"Kết Liễu" (tối đa 1) xuất hiện 0/300 lần', actual: `${seen}/300 lần` };
  } },
  { id: 'T13', feature: 'Nâng cấp roguelike', name: 'Tân Binh: +1 giới hạn lính và +1 lính', async run() {
    const cap0 = soldierCap(), s0 = G.soldiers; pickUpgrade('soldier');
    return { pass: soldierCap() === cap0 + 1 && G.soldiers === Math.min(cap0 + 1, s0 + 1), expected: `giới hạn ${cap0}→${cap0 + 1}, lính ${s0}→${Math.min(cap0 + 1, s0 + 1)}`, actual: `giới hạn ${soldierCap()}, lính ${G.soldiers}` };
  } },
  { id: 'T14', feature: 'Nâng cấp roguelike', name: 'Kết Liễu không giết ngay elite/boss', async run() {
    A.card(R.cards[0]); await waitFor(() => G.phase === 'day'); await emptyNight(); keepAlive();
    const a = spawnMon('walker', R.lanes[0], false), e = spawnMon('walker', R.lanes[0], true);
    e.shield = 0; dealDamage(a, a.maxHp * .9, { dt: 'true' }); dealDamage(e, e.maxHp * .9, { dt: 'true' });
    const aDead = a.dead, eDead = e.dead; killMon(e, { silent: 1 });
    return { pass: aDead && !eDead, expected: 'quái thường dưới 12% chết ngay, elite còn sống', actual: `thường chết=${aDead}, elite chết=${eDead}` };
  } },
  { id: 'T15', feature: 'Nhạc nền', name: 'Nhạc đổi theo pha; thua wave thì tắt', async run() {
    const night = Music.mode; G.lives = 5; loseWave(); const lose = Music.mode;
    A.lose('stay'); await waitFor(() => G.phase === 'dawn'); const dawn = Music.mode;
    return { pass: night === 'night' && lose === null && dawn === 'day', expected: 'đêm: night → thua: tắt → bình minh: day', actual: `${night} → ${lose} → ${dawn}` };
  } },
  { id: 'T16', feature: 'Sửa lỗi kẹt bình minh', name: 'Mở menu ☰ lúc chọn thẻ rồi Tiếp tục → bảng thẻ hiện lại', async run() {
    A.escMenu(); const esc = UI.panel; A.resume(); const back = UI.panel, cardsShown = !!document.querySelector('#pbody .cards');
    return { pass: esc === 'esc' && back === 'cards' && cardsShown, expected: 'esc → cards (bảng thẻ hiện lại)', actual: `${esc} → ${back}, thẻ hiện=${cardsShown}` };
  } },
  { id: 'T17', feature: 'Tutorial khóa cứng', name: 'Chỉ cho bấm đúng mục tiêu; chặn nút khác và phím tắt', async run() {
    await freshGame({ tut: true }); await waitFor(() => Tut.cur && Tut.cur.box);
    const cv = document.querySelector('#game canvas'), b = Tut.cur.box, wr = document.getElementById('wrap').getBoundingClientRect(), sc = UI.scale || 1;
    const at = (x, y, btn = 0) => ({ type: 'pointerdown', target: cv, clientX: wr.left + x * sc, clientY: wr.top + y * sc, button: btn });
    const inside = Tut.allow(at(b.x + b.w / 2, b.y + b.h / 2)), outside = Tut.allow(at(b.x + b.w / 2 + 200, b.y + b.h / 2)), rightIn = Tut.allow(at(b.x + b.w / 2, b.y + b.h / 2, 2));
    const btn = Tut.allow({ type: 'click', target: document.querySelector('#btnRow [data-arg="shop"]') }), coach = Tut.allow({ type: 'click', target: document.querySelector('#coach .cSkip') });
    const before = UI.panel; dispatchEvent(new KeyboardEvent('keydown', { key: 'r', bubbles: true })); await sleep(100);
    return { pass: before === null && inside && !outside && !rightIn && !btn && coach && !UI.panel, expected: 'trong vòng: cho; ngoài vòng/chuột phải/nút khác/phím R: chặn; hộp hướng dẫn: cho', actual: `trong=${inside}, ngoài=${outside}, phải=${rightIn}, nút=${btn}, hộp=${coach}, R mở bảng=${!!UI.panel}` };
  } },
  { id: 'T18', feature: 'Tutorial khóa cứng', name: 'Lời dặn đổi theo từng cú bấm (đặt tướng: ✕ → hàng chờ → 🚩 → bản đồ)', async run() {
    placeTower(R.map.spots[0]); await waitFor(() => G.phase === 'dawn' && R.waitCard); A.card(R.cards[0]); await waitFor(() => G.phase === 'day');
    while (G.tut.i < TUT.findIndex(s => s.t === 'Đưa tướng ra trận')) { Tut.next(); await sleep(150); }
    const txt = () => document.querySelector('#coach .cText').textContent;
    openPanel('shop'); await sleep(250); const t1 = txt();
    closePanel(); render(); await sleep(250); const t2 = txt();
    openPanel('hero', G.heroes[0].uid); await sleep(250); const t3 = txt();
    closePanel(); World.placeHeroMode(G.heroes[0].uid); await sleep(250); const t4 = txt(); const tgtWorld = !!(Tut.cur.box && Tut.cur.box.world);
    return { pass: /✕/.test(t1) && /Hàng chờ/.test(t2) && /Đặt ra ngoài/.test(t3) && /bản đồ/.test(t4) && tgtWorld, expected: '4 lời dặn khác nhau đúng thứ tự, bước cuối chỉ vào bản đồ', actual: [t1, t2, t3, t4].map(s => s.slice(0, 32)).join(' | ') + ` | map=${tgtWorld}` };
  } },
  { id: 'T19', feature: 'Hồi quy toàn trận', name: 'Chơi tự động wave 1 (x4): không lỗi JS, sang wave 2 có nâng cấp', async run() {
    Tut.end(false); await freshGame(); CONFIG.SPEED = 4; const errs0 = (window.__errs || []).length;
    const h = G.heroes[0]; placeHeroAt(h.uid, R.tower.x + 80, R.tower.y + 70);
    World.ready(); World.ready();
    const ok = await waitFor(() => G.wave === 2 && G.phase === 'dawn', 90000); CONFIG.SPEED = 1;
    const errs = (window.__errs || []).slice(errs0);
    return { pass: ok && errs.length === 0 && (R.upgOffer || []).length === 3, expected: 'sang wave 2, 0 lỗi JS, có 3 nâng cấp', actual: `wave=${G.wave}, pha=${G.phase}, lỗi JS=${errs.length}${errs.length ? ' (' + errs[0] + ')' : ''}, nâng cấp=${(R.upgOffer || []).length}` };
  } },
  { id: 'T20', feature: 'Hồi quy toàn trận', name: 'Wave 5 thật: boss xuất hiện, hạ boss → thắng bản test', async run() {
    await freshGame({ wave: 5 }); CONFIG.SPEED = 4; const errs0 = (window.__errs || []).length;
    for (let i = 0; i < 5; i++) { pickUpgrade('sharp'); pickUpgrade('walls'); pickUpgrade('armor'); } G.soldiers = soldierCap(); G.tower.hp = 1e9;   // test luồng, không test cân bằng
    World.ready(); World.ready(); await waitFor(() => G.phase === 'night');
    const spawned = await waitFor(() => R.monsters.some(m => m.boss), 60000);
    const b = R.monsters.find(m => m.boss); if (b) { b.hp = Math.min(b.hp, 50); }   // rút ngắn: chỉ kiểm luồng kết thúc
    const won = await waitFor(() => !document.getElementById('menu').classList.contains('hide') && /HOÀN THÀNH/.test(document.getElementById('menu').textContent), 90000);
    CONFIG.SPEED = 1; const errs = (window.__errs || []).slice(errs0);
    return { pass: spawned && won && errs.length === 0, expected: 'boss xuất hiện, màn "HOÀN THÀNH BẢN TEST", 0 lỗi JS', actual: `boss=${spawned}, thắng=${won}, lỗi JS=${errs.length}${errs.length ? ' (' + errs[0] + ')' : ''}` };
  } },
];

window.runGameTests = async function (only) {
  window.__errs = window.__errs || []; if (!window.__errHook) { window.__errHook = 1; addEventListener('error', e => __errs.push(String(e.message))); }
  const rows = [];
  for (const t of TESTS) {
    if (only && !only.includes(t.id)) { rows.push({ id: t.id, name: t.name, feature: t.feature, status: 'SKIP', expected: '', actual: '' }); continue; }
    try { const r = await t.run(); rows.push({ id: t.id, name: t.name, feature: t.feature, status: r.pass ? 'PASS' : 'FAIL', expected: r.expected, actual: r.actual }); }
    catch (e) { rows.push({ id: t.id, name: t.name, feature: t.feature, status: 'FAIL', expected: '(không lỗi)', actual: 'Exception: ' + (e && e.message || e) }); }
  }
  CONFIG.SPEED = 1;
  return { at: new Date().toISOString(), total: rows.length, passed: rows.filter(r => r.status === 'PASS').length, failed: rows.filter(r => r.status === 'FAIL').length, skipped: rows.filter(r => r.status === 'SKIP').length, rows };
};
export { };
