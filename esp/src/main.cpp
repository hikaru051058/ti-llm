#include <Arduino.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <mbedtls/md.h>
#include <ArduinoJson.h>

// -------- CONFIGURE ME --------

static const char *WIFI_SSID = "YOUR_WIFI_SSID";
static const char *WIFI_PASS = "YOUR_WIFI_PASS";
static const char *PROVISION_URL =
    "PROVISION_URL";
static const char *ASK_URL =
    "ASK_URL";
static const char *FACTORY_SECRET = "SET_FACTORY_SECRET";

// ------------------------------

static Preferences prefs;
static String apiKey;
static WiFiClientSecure secureClient;
static bool timeReady = false;

static const uint32_t HTTP_TIMEOUT_MS = 8000;
static const uint32_t WIFI_TIMEOUT_MS = 10000;
static const int WIFI_MAX_RETRY = 3;
static const int HTTP_MAX_RETRY = 2;

static String chipId() {
  uint64_t mac = ESP.getEfuseMac();
  char buf[17];
  snprintf(buf, sizeof(buf), "%04X%08X",
           (uint16_t)(mac >> 32), (uint32_t)mac);
  return String(buf);
}

static bool connectWifi() {
  if (WiFi.status() == WL_CONNECTED) return true;

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);

  uint32_t start = millis();
  while (WiFi.status() != WL_CONNECTED &&
         (millis() - start) < WIFI_TIMEOUT_MS) {
    delay(200);
  }

  return WiFi.status() == WL_CONNECTED;
}

static bool hasTime() {
  time_t now = time(nullptr);
  return now > 1700000000; // ~2023
}

static bool ensureTime() {
  if (hasTime()) {
    timeReady = true;
    return true;
  }

  configTime(0, 0, "pool.ntp.org", "time.nist.gov", "time.google.com");
  for (int i = 0; i < 30; i++) {
    delay(200);
    if (hasTime()) {
      timeReady = true;
      return true;
    }
  }
  return false;
}

static bool ensureWifiWithRetry() {
  for (int attempt = 0; attempt < WIFI_MAX_RETRY; attempt++) {
    if (connectWifi()) return true;
    delay(500);
  }
  return false;
}

static void disconnectWifi() {
  WiFi.disconnect(true, true);
  WiFi.mode(WIFI_OFF);
}

static String hmacSha256Hex(const String &msg, const String &key) {
  byte out[32];
  mbedtls_md_context_t ctx;
  const mbedtls_md_info_t *info = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  mbedtls_md_init(&ctx);
  mbedtls_md_setup(&ctx, info, 1);
  mbedtls_md_hmac_starts(&ctx,
                         reinterpret_cast<const unsigned char *>(key.c_str()),
                         key.length());
  mbedtls_md_hmac_update(&ctx,
                         reinterpret_cast<const unsigned char *>(msg.c_str()),
                         msg.length());
  mbedtls_md_hmac_finish(&ctx, out);
  mbedtls_md_free(&ctx);

  char hex[65];
  for (int i = 0; i < 32; i++) {
    sprintf(hex + (i * 2), "%02x", out[i]);
  }
  hex[64] = '\0';
  return String(hex);
}

static bool loadApiKey() {
  if (!prefs.begin("tillm", true)) {
    // namespace not created yet; treat as empty
    prefs.end();
    apiKey = "";
    return false;
  }
  apiKey = prefs.getString("api_key", "");
  prefs.end();
  return apiKey.length() > 0;
}

static void saveApiKey(const String &key) {
  prefs.begin("tillm", false);
  prefs.putString("api_key", key);
  prefs.end();
  apiKey = key;
}

static String provision() {
  if (!ensureWifiWithRetry()) {
    return "ERR WIFI";
  }

  if (!ensureTime()) {
    return "ERR TIME";
  }

  secureClient.setInsecure(); // TODO: pin CA for production
  HTTPClient http;
  http.setTimeout(HTTP_TIMEOUT_MS);
  if (!http.begin(secureClient, PROVISION_URL)) {
    return "ERR URL";
  }

  String deviceId = chipId();
  uint32_t ts = (uint32_t)time(nullptr);
  String msg = deviceId + ":" + String(ts);
  String sig = hmacSha256Hex(msg, FACTORY_SECRET);

  Serial.print("Provisioning device "); Serial.println(deviceId);

  JsonDocument doc;
  doc["device_id"] = deviceId;
  doc["ts"] = ts;
  doc["sig"] = sig;
  String body;
  serializeJson(doc, body);

  http.addHeader("Content-Type", "application/json");
  int code = -1;
  for (int attempt = 0; attempt <= HTTP_MAX_RETRY; attempt++) {
    code = http.POST(body);
    if (code == 200) break;
    delay(200);
  }
  if (code != 200) {
    http.end();
    return "ERR " + String(code);
  }

  String resp = http.getString();
  http.end();
  saveApiKey(resp);
  return "OK";
}

static String ask(const String &prompt) {
  if (apiKey.isEmpty()) return "NO KEY";
  if (!ensureWifiWithRetry()) return "ERR WIFI";

  secureClient.setInsecure(); // TODO: pin CA for production
  HTTPClient http;
  http.setTimeout(HTTP_TIMEOUT_MS);
  if (!http.begin(secureClient, ASK_URL)) {
    return "ERR URL";
  }

  http.addHeader("Content-Type", "text/plain");
  http.addHeader("X-ESP-KEY", apiKey);

  int code = -1;
  for (int attempt = 0; attempt <= HTTP_MAX_RETRY; attempt++) {
    code = http.POST(prompt);
    if (code == 200) break;
    delay(200);
  }
  if (code != 200) {
    String err = "ERR " + String(code);
    http.end();
    return err;
  }

  String resp = http.getString();
  http.end();
  return resp;
}

static void handleCommand(const String &line) {
  if (line == "PING") {
    Serial.println("PONG");
    return;
  }

  if (line == "INIT") {
    if (!loadApiKey()) {
      String res = provision();
      Serial.println(res);
      return;
    }
    Serial.println("OK");
    return;
  }

  if (line == "EXIT") {
    disconnectWifi();
    Serial.println("BYE");
    // TODO: enter deep sleep if desired
    return;
  }

  // Otherwise treat as prompt text
  String res = ask(line);
  Serial.println(res);
}

void setup() {
  Serial.begin(115200);
  while (!Serial) { delay(10); }
  delay(200);
  Serial.println("ESP gateway ready");
}

void loop() {
  static String buf;
  while (Serial.available()) {
    char c = Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      if (buf.length() > 0) {
        handleCommand(buf);
        buf = "";
      }
    } else {
      buf += c;
      if (buf.length() > 1024) {
        buf = "";
        Serial.println("ERR LONG");
      }
    }
  }
}
