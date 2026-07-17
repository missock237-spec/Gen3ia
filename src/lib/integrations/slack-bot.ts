/**
 * 🤖 Slack Bot - Integration Genova
 */

import { App, ExpressReceiver } from '@slack/bolt';

const SLACK_SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET || '';
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN || '';
const SLACK_APP_TOKEN = process.env.SLACK_APP_TOKEN || '';

const receiver = new ExpressReceiver({ signingSecret: SLACK_SIGNING_SECRET, endpoints: '/api/slack/events' });
const app = new App({ token: SLACK_BOT_TOKEN, receiver, socketMode: false });

app.event('app_mention', async ({ event, say }) => {
  const text = event.text.replace(/<@[^>]+>/, '').trim();
  await say({ text: 'Genova reflechit...', thread_ts: event.ts });
  try { await say({ text: await queryGenovaAI(text, event.user), thread_ts: event.ts }); }
  catch { await say({ text: 'Erreur.', thread_ts: event.ts }); }
});

app.message(async ({ message, say }) => {
  if (message.subtype || message.bot_id || !('text' in message)) return;
  await say({ text: await queryGenovaAI(message.text!, message.user!), thread_ts: message.ts });
});

app.command('/genova', async ({ command, ack, say }) => {
  await ack();
  await say({ text: await queryGenovaAI(command.text, command.user_id) });
});

async function queryGenovaAI(text: string, userId: string): Promise<string> {
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
    const response = await fetch(apiUrl + '/api/chat/slack', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, userId, source: 'slack' }),
    });
    const data = await response.json();
    return data.response || 'Pas de reponse.';
  } catch { return 'Erreur connexion serveur.'; }
}

export async function handler(req: Request, res: { json: (data: unknown) => void; status: (code: number) => { json: (data: unknown) => void } }) {
  if (req.body?.type === 'url_verification') return res.status(200).json({ challenge: req.body.challenge });
  return res.status(200).json({ ok: true });
}

export default app;