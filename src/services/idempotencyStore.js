const store = new Map();
const TTL_MS = 24 * 60 * 60 * 1000;

//removes entries older than 24 hours
function cleanup() {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (now - entry.createdAt > TTL_MS) {
      store.delete(key);
    }
  }
}

// Returns the stored entry for this key
function getEntry(idempotencyKey) {
  return store.get(idempotencyKey);
}


function saveProcessing(idempotencyKey, bodyHash, promise) {
  store.set(idempotencyKey, {
    bodyHash,
    status: 'processing',
    promise,
    response: null,
    createdAt: Date.now(),
  });
}

// updates the entry with the final response
function saveComplete(idempotencyKey, response) {
  const entry = store.get(idempotencyKey);
  if (entry) {
    entry.status = 'done';
    entry.promise = null;
    entry.response = response;
  }
}

module.exports = { getEntry, saveProcessing, saveComplete, cleanup };