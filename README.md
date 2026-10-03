# Backend для Тандем (Tandem)

Бэкенд-часть приложения для пар «Тандем» – REST API на базе **Hono**, **Prisma** и **PostgreSQL**. Управление пользователями, парами, общими секциями и записями.

---

## Стек технологий

- **Runtime**: Bun (или Node.js с транспиляцией)
- **Фреймворк**: Hono (лёгкий, быстрый)
- **ORM**: Prisma с адаптером для PostgreSQL
- **База данных**: PostgreSQL
- **Аутентификация**: JWT (короткий access) + refresh-токены в БД с ротацией
- **Валидация**: `fenviee` (переменные окружения)
- **Типизация**: TypeScript

---

## Требования

- Bun 1.4+ (или Node.js 22+)
- PostgreSQL 14+
- Установленный Bun: `curl -fsSL https://bun.sh/install | bash`

---

## Установка и запуск

1. Клонируйте репозиторий:

```bash
git clone https://github.com/FOCKUSTY/backend-tandem.git
cd backend-tandem
```

1. Установите зависимости:

```bash
bun install
```

1. Настройте переменные окружения – создайте файл `.env` в корне:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/tandem
JWT_SECRET=ваш_секретный_ключ
PORT=8080
```

1. Выполните миграции Prisma:

```bash
bun run prisma migrate deploy
# или
bun run prisma db push
```

1. Запустите сервер:

```bash
bun run src/index.ts
```

Сервер запустится на порту, указанном в `.env` (по умолчанию 8080).

---

## Структура проекта

```
src/
├── controllers/          # Обработчики запросов
│   ├── auth.controller.ts
│   ├── records.controller.ts
│   ├── sections.controller.ts
│   └── users.controller.ts
├── routes/               # Маршруты
│   ├── auth.ts
│   ├── records.ts
│   ├── sections.ts
│   └── users.ts
├── middlewares/          # Промежуточное ПО
│   └── auth.middleware.ts
├── services/             # Бизнес-логика
│   └── auth.service.ts   # Сессии, ротация refresh-токенов, отзыв
├── prisma/               # Prisma-схема, миграции, клиент
│   ├── schema.prisma
│   ├── migrations/
│   └── generated/        # Сгенерированный клиент
├── utils/                # Утилиты
│   ├── pair.ts           # Вспомогательные функции для работы с парами
│   └── ...
├── env.ts                # Конфигурация переменных окружения
├── jwt.ts                # Access-токены (JWT) и хеши refresh-токенов
├── index.ts              # Точка входа
└── import.script.ts      # Скрипт импорта данных из result.json
```

---

## Модели данных

### User

- `id`: UUID
- `username`: уникальный
- `password`: хеш (bcrypt)
- `name`: отображаемое имя
- `pairId`: ссылка на Pair

### Pair

- `id`: UUID
- `userAId`, `userBId`: ссылки на пользователей
- `sections`: общие секции пары

### Session / RefreshToken

- `Session`: один вход с устройства. Хранит `deviceId`, `platform`, `appVersion`, `userAgent`, `ip`, `expiresAt` (`null` — бессрочная сессия), `lastUsedAt`, `revokedAt`, `revokedReason`
- `RefreshToken`: `tokenHash` (SHA-256, сам токен в БД не хранится), `expiresAt`, `usedAt`, `revokedAt`
- Одна сессия = цепочка refresh-токенов: при каждом обновлении выдаётся новый, старый помечается использованным

### Section

- `id`: UUID
- `pairId`: ссылка на пару
- `name`, `slug`: человекочитаемое имя и уникальный идентификатор
- `isSystem`: системная секция (не удаляется)
- `order`: порядок отображения
- `records`: список записей

### Record

- `id`: UUID
- `userId`: автор записи
- `sectionId`: ссылка на секцию
- `title`, `content`: заголовок и текст (Markdown)
- `dateEvent`: дата события (опционально)
- `isCompleted`, `isPinned`: флаги
- `tags`: массив тегов
- `metadata`: произвольные данные JSON

---

## API Endpoints

Базовый префикс: `/api`

### Auth

Базовый префикс: `/api`

| Метод  | Путь                    | Токен   | Описание                                                   |
| ------ | ----------------------- | ------- | ---------------------------------------------------------- |
| POST   | `/auth/register`        | —       | Регистрация, возвращает пару токенов и данные пользователя |
| POST   | `/auth/login`           | —       | Авторизация, возвращает пару токенов и данные пользователя |
| POST   | `/auth/refresh`         | refresh | Обмен refresh-токена на новую пару (с ротацией)            |
| POST   | `/auth/logout`          | refresh | Отозвать текущую сессию                                    |
| POST   | `/auth/introspect`      | —       | `{ active: boolean }` — жив ли access-токен                |
| POST   | `/auth/forgot-password` | —       | Запросить письмо для сброса пароля                         |
| POST   | `/auth/reset-password`  | —       | Сбросить пароль по токену из письма (отзывает все сессии)  |
| GET    | `/auth/sessions`        | access  | Список активных сессий (устройств)                         |
| DELETE | `/auth/sessions/:id`    | access  | Отозвать конкретную сессию по её `id`                      |
| POST   | `/auth/logout-all`      | access  | Отозвать все сессии пользователя                           |

Ответ `login`/`register`/`refresh` (в старых версиях было поле `token` — теперь его нет):

```json
{
  "accessToken": "eyJhbGciOi...",
  "refreshToken": "9f2c...",
  "accessTokenExpiresAt": "2026-10-03T17:20:00.000Z",
  "refreshTokenExpiresAt": "2027-01-01T16:20:00.000Z",
  "sessionId": "01a1028f-...",
  "user": { "id": "...", "username": "...", "name": "...", "email": "..." }
}
```

`refreshTokenExpiresAt: null` означает бессрочную сессию (`remember: "forever"`).

#### Как это работает

- **access-токен** — JWT на 60 минут, проверяется без обращения к БД.
- **refresh-токен** — opaque-строка (не JWT), в БД лежит только её SHA-256 хеш. Проверяется поиском в БД, поэтому отзывается мгновенно.
- **Ротация**: каждый `/auth/refresh` возвращает новый refresh-токен, старый становится недействительным. Абсолютная дата истечения сессии при этом не продлевается.
- **Reuse detection**: если использованный refresh-токен приходит снова (утечка или копия), вся сессия отзывается, ответ — `401` с `code: "REFRESH_TOKEN_REUSED"`. Клиенту нужно вести пользователя на экран входа.
- **Запомнить устройство**: поле `remember` в теле `login`/`register` — число дней (`30`, `60`, `90`, `120`, вообще любое до 1825) либо `"forever"` для бессрочной сессии (`refreshTokenExpiresAt: null`, работает, пока пользователь сам не выйдет). По умолчанию 90 дней. Нераспознанное значение молча превращается в 90 дней, а не в ошибку.
- **Метаданные сессии**: `deviceId`, `deviceName`, `platform`, `appVersion` — плоско в теле или внутри объекта `device`; `User-Agent` и `X-Forwarded-For` берутся из заголовков. `deviceId` нужен, чтобы в списке сессий узнавать устройство.
- Смена пароля (`POST /users/me/password`) и сброс пароля отзывают все сессии; в ответе на смену пароля приходит новая пара токенов, чтобы текущее устройство осталось в системе.
- Одновременно у пользователя живут не больше 20 сессий — самые старые отзываются.
- Старые записи чистятся функцией `cleanupExpired()` из `services/auth.service.ts` (истёкшие и отозванные токены, использованные токены старше 30 дней). Вызывайте её по крону/скрипту; через HTTP она не выставлена.

#### Что должен делать клиент

1. Хранить `accessToken` и `refreshToken` раздельно (например, `expo-secure-store`).
2. При `401` с `code: "INVALID_ACCESS_TOKEN"` — вызвать `/auth/refresh` и повторить исходный запрос.
3. При `401` с `code: "REFRESH_TOKEN_REUSED"` или `"INVALID_REFRESH_TOKEN"` — очистить хранилище и показать экран входа.
4. Обновлять токен только из одного места (один in-flight refresh), иначе параллельные вызовы `/auth/refresh` с одним токеном сработают как reuse detection.

### Users

| Метод | Путь                 | Описание                                            |
| ----- | -------------------- | --------------------------------------------------- |
| GET   | `/users/me`          | Получить информацию о текущем пользователе и паре   |
| PATCH | `/users/me`          | Обновить профиль                                    |
| POST  | `/users/me/password` | Сменить пароль (отзывает сессии, выдаёт новую пару) |
| POST  | `/users/link`        | Привязать партнёра (передать `partnerUsername`)     |

### Sections

| Метод  | Путь            | Описание                                                   |
| ------ | --------------- | ---------------------------------------------------------- |
| GET    | `/sections`     | Список секций пары                                         |
| POST   | `/sections`     | Создать новую секцию (передать `name`, `slug` опционально) |
| PATCH  | `/sections/:id` | Обновить название или порядок секции                       |
| DELETE | `/sections/:id` | Удалить несистемную секцию (без записей)                   |

### Records

| Метод  | Путь                         | Описание                                                                                                                                                             |
| ------ | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/records`                   | Получить записи (поддерживает фильтрацию: `sectionIds`, `tags`, `isCompleted`, `isPinned`, `dateFrom`, `dateTo`, `search`, `sortBy`, `sortOrder`, `limit`, `offset`) |
| GET    | `/records/:id`               | Получить одну запись                                                                                                                                                 |
| GET    | `/records/updates?since=...` | Получить обновления с указанной даты                                                                                                                                 |
| POST   | `/records`                   | Создать запись (передать `sectionId`, `title`, `content`, `dateEvent`, `isCompleted`, `tags`, `metadata`)                                                            |
| PATCH  | `/records/:id`               | Обновить запись                                                                                                                                                      |
| DELETE | `/records/:id`               | Удалить запись                                                                                                                                                       |

Все эндпоинты (кроме `/auth/*`) требуют заголовок `Authorization: Bearer <accessToken>`.

---

## Автоматическое создание системных секций

При первом входе пользователя, если у него есть `pairId`, автоматически создаются системные секции:

- Правила (rules)
- Даты (dates)
- Планы (plans)
- Связь (contacts)

Если секции уже существуют, они не пересоздаются.

---

## Скрипт импорта данных

В проекте есть `import.script.ts`, который импортирует данные из `result.json` (экспорт Telegram-чата) и создаёт пользователей, пару и записи с привязкой к секциям.

Запуск:

```bash
bun run src/import.script.ts
```

---

## Команды

| Команда                         | Описание                               |
| ------------------------------- | -------------------------------------- |
| `bun install`                   | Установка зависимостей                 |
| `bun run src/index.ts`          | Запуск сервера                         |
| `bun run prisma migrate dev`    | Создать миграцию (dev)                 |
| `bun run prisma migrate deploy` | Применить миграции (prod)              |
| `bun run prisma db push`        | Синхронизировать схему без миграций    |
| `bun run prisma studio`         | Открыть Prisma Studio для просмотра БД |
| `bun run src/import.script.ts`  | Импорт данных из Telegram-экспорта     |

---

## Переменные окружения

| Переменная     | Описание                                  | Обязательная |
| -------------- | ----------------------------------------- | ------------ |
| `DATABASE_URL` | Строка подключения к PostgreSQL           | да           |
| `JWT_SECRET`   | Секретный ключ для подписи access-токенов | да           |
| `PORT`         | Порт для сервера (по умолчанию 8080)      | нет          |
| `FRONTEND_URL` | База для ссылки сброса пароля             | нет          |

---

## Тесты

Smoke-тест полного цикла refresh-токенов (нужен запущенный сервер и доступ к БД):

```bash
bun run src/index.ts          # в одном терминале (PORT=8099)
bun run scripts/refresh-token.smoke.ts
```

Покрывает: ротацию, reuse detection, `remember` (`30/60/90/120/forever`), список сессий,
отзыв сессии, logout / logout-all, гонку параллельных `/auth/refresh`, смену пароля
и `introspect`. Адрес API переопределяется через `BASE_URL`.

---

## Лицензия

MIT © 2026 FOCKUSTY
