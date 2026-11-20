const CACHE = 'myhub-shell-v0.6.0';
const PREFIX = 'myhub-shell-';
const ASSETS = [
  './', './index.html', './styles.css', './weather.css', './timer.css', './calendar.css', './tasks.css', './football.css', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png',
  './js/app.js', './js/config.js', './js/i18n.js', './js/utils.js', './js/db.js',
  './js/calculator.js', './js/world-clock.js', './js/notes.js', './js/weather.js',
  './js/timer.js', './js/timer-core.js', './js/calendar.js', './js/calendar-core.js',
  './js/tasks.js', './js/tasks-core.js', './js/quick-list.js', './js/quick-list-core.js',
  './js/football.js', './js/football-core.js'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS.map(url=>new URL(url,self.registration.scope).href))));
});
self.addEventListener('activate', event => {
  event.waitUntil((async()=>{
    const names=await caches.keys();
    await Promise.all(names.filter(name=>name.startsWith(PREFIX)&&name!==CACHE).map(name=>caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if(event.data?.type==='SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET') return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin || !url.pathname.startsWith(new URL(self.registration.scope).pathname)) return;
  if(request.mode==='navigate') {
    event.respondWith((async()=>{
      try {
        const response=await fetch(request);
        if(response.ok){const cache=await caches.open(CACHE);cache.put(new URL('./index.html',self.registration.scope),response.clone());}
        return response;
      }catch{
        return await caches.match(new URL('./index.html',self.registration.scope)) || Response.error();
      }
    })());
    return;
  }
  event.respondWith((async()=>{
    const cached=await caches.match(request);
    if(cached) return cached;
    try { return await fetch(request); }
    catch { return Response.error(); }
  })());
});
