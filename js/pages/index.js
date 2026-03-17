import { initAuthUI, onAuthReady } from "../core/auth.js";
import { subscribeListings, fetchListings, DEFAULT_PAGE_SIZE } from "../services/listingsService.js";
import { toggleFavorite } from "../services/favoritesService.js";
import { getFilterData } from "../services/filtersService.js";
import { qs, on, setText, toggleHidden } from "../utils/dom.js";
import { renderListingCard } from "../ui/renderers.js";
import { translateFirebaseError } from "../utils/errors.js";

initAuthUI();

const grid = qs("#listings-grid");
const loadMoreBtn = qs("#load-more");
const countEl = qs("#listing-count");
const errorEl = qs("#listings-error");
const searchForm = qs("#search-form");
const searchInput = qs("#search-input");
const statusWrap = qs("#filter-status-wrap");
const statusSelect = qs("#filter-status");
const typeSelect = qs("#filter-type");
const regionSelect = qs("#filter-region");
const districtSelect = qs("#filter-district");
const amenitySelect = qs("#filter-amenity");
const minPrice = qs("#filter-price-min");
const maxPrice = qs("#filter-price-max");
const roomsMin = qs("#filter-rooms-min");
const roomsMax = qs("#filter-rooms-max");
const areaMin = qs("#filter-area-min");
const areaMax = qs("#filter-area-max");
const ratingMin = qs("#filter-rating-min");
const sortSelect = qs("#sort-by");

const state = {
  filters: {
    status: "активно",
    propertyType: "",
    region: "",
    district: "",
    amenity: "",
    priceMin: "",
    priceMax: "",
    roomsMin: "",
    roomsMax: "",
    areaMin: "",
    areaMax: "",
    ratingMin: "",
    sortBy: "createdAt:desc",
    query: "",
    queryTokens: []
  },
  districts: [],
  pageSize: DEFAULT_PAGE_SIZE,
  lastDoc: null,
  liveDocs: [],
  extraDocs: [],
  unsubscribe: null
};

const parseSearch = (text) => {
  const cleaned = text.trim().toLowerCase();
  const tokens = cleaned.split(/\s+/).filter(Boolean);
  return {
    query: cleaned,
    queryTokens: tokens
  };
};

const matchesSearchText = (listing, queryText) => {
  if (!queryText) return true;
  const haystack = `${listing.title || ""} ${listing.description || ""}`.toLowerCase();
  return queryText.split(/\s+/).every((token) => haystack.includes(token));
};

const matchesFilters = (listing, filters) => {
  if (!listing) return false;
  if (filters.status && listing.status !== filters.status) return false;
  if (filters.propertyType && listing.propertyType !== filters.propertyType) return false;
  if (filters.region && listing.region !== filters.region) return false;
  if (filters.district && listing.district !== filters.district) return false;
  if (filters.amenity && !Array.isArray(listing.amenities)) return false;
  if (filters.amenity && !listing.amenities.includes(filters.amenity)) return false;
  const priceValue = Number(listing.price || 0);
  if (filters.priceMin && priceValue < Number(filters.priceMin)) return false;
  if (filters.priceMax && priceValue > Number(filters.priceMax)) return false;
  const roomsValue = Number(listing.rooms || 0);
  if (filters.roomsMin && roomsValue < Number(filters.roomsMin)) return false;
  if (filters.roomsMax && roomsValue > Number(filters.roomsMax)) return false;
  const areaValue = Number(listing.area || 0);
  if (filters.areaMin && areaValue < Number(filters.areaMin)) return false;
  if (filters.areaMax && areaValue > Number(filters.areaMax)) return false;
  const ratingValue = Number(listing.rating || 0);
  if (filters.ratingMin && ratingValue < Number(filters.ratingMin)) return false;
  if (!matchesSearchText(listing, filters.query)) return false;
  return true;
};

const renderListings = () => {
  if (!grid) return;
  const combined = [...state.liveDocs, ...state.extraDocs];
  const deduped = new Map();
  combined.forEach((docSnap) => deduped.set(docSnap.id, docSnap));

  const cards = Array.from(deduped.values())
    .map((docSnap) => ({ id: docSnap.id, data: docSnap.data() }))
    .filter((item) => matchesFilters(item.data, state.filters))
    .map((item) => renderListingCard(item.data, item.id));

  grid.innerHTML = cards.join("");
  setText(countEl, `${cards.length}`);
};

const showListingError = (error) => {
  if (errorEl) {
    errorEl.classList.remove("hidden");
    errorEl.textContent = translateFirebaseError(error, "Не удалось загрузить объявления.");
  }
  console.error(error);
};

const refreshListings = () => {
  if (!grid) return;
  if (state.unsubscribe) state.unsubscribe();

  state.lastDoc = null;
  state.liveDocs = [];
  state.extraDocs = [];

  if (errorEl) errorEl.classList.add("hidden");

  state.unsubscribe = subscribeListings(
    state.filters,
    (snapshot) => {
      if (errorEl) errorEl.classList.add("hidden");
      state.liveDocs = snapshot.docs;
      state.lastDoc = snapshot.docs[snapshot.docs.length - 1] || null;
      renderListings();
      if (loadMoreBtn) {
        toggleHidden(loadMoreBtn, snapshot.docs.length < state.pageSize);
      }
    },
    state.pageSize,
    showListingError
  );
};

const loadMore = async () => {
  if (!state.lastDoc) return;
  try {
    const snapshot = await fetchListings(state.filters, state.lastDoc, state.pageSize);
    state.extraDocs = state.extraDocs.concat(snapshot.docs);
    state.lastDoc = snapshot.docs[snapshot.docs.length - 1] || state.lastDoc;
    renderListings();
    if (loadMoreBtn && snapshot.docs.length < state.pageSize) {
      loadMoreBtn.classList.add("hidden");
    }
  } catch (error) {
    showListingError(error);
  }
};

const updateFilters = (patch) => {
  state.filters = { ...state.filters, ...patch };
  refreshListings();
};

const fillSelect = (select, items, placeholder) => {
  if (!select) return;
  select.innerHTML = "";
  const placeholderOption = document.createElement("option");
  placeholderOption.value = "";
  placeholderOption.textContent = placeholder;
  select.appendChild(placeholderOption);

  items.forEach((item) => {
    const option = document.createElement("option");
    option.value = item;
    option.textContent = item;
    select.appendChild(option);
  });
};

const updateDistricts = () => {
  if (!districtSelect) return;
  const region = regionSelect?.value || "";
  const filtered = region
    ? state.districts.filter((item) => item.region === region)
    : state.districts;
  fillSelect(districtSelect, filtered.map((item) => item.name), "Все районы");
};

const initFilters = async () => {
  const data = await getFilterData();
  state.districts = data.districts;
  fillSelect(typeSelect, data.types, "Все типы");
  fillSelect(regionSelect, data.regions, "Все регионы");
  fillSelect(districtSelect, data.districts.map((item) => item.name), "Все районы");
  fillSelect(amenitySelect, data.amenities, "Любое удобство");
  updateDistricts();
};

if (loadMoreBtn) on(loadMoreBtn, "click", loadMore);

if (grid) {
  on(grid, "click", async (event) => {
    const actionBtn = event.target.closest("[data-action]");
    if (!actionBtn) return;
    const card = event.target.closest(".card");
    if (!card) return;
    if (actionBtn.dataset.action === "favorite") {
      const user = window.EASYRENT?.auth?.user;
      if (!user) return window.EASYRENT?.openAuthModal?.("login");
      await toggleFavorite(user.uid, card.dataset.id);
    }
  });
}

if (searchForm) {
  on(searchForm, "submit", (event) => {
    event.preventDefault();
    updateFilters(parseSearch(searchInput?.value || ""));
  });
}

let searchTimer;
if (searchInput) {
  on(searchInput, "input", () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => updateFilters(parseSearch(searchInput.value || "")), 350);
  });
}

if (statusSelect) on(statusSelect, "change", () => updateFilters({ status: statusSelect.value }));
if (typeSelect) on(typeSelect, "change", () => updateFilters({ propertyType: typeSelect.value }));
if (regionSelect) {
  on(regionSelect, "change", () => {
    updateDistricts();
    updateFilters({ region: regionSelect.value, district: "" });
  });
}
if (districtSelect) on(districtSelect, "change", () => updateFilters({ district: districtSelect.value }));
if (amenitySelect) on(amenitySelect, "change", () => updateFilters({ amenity: amenitySelect.value }));
if (minPrice) on(minPrice, "change", () => updateFilters({ priceMin: minPrice.value }));
if (maxPrice) on(maxPrice, "change", () => updateFilters({ priceMax: maxPrice.value }));
if (roomsMin) on(roomsMin, "change", () => updateFilters({ roomsMin: roomsMin.value }));
if (roomsMax) on(roomsMax, "change", () => updateFilters({ roomsMax: roomsMax.value }));
if (areaMin) on(areaMin, "change", () => updateFilters({ areaMin: areaMin.value }));
if (areaMax) on(areaMax, "change", () => updateFilters({ areaMax: areaMax.value }));
if (ratingMin) on(ratingMin, "change", () => updateFilters({ ratingMin: ratingMin.value }));
if (sortSelect) on(sortSelect, "change", () => updateFilters({ sortBy: sortSelect.value }));

onAuthReady((authState) => {
  if (statusWrap) toggleHidden(statusWrap, !authState.isAdmin);
  if (statusSelect && statusSelect.value !== state.filters.status) {
    statusSelect.value = state.filters.status;
  }
  if (!authState.isAdmin && state.filters.status !== "активно") {
    updateFilters({ status: "активно" });
  }
});

initFilters().then(() => refreshListings());
