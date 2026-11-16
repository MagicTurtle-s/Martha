'use strict';
// Offline tests for the Martha Meal skill: fake Claude, fake notes table, fixed clock and ids.
// Run: node --test alexa/lambda
const test = require('node:test');
const assert = require('node:assert/strict');
const { createSkill, cleanWords } = require('../lib/handler');

const NOW = new Date('2026-11-16T23:30:00.000Z');

function envelope(type, { intent, note, attributes } = {}) {
  const req = { type, requestId: 'r1', timestamp: NOW.toISOString(), locale: 'en-US' };
  if (type === 'IntentRequest') {
    req.intent = { name: intent, confirmationStatus: 'NONE', slots: note === undefined ? {} : { note: { name: 'note', value: note, confirmationStatus: 'NONE' } } };
  }
  return {
    version: '1.0',
    session: { new: !attributes, sessionId: 's1', application: { applicationId: 'amzn1.ask.skill.test' }, attributes: attributes || {}, user: { userId: 'u1' } },
    context: { System: { application: { applicationId: 'amzn1.ask.skill.test' }, user: { userId: 'u1' }, device: { deviceId: 'd1', supportedInterfaces: {} }, apiEndpoint: 'https://api.amazonalexa.com' } },
    request: req,
  };
}

// A fake DynamoDB client: records every command; GetItem answers with `context`; PutItem can fail.
function fakeTable({ context = null, failPut = false } = {}) {
  const sent = [];
  return {
    sent,
    puts: () => sent.filter((c) => c.constructor.name === 'PutItemCommand').map((c) => c.input.Item),
    async send(cmd) {
      sent.push(cmd);
      if (cmd.constructor.name === 'GetItemCommand') {
        if (!context) return {};
        return { Item: { pk: { S: 'context' }, sk: { S: 'current' }, week_of: { S: context.week_of }, meals: { L: context.meals.map((S) => ({ S })) }, people: { L: context.people.map((S) => ({ S })) } } };
      }
      if (cmd.constructor.name === 'PutItemCommand' && failPut) {
        const e = new Error('nope'); e.name = 'ProvisionedThroughputExceededException'; throw e;
      }
      return {};
    },
  };
}

// A fake Anthropic client whose messages.parse returns `reply` (or throws / refuses).
function fakeClaude(reply, { refuse = false, throws = false } = {}) {
  const calls = [];
  return {
    calls,
    messages: {
      async parse(body, opts) {
        calls.push({ body, opts });
        if (throws) { const e = new Error('timeout'); e.name = 'APIConnectionTimeoutError'; throw e; }
        if (refuse) return { stop_reason: 'refusal', parsed_output: null };
        return { stop_reason: 'end_turn', parsed_output: reply };
      },
    },
  };
}

const understood = (over = {}) => ({ kind: 'out_of', readback: "Got it: ground cumin goes on next week's list.", item: 'ground cumin', meal: null, person: null, sentiment: null, unclear: false, question: null, ...over });

function skill({ claude, table, noKey = false }) {
  let n = 0;
  return createSkill({
    getClient: async () => { if (noKey) throw new Error('no key'); return claude; },
    ddb: table,
    table: 'martha-voice',
    now: () => NOW,
    newId: () => `id-${++n}`,
  });
}

const speech = (res) => res.response.outputSpeech && res.response.outputSpeech.ssml.replace(/<\/?speak>/g, '');

test('launch asks for the note and keeps listening', async () => {
  const res = await skill({ claude: fakeClaude(understood()), table: fakeTable() }).invoke(envelope('LaunchRequest'));
  assert.match(speech(res), /What's the note for Martha\?/);
  assert.equal(res.response.shouldEndSession, false);
});

test('a clear note is saved with what Claude understood, and the read-back is spoken', async () => {
  const table = fakeTable();
  const claude = fakeClaude(understood());
  const res = await skill({ claude, table }).invoke(envelope('IntentRequest', { intent: 'NoteIntent', note: "we're out of ground cumin" }));
  assert.equal(speech(res), "Got it: ground cumin goes on next week's list.");
  assert.equal(res.response.shouldEndSession, true);
  const [item] = table.puts();
  assert.equal(item.pk.S, 'note');
  assert.equal(item.sk.S, `${NOW.toISOString()}#id-1`);
  assert.equal(item.words.S, "we're out of ground cumin");
  assert.equal(item.interpreter.S, 'claude-haiku-5-5');
  const u = JSON.parse(item.understood.S);
  assert.equal(u.kind, 'out_of');
  assert.equal(u.item, 'ground cumin');
  assert.equal(u.answer, null);
});

test('the Claude call uses Haiku, thinking off, low effort and a short timeout without retries', async () => {
  const claude = fakeClaude(understood());
  await skill({ claude, table: fakeTable() }).invoke(envelope('IntentRequest', { intent: 'NoteIntent', note: 'add paper towels' }));
  const { body, opts } = claude.calls[0];
  assert.equal(body.model, 'claude-haiku-5-5');
  assert.deepEqual(body.thinking, { type: 'disabled' });
  assert.equal(body.output_config.effort, 'low');
  assert.ok(body.output_config.format, 'structured output format set');
  assert.equal(opts.maxRetries, 0);
  assert.ok(opts.timeout <= 5000);
});

test("this week's meals and first names reach Claude when the context record exists", async () => {
  const claude = fakeClaude(understood({ kind: 'meal_feedback', meal: 'White Chicken Chili', person: 'Sam', sentiment: 'loved', item: null, readback: 'Noted: Sam loved the white chicken chili.' }));
  const table = fakeTable({ context: { week_of: '2026-11-16', meals: ['White Chicken Chili', 'Sheet-Pan Gnocchi'], people: ['Sam', 'Alex'] } });
  await skill({ claude, table }).invoke(envelope('IntentRequest', { intent: 'NoteIntent', note: 'sam loved the chili' }));
  const text = claude.calls[0].body.messages[0].content;
  assert.match(text, /White Chicken Chili; Sheet-Pan Gnocchi/);
  assert.match(text, /Household: Sam, Alex/);
  assert.match(text, /Note: "sam loved the chili"/);
});

test('stray words Alexa leaves at the front are dropped', () => {
  assert.equal(cleanWords("say we're out of olive oil"), "we're out of olive oil");
  assert.equal(cleanWords('skill we want more sheet pan dinners'), 'we want more sheet pan dinners');
  assert.equal(cleanWords("tell it we're out of ground cumin"), "we're out of ground cumin");
  assert.equal(cleanWords('the salad was a miss'), 'the salad was a miss');
});

for (const [name, claudeOpts, noKey] of [
  ['Claude times out', { throws: true }, false],
  ['Claude refuses', { refuse: true }, false],
  ['the Anthropic key is missing', {}, true],
]) {
  test(`when ${name}, the note is still saved as said and Alexa passes it on`, async () => {
    const table = fakeTable();
    const res = await skill({ claude: fakeClaude(understood(), claudeOpts), table, noKey }).invoke(envelope('IntentRequest', { intent: 'NoteIntent', note: 'the salad was a miss' }));
    assert.equal(speech(res), "Got it, I'll pass on: the salad was a miss.");
    const [item] = table.puts();
    assert.equal(item.interpreter.S, 'fallback');
    const u = JSON.parse(item.understood.S);
    assert.equal(u.unclear, true);
    assert.equal(u.kind, 'other');
  });
}

test('an unclear note asks one question, then saves the answer onto the same note', async () => {
  const table = fakeTable();
  const first = fakeClaude(understood({ kind: 'meal_feedback', item: null, readback: 'Noted.', unclear: true, question: 'Which dinner was that, the tacos or the soup?' }));
  const res1 = await skill({ claude: first, table }).invoke(envelope('IntentRequest', { intent: 'NoteIntent', note: 'the thing from tuesday was too salty' }));
  assert.equal(speech(res1), 'Which dinner was that, the tacos or the soup?');
  assert.equal(res1.response.shouldEndSession, false);
  const pending = res1.sessionAttributes.pending;
  assert.equal(pending.id, 'id-1');
  assert.equal(JSON.parse(table.puts()[0].understood.S).unclear, true);

  const second = fakeClaude(understood({ kind: 'meal_feedback', item: null, meal: 'Black Bean Soup', sentiment: 'disliked', readback: 'Noted: the black bean soup was too salty.' }));
  const res2 = await skill({ claude: second, table }).invoke(envelope('IntentRequest', { intent: 'NoteIntent', note: 'the soup', attributes: res1.sessionAttributes }));
  assert.equal(speech(res2), 'Noted: the black bean soup was too salty.');
  assert.equal(res2.response.shouldEndSession, true);
  assert.match(second.calls[0].body.messages[0].content, /The answer: "the soup"/);
  const saved = table.puts()[1];
  assert.equal(saved.sk.S, table.puts()[0].sk.S, 'same note, overwritten');
  const u = JSON.parse(saved.understood.S);
  assert.equal(u.unclear, false);
  assert.equal(u.answer, 'the soup');
  assert.equal(u.question, 'Which dinner was that, the tacos or the soup?');
  assert.equal(saved.words.S, 'the thing from tuesday was too salty');
});

test('a save that fails says so instead of pretending', async () => {
  const res = await skill({ claude: fakeClaude(understood()), table: fakeTable({ failPut: true }) }).invoke(envelope('IntentRequest', { intent: 'NoteIntent', note: 'add bananas' }));
  assert.match(speech(res), /couldn't save that note/);
});

test('an empty note asks again', async () => {
  const table = fakeTable();
  const res = await skill({ claude: fakeClaude(understood()), table }).invoke(envelope('IntentRequest', { intent: 'NoteIntent', note: '' }));
  assert.match(speech(res), /didn't catch the note/);
  assert.equal(table.puts().length, 0);
});

test('an ampersand in the read-back is spoken, not sent as broken speech markup', async () => {
  const res = await skill({ claude: fakeClaude(understood({ readback: 'Got it: mac & cheese goes on the list.' })), table: fakeTable() }).invoke(envelope('IntentRequest', { intent: 'NoteIntent', note: 'add mac and cheese' }));
  assert.equal(speech(res), 'Got it: mac and cheese goes on the list.');
});
