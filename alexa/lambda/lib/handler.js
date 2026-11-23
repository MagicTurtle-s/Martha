'use strict';
// Alexa request handling for Martha Meals. Everything outside (Claude, the notes table, the clock,
// ids) comes in through deps, so the tests can run without AWS or Anthropic.
const Alexa = require('ask-sdk-core');
const { interpretNote } = require('./interpret');
const { getContext, putNote } = require('./store');

const ASK = "What's the note for Martha?";
const HELP = "Tell me how a meal went, what you're out of, or what you'd like more of. For example: we're out of ground cumin.";

const escape = (s) => String(s).replace(/&/g, 'and').replace(/[<>]/g, ' ');

// Words Alexa can leave at the front of the note ("use Martha Meals to say ...", "tell Martha Meals skill ...").
function cleanWords(raw) {
  return String(raw || '')
    .trim()
    .replace(/^(?:(?:skill|tell it|tell her|say|note that|to note that|that)\s+)+/i, '')
    .trim();
}

function fallbackUnderstood() {
  return { kind: 'other', readback: null, item: null, meal: null, person: null, sentiment: null, unclear: true, question: null, answer: null };
}

function buildSkill(deps) {
  const { getClient, ddb, table, now = () => new Date(), newId, skillId } = deps;

  async function takeNote(h, words, pending) {
    const context = await getContext(ddb, table);
    const client = await getClient().catch(() => null);
    const interpreted = await interpretNote(client, {
      words: pending ? pending.words : words,
      context,
      question: pending && pending.question,
      answer: pending ? words : null,
    });
    const note = pending
      ? { id: pending.id, said_at: pending.said_at, words: pending.words }
      : { id: newId(), said_at: now().toISOString(), words };
    note.understood = interpreted
      ? { ...interpreted, unclear: pending ? false : interpreted.unclear, question: pending ? pending.question : interpreted.question, answer: pending ? words : null }
      : { ...fallbackUnderstood(), ...(pending ? { question: pending.question, answer: words } : {}) };
    note.interpreter = interpreted ? 'claude-haiku-5-5' : 'fallback';

    try {
      await putNote(ddb, table, note);
    } catch (err) {
      console.log(JSON.stringify({ save_error: err && err.name }));
      return h.responseBuilder.speak("Sorry, I couldn't save that note. Please try again later.").withShouldEndSession(true).getResponse();
    }

    const attrs = h.attributesManager.getSessionAttributes();
    delete attrs.pending;
    if (!interpreted) {
      const said = pending ? `${pending.words}. And: ${words}` : words;
      return h.responseBuilder.speak(escape(`Got it, I'll pass on: ${said}.`)).withShouldEndSession(true).getResponse();
    }
    if (!pending && interpreted.unclear && interpreted.question) {
      attrs.pending = { id: note.id, said_at: note.said_at, words: note.words, question: interpreted.question };
      h.attributesManager.setSessionAttributes(attrs);
      const q = escape(interpreted.question);
      return h.responseBuilder.speak(q).reprompt(q).getResponse();
    }
    h.attributesManager.setSessionAttributes(attrs);
    return h.responseBuilder.speak(escape(interpreted.readback)).withShouldEndSession(true).getResponse();
  }

  const Launch = {
    canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === 'LaunchRequest',
    handle: (h) => h.responseBuilder.speak(ASK).reprompt(ASK).getResponse(),
  };

  const Note = {
    canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(h.requestEnvelope) === 'NoteIntent',
    async handle(h) {
      const words = cleanWords(Alexa.getSlotValue(h.requestEnvelope, 'note'));
      if (!words) return h.responseBuilder.speak(`I didn't catch the note. ${ASK}`).reprompt(ASK).getResponse();
      const pending = h.attributesManager.getSessionAttributes().pending || null;
      return takeNote(h, words, pending);
    },
  };

  const Help = {
    canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
      && Alexa.getIntentName(h.requestEnvelope) === 'AMAZON.HelpIntent',
    handle: (h) => h.responseBuilder.speak(HELP).reprompt(ASK).getResponse(),
  };

  const Stop = {
    canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest'
      && ['AMAZON.CancelIntent', 'AMAZON.StopIntent', 'AMAZON.NavigateHomeIntent'].includes(Alexa.getIntentName(h.requestEnvelope)),
    handle: (h) => h.responseBuilder.speak('Okay.').withShouldEndSession(true).getResponse(),
  };

  const Ended = {
    canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === 'SessionEndedRequest',
    handle: (h) => h.responseBuilder.getResponse(),
  };

  const OtherIntent = {
    canHandle: (h) => Alexa.getRequestType(h.requestEnvelope) === 'IntentRequest',
    handle: (h) => h.responseBuilder.speak(`Sorry, I only take notes. ${ASK}`).reprompt(ASK).getResponse(),
  };

  const Errors = {
    canHandle: () => true,
    handle(h, err) {
      console.log(JSON.stringify({ error: err && err.name }));
      return h.responseBuilder.speak('Sorry, something went wrong. Please try again.').withShouldEndSession(true).getResponse();
    },
  };

  const builder = Alexa.SkillBuilders.custom()
    .addRequestHandlers(Launch, Note, Help, Stop, Ended, OtherIntent)
    .addErrorHandlers(Errors);
  if (skillId) builder.withSkillId(skillId);
  return builder;
}

const createHandler = (deps) => buildSkill(deps).lambda();
const createSkill = (deps) => buildSkill(deps).create();

module.exports = { createHandler, createSkill, cleanWords };
