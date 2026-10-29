(() => {
  'use strict';

  const state = {
    started: false,
    posts: [],
    media: [],
    commentPage: 1,
    comments: [],
    taxonomy: {
      categories: [],
      tags: []
    }
  };

  const taxonomyControls = {};
  const taxonomyDefinitions = {
    categories: {
      inputId: 'post-category',
      chipsId: 'post-category-chips',
      suggestionsId: 'post-category-suggestions',
      itemLabel: 'category'
    },
    tags: {
      inputId: 'post-tags',
      chipsId: 'post-tags-chips',
      suggestionsId: 'post-tags-suggestions',
      itemLabel: 'tag'
    }
  };

  const byId = (id) => document.getElementById(id);

  function setMessage(message, kind = 'success') {
    const notice = byId('global-message');
    notice.textContent = message;
    notice.className = `notice notice-${kind}`;
    notice.hidden = !message;
  }

  function clearMessage() {
    setMessage('');
  }

  function reportError(error, target = null) {
    const message = error instanceof Error ? error.message : 'Something went wrong.';
    if (target) {
      target.replaceChildren();
      const heading = document.createElement('p');
      heading.textContent = message;
      target.appendChild(heading);
      if (error && error.fields) {
        const list = document.createElement('ul');
        Object.entries(error.fields).forEach(([field, detail]) => {
          const item = document.createElement('li');
          item.textContent = `${field}: ${String(detail)}`;
          list.appendChild(item);
        });
        target.appendChild(list);
      }
      target.hidden = false;
      return;
    }
    setMessage(message, 'error');
  }

  async function request(path, options) {
    return window.ForgeAdminAuth.fetch(path, options);
  }

  function button(label, className, handler) {
    const element = document.createElement('button');
    element.type = 'button';
    element.className = className || 'button';
    element.textContent = label;
    element.addEventListener('click', handler);
    return element;
  }

  function formatDate(value) {
    if (!value) return 'Not yet';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
  }

  function uniqueTaxonomyValues(values) {
    const unique = [];
    if (!Array.isArray(values)) return unique;
    values.forEach((value) => {
      if (typeof value !== 'string') return;
      const trimmed = value.trim();
      if (trimmed && !unique.includes(trimmed)) unique.push(trimmed);
    });
    return unique;
  }

  function hideTaxonomySuggestions(control) {
    control.suggestions = [];
    control.activeIndex = -1;
    control.list.hidden = true;
    control.input.setAttribute('aria-expanded', 'false');
    control.input.removeAttribute('aria-activedescendant');
  }

  function renderTaxonomyChips(control) {
    control.chips.replaceChildren();
    control.selected.forEach((value) => {
      const chip = document.createElement('span');
      chip.className = 'taxonomy-chip';

      const text = document.createElement('span');
      text.textContent = value;

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'taxonomy-chip-remove';
      remove.textContent = '×';
      remove.setAttribute('aria-label', `Remove ${control.itemLabel} ${value}`);
      remove.addEventListener('click', () => {
        control.selected = control.selected.filter((selected) => selected !== value);
        renderTaxonomyChips(control);
        control.input.focus();
        renderTaxonomySuggestions(control);
      });

      chip.append(text, remove);
      control.chips.appendChild(chip);
    });
  }

  function renderTaxonomySuggestions(control) {
    if (document.activeElement !== control.input) {
      hideTaxonomySuggestions(control);
      return;
    }

    const query = control.input.value.trim().toLocaleLowerCase();
    control.suggestions = state.taxonomy[control.kind].filter((value) => (
      !control.selected.includes(value) && value.toLocaleLowerCase().includes(query)
    ));

    if (control.suggestions.length === 0) {
      hideTaxonomySuggestions(control);
      return;
    }

    if (control.activeIndex < 0 || control.activeIndex >= control.suggestions.length) {
      control.activeIndex = 0;
    }
    control.list.replaceChildren();
    control.suggestions.forEach((value, index) => {
      const option = document.createElement('div');
      option.id = `${control.suggestionsId}-option-${index}`;
      option.className = 'taxonomy-suggestion';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', index === control.activeIndex ? 'true' : 'false');
      option.textContent = value;
      option.addEventListener('mouseenter', () => {
        control.activeIndex = index;
        Array.from(control.list.children).forEach((item, itemIndex) => {
          item.setAttribute('aria-selected', itemIndex === index ? 'true' : 'false');
        });
        control.input.setAttribute('aria-activedescendant', option.id);
      });
      option.addEventListener('mousedown', (event) => event.preventDefault());
      option.addEventListener('click', () => addTaxonomyValue(control, value));
      control.list.appendChild(option);
    });
    control.list.hidden = false;
    control.input.setAttribute('aria-expanded', 'true');
    control.input.setAttribute('aria-activedescendant', `${control.suggestionsId}-option-${control.activeIndex}`);
  }

  function addTaxonomyValue(control, value) {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    if (trimmed && !control.selected.includes(trimmed)) control.selected.push(trimmed);
    control.input.value = '';
    control.activeIndex = -1;
    renderTaxonomyChips(control);
    renderTaxonomySuggestions(control);
  }

  function commitTaxonomyDraft(control) {
    control.input.value.split(',').forEach((value) => {
      const trimmed = value.trim();
      if (trimmed && !control.selected.includes(trimmed)) control.selected.push(trimmed);
    });
    control.input.value = '';
    control.activeIndex = -1;
    renderTaxonomyChips(control);
    hideTaxonomySuggestions(control);
  }

  function handleTaxonomyInput(control) {
    if (control.input.value.includes(',')) {
      const values = control.input.value.split(',');
      const remainder = control.input.value.endsWith(',') ? '' : values.pop();
      values.forEach((value) => {
        const trimmed = value.trim();
        if (trimmed && !control.selected.includes(trimmed)) control.selected.push(trimmed);
      });
      control.input.value = remainder;
      renderTaxonomyChips(control);
    }
    control.activeIndex = 0;
    renderTaxonomySuggestions(control);
  }

  function handleTaxonomyKeydown(control, event) {
    if (event.key === ',') {
      event.preventDefault();
      commitTaxonomyDraft(control);
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (control.list.hidden) renderTaxonomySuggestions(control);
      if (control.suggestions.length === 0) return;
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      control.activeIndex = (control.activeIndex + direction + control.suggestions.length) % control.suggestions.length;
      renderTaxonomySuggestions(control);
      return;
    }
    if (event.key === 'Enter' && !control.list.hidden && control.activeIndex >= 0) {
      event.preventDefault();
      addTaxonomyValue(control, control.suggestions[control.activeIndex]);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      hideTaxonomySuggestions(control);
    }
  }

  function initializeTaxonomyControls() {
    if (Object.keys(taxonomyControls).length > 0) return;
    Object.entries(taxonomyDefinitions).forEach(([kind, definition]) => {
      const control = {
        ...definition,
        kind,
        input: byId(definition.inputId),
        chips: byId(definition.chipsId),
        list: byId(definition.suggestionsId),
        selected: [],
        suggestions: [],
        activeIndex: -1
      };
      taxonomyControls[kind] = control;
      control.input.addEventListener('input', () => handleTaxonomyInput(control));
      control.input.addEventListener('focus', () => renderTaxonomySuggestions(control));
      control.input.addEventListener('blur', () => hideTaxonomySuggestions(control));
      control.input.addEventListener('keydown', (event) => handleTaxonomyKeydown(control, event));
      control.input.addEventListener('paste', (event) => {
        const text = event.clipboardData ? event.clipboardData.getData('text') : '';
        if (!text.includes(',')) return;
        event.preventDefault();
        const start = control.input.selectionStart;
        const end = control.input.selectionEnd;
        control.input.value = `${control.input.value.slice(0, start)}${text}${control.input.value.slice(end)}`;
        commitTaxonomyDraft(control);
      });
    });
  }

  function setTaxonomySelection(kind, values) {
    const control = taxonomyControls[kind];
    control.selected = uniqueTaxonomyValues(values);
    control.input.value = '';
    renderTaxonomyChips(control);
    hideTaxonomySuggestions(control);
  }

  function mergeTaxonomyVocabulary(kind, values) {
    state.taxonomy[kind] = uniqueTaxonomyValues([...state.taxonomy[kind], ...uniqueTaxonomyValues(values)])
      .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }));
  }

  async function loadTaxonomy() {
    const payload = await request('/admin/taxonomy');
    const taxonomy = payload.data && typeof payload.data === 'object' ? payload.data : {};
    state.taxonomy.categories = uniqueTaxonomyValues(taxonomy.categories);
    state.taxonomy.tags = uniqueTaxonomyValues(taxonomy.tags);
    Object.values(taxonomyControls).forEach((control) => renderTaxonomySuggestions(control));
  }

  function commitTaxonomyDrafts() {
    Object.values(taxonomyControls).forEach(commitTaxonomyDraft);
  }

  function switchSection(section) {
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.classList.toggle('is-active', tab.dataset.section === section);
    });
    document.querySelectorAll('.admin-section').forEach((panel) => {
      panel.hidden = panel.id !== `section-${section}`;
    });
  }

  async function loadPosts() {
    const status = byId('post-status-filter').value;
    const payload = await request(`/admin/posts?status=${encodeURIComponent(status)}`);
    state.posts = Array.isArray(payload.data) ? payload.data : [];
    renderPosts();
  }

  function renderPosts() {
    const list = byId('post-list');
    list.replaceChildren();
    if (state.posts.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-state';
      empty.textContent = 'No posts in this view.';
      list.appendChild(empty);
      return;
    }

    state.posts.forEach((post) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'post-list-item';
      item.addEventListener('click', () => openPost(post.id));

      const title = document.createElement('strong');
      title.textContent = post.title || 'Untitled';
      const slug = document.createElement('span');
      slug.textContent = `/${post.slug || ''}`;
      const date = document.createElement('small');
      date.textContent = `Updated ${formatDate(post.updated_at)}`;
      item.append(title, slug, date);
      list.appendChild(item);
    });
  }

  async function openPost(id) {
    clearMessage();
    try {
      const payload = await request(`/admin/posts/${encodeURIComponent(id)}`);
      fillPostForm(payload.data || {});
    } catch (error) {
      reportError(error);
    }
  }

  function resetPostForm() {
    byId('post-form').reset();
    byId('post-id').value = '';
    byId('post-cover').value = '';
    setTaxonomySelection('categories', []);
    setTaxonomySelection('tags', []);
    byId('faq-list').replaceChildren();
    byId('post-errors').hidden = true;
    byId('post-errors').replaceChildren();
    byId('post-status').textContent = 'New draft';
    byId('editor-title').textContent = 'Create post';
    byId('delete-post').disabled = true;
    byId('unpublish-post').disabled = true;
    byId('publish-post').disabled = false;
  }

  function fillPostForm(post) {
    byId('post-id').value = post.id == null ? '' : String(post.id);
    byId('post-title').value = post.title || '';
    byId('post-slug').value = post.slug || '';
    byId('post-excerpt').value = post.excerpt || '';
    byId('post-body').value = post.body_markdown || '';
    setTaxonomySelection('categories', Array.isArray(post.categories) ? post.categories : (post.category ? [post.category] : []));
    setTaxonomySelection('tags', Array.isArray(post.tags) ? post.tags : []);
    byId('post-meta-title').value = post.meta_title || '';
    byId('post-meta-description').value = post.meta_description || '';
    byId('post-cover').value = post.cover_media_id == null ? '' : String(post.cover_media_id);
    byId('post-comments-enabled').checked = post.comments_enabled === true || Number(post.comments_enabled) === 1;
    byId('post-status').textContent = post.status === 'published' ? 'Published' : 'Draft';
    byId('editor-title').textContent = post.title || 'Edit post';
    byId('delete-post').disabled = post.id == null;
    byId('unpublish-post').disabled = post.status !== 'published';
    byId('publish-post').disabled = post.status === 'published';
    byId('post-errors').hidden = true;
    renderFaq(Array.isArray(post.faq) ? post.faq : []);
  }

  function addFaqRow(item = {}) {
    const row = document.createElement('div');
    row.className = 'faq-row';

    const questionLabel = document.createElement('label');
    questionLabel.className = 'field';
    questionLabel.append('Question');
    const question = document.createElement('input');
    question.className = 'faq-question';
    question.value = item.question || '';
    questionLabel.appendChild(question);

    const answerLabel = document.createElement('label');
    answerLabel.className = 'field';
    answerLabel.append('Answer');
    const answer = document.createElement('textarea');
    answer.className = 'faq-answer';
    answer.rows = 3;
    answer.value = item.answer || '';
    answerLabel.appendChild(answer);

    row.append(questionLabel, answerLabel, button('Remove', 'button button-danger button-small', () => row.remove()));
    byId('faq-list').appendChild(row);
  }

  function renderFaq(items) {
    byId('faq-list').replaceChildren();
    items.forEach((item) => addFaqRow(item && typeof item === 'object' ? item : {}));
  }

  function postData() {
    commitTaxonomyDrafts();
    const faq = Array.from(document.querySelectorAll('.faq-row')).map((row) => ({
      question: row.querySelector('.faq-question').value.trim(),
      answer: row.querySelector('.faq-answer').value.trim()
    })).filter((item) => item.question || item.answer);
    const coverValue = byId('post-cover').value;

    return {
      title: byId('post-title').value.trim(),
      slug: byId('post-slug').value.trim(),
      excerpt: byId('post-excerpt').value,
      body_markdown: byId('post-body').value,
      categories: taxonomyControls.categories.selected.slice(),
      tags: taxonomyControls.tags.selected.slice(),
      faq,
      meta_title: byId('post-meta-title').value.trim() || null,
      meta_description: byId('post-meta-description').value.trim() || null,
      cover_media_id: coverValue ? Number(coverValue) : null,
      comments_enabled: byId('post-comments-enabled').checked
    };
  }

  async function savePost() {
    const id = byId('post-id').value;
    const path = id ? `/admin/posts/${encodeURIComponent(id)}` : '/admin/posts';
    const method = id ? 'PUT' : 'POST';
    const payload = await request(path, { method, body: JSON.stringify(postData()) });
    const post = payload.data || {};
    fillPostForm(post);
    mergeTaxonomyVocabulary('categories', post.categories);
    mergeTaxonomyVocabulary('tags', post.tags);
    await loadPosts();
    return post;
  }

  async function submitPost(event) {
    event.preventDefault();
    clearMessage();
    byId('post-errors').hidden = true;
    try {
      await savePost();
      setMessage('Draft saved.');
    } catch (error) {
      reportError(error, byId('post-errors'));
    }
  }

  async function publishPost() {
    clearMessage();
    byId('post-errors').hidden = true;
    try {
      const post = await savePost();
      const payload = await request(`/admin/posts/${encodeURIComponent(post.id)}/publish`, { method: 'POST' });
      fillPostForm(payload.data || {});
      byId('post-status-filter').value = 'published';
      await loadPosts();
      setMessage('Post published.');
    } catch (error) {
      reportError(error, byId('post-errors'));
    }
  }

  async function unpublishPost() {
    const id = byId('post-id').value;
    if (!id) return;
    clearMessage();
    try {
      const payload = await request(`/admin/posts/${encodeURIComponent(id)}/unpublish`, { method: 'POST' });
      fillPostForm(payload.data || {});
      byId('post-status-filter').value = 'draft';
      await loadPosts();
      setMessage('Post moved to drafts.');
    } catch (error) {
      reportError(error);
    }
  }

  async function deletePost() {
    const id = byId('post-id').value;
    if (!id || !window.confirm('Delete this post permanently?')) return;
    try {
      await request(`/admin/posts/${encodeURIComponent(id)}`, { method: 'DELETE' });
      resetPostForm();
      await loadPosts();
      setMessage('Post deleted.');
    } catch (error) {
      reportError(error);
    }
  }

  async function loadMedia() {
    const payload = await request('/admin/media');
    state.media = Array.isArray(payload.data) ? payload.data : [];
    renderMedia();
    renderCoverOptions();
  }

  function renderCoverOptions() {
    const select = byId('post-cover');
    const selected = select.value;
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = 'No cover image';
    select.replaceChildren(empty);
    state.media.forEach((media) => {
      const option = document.createElement('option');
      option.value = String(media.id);
      option.textContent = media.alt_text || media.original_name || `Image ${media.id}`;
      select.appendChild(option);
    });
    select.value = selected;
  }

  function markdownFor(media) {
    const alt = String(media.alt_text || '').replace(/[\[\]]/g, '');
    return `![${alt}](${media.url})`;
  }

  function insertMedia(media) {
    const body = byId('post-body');
    const snippet = markdownFor(media);
    const start = body.selectionStart;
    const end = body.selectionEnd;
    const prefix = start > 0 && body.value[start - 1] !== '\n' ? '\n\n' : '';
    const suffix = end < body.value.length && body.value[end] !== '\n' ? '\n\n' : '';
    body.setRangeText(`${prefix}${snippet}${suffix}`, start, end, 'end');
    switchSection('posts');
    body.focus();
    setMessage('Image Markdown inserted into the post body.');
  }

  function renderMedia() {
    const list = byId('media-list');
    list.replaceChildren();
    if (state.media.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-state panel';
      empty.textContent = 'No images have been uploaded.';
      list.appendChild(empty);
      return;
    }

    state.media.forEach((media) => {
      const card = document.createElement('article');
      card.className = 'media-card panel';
      const image = document.createElement('img');
      image.src = media.url;
      image.alt = media.alt_text || '';
      image.loading = 'lazy';
      const title = document.createElement('strong');
      title.textContent = media.original_name || `Image ${media.id}`;
      const details = document.createElement('small');
      details.textContent = `${media.width || '?'} × ${media.height || '?'} · ${Math.round(Number(media.size_bytes || 0) / 1024)} KB`;
      const alt = document.createElement('p');
      alt.textContent = media.alt_text || 'No alt text';
      const actions = document.createElement('div');
      actions.className = 'card-actions';
      actions.append(
        button('Insert Markdown', 'button button-small', () => insertMedia(media)),
        button('Delete', 'button button-danger button-small', () => deleteMedia(media))
      );
      card.append(image, title, details, alt, actions);
      list.appendChild(card);
    });
  }

  async function uploadMedia(event) {
    event.preventDefault();
    clearMessage();
    const form = event.currentTarget;
    const data = new FormData();
    const file = byId('media-file').files[0];
    if (!file) return;
    data.append('file', file);
    data.append('alt_text', byId('media-alt').value.trim());
    try {
      await request('/admin/media', { method: 'POST', body: data });
      form.reset();
      await loadMedia();
      setMessage('Image uploaded.');
    } catch (error) {
      reportError(error);
    }
  }

  async function deleteMedia(media) {
    if (!window.confirm(`Delete ${media.original_name || 'this image'} permanently?`)) return;
    try {
      await request(`/admin/media/${encodeURIComponent(media.id)}`, { method: 'DELETE' });
      await loadMedia();
      setMessage('Image deleted.');
    } catch (error) {
      reportError(error);
    }
  }

  async function loadComments() {
    const status = byId('comment-status-filter').value;
    const payload = await request(`/admin/comments?status=${encodeURIComponent(status)}&page=${state.commentPage}`);
    state.comments = Array.isArray(payload.data) ? payload.data : [];
    byId('comments-page').textContent = `Page ${state.commentPage}`;
    byId('comments-previous').disabled = state.commentPage <= 1;
    byId('comments-next').disabled = state.comments.length < Number(payload.meta && payload.meta.per_page ? payload.meta.per_page : 20);
    renderComments();
  }

  function renderComments() {
    const list = byId('comment-list');
    list.replaceChildren();
    if (state.comments.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-state panel';
      empty.textContent = 'No comments in this queue.';
      list.appendChild(empty);
      return;
    }

    state.comments.forEach((comment) => {
      const card = document.createElement('article');
      card.className = 'comment-card panel';
      const heading = document.createElement('div');
      heading.className = 'comment-heading';
      const author = document.createElement('strong');
      author.textContent = comment.author_name || 'Anonymous';
      const context = document.createElement('span');
      context.textContent = `${comment.post_title || comment.post_slug || 'Unknown post'} · ${formatDate(comment.created_at)}`;
      heading.append(author, context);
      const body = document.createElement('p');
      body.className = 'comment-body';
      body.textContent = comment.body || '';
      const actions = document.createElement('div');
      actions.className = 'card-actions';
      actions.append(
        button('Approve', 'button button-small', () => moderateComment(comment.id, 'approved')),
        button('Reject', 'button button-small', () => moderateComment(comment.id, 'rejected')),
        button('Delete', 'button button-danger button-small', () => deleteComment(comment.id))
      );
      card.append(heading, body, actions);
      list.appendChild(card);
    });
  }

  async function moderateComment(id, status) {
    try {
      await request(`/admin/comments/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ status })
      });
      await loadComments();
      setMessage(`Comment ${status}.`);
    } catch (error) {
      reportError(error);
    }
  }

  async function deleteComment(id) {
    if (!window.confirm('Delete this comment permanently?')) return;
    try {
      await request(`/admin/comments/${encodeURIComponent(id)}`, { method: 'DELETE' });
      await loadComments();
      setMessage('Comment deleted.');
    } catch (error) {
      reportError(error);
    }
  }

  function bindEvents() {
    initializeTaxonomyControls();
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => switchSection(tab.dataset.section));
    });
    byId('post-status-filter').addEventListener('change', () => loadPosts().catch(reportError));
    byId('new-post').addEventListener('click', resetPostForm);
    byId('post-form').addEventListener('submit', submitPost);
    byId('publish-post').addEventListener('click', publishPost);
    byId('unpublish-post').addEventListener('click', unpublishPost);
    byId('delete-post').addEventListener('click', deletePost);
    byId('add-faq').addEventListener('click', () => addFaqRow());
    byId('media-upload-form').addEventListener('submit', uploadMedia);
    byId('comment-status-filter').addEventListener('change', () => {
      state.commentPage = 1;
      loadComments().catch(reportError);
    });
    byId('comments-previous').addEventListener('click', () => {
      if (state.commentPage > 1) state.commentPage -= 1;
      loadComments().catch(reportError);
    });
    byId('comments-next').addEventListener('click', () => {
      state.commentPage += 1;
      loadComments().catch(reportError);
    });
  }

  async function start() {
    if (state.started) return;
    state.started = true;
    bindEvents();
    resetPostForm();
    try {
      await Promise.all([loadPosts(), loadMedia(), loadComments(), loadTaxonomy().catch(reportError)]);
    } catch (error) {
      reportError(error);
    }
  }

  document.addEventListener('forge:authenticated', start);
  document.addEventListener('forge:signed-out', () => {
    state.started = false;
    state.posts = [];
    state.media = [];
    state.comments = [];
    state.taxonomy.categories = [];
    state.taxonomy.tags = [];
    if (taxonomyControls.categories) setTaxonomySelection('categories', []);
    if (taxonomyControls.tags) setTaxonomySelection('tags', []);
    byId('post-list').replaceChildren();
    byId('media-list').replaceChildren();
    byId('comment-list').replaceChildren();
  });
})();
