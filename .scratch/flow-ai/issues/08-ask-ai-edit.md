# 08: Ask AI to edit a Flow

**What to build:** The user types a change ("add a QA check before Finance") and sees a preview: new shapes highlighted, removed ones struck through, changed text marked. Accept or Discard.

**Blocked by:** 06: Generate a swimlane Flow from a brief (better after 07 so it also covers the free canvas)

**Status:** done on branch `feat/ai-flows` for swimlane flows (re-check when ticket 07 adds the free canvas)

- [x] Preview diff against the current Flow
- [x] Accept goes through apply/undo and Removed; Discard changes nothing
- [x] API failure leaves the Flow untouched and shows the reason
