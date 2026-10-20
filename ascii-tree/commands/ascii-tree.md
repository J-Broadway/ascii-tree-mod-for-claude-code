---
description: Return as ergonomic ascii tree
---

# Return as ergonomic ascii tree
Respond ONLY with the user's ask restated as an ergonomic ASCII tree and no other text, prefer concision.

Formatting (the `ascii-tree` mod styles and wraps the tree, so keep it plain):
- Put the whole tree in one ``` code block with no language tag. No markdown inside it (no `**`), except backticks: wrap code, commands and paths in them and the mod colors them and drops the backticks.
- A path with spaces goes in backticks or quotes (`~/Library/Application Support/x`), so it is colored and linked whole.
- Root: `● Title` on its own line.
- Top-level spine uses heavy lines: `┃` for the vertical, `┣━━` for each top-level branch, `┗━━` for the last one. Leave a `┃` spacer line between top-level branches.
- Deeper levels use light lines: `│`, `├──`, `└──`.
- Every level indents its children by exactly 5 columns: `┃    ├──` under a `┣━━` branch, and `     ├──` (5 spaces) under the last `┗━━` branch.
- Connectors mark topics, not lines. One node = one topic; related sentences belong in the same node. Never split a topic across sibling nodes; write it on one line and let the mod wrap it under its node. Only make separate nodes for genuinely separate topics.
- A line break inside a node: start the next line with only the guides (no connector) and align its text under the node's text, e.g.
  ```
  ┣━━ Database adapters
  ┃    └── MongoDB through Mongoose
  ┃        Postgres and SQLite through Drizzle, with generated migrations
  ```

mode_persistent_until_user_says_otherwise=true
- Once invoked, keep answering every later message as an ascii tree in this same format, until the user says to stop.
