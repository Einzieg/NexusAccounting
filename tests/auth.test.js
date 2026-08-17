import test from 'node:test';
import assert from 'node:assert';
import { loadBackground, makeBrowserStub } from './helpers.js';

test('apiFetch uses the logged-in game tab without a Bearer token', async () => {
  makeBrowserStub();
  let sentMessage;
  globalThis.browser.tabs.query = async query => {
    assert.deepEqual(query, { url: 'https://nf.nexuslegacy.space/*' });
    return [{ id: 17 }];
  };
  globalThis.browser.tabs.sendMessage = async (tabId, message) => {
    assert.equal(tabId, 17);
    sentMessage = message;
    return {
      ok: true,
      status: 200,
      data: { planets: [{ id: 1 }] },
      rateLimitRemaining: '399',
      rateLimitReset: '60',
    };
  };

  const { apiFetch } = await loadBackground();
  await globalThis.nexusStorage.setActiveServer('nf');
  const result = await apiFetch('/api/planets');

  assert.deepEqual(result, { planets: [{ id: 1 }] });
  assert.deepEqual(sentMessage, {
    type: 'GAME_FETCH',
    method: 'GET',
    path: '/api/planets',
    body: undefined,
  });
  assert.equal('token' in sentMessage, false);
});

test('apiFetch explains that a logged-in game tab is required', async () => {
  makeBrowserStub();
  globalThis.browser.tabs.query = async () => [];

  const { apiFetch } = await loadBackground();

  await assert.rejects(
    apiFetch('/api/planets'),
    /请先登录并保持第 0 赛季（NX-S0）游戏标签页打开/,
  );
});

test('game API bridge performs a same-origin request with the current session', async () => {
  makeBrowserStub();
  let listener;
  globalThis.browser.runtime.onMessage = {
    addListener: value => { listener = value; },
    removeListener() {},
  };
  delete globalThis.__nexusGameApiBridgeListener;

  const originalFetch = globalThis.fetch;
  let fetchArgs;
  globalThis.fetch = async (path, options) => {
    fetchArgs = { path, options };
    return {
      ok: true,
      status: 200,
      headers: { get: name => name === 'RateLimit-Remaining' ? '398' : null },
      text: async () => JSON.stringify({ planets: [{ id: 3 }] }),
    };
  };

  try {
    await import('../nexus-addon/game-api-bridge.js?auth-test');
    assert.equal(typeof listener, 'function');
    const responsePromise = new Promise(resolve => {
      const keepAlive = listener(
        { type: 'GAME_FETCH', method: 'GET', path: '/api/planets' },
        {},
        resolve,
      );
      assert.equal(keepAlive, true);
    });
    const response = await responsePromise;

    assert.equal(fetchArgs.path, '/api/planets');
    assert.equal(fetchArgs.options.credentials, 'include');
    assert.equal(fetchArgs.options.body, undefined);
    assert.deepEqual(response.data, { planets: [{ id: 3 }] });
    assert.equal(response.rateLimitRemaining, '398');
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.__nexusGameApiBridgeListener;
  }
});

test('apiFetch injects the game bridge and retries when an unpacked extension was reloaded', async () => {
  makeBrowserStub();
  const sent = [];
  let injected;
  globalThis.browser.tabs.query = async () => [{ id: 17 }];
  globalThis.browser.tabs.sendMessage = async (tabId, message) => {
    assert.equal(tabId, 17);
    sent.push(message);
    if (sent.length === 1) {
      throw new Error('Could not establish connection. Receiving end does not exist.');
    }
    return { ok: true, status: 200, data: { planets: [{ id: 2 }] } };
  };
  globalThis.browser.scripting = {
    executeScript: async details => { injected = details; },
  };

  const { apiFetch } = await loadBackground();
  await globalThis.nexusStorage.setActiveServer('nf');
  const result = await apiFetch('/api/planets');

  assert.equal(sent.length, 2);
  assert.deepEqual(sent[0], sent[1]);
  assert.deepEqual(injected, {
    target: { tabId: 17 },
    files: ['game-api-bridge.js'],
  });
  assert.deepEqual(result, { planets: [{ id: 2 }] });
});

test('market history loads every API page for complete profit totals', async () => {
  makeBrowserStub();
  const paths = [];
  globalThis.browser.tabs.query = async () => [{ id: 17 }];
  globalThis.browser.tabs.sendMessage = async (tabId, message) => {
    assert.equal(tabId, 17);
    paths.push(message.path);
    const pageMatch = message.path.match(/[?&]page=(\d+)/);
    const page = Number(pageMatch?.[1]);
    return {
      ok: true,
      status: 200,
      data: page === 1
        ? { trades: [{ id: 1 }], pagination: { total: 201, limit: 100 } }
        : { trades: [{ id: page }] },
    };
  };

  const { getMarketTrades } = await loadBackground();
  const result = await getMarketTrades();

  assert.deepEqual(paths, [
    '/api/market/my-trades?page=1&limit=100',
    '/api/market/my-trades?page=2&limit=100',
    '/api/market/my-trades?page=3&limit=100',
  ]);
  assert.deepEqual(result.trades, [{ id: 1 }, { id: 2 }, { id: 3 }]);
});

test('market counterpart names resolve by player id and are cached per server', async () => {
  makeBrowserStub();
  const paths = [];
  globalThis.browser.tabs.query = async () => [{ id: 17 }];
  globalThis.browser.tabs.sendMessage = async (tabId, message) => {
    assert.equal(tabId, 17);
    paths.push(message.path);
    const id = Number(message.path.match(/\/players\/(\d+)\/profile/)?.[1]);
    return {
      ok: true,
      status: 200,
      data: { profile: { userId: id, username: id === 7 ? 'Alice' : 'Bob' } },
    };
  };

  const { getPlayerNames } = await loadBackground();
  await globalThis.nexusStorage.setActiveServer('nf');
  const first = await getPlayerNames([7, 9, 7, 0, 'invalid']);

  assert.deepEqual(first.names, { 7: 'Alice', 9: 'Bob' });
  assert.deepEqual(paths, [
    '/api/players/7/profile',
    '/api/players/9/profile',
  ]);

  const second = await getPlayerNames([9, 7]);
  assert.deepEqual(second.names, { 7: 'Alice', 9: 'Bob' });
  assert.equal(paths.length, 2);
});

test('alliance station resources enumerate territory stations without scanning the universe', async () => {
  makeBrowserStub();
  const paths = [];
  globalThis.browser.tabs.query = async () => [{ id: 17 }];
  globalThis.browser.tabs.sendMessage = async (tabId, message) => {
    assert.equal(tabId, 17);
    paths.push(message.path);
    let data;
    if (message.path === '/api/alliances/territories') {
      data = {
        territories: [{
          sectorId: 25,
          sectorIndex: 25,
          sectorName: 'Alpha Arm - Sector 25',
          armId: 1,
          securityZone: 'open',
          bonus: 0.06,
          stations: [
            { id: 1002, name: 'Station Beta', systemName: 'A25-15' },
            {
              id: 1003, name: 'Station Gamma', systemName: 'A25-25',
              ore: 12, silicates: 3, basicStorage: 100000, rareStorage: 10000,
            },
          ],
        }],
      };
    } else if (message.path === '/api/alliances/my') {
      data = { alliance: { id: 13, tag: 'N13', name: 'N13 CLUB' } };
    } else if (message.path === '/api/stations/1002') {
      data = {
        station: {
          id: 1002, name: 'Station Beta', systemName: 'A25-15',
          ore: 8989, silicates: 2995, hydrogen: 6843, alloys: 0,
          cryoIce: 7, basicStorage: 100000, rareStorage: 10000,
        },
      };
    } else {
      throw new Error(`unexpected path ${message.path}`);
    }
    return { ok: true, status: 200, data, rateLimitRemaining: '399', rateLimitReset: '60' };
  };

  const { getAllianceStationResources } = await loadBackground();
  await globalThis.nexusStorage.setActiveServer('nf');
  const result = await getAllianceStationResources(true);

  assert.equal(result.territoryCount, 1);
  assert.deepEqual(result.alliance, { id: 13, tag: 'N13', name: 'N13 CLUB' });
  assert.equal(result.stations.length, 2);
  assert.equal(result.stations[0].sectorName, 'Alpha Arm - Sector 25');
  assert.equal(result.stations[0].resources.ore, 8989);
  assert.equal(result.stations[0].resources.cryoIce, 7);
  assert.equal(result.stations[1].resources.ore, 12);
  assert.deepEqual(paths, [
    '/api/alliances/territories',
    '/api/alliances/my',
    '/api/stations/1002',
  ]);
  assert.equal(paths.some(path => path.includes('station-index')), false);

  await getAllianceStationResources();
  assert.equal(paths.length, 3, 'short-lived cache avoids re-reading every station');
});

test('fleet mission retries without a busy command vessel through the game tab', async () => {
  makeBrowserStub();
  const sent = [];
  globalThis.browser.tabs.query = async () => [{ id: 17 }];
  globalThis.browser.tabs.sendMessage = async (tabId, message) => {
    assert.equal(tabId, 17);
    sent.push(message);
    if (sent.length === 1) {
      return {
        error: 'Leadership command vessel is not ready at the selected source',
        status: 409,
      };
    }
    return { ok: true, status: 200, data: { mission: { id: 9 } } };
  };

  const { postFleetMission } = await loadBackground();
  const result = await postFleetMission('/api/fleet/mine', {
    sourcePlanetId: 1,
    targetFieldId: 2,
    ships: [{ shipDefId: 3, quantity: 1 }],
    attachLeader: true,
  });

  assert.equal(sent.length, 2);
  assert.equal(sent[0].body.attachLeader, true);
  assert.equal(sent[1].body.attachLeader, false);
  assert.equal('token' in sent[0], false);
  assert.match(result.leaderRetryNotice, /已经改为未编入再次出发/);
  assert.equal(result.error, undefined);
});

test('fleet mission does not show a success notice when the retry fails', async () => {
  makeBrowserStub();
  let attempt = 0;
  globalThis.browser.tabs.query = async () => [{ id: 17 }];
  globalThis.browser.tabs.sendMessage = async () => {
    attempt++;
    return attempt === 1
      ? { error: 'Command vessel is busy on another mission', status: 409 }
      : { error: 'No fleet slot available', status: 409 };
  };

  const { postFleetMission } = await loadBackground();
  const result = await postFleetMission('/api/fleet/survey', {
    sourcePlanetId: 1,
    targetSystemId: 2,
    ships: [{ shipDefId: 3, quantity: 1 }],
    attachLeader: true,
  });

  assert.equal(attempt, 2);
  assert.equal(result.error, 'No fleet slot available');
  assert.equal(result.leaderRetryAttempted, true);
  assert.equal(result.leaderRetryNotice, undefined);
});
