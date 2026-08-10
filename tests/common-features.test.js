import test from 'node:test';
import assert from 'node:assert';
import {
  applyServerTravelTime,
  cargoExpansionBonus,
  effectiveCargoCapacity,
  normalizeRetreatThreshold,
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
  assert.match(techDisplayDescription({ slug: 'fleet_coordination' }), /舰队槽/);
});
