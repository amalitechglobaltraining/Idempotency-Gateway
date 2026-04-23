const router = require("express").Router()
const idempotency = require("../middlewares/idempotency")
const {payment} = require("../controllers/payment")

router.post("/process-payment", idempotency, payment)

module.exports = {router}