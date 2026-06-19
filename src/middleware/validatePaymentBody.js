function ValidatePaymentBody(req,res,next){
 //check if body is empty
    if (!req.body || Object.keys(req.body).length === 0) {
    return res.status(400).json({ error: 'Invalid or missing request body' });
  }
    const {amount , currency} =req.body
//check if amount is a positive number
    if(typeof amount !== "number" ||amount<=0 || !Number.isFinite(amount)){
        return res.status(400).json({error:"Amount must be a positive number"})
    }
//check if currency is a 3-letter code
 if (typeof currency !== 'string' || !/^[A-Za-z]{3}$/.test(currency.trim())) {
    return res.status(400).json({ error: 'Currency must be a 3-letter code' });
  }
//convert currency to uppercase
req.body.currency = currency.trim().toUpperCase();

next();
}







module.exports = ValidatePaymentBody