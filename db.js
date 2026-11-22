/* Shared storage for the app page and the service worker.
   Both run on the same origin, so they read and write the same IndexedDB. */
(function (g) {
  var DB_NAME = 'course-tracker';
  var STORE = 'courses';

  function openDB() {
    return new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        req.result.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function run(mode, fn) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, mode);
        var store = tx.objectStore(STORE);
        var result = fn(store);
        tx.oncomplete = function () { resolve(result && 'result' in result ? result.result : undefined); };
        tx.onerror = function () { reject(tx.error); };
      });
    });
  }

  function allCourses() { return run('readonly', function (s) { return s.getAll(); }).then(function (r) { return r || []; }); }
  function getCourse(id) { return run('readonly', function (s) { return s.get(id); }); }
  function putCourse(c) { return run('readwrite', function (s) { s.put(c); }); }
  function deleteCourse(id) { return run('readwrite', function (s) { s.delete(id); }); }
  function clearCourses() { return run('readwrite', function (s) { s.clear(); }); }

  function newId() {
    return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function sortCourses(list) {
    return list.slice().sort(function (a, b) {
      if (!!a.done !== !!b.done) return a.done ? 1 : -1;
      var ad = a.date || '9999-12-31', bd = b.date || '9999-12-31';
      if (ad !== bd) return ad < bd ? -1 : 1;
      return (a.title || '').localeCompare(b.title || '');
    });
  }

  function formatDate(iso) {
    if (!iso) return 'No date';
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d)) return 'No date';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function dueLabel(iso) {
    if (!iso) return 'No date';
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var d = new Date(iso + 'T00:00:00');
    var days = Math.round((d - today) / 86400000);
    var base = formatDate(iso);
    if (days < 0) return base + ' · overdue';
    if (days === 0) return base + ' · today';
    if (days === 1) return base + ' · tomorrow';
    return base;
  }

  /* The data the widget template is filled with. */
  function widgetData(list, appUrl) {
    var sorted = sortCourses(list);
    var total = list.length;
    var done = list.filter(function (c) { return c.done; }).length;
    var open = sorted.filter(function (c) { return !c.done; }).slice(0, 4);
    return {
      progress: total ? done + ' of ' + total + ' done' : '',
      empty: open.length === 0,
      emptyText: total ? 'Everything is ticked off. Well done!' : 'Open the app to add your first course.',
      items: open.map(function (c) {
        return {
          id: c.id,
          title: c.title,
          when: dueLabel(c.date),
          url: c.url || appUrl
        };
      })
    };
  }

  g.CT = {
    allCourses: allCourses, getCourse: getCourse, putCourse: putCourse,
    deleteCourse: deleteCourse, clearCourses: clearCourses, newId: newId,
    sortCourses: sortCourses, formatDate: formatDate, dueLabel: dueLabel,
    widgetData: widgetData
  };
})(self);
