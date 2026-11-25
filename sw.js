const CACHE='myhub-shell-v7.6.0';
const PREFIX='myhub-shell-';
// Separate from shell cache: incoming shares are private, temporary, and never deployed.
const SHARE_INBOX='myhub-share-inbox-v1';
const ASSETS=[
  './','./index.html','./share.html','./share.css','./styles.css','./weather.css','./timer.css','./calendar.css','./tasks.css','./football.css','./rss.css','./utilities.css','./today.css','./search.css','./quick-add.css','./mini-tools.css','./manifest.webmanifest',
  './icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-512.png',
  './js/app.js','./js/resume-core.js','./js/navigation-core.js','./js/everyday-view-core.js','./js/interaction-stability-core.js','./js/network-fallback-core.js','./js/config.js','./js/i18n.js','./js/utils.js','./js/db.js','./js/meta-save-core.js','./js/settings-layout-core.js',
  './js/calculator.js','./js/world-clock.js','./js/notes.js','./js/notes-templates-core.js','./js/notes-save-core.js','./js/notes-editor-safety-core.js','./js/notes-draft-core.js','./js/notes-list-core.js','./js/note-quick-core.js','./js/notes-category-core.js','./js/notes-bulk-core.js','./js/notes-checklist-core.js','./js/notes-trash-core.js','./js/note-actions-core.js','./js/notes-view-core.js','./js/weather.js','./js/weather-cache-core.js','./js/weather-rain-core.js','./js/weather-hour-core.js','./js/weather-day-compare-core.js','./js/weather-quick-core.js','./js/weather-practical-core.js','./js/weather-freshness-core.js','./js/weather-glance-core.js','./js/foreground-refresh-core.js',
  './js/form-recovery-core.js','./js/timer.js','./js/timer-core.js','./js/calendar.js','./js/calendar-core.js',
  './js/tasks.js','./js/tasks-core.js','./js/quick-list.js','./js/quick-list-core.js','./js/quick-list-recovery-core.js',
  './js/football.js','./js/football-live.js','./js/football-live-core.js','./js/football-today-core.js','./js/football-second-source.js','./js/football-second-source-core.js','./js/football-core.js','./js/football-result-quality-core.js','./js/football-refresh-core.js','./js/football-recovery-core.js','./js/rss.js','./js/rss-core.js',
  './js/unit-core.js','./js/date-core.js','./js/percent-core.js','./js/bookmarks-core.js',
  './js/utilities.js','./js/bookmarks.js','./js/today-core.js','./js/today-actions-core.js','./js/today.js','./js/diagnostics-core.js','./js/diagnostics.js','./js/search-core.js','./js/search.js','./js/quick-add-core.js','./js/quick-add.js',
  './js/share-core.js','./js/share-notes-core.js','./js/share-target.js',
  './js/cross-actions-core.js','./js/unit-favourites-core.js','./js/recent-core.js','./js/visibility-core.js','./js/tool-order-core.js','./js/pwa-health-core.js','./js/pwa-health.js','./js/backup-preview-core.js','./js/backup-integrity-core.js','./js/backup-diagnostics-core.js','./js/storage-safety-core.js','./js/backup-guard-core.js','./js/unsaved-form-core.js','./js/text-counter-core.js','./js/text-counter.js','./js/random-core.js','./js/random-generator.js'
];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS.map(asset=>new URL(asset,self.registration.scope).href))));
});
self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const names=await caches.keys();
    await Promise.all(names.filter(name=>name.startsWith(PREFIX)&&name!==CACHE).map(name=>caches.delete(name)));
    await self.clients.claim();
  })());
});
self.addEventListener('message',event=>{
  if(event.data?.type==='SHELL_STATUS'){
    // A read-only reply sent through the requesting page's MessageChannel.
    // Never expose personal data, caches contents or incoming shares.
    event.ports?.[0]?.postMessage({type:'SHELL_STATUS',version:CACHE.slice(PREFIX.length+1),cacheName:CACHE});
    return;
  }
  if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
});
self.addEventListener('fetch',event=>{
  const request=event.request;
  const url=new URL(request.url);
  const scope=new URL(self.registration.scope);
  if(url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
  const sharePage=new URL('./share.html',scope);
  // POST is handled entirely by the service worker; the shared address is
  // never sent to GitHub Pages as a GET query parameter or server POST.
  if(request.method==='POST'&&url.pathname===sharePage.pathname){
    event.respondWith((async()=>{
      try{
        const form=await request.formData();
        const limited=(name,max)=>{
          const value=form.get(name);
          if(typeof value!=='string')return '';
          // Never silently lose the end of someone's shared note.
          if(value.length>max){const error=Error('Shared text too large');error.code='tooLarge';throw error;}
          return value;
        };
        const data={title:limited('title',12000),text:limited('text',100000),url:limited('url',12000)};
        const token=crypto.randomUUID();
        const dest=new URL('./share.html',scope);
        dest.searchParams.set('shareId',token);
        const inbox=await caches.open(SHARE_INBOX);
        await inbox.put(dest.href,new Response(JSON.stringify(data),{
          headers:{'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store'}
        }));
        return Response.redirect(dest.href,303);
      }catch(err){
        console.error('Share reception failed',err);
        return Response.redirect(new URL('./share.html?shareError='+(err?.code==='tooLarge'?'tooLarge':'storage'),scope).href,303);
      }
    })());
    return;
  }
  if(request.method!=='GET')return;
  if(request.mode==='navigate'){
    event.respondWith((async()=>{
      // Share landing has its own offline fallback: do NOT replace cached index
      // with share.html (a bug in generic navigation caches).
      const isShare=url.pathname===sharePage.pathname;
      const base=new URL(isShare?'./share.html':'./index.html',scope);
      // Use the HTML that belongs to THIS installed worker's versioned shell.
      // Network-first navigation could mix a newly deployed HTML page with
      // old cached JavaScript while an update is still waiting.
      const cache=await caches.open(CACHE);
      const cached=await cache.match(base.href);
      if(cached)return cached;
      try{return await fetch(request);}catch{return Response.error();}
    })());
    return;
  }
  event.respondWith((async()=>{
    // Only serve assets from THIS worker's versioned shell cache.
    // caches.match() across all caches may return stale assets from an older worker.
    const shell=await caches.open(CACHE);
    const cached=await shell.match(request);
    if(cached)return cached;
    try{return await fetch(request);}catch{return Response.error();}
  })());
});
