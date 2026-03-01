import { useState, useEffect, useCallback } from 'react';

// Уникальное имя события для синхронизации в пределах одной вкладки
const CUSTOM_STORAGE_EVENT = 'custom-storage-event';

export function useTtlLocalStorage(key, defaultValue, ttlMs = 60 * 60 * 1000) {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (!item) return defaultValue;

      const parsed = JSON.parse(item);
      const now = Date.now();

      if (now - parsed.ts > ttlMs) {
        window.localStorage.removeItem(key);
        return defaultValue;
      }
      return parsed.value;
    } catch (error) {
      console.error('Error reading from localStorage', error);
      return defaultValue;
    }
  });

  // Кастомный сеттер, который решает проблему гонки состояний
  const setValue = useCallback(
    (value) => {
      try {
        const newValue = value instanceof Function ? value(storedValue) : value;
        // 1. Сначала синхронно сохраняем в localStorage
        const item = {
          value: newValue,
          ts: Date.now(),
        };
        window.localStorage.setItem(key, JSON.stringify(item));
        
        // 2. Затем обновляем состояние этого компонента
        setStoredValue(newValue);

        // 3. Уведомляем другие компоненты на этой же странице
        window.dispatchEvent(new CustomEvent(CUSTOM_STORAGE_EVENT, {
          detail: { key, newValue },
        }));
      } catch (error) {
        console.error('Error saving to localStorage', error);
      }
    },
    [key, storedValue]
  );

  useEffect(() => {
    // Слушатель для синхронизации между вкладками
    const handleStorageChange = (e) => {
      if (e.key === key && e.newValue) {
        try {
          const item = JSON.parse(e.newValue);
          setStoredValue(item.value);
        } catch (error) {
          console.error('Error parsing storage event', error);
        }
      }
    };

    // Слушатель для синхронизации на одной странице
    const handleCustomStorageChange = (e) => {
      if (e.detail.key === key) {
        setStoredValue(e.detail.newValue);
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    window.addEventListener(CUSTOM_STORAGE_EVENT, handleCustomStorageChange);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener(CUSTOM_STORAGE_EVENT, handleCustomStorageChange);
    };
  }, [key]);

  return [storedValue, setValue];
}
