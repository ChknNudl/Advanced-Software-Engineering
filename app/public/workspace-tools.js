const $ = (id) => document.getElementById(id);
const node = (tag, text, className) => {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
};
export function setupWorkspaceTools({
  api,
  getContext,
  searchItems,
  navigate,
}) {
  const host = node('div');
  host.innerHTML = `<dialog id="quick-dialog" aria-labelledby="quick-heading"><div class="community-top"><h2 id="quick-heading">Go to…</h2><button type="button" class="icon-close" aria-label="Close quick search" data-tool-close="quick-dialog">×</button></div><label>Search your workspace<input id="quick-query" type="search" placeholder="Documents, projects or folders" autocomplete="off" /></label><p class="muted">Tab through results · Enter to open · Esc to close</p><div id="quick-results" aria-live="polite"></div></dialog>
  <dialog id="comments-dialog" class="community-dialog" aria-labelledby="comments-heading"><div class="community-top"><div><p class="eyebrow">DISCUSSION</p><h2 id="comments-heading">Comments</h2></div><button type="button" class="icon-close" aria-label="Close comments" data-tool-close="comments-dialog">×</button></div><p class="muted">Comments keep a quote of the original passage, even if the document changes later.</p><form id="comment-form"><blockquote id="comment-quote"></blockquote><label>Your comment<textarea id="comment-body" maxlength="2000" required placeholder="Share feedback or ask a question…"></textarea></label><button class="primary">Add comment</button></form><p id="comments-hint" class="muted"></p><p id="comments-error" role="alert"></p><div id="comments-list"></div></dialog>`;
  document.body.append(host);
  for (const b of host.querySelectorAll('[data-tool-close]'))
    b.onclick = () => $(b.dataset.toolClose).close();
  const quick = node('button', '⌕  Quick search', 'nav-button');
  quick.id = 'quick-search';
  quick.title = 'Search workspace (Ctrl+K / Cmd+K)';
  $('home').after(quick);
  async function openSearch() {
    if (!getContext().user) return;
    $('quick-dialog').showModal();
    $('quick-query').value = '';
    $('quick-query').focus();
    renderSearch();
  }
  function renderSearch() {
    const query = $('quick-query').value.trim().toLowerCase();
    const list = $('quick-results');
    list.replaceChildren();
    const items = searchItems()
      .filter((item) => item.name.toLowerCase().includes(query))
      .slice(0, 30);
    for (const item of items) {
      const button = node('button', undefined, 'quick-result');
      button.append(node('span', item.name), node('small', item.kind));
      button.onclick = async () => {
        $('quick-dialog').close();
        try {
          await navigate(item);
        } catch (error) {
          $('notice').textContent = error.message;
        }
      };
      list.append(button);
    }
    if (!items.length) list.append(node('p', 'No matching items.', 'muted'));
  }
  quick.onclick = openSearch;
  $('quick-query').oninput = renderSearch;
  document.addEventListener('keydown', (event) => {
    if (
      (event.ctrlKey || event.metaKey) &&
      event.key.toLowerCase() === 'k' &&
      getContext().user &&
      !document.querySelector('dialog[open]')
    ) {
      event.preventDefault();
      openSearch();
    }
  });
  const comment = node('button', '◻', 'text-button comment-button');
  comment.id = 'open-comments';
  comment.title = 'Comments — select text in edit mode to add one';
  comment.setAttribute('aria-label', 'Comments');
  $('download').before(comment);
  let target,
    selection,
    timer,
    generation = 0;
  let previousComments = null;
  async function loadComments() {
    const token = ++generation;
    try {
      const items = await api(`/documents/${target}/comments`);
      if (token !== generation || !$('comments-dialog').open) return;
      const signature = JSON.stringify(items);
      if (signature === previousComments) return;
      previousComments = signature;
      const { current, user } = getContext();
      const list = $('comments-list');
      list.replaceChildren();
      if (!items.length)
        list.append(
          node(
            'p',
            'No comments yet. Select a passage in edit mode to start a discussion.',
            'muted',
          ),
        );
      for (const item of items) {
        const card = node('section', undefined, 'comment-card');
        card.append(
          node('strong', item.authorName),
          node(
            'small',
            `${item.created_at} UTC · version ${item.version}${item.resolved ? ' · Resolved' : ''}`,
          ),
          node('blockquote', item.quote),
          node('p', item.body),
        );
        if (
          current?.role !== 'read' &&
          (item.author === user?.id || current?.canManage)
        ) {
          const button = node('button', item.resolved ? 'Reopen' : 'Resolve');
          button.onclick = async () => {
            button.disabled = true;
            try {
              await api(`/documents/${target}/comments/${item.id}`, 'PATCH', {
                resolved: !item.resolved,
              });
              await loadComments();
            } catch (error) {
              $('comments-error').textContent = error.message;
              button.disabled = false;
            }
          };
          card.append(button);
        }
        list.append(card);
      }
    } catch (error) {
      if (token !== generation) return;
      $('comments-error').textContent = error.message;
      if ([401, 404].includes(error.status)) {
        $('comments-list').replaceChildren();
        $('comment-form').hidden = true;
        clearInterval(timer);
      }
    }
  }
  comment.onclick = () => {
    const { current, ready, pending, editing } = getContext();
    if (!current) return;
    target = current.id;
    previousComments = null;
    const input = $('markdown'),
      start = input.selectionStart,
      end = input.selectionEnd;
    selection =
      ready &&
      !pending &&
      editing &&
      current.role !== 'read' &&
      end > start &&
      end - start <= 2000
        ? { start, end, version: current.version }
        : null;
    $('comment-form').hidden = !selection;
    $('comment-quote').textContent = selection
      ? input.value.slice(start, end)
      : '';
    $('comment-body').value = '';
    $('comments-error').textContent = '';
    $('comments-list').replaceChildren();
    $('comments-hint').textContent = selection
      ? ''
      : 'To add a comment, select up to 2,000 characters in the Markdown editor and wait for text to sync.';
    $('comments-dialog').showModal();
    loadComments();
    clearInterval(timer);
    timer = setInterval(loadComments, 5000);
  };
  $('comments-dialog').addEventListener('close', () => {
    clearInterval(timer);
    ++generation;
  });
  $('comment-form').onsubmit = async (event) => {
    event.preventDefault();
    const button = event.target.querySelector('button');
    button.disabled = true;
    try {
      await api(`/documents/${target}/comments`, 'POST', {
        ...selection,
        body: $('comment-body').value,
      });
      $('comment-body').value = '';
      $('comment-form').hidden = true;
      $('comments-hint').textContent =
        'Comment added. Close this window to select another passage.';
      await loadComments();
    } catch (error) {
      $('comments-error').textContent = error.message;
    } finally {
      button.disabled = false;
    }
  };
  const avatars = node('div', undefined, 'collaborator-avatars');
  avatars.setAttribute('aria-label', 'Online collaborators');
  $('presence').before(avatars);
  return {
    presence(users) {
      avatars.replaceChildren();
      for (const user of users.slice(0, 5)) {
        const avatar = node(
          'span',
          user.name
            .split(/\s+/)
            .map((p) => p[0])
            .slice(0, 2)
            .join('')
            .toUpperCase(),
          'collaborator-avatar',
        );
        avatar.title = user.name + ' · online';
        avatar.setAttribute('aria-label', avatar.title);
        avatars.append(avatar);
      }
      if (users.length > 5)
        avatars.append(
          node('span', `+${users.length - 5}`, 'collaborator-avatar'),
        );
    },
  };
}
