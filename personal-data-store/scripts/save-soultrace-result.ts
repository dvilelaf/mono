import "dotenv/config";
import { db } from "../src/db/index.js";
import { personalityAssessments, personalityAssessmentAnswers } from "../src/domains/personality/personality.schema.js";
import { documents } from "../src/domains/documents/documents.schema.js";

const RESULT_ID = "e6630559-e03d-4f22-aacc-1587c3860f39";
const RESULT_URL = `https://soultrace.app/en/results/${RESULT_ID}`;
const TAKEN_AT = new Date("2026-04-27T00:00:00Z");

const ANSWERS: { questionId: string; questionText: string; score: number }[] = [
  { questionId: "66", questionText: "I notice when systems or processes are inefficient and feel compelled to improve them.", score: 7 },
  { questionId: "31", questionText: "I'm energized by high-stakes, high-pressure situations more than calm, predictable ones.", score: 5 },
  { questionId: "24", questionText: "After failing at something important, I analyze what went wrong rather than seek comfort.", score: 6 },
  { questionId: "12", questionText: "I often prioritize ambitious long-term goals over enjoying the present moment.", score: 7 },
  { questionId: "51", questionText: "I make decisions based on what feels right now rather than future consequences.", score: 2 },
  { questionId: "32", questionText: "I'd rather give someone a harsh truth directly than soften it to spare their feelings.", score: 4 },
  { questionId: "29", questionText: "When a process works well, I'm reluctant to change it even if some people find it uncomfortable.", score: 2 },
  { questionId: "54", questionText: "When I disagree with a group consensus, I usually voice my objection.", score: 5 },
  { questionId: "75", questionText: "I often miss social cues and nonverbal signals in conversations.", score: 4 },
  { questionId: "8",  questionText: "A calm, respectful setting is more important than total freedom of expression.", score: 2 },
  { questionId: "14", questionText: "I'd rather start something new than perfect something I've already done.", score: 2 },
  { questionId: "21", questionText: "I'm more energized by solving puzzles than by connecting with people.", score: 4 },
  { questionId: "2",  questionText: "I believe that established societal structures and traditions provide essential stability.", score: 3 },
  { questionId: "53", questionText: "I feel more alive during a crisis than during periods of calm stability.", score: 2 },
  { questionId: "18", questionText: "I would rather be respected for my competence than loved for my personality.", score: 5 },
  { questionId: "16", questionText: "When someone is struggling, my first instinct is to offer solutions, not emotional comfort.", score: 4 },
  { questionId: "11", questionText: "I work best with clear expectations and defined processes, rather than with uncertainty and change.", score: 1 },
  { questionId: "26", questionText: "I would choose a job that challenges my abilities over one that guarantees security.", score: 7 },
  { questionId: "17", questionText: "I'm skeptical of new trends and prefer sticking with what has worked for a long time.", score: 2 },
  { questionId: "1",  questionText: "In groups, I prefer to contribute quietly from the sidelines rather than being the center of attention.", score: 5 },
  { questionId: "28", questionText: "I'm comfortable with silence in conversations and don't feel the need to fill every pause.", score: 5 },
  { questionId: "77", questionText: "I often choose not to share what I really think.", score: 5 },
  { questionId: "64", questionText: "I enjoy casual conversations about everyday life more than deep philosophical discussions.", score: 4 },
  { questionId: "55", questionText: "I tend to research a topic exhaustively before forming an opinion about it.", score: 3 },
];

const ANALYSIS_CONTENT = `# SoulTrace Personality Assessment — 2026-04-27

**Archetype:** Operator (black-blue)
**Alignment Score:** 76.7%
**Result URL:** ${RESULT_URL}

## Color Distribution

| Color | Score |
|-------|-------|
| Black (agency, achievement) | 42.3% |
| Blue (understanding, mastery) | 23.6% |
| Red (intensity, expression) | 20.8% |
| White (structure, fairness) | 7.9% |
| Green (connection, growth) | 5.4% |

**Entropy:** 2.004
**Shadow colors:** green (5.4%), white (7.9%)

## Core Dynamic

You approach goals like engineering problems. You want methods that work, and you enjoy finding practical solutions to complex challenges. You are systematic, resourceful, and confident when the steps are clear. You may not always show emotion, but you express care by solving problems that others find overwhelming. You feel most satisfied when your ideas become real and produce measurable results.

## Strengths

- Builds systems that actually work — efficient, robust, and designed for real-world conditions
- Masters complexity; you can hold more moving pieces in your head than most people think is possible
- Performs under pressure — deadlines and stakes focus you rather than rattle you
- Treats obstacles as engineering problems, not emotional crises

## Weaknesses

- Undervalues perspectives that aren't as rigorous as yours — even when they're right
- Defaults to solo execution because teaching someone else feels like a waste of time
- Prioritizes being correct over being collaborative, then wonders why no one's invested
- Struggles when plans hit human unpredictability — people don't behave like systems

## Top Matches

1. Operator (black-blue) — 76.7%
2. Vanguard (black-red) — 74.4%
3. Strategist (blue-black) — 67.1%
`;

const ANALYSIS_METADATA = {
  source: "soultrace",
  externalId: RESULT_ID,
  resultUrl: RESULT_URL,
  takenAt: TAKEN_AT.toISOString(),
  archetype: {
    key: "black-blue",
    name: "Operator",
    alignmentScore: 76.7,
  },
  distribution: {
    white: 0.07871969056290135,
    blue: 0.23632871790130958,
    black: 0.4230556407155228,
    red: 0.2079291655055558,
    green: 0.05396678531471044,
  },
  topMatches: [
    { key: "black-blue", name: "Operator", alignmentScore: 76.7 },
    { key: "black-red", name: "Vanguard", alignmentScore: 74.4 },
    { key: "blue-black", name: "Strategist", alignmentScore: 67.1 },
  ],
  shadowColors: [
    { color: "green", score: 0.054 },
    { color: "white", score: 0.079 },
  ],
  entropy: 2.0039830223895074,
};

async function main() {
  const [assessment] = await db
    .insert(personalityAssessments)
    .values({
      source: "soultrace",
      externalId: RESULT_ID,
      resultUrl: RESULT_URL,
      takenAt: TAKEN_AT,
    })
    .returning();

  console.log("inserted assessment:", assessment.id);

  await db.insert(personalityAssessmentAnswers).values(
    ANSWERS.map((a, i) => ({
      assessmentId: assessment.id,
      position: i + 1,
      questionId: a.questionId,
      questionText: a.questionText,
      score: a.score,
    })),
  );

  console.log(`inserted ${ANSWERS.length} answers`);

  const [doc] = await db
    .insert(documents)
    .values({
      domain: "personality",
      title: "SoulTrace Personality Assessment — 2026-04-27 (Operator)",
      content: ANALYSIS_CONTENT,
      metadata: { ...ANALYSIS_METADATA, assessmentId: assessment.id },
    })
    .returning();

  console.log("inserted document:", doc.id);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
