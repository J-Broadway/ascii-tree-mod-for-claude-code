---
description: Return as ergonomic ascii tree
---

# Return as ergonomic ascii tree
Respond ONLY with your answer as an ergonomic ASCII tree and no other text, except the command blocks described below.

Content:
- Be concise, as short as possible, without omitting critical details.
- The ascii-tree is like a grapevine of nodes which branch out to its related conceptual connections
- Structure responses hierarchically when a hierarchy exists: if items are kinds of something or parts of something, nest them under it, as many levels deep as the subject really goes.
- Lists contained in nodes shall always generate a new node


Formatting (the `ascii-tree` mod styles and wraps the tree, so keep it plain):
- Put the whole tree in one ``` code block with no language tag. Never write three backticks inside the tree, not even mid-line; say "code block" instead. No markdown inside it (no `**`), except backticks: wrap code, commands and paths in them and the mod colors them and drops the backticks.
- Write paths to real files and folders in full, from `~/` or `/` (`~/Coding/app/src/main.ts`, not `src/main.ts`), so they are clickable; a relative path links only when it exists under the working directory. Leave generic paths in a general explanation (`.git/config`) as written.
- A path with spaces goes in backticks or quotes (`~/Library/Application Support/x`), so it is colored and linked whole.
- Commands for the user to run go after the tree, not in it, so they copy without the tree's lines: one code block with a language tag (`sh`, `bash`, ...) right after the tree's code block, all the commands in run order, nothing else after it. In the tree, say what they do and refer to them ("run the commands below"). Short commands named in passing, not meant to be copied (`git status`), stay inline in backticks.
- Root: `● Title` on its own line.
- Top-level spine uses heavy lines: `┃` for the vertical, `┣━━` for each top-level branch, `┗━━` for the last one. Leave a `┃` spacer line between top-level branches.
- Deeper levels use light lines: `│`, `├──`, `└──`.
- Every level indents its children by exactly 5 columns: `┃    ├──` under a `┣━━` branch, and `     ├──` (5 spaces) under the last `┗━━` branch.
- Connectors mark topics, not lines. One node = one topic, written as one line that reads on its own as a phrase or sentence; the mod wraps it. Related sentences and short lists (`config, hooks/, info/exclude`) stay on that line. Never split a topic across sibling nodes; only make separate nodes for genuinely separate topics.
- Only for a deliberate hard break, such as a multi-line command or a short name with its description below it: start the next line with only the guides (no connector) and align its text under the node's text.
- Example, grouping parts, stages and kinds, each as deep as the subject goes:
  ```
  ● Neuron
  ┣━━ Structure
  ┃    ├── Soma (cell body): holds the nucleus and sums incoming signals
  ┃    ├── Dendrites
  ┃    │    ├── Branches carry signals toward the soma
  ┃    │    └── Dendritic spines receive most excitatory synapses
  ┃    └── Axon
  ┃         ├── Axon hillock, where action potentials start
  ┃         ├── Myelin sheath
  ┃         │    ├── Made by oligodendrocytes in the brain and Schwann cells in nerves
  ┃         │    └── Nodes of Ranvier: gaps the signal jumps between, speeding conduction
  ┃         └── Axon terminals end in synapses with the next cell
  ┃
  ┣━━ Signaling
  ┃    ├── Resting potential: about −70 mV, held by the sodium-potassium pump
  ┃    ├── Action potential
  ┃    │    ├── Depolarization: sodium channels open and Na⁺ rushes in
  ┃    │    ├── Repolarization: potassium channels open and K⁺ flows out
  ┃    │    └── Refractory period: the membrane can't fire again yet, so the signal only moves forward
  ┃    └── Synapses
  ┃         ├── Chemical: vesicles release neurotransmitters across the cleft
  ┃         │    ├── Excitatory, such as glutamate, push the next neuron toward firing
  ┃         │    └── Inhibitory, such as GABA, hold it back
  ┃         └── Electrical: gap junctions pass current directly; faster but less common
  ┃
  ┗━━ Types
       ├── Sensory neurons: Carry signals from receptors to the brain and spinal cord
       ├── Interneurons: Connect neurons within the brain and spinal cord
       └── Motor neurons: Carry commands out to muscles and glands
  ```

mode_persistent_until_user_says_otherwise=true
- Once invoked, keep answering every later message as an ascii tree in this same format, until the user says otherwise.
