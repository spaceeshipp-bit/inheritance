// What Grandma is told when the server turns down a change to the will
// (`will-rejected`). One line per reason code the server sends (server/match.ts
// and shared/will.ts), in the game's voice; never the bare code.

/** Every reason code the server sends with `will-rejected`. */
export const REJECT_REASONS = [
  'budget', 'rolling', 'zero-needs-parchment', 'no-room', 'unknown-target', 'no-op',
  'not-now', 'needs-parchment', 'frozen', 'rejected',
] as const;

const TEXT: Record<string, (parchmentKey: string) => string> = {
  budget: () => "You've changed the will enough for one visit, dear.",
  rolling: () => 'Steady on. The quill needs a rest.',
  'zero-needs-parchment': (k) => `Cutting someone off entirely takes the full parchment (${k}).`,
  'no-room': () => "That share can't go any further.",
  'unknown-target': () => "Who? You don't recall a grandchild by that name.",
  'no-op': () => 'Nothing to change.',
  'not-now': () => 'Not now, dear. The will can wait for the next visit.',
  'needs-parchment': (k) => `Open the full parchment first (${k}).`,
  frozen: () => "You've had a fall. The will stands as it is.",
  rejected: () => "The quill won't have it.",
};

/**
 * The line for a rejection reason. `pad`: name the controller's button for the
 * parchment instead of Tab. Unknown codes get the generic line, never the code.
 */
export function rejectText(reason: string, pad = false): string {
  const f = Object.hasOwn(TEXT, reason) ? TEXT[reason] : TEXT.rejected;
  return f(pad ? 'View' : 'Tab');
}
