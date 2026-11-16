'use strict';
// The notes table, as Martha's side reads it (scripts/martha_voice.py):
//   note items:   pk "note",    sk "<said_at>#<id>", id, said_at, words, understood (JSON text), interpreter
//   context item: pk "context", sk "current",        week_of, meals (list), people (list), updated_at
// This role may only PutItem notes and GetItem the context item.
const { GetItemCommand, PutItemCommand } = require('@aws-sdk/client-dynamodb');

const list = (attr) => (attr && Array.isArray(attr.L) ? attr.L.map((v) => v.S).filter(Boolean) : []);

async function getContext(ddb, table) {
  try {
    const out = await ddb.send(new GetItemCommand({
      TableName: table,
      Key: { pk: { S: 'context' }, sk: { S: 'current' } },
    }));
    if (!out.Item) return null;
    return { week_of: out.Item.week_of && out.Item.week_of.S, meals: list(out.Item.meals), people: list(out.Item.people) };
  } catch (err) {
    // No context only makes the read-back less specific; it never stops a note.
    console.log(JSON.stringify({ context_error: err && err.name }));
    return null;
  }
}

async function putNote(ddb, table, note) {
  await ddb.send(new PutItemCommand({
    TableName: table,
    Item: {
      pk: { S: 'note' },
      sk: { S: `${note.said_at}#${note.id}` },
      id: { S: note.id },
      said_at: { S: note.said_at },
      words: { S: note.words },
      understood: { S: JSON.stringify(note.understood) },
      interpreter: { S: note.interpreter },
    },
  }));
}

module.exports = { getContext, putNote };
