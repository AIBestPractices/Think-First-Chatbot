# Think First

**Live site: https://salhemamalik29-hub.github.io/Think-First-Chatbot/**

Think First is a website with a science and math tutor chatbot, the **Think-First Robot**. It won't give an answer until the student explains their thinking. Then it guides them with an example or a hint, so the student reaches the answer themselves.

The project shows how AI can benefit society when it is used as a tutor that builds thinking, not as an answer machine.

Made for [CLASS / ASSIGNMENT NAME] by [YOUR NAME].

## How it works

1. **Ask a question.** The student types a science or math question.
2. **Explain your thinking.** Until the student explains how they'd approach it, the answer stays locked.
3. **Get guided.** If the reasoning is on track, the robot affirms what's right (and corrects anything that is only partly true) and gives a small example to work through. If the student is stuck, it gives one hint at a time. When the student answers correctly, it says "Correct!" and explains why.

Example:

> **Student:** Can you tell me what 1+1 is?
> **Robot:** Sorry, you have to say what you think first. I can't just give you the answer. Explain your approach first.
> **Student:** When you add two positive numbers, the sum has to be bigger than each number you started with.
> **Robot:** Yes, you're thinking in the right direction. That's true for positive numbers, and here's an example. Your friend Sally has a car. You also have a car. How many cars do you and Sally have in total?
> **Student:** 2?
> **Robot:** Correct!

## Architecture

```
Browser (static site on GitHub Pages)
   │  POST {messages}
   ▼
Cloudflare Worker (free *.workers.dev address, holds the API key as a secret)
   │  1. gate call  → {"allow": true|false}   (fails closed on bad output)
   │  2. tutor call → only if allowed
   ▼
Anthropic Messages API (Claude Haiku 5.5)
```

- **GitHub Pages** hosts the site: plain HTML, CSS and JavaScript, no build step. Pages is static and can't keep secrets, so the site never holds the API key.
- **The Cloudflare Worker** (`worker/`) holds the key and calls Claude. The "think first" rule is enforced in code: a small classifier call decides whether the student has explained their thinking. If not, the Worker returns a refusal **without calling the tutor model at all**. Malformed classifier output counts as "not allowed".
- **Fallback:** if the Worker URL is empty, unreachable, errors, or takes more than 15 seconds, the browser switches to a built-in scripted tutor (`tutor.js`) with 9 practice problems. The status line under the chat says which mode is active.

### Files

| Path | What it is |
|---|---|
| `index.html`, `style.css` | The page and its styles |
| `script.js` | Chat UI: talks to the Worker, falls back to the scripted tutor |
| `tutor.js` | Scripted fallback tutor (pure functions, unit tested) |
| `config.js` | `WORKER_URL`, the Worker's address |
| `worker/index.js`, `worker/wrangler.toml` | The Cloudflare Worker |
| `tests/` | Unit tests (`node --test tests/`) |
| `404.html`, `.nojekyll`, `assets/` | GitHub Pages support files |

### Safety and cost controls in the Worker

- The API key is a Cloudflare secret (`ANTHROPIC_API_KEY`). It is not in this repo, the browser, or the logs.
- CORS only allows `https://salhemamalik29-hub.github.io` and `http://localhost:*`.
- Each message is capped at 1,000 characters, only the last 10 messages are sent, replies are capped at 300 tokens, and there is a basic per-IP rate limit (20 requests per minute per Worker instance).
- Oversized or malformed requests get a clean JSON error.

## Run it locally

You need [Node.js](https://nodejs.org/) 20 or newer.

```sh
# Serve the site (any static server works). Practice mode needs no key.
npx serve .
```

To run the Worker locally with the real model:

1. Create `worker/.dev.vars` with one line: `ANTHROPIC_API_KEY=sk-ant-...` (this file is gitignored).
2. Run `cd worker` and then `npx wrangler dev`. The Worker runs at `http://localhost:8787`.
3. In `config.js`, set `WORKER_URL` to `http://localhost:8787` while testing. Don't commit that change.

## Test

```sh
node --test tests/
```

The tests cover the scripted tutor (including that the answer never appears while a problem is locked) and the Worker with a mocked model (gate allow and deny, fail-closed parsing, CORS, the length cap, history trimming, rate limiting). They need no API key. GitHub Actions runs them on every push and pull request (`.github/workflows/tests.yml`).

Live-model test results are in [TESTING.md](TESTING.md).

## Deploy

**Site (GitHub Pages):** the site is served from the `main` branch, root folder. Every push to `main` redeploys it within a minute or two.

**Worker (Cloudflare, free tier):**

```sh
cd worker
npx wrangler login                          # once
npx wrangler deploy                         # prints the *.workers.dev URL
npx wrangler secret put ANTHROPIC_API_KEY   # paste the key when prompted
```

Then put the Worker URL into `config.js` and push.

## Keep costs under control

Set a **monthly spend limit** on your Anthropic API account (Claude Console → Settings → Limits). The Worker's caps keep each conversation cheap, but a spend limit is the real safety net if the site gets heavy traffic.

## Sources

- [ADD SOURCE 1: article or study on AI in education]
- [ADD SOURCE 2: article or study on responsible AI use]
