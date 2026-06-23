# Прошивка сканера HARIZMA

**Актуальная прошивка сканера** для системы учёта посещаемости UCHETZP.

- **Платформа:** ESP32-S3 (Arduino framework)
- **Файл прошивки:** [`scanner_firmware.cpp`](scanner_firmware.cpp)
- **Отправляет данные на:** `https://uche12tzp.vercel.app/api/attendance/bulk-scan`

## Что делает устройство
- Читает RFID-карты (UART, пин 16) и регистрирует отметки посещаемости.
- Дисплей ST7735 (1.44") + UI: главный экран с часами, меню, громкость, настройка Wi-Fi.
- Звук через I2S (бипы при успехе/ошибке/навигации), LED-индикация WS2812B.
- Офлайн-буфер на LittleFS: при отсутствии интернета отметки сохраняются в `offline.jsonl`
  и досылаются на сервер при появлении связи.
- Синхронизация времени по NTP, авто-сон в нерабочие часы, OTA-обновление по сети.

## Сборка
Открыть `scanner_firmware.cpp` в Arduino IDE / PlatformIO.

Нужные библиотеки: `WiFi`, `WiFiClientSecure`, `HTTPClient`, `LittleFS`, `FastLED`,
`Adafruit_GFX`, `Adafruit_ST7735`, `U8g2_for_Adafruit_GFX`, `WiFiManager`, `ArduinoOTA`,
`esp_task_wdt`, драйвер `driver/i2s_std.h`.
