package com.finsafe.idempotencykey.service;

import com.finsafe.idempotencykey.model.*;
import org.springframework.http.*;
import org.springframework.stereotype.Service;

import java.util.concurrent.ConcurrentHashMap;

@Service
public class PaymentService {

    private final ConcurrentHashMap<String, IdempotencyRecord> store = new ConcurrentHashMap<>();

    public ResponseEntity<PaymentResponse> processPayment(String key, PaymentRequest request) {

        String hash = request.getAmount() + "-" + request.getCurrency();

        // duplicate request
        if (store.containsKey(key)) {
            return store.get(key).getResponse();
        }

        // simulate processing
        try {
            Thread.sleep(2000);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }

        PaymentResponse body = new PaymentResponse(
                "Charged " + request.getAmount() + " " + request.getCurrency()
        );

        ResponseEntity<PaymentResponse> response =
                ResponseEntity.status(HttpStatus.CREATED).body(body);

        store.put(key, new IdempotencyRecord(hash, response));

        return response;
    }

    public boolean isReplay(String key) {
        return store.containsKey(key);
    }
}