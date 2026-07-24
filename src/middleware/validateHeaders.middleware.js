export const validateHeaders = function ValidateHeaders(req, res, next) {
// idempotency key is present
    const idempotencyKey = req.get('Idempotency-Key');
    if(!idempotencyKey || idempotencyKey.trim().length === 0) {
        return res.status(400).json({error: 'Idempotency-Key header is required'})
       
    }
// length of idempotency key
    if(idempotencyKey.length>255){
        return res.status(400).json({error:'Idempotency-Key must be 255 characters or fewer'})
    }
//store idempotency key in request
    req.idempotencyKey = idempotencyKey.trim();
   next()
}
