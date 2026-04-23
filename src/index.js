const express = require("express")
require("dotenv").config()
const rateLimit = require("express-rate-limit")
const paymentRoute = require("./routes/payment")

const app = express()

//Middleware
app.use(express.json())

//Rate limiter
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: {
        error: "Too many requests, please try again later"
    },
    standardHeaders: true,
    legacyHeaders: false
})

app.use(limiter)

//Routes
app.use("/", paymentRoute)

//Global error handler
app.use((err, req, res, next) => {
    return res.status(500).json({
        error: "Internal server error."
    })
})

app.listen(process.env.PORT || 3000, () => console.log(`server is running at PORT: ${process.env.PORT}`))