import { initAuthUI, onAuthReady } from "../core/auth.js";
import { getUserProfile, updateUserProfile } from "../services/usersService.js";
import { getFavoritesByUser } from "../services/favoritesService.js";
import { getListingById } from "../services/listingsService.js";
import { subscribeHistoryActionsByUser, syncBookingMirrorsByUser } from "../services/bookingsService.js";
import { getReviewsByUser, updateReview, deleteReview } from "../services/reviewsService.js";
import {
  listMessagesByUser,
  updateMessageText,
  deleteMessage,
  markMessageRead
} from "../services/messagesService.js";
import { renderListingCard, renderHistoryCard, renderReviewCard } from "../ui/renderers.js";
import { qs, on, toggleHidden } from "../utils/dom.js";
import { translateFirebaseError } from "../utils/errors.js";

initAuthUI();

const form = qs("#profile-form");
const favoritesGrid = qs("#favorites-list");
const historyEl = qs("#booking-history");
const reviewsEl = qs("#my-reviews");
const messagesEl = qs("#my-messages");

const state = {
  unsubscribeHistory: null,
  profileBound: false
};

const renderMessageItem = (message, userId) => {
  const canEdit = message.senderId === userId;
  return `
    <div class="card" data-id="${message.id}" data-text="${encodeURIComponent(message.text || "")}" data-read="${
      message.read ? "1" : "0"
    }">
      <div class="card-meta">Объявление: ${message.listingId || "-"}</div>
      <div class="card-meta">${canEdit ? "Вы" : "Входящее"}${message.read ? " • прочитано" : ""}</div>
      <div>${message.text || ""}</div>
      <div class="card-actions">
        ${
          canEdit
            ? '<button class="btn btn-outline" data-action="edit-message">Редактировать</button><button class="btn btn-outline" data-action="delete-message">Удалить</button>'
            : '<button class="btn btn-outline" data-action="read-message">Отметить как прочитанное</button>'
        }
      </div>
    </div>
  `;
};

const loadMessages = async (user) => {
  if (!messagesEl) return;
  try {
    const messages = await listMessagesByUser(user.uid, 30);
    messagesEl.innerHTML = messages.map((message) => renderMessageItem(message, user.uid)).join("");
  } catch (error) {
    messagesEl.innerHTML = `<p class="muted">${translateFirebaseError(
      error,
      "Не удалось загрузить сообщения."
    )}</p>`;
  }
};

const renderProfile = async (user) => {
  const profile = await getUserProfile(user.uid);

  if (form) {
    toggleHidden(form, false);
    form.name.value = profile?.name || "";
    form.phone.value = profile?.phone || "";

    if (!state.profileBound) {
      on(form, "submit", async (event) => {
        event.preventDefault();
        const formData = new FormData(form);
        await updateUserProfile(user.uid, {
          name: formData.get("name"),
          phone: formData.get("phone")
        });
      });
      state.profileBound = true;
    }
  }

  if (favoritesGrid) {
    const favorites = await getFavoritesByUser(user.uid);
    const listings = await Promise.all(
      favorites.map(async (favorite) => getListingById(favorite.listingId))
    );
    favoritesGrid.innerHTML = listings
      .filter(Boolean)
      .map((item) => renderListingCard(item.data, item.id))
      .join("");
  }

  if (reviewsEl) {
    const reviews = await getReviewsByUser(user.uid);
    reviewsEl.innerHTML = reviews
      .map((review) => renderReviewCard(review, { editable: true, showListing: true }))
      .join("");
  }

  await loadMessages(user);
};

onAuthReady((authState) => {
  if (!authState.user) {
    toggleHidden(form, true);
    if (messagesEl) messagesEl.innerHTML = "<p class=\"muted\">Войдите, чтобы видеть сообщения.</p>";
    return;
  }

  renderProfile(authState.user);

  if (historyEl) {
    if (state.unsubscribeHistory) state.unsubscribeHistory();
    syncBookingMirrorsByUser(authState.user.uid)
      .catch(() => {})
      .finally(() => {
        state.unsubscribeHistory = subscribeHistoryActionsByUser(authState.user.uid, (snapshot) => {
          const bookings = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
          historyEl.innerHTML = bookings.map((booking) => renderHistoryCard(booking)).join("");
        });
      });
  }
});

if (reviewsEl) {
  on(reviewsEl, "click", async (event) => {
    const actionBtn = event.target.closest("[data-action]");
    if (!actionBtn) return;
    const card = event.target.closest(".card");
    if (!card) return;
    const listingId = card.dataset.listingId;
    const reviewId = card.dataset.reviewId;
    if (!listingId || !reviewId) return;

    if (actionBtn.dataset.action === "edit-review") {
      const ratingInput = window.prompt("Новая оценка (1-5)", card.dataset.rating || "");
      if (!ratingInput) return;
      const rating = Number(ratingInput);
      const text =
        window.prompt("Новый текст отзыва", decodeURIComponent(card.dataset.text || "")) || "";
      await updateReview({ listingId, reviewId, rating, text });
      const user = window.EASYRENT?.auth?.user;
      if (user) await renderProfile(user);
    }

    if (actionBtn.dataset.action === "delete-review") {
      const proceed = window.confirm("Удалить отзыв?");
      if (!proceed) return;
      await deleteReview({ listingId, reviewId });
      const user = window.EASYRENT?.auth?.user;
      if (user) await renderProfile(user);
    }
  });
}

if (messagesEl) {
  on(messagesEl, "click", async (event) => {
    const actionBtn = event.target.closest("[data-action]");
    if (!actionBtn) return;
    const card = event.target.closest(".card");
    if (!card) return;
    const messageId = card.dataset.id;
    if (!messageId) return;
    const user = window.EASYRENT?.auth?.user;
    if (!user) return;

    try {
      if (actionBtn.dataset.action === "edit-message") {
        const currentText = decodeURIComponent(card.dataset.text || "");
        const nextText = window.prompt("Новый текст сообщения", currentText);
        if (!nextText || nextText === currentText) return;
        await updateMessageText(messageId, nextText);
      }

      if (actionBtn.dataset.action === "delete-message") {
        const proceed = window.confirm("Удалить сообщение?");
        if (!proceed) return;
        await deleteMessage(messageId);
      }

      if (actionBtn.dataset.action === "read-message") {
        await markMessageRead(messageId, true);
      }

      await loadMessages(user);
    } catch (error) {
      alert(translateFirebaseError(error, "Не удалось обновить сообщение."));
    }
  });
}
