package com.finsafe.idempotencykey.controller;

import com.finsafe.idempotencykey.model.PaymentRequest;
import org.springframework.web.bind.annotation.*;

@RestController
public class PaymentController {

    @PostMapping("/process-payment")
    public String processPayment(
            @RequestHeader("Idempotency-Key") String idempotencyKey,
            @RequestBody PaymentRequest request
    ) {

        try {
            // simulate payment processing delay
            Thread.sleep(2000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }

        return "Charged " + request.getAmount() + " " + request.getCurrency();
    }
}