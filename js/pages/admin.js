import { initAuthUI, onAuthReady } from "../core/auth.js";
import { saveListing, deleteListing } from "../services/listingsService.js";
import { saveUserProfile, deleteUserProfile, setUserRole } from "../services/usersService.js";
import {
  getStats,
  listListings,
  listUsers,
  listMessages,
  listBookings,
  listReviewsForModeration,
  deleteReviewModeration
} from "../services/adminService.js";
import { updateBookingStatus, removeBooking } from "../services/bookingsService.js";
import { deleteMessage } from "../services/messagesService.js";
import {
  renderAdminListingCard,
  renderAdminBookingCard,
  renderModerationMessageCard,
  renderModerationReviewCard,
  renderUserCard,
  renderStatCards
} from "../ui/renderers.js";
import { qs, qsa, on, toggleHidden } from "../utils/dom.js";
import { translateFirebaseError } from "../utils/errors.js";

initAuthUI();

const guard = qs("#admin-guard");
const statsEl = qs("#admin-stats");
const listingForm = qs("#listing-form");
const listingsEl = qs("#admin-listings");
const userForm = qs("#user-form");
const usersEl = qs("#admin-users");
const bookingsEl = qs("#admin-bookings");
const moderationMessagesEl = qs("#moderation-messages");
const moderationReviewsEl = qs("#moderation-reviews");
const cancelEditBtn = qs("#cancel-edit");
const cancelUserEditBtn = qs("#cancel-user-edit");

let listingEditId = null;
let userEditId = null;

const isAdminNow = () => Boolean(window.EASYRENT?.auth?.isAdmin);

const ensureAdminAction = () => {
  if (isAdminNow()) return true;
  if (guard) {
    guard.textContent = "Действие доступно только администратору.";
  }
  return false;
};

const toggleAdminSections = (isAdmin) => {
  qsa("main.container > section.panel").forEach((section) => {
    if (section.id === "admin-guard") return;
    toggleHidden(section, !isAdmin);
  });
};

const renderAdminGuard = (isAdmin) => {
  if (!guard) return;
  guard.innerHTML = isAdmin
    ? "<p class=\"muted\">Вы вошли как администратор.</p>"
    : "<p class=\"muted\">Нужен доступ администратора. Войдите под учётной записью администратора.</p>";
};

const loadStats = async () => {
  if (!statsEl) return;
  const stats = await getStats();
  statsEl.innerHTML = renderStatCards(stats);
};

const loadListings = async () => {
  if (!listingsEl) return;
  const listings = await listListings();
  listingsEl.innerHTML = listings
    .map((listing) => renderAdminListingCard(listing, listing.id))
    .join("");
};

const loadUsers = async () => {
  if (!usersEl) return;
  const users = await listUsers();
  usersEl.innerHTML = users.map((user) => renderUserCard(user, user.id)).join("");
};

const loadModeration = async () => {
  if (moderationMessagesEl) {
    const messages = await listMessages(20);
    moderationMessagesEl.innerHTML = messages
      .map((message) => renderModerationMessageCard(message))
      .join("");
  }
  if (moderationReviewsEl) {
    const reviews = await listReviewsForModeration(20);
    moderationReviewsEl.innerHTML = reviews
      .map((review) => renderModerationReviewCard(review))
      .join("");
  }
};

const loadBookings = async () => {
  if (!bookingsEl) return;
  const bookings = await listBookings(25);
  bookingsEl.innerHTML = bookings.map((booking) => renderAdminBookingCard(booking)).join("");
};

const resetListingForm = () => {
  if (!listingForm) return;
  listingForm.reset();
  listingEditId = null;
};

const resetUserForm = () => {
  if (!userForm) return;
  userForm.reset();
  userEditId = null;
};

if (cancelEditBtn) on(cancelEditBtn, "click", resetListingForm);
if (cancelUserEditBtn) on(cancelUserEditBtn, "click", resetUserForm);

if (listingForm) {
  on(listingForm, "submit", async (event) => {
    event.preventDefault();
    if (!ensureAdminAction()) return;
    const user = window.EASYRENT?.auth?.user;
    if (!user) return;

    const formData = new FormData(listingForm);
    const payload = {
      title: formData.get("title"),
      description: formData.get("description"),
      price: Number(formData.get("price")),
      propertyType: formData.get("propertyType"),
      region: formData.get("region"),
      district: formData.get("district"),
      address: formData.get("address"),
      rooms: Number(formData.get("rooms")),
      area: Number(formData.get("area")),
      status: formData.get("status"),
      amenities: String(formData.get("amenities") || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    };

    const imageUrls = String(formData.get("imageUrls") || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    await saveListing({ id: listingEditId, payload, imageUrls, ownerId: user.uid });
    resetListingForm();
    await loadListings();
  });
}

if (userForm) {
  on(userForm, "submit", async (event) => {
    event.preventDefault();
    if (!ensureAdminAction()) return;
    const formData = new FormData(userForm);
    const payload = {
      name: String(formData.get("name") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      phone: String(formData.get("phone") || "").trim(),
      role: String(formData.get("role") || "user")
    };
    await saveUserProfile({ id: userEditId, payload });
    resetUserForm();
    await loadUsers();
  });
}

if (listingsEl) {
  on(listingsEl, "click", async (event) => {
    if (!ensureAdminAction()) return;
    const actionBtn = event.target.closest("[data-action]");
    if (!actionBtn) return;
    const card = event.target.closest(".card");
    if (!card) return;
    const listingId = card.dataset.id;

    if (actionBtn.dataset.action === "delete") {
      const proceed = window.confirm("Удалить объявление?");
      if (!proceed) return;
      await deleteListing(listingId);
      await loadListings();
    }

    if (actionBtn.dataset.action === "edit") {
      const listing = await listListings();
      const match = listing.find((item) => item.id === listingId);
      if (!match || !listingForm) return;
      listingEditId = listingId;
      listingForm.title.value = match.title || "";
      listingForm.price.value = match.price || 0;
      listingForm.propertyType.value = match.propertyType || "";
      listingForm.region.value = match.region || "";
      listingForm.district.value = match.district || "";
      listingForm.address.value = match.address || "";
      listingForm.rooms.value = match.rooms || 0;
      listingForm.area.value = match.area || 0;
      listingForm.status.value = match.status || "активно";
      listingForm.amenities.value = (match.amenities || []).join(", ");
      listingForm.description.value = match.description || "";
    }
  });
}

if (usersEl) {
  on(usersEl, "change", async (event) => {
    if (!ensureAdminAction()) return;
    const select = event.target.closest("select[data-action=role]");
    if (!select) return;
    const card = event.target.closest(".card");
    if (!card) return;
    await setUserRole(card.dataset.id, select.value);
  });

  on(usersEl, "click", async (event) => {
    if (!ensureAdminAction()) return;
    const actionBtn = event.target.closest("[data-action]");
    if (!actionBtn) return;
    const card = event.target.closest(".card");
    if (!card) return;
    const uid = card.dataset.id;

    if (actionBtn.dataset.action === "delete-user") {
      const proceed = window.confirm("Удалить профиль пользователя?");
      if (!proceed) return;
      await deleteUserProfile(uid);
      await loadUsers();
      return;
    }

    if (actionBtn.dataset.action === "edit-user" && userForm) {
      userEditId = uid;
      userForm.name.value = decodeURIComponent(card.dataset.name || "");
      userForm.email.value = decodeURIComponent(card.dataset.email || "");
      userForm.phone.value = decodeURIComponent(card.dataset.phone || "");
      userForm.role.value = decodeURIComponent(card.dataset.role || "user");
    }
  });
}

if (bookingsEl) {
  on(bookingsEl, "change", async (event) => {
    if (!ensureAdminAction()) return;
    const select = event.target.closest("select[data-action=booking-status]");
    if (!select) return;
    const card = event.target.closest(".card");
    if (!card) return;
    await updateBookingStatus(card.dataset.id, select.value);
  });

  on(bookingsEl, "click", async (event) => {
    if (!ensureAdminAction()) return;
    const actionBtn = event.target.closest("[data-action]");
    if (!actionBtn) return;
    const card = event.target.closest(".card");
    if (!card) return;
    if (actionBtn.dataset.action === "delete-booking") {
      const proceed = window.confirm("Удалить бронирование?");
      if (!proceed) return;
      await removeBooking(card.dataset.id);
      await loadBookings();
    }
  });
}

if (moderationMessagesEl) {
  on(moderationMessagesEl, "click", async (event) => {
    if (!ensureAdminAction()) return;
    const actionBtn = event.target.closest("[data-action]");
    if (!actionBtn) return;
    const card = event.target.closest(".card");
    if (!card) return;
    if (actionBtn.dataset.action === "delete-message") {
      const proceed = window.confirm("Удалить сообщение?");
      if (!proceed) return;
      await deleteMessage(card.dataset.id);
      await loadModeration();
    }
  });
}

if (moderationReviewsEl) {
  on(moderationReviewsEl, "click", async (event) => {
    if (!ensureAdminAction()) return;
    const actionBtn = event.target.closest("[data-action]");
    if (!actionBtn) return;
    const card = event.target.closest(".card");
    if (!card) return;
    if (actionBtn.dataset.action === "delete-review") {
      const proceed = window.confirm("Удалить отзыв?");
      if (!proceed) return;
      await deleteReviewModeration({
        listingId: card.dataset.listingId,
        reviewId: card.dataset.reviewId
      });
      await loadModeration();
    }
  });
}

onAuthReady(async (authState) => {
  renderAdminGuard(authState.isAdmin);
  toggleAdminSections(authState.isAdmin);
  if (!authState.isAdmin) return;
  await Promise.all([loadStats(), loadListings(), loadUsers(), loadBookings(), loadModeration()]);
});
