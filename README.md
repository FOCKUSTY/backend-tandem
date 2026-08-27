# Backend для Тандем (Tandem)

Бэкенд-часть приложения для пар «Тандем» – REST API на базе **Hono**, **Prisma** и **PostgreSQL**. Управление пользователями, парами, общими секциями и записями.

---

## Стек технологий

- **Runtime**: Bun (или Node.js с транспиляцией)
- **Фреймворк**: Hono (лёгкий, быстрый)
- **ORM**: Prisma с адаптером для PostgreSQL
- **База данных**: PostgreSQL
- **Аутентификация**: JWT
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
├── prisma/               # Prisma-схема, миграции, клиент
│   ├── schema.prisma
│   ├── migrations/
│   └── generated/        # Сгенерированный клиент
├── utils/                # Утилиты
│   ├── pair.ts           # Вспомогательные функции для работы с парами
│   └── ...
├── env.ts                # Конфигурация переменных окружения
├── jwt.ts                # Работа с JWT
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

| Метод | Путь          | Описание                                          |
| ----- | ------------- | ------------------------------------------------- |
| POST  | `/auth/login` | Авторизация, возвращает JWT и данные пользователя |

### Users

| Метод | Путь          | Описание                                          |
| ----- | ------------- | ------------------------------------------------- |
| GET   | `/users/me`   | Получить информацию о текущем пользователе и паре |
| POST  | `/users/link` | Привязать партнёра (передать `partnerUsername`)   |

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

Все эндпоинты (кроме `/auth/login`) требуют заголовок `Authorization: Bearer <token>`.

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

| Переменная     | Описание                             | Обязательная |
| -------------- | ------------------------------------ | ------------ |
| `DATABASE_URL` | Строка подключения к PostgreSQL      | да           |
| `JWT_SECRET`   | Секретный ключ для подписи JWT       | да           |
| `PORT`         | Порт для сервера (по умолчанию 8080) | нет          |

---

## Лицензия

MIT © 2026 FOCKUSTY
