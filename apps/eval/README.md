# Resonance eval harness

A measurement harness for the recommendation pipeline, so quality changes are
**measurable rather than vibes-based**. Three independent layers, each
answering a different question.

| Suite | Question | AI cost |
| --- | --- | --- |
| `invariants` | Did the pipeline keep its structural promises? | none |
| `heldout` | Would the system find a title it doesn't already know about? | ~1 pipeline run per probe |
| `judge` | Is the *reasoning* in each rec specific and honest? | 1 Opus call per judged rec |

The eval reads the same Neon database the server writes to. It maintains its
own slim schema (`src/db.ts`) covering just the columns it needs, so running
it doesn't boot the server.

## Running

```sh
pnpm --filter @resonance/eval eval                      # all suites
pnpm --filter @resonance/eval eval:invariants           # invariants only (free)
EVAL_USER_ID=<uuid> pnpm --filter @resonance/eval eval:heldout
EVAL_USER_ID=<uuid> pnpm --filter @resonance/eval eval:judge
```

Flags (pass after `--`): `--suite <name>`, `--n <count>`, `--batch <id>`.

Env (`.env.local` at the repo root, shared with the server):

- `DATABASE_URL` — required.
- `EVAL_USER_ID` — required for `heldout` and `judge` (both are per-user by
  construction). Optional for `invariants` (unset = scan every user).
- `ANTHROPIC_API_KEY` — required for `judge`.

Reports land in `runs/<timestamp>-<suite>.md` (gitignored — commit notable
baselines by hand). The process exits non-zero if any invariant failed, so a
future CI job can gate on `eval:invariants`.

## The three layers

### Invariants — `src/invariants.ts`

Deterministic checks against every persisted batch. A violation is a
*correctness* failure, not a quality one — the pipeline broke a promise:

1. **rec-has-real-media-row** — every rec joins to a real `media_cache` row
   (the anti-hallucination guarantee).
2. **rec-mediatype-canonical** — every rec's `mediaType` is one of the six
   canonical types.
3. **no-canonical-duplicates-within-batch** — no two recs in a batch
   canonicalize to the same simplified title. The eval uses a deliberately
   *simpler* canonicalizer than the recommender, so a hit means the
   system's canonicalizer let something slip.
4. **cross-reference-anchored** — every `crossReferences[].title` is findable
   in the user's library / profile favorites / theme evidence. A miss means
   the model fabricated an anchor.

### Held-out recall — `src/heldOut.ts`

For each held-out title: hide it from the recommender (`excludeLibraryTitles`
option), run the full pipeline, check whether the title re-surfaces. Held-out
candidates are pre-filtered to library titles NOT in profile favorites and
NOT previously recommended — so the hidden library row was the system's only
channel to discover them.

The recommender is non-deterministic; a single trial is noisy. Multi-trial
averaging is future work.

### LLM-judge — `src/judge.ts`

Scores each rec's *explanation* (0-5) against a rubric — specificity,
alignment, anchoring — using **Opus 4.7**, a more capable model than the
Sonnet 4.6 generator. A stronger judge reduces self-grading bias; it does not
eliminate it (same model family). Trust score *deltas between runs* more than
any single absolute number.
