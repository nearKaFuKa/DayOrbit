const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Core = require('../src/workbench-core.js');

test('workbench HTML versions the core script for reliable reloads', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '工作台.html'), 'utf8');
  assert.match(html, /src="src\/workbench-core\.js\?v=[^"]+"/);
});

test('daily storage wiring: day-file loader, per-day persist, migration entry', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '工作台.html'), 'utf8');
  assert.match(html, /Core\.parseDailyMarkdown\(text\)/);     // 天文件加载分支
  assert.match(html, /persistDayFile\(it\.date\|\|todayStr\(\)\)/); // 改卡按天保存
  assert.match(html, /Core\.serializeDailyMarkdown\(ds, dayCards\)/); // 迁移写天文件
  assert.match(html, /id="migrateDailyBtn"/);                 // 迁移入口
  assert.doesNotMatch(html, /function persistIdeaRecord/);    // 旧单卡写入已移除
});

test('topic tree wiring: arrows, fold, tidy-as-tree, no zone remnants', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '工作台.html'), 'utf8');
  assert.match(html, /marker-end/);                 // 父→子箭头
  assert.match(html, /Core\.layoutTopicTree\(/);    // 整理成树
  assert.match(html, /整理成树/);                    // 按钮文案
  assert.doesNotMatch(html, /t-zone|addZoneBtn|tzone/); // 分区痕迹清零
});

test('topic overlap avoidance wiring: live avoid on input, deferred persist, tidy with real heights', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '工作台.html'), 'utf8');
  // 输入中：autoH 在项目白板侧触发局部避让（不重建 DOM，不打断输入）
  assert.match(html, /avoidBelowInTopic\(it\)/);
  // 避让实现存在且只动 style.top 与内存 ty
  assert.match(html, /function avoidBelowInTopic/);
  assert.match(html, /elc\.style\.top = card\.ty \+ 'px'/);
  // 失焦统一持久化：先落盘避让卡，再记历史（updated 变化使避让卡进入 changedIds，⌘Z 连带恢复）
  assert.match(html, /flushTopicAvoid\(\); \/\/ 先持久化本次避让移动的卡[\s\S]{0,200}recordTopicHistory\(before\)/);
  assert.match(html, /function flushTopicAvoid/);
  // 整理成树按真实渲染高度排布
  assert.match(html, /layoutTopicTree\(cards, links, \{\s*heightOf:/);
  // 避让基于 core 纯函数
  assert.match(html, /Core\.avoidOverlapDownTree\(/);
  // 输入路径不逐字写盘：避让函数体内不直接调 saveIdea（持久化集中在 flush）
  const avoidBody = html.slice(html.indexOf('function avoidBelowInTopic'), html.indexOf('function flushTopicAvoid'));
  assert.doesNotMatch(avoidBody, /saveIdea\(/);
});

test('connections belong only to the project whiteboard', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '工作台.html'), 'utf8');
  assert.doesNotMatch(html, /id="linkLayer"/);
  assert.match(html, /function renderTopicLinks\(\)/);
  assert.doesNotMatch(html, /function renderLinks\(/);
  assert.match(html, /const ports = onDaily \? '' :/);
});

test('connection finalizes the target under the mouseup position', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '工作台.html'), 'utf8');
  assert.match(html, /function topicCardAtPoint\(clientX, clientY, source\)/);
  assert.match(html, /const up = ev => \{\s*const targetEl = topicCardAtPoint\(ev\.clientX, ev\.clientY, a\)/);
  assert.doesNotMatch(html, /const up = \(\) => \{\s*const target = ideas\.find\(i => i\.id === Number\(hovered\?\.dataset\.id\)\)/);
});

test('parseMarkdown reads the current idea frontmatter format', () => {
  const file = path.join(__dirname, '..', '灵感', 'idea-1793615036166.md');
  const sample = fs.existsSync(file)
    ? fs.readFileSync(file, 'utf8')
    : '---\ntype: idea\nboard: 多项目工作台\n---\n\n测试 1\n';
  const parsed = Core.parseMarkdown(sample);
  assert.equal(parsed.fm.type, 'idea');
  assert.equal(parsed.fm.board, '多项目工作台');
  assert.equal(parsed.body.trim(), '测试 1');
});

test('recordTimestamp falls back from updated to created to fileModified', () => {
  assert.equal(Core.recordTimestamp({ updated: '2026-11-02T12:00:00Z' }, 1), Date.parse('2026-11-02T12:00:00Z'));
  assert.equal(Core.recordTimestamp({ created: '2026-11-01T12:00:00Z' }, 2), Date.parse('2026-11-01T12:00:00Z'));
  assert.equal(Core.recordTimestamp({}, 3), 3);
});

test('touchRecord marks a browser edit as newer without mutating the source', () => {
  const source = { id: 1, text: '离线修改', updated: '2026-11-02T01:00:00Z' };
  const touched = Core.touchRecord(source, '2026-11-03T01:00:00Z');
  assert.equal(touched.updated, '2026-11-03T01:00:00Z');
  assert.equal(source.updated, '2026-11-02T01:00:00Z');
});

test('cardPositionFromClient centers a card inside an offset canvas', () => {
  const position = Core.cardPositionFromClient(
    { clientX: 900, clientY: 400 },
    { left: 224, top: 48, width: 1246, height: 696 },
    { width: 230, height: 112 },
    { minX: 4, minY: 44, padding: 4 }
  );
  assert.deepEqual(position, { x: 561, y: 296 });
});

test('cardPositionFromClient clamps a card to the canvas bounds', () => {
  const position = Core.cardPositionFromClient(
    { clientX: 10, clientY: 10 },
    { left: 224, top: 48, width: 1000, height: 600 },
    { width: 230, height: 112 },
    { minX: 4, minY: 44, padding: 4 }
  );
  assert.deepEqual(position, { x: 4, y: 44 });
});

test('topic links use side anchors for separated tree nodes and vertical anchors for stacked cards', () => {
  const parent = { x: 40, y: 40, width: 246, height: 116 };
  const child = { x: 326, y: 420, width: 246, height: 116 };
  const side = Core.topicLinkGeometry(parent, child);
  assert.equal(side.axis, 'h');
  assert.ok(side.start.x > parent.x + parent.width && side.end.x < child.x);
  assert.ok(side.path.startsWith(`M${side.start.x},${side.start.y} C`));
  const stacked = Core.topicLinkGeometry(parent, { x: 52, y: 220, width: 246, height: 116 });
  assert.equal(stacked.axis, 'v');
  assert.ok(stacked.start.y > parent.y + parent.height);
  const left = Core.topicLinkGeometry(child, parent);
  assert.equal(left.axis, 'h');
  assert.ok(left.start.x < child.x && left.end.x > parent.x + parent.width);
  assert.deepEqual(parent, { x: 40, y: 40, width: 246, height: 116 });
});

test('normalizeText changes comparison text without changing source text', () => {
  const source = '  第一行\n\n第二行  ';
  assert.equal(Core.normalizeText(source), '第一行 第二行');
  assert.equal(source, '  第一行\n\n第二行  ');
});

test('mergeIdeas keeps records unique to either snapshot', () => {
  const result = Core.mergeIdeas(
    [{ id: 1, text: '浏览器', created: '2026-11-02T01:00:00Z' }],
    [{ id: 2, text: '文件夹', created: '2026-11-02T02:00:00Z' }]
  );
  assert.deepEqual(result.items.map((item) => item.id).sort(), [1, 2]);
});

test('mergeIdeas chooses the newer record with the same id', () => {
  const result = Core.mergeIdeas(
    [{ id: 1, text: '旧', updated: '2026-11-02T01:00:00Z' }],
    [{ id: 1, text: '新', updated: '2026-11-02T02:00:00Z' }]
  );
  assert.equal(result.items[0].text, '新');
});

test('mergeIdeas deduplicates only when normalized text and created both match', () => {
  const sameCreated = '2026-11-02T01:00:00Z';
  const deduped = Core.mergeIdeas(
    [{ id: 1, text: ' 相同 内容 ', created: sameCreated }],
    [{ id: 2, text: '相同\n内容', created: sameCreated }]
  );
  assert.equal(deduped.items.length, 1);
  assert.equal(deduped.stats.deduplicated, 1);

  const preserved = Core.mergeIdeas(
    [{ id: 1, text: '重复任务', created: sameCreated }],
    [{ id: 2, text: '重复任务', created: '2026-11-03T01:00:00Z' }]
  );
  assert.equal(preserved.items.length, 2);
});

test('mergeMaterials preserves browser and folder content', () => {
  const result = Core.mergeMaterials(
    [{ id: 11, content: 'browser', created: '2026-11-02T01:00:00Z' }],
    [{ id: 12, content: 'folder', created: '2026-11-02T02:00:00Z' }]
  );
  assert.deepEqual(result.map((item) => item.content).sort(), ['browser', 'folder']);
});

test('mergeWorkspace does not mutate either input snapshot', () => {
  const browser = { ideas: [{ id: 1, text: 'A' }], mats: [], boards: [] };
  const folder = { ideas: [], mats: [], boards: [] };
  const before = JSON.stringify({ browser, folder });
  Core.mergeWorkspace(browser, folder);
  assert.equal(JSON.stringify({ browser, folder }), before);
});

test('commitWorkspace keeps the merged snapshot in cache when folder write fails', async () => {
  const snapshot = { ideas: [{ id: 1, text: '保留' }], mats: [], boards: [], links: [] };
  let cached = null;
  const result = await Core.commitWorkspace(snapshot, {
    writeFolder: async () => { throw new Error('磁盘写入失败'); },
    writeCache: async (value) => { cached = value; }
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.message, '磁盘写入失败');
  assert.deepEqual(cached, snapshot);
});

test('parseBoardMarkdown restores the current legacy board format', () => {
  const file = path.join(__dirname, '..', '白板', '多项目工作台.md');
  const sample = fs.existsSync(file)
    ? fs.readFileSync(file, 'utf8')
    : '---\ntype: board\nname: "多项目工作台"\n---\n\n# 多项目工作台\n';
  const board = Core.parseBoardMarkdown({
    fileName: '多项目工作台.md',
    text: sample,
    fileModified: 100
  });
  assert.equal(board.name, '多项目工作台');
  assert.equal(board.type, 'board');
});

test('reconcileBoards adds a board referenced only by an idea', () => {
  const boards = Core.reconcileBoards([], [
    { id: 1, text: '卡片', board: '遗漏的白板' }
  ]);
  assert.equal(boards.length, 1);
  assert.equal(boards[0].name, '遗漏的白板');
  assert.equal(boards[0].recovered, true);
});

test('reconcileBoards dedupes same-id rename leftovers by card ownership', () => {
  const twinA = { id: 7, name: '旧名字', created: '2026-11-01T00:00:00Z', updated: '2026-11-09T00:00:00Z' };
  const twinB = { id: 7, name: '新名字', created: '2026-11-01T00:00:00Z', updated: '2026-11-10T00:00:00Z' };
  const boards = Core.reconcileBoards([twinA, twinB], [
    { id: 1, board: '新名字' }, { id: 2, board: '新名字' }, { id: 3, board: '别处' }
  ]);
  assert.equal(boards.filter((b) => b.id === 7).length, 1);
  assert.equal(boards.find((b) => b.id === 7).name, '新名字'); // 卡片归属多的胜出
  // 两侧都无卡片归属时取 updated 较新
  const boards2 = Core.reconcileBoards([
    { id: 8, name: '甲', updated: '2026-11-01T00:00:00Z' },
    { id: 8, name: '乙', updated: '2026-11-02T00:00:00Z' }
  ], []);
  assert.equal(boards2.find((b) => b.id === 8).name, '乙');
});

test('serializeBoardMarkdown remains readable by parseBoardMarkdown', () => {
  const board = { id: 7, name: '项目 A', created: '2026-11-02T00:00:00Z', updated: '2026-11-02T01:00:00Z' };
  const text = Core.serializeBoardMarkdown(board, [{ file: '1-card.md', text: '任务' }]);
  const restored = Core.parseBoardMarkdown({ fileName: '项目 A.md', text });
  assert.equal(restored.name, '项目 A');
  assert.match(text, /\[\[1-card\]\] 任务/);
});

test('shouldPersistIdea rejects every temporary idea', () => {
  assert.equal(Core.shouldPersistIdea({ text: '', temporary: true }), false);
  assert.equal(Core.shouldPersistIdea({ text: '有效内容', temporary: true }), false);
});

test('shouldPersistIdea accepts every existing or promoted idea', () => {
  assert.equal(Core.shouldPersistIdea({ text: '有效内容', temporary: false }), true);
  assert.equal(Core.shouldPersistIdea({ text: '   \n', temporary: false }), true);
});

test('mergeWorkspace preserves links unique to browser and folder', () => {
  const merged = Core.mergeWorkspace(
    { ideas: [], mats: [], boards: [], links: [{ f: 1, t: 2 }] },
    { ideas: [], mats: [], boards: [], links: [{ f: 2, t: 3 }] }
  );
  assert.deepEqual(merged.links, [{ f: 1, t: 2 }, { f: 2, t: 3 }]);
});

test('appendLink adds a new undirected link without mutating the source', () => {
  const source = [{ f: 1, t: 2 }];
  const result = Core.appendLink(source, 2, 3);
  assert.equal(result.added, true);
  assert.deepEqual(result.links, [{ f: 1, t: 2 }, { f: 2, t: 3 }]);
  assert.deepEqual(source, [{ f: 1, t: 2 }]);
});

test('appendLink rejects self links and cycles', () => {
  assert.equal(Core.appendLink([{ f: 1, t: 2 }], 2, 1).added, false); // 反向即成环
  assert.equal(Core.appendLink([], 1, 1).added, false);
  assert.equal(Core.appendLink([{ f: 1, t: 2 }, { f: 2, t: 3 }], 3, 1).reason, 'cycle');
});

test('appendLink enforces single parent by replacing the old edge', () => {
  const result = Core.appendLink([{ f: 1, t: 2 }, { f: 3, t: 4 }], 5, 2);
  assert.equal(result.added, true);
  assert.equal(result.replaced, true);
  assert.deepEqual(result.links, [{ f: 3, t: 4 }, { f: 5, t: 2 }]);
  const again = Core.appendLink(result.links, 5, 2); // 重复挂同一父：幂等
  assert.equal(again.links.length, 2);
  assert.equal(again.replaced, false);
});

/* ---- 项目白板拆解树（2026-11-06 第三轮） ---- */

test('layoutTopicTree lays out a horizontal tree with parents centered', () => {
  const cards = [
    { id: 1, created: '2026-11-06T01:00:00Z' },
    { id: 2, created: '2026-11-06T02:00:00Z' },
    { id: 3, created: '2026-11-06T03:00:00Z' },
    { id: 4, created: '2026-11-06T04:00:00Z' }
  ];
  const links = [{ f: 1, t: 2 }, { f: 1, t: 3 }, { f: 2, t: 4 }];
  const { positions, roots } = Core.layoutTopicTree(cards, links);
  assert.deepEqual(roots, [1]);
  assert.equal(positions.get(2).x, 40 + 286);
  assert.equal(positions.get(4).x, 40 + 286 * 2);
  assert.equal(positions.get(4).y, 40);          // 第一个叶子
  assert.equal(positions.get(2).y, 40);          // 单子父与子同行
  assert.equal(positions.get(3).y, 40 + 164);    // 第二个子树
  assert.equal(positions.get(1).y, (40 + 204) / 2); // 根居中于两子域
});

test('layoutTopicTree stacks forests and folds subtrees', () => {
  const cards = [
    { id: 1, created: '2026-11-06T01:00:00Z' },
    { id: 2, created: '2026-11-06T02:00:00Z', tfold: true },
    { id: 3, created: '2026-11-06T03:00:00Z' },
    { id: 9, created: '2026-11-06T05:00:00Z' }
  ];
  const links = [{ f: 1, t: 2 }, { f: 2, t: 3 }];
  const { positions, roots } = Core.layoutTopicTree(cards, links);
  assert.deepEqual(roots, [1, 9]);              // 森林：按创建序
  assert.equal(positions.get(2).y, 40);         // 折叠节点按叶占位
  assert.equal(positions.has(3), false);        // 折叠子树不再排布
  assert.equal(positions.get(9).y, 40 + 164);   // 下一棵树纵向接着排
});

test('layoutTopicTree treats cyclic links as roots without hanging', () => {
  const cards = [{ id: 1 }, { id: 2 }];
  const links = [{ f: 1, t: 2 }, { f: 2, t: 1 }];
  const { positions, roots } = Core.layoutTopicTree(cards, links);
  assert.equal(roots.length, 2);
  assert.equal(positions.size, 2);
});

/* ---- 树卡片高度感知与局部避让（2026-11-15） ---- */

const TREE_H = { 1: 140, 2: 140, 3: 140 }; // 默认卡高

test('layoutTopicTree: fixed row gap overlaps tall cards (old behavior), real heights fix it', () => {
  // 一棵根带两个叶子，第一张卡实际高 400px
  const cards = [
    { id: 1, created: '2026-11-15T01:00:00Z' },
    { id: 2, created: '2026-11-15T02:00:00Z' },
    { id: 3, created: '2026-11-15T03:00:00Z' }
  ];
  const links = [{ f: 1, t: 2 }, { f: 1, t: 3 }];
  const heights = { 1: 140, 2: 400, 3: 140 };

  // 旧行为（无高度信息）：固定行距 164，第二张叶子起点 = 40 + 164 = 204，
  // 但第一张叶子底部 = 40 + 400 = 440 > 204 → 重叠（这就是长文本卡片堆叠的根源）
  const legacy = Core.layoutTopicTree(cards, links);
  const l2 = legacy.positions.get(2), l3 = legacy.positions.get(3);
  assert.ok(l2.y + heights[2] > l3.y, '固定行距下高卡与下一卡重叠（旧逻辑缺陷复现）');

  // 新行为：传入真实高度后不再重叠
  const fixed = Core.layoutTopicTree(cards, links, { heightOf: (id) => heights[id] ?? 140 });
  const f2 = fixed.positions.get(2), f3 = fixed.positions.get(3), f1 = fixed.positions.get(1);
  assert.ok(f2.y + heights[2] + 24 <= f3.y, `高卡底部 ${f2.y + 400} + 间距不超过下一卡顶 ${f3.y}`);
  assert.equal(f2.y, 40); // 第一个叶子仍在起点
  assert.equal(f3.y, 40 + 400 + 24); // 第二个叶子被真实高度推开
  assert.ok(f1.y > 40, `超高子树把父根下移到子带中心（f1.y=${f1.y}）`);
});

test('layoutTopicTree: tall parent expands spacing so the next forest starts below it', () => {
  const cards = [
    { id: 1, created: '2026-11-15T01:00:00Z' }, // 根，高 420
    { id: 2, created: '2026-11-15T02:00:00Z' }, // 单叶
    { id: 9, created: '2026-11-15T03:00:00Z' }  // 另一棵树的根
  ];
  const links = [{ f: 1, t: 2 }];
  const heights = { 1: 420, 2: 140, 9: 140 };
  const { positions } = Core.layoutTopicTree(cards, links, { heightOf: (id) => heights[id] });
  const p1 = positions.get(1), p9 = positions.get(9);
  assert.ok(p1.y + heights[1] + 24 <= p9.y, `下一棵树起点 ${p9.y} 在超高根底部 ${p1.y + 420} 之下`);
});

test('layoutTopicTree: no heightOf keeps legacy numbers exactly', () => {
  const cards = [
    { id: 1, created: '2026-11-15T01:00:00Z' },
    { id: 2, created: '2026-11-15T02:00:00Z' },
    { id: 3, created: '2026-11-15T03:00:00Z' },
    { id: 4, created: '2026-11-15T04:00:00Z' }
  ];
  const links = [{ f: 1, t: 2 }, { f: 1, t: 3 }, { f: 2, t: 4 }];
  const { positions } = Core.layoutTopicTree(cards, links);
  assert.equal(positions.get(4).y, 40);
  assert.equal(positions.get(2).y, 40);
  assert.equal(positions.get(3).y, 40 + 164);
  assert.equal(positions.get(1).y, (40 + 204) / 2);
});

test('avoidOverlapDownTree pushes overlapped cards and their subtrees down, keeps others intact', () => {
  // 卡 1 被编辑为高 500；卡 2 同列在下方（会重叠），卡 2 有子卡 3；卡 8 在横向不相交处；卡 9 在编辑卡上方
  const cards = [
    { id: 1, tx: 40, ty: 40 },    // 被编辑（右侧坐标）
    { id: 2, tx: 40, ty: 300 },   // 同列下方 → 被推开
    { id: 3, tx: 326, ty: 320 },  // 2 的子（横向不与 1 相交）→ 仅随父移动
    { id: 8, tx: 700, ty: 300 },  // 横向不相交 → 不动
    { id: 9, tx: 40, ty: -50 }    // 在编辑卡上方 → 不动
  ];
  const links = [{ f: 2, t: 3 }];
  const dy = Core.avoidOverlapDownTree({
    cards, links, editedId: 1,
    heightOf: (id) => (Number(id) === 1 ? 500 : 140),
    widthOf: () => 250
  });
  assert.equal(dy.size, 2, `只移动卡2与其子卡3（实际 ${[...dy].map(([k]) => k)}）`);
  assert.equal(dy.get(2), 40 + 500 + 16 - 300); // 底 540 + 间距 16 - 顶 300 = 256
  assert.equal(dy.get(3), 256, '子卡随父平移相同距离');
  assert.ok(!dy.has(8), '横向不相交的卡不动');
  assert.ok(!dy.has(9), '编辑卡上方的卡不动');
  assert.ok(!dy.has(1), '编辑卡自身不产生位移');
});

test('avoidOverlapDownTree chains pushes when a moved card lands on another, and never pulls back', () => {
  const cards = [
    { id: 1, tx: 40, ty: 40 },    // 编辑后高 500
    { id: 2, tx: 40, ty: 300 },   // 被推到 556
    { id: 4, tx: 40, ty: 620 }    // 2 落地后（底 556+140=696 > 620-16）需要再被推
  ];
  const dy = Core.avoidOverlapDownTree({
    cards, links: [], editedId: 1,
    heightOf: (id) => (Number(id) === 1 ? 500 : 140),
    widthOf: () => 250
  });
  assert.equal(dy.get(2), 256);
  // 卡2 落位后顶 556、底 696 → 卡4 需到 696+16=712 → dy = 92
  assert.equal(dy.get(4), 712 - 620);

  // 缩短后（高度回落到 140）不再有任何重叠 → 结果为空，不回拉
  const dy2 = Core.avoidOverlapDownTree({
    cards, links: [], editedId: 1,
    heightOf: () => 140,
    widthOf: () => 250
  });
  assert.equal(dy2.size, 0);
});

test('avoidOverlapDownTree keeps manual layout: non-overlapping siblings untouched', () => {
  // 用户手动拖开的卡（留足空隙）不应因编辑相邻卡而被移动
  const cards = [
    { id: 1, tx: 40, ty: 40 },
    { id: 2, tx: 40, ty: 640 }   // 手动摆在很下方，编辑卡增高 500 后底 540 + 16 = 556 < 640 → 不动
  ];
  const dy = Core.avoidOverlapDownTree({
    cards, links: [], editedId: 1,
    heightOf: (id) => (Number(id) === 1 ? 500 : 140),
    widthOf: () => 250
  });
  assert.equal(dy.size, 0, '留足空隙的手动摆放不动');
});

/* ---- 按天存储（2026-11-07） ---- */

test('daily markdown round-trips cards with block anchors', () => {
  const cards = [
    { id: 101, status: 'todo', priority: 'high', board: '树项目', due: '2026-11-08', tfold: true,
      created: '2026-11-07T01:00:00.000Z', updated: '2026-11-07T02:00:00.000Z',
      x: 40, y: 120, tx: 40, ty: 120, tags: ['a', 'b'], text: '北极星\n第二行' },
    { id: 102, status: 'new', priority: 'mid', created: '2026-11-07T00:00:00.000Z',
      x: 4, y: 6, text: '' }
  ];
  const text = Core.serializeDailyMarkdown('2026-11-07', cards);
  assert.match(text, /\^c-101/); // 块引用锚点
  const parsed = Core.parseDailyMarkdown(text);
  assert.equal(parsed.fm.type, 'daily');
  assert.equal(parsed.fm.date, '2026-11-07');
  assert.deepEqual(parsed.cards.map((c) => c.id), [102, 101]); // 按创建时间排序
  const c101 = parsed.cards.find((c) => c.id === 101);
  assert.equal(c101.fields.status, 'todo');
  assert.equal(c101.fields.priority, 'high');
  assert.equal(c101.fields.board, '树项目');
  assert.equal(c101.fields.due, '2026-11-08');
  assert.equal(c101.fields.tfold, '1');
  assert.equal(c101.fields.x, '40');
  assert.deepEqual(c101.fields.tags, ['a', 'b']);
  assert.equal(c101.body, '北极星\n第二行');
  const c102 = parsed.cards.find((c) => c.id === 102);
  assert.equal(c102.body, '');
  assert.equal(c102.fields.due, '');
});

test('board index links use block anchors only for day files', () => {
  const board = { id: 7, name: '项目', created: '', updated: '' };
  const text = Core.serializeDailyMarkdown('2026-11-07', []).slice(0, 0) ||
    Core.serializeBoardMarkdown(board, [
      { id: 101, file: '2026-11-07.md', text: '天文件卡' },
      { id: 102, file: '102-旧格式.md', text: '旧格式卡' }
    ]);
  assert.match(text, /\[\[2026-11-07#\^c-101\]\] 天文件卡/);
  assert.match(text, /\[\[102-旧格式\]\] 旧格式卡/);
});

test('planLegacyMigration counts legacy cards, files and days', () => {
  const plan = Core.planLegacyMigration([
    { id: 1, file: '1-a.md', date: '2026-11-06' },
    { id: 2, file: '2-b.md', date: '2026-11-06' },
    { id: 3, file: '2026-11-07.md', date: '2026-11-07' },
    { id: 4, date: '2026-11-07' },
    { temporary: true, file: '5-c.md', date: '2026-11-07' }
  ], '2026-11-07');
  assert.equal(plan.legacyCount, 2);
  assert.deepEqual(plan.legacyFiles, ['1-a.md', '2-b.md']);
  assert.deepEqual(plan.days.sort(), ['2026-11-06', '2026-11-07']);
});

/* ---- 月视图日历（2026-11-07） ---- */

test('calendarMonthGrid builds a Monday-first 42-cell grid', () => {
  const cells = Core.calendarMonthGrid(2026, 11);
  assert.equal(cells.length, 42);
  assert.equal(cells[0].date, '2026-10-26'); // 周一
  assert.equal(cells[0].inMonth, false);
  assert.equal(cells[6].date, '2026-11-01'); // 周日
  assert.equal(cells[6].inMonth, true);
  const inMonth = cells.filter((c) => c.inMonth).length;
  assert.equal(inMonth, 30); // 2026 年 11 月 30 天
  const last = cells[41];
  assert.ok(last.date <= '2026-12-06' && last.date >= '2026-12-01');
});

test('calendarMonthGrid handles months starting on Monday', () => {
  // 2026-06-01 恰为周一：首格即当月一号
  const cells = Core.calendarMonthGrid(2026, 6);
  assert.equal(cells[0].date, '2026-06-01');
  assert.equal(cells[0].inMonth, true);
});

/* ---- 项目白板模板与精简入口（2026-11-08 / 2026-11-10） ---- */

test('board kind round-trips through board markdown; legacy boards stay compatible', () => {
  const board = { id: 9, name: '开发项', kind: 'dev', created: '2026-11-08T00:00:00Z', updated: '2026-11-08T01:00:00Z' };
  const restored = Core.parseBoardMarkdown({ fileName: '开发项.md', text: Core.serializeBoardMarkdown(board, []) });
  assert.equal(restored.kind, 'dev');
  // 已创建的 concept / idea 类型白板仍能正常读取与保留
  const conceptBoard = Core.parseBoardMarkdown({
    fileName: '概念项.md',
    text: Core.serializeBoardMarkdown({ id: 12, name: '概念项', kind: 'concept', created: '', updated: '' }, [])
  });
  assert.equal(conceptBoard.kind, 'concept');
  assert.equal(Core.boardKindOf(conceptBoard), 'concept');
  // 新建白板入口只暴露“开发进行中”模板与“空白白板”，不再提供概念型和项目灵感模板入口
  assert.deepEqual(Core.NEW_BOARD_KINDS.map((k) => k.key), ['dev', '']);
  assert.equal(Core.NEW_BOARD_KINDS.find((k) => k.key === '').isTemplate, false);
  const legacy = Core.parseBoardMarkdown({ fileName: '旧.md', text: '---\ntype: board\nid: 1\nname: "旧"\n---\n# 旧\n' });
  assert.equal(legacy.kind, '');
  assert.equal(Core.boardKindOf(legacy), '');            // 旧白板 = 自由画布
  assert.equal(Core.boardKindOf({ kind: 'bogus' }), ''); // 非法值兜底为空
});

test('board order round-trips; absent order stays undefined', () => {
  const board = { id: 10, name: '排序板', order: 3, created: '', updated: '' };
  const restored = Core.parseBoardMarkdown({ fileName: '排序板.md', text: Core.serializeBoardMarkdown(board, []) });
  assert.equal(restored.order, 3);
  const noOrder = Core.parseBoardMarkdown({ fileName: '无序.md', text: Core.serializeBoardMarkdown({ id: 11, name: '无序', created: '', updated: '' }, []) });
  assert.equal(noOrder.order, undefined);
});

test('sortBoards and reorderBoards preserve existing order on first sort, place new boards on top, and survive merge', () => {
  const initial = [
    { id: 100, name: '旧项目', created: '2026-11-01T00:00:00Z', updated: '2026-11-01T00:00:00Z' },
    { id: 300, name: '新项目', created: '2026-11-03T00:00:00Z', updated: '2026-11-03T00:00:00Z' },
    { id: 200, name: '中项目', created: '2026-11-02T00:00:00Z', updated: '2026-11-02T00:00:00Z' }
  ];
  assert.deepEqual(Core.sortBoards(initial).map((b) => b.name), ['新项目', '中项目', '旧项目']);

  // 把“旧项目”拖到“新项目”之前：固化全部 order 且不改 id/name
  const reordered = Core.reorderBoards(initial, 100, 300, 'before', '2026-11-10T08:00:00Z');
  assert.deepEqual(reordered.map((b) => [b.id, b.name, b.order]), [
    [100, '旧项目', 1],
    [300, '新项目', 2],
    [200, '中项目', 3]
  ]);

  // 排序后再新建一个无 order 的项目：默认排在最上方
  const withBrandNew = [...reordered, { id: 400, name: '刚建项目', created: '2026-11-10T09:00:00Z' }];
  assert.deepEqual(Core.sortBoards(withBrandNew).map((b) => b.name), ['刚建项目', '旧项目', '新项目', '中项目']);

  // 与文件夹中尚未写入 order 的旧快照合并时，浏览器中较新的排序结果不得丢失
  const merged = Core.mergeWorkspace(
    { ideas: [], mats: [], boards: reordered, links: [] },
    { ideas: [], mats: [], boards: initial, links: [] }
  );
  assert.deepEqual(Core.sortBoards(merged.boards).map((b) => b.name), ['旧项目', '新项目', '中项目']);
});

test('devBoardAreas lays out three aligned, equally spaced task areas and placeCardInDevArea aligns cards inside', () => {
  const areas = Core.devBoardAreas();
  assert.deepEqual(areas.map((a) => a.name), ['Bug 修复', '体验优化', '新功能']);
  assert.equal(areas[0].y, areas[1].y);
  assert.equal(areas[1].y, areas[2].y);
  assert.equal(areas[0].w, areas[1].w);
  assert.equal(areas[1].w, areas[2].w);
  assert.equal(areas[0].h, areas[1].h);
  assert.equal(areas[1].h, areas[2].h);
  const gap1 = areas[1].x - (areas[0].x + areas[0].w);
  const gap2 = areas[2].x - (areas[1].x + areas[1].w);
  assert.equal(gap1, gap2);

  for (let i = 0; i < areas.length; i++) {
    for (let j = i + 1; j < areas.length; j++) {
      const a = areas[i], b = areas[j];
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      assert.equal(overlap, false);
    }
  }

  // 在区域内连续新建卡片：水平居中对齐，垂直依次顺延，不改已有卡片坐标
  const bugArea = areas[0];
  const firstPos = Core.placeCardInDevArea(bugArea, [], { cardWidth: 246, cardHeight: 116 });
  assert.equal(firstPos.x, Math.round(bugArea.x + (bugArea.w - 246) / 2));
  assert.equal(firstPos.y, bugArea.y + 52);
  assert.equal(firstPos.tarea, 'Bug 修复');

  const secondPos = Core.placeCardInDevArea(
    bugArea,
    [{ id: 1, tarea: 'Bug 修复', tx: firstPos.x, ty: firstPos.y, _height: 120 }],
    { cardWidth: 246, cardHeight: 116 }
  );
  assert.equal(secondPos.x, firstPos.x);
  assert.equal(secondPos.y, firstPos.y + 120 + 16);
});

test('rectAtPoint returns the containing area name or empty', () => {
  const areas = Core.devBoardAreas();
  assert.equal(Core.rectAtPoint(areas, 100, 300), 'Bug 修复');
  assert.equal(Core.rectAtPoint(areas, 500, 300), '体验优化');
  assert.equal(Core.rectAtPoint(areas, 1200, 300), ''); // 区域外自由区
  assert.equal(Core.rectAtPoint(areas, 24, 24), 'Bug 修复'); // 边界含入
});

test('multi-select toggle, group move, and batch delete with link cleanup', () => {
  // 普通点击单选，Command/Shift 点击增选或取消选择
  let sel = Core.toggleCardSelection([], 10, {});
  assert.deepEqual(sel, [10]);
  sel = Core.toggleCardSelection(sel, 20, { metaKey: true });
  assert.deepEqual(sel, [10, 20]);
  sel = Core.toggleCardSelection(sel, 30, { shiftKey: true });
  assert.deepEqual(sel, [10, 20, 30]);
  sel = Core.toggleCardSelection(sel, 20, { metaKey: true });
  assert.deepEqual(sel, [10, 30]);
  sel = Core.toggleCardSelection(sel, 30, {});
  assert.deepEqual(sel, [30]);

  // 多选整组移动保持相对位置并更新开发区域归属
  const areas = Core.devBoardAreas();
  const cards = [
    { id: 10, tx: 71, ty: 80, tarea: 'Bug 修复' },
    { id: 30, tx: 71, ty: 220, tarea: 'Bug 修复' },
    { id: 40, tx: 799, ty: 80, tarea: '新功能' }
  ];
  const moved = Core.moveSelectedCards(cards, [10, 30], 364, 30, { areas, cardWidth: 246, cardHeight: 116 });
  const m10 = moved.find((c) => c.id === 10);
  const m30 = moved.find((c) => c.id === 30);
  const m40 = moved.find((c) => c.id === 40);
  assert.equal(m30.tx - m10.tx, 0);
  assert.equal(m30.ty - m10.ty, 140); // 相对位置严格不变
  assert.equal(m10.tarea, '体验优化');
  assert.equal(m30.tarea, '体验优化');
  assert.equal(m40.tx, 799); // 未选中卡片不动

  // 批量删除同时移除关联连线
  const delResult = Core.deleteSelectedCards(
    moved,
    [{ f: 10, t: 30 }, { f: 30, t: 40 }, { f: 40, t: 50 }],
    [10, 30]
  );
  assert.deepEqual(delResult.cards.map((c) => c.id), [40]);
  assert.deepEqual(delResult.links, [{ f: 40, t: 50 }]);
  assert.equal(delResult.removedCards.length, 2);
  assert.equal(delResult.removedLinks.length, 2);
});

test('activeMaterialGroup assigns group only when a specific valid group view is active', () => {
  const groups = ['设计参考', '竞品调研'];
  assert.equal(Core.activeMaterialGroup('all', groups), '');
  assert.equal(Core.activeMaterialGroup('ungrouped', groups), '');
  assert.equal(Core.activeMaterialGroup('设计参考', groups), '设计参考');
  assert.equal(Core.activeMaterialGroup('不存在的组', groups), '');
});

test('board template wiring: kind picker, dev areas, accept toggle, tarea persistence', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '工作台.html'), 'utf8');
  assert.match(html, /boardKindPicker|data-kind="dev"/);       // 新建弹层类型选择
  assert.match(html, /Core\.NEW_BOARD_KINDS/);                 // 精简后的新建入口
  assert.match(html, /Core\.devBoardAreas\(/);                 // 开发区域渲染
  assert.match(html, /Core\.rectAtPoint\(areas/);              // 落点归属
  assert.match(html, /class="accept/);                          // 验收勾选
  assert.match(html, /tarea:f\.tarea\|\|''/);                  // 天文件读入
  assert.doesNotMatch(html, /it\.tarea !== '' &&/);            // 区域不占用 status
});

test('material group wiring: groups file, sidebar, mgroup persistence, auto-group on add/paste', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '工作台.html'), 'utf8');
  assert.match(html, /_groups\.json/);                  // 分组双轨存储
  assert.match(html, /id="matGroups"/);                 // 左侧分组列表
  assert.match(html, /mgroup:m\.mgroup\|\|''/);         // 素材写出
  assert.match(html, /mgroup:fm\.mgroup\|\|''/);        // 素材读入
  assert.match(html, /Core\.activeMaterialGroup\(matGroupFilter, matGroups\)/); // 分组内新增自动归组
});

test('workspace load retains folder groups on a new origin and merges browser-only groups', () => {
  const folder = { groups: ['开发资产库', '常用Skill'], mats: [{id: 1, mgroup: '常用Skill', content: '保留归属'}] };
  const loaded = Core.mergeWorkspace({}, folder);
  assert.deepEqual(loaded.groups, folder.groups);
  assert.equal(loaded.mats[0].mgroup, '常用Skill');
  assert.deepEqual(Core.mergeWorkspace({groups:['常用Skill','浏览器草稿组']}, folder).groups,
    ['开发资产库', '常用Skill', '浏览器草稿组']);
});

test('incomplete folder reads must not write a partial snapshot back to disk', async () => {
  let writes = 0;
  let cached;
  const snapshot = {ideas: [], warnings: ['素材/_groups.json: read failed']};
  const result = await Core.commitWorkspace(snapshot, {
    writeFolder: async () => { writes++; }, writeCache: async value => { cached = value; }
  });
  assert.equal(result.ok, false);
  assert.equal(writes, 0);
  assert.equal(cached, snapshot);
});

test('workspace content comparison ignores runtime metadata and collection order', () => {
  const folder = {
    ideas: [{id: 1, text: '同一张卡', date: '2026-11-16', updated: '2026-11-16T01:00:00Z',
      file: '2026-11-16.md', time: '11-16 09:00', _fileModified: 100}],
    mats: [{id: 2, type: 'text', content: '素材', updated: '2026-11-16T01:00:00Z', _fileModified: 101}],
    boards: [{id: 3, name: '项目', updated: '2026-11-16T01:00:00Z', type: 'board', _fileModified: 102}],
    links: [{f: 1, t: 4}], groups: ['规范'], subtasks: []
  };
  const merged = {
    ideas: [{id: 1, text: '同一张卡', date: '2026-11-16', updated: '2026-11-16T01:00:00Z',
      file: '2026-11-16.md', time: '11-16 09:00', _height: 140}],
    mats: [{id: 2, type: 'text', content: '素材', updated: '2026-11-16T01:00:00Z', _url: 'blob:test'}],
    boards: [{id: 3, name: '项目', updated: '2026-11-16T01:00:00Z', type: 'board'}],
    links: [{t: 4, f: 1}], groups: ['规范'], subtasks: [], stats: {deduplicated: 0}, warnings: []
  };
  assert.equal(Core.workspaceContentEqual(folder, merged), true);
});

test('workspace content comparison detects a browser-side business change', () => {
  const folder = {ideas: [{id: 1, text: '旧文字', updated: '2026-11-16T01:00:00Z'}]};
  const merged = {ideas: [{id: 1, text: '新文字', updated: '2026-11-16T02:00:00Z'}]};
  assert.equal(Core.workspaceContentEqual(folder, merged), false);
});

test('boot skips folder persistence when the merged workspace matches the folder snapshot', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '工作台.html'), 'utf8');
  assert.match(html, /Core\.workspaceContentEqual\(folderSnapshot, workspace\)/);
  assert.match(html, /writeFolder:folderNeedsWrite \? persistWorkspace : async \(\) => \{\}/);
});

test('mergeGroups dedupes with folder order first and drops blanks', () => {
  assert.deepEqual(
    Core.mergeGroups(['规范', 'Skill', ''], ['Skill', '设计', '']),
    ['规范', 'Skill', '设计']
  );
  assert.deepEqual(Core.mergeGroups(undefined, ['A']), ['A']);
});

/* ---- 素材局部富文本（2026-11-13） ---- */

test('rich text whitelist: tags, colors and sizes', () => {
  assert.equal(Core.isAllowedRichTag('b'), true);
  assert.equal(Core.isAllowedRichTag('span'), false); // span 由样式白名单单独判定
  assert.equal(Core.isAllowedRichTag('script'), false);
  assert.equal(Core.allowedRichSpanStyle('color:#c0392b'), ';color:#c0392b');
  assert.equal(Core.allowedRichSpanStyle('COLOR:#1E8449'), ';color:#1e8449'); // 大小写归一
  assert.equal(Core.allowedRichSpanStyle('font-size:1.18em'), ';font-size:1.18em');
  assert.equal(Core.allowedRichSpanStyle('font-weight:bold'), ';font-weight:bold');
  assert.equal(Core.allowedRichSpanStyle('color:#c0392b;font-size:0.92em'), ';color:#c0392b;font-size:0.92em');
  assert.equal(Core.allowedRichSpanStyle('color:#ff00ff'), '');            // 非预设色丢弃
  assert.equal(Core.allowedRichSpanStyle('font-size:99px'), '');           // 非预设字号丢弃
  assert.equal(Core.allowedRichSpanStyle('position:fixed;left:0'), '');    // 任意样式丢弃
});

test('stripRichText extracts readable text without tags or entities', () => {
  assert.equal(Core.stripRichText('<b>加粗</b>普通 <span style="color:#c0392b">红字</span>'), '加粗普通 红字');
  assert.equal(Core.stripRichText('a &lt;b&gt; c &amp; d&nbsp;e'), 'a <b> c & d e'); // 实体解码，&nbsp; 为空格
  assert.equal(Core.stripRichText('多行\n<b>第二行</b>\n<font size="5">大字</font>'), '多行\n第二行\n大字');
  assert.equal(Core.stripRichText('第一行<br>第二行<br/>第三行<br />尾'), '第一行\n第二行\n第三行\n尾'); // br 各写法都转真实换行
  assert.equal(Core.stripRichText('纯文本旧记录原样可读'), '纯文本旧记录原样可读');
});

/* ---- 状态看板（2026-11-05 第二轮） ---- */

test('kanbanStatusOf maps legacy todo-zone ideas to todo status', () => {
  assert.equal(Core.kanbanStatusOf({ status: 'new', zone: 'focus' }), 'todo');
  assert.equal(Core.kanbanStatusOf({ status: 'brew', zone: 'todo' }), 'todo');
  assert.equal(Core.kanbanStatusOf({ status: 'new', zone: 'idea' }), 'new');
  assert.equal(Core.kanbanStatusOf({ status: 'new' }), 'new');
  assert.equal(Core.kanbanStatusOf({ status: 'brew' }), 'new'); // 酝酿中已并入想法
  assert.equal(Core.kanbanStatusOf({ status: 'brew', zone: 'idea' }), 'new');
  assert.equal(Core.kanbanStatusOf({ status: 'doing', zone: 'idea' }), 'doing');
  assert.equal(Core.kanbanStatusOf({ status: 'hold' }), 'hold');
  assert.equal(Core.kanbanStatusOf({}), 'new');
});

test('sortIdeasForKanban puts newest cards first within a status column', () => {
  const items = [
    { id: 3, priority: 'low', created: '2026-11-05T03:00:00Z' },
    { id: 1, priority: 'high', created: '2026-11-05T02:00:00Z' },
    { id: 2, priority: 'mid', created: '2026-11-05T01:00:00Z' },
    { id: 4, priority: 'mid', created: '2026-11-05T00:00:00Z' }
  ];
  const sorted = Core.sortIdeasForKanban(items);
  assert.deepEqual(sorted.map((i) => i.id), [3, 1, 2, 4]); // 新卡在当前状态列顶部，优先级只用于时间相同时排序
  assert.deepEqual(items.map((i) => i.id), [3, 1, 2, 4]);
});

test('groupIdeasByKanban fills four columns and separates held', () => {
  const { columns, held } = Core.groupIdeasByKanban([
    { id: 1, status: 'todo' },
    { id: 2, status: 'new', zone: 'todo' },
    { id: 3, status: 'doing' },
    { id: 4, status: 'hold' },
    { id: 5, status: 'weird' },
    { id: 6, status: 'brew' }
  ]);
  assert.deepEqual(columns.map((c) => c.key), ['todo', 'doing', 'done', 'new']);
  assert.deepEqual(columns.find((c) => c.key === 'todo').items.map((i) => i.id), [2, 1]); // 无 created 时按较新 id 在前
  assert.deepEqual(columns.find((c) => c.key === 'new').items.map((i) => i.id), [6, 5]);
  assert.deepEqual(columns.find((c) => c.key === 'done').items, []);
  assert.deepEqual(held.map((i) => i.id), [4]);
});

test('shouldCarryIdea carries only actionable statuses', () => {
  assert.equal(Core.shouldCarryIdea({ date: '2026-11-04', status: 'todo' }, '2026-11-05'), true);
  assert.equal(Core.shouldCarryIdea({ date: '2026-11-04', status: 'doing' }, '2026-11-05'), true);
  assert.equal(Core.shouldCarryIdea({ date: '2026-11-04', status: 'new', zone: 'todo' }, '2026-11-05'), true);
  assert.equal(Core.shouldCarryIdea({ date: '2026-11-04', status: 'new', zone: 'idea' }, '2026-11-05'), false);
  assert.equal(Core.shouldCarryIdea({ date: '2026-11-04', status: 'brew' }, '2026-11-05'), false);
  assert.equal(Core.shouldCarryIdea({ date: '2026-11-04', status: 'done' }, '2026-11-05'), false);
  assert.equal(Core.shouldCarryIdea({ date: '2026-11-04', status: 'hold' }, '2026-11-05'), false);
  assert.equal(Core.shouldCarryIdea({ date: '2026-11-04', status: 'todo', temporary: true }, '2026-11-05'), false);
  assert.equal(Core.shouldCarryIdea({ date: '2026-11-05', status: 'todo' }, '2026-11-05'), false);
  assert.equal(Core.shouldCarryIdea(null, '2026-11-05'), false);
});

test('isDueActive flags due today and overdue dates', () => {
  assert.equal(Core.isDueActive('2026-11-05', '2026-11-05'), true);
  assert.equal(Core.isDueActive('2026-11-03', '2026-11-05'), true);
  assert.equal(Core.isDueActive('2026-11-06', '2026-11-05'), false);
  assert.equal(Core.isDueActive('', '2026-11-05'), false);
});

test('idea column ignores priority; newest card leads within each column', () => {
  const { columns } = Core.groupIdeasByKanban([
    { id: 1, status: 'new', priority: 'high', created: '2026-11-06T05:00:00Z' },
    { id: 2, status: 'new', priority: 'low', created: '2026-11-06T01:00:00Z' },
    { id: 3, status: 'todo', priority: 'low', created: '2026-11-06T00:00:00Z' },
    { id: 4, status: 'todo', priority: 'high', created: '2026-11-06T09:00:00Z' }
  ]);
  const idea = columns.find((c) => c.key === 'new').items.map((i) => i.id);
  const todo = columns.find((c) => c.key === 'todo').items.map((i) => i.id);
  assert.deepEqual(idea, [1, 2]); // 想法列高优不插队，按新近创建排
  assert.deepEqual(todo, [4, 3]); // 待办列仍按优先级
});

test('card creation follows the clicked column and ideas skip priority chip', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '工作台.html'), 'utf8');
  assert.match(html, /function createIdeaAt\(clientX, clientY, forcedStatus\)/);
  assert.match(html, /forcedStatus \|\| zoneOfX\(boardX\)/);
  assert.match(html, /\$\{kStatus !== 'new' \? `<button class="prio/); // 想法卡不显示优先级
});

test('status kanban wiring: due round-trip, carry predicate, no zone filter, no tidy button', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '工作台.html'), 'utf8');
  assert.match(html, /due:f\.due\|\|''/);     // 天文件加载分支读入 due
  assert.match(html, /due:fm\.due\|\|''/);    // 旧单卡文件兼容读入 due
  assert.match(html, /ideas\.filter\(i => Core\.shouldCarryIdea\(i, t\)\)/);
  assert.doesNotMatch(html, /mk\('zone'/);   // 汇总页不再按分区筛选
  assert.doesNotMatch(html, /tidyBoardBtn/); // 日志页自动整理，无需按钮
  assert.doesNotMatch(html, /data-z="brew"/); // 酝酿中已并入想法列
});

test('explicit status changes clear legacy zone so cards can rest in the idea column', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '工作台.html'), 'utf8');
  assert.match(html, /it\.status = zoneOfX\(it\.x \+ el\.offsetWidth \/ 2\);[\s\S]{0,80}it\.zone = ''; \/\/ 清除旧分区遗留/);
  assert.match(html, /it\.status = st\.key;\s*\n\s*it\.zone = ''; \/\/ 显式改状态/);
  assert.doesNotMatch(html, /zone:it\.zone\|\|'idea'/); // 空 zone 不再写出，避免归一化反复拉回
});

test('delete shortcut and selection wiring across all 4 pages (daily, topic, summary, materials)', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', '工作台.html'), 'utf8');
  assert.match(html, /selectedDailyIds = new Set\(\)/);
  assert.match(html, /selectedTopicIds = new Set\(\)/);
  assert.match(html, /selectedSummaryIds = new Set\(\)/);
  assert.match(html, /selectedMatIds = new Set\(\)/);
  assert.match(html, /function deleteSelectedIdeasBySet\(/);
  assert.match(html, /function deleteSelectedMaterials\(/);
  assert.match(html, /boardActive && selectedDailyIds\.size > 0/);
  assert.match(html, /topicActive && selectedTopicIds\.size > 0/);
  assert.match(html, /summaryActive && selectedSummaryIds\.size > 0/);
  assert.match(html, /materialsActive && selectedMatIds\.size > 0/);
});

/* ---- 带子项的任务卡片：主卡片、子任务、每日关联与历史进度（2026-11-10） ---- */

test('master card progress rules: empty is todo, partial is doing, all accepted is done, uncheck rolls back, no duplicate counts', () => {
  const subtasks = Array.from({ length: 11 }, (_, idx) => ({
    id: 1001 + idx,
    board: '01 个人工作台',
    tarea: 'Bug 修复',
    text: `Bug #${idx + 1}`,
    done: false,
    created: `2026-11-09T01:${String(idx).padStart(2, '0')}:00Z`
  }));

  // 1) 空子任务列表不能自动算完成，状态为 todo
  const emptyMaster = {
    id: 500, ctype: 'master', date: '2026-11-09',
    board: '01 个人工作台', tarea: 'Bug 修复',
    text: '今天处理个人工作台 Bug', subIds: []
  };
  const pEmpty = Core.computeMasterProgress(emptyMaster, subtasks, '2026-11-09');
  assert.equal(pEmpty.done, 0);
  assert.equal(pEmpty.total, 0);
  assert.equal(pEmpty.prog, '0/0');
  assert.equal(pEmpty.status, 'todo');

  // 2) 关联 11 条（故意传入重复 ID 测试去重），0 条验收 -> 0/11, todo
  const master = {
    ...emptyMaster,
    subIds: [...subtasks.map((s) => s.id), 1001, 1002]
  };
  const p0 = Core.computeMasterProgress(master, subtasks, '2026-11-09');
  assert.equal(p0.total, 11);
  assert.equal(p0.done, 0);
  assert.equal(p0.prog, '0/11');
  assert.equal(p0.status, 'todo');
  assert.equal(p0.subIds.length, 11);

  // 3) 验收其中 7 条 -> 7/11, doing
  for (let i = 0; i < 7; i++) subtasks[i].done = true;
  const p7 = Core.computeMasterProgress(master, subtasks, '2026-11-09');
  assert.equal(p7.done, 7);
  assert.equal(p7.total, 11);
  assert.equal(p7.prog, '7/11');
  assert.equal(p7.status, 'doing');

  // 4) 全部 11 条验收通过 -> 11/11, done
  for (let i = 7; i < 11; i++) subtasks[i].done = true;
  const p11 = Core.computeMasterProgress(master, subtasks, '2026-11-09');
  assert.equal(p11.done, 11);
  assert.equal(p11.total, 11);
  assert.equal(p11.prog, '11/11');
  assert.equal(p11.status, 'done');

  // 5) 取消勾选 1 条 -> 回退到 10/11, doing
  subtasks[10].done = false;
  const p10 = Core.computeMasterProgress(master, subtasks, '2026-11-09');
  assert.equal(p10.done, 10);
  assert.equal(p10.total, 11);
  assert.equal(p10.prog, '10/11');
  assert.equal(p10.status, 'doing');
});

test('cross-day continuation: Day 1 freezes at 7/11 without midnight timer when Day 2 links and completes remaining 4 subtasks', () => {
  const subtasks = Array.from({ length: 11 }, (_, idx) => ({
    id: 2001 + idx,
    board: '01 个人工作台',
    tarea: 'Bug 修复',
    text: `修复问题 ${idx + 1}`,
    done: idx < 7, // 周一当天验收了前 7 条
    doneDate: idx < 7 ? '2026-11-09' : '',
    created: `2026-11-09T02:${String(idx).padStart(2, '0')}:00Z`
  }));

  let ideas = [{
    id: 901, ctype: 'master', date: '2026-11-09',
    board: '01 个人工作台', tarea: 'Bug 修复',
    text: '周一处理 11 个 Bug',
    subIds: subtasks.map((s) => s.id)
  }];

  // 周一（2026-11-09）实时同步：周一主卡片记录 7/11 与 doing
  ideas = Core.syncMasterCardsWithSubtasks(ideas, subtasks, '2026-11-09').ideas;
  assert.equal(ideas[0].prog, '7/11');
  assert.equal(ideas[0].status, 'doing');
  assert.deepEqual(ideas[0].doneIds, [2001, 2002, 2003, 2004, 2005, 2006, 2007]);

  // 主卡片不参与“顺延未完成”搬家，以保留周一当天的历史记录
  assert.equal(Core.shouldCarryIdea(ideas[0], '2026-11-10'), false);

  // 周二（2026-11-10）新建主卡片，查询可关联的同项目同类型未完成子任务
  const tuesdayMaster = {
    id: 902, ctype: 'master', date: '2026-11-10',
    board: '01 个人工作台', tarea: 'Bug 修复',
    text: '周二继续处理剩余 4 个 Bug',
    subIds: []
  };
  const available = Core.availableSubtasksForMaster(tuesdayMaster, subtasks);
  const pendingAvailable = available.filter((s) => !s.done);
  assert.deepEqual(pendingAvailable.map((s) => s.id), [2008, 2009, 2010, 2011]);

  // 关联这 4 条原任务到周二主卡片，项目白板仍是 11 条原任务，无副本
  tuesdayMaster.subIds = pendingAvailable.map((s) => s.id);
  ideas.push(tuesdayMaster);
  ideas = Core.syncMasterCardsWithSubtasks(ideas, subtasks, '2026-11-10').ideas;
  assert.equal(subtasks.length, 11);
  assert.equal(ideas.find((i) => i.id === 902).prog, '0/4');
  assert.equal(ideas.find((i) => i.id === 902).status, 'todo');

  // 周二勾选剩余 4 条任务：周二变为 4/4 (done)，周一历史记录仍保持 7/11 (doing)
  for (let i = 7; i < 11; i++) {
    subtasks[i].done = true;
    subtasks[i].doneDate = '2026-11-10';
  }
  ideas = Core.syncMasterCardsWithSubtasks(ideas, subtasks, '2026-11-10').ideas;
  const monCard = ideas.find((i) => i.id === 901);
  const tueCard = ideas.find((i) => i.id === 902);
  assert.equal(monCard.prog, '7/11');
  assert.equal(monCard.status, 'doing');
  assert.deepEqual(monCard.doneIds, [2001, 2002, 2003, 2004, 2005, 2006, 2007]);
  assert.equal(tueCard.prog, '4/4');
  assert.equal(tueCard.status, 'done');
  assert.deepEqual(tueCard.doneIds, [2008, 2009, 2010, 2011]);
});

test('unlink vs delete subtask and scope changes keep area ownership and references clean across all 3 task types', () => {
  let subtasks = [
    { id: 301, board: '01 个人工作台', tarea: '体验优化', text: '优化侧栏', done: true },
    { id: 302, board: '01 个人工作台', tarea: '体验优化', text: '优化弹窗', done: false },
    { id: 303, board: '01 个人工作台', tarea: '新功能', text: '支持子项卡片', done: false }
  ];
  let ideas = [
    { id: 801, ctype: 'master', date: '2026-11-09', board: '01 个人工作台', tarea: '体验优化', text: '周一体验优化', subIds: [301, 302], doneIds: [301], prog: '1/2', status: 'doing' },
    { id: 802, ctype: 'master', date: '2026-11-10', board: '01 个人工作台', tarea: '体验优化', text: '周二体验优化', subIds: [302], doneIds: [], prog: '0/1', status: 'todo' },
    { id: 803, ctype: 'master', date: '2026-11-10', board: '01 个人工作台', tarea: '新功能', text: '周二新功能', subIds: [303], doneIds: [], prog: '0/1', status: 'todo' }
  ];

  // 1) 只从周二主卡片取消关联 302：项目子任务 302 仍在，周一主卡片仍保留 [301, 302]
  const unlinked = Core.unlinkSubtaskFromMaster(ideas[1], 302, subtasks, '2026-11-10');
  assert.deepEqual(unlinked.subIds, []);
  assert.equal(unlinked.prog, '0/0');
  assert.equal(unlinked.status, 'todo');
  assert.equal(subtasks.length, 3);
  assert.deepEqual(ideas[0].subIds, [301, 302]);

  // 2) 从项目中删除子任务 302：子任务被移除，周一主卡片也清理 302 引用
  const afterDel = Core.deleteSubtaskFromProject(ideas, subtasks, 302, '2026-11-10');
  assert.deepEqual(afterDel.subtasks.map((s) => s.id), [301, 303]);
  const monAfterDel = afterDel.ideas.find((i) => i.id === 801);
  assert.deepEqual(monAfterDel.subIds, [301]);
  assert.equal(monAfterDel.prog, '1/1');

  // 3) 修改主卡片 803 的项目或类型（新功能 -> 体验优化）：其关联子任务 303 同步迁移到体验优化区
  const scopeChanged = Core.changeMasterCardScope(
    afterDel.ideas,
    afterDel.subtasks,
    803,
    { board: '01 个人工作台', tarea: '体验优化' },
    '2026-11-10'
  );
  assert.equal(scopeChanged.ideas.find((i) => i.id === 803).tarea, '体验优化');
  assert.equal(scopeChanged.subtasks.find((s) => s.id === 303).tarea, '体验优化');
});

test('daily markdown and workspace merge round-trip master cards and subtasks while keeping legacy cards compatible', () => {
  const cards = [
    {
      id: 701, ctype: 'master', status: 'doing', priority: 'high',
      board: '01 个人工作台', tarea: 'Bug 修复',
      subIds: [101, 102, 103], doneIds: [101, 102], prog: '2/3', mfold: true,
      created: '2026-11-10T01:00:00.000Z', updated: '2026-11-10T02:00:00.000Z',
      x: 40, y: 56, tx: 40, ty: 56, tags: [], text: '今天处理 3 个 Bug'
    },
    {
      id: 702, status: 'todo', priority: 'mid',
      board: '01 个人工作台', tarea: '体验优化',
      created: '2026-11-10T01:30:00.000Z', updated: '2026-11-10T01:30:00.000Z',
      x: 40, y: 192, tx: 435, ty: 76, tags: ['常规'], text: '普通卡片保持不变'
    }
  ];
  const md = Core.serializeDailyMarkdown('2026-11-10', cards);
  const parsed = Core.parseDailyMarkdown(md);
  const mCard = parsed.cards.find((c) => c.id === 701);
  const nCard = parsed.cards.find((c) => c.id === 702);
  assert.equal(mCard.fields.ctype, 'master');
  assert.deepEqual(mCard.fields.subids.map(Number), [101, 102, 103]);
  assert.deepEqual(mCard.fields.doneids.map(Number), [101, 102]);
  assert.equal(mCard.fields.prog, '2/3');
  assert.equal(nCard.fields.ctype || '', '');
  assert.equal(nCard.body, '普通卡片保持不变');

  // mergeWorkspace 合并浏览器与文件夹中的子任务并按 updated 取最新
  const merged = Core.mergeWorkspace(
    {
      ideas: [], mats: [], boards: [], links: [],
      subtasks: [
        { id: 101, board: '01 个人工作台', tarea: 'Bug 修复', text: '旧文案', done: false, updated: '2026-11-10T01:00:00Z' },
        { id: 102, board: '01 个人工作台', tarea: 'Bug 修复', text: '仅浏览器有', done: true, updated: '2026-11-10T01:00:00Z' }
      ]
    },
    {
      ideas: [], mats: [], boards: [], links: [],
      subtasks: [
        { id: 101, board: '01 个人工作台', tarea: 'Bug 修复', text: '新文案', done: true, updated: '2026-11-10T03:00:00Z' },
        { id: 103, board: '01 个人工作台', tarea: '体验优化', text: '仅文件夹有', done: false, updated: '2026-11-10T02:00:00Z' }
      ]
    }
  );
  assert.equal(merged.subtasks.length, 3);
  const s101 = merged.subtasks.find((s) => s.id === 101);
  assert.equal(s101.text, '新文案');
  assert.equal(s101.done, true);
});

test('unified dev task cards: dual-view partitioning, completed folding, board assignment, and legacy compatibility', () => {
  // 1) 从开发项目区域创建任务：生成标准普通卡片（无 ctype: 'master'），空白输入忽略
  assert.equal(Core.createUnifiedDevTask({ text: '   ', board: '01 个人工作台', tarea: 'Bug 修复' }), null);
  const newTask = Core.createUnifiedDevTask({
    id: 9001,
    text: '修复侧栏拖拽排序落点偏移问题，长文本在项目白板区域内完整换行展示不省略',
    board: '01 个人工作台',
    tarea: 'Bug 修复',
    date: '2026-11-10',
    created: '2026-11-10T09:00:00Z'
  });
  assert.equal(newTask.id, 9001);
  assert.equal(newTask.ctype, undefined);
  assert.equal(newTask.status, 'todo');
  assert.equal(newTask.board, '01 个人工作台');
  assert.equal(newTask.tarea, 'Bug 修复');
  assert.equal(Core.isDevTaskCard(newTask, '01 个人工作台'), true);

  // 2) 今日白板卡片归属到“开发进行中”项目 vs “自由白板”项目（自由白板自动清空旧 tarea）
  const assignedDev = Core.assignCardToBoard(
    { id: 9002, text: '新增快捷键说明', status: 'todo' },
    { id: 1, name: '01 个人工作台', kind: 'dev' },
    '新功能',
    '2026-11-10T09:05:00Z'
  );
  assert.equal(assignedDev.board, '01 个人工作台');
  assert.equal(assignedDev.tarea, '新功能');

  const assignedFree = Core.assignCardToBoard(
    assignedDev,
    { id: 2, name: '灵感自由画布', kind: '' },
    '新功能',
    '2026-11-10T09:10:00Z'
  );
  assert.equal(assignedFree.board, '灵感自由画布');
  assert.equal(assignedFree.tarea, '');

  // 3) 开发区域任务分区：默认分离未完成（active）与已完成（completed，收入「已完成（数量）」），并兼容旧 _subtasks.json
  const cards = [
    newTask,
    { id: 9003, text: '已修复的 Bug A', status: 'done', board: '01 个人工作台', tarea: 'Bug 修复', date: '2026-11-09', created: '2026-11-09T08:00:00Z' },
    { id: 9004, text: '另一个待修复 Bug B', status: 'doing', board: '01 个人工作台', tarea: 'Bug 修复', date: '2026-11-10', created: '2026-11-10T10:00:00Z' }
  ];
  const legacySubs = [
    { id: 3001, board: '01 个人工作台', tarea: 'Bug 修复', text: '旧版未完成子任务', done: false, created: '2026-11-08T01:00:00Z' },
    { id: 3002, board: '01 个人工作台', tarea: 'Bug 修复', text: '旧版已验收子任务', done: true, created: '2026-11-08T02:00:00Z' }
  ];
  const part = Core.partitionDevAreaTasks(cards, legacySubs, '01 个人工作台', 'Bug 修复');
  assert.equal(part.active.length, 3);     // 9001 (todo), 9004 (doing), 3001 (legacy !done)
  assert.equal(part.completed.length, 2);  // 9003 (done), 3002 (legacy done)
  assert.equal(part.doneCount, 2);
  assert.equal(part.totalCount, 5);

  // 4) HTML 接线检查：不再提供“＋ 带子项卡片”新建入口，区域内任务行自动换行不省略，且包含「已完成（数量）」收起区
  const html = fs.readFileSync(path.join(__dirname, '..', '工作台.html'), 'utf8');
  assert.doesNotMatch(html, /id="barMasterBtn"|id="addMasterBtn"/);
  assert.match(html, /Core\.partitionDevAreaTasks\(/);
  assert.match(html, /Core\.createUnifiedDevTask\(/);
  assert.match(html, /Core\.assignCardToBoard\(/);
  assert.match(html, /t-done-drawer|已完成（/);
  assert.match(html, /\.t-sub-text\s*\{[^}]*white-space:\s*pre-wrap/s);
});

test('materials library: draft creation, inline text editing, group vs tag filtering, and separated toolbar wiring', () => {
  const groups = ['设计参考', '竞品文案'];

  // 1) 新建素材草稿卡片：在具体分组下自动带上分组，在“全部”或“未分组”下留空
  const draftInGroup = Core.createDraftMaterialCard({
    id: 5001,
    groupFilter: '设计参考',
    groups,
    tags: ['落地页']
  });
  assert.equal(draftInGroup.type, 'text');
  assert.equal(draftInGroup.mgroup, '设计参考');
  assert.equal(draftInGroup.temporary, true);
  assert.deepEqual(draftInGroup.tags, ['落地页']);

  const draftInAll = Core.createDraftMaterialCard({
    id: 5002,
    groupFilter: 'all',
    groups
  });
  assert.equal(draftInAll.mgroup, '');

  // 2) 保存草稿：留空或仅空白字符时不生成正式素材记录（返回 null）
  assert.equal(Core.finalizeDraftMaterialCard(draftInGroup, '   \n\t  '), null);
  assert.equal(Core.finalizeDraftMaterialCard(draftInGroup, '<br>'), null);
  const richDraft = Core.finalizeDraftMaterialCard(draftInGroup, '<b>重点</b>说明', { id: 5003 });
  assert.equal(richDraft.content, '<b>重点</b>说明');
  const finalized = Core.finalizeDraftMaterialCard(draftInGroup, '  多行正文第一行\n第二行  ', {
    id: 5001,
    time: '11-10 10:00',
    created: '2026-11-10T10:00:00Z'
  });
  assert.equal(finalized.id, 5001);
  assert.equal(finalized.content, '多行正文第一行\n第二行');
  assert.equal(finalized.mgroup, '设计参考');
  assert.deepEqual(finalized.tags, ['落地页']);
  assert.equal(finalized.temporary, undefined);

  // 3) 原位文字编辑：文字素材改 content（不可为空），链接素材改 title，图片素材改 note，且不污染原对象或复制出的副本
  const textMat = { id: 1, type: 'text', content: '原文字', mgroup: '设计参考', tags: ['定价'] };
  const copiedTextMat = { ...structuredClone(textMat), id: 2 };
  assert.equal(Core.applyMaterialInlineEdit(textMat, '   ').ok, false);
  const editedText = Core.applyMaterialInlineEdit(textMat, '新文字内容\n换行保留', '2026-11-10T11:00:00Z');
  assert.equal(editedText.ok, true);
  assert.equal(editedText.material.content, '新文字内容\n换行保留');
  assert.equal(textMat.content, '原文字');
  assert.equal(copiedTextMat.content, '原文字');

  const linkMat = { id: 3, type: 'link', content: 'https://example.com', title: '旧标题', note: '旧备注' };
  const editedLink = Core.applyMaterialInlineEdit(linkMat, '新可见标题', '2026-11-10T11:05:00Z');
  assert.equal(editedLink.ok, true);
  assert.equal(editedLink.material.title, '新可见标题');
  assert.equal(editedLink.material.content, 'https://example.com');

  const imgMat = { id: 4, type: 'img', content: '素材/assets/img-4.png', note: '旧图片说明' };
  const editedImg = Core.applyMaterialInlineEdit(imgMat, '更新后的图片备注', '2026-11-10T11:10:00Z');
  assert.equal(editedImg.ok, true);
  assert.equal(editedImg.material.note, '更新后的图片备注');

  // 4) 分组与标签筛选可见性判定（用于“已保存，但当前筛选未显示”提示）
  assert.equal(Core.isMaterialVisibleInView(finalized, { groupFilter: '设计参考', tagFilter: '', groups }), true);
  assert.equal(Core.isMaterialVisibleInView(finalized, { groupFilter: '设计参考', tagFilter: '落地页', groups }), true);
  assert.equal(Core.isMaterialVisibleInView(finalized, { groupFilter: '设计参考', tagFilter: '定价', groups }), false);
  assert.equal(Core.isMaterialVisibleInView(finalized, { groupFilter: '竞品文案', tagFilter: '', groups }), false);
  assert.equal(Core.isMaterialVisibleInView(finalized, { groupFilter: 'all', tagFilter: '落地页', groups }), true);

  // 5) HTML 接线检查：新建按钮、空白双击新建、原位编辑、添加区与筛选区分离、分组与标签区分
  const html = fs.readFileSync(path.join(__dirname, '..', '工作台.html'), 'utf8');
  assert.match(html, /id="newMatCardBtn"/);
  assert.match(html, /id="matAddPanel"/);
  assert.match(html, /id="matFilterBar"/);
  assert.match(html, /id="matSaveTargetBadge"/);
  assert.match(html, /id="clearMatFilterBtn"/);
  assert.match(html, /function startNewMaterialCardInline\(/);
  assert.match(html, /function startInlineEditMaterial\(/);
  assert.match(html, /Core\.createDraftMaterialCard\(/);
  assert.match(html, /Core\.finalizeDraftMaterialCard\(/);
  assert.match(html, /Core\.applyMaterialInlineEdit\(/);
  assert.match(html, /Core\.isMaterialVisibleInView\(/);
  assert.match(html, /已保存，但当前筛选未显示/);
});


