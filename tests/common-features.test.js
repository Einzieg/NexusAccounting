import test from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import {
  applyServerTravelTime,
  cargoExpansionBonus,
  effectiveCargoCapacity,
  marketTradeNet,
  normalizeRetreatThreshold,
  resourceWeight,
  serverTravelTimeFactor,
  shipDisplayName,
  techDisplayDescription,
  techDisplayName,
  templateRegularShips,
  templateRetreatThreshold,
  templateWantsLeader,
} from '../nexus-addon/common.js';

test('fleet template helpers normalize retreat thresholds and command vessels', () => {
  const defs = [
    { shipDefId: 1, key: 'command_vessel', name: 'Command Vessel' },
    { shipDefId: 2, key: 'miner', name: 'Mining Vessel' },
  ];
  const template = {
    ships: { 1: 1, 2: 4 },
    escortRetreatThreshold: 70,
  };

  assert.equal(normalizeRetreatThreshold(70), 0.7);
  assert.equal(normalizeRetreatThreshold(0.5), 0.5);
  assert.equal(normalizeRetreatThreshold(0), null);
  assert.equal(templateRetreatThreshold(template), 0.7);
  assert.equal(templateWantsLeader(template, defs), true);
  assert.deepEqual(templateRegularShips(template, defs), [
    { shipDefId: 2, quantity: 4 },
  ]);
});

test('market profit valuation uses the shared ore-equivalent weights', () => {
  assert.equal(resourceWeight('ore'), 1);
  assert.equal(resourceWeight('silicates'), 2);
  assert.equal(resourceWeight('hydrogen'), 3);
  assert.equal(resourceWeight('alloys'), 5);
  assert.equal(resourceWeight('cryo_ice'), 10);
});

test('market trades deduct the correct side commission before valuing profit', () => {
  const trade = {
    sellerId: 7,
    buyerId: 9,
    amountSold: 5400,
    resourceSold: 'hydrogen',
    amountPaid: 600,
    resourcePaid: 'cryo_ice',
    commissionSeller: 30,
    commissionBuyer: 270,
  };

  assert.deepEqual(marketTradeNet(trade, 9), {
    soldByMe: false,
    fee: 270,
    paidResource: 'cryo_ice',
    receivedResource: 'hydrogen',
    paid: 600,
    received: 5130,
    oreEquivalent: 9390,
  });
  assert.deepEqual(marketTradeNet(trade, 7), {
    soldByMe: true,
    fee: 30,
    paidResource: 'hydrogen',
    receivedResource: 'cryo_ice',
    paid: 5400,
    received: 570,
    oreEquivalent: -10500,
  });
});

test('market history is a standalone lazily loaded dashboard view', () => {
  const readAddon = path => readFileSync(new URL(`../nexus-addon/${path}`, import.meta.url), 'utf8');
  const html = readAddon('dashboard.html');
  const dashboard = readAddon('dashboard.js');
  const market = readAddon('tabs/market.js');
  const history = readAddon('tabs/market-history.js');
  const build = readAddon('build.py');

  assert.match(html, /data-tab="market-history">交易分析</);
  assert.match(html, /id="market-history-content"/);
  assert.match(html, /<th>交易对方<\/th>/);
  assert.match(dashboard, /activeTab === 'market-history'/);
  assert.doesNotMatch(market, /GET_MARKET_TRADES/);
  assert.match(history, /GET_MARKET_TRADES/);
  assert.match(history, /GET_PLAYER_NAMES/);
  assert.doesNotMatch(history, /GET_HUBS/);
  assert.match(history, /HISTORY_AUTO_REFRESH_MS = 30000/);
  assert.match(history, /loadHistory\(true\)/);
  assert.match(history, /Date\.now\(\) - historyLoadedAt < HISTORY_AUTO_REFRESH_MS/);
  assert.match(build, /tabs\/market-history\.js/);
});

test('travel time and cargo helpers apply NX-NF and storage bonuses', () => {
  assert.equal(serverTravelTimeFactor({ id: 'NX-NF' }), 0.5);
  assert.equal(serverTravelTimeFactor({ id: 'NX-S0' }), 1);
  assert.equal(applyServerTravelTime(121, { hostname: 'nf.nexuslegacy.space' }), 61);

  const cargo = cargoExpansionBonus([{
    key: 'cargo_expansion',
    level: 2,
    effects: [{ type: 'cargo_bonus', value: 0.08 }],
  }]);
  assert.deepEqual(cargo, { level: 2, bonus: 0.16 });
  assert.equal(effectiveCargoCapacity(1000, cargo.bonus), 1160);
});

test('ship and research names use Chinese labels across API response shapes', () => {
  assert.equal(shipDisplayName({ displayName: 'Scout' }), '侦察舰');
  assert.equal(shipDisplayName({ definition: { key: 'missile_cruiser' } }), '导弹巡洋舰');
  assert.equal(shipDisplayName({ shipKey: 'ancient_fighter_ship' }), '远古战斗机');

  assert.equal(techDisplayName({ researchKey: 'basic_sensors', displayName: 'Basic Sensors' }), '基础传感器');
  assert.equal(techDisplayName({ definition: { key: 'expanded_warehousing' } }), '扩展仓储');
  assert.equal(techDisplayName({ displayName: 'Interstellar Trade Networks' }), '星际贸易网络');
  assert.equal(techDisplayName({ name: 'Dead Zone Navigation' }), '死区导航');
  assert.match(techDisplayDescription({ slug: 'fleet_coordination' }), /舰队槽/);
});
