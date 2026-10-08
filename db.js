// Alert history on the phone (IndexedDB), shared by the page and the service worker.
// Everything the app shows arrived as an end-to-end encrypted push from the HFAM PC.
const HFAMDB = (() => {
  const open = () => new Promise((resolve, reject) => {
    const req = indexedDB.open("hfam", 1);
    req.onupgradeneeded = () => {
      const s = req.result.createObjectStore("alerts", { keyPath: "id", autoIncrement: true });
      s.createIndex("ts", "ts");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const tx = async (mode, fn) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction("alerts", mode);
      const out = fn(t.objectStore("alerts"));
      t.oncomplete = () => resolve(out && "result" in out ? out.result : out);
      t.onerror = () => reject(t.error);
    });
  };
  return {
    add: (rec) => tx("readwrite", (s) => s.add(rec)),
    all: () => tx("readonly", (s) => s.getAll()).then((rows) => rows.sort((a, b) => b.ts - a.ts)),
    clear: () => tx("readwrite", (s) => s.clear()),
    markAllRead: async () => {
      const rows = await HFAMDB.all();
      await tx("readwrite", (s) => rows.filter((r) => !r.read).forEach((r) => s.put(Object.assign(r, { read: true }))));
    },
    unread: async () => (await HFAMDB.all()).filter((r) => !r.read).length,
  };
})();
