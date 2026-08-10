// Fleets tab: named fleet templates, reusable by any task (mining a field,
// collecting gas, future jobs). A template is planet-agnostic — ship quantities
// keyed by shipDefId. Stored under `fleet_templates`.

import { commandVesselIds, clearAvailStrip, isCommandVessel, normalizeRetreatThreshold, rememberedSelections, rememberSelection, renderAvailStrip, shipDisplayName, templateRetreatThreshold } from '../common.js';

let inited = false;
let templates = [];          // [{ id, name, ships: { shipDefId: qty }, attachLeader, escortRetreatThreshold }]
let shipDefs = [];           // catalog: [{ shipDefId, name, shipClass, miningCargo, attack, ... }]
let ftPlanets = [];          // owned planets available for the inventory strip
let currentId = null;        // template open in the editor
let ftAvailGen = 0;
let ftAvailTimer = null;

// Grouping mirrors the simulator's attacker fleet.
const GROUP_ORDER = ['combat', 'special', 'recon', 'utility'];
const GROUP_LABELS = { combat: '战斗', special: '特殊', recon: '侦察', utility: '辅助' };

// Colour + "what it mines" per mining ship (keyed by ship key), so the template
// editor shows at a glance which fields each hauler works. Colours match the
// asteroid field-type palette.
const MINING_SHIPS = {
  miner:         { name: '采矿船', color: '#f0883e', mines: '矿石、等离子核心' },
  gas_collector: { name: '气体收集船', color: '#79c0ff', mines: '氢、量子尘' },
  ice_drill:     { name: '冰钻船', color: '#a5d6ff', mines: '低温冰、暗物质' },
  excavator:     { name: '挖掘机', color: '#e3b341', mines: '全部采矿产量 +20%' },
  freighter:     { name: '货运船', color: '#8b949e', mines: '矿石、低温冰（基础）' },
};

function statText(s) {
  const weapon = { kinetic: '动能', laser: '激光', plasma: '等离子', missile: '导弹', ion: '离子' }[s.weaponType] || s.weaponType;
  const armor = { light: '轻型装甲', medium: '中型装甲', heavy: '重型装甲', shielded: '护盾装甲' }[s.armorType] || s.armorType;
  return `攻击 ${s.attack} · 耐久 ${s.hp} · 护盾 ${s.shieldHp}` +
    (weapon ? ` · ${weapon}` : '') +
    (armor ? ` · ${armor}` : '') +
    (s.miningCargo ? ` · 采矿货舱 ${s.miningCargo}` : '');
}

function normalizeTemplate(t) {
  const out = { ...t, ships: t.ships || {}, attachLeader: !!t.attachLeader };
  const threshold = normalizeRetreatThreshold(t.escortRetreatThreshold);
  if (threshold == null) delete out.escortRetreatThreshold;
  else out.escortRetreatThreshold = threshold;
  return out;
}

// Load templates, migrating the legacy single `mining_template` if present.
// Exported so other tabs (Asteroids) read the same list without duplicating
// the storage key or migration.
export async function loadFleetTemplates() {
  const { fleet_templates, mining_template } =
    await globalThis.nexusStorage.get(['fleet_templates', 'mining_template']);
  if (fleet_templates && fleet_templates.length) return fleet_templates.map(normalizeTemplate);
  if (mining_template && Object.keys(mining_template.ships || {}).length) {
    const seeded = [{ id: Date.now(), name: '采矿', ships: mining_template.ships }];
    seeded[0].attachLeader = false;
    await globalThis.nexusStorage.set({ fleet_templates: seeded });
    return seeded;
  }
  return [];
}

async function save() {
  await globalThis.nexusStorage.set({ fleet_templates: templates });
}

async function migrateCommandVesselShips() {
  const ids = commandVesselIds(shipDefs);
  if (!ids.size) return false;
  let changed = false;
  for (const t of templates) {
    for (const id of ids) {
      if (Number((t.ships || {})[id]) > 0) {
        t.attachLeader = true;
        delete t.ships[id];
        changed = true;
      }
    }
  }
  if (changed) await save();
  return changed;
}

// Mining-ship colour legend (built once).
function renderLegend() {
  const box = document.getElementById('ft-legend');
  if (!box || box.childElementCount) return;
  for (const { name, color, mines } of Object.values(MINING_SHIPS)) {
    const item = document.createElement('span');
    item.style.cssText = 'display:inline-flex; align-items:center; gap:6px;';
    const sw = document.createElement('span');
    sw.style.cssText = `width:11px; height:11px; border-radius:2px; background:${color}; flex:none;`;
    const label = document.createElement('span');
    label.innerHTML = `<b style="color:${color}">${name}</b> <span style="color:#8b949e">${mines}</span>`;
    item.append(sw, label);
    box.appendChild(item);
  }
}

export async function renderFleetsTab() {
  if (inited) { updateAvail(); return; }
  inited = true;
  renderLegend();

  document.getElementById('ft-new').addEventListener('click', () => {
    const t = { id: Date.now(), name: '新模板', ships: {} };
    t.attachLeader = false;
    templates.push(t);
    currentId = t.id;
    save();
    fillSelect();
    fillEditor();
  });
  document.getElementById('ft-delete').addEventListener('click', () => {
    if (currentId == null) return;
    templates = templates.filter(t => t.id !== currentId);
    currentId = templates[0] ? templates[0].id : null;
    save();
    fillSelect();
    fillEditor();
  });
  document.getElementById('ft-select').addEventListener('change', e => {
    currentId = Number(e.target.value);
    fillEditor();
  });
  document.getElementById('ft-name').addEventListener('input', e => {
    const t = current();
    if (!t) return;
    t.name = e.target.value;
    document.getElementById('ft-box-title').textContent = t.name || '舰队';
    save();
    fillSelect();
  });
  document.getElementById('ft-planet').addEventListener('change', e => {
    rememberSelection('ft-planet', e.target.value);
    updateAvail();
  });
  const leader = document.getElementById('ft-attach-leader');
  if (leader) {
    leader.addEventListener('change', e => {
      const t = current();
      if (!t) return;
      t.attachLeader = !!e.target.checked;
      updateSelectedTotal();
      save();
    });
  }
  const retreatEnabled = document.getElementById('ft-retreat-enabled');
  const retreatValue = document.getElementById('ft-retreat-value');
  const saveRetreat = () => {
    const t = current();
    if (!t) return;
    if (!retreatEnabled.checked) {
      delete t.escortRetreatThreshold;
    } else {
      const threshold = normalizeRetreatThreshold(Number(retreatValue.value) / 100) || 0.7;
      t.escortRetreatThreshold = threshold;
      retreatValue.value = String(Math.round(threshold * 100));
    }
    styleRetreatButtons();
    save();
  };
  retreatEnabled.addEventListener('change', saveRetreat);
  document.querySelectorAll('[data-ft-retreat]').forEach(btn => {
    btn.addEventListener('click', () => {
      retreatEnabled.checked = true;
      retreatValue.value = btn.dataset.ftRetreat;
      saveRetreat();
    });
  });
  templates = await loadFleetTemplates();
  currentId = templates[0] ? templates[0].id : null;
  fillSelect();
  fillEditor();

  const status = document.getElementById('ft-status');
  status.textContent = '正在加载舰船…';
  const [res, planets] = await Promise.all([
    browser.runtime.sendMessage({ type: 'GET_SHIP_DEFS' }),
    browser.runtime.sendMessage({ type: 'GET_PLANETS' }),
  ]);
  const errors = [res.error, planets.error].filter(Boolean);
  status.textContent = errors.length ? `错误：${errors.join('；')}` : '';
  shipDefs = res.ships || [];
  await migrateCommandVesselShips();
  await fillPlanetSelect(planets.planets || []);
  fillEditor();
  updateAvail();
  if (!ftAvailTimer) {
    ftAvailTimer = setInterval(() => {
      if (document.getElementById('fleets-content').style.display !== 'none') updateAvail();
    }, 10000);
  }
}

function current() {
  return templates.find(t => t.id === currentId) || null;
}

function fillSelect() {
  const sel = document.getElementById('ft-select');
  sel.textContent = '';
  for (const t of templates) {
    const o = document.createElement('option');
    o.value = t.id;
    o.textContent = t.name;
    if (t.id === currentId) o.selected = true;
    sel.appendChild(o);
  }
}

async function fillPlanetSelect(planets) {
  ftPlanets = (planets || []).filter(p => p && p.id != null);
  const sel = document.getElementById('ft-planet');
  const saved = await rememberedSelections();
  const want = saved['ft-planet'] || sel.value;
  sel.textContent = '';
  if (!ftPlanets.length) {
    const o = document.createElement('option');
    o.value = '';
    o.textContent = '— 无可用星球 —';
    sel.appendChild(o);
    sel.disabled = true;
    return;
  }
  sel.disabled = false;
  for (const p of ftPlanets) {
    const o = document.createElement('option');
    o.value = p.id;
    o.textContent = p.systemName ? `${p.name} (${p.systemName})` : p.name;
    if (p.isHomeworld) o.selected = true;
    sel.appendChild(o);
  }
  if (want && ftPlanets.some(p => String(p.id) === String(want))) sel.value = String(want);
}

async function updateAvail() {
  const box = document.getElementById('ft-avail');
  const sel = document.getElementById('ft-planet');
  if (!box || !sel) return;
  const planetId = Number(sel.value);
  if (!planetId || !shipDefs.length) { clearAvailStrip(box); return; }
  const gen = ++ftAvailGen;
  const av = await browser.runtime.sendMessage({ type: 'GET_PLANET_SHIPS', planetId });
  if (gen !== ftAvailGen) return;
  if (av.error) { clearAvailStrip(box, av.error); return; }
  renderAvailStrip(box, shipDefs, av.available || {}, '该星球没有舰船。');
}

function fillEditor() {
  const t = current();
  document.getElementById('ft-name').value = t ? t.name : '';
  document.getElementById('ft-name').disabled = !t;
  document.getElementById('ft-delete').disabled = !t;
  document.getElementById('ft-box-title').textContent = t ? (t.name || '舰队') : '舰队';
  const leader = document.getElementById('ft-attach-leader');
  if (leader) {
    leader.checked = !!(t && t.attachLeader);
    leader.disabled = !t;
  }
  updateSelectedTotal();
  const retreatEnabled = document.getElementById('ft-retreat-enabled');
  const retreatValue = document.getElementById('ft-retreat-value');
  const threshold = templateRetreatThreshold(t);
  if (retreatEnabled && retreatValue) {
    retreatEnabled.checked = threshold != null;
    retreatEnabled.disabled = !t;
    retreatValue.value = String(Math.round((threshold || 0.7) * 100));
    document.querySelectorAll('[data-ft-retreat]').forEach(btn => { btn.disabled = !t; });
    styleRetreatButtons();
  }
  fillShips();
}

function styleRetreatButtons() {
  const enabled = !!document.getElementById('ft-retreat-enabled')?.checked;
  const pct = Number(document.getElementById('ft-retreat-value')?.value);
  document.querySelectorAll('[data-ft-retreat]').forEach(btn => {
    const active = enabled && Number(btn.dataset.ftRetreat) === pct;
    btn.style.cssText = `padding:4px 10px; border-radius:6px; cursor:pointer;
      border:1px solid ${active ? '#22d3ee' : '#30363d'};
      background:${active ? '#0e4f6f' : '#21262d'}; color:#e6edf3; font-size:0.85rem;`;
  });
  const display = document.getElementById('ft-retreat-display');
  if (display) {
    display.textContent = enabled ? `当前 ${Number.isFinite(pct) ? pct : 70}%` : '未启用';
    display.style.opacity = current() ? '1' : '0.5';
  }
}

function updateSelectedTotal() {
  const el = document.getElementById('ft-selected-total');
  if (!el) return;
  const t = current();
  el.textContent = '';
  if (!t) {
    el.textContent = '当前模板已选：0 艘';
    el.style.opacity = '0.6';
    return;
  }
  const entries = Object.entries(t.ships || {})
    .map(([id, qty]) => [Number(id), Math.max(0, parseInt(qty, 10) || 0)])
    .filter(([id, qty]) => qty > 0 && !isCommandVessel(shipDefs.find(s => Number(s.shipDefId) === id)));
  const regularTotal = entries.reduce((sum, [, qty]) => sum + qty, 0);
  const leaderTotal = t.attachLeader ? 1 : 0;
  const total = regularTotal + leaderTotal;
  const title = document.createElement('div');
  title.style.cssText = 'font-size:1.05rem;font-weight:700;color:#79c0ff;margin-bottom:4px';
  title.textContent = `当前模板已选：${total.toLocaleString()} 艘`;
  const chips = document.createElement('div');
  chips.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center;color:#c9d1d9;font-size:0.95rem';
  const addChip = (label, qty, accent = '#30363d') => {
    const chip = document.createElement('span');
    chip.style.cssText = `display:inline-flex;align-items:center;gap:5px;border:1px solid ${accent};border-radius:6px;background:#161b22;padding:3px 8px;`;
    const name = document.createElement('span');
    name.textContent = label;
    const count = document.createElement('strong');
    count.style.color = '#e3b341';
    count.textContent = `× ${Number(qty).toLocaleString()}`;
    chip.append(name, count);
    chips.append(chip);
  };
  if (leaderTotal) addChip('指挥舰', 1, '#22d3ee');
  for (const [id, qty] of entries) {
    const def = shipDefs.find(s => Number(s.shipDefId) === id);
    addChip(shipDisplayName(def, `#${id}`), qty);
  }
  if (!chips.childElementCount) {
    const empty = document.createElement('span');
    empty.style.color = '#8b949e';
    empty.textContent = '未选择舰船';
    chips.append(empty);
  }
  el.append(title, chips);
  el.style.opacity = '1';
}

// Ship rows for the open template, grouped + styled like the simulator's
// attacker fleet: name, stat line, quantity input.
function fillShips() {
  const tbody = document.getElementById('ft-ships');
  tbody.textContent = '';
  const t = current();
  if (!t) { tbody.innerHTML = '<tr><td>请先创建一个模板。</td></tr>'; return; }
  if (!shipDefs.length) { tbody.innerHTML = '<tr><td>你的星球上没有找到舰船。</td></tr>'; return; }

  const ships = shipDefs.filter(s => !isCommandVessel(s)).sort((a, b) =>
    GROUP_ORDER.indexOf(a.shipClass) - GROUP_ORDER.indexOf(b.shipClass) || a.sortOrder - b.sortOrder);

  let lastGroup = null;
  for (const s of ships) {
    if (s.shipClass !== lastGroup) {
      lastGroup = s.shipClass;
      const gtr = document.createElement('tr');
      gtr.className = 'ship-group';
      const gtd = document.createElement('td');
      gtd.colSpan = 3;
      gtd.textContent = GROUP_LABELS[s.shipClass] || s.shipClass;
      gtr.appendChild(gtd);
      tbody.appendChild(gtr);
    }
    const tr = document.createElement('tr');

    const tdName = document.createElement('td');
    tdName.className = 'ship-name';
    tdName.textContent = shipDisplayName(s);
    const mine = MINING_SHIPS[s.key];
    if (mine) { tdName.style.color = mine.color; tdName.title = `可开采：${mine.mines}`; }
    else if (s.miningCargo) tdName.style.color = '#e3b341';   // any other hauler with mining cargo

    const tdStats = document.createElement('td');
    tdStats.className = 'ship-stats';
    tdStats.textContent = statText(s);
    tdStats.title = tdStats.textContent;

    const tdInput = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.value = t.ships[s.shipDefId] || '';
    input.addEventListener('input', () => {
      const v = parseInt(input.value, 10) || 0;
      if (v > 0) t.ships[s.shipDefId] = v; else delete t.ships[s.shipDefId];
      updateSelectedTotal();
      save();
    });
    tdInput.appendChild(input);

    tr.append(tdName, tdStats, tdInput);
    tbody.appendChild(tr);
  }
}
