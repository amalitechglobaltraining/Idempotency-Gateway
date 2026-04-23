const express = require("express")
require("dotenv").config()
const paymentRoute = require("./routes/payment")

const app = express()

app.use(express.json())
app.use("/", paymentRoute)

app.use((err, req, res, next) => {
    return res.status(500).json({
        error: "Internal server error."
    })
})

app.listen(process.env.PORT || 3000, () => console.log(`server is running at PORT: ${process.env.PORT}`))