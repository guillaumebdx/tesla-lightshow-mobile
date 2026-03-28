// Service Worker for LightShow Studio Admin PWA — Push Notifications

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Handle push notifications
self.addEventListener('push', (event) => {
  let data = { title: 'LightShow Studio', body: 'New notification' };
  try {
    data = event.data.json();
  } catch (e) {
    data.body = event.data?.text() || data.body;
  }

  const options = {
    body: data.body,
    icon: '/admin/icon-192.png',
    badge: '/admin/icon-192.png',
    vibrate: [200, 100, 200, 100, 200],
    tag: 'chat-' + (data.data?.conversationId || 'general'),
    renotify: true,
    data: data.data || {},
    actions: [
      { action: 'open', title: 'Open chat' },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options).then(() => {
      // Update badge count
      if (navigator.setAppBadge) {
        navigator.setAppBadge(data.badge || 1);
      }
    })
  );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/admin/chat';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      // Focus existing tab if available
      for (const client of clients) {
        if (client.url.includes('/admin/') && 'focus' in client) {
          return client.focus().then((c) => c.navigate(url));
        }
      }
      // Open new tab
      return self.clients.openWindow(url);
    })
  );
});
