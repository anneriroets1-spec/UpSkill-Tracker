/* Service worker: works offline and drives the Windows 11 widget. */
importScripts('db.js');

var CACHE = 'course-tracker-v1';
var SHELL = [
  './', 'index.html', 'styles.css', 'app.js', 'db.js', 'manifest.json',
  'widgets/template.json', 'icons/icon-192.png', 'icons/icon-512.png'
];
var WIDGET_TAG = 'up-next';

self.addEventListener('install', function (event) {
  event.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }));
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
      .then(renderWidgets)
  );
});

/* Serve from the network when online so updates arrive; fall back to the cache offline. */
self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req).then(function (res) {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { c.put(req, copy); });
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) { return hit || caches.match('index.html'); });
    })
  );
});

function appUrl() { return self.registration.scope; }

async function renderWidgets() {
  if (!self.widgets) return;
  var widget = await self.widgets.getByTag(WIDGET_TAG);
  if (!widget) return;
  var templateUrl = widget.definition.msAcTemplate || 'widgets/template.json';
  var template = await (await fetch(templateUrl)).text();
  var data = JSON.stringify(CT.widgetData(await CT.allCourses(), appUrl()));
  await self.widgets.updateByTag(WIDGET_TAG, { template: template, data: data });
}

async function tellPages() {
  var pages = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  pages.forEach(function (p) { p.postMessage({ type: 'changed' }); });
}

self.addEventListener('widgetinstall', function (event) { event.waitUntil(renderWidgets()); });
self.addEventListener('widgetresume', function (event) { event.waitUntil(renderWidgets()); });

self.addEventListener('widgetclick', function (event) {
  var action = event.action || '';
  if (action === 'open') {
    event.waitUntil(self.clients.openWindow(appUrl()));
    return;
  }
  if (action.indexOf('done:') === 0) {
    var id = action.slice(5);
    event.waitUntil(
      CT.getCourse(id).then(function (c) {
        if (!c) return;
        c.done = true;
        c.doneAt = new Date().toISOString();
        return CT.putCourse(c);
      }).then(renderWidgets).then(tellPages)
    );
  }
});

/* The app page asks for a refresh after every change. */
self.addEventListener('message', function (event) {
  if (event.data && event.data.type === 'refresh') event.waitUntil(renderWidgets());
});
