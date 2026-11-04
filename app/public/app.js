import { setupWritingTools } from './writing-tools.js';
import { setupWorkspaceTools } from './workspace-tools.js';
import { setupCommunity } from './community.js';
import { Replica, RecoveryStore } from './collaboration.js';
import { CursorLayer } from './cursors.js';
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
let socket, reconnect, heartbeat, previewTimer, replica, recovery, sendTimer;
let previewSequence = 0,
  openSequence = 0,
  reconnectDelay = 1000;
let ready = false,
  composing = false,
  deferred = [];
let pending = new Map();
const cursors = new CursorLayer($('markdown'));
let invitation = new URLSearchParams(location.hash.slice(1)).get('invite');
let shareTarget, creating, activeUser;
const canEdit = () => current && ['owner', 'edit'].includes(current.role);
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
function persistRecovery() {
  if (!current || !replica || !recovery || !canEdit()) return;
  try {
    recovery.save(current.id, replica, titleDirty ? $('title').value : null);
  } catch {
    $('recovery-state').textContent =
      'Recovery unavailable — download unsaved work before leaving.';
  }
}
function status() {
  dirty = titleDirty || pending.size > 0;
  $('save-state').textContent = pending.size
    ? `${pending.size} pending edit${pending.size === 1 ? '' : 's'}${ready ? ' · syncing…' : ' · waiting for connection'}`
    : titleDirty
      ? 'Text synced · title not saved'
      : ready
        ? `Saved · version ${current?.version ?? 1}`
        : 'Waiting to confirm saved state';
  $('connection-state').textContent = ready
    ? 'Connected'
    : 'Disconnected · reconnecting or access required';
  $('connection-state').classList.toggle('connection-paused', !ready);
  $('undo').disabled = !ready || !editing || !replica?.undo.canUndo();
  $('redo').disabled = !ready || !editing || !replica?.undo.canRedo();
  persistRecovery();
}
function setEditing(value) {
  $('publish-document').hidden = current?.author !== activeUser?.id;
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
  status();
  cursors.render(replica);
  sendCursor();
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
  clearTimeout(sendTimer);
  cursors.set([], replica);
  workspaceTools.presence([]);
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
  clearTimeout(sendTimer);
  if (ready && socket?.readyState === WebSocket.OPEN && canEdit()) {
    const update = replica.batch();
    persistRecovery();
    if (update) socket.send(JSON.stringify({ type: 'update', ...update }));
  }
}
function sendCursor() {
  if (!ready || socket?.readyState !== WebSocket.OPEN || !replica) return;
  const cursor =
    editing && document.activeElement === $('markdown')
      ? replica.selection(
          $('markdown').selectionStart,
          $('markdown').selectionEnd,
        )
      : null;
  socket.send(JSON.stringify({ type: 'awareness', cursor }));
}
let cursorTimer;
for (const event of ['select', 'keyup', 'mouseup', 'focus', 'blur'])
  $('markdown').addEventListener(event, () => {
    clearTimeout(cursorTimer);
    cursorTimer = setTimeout(sendCursor, 80);
  });
function sync(message) {
  if (!current || !replica) return;
  const selection = replica.selection(
    $('markdown').selectionStart,
    $('markdown').selectionEnd,
  );
  replica.receive(message.update, message.ack);
  $('markdown').value = replica.text.toString();
  const position = replica.resolve(selection);
  if (position) $('markdown').setSelectionRange(position.start, position.end);
  const fresh = message.version >= current.version;
  current.version = Math.max(current.version, message.version);
  current.role = message.role;
  if (!titleDirty && fresh) {
    current.title = message.title;
    $('title').value = message.title;
    $('document-heading').textContent = message.title;
  }
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
  cursors.render(replica);
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
    ws.send(JSON.stringify(replica.joinMessage(current.id)));
    heartbeat = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
        if (!ready) ws.send(JSON.stringify(replica.joinMessage(current.id)));
        else {
          // Retry unacknowledged edits AND request missing remote state even on an open socket.
          const messages = replica.repairMessages(canEdit());
          persistRecovery();
          for (const message of messages) ws.send(JSON.stringify(message));
        }
        sendCursor();
      }
    }, 3000);
  };
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.type === 'sync') {
      if (composing) deferred.push(message);
      else sync(message);
    }
    if (message.type === 'awareness')
      cursors.set(
        message.peers.filter((p) => p.peer !== message.self),
        replica,
      );
    if (message.type === 'presence') workspaceTools.presence(message.users);
    if (message.type === 'presence')
      $('presence').textContent =
        `● ${message.users.length} online · ${message.users.map((u) => u.name).join(', ')}`;
    if (message.type === 'pong')
      $('heartbeat').textContent =
        `Two-way connection verified at ${new Date().toLocaleTimeString()}`;
    if (message.type === 'error') {
      ready = false;
      $('markdown').readOnly = true;
      status();
      notice(new Error(message.error));
    }
  };
  ws.onclose = (event) => {
    ready = false;
    clearInterval(heartbeat);
    $('markdown').readOnly = true;
    cursors.set([], replica);
    workspaceTools.presence([]);
    status();
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
  replica?.destroy();
  replica = new Replica(() => {
    status();
    clearTimeout(sendTimer);
    sendTimer = setTimeout(flush, 120);
  });
  pending = replica.pending;
  deferred = [];
  composing = false;
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
  $('recovery-state').textContent = recovery
    ? 'Unsent edits are kept in this tab until synced; sign-out clears recovery.'
    : 'Tab recovery is unavailable. Download unsaved work before leaving.';
  try {
    const saved = recovery?.load(doc.id);
    if (saved && canEdit()) {
      replica.restore(saved);
      if (typeof saved.title === 'string') {
        $('title').value = saved.title;
        titleDirty = true;
      }
      $('markdown').value = replica.text.toString();
      $('recovery-state').textContent =
        'Recovered edits from this tab. Rechecking access before syncing.';
    } else if (saved) {
      $('recovery-state').textContent =
        'A recovery copy exists, but editing access is required to restore it.';
    }
  } catch (error) {
    notice(error);
  }
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
  replica?.destroy();
  replica = null;
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
  try {
    recovery = new RecoveryStore(sessionStorage, user.id);
  } catch {
    recovery = null;
  }
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
    recovery?.clear();
    recovery = null;
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
  if (!ready || !canEdit() || !replica) return;
  try {
    replica.replace($('markdown').value);
  } catch (error) {
    $('markdown').value = replica.text.toString();
    notice(error);
  }
  status();
  cursors.render(replica);
  sendCursor();
  schedulePreview();
}
function undoRedo(redo = false) {
  if (!ready || !editing || !canEdit() || composing) return;
  replica.undo.stopCapturing();
  if (redo) replica.undo.redo();
  else replica.undo.undo();
  $('markdown').value = replica.text.toString();
  status();
  cursors.render(replica);
  sendCursor();
  schedulePreview();
}
$('undo').onclick = () => undoRedo();
$('redo').onclick = () => undoRedo(true);
$('markdown').addEventListener('keydown', (event) => {
  if (
    (event.ctrlKey || event.metaKey) &&
    !event.altKey &&
    ['z', 'y'].includes(event.key.toLowerCase())
  ) {
    event.preventDefault();
    undoRedo(event.shiftKey || event.key.toLowerCase() === 'y');
  }
});
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
const workspaceTools = setupWorkspaceTools({
  api,
  getContext: () => ({
    current,
    user: signedIn ? activeUser : null,
    ready,
    pending: pending.size,
    editing,
  }),
  searchItems: () => [
    ...documents
      .filter(() => !trash)
      .map((d) => ({ id: d.id, name: d.title, kind: 'Document' })),
    ...projects.map((p) => ({ id: p.id, name: p.name, kind: 'Project' })),
    ...folders.map((f) => ({
      id: f.id,
      project: f.project_id,
      name: f.name,
      kind: 'Folder',
    })),
  ],
  navigate: async (item) => {
    if (!discard()) return;
    if (item.kind === 'Document') {
      await openDocument(item.id);
      return;
    }
    home();
    trash = false;
    $('trash-view').textContent = 'Trash';
    await refreshList();
    $('project-filter').value = String(
      item.kind === 'Project' ? item.id : item.project,
    );
    folderOptions();
    if (item.kind === 'Folder') $('folder-filter').value = String(item.id);
    renderList();
  },
});
setupWritingTools({
  api,
  getContext: () => ({ current, saved: ready && !dirty && !pending.size }),
});
const publicRoute = setupCommunity({
  api,
  getCurrent: () => current,
  isSaved: () => !dirty && ready && pending.size === 0,
});
if (!publicRoute)
  api('/me')
    .then(enter)
    .catch(() => {});
