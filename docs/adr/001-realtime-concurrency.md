# ADR 001: Real-Time Concurrency Architecture

## Status

Proposed

## Context

MarkSync needs multiple users to edit the same Markdown document at once, with the document staying consistent despite conflicting edits and dropped packets.

Options to analyse:

- **CRDTs** (e.g. Yjs, Automerge) vs **Operational Transformation** (e.g. ShareDB) for collaborative Markdown editing.
- **Network topology:** client-server with an authoritative relay vs peer-to-peer (WebRTC) with cloud fallback.

(Trade-off analysis to be written by the team.)

## Decision

TBD

## Consequences

TBD

## AI Prompt Appendix

### Prompts used

1. (Paste each prompt used with an LLM to explore this decision.)

### Critical commentary

(One paragraph: where did the AI offer sound architectural insight, and where was its advice superficial or unrealistic?)
