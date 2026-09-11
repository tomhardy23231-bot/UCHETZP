#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>
#include <LittleFS.h>
#include <FastLED.h>
#include <SPI.h>
#include <Adafruit_GFX.h>
#include <Adafruit_ST7735.h>
#include <U8g2_for_Adafruit_GFX.h> 
#include <esp_task_wdt.h>
#include <time.h> 
#include <map> 
#include <driver/i2s_std.h>
#include <math.h>
#include <WiFiManager.h> 
#include <esp_sleep.h> 
#include <ArduinoOTA.h>

#define CTRL_PIN 17 
#define BATT_PIN 4 
int batteryPercent = 0;
float batteryVoltage = 0.0;        
unsigned long lastBattCheck = 0;  

const String API_URL_BULK = "https://uche12tzp.vercel.app/api/attendance/bulk-scan";

#define LED_PIN     15
#define NUM_LEDS    12
CRGB leds[NUM_LEDS];
#define BTN_UP      1
#define BTN_DOWN    2
#define BTN_OK      46  
#define TFT_CS      13
#define TFT_RST     9
#define TFT_DC      10
#define RFID_RX_PIN 16

#define I2S_BCLK    5
#define I2S_LRC     6
#define I2S_DOUT    7
#define SAMPLE_RATE 16000 

Adafruit_ST7735 tft = Adafruit_ST7735(TFT_CS, TFT_DC, TFT_RST);
U8G2_FOR_ADAFRUIT_GFX u8g2Fonts; 
TaskHandle_t SyncTask;
SemaphoreHandle_t fileMutex;

struct ScanEvent {
  char rfid[15];
  char timestamp[25];
};
QueueHandle_t scanQueue;

enum ScreenState { MAIN_SCREEN, SUCCESS_SCREEN, ERROR_SCREEN, MENU_SCREEN, VOL_SCREEN, WIFI_SETUP_SCREEN };
ScreenState currentScreen = MAIN_SCREEN;
bool forceRedraw = true; 

int menuIndex = 0;
const int menuItemsCount = 3;
String menuItems[menuItemsCount] = {"Громкость", "Wi-Fi Сеть", "Выход"};

int currentVolume = 15000; 
int volPercent = 50;

bool lastBtnOk = HIGH, lastBtnUp = HIGH, lastBtnDown = HIGH;
unsigned long btnOkTimer = 0;
bool btnOkHandled = false;

bool isSystemActive = true;
bool hasInternet = false;
bool hasOfflineData = false;
bool isOTAUpdating = false;        

unsigned long screenTimer = 0; 
unsigned long lastScreenUpdate = 0;

String rfidBuffer = "";
struct tm timeinfo;
char timeStr[6]; 
char lastTimeStr[6] = ""; 

std::map<String, unsigned long> recentScans;
const unsigned long DEBOUNCE_TIME = 5 * 60 * 1000;

bool isTimeSynced() {
  struct tm t;
  return (getLocalTime(&t, 10) && t.tm_year > 120);
}

void saveToOffline(const char* rfid, const char* timestamp) {
  xSemaphoreTake(fileMutex, portMAX_DELAY);
  File f = LittleFS.open("/offline.jsonl", "a");
  if (f) { 
    f.printf("{\"card_id\":\"%s\",\"timestamp\":\"%s\"}\n", rfid, timestamp); 
    f.close(); 
    hasOfflineData = true; 
  }
  xSemaphoreGive(fileMutex);
}

const int16_t sineTable[64] = {
  0, 3211, 6392, 9511, 12539, 15446, 18204, 20787, 
  23169, 25329, 27244, 28897, 30272, 31356, 32137, 32609, 
  32767, 32609, 32137, 31356, 30272, 28897, 27244, 25329, 
  23169, 20787, 18204, 15446, 12539, 9511, 6392, 3211, 
  0, -3211, -6392, -9511, -12539, -15446, -18204, -20787, 
  -23169, -25329, -27244, -28897, -30272, -31356, -32137, -32609, 
  -32767, -32609, -32137, -31356, -30272, -28897, -27244, -25329, 
  -23169, -20787, -18204, -15446, -12539, -9511, -6392, -3211
};

i2s_chan_handle_t tx_chan;

void initI2S() {
  i2s_chan_config_t tx_chan_cfg = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_AUTO, I2S_ROLE_MASTER);
  i2s_new_channel(&tx_chan_cfg, &tx_chan, NULL);
  i2s_std_config_t tx_std_cfg = {
    .clk_cfg  = I2S_STD_CLK_DEFAULT_CONFIG(SAMPLE_RATE),
    .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_16BIT, I2S_SLOT_MODE_STEREO),
    .gpio_cfg = {
      .mclk = I2S_GPIO_UNUSED, .bclk = (gpio_num_t)I2S_BCLK, .ws = (gpio_num_t)I2S_LRC,
      .dout = (gpio_num_t)I2S_DOUT, .din = I2S_GPIO_UNUSED,
      .invert_flags = { .mclk_inv = false, .bclk_inv = false, .ws_inv = false },
    },
  };
  i2s_channel_init_std_mode(tx_chan, &tx_std_cfg);
  i2s_channel_enable(tx_chan);
}

void playI2STone(float frequency, int duration_ms) {
  size_t bytes_written;
  int total_samples = (SAMPLE_RATE * duration_ms) / 1000;
  int16_t sample_val = 0;
  float phaseIncrement = (64.0 * frequency) / SAMPLE_RATE;
  float phase = 0.0;

  for (int i = 0; i < total_samples; i++) {
    int tableIndex = (int)phase % 64;
    sample_val = (int16_t)((currentVolume * sineTable[tableIndex]) >> 15);
    uint32_t sample_32 = ((uint32_t)(uint16_t)sample_val << 16) | (uint16_t)sample_val;
    i2s_channel_write(tx_chan, &sample_32, sizeof(sample_32), &bytes_written, portMAX_DELAY);
    phase += phaseIncrement;
  }
  uint32_t silence = 0;
  for (int i = 0; i < 4096; i++) {
    i2s_channel_write(tx_chan, &silence, sizeof(silence), &bytes_written, portMAX_DELAY);
  }
}

void beepSuccess() { playI2STone(2000.0, 150); }
void beepError() { playI2STone(500.0, 150); vTaskDelay(200 / portTICK_PERIOD_MS); playI2STone(500.0, 150); }
void beepNav() { playI2STone(1000.0, 50); } 

void updateBatteryStatus() {
  if (millis() - lastBattCheck > 5000) { 
    lastBattCheck = millis();
    long sum = 0;
    for(int i = 0; i < 20; i++) { sum += analogRead(BATT_PIN); delay(2); }
    int raw = sum / 20;
    float calcVoltage = (raw / 4095.0) * 3.3 * 2.0; 
    calcVoltage = calcVoltage * 1.072; 
    batteryVoltage = calcVoltage;
    if (calcVoltage > 4.2) calcVoltage = 4.2;
    if (calcVoltage < 2.9) calcVoltage = 2.9;
    int targetPercent = map(calcVoltage * 100, 290, 420, 0, 100);
    if (batteryPercent == 0) batteryPercent = targetPercent;
    else batteryPercent = (batteryPercent * 4 + targetPercent) / 5;
  }
}

void drawWiFiIcon(int x, int y, int rssi, bool connected) {
  tft.fillRect(x, y - 10, 16, 12, ST77XX_BLACK);
  if (!connected) {
    tft.drawLine(x, y, x + 10, y - 10, ST77XX_RED);
    tft.drawLine(x, y - 10, x + 10, y, ST77XX_RED);
    return;
  }
  int bars = (rssi > -60) ? 4 : (rssi > -70) ? 3 : (rssi > -80) ? 2 : 1;
  for (int i = 0; i < 4; i++) {
    uint16_t color = (i < bars) ? ST77XX_WHITE : 0x4208;
    tft.fillRect(x + (i * 4), y - ((i + 1) * 2), 2, (i + 1) * 2, color);
  }
}

void drawStatusBar() {
  drawWiFiIcon(5, 12, WiFi.RSSI(), (WiFi.status() == WL_CONNECTED));
  tft.fillCircle(35, 7, 4, hasInternet ? ST77XX_GREEN : ST77XX_RED);
  
  u8g2Fonts.setFont(u8g2_font_5x7_t_cyrillic);
  u8g2Fonts.setForegroundColor(hasOfflineData ? ST77XX_MAGENTA : ST77XX_BLACK);
  u8g2Fonts.setBackgroundColor(ST77XX_BLACK);
  u8g2Fonts.setCursor(100, 12);
  u8g2Fonts.print("ОЧЕРЕДЬ");

  int x = 50; int y = 2;
  tft.drawRect(x, y, 20, 10, ST77XX_WHITE);   
  tft.fillRect(x + 20, y + 2, 2, 6, ST77XX_WHITE);
  int fillWidth = map(batteryPercent, 0, 100, 0, 16);
  uint16_t battColor = ST77XX_GREEN;
  if (batteryPercent <= 20) battColor = ST77XX_RED;
  else if (batteryPercent <= 50) battColor = ST77XX_YELLOW;
  tft.fillRect(x + 2, y + 2, 16, 6, ST77XX_BLACK);
  tft.fillRect(x + 2, y + 2, fillWidth, 6, battColor); 

  tft.setTextSize(1);
  tft.setTextColor(ST77XX_WHITE, ST77XX_BLACK);
  tft.setCursor(75, 4); 
  tft.printf("%.1fV", batteryVoltage);
}

void onWiFiEvent(WiFiEvent_t event) {
  switch (event) {
    case ARDUINO_EVENT_WIFI_STA_CONNECTED: 
      Serial.println("[СЕТЬ] Подключено"); 
      break;
      
    case ARDUINO_EVENT_WIFI_STA_GOT_IP: 
      hasInternet = true; 
      configTzTime("EET-2EEST,M3.5.0/3,M10.5.0/4", "pool.ntp.org"); 
      break;
      
    case ARDUINO_EVENT_WIFI_STA_DISCONNECTED: 
      hasInternet = false; 
      // ИСПРАВЛЕНО: Убран вызов WiFi.reconnect(), который вешал систему
      break;
      
    default: 
      break;
  }
}

void checkAndGoToSleep() {
  if (!getLocalTime(&timeinfo, 10)) return;
  int currentDay = timeinfo.tm_wday; 
  int currentHour = timeinfo.tm_hour;
  int currentMin = timeinfo.tm_min;
  bool shouldSleep = false;
  long secondsToSleep = 0;

  if (currentDay == 5 && (currentHour > 19 || (currentHour == 19 && currentMin >= 30))) {
    secondsToSleep = ((23 - currentHour) * 3600) + ((59 - currentMin) * 60) + (60 - timeinfo.tm_sec) + (48 * 3600) + (6 * 3600); 
    shouldSleep = true;
  } else if (currentDay == 6) {
    secondsToSleep = ((23 - currentHour) * 3600) + ((59 - currentMin) * 60) + (60 - timeinfo.tm_sec) + (24 * 3600) + (6 * 3600); 
    shouldSleep = true;
  } else if (currentDay == 0) {
    secondsToSleep = ((23 - currentHour) * 3600) + ((59 - currentMin) * 60) + (60 - timeinfo.tm_sec) + (6 * 3600); 
    shouldSleep = true;
  } else {
    if (currentHour == 19 && currentMin >= 30) shouldSleep = true;
    if (currentHour >= 20) shouldSleep = true;                     
    if (currentHour < 6) shouldSleep = true;
    if (shouldSleep) {
      if (currentHour >= 19) secondsToSleep = ((23 - currentHour) * 3600) + ((59 - currentMin) * 60) + (60 - timeinfo.tm_sec) + (6 * 3600);
      else secondsToSleep = ((5 - currentHour) * 3600) + ((59 - currentMin) * 60) + (60 - timeinfo.tm_sec);
    }
  }

  if (shouldSleep) {
    FastLED.clear(); FastLED.show();
    digitalWrite(CTRL_PIN, LOW);
    tft.enableDisplay(false); 
    WiFi.disconnect(true); WiFi.mode(WIFI_OFF);
    esp_sleep_enable_timer_wakeup((uint64_t)secondsToSleep * 1000000ULL);
    esp_deep_sleep_start();
  }
}

void setupOTA() {
  ArduinoOTA.setHostname("HARIZMA-SCANNER");
  
  ArduinoOTA.onStart([]() {
    isOTAUpdating = true; 
    FastLED.clear(); FastLED.show();
    tft.fillScreen(ST77XX_BLACK);
    u8g2Fonts.setFont(u8g2_font_cu12_t_cyrillic);
    u8g2Fonts.setForegroundColor(ST77XX_YELLOW);
    u8g2Fonts.setCursor(20, 40); u8g2Fonts.print("ОБНОВЛЕНИЕ");
  });
  ArduinoOTA.onEnd([]() {
    tft.fillScreen(ST77XX_GREEN);
    u8g2Fonts.setForegroundColor(ST77XX_BLACK);
    u8g2Fonts.setCursor(35, 60); u8g2Fonts.print("ГОТОВО!");
  });
  ArduinoOTA.onProgress([](unsigned int progress, unsigned int total) {
    esp_task_wdt_reset(); 
    int percent = (progress / (total / 100));
    tft.fillRect(45, 75, 40, 20, ST77XX_BLACK);
    tft.setTextColor(ST77XX_WHITE, ST77XX_BLACK);
    tft.setTextSize(1); tft.setCursor(55, 80); tft.printf("%d%%", percent);
  });
  ArduinoOTA.begin();
}

void setup() {
  Serial.begin(115200);
  pinMode(CTRL_PIN, OUTPUT); digitalWrite(CTRL_PIN, HIGH); delay(50);
  rfidBuffer.reserve(32); 
  pinMode(BTN_UP, INPUT_PULLUP); pinMode(BTN_DOWN, INPUT_PULLUP);
  pinMode(BTN_OK, INPUT_PULLUP); pinMode(BATT_PIN, INPUT);

  esp_task_wdt_config_t wdt_config = { .timeout_ms = 25000, .idle_core_mask = (1 << portNUM_PROCESSORS) - 1, .trigger_panic = true };
  esp_task_wdt_reconfigure(&wdt_config); esp_task_wdt_add(NULL);

  LittleFS.begin(true);
  fileMutex = xSemaphoreCreateMutex();
  scanQueue = xQueueCreate(10, sizeof(ScanEvent)); 

  xSemaphoreTake(fileMutex, portMAX_DELAY);
  if (LittleFS.exists("/temp.jsonl")) {
    File offline = LittleFS.open("/offline.jsonl", "a");
    File temp = LittleFS.open("/temp.jsonl", "r");
    if (offline && temp) { while(temp.available()) offline.write(temp.read()); hasOfflineData = true; }
    if (temp) temp.close(); if (offline) offline.close();
    LittleFS.remove("/temp.jsonl");
  }
  if (LittleFS.exists("/offline.jsonl")) {
    File check = LittleFS.open("/offline.jsonl", "r");
    if (check) { hasOfflineData = (check.size() > 5); check.close(); }
  }
  xSemaphoreGive(fileMutex);

  initI2S(); 
  SPI.begin(12, -1, 11, 13); 
  tft.initR(INITR_144GREENTAB); 
  tft.fillScreen(ST77XX_BLACK); tft.setRotation(1); tft.setTextWrap(false);
  
  u8g2Fonts.begin(tft); u8g2Fonts.setFontMode(1); u8g2Fonts.setFontDirection(0);
  u8g2Fonts.setFont(u8g2_font_cu12_t_cyrillic); u8g2Fonts.setForegroundColor(ST77XX_WHITE);
  u8g2Fonts.setCursor(15, 60); u8g2Fonts.print("ЗАГРУЗКА...");
  
  Serial2.begin(9600, SERIAL_8N1, RFID_RX_PIN, -1);
  FastLED.addLeds<WS2812B, LED_PIN, GRB>(leds, NUM_LEDS);
  FastLED.setBrightness(100); FastLED.clear(); FastLED.show();

  WiFi.mode(WIFI_STA); WiFi.onEvent(onWiFiEvent); WiFi.setAutoReconnect(true); WiFi.begin(); 
  setupOTA(); 

  currentScreen = MAIN_SCREEN; forceRedraw = true;
  xTaskCreatePinnedToCore(syncTaskCode, "SyncTask", 16384, NULL, 1, &SyncTask, 0);
}

bool postSingleScan(ScanEvent& evt) {
  WiFiClientSecure client; client.setInsecure();
  HTTPClient http;
  http.begin(client, API_URL_BULK); 
  http.setTimeout(10000); 
  http.addHeader("Content-Type", "application/json");
  
  char jsonBuffer[256];
  snprintf(jsonBuffer, sizeof(jsonBuffer), "{\"scans\":[{\"card_id\":\"%s\",\"timestamp\":\"%s\"}]}", evt.rfid, evt.timestamp);
  int res = http.POST(String(jsonBuffer));
  http.end();
  // ИСПРАВЛЕНО: только 2xx считаем успехом. 4xx раньше тоже удалял запись -> теряли отметки.
  return (res >= 200 && res < 300);
}

void processOfflineBuffer() {
  if (WiFi.status() != WL_CONNECTED || !hasInternet || !isTimeSynced()) return;

  bool fileExists = false;
  xSemaphoreTake(fileMutex, portMAX_DELAY);
  if (LittleFS.exists("/offline.jsonl")) {
    File f = LittleFS.open("/offline.jsonl", "r");
    if (f) { fileExists = (f.size() > 5); f.close(); }
    if (fileExists) LittleFS.rename("/offline.jsonl", "/temp.jsonl");
  }
  xSemaphoreGive(fileMutex);

  if (!fileExists) return;

  File tempFile = LittleFS.open("/temp.jsonl", "r");
  if (!tempFile) return;

  bool anyFailed = false;
  
  // ИСПРАВЛЕНО: Вынесли создание клиента за пределы цикла для экономии памяти
  WiFiClientSecure client; client.setInsecure();
  HTTPClient http;

  while(tempFile.available()) {
    esp_task_wdt_reset(); // ИСПРАВЛЕНО: Сброс Watchdog, чтобы система не падала при долгой выгрузке

    String line = tempFile.readStringUntil('\n');
    line.trim();
    if (line.length() > 10 && line.startsWith("{") && line.endsWith("}")) {
      
      int msIndex = line.indexOf("MS:");
      if (msIndex != -1) {
        int endQuote = line.indexOf('"', msIndex); 
        if (endQuote != -1) {
          String msStr = line.substring(msIndex + 3, endQuote);
          unsigned long scanMillis = msStr.toInt();
          unsigned long currentMillis = millis();
          unsigned long secondsAgo = (currentMillis >= scanMillis) ? (currentMillis - scanMillis) / 1000 : 0;
          time_t nowTime; time(&nowTime);
          time_t trueScanTime = nowTime - secondsAgo;
          struct tm trueTimeinfo; localtime_r(&trueScanTime, &trueTimeinfo);
          char correctedIso[25];
          snprintf(correctedIso, sizeof(correctedIso), "%04d-%02d-%02dT%02d:%02d:%02dZ", 
                   trueTimeinfo.tm_year + 1900, trueTimeinfo.tm_mon + 1, trueTimeinfo.tm_mday, trueTimeinfo.tm_hour, trueTimeinfo.tm_min, trueTimeinfo.tm_sec);
          line.replace("MS:" + msStr, correctedIso);
        }
      }

      http.begin(client, API_URL_BULK);
      http.setTimeout(10000); 
      http.addHeader("Content-Type", "application/json");
      String finalBody = "{\"scans\":[" + line + "]}"; 
      
      int res = http.POST(finalBody);
      http.end();

      // ИСПРАВЛЕНО: только 2xx считаем успехом. Раньше 4xx тоже удалял запись -> теряли отметки.
      if (res >= 200 && res < 300) {
        // Сервер реально принял -> забываем эту строку
      } else {
        // Любая другая ошибка (таймаут, 4xx, 5xx) -> Сохраняем обратно!
        xSemaphoreTake(fileMutex, portMAX_DELAY);
        File f = LittleFS.open("/offline.jsonl", "a");
        if (f) { f.println(line); f.close(); }
        hasOfflineData = true;
        xSemaphoreGive(fileMutex);
        anyFailed = true;
      }
    }
  }
  tempFile.close();

  xSemaphoreTake(fileMutex, portMAX_DELAY);
  LittleFS.remove("/temp.jsonl");
  if (!anyFailed && !LittleFS.exists("/offline.jsonl")) hasOfflineData = false;
  xSemaphoreGive(fileMutex);
}

void syncTaskCode(void * pvParameters) {
  esp_task_wdt_add(NULL);
  unsigned long lastBulkSync = 0;
  for(;;) {
    esp_task_wdt_reset();
    if (isOTAUpdating) { vTaskDelay(100 / portTICK_PERIOD_MS); continue; }

    ScanEvent evt;
    if (xQueueReceive(scanQueue, &evt, pdMS_TO_TICKS(100)) == pdTRUE) {
      bool scanSent = false;
      if (WiFi.status() == WL_CONNECTED && hasInternet && strncmp(evt.timestamp, "MS:", 3) != 0) {
        scanSent = postSingleScan(evt);
      }
      if (!scanSent) saveToOffline(evt.rfid, evt.timestamp);
    }
    
    if (millis() - lastBulkSync > 10000) {
      lastBulkSync = millis();
      processOfflineBuffer();
    }
  }
}

void handleShortPressOk() {
  if (currentScreen == MAIN_SCREEN) return;
  if (currentScreen == MENU_SCREEN) {
    if (menuIndex == 0) { currentScreen = VOL_SCREEN; forceRedraw = true; }
    else if (menuIndex == 1) { currentScreen = WIFI_SETUP_SCREEN; forceRedraw = true; } 
    else if (menuIndex == 2) { currentScreen = MAIN_SCREEN; forceRedraw = true; } 
  } else if (currentScreen == VOL_SCREEN) {
    currentScreen = MENU_SCREEN; forceRedraw = true;
  }
  beepNav();
}

void loop() {
  ArduinoOTA.handle(); 
  if (isOTAUpdating) { esp_task_wdt_reset(); return; }

  unsigned long nowMs = millis();
  static unsigned long lastSleepCheck = 0;
  if (nowMs - lastSleepCheck > 60000) { lastSleepCheck = nowMs; checkAndGoToSleep(); }

  updateBatteryStatus(); esp_task_wdt_reset();
  
  bool btnOk = digitalRead(BTN_OK); bool btnUp = digitalRead(BTN_UP); bool btnDown = digitalRead(BTN_DOWN);
  
  if (btnOk == LOW && lastBtnOk == HIGH) { btnOkTimer = nowMs; btnOkHandled = false; }
  if (btnOk == LOW && !btnOkHandled && (nowMs - btnOkTimer > 1000)) {
    btnOkHandled = true;
    if (currentScreen == MENU_SCREEN || currentScreen == VOL_SCREEN || currentScreen == WIFI_SETUP_SCREEN) currentScreen = MAIN_SCREEN;
    else { currentScreen = MENU_SCREEN; menuIndex = 0; }
    forceRedraw = true; beepNav();
  }
  if (btnOk == HIGH && lastBtnOk == LOW) { if (!btnOkHandled && (nowMs - btnOkTimer > 50)) handleShortPressOk(); }
  lastBtnOk = btnOk;

  if (btnUp == LOW && lastBtnUp == HIGH) {
    if (currentScreen == MENU_SCREEN) { menuIndex--; if (menuIndex < 0) menuIndex = menuItemsCount - 1; forceRedraw = true; beepNav(); }
    else if (currentScreen == VOL_SCREEN) { volPercent += 10; if (volPercent > 100) volPercent = 100; forceRedraw = true; beepNav(); }
  }
  if (btnDown == LOW && lastBtnDown == HIGH) {
    if (currentScreen == MENU_SCREEN) { menuIndex++; if (menuIndex >= menuItemsCount) menuIndex = 0; forceRedraw = true; beepNav(); }
    else if (currentScreen == VOL_SCREEN) { volPercent -= 10; if (volPercent < 0) volPercent = 0; forceRedraw = true; beepNav(); }
  }
  lastBtnUp = btnUp; lastBtnDown = btnDown;
  currentVolume = map(volPercent, 0, 100, 0, 30000);

  while (Serial2.available() > 0) {
    esp_task_wdt_reset();
    char c = Serial2.read();
    if (currentScreen != MAIN_SCREEN && currentScreen != SUCCESS_SCREEN && currentScreen != ERROR_SCREEN) { rfidBuffer = ""; continue; } 

    if (c == 2) rfidBuffer = "";
    else if (c == 3) { 
      if (rfidBuffer.length() == 12 || rfidBuffer.length() == 10) { 
        for (auto it = recentScans.begin(); it != recentScans.end(); ) {
          if (nowMs - it->second > DEBOUNCE_TIME) it = recentScans.erase(it);
          else ++it;
        }
        if (recentScans.count(rfidBuffer) && (nowMs - recentScans[rfidBuffer] < DEBOUNCE_TIME)) {
          if (nowMs - recentScans[rfidBuffer] < 4000) { rfidBuffer = ""; continue; } 
          currentScreen = ERROR_SCREEN; forceRedraw = true; screenTimer = nowMs;
          recentScans[rfidBuffer] = nowMs; beepError(); 
        } else {
          recentScans[rfidBuffer] = nowMs;
          char iso[25];
          if (isTimeSynced()) {
            snprintf(iso, sizeof(iso), "%04d-%02d-%02dT%02d:%02d:%02dZ", 
                     timeinfo.tm_year + 1900, timeinfo.tm_mon + 1, timeinfo.tm_mday, timeinfo.tm_hour, timeinfo.tm_min, timeinfo.tm_sec);
          } else { snprintf(iso, sizeof(iso), "MS:%lu", millis()); }
          
          ScanEvent newScan;
          strcpy(newScan.rfid, rfidBuffer.c_str());
          strcpy(newScan.timestamp, iso);
          
          if (xQueueSend(scanQueue, &newScan, 0) != pdTRUE) saveToOffline(newScan.rfid, newScan.timestamp);
          currentScreen = SUCCESS_SCREEN; forceRedraw = true; screenTimer = nowMs; beepSuccess();
        }
      }
      rfidBuffer = ""; 
    } else {
      // ИСПРАВЛЕНО: Защита от переполнения памяти при помехах на проводе
      if (rfidBuffer.length() < 30) {
        rfidBuffer += c;
      }
    }
  }

  if (currentScreen == SUCCESS_SCREEN && (nowMs - screenTimer >= 1700)) { currentScreen = MAIN_SCREEN; forceRedraw = true; }
  else if (currentScreen == ERROR_SCREEN && (nowMs - screenTimer >= 3000)) { currentScreen = MAIN_SCREEN; forceRedraw = true; }

  if (nowMs - lastScreenUpdate >= 500 || forceRedraw) {
    lastScreenUpdate = nowMs;
    if (currentScreen == MAIN_SCREEN) {
      if (forceRedraw) {
        tft.fillScreen(ST77XX_BLACK);
        tft.setTextSize(2); tft.setTextColor(ST77XX_ORANGE, ST77XX_BLACK); tft.setCursor(20, 25); tft.print("HARIZMA");
        strcpy(lastTimeStr, ""); forceRedraw = false; FastLED.clear(); FastLED.show();
      }
      drawStatusBar();
      if (isTimeSynced()) {
        sprintf(timeStr, "%02d:%02d", timeinfo.tm_hour, timeinfo.tm_min);
        if (strcmp(timeStr, lastTimeStr) != 0) {
          tft.fillRect(0, 50, 128, 40, ST77XX_BLACK);
          tft.setTextColor(ST77XX_WHITE, ST77XX_BLACK); tft.setTextSize(4); tft.setCursor(7, 60); tft.print(timeStr);
          strcpy(lastTimeStr, timeStr); 
        }
      } else if (forceRedraw) {
        u8g2Fonts.setFont(u8g2_font_cu12_t_cyrillic); u8g2Fonts.setForegroundColor(ST77XX_YELLOW);
        u8g2Fonts.setCursor(10, 80); u8g2Fonts.print("НЕТ ВРЕМЕНИ");
      }
    }
    else if (currentScreen == WIFI_SETUP_SCREEN) {
      if (forceRedraw) {
        isSystemActive = false; tft.fillScreen(ST77XX_BLUE);
        u8g2Fonts.setFont(u8g2_font_cu12_t_cyrillic); u8g2Fonts.setForegroundColor(ST77XX_WHITE); u8g2Fonts.setBackgroundColor(ST77XX_BLUE);
        u8g2Fonts.setCursor(10, 30); u8g2Fonts.print("НАСТРОЙКИ WI-FI");
        u8g2Fonts.setCursor(5, 65); u8g2Fonts.print("Сеть: HARIZMA_SETUP"); u8g2Fonts.setCursor(5, 85); u8g2Fonts.print("IP: 192.168.4.1");
        FastLED.clear(); FastLED.show(); forceRedraw = false; esp_task_wdt_delete(NULL); 
        WiFiManager wm; if (!wm.startConfigPortal("HARIZMA_SETUP")) ESP.restart(); else { tft.fillScreen(ST77XX_GREEN); delay(2000); ESP.restart(); }
      }
    }
    else if (currentScreen == SUCCESS_SCREEN) {
      if (forceRedraw) {
        tft.fillScreen(ST77XX_GREEN); u8g2Fonts.setFont(u8g2_font_cu12_t_cyrillic); u8g2Fonts.setForegroundColor(ST77XX_BLACK); u8g2Fonts.setBackgroundColor(ST77XX_GREEN);
        u8g2Fonts.setCursor(15, 30); u8g2Fonts.print("ОТМЕТКА"); u8g2Fonts.setCursor(25, 45); u8g2Fonts.print("ПРИНЯТА!"); u8g2Fonts.setCursor(15, 75); u8g2Fonts.print("ВАШЕ ВРЕМЯ:");
        if (isTimeSynced()) { sprintf(timeStr, "%02d:%02d", timeinfo.tm_hour, timeinfo.tm_min); tft.setTextColor(ST77XX_BLACK); tft.setTextSize(3); tft.setCursor(20, 90); tft.print(timeStr); }
        forceRedraw = false;
      }
    }
    else if (currentScreen == ERROR_SCREEN) {
      if (forceRedraw) {
        tft.fillScreen(ST77XX_RED); u8g2Fonts.setFont(u8g2_font_cu12_t_cyrillic); u8g2Fonts.setForegroundColor(ST77XX_WHITE); u8g2Fonts.setBackgroundColor(ST77XX_RED);
        u8g2Fonts.setCursor(35, 45); u8g2Fonts.print("ВЫ УЖЕ"); u8g2Fonts.setCursor(20, 65); u8g2Fonts.print("ОТМЕТИЛИСЬ"); forceRedraw = false;
      }
    }
    else if (currentScreen == MENU_SCREEN) {
      if (forceRedraw) {
        tft.fillScreen(ST77XX_BLACK); tft.fillRect(0, 0, 128, 20, ST77XX_BLUE);
        u8g2Fonts.setFont(u8g2_font_cu12_t_cyrillic); u8g2Fonts.setForegroundColor(ST77XX_WHITE); u8g2Fonts.setBackgroundColor(ST77XX_BLUE);
        u8g2Fonts.setCursor(10, 14); u8g2Fonts.print("НАСТРОЙКИ"); u8g2Fonts.setBackgroundColor(ST77XX_BLACK);
        for (int i = 0; i < menuItemsCount; i++) {
          if (i == menuIndex) u8g2Fonts.setForegroundColor(ST77XX_YELLOW); else u8g2Fonts.setForegroundColor(ST77XX_WHITE);
          u8g2Fonts.setCursor(10, 40 + (i * 20)); u8g2Fonts.print((i == menuIndex ? "> " : "  ") + menuItems[i]);
        }
        forceRedraw = false;
      }
    }
    else if (currentScreen == VOL_SCREEN) {
      if (forceRedraw) {
        tft.fillScreen(ST77XX_BLACK); u8g2Fonts.setFont(u8g2_font_cu12_t_cyrillic); u8g2Fonts.setForegroundColor(ST77XX_WHITE); u8g2Fonts.setBackgroundColor(ST77XX_BLACK);
        u8g2Fonts.setCursor(20, 30); u8g2Fonts.print("ГРОМКОСТЬ"); tft.drawRect(14, 60, 100, 20, ST77XX_WHITE); tft.fillRect(14, 60, volPercent, 20, ST77XX_GREEN); 
        tft.setTextColor(ST77XX_WHITE, ST77XX_BLACK); tft.setTextSize(1); tft.setCursor(55, 90); tft.print(String(volPercent) + "%"); forceRedraw = false;
      }
    }
  }

  if (currentScreen == SUCCESS_SCREEN) {
    unsigned long elapsed = nowMs - screenTimer;
    if (elapsed < 1000) { int ledsToLight = map(elapsed, 0, 1000, 0, NUM_LEDS); for (int i = 0; i < ledsToLight; i++) leds[i] = CHSV(i * (255 / NUM_LEDS), 255, 255); } 
    else if (elapsed < 1450) fill_rainbow(leds, NUM_LEDS, 0, 255 / NUM_LEDS);
    else if (elapsed < 1700) { fill_rainbow(leds, NUM_LEDS, 0, 255 / NUM_LEDS); for(int i = 0; i < NUM_LEDS; i++) leds[i].nscale8(map(elapsed, 1450, 1700, 255, 0)); }
    FastLED.show();
  } 
  else if (currentScreen == ERROR_SCREEN) {
    unsigned long elapsed = nowMs - screenTimer;
    if (elapsed < 1200) { if ((elapsed / 200) % 2 == 0) fill_solid(leds, NUM_LEDS, CRGB::Red); else FastLED.clear(); } else FastLED.clear();
    FastLED.show();
  }
}