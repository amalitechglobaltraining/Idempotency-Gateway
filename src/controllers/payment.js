
const payment = async(req,res) => {
    const {amount, currency} = req.body

    if(amount === undefined || currency === undefined){
        return res.status(400).json({error: "Body must include amount and currency"})
    }

    if(typeof amount !== "number" || amount <= 0){
        return res.status(400).json({error: "amount must be a positive number"})
    }

    if(typeof currency !== "string" || currency.trim().length === 0){
        return res.status(400).json({error: 'currency must be a non-empty string.'})
    }

    // we simulate a 2 second delay
    await new Promise(resolve => setTimeout(resolve), 2000)

    return res.status(201).json({
        status: 'success',
        message: `Charged: ${amount} ${currency.toUpperCase()}`,
        transactionId: `txn_${Date.now()}`
    })
}

module.exports = {payment}