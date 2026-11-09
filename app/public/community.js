const $ = (id) => document.getElementById(id);
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function link(text, query) {
  const a = element('a', text);
  a.href = '/?' + new URLSearchParams(query);
  a.target = '_blank';
  a.rel = 'noopener';
  return a;
}
function profileView(p) {
  const box = element('div', undefined, 'profile-card');
  box.append(
    element('div', p.displayName.slice(0, 2).toUpperCase(), 'profile-avatar'),
    element('h2', p.displayName),
  );
  for (const field of ['headline', 'bio', 'location'])
    if (p[field]) box.append(element('p', p[field]));
  if (p.website) {
    const a = element('a', p.website);
    a.href = p.website;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    box.append(a);
  }
  return box;
}
export function setupCommunity({ api, getCurrent, isSaved }) {
  const host = element('div');
  host.innerHTML = `
    <dialog id="profile-dialog" class="community-dialog" aria-labelledby="profile-heading">
      <div class="community-top"><div><p class="eyebrow">YOUR SPACE</p><h2 id="profile-heading">Profile & settings</h2></div><button type="button" class="icon-close" aria-label="Close profile and settings" title="Close" data-dismiss="profile-dialog">×</button></div>
      <p>Tell people about your work. You choose what becomes public. Your account email is never shown on your public profile.</p>
      <div id="profile-summary" class="profile-summary"></div><form id="profile-form"><section class="profile-section" aria-labelledby="profile-details-heading"><h3 id="profile-details-heading">Personal details</h3><p class="muted">How you introduce yourself to your team.</p>
        <label>Display name or pen name<input name="displayName" maxlength="60" required /></label>
        <label>Headline<input name="headline" maxlength="120" placeholder="Student, writer, software engineer…" /></label>
        <label>About you<textarea name="bio" maxlength="2000" rows="4"></textarea></label>
        <div class="profile-columns"><label>Location<input name="location" maxlength="100" /></label><label>Website<input name="website" type="url" maxlength="500" placeholder="https://" /></label></div>
        </section><fieldset><legend>Privacy & visibility</legend>
          <label class="check-row"><input name="visible" type="checkbox" /> Make my profile public</label>
          <label class="check-row"><input name="directory" type="checkbox" /> Include my public profile in the people directory</label>
          <p class="muted">These fields appear only when your profile is public. Your display name is always visible on works you publish, even with a private profile.</p>
          <div class="profile-columns">
            <label class="check-row"><input name="showHeadline" type="checkbox" /> Show headline</label>
            <label class="check-row"><input name="showBio" type="checkbox" /> Show biography</label>
            <label class="check-row"><input name="showLocation" type="checkbox" /> Show location</label>
            <label class="check-row"><input name="showWebsite" type="checkbox" /> Show website</label>
          </div>
        </fieldset>
        <div class="dialog-actions"><button class="primary">Save profile & privacy</button><button type="button" id="profile-preview-button">Preview saved public details</button></div>
      </form>
      <p id="profile-feedback" role="status"></p><div id="profile-preview"></div>
      <section class="profile-publications"><h3>My published works</h3><p>Publish from an open document. Draft changes stay private until you publish again. Making your profile private does not unpublish your works.</p><div id="my-publications"></div></section>
    </dialog>
    <dialog id="publish-dialog" class="community-dialog" aria-labelledby="publish-heading">
      <div class="community-top"><h2 id="publish-heading">Publish your work</h2><button type="button" class="icon-close" aria-label="Close publish window" title="Close" data-dismiss="publish-dialog">×</button></div>
      <p>This saved snapshot will be readable by anyone with its link, without signing in. Publishing again updates the same link. Review the content and get any collaborators’ agreement before publishing.</p>
      <p id="publish-author"></p><h3 id="publish-title"></h3><article id="publish-preview" class="publication-preview"></article>
      <form id="publish-form"><label class="check-row"><input id="publish-listed" type="checkbox" /> List this work in Explore and on my public profile</label>
      <label class="check-row"><input id="publish-confirmed" type="checkbox" required /> I want to publish this content and my display name publicly.</label>
      <button class="primary">Publish snapshot</button></form><p id="publish-feedback" role="status"></p>
    </dialog>
    <dialog id="explore-dialog" class="community-dialog" aria-labelledby="explore-heading">
      <div class="community-top"><div><p class="eyebrow">COMMUNITY</p><h2 id="explore-heading">Ideas worth sharing.</h2></div><button type="button" class="icon-close" aria-label="Close Explore" title="Close" data-dismiss="explore-dialog">×</button></div>
      <label>Search published works<input id="explore-search" type="search" placeholder="Search titles, authors and excerpts…" /></label>
      <h3>Published works</h3><div id="explore-works"></div><h3>People</h3><div id="explore-people"></div><p id="explore-feedback" role="status"></p>
    </dialog>
    <section id="public-reader" class="public-reader" hidden><div class="community-top"><a class="brand" href="/">m<span>MarkSync</span></a><a href="/">Open workspace →</a></div><div id="public-content"></div></section>`;
  document.body.append(host);
  host.querySelectorAll('[data-dismiss]').forEach((b) => {
    b.onclick = () => $(b.dataset.dismiss).close();
  });
  const actions = element('div', undefined, 'community-nav');
  const profileButton = element(
    'button',
    'My profile & settings',
    'nav-button',
  );
  const exploreButton = element(
    'button',
    'Explore works & people',
    'nav-button',
  );
  profileButton.id = 'open-profile';
  exploreButton.id = 'open-explore';
  actions.append(exploreButton, profileButton);
  document.querySelector('.sidebar-footer').before(actions);
  const publishButton = element('button', 'Publish', 'text-button');
  publishButton.id = 'publish-document';
  publishButton.classList.add('icon-action');
  publishButton.setAttribute('aria-label', 'Publish');
  publishButton.title = 'Publish';
  document.querySelector('.editor-actions').prepend(publishButton);
  function cards(items, container, own = false) {
    container.replaceChildren();
    if (!items.length)
      container.append(element('p', 'No published works yet.', 'muted'));
    for (const item of items) {
      const card = element('div', undefined, 'work-card');
      card.append(
        link(item.title, { publication: item.slug }),
        element(
          'p',
          `${item.authorName} · ${item.minutes} min read${own ? (item.listed ? ' · Listed' : ' · Link only') : ''}`,
          'muted',
        ),
        element('p', item.excerpt),
      );
      if (own) {
        const copy = element('button', 'Copy public link');
        copy.onclick = async () => {
          try {
            await navigator.clipboard.writeText(
              new URL('/?publication=' + item.slug, location.origin).href,
            );
            copy.textContent = 'Copied';
          } catch {
            $('profile-feedback').textContent =
              'Copy the link from the publication title using your browser.';
          }
        };
        const remove = element('button', 'Unpublish', 'text-button');
        remove.onclick = async () => {
          if (
            !confirm(
              'Unpublish this work? Its public link will stop working. Copies others already saved cannot be recalled.',
            )
          )
            return;
          try {
            await api('/me/publications/' + item.slug, 'DELETE');
            await myWorks();
            $('profile-feedback').textContent = 'Work unpublished.';
          } catch (e) {
            $('profile-feedback').textContent = e.message;
          }
        };
        card.append(copy, remove);
      }
      container.append(card);
    }
  }
  async function myWorks() {
    cards(await api('/me/publications'), $('my-publications'), true);
  }
  function profileSummary(p) {
    const details = element('div');
    details.append(
      element('strong', p.displayName),
      element(
        'span',
        p.visible ? 'Public profile' : 'Private profile',
        'visibility-badge',
      ),
    );
    $('profile-summary').replaceChildren(
      element('div', p.displayName.slice(0, 2).toUpperCase(), 'profile-avatar'),
      details,
    );
  }
  profileButton.onclick = async () => {
    $('profile-feedback').textContent = '';
    $('profile-preview').replaceChildren();
    $('profile-dialog').showModal();
    try {
      const p = await api('/me/profile');
      profileSummary(p);
      for (const [key, value] of Object.entries(p)) {
        const field = $('profile-form').elements.namedItem(key);
        if (typeof value === 'boolean') field.checked = value;
        else field.value = value;
      }
      await myWorks();
    } catch (e) {
      $('profile-feedback').textContent = e.message;
    }
  };
  $('profile-form').onsubmit = async (event) => {
    event.preventDefault();
    const data = {};
    for (const field of $('profile-form').elements)
      if (field.name)
        data[field.name] =
          field.type === 'checkbox' ? field.checked : field.value;
    try {
      await api('/me/profile', 'PUT', data);
      profileSummary(data);
      $('profile-feedback').textContent = 'Profile and privacy settings saved.';
      $('profile-preview').replaceChildren();
    } catch (e) {
      $('profile-feedback').textContent = e.message;
    }
  };
  $('profile-preview-button').onclick = async () => {
    try {
      const p = await api('/me/profile-preview');
      const box = $('profile-preview');
      box.replaceChildren(
        element(
          'p',
          'Preview of saved visible fields. This does not make your profile public.',
          'muted',
        ),
        profileView(p),
      );
      box.append(
        link('Open public profile (unavailable when private)', {
          profile: p.id,
        }),
      );
    } catch (e) {
      $('profile-feedback').textContent = e.message;
    }
  };
  let reviewed;
  publishButton.onclick = async () => {
    $('publish-feedback').textContent = '';
    $('publish-preview').replaceChildren();
    $('publish-form').hidden = true;
    $('publish-form').reset();
    $('publish-dialog').showModal();
    try {
      if (!isSaved())
        throw new Error(
          'Wait for text to sync and save your title before publishing.',
        );
      const id = getCurrent()?.id;
      const preview = await api(`/documents/${id}/publication-preview`);
      reviewed = { id, version: preview.version };
      $('publish-title').textContent = preview.title;
      $('publish-author').textContent =
        'Public author name: ' + preview.authorName;
      $('publish-preview').innerHTML = preview.html;
      $('publish-form').hidden = false;
    } catch (e) {
      $('publish-feedback').textContent = e.message;
    }
  };
  $('publish-form').onsubmit = async (event) => {
    event.preventDefault();
    try {
      const p = await api(`/documents/${reviewed.id}/publication`, 'POST', {
        version: reviewed.version,
        confirmed: $('publish-confirmed').checked,
        listed: $('publish-listed').checked,
      });
      $('publish-feedback').replaceChildren(
        element('span', 'Published. '),
        link('Open public work →', { publication: p.slug }),
      );
      $('publish-form').hidden = true;
    } catch (e) {
      $('publish-feedback').textContent = e.message;
    }
  };
  let works = [];
  exploreButton.onclick = async () => {
    $('explore-dialog').showModal();
    $('explore-feedback').textContent = '';
    $('explore-search').value = '';
    try {
      const [posts, people] = await Promise.all([
        api('/public/publications'),
        api('/public/people'),
      ]);
      works = posts;
      cards(works, $('explore-works'));
      $('explore-people').replaceChildren();
      if (!people.length)
        $('explore-people').append(
          element('p', 'No one has joined the public directory yet.', 'muted'),
        );
      for (const p of people) {
        const row = element('div', undefined, 'work-card');
        row.append(
          link(p.displayName, { profile: p.id }),
          element('p', p.headline),
        );
        $('explore-people').append(row);
      }
    } catch (e) {
      $('explore-feedback').textContent = e.message;
    }
  };
  $('explore-search').oninput = () => {
    const q = $('explore-search').value.toLowerCase();
    cards(
      works.filter((p) =>
        `${p.title} ${p.authorName} ${p.excerpt}`.toLowerCase().includes(q),
      ),
      $('explore-works'),
    );
  };
  const params = new URLSearchParams(location.search);
  const publicRoute = params.has('profile') || params.has('publication');
  if (publicRoute) {
    $('auth').hidden = true;
    $('workspace').hidden = true;
    $('public-reader').hidden = false;
    const content = $('public-content');
    content.textContent = 'Loading…';
    (async () => {
      if (params.has('publication')) {
        const p = await api(
          '/public/publications/' +
            encodeURIComponent(params.get('publication')),
        );
        document.title = p.title + ' · MarkSync';
        content.replaceChildren(
          element('p', 'PUBLISHED WORK', 'eyebrow'),
          element('h1', p.title),
          element(
            'p',
            `By ${p.authorName} · Published ${p.publishedAt} UTC`,
            'muted',
          ),
        );
        if (p.profileId)
          content.append(
            link('Visit author profile', { profile: p.profileId }),
          );
        const article = element('article');
        article.innerHTML = p.html;
        content.append(article);
      } else {
        const p = await api(
          '/public/profiles/' + encodeURIComponent(params.get('profile')),
        );
        document.title = p.displayName + ' · MarkSync';
        content.replaceChildren(
          profileView(p),
          element('h2', 'Published works'),
        );
        const list = element('div');
        content.append(list);
        cards(p.publications, list);
      }
    })().catch((e) => {
      content.textContent = e.message;
    });
  }
  return publicRoute;
}
