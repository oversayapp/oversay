# Adding to a deck

The person asked: "Add 'paired with Ana on the rollout plan' to yesterday in my Weekly standup deck, and add this:"

```markdown
### Release on Friday (5 min)
* Freeze at noon
* Ana runs the checklist
    * Rollback script tested on staging
```

`before.md` is the deck as it was, and `after.md` is the deck afterwards. Every line of `before.md` is still there, unchanged and in order.

- The new point went after the last point under "Yesterday", with the same `- ` marker.
- The pasted section became a new `## ` card at the end. Its `###` heading became `##`, "(5 min)" became the card time `[5m]`, and its `*` items became `- ` points, with the sub-point indented two spaces.
- The `>` line stayed where it was.
