'use strict';
// Lambda entry point for the Martha Meals skill (Node.js 22).
// Environment (set by alexa/infra/martha-voice.yaml): TABLE_NAME, SKILL_ID, KEY_PARAMETER (the SSM
// SecureString holding the Anthropic API key), MODEL (optional).
const { randomUUID } = require('node:crypto');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { SSMClient, GetParameterCommand } = require('@aws-sdk/client-ssm');
const Anthropic = require('@anthropic-ai/sdk');
const { createHandler } = require('./lib/handler');

const ddb = new DynamoDBClient({});
const ssm = new SSMClient({});
let client = null; // reused across warm invocations

async function getClient() {
  if (client) return client;
  const out = await ssm.send(new GetParameterCommand({ Name: process.env.KEY_PARAMETER, WithDecryption: true }));
  client = new Anthropic({ apiKey: out.Parameter.Value });
  return client;
}

exports.handler = createHandler({
  getClient,
  ddb,
  table: process.env.TABLE_NAME,
  newId: randomUUID,
  skillId: process.env.SKILL_ID,
});
