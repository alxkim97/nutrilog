import { precacheAndRoute } from 'workbox-precaching'

precacheAndRoute(self.__WB_MANIFEST)

// Take over as soon as a new version installs, so a deploy reaches an open app
// (swUpdate.js then reloads the page onto it).
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// Push-ready: shows a notification when a sender exists (none yet).
self.addEventListener('push', (event) => {
  let data = { title: 'NutriLog', body: 'Time to log your meals.' }
  try { if (event.data) data = event.data.json() } catch { /* non-JSON payload: keep the default */ }
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body, icon: './icon-192.png' }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(self.clients.matchAll({ type: 'window' }).then((clients) => {
    for (const c of clients) if ('focus' in c) return c.focus()
    if (self.clients.openWindow) return self.clients.openWindow('./')
  }))
})