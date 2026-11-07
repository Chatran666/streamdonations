/* Almacén de archivos grandes (imágenes y GIF de fondo) compartido entre el panel y la ventana OBS.
   Usa IndexedDB: no ocupa el espacio de la configuración ni del historial. */
(function () {
    var DB = 'streamdonations_files', STORE = 'files';
    function open() {
        return new Promise(function (resolve, reject) {
            var q = indexedDB.open(DB, 1);
            q.onupgradeneeded = function () { q.result.createObjectStore(STORE); };
            q.onsuccess = function () { resolve(q.result); };
            q.onerror = function () { reject(q.error); };
        });
    }
    function tx(mode, fn) {
        return open().then(function (db) {
            return new Promise(function (resolve, reject) {
                var t = db.transaction(STORE, mode);
                var req = fn(t.objectStore(STORE));
                t.oncomplete = function () { resolve(req && req.result); db.close(); };
                t.onerror = function () { reject(t.error); db.close(); };
            });
        });
    }
    window.SDStore = {
        put: function (key, blob) { return tx('readwrite', function (s) { return s.put(blob, key); }); },
        get: function (key) { return tx('readonly', function (s) { return s.get(key); }).catch(function () { return null; }); },
        del: function (key) { return tx('readwrite', function (s) { return s.delete(key); }); }
    };
})();
