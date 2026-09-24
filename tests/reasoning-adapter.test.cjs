'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function extractFunction(name) {
  const marker = 'function ' + name + '(';
  const start = html.indexOf(marker);
  assert.notEqual(start, -1, name + ' missing');
  const brace = html.indexOf('{', start);
  let depth = 0, quote = '', escaped = false;
  for (let i = brace; i < html.length; i++) {
    const ch = html[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') { quote = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error('unterminated ' + name);
}

const names = [
  'normalizeReasoningEffortLevel','resolveReasoningEffortForRequest',
  'applyReasoningEffortToPayload','normalizeThinkingType',
  'resolveThinkingTypeForRequest','applyThinkingToPayload',
  'normalizeCompletionSource','detectCompletionSource','resolveCompletionSource',
  'applyCompletionSourceReasoning','reasoningDetailsToText','extractCotDelta'
];
const source = names.map(extractFunction).join('\n') +
  '\nreturn { normalizeCompletionSource, detectCompletionSource, resolveCompletionSource,' +
  ' applyCompletionSourceReasoning, reasoningDetailsToText, extractCotDelta };';
const api = new Function(source)();

test('auto completion source recognizes known OpenAI-compatible providers', () => {
  assert.equal(api.detectCompletionSource('https://openrouter.ai/api/v1/chat/completions','x'), 'openrouter');
  assert.equal(api.detectCompletionSource('https://api.deepseek.com/chat/completions','deepseek-chat'), 'deepseek');
  assert.equal(api.detectCompletionSource('https://api.openai.com/v1/chat/completions','gpt-5'), 'openai');
  assert.equal(api.detectCompletionSource('https://example.test/v1/chat/completions','custom'), 'generic');
});

test('explicit source always wins over endpoint auto detection', () => {
  assert.equal(api.resolveCompletionSource({
    completionSource:'deepseek', apiEndpoint:'https://openrouter.ai/api/v1/chat/completions'
  }, {}), 'deepseek');
});

test('OpenRouter uses reasoning map and never leaks DeepSeek thinking object', () => {
  const payload = {};
  const source = api.applyCompletionSourceReasoning(payload, {
    completionSource:'openrouter', reasoningEffortEnabled:true, reasoningEffort:'high',
    thinkingEnabled:true, thinkingType:'enabled'
  }, {}, true);
  assert.equal(source, 'openrouter');
  assert.deepEqual(payload.reasoning, { effort:'high' });
  assert.equal(payload.include_reasoning, true);
  assert.equal('thinking' in payload, false);
  assert.equal('reasoning_effort' in payload, false);
});

test('DeepSeek keeps reasoning_effort and thinking shape', () => {
  const payload = {};
  api.applyCompletionSourceReasoning(payload, {
    completionSource:'deepseek', reasoningEffortEnabled:true, reasoningEffort:'high',
    thinkingEnabled:true, thinkingType:'enabled'
  }, {}, true);
  assert.equal(payload.reasoning_effort, 'high');
  assert.deepEqual(payload.thinking, { type:'enabled' });
  assert.equal('reasoning' in payload, false);
  assert.equal('include_reasoning' in payload, false);
});

test('OpenAI source does not send Anthropic/DeepSeek thinking object', () => {
  const payload = {};
  api.applyCompletionSourceReasoning(payload, {
    completionSource:'openai', reasoningEffortEnabled:true, reasoningEffort:'medium',
    thinkingEnabled:true, thinkingType:'enabled'
  }, {}, true);
  assert.equal(payload.reasoning_effort, 'medium');
  assert.equal('thinking' in payload, false);
  assert.equal('reasoning' in payload, false);
});

test('reasoning_details can be displayed as CoT text without treating signatures as text', () => {
  const details = [
    { type:'reasoning.text', text:'first ' },
    { type:'reasoning.summary', summary:'second' },
    { type:'reasoning.encrypted', data:'opaque-signature' }
  ];
  assert.equal(api.reasoningDetailsToText(details), 'first second');
  assert.equal(api.extractCotDelta({ reasoning_details: details }), 'first second');
});

test('history reasoning remains opt-in and provider metadata survives outbound sanitizer', () => {
  assert.match(html, /includeReasoningInHistory:\s*false/);
  assert.match(html, /histSource === 'deepseek'/);
  assert.match(html, /histSource === 'openrouter'/);
  assert.match(html, /normalized\.reasoning_content = message\.reasoning_content/);
  assert.match(html, /normalized\.reasoning_details = cloneJsonData\(message\.reasoning_details\)/);
});

test('streaming OpenRouter does not falsely mark reconstructed structured reasoning complete', () => {
  assert.match(html, /structuredReasoningComplete:\s*false/);
  assert.match(html, /structuredReasoningComplete:\s*!!\(parsed\.reasoningDetails/);
});
