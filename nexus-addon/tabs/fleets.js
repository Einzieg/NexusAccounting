// Fleets tab: named fleet templates, reusable by any task (mining a field,
// collecting gas, future jobs). A template is planet-agnostic — ship quantities
// keyed by shipDefId. Stored under `fleet_templates`.

let inited = false;
let templates = [];          // [{ id, name, ships: { shipDefId: qty } }]
let shipDefs = [];           // catalog: [{ shipDefId, name, shipClass, miningCargo, attack, ... }]
let currentId = null;        // template open in the editor

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
  freighter:     { name: '货船', color: '#8b949e', mines: '矿石、低温冰（基础）' },
};

function statText(s) {
  const weapon = { kinetic: '动能', laser: '激光', plasma: '等离子', missile: '导弹', ion: '离子' }[s.weaponType] || s.weaponType;
  const armor = { light: '轻型装甲', medium: '中型装甲', heavy: '重型装甲', shielded: '护盾装甲' }[s.armorType] || s.armorType;
  return `攻击 ${s.attack} · 耐久 ${s.hp} · 护盾 ${s.shieldHp}` +
    (weapon ? ` · ${weapon}` : '') +
    (armor ? ` · ${armor}` : '') +
    (s.miningCargo ? ` · 采矿货舱 ${s.miningCargo}` : '');
}

// Load templates, migrating the legacy single `mining_template` if present.
// Exported so other tabs (Asteroids) read the same list without duplicating
// the storage key or migration.
export async function loadFleetTemplates() {
  const { fleet_templates, mining_template } =
    await globalThis.nexusStorage.get(['fleet_templates', 'mining_template']);
  if (fleet_templates && fleet_templates.length) return fleet_templates;
  if (mining_template && Object.keys(mining_template.ships || {}).length) {
    const seeded = [{ id: Date.now(), name: '采矿', ships: mining_template.ships }];
    await globalThis.nexusStorage.set({ fleet_templates: seeded });
    return seeded;
  }
  return [];
}

async function save() {
  await globalThis.nexusStorage.set({ fleet_templates: templates });
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
  if (inited) return;
  inited = true;
  renderLegend();

  document.getElementById('ft-new').addEventListener('click', () => {
    const t = { id: Date.now(), name: '新模板', ships: {} };
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
  templates = await loadFleetTemplates();
  currentId = templates[0] ? templates[0].id : null;
  fillSelect();
  fillEditor();

  const status = document.getElementById('ft-status');
  status.textContent = '正在加载舰船…';
  const res = await browser.runtime.sendMessage({ type: 'GET_SHIP_DEFS' });
  status.textContent = res.error ? `错误：${res.error}` : '';
  shipDefs = res.ships || [];
  fillShips();
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

function fillEditor() {
  const t = current();
  document.getElementById('ft-name').value = t ? t.name : '';
  document.getElementById('ft-name').disabled = !t;
  document.getElementById('ft-delete').disabled = !t;
  document.getElementById('ft-box-title').textContent = t ? (t.name || '舰队') : '舰队';
  fillShips();
}

// Ship rows for the open template, grouped + styled like the simulator's
// attacker fleet: name, stat line, quantity input.
function fillShips() {
  const tbody = document.getElementById('ft-ships');
  tbody.textContent = '';
  const t = current();
  if (!t) { tbody.innerHTML = '<tr><td>请先创建一个模板。</td></tr>'; return; }
  if (!shipDefs.length) { tbody.innerHTML = '<tr><td>你的星球上没有找到舰船。</td></tr>'; return; }

  const ships = shipDefs.slice().sort((a, b) =>
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
    tdName.textContent = s.name;
    const mine = MINING_SHIPS[s.key];
    if (mine) { tdName.style.color = mine.color; tdName.title = `可开采：${mine.mines}`; }
    else if (s.miningCargo) tdName.style.color = '#e3b341';   // any other hauler with mining cargo

    const tdStats = document.createElement('td');
    tdStats.className = 'ship-stats';
    tdStats.textContent = statText(s);

    const tdInput = document.createElement('td');
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.value = t.ships[s.shipDefId] || '';
    input.addEventListener('input', () => {
      const v = parseInt(input.value, 10) || 0;
      if (v > 0) t.ships[s.shipDefId] = v; else delete t.ships[s.shipDefId];
      save();
    });
    tdInput.appendChild(input);

    tr.append(tdName, tdStats, tdInput);
    tbody.appendChild(tr);
  }
}
