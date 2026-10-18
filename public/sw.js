// Service worker 3Rally: HANYA untuk notifikasi push.
// Sengaja tanpa handler "fetch" / cache: aplikasi tidak punya mode offline (CLAUDE.md §6.10),
// supaya tidak ada catatan yang tersimpan diam-diam lalu dikirim belakangan.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { isi: event.data ? event.data.text() : "" };
  }
  const tag = data.tag || undefined;
  event.waitUntil(
    self.registration.showNotification(data.judul || "3Rally", {
      body: data.isi || "",
      icon: "/pwa-icon/192",
      badge: "/pwa-icon/192",
      tag,
      renotify: !!tag, // tag sama (mis. "setujui") menggantikan notifikasi lama tapi tetap berbunyi
      data: { url: data.url || "/beranda" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const tujuan = new URL(event.notification.data?.url || "/beranda", self.location.origin);
  // hanya buka halaman 3Rally sendiri
  const url = tujuan.origin === self.location.origin ? tujuan.href : self.location.origin + "/beranda";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((daftar) => {
      for (const c of daftar) {
        if (c.url.startsWith(self.location.origin) && "focus" in c) {
          return c.focus().then((w) => (w && "navigate" in w ? w.navigate(url) : w));
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
