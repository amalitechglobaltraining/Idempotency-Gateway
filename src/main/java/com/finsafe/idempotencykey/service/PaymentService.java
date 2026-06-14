package com.finsafe.idempotencykey.service;

import com.finsafe.idempotencykey.model.*;
import org.springframework.stereotype.Service;

import java.util.concurrent.ConcurrentHashMap;

@Service
public class PaymentService {

    private final ConcurrentHashMap<String, IdempotencyRecord> store = new ConcurrentHashMap<>();

    public PaymentResponse processPayment(String key, PaymentRequest request) {

        String requestHash = request.getAmount() + "-" + request.getCurrency();

        // If key exists
        if (store.containsKey(key)) {

            IdempotencyRecord existing = store.get(key);

            // same key but different request → reject
            if (!existing.getRequestHash().equals(requestHash)) {
                throw new RuntimeException(
                        "Idempotency key already used for a different request body."
                );
            }

            // same request → return cached response
            return existing.getResponse();
        }

        // simulate processing
        try {
            Thread.sleep(2000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }

        PaymentResponse response = new PaymentResponse(
                "Charged " + request.getAmount() + " " + request.getCurrency()
        );

        store.put(key, new IdempotencyRecord(requestHash, response));

        return response;
    }
}