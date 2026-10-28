/*
 * Resource comments: refreshes approved comments from the public API and submits new ones.
 * All user-supplied text is inserted with textContent only; no HTML strings are built.
 */
(function () {
  'use strict';

  var root = document.querySelector('[data-comments]');
  if (!root || typeof window.fetch !== 'function') {
    return;
  }

  var apiUrl = (root.getAttribute('data-api-url') || '').replace(/\/+$/, '');
  var slug = root.getAttribute('data-slug') || '';
  if (apiUrl === '' || slug === '') {
    return;
  }

  var endpoint = apiUrl + '/posts/' + encodeURIComponent(slug) + '/comments';
  var list = root.querySelector('[data-comment-list]');
  var emptyNote = root.querySelector('[data-comment-empty]');
  var countLabel = root.querySelector('[data-comment-count]');
  var form = root.querySelector('[data-comment-form]');
  var statusEl = form ? form.querySelector('[data-comment-status]') : null;

  function formatDate(value) {
    var date = new Date(value);
    if (isNaN(date.getTime())) {
      return '';
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function buildComment(comment) {
    var item = document.createElement('li');
    item.className = 'comment';

    var meta = document.createElement('div');
    meta.className = 'comment__meta';

    var author = document.createElement('strong');
    author.textContent = typeof comment.author_name === 'string' && comment.author_name !== '' ? comment.author_name : 'Anonymous';
    meta.appendChild(author);

    var label = typeof comment.created_at === 'string' ? formatDate(comment.created_at) : '';
    if (label !== '') {
      var time = document.createElement('time');
      time.setAttribute('datetime', new Date(comment.created_at).toISOString());
      time.textContent = label;
      meta.appendChild(time);
    }

    var body = document.createElement('p');
    body.className = 'comment__body';
    body.textContent = typeof comment.body === 'string' ? comment.body : '';

    item.appendChild(meta);
    item.appendChild(body);
    return item;
  }

  function renderComments(comments) {
    if (!list) {
      return;
    }
    while (list.firstChild) {
      list.removeChild(list.firstChild);
    }
    comments.forEach(function (comment) {
      if (comment && typeof comment === 'object') {
        list.appendChild(buildComment(comment));
      }
    });
    if (emptyNote) {
      emptyNote.hidden = list.children.length > 0;
    }
    if (countLabel) {
      countLabel.textContent = '(' + list.children.length + ')';
    }
  }

  function refresh() {
    fetch(endpoint, { headers: { Accept: 'application/json' }, credentials: 'omit' })
      .then(function (response) {
        return response.ok ? response.json() : null;
      })
      .then(function (payload) {
        if (payload && Array.isArray(payload.data)) {
          renderComments(payload.data);
        }
      })
      .catch(function () {
        // Keep the server-rendered comments when the API cannot be reached.
      });
  }

  function setStatus(message, state) {
    if (!statusEl) {
      return;
    }
    statusEl.textContent = message;
    if (state) {
      statusEl.setAttribute('data-state', state);
    } else {
      statusEl.removeAttribute('data-state');
    }
  }

  function fieldValue(name) {
    var field = form.elements.namedItem(name);
    return field && typeof field.value === 'string' ? field.value : '';
  }

  function errorMessage(status, payload) {
    if (status === 422) {
      var parts = [];
      if (payload && payload.fields && typeof payload.fields === 'object') {
        Object.keys(payload.fields).forEach(function (key) {
          if (typeof payload.fields[key] === 'string') {
            parts.push(payload.fields[key]);
          }
        });
      }
      if (parts.length === 0 && payload && typeof payload.error === 'string') {
        parts.push(payload.error);
      }
      return parts.length > 0 ? 'Please check your comment: ' + parts.join(' ') : 'Please check the form and try again.';
    }
    if (status === 429) {
      return 'You are posting too quickly. Please wait a moment and try again.';
    }
    if (status === 403) {
      return 'Comments are closed for this resource.';
    }
    if (status === 404) {
      return 'This resource is no longer available.';
    }
    return 'Your comment could not be sent. Please try again later.';
  }

  if (form) {
    var submitButton = form.querySelector('button[type="submit"]');

    form.addEventListener('submit', function (event) {
      event.preventDefault();

      if (typeof form.checkValidity === 'function' && !form.checkValidity()) {
        if (typeof form.reportValidity === 'function') {
          form.reportValidity();
        }
        setStatus('Please fill in your name, a valid email and your comment.', 'error');
        return;
      }

      var payload = {
        author_name: fieldValue('author_name').trim(),
        author_email: fieldValue('author_email').trim(),
        body: fieldValue('body').trim(),
        website: fieldValue('website')
      };

      if (submitButton) {
        submitButton.disabled = true;
      }
      setStatus('Sending…', null);

      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'omit',
        body: JSON.stringify(payload)
      })
        .then(function (response) {
          return response.json().catch(function () {
            return null;
          }).then(function (json) {
            return { status: response.status, payload: json };
          });
        })
        .then(function (result) {
          if (result.status === 202) {
            form.reset();
            setStatus('Thanks! Your comment is awaiting moderation and will appear once approved.', 'success');
            return;
          }
          setStatus(errorMessage(result.status, result.payload), 'error');
        })
        .catch(function () {
          setStatus('Your comment could not be sent. Please check your connection and try again.', 'error');
        })
        .then(function () {
          if (submitButton) {
            submitButton.disabled = false;
          }
        });
    });
  }

  refresh();
})();
