package com.finsafe.idempotencykey.model;

public class IdempotencyRecord {

    private final String requestHash;
    private final PaymentResponse response;

    public IdempotencyRecord(String requestHash, PaymentResponse response) {
        this.requestHash = requestHash;
        this.response = response;
    }

    public String getRequestHash() {
        return requestHash;
    }

    public PaymentResponse getResponse() {
        return response;
    }
}