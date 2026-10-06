# Заявки на ремонт — бесплатная версия

Интерфейс — статический сайт, данные — Firebase Firestore, авторизация — Firebase Authentication. Firebase Spark позволяет начать без платёжной информации.

## Настройка Firebase
1. Создайте проект Firebase.
2. Authentication → Sign-in method → Email/Password → Enable.
3. Firestore Database → Create database.
4. Project settings → Add app → Web app. Скопируйте config в firebase-config.js.
5. В Firestore Rules вставьте содержимое firestore.rules.
6. Создайте учетные записи сотрудников в Authentication. Для начальника создайте документ users/{UID} с полем role = manager. Для остальных создайте role = viewer.

## Публикация
Репозиторий можно подключить к бесплатному Render Static Site. Для хранения данных серверная файловая система не используется.