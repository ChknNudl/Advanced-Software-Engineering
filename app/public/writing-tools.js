const $ = (id) => document.getElementById(id);
export function setupWritingTools({ api, getContext }) {
  const host = document.createElement('div');
  host.id = 'writing-host';
  host.innerHTML = `<dialog id="writing-dialog" class="community-dialog" aria-labelledby="writing-heading"><div class="community-top"><div><p class="eyebrow">WRITING TOOLS</p><h2 id="writing-heading">Assistant & originality</h2></div><button type="button" class="icon-close" id="writing-close" aria-label="Close writing tools">×</button></div><p id="writing-context" class="muted"></p><section class="profile-section writing-controls"><h3>AI assistant</h3><p id="ai-status" role="status">Checking connection…</p><label>Help me…<select id="ai-action"><option value="summarise">Summarise this document</option><option value="explain">Explain the main ideas</option><option value="clarity">Improve clarity and structure</option></select></label><label class="check-row"><input id="ai-consent" type="checkbox" /> Send this saved document to OpenAI. I have permission to share its content.</label><p class="muted">Suggestions only; nothing is inserted automatically. Review before using. API usage is billed separately by the provider.</p><button id="ai-run" class="primary" disabled>Ask assistant</button><p id="ai-feedback" role="status"></p><pre id="ai-output"></pre></section><section class="profile-publications"><h3>Originality report</h3><p>Similarity checker: <strong>Not connected</strong><br />AI-writing detector: <strong>Not connected</strong></p><p class="muted">No scan is performed and no scores are generated. AI detection cannot establish authorship; similarity requires human review.</p><div class="dialog-actions writing-controls"><button id="report-show">Prepare status report</button><button id="report-print" disabled>Print / Save PDF</button><button id="report-json" disabled>Download JSON</button></div><article id="writing-report" hidden></article></section><p id="writing-error" role="alert"></p></dialog>`;
  document.body.append(host);
  const button = document.createElement('button');
  button.id = 'open-writing';
  button.className = 'text-button writing-button';
  button.textContent = '✧';
  button.title = 'AI assistant & originality';
  button.setAttribute('aria-label', button.title);
  $('open-comments').before(button);
  let target,
    version,
    enabled = false,
    report,
    epoch = 0;
  const update = () => {
    $('ai-run').disabled = !enabled || !$('ai-consent').checked;
  };
  $('ai-consent').onchange = update;
  $('writing-close').onclick = () => $('writing-dialog').close();
  $('writing-dialog').addEventListener('close', () => {
    ++epoch;
  });
  button.onclick = async () => {
    const context = getContext();
    if (!context.current) return;
    const token = ++epoch;
    target = context.current.id;
    version = context.current.version;
    enabled = false;
    report = null;
    $('ai-consent').checked = false;
    update();
    $('ai-feedback').textContent = '';
    $('ai-output').textContent = '';
    $('writing-error').textContent = '';
    $('writing-report').hidden = true;
    $('report-print').disabled = true;
    $('report-json').disabled = true;
    $('writing-context').textContent =
      `${context.current.title} · saved version ${version}`;
    $('ai-status').textContent = 'Checking connection…';
    $('writing-dialog').showModal();
    try {
      const status = await api(`/documents/${target}/writing/status`);
      if (token !== epoch) return;
      enabled = status.assistant && context.current.canManage && context.saved;
      $('ai-status').textContent = !status.assistant
        ? 'Not connected. An administrator must configure the AI provider.'
        : !context.current.canManage
          ? 'Only the document owner can use external AI.'
          : !context.saved
            ? 'Save your title and wait for text to sync, then reopen this window.'
            : 'OpenAI connected. Review the sharing choice below.';
      update();
    } catch (e) {
      if (token === epoch) $('writing-error').textContent = e.message;
    }
  };
  $('ai-run').onclick = async () => {
    const token = epoch;
    $('ai-run').disabled = true;
    $('ai-feedback').textContent = 'Preparing suggestions…';
    try {
      const result = await api(`/documents/${target}/writing/assist`, 'POST', {
        action: $('ai-action').value,
        version,
        consent: $('ai-consent').checked,
      });
      if (token !== epoch) return;
      $('ai-output').textContent = result.text;
      $('ai-feedback').textContent =
        `Suggestions for saved version ${result.version}. Review for accuracy.`;
    } catch (e) {
      if (token === epoch) $('ai-feedback').textContent = e.message;
    } finally {
      if (token === epoch) {
        $('ai-consent').checked = false;
        update();
      }
    }
  };
  $('report-show').onclick = async () => {
    const token = epoch;
    try {
      const result = await api(`/documents/${target}/writing/report`);
      if (token !== epoch) return;
      report = result;
      const box = $('writing-report');
      box.replaceChildren();
      for (const [tag, text] of [
        ['h2', 'Originality status — NOT SCANNED'],
        ['p', report.title],
        [
          'p',
          `Document ${report.documentId} · version ${report.version} · ${report.createdAt}`,
        ],
        [
          'p',
          'Similarity: not scanned. AI writing: not scanned. No scores available.',
        ],
        ['p', report.limitations],
        ['p', `Saved-content SHA-256: ${report.contentHash}`],
      ]) {
        const el = document.createElement(tag);
        el.textContent = text;
        box.append(el);
      }
      box.hidden = false;
      $('report-print').disabled = false;
      $('report-json').disabled = false;
    } catch (e) {
      if (token === epoch) $('writing-error').textContent = e.message;
    }
  };
  $('report-json').onclick = () => {
    if (!report) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `originality-status-${report.documentId}-v${report.version}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  $('report-print').onclick = () => {
    if (report) {
      document.body.classList.add('printing-report');
      window.print();
      document.body.classList.remove('printing-report');
    }
  };
}
