

const crypto = require('crypto');
   
function canonicalize(value) {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
//check if value is an object
  if (value !== null && typeof value === 'object') {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = canonicalize(value[key]);
        return acc;
      }, {});
  }

  return value;
}
//hash the body
function hashBody(body) {
  const canonical = canonicalize(body);
  const str = JSON.stringify(canonical);
  return crypto.createHash('sha256').update(str).digest('hex');
}

module.exports = hashBody;




