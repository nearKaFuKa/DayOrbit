(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.WorkbenchWindow = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function createCoordinator({ locks, storage, key, onLost = () => {}, now = Date.now,
    schedule = setInterval, cancel = clearInterval, delay = setTimeout, id = `${Date.now()}-${Math.random()}` }) {
    const leaseKey = `${key}:lease`;
    const leaseMs = 30000;
    let active = false;
    let mode = '';
    let releaseLock = null;
    let heartbeat = null;
    let pendingClaim = null;
    let generation = 0;

    function readLease() {
      try {
        const value = JSON.parse(storage.getItem(leaseKey) || 'null');
        return value && typeof value.id === 'string' && Number.isFinite(value.until) ? value : null;
      } catch (_) { return null; }
    }
    function loseOwnership() {
      if (!active) return;
      active = false;
      if (heartbeat) cancel(heartbeat);
      heartbeat = null;
      if (releaseLock) releaseLock();
      releaseLock = null;
      mode = '';
      onLost();
    }
    function canWrite() {
      if (!active) return false;
      if (mode === 'locks') return true;
      const lease = readLease();
      // Background/sleep can pause timers. A live Web Lock still protects this
      // editor; an actually replaced lease must continue to stop it.
      if (lease?.id === id && (lease.until > now() || releaseLock)) return true;
      loseOwnership();
      return false;
    }
    async function claimLease() {
      const claimGeneration = generation;
      try {
        const lease = readLease();
        if (lease && lease.id !== id && lease.until > now()) return false;
        storage.setItem(leaseKey, JSON.stringify({ id, until: now() + leaseMs }));
        await new Promise(resolve => delay(resolve, 80));
        if (claimGeneration !== generation) return false;
        if (readLease()?.id !== id) return false;
        active = true;
        mode = 'lease';
        heartbeat = schedule(() => {
          if (!canWrite()) return;
          try { storage.setItem(leaseKey, JSON.stringify({ id, until: now() + leaseMs })); }
          catch (_) { loseOwnership(); }
        }, 3000);
        return true;
      } catch (_) { return false; }
    }
    async function attemptClaim() {
      if (canWrite()) return true;
      if (locks?.request) {
        const claimGeneration = generation;
        let resolveResult;
        const result = new Promise(resolve => { resolveResult = resolve; });
        try {
          locks.request(key, { ifAvailable: true }, lock => {
            if (!lock || claimGeneration !== generation) { resolveResult(false); return; }
            active = true;
            mode = 'locks';
            resolveResult(true);
            return new Promise(resolve => { releaseLock = resolve; });
          }).catch(() => resolveResult(null));
          const acquired = await result;
          if (acquired === false) return false;
          if (acquired === true) {
            const leased = await claimLease();
            if (!leased) release();
            return leased;
          }
        } catch (_) { /* Fall back when Web Locks is unavailable for this page. */ }
      }
      return claimLease();
    }
    function claim() {
      if (!pendingClaim) pendingClaim = attemptClaim().finally(() => { pendingClaim = null; });
      return pendingClaim;
    }
    function release() {
      generation += 1;
      if (heartbeat) cancel(heartbeat);
      heartbeat = null;
      try { if (readLease()?.id === id) storage.removeItem(leaseKey); } catch (_) {}
      if (releaseLock) releaseLock();
      releaseLock = null;
      active = false;
      mode = '';
    }
    return { claim, canWrite, release, check: canWrite, leaseKey };
  }
  return { createCoordinator };
});
