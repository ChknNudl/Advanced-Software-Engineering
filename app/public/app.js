import * as Y from 'yjs';
const $ = (id) => document.getElementById(id);
let signup = false,
  current = null,
  documents = [],
  projects = [],
  folders = [];
let editing = false,
  signedIn = false,
  dirty = false,
  titleDirty = false,
  trash = false;
let socket, reconnect, heartbeat, previewTimer, ydoc;
let previewSequence = 0,
  openSequence = 0,
  reconnectDelay = 1000,
  sequence = 0;
let ready = false,
  composing = false,
  deferred = [];
const pending = new Map();
let invitation = new URLSearchParams(location.hash.slice(1)).get('invite');
let shareTarget, creating, activeUser;
const canEdit = () => current && ['owner', 'edit'].includes(current.role);
const encode = (data) => {
  let text = '';
  for (const byte of data) text += String.fromCharCode(byte);
  return btoa(text);
};
const decode = (data) => Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
async function api(path, method = 'GET', body) {
  const res = await fetch('/api' + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = await res.json();
  if (!res.ok) {
    const error = new Error(result.error ?? 'Request failed.');
    error.status = res.status;
    throw error;
  }
  return result;
}
function notice(error) {
  $('notice').textContent = error.message;
}
function discard() {
  return (
    !dirty ||
    confirm(
      'You have unsaved changes. Download your Markdown before leaving. Leave this document?',
    )
  );
}
function status() {
  dirty = titleDirty || pending.size > 0;
  $('save-state').textContent = pending.size
    ? 'Syncing text…'
    : titleDirty
      ? 'Text synced · title not saved'
      : `Saved · version ${current?.version ?? 1}`;
}
function setEditing(value) {
  editing = !!value && !!canEdit();
  $('document-heading').textContent = $('title').value;
  $('document-heading').hidden = editing;
  $('editor').classList.toggle('editing', editing);
  $('source-pane').hidden = !editing;
  $('save').hidden = !editing;
  $('title').readOnly = !editing;
  $('markdown').readOnly = !editing || !ready;
  $('edit-mode').disabled = !canEdit();
  $('edit-mode').textContent = editing ? 'Read document' : 'Edit document';
  $('edit-mode').setAttribute('aria-pressed', String(editing));
}
function contents() {
  $('contents-links').replaceChildren();
  $('preview')
    .querySelectorAll('h1,h2,h3')
    .forEach((heading, index) => {
      heading.id = 'section-' + index;
      const link = document.createElement('a');
      link.href = '#section-' + index;
      link.textContent = heading.textContent;
      link.className = heading.tagName.toLowerCase();
      $('contents-links').append(link);
    });
  if (!$('contents-links').childElementCount)
    $('contents-links').textContent =
      'Add Markdown headings to organise this document.';
}
async function preview() {
  const seq = ++previewSequence;
  try {
    const result = await api('/preview', 'POST', {
      markdown: $('markdown').value,
    });
    if (seq === previewSequence) {
      $('preview').innerHTML = result.html;
      contents();
    }
  } catch (error) {
    if (seq === previewSequence) notice(error);
  }
}
function schedulePreview() {
  clearTimeout(previewTimer);
  ++previewSequence;
  previewTimer = setTimeout(preview, 180);
}
function stopSocket() {
  ready = false;
  clearTimeout(reconnect);
  clearInterval(heartbeat);
  if (socket) {
    socket.onclose = null;
    socket.onmessage = null;
    socket.onopen = null;
    socket.close();
    socket = null;
  }
}
function flush() {
  if (ready && socket?.readyState === WebSocket.OPEN && canEdit())
    for (const [seq, update] of pending)
      socket.send(JSON.stringify({ type: 'update', seq, update }));
}
function sync(message) {
  if (!current || !ydoc) return;
  const text = ydoc.getText('markdown');
  const start = Y.createRelativePositionFromTypeIndex(
    text,
    Math.min($('markdown').selectionStart, text.length),
  );
  const end = Y.createRelativePositionFromTypeIndex(
    text,
    Math.min($('markdown').selectionEnd, text.length),
  );
  Y.applyUpdate(ydoc, decode(message.update), 'remote');
  $('markdown').value = text.toString();
  const a = Y.createAbsolutePositionFromRelativePosition(start, ydoc),
    b = Y.createAbsolutePositionFromRelativePosition(end, ydoc);
  if (a && b) $('markdown').setSelectionRange(a.index, b.index);
  current.version = message.version;
  current.role = message.role;
  if (!titleDirty) {
    current.title = message.title;
    $('title').value = message.title;
    $('document-heading').textContent = message.title;
  }
  if (message.ack !== undefined) pending.delete(message.ack);
  const first = !ready;
  ready = true;
  $('access-label').textContent =
    current.role === 'read'
      ? 'Read only'
      : current.role === 'owner'
        ? 'Owner'
        : 'Can edit';
  setEditing(editing);
  status();
  schedulePreview();
  if (first) flush();
}
function connect() {
  stopSocket();
  if (!current || !signedIn) return;
  $('presence').textContent = 'Connecting…';
  $('heartbeat').textContent = 'Waiting for two-way heartbeat…';
  $('markdown').readOnly = true;
  const ws = new WebSocket(
    `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`,
  );
  socket = ws;
  ws.onopen = () => {
    reconnectDelay = 1000;
    ws.send(
      JSON.stringify({ type: 'join', documentId: current.id, live: true }),
    );
    heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ type: 'ping' }));
    }, 15000);
  };
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.type === 'sync') {
      if (composing) deferred.push(message);
      else sync(message);
    }
    if (message.type === 'presence')
      $('presence').textContent =
        `● ${message.users.length} online · ${message.users.map((u) => u.name).join(', ')}`;
    if (message.type === 'pong')
      $('heartbeat').textContent =
        `Two-way connection verified at ${new Date().toLocaleTimeString()}`;
    if (message.type === 'error') {
      ready = false;
      $('markdown').readOnly = true;
      notice(new Error(message.error));
    }
  };
  ws.onclose = (event) => {
    ready = false;
    clearInterval(heartbeat);
    $('markdown').readOnly = true;
    $('heartbeat').textContent = 'Connection paused';
    $('presence').textContent =
      'Offline · editing paused; your text remains here';
    if (event.code === 1008) {
      $('notice').textContent =
        'Access or session ended, or an edit limit was reached. Download any unsynced text, then sign in or reopen the document.';
      return;
    }
    if (signedIn && current) {
      reconnect = setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, 15000);
    }
  };
}
function initDocument() {
  ydoc?.destroy();
  ydoc = new Y.Doc();
  pending.clear();
  sequence = 0;
  deferred = [];
  composing = false;
  ydoc.on('update', (update, origin) => {
    if (origin !== 'local') return;
    const seq = ++sequence,
      data = encode(update);
    pending.set(seq, data);
    status();
    if (ready && socket?.readyState === WebSocket.OPEN)
      socket.send(JSON.stringify({ type: 'update', seq, update: data }));
  });
}
function options(select, items, empty, value = '') {
  select.replaceChildren(new Option(empty, ''));
  for (const item of items) select.add(new Option(item.name, String(item.id)));
  select.value = String(value ?? '');
}
function projectControls() {
  const id = Number($('project-filter').value),
    project = projects.find((p) => p.id === id);
  $('share-project').disabled = project?.role !== 'owner';
  $('new-folder').disabled = !project || project.role === 'read';
  const allowed = !project || project.role !== 'read';
  for (const id of ['new-document', 'header-create', 'empty-create'])
    $(id).disabled = !allowed || trash;
}
function folderOptions() {
  options(
    $('folder-filter'),
    folders.filter((f) => f.project_id === Number($('project-filter').value)),
    'All folders',
  );
  projectControls();
}
function renderList() {
  $('documents').replaceChildren();
  $('collection-label').textContent = trash ? 'TRASH' : 'DOCUMENTS';
  const query = $('search').value.toLowerCase(),
    project = Number($('project-filter').value),
    folder = Number($('folder-filter').value);
  const shown = documents.filter(
    (d) =>
      d.title.toLowerCase().includes(query) &&
      (!project || d.project_id === project) &&
      (!folder || d.folder_id === folder),
  );
  for (const doc of shown) {
    const button = document.createElement('button');
    button.className = `document-link ${current?.id === doc.id ? 'active' : ''}`;
    button.textContent = doc.title;
    const meta = document.createElement('small');
    meta.textContent = trash
      ? 'In Trash · click to restore'
      : `${doc.author_name} · ${doc.role === 'read' ? 'Read only' : doc.role === 'owner' ? 'Owner' : 'Can edit'}`;
    button.append(meta);
    button.onclick = () => {
      if (trash) {
        api(`/documents/${doc.id}/restore`, 'POST', {})
          .then(refreshList)
          .catch(notice);
      } else if (discard()) openDocument(doc.id).catch(notice);
    };
    $('documents').append(button);
  }
  if (!shown.length) {
    const p = document.createElement('p');
    p.className = 'muted';
    p.textContent = trash ? 'Trash is empty.' : 'No documents here yet.';
    $('documents').append(p);
  }
}
async function refreshList() {
  const selected = $('project-filter').value,
    folder = $('folder-filter').value;
  [documents, projects, folders] = await Promise.all([
    api(trash ? '/trash' : '/documents'),
    api('/projects'),
    api('/folders'),
  ]);
  options($('project-filter'), projects, 'All documents', selected);
  folderOptions();
  $('folder-filter').value = folder;
  renderList();
}
async function openDocument(id) {
  const seq = ++openSequence;
  const doc = await api(`/documents/${id}`);
  if (seq !== openSequence) return;
  stopSocket();
  current = doc;
  titleDirty = false;
  dirty = false;
  initDocument();
  $('empty').hidden = true;
  $('editor').hidden = false;
  $('title').value = doc.title;
  $('markdown').value = doc.markdown;
  $('share').disabled = !doc.canManage;
  for (const id of ['move-document', 'delete-document'])
    $(id).hidden = !doc.canManage;
  $('access-label').textContent =
    doc.role === 'read'
      ? 'Read only'
      : doc.role === 'owner'
        ? 'Owner'
        : 'Can edit';
  $('notice').textContent = '';
  $('conflict').hidden = true;
  setEditing(false);
  status();
  renderList();
  history.replaceState(null, '', '?document=' + doc.id);
  connect();
  await preview();
}
function home() {
  stopSocket();
  current = null;
  dirty = false;
  titleDirty = false;
  pending.clear();
  ydoc?.destroy();
  ydoc = null;
  ++openSequence;
  ++previewSequence;
  clearTimeout(previewTimer);
  $('editor').hidden = true;
  $('empty').hidden = false;
  $('share').disabled = true;
  $('edit-mode').disabled = true;
  history.replaceState(null, '', location.pathname);
}
async function createDocument() {
  if (!discard()) return;
  try {
    const doc = await api('/documents', 'POST', {
      title: 'Untitled document',
      markdown: '# A new beginning\n\nWrite something worth sharing.\n',
      projectId: Number($('project-filter').value) || null,
      folderId: Number($('folder-filter').value) || null,
    });
    await refreshList();
    await openDocument(doc.id);
    setEditing(true);
    $('title').focus();
    $('title').select();
  } catch (error) {
    notice(error);
  }
}
async function enter(user) {
  activeUser = user;
  signedIn = true;
  $('auth').hidden = true;
  $('workspace').hidden = false;
  $('user-name').textContent = user.name;
  if (invitation) {
    try {
      const grant = await api('/shares/redeem', 'POST', { token: invitation });
      invitation = null;
      history.replaceState(null, '', location.pathname);
      await refreshList();
      if (grant.scope === 'document') await openDocument(grant.target);
      else {
        $('project-filter').value = String(grant.target);
        folderOptions();
        renderList();
      }
      return;
    } catch (error) {
      invitation = null;
      history.replaceState(null, '', location.pathname);
      notice(error);
    }
  }
  await refreshList();
  const id = Number(new URLSearchParams(location.search).get('document'));
  if (Number.isSafeInteger(id) && id > 0) await openDocument(id).catch(notice);
}
$('auth-toggle').onclick = () => {
  signup = !signup;
  $('name-field').hidden = !signup;
  $('name-field').querySelector('input').required = signup;
  $('auth-heading').textContent = signup
    ? 'Make yourself at home.'
    : 'Welcome back.';
  $('auth-description').textContent = signup
    ? 'Create an account to join your team.'
    : 'Sign in to pick up where you left off.';
  $('auth-submit').textContent = signup ? 'Create account →' : 'Sign in →';
  $('auth-toggle').textContent = signup
    ? 'Already a member? Sign in'
    : 'New here? Create an account';
  $('password').autocomplete = signup ? 'new-password' : 'current-password';
  $('auth-error').textContent = '';
};
$('auth-form').onsubmit = async (event) => {
  event.preventDefault();
  $('auth-error').textContent = '';
  $('auth-submit').disabled = true;
  try {
    const user = await api(
      signup ? '/signup' : '/login',
      'POST',
      Object.fromEntries(new FormData(event.target)),
    );
    event.target.reset();
    await enter(user);
  } catch (error) {
    $('auth-error').textContent = error.message;
  } finally {
    $('auth-submit').disabled = false;
  }
};
$('logout').onclick = async () => {
  if (!discard()) return;
  try {
    try {
      await api('/logout', 'POST');
    } catch (error) {
      if (error.status !== 401) throw error;
    }
    signedIn = false;
    home();
    $('workspace').hidden = true;
    $('auth').hidden = false;
  } catch (error) {
    notice(error);
  }
};
$('home').onclick = () => {
  if (!discard()) return;
  home();
  trash = false;
  $('trash-view').textContent = 'Trash';
  $('project-filter').value = '';
  folderOptions();
  refreshList().catch(notice);
};
$('trash-view').onclick = () => {
  if (!discard()) return;
  home();
  trash = !trash;
  $('trash-view').textContent = trash ? 'Back to documents' : 'Trash';
  refreshList().catch(notice);
};
$('project-filter').onchange = () => {
  folderOptions();
  renderList();
};
$('folder-filter').onchange = renderList;
$('search').oninput = renderList;
$('refresh-documents').onclick = () => refreshList().catch(notice);
for (const id of ['new-document', 'header-create', 'empty-create'])
  $(id).onclick = createDocument;
$('edit-mode').onclick = () => setEditing(!editing);
$('title').oninput = () => {
  titleDirty = true;
  status();
};
function editText() {
  if (!ready || !canEdit() || !ydoc) return;
  const text = ydoc.getText('markdown'),
    old = text.toString(),
    next = $('markdown').value;
  if (next.length > 100000) {
    $('markdown').value = old;
    notice(new Error('Document limit is 100,000 characters.'));
    return;
  }
  let start = 0;
  while (
    start < old.length &&
    start < next.length &&
    old[start] === next[start]
  )
    start++;
  if (start > 0 && /[\uD800-\uDBFF]/.test(old[start - 1])) start--;
  let end = 0;
  while (
    end < old.length - start &&
    end < next.length - start &&
    old[old.length - 1 - end] === next[next.length - 1 - end]
  )
    end++;
  if (
    end > 0 &&
    (/[\uDC00-\uDFFF]/.test(old[old.length - end]) ||
      /[\uDC00-\uDFFF]/.test(next[next.length - end]))
  )
    end--;
  ydoc.transact(() => {
    const remove = old.length - start - end;
    if (remove) text.delete(start, remove);
    const insert = next.slice(start, next.length - end);
    if (insert) text.insert(start, insert);
  }, 'local');
  schedulePreview();
}
$('markdown').oninput = () => {
  if (!composing) editText();
};
$('markdown').oncompositionstart = () => {
  composing = true;
};
$('markdown').oncompositionend = () => {
  composing = false;
  editText();
  for (const message of deferred) sync(message);
  deferred = [];
};
$('save').onclick = async () => {
  if (!current || !canEdit()) return;
  if (!ready || pending.size) {
    notice(new Error('Wait for the text to sync before saving the title.'));
    return;
  }
  const id = current.id,
    title = $('title').value;
  $('save').disabled = true;
  try {
    const saved = await api(`/documents/${id}`, 'PUT', {
      title,
      markdown: $('markdown').value,
      version: current.version,
    });
    if (current?.id === id) {
      current = { ...current, ...saved };
      titleDirty = $('title').value !== title;
      status();
    }
    await refreshList();
  } catch (error) {
    notice(error);
  } finally {
    $('save').disabled = false;
  }
};
$('download').onclick = () => {
  const url = URL.createObjectURL(
    new Blob([$('markdown').value], { type: 'text/markdown;charset=utf-8' }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download =
    ($('title')
      .value.replace(/[^a-z0-9 _-]/gi, '')
      .trim() || 'document') + '.md';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$('reload-document').onclick = () => {
  if (current && discard()) openDocument(current.id).catch(notice);
};
for (const button of document.querySelectorAll('[data-close]'))
  button.onclick = () => $(button.dataset.close).close();
for (const kind of ['project', 'folder'])
  $('new-' + kind).onclick = () => {
    creating = kind;
    $('name-heading').textContent = 'New ' + kind;
    $('item-name').value = '';
    $('name-error').textContent = '';
    $('name-dialog').showModal();
  };
$('name-form').onsubmit = async (event) => {
  event.preventDefault();
  try {
    const item = await api('/' + creating + 's', 'POST', {
      name: $('item-name').value,
      projectId: Number($('project-filter').value),
    });
    $('name-dialog').close();
    await refreshList();
    if (creating === 'project') {
      $('project-filter').value = String(item.id);
      folderOptions();
    } else $('folder-filter').value = String(item.id);
    renderList();
  } catch (error) {
    $('name-error').textContent = error.message;
  }
};
async function shareLinks() {
  const links = await api(`/${shareTarget.scope}s/${shareTarget.id}/shares`);
  $('share-links').replaceChildren();
  for (const link of links) {
    const row = document.createElement('div');
    row.className = 'share-row';
    const label = document.createElement('span');
    label.textContent = `${link.role === 'read' ? 'Read only' : 'Can edit'} · ${link.members} joined`;
    const revoke = document.createElement('button');
    revoke.textContent = 'Revoke';
    revoke.onclick = async () => {
      try {
        await api(
          `/${shareTarget.scope}s/${shareTarget.id}/shares/${link.id}`,
          'DELETE',
        );
        $('share-result').hidden = true;
        await shareLinks();
      } catch (error) {
        $('share-feedback').textContent = error.message;
      }
    };
    row.append(label, revoke);
    $('share-links').append(row);
  }
  if (!links.length)
    $('share-links').textContent = 'No active invitation links.';
}
async function openShare(scope, id, name) {
  shareTarget = { scope, id };
  $('share-heading').textContent = 'Share ' + name;
  $('share-result').hidden = true;
  $('share-feedback').textContent = '';
  $('share-dialog').showModal();
  try {
    await shareLinks();
  } catch (error) {
    $('share-feedback').textContent = error.message;
  }
}
$('share').onclick = () => {
  if (current?.canManage) openShare('document', current.id, current.title);
};
$('share-project').onclick = () => {
  const p = projects.find((p) => p.id === Number($('project-filter').value));
  if (p?.role === 'owner') openShare('project', p.id, p.name);
};
$('share-form').onsubmit = async (event) => {
  event.preventDefault();
  try {
    const link = await api(
      `/${shareTarget.scope}s/${shareTarget.id}/shares`,
      'POST',
      { role: $('share-role').value },
    );
    $('share-url').value = location.origin + '/#invite=' + link.token;
    $('share-result').hidden = false;
    $('share-feedback').textContent =
      location.hostname === 'localhost'
        ? 'This localhost link works only on this computer. Use the deployed site address to collaborate across devices.'
        : 'Copy this link now. It is only shown once.';
    await shareLinks();
  } catch (error) {
    $('share-feedback').textContent = error.message;
  }
};
$('copy-invite').onclick = async () => {
  try {
    await navigator.clipboard.writeText($('share-url').value);
    $('share-feedback').textContent = 'Invitation copied.';
  } catch {
    $('share-url').select();
    $('share-feedback').textContent = 'Select and copy the invitation above.';
  }
};
function moveFolders() {
  options(
    $('move-folder'),
    folders.filter((f) => f.project_id === Number($('move-project').value)),
    'No folder',
  );
}
$('move-project').onchange = moveFolders;
$('move-document').onclick = () => {
  options(
    $('move-project'),
    projects.filter((p) => p.role === 'owner'),
    'Personal documents',
    current.project_id,
  );
  moveFolders();
  $('move-folder').value = String(current.folder_id ?? '');
  $('move-error').textContent = '';
  $('move-dialog').showModal();
};
$('move-form').onsubmit = async (event) => {
  event.preventDefault();
  if (!discard()) return;
  try {
    await api(`/documents/${current.id}/location`, 'PATCH', {
      projectId: Number($('move-project').value) || null,
      folderId: Number($('move-folder').value) || null,
    });
    $('move-dialog').close();
    await refreshList();
    await openDocument(current.id);
  } catch (error) {
    $('move-error').textContent = error.message;
  }
};
$('delete-document').onclick = () => {
  $('delete-error').textContent = '';
  $('delete-dialog').showModal();
};
$('confirm-delete').onclick = async () => {
  if (!discard()) return;
  try {
    await api(`/documents/${current.id}`, 'DELETE');
    $('delete-dialog').close();
    home();
    await refreshList();
  } catch (error) {
    $('delete-error').textContent = error.message;
  }
};
window.addEventListener('beforeunload', (event) => {
  if (dirty) {
    event.preventDefault();
    event.returnValue = '';
  }
});
window.addEventListener('hashchange', () => {
  const token = new URLSearchParams(location.hash.slice(1)).get('invite');
  if (!token) return;
  invitation = token;
  if (signedIn && activeUser && discard()) enter(activeUser).catch(notice);
});
api('/me')
  .then(enter)
  .catch(() => {});
