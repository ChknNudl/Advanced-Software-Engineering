# Task 3: Formal Specification & Verification

**Weighting:** 20% of the total coursework mark.
**Deadline:** Friday, 11 December 2026, at 16:00.
**Submission:** GitHub tag by email.

## 1. Task Context

Testing can only demonstrate the presence of bugs, not their absence. To mathematically verify the core safety invariants of your synchronisation protocol, you must model its state machine using formal methods.

In this task, you will use a formal specification language ([TLA+](https://lamport.azurewebsites.net/tla/tla.html) or [Alloy](https://alloytools.org/)) to abstract your real-time protocol and formally verify its invariants. You will utilise LLMs as a translation layer to help convert your plain-English protocol rules into formal mathematical models, critically evaluating where the LLM succeeds or fails in capturing formal logic.

## 2. Requirements

### Part A: Formal Model Construction

- **System Abstraction:** Model the core logic of your synchronisation layer using TLA+ or Alloy.
  - If you wrote a bespoke sync engine: Model the mathematical conflict-resolution rules (e.g., your custom OT transformations).
  - If you used an off-the-shelf library (e.g., Yjs, ShareDB): Model the system-level message-passing protocol—how clients connect, exchange state vectors, queue offline edits, and handle WebSocket reconnects.
- **State Transitions:** Do not model actual strings of text. Model abstract causal tokens, node IDs, clocks/counters, and the message queues governing your network transitions.

### Part B: Model Checking & Invariant Proofs

- **Safety Invariants:** Specify mathematical invariants that must hold true. At a minimum, model:
  - **Monotonicity:** Clocks/counters never decrease.
  - **Convergence:** If two nodes have received the same set of operations, their resulting states are identical.
- **Verification:** Run a model checker (e.g., TLC for TLA+) against a bounded model (e.g., 3 nodes, max clock of 5).
- **Counter-Example Resolution:** If the checker finds a trace that breaks your invariants, fix your model (and potentially the real codebase if it reflects a true protocol flaw).

### Part C: AI Translation Critique

Write a short report (approx. 1 page) analysing your experience using an LLM to generate formal specifications. Did the LLM understand causality and concurrency, or did it struggle with the rigid mathematical syntax?

If the AI generated flaws, explain what they were and how you fixed them. If the AI performed perfectly, document the specific prompts you used and evaluate why this abstract modelling task was easier for the AI than generating the executable, asynchronous network logic in Task 2.

## 3. Deliverables & Submission

- **GitHub Tag:** Tag the final commit containing your model files (e.g., `task3`).
- **Email Submission (One per group):**
  - The commit tag as explained above.
  - Your formal specification files (e.g., `.tla`, `.cfg`, or `.als`).
  - A PDF report containing:
    - An explanation of your formal abstractions.
    - Output logs from the model checker proving your invariants hold.
    - The AI Translation Critique.
