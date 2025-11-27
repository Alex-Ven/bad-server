# Web-ларёк: Бэкенд (исправление уязвимостей)

**Учебный проект** — аудит и устранение критических уязвимостей в бэкенде интернет-магазина «Веб-ларёк».

**Задача:** найти и закрыть все уязвимости из чек-листа Яндекс.Практикума, довести проект до **18/18 зелёных тестов**.

Макет: https://www.figma.com/design/rn2zbPfPEV2VjZ9BpPxOZl/Yandex-(Веб-ларёк)

## Результат — 100 % выполнено

| Уязвимость / требование                        | Статус     | Как исправлено |
|-----------------------------------------------|------------|----------------|
| XSS                                           | Closed     | Экранирование всех пользовательских данных перед выводом |
| CSRF                                          | Closed     | Токены + валидация на сервере |
| NoSQL/SQL-инъекции                            | Closed     | Параметризованные запросы, санитизация |
| Переполнение буфера / большие строки          | Closed     | Лимиты на размер body и полей |
| ReDoS                                         | Closed     | Безопасные регулярки, таймауты |
| DDoS / брутфорс                               | Closed     | Rate limiting (express-rate-limit) |
| Path Traversal при загрузке файлов           | Closed     | Генерация случайных имён + проверка расширения |
| Ограничение размера файлов                    | Closed     | Минимум >2 Кб, максимум <10 Мб |
| Проверка метаданных изображений               | Closed     | Проверка MIME-типа и размеров |
| CORS                                          | Closed     | Настроен с явными origin |
| npm audit (зависимости)                       | Closed     | 0 уязвимостей (js-yaml ≥4.1.1, validator ≥13.15.20) |
| Линтер, типизация, сборка                     | Closed     | 0 ошибок и предупреждений |

**Автотесты (Playwright):**  
**18 из 18 пройдено** (48.1 с) — включая аудит зависимостей  
Запуск: `bash $DIR_TESTS/bin/run.sh`

## Быстрый старт

```bash
git clone https://github.com/Alex-Ven/bad-server.git
cd bad-server
git checkout review

# Запуск
docker compose up -d

# Тесты
bash $DIR_TESTS/bin/run.sh   # или npm test
```

Сервисы:
- Главная: http://localhost/
- Логин: http://localhost/login/
- Админка: http://localhost/admin/

## Автор

**Александр Венедюхин** — Fullstack / Backend разработчик  
[LinkedIn](https://linkedin.com/in/alexander-venedyukhin-1288abb2) • [GitHub](https://github.com/Alex-Ven) • [Telegram](https://t.me/alex_venedyukhin)

## Поддержать проект

Понравилось? → ⭐ Star репозиторию!  
Есть идеи? → [Создать Issue](https://github.com/Alex-Ven/bad-server/issues/new)

**Теги:** `nodejs`, `express`, `security`, `docker`, `playwright`, `audit`, `portfolio`, `2025`

