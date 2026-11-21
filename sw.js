/* 인터넷 없이도 열리게: 연결되면 항상 새 파일을 받고(받은 파일은 기기에 보관), 연결이 없으면 보관한 파일로 연다. 내용이 바뀌지 않는 파일이라 다시 올릴 필요 없음 */
const CACHE='sequence-v1',FILES=['./','index.html','manifest.webmanifest','icon-180.png','icon-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));

function pushHistory(notice) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('sequence-notifications', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('history');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('history', notice ? 'readwrite' : 'readonly');
      const store = tx.objectStore('history');
      const read = store.get('latest');
      let items = [];
      read.onsuccess = () => {
        items = read.result || [];
        if (!notice) return;
        items = [notice, ...items.filter(item => item.tag !== notice.tag)]
          .sort((a, b) => b.receivedAt - a.receivedAt).slice(0, 50);
        store.put(items, 'latest');
      };
      tx.oncomplete = () => { db.close(); resolve(items); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  });
}

/* 앱에서 보낸 요약을 표시하고 요청별로 알림을 구분한다. */
self.addEventListener('push',event=>{
  let data;
  try { data=event.data?.json(); } catch (_) {}
  const app=data?.app;
  const title=app==='column'?'KPTR 앱허브 - 컬럼':app==='note'?'KPTR 앱허브 - 노트':'KPTR 앱허브';
  const known=app==='column'||app==='note';
  const body=known&&typeof data.body==='string'&&data.body?data.body:'새 요청이 있습니다.';
  const tag=known?'ailab-notice-'+app+(Number.isSafeInteger(data.noticeId)?'-'+data.noticeId:''):'ailab-notice';
  const receivedAt=Date.now();
  const historyTag=known&&Number.isSafeInteger(data.noticeId)?tag:tag+'-'+crypto.randomUUID();
  const saved=pushHistory({title,body,tag:historyTag,receivedAt}).then(async()=>{
    for(const client of await self.clients.matchAll({type:'window'}))client.postMessage('sequence-notification-saved');
  }).catch(()=>{});
  event.waitUntil(Promise.all([self.registration.showNotification(title,{body,tag,icon:'icon-180.png'}),saved]));
});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(clients.matchAll({type:'window'}).then(list=>list[0]?list[0].focus():clients.openWindow('./')))});
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(fetch(e.request,{cache:'no-store'}).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}).catch(()=>caches.match(e.request,{ignoreSearch:true}).then(r=>r||caches.match('index.html'))))});
