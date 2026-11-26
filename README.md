# Think First

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
   │  2. tutor call → only if allowed: {"check", "verdict", "reply"}
   │     (only "reply" is sent back; "Correct!" needs verdict = correct)
   ▼
Anthropic Messages API (Claude Haiku 5.5)
```

- **GitHub Pages** hosts the site: plain HTML, CSS and JavaScript, no build step. Pages is static and can't keep secrets, so the site never holds the API key.
- **The Cloudflare Worker** (`worker/`) holds the key and calls Claude. The "think first" rule is enforced in code: a small classifier call decides whether the student has explained their thinking. If not, the Worker returns a refusal **without calling the tutor model at all**. Malformed classifier output counts as "not allowed".
- **Fallback:** if the Worker URL is empty, unreachable, errors, or takes more than 15 seconds, the browser switches to a built-in scripted tutor (`tutor.js`) with 9 practice problems. After an outage it tries the AI again on the first message sent a minute or more later. In practice mode a line under the chat says so; in AI mode that line is hidden.

### Files

| Path | What it is |
|---|---|
| `index.html`, `style.css` | The page and its styles |
| `script.js` | Chat UI: talks to the Worker, falls back to the scripted tutor |
| `tutor.js` | Scripted fallback tutor (pure functions, unit tested) |
| `config.js` | `WORKER_URL`, the Worker's address |
| `worker/chat.js` | The Worker's logic: gate, tutor, CORS, validation, rate limiting (unit tested) |
| `worker/index.js`, `worker/wrangler.toml` | The Worker's entry point (default export only: the runtime rejects other exports there) and its config |
| `tests/` | Unit tests (`node --test tests/`) |
| `404.html`, `.nojekyll`, `assets/` | GitHub Pages support files |

### Safety and cost controls in the Worker

- The API key is a Cloudflare secret (`ANTHROPIC_API_KEY`). It is not in this repo, the browser, or the logs.
- CORS only allows `https://aibestpractices.github.io` (plus `http://localhost:*` when `ALLOW_LOCALHOST=true` is set in `worker/.dev.vars` for local testing). CORS stops other *websites* from using the Worker in a browser, but it is not a password: a script can send any `Origin` header. The rate limit and your Anthropic spend limit are what cap the cost.
- Each student message is capped at 1,000 characters. The gate reads the last 20 messages (so the student's earlier reasoning stays visible); the tutor reads the last 10. The tutor's output is capped at 500 tokens, and a reply cut off by the cap ends at its last full sentence. Earlier tutor replies sent back as history are truncated, never rejected.
- Rate limit: 20 requests per minute per IP. Each request must pass two limiters: an exact in-memory count (within one Worker instance) and Cloudflare's rate limiting binding (`RATE_LIMITER` in `wrangler.toml`, which spans instances but is approximate). A browser tab is held to about 20 (measured: 20–22); a script opening a new connection per request can get more through, so the spend limit stays the hard cap.
- Each model request has a 14-second deadline (both calls together), so the Worker stops paying once the browser has given up.
- Oversized (over 64 KB) or malformed requests get a clean JSON error.
- If the model call fails, the Worker returns a 502 with a short reason and a plain message: `timeout` (took too long), `unreachable`, `busy` (Anthropic overloaded or rate-limited), `setup` (for example a missing or wrong key) or `upstream` (any other error). It never includes the key or the model API's own error details.
- Worker logs are kept in the Cloudflare dashboard (`[observability]` in `wrangler.toml`). The Worker's own log lines contain only error status codes, never chat messages or keys; Cloudflare also records basic request details for each call (time, status, duration).

### Safety in the page

- A Content-Security-Policy in `index.html` only lets the page load its own scripts, Google Fonts, and talk to its own Worker (plus `http://localhost:8787` for local testing).
- Chat messages are always inserted as plain text, never as HTML.

## Run it locally

You need [Node.js](https://nodejs.org/) 26 or newer (the version the tests run on in CI).

```sh
# Serve the site (any static server works). Practice mode needs no key.
npx serve .
```

To run the Worker locally with the real model:

1. Create `worker/.dev.vars` (this file is gitignored) with two lines:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ALLOW_LOCALHOST=true
   ```
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
