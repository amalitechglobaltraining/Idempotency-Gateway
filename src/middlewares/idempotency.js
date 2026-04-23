const store = require("../store/idempotencyStore")
const {hashBody} = require("../utils/hash")

async function idempotencyMiddleware(req,res,next) {
    const idempotencyKey = req.headers['idempotency-key']

    if(!idempotencyKey){
        return res.status(400).json({
            error: "Missing required header: Idempotency-key"
        })
    }

    const incomingHash = hashBody(req.body)
    const existing = store.getEntry(idempotencyKey)

    // we create a new entry if not existing
    if(!existing){
        store.setEntry(idempotencyKey, {
            status: 'processing',
            bodyHash: incomingHash,
            response: null,
            statusCode: null,
            waiters: []
        })

        const originalJSON = res.json.bind(res)

        // body here will be the outgoing body response
        res.json = function(body){
            store.updateEntry(idempotencyKey, {
                status: 'completed',
                response: body,
                statusCode: res.statusCode
            })

            // multiple entry
            const entry = store.getEntry(idempotencyKey)
            if(entry && entry.waiters.length > 0){
                entry.waiters.forEach(resolve => resolve({
                    body,
                    statusCode: res.statusCode
                }))
            }

            return originalJSON(body)
        }

        return next()
    }

    if(existing.hashBody === incomingHash){
        return res.status(422).json({
            error: "Idempotency key already used for a different request body"
        })
    }

    if(existing.status === 'completed'){
        res.set('X-Cache-Hit', 'true')
        return res.status(existing.statusCode).json(existing.response)
    }

    if(existing.status === 'processing'){
        const result = await new Promise(resolve => {
            existing.waiters.push(resolve)
        })

        res.set('X-Cache-Hit','true')
        return res.status(result.statusCode).json(result.body)
    }
}

module.exports = idempotencyMiddleware