// script.js: chat UI. Talks to the Worker (real AI) when configured,
// and falls back to the built-in scripted tutor (tutor.js) when it isn't.
import { WORKER_URL } from './config.js';
import { createSession, respond } from './tutor.js';

const TIMEOUT_MS = 15000;
const RETRY_AI_MS = 60000; // after an outage, try the AI again on the first message after this long
const MAX_CHARS = 1000;
const HISTORY_SENT = 20; // the Worker's gate reads up to 20 messages; the tutor reads the last 10
const GREETING =
  "Hi, I'm the Think-First Robot. Ask me a science or math question. Before I help, I'll ask you to explain how you'd approach it.";
const STATUS_AI = 'Powered by an AI model (Claude)';
const STATUS_PRACTICE = 'Practice mode: built-in problems';

const log = document.getElementById('chat-log');
const form = document.getElementById('chat-form');
const input = document.getElementById('chat-input');
const sendBtn = document.getElementById('send-btn');
const statusLine = document.getElementById('status-line');
const guideButtons = document.querySelectorAll('[data-guide]');

const forcePractice = new URLSearchParams(location.search).has('practice');

const state = {
  history: [], // [{ role: 'user' | 'assistant', content }] sent to the Worker
  userMessages: [], // every user message, used to rebuild the scripted tutor's state
  tutor: createSession(),
  mode: WORKER_URL && !forcePractice ? 'ai' : 'practice',
  retryAiAt: null, // set when the AI was unreachable; null means don't retry
  busy: false,
};

function setStatus() {
  const ai = state.mode === 'ai';
  statusLine.textContent = ai ? STATUS_AI : STATUS_PRACTICE;
  statusLine.classList.toggle('is-ai', ai);
}

function scrollToEnd() {
  log.scrollTop = log.scrollHeight;
}

function addMessage(role, text, suggestions = []) {
  const el = document.createElement('div');
  el.className = `msg ${role === 'user' ? 'msg-user' : 'msg-bot'}`;
  const who = document.createElement('span');
  who.className = 'sr-only';
  who.textContent = role === 'user' ? 'You said: ' : 'Robot said: ';
  el.append(who, document.createTextNode(text));
  if (suggestions.length) {
    const row = document.createElement('div');
    row.className = 'suggestions';
    for (const s of suggestions) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'suggestion';
      b.textContent = s;
      b.addEventListener('click', () => send(s));
      row.append(b);
    }
    el.append(row);
  }
  log.append(el);
  scrollToEnd();
  return el;
}

function addNote(text) {
  const el = document.createElement('div');
  el.className = 'msg msg-error';
  el.textContent = text;
  log.append(el);
  scrollToEnd();
}

function showTyping() {
  const el = document.createElement('div');
  el.className = 'msg msg-bot';
  // aria-label is ignored on a plain div, so screen readers get visually hidden text instead.
  el.innerHTML = '<span class="sr-only">Robot is typing…</span><span class="typing" aria-hidden="true"><span></span><span></span><span></span></span>';
  log.append(el);
  scrollToEnd();
  return el;
}

function setBusy(busy) {
  state.busy = busy;
  sendBtn.disabled = busy;
  guideButtons.forEach((b) => { b.disabled = busy; });
}

const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function askWorker() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: state.history.slice(-HISTORY_SENT) }),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data || typeof data.reply !== 'string') {
      const err = new Error((data && data.error) || `HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }
    return data.reply;
  } finally {
    clearTimeout(timer);
  }
}

function askPractice(text) {
  const out = respond(state.tutor, text);
  state.tutor = out.session;
  return out;
}

/** Rebuild the scripted tutor from the whole conversation so it can pick up mid-problem. */
function switchToPractice() {
  state.mode = 'practice';
  state.retryAiAt = Date.now() + RETRY_AI_MS;
  setStatus();
  let session = createSession();
  for (const m of state.userMessages.slice(0, -1)) session = respond(session, m).session;
  state.tutor = session;
  addNote('The AI model is unreachable right now, so I switched to practice mode. I will try the AI again in a minute.');
}

/** After an outage, the first message sent once the retry time has passed tries the AI again. */
function shouldRetryAi() {
  return state.mode === 'practice' && state.retryAiAt !== null && Date.now() >= state.retryAiAt;
}

async function send(raw) {
  const text = String(raw || '').trim().slice(0, MAX_CHARS);
  if (!text || state.busy) return;
  setBusy(true);
  input.value = '';
  addMessage('user', text);
  state.userMessages.push(text);
  state.history.push({ role: 'user', content: text });
  const typing = showTyping();

  let reply;
  let suggestions = [];
  if (shouldRetryAi()) {
    try {
      reply = await askWorker();
      state.mode = 'ai';
      state.retryAiAt = null;
      setStatus();
      addNote('The AI model is back, so I switched out of practice mode.');
    } catch {
      // Still down: stay in practice mode (its state is already current) and try again later.
      state.retryAiAt = Date.now() + RETRY_AI_MS;
    }
  } else if (state.mode === 'ai') {
    try {
      reply = await askWorker();
    } catch (err) {
      // A 400 (e.g. message too long) or 429 (rate limit) is a real answer, not an outage.
      if (err.status === 400 || err.status === 429) {
        reply = err.status === 429
          ? "You're sending messages quickly. Take a breath and try again in a minute."
          : "I couldn't read that message. Try a shorter one (up to 1,000 characters).";
        // Forget the rejected message everywhere, so practice mode never replays it later.
        state.history.pop();
        state.userMessages.pop();
      } else {
        switchToPractice();
      }
    }
  }
  if (reply === undefined) {
    const out = askPractice(text);
    reply = out.reply;
    suggestions = out.suggestions;
    await pause(matchMedia('(prefers-reduced-motion: reduce)').matches ? 150 : 550);
  }

  typing.remove();
  addMessage('bot', reply, suggestions);
  if (state.history[state.history.length - 1]?.role === 'user') {
    state.history.push({ role: 'assistant', content: reply });
  }
  state.history = state.history.slice(-20);
  setBusy(false);
  if (document.activeElement === document.body || document.activeElement?.classList.contains('suggestion')) {
    input.focus({ preventScroll: true });
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  send(input.value);
});

guideButtons.forEach((b) => b.addEventListener('click', () => send(b.dataset.guide)));

setStatus();
addMessage('bot', GREETING);
