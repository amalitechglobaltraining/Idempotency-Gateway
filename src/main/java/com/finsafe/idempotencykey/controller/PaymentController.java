package com.finsafe.idempotencykey.controller;

import com.finsafe.idempotencykey.model.*;
import com.finsafe.idempotencykey.service.PaymentService;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
public class PaymentController {

    private final PaymentService service;

    public PaymentController(PaymentService service) {
        this.service = service;
    }

    @PostMapping("/process-payment")
    public ResponseEntity<?> processPayment(
            @RequestHeader("Idempotency-Key") String key,
            @RequestBody PaymentRequest request
    ) {

        try {
            return ResponseEntity.ok(service.processPayment(key, request));
        } catch (RuntimeException e) {
            return ResponseEntity
                    .status(HttpStatus.CONFLICT)
                    .body(e.getMessage());
        }
    }
}