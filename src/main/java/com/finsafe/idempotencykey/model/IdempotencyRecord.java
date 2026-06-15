package com.finsafe.idempotencykey.model;

import org.springframework.http.ResponseEntity;

public class IdempotencyRecord {

    private final String requestHash;
    private final ResponseEntity<PaymentResponse> response;

    public IdempotencyRecord(String requestHash, ResponseEntity<PaymentResponse> response) {
        this.requestHash = requestHash;
        this.response = response;
    }

    public String getRequestHash() {
        return requestHash;
    }

    public ResponseEntity<PaymentResponse> getResponse() {
        return response;
    }
}