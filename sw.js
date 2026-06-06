// ============================================================
// sw.js — Service Worker untuk Lumina Chat PWA
// Menangani: cache aset offline & push notification standar
// ============================================================

const CACHE_NAME = 'lumina-chat-v1';

// Daftar aset yang akan di-cache saat install
const ASSETS_TO_CACHE = [
  '/index.html',
  '/manifest.json',
  'https://fonts.googleapis.com/css2?family=Geist:wght@100..900&display=swap',
  'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap'
];

// ── INSTALL: Cache semua aset statis ──────────────────────────
self.addEventListener('install', (event) => {
  console.log('[SW] Installing Lumina Chat Service Worker...');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Cache aset lokal saja, aset eksternal bisa gagal tanpa merusak SW
      return cache.addAll(['/index.html', '/manifest.json']).catch(() => {});
    })
  );
  // Langsung aktif tanpa menunggu tab lama tertutup
  self.skipWaiting();
});

// ── ACTIVATE: Bersihkan cache lama ───────────────────────────
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating Lumina Chat Service Worker...');
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    )
  );
  // Ambil alih semua klien yang sudah ada
  self.clients.claim();
});

// ── FETCH: Strategi Network-first, fallback ke cache ─────────
self.addEventListener('fetch', (event) => {
  // Hanya tangani GET request
  if (event.request.method !== 'GET') return;

  // Jangan intercept request ke Supabase/InsForge (realtime)
  const url = new URL(event.request.url);
  if (
    url.hostname.includes('supabase.co') ||
    url.hostname.includes('supabase.in') ||
    url.protocol === 'chrome-extension:'
  ) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Simpan salinan ke cache jika berhasil
        if (response && response.status === 200) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Jika offline, ambil dari cache
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // Fallback ke index.html untuk navigasi
          if (event.request.mode === 'navigate') {
            return caches.match('/index.html');
          }
        });
      })
  );
});

// ── PUSH NOTIFICATION: Tampilkan notifikasi standar ──────────
self.addEventListener('push', (event) => {
  let data = { title: 'Lumina Chat', body: 'Pesan baru masuk!' };
  try {
    data = event.data.json();
  } catch (e) {}

  const options = {
    body: data.body,
    icon: '/manifest.json', // Menggunakan ikon dari manifest
    badge: '/manifest.json',
    vibrate: [200, 100, 200],
    data: { url: self.registration.scope },
    actions: [{ action: 'open', title: 'Buka Chat' }]
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// ── NOTIFICATION CLICK: Buka/fokus jendela aplikasi ──────────
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      if (clientList.length > 0) {
        return clientList[0].focus();
      }
      return clients.openWindow(self.registration.scope);
    })
  );
});
