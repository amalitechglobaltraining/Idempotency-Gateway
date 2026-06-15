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

        boolean isReplay = service.isReplay(key);

        ResponseEntity<PaymentResponse> response =
                service.processPayment(key, request);

        HttpHeaders headers = new HttpHeaders();
        headers.add("X-Cache-Hit", String.valueOf(isReplay));

        return new ResponseEntity<>(
                response.getBody(),
                headers,
                response.getStatusCode()
        );
    }
}