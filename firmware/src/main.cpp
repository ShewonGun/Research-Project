// AquaFlow — ESP32 connection test.
// Joins Wi-Fi and sends a zero-flow reading to the backend every 5 seconds,
// printing the server's reply. No sensor or valve wiring needed.
#include <Arduino.h>
#include <WiFi.h>
#include <HTTPClient.h>

// Wi-Fi name/password, device ID and backend URL live in include/secrets.h
// (git-ignored). To set up on a new machine, copy include/secrets.example.h
// to include/secrets.h and fill in your values.
#include "secrets.h"

// Human-readable reason for a Wi-Fi status code.
const char *wifiReason(wl_status_t s) {
    switch (s) {
        case WL_NO_SSID_AVAIL:  return "network not found (wrong name, 5 GHz-only, or out of range)";
        case WL_CONNECT_FAILED: return "connection rejected (usually a wrong password)";
        case WL_CONNECTION_LOST:return "connection lost";
        case WL_DISCONNECTED:   return "disconnected / still trying (often a wrong password)";
        case WL_IDLE_STATUS:    return "idle";
        default:                return "unknown";
    }
}

// List the networks the ESP32 can see, so you can check yours is visible.
// The ESP32 only sees 2.4 GHz networks.
void scanNetworks() {
    Serial.println("\nScanning for Wi-Fi networks...");
    int n = WiFi.scanNetworks();
    if (n <= 0) {
        Serial.println("  No networks found.");
    }
    for (int i = 0; i < n; i++) {
        Serial.printf("  %2d. \"%s\"  signal %d dBm  channel %d%s\n", i + 1, WiFi.SSID(i).c_str(), WiFi.RSSI(i),
                      WiFi.channel(i), WiFi.SSID(i) == WIFI_SSID ? "   <-- yours" : "");
    }
    WiFi.scanDelete();
}

// Try to join for up to 20 s, then report why it failed.
bool connectWiFi() {
    Serial.printf("\nConnecting to \"%s\"", WIFI_SSID);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) {
        delay(500);
        Serial.print(".");
    }
    if (WiFi.status() == WL_CONNECTED) {
        Serial.print("\nConnected! ESP32 IP: ");
        Serial.println(WiFi.localIP());
        return true;
    }
    wl_status_t s = WiFi.status();
    Serial.printf("\nFailed: %s (code %d). Retrying in 10 s...\n", wifiReason(s), s);
    WiFi.disconnect();
    return false;
}

void setup() {
    Serial.begin(115200);
    delay(500);

    WiFi.mode(WIFI_STA);
    scanNetworks();
    while (!connectWiFi()) {
        delay(10000);
        scanNetworks();
    }
}

void loop() {
    if (WiFi.status() == WL_CONNECTED) {
        HTTPClient http;
        http.begin(API_URL);
        http.addHeader("Content-Type", "application/json");

        String body = String("{\"deviceId\":\"") + DEVICE_ID + "\",\"flowRate\":0,\"volume\":0}";
        int status = http.POST(body);

        if (status > 0) {
            Serial.printf("Server replied %d: %s\n", status, http.getString().c_str());
        } else {
            Serial.printf("Request failed: %s\n", http.errorToString(status).c_str());
        }
        http.end();
    } else {
        Serial.println("Wi-Fi lost, reconnecting...");
        WiFi.reconnect();
    }

    delay(5000);
}
