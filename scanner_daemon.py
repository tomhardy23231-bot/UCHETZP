# scanner_daemon.py
import keyboard
import requests
import time
import logging

# Настройка логирования
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler("scanner.log"),
        logging.StreamHandler()
    ]
)

# --- КОНФИГУРАЦИЯ ---
# URL бэкенда для отправки данных сканера
BACKEND_URL = "http://localhost:8000/api/attendance/scan"

# --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ---
card_buffer = []

def on_key_press(event):
    """
    Обработчик нажатия клавиш.
    Собирает символы в буфер и отправляет по нажатию Enter.
    """
    global card_buffer

    # Мы не можем надежно определить устройство Port_#0003.Hub_#0001
    # с помощью библиотеки keyboard. Она работает на более высоком уровне.
    # Поэтому этот скрипт будет перехватывать ввод со ВСЕХ клавиатур.
    # Для production-решения может потребоваться более низкоуровневая
    # библиотека (например, pyusb, pywinusb) и права администратора.

    if event.name == 'enter':
        # Если нажат Enter и буфер не пуст
        if card_buffer:
            card_id = "".join(card_buffer)
            logging.info(f"Считана карта: {card_id}")
            
            # Отправляем на сервер
            try:
                response = requests.post(BACKEND_URL, json={"card_id": card_id})
                response.raise_for_status()  # Вызовет исключение для кодов 4xx/5xx
                
                logging.info(f"Ответ сервера: {response.status_code} - {response.json()}")

            except requests.exceptions.RequestException as e:
                logging.error(f"Ошибка отправки данных на сервер: {e}")

            # Очищаем буфер после отправки
            card_buffer = []
        return True # Разблокируем Enter для других приложений, если буфер был пуст

    elif len(event.name) == 1:
        # Добавляем в буфер только "печатаемые" символы (буквы, цифры)
        card_buffer.append(event.name)
    
    # `True` означает, что событие перехвачено и не будет передано другим приложениям.
    # Это блокирует вывод ID карты в активное окно.
    return True

def main():
    """
    Основная функция.
    """
    logging.info("Демон сканера запущен. Ожидание ввода с карты...")
    logging.info("Для остановки нажмите Ctrl+C в консоли.")
    
    # `suppress=True` критически важен, чтобы перехватывать и блокировать
    # события от других приложений.
    keyboard.on_press(on_key_press, suppress=True)

    # Бесконечный цикл, чтобы скрипт не завершался
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        logging.info("Остановка демона сканера...")
        keyboard.unhook_all()
        logging.info("Демон остановлен.")

if __name__ == "__main__":
    main()
