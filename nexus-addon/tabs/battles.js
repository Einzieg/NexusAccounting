// Battles tab — unified view of every combat across sources (pirate camps,
// mining pirate-raids, survey ambushes, expedition/wormhole encounters).
// Render-only: it merges the per-type recent records already in `store`, so
// there is no extra background aggregation or storage. Span = recent records.

import {
  PER_PAGE, fmt, escapeHtml, makeStatCard, store, zoneCell, dayKey,
  computeResourcesLost, combinedLost, emptyResources,
  RESOURCE_WEIGHTS, RARE_WEIGHT, EXTRA_RES_KEYS_UI, uiLabel,
} from '../common.js';

// Resource cost of a record's ship losses (destroyed + half-cost repair).
const lossCost = r => combinedLost(computeResourcesLost([r], store.ships || {}));
// Debris (ore/silicates/alloys) a battle dropped, into an emptyResources().
function addDebris(out, r) {
  out.ore += r.debris_ore || 0; out.silicates += r.debris_silicates || 0; out.alloys += r.debris_alloys || 0;
}
// Pillage loot from a raided camp: core resources + flat-stored extras.
function addPillage(out, r) {
  out.ore += r.ore || 0; out.silicates += r.silicates || 0; out.hydrogen += r.hydrogen || 0;
  for (const key of EXTRA_RES_KEYS_UI) {
    const v = r[key]; if (!v) continue;
    if (key === 'alloys') out.alloys += v; else out.rare[key] = (out.rare[key] || 0) + v;
  }
}
const RES_CORE = ['ore', 'silicates', 'hydrogen', 'alloys'];
function addRes(into, res) {
  for (const k of RES_CORE) into[k] += res[k] || 0;
  for (const [k, v] of Object.entries(res.rare || {})) into.rare[k] = (into.rare[k] || 0) + v;
}
// Weighted value: ore×1, silicates×2, hydrogen×3, alloys×5, exotics×10.
function weighted(res) {
  let t = 0;
  for (const k of RES_CORE) t += (res[k] || 0) * RESOURCE_WEIGHTS[k];
  for (const v of Object.values(res.rare || {})) t += v * RARE_WEIGHT;
  return t;
}

// Battle source → fuel_log mission type (see fuelMissionType in background.js).
const SRC_FUEL_TYPE = {
  '海盗营地': 'pirate', '采矿遇袭': 'mining', '勘测战斗': 'survey',
  '远征': 'expedition', '虫洞': 'expedition',
};
// Mean hydrogen fuel per mission of each type, from fuel_log rows the predicate
// keeps. fuel_log has no per-report id, so combat fuel is approximated as the
// average trip cost of that mission type. `inRange` reuses the Days window.
function meanFuelByType(inRange) {
  const sum = {}, cnt = {};
  for (const e of (store.fuel_log || [])) {
    if (!inRange(e.created_at)) continue;
    sum[e.type] = (sum[e.type] || 0) + (e.fuel || 0);
    cnt[e.type] = (cnt[e.type] || 0) + 1;
  }
  const mean = {};
  for (const t in sum) mean[t] = cnt[t] ? sum[t] / cnt[t] : 0;
  return mean;
}

const battleSort = { key: 'created_at', dir: -1 };
let battleFilter = 'all';
let battleView = 'all';                // View preset driving the Days window
let battleFrom = '', battleTo = '';   // Days window (local day, '' = open)
let battlePage = 1;
const expanded = new Set();

// Ship name → image URL, lazy-loaded once from the shipyard defs so expanded
// rows can show a ship icon next to each name. Resolved by name because stored
// rounds keep only names, not keys.
let shipImgByName = null;
async function loadShipImages() {
  if (shipImgByName !== null) return;
  shipImgByName = {};   // set before await so we only fetch once
  try {
    const defs = await browser.runtime.sendMessage({ type: 'GET_SHIP_DEFS' });
    for (const s of (defs.ships || [])) if (s.name && s.imageUrl) shipImgByName[s.name] = s.imageUrl;
    if (document.getElementById('battles-content')) renderBattlesTab();
  } catch { /* no login / offline — names render without icons */ }
}
// Ship image URL, trying the exact name then the base class — enemy ships come
// as faction variants ("Rogue Fighter") absent from your shipyard, but the base
// ("Fighter") is there. null when neither is known.
function shipImgUrl(name) {
  if (!shipImgByName || !name) return null;
  if (shipImgByName[name]) return shipImgByName[name];
  const base = name.replace(/^(Wormhole\s+)?(Pirate|Alien|Rogue|Elite)\s+/i, '');
  return (base !== name && shipImgByName[base]) || null;
}
// <img> HTML for a ship name; a placeholder box for ships not in your shipyard
// (e.g. wormhole "Rogue" variants). Trusted game CDN URL.
function imgHtml(name) {
  const url = shipImgUrl(name);
  if (url) return `<img src="${url}" alt="" style="width:16px;height:16px;object-fit:contain;vertical-align:middle;margin-right:3px">`;
  return `<span title="${name || '未知舰船'}" style="display:inline-block;width:16px;height:16px;border:1px solid #30363d;border-radius:3px;color:#8b949e;font-size:10px;line-height:14px;text-align:center;vertical-align:middle;margin-right:3px">?</span>`;
}

// shipDefId→qty detail → [{ name, qty }] using the ship catalog.
function detailToNames(detail) {
  return Object.entries(detail || {}).map(([id, qty]) => ({
    name: (store.ships?.[id] || {}).name || `#${id}`, qty,
  }));
}
// Wormhole encounters store no enemy roster, so rebuild the enemies you fought
// from the round log — they show up as the attacker side's kills (atk_killed =
// enemy ships you destroyed). Undercounts survivors, but names the ships
// ("Rogue Fighter", …) so they render like any other fleet.
function enemyFromRounds(rounds) {
  const m = {};
  for (const rd of (rounds || [])) for (const k of (rd.atk_killed || [])) {
    if (k.name && k.qty) m[k.name] = (m[k.name] || 0) + k.qty;
  }
  return Object.entries(m).map(([name, qty]) => ({ name, qty }));
}
// [{ key, quantity }] fleet → [{ name, qty }] via a key→def index.
function fleetToNames(fleet, byKey) {
  return (fleet || []).map(f => ({ name: f.name || (byKey[f.key] || {}).name || f.key, qty: f.quantity || 1 }));
}
// Expedition/wormhole loss array is either { shipDefId, quantity } or { key, lost }.
function rawLossToNames(arr, byKey) {
  return (arr || []).map(i => ({
    name: i.shipDefId != null ? ((store.ships?.[i.shipDefId] || {}).name || `#${i.shipDefId}`)
                              : ((byKey[i.key] || {}).name || i.key),
    qty: i.quantity ?? i.lost ?? 0,
  }));
}

// Collect + normalize every combat record from the four sources.
function collectBattles() {
  const byKey = {};
  for (const s of Object.values(store.ships || {})) if (s && s.key) byKey[s.key] = s;
  const rows = [];

  for (const r of (store.pirate_recent_reports || [])) {
    rows.push({
      key: `pirate:${r.id}`, created_at: r.created_at, source: '海盗营地',
      location: r.camp_id != null ? `营地 #${r.camp_id}` : '—', zone: r.zone, outcome: r.outcome || '—',
      lost: r.ships_lost || 0, damaged: r.ships_damaged || 0, killed: r.pirates_destroyed ?? null,
      debris: (r.debris_ore || 0) + (r.debris_alloys || 0) + (r.debris_silicates || 0),
      yourFleet: fleetToNames(r.attacker_fleet, byKey), enemyFleet: fleetToNames(r.pirate_fleet, byKey),
      lostDetail: detailToNames(r.ships_lost_detail), damagedDetail: detailToNames(r.ships_damaged_detail),
      rounds: r.rounds || [],
      cost: lossCost(r),
      debrisRes: (() => { const w = emptyResources(); addDebris(w, r); return w; })(),
      pillage: (() => { const w = emptyResources(); addPillage(w, r); return w; })(),
    });
  }
  for (const r of (store.mining_recent_reports || [])) {
    if (!r.combat_outcome) continue;   // only mining deliveries that got raided
    // Require actual combat — a round log or an enemy fleet. Ship loss alone
    // isn't proof: drill breakdowns destroy ships with no fight.
    if (!(r.rounds && r.rounds.length) && !(r.enemy_fleet && r.enemy_fleet.length)) continue;
    rows.push({
      key: `mining:${r.id}`, created_at: r.created_at, source: '采矿遇袭',
      location: r.location || r.planet || '—', zone: r.zone, outcome: r.combat_outcome,
      lost: r.ships_lost || 0, damaged: 0, killed: null, youAttacker: false,   // a raid: you defend
      debris: (r.debris_ore || 0) + (r.debris_alloys || 0) + (r.debris_silicates || 0),
      yourFleet: fleetToNames(r.your_fleet, byKey), enemyFleet: fleetToNames(r.enemy_fleet, byKey),
      lostDetail: detailToNames(r.ships_lost_detail), damagedDetail: [],
      rounds: r.rounds || [],
      // Cost = ships lost + cargo the raid stole from you.
      cost: (() => { const c = lossCost(r); addRes(c, r.stolen || {}); return c; })(),
      debrisRes: (() => { const w = emptyResources(); addDebris(w, r); return w; })(),
      pillage: emptyResources(),
    });
  }
  for (const r of (store.recent_reports || [])) {
    if (!r.combat_outcome) continue;   // only real combat — event/hazard damage isn't a battle
    rows.push({
      key: `survey:${r.id}`, created_at: r.created_at, source: '勘测战斗',
      location: r.system_name || '—', zone: r.zone, outcome: r.combat_outcome || 'ambush',
      lost: r.ships_lost || 0, damaged: r.ships_damaged || 0, killed: null,
      debris: (r.debris_ore || 0) + (r.debris_alloys || 0) + (r.debris_silicates || 0),
      yourFleet: fleetToNames(r.your_fleet, byKey), enemyFleet: fleetToNames(r.enemy_fleet, byKey),
      lostDetail: detailToNames(r.ships_lost_detail), damagedDetail: detailToNames(r.ships_damaged_detail),
      rounds: r.rounds || [],
      cost: lossCost(r),
      debrisRes: (() => { const w = emptyResources(); addDebris(w, r); return w; })(),
      pillage: emptyResources(),
    });
  }
  for (const r of (store.exp_recent_reports || [])) {
    const src = r.kind === 'wormhole' ? '虫洞' : '远征';
    // Wormhole runs carry per-encounter combat — one battle row per combat
    // encounter (clean wins included), each with its own round log + your fleet.
    // A round log means a real fight; encounters with a loss but no rounds are
    // hazard events (gravity distortion, etc.), not combat — skip them.
    if (r.encounters && r.encounters.length) {
      r.encounters.forEach((e, i) => {
        if (!(e.rounds && e.rounds.length)) return;
        rows.push({
        key: `${r.id}:${i}`, created_at: r.created_at, source: src,
        location: e.title ? `${r.location} — ${e.title}` : r.location, zone: r.zone, outcome: e.outcome || '—',
        lost: e.lost || 0, damaged: 0, killed: null, debris: null,
        yourFleet: fleetToNames(e.your_fleet, byKey), enemyFleet: enemyFromRounds(e.rounds),
        lostDetail: [], damagedDetail: [], rounds: e.rounds || [],
        cost: emptyResources(), debrisRes: emptyResources(), pillage: emptyResources(),
        });
      });
      continue;
    }
    // Expeditions / legacy records without encounter data: count only real
    // combat, inferred from the event wording (not hazard/event damage).
    if (!r.ships_lost || !COMBAT_EVENT.test(r.event || '')) continue;
    rows.push({
      key: `exp:${r.id}`, created_at: r.created_at, source: src,
      location: r.location || '—', zone: r.zone, outcome: r.event || '—',
      lost: r.ships_lost || 0, damaged: 0, killed: null, debris: null,
      yourFleet: null, enemyFleet: null,
      lostDetail: rawLossToNames(r.ships_destroyed_raw, byKey), damagedDetail: [],
      rounds: [],
      cost: emptyResources(), debrisRes: emptyResources(), pillage: emptyResources(),
    });
  }
  // Player-vs-player attacks/defences (background pvp_recent_reports).
  for (const r of (store.pvp_recent_reports || [])) {
    rows.push({
      key: `pvp:${r.id}`, created_at: r.created_at, source: 'PvP',
      location: r.opponent ? `${r.planet || '—'} 对阵 ${r.opponent}` : (r.planet || '—'),
      zone: null, outcome: r.won ? 'won' : 'lost', youAttacker: r.side === 'attacker',
      lost: r.ships_lost || 0, damaged: r.ships_damaged || 0, killed: null,
      debris: (r.debris_ore || 0) + (r.debris_alloys || 0) + (r.debris_silicates || 0),
      yourFleet: fleetToNames(r.your_fleet, byKey), enemyFleet: fleetToNames(r.enemy_fleet, byKey),
      lostDetail: detailToNames(r.ships_lost_detail), damagedDetail: detailToNames(r.ships_damaged_detail),
      rounds: r.rounds || [],
      // Loot: gained if we attacked (pillage), lost if we defended (added to cost).
      cost: (() => { const c = lossCost(r); if (r.side === 'defender') addRes(c, r.loot || {}); return c; })(),
      debrisRes: (() => { const w = emptyResources(); addDebris(w, r); return w; })(),
      pillage: (() => { const w = emptyResources(); if (r.side === 'attacker') addRes(w, r.loot || {}); return w; })(),
    });
  }
  return rows;
}

const OUTCOME_WIN = /won|win|victor|success|defender|survi/i;
const OUTCOME_LOSS = /lost|loss|defeat|destroy|attacker|fail/i;
// Expeditions carry no combat flag, so a real fight is inferred from the event
// wording — hazard/anomaly events that merely damage the fleet are not battles.
// ponytail: keyword heuristic; a combat event with no combat word slips through.
const COMBAT_EVENT = /combat|battle|ambush|attack|raid|pirate|hostile|fight|skirmish|enemy/i;
function outcomeColor(o) {
  if (OUTCOME_WIN.test(o)) return '#56d364';
  if (OUTCOME_LOSS.test(o)) return '#ff7b72';
  return '#8b949e';
}

// Download the given battle rows as CSV (the current filtered/sorted view).
function exportBattlesCsv(rows) {
  const fleetStr = list => (list || []).filter(x => x.qty).map(x => `${x.qty}x ${x.name}`).join('; ');
  const killsStr = ks => (ks || []).filter(k => k.qty).map(k => `${k.qty} ${k.name}`).join(', ');
  // One line per round, from your perspective (youAttacker picks which combat side is you).
  const roundsStr = (rounds, ya) => (rounds || []).map(rd => {
    const yDmg = ya ? rd.atk_dmg : rd.def_dmg, eDmg = ya ? rd.def_dmg : rd.atk_dmg;
    const yHp = ya ? rd.atk_hp : rd.def_hp, eHp = ya ? rd.def_hp : rd.atk_hp;
    const yK = killsStr(ya ? rd.atk_killed : rd.def_killed), eK = killsStr(ya ? rd.def_killed : rd.atk_killed);
    return `第${rd.round}回合：我方造成 ${yDmg} 伤害${yK ? `（摧毁 ${yK}）` : ''}，敌方造成 ${eDmg} 伤害${eK ? `（摧毁 ${eK}）` : ''}，耐久 ${yHp ?? '-'}/${eHp ?? '-'}`;
  }).join(' | ');

  const cols = ['日期', '来源', '位置', '区域', '结果', '损失', '受损', '摧毁敌舰', '残骸',
    '舰船损失成本', '我方舰队', '敌方舰队', '回合'];
  const esc = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const lines = [cols.join(',')];
  for (const r of rows) {
    lines.push([
      new Date(r.created_at).toISOString(),
      r.source, r.location, uiLabel(r.zone || 'unknown'),
      uiLabel(r.outcome),
      r.lost || 0, r.damaged || 0, r.killed || 0, r.debris || 0,
      weighted(r.cost || emptyResources()),
      fleetStr(r.yourFleet), fleetStr(r.enemyFleet),
      roundsStr(r.rounds, r.youAttacker !== false),
    ].map(esc).join(','));
  }
  // Prepend a UTF-8 BOM so Excel reads non-ASCII (e.g. accented names) correctly.
  const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `战斗记录-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function sortRows(rows) {
  const { key, dir } = battleSort;
  return rows.slice().sort((a, b) => {
    const av = a[key], bv = b[key];
    let c;
    if (typeof av === 'number' && typeof bv === 'number') c = av - bv;
    else c = String(av).localeCompare(String(bv));
    if (c === 0) c = String(a.created_at).localeCompare(String(b.created_at));
    return c * dir;
  });
}

function numTd(v) {
  const td = document.createElement('td');
  if (v) td.textContent = v.toLocaleString();
  else { const s = document.createElement('span'); s.className = 'zero'; s.textContent = '—'; td.appendChild(s); }
  return td;
}
function shipHtml(x) { return `${imgHtml(x.name)}${x.qty}× ${escapeHtml(x.name)}`; }
function fleetLine(label, list) {
  const items = (list || []).filter(x => x.qty);
  if (!items.length) return null;
  const div = document.createElement('div');
  div.style.cssText = 'margin:2px 0';
  div.innerHTML = `<span style="color:#8b949e">${label}: </span>` + items.map(shipHtml).join(', ');
  return div;
}
const killList = ks => (ks || []).filter(k => k.qty).map(shipHtml).join(', ') || '—';
const fleetCell = list => { const it = (list || []).filter(x => x.qty); return it.length ? it.map(shipHtml).join(', ') : '—'; };
const td = (html, extra = '') => { const c = document.createElement('td'); c.style.cssText = `padding:2px 6px;${extra}`; c.innerHTML = html; return c; };
// Round-by-round combat table. `youAttacker` picks which combat side is you —
// true for survey/pirate (you attack), false for a mining raid (you defend).
// The starting fleets head each side's column as a pre-fight row.
function roundsBlock(rounds, youAttacker, yourFleet, enemyFleet) {
  if (!rounds || !rounds.length) return null;
  const you = youAttacker ? 'atk' : 'def';
  const foe = youAttacker ? 'def' : 'atk';
  const table = document.createElement('table');
  table.style.cssText = 'width:100%;border-collapse:collapse;margin:4px 0 8px';
  table.innerHTML = `<thead><tr style="text-align:left;color:#8b949e;font-size:0.78rem">
    <th style="padding:2px 6px">#</th>
    <th style="padding:2px 6px">我方伤害 / 击毁</th>
    <th style="padding:2px 6px">敌方伤害 / 击毁</th>
    <th style="padding:2px 6px;text-align:right">我方 / 敌方耐久</th></tr></thead>`;
  const tb = document.createElement('tbody');
  const pre = document.createElement('tr');
  pre.style.cssText = 'border-top:1px solid #21262d;background:#161b22';
  pre.append(td('<span style="color:#8b949e">舰队</span>'), td(fleetCell(yourFleet)), td(fleetCell(enemyFleet)), td('100% / 100%', 'text-align:right;color:#8b949e'));
  tb.appendChild(pre);
  for (const rd of rounds) {
    const tr = document.createElement('tr');
    tr.style.borderTop = '1px solid #21262d';
    tr.append(
      td(String(rd.round)),
      td(`${(rd[you + '_dmg'] || 0).toLocaleString()} <span style="color:#8b949e">·</span> <span style="color:#56d364">${killList(rd[you + '_killed'])}</span>`),
      td(`${(rd[foe + '_dmg'] || 0).toLocaleString()} <span style="color:#8b949e">·</span> <span style="color:#ff7b72">${killList(rd[foe + '_killed'])}</span>`),
      td(`${rd[you + '_hp'] ?? '?'}% / ${rd[foe + '_hp'] ?? '?'}%`, 'text-align:right'),
    );
    tb.appendChild(tr);
  }
  table.appendChild(tb);
  return table;
}

export function renderBattlesTab() {
  const root = document.getElementById('battles-content');
  root.textContent = '';
  loadShipImages();   // lazy, re-renders once images are ready

  const allRows = collectBattles();

  // Controls — Source filter + Days period window (like Survey/Global).
  const inRange = ts => {
    const d = dayKey(ts);
    return (!battleFrom || d >= battleFrom) && (!battleTo || d <= battleTo);
  };
  const view = allRows.filter(r =>
    (battleFilter === 'all' || r.source === battleFilter) && inRange(r.created_at));
  const windowed = !!(battleFrom || battleTo);

  const bar = document.createElement('div');
  bar.style.cssText = 'display:flex;align-items:center;gap:8px;margin:12px 0;flex-wrap:wrap';
  const inputCss = 'background:#21262d;border:1px solid #30363d;color:#e6edf3;padding:4px 8px;border-radius:6px';
  const gray = txt => { const s = document.createElement('span'); s.style.color = '#8b949e'; s.textContent = txt; return s; };

  // View preset — fills the Days window (like Global). A manual Days edit
  // overrides it: the typed dates drive filtering, View is left untouched.
  const viewSel = document.createElement('select');
  viewSel.style.cssText = inputCss;
  for (const [v, lbl] of [['all', '全部时间'], ['daily', '当天'], ['last3', '最近 3 天'], ['last7', '最近 7 天'], ['last30', '最近 30 天']]) {
    const o = document.createElement('option'); o.value = v; o.textContent = lbl;
    if (v === battleView) o.selected = true; viewSel.appendChild(o);
  }
  viewSel.addEventListener('change', () => {
    battleView = viewSel.value;
    const span = { last3: 3, last7: 7, last30: 30 }[battleView];
    const now = Date.now();
    if (battleView === 'all') { battleFrom = ''; battleTo = ''; }
    else if (battleView === 'daily') { battleFrom = battleTo = dayKey(now); }
    else if (span) { battleTo = dayKey(now); battleFrom = dayKey(now - (span - 1) * 86400000); }
    battlePage = 1; renderBattlesTab();
  });

  const sel = document.createElement('select');
  sel.style.cssText = inputCss;
  for (const s of ['all', ...new Set(allRows.map(r => r.source))]) {
    const o = document.createElement('option'); o.value = s; o.textContent = s === 'all' ? '全部' : s;
    if (s === battleFilter) o.selected = true; sel.appendChild(o);
  }
  sel.addEventListener('change', () => { battleFilter = sel.value; battlePage = 1; renderBattlesTab(); });

  const from = document.createElement('input'); from.type = 'date'; from.value = battleFrom; from.style.cssText = inputCss;
  const to = document.createElement('input'); to.type = 'date'; to.value = battleTo; to.style.cssText = inputCss;
  from.addEventListener('change', () => { battleFrom = from.value; battlePage = 1; renderBattlesTab(); });
  to.addEventListener('change', () => { battleTo = to.value; battlePage = 1; renderBattlesTab(); });
  const clr = document.createElement('button'); clr.textContent = '清除'; clr.style.cssText = inputCss + ';cursor:pointer';
  clr.disabled = !windowed;
  clr.addEventListener('click', () => { battleFrom = ''; battleTo = ''; battleView = 'all'; battlePage = 1; renderBattlesTab(); });

  bar.append(gray('视图：'), viewSel, gray('来源：'), sel, gray('日期：'), from, gray('→'), to, clr);
  root.append(bar);

  // Resource economy across the current selection (source + window).
  const debris = emptyResources(), pillage = emptyResources(), cost = emptyResources();
  for (const r of view) { addRes(debris, r.debrisRes); addRes(pillage, r.pillage); addRes(cost, r.cost); }
  const won = emptyResources();
  addRes(won, debris); addRes(won, pillage);   // total won = debris + pillage, for the net

  // Fuel (hydrogen) spent reaching these battles — mean trip cost of each
  // mission type × the battles of that type. Only combat reports counted.
  const mean = meanFuelByType(inRange);
  const fuel = Math.round(view.reduce((s, r) => s + (mean[SRC_FUEL_TYPE[r.source]] || 0), 0));

  const net = emptyResources();
  for (const k of RES_CORE) net[k] = (won[k] || 0) - (cost[k] || 0);
  net.hydrogen -= fuel;   // fuel is hydrogen burned reaching the fight
  for (const k of new Set([...Object.keys(won.rare), ...Object.keys(cost.rare)])) {
    net.rare[k] = (won.rare[k] || 0) - (cost.rare[k] || 0);
  }

  // Per-resource cards for a resources object; `signed` prefixes '+' on ≥0.
  function resCards(res, suffix, signed) {
    const out = [];
    for (const [lbl, key] of [['矿石', 'ore'], ['硅酸盐', 'silicates'], ['氢', 'hydrogen'], ['合金', 'alloys']]) {
      const v = res[key] || 0;
      out.push(makeStatCard(`${lbl}${suffix}`, (signed && v >= 0 ? '+' : '') + fmt(v), key));
    }
    for (const [k, v] of Object.entries(res.rare || {})) {
      if (!v) continue;
      out.push(makeStatCard(`${uiLabel(k)}${suffix}`, (signed && v >= 0 ? '+' : '') + fmt(v), 'rare'));
    }
    return out;
  }

  // Summary cards (current selection).
  const costCard = makeStatCard('舰船损失成本', fmt(weighted(cost)), '', 'color:#ff7b72');
  costCard.title = `矿石 ${fmt(cost.ore)}、硅酸盐 ${fmt(cost.silicates)}、氢 ${fmt(cost.hydrogen)}、合金 ${fmt(cost.alloys)}——加权总计。`;
  const cards = document.createElement('div');
  cards.className = 'stats';
  const fuelCard = makeStatCard('燃料成本', fmt(fuel), 'hydrogen');
  fuelCard.title = '各任务类型的平均航程燃料 × 该类型战斗次数（fuel_log 没有单条报告 ID）。';
  cards.append(
    makeStatCard('战斗次数', fmt(view.length), 'missions'),
    makeStatCard('损失舰船', fmt(view.reduce((s, r) => s + r.lost, 0)), '', 'color:#ff7b72'),
    costCard,
    fuelCard,
    makeStatCard('受损舰船', fmt(view.reduce((s, r) => s + r.damaged, 0)), '', 'color:#e3b341'),
    makeStatCard('摧毁敌舰', fmt(view.reduce((s, r) => s + (r.killed || 0), 0)), '', 'color:#56d364'),
  );
  const label = document.createElement('div');
  label.className = 'section-label';
  label.textContent = '战斗' + (windowed ? ` — ${battleFrom || '最早'} → ${battleTo || '现在'}` : '（最近记录）');
  root.append(label, cards);

  // Debris salvaged, per resource.
  const debrisLabel = document.createElement('div');
  debrisLabel.className = 'section-label'; debrisLabel.textContent = '已回收残骸';
  const debrisCards = document.createElement('div'); debrisCards.className = 'stats';
  debrisCards.append(...resCards(debris, '残骸', false));
  root.append(debrisLabel, debrisCards);

  // Raid pillage (resources stolen from raided camps), per resource.
  const pillageLabel = document.createElement('div');
  pillageLabel.className = 'section-label'; pillageLabel.textContent = '突袭掠夺';
  const pillageCards = document.createElement('div'); pillageCards.className = 'stats';
  pillageCards.append(...resCards(pillage, '掠夺', false));
  root.append(pillageLabel, pillageCards);

  // Net (won − ship-loss cost), per resource + weighted total.
  const totalNet = weighted(net);
  const netTotalCard = makeStatCard('总净收益', (totalNet >= 0 ? '+' : '') + fmt(totalNet), '',
    totalNet >= 0 ? 'color:#56d364' : 'color:#ff7b72');
  netTotalCard.title = '加权：矿石×1、硅酸盐×2、氢×3、合金×5、稀有资源×10。'
    + (fuel ? ` 已计入约 ${fmt(fuel)} 氢燃料。` : '');
  const netLabel = document.createElement('div');
  netLabel.className = 'section-label'; netLabel.textContent = '净收益（所得资源 − 舰船损失成本）';
  const netCards = document.createElement('div'); netCards.className = 'stats';
  netCards.append(...resCards(net, '净收益', true), netTotalCard);
  root.append(netLabel, netCards);

  // Table.
  const sorted = sortRows(view);
  const totalPages = Math.max(1, Math.ceil(sorted.length / PER_PAGE));
  if (battlePage > totalPages) battlePage = totalPages;
  const slice = sorted.slice((battlePage - 1) * PER_PAGE, battlePage * PER_PAGE);

  const cols = [
    ['created_at', '日期'], ['source', '来源'], ['location', '位置'], ['zone', '区域'],
    ['outcome', '结果'], ['lost', '损失'], ['damaged', '受损'], ['killed', '摧毁敌舰'], ['debris', '残骸'],
  ];
  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const htr = document.createElement('tr');
  for (const [k, lbl] of cols) {
    const th = document.createElement('th');
    th.textContent = lbl + (battleSort.key === k ? (battleSort.dir === -1 ? ' ▼' : ' ▲') : '');
    th.style.cssText = 'cursor:pointer;text-align:left';
    th.addEventListener('click', () => {
      battleSort.dir = battleSort.key === k ? -battleSort.dir : -1;
      battleSort.key = k; renderBattlesTab();
    });
    htr.appendChild(th);
  }
  thead.appendChild(htr); table.appendChild(thead);

  const tbody = document.createElement('tbody');
  for (const r of slice) {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    const tdDate = document.createElement('td'); tdDate.textContent = new Date(r.created_at).toLocaleString();
    const tdSrc = document.createElement('td'); tdSrc.textContent = r.source;
    const tdLoc = document.createElement('td'); tdLoc.textContent = r.location;
    const tdOut = document.createElement('td');
    const badge = document.createElement('span'); badge.className = 'badge';
    badge.textContent = uiLabel(r.outcome); badge.style.color = outcomeColor(r.outcome);
    tdOut.appendChild(badge);
    tr.append(tdDate, tdSrc, tdLoc, zoneCell(r.zone), tdOut,
      numTd(r.lost), numTd(r.damaged),
      r.killed == null ? numTd(0) : numTd(r.killed),
      r.debris == null ? numTd(0) : numTd(r.debris));
    tr.addEventListener('click', () => {
      if (expanded.has(r.key)) expanded.delete(r.key); else expanded.add(r.key);
      renderBattlesTab();
    });
    tbody.appendChild(tr);

    if (expanded.has(r.key)) {
      const dtr = document.createElement('tr');
      const dtd = document.createElement('td'); dtd.colSpan = cols.length;
      dtd.style.cssText = 'background:#0d1117;padding:8px 14px;font-size:0.85rem';
      const rb = roundsBlock(r.rounds, r.youAttacker !== false, r.yourFleet, r.enemyFleet);
      // Fleets ride atop their columns inside the rounds table; only fall back to
      // standalone lines when there is no round log to host them.
      const lines = [
        ...(rb ? [] : [fleetLine('我方舰队', r.yourFleet), fleetLine('敌方舰队', r.enemyFleet)]),
        fleetLine('损失舰船', r.lostDetail),
        fleetLine('受损舰船', r.damagedDetail),
      ].filter(Boolean);
      lines.forEach(l => dtd.appendChild(l));
      if (rb) dtd.appendChild(rb);
      if (!lines.length && !rb) { const p = document.createElement('div'); p.style.color = '#484f58'; p.textContent = '该战斗没有记录详细信息。'; dtd.appendChild(p); }
      dtr.appendChild(dtd); tbody.appendChild(dtr);
    }
  }
  table.appendChild(tbody);

  const wrap = document.createElement('div');
  wrap.className = 'reports-section';
  const header = document.createElement('div');
  header.className = 'reports-header';
  const h2 = document.createElement('h2'); h2.textContent = '最近战斗';
  const exportBtn = document.createElement('button');
  exportBtn.textContent = '⭳ 导出 CSV';
  exportBtn.title = '将当前视图（全部分页、当前筛选和日期范围）下载为 CSV';
  exportBtn.disabled = !sorted.length;
  exportBtn.addEventListener('click', () => exportBattlesCsv(sorted));
  const pg = document.createElement('div'); pg.className = 'pagination';
  const prev = document.createElement('button'); prev.textContent = '← 上一页'; prev.disabled = battlePage <= 1;
  const info = document.createElement('span'); info.textContent = `第 ${battlePage} / ${totalPages} 页（共 ${sorted.length} 条）`;
  const next = document.createElement('button'); next.textContent = '下一页 →'; next.disabled = battlePage >= totalPages;
  prev.addEventListener('click', () => { battlePage--; renderBattlesTab(); });
  next.addEventListener('click', () => { battlePage++; renderBattlesTab(); });
  pg.append(prev, info, next); header.append(h2, exportBtn, pg);
  wrap.append(header, table);

  if (!allRows.length) {
    const p = document.createElement('p');
    p.style.cssText = 'color:#484f58;padding:8px 0';
    p.textContent = '尚未记录战斗，请在战斗后点击“立即同步”。';
    root.appendChild(p);
  } else {
    root.appendChild(wrap);
  }
}
