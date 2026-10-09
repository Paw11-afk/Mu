// Storage on the phone (IndexedDB), shared by the page and the service worker:
//   alerts  every alert that arrived as an end-to-end encrypted push from the HFAM PC
//   kv      small settings, e.g. the dashboard key (it arrives once, inside an encrypted push)
const HFAMDB = (() => {
  const open = () => new Promise((resolve, reject) => {
    const req = indexedDB.open("hfam", 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("alerts")) {
        const s = db.createObjectStore("alerts", { keyPath: "id", autoIncrement: true });
        s.createIndex("ts", "ts");
      }
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const tx = async (store, mode, fn) => {
    const db = await open();
    return new Promise((resolve, reject) => {
      const t = db.transaction(store, mode);
      const out = fn(t.objectStore(store));
      t.oncomplete = () => resolve(out && "result" in out ? out.result : out);
      t.onerror = () => reject(t.error);
    });
  };
  const api = {
    add: (rec) => tx("alerts", "readwrite", (s) => s.add(rec)),
    all: () => tx("alerts", "readonly", (s) => s.getAll()).then((rows) => rows.sort((a, b) => b.ts - a.ts)),
    clear: () => tx("alerts", "readwrite", (s) => s.clear()),
    markAllRead: async () => {
      const rows = await api.all();
      await tx("alerts", "readwrite", (s) => rows.filter((r) => !r.read).forEach((r) => s.put(Object.assign(r, { read: true }))));
    },
    unread: async () => (await api.all()).filter((r) => !r.read).length,
    kvGet: (k) => tx("kv", "readonly", (s) => s.get(k)),
    kvSet: (k, v) => tx("kv", "readwrite", (s) => s.put(v, k)),
  };
  return api;
})();
