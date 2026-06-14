package com.finsafe.idempotencykey.model;


public class PaymentResponse {

    private String message;

    public PaymentResponse(String message) {
        this.message = message;
    }

    public String getMessage() {
        return message;
    }

}