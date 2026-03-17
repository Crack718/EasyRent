const ERROR_MESSAGES = {
  "auth/invalid-email": "Некорректный адрес эл. почты.",
  "auth/user-disabled": "Учётная запись отключена.",
  "auth/user-not-found": "Пользователь не найден.",
  "auth/wrong-password": "Неверный пароль.",
  "auth/invalid-credential": "Неверные учётные данные.",
  "auth/email-already-in-use": "Эта почта уже используется.",
  "auth/weak-password": "Слишком простой пароль.",
  "auth/missing-password": "Введите пароль.",
  "auth/too-many-requests": "Слишком много попыток. Попробуйте позже.",
  "auth/network-request-failed": "Ошибка сети. Проверьте подключение.",
  "permission-denied": "Нет доступа к данным.",
  "failed-precondition": "Для этого запроса требуется индекс Firestore.",
  "not-found": "Документ не найден.",
  unavailable: "Сервис временно недоступен. Попробуйте позже.",
  "deadline-exceeded": "Время ожидания истекло. Попробуйте снова.",
  BOOKING_DATE_CONFLICT: "Выбранные даты уже заняты."
};

const translateFirebaseError = (error, fallback) => {
  if (!error) return fallback || "Произошла ошибка. Попробуйте ещё раз.";
  const code = error.code || error.message || "";
  if (code && ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  if (error.code) return fallback || "Произошла ошибка. Попробуйте ещё раз.";
  return error.message || fallback || "Произошла ошибка. Попробуйте ещё раз.";
};

export { translateFirebaseError };
