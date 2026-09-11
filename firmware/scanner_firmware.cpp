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
#include <HTTPUpdate.h>
#include <ArduinoJson.h>
#include <esp_system.h>

// Версия прошивки. Её же указывают при загрузке .bin в админке: сервер сравнивает
// её с тем, что пришло в heartbeat, и так понимает, доехало обновление или нет.
// Меняете прошивку — поднимайте версию, иначе обновление будет крутиться по кругу.
#define FW_VERSION "2.0.0"

#define CTRL_PIN 17 
#define BATT_PIN 4 
int batteryPercent = 0;
float batteryVoltage = 0.0;        
unsigned long lastBattCheck = 0;  

// Имя устройства в админке и общий секрет с сервером — тот же, что в переменной
// окружения SCANNER_DEVICE_KEY. Без совпадающего ключа сервер не примет ни
// heartbeat, ни отчёт о команде и не отдаст прошивку.
const char* DEVICE_ID  = "HARIZMA-SCANNER";
const char* DEVICE_KEY = "CHANGE-ME";

const String API_BASE           = "https://zp.haskyhub.com";
const String API_URL_BULK       = API_BASE + "/api/attendance/bulk-scan";
const String API_URL_HEARTBEAT  = API_BASE + "/api/scanner/heartbeat";
const String API_URL_CMD_RESULT = API_BASE + "/api/scanner/command-result";

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
// Один сетевой обмен за раз. Досыл очереди идёт в фоновой задаче на ядре 0, а
// heartbeat перед сном — из главного цикла на ядре 1; две параллельные TLS-сессии
// ESP32 не тянет по памяти.
SemaphoreHandle_t netMutex;

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
// ========== КОНФИГ, УПРАВЛЯЕМЫЙ С СЕРВЕРА ==========
// Лежит в /config.json на LittleFS, поэтому переживает и перезагрузку, и сон.
// Сервер присылает его в ответе на heartbeat только когда версия реально
// поменялась — гонять настройки каждые 30 секунд смысла нет.
struct ScannerConfig {
  uint32_t heartbeatSec    = 30;
  bool     sleepEnabled    = true;
  uint8_t  workStartHour   = 6,  workStartMin = 0;
  uint8_t  workEndHour     = 19, workEndMin   = 30;
  uint8_t  workDaysMask    = 0b00011111;  // бит 0 = Пн ... бит 6 = Вс
  uint32_t nightCheckinMin = 30;          // 0 — во сне на связь не выходить вообще
  uint8_t  volumePercent   = 50;
  uint8_t  ledBrightness   = 100;
  uint32_t debounceSec     = 300;
  time_t   noSleepUntil    = 0;           // обслуживание: до этого времени не спать
  uint32_t version         = 0;           // версия конфига, полученная с сервера
};
ScannerConfig cfg;

// Длина очереди — чтобы не перечитывать файл на каждый heartbeat.
volatile int offlineCount = 0;
// Команда flush_queue поднимает флаг, а досылает уже фоновая задача.
volatile bool forceFlushQueue = false;
// Команда identify: пищать и мигать должен loop() — он владеет экраном, звуком
// и лентой. Дёргать их из фоновой задачи значит драться за SPI и I2S.
volatile bool identifyRequested = false;
// Мелодия успеха играется блокирующе почти секунду. Если запускать её прямо в
// обработчике карты, человек сначала слушает музыку и только потом видит
// зелёный экран. Поэтому ставим флаг, а играем после отрисовки.
bool pendingSuccessMelody = false;
// Периферия поднята. До этого звук и ленту трогать нельзя: при ночном
// пробуждении мы их намеренно не инициализируем.
bool peripheralsReady = false;

// RTC-память переживает deep sleep, обычные глобальные переменные — нет.
RTC_DATA_ATTR bool rtcNightMode = false;   // мы внутри цикла ночных проверок связи
RTC_DATA_ATTR int  rtcOtaFails = 0;        // сколько раз подряд не встала одна и та же сборка
RTC_DATA_ATTR char rtcOtaVersion[24] = "";
RTC_DATA_ATTR char rtcOtaError[96] = "";   // текст последней ошибки OTA — уедет в админку

// Прототипы: часть функций вызывается раньше, чем определена.
void syncTaskCode(void * pvParameters);
void processOfflineBuffer();
int  countOfflineLines();
void saveConfig();
void applyConfig();
bool sendHeartbeat(const char* mode);
void reportCommandResult(int id, bool ok, const char* msg);
void executeCommand(int id, const char* command);
void doPullOta(const char* version, const char* path);
bool shouldBeAwake(const struct tm& t);
long secondsUntilWorkStart(const struct tm& t);
void deepSleepFor(long seconds, bool touchPeripherals);
void nightCheckinRoutine();
bool refreshLocalTime();
void playNote(float frequency, int duration_ms);
time_t utcToEpoch(int y, int mo, int d, int h, int mi, int s);
time_t parseIsoUtc(const char* s);
void parseHhMm(const char* s, uint8_t &h, uint8_t &m);
bool heartbeatExchange(const char* mode);
void applyServerConfig(JsonObject srcCfg, uint32_t newVersion);
void loadConfig();
const char* resetReasonName();

bool isTimeSynced() {
  struct tm t;
  return (getLocalTime(&t, 10) && t.tm_year > 120);
}

// Обновляет глобальный timeinfo и говорит, можно ли ему верить.
//
// Раньше метка времени отметки бралась из timeinfo, а заполнялся он только
// внутри проверки сна — раз в 60 секунд, причём впервые лишь через минуту после
// загрузки. Карта, приложенная в эту первую минуту, получала метку из нулевой
// структуры: "1900-01-00T00:00:00Z". Нулевой день месяца — невалидная дата,
// сервер отвергал такую запись навсегда, а прошивка возвращала её в очередь и
// повторяла каждые 10 секунд до скончания веков.
//
// Вызывать только из главного цикла: timeinfo общий, дёргать его ещё и из
// фоновой задачи — гонка. Фоновой задаче хватает isTimeSynced() с локальной
// переменной.
bool refreshLocalTime() {
  return (getLocalTime(&timeinfo, 10) && timeinfo.tm_year > 120);
}

void saveToOffline(const char* rfid, const char* timestamp) {
  xSemaphoreTake(fileMutex, portMAX_DELAY);
  File f = LittleFS.open("/offline.jsonl", "a");
  if (f) { 
    f.printf("{\"card_id\":\"%s\",\"timestamp\":\"%s\"}\n", rfid, timestamp); 
    f.close(); 
    hasOfflineData = true; 
    offlineCount++;
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
  if (!peripheralsReady) return;  // ночное пробуждение: I2S не инициализирован
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

// ========== МЕЛОДИЯ УСПЕШНОЙ ОТМЕТКИ ==========
// Какую мелодию играть: 1, 2 или 3. Описание — у массивов ниже.
#define SUCCESS_MELODY 1

struct Note { float freq; int ms; };

// Нота без хвоста тишины. playI2STone() доливает в конце 4096 отсчётов тишины
// (четверть секунды при 16 кГц) — для одиночного писка это незаметно, а в
// мелодии между нотами повисали бы паузы и она рассыпалась бы на отдельные
// писки. Длительность округляем вниз до целого числа периодов: тогда волна
// обрывается в нуле и на стыке нот нет щелчка.
void playNote(float frequency, int duration_ms) {
  if (!peripheralsReady || frequency <= 0) return;

  size_t bytes_written;
  float samplesPerCycle = SAMPLE_RATE / frequency;
  int cycles = (int)(((SAMPLE_RATE * duration_ms) / 1000.0) / samplesPerCycle);
  if (cycles < 1) cycles = 1;
  int total_samples = (int)(cycles * samplesPerCycle);

  float phaseIncrement = (64.0 * frequency) / SAMPLE_RATE;
  float phase = 0.0;
  for (int i = 0; i < total_samples; i++) {
    int tableIndex = (int)phase % 64;
    int16_t sample_val = (int16_t)((currentVolume * sineTable[tableIndex]) >> 15);
    uint32_t sample_32 = ((uint32_t)(uint16_t)sample_val << 16) | (uint16_t)sample_val;
    i2s_channel_write(tx_chan, &sample_32, sizeof(sample_32), &bytes_written, portMAX_DELAY);
    phase += phaseIncrement;
  }
}

// 1 — «Подтверждение». Восходящее арпеджио до-мажор с удержанием последней
//     ноты. Спокойное и однозначно положительное, ни с чем не спутаешь.
const Note MELODY_CONFIRM[] = {
  {1046.50f, 110},   // до6
  {1318.51f, 110},   // ми6
  {1567.98f, 110},   // соль6
  {2093.00f, 420},   // до7, с удержанием
};

// 2 — «Победа». Бодрее и заметнее, как в игровых интерфейсах. Хорошо слышно
//     в шумном помещении, но на проходной с большим потоком может надоесть.
const Note MELODY_WIN[] = {
  { 783.99f,  80},   // соль5
  {1046.50f,  80},   // до6
  {1318.51f,  80},   // ми6
  {1567.98f, 110},   // соль6
  {1318.51f,  80},   // ми6
  {1567.98f, 110},   // соль6
  {2093.00f, 320},   // до7
};

// 3 — «Мягкая». Две короткие ноты и одна долгая, без резкого верха.
//     Самая ненавязчивая, если сканер стоит рядом с рабочими местами.
const Note MELODY_SOFT[] = {
  { 987.77f, 120},   // си5
  {1318.51f, 120},   // ми6
  {1567.98f, 480},   // соль6, с удержанием
};

void playMelody(const Note* notes, int count) {
  if (!peripheralsReady) return;
  for (int i = 0; i < count; i++) playNote(notes[i].freq, notes[i].ms);

  // Хвост тишины один на всю мелодию: дочищаем буфер I2S, чтобы усилитель не
  // щёлкнул на обрыве.
  size_t bytes_written;
  uint32_t silence = 0;
  for (int i = 0; i < 2048; i++) {
    i2s_channel_write(tx_chan, &silence, sizeof(silence), &bytes_written, portMAX_DELAY);
  }
}

void beepSuccess() {
#if SUCCESS_MELODY == 2
  playMelody(MELODY_WIN, sizeof(MELODY_WIN) / sizeof(Note));
#elif SUCCESS_MELODY == 3
  playMelody(MELODY_SOFT, sizeof(MELODY_SOFT) / sizeof(Note));
#else
  playMelody(MELODY_CONFIRM, sizeof(MELODY_CONFIRM) / sizeof(Note));
#endif
}
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

// ========== ВСПОМОГАТЕЛЬНОЕ ==========

// Секунды от эпохи для даты в UTC. Своё, потому что mktime() на ESP32 считает
// в локальном поясе, а сервер присылает время в UTC.
time_t utcToEpoch(int y, int mo, int d, int h, int mi, int s) {
  y -= (mo <= 2);
  int era = (y >= 0 ? y : y - 399) / 400;
  unsigned yoe = (unsigned)(y - era * 400);
  unsigned doy = (153 * (mo + (mo > 2 ? -3 : 9)) + 2) / 5 + d - 1;
  unsigned doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
  long days = (long)era * 146097 + (long)doe - 719468;
  return (time_t)days * 86400L + h * 3600L + mi * 60L + s;
}

time_t parseIsoUtc(const char* s) {
  int Y, Mo, D, H, Mi, S;
  if (!s) return 0;
  if (sscanf(s, "%d-%d-%dT%d:%d:%d", &Y, &Mo, &D, &H, &Mi, &S) != 6) return 0;
  return utcToEpoch(Y, Mo, D, H, Mi, S);
}

void parseHhMm(const char* s, uint8_t &h, uint8_t &m) {
  int hh, mm;
  if (!s) return;
  if (sscanf(s, "%d:%d", &hh, &mm) != 2) return;
  h = constrain(hh, 0, 23);
  m = constrain(mm, 0, 59);
}

const char* resetReasonName() {
  switch (esp_reset_reason()) {
    case ESP_RST_POWERON:   return "poweron";
    case ESP_RST_SW:        return "sw";
    case ESP_RST_PANIC:     return "panic";
    case ESP_RST_INT_WDT:   return "int_wdt";
    case ESP_RST_TASK_WDT:  return "task_wdt";
    case ESP_RST_WDT:       return "wdt";
    case ESP_RST_DEEPSLEEP: return "deepsleep";
    case ESP_RST_BROWNOUT:  return "brownout";
    case ESP_RST_EXT:       return "ext";
    default:                return "unknown";
  }
}

int countOfflineLines() {
  int count = 0;
  xSemaphoreTake(fileMutex, portMAX_DELAY);
  File f = LittleFS.open("/offline.jsonl", "r");
  if (f) {
    while (f.available()) { if (f.read() == '\n') count++; }
    f.close();
  }
  xSemaphoreGive(fileMutex);
  return count;
}

// ========== КОНФИГ ==========

void applyConfig() {
  volPercent = cfg.volumePercent;
  currentVolume = map(volPercent, 0, 100, 0, 30000);
  FastLED.setBrightness(cfg.ledBrightness);
}

void saveConfig() {
  JsonDocument doc;
  doc["version"] = cfg.version;
  doc["hb"]      = cfg.heartbeatSec;
  doc["sleep"]   = cfg.sleepEnabled;
  doc["sh"]      = cfg.workStartHour;
  doc["sm"]      = cfg.workStartMin;
  doc["eh"]      = cfg.workEndHour;
  doc["em"]      = cfg.workEndMin;
  doc["days"]    = cfg.workDaysMask;
  doc["night"]   = cfg.nightCheckinMin;
  doc["vol"]     = cfg.volumePercent;
  doc["led"]     = cfg.ledBrightness;
  doc["deb"]     = cfg.debounceSec;
  doc["nosleep"] = (uint32_t)cfg.noSleepUntil;

  xSemaphoreTake(fileMutex, portMAX_DELAY);
  File f = LittleFS.open("/config.json", "w");
  if (f) { serializeJson(doc, f); f.close(); }
  xSemaphoreGive(fileMutex);
}

void loadConfig() {
  xSemaphoreTake(fileMutex, portMAX_DELAY);
  File f = LittleFS.open("/config.json", "r");
  if (f) {
    JsonDocument doc;
    if (!deserializeJson(doc, f)) {
      cfg.version         = doc["version"] | cfg.version;
      cfg.heartbeatSec    = doc["hb"]      | cfg.heartbeatSec;
      cfg.sleepEnabled    = doc["sleep"]   | cfg.sleepEnabled;
      cfg.workStartHour   = doc["sh"]      | cfg.workStartHour;
      cfg.workStartMin    = doc["sm"]      | cfg.workStartMin;
      cfg.workEndHour     = doc["eh"]      | cfg.workEndHour;
      cfg.workEndMin      = doc["em"]      | cfg.workEndMin;
      cfg.workDaysMask    = doc["days"]    | cfg.workDaysMask;
      cfg.nightCheckinMin = doc["night"]   | cfg.nightCheckinMin;
      cfg.volumePercent   = doc["vol"]     | cfg.volumePercent;
      cfg.ledBrightness   = doc["led"]     | cfg.ledBrightness;
      cfg.debounceSec     = doc["deb"]     | cfg.debounceSec;
      cfg.noSleepUntil    = (time_t)(uint32_t)(doc["nosleep"] | (uint32_t)0);
    }
    f.close();
  }
  xSemaphoreGive(fileMutex);
}

// Накатывает настройки, присланные сервером. Отсутствующие поля не трогаем —
// так добавление нового параметра на сервере не сбрасывает остальные.
void applyServerConfig(JsonObject srcCfg, uint32_t newVersion) {
  cfg.heartbeatSec    = srcCfg["heartbeat_sec"]     | cfg.heartbeatSec;
  cfg.sleepEnabled    = srcCfg["sleep_enabled"]     | cfg.sleepEnabled;
  cfg.nightCheckinMin = srcCfg["night_checkin_min"] | cfg.nightCheckinMin;
  cfg.volumePercent   = srcCfg["volume_percent"]    | cfg.volumePercent;
  cfg.ledBrightness   = srcCfg["led_brightness"]    | cfg.ledBrightness;
  cfg.debounceSec     = srcCfg["debounce_sec"]      | cfg.debounceSec;

  parseHhMm(srcCfg["work_start"].as<const char*>(), cfg.workStartHour, cfg.workStartMin);
  parseHhMm(srcCfg["work_end"].as<const char*>(),   cfg.workEndHour,   cfg.workEndMin);

  JsonArray days = srcCfg["work_days"].as<JsonArray>();
  if (!days.isNull()) {
    uint8_t mask = 0;
    for (JsonVariant v : days) {
      int d = v.as<int>();
      if (d >= 1 && d <= 7) mask |= (uint8_t)(1 << (d - 1));
    }
    if (mask) cfg.workDaysMask = mask;   // пустой список игнорируем: иначе сканер уснёт навсегда
  }

  cfg.noSleepUntil = parseIsoUtc(srcCfg["no_sleep_until"].as<const char*>());
  cfg.version = newVersion;

  if (cfg.heartbeatSec < 10) cfg.heartbeatSec = 10;
  saveConfig();
  applyConfig();
  Serial.printf("[КОНФИГ] Применён с сервера, версия %u\n", (unsigned)cfg.version);
}

// ========== РАСПИСАНИЕ И СОН ==========

bool shouldBeAwake(const struct tm& t) {
  if (!cfg.sleepEnabled) return true;

  if (cfg.noSleepUntil > 0) {
    time_t now; time(&now);
    if (now < cfg.noSleepUntil) return true;   // режим обслуживания
  }

  int isoDay = (t.tm_wday == 0) ? 7 : t.tm_wday;          // 1 = Пн ... 7 = Вс
  if (!(cfg.workDaysMask & (1 << (isoDay - 1)))) return false;

  long nowSec   = t.tm_hour * 3600L + t.tm_min * 60L + t.tm_sec;
  long startSec = cfg.workStartHour * 3600L + cfg.workStartMin * 60L;
  long endSec   = cfg.workEndHour   * 3600L + cfg.workEndMin   * 60L;
  return (nowSec >= startSec && nowSec < endSec);
}

long secondsUntilWorkStart(const struct tm& t) {
  int isoDay    = (t.tm_wday == 0) ? 7 : t.tm_wday;
  long nowSec   = t.tm_hour * 3600L + t.tm_min * 60L + t.tm_sec;
  long startSec = cfg.workStartHour * 3600L + cfg.workStartMin * 60L;

  for (int ahead = 0; ahead <= 7; ahead++) {
    int day = ((isoDay - 1 + ahead) % 7) + 1;
    if (!(cfg.workDaysMask & (1 << (day - 1)))) continue;
    if (ahead == 0 && nowSec >= startSec) continue;       // на сегодня начало уже прошло
    return ahead * 86400L + startSec - nowSec;
  }
  return 24 * 3600L;   // рабочих дней в маске нет — просто проверимся через сутки
}

void deepSleepFor(long seconds, bool touchPeripherals) {
  if (seconds < 30) seconds = 30;
  Serial.printf("[СОН] Засыпаю на %ld c (ночные проверки: %s)\n",
                seconds, rtcNightMode ? "да" : "нет");

  if (touchPeripherals) {
    FastLED.clear(); FastLED.show();
    digitalWrite(CTRL_PIN, LOW);
    tft.enableDisplay(false);
  }
  WiFi.disconnect(true); WiFi.mode(WIFI_OFF);
  esp_sleep_enable_timer_wakeup((uint64_t)seconds * 1000000ULL);
  esp_deep_sleep_start();
}

void checkAndGoToSleep() {
  if (!cfg.sleepEnabled) return;
  if (!getLocalTime(&timeinfo, 10)) return;    // без времени спать вслепую опасно
  if (shouldBeAwake(timeinfo)) return;

  long sleepFor = secondsUntilWorkStart(timeinfo);
  bool checkIn = (cfg.nightCheckinMin > 0);
  if (checkIn) {
    long chunk = (long)cfg.nightCheckinMin * 60L;
    if (chunk < sleepFor) sleepFor = chunk;
  }
  rtcNightMode = checkIn;

  // Последний heartbeat перед сном. "night" — проснусь и отмечусь, "presleep" —
  // пропаду до утра, не считайте меня умершим.
  sendHeartbeat(checkIn ? "night" : "presleep");

  // Этим же ответом мог приехать новый конфиг — например «не спать до 22:00»,
  // который админ поставил за минуту до отбоя. Перепроверяем, иначе сканер
  // уснёт назло только что отданному распоряжению.
  if (getLocalTime(&timeinfo, 10) && shouldBeAwake(timeinfo)) {
    rtcNightMode = false;
    return;
  }
  deepSleepFor(sleepFor, true);
}

// ========== СВЯЗЬ С СЕРВЕРОМ ==========

void reportCommandResult(int id, bool ok, const char* msg) {
  if (id <= 0 || WiFi.status() != WL_CONNECTED) return;

  JsonDocument doc;
  doc["device_id"]  = DEVICE_ID;
  doc["command_id"] = id;
  doc["ok"]         = ok;
  doc["message"]    = msg;
  String body; serializeJson(doc, body);

  WiFiClientSecure client; client.setInsecure();
  HTTPClient http;
  http.begin(client, API_URL_CMD_RESULT);
  http.setTimeout(8000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_KEY);
  http.POST(body);
  http.end();
}

void executeCommand(int id, const char* command) {
  String c = command;
  Serial.printf("[КОМАНДА] %s (#%d)\n", command, id);

  if (c == "reboot") {
    // Отчитываемся ДО перезагрузки — иначе команда навсегда останется висеть
    // в статусе «отправлена», и админка не покажет, что всё получилось.
    reportCommandResult(id, true, "Перезагружаюсь");
    delay(300);
    ESP.restart();
    return;
  }

  if (c == "clear_queue") {
    int dropped = offlineCount;
    xSemaphoreTake(fileMutex, portMAX_DELAY);
    LittleFS.remove("/offline.jsonl");
    LittleFS.remove("/temp.jsonl");
    xSemaphoreGive(fileMutex);
    offlineCount = 0;
    hasOfflineData = false;
    char msg[80];
    snprintf(msg, sizeof(msg), "Очередь очищена, потеряно отметок: %d", dropped);
    reportCommandResult(id, true, msg);
    return;
  }

  if (c == "flush_queue") {
    forceFlushQueue = true;
    reportCommandResult(id, true, "Досылаю очередь");
    return;
  }

  if (c == "identify") {
    if (!peripheralsReady) {
      reportCommandResult(id, false, "Сканер спит — сигнал подать нечем");
      return;
    }
    identifyRequested = true;   // пищит и мигает loop(), он владеет звуком и лентой
    reportCommandResult(id, true, "Сигнал подан");
    return;
  }

  if (c == "reload_config") {
    cfg.version = 0;            // на следующем heartbeat сервер пришлёт настройки заново
    saveConfig();
    reportCommandResult(id, true, "Настройки будут перечитаны");
    return;
  }

  reportCommandResult(id, false, "Команда не поддерживается этой прошивкой");
}

// Скачивает и ставит прошивку с сервера. В отличие от ArduinoOTA работает из
// любой сети — не нужно быть с ноутбуком в одной локалке со сканером.
void doPullOta(const char* version, const char* path) {
  if (!version || !path || strlen(path) == 0) return;

  // Одна и та же сборка не ставится больше трёх раз подряд: иначе битый .bin
  // заставит сканер качать его вечно.
  if (strncmp(rtcOtaVersion, version, sizeof(rtcOtaVersion) - 1) == 0) {
    if (rtcOtaFails >= 3) {
      Serial.println("[OTA] Сборка уже трижды не встала — больше не пробую");
      return;
    }
  } else {
    strncpy(rtcOtaVersion, version, sizeof(rtcOtaVersion) - 1);
    rtcOtaVersion[sizeof(rtcOtaVersion) - 1] = '\0';
    rtcOtaFails = 0;
  }

  Serial.printf("[OTA] Ставлю версию %s\n", version);
  isOTAUpdating = true;

  if (peripheralsReady) {
    FastLED.clear(); FastLED.show();
    tft.fillScreen(ST77XX_BLACK);
    u8g2Fonts.setFont(u8g2_font_cu12_t_cyrillic);
    u8g2Fonts.setForegroundColor(ST77XX_YELLOW);
    u8g2Fonts.setBackgroundColor(ST77XX_BLACK);
    u8g2Fonts.setCursor(20, 40); u8g2Fonts.print("ОБНОВЛЕНИЕ");
    u8g2Fonts.setCursor(15, 65); u8g2Fonts.print("не выключайте");
  }

  // Скачивание блокирующее и долгое — сторожевой таймер на это время снимаем.
  esp_task_wdt_delete(NULL);

  WiFiClientSecure client; client.setInsecure();
  httpUpdate.rebootOnUpdate(true);
  httpUpdate.setAuthorization("scanner", DEVICE_KEY);   // HTTPUpdate умеет только Basic
  // Контрольную сумму HTTPUpdate возьмёт сам из заголовка x-MD5 и сверит после
  // скачивания — битый образ до записи не дойдёт.
  t_httpUpdate_return ret = httpUpdate.update(client, API_BASE + String(path));

  // Сюда попадаем, только если перезагрузки не случилось — значит обновление
  // не встало. Счётчик неудач поднимаем лишь на настоящей ошибке: ответ
  // HTTP_UPDATE_NO_UPDATES означает «ставить нечего», это не поломка.
  if (ret == HTTP_UPDATE_FAILED) {
    rtcOtaFails++;
    snprintf(rtcOtaError, sizeof(rtcOtaError), "%s: %s",
             version, httpUpdate.getLastErrorString().c_str());
    Serial.printf("[OTA] Не удалось: %s\n", rtcOtaError);
  } else {
    Serial.printf("[OTA] Сервер не дал обновления (код %d)\n", (int)ret);
  }

  // Пищим ДО снятия флага: пока он поднят, loop() не трогает I2S и драки за
  // звуковой канал между ядрами не будет.
  if (peripheralsReady) { beepError(); forceRedraw = true; currentScreen = MAIN_SCREEN; }
  isOTAUpdating = false;
  esp_task_wdt_add(NULL);
}

// Единственный способ для сервера что-то нам сказать: своего адреса у сканера
// нет, наружу он ходит только сам.
bool heartbeatExchange(const char* mode) {
  JsonDocument doc;
  doc["device_id"]       = DEVICE_ID;
  doc["fw_version"]      = FW_VERSION;
  doc["mode"]            = mode;
  doc["config_version"]  = cfg.version;
  doc["ip"]              = WiFi.localIP().toString();
  doc["ssid"]            = WiFi.SSID();
  doc["rssi"]            = WiFi.RSSI();
  doc["battery_percent"] = batteryPercent;
  doc["battery_voltage"] = batteryVoltage;
  doc["queue_size"]      = offlineCount;
  doc["free_heap"]       = (uint32_t)ESP.getFreeHeap();
  doc["uptime_sec"]      = (uint32_t)(millis() / 1000UL);
  doc["reset_reason"]    = resetReasonName();
  doc["time_synced"]     = isTimeSynced();
  if (rtcOtaError[0]) doc["ota_error"] = rtcOtaError;

  String body; serializeJson(doc, body);

  WiFiClientSecure client; client.setInsecure();
  HTTPClient http;
  http.begin(client, API_URL_HEARTBEAT);
  http.setTimeout(10000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_KEY);

  int code = http.POST(body);
  if (code != 200) {
    Serial.printf("[HEARTBEAT] Сервер ответил %d\n", code);
    http.end();
    return false;
  }
  String payload = http.getString();
  http.end();

  rtcOtaError[0] = '\0';   // ошибку доложили — больше её не повторяем

  JsonDocument resp;
  if (deserializeJson(resp, payload)) return false;

  uint32_t serverCfgVersion = resp["config_version"] | cfg.version;
  JsonObject newCfg = resp["config"].as<JsonObject>();
  if (!newCfg.isNull()) applyServerConfig(newCfg, serverCfgVersion);

  // Обновление важнее команд: после него всё равно перезагрузка, а остальное
  // доедет уже на новой прошивке.
  JsonObject ota = resp["ota"].as<JsonObject>();
  if (!ota.isNull()) {
    doPullOta(ota["version"] | "", ota["url"] | "");
    return true;
  }

  for (JsonVariant item : resp["commands"].as<JsonArray>()) {
    executeCommand(item["id"] | 0, item["command"] | "");
  }
  return true;
}

bool sendHeartbeat(const char* mode) {
  if (WiFi.status() != WL_CONNECTED) return false;

  // Ждём недолго и намеренно: заблокироваться тут насмерть нельзя — главный цикл
  // обязан успевать гладить сторожевой таймер. Не дождались — пропустим удар,
  // следующий всё равно через heartbeatSec секунд.
  if (netMutex && xSemaphoreTake(netMutex, pdMS_TO_TICKS(5000)) != pdTRUE) {
    Serial.println("[HEARTBEAT] Сеть занята досылом очереди, пропускаю");
    return false;
  }
  bool ok = heartbeatExchange(mode);
  if (netMutex) xSemaphoreGive(netMutex);
  return ok;
}

// ========== КОРОТКОЕ ПРОБУЖДЕНИЕ НОЧЬЮ ==========
// Поднимаем только Wi-Fi: отчитываемся, досылаем накопившееся, забираем команды
// и спим дальше. Экран, подсветка, звук и ридер не включаются — ради этого всё
// и затевалось, иначе ночное дежурство съело бы батарею.
void nightCheckinRoutine() {
  esp_task_wdt_config_t wdt_config = {
    .timeout_ms = 60000,
    .idle_core_mask = (1 << portNUM_PROCESSORS) - 1,
    .trigger_panic = true
  };
  esp_task_wdt_reconfigure(&wdt_config);
  esp_task_wdt_add(NULL);

  LittleFS.begin(true);
  if (fileMutex == NULL) fileMutex = xSemaphoreCreateMutex();
  if (netMutex == NULL) netMutex = xSemaphoreCreateMutex();
  loadConfig();
  offlineCount = countOfflineLines();
  hasOfflineData = (offlineCount > 0);

  struct tm t;
  bool haveTime = getLocalTime(&t, 100);   // после deep sleep часы RTC идут дальше

  // Утро наступило — грузимся полностью. Через перезагрузку, чтобы не тащить
  // за собой половину поднятого ночного состояния.
  if (haveTime && shouldBeAwake(t)) { rtcNightMode = false; ESP.restart(); }

  pinMode(BATT_PIN, INPUT);
  lastBattCheck = 0;
  updateBatteryStatus();

  WiFi.mode(WIFI_STA); WiFi.onEvent(onWiFiEvent); WiFi.begin();
  for (int i = 0; i < 100 && WiFi.status() != WL_CONNECTED; i++) {
    esp_task_wdt_reset();
    delay(200);
  }

  if (WiFi.status() == WL_CONNECTED) {
    hasInternet = true;
    if (!haveTime) {
      configTzTime("EET-2EEST,M3.5.0/3,M10.5.0/4", "pool.ntp.org");
      for (int i = 0; i < 25 && !isTimeSynced(); i++) { esp_task_wdt_reset(); delay(200); }
      haveTime = getLocalTime(&t, 100);
    }
    esp_task_wdt_reset();
    processOfflineBuffer();          // накопленное за ночь уйдёт сразу
    esp_task_wdt_reset();
    sendHeartbeat("night");          // здесь же выполнятся команды и обновление
  }

  // Команда могла снять расписание или включить режим обслуживания — тогда
  // просыпаемся по-настоящему. (reboot перезагружает сам, сюда не возвращается.)
  if (getLocalTime(&t, 100) && shouldBeAwake(t)) { rtcNightMode = false; ESP.restart(); }

  long sleepFor = (long)cfg.nightCheckinMin * 60L;
  if (sleepFor <= 0) sleepFor = 30 * 60L;   // проверки выключили — доспим до утра одним куском
  if (haveTime) {
    long untilStart = secondsUntilWorkStart(t);
    if (untilStart < sleepFor) sleepFor = untilStart;
  }
  deepSleepFor(sleepFor, false);
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

  // Проснулись по таймеру внутри ночного цикла — уходим в короткую ветку:
  // отчитаться и спать дальше, не поднимая экран, ленту, звук и ридер. Отсюда
  // не возвращаются: либо снова сон, либо перезагрузка в полный режим.
  if (esp_sleep_get_wakeup_cause() == ESP_SLEEP_WAKEUP_TIMER && rtcNightMode) {
    nightCheckinRoutine();
  }

  // Обновление доехало — забываем прошлую ошибку OTA, она уже неактуальна.
  if (strcmp(rtcOtaVersion, FW_VERSION) == 0) { rtcOtaError[0] = '\0'; rtcOtaFails = 0; }

  pinMode(CTRL_PIN, OUTPUT); digitalWrite(CTRL_PIN, HIGH); delay(50);
  rfidBuffer.reserve(32); 
  pinMode(BTN_UP, INPUT_PULLUP); pinMode(BTN_DOWN, INPUT_PULLUP);
  pinMode(BTN_OK, INPUT_PULLUP); pinMode(BATT_PIN, INPUT);

  esp_task_wdt_config_t wdt_config = { .timeout_ms = 25000, .idle_core_mask = (1 << portNUM_PROCESSORS) - 1, .trigger_panic = true };
  esp_task_wdt_reconfigure(&wdt_config); esp_task_wdt_add(NULL);

  LittleFS.begin(true);
  fileMutex = xSemaphoreCreateMutex();
  netMutex = xSemaphoreCreateMutex();
  scanQueue = xQueueCreate(10, sizeof(ScanEvent)); 

  xSemaphoreTake(fileMutex, portMAX_DELAY);
  if (LittleFS.exists("/temp.jsonl")) {
    File offline = LittleFS.open("/offline.jsonl", "a");
    File temp = LittleFS.open("/temp.jsonl", "r");
    if (offline && temp) { while(temp.available()) offline.write(temp.read()); hasOfflineData = true; }
    if (temp) temp.close(); if (offline) offline.close();
    LittleFS.remove("/temp.jsonl");
  }
  xSemaphoreGive(fileMutex);

  // Настройки с прошлого раза — до первого heartbeat работаем по ним, а не по
  // дефолтам, иначе после каждой перезагрузки сканер на полминуты забывал бы
  // расписание и громкость.
  loadConfig();
  offlineCount = countOfflineLines();
  hasOfflineData = (offlineCount > 0);

  initI2S(); 
  SPI.begin(12, -1, 11, 13); 
  tft.initR(INITR_144GREENTAB); 
  tft.fillScreen(ST77XX_BLACK); tft.setRotation(1); tft.setTextWrap(false);
  
  u8g2Fonts.begin(tft); u8g2Fonts.setFontMode(1); u8g2Fonts.setFontDirection(0);
  u8g2Fonts.setFont(u8g2_font_cu12_t_cyrillic); u8g2Fonts.setForegroundColor(ST77XX_WHITE);
  u8g2Fonts.setCursor(15, 60); u8g2Fonts.print("ЗАГРУЗКА...");
  
  Serial2.begin(9600, SERIAL_8N1, RFID_RX_PIN, -1);
  FastLED.addLeds<WS2812B, LED_PIN, GRB>(leds, NUM_LEDS);
  FastLED.setBrightness(cfg.ledBrightness); FastLED.clear(); FastLED.show();
  applyConfig();
  peripheralsReady = true;   // с этого момента звук и ленту трогать можно

  WiFi.mode(WIFI_STA); WiFi.onEvent(onWiFiEvent); WiFi.setAutoReconnect(true); WiFi.begin(); 
  setupOTA(); 

  currentScreen = MAIN_SCREEN; forceRedraw = true;
  xTaskCreatePinnedToCore(syncTaskCode, "SyncTask", 16384, NULL, 1, &SyncTask, 0);
}

bool postSingleScan(ScanEvent& evt) {
  // Тоже под общим мьютексом сети: параллельно с досылом очереди или heartbeat
  // вторую TLS-сессию ESP32 не потянет.
  if (netMutex && xSemaphoreTake(netMutex, pdMS_TO_TICKS(5000)) != pdTRUE) return false;

  WiFiClientSecure client; client.setInsecure();
  HTTPClient http;
  http.begin(client, API_URL_BULK); 
  http.setTimeout(10000); 
  http.addHeader("Content-Type", "application/json");
  
  char jsonBuffer[256];
  snprintf(jsonBuffer, sizeof(jsonBuffer), "{\"scans\":[{\"card_id\":\"%s\",\"timestamp\":\"%s\"}]}", evt.rfid, evt.timestamp);
  int res = http.POST(String(jsonBuffer));
  http.end();
  if (netMutex) xSemaphoreGive(netMutex);
  // ИСПРАВЛЕНО: только 2xx считаем успехом. 4xx раньше тоже удалял запись -> теряли отметки.
  return (res >= 200 && res < 300);
}

void processOfflineBuffer() {
  if (WiFi.status() != WL_CONNECTED || !hasInternet || !isTimeSynced()) return;
  if (netMutex && xSemaphoreTake(netMutex, pdMS_TO_TICKS(3000)) != pdTRUE) return;

  bool fileExists = false;
  xSemaphoreTake(fileMutex, portMAX_DELAY);
  if (LittleFS.exists("/offline.jsonl")) {
    File f = LittleFS.open("/offline.jsonl", "r");
    if (f) { fileExists = (f.size() > 5); f.close(); }
    if (fileExists) LittleFS.rename("/offline.jsonl", "/temp.jsonl");
  }
  xSemaphoreGive(fileMutex);

  if (!fileExists) { if (netMutex) xSemaphoreGive(netMutex); return; }

  File tempFile = LittleFS.open("/temp.jsonl", "r");
  if (!tempFile) { if (netMutex) xSemaphoreGive(netMutex); return; }

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

      // Только 2xx считаем успехом: таймаут и 5xx означают «попробуй позже»,
      // и терять из-за них отметки нельзя.
      if (res >= 200 && res < 300) {
        // Сервер реально принял -> забываем эту строку
      } else if (res == 422) {
        // 422 — «я не понимаю эти данные». В отличие от таймаута это не
        // пройдёт никогда, сколько ни повторяй: одна битая запись иначе
        // крутится в очереди вечно и забивает сеть. Сервер её у себя
        // залогировал, так что потеря видима, а не молчалива.
        Serial.printf("[ОЧЕРЕДЬ] Сервер не понял запись, выбрасываю: %s\n", line.c_str());
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
  xSemaphoreGive(fileMutex);

  if (netMutex) xSemaphoreGive(netMutex);

  // Пересчитываем по факту: длину очереди видно в админке, врать ей нельзя.
  offlineCount = countOfflineLines();
  hasOfflineData = (offlineCount > 0);
}

void syncTaskCode(void * pvParameters) {
  esp_task_wdt_add(NULL);
  unsigned long lastBulkSync = 0;
  unsigned long lastHeartbeat = 0;
  bool firstBeat = true;
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
    
    if (forceFlushQueue || millis() - lastBulkSync > 10000) {
      forceFlushQueue = false;
      lastBulkSync = millis();
      processOfflineBuffer();
    }

    // Heartbeat: сервер за NAT до нас не достучится, поэтому отчитываемся сами
    // и заодно забираем накопившиеся команды. Первый раз — сразу, как поднялась
    // сеть, чтобы в админке устройство появилось не через полминуты.
    if (WiFi.status() == WL_CONNECTED && hasInternet) {
      unsigned long interval = firstBeat ? 3000UL : (unsigned long)cfg.heartbeatSec * 1000UL;
      if (millis() - lastHeartbeat > interval) {
        lastHeartbeat = millis();
        firstBeat = false;
        sendHeartbeat("active");
      }
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

  // Команду identify исполняет главный цикл: звук, лента и экран принадлежат
  // ему, дёргать их из фоновой задачи — драка за SPI и I2S.
  if (identifyRequested) {
    identifyRequested = false;
    beepNav(); beepSuccess();
    fill_rainbow(leds, NUM_LEDS, 0, 255 / NUM_LEDS); FastLED.show();
    delay(700);
    FastLED.clear(); FastLED.show();
    forceRedraw = true;
  }

  static unsigned long lastSleepCheck = 0;
  if (nowMs - lastSleepCheck > 60000) {
    lastSleepCheck = nowMs;
    // Внутри — heartbeat с сетевым таймаутом, до полутора десятков секунд.
    // Гладим сторожевой таймер с обеих сторон, чтобы он не счёл это зависанием.
    esp_task_wdt_reset();
    checkAndGoToSleep();
    esp_task_wdt_reset();
  }

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
        const unsigned long debounceMs = (unsigned long)cfg.debounceSec * 1000UL;
        for (auto it = recentScans.begin(); it != recentScans.end(); ) {
          if (nowMs - it->second > debounceMs) it = recentScans.erase(it);
          else ++it;
        }
        if (recentScans.count(rfidBuffer) && (nowMs - recentScans[rfidBuffer] < debounceMs)) {
          if (nowMs - recentScans[rfidBuffer] < 4000) { rfidBuffer = ""; continue; } 
          currentScreen = ERROR_SCREEN; forceRedraw = true; screenTimer = nowMs;
          recentScans[rfidBuffer] = nowMs; beepError(); 
        } else {
          recentScans[rfidBuffer] = nowMs;
          char iso[25];
          if (refreshLocalTime()) {
            snprintf(iso, sizeof(iso), "%04d-%02d-%02dT%02d:%02d:%02dZ", 
                     timeinfo.tm_year + 1900, timeinfo.tm_mon + 1, timeinfo.tm_mday, timeinfo.tm_hour, timeinfo.tm_min, timeinfo.tm_sec);
          } else { snprintf(iso, sizeof(iso), "MS:%lu", millis()); }
          
          ScanEvent newScan;
          strcpy(newScan.rfid, rfidBuffer.c_str());
          strcpy(newScan.timestamp, iso);
          
          if (xQueueSend(scanQueue, &newScan, 0) != pdTRUE) saveToOffline(newScan.rfid, newScan.timestamp);
          currentScreen = SUCCESS_SCREEN; forceRedraw = true; screenTimer = nowMs; pendingSuccessMelody = true;
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
      if (refreshLocalTime()) {
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
        if (refreshLocalTime()) { sprintf(timeStr, "%02d:%02d", timeinfo.tm_hour, timeinfo.tm_min); tft.setTextColor(ST77XX_BLACK); tft.setTextSize(3); tft.setCursor(20, 90); tft.print(timeStr); }
        forceRedraw = false;
        if (pendingSuccessMelody) {
          pendingSuccessMelody = false;
          beepSuccess();
          // Отсчёт показа экрана — с конца мелодии, иначе она съела бы почти
          // секунду из тех 1.7 с, что экран висит перед глазами.
          screenTimer = millis();
        }
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