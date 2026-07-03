/* Firebase Cloud Messaging service worker for tefillah.in.
 * Handles push notifications delivered while the site is in the background
 * or closed. The config below is public client config (not secret). */
/* eslint-disable no-undef */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyBbPEpfgLtCMk07KzXNy9Y_S_0124rLRVU',
  authDomain: 'tefillah-2283c.firebaseapp.com',
  projectId: 'tefillah-2283c',
  storageBucket: 'tefillah-2283c.firebasestorage.app',
  messagingSenderId: '240620097116',
  appId: '1:240620097116:web:b205d0acfbfdf5a8daa099',
});

// Activate immediately and take control, so push subscription works on first enable
// (avoids "no active Service Worker" when the token is requested right after registering).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

const messaging = firebase.messaging();

// Show a notification when a push arrives and the page isn't focused.
messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || 'Tefillah';
  const options = {
    body: (payload.notification && payload.notification.body) || '',
    icon: '/icon.png',
    badge: '/favicon.png',
    data: payload.data || {},
  };
  self.registration.showNotification(title, options);
});

// Focus or open the app when a notification is clicked.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    }),
  );
});
