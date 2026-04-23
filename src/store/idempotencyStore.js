const store = new Map()
const TTL_MS = 24 * 60 * 60 * 1000

function setEntry(key, value){
    store.set(key, {...value, createdAt: Date.now()})
}

function getEntry(key){
    const entry = store.get(key)

    if(!entry) return null

    //delete expired entry
    if(Date.now() - entry.createdAt > TTL_MS){
        store.delete(key)
        return null
    }

    return entry
}

function updateEntry(key, patch){
    const existing = store.get(key)

    if(!existing) return null

    const updated = {...existing, ...patch }

    if(patch.status === 'completed'){
        updated.createdAt = Date.now()
    }

    store.set(key, updated)
}

module.exports = {setEntry, getEntry, updateEntry}
