// In-memory store for idempotency logic
// Structure: {
//   [idempotencyKey]: {
//     body: <stringified request body>,
//     response: { statusCode, body, headers },
//     promise: Promise (for in-flight requests)
//   }
// }
const idempotencyStore = new Map();

module.exports = idempotencyStore;
