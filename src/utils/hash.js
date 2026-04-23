const crypto = require("crypto")

function hashBody(body){
    const normalized = JSON.stringify(body, Object.keys(body).sort())
    return crypto.createHash('sha256').update(normalized).digest('hex')
}

module.exports = {hashBody}