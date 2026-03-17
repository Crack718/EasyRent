import { formatPrice, formatDateRange } from "../utils/format.js";

const bookingStatusLabels = {
  pending: "в ожидании",
  confirmed: "подтверждено",
  cancelled: "отменено",
  completed: "завершено",
  "в ожидании": "в ожидании",
  подтверждено: "подтверждено",
  отменено: "отменено",
  завершено: "завершено"
};

const listingStatusLabels = {
  active: "активно",
  draft: "черновик",
  archived: "архив",
  активно: "активно",
  черновик: "черновик",
  архив: "архив"
};

const DEFAULT_IMAGE = "https://images.unsplash.com/photo-1505691938895-1758d7feb511";

const safeImageUrl = (value) => {
  if (typeof value !== "string") return DEFAULT_IMAGE;
  if (!/^https?:\/\//i.test(value)) return DEFAULT_IMAGE;
  return value;
};

const encodeAttr = (value) => encodeURIComponent(String(value ?? ""));

const renderListingCard = (listing, id) => {
  const imageUrl = safeImageUrl(listing.coverUrl || listing.imageUrl);
  return `
    <div class="card" data-id="${id}">
      <img src="${imageUrl}" alt="${listing.title}" />
      <div class="card-title">${listing.title}</div>
      <div class="card-meta">
        <span>${formatPrice(listing.price)} / ночь</span>
        <span class="pill">${listing.rating?.toFixed(1) || "0.0"}</span>
      </div>
      <div class="card-meta">
        <span>${listing.region || ""} ${listing.district ? "|" : ""} ${listing.district || ""}</span>
      </div>
      <div class="card-actions">
        <a class="btn btn-outline" href="listing.html?id=${id}">Подробнее</a>
        <button class="btn btn-outline" data-action="favorite">В избранное</button>
      </div>
    </div>
  `;
};

const renderListingDetail = (listing) => `
  <div class="stack">
    <h1>${listing.title}</h1>
    <div class="card-meta">
      <span>${formatPrice(listing.price)} / ночь</span>
      <span class="pill">${listing.rating?.toFixed(1) || "0.0"}</span>
      <span class="pill">${listingStatusLabels[listing.status] || listing.status || "—"}</span>
      <span>${listing.views || 0} просмотров</span>
    </div>
    <p class="muted">${listing.address || ""}</p>
    <p>${listing.description || ""}</p>
    <div class="stack">
      <span class="pill">${listing.propertyType || ""}</span>
      <span class="pill">${listing.rooms || 0} комнат</span>
      <span class="pill">${listing.area || 0} м²</span>
    </div>
    <div class="card-actions">
      <button id="book-now" class="btn btn-primary">Забронировать</button>
      <button id="favorite-now" class="btn btn-outline">В избранное</button>
    </div>
  </div>
`;

const renderGallery = (images) =>
  images
    .map((image) => `<img src="${safeImageUrl(image?.url)}" alt="Фото объявления" />`)
    .join("");

const renderMessageCard = (message, isMe) => `
  <div class="card">
    <div class="card-meta">${isMe ? "Вы" : "Владелец"}</div>
    <div>${message.text}</div>
  </div>
`;

const renderReviewCard = (review, options = {}) => {
  const editable = Boolean(options.editable);
  const showListing = Boolean(options.showListing);
  const listingLine = showListing && review.listingId
    ? `<div class="card-meta">Объявление: ${review.listingId}</div>`
    : "";
  const ratingValue = review.rating ?? 0;
  const textValue = review.text || "";
  const actions =
    editable && review.id && review.listingId
      ? `
    <div class="card-actions">
      <button class="btn btn-outline" data-action="edit-review">Редактировать</button>
      <button class="btn btn-outline" data-action="delete-review">Удалить</button>
    </div>`
      : "";
  return `
    <div class="card" data-review-id="${review.id || ""}" data-listing-id="${review.listingId || ""}" data-rating="${encodeAttr(ratingValue)}" data-text="${encodeAttr(textValue)}">
      <div class="card-meta">Оценка: ${ratingValue}</div>
      ${listingLine}
      <div>${textValue}</div>
      ${actions}
    </div>
  `;
};

const renderBookingCard = (booking, listing) => {
  const status = bookingStatusLabels[booking.status] || booking.status;
  const isHistory = ["отменено", "завершено", "cancelled", "completed"].includes(booking.status);
  const actions = isHistory
    ? `<button class="btn btn-outline" data-action="remove">Удалить</button>`
    : `
      <button class="btn btn-outline" data-action="edit">Изменить</button>
      <button class="btn btn-outline" data-action="confirm">Подтвердить</button>
      <button class="btn btn-outline" data-action="cancel">Отменить</button>
      <button class="btn btn-outline" data-action="complete">Завершить</button>
      <button class="btn btn-outline" data-action="remove">Удалить</button>
    `;

  return `
    <div class="card" data-id="${booking.id}" data-from="${booking.dateFrom || ""}" data-to="${booking.dateTo || ""}">
      <div class="card-title">${listing?.title || "Объявление"}</div>
      <div class="card-meta">Статус: ${status}</div>
      <div class="card-meta">Даты: ${formatDateRange(booking.dateFrom, booking.dateTo)}</div>
      <div class="card-actions">${actions}</div>
    </div>
  `;
};

const renderHistoryCard = (booking) => `
  <div class="card">
    <div class="card-title">Бронирование ${booking.id}</div>
    <div class="card-meta">Статус: ${bookingStatusLabels[booking.status] || booking.status}</div>
    <div class="card-meta">Даты: ${formatDateRange(booking.dateFrom, booking.dateTo)}</div>
  </div>
`;

const bookingStatusOptions = ["в ожидании", "подтверждено", "отменено", "завершено"];

const renderAdminBookingCard = (booking) => {
  const options = bookingStatusOptions
    .map(
      (status) =>
        `<option value="${status}" ${booking.status === status ? "selected" : ""}>${status}</option>`
    )
    .join("");
  return `
    <div class="card" data-id="${booking.id}">
      <div class="card-title">Бронирование ${booking.id}</div>
      <div class="card-meta">Объявление: ${booking.listingId || ""}</div>
      <div class="card-meta">Пользователь: ${booking.userId || ""}</div>
      <div class="card-meta">Даты: ${formatDateRange(booking.dateFrom, booking.dateTo)}</div>
      <div class="card-actions">
        <select class="select" data-action="booking-status">${options}</select>
        <button class="btn btn-outline" data-action="delete-booking">Удалить</button>
      </div>
    </div>
  `;
};

const renderModerationMessageCard = (message) => `
  <div class="card" data-id="${message.id}">
    <div class="card-meta">Объявление: ${message.listingId || ""}</div>
    <div class="card-meta">От: ${message.senderId || ""}</div>
    <div>${message.text || ""}</div>
    <div class="card-actions">
      <button class="btn btn-outline" data-action="delete-message">Удалить</button>
    </div>
  </div>
`;

const renderModerationReviewCard = (review) => `
  <div class="card" data-review-id="${review.id}" data-listing-id="${review.listingId}">
    <div class="card-meta">Объявление: ${review.listingId || ""}</div>
    <div class="card-meta">Пользователь: ${review.userId || ""}</div>
    <div class="card-meta">Оценка: ${review.rating || 0}</div>
    <div>${review.text || ""}</div>
    <div class="card-actions">
      <button class="btn btn-outline" data-action="delete-review">Удалить</button>
    </div>
  </div>
`;

const renderAdminListingCard = (listing, id) => `
  <div class="card" data-id="${id}">
    <div class="card-title">${listing.title}</div>
    <div class="card-meta">${formatPrice(listing.price)} | ${listingStatusLabels[listing.status] || listing.status}</div>
    <div class="card-actions">
      <button class="btn btn-outline" data-action="edit">Изменить</button>
      <button class="btn btn-outline" data-action="delete">Удалить</button>
    </div>
  </div>
`;

const renderUserCard = (user, id) => `
  <div class="card" data-id="${id}" data-name="${encodeAttr(user.name || "")}" data-email="${encodeAttr(
    user.email || ""
  )}" data-phone="${encodeAttr(user.phone || "")}" data-role="${encodeAttr(user.role || "user")}">
    <div class="card-title">${user.name || user.email}</div>
    <div class="card-meta">${user.email || ""}</div>
    <div class="card-actions">
      <select class="select" data-action="role">
        <option value="user" ${user.role === "user" ? "selected" : ""}>пользователь</option>
        <option value="admin" ${user.role === "admin" ? "selected" : ""}>администратор</option>
      </select>
      <button class="btn btn-outline" data-action="edit-user">Изменить</button>
      <button class="btn btn-outline" data-action="delete-user">Удалить</button>
    </div>
  </div>
`;

const renderStatCards = (stats) => `
  <div class="stat-card">Объявления: ${stats.listings}</div>
  <div class="stat-card">Пользователи: ${stats.users}</div>
  <div class="stat-card">Бронирования: ${stats.bookings}</div>
  <div class="stat-card">Активные действия: ${stats.activeActions || 0}</div>
  <div class="stat-card">История действий: ${stats.historyActions || 0}</div>
`;

export {
  renderListingCard,
  renderListingDetail,
  renderGallery,
  renderMessageCard,
  renderReviewCard,
  renderBookingCard,
  renderHistoryCard,
  renderAdminBookingCard,
  renderAdminListingCard,
  renderModerationMessageCard,
  renderModerationReviewCard,
  renderUserCard,
  renderStatCards
};
