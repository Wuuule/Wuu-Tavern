'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8');
const start = html.indexOf('var OT_STATUS_MAX_TABLES = 50;');
const end = html.indexOf('// ==================== Translation DOM Updates', start);
assert.ok(start !== -1 && end > start, 'status runtime must remain available in index.html');
const runtimeSource = html.slice(start, end);
const build = new Function('state', 'window', 'persistState', 'CustomEvent',
  'function getActiveConv(){return state.conversations[state.activeConvId];}\n' +
  runtimeSource +
  '\nreturn { ensureStatusCenter, applyStatusCenterUpdates, buildStatusCenterRuntimeMessage, runtime: window.OpenTavernStatusCenterRuntime };');

function fixture(saveSucceeds = true) {
  const state = { activeConvId: 'A', isGenerating: false,
    conversations: { A: { id: 'A', messages: [] }, B: { id: 'B', messages: [] } } };
  const events = [];
  let saves = 0;
  const win = { dispatchEvent: event => events.push(event) };
  const methods = build(state, win, async () => { saves++; return saveSucceeds; },
    class CustomEvent { constructor(name, init) { this.type = name; this.detail = init.detail; } });
  return { ...methods, state, events, get saves() { return saves; } };
}

test('new tables start with no fabricated history; later updates capture the previous content', () => {
  const f = fixture(), conv = f.state.conversations.A;
  f.applyStatusCenterUpdates(conv, [{ name: 'Scene Anchor', content: 'Day 1' }]);
  assert.equal(f.runtime.listTableHistory('Scene Anchor').length, 0);
  f.applyStatusCenterUpdates(conv, [{ name: 'Scene Anchor', content: 'Day 2' }]);
  assert.equal(f.runtime.listTableHistory('Scene Anchor')[0].content, 'Day 1');
  assert.equal(f.runtime.listTables()[0].revision, 2);
});

test('histories remain separated for each conversation', () => {
  const f = fixture();
  f.applyStatusCenterUpdates(f.state.conversations.A, [{ name: 'Time', content: 'A day 1' }]);
  f.applyStatusCenterUpdates(f.state.conversations.A, [{ name: 'Time', content: 'A day 2' }]);
  f.state.activeConvId = 'B';
  assert.deepEqual(f.runtime.listTables(), []);
  assert.deepEqual(f.runtime.listTableHistory('Time'), []);
});

test('manual rollback preserves its source and persists a new revision', async () => {
  const f = fixture(), conv = f.state.conversations.A;
  f.applyStatusCenterUpdates(conv, [{ name: 'Time', content: 'Day 1' }]);
  f.applyStatusCenterUpdates(conv, [{ name: 'Time', content: 'Day 2' }]);
  const result = await f.runtime.restoreRevision('Time', 1);
  assert.equal(result.ok, true);
  assert.equal(f.runtime.listTables()[0].content, 'Day 1');
  assert.equal(f.runtime.listTables()[0].revision, 3);
  assert.ok(f.runtime.listTableHistory('Time').some(h =>
    h.source === 'manual-rollback' && h.content === 'Day 2'));
  assert.equal(f.saves, 1);
  assert.ok(f.events.length >= 3);
  assert.match(JSON.stringify(conv), /"history"/, 'history must be exportable with conversation');
});

test('rollback refuses to change data while generating', async () => {
  const f = fixture(), conv = f.state.conversations.A;
  f.applyStatusCenterUpdates(conv, [{ name: 'Time', content: 'Day 1' }]);
  f.applyStatusCenterUpdates(conv, [{ name: 'Time', content: 'Day 2' }]);
  f.state.isGenerating = true;
  assert.equal((await f.runtime.restoreRevision('Time', 1)).ok, false);
  assert.equal(f.runtime.listTables()[0].content, 'Day 2');
  assert.equal(f.saves, 0);
});

test('cannot change a different or missing conversation via stale revision', async () => {
  const f = fixture(), conv = f.state.conversations.A;
  f.applyStatusCenterUpdates(conv, [{ name: 'Time', content: 'Day 1' }]);
  f.applyStatusCenterUpdates(conv, [{ name: 'Time', content: 'Day 2' }]);
  f.state.activeConvId = 'B';
  assert.equal((await f.runtime.restoreRevision('Time', 1)).ok, false);
  assert.equal(conv.statusCenter.tables[0].content, 'Day 2');
});

test('history is bounded even when many updates occur', () => {
  const f = fixture(), conv = f.state.conversations.A;
  for (let i = 0; i < 30; i++)
    f.applyStatusCenterUpdates(conv, [{ name: 'Time', content: 'Day ' + i }]);
  assert.ok(f.runtime.listTableHistory('Time').length <= 8);
  assert.ok(conv.statusCenter.history.length <= 80);
});

test('persistence failure is reported rather than falsely claiming restored data is safe', async () => {
  const f = fixture(false), conv = f.state.conversations.A;
  f.applyStatusCenterUpdates(conv, [{ name: 'Time', content: 'Day 1' }]);
  f.applyStatusCenterUpdates(conv, [{ name: 'Time', content: 'Day 2' }]);
  const result = await f.runtime.restoreRevision('Time', 1);
  assert.equal(result.ok, false);
  assert.equal(result.memoryUpdated, true);
});

test('the browser helper does not falsify storage hydration state', () => {
  const boot = readFileSync(join(__dirname, '..', 'ot-boot.js'), 'utf8');
  assert.doesNotMatch(boot, /_savesArmed\s*=/);
  assert.doesNotMatch(boot, /_loadStatus\s*=/);
  assert.doesNotMatch(boot, /showUncertainStorageBanner\s*=/);
});

test('status runtime still emits previous/current status in prompt', () => {
  const f = fixture(), conv = f.state.conversations.A;
  f.applyStatusCenterUpdates(conv, [{ name: 'Scene Anchor', content: 'Day 1' }]);
  const prompt = f.buildStatusCenterRuntimeMessage(conv);
  assert.match(prompt, /<StatusTable name="Scene Anchor">/);
  assert.match(prompt, /<\/CURRENT_STATUS_CENTER>/);
});
