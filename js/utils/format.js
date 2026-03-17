const formatPrice = (price) =>
  new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(Number(price || 0));

const formatDateRange = (from, to) => {
  const start = from || "Не задано";
  const end = to || "Не задано";
  return `${start} - ${end}`;
};

export { formatPrice, formatDateRange };
