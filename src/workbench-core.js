(function initWorkbenchCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.WorkbenchCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createWorkbenchCore() {
  function parseScalar(value) {
    const trimmed = String(value ?? '').trim();
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      return trimmed.slice(1, -1).split(',')
        .map((item) => item.trim().replace(/^"|"$/g, ''))
        .filter(Boolean);
    }
    return trimmed.replace(/^"|"$/g, '');
  }

  function parseMarkdown(text) {
    const source = String(text ?? '').replace(/\r\n/g, '\n');
    const match = source.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!match) return { fm: {}, body: source };
    const fm = {};
    for (const line of match[1].split('\n')) {
      const pair = line.match(/^([\w-]+):\s*(.*)$/);
      if (pair) fm[pair[1]] = parseScalar(pair[2]);
    }
    return { fm, body: match[2] };
  }

  function normalizeText(text) {
    return String(text ?? '').trim().replace(/\s+/g, ' ');
  }

  function recordTimestamp(record, fileModified = 0) {
    for (const value of [record?.updated, record?.created]) {
      const timestamp = Date.parse(value || '');
      if (Number.isFinite(timestamp)) return timestamp;
    }
    return Number(fileModified) || 0;
  }

  function touchRecord(record, updated = new Date().toISOString()) {
    return { ...record, updated };
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), Math.max(min, max));
  }

  function cardPositionFromClient(point, canvasRect, cardRect, options = {}) {
    const padding = Number(options.padding ?? 4);
    const minX = Number(options.minX ?? padding);
    const minY = Number(options.minY ?? padding);
    const maxX = Number(canvasRect.width) - Number(cardRect.width) - padding;
    const maxY = Number(canvasRect.height) - Number(cardRect.height) - padding;
    return {
      x: Math.round(clamp(point.clientX - canvasRect.left - cardRect.width / 2, minX, maxX)),
      y: Math.round(clamp(point.clientY - canvasRect.top - cardRect.height / 2, minY, maxY))
    };
  }

  function topicLinkGeometry(from, to) {
    const fx = from.x + from.width / 2, fy = from.y + from.height / 2;
    const tx = to.x + to.width / 2, ty = to.y + to.height / 2;
    const right = to.x - (from.x + from.width);
    const left = from.x - (to.x + to.width);
    const down = to.y - (from.y + from.height);
    const up = from.y - (to.y + to.height);
    let start, end, axis;
    if (right >= 16 || (right > 0 && down < 16 && up < 16)) {
      axis = 'h'; start = { x: from.x + from.width + Math.min(3, right / 4), y: fy };
      end = { x: to.x - Math.min(8, right / 4), y: ty };
    } else if (left >= 16 || (left > 0 && down < 16 && up < 16)) {
      axis = 'h'; start = { x: from.x - Math.min(3, left / 4), y: fy };
      end = { x: to.x + to.width + Math.min(8, left / 4), y: ty };
    } else if (down > 0 || up > 0) {
      axis = 'v';
      const gap = down > 0 ? down : up;
      start = { x: fx, y: down > 0 ? from.y + from.height + Math.min(3, gap / 4) : from.y - Math.min(3, gap / 4) };
      end = { x: tx, y: down > 0 ? to.y - Math.min(8, gap / 4) : to.y + to.height + Math.min(8, gap / 4) };
    } else if (Math.abs(tx - fx) >= Math.abs(ty - fy)) {
      axis = 'h'; const dir = tx >= fx ? 1 : -1;
      start = { x: fx + dir * from.width / 2, y: fy };
      end = { x: tx - dir * to.width / 2, y: ty };
    } else {
      axis = 'v'; const dir = ty >= fy ? 1 : -1;
      start = { x: fx, y: fy + dir * from.height / 2 };
      end = { x: tx, y: ty - dir * to.height / 2 };
    }
    const span = axis === 'h' ? end.x - start.x : end.y - start.y;
    const bend = Math.sign(span || 1) * Math.min(88, Math.abs(span) * .42);
    const path = axis === 'h'
      ? `M${start.x},${start.y} C${start.x + bend},${start.y} ${end.x - bend},${end.y} ${end.x},${end.y}`
      : `M${start.x},${start.y} C${start.x},${start.y + bend} ${end.x},${end.y - bend} ${end.x},${end.y}`;
    return { start, end, axis, path };
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function chooseNewer(left, right) {
    const leftTime = recordTimestamp(left, left?._fileModified);
    const rightTime = recordTimestamp(right, right?._fileModified);
    return clone(rightTime >= leftTime ? right : left);
  }

  function mergeIdeas(browserIdeas = [], folderIdeas = []) {
    const byId = new Map();
    for (const idea of [...browserIdeas, ...folderIdeas]) {
      const key = String(idea.id);
      byId.set(key, byId.has(key) ? chooseNewer(byId.get(key), idea) : clone(idea));
    }

    const dedupeKeys = new Map();
    const items = [];
    let deduplicated = 0;
    for (const idea of byId.values()) {
      const normalized = normalizeText(idea.text);
      const created = idea.created || '';
      const duplicateKey = normalized && created ? `${normalized}\u0000${created}\u0000${idea.ctype || ''}` : '';
      if (duplicateKey && dedupeKeys.has(duplicateKey)) {
        const index = dedupeKeys.get(duplicateKey);
        items[index] = chooseNewer(items[index], idea);
        deduplicated += 1;
      } else {
        if (duplicateKey) dedupeKeys.set(duplicateKey, items.length);
        items.push(clone(idea));
      }
    }
    return { items, stats: { deduplicated } };
  }

  function mergeMaterials(browserMats = [], folderMats = []) {
    const byId = new Map();
    for (const material of [...browserMats, ...folderMats]) {
      const idKey = material.id == null ? '' : String(material.id);
      const contentKey = normalizeText(material.content);
      const key = idKey || `content:${contentKey}`;
      byId.set(key, byId.has(key) ? chooseNewer(byId.get(key), material) : clone(material));
    }
    return [...byId.values()];
  }

  function mergeSubtasks(browserSubtasks = [], folderSubtasks = []) {
    const byId = new Map();
    for (const sub of [...browserSubtasks, ...folderSubtasks]) {
      if (!sub || sub.id == null) continue;
      const key = String(sub.id);
      byId.set(key, byId.has(key) ? chooseNewer(byId.get(key), sub) : clone(sub));
    }
    return [...byId.values()].sort((a, b) =>
      String(a?.created || '').localeCompare(String(b?.created || '')) ||
      (Number(a?.id) - Number(b?.id))
    );
  }

  function stableBoardId(name) {
    let hash = 2166136261;
    for (const char of String(name)) {
      hash ^= char.codePointAt(0);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash >>> 0) || 1;
  }

  /* ---- 状态看板（2026-11-05 第二轮） ---- */
  const KANBAN_STATUSES = [
    { key: 'todo', label: '未开始', side: 'todo', dot: '#d9822b' },
    { key: 'doing', label: '进行中', side: 'todo', dot: '#e58e26' },
    { key: 'done', label: '已完成', side: 'todo', dot: '#9e9a8e' },
    { key: 'new', label: '闪念', side: 'idea', dot: '#3554d1' }
  ];

  function kanbanStatusOf(idea) {
    let status = idea?.status || 'new';
    if (status === 'brew') status = 'new'; // 酝酿中已并入想法
    if (status === 'new' && ['focus', 'todo'].includes(String(idea?.zone || ''))) {
      return 'todo'; // 旧三栏时代的待办卡归一化为"未开始"
    }
    return status;
  }

  function sortIdeasForKanban(items = []) {
    const pOrder = { high: 0, mid: 1, low: 2 };
    return [...items].sort((a, b) =>
      String(b?.created || '').localeCompare(String(a?.created || '')) ||
      (pOrder[a?.priority || 'mid'] - pOrder[b?.priority || 'mid']) ||
      (Number(b?.id) - Number(a?.id))
    );
  }

  function groupIdeasByKanban(items = []) {
    const columns = KANBAN_STATUSES.map((s) => ({ key: s.key, items: [] }));
    const byKey = new Map(columns.map((c) => [c.key, c.items]));
    const held = [];
    for (const item of items) {
      const key = kanbanStatusOf(item);
      if (key === 'hold') held.push(item);
      else (byKey.get(key) || byKey.get('new')).push(item); // 未知状态兜底进"新想法"
    }
    columns.forEach((c) => {
      // 想法列不按优先级（想法无轻重），新卡排在前面
      c.items = c.key === 'new'
        ? [...c.items].sort((a, b) =>
            String(b?.created || '').localeCompare(String(a?.created || '')) ||
            (Number(b?.id) - Number(a?.id)))
        : sortIdeasForKanban(c.items);
    });
    return { columns, held: sortIdeasForKanban(held) };
  }

  function shouldCarryIdea(idea, today) {
    if (!idea || idea.temporary === true) return false;
    // 带子项的主卡片保留在创建当日作为历史进度记录，不随“顺延未完成”搬走
    if (idea.ctype === 'master') return false;
    if ((idea.date || today) >= today) return false;
    return ['todo', 'doing'].includes(kanbanStatusOf(idea));
  }

  function isDueActive(due, today) {
    return Boolean(due) && due <= today;
  }

  /* ---- 项目白板模板与开发区域（2026-11-08 / 2026-11-10） ---- */
  const DEV_AREA_NAMES = ['Bug 修复', '体验优化', '新功能'];

  const BOARD_KINDS = [
    { key: 'dev',     label: '开发进行中' },
    { key: 'concept', label: '概念型项目', legacy: true },
    { key: 'idea',    label: '项目灵感白板', legacy: true }
  ];

  const NEW_BOARD_KINDS = [
    { key: 'dev', label: '开发进行中', desc: '预设 Bug 修复 / 体验优化 / 新功能 三个区域', isTemplate: true },
    { key: '',    label: '空白白板',   desc: '无预设区域的自由画布', isTemplate: false }
  ];

  function boardKindOf(board) {
    const kind = String(board?.kind || '').trim();
    return BOARD_KINDS.some((k) => k.key === kind) ? kind : ''; // 旧白板或空白白板无类型 = 自由画布
  }

  function devBoardAreas(options = {}) {
    const padX = Number(options.padX ?? 24);
    const padY = Number(options.padY ?? 24);
    const gap = Number(options.gap ?? 24);
    const baseW = Number(options.areaWidth ?? 340);
    const minH = Number(options.minHeight ?? 720);
    const canvasHeight = Number(options.canvasHeight ?? 0);
    const cards = Array.isArray(options.cards) ? options.cards : [];
    const subtasks = Array.isArray(options.subtasks) ? options.subtasks : [];
    const expandedDoneAreas = new Set(Array.isArray(options.expandedDoneAreas) ? options.expandedDoneAreas : []);
    let maxCardBottom = 0;
    for (const c of cards) {
      if (!c || !c.tarea || c.ctype === 'master' || DEV_AREA_NAMES.includes(c.tarea)) continue;
      const cy = Number(c.ty ?? c.y ?? 0);
      const ch = Number(c._height ?? 132);
      if (cy + ch > maxCardBottom) maxCardBottom = cy + ch;
    }
    let maxListBottom = 0;
    for (const name of DEV_AREA_NAMES) {
      const part = partitionDevAreaTasks(cards, subtasks, options.boardName || '', name);
      const visibleRows = part.active.length + (expandedDoneAreas.has(name) ? part.completed.length : 0);
      const estRowH = 44;
      const listH = padY + 56 + visibleRows * estRowH + (part.completed.length ? 44 : 0) + 64;
      if (listH > maxListBottom) maxListBottom = listH;
    }
    const h = Math.max(
      minH,
      canvasHeight ? canvasHeight - padY * 2 : 0,
      maxCardBottom ? maxCardBottom - padY + 40 : 0,
      maxListBottom ? maxListBottom - padY + 24 : 0
    );
    return DEV_AREA_NAMES.map((name, idx) => ({
      name,
      x: padX + idx * (baseW + gap),
      y: padY,
      w: baseW,
      h
    }));
  }

  /* ---- 统一开发任务卡片：按白板切换展示样式与已完成收起（2026-11-10） ---- */
  function isDevTaskCard(card, boardName = '') {
    if (!card || card.temporary === true || card.ctype === 'master') return false;
    if (boardName && card.board !== boardName) return false;
    return DEV_AREA_NAMES.includes(String(card.tarea || '').trim());
  }

  function partitionDevAreaTasks(cards = [], subtasks = [], boardName = '', areaName = '') {
    const matchBoard = (recordBoard) => !boardName || recordBoard === boardName;
    const unifiedItems = (Array.isArray(cards) ? cards : [])
      .filter((c) => c && c.temporary !== true && c.ctype !== 'master' && matchBoard(c.board) && c.tarea === areaName)
      .sort((a, b) =>
        String(a?.created || '').localeCompare(String(b?.created || '')) ||
        (Number(a?.id) - Number(b?.id))
      )
      .map((c) => ({
        kind: 'card',
        id: Number(c.id),
        done: kanbanStatusOf(c) === 'done',
        text: String(c.text || ''),
        date: c.date || '',
        created: c.created || '',
        card: c
      }));

    const legacyItems = (Array.isArray(subtasks) ? subtasks : [])
      .filter((s) => s && matchBoard(s.board) && s.tarea === areaName)
      .sort((a, b) =>
        String(a?.created || '').localeCompare(String(b?.created || '')) ||
        (Number(a?.id) - Number(b?.id))
      )
      .map((s) => ({
        kind: 'subtask',
        id: Number(s.id),
        done: Boolean(s.done),
        text: String(s.text || ''),
        date: String(s.created || '').slice(0, 10),
        created: s.created || '',
        subtask: s
      }));

    const combined = [...unifiedItems, ...legacyItems];
    const active = combined.filter((item) => !item.done);
    const completed = combined.filter((item) => item.done);
    return {
      active,
      completed,
      totalCount: combined.length,
      doneCount: completed.length
    };
  }

  function createUnifiedDevTask(options = {}) {
    const text = String(options.text ?? '').trim();
    if (!text) return null;
    const board = String(options.board ?? '').trim();
    const tarea = DEV_AREA_NAMES.includes(options.tarea) ? options.tarea : DEV_AREA_NAMES[0];
    const created = options.created || new Date().toISOString();
    const date = options.date || created.slice(0, 10);
    return {
      id: Number(options.id) || Date.now(),
      text,
      status: options.status || 'todo',
      priority: options.priority || 'high',
      zone: '',
      board,
      tarea,
      due: options.due || '',
      date,
      time: options.time || '',
      created,
      updated: options.updated || created,
      x: Number(options.x ?? 40),
      y: Number(options.y ?? 56),
      tx: Number(options.tx ?? 40),
      ty: Number(options.ty ?? 56),
      tags: Array.isArray(options.tags) ? [...options.tags] : [],
      temporary: false
    };
  }

  function assignCardToBoard(card, boardObj, requestedArea = '', updated = new Date().toISOString()) {
    const next = clone(card);
    if (!boardObj || !boardObj.name) {
      next.board = '';
      next.tarea = '';
      next.updated = updated;
      return next;
    }
    const isDev = boardKindOf(boardObj) === 'dev' || Boolean(boardObj._isDev);
    next.board = String(boardObj.name).trim();
    if (isDev) {
      next.tarea = DEV_AREA_NAMES.includes(requestedArea)
        ? requestedArea
        : (DEV_AREA_NAMES.includes(next.tarea) ? next.tarea : DEV_AREA_NAMES[0]);
    } else {
      next.tarea = '';
    }
    next.updated = updated;
    return next;
  }

  // 将旧版「带子项的主卡片 (ctype: master) + _subtasks.json 子任务」无损展开为独立普通卡片（保留各自原创建日期与完成状态，不把历史记录改写为今天）
  function convertMasterAndSubtasksToUnifiedCards(ideas = [], subtasks = []) {
    const byId = new Map();
    const removedMasterIds = [];
    const affectedDays = new Set();
    let convertedCount = 0;

    const masterDateBySubId = new Map();
    for (const raw of (Array.isArray(ideas) ? ideas : [])) {
      if (raw && raw.ctype === 'master' && raw.date) {
        for (const sid of uniqueIds(raw.subIds || [])) {
          if (!masterDateBySubId.has(sid)) masterDateBySubId.set(sid, raw.date);
        }
      }
    }

    for (const raw of (Array.isArray(ideas) ? ideas : [])) {
      if (!raw) continue;
      if (raw.ctype === 'master') {
        removedMasterIds.push(Number(raw.id));
        if (raw.date) affectedDays.add(raw.date);
        continue;
      }
      const copy = clone(raw);
      byId.set(Number(copy.id), copy);
    }

    for (const sub of (Array.isArray(subtasks) ? subtasks : [])) {
      if (!sub || sub.id == null) continue;
      const id = Number(sub.id);
      const created = sub.created || new Date().toISOString();
      const date = sub.date || (created ? created.slice(0, 10) : '') || masterDateBySubId.get(id) || new Date().toISOString().slice(0, 10);
      const cardFromSub = {
        id,
        file: `${date}.md`,
        text: String(sub.text || '').trim(),
        status: sub.done ? 'done' : 'todo',
        priority: 'high',
        zone: '',
        board: String(sub.board || '').trim(),
        tarea: DEV_AREA_NAMES.includes(sub.tarea) ? sub.tarea : DEV_AREA_NAMES[0],
        due: '',
        tfold: false,
        date,
        time: created.slice(5, 16).replace('T', ' '),
        created,
        updated: sub.updated || created,
        x: 40,
        y: 56,
        tx: 40,
        ty: 56,
        tags: [],
        temporary: false
      };
      if (byId.has(id)) {
        byId.set(id, chooseNewer(byId.get(id), cardFromSub));
      } else {
        byId.set(id, cardFromSub);
        convertedCount += 1;
      }
      affectedDays.add(date);
    }

    const nextIdeas = [...byId.values()].sort((a, b) =>
      String(a?.created || '').localeCompare(String(b?.created || '')) ||
      (Number(a?.id) - Number(b?.id))
    );
    return {
      ideas: nextIdeas,
      subtasks: [],
      convertedCount,
      removedMasterIds,
      affectedDays: [...affectedDays]
    };
  }

  function rectAtPoint(areas = [], x, y) {
    for (const a of areas) { // 数组末位为最上层
      if (x >= a.x && x <= a.x + a.w && y >= a.y && y <= a.y + a.h) return a.name;
    }
    return '';
  }

  // 在开发模板指定区域内计算新卡片的对齐坐标：水平居中于该区域，垂直从顶栏（及紧凑子任务列表）下方起按已有卡片顺延排布，不改已有卡片坐标
  function placeCardInDevArea(area, existingCards = [], options = {}) {
    const cardW = Number(options.cardWidth ?? 246);
    const cardH = Number(options.cardHeight ?? 116);
    const headerH = Number(options.headerHeight ?? 52);
    const subCount = Number(options.subtaskCount ?? 0);
    const subOffset = subCount > 0 ? (subCount * 36 + 52) : 0;
    const gapY = Number(options.gapY ?? 16);
    const padX = Number(options.padX ?? 16);
    const x = Math.max(area.x + padX, Math.round(area.x + (area.w - cardW) / 2));
    const startY = area.y + headerH + subOffset;
    const areaCards = existingCards.filter((c) => c && !c.temporary && c.ctype !== 'master' && c.tarea === area.name);
    if (!areaCards.length) {
      return { x, y: startY, tarea: area.name };
    }
    let maxBottom = startY - gapY;
    for (const c of areaCards) {
      const cy = Number(c.ty ?? c.y ?? startY);
      const ch = Number(c._height ?? cardH);
      if (cy + ch > maxBottom) maxBottom = cy + ch;
    }
    return { x, y: Math.max(startY, Math.round(maxBottom + gapY)), tarea: area.name };
  }

  /* ---- 带子项的主卡片与项目子任务（2026-11-10） ---- */
  function uniqueIds(list = []) {
    const seen = new Set();
    const out = [];
    for (const raw of (Array.isArray(list) ? list : [])) {
      const id = Number(raw);
      if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
    return out;
  }

  function computeMasterProgress(card, subtasks = [], today = '') {
    const byId = new Map((subtasks || []).map((s) => [Number(s?.id), s]));
    const rawIds = uniqueIds(card?.subIds || []);
    const validLinked = rawIds
      .map((id) => byId.get(id))
      .filter((s) => s && (!card?.board || s.board === card.board) && (!card?.tarea || s.tarea === card.tarea));
    const subIds = validLinked.map((s) => Number(s.id));
    const isHistorical = Boolean(today && card?.date && String(card.date) < String(today));

    let doneIds;
    if (isHistorical && Array.isArray(card?.doneIds)) {
      const recordedDone = new Set(uniqueIds(card.doneIds));
      doneIds = subIds.filter((id) => recordedDone.has(id));
    } else if (isHistorical) {
      doneIds = validLinked
        .filter((s) => Boolean(s.done) && (!s.doneDate || String(s.doneDate) <= String(card.date)))
        .map((s) => Number(s.id));
    } else {
      doneIds = validLinked.filter((s) => Boolean(s.done)).map((s) => Number(s.id));
    }

    const total = subIds.length;
    const done = doneIds.length;
    const prog = `${done}/${total}`;
    // 状态规则：没有子任务时不能自动算完成（todo）；0 完成为 todo；部分完成为 doing；全部验收通过为 done
    const status = total === 0 ? 'todo' : (done === 0 ? 'todo' : (done >= total ? 'done' : 'doing'));
    return { done, total, prog, status, subIds, doneIds, isHistorical };
  }

  function syncMasterCardsWithSubtasks(ideas = [], subtasks = [], today = '') {
    const changedDays = new Set();
    const nextIdeas = (ideas || []).map((idea) => {
      if (!idea || idea.ctype !== 'master') return clone(idea);
      const copy = clone(idea);
      const p = computeMasterProgress(copy, subtasks, today);
      const prevKey = `${(copy.subIds || []).join(',')}#${(copy.doneIds || []).join(',')}#${copy.prog || ''}#${copy.status || ''}`;
      copy.subIds = p.subIds;
      copy.doneIds = p.doneIds;
      copy.prog = p.prog;
      if (copy.status !== 'hold') {
        copy.status = p.status;
      }
      const nextKey = `${copy.subIds.join(',')}#${copy.doneIds.join(',')}#${copy.prog}#${copy.status}`;
      if (prevKey !== nextKey && copy.date) {
        changedDays.add(copy.date);
      }
      return copy;
    });
    return { ideas: nextIdeas, changedDays: [...changedDays] };
  }

  function availableSubtasksForMaster(masterCard, subtasks = []) {
    if (!masterCard || !masterCard.board || !masterCard.tarea) return [];
    const linkedSet = new Set(uniqueIds(masterCard.subIds || []));
    return (subtasks || [])
      .filter((s) => s && s.board === masterCard.board && s.tarea === masterCard.tarea && !linkedSet.has(Number(s.id)))
      .map(clone)
      .sort((a, b) =>
        (Number(Boolean(a.done)) - Number(Boolean(b.done))) ||
        String(a?.created || '').localeCompare(String(b?.created || '')) ||
        (Number(a?.id) - Number(b?.id))
      );
  }

  function linkSubtasksToMaster(masterCard, newSubtaskIds = [], subtasks = [], today = '') {
    const copy = clone(masterCard);
    copy.subIds = uniqueIds([...(copy.subIds || []), ...(newSubtaskIds || [])]);
    // 在某张主卡片上主动关联新子任务时，按当前真实状态刷新该卡片的进度快照
    const byId = new Map((subtasks || []).map((s) => [Number(s?.id), s]));
    copy.doneIds = copy.subIds.filter((id) => Boolean(byId.get(id)?.done));
    const p = computeMasterProgress(copy, subtasks, copy.date || today);
    copy.subIds = p.subIds;
    copy.doneIds = p.doneIds;
    copy.prog = p.prog;
    if (copy.status !== 'hold') copy.status = p.status;
    return copy;
  }

  function unlinkSubtaskFromMaster(masterCard, subtaskId, subtasks = [], today = '') {
    const targetId = Number(subtaskId);
    const copy = clone(masterCard);
    copy.subIds = uniqueIds(copy.subIds || []).filter((id) => id !== targetId);
    if (Array.isArray(copy.doneIds)) {
      copy.doneIds = uniqueIds(copy.doneIds).filter((id) => id !== targetId);
    }
    const p = computeMasterProgress(copy, subtasks, today);
    copy.subIds = p.subIds;
    copy.doneIds = p.doneIds;
    copy.prog = p.prog;
    if (copy.status !== 'hold') copy.status = p.status;
    return copy;
  }

  function deleteSubtaskFromProject(ideas = [], subtasks = [], subtaskId, today = '') {
    const targetId = Number(subtaskId);
    const removedSubtask = (subtasks || []).find((s) => Number(s?.id) === targetId) || null;
    const nextSubtasks = (subtasks || []).filter((s) => Number(s?.id) !== targetId).map(clone);
    const affectedCardIds = [];
    const cleanedIdeas = (ideas || []).map((idea) => {
      if (!idea || idea.ctype !== 'master') return clone(idea);
      const hasRef = uniqueIds(idea.subIds || []).includes(targetId);
      if (hasRef) affectedCardIds.push(Number(idea.id));
      const copy = clone(idea);
      copy.subIds = uniqueIds(copy.subIds || []).filter((id) => id !== targetId);
      if (Array.isArray(copy.doneIds)) {
        copy.doneIds = uniqueIds(copy.doneIds).filter((id) => id !== targetId);
      }
      return copy;
    });
    const synced = syncMasterCardsWithSubtasks(cleanedIdeas, nextSubtasks, today);
    return {
      ideas: synced.ideas,
      subtasks: nextSubtasks,
      removedSubtask: removedSubtask ? clone(removedSubtask) : null,
      affectedCardIds,
      changedDays: synced.changedDays
    };
  }

  function changeMasterCardScope(ideas = [], subtasks = [], masterCardId, nextScope = {}, today = '') {
    const targetCardId = Number(masterCardId);
    const master = (ideas || []).find((i) => Number(i?.id) === targetCardId && i?.ctype === 'master');
    if (!master) return { ideas: ideas.map(clone), subtasks: subtasks.map(clone), changedDays: [] };
    const nextBoard = nextScope.board !== undefined ? String(nextScope.board).trim() : master.board;
    const nextTarea = nextScope.tarea !== undefined && DEV_AREA_NAMES.includes(nextScope.tarea) ? nextScope.tarea : master.tarea;
    const linkedSet = new Set(uniqueIds(master.subIds || []));
    const nowIso = new Date().toISOString();

    const nextSubtasks = (subtasks || []).map((s) => {
      if (!linkedSet.has(Number(s?.id))) return clone(s);
      return { ...clone(s), board: nextBoard, tarea: nextTarea, updated: nowIso };
    });

    const updatedIdeas = (ideas || []).map((i) => {
      if (Number(i?.id) !== targetCardId) return clone(i);
      return { ...clone(i), board: nextBoard, tarea: nextTarea, updated: nowIso };
    });

    const synced = syncMasterCardsWithSubtasks(updatedIdeas, nextSubtasks, today);
    return {
      ideas: synced.ideas,
      subtasks: nextSubtasks,
      changedDays: synced.changedDays
    };
  }

  function changeSubtaskScope(ideas = [], subtasks = [], subtaskId, nextScope = {}, today = '') {
    const targetId = Number(subtaskId);
    const nowIso = new Date().toISOString();
    const nextSubtasks = (subtasks || []).map((s) => {
      if (Number(s?.id) !== targetId) return clone(s);
      const nextBoard = nextScope.board !== undefined ? String(nextScope.board).trim() : s.board;
      const nextTarea = nextScope.tarea !== undefined && DEV_AREA_NAMES.includes(nextScope.tarea) ? nextScope.tarea : s.tarea;
      return { ...clone(s), board: nextBoard, tarea: nextTarea, updated: nowIso };
    });
    const synced = syncMasterCardsWithSubtasks(ideas, nextSubtasks, today);
    return {
      ideas: synced.ideas,
      subtasks: nextSubtasks,
      changedDays: synced.changedDays
    };
  }

  /* ---- 左侧项目列表排序（2026-11-10） ---- */
  function sortBoards(boards = []) {
    const unordered = boards
      .filter((b) => !Number.isFinite(Number(b?.order)))
      .sort((a, b) => (Number(b?.id) || 0) - (Number(a?.id) || 0));
    const ordered = boards
      .filter((b) => Number.isFinite(Number(b?.order)))
      .sort((a, b) => (Number(a.order) - Number(b.order)) || ((Number(b?.id) || 0) - (Number(a?.id) || 0)));
    return [...unordered, ...ordered];
  }

  function reorderBoards(boards = [], movedIdOrName, targetIdOrName, position = 'before', updated = new Date().toISOString()) {
    const list = sortBoards(boards).map(clone);
    const matchKey = (b, key) => b.id === key || String(b.id) === String(key) || b.name === key;
    const fromIdx = list.findIndex((b) => matchKey(b, movedIdOrName));
    const targetIdx = list.findIndex((b) => matchKey(b, targetIdOrName));
    if (fromIdx < 0 || targetIdx < 0 || fromIdx === targetIdx) {
      return list;
    }
    const [moved] = list.splice(fromIdx, 1);
    let insertAt = list.findIndex((b) => matchKey(b, targetIdOrName));
    if (position === 'after') insertAt += 1;
    list.splice(insertAt, 0, moved);
    return list.map((b, idx) => ({
      ...b,
      order: idx + 1,
      updated
    }));
  }

  /* ---- 项目白板多选、整组移动与批量删除辅助（2026-11-10） ---- */
  function toggleCardSelection(selectedIds = [], clickedId, modifiers = {}) {
    const id = Number(clickedId);
    const current = Array.isArray(selectedIds) ? selectedIds.map(Number) : [...selectedIds].map(Number);
    const set = new Set(current);
    if (modifiers.metaKey || modifiers.ctrlKey || modifiers.shiftKey) {
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return [...set];
    }
    return [id];
  }

  function moveSelectedCards(cards = [], selectedIds = [], dx = 0, dy = 0, options = {}) {
    const minX = Number(options.minX ?? 4);
    const minY = Number(options.minY ?? 4);
    const areas = Array.isArray(options.areas) ? options.areas : [];
    const cardW = Number(options.cardWidth ?? 246);
    const cardH = Number(options.cardHeight ?? 116);
    const sel = new Set((Array.isArray(selectedIds) ? selectedIds : [...selectedIds]).map(Number));
    const moving = cards.filter((c) => sel.has(Number(c?.id)));
    if (!moving.length) return cards.map(clone);
    const minOx = Math.min(...moving.map((c) => Number(c.tx ?? c.x ?? minX)));
    const minOy = Math.min(...moving.map((c) => Number(c.ty ?? c.y ?? minY)));
    const effDx = Math.max(minX - minOx, Math.round(Number(dx) || 0));
    const effDy = Math.max(minY - minOy, Math.round(Number(dy) || 0));
    return cards.map((c) => {
      if (!sel.has(Number(c?.id))) return clone(c);
      const nx = Math.round(Number(c.tx ?? c.x ?? minX) + effDx);
      const ny = Math.round(Number(c.ty ?? c.y ?? minY) + effDy);
      const next = { ...clone(c), tx: nx, ty: ny };
      if (areas.length) {
        const w = Number(c._width ?? cardW);
        const h = Number(c._height ?? cardH);
        next.tarea = rectAtPoint(areas, nx + w / 2, ny + h / 2);
      }
      return next;
    });
  }

  function deleteSelectedCards(cards = [], links = [], selectedIds = []) {
    const sel = new Set((Array.isArray(selectedIds) ? selectedIds : [...selectedIds]).map(Number));
    if (!sel.size) {
      return { cards: cards.map(clone), links: links.map(clone), removedCards: [], removedLinks: [] };
    }
    const removedCards = [];
    const keptCards = [];
    for (const c of cards) {
      if (sel.has(Number(c?.id))) removedCards.push(clone(c));
      else keptCards.push(clone(c));
    }
    const removedLinks = [];
    const keptLinks = [];
    for (const l of links) {
      if (sel.has(Number(l?.f)) || sel.has(Number(l?.t))) removedLinks.push(clone(l));
      else keptLinks.push(clone(l));
    }
    return { cards: keptCards, links: keptLinks, removedCards, removedLinks };
  }

  /* ---- 素材库当前分组自动归属、草稿新建、原位编辑与筛选可见性（2026-11-10） ---- */
  function activeMaterialGroup(groupFilter = 'all', groups = []) {
    const f = String(groupFilter ?? '').trim();
    if (!f || f === 'all' || f === 'ungrouped') return '';
    return Array.isArray(groups) && groups.includes(f) ? f : '';
  }

  function createDraftMaterialCard(options = {}) {
    const mgroup = activeMaterialGroup(options.groupFilter ?? options.mgroup ?? '', options.groups || [options.mgroup].filter(Boolean));
    const tags = Array.isArray(options.tags)
      ? options.tags.map((t) => String(t ?? '').trim().replace(/^#/, '')).filter(Boolean)
      : [];
    return {
      id: Number(options.id) || Date.now(),
      _draft: true,
      temporary: true,
      type: 'text',
      content: '',
      title: '',
      note: '',
      mgroup,
      tags
    };
  }

  function finalizeDraftMaterialCard(draft, rawContent, meta = {}) {
    const content = String(rawContent ?? '').trim();
    if (!stripRichText(content).trim()) return null;
    const created = meta.created || new Date().toISOString();
    return {
      id: Number(meta.id) || Date.now(),
      type: 'text',
      content,
      title: String(draft?.title ?? '').trim(),
      note: String(draft?.note ?? '').trim(),
      mgroup: String(draft?.mgroup ?? '').trim(),
      tags: Array.isArray(draft?.tags) ? [...draft.tags] : [],
      time: meta.time || created.slice(5, 16).replace('T', ' '),
      created,
      updated: meta.updated || created
    };
  }

  function applyMaterialInlineEdit(material, rawValue, updated = new Date().toISOString()) {
    const copy = clone(material);
    const type = copy.type || 'text';
    if (type === 'text') {
      const trimmed = String(rawValue ?? '').trim();
      if (!trimmed) return { ok: false, reason: 'empty', material: copy };
      copy.content = trimmed;
      copy.updated = updated;
      return { ok: true, material: copy };
    }
    if (type === 'link') {
      copy.title = String(rawValue ?? '').trim();
      copy.updated = updated;
      return { ok: true, material: copy };
    }
    if (type === 'img') {
      copy.note = String(rawValue ?? '').trim();
      copy.updated = updated;
      return { ok: true, material: copy };
    }
    return { ok: false, reason: 'unsupported', material: copy };
  }

  function isMaterialVisibleInView(material, { groupFilter = 'all', tagFilter = '', groups = [] } = {}) {
    if (!material) return false;
    const effGrp = (material.mgroup && Array.isArray(groups) && groups.includes(material.mgroup)) ? material.mgroup : '';
    if (groupFilter === 'ungrouped' && effGrp) return false;
    if (groupFilter !== 'all' && groupFilter !== 'ungrouped' && effGrp !== groupFilter) return false;
    const ft = String(tagFilter ?? '').trim().replace(/^#/, '').toLowerCase();
    if (!ft) return true;
    return (material.tags || []).some((t) => String(t ?? '').toLowerCase().includes(ft));
  }

  function parseBoardMarkdown({ fileName = '', text = '', fileModified = 0 }) {
    const parsed = parseMarkdown(text);
    const heading = parsed.body.match(/^#\s+(.+)$/m)?.[1]?.trim();
    const fallback = fileName.replace(/\.md$/i, '');
    const name = parsed.fm.name || heading || fallback;
    if (!name) throw new Error(`无法确定白板名称：${fileName || '未命名文件'}`);
    return {
      id: Number(parsed.fm.id) || stableBoardId(name),
      type: parsed.fm.type || 'board',
      kind: BOARD_KINDS.some((k) => k.key === parsed.fm.kind) ? parsed.fm.kind : '',
      order: Number.isFinite(Number(parsed.fm.order)) ? Number(parsed.fm.order) : undefined,
      name,
      created: parsed.fm.created || '',
      updated: parsed.fm.updated || '',
      _fileModified: fileModified
    };
  }

  function mergeBoardRecord(prev, next) {
    const prevTime = recordTimestamp(prev, prev?._fileModified);
    const nextTime = recordTimestamp(next, next?._fileModified);
    const newer = nextTime >= prevTime ? next : prev;
    const older = nextTime >= prevTime ? prev : next;
    const merged = clone(newer);
    if (!Number.isFinite(Number(merged.order)) && Number.isFinite(Number(older?.order))) {
      merged.order = Number(older.order);
    }
    if (!merged.kind && older?.kind) {
      merged.kind = older.kind;
    }
    return merged;
  }

  function reconcileBoards(boards = [], ideas = [], subtasks = []) {
    // 同 id 不同名的记录（重命名残留）只保留卡片归属最多的一条，其次取 updated 较新；同名同 id 合并保留最新 order/kind
    const byId = new Map();
    const cardCount = (name) =>
      ideas.filter((i) => i?.board === name).length +
      subtasks.filter((s) => s?.board === name).length;
    for (const board of boards) {
      if (!board?.name) continue;
      const prev = byId.get(board.id);
      if (!prev) { byId.set(board.id, clone(board)); continue; }
      if (prev.name === board.name) {
        byId.set(board.id, mergeBoardRecord(prev, board));
        continue;
      }
      const prevScore = cardCount(prev.name) * 2 + (recordTimestamp(prev, prev._fileModified) > recordTimestamp(board, board._fileModified) ? 1 : 0);
      const curScore = cardCount(board.name) * 2 + (recordTimestamp(board, board._fileModified) > recordTimestamp(prev, prev._fileModified) ? 1 : 0);
      if (curScore > prevScore) byId.set(board.id, mergeBoardRecord(prev, board));
      else byId.set(board.id, mergeBoardRecord(board, prev));
    }
    const byName = new Map();
    for (const board of byId.values()) {
      if (byName.has(board.name)) {
        byName.set(board.name, mergeBoardRecord(byName.get(board.name), board));
      } else {
        byName.set(board.name, board);
      }
    }
    for (const idea of ideas) {
      const name = String(idea?.board || '').trim();
      if (name && !byName.has(name)) {
        byName.set(name, {
          id: stableBoardId(name), name,
          created: idea.created || '', recovered: true
        });
      }
    }
    for (const sub of subtasks) {
      const name = String(sub?.board || '').trim();
      if (name && !byName.has(name)) {
        byName.set(name, {
          id: stableBoardId(name), name, kind: 'dev',
          created: sub.created || '', recovered: true
        });
      }
    }
    return [...byName.values()];
  }

  function escapeFrontmatter(value) {
    return String(value ?? '').replace(/"/g, '\\"');
  }

  function serializeBoardMarkdown(board, cards = [], subtasks = []) {
    const lines = [
      '---',
      'type: board',
      `id: ${board.id}`,
      `name: "${escapeFrontmatter(board.name)}"`,
      ...(Number.isFinite(board.order) ? [`order: ${Math.round(board.order)}`] : []),
      ...(board.kind ? [`kind: ${board.kind}`] : []),
      `created: ${board.created || ''}`,
      `updated: ${board.updated || new Date().toISOString()}`,
      '---', '', `# ${board.name}`, ''
    ];
    const boardSubs = (subtasks || []).filter((s) => s && s.board === board.name);
    const areaCards = (cards || []).filter((c) => c && c.ctype !== 'master' && DEV_AREA_NAMES.includes(c.tarea));
    const freeCards = (cards || []).filter((c) => c && c.ctype !== 'master' && !DEV_AREA_NAMES.includes(c.tarea));
    if (areaCards.length || boardSubs.length) {
      for (const areaName of DEV_AREA_NAMES) {
        const cList = areaCards.filter((c) => c.tarea === areaName);
        const sList = boardSubs.filter((s) => s.tarea === areaName);
        if (!cList.length && !sList.length) continue;
        lines.push(`## ${areaName}`, '');
        for (const card of cList) {
          const target = String(card.file || card.date || '').replace(/\.md$/i, '');
          const anchor = (isDailyFileName(card.file) || /^\d{4}-\d{2}-\d{2}$/.test(target))
            ? `${target}#^c-${card.id}`
            : target;
          const isDone = kanbanStatusOf(card) === 'done';
          lines.push(`- [${isDone ? 'x' : ' '}] [[${anchor}]] ${normalizeText(card.text).slice(0, 80) || '（空）'}`);
        }
        for (const s of sList) {
          lines.push(`- [${s.done ? 'x' : ' '}] ${normalizeText(s.text) || '（空）'} ^s-${s.id}`);
        }
        lines.push('');
      }
    }
    if (freeCards.length) {
      for (const card of freeCards) {
        const target = String(card.file || '').replace(/\.md$/i, '');
        const anchor = isDailyFileName(card.file) ? `${target}#^c-${card.id}` : target;
        lines.push(`- [[${anchor}]] ${normalizeText(card.text).slice(0, 50) || '（空）'}`);
      }
    } else if (!areaCards.length && !boardSubs.length) {
      lines.push('（暂无卡片，在工作台里把卡片发送到这个白板即可）');
    }
    return `${lines.join('\n')}\n`;
  }

  /* ---- 按天存储（2026-11-07）：一天一个 md，卡片分节带块引用锚点 ---- */
  function isDailyFileName(name) {
    return /^\d{4}-\d{2}-\d{2}\.md$/.test(String(name || ''));
  }

  function parseDailyMarkdown(text) {
    const parsed = parseMarkdown(String(text ?? ''));
    const cards = [];
    const re = /^## c-(\d+)[^\n]*$/gm;
    const marks = [];
    let m;
    while ((m = re.exec(parsed.body))) marks.push({ id: Number(m[1]), headAt: m.index, contentAt: m.index + m[0].length });
    for (let i = 0; i < marks.length; i++) {
      const raw = parsed.body.slice(marks[i].contentAt, i + 1 < marks.length ? marks[i + 1].headAt : undefined);
      const fields = {};
      let bodyStart = 0;
      for (const line of raw.split('\n')) {
        const kv = line.match(/^- ([\w-]+):\s*(.*)$/);
        if (kv) { fields[kv[1]] = parseScalar(kv[2]); bodyStart += line.length + 1; }
        else if (!line.trim()) { bodyStart += line.length + 1; }
        else break;
      }
      const body = raw.slice(bodyStart).replace(/^\n+/, '').replace(/\n+$/, '');
      cards.push({ id: marks[i].id, fields, body });
    }
    return { fm: parsed.fm, cards };
  }

  function serializeDailyMarkdown(date, cards = []) {
    const sorted = [...cards].sort((a, b) =>
      String(a?.created || '').localeCompare(String(b?.created || '')) || (Number(a?.id) - Number(b?.id)));
    const lines = ['---', 'type: daily', `date: ${date}`, `updated: ${new Date().toISOString()}`, '---', ''];
    for (const c of sorted) {
      lines.push(`## c-${c.id} ^c-${c.id}`, '');
      const fields = [
        ['status', c.status || 'new'], ['priority', c.priority || 'mid'], ['zone', c.zone || ''],
        ['board', c.board || ''], ['tarea', c.tarea || ''], ['due', c.due || ''], ['tfold', c.tfold ? '1' : ''],
        ...(c.ctype === 'master'
          ? [
              ['ctype', 'master'],
              ['prog', c.prog || '0/0'],
              ['mfold', c.mfold === false ? '0' : '1']
            ]
          : []),
        ['created', c.created || ''], ['updated', c.updated || c.created || ''],
        ['x', Math.round(Number(c.x) || 0)], ['y', Math.round(Number(c.y) || 0)],
        ['tx', Math.round(Number(c.tx ?? c.x) || 0)], ['ty', Math.round(Number(c.ty ?? c.y) || 0)]
      ];
      for (const [k, v] of fields) lines.push(`- ${k}: ${escapeFrontmatter(String(v))}`);
      if (c.ctype === 'master') {
        const subIds = uniqueIds(c.subIds || []);
        const doneIds = uniqueIds(c.doneIds || []);
        lines.push(`- subids: [${subIds.join(', ')}]`);
        lines.push(`- doneids: [${doneIds.join(', ')}]`);
      }
      lines.push(`- tags: [${(c.tags || []).map(escapeFrontmatter).join(', ')}]`, '', String(c.text || ''), '');
    }
    return lines.join('\n') + '\n';
  }

  function planLegacyMigration(ideas = [], today = '') {
    const legacy = ideas.filter((i) => i && i.temporary !== true && i.file && !isDailyFileName(i.file));
    const byDay = new Set();
    for (const i of ideas) {
      if (!i || i.temporary !== false && i.temporary === true) continue;
      byDay.add(i.date || today);
    }
    return { legacyCount: legacy.length, legacyFiles: [...new Set(legacy.map((i) => i.file))], days: [...byDay] };
  }

  /* ---- 月视图日历（2026-11-07）：周一起始的 42 格月网格 ---- */
  function calendarMonthGrid(year, month, weekStartsOn = 1) {
    const first = new Date(Date.UTC(year, month - 1, 1));
    const startOffset = (first.getUTCDay() - weekStartsOn + 7) % 7;
    const start = new Date(first);
    start.setUTCDate(1 - startOffset);
    const cells = [];
    for (let i = 0; i < 42; i++) {
      const d = new Date(start);
      d.setUTCDate(start.getUTCDate() + i);
      const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
      const dd = String(d.getUTCDate()).padStart(2, '0');
      cells.push({
        date: `${d.getUTCFullYear()}-${mm}-${dd}`,
        day: d.getUTCDate(),
        inMonth: d.getUTCMonth() + 1 === month
      });
    }
    return cells;
  }

  /* ---- 素材局部富文本（2026-11-13）：受限白名单，双端（工作台/Obsidian）可读 ---- */
  const RICH_COLORS = ['#c0392b', '#d35400', '#1e8449', '#1f618d', '#7f8c8d']; // 红/橙/绿/蓝/灰
  const RICH_SIZES = ['0.92em', '1em', '1.18em']; // 小/标准/大（标准通常不产生标签）

  function isAllowedRichTag(tag) {
    return tag === 'b' || tag === 'br';
  }

  // span 的 style 白名单判定：返回应保留的内联样式字符串，非法返回 ''
  function allowedRichSpanStyle(style) {
    const s = String(style || '').toLowerCase().replace(/\s+/g, '');
    const color = s.match(/(?:^|;)color:([^;]+)/)?.[1];
    const size = s.match(/(?:^|;)font-size:([^;]+)/)?.[1];
    const weight = /font-weight:(bold|[6-9]00)/.test(s);
    let keep = '';
    if (RICH_COLORS.includes(color)) keep += `;color:${color}`;
    if (RICH_SIZES.includes(size)) keep += `;font-size:${size}`;
    return (weight ? ';font-weight:bold' : '') + keep;
  }

  function stripRichText(html) {
    return String(html ?? '')
      .replace(/<br\b[^>]*>/gi, '\n') // 换行标签转真实换行，保证纯文本摘要/搜索不断行
      .replace(/<(b|span|font|small|big|strong|i|em|u|s|div|p)\b[^>]*>/gi, '')
      .replace(/<\/(b|span|font|small|big|strong|i|em|u|s|div|p)>/gi, '')
      .replace(/<[^>]+>/g, '') // 兜底剥掉其余一切标签
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
      .replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');
  }

  function mergeGroups(folderGroups = [], browserGroups = []) {
    const seen = new Set();
    const out = [];
    for (const name of [...folderGroups, ...browserGroups]) {
      const key = String(name ?? '').trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(key);
    }
    return out;
  }

  function mergeLinks(browserLinks = [], folderLinks = []) {
    const seen = new Set();
    const links = [];
    for (const link of [...browserLinks, ...folderLinks]) {
      const ends = [Number(link.f), Number(link.t)].sort((a, b) => a - b);
      const key = `${ends[0]}:${ends[1]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      links.push(clone(link));
    }
    return links;
  }

  function appendLink(existing = [], from, to) {
    // 树语义：f=父 t=子；每卡最多一个父（挂新父自动替换旧边）；禁止自连与成环
    const f = Number(from);
    const t = Number(to);
    if (!f || !t || f === t) return { added: false, reason: 'self', links: clone(existing) };
    const parentOf = new Map();
    for (const link of existing) parentOf.set(Number(link.t), Number(link.f));
    let cur = f;
    const seen = new Set([f]);
    while (parentOf.has(cur)) {
      cur = parentOf.get(cur);
      if (cur === t) return { added: false, reason: 'cycle', links: clone(existing) };
      if (seen.has(cur)) break; // 旧数据成环时止损
      seen.add(cur);
    }
    const replaced = parentOf.has(t) && parentOf.get(t) !== f;
    const links = clone(existing).filter((l) => Number(l.t) !== t);
    links.push({ f, t });
    return { added: true, replaced, links };
  }

  function layoutTopicTree(cards = [], links = [], opts = {}) {
    // 横向树：根在左、子树向右；父垂直居中于子女；折叠节点按叶占位；环成员按根处理。
    // opts.heightOf(id) 返回卡片实际渲染高度（px）：按真实高度纵向堆叠，长文本不再压住后续卡；
    // 不提供时退回固定行距（每卡 164px），与历史行为完全一致。
    const gapX = 286, gapY = 164, startX = 40, startY = 40;
    const rowGap = Number.isFinite(Number(opts.rowGap)) ? Number(opts.rowGap) : 24;
    const fallbackH = gapY - rowGap; // 140：无高度信息时的默认卡高，保证旧行为数值不变
    const heightOfFn = typeof opts.heightOf === 'function' ? opts.heightOf : null;
    const heightOf = (id) => {
      const v = heightOfFn ? Number(heightOfFn(id)) : NaN;
      return Number.isFinite(v) && v >= 40 ? v : fallbackH;
    };
    const ids = new Set(cards.map((c) => Number(c?.id)));
    const parentOf = new Map();
    const childrenOf = new Map();
    for (const link of links) {
      const f = Number(link?.f), t = Number(link?.t);
      if (!ids.has(f) || !ids.has(t) || f === t || parentOf.has(t)) continue;
      parentOf.set(t, f);
    }
    for (const t of parentOf.keys()) {
      const f = parentOf.get(t);
      if (!childrenOf.has(f)) childrenOf.set(f, []);
      childrenOf.get(f).push(t);
    }
    const byId = new Map(cards.map((c) => [Number(c?.id), c]));
    const orderKey = (id) => `${byId.get(id)?.created || ''}\u0000${String(id).padStart(12, '0')}`;
    const compareOrder = (a, b) => {
      if(typeof opts.orderOf === 'function'){
        const ay = Number(opts.orderOf(a)), by = Number(opts.orderOf(b));
        if(Number.isFinite(ay) && Number.isFinite(by) && ay !== by) return ay - by;
      }
      return orderKey(a) < orderKey(b) ? -1 : 1;
    };
    for (const list of childrenOf.values()) list.sort(compareOrder);

    const terminates = (id) => {
      const seen = new Set();
      let cur = id;
      while (parentOf.has(cur)) {
        if (seen.has(cur)) return false;
        seen.add(cur);
        cur = parentOf.get(cur);
      }
      return true;
    };
    const roots = cards
      .map((c) => Number(c.id))
      .filter((id) => !parentOf.has(id) || !terminates(id))
      .sort(compareOrder);

    const folded = new Set(cards.filter((c) => c?.tfold === true).map((c) => Number(c.id)));
    const positions = new Map();
    const placed = new Set();
    let y = startY;
    const place = (id, depth) => {
      if (placed.has(id)) return;
      placed.add(id);
      const h = heightOf(id);
      const kids = (folded.has(id) ? [] : (childrenOf.get(id) || [])).filter((k) => !placed.has(k));
      if (!kids.length) {
        positions.set(id, { x: startX + depth * gapX, y });
        y += h + rowGap;
        return;
      }
      const firstY = y;
      let lastKidY = y;
      for (const k of kids) {
        place(k, depth + 1);
        const p = positions.get(k);
        if (p && p.y > lastKidY) lastKidY = p.y;
      }
      const cy = Math.round((firstY + lastKidY) / 2); // 父居中于子女带（无高度时与旧公式一致）
      positions.set(id, { x: startX + depth * gapX, y: cy });
      const parentBottom = cy + h;
      const subtreeBottom = y - rowGap; // 最后一个后代的底部
      if (parentBottom > subtreeBottom) y = parentBottom + rowGap; // 超高父撑开后续树的起点
    };
    for (const r of roots) place(r, 0);
    return { positions, roots, childrenOf, folded };
  }

  function reflowLinkedTopicTrees(beforeCards = [], beforeLinks = [], cards = [], links = [], changedIds = [], opts = {}) {
    // 只整理发生变化的连线树；保留卡片横坐标、树的原起点和自由卡位置。
    const beforeById = new Map(beforeCards.map(c => [Number(c.id), c]));
    const afterById = new Map(cards.map(c => [Number(c.id), c]));
    const neighbors = new Map();
    for (const link of beforeLinks) {
      const f = Number(link.f), t = Number(link.t);
      if (!beforeById.has(f) || !beforeById.has(t) || f === t) continue;
      if (!neighbors.has(f)) neighbors.set(f, new Set());
      if (!neighbors.has(t)) neighbors.set(t, new Set());
      neighbors.get(f).add(t);
      neighbors.get(t).add(f);
    }
    const seen = new Set();
    const positions = new Map();
    for (const changedId of changedIds) {
      const start = Number(changedId);
      if (seen.has(start) || !neighbors.has(start)) continue;
      const group = new Set();
      const pending = [start];
      while (pending.length) {
        const id = pending.pop();
        if (group.has(id)) continue;
        group.add(id);
        seen.add(id);
        for (const next of neighbors.get(id) || []) pending.push(next);
      }
      const remaining = [...group].filter(id => afterById.has(id)).map(id => afterById.get(id));
      if (!remaining.length) continue;
      const anchorY = Math.min(...[...group].map(id => {
        const c = beforeById.get(id);
        return Number(c?.ty ?? c?.y ?? 40);
      }));
      const groupLinks = links.filter(l => group.has(Number(l.f)) && group.has(Number(l.t)));
      const laidOut = layoutTopicTree(remaining, groupLinks, {
        ...opts,
        orderOf: id => beforeById.get(id)?.ty ?? beforeById.get(id)?.y
      }).positions;
      const firstY = Math.min(...[...laidOut.values()].map(p => p.y));
      for (const [id, p] of laidOut) {
        const nextY = Math.round(anchorY + p.y - firstY);
        if (Number(afterById.get(id).ty ?? afterById.get(id).y ?? 0) !== nextY) positions.set(id, nextY);
      }
    }
    return positions;
  }

  function avoidOverlapDownTree({ cards = [], links = [], editedId = null, heightOf = null, widthOf = null, minGap = 16 } = {}) {
    // 编辑增高后的局部避让：只把与被编辑卡横向相交且纵向被压住的下方卡片向下推开，
    // 再让被推卡的后代子树随迁（保持父子相对结构）；不做全局重排、不产生回拉（只输出 dy > 0）。
    const num = Number;
    const hOf = (c) => { const v = heightOf ? Number(heightOf(c.id)) : NaN; return Number.isFinite(v) && v >= 40 ? v : 140; };
    const wOf = (c) => { const v = widthOf ? Number(widthOf(c.id)) : NaN; return Number.isFinite(v) && v >= 60 ? v : 250; };
    const rect = (c) => ({ x: num(c.tx ?? c.x ?? 0) || 0, y: num(c.ty ?? c.y ?? 0) || 0, w: wOf(c), h: hOf(c) });
    const valid = cards.filter((c) => c && c.id != null);
    const ids = new Set(valid.map((c) => num(c.id)));
    const parentOf = new Map();
    const childrenOf = new Map();
    for (const link of links) {
      const f = num(link?.f), t = num(link?.t);
      if (!ids.has(f) || !ids.has(t) || f === t || parentOf.has(t)) continue;
      parentOf.set(t, f);
      if (!childrenOf.has(f)) childrenOf.set(f, []);
      childrenOf.get(f).push(t);
    }
    const edited = valid.find((c) => num(c.id) === num(editedId));
    const dy = new Map();
    if (!edited) return dy;
    const E = rect(edited);
    const affected = valid
      .filter((c) => c !== edited)
      .map((c) => ({ c, r: rect(c) }))
      .filter(({ r }) => r.x < E.x + E.w && r.x + r.w > E.x && r.y >= E.y) // 横向相交且在编辑卡下方/平齐
      .sort((a, b) => a.r.y - b.r.y);
    const settled = [{ x: E.x, y: E.y, w: E.w, h: E.h }];
    for (const { c, r } of affected) {
      const id = num(c.id);
      const cur = r.y + (dy.get(id) || 0);
      let need = 0;
      for (const p of settled) {
        if (r.x < p.x + p.w && r.x + r.w > p.x) {
          need = Math.max(need, p.y + p.h + minGap - cur);
        }
      }
      if (need > 0) dy.set(id, (dy.get(id) || 0) + need);
      settled.push({ x: r.x, y: r.y + (dy.get(id) || 0), w: r.w, h: r.h });
    }
    // 子树随迁：父被推开后，后代至少平移同样的距离（自身若被推更多则取较大值）
    let changed = true;
    while (changed) {
      changed = false;
      childrenOf.forEach((list, f) => list.forEach((t) => {
        const fd = dy.get(f) || 0;
        if (fd > 0 && fd > (dy.get(t) || 0)) { dy.set(t, fd); changed = true; }
      }));
    }
    dy.delete(num(editedId));
    for (const [k, v] of [...dy]) if (!(v > 0)) dy.delete(k);
    return dy;
  }

  function mergeWorkspace(browser = {}, folder = {}) {
    const ideas = mergeIdeas(browser.ideas, folder.ideas);
    const hasSubtasksInput = Array.isArray(browser.subtasks) || Array.isArray(folder.subtasks);
    const subtasks = mergeSubtasks(browser.subtasks, folder.subtasks);
    const out = {
      ideas: ideas.items,
      mats: mergeMaterials(browser.mats, folder.mats),
      boards: reconcileBoards(
        [...(folder.boards || []), ...(browser.boards || [])],
        ideas.items,
        subtasks
      ),
      links: mergeLinks(browser.links, folder.links),
      groups: mergeGroups(folder.groups, browser.groups),
      stats: ideas.stats,
      warnings: [...(browser.warnings || []), ...(folder.warnings || [])]
    };
    if (hasSubtasksInput || subtasks.length) {
      out.subtasks = subtasks;
    }
    return out;
  }

  function workspaceContent(snapshot = {}) {
    const transient = new Set(['file', 'time', 'temporary', 'recovered']);
    const clean = (value) => {
      if (Array.isArray(value)) return value.map(clean);
      if (!value || typeof value !== 'object') return value;
      const out = {};
      for (const key of Object.keys(value).sort()) {
        if (key.startsWith('_') || transient.has(key) || value[key] === undefined) continue;
        out[key] = clean(value[key]);
      }
      return out;
    };
    const unordered = (items) => (items || [])
      .map(clean)
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
    return {
      ideas: unordered((snapshot.ideas || []).filter(shouldPersistIdea)),
      mats: unordered(snapshot.mats),
      boards: unordered(snapshot.boards),
      links: unordered(snapshot.links),
      subtasks: unordered(snapshot.subtasks),
      groups: clean(snapshot.groups || [])
    };
  }

  function workspaceContentEqual(left = {}, right = {}) {
    return JSON.stringify(workspaceContent(left)) === JSON.stringify(workspaceContent(right));
  }

  async function commitWorkspace(snapshot, { writeFolder, writeCache }) {
    try {
      if (snapshot.warnings?.length) {
        throw new Error(`文件夹未完整读取，已停止写回：${snapshot.warnings.join('；')}`);
      }
      await writeFolder(snapshot);
      await writeCache(snapshot);
      return { ok: true, snapshot };
    } catch (error) {
      await writeCache(snapshot);
      return { ok: false, snapshot, error };
    }
  }

  function shouldPersistIdea(idea) {
    return Boolean(idea && idea.temporary !== true);
  }

  return {
    parseMarkdown, normalizeText, recordTimestamp, touchRecord, cardPositionFromClient, topicLinkGeometry,
    mergeIdeas, mergeMaterials, mergeSubtasks, mergeWorkspace, workspaceContentEqual, commitWorkspace,
    stableBoardId, parseBoardMarkdown, reconcileBoards, serializeBoardMarkdown,
    shouldPersistIdea, KANBAN_STATUSES, kanbanStatusOf, sortIdeasForKanban,
    groupIdeasByKanban, shouldCarryIdea, isDueActive, mergeLinks, appendLink,
    layoutTopicTree, reflowLinkedTopicTrees, avoidOverlapDownTree, isDailyFileName, parseDailyMarkdown, serializeDailyMarkdown, planLegacyMigration,
    calendarMonthGrid, DEV_AREA_NAMES, BOARD_KINDS, NEW_BOARD_KINDS, boardKindOf, devBoardAreas, rectAtPoint,
    placeCardInDevArea, isDevTaskCard, partitionDevAreaTasks, createUnifiedDevTask, assignCardToBoard,
    convertMasterAndSubtasksToUnifiedCards,
    uniqueIds, computeMasterProgress, syncMasterCardsWithSubtasks,
    availableSubtasksForMaster, linkSubtasksToMaster, unlinkSubtaskFromMaster,
    deleteSubtaskFromProject, changeMasterCardScope, changeSubtaskScope,
    sortBoards, reorderBoards, toggleCardSelection, moveSelectedCards,
    deleteSelectedCards, activeMaterialGroup, createDraftMaterialCard,
    finalizeDraftMaterialCard, applyMaterialInlineEdit, isMaterialVisibleInView, mergeGroups,
    RICH_COLORS, RICH_SIZES, isAllowedRichTag, allowedRichSpanStyle, stripRichText
  };
});
