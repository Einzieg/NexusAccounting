// User Guide: a body-level overlay (opened from the "User Guide" sidebar link
// added by sidebar-inject.js) documenting the addon's features. Same pattern as
// empire-view.js: reuses the game's dark styling, lives in <body> so React
// re-renders can't wipe it. Content is static; no API calls.
//
// IIFE + re-run guard: Firefox can inject a content script twice into the same
// isolated world (extension reload into an open tab); top-level `const`s would
// then throw "redeclaration of const" and abort the whole script.
if (!window.__nxGuideView) {
window.__nxGuideView = true;
(function () {
const ext = (typeof browser !== 'undefined' ? browser : chrome);
const DASH_URL = ext.runtime.getURL('dashboard.html');

// [section title, [ [lead, text], … ]]. `lead` is bolded; text may be ''.
const SECTIONS = [
  ['开始使用', [
    ['Nexus Accounting 助手', '主仪表盘可从侧栏在新标签页中打开，它会将各类报告汇总为图表、统计卡片和可排序表格。'],
    ['游戏内工具', '可从侧栏的“助手”区域打开帝国总览、用户指南、比例计算器和小行星实时搜索；顶部栏的 📦 按钮可打开军需官。这些工具都直接显示在游戏页面上。'],
    ['数据', '助手每 15 分钟或在你手动触发时采集游戏 API。所有数据都保存在浏览器本地，不会发送到其他地方；每次更新前会自动在下载目录生成备份。'],
  ]],
  ['仪表盘页面', [
    ['全局', '汇总所有活动的资源总量，并按来源显示占比。'],
    ['勘测 / 海盗 / 采矿 / 远征', '显示各活动总量、净收益（战利品减去舰船损失成本和燃料）、战利品构成、按日或小时图表，以及可排序的报告表格。'],
    ['战斗', '集中查看营地突袭、采矿或勘测伏击、远征或虫洞战斗及玩家对战。点击行可展开双方舰队、敌方星球防御和逐舰损失；导出 CSV 可下载当前视图及逐回合详情。'],
    ['残骸', '汇总一段时间内回收的残骸。'],
    ['星系侦察（查找器）', '按星球类型、大小、温度、月球、区域和归属搜索已探索星系；月球会显示类型、颜色和建筑槽位。'],
    ['小行星', '扫描附近星系的小行星场；后台实时搜索会在发现符合筛选条件的新目标时通知你。'],
    ['舰队模板', '创建与星球无关、可供多种任务重复使用的命名舰船列表；采矿舰船按开采资源着色。'],
    ['侦察', '发起勘测、调查以及残骸或战利品回收，详见下一节。'],
    ['市场', '查看订单、余额和交易，并支持比例及剩余百分比筛选。'],
    ['交易分析', '独立查看个人成交历史、估算盈利、手续费和各资源净流量。'],
    ['科技树', '研究概览与规划。'],
  ]],
  ['侦察流程', [
    ['勘测', '向最近且尚未勘测的星系发送探测器，并遵守区域筛选；执行中的舰队会显示实时进度条。'],
    ['调查', '一键调查待处理异常；进度条依次显示航行、调查和返航阶段，舰队归航后该行才会移除。'],
    ['残骸与战利品', '回收残骸场和调查后遗留的战利品。选择货运舰种后，助手会自动规划能够全部运走的最少舰船数，并显示燃料、航行时间和任务进度。'],
  ]],
  ['星系地图工具', [
    ['采矿计算器', '每张小行星场卡片会显示采完所需的最优舰船数；可为每张卡片设置是否带挖掘机及采矿周期，设置会自动保存。'],
    ['⛏ 采矿开关', '面包屑导航中的开关可同时显示或隐藏所有卡片上的采矿工具；绿色表示开启，灰红色表示关闭。'],
  ]],
  ['帝国总览', [
    ['逐星球概览', '按列汇总每个星球并提供合计：劳动力、资源库存与容量、资源建筑等级与产量，以及带实时倒计时的槽位、建造、研究、施工和舰船队列。'],
  ]],
  ['军需官（顶部栏 📦）', [
    ['概览', '显示各殖民地驻扎舰船总数、任务中舰船总数，以及每个星球或前哨站的资源和舰船卡片。'],
    ['拖放调度', '把一个殖民地的资源或舰船拖到另一个殖民地，可在顶部停靠的任务卡中调整数量和运输舰船；助手会按有效货舱容量自动规划，并显示燃料与预计抵达时间，确认后再派出。'],
    ['拖放行为', '星球到星球：运送资源或调动舰船；星球到前哨站：补给资源或部署舰船；把前哨站资源拖到星球：收取资源并选择来源与资源类型。只有点击“派出”后才会真正执行。'],
  ]],
  ['其他侧栏工具', [
    ['比例计算器', '输入提供量、支付量和比例中的任意两项，即可自动计算第三项。'],
    ['实时搜索小行星带', '启动或停止后台小行星实时搜索，查看最新匹配目标、逐行燃料估算，并可一键派出采矿舰队。'],
  ]],
  ['使用提示', [
    ['统计漂移', '若出现“检测到统计漂移”横幅，请点击一次“重建统计”，系统会根据已保存记录重新计算汇总数据。'],
    ['操作确认', '每次派出舰队前都会请求确认，并显示实际要派出的舰船。'],
  ]],
];

let overlay = null;
function closeGuide() { if (overlay) { overlay.remove(); overlay = null; } }

function openGuide() {
  if (overlay) { closeGuide(); return; }   // toggle
  overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed; inset:0; z-index:2147483646; overflow:auto;' +
    'background:#080a10; padding:24px; box-sizing:border-box;';
  overlay.addEventListener('click', e => { if (e.target === overlay) closeGuide(); });

  const page = document.createElement('div');
  page.style.cssText = 'max-width:920px; margin:0 auto; color:#c9d1d9; font-size:0.92rem; line-height:1.55;';
  overlay.appendChild(page);
  document.body.appendChild(overlay);

  // Hero banner (game landing art) with the title overlaid.
  const hero = document.createElement('section');
  hero.style.cssText = 'position:relative; overflow:hidden; border-radius:10px; height:150px; margin-bottom:16px;';
  hero.innerHTML =
    '<img src="/images/landing/hero-galaxy.webp" alt="" ' +
      'style="width:100%; height:100%; object-fit:cover; object-position:center 40%; display:block; opacity:0.85;">' +
    '<div style="position:absolute; inset:0; display:flex; flex-direction:column; justify-content:center; padding:0 24px;' +
      'background:linear-gradient(90deg, rgba(8,10,16,0.85) 0%, rgba(8,10,16,0.35) 60%, rgba(8,10,16,0) 100%);">' +
      '<h1 style="margin:0; font-size:1.9rem; color:#e6edf3;">Nexus Accounting：用户指南</h1>' +
      '<p style="margin:5px 0 0; color:#9aa4b2; font-size:0.9rem;">逐项了解助手功能与使用方式</p>' +
    '</div>';
  page.appendChild(hero);

  for (const [title, items] of SECTIONS) {
    const h = document.createElement('h2');
    h.textContent = title;
    h.style.cssText = 'margin:20px 0 8px; font-size:1.15rem; color:#f0883e;';
    page.appendChild(h);
    const ul = document.createElement('div');
    ul.style.cssText = 'display:flex; flex-direction:column; gap:7px;';
    for (const [lead, text] of items) {
      const row = document.createElement('div');
      row.style.cssText = 'padding-left:14px; border-left:2px solid #21262d;';
      row.innerHTML = `<b style="color:#e6edf3;">${lead}</b>${text ? '：' + text : ''}`;
      ul.appendChild(row);
    }
    page.appendChild(ul);
  }

  const foot = document.createElement('p');
  foot.style.cssText = 'margin:22px 0 4px; color:#8b949e; font-size:0.85rem;';
  foot.innerHTML = `打开完整仪表盘：<a href="${DASH_URL}" target="_blank" rel="noopener" style="color:#58a6ff;">Nexus Accounting 助手</a>。`;
  page.appendChild(foot);

  const close = document.createElement('button');
  close.textContent = '✕';
  close.title = '关闭（Esc）';
  close.style.cssText = 'position:fixed; top:16px; right:20px; z-index:1; background:transparent;' +
    'border:none; color:#8b949e; font-size:1.6rem; cursor:pointer; line-height:1;';
  close.addEventListener('click', closeGuide);
  overlay.appendChild(close);
  const onKey = e => { if (e.key === 'Escape') { closeGuide(); document.removeEventListener('keydown', onKey); } };
  document.addEventListener('keydown', onKey);
}

document.addEventListener('click', e => {
  if (e.target.closest('[data-nexus-guide]')) { e.preventDefault(); openGuide(); }
});
})();
}
