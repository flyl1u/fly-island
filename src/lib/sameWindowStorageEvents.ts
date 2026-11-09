// The browser fires `storage` events only in other windows. Settings shown inside the
// island share its window, yet every hook keeps itself in step through those events
// (as it does with the standalone settings window). This makes a write in this window
// announce itself here too. Only real changes are announced, so a listener that loads
// a value and saves it back unchanged ends the echo instead of looping.

let installed = false;

function announce(key: string | null, oldValue: string | null, newValue: string | null) {
  // After the writer's own code has run, as a write from another window would arrive.
  queueMicrotask(() => {
    window.dispatchEvent(new StorageEvent("storage", { key, oldValue, newValue, storageArea: window.localStorage }));
  });
}

/** Installs the same-window `storage` events for localStorage writes, once per window. */
export function installSameWindowStorageEvents() {
  if (installed) return;
  installed = true;
  // Patched on the prototype: assigning onto a Storage object would store an item instead.
  const prototype = Storage.prototype;
  const setItem = prototype.setItem;
  const removeItem = prototype.removeItem;

  prototype.setItem = function (this: Storage, key: string, value: string) {
    if (this !== window.localStorage) return setItem.call(this, key, value);
    const oldValue = this.getItem(key);
    setItem.call(this, key, value);
    const newValue = String(value);
    if (oldValue !== newValue) announce(key, oldValue, newValue);
  };
  prototype.removeItem = function (this: Storage, key: string) {
    if (this !== window.localStorage) return removeItem.call(this, key);
    const oldValue = this.getItem(key);
    removeItem.call(this, key);
    if (oldValue !== null) announce(key, oldValue, null);
  };
}
