/* =====================================================================
   Forja de Tomos — Biblioteca de imagens (IndexedDB)
   Imagens enviadas do computador ficam salvas no navegador e são
   referenciadas no texto como  ![legenda](img:ID)
   ===================================================================== */
(function (global) {
  'use strict';
  const DB = 'forjaDeTomos', ST = 'images';
  let dbp = null;
  const urls = new Map();
  const meta = new Map();

  function open() {
    if (!dbp) {
      dbp = new Promise((res, rej) => {
        const r = indexedDB.open(DB, 1);
        r.onupgradeneeded = () => r.result.createObjectStore(ST, { keyPath: 'id' });
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    }
    return dbp;
  }
  const store = mode => open().then(db => db.transaction(ST, mode).objectStore(ST));
  const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const blobToDataURL = b => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(b); });

  function remember(rec) {
    if (urls.has(rec.id)) URL.revokeObjectURL(urls.get(rec.id));
    urls.set(rec.id, URL.createObjectURL(rec.blob));
    meta.set(rec.id, { id: rec.id, name: rec.name, created: rec.created });
  }

  async function init() {
    try {
      const all = await req((await store('readonly')).getAll());
      all.forEach(remember);
    } catch (e) { console.warn('Biblioteca de imagens indisponível:', e); }
  }

  const newId = () => Math.random().toString(36).slice(2, 7) + Date.now().toString(36).slice(-4);

  async function add(blob, name) {
    const rec = { id: newId(), name: (name || 'imagem').replace(/\.[a-z0-9]+$/i, ''), blob, created: Date.now() };
    try { await req((await store('readwrite')).put(rec)); } catch (e) { console.warn(e); }
    remember(rec);
    return rec.id;
  }

  async function remove(id) {
    try { await req((await store('readwrite')).delete(id)); } catch (e) { console.warn(e); }
    if (urls.has(id)) URL.revokeObjectURL(urls.get(id));
    urls.delete(id); meta.delete(id);
  }

  async function exportAll(onlyIds) {
    const all = await req((await store('readonly')).getAll());
    return Promise.all(all.filter(r => !onlyIds || onlyIds.has(r.id))
      .map(async r => ({ id: r.id, name: r.name, data: await blobToDataURL(r.blob) })));
  }

  async function importAll(list) {
    for (const it of list || []) {
      const blob = await (await fetch(it.data)).blob();
      const rec = { id: it.id, name: it.name, blob, created: Date.now() };
      try { await req((await store('readwrite')).put(rec)); } catch (e) { console.warn(e); }
      remember(rec);
    }
  }

  global.ImageStore = {
    init, add, remove, exportAll, importAll,
    url: id => urls.get(id),
    list: () => [...meta.values()].sort((a, b) => b.created - a.created)
  };
})(window);
