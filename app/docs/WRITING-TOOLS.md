# Writing tools: connection preparation

No provider accounts are connected. The sparkle button opens the assistant/originality panel. It offers summary, explanation and clarity suggestions once an administrator configures OpenAI. Until then the assistant is disabled. Similarity scanning and AI detection are explicitly unavailable; they need a separate provider implementation and account, not just an OpenAI key.

The status report includes saved document ID/version, timestamp and SHA-256 of saved Markdown. Both detection scores are null and statuses are `not_scanned`. It is a readiness record, not an anti-plagiarism certificate. Users may download JSON or use Print / Save PDF in their browser. Reports never claim that a scan occurred. Unsaved editor changes are not included.

## Enabling the assistant later

Configure `OPENAI_API_KEY` and `OPENAI_MODEL` securely in the server environment, then restart. The model must support the Responses API. No model is selected automatically and there is no API key input in the browser. Never commit keys. The app does not automatically load `.env`; use your deployment's secret settings or environment configuration. No live API call has been made during implementation; automated adapter tests use a test-only response.

Only document owners can send saved text externally, and each request requires an explicit sharing checkbox. Inputs are limited to 20,000 characters, output to 1,000 tokens, calls to 10 per 15 minutes per IP, and provider timeout to 30 seconds. Set provider-side spending limits before enabling service. These limits bound individual use, not total expenditure across all users.

The adapter posts to the [OpenAI Responses API](https://developers.openai.com/api/reference/typescript/resources/responses/methods/create), using `store:false`. This setting is not a promise of zero provider retention; review provider data policies before sending sensitive material. No conversation history is sent. Suggestions are rendered as plain text and never modify the document automatically. Document versions and access are validated. Responses are not persisted by MarkSync.

## Connecting originality checks later

Select a provider and confirm its price, covered sources, retention/indexing policies and supported languages. Then implement its authenticated scan submission, signed callback/polling flow, per-document report storage and source-match rendering. Tie every result to an immutable saved-content hash/version; label older results when the document changes. Require explicit external-sharing consent and enforce document permissions for every report request. Keep similarity and AI-writing assessments separate. Do not invent scores or use a language model to certify authorship.

Current limitations: no external plagiarism search, no AI-writing detection, no provider scan callbacks, no completed scan reports. PDF export uses the user's browser print workflow. API integration is tested with mocks but needs a real-account smoke test after configuration. These additions do not establish Task 2 assessment compliance.
