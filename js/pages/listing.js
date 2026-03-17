import { initAuthUI, onAuthReady } from "../core/auth.js";
import {
  subscribeListingById,
  getListingImages,
  incrementListingViews,
  fetchRelatedListings
} from "../services/listingsService.js";
import { createBooking, subscribeActiveBookingsByListing } from "../services/bookingsService.js";
import { toggleFavorite } from "../services/favoritesService.js";
import { subscribeMessages, sendMessage } from "../services/messagesService.js";
import { subscribeReviews, createReview } from "../services/reviewsService.js";
import {
  renderListingDetail,
  renderListingCard,
  renderGallery,
  renderMessageCard,
  renderReviewCard
} from "../ui/renderers.js";
import { formatPrice } from "../utils/format.js";
import { qs, on, setText, toggleHidden } from "../utils/dom.js";
import { translateFirebaseError } from "../utils/errors.js";

initAuthUI();

const detailEl = qs("#listing-detail");
const galleryEl = qs("#listing-gallery");
const relatedGrid = qs("#related-listings");
const relatedLoadMore = qs("#related-load-more");
const relatedError = qs("#related-error");
const messagesEl = qs("#messages-list");
const messageForm = qs("#message-form");
const reviewsEl = qs("#reviews-list");
const reviewForm = qs("#review-form");
const availabilityEl = qs("#availability-list");

const bookingModal = qs("#booking-modal");
const bookingForm = qs("#booking-form");
const bookingModalSubtitle = qs("#booking-modal-subtitle");
const bookingFormMessage = qs("#booking-form-message");
const closeBookingModalBtn = qs("#close-booking-modal");
const cancelBookingBtn = qs("#cancel-booking-btn");

const listingId = new URLSearchParams(window.location.search).get("id");

if (!listingId && detailEl) {
  detailEl.innerHTML = "<p class=\"muted\">Объявление не найдено.</p>";
}

const state = {
  listing: null,
  activeBookings: [],
  viewed: false,
  imagesLoaded: false,
  related: {
    docs: [],
    lastDoc: null,
    hasMore: true,
    loading: false,
    key: ""
  },
  unsubscribeMessages: null,
  unsubscribeReviews: null,
  unsubscribeListing: null,
  unsubscribeAvailability: null
};

const normalizeDate = (value) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setHours(0, 0, 0, 0);
  return parsed;
};

const getTodayString = () => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now.toISOString().slice(0, 10);
};

const isBookedNow = (booking) => {
  const today = normalizeDate(getTodayString());
  const start = normalizeDate(booking.dateFrom);
  const end = normalizeDate(booking.dateTo);
  if (!today || !start || !end) return false;
  return start <= today && today <= end;
};

const setBookingMessage = (message, isError = false) => {
  if (!bookingFormMessage) return;
  bookingFormMessage.textContent = message;
  bookingFormMessage.style.color = isError ? "#cc334a" : "";
};

const openBookingModal = () => {
  const user = window.EASYRENT?.auth?.user;
  if (!user) return window.EASYRENT?.openAuthModal?.("login");
  if (!bookingModal || !bookingForm) return;

  const dateFromInput = bookingForm.elements.dateFrom;
  const dateToInput = bookingForm.elements.dateTo;
  const minDate = getTodayString();

  bookingForm.reset();
  if (dateFromInput) dateFromInput.min = minDate;
  if (dateToInput) dateToInput.min = minDate;

  if (bookingModalSubtitle) {
    const title = state.listing?.title || "Объявление";
    const price = formatPrice(state.listing?.price || 0);
    bookingModalSubtitle.textContent = `${title} • ${price} / ночь`;
  }

  setBookingMessage("");
  bookingModal.classList.remove("hidden");
};

const closeBookingModal = () => {
  if (!bookingModal) return;
  bookingModal.classList.add("hidden");
  setBookingMessage("");
};

const renderAvailability = () => {
  if (!availabilityEl) return;
  if (!state.activeBookings.length) {
    availabilityEl.innerHTML = "<p class=\"muted\">Свободно. Активных бронирований нет.</p>";
    return;
  }
  availabilityEl.innerHTML = state.activeBookings
    .slice(0, 8)
    .map(
      (booking) =>
        `<div class="card-meta">Занято: ${booking.dateFrom || "дата не указана"} - ${
          booking.dateTo || "дата не указана"
        }</div>`
    )
    .join("");
};

const bindDetailActions = (listingData) => {
  const bookBtn = qs("#book-now");
  const favoriteBtn = qs("#favorite-now");
  const isActive = listingData?.status === "активно";
  const occupiedNow = state.activeBookings.some((booking) => isBookedNow(booking));
  const canBook = isActive && !occupiedNow;

  if (bookBtn) {
    bookBtn.disabled = !canBook;
    if (!isActive) {
      bookBtn.textContent = "Недоступно";
    } else if (occupiedNow) {
      bookBtn.textContent = "Сейчас занято";
    } else {
      bookBtn.textContent = "Забронировать";
    }

    bookBtn.onclick = () => {
      if (!canBook) return;
      openBookingModal();
    };
  }

  if (favoriteBtn) {
    favoriteBtn.onclick = async () => {
      const user = window.EASYRENT?.auth?.user;
      if (!user) return window.EASYRENT?.openAuthModal?.("login");
      await toggleFavorite(user.uid, listingId);
    };
  }
};

const renderListing = async (listingData) => {
  state.listing = listingData;
  if (detailEl) detailEl.innerHTML = renderListingDetail(listingData);
  bindDetailActions(listingData);

  if (!state.imagesLoaded) {
    const images = await getListingImages(listingId);
    if (galleryEl) galleryEl.innerHTML = renderGallery(images);
    state.imagesLoaded = true;
  }

  if (!state.viewed) {
    incrementListingViews(listingId);
    state.viewed = true;
  }
};

const renderRelated = () => {
  if (!relatedGrid) return;
  if (!state.related.docs.length) {
    relatedGrid.innerHTML = "<p class=\"muted\">Похожих объявлений пока нет.</p>";
    return;
  }
  relatedGrid.innerHTML = state.related.docs
    .map((docSnap) => renderListingCard(docSnap.data(), docSnap.id))
    .join("");
};

const loadRelated = async (reset = false) => {
  if (!state.listing || state.related.loading) return;
  state.related.loading = true;
  if (relatedError) relatedError.classList.add("hidden");

  if (reset) {
    state.related.docs = [];
    state.related.lastDoc = null;
    state.related.hasMore = true;
  }

  try {
    const result = await fetchRelatedListings(
      {
        listingId,
        region: state.listing.region,
        propertyType: state.listing.propertyType
      },
      state.related.lastDoc
    );

    state.related.docs = state.related.docs.concat(result.docs);
    state.related.lastDoc = result.lastDoc;
    state.related.hasMore = result.hasMore;
    renderRelated();
    if (relatedLoadMore) toggleHidden(relatedLoadMore, !state.related.hasMore);
  } catch (error) {
    if (relatedError) {
      relatedError.classList.remove("hidden");
      relatedError.textContent = "Не удалось загрузить похожие объявления.";
    }
  } finally {
    state.related.loading = false;
  }
};

const initAvailability = () => {
  if (!listingId || !availabilityEl) return;
  if (state.unsubscribeAvailability) state.unsubscribeAvailability();
  state.unsubscribeAvailability = subscribeActiveBookingsByListing(
    listingId,
    (snapshot) => {
      state.activeBookings = snapshot.docs.map((docSnap) => ({ id: docSnap.id, ...docSnap.data() }));
      renderAvailability();
      if (state.listing) bindDetailActions(state.listing);
    },
    (error) => {
      availabilityEl.innerHTML = `<p class="muted">${translateFirebaseError(
        error,
        "Не удалось загрузить доступность."
      )}</p>`;
    }
  );
};

const initBookingModal = () => {
  if (!bookingModal || !bookingForm) return;

  if (closeBookingModalBtn) on(closeBookingModalBtn, "click", closeBookingModal);
  if (cancelBookingBtn) on(cancelBookingBtn, "click", closeBookingModal);

  on(bookingModal, "click", (event) => {
    if (event.target === bookingModal) closeBookingModal();
  });

  on(bookingForm, "submit", async (event) => {
    event.preventDefault();
    const user = window.EASYRENT?.auth?.user;
    if (!user) return window.EASYRENT?.openAuthModal?.("login");

    const formData = new FormData(bookingForm);
    const dateFrom = String(formData.get("dateFrom") || "");
    const dateTo = String(formData.get("dateTo") || "");
    const start = normalizeDate(dateFrom);
    const end = normalizeDate(dateTo);

    if (!start || !end || start > end) {
      setBookingMessage("Проверьте даты бронирования.", true);
      return;
    }

    const submitBtn = bookingForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    setBookingMessage("Проверяем доступность...");

    try {
      await createBooking({
        listingId,
        userId: user.uid,
        ownerId: state.listing?.ownerId,
        dateFrom,
        dateTo,
        priceSnapshot: state.listing?.price
      });
      setBookingMessage("Готово! Бронирование отправлено.");
      const bookBtn = qs("#book-now");
      if (bookBtn) setText(bookBtn, "Заявка отправлена");
      window.setTimeout(() => closeBookingModal(), 900);
    } catch (error) {
      if (error?.message === "BOOKING_DATE_CONFLICT") {
        setBookingMessage("Эти даты уже заняты. Выберите другой период.", true);
      } else {
        setBookingMessage(translateFirebaseError(error, "Не удалось создать бронирование."), true);
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
};

const initListing = () => {
  if (!listingId) return;
  if (state.unsubscribeListing) state.unsubscribeListing();
  state.unsubscribeListing = subscribeListingById(
    listingId,
    (snapshot) => {
      if (!snapshot.exists()) {
        if (detailEl) detailEl.innerHTML = "<p class=\"muted\">Объявление не найдено.</p>";
        return;
      }
      renderListing(snapshot.data());
      const nextKey = `${snapshot.data().region || ""}|${snapshot.data().propertyType || ""}`;
      if (state.related.key !== nextKey) {
        state.related.key = nextKey;
        loadRelated(true);
      }
    },
    (error) => {
      if (detailEl) detailEl.innerHTML = "<p class=\"muted\">Не удалось загрузить объявление.</p>";
      console.error(error);
    }
  );

  if (reviewsEl) {
    state.unsubscribeReviews = subscribeReviews(listingId, (snapshot) => {
      const cards = snapshot.docs.map((docSnap) =>
        renderReviewCard({ id: docSnap.id, ...docSnap.data() }, { editable: false })
      );
      reviewsEl.innerHTML = cards.join("");
    });
  }

  if (reviewForm) {
    on(reviewForm, "submit", async (event) => {
      event.preventDefault();
      const user = window.EASYRENT?.auth?.user;
      if (!user) return window.EASYRENT?.openAuthModal?.("login");
      const formData = new FormData(reviewForm);
      const rating = Number(formData.get("rating"));
      const text = formData.get("text");
      await createReview({ listingId, userId: user.uid, rating, text });
      reviewForm.reset();
    });
  }
};

const initMessages = () => {
  if (!messagesEl || !messageForm) return;

  const startSubscription = (user) => {
    if (!listingId) return;
    if (!user) {
      messagesEl.innerHTML = "<p class=\"muted\">Войдите, чтобы видеть и отправлять сообщения.</p>";
      return;
    }
    if (state.unsubscribeMessages) state.unsubscribeMessages();
    state.unsubscribeMessages = subscribeMessages(
      listingId,
      user.uid,
      (snapshot) => {
        const cards = snapshot.docs
          .map((docSnap) => {
            const data = docSnap.data();
            const isMe = data.senderId === user.uid;
            return renderMessageCard(data, isMe);
          })
          .join("");
        messagesEl.innerHTML = cards;
      },
      (error) => {
        messagesEl.innerHTML = `<p class=\"muted\">${translateFirebaseError(
          error,
          "Не удалось загрузить сообщения."
        )}</p>`;
        console.error(error);
      }
    );
  };

  onAuthReady((authState) => startSubscription(authState.user));

  on(messageForm, "submit", async (event) => {
    event.preventDefault();
    const user = window.EASYRENT?.auth?.user;
    if (!user) return window.EASYRENT?.openAuthModal?.("login");
    const formData = new FormData(messageForm);
    await sendMessage({
      listingId,
      senderId: user.uid,
      receiverId: state.listing?.ownerId || "",
      text: formData.get("text")
    });
    messageForm.reset();
  });
};

initListing();
initMessages();
initAvailability();
initBookingModal();

if (relatedLoadMore) on(relatedLoadMore, "click", () => loadRelated(false));
