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
