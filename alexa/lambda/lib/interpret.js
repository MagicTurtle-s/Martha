'use strict';
// Turns one spoken note into a filing and a short spoken read-back, with Claude Haiku.
// Any failure (timeout, refusal, unparsable answer, no key) returns null; the caller then saves
// the note as said and answers "Got it, I'll pass on: ...".
const { z } = require('zod');
const { zodOutputFormat } = require('@anthropic-ai/sdk/helpers/zod');

const MODEL = process.env.MODEL || 'claude-haiku-5-5';
const TIMEOUT_MS = 4000; // Alexa allows about 8 seconds for the whole answer.

const NoteSchema = z.object({
  kind: z.enum(['meal_feedback', 'out_of', 'preference', 'other']),
  readback: z.string(),
  item: z.string().nullable(),
  meal: z.string().nullable(),
  person: z.string().nullable(),
  sentiment: z.enum(['loved', 'liked', 'ok', 'disliked', 'banned']).nullable(),
  unclear: z.boolean(),
  question: z.string().nullable(),
});

const SYSTEM = [
  "You file one short spoken note for a household's meal planner, Martha. Alexa transcribed it, so it",
  "may be loosely worded or start with a stray word such as \"say\", \"skill\" or \"tell it\".",
  '',
  'kind:',
  '- meal_feedback: how a meal or dish went ("Sam loved the chili", "the salad was a miss").',
  '- out_of: something to buy: the house is out of or low on it, or "add X". item = the thing to buy.',
  '- preference: a standing wish or rule ("more sheet-pan dinners", "never buy olives again").',
  '- other: anything else.',
  '',
  "Use this week's meals and the household's first names, when given, to name things exactly.",
  'Never invent a meal or a person. meal = the meal named or meant, person = who the note is about.',
  'sentiment, for meal_feedback only: loved (loved, a hit, best yet), liked (good, liked), ok (fine,',
  "nothing special), disliked (didn't like, a miss, too salty or too spicy), banned (never again).",
  '',
  "unclear = true only when you can't tell what to file without guessing (which meal \"the thing from",
  'Tuesday" was, or garbled words); then question = one short question that settles it.',
  '',
  'readback: one short sentence Alexa will speak, under 15 words, saying how the note will be filed.',
  'Examples: "Got it: ground cumin goes on next week\'s list." "Noted: Sam liked the white chicken',
  'chili." "Noted: more sheet-pan dinners." No markdown, no emoji.',
].join('\n');

function userText({ words, context, question, answer }) {
  const lines = [];
  if (context && context.meals && context.meals.length) lines.push(`This week's meals: ${context.meals.join('; ')}`);
  if (context && context.people && context.people.length) lines.push(`Household: ${context.people.join(', ')}`);
  lines.push(`Note: "${words}"`);
  if (question && answer) lines.push(`Martha asked: "${question}" The answer: "${answer}"`);
  return lines.join('\n');
}

async function interpretNote(client, input) {
  if (!client) return null;
  try {
    const response = await client.messages.parse(
      {
        model: MODEL,
        max_tokens: 400,
        thinking: { type: 'disabled' },
        output_config: { effort: 'low', format: zodOutputFormat(NoteSchema) },
        system: SYSTEM,
        messages: [{ role: 'user', content: userText(input) }],
      },
      { timeout: TIMEOUT_MS, maxRetries: 0 },
    );
    if (response.stop_reason === 'refusal' || !response.parsed_output) return null;
    return response.parsed_output;
  } catch (err) {
    console.log(JSON.stringify({ interpret_error: err && (err.status || err.name || 'error') }));
    return null;
  }
}

module.exports = { interpretNote, userText, NoteSchema, SYSTEM, MODEL };
