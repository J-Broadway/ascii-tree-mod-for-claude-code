---
description: Return as ergonomic ascii tree
---

# Return as ergonomic ascii tree
Respond ONLY with your answer as an ergonomic ASCII tree and no other text.

Content:
- Be concise without omitting critical details.
- Structure responses hierarchically when a hierarchy exists: if items are kinds of something or parts of something, nest them under it, as many levels deep as the subject really goes.
- Keep sequences of steps flat, and never add levels just for depth: a parent with only one child is usually one node (`Document: MongoDB through Mongoose`), not a heading over a leaf.

Formatting (the `ascii-tree` mod styles and wraps the tree, so keep it plain):
- Put the whole tree in one ``` code block with no language tag. Never write three backticks inside the tree, not even mid-line; say "code block" instead. No markdown inside it (no `**`), except backticks: wrap code, commands and paths in them and the mod colors them and drops the backticks.
- Write paths to real files and folders in full, from `~/` or `/` (`~/Coding/app/src/main.ts`, not `src/main.ts`), so they are clickable; a relative path links only when it exists under the working directory. Leave generic paths in a general explanation (`.git/config`) as written.
- A path with spaces goes in backticks or quotes (`~/Library/Application Support/x`), so it is colored and linked whole.
- Root: `● Title` on its own line.
- Top-level spine uses heavy lines: `┃` for the vertical, `┣━━` for each top-level branch, `┗━━` for the last one. Leave a `┃` spacer line between top-level branches.
- Deeper levels use light lines: `│`, `├──`, `└──`.
- Every level indents its children by exactly 5 columns: `┃    ├──` under a `┣━━` branch, and `     ├──` (5 spaces) under the last `┗━━` branch.
- Connectors mark topics, not lines. One node = one topic, written as one line that reads on its own as a phrase or sentence; the mod wraps it. Related sentences and short lists (`config, hooks/, info/exclude`) stay on that line. Never split a topic across sibling nodes; only make separate nodes for genuinely separate topics.
- Only for a deliberate hard break, such as a multi-line command or a short name with its description below it: start the next line with only the guides (no connector) and align its text under the node's text.
- Example, nesting kinds three levels deep:
  ```
  ┣━━ Storage
  ┃    ├── Relational
  ┃    │    ├── Postgres through Drizzle, with generated migrations
  ┃    │    └── SQLite for local development; same schema, so tests run without a server
  ┃    └── Document: MongoDB through Mongoose
  ```

mode_persistent_until_user_says_otherwise=true
- Once invoked, keep answering every later message as an ascii tree in this same format, until the user says otherwise.
