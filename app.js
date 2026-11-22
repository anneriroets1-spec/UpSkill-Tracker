(function () {
  var filter = 'open';
  var courses = [];
  var $ = function (id) { return document.getElementById(id); };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* Ask the service worker to redraw the widget after any change. */
  function refreshWidget() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then(function (reg) {
      if (reg.active) reg.active.postMessage({ type: 'refresh' });
    });
  }

  function load() {
    return CT.allCourses().then(function (list) { courses = list; render(); });
  }

  function save(c) {
    return CT.putCourse(c).then(load).then(refreshWidget);
  }

  function render() {
    var done = courses.filter(function (c) { return c.done; }).length;
    $('count').textContent = done + ' of ' + courses.length;
    $('bar').style.width = courses.length ? Math.round(done / courses.length * 100) + '%' : '0';

    var groups = {};
    courses.forEach(function (c) { if (c.group) groups[c.group] = 1; });
    var dl = $('groups'); dl.textContent = '';
    Object.keys(groups).sort().forEach(function (g) { var o = el('option'); o.value = g; dl.appendChild(o); });

    var list = $('list'); list.textContent = '';
    var shown = CT.sortCourses(courses).filter(function (c) {
      return filter === 'all' || (filter === 'done' ? c.done : !c.done);
    });
    if (!shown.length) {
      list.appendChild(el('p', 'empty',
        !courses.length ? 'No courses yet. Add your first one above.' :
        filter === 'done' ? 'Nothing ticked off yet.' : 'Everything is ticked off. Well done!'));
      return;
    }
    shown.forEach(function (c) { list.appendChild(row(c)); });
  }

  function row(c) {
    var r = el('div', 'row' + (c.done ? ' is-done' : ''));
    var cb = el('input'); cb.type = 'checkbox'; cb.checked = !!c.done; cb.id = 'cb-' + c.id;
    cb.setAttribute('aria-label', 'Done: ' + c.title);
    cb.addEventListener('change', function () {
      c.done = cb.checked; c.doneAt = cb.checked ? new Date().toISOString() : null; save(c);
    });
    r.appendChild(cb);

    var body = el('div');
    var t;
    if (c.url) { t = el('a', 'title', c.title); t.href = c.url; t.target = '_blank'; t.rel = 'noopener'; }
    else t = el('span', 'title', c.title);
    body.appendChild(t);
    var meta = el('div', 'meta');
    var due = el('span', null, CT.dueLabel(c.date));
    if (!c.done && /overdue/.test(due.textContent)) due.className = 'overdue';
    meta.appendChild(due);
    if (c.group) meta.appendChild(el('span', 'tag', c.group));
    body.appendChild(meta);
    r.appendChild(body);

    var actions = el('div', 'actions');
    var edit = el('button', null, 'Edit'); edit.type = 'button';
    edit.setAttribute('aria-label', 'Edit ' + c.title);
    edit.addEventListener('click', function () { startEdit(c); });
    var del = el('button', null, 'Delete'); del.type = 'button';
    del.setAttribute('aria-label', 'Delete ' + c.title);
    del.addEventListener('click', function () {
      if (window.confirm('Delete "' + c.title + '"?')) CT.deleteCourse(c.id).then(load).then(refreshWidget);
    });
    actions.appendChild(edit); actions.appendChild(del);
    r.appendChild(actions);
    return r;
  }

  function startEdit(c) {
    $('edit-id').value = c.id;
    $('f-title').value = c.title || '';
    $('f-date').value = c.date || '';
    $('f-group').value = c.group || '';
    $('f-url').value = c.url || '';
    $('form-title').textContent = 'Edit course';
    $('save').textContent = 'Save changes';
    $('cancel').hidden = false;
    $('f-title').focus();
    window.scrollTo({ top: $('form').getBoundingClientRect().top + window.scrollY - 80 });
  }

  function resetForm() {
    $('form').reset(); $('edit-id').value = '';
    $('form-title').textContent = 'Add a course';
    $('save').textContent = 'Add course';
    $('cancel').hidden = true;
  }

  $('form').addEventListener('submit', function (e) {
    e.preventDefault();
    var id = $('edit-id').value;
    var existing = courses.filter(function (c) { return c.id === id; })[0];
    var c = existing || { id: CT.newId(), done: false, createdAt: new Date().toISOString() };
    c.title = $('f-title').value.trim();
    if (!c.title) return;
    c.date = $('f-date').value || '';
    c.group = $('f-group').value.trim();
    c.url = $('f-url').value.trim();
    save(c).then(resetForm);
  });
  $('cancel').addEventListener('click', resetForm);

  Array.prototype.forEach.call(document.querySelectorAll('.chip'), function (b) {
    b.addEventListener('click', function () {
      filter = b.getAttribute('data-filter');
      Array.prototype.forEach.call(document.querySelectorAll('.chip'), function (x) {
        x.setAttribute('aria-pressed', String(x === b));
      });
      render();
    });
  });

  $('export').addEventListener('click', function () {
    var text = JSON.stringify(CT.sortCourses(courses), null, 1);
    $('io').value = text;
    $('io').select();
    var ok = function () { $('io-status').textContent = 'Copied. Paste it somewhere safe.'; };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(ok, function () { $('io-status').textContent = 'Select the text and copy it.'; });
    else $('io-status').textContent = 'Select the text and copy it.';
  });

  $('import').addEventListener('click', function () {
    var data;
    try { data = JSON.parse($('io').value); } catch (e) { data = null; }
    if (!Array.isArray(data)) { $('io-status').textContent = 'That doesn’t look like a course list. Paste the full text you copied.'; return; }
    var clean = data.filter(function (c) { return c && typeof c.title === 'string' && c.title.trim(); }).map(function (c) {
      return {
        id: typeof c.id === 'string' && c.id ? c.id : CT.newId(),
        title: c.title.trim().slice(0, 120),
        date: /^\d{4}-\d{2}-\d{2}$/.test(c.date || '') ? c.date : '',
        group: typeof c.group === 'string' ? c.group.slice(0, 40) : '',
        url: typeof c.url === 'string' && /^https?:\/\//.test(c.url) ? c.url : '',
        done: !!c.done
      };
    });
    if (!clean.length) { $('io-status').textContent = 'No courses found in the pasted text.'; return; }
    if (courses.length && !window.confirm('Add ' + clean.length + ' courses to your list? Courses with the same ID are replaced.')) return;
    clean.reduce(function (p, c) { return p.then(function () { return CT.putCourse(c); }); }, Promise.resolve())
      .then(load).then(refreshWidget).then(function () {
        $('io-status').textContent = 'Loaded ' + clean.length + ' courses.';
        $('io').value = '';
      });
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(function () {});
    navigator.serviceWorker.addEventListener('message', function (e) {
      if (e.data && e.data.type === 'changed') load();
    });
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) load(); });

  load();
})();
