import { initAuthUI, onAuthReady } from "../core/auth.js";
import {
  syncBookingMirrorsByUser,
  subscribeActiveActionsByUser,
  subscribeHistoryActionsByUser,
  updateBookingStatus,
  updateBookingDates,
  removeBooking
} from "../services/bookingsService.js";
import { getListingById } from "../services/listingsService.js";
import { renderBookingCard } from "../ui/renderers.js";
import { qs, on } from "../utils/dom.js";
import { translateFirebaseError } from "../utils/errors.js";

initAuthUI();

const activeEl = qs("#active-bookings");
const completedEl = qs("#completed-bookings");

const listingCache = new Map();
const state = {
  unsubscribeActive: null,
  unsubscribeHistory: null
};

const getListingCached = async (listingId) => {
  if (listingCache.has(listingId)) return listingCache.get(listingId);
  const listing = await getListingById(listingId);
  listingCache.set(listingId, listing);
  return listing;
};

const renderList = async (docs, targetEl, emptyText) => {
  const cards = [];
  for (const docSnap of docs) {
    const booking = { id: docSnap.id, ...docSnap.data() };
    const listing = await getListingCached(booking.listingId);
    cards.push(renderBookingCard(booking, listing?.data));
  }
  if (!targetEl) return;
  targetEl.innerHTML = cards.length ? cards.join("") : `<p class="muted">${emptyText}</p>`;
};

const renderActive = async (docs) => {
  await renderList(docs, activeEl, "Активных действий пока нет.");
};

const renderHistory = async (docs) => {
  await renderList(docs, completedEl, "История пока пуста.");
};

const handleActions = async (event) => {
  const actionBtn = event.target.closest("[data-action]");
  if (!actionBtn) return;
  const card = event.target.closest(".card");
  if (!card) return;
  const bookingId = card.dataset.id;
  const action = actionBtn.dataset.action;

  try {
    if (action === "edit") {
      const nextFrom = window.prompt("Новая дата заезда (ГГГГ-ММ-ДД)", card.dataset.from || "");
      const nextTo = window.prompt("Новая дата выезда (ГГГГ-ММ-ДД)", card.dataset.to || "");
      await updateBookingDates(bookingId, nextFrom, nextTo);
    }
    if (action === "confirm") await updateBookingStatus(bookingId, "подтверждено");
    if (action === "cancel") await updateBookingStatus(bookingId, "отменено");
    if (action === "complete") await updateBookingStatus(bookingId, "завершено");
    if (action === "remove") await removeBooking(bookingId);
  } catch (error) {
    if (error?.message === "BOOKING_DATE_CONFLICT") {
      alert("Эти даты уже заняты. Выберите другой период.");
      return;
    }
    alert(translateFirebaseError(error, "Не удалось обновить действие."));
  }
};

if (activeEl) on(activeEl, "click", handleActions);
if (completedEl) on(completedEl, "click", handleActions);

onAuthReady((authState) => {
  if (!authState.user) {
    if (activeEl) activeEl.innerHTML = "<p class=\"muted\">Войдите, чтобы видеть бронирования.</p>";
    if (completedEl) completedEl.innerHTML = "";
    return;
  }

  if (state.unsubscribeActive) state.unsubscribeActive();
  if (state.unsubscribeHistory) state.unsubscribeHistory();

  if (activeEl) activeEl.innerHTML = "<p class=\"muted\">Загружаем активные действия...</p>";
  if (completedEl) completedEl.innerHTML = "";

  syncBookingMirrorsByUser(authState.user.uid)
    .catch(() => {})
    .finally(() => {
      state.unsubscribeActive = subscribeActiveActionsByUser(
        authState.user.uid,
        (snapshot) => renderActive(snapshot.docs),
        (error) => {
          if (activeEl) {
            activeEl.innerHTML = `<p class="muted">${translateFirebaseError(
              error,
              "Не удалось загрузить активные действия."
            )}</p>`;
          }
          console.error(error);
        }
      );

      state.unsubscribeHistory = subscribeHistoryActionsByUser(
        authState.user.uid,
        (snapshot) => renderHistory(snapshot.docs),
        (error) => {
          if (completedEl) {
            completedEl.innerHTML = `<p class="muted">${translateFirebaseError(
              error,
              "Не удалось загрузить историю."
            )}</p>`;
          }
          console.error(error);
        }
      );
    });
});
