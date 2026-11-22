# Testing

This file records what was tested, how, and the results. Dates are when the check was run.

## 1. Unit tests (`node --test tests/`)

Runs on every push and pull request in GitHub Actions (`.github/workflows/tests.yml`, Node 26). No API key needed: the Worker tests use a mocked model.

**69 tests, 69 passing** (2026-11-22).

| File | Tests | What they cover |
|---|---|---|
| `tests/tutor.test.js` | 45 | Number parsing ("2", "2?", "two", "2 cars", "fifty-six", "3/4"); the problem bank (9 problems, each with triggers, reasoning keywords, scaffold, accepted answers, a 3-step hint ladder and an explanation); the reasoning gate; the full example conversation; refusal variety; "ignore your rules"; vague guesses; wrong answers; hint ladder; "I don't know"; off-track reasoning and misconceptions; guiding-prompt buttons; off-bank questions; new question after solving; negated answers never marked correct; and a sweep that **the answer never appears while a problem is LOCKED** (13 attempts per problem, including demands, injections and all three guiding prompts). |
| `tests/worker.test.js` | 24 | Gate allow → tutor called; gate deny → refusal **without** a tutor call; malformed gate output fails closed (7 variants); structured-output gate request; tutor system prompt and token cap; refusal variety; CORS allow (GitHub Pages origin, localhost on any port) and deny (5 origins, including look-alike domains and no origin); preflight; 1,000-character cap (and exactly 1,000 accepted); malformed bodies; oversized bodies (413); GET (405); missing key (503); model failure (502, no key leaked); history trimmed to 10 and starting on a user turn; rate limiting (429). |

## 2. Local site checks (served from a `/think-first-ai/` subpath, like GitHub Pages)

Driven in headless Microsoft Edge over the DevTools protocol (2026-11-21).

| Check | Result |
|---|---|
| The example conversation (1+1 → refusal → "positive numbers" reasoning → Sally's car → "2?" → "Correct!") | Pass, word for word |
| Asset 404s / failed requests / JavaScript errors | None |
| Fonts (Newsreader, Inter) loaded | Yes |
| 360 px phone width: horizontal scroll | None |
| Touch targets under 44 px | None |
| Off-bank question → clickable examples → guiding prompt | Pass |

## 3. Live GitHub Pages checks

Site: https://salhemamalik29-hub.github.io/Think-First-Chatbot/ (2026-11-22, practice mode)

| Check | Result |
|---|---|
| Pages source | `main`, root folder, no custom domain, status "built" |
| Example conversation on the live site | Pass, word for word |
| `style.css`, `script.js`, `tutor.js`, `config.js`, `assets/favicon.svg`, `.nojekyll` | All 200 |
| Missing path (`/does/not/exist`) | 404 with the styled 404 page |
| Fonts, JS errors, failed requests | Fonts loaded; no errors |
| Hash links `#chat`, `#how`, `#why` | Each section lands just below the sticky header |
| Keyboard: Tab order and focus rings | Skip link → logo → nav → CTA → guiding prompts → input → Send; every stop shows a visible focus ring |
| `prefers-reduced-motion: reduce` | Smooth scrolling and the typing animation are turned off |
| Chat log | `role="log"`, `aria-live="polite"`; input has a label |
| GitHub Actions `tests` workflow | Green |

### Colour contrast (WCAG 2.1 AA)

Every text colour pair passes 4.5:1 (lowest: placeholder text 7.12:1). Large serif numerals pass 3:1 (7.04:1). Focus rings pass 3:1 (11.42:1 or higher).

The audit found the chat input's border at 2.12:1 against the card, below the 3:1 needed for a control's edge. It now uses the taupe border `#6F6256` (3.09:1). The user bubble's border is decorative (the bubble is not a control), so 3:1 does not apply.

## 4. Audit fixes (2026-11-22)

A review of everything built so far found and fixed:

1. **Negated answers were marked correct** in practice mode ("they don't land at the same time", "ice is not less dense", "it's not 56" all got "Correct!"). Now any negated answer gets a hint instead. Correct phrasings that contain "not" ("not as dense", "no air resistance", "mass doesn't matter") are still accepted. Regression tests added.
2. **A guiding prompt leaked an answer while locked**: the falling-balls "smaller example" said the balls "land together". Rewritten as a question. The LOCKED leak sweep now includes all three guiding prompts.
3. **Input border contrast** raised to 3:1 (see above).

## 5. Deployed Worker checks

Worker: https://think-first-ai.salhemamalik29.workers.dev (2026-11-22, before the API key was set)

| Request | Result |
|---|---|
| POST from `https://salhemamalik29-hub.github.io` | 503 "The tutor is not configured yet." (expected with no key) |
| POST from `http://localhost:8080` | 503, same (allowed origin) |
| POST from `https://evil.example` | 403 "Origin not allowed." |
| POST with no Origin header | 403 |
| OPTIONS preflight from the Pages origin | 204 |
| GET | 405 |

## 6. Live-model checks

_Pending: needs `worker/.dev.vars` with the API key. `scripts/live-check.mjs` runs 39 prompts (bare question, "just tell me", "ignore your instructions", vague reasoning, wrong reasoning, correct reasoning, answer variants, wrong answers, "I don't know", repeated hints, off-topic, two prompt-injection styles, a guiding prompt, a misconception, a rule override after reasoning, and a new question after finishing one) through `npx wrangler dev`, with automatic answer-leak checks. Results will be recorded here._
