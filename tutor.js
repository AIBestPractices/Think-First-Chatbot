// tutor.js: the scripted "practice mode" tutor.
// Pure functions only (no DOM access) so it runs in the browser and in Node tests.
//
// Each problem moves through three states:
//   LOCKED  - the student has asked, but has not explained their thinking yet
//   GUIDED  - reasoning was given; the robot offered a scaffold question or hint
//   SOLVED  - the student reached the answer themselves

export const STATES = Object.freeze({
  IDLE: 'IDLE',
  LOCKED: 'LOCKED',
  GUIDED: 'GUIDED',
  SOLVED: 'SOLVED',
});

export const GUIDE_PROMPTS = Object.freeze({
  know: 'What do I already know?',
  smaller: 'Can I try a smaller example?',
  picture: 'What would a picture of this look like?',
});

export const REFUSALS = Object.freeze([
  "Sorry, you have to say what you think first. I can't just give you the answer. Explain your approach first.",
  "I can't hand over the answer yet. Tell me how you would start: what do you already know about this?",
  "Answer's still locked. Walk me through your thinking, even if you're unsure, and I'll help from there.",
]);

const INJECTION_REFUSAL =
  "I can't switch off the think-first rule. It's what makes me a tutor instead of an answer machine. Tell me how you'd approach the problem and I'll help.";

const VAGUE_REPLY =
  "That sounds like a guess, not an explanation yet. Tell me why you think that: what rule or idea are you using?";

// ---------------------------------------------------------------------------
// Number parsing (tolerant: "2", "2?", "two", "2 cars", "fifty-six", "3/4")
// ---------------------------------------------------------------------------

const UNITS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

/** Returns every number in the text, in order. Number words are combined ("fifty six" -> 56). */
export function extractNumbers(text) {
  const t = String(text).toLowerCase().replace(/(\d),(\d{3})\b/g, '$1$2');
  const tokens = t.match(/\d+(?:\.\d+)?(?:\s*\/\s*\d+)?|[a-z]+/g) || [];
  const out = [];
  let cur = null;
  let lastKind = null; // 'unit' | 'tens' | 'hundred'
  const flush = () => {
    if (cur !== null) out.push(cur);
    cur = null;
    lastKind = null;
  };
  for (const tok of tokens) {
    if (/^\d/.test(tok)) {
      flush();
      if (tok.includes('/')) {
        const [a, b] = tok.split('/').map((s) => Number(s.trim()));
        out.push(b === 0 ? NaN : a / b);
      } else {
        out.push(Number(tok));
      }
      continue;
    }
    if (tok in UNITS) {
      const v = UNITS[tok];
      if (cur !== null && lastKind === 'tens' && v < 10) cur += v;
      else if (cur !== null && lastKind === 'hundred') cur += v;
      else { flush(); cur = v; }
      lastKind = 'unit';
    } else if (tok in TENS) {
      if (cur !== null && lastKind === 'hundred') cur += TENS[tok];
      else { flush(); cur = TENS[tok]; }
      lastKind = 'tens';
    } else if (tok === 'hundred') {
      cur = (cur === null ? 1 : cur) * 100;
      lastKind = 'hundred';
    } else if (tok === 'and' && lastKind === 'hundred') {
      // "one hundred and five": keep going
    } else {
      flush();
    }
  }
  flush();
  return out.filter((n) => Number.isFinite(n));
}

/** The number the student most likely means as their answer (the last one they wrote). */
export function finalNumber(text) {
  const nums = extractNumbers(text);
  return nums.length ? nums[nums.length - 1] : null;
}

const numberIs = (target) => (text) => {
  const n = finalNumber(text);
  return n !== null && Math.abs(n - target) < 1e-9;
};

// ---------------------------------------------------------------------------
// Problem bank. Every fact here has been checked.
// ---------------------------------------------------------------------------

export const PROBLEMS = [
  {
    id: 'add-1-1',
    prompt: 'What is 1 + 1?',
    match: (t) => /\b1\s*\+\s*1\b(?!\s*\d)/.test(t) || /\bone plus one\b/.test(t),
    reasoningKeywords: ['add', 'adding', 'plus', 'sum', 'total', 'together', 'combine', 'count', 'more', 'bigger', 'larger', 'greater'],
    misconceptions: [
      {
        test: (t) => /\b(bigger|larger|greater|more than)\b/.test(t) && !/\bpositive\b/.test(t),
        note: "That's true for positive numbers (adding zero or a negative number doesn't make the sum bigger), and here's an example.",
      },
      {
        test: (t) => /\b(bigger|larger|greater|more than)\b/.test(t),
        note: "That's true for positive numbers, and here's an example.",
      },
      {
        test: (t) => /\bmultipl/.test(t),
        off: true,
        note: 'Careful: multiplying and adding are different operations. This question asks you to add.',
      },
    ],
    scaffold: 'Your friend Sally has a car. You also have a car. How many cars do you and Sally have in total?',
    check: numberIs(2),
    hints: [
      'Start with one thing. Now put one more thing next to it. How many things are there?',
      'Hold up one finger on your left hand and one on your right. Count all the fingers you are holding up.',
      "Count out loud: start at one, then say the very next number. That's your answer.",
    ],
    guides: {
      know: 'What does adding mean? When you add one more of something, does the amount go up, down, or stay the same?',
      smaller: 'This one is already small, so make it concrete instead: one apple, then one more apple. How many apples?',
      picture: 'Draw one dot. Then draw one more dot next to it. What do you see?',
    },
    explain: 'One car plus one more car makes two cars, so 1 + 1 = 2.',
  },
  {
    id: 'mult-7-8',
    prompt: 'What is 7 × 8?',
    match: (t) => /\b(7\s*(x|×|\*|times)\s*8|8\s*(x|×|\*|times)\s*7)\b/.test(t) || /\b(seven times eight|eight times seven)\b/.test(t),
    reasoningKeywords: ['group', 'groups', 'repeated', 'add', 'adding', 'times', 'multiply', 'multiplying', 'double', 'eights', 'sevens', '49', '40', '7 x 7', '5 x 8'],
    misconceptions: [
      {
        test: (t) => /\b(just )?add (7 and 8|8 and 7|them)\b/.test(t) && !/\bgroups?\b|\brepeated\b|\btimes\b/.test(t),
        off: true,
        note: 'Careful: 7 + 8 is adding once. 7 × 8 means adding 8 to itself 7 times.',
      },
    ],
    scaffold: 'Here is a step to try. You may already know 7 × 7 = 49. Then 7 × 8 is just one more group of 7. What is 49 + 7?',
    check: numberIs(56),
    hints: [
      '7 × 8 means 7 groups of 8. Try splitting it: 5 groups of 8 plus 2 groups of 8.',
      '5 × 8 = 40 and 2 × 8 = 16. What do those two parts add up to?',
      'Add 40 and 16 in two steps: 40 + 10 = 50, then add the remaining 6.',
    ],
    guides: {
      know: 'Which multiplication facts near this one do you already know? 7 × 7, 5 × 8, or 7 × 10 are good anchors.',
      smaller: 'Try 7 × 2 first. If you know that, how could you build up to 7 × 8?',
      picture: 'Picture 7 rows of 8 dots. How could you count them without counting every single dot?',
    },
    explain: '7 × 8 = 56: seven groups of eight, or 49 + 7.',
  },
  {
    id: 'rect-area',
    prompt: 'What is the area of a 4 by 6 rectangle?',
    match: (t) => /\barea\b/.test(t) && (/\b(4\s*(by|x|×|\*)\s*6|6\s*(by|x|×|\*)\s*4|four by six|six by four)\b/.test(t) || /rectangle/.test(t)),
    reasoningKeywords: ['multiply', 'multiplying', 'times', 'length', 'width', 'rows', 'columns', 'squares', 'grid', 'base', 'height'],
    misconceptions: [
      {
        test: (t) => /\b(add|adding|perimeter|around the (edge|outside))\b/.test(t) && !/\b(multipl|times)/.test(t),
        off: true,
        note: 'Adding the sides gives the perimeter (the distance around). Area is the space inside.',
      },
    ],
    scaffold: 'Picture the rectangle as a grid of 1-unit squares: 4 rows with 6 squares in each row. How many squares are there in total?',
    check: numberIs(24),
    hints: [
      'Area measures how many 1-by-1 squares fit inside the shape.',
      'There are 4 rows, and each row has 6 squares. Count by sixes, once for each row.',
      'Six, twelve, eighteen... what comes next for the fourth row?',
    ],
    guides: {
      know: 'What does area measure: the distance around the shape, or the space inside it?',
      smaller: 'Try a 2 by 3 rectangle first. Draw it as squares. How many are there?',
      picture: 'Sketch a grid 6 squares wide and 4 squares tall. What would you count?',
    },
    explain: 'Area = length × width = 6 × 4 = 24 square units.',
  },
  {
    id: 'ice-floats',
    prompt: 'Why does ice float on water?',
    match: (t) => /\bice\b/.test(t) && /\bfloat/.test(t),
    reasoningKeywords: ['dense', 'density', 'lighter', 'heavier', 'mass', 'volume', 'expand', 'expands', 'space', 'molecules', 'crystal', 'air', 'weight', 'sink'],
    misconceptions: [
      {
        test: (t) => /\b(air|bubbles?)\b/.test(t),
        note: "Some ice has trapped air bubbles, but even perfectly clear ice floats, so air isn't the main reason. Here's a question to work through.",
      },
      {
        test: (t) => /\blighter\b/.test(t) && !/\b(size|volume|dens)/.test(t),
        note: "You're close. A big iceberg isn't light, though, so think about weight compared with size.",
      },
    ],
    scaffold: 'When water freezes, its molecules lock into an open crystal pattern with more space between them. So for the same mass, does ice take up more or less space than liquid water, and what does that mean for its density?',
    check: (t) =>
      /\b(less|lower|smaller) (dense|density)\b/.test(t) ||
      /\bdensity (is |of ice is )?(lower|less|smaller)\b/.test(t) ||
      /\bnot as dense\b/.test(t) ||
      /\blighter for its (size|volume)\b/.test(t) ||
      (/\bless dense\b/.test(t)),
    hints: [
      'Objects float when they are less dense than the liquid they are in. Density means how much mass is packed into a space.',
      'Water expands when it freezes. If the same mass takes up more space, does its density go up or down?',
      'Bigger volume, same mass. Finish this sentence: "Ice floats because ice is ___ dense than water."',
    ],
    guides: {
      know: 'What decides whether something floats or sinks? Think about a rock compared with a piece of wood.',
      smaller: 'Picture one ice cube in a glass. Does it sit on the bottom or at the top? What does that tell you?',
      picture: 'Imagine water molecules as people. In liquid water they crowd together. In ice they hold hands in a ring. Which takes more room?',
    },
    explain: 'Ice is less dense than liquid water (about 0.92 g/cm³ compared with about 1.00 g/cm³), because water expands into an open crystal pattern when it freezes.',
  },
  {
    id: 'speed',
    prompt: 'A car travels 120 km in 2 hours. What is its average speed?',
    match: (t) => /\b(speed|how fast)\b/.test(t) && /\b120\b/.test(t),
    reasoningKeywords: ['divide', 'dividing', 'distance', 'time', 'per', 'hour', 'each hour', 'split', 'half', 'over'],
    misconceptions: [
      {
        test: (t) => /\b(multipl|times)/.test(t) && !/\bdivid/.test(t),
        off: true,
        note: 'Multiplying distance by time makes the number bigger. Speed is distance per unit of time.',
      },
    ],
    scaffold: 'Speed tells you the distance covered in each unit of time. If the car went 120 km in 2 hours at a steady pace, how many km did it go in just 1 hour?',
    check: numberIs(60),
    hints: [
      'Average speed = distance ÷ time.',
      'The distance is 120 km and the time is 2 hours. Split 120 km evenly across the 2 hours.',
      'What is half of 120?',
    ],
    guides: {
      know: 'What are the units of speed, like km per hour? What do those words tell you to do with distance and time?',
      smaller: 'If a car went 10 km in 2 hours, how far did it go each hour? Now try 120.',
      picture: 'Draw a road 120 km long and split it into 2 equal one-hour pieces. How long is each piece?',
    },
    explain: 'Speed = distance ÷ time = 120 km ÷ 2 h = 60 km/h.',
  },
  {
    id: 'fractions',
    prompt: 'What is 1/2 + 1/4?',
    match: (t) => /\b1\s*\/\s*2\s*\+\s*1\s*\/\s*4\b/.test(t) || /\b(a |one )?half (plus|and) (a |one )?quarter\b/.test(t),
    reasoningKeywords: ['common', 'denominator', 'quarter', 'quarters', 'fourths', 'same', 'convert', 'equal', 'equivalent', '2/4', 'half'],
    misconceptions: [
      {
        test: (t) => /\badd (the )?(top|bottom|numerators and denominators|both)\b/.test(t) || /\b2\s*\/\s*6\b/.test(t),
        off: true,
        note: "Careful: you can't add the bottom numbers. The pieces have to be the same size before you add them.",
      },
    ],
    scaffold: 'Good idea to make the pieces the same size. How many quarters are in one half? Then add the extra quarter. How many quarters is that altogether?',
    check: (t) => {
      if (/\bthree (quarters|fourths)\b/.test(t)) return true;
      const n = finalNumber(t);
      return n !== null && Math.abs(n - 0.75) < 1e-9 || /\b75\s*%/.test(t);
    },
    hints: [
      'Fractions can only be added directly when the bottom numbers (denominators) match.',
      'One half is the same as two quarters: 1/2 = 2/4.',
      'So the sum is 2/4 + 1/4. Add the top numbers and keep the bottom number.',
    ],
    guides: {
      know: 'What does the bottom number of a fraction tell you about the size of each piece?',
      smaller: 'Try 1/4 + 1/4 first. What do you get? Now, how could half be written in quarters?',
      picture: 'Draw a pizza cut into 4 slices. Shade half of it, then one more slice. How much is shaded?',
    },
    explain: '1/2 = 2/4, and 2/4 + 1/4 = 3/4.',
  },
  {
    id: 'boiling',
    prompt: 'At what temperature does water boil at sea level, in °C?',
    match: (t) => /\bboil/.test(t) && /\bwater\b/.test(t),
    reasoningKeywords: ['celsius', 'scale', 'freez', 'temperature', 'heat', 'degrees', 'bubbles', 'steam', 'sea level', 'pressure', '0', 'zero'],
    misconceptions: [
      {
        test: (t) => /\b212\b/.test(t),
        note: "212 is the boiling point in Fahrenheit. The question asks for Celsius. Here's a way to think about it.",
      },
    ],
    scaffold: 'The Celsius scale was built around water: 0 °C is where pure water freezes at sea level. The other fixed point on the scale is where water boils, and it was set to a round number. What number do you think it is?',
    check: (t) => numberIs(100)(t) || /\b(one )?hundred\b/.test(t),
    hints: [
      'On the Celsius scale, the gap between water freezing and boiling was divided into equal steps.',
      'That gap was split into exactly one hundred degrees. "Centi" means hundredth.',
      'If freezing is 0 and there are 100 equal steps up to boiling, where does boiling land?',
    ],
    guides: {
      know: 'What temperature does water freeze at in Celsius? The Celsius scale uses water for both of its key points.',
      smaller: 'Start with freezing. What temperature does ice melt at, in °C?',
      picture: 'Picture a thermometer with freezing water at the bottom mark and boiling water at the top mark. How many steps apart are they?',
    },
    explain: 'Pure water boils at 100 °C (212 °F) at sea-level pressure. At higher altitude the air pressure is lower, so it boils at a lower temperature.',
  },
  {
    id: 'plants-gas',
    prompt: 'What gas do plants take in from the air to make their food?',
    match: (t) => /\bplants?\b/.test(t) && /\b(gas|air|breathe|take in|photosynth|food)\b/.test(t),
    reasoningKeywords: ['oxygen', 'breathe', 'breath', 'photosynthesis', 'sunlight', 'light', 'leaves', 'air', 'exhale', 'opposite', 'reverse'],
    misconceptions: [
      {
        test: (t) => /\boxygen\b/.test(t) && /\b(take|breathe|absorb) in\b/.test(t) && !/\b(release|give off|let out|make)\b/.test(t),
        off: true,
        note: 'Careful: plants actually release oxygen during photosynthesis. They take in a different gas.',
      },
    ],
    scaffold: 'You breathe in oxygen and breathe out a different gas. During photosynthesis, plants release oxygen, which is roughly the reverse. So which gas that you breathe out could plants take in?',
    check: (t) => /\bcarbon dioxide\b/.test(t) || /\bco\s*2\b/.test(t) || /\bco₂\b/.test(t),
    hints: [
      'Photosynthesis uses light energy, water, and a gas from the air. Its by-product is oxygen.',
      'The gas plants need is the one animals breathe out.',
      'Its name has two parts: an element that is in coal and pencil "lead", plus a word meaning "two oxygens".',
    ],
    guides: {
      know: 'What do you know about photosynthesis? What goes in, and what comes out?',
      smaller: 'Think about your own breathing first. What gas do you breathe in, and what gas do you breathe out?',
      picture: 'Sketch a leaf with arrows: sunlight and water coming in, oxygen going out. One more arrow is missing coming in. What is it?',
    },
    explain: 'Plants take in carbon dioxide (CO₂). With water and light energy they make glucose, and they release oxygen.',
  },
  {
    id: 'falling',
    prompt: 'If you drop a heavy ball and a light ball at the same time, ignoring air resistance, which lands first?',
    match: (t) => /\b(heavy|heavier)\b/.test(t) && /\b(light|lighter)\b/.test(t) && /\b(fall|falls|drop|dropped|land|lands|hit|hits)\b/.test(t),
    reasoningKeywords: ['gravity', 'accelerat', 'mass', 'force', 'galileo', 'air resistance', 'same', 'weight', 'pull'],
    misconceptions: [
      {
        test: (t) => /\bheav(y|ier)\b.*\b(first|faster|quicker)\b/.test(t),
        off: true,
        note: "That's a very common idea, and it seems right. The heavier ball does get a bigger pull from gravity, but it also has more mass to get moving.",
      },
    ],
    scaffold: "Gravity pulls harder on the heavy ball, but the heavy ball also has more mass, so it's harder to speed up. Those two effects cancel out exactly. So with no air resistance, how do their landing times compare?",
    check: (t) => /\b(same time|at once|together|simultaneous|neither|tie|both land|equal(ly)?|same)\b/.test(t) && !/\bheav(y|ier) (one |ball )?(first|lands first)\b/.test(t),
    hints: [
      'Near Earth, gravity gives every object the same acceleration, about 9.8 m/s², if air resistance is ignored.',
      'Same acceleration and same starting height means the same speed at every moment of the fall.',
      'If both balls always have the same speed and start together, what happens when they reach the ground?',
    ],
    guides: {
      know: "What do you know about gravity? Does it make all objects speed up at the same rate, or different rates?",
      smaller: 'Imagine dropping two identical balls side by side. Which one lands first? Now tape them into one object that is twice as heavy. Would joining them change how fast they fall?',
      picture: 'Picture both balls side by side, frame by frame, with no air. Does either one ever get ahead?',
    },
    explain: 'They land at the same time. Without air resistance, all objects fall with the same acceleration (about 9.8 m/s² near Earth), whatever their mass.',
  },
];

export const EXAMPLE_PROMPTS = PROBLEMS.map((p) => p.prompt);

// ---------------------------------------------------------------------------
// Message classification
// ---------------------------------------------------------------------------

const normalize = (text) =>
  String(text)
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

// Strong markers show the student is explaining. Weak ones ("if", "which", ...) also
// show up in plain questions, so they only count when the message isn't a question.
const STRONG_MARKERS = [
  /\bbecause\b/, /\bso\b/, /\bi think\b/, /\bi would\b/, /\bi'd\b/, /\bmeans\b/,
  /\bsince\b/, /\btherefore\b/, /\bi know\b/, /\bmy approach\b/, /\bi'll\b/, /\bi will\b/,
  /\bi guess\b/, /\bi believe\b/, /\bthat's why\b/,
];
const WEAK_MARKERS = [
  /\bthen\b/, /\bif\b/, /\bfirst\b/, /\bwhen you\b/, /\bwhich\b/, /\bshould\b/, /\bmaybe\b/,
  /\bwe can\b/, /\byou can\b/,
];

const INJECTION = /\b(ignore|disregard|forget|override|bypass)\b.{0,40}\b(rules?|instructions?|prompt|programming|guidelines|restrictions?)\b|\b(you are now|pretend (you|to be)|act as|developer mode|jailbreak|system prompt|new rules?)\b/;
const DEMAND = /\b(just|please|pls|can you|could you)?\s*(tell|give|show|say)\b.{0,15}\b(answer|solution|result)\b|\bjust tell me\b|\bwhat'?s the answer\b|\bwhat is the answer\b|\btell me (it|the answer)\b|\banswer (it|this) for me\b|\bskip (to|the) (the )?answer\b/;
const STUCK = /\b(i don'?t know|dont know|idk|no idea|not sure|i'?m stuck|stuck|confused|i give up|lost)\b/;
const HINT = /\b(hint|clue|help me|a tip|nudge)\b/;

// Phrases that contain a negation word but still state a correct idea.
const BENIGN_NEGATIONS = /\bnot as (dense|heavy)\b|\b(no|without) air( resistance)?\b|\b(does ?n't|does not|do ?n't|do not) matter\b|\bno matter\b|\bneither\b/g;
const NEGATION = /\b(not|no|never|nope|nah)\b|n't\b/;

/** True when an answer is negated ("they don't land at the same time"), so it can't be marked correct. */
export function isNegated(text) {
  return NEGATION.test(normalize(text).replace(BENIGN_NEGATIONS, ' '));
}

export function wordCount(text) {
  return (normalize(text).match(/[a-z0-9'/+×*=.-]+/g) || []).length;
}

export function isInjection(text) {
  return INJECTION.test(normalize(text));
}

export function isAnswerDemand(text) {
  return DEMAND.test(normalize(text));
}

export function isStuck(text) {
  return STUCK.test(normalize(text));
}

export function isHintRequest(text) {
  return HINT.test(normalize(text));
}

/**
 * A message counts as reasoning only if it is an explanation: at least 8 words
 * and at least one reasoning marker, and it is not a demand or a rule-override.
 */
export function isReasoning(text) {
  const t = normalize(text);
  if (isInjection(t) || isAnswerDemand(t)) return false;
  if (wordCount(t) < 8) return false;
  if (STRONG_MARKERS.some((re) => re.test(t))) return true;
  return !t.endsWith('?') && WEAK_MARKERS.some((re) => re.test(t));
}

/** Short "I think it's X" style guesses: an opinion without an explanation. */
export function isVagueGuess(text) {
  const t = normalize(text);
  return /\b(i (just )?think|i guess|i believe|maybe|probably)\b/.test(t) && !isReasoning(t);
}

export function findProblem(text) {
  const t = normalize(text);
  return PROBLEMS.find((p) => p.match(t)) || null;
}

export function getProblem(id) {
  return PROBLEMS.find((p) => p.id === id) || null;
}

export function guideKey(text) {
  const t = normalize(text);
  if (t.includes('already know')) return 'know';
  if (t.includes('smaller example')) return 'smaller';
  if (t.includes('picture of this')) return 'picture';
  return null;
}

// ---------------------------------------------------------------------------
// Session + responses
// ---------------------------------------------------------------------------

export function createSession() {
  return { problemId: null, state: STATES.IDLE, hintIndex: 0, refusals: 0 };
}

function refusal(session) {
  const text = REFUSALS[session.refusals % REFUSALS.length];
  return { text, session: { ...session, refusals: session.refusals + 1 } };
}

function nextHint(problem, session) {
  const i = Math.min(session.hintIndex, problem.hints.length - 1);
  const last = session.hintIndex >= problem.hints.length - 1;
  const text = problem.hints[i] + (session.hintIndex >= problem.hints.length ? " You're one step away. Give it a try." : '');
  return { text, session: { ...session, hintIndex: session.hintIndex + 1 }, last };
}

function result(reply, session, suggestions = []) {
  return { reply, session, suggestions };
}

function offBank(session) {
  return result(
    "In practice mode I can only guide you through a set of built-in problems, and that question isn't one of them. Pick one of these to try:",
    session,
    EXAMPLE_PROMPTS.slice(0, 4),
  );
}

/** Which misconception (if any) the reasoning shows. */
function findMisconception(problem, t) {
  return (problem.misconceptions || []).find((m) => m.test(t)) || null;
}

function onTrack(problem, t) {
  return problem.reasoningKeywords.some((k) => t.includes(k));
}

function respondToReasoning(problem, session, t) {
  const mis = findMisconception(problem, t);
  if (mis && mis.off) {
    const h = nextHint(problem, { ...session, hintIndex: 0 });
    return result(
      `Thanks for explaining your thinking. ${mis.note} Here's a hint: ${h.text}`,
      { ...h.session, state: STATES.GUIDED },
    );
  }
  if (onTrack(problem, t) || mis) {
    const note = mis ? mis.note : "Here's an example to work through.";
    return result(
      `Yes, you're thinking in the right direction. ${note} ${problem.scaffold}`,
      { ...session, state: STATES.GUIDED, hintIndex: 0 },
    );
  }
  const h = nextHint(problem, { ...session, hintIndex: 0 });
  return result(
    `Thanks for explaining your thinking. I'm not sure that approach leads to the answer, so let's adjust. Here's a hint: ${h.text}`,
    { ...h.session, state: STATES.GUIDED },
  );
}

/**
 * Main entry point. Pure: takes a session and a message, returns
 * { reply, session, suggestions } without mutating the input session.
 */
export function respond(session, message) {
  const s = { ...createSession(), ...(session || {}) };
  const t = normalize(message);

  if (!t) {
    return result('Type a science or math question, then tell me how you would approach it.', s);
  }

  // Guiding-prompt buttons.
  const g = guideKey(t);
  if (g) {
    const problem = getProblem(s.problemId);
    if (!problem || s.state === STATES.SOLVED) {
      return result(
        "Good habit. First, tell me the question you're working on. Then ask yourself: what facts do I already know about it?",
        s,
        EXAMPLE_PROMPTS.slice(0, 4),
      );
    }
    return result(problem.guides[g], s);
  }

  // A new question starts a new problem (unless it's the same one we're on).
  const found = findProblem(t);
  if (found && found.id !== s.problemId) {
    const fresh = { ...s, problemId: found.id, state: STATES.LOCKED, hintIndex: 0 };
    if (isReasoning(t)) return respondToReasoning(found, fresh, t);
    if (isInjection(t)) return result(INJECTION_REFUSAL, { ...fresh, refusals: fresh.refusals + 1 });
    const r = refusal(fresh);
    return result(r.text, r.session);
  }

  const problem = getProblem(s.problemId);

  if (!problem || s.state === STATES.IDLE) {
    if (isInjection(t)) return result(INJECTION_REFUSAL, { ...s, refusals: s.refusals + 1 });
    if (isAnswerDemand(t)) {
      return result("I don't hand out answers, but I'm glad to help you work one out. Which question are you working on?", s, EXAMPLE_PROMPTS.slice(0, 4));
    }
    return offBank(s);
  }

  if (s.state === STATES.SOLVED) {
    if (isInjection(t) || isAnswerDemand(t) || isStuck(t) || isHintRequest(t)) {
      return result(`You already solved that one. ${problem.explain} Want to try another?`, s, EXAMPLE_PROMPTS.filter((p) => p !== problem.prompt).slice(0, 4));
    }
    return offBank(s);
  }

  if (s.state === STATES.LOCKED) {
    if (isInjection(t)) return result(INJECTION_REFUSAL, { ...s, refusals: s.refusals + 1 });
    if (isReasoning(t)) return respondToReasoning(problem, s, t);
    if (isHintRequest(t) || isStuck(t)) {
      // A hint is not the answer, so it's allowed, but the problem stays locked.
      return result(
        `Here's somewhere to start: ${problem.guides.know} Then tell me how you'd approach it.`,
        s,
      );
    }
    if (isVagueGuess(t) && !isAnswerDemand(t)) {
      return result(VAGUE_REPLY, { ...s, refusals: s.refusals + 1 });
    }
    const r = refusal(s);
    return result(r.text, r.session);
  }

  // GUIDED: the student is working on the scaffold question.
  if (isInjection(t)) {
    const h = nextHint(problem, s);
    return result(`I can't switch off the think-first rule, but here's a hint: ${h.text}`, h.session);
  }
  if (problem.check(t) && !isAnswerDemand(t) && !isNegated(t)) {
    return result(`Correct! ${problem.explain}`, { ...s, state: STATES.SOLVED });
  }
  if (isAnswerDemand(t)) {
    const h = nextHint(problem, s);
    return result(`I won't give you the answer, but you're close. Here's a hint: ${h.text}`, h.session);
  }
  if (isHintRequest(t) || isStuck(t)) {
    const h = nextHint(problem, s);
    return result(`That's okay, let's take it one step at a time. ${h.text}`, h.session);
  }
  const mis = findMisconception(problem, t);
  const h = nextHint(problem, s);
  const lead = mis && mis.off ? `Not quite. ${mis.note}` : 'Not quite.';
  return result(`${lead} Here's a hint: ${h.text}`, h.session);
}
