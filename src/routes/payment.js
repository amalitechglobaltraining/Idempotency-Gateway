const router = require("express").Router()
const idempotency = require("../middlewares/idempotency")
const {payment} = require("../controllers/payment")
const rateLimit = require("express-rate-limit")

const paymentLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: {
        error: "Too many payment requests, please slow down"
    }
})

router.post("/process-payment", paymentLimiter, idempotency, payment)

module.exports = router