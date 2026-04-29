// Streaming text filter for Claude's onboarding output.
//
// The model is instructed (see prompts/onboarding.ts) to wrap its hidden
// reasoning in <analysis>...</analysis> or <thinking>...</thinking>, and to
// emit <ready/> when it has enough signal. We strip all three from the
// user-visible stream and surface a `ready` signal so the frontend can
// trigger profile extraction.
//
// Why two block tag names: Claude has a strong training-time default to use
// <thinking>, so even prompts asking for <analysis> sometimes get <thinking>
// back. Supporting both makes the filter robust to whichever convention the
// model picks.
//
// The non-trivial bit: tags can split across chunk boundaries. If we just
// looked for the literal tags in each chunk, "Hello <ana" then "lysis>secrets"
// would leak "Hello <ana" to the user. So we buffer the tail of each chunk
// that could be the start of a tag and only emit the safe prefix.

const BLOCK_TAGS = [
  { open: "<analysis>", close: "</analysis>" },
  { open: "<thinking>", close: "</thinking>" },
] as const;
const READY = "<ready/>";

const ALL_OPENS = BLOCK_TAGS.map((t) => t.open);

/**
 * Length of the longest suffix of `s` that is also a prefix of `tag`.
 * Used to decide how many trailing chars to hold back in case they're the
 * start of `tag` arriving across a chunk boundary.
 */
function partialTagSuffix(s: string, tag: string): number {
  const max = Math.min(s.length, tag.length - 1);
  for (let n = max; n > 0; n--) {
    if (tag.startsWith(s.slice(-n))) return n;
  }
  return 0;
}

function maxPartialSuffix(s: string, tags: readonly string[]): number {
  let max = 0;
  for (const tag of tags) {
    const m = partialTagSuffix(s, tag);
    if (m > max) max = m;
  }
  return max;
}

export interface FilterChunk {
  /** Text safe to display to the user (with reasoning + ready tags removed). */
  text: string;
  /** True if a <ready/> tag was first detected on this push. */
  readySignaled: boolean;
}

export class StreamFilter {
  private buffer = "";
  /** Close tag we're currently scanning for, or null in NORMAL state. */
  private waitingFor: string | null = null;
  private ready = false;
  /** Have we emitted any non-whitespace yet? Used to suppress leading
   * whitespace left behind after stripping a leading reasoning block —
   * otherwise the user sees 2-3 blank lines before the bot's actual reply
   * starts typing. */
  private hasEmittedContent = false;

  push(chunk: string): FilterChunk {
    this.buffer += chunk;
    let output = "";
    let signaled = false;

    while (true) {
      if (this.waitingFor) {
        const closeTag = this.waitingFor;
        const idx = this.buffer.indexOf(closeTag);
        if (idx === -1) {
          // No close tag yet — drop content but keep enough trailing chars
          // in case the close tag is splitting across the next chunk.
          const keep = partialTagSuffix(this.buffer, closeTag);
          this.buffer = this.buffer.slice(this.buffer.length - keep);
          break;
        }
        this.buffer = this.buffer.slice(idx + closeTag.length);
        this.waitingFor = null;
        continue;
      }

      // NORMAL state: find the earliest open block tag or <ready/>.
      let earliestIdx = -1;
      let matchedOpen: string | null = null;
      let matchedClose: string | null = null;
      let isReady = false;

      for (const tag of BLOCK_TAGS) {
        const idx = this.buffer.indexOf(tag.open);
        if (idx !== -1 && (earliestIdx === -1 || idx < earliestIdx)) {
          earliestIdx = idx;
          matchedOpen = tag.open;
          matchedClose = tag.close;
          isReady = false;
        }
      }

      const idxReady = this.buffer.indexOf(READY);
      if (idxReady !== -1 && (earliestIdx === -1 || idxReady < earliestIdx)) {
        earliestIdx = idxReady;
        matchedOpen = READY;
        matchedClose = null;
        isReady = true;
      }

      if (earliestIdx === -1) {
        // No complete tag visible. Emit everything except any trailing
        // partial-tag suffix, and keep that suffix buffered.
        const keep = maxPartialSuffix(this.buffer, [...ALL_OPENS, READY]);
        output += this.buffer.slice(0, this.buffer.length - keep);
        this.buffer = this.buffer.slice(this.buffer.length - keep);
        break;
      }

      output += this.buffer.slice(0, earliestIdx);
      this.buffer = this.buffer.slice(earliestIdx + matchedOpen!.length);

      if (isReady) {
        if (!this.ready) {
          this.ready = true;
          signaled = true;
        }
      } else {
        this.waitingFor = matchedClose;
      }
    }

    // Suppress any leading whitespace until we've emitted real content.
    // This hides the newlines that typically follow a stripped <thinking>
    // or <analysis> block at the start of the model's response.
    if (!this.hasEmittedContent && output.length > 0) {
      output = output.replace(/^\s+/, "");
      if (output.length > 0) this.hasEmittedContent = true;
    }

    return { text: output, readySignaled: signaled };
  }

  /**
   * Flush any buffered text once the stream has fully ended. If we ended
   * inside an unclosed reasoning block (malformed output), drop it.
   */
  flush(): string {
    if (this.waitingFor) {
      this.buffer = "";
      return "";
    }
    let out = this.buffer;
    this.buffer = "";
    if (!this.hasEmittedContent) {
      out = out.replace(/^\s+/, "");
      if (out.length > 0) this.hasEmittedContent = true;
    }
    return out;
  }

  get isReady(): boolean {
    return this.ready;
  }
}
