// lib/flightSearch.js
// Amadeus Flight Search + Telegram Alerts

const AMADEUS_BASE = "https://test.api.amadeus.com"; // Cambiar a api.amadeus.com en producción

// ─── Token de Amadeus (OAuth2) ───────────────────────────────────────────────
async function getAmadeusToken() {
  const res = await fetch(`${AMADEUS_BASE}/v1/security/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.AMADEUS_API_KEY,
      client_secret: process.env.AMADEUS_API_SECRET,
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error("No se pudo obtener token de Amadeus");
  return data.access_token;
}

// ─── Generar fechas de los próximos N meses ──────────────────────────────────
function getFutureDates(monthsAhead = 3) {
  const dates = [];
  const now = new Date();
  for (let i = 1; i <= monthsAhead * 4; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i * 7); // cada semana
    if (d.getDay() === 5 || d.getDay() === 1) { // viernes o lunes (vuelos más baratos)
      dates.push(d.toISOString().split("T")[0]);
    }
  }
  return dates.slice(0, 8); // máximo 8 fechas para no agotar cuota
}

// ─── Buscar el vuelo más barato para un destino y fecha ─────────────────────
async function searchFlight(token, origin, destination, date) {
  const url = new URL(`${AMADEUS_BASE}/v2/shopping/flight-offers`);
  url.searchParams.set("originLocationCode", origin);
  url.searchParams.set("destinationLocationCode", destination);
  url.searchParams.set("departureDate", date);
  url.searchParams.set("adults", "1");
  url.searchParams.set("currencyCode", "USD");
  url.searchParams.set("max", "3");
  url.searchParams.set("nonStop", "false");

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) return null;
  const data = await res.json();
  if (!data.data || data.data.length === 0) return null;

  const best = data.data[0];
  return {
    price: parseFloat(best.price.total),
    currency: best.price.currency,
    airline: best.validatingAirlineCodes?.[0] || "N/A",
    stops: best.itineraries[0].segments.length - 1,
    duration: best.itineraries[0].duration,
    date,
    origin,
    destination,
  };
}

// ─── Buscar el precio histórico promedio (baseline) ─────────────────────────
// Usamos el insight de precios de Amadeus
async function getFlightInsights(token, origin, destination) {
  try {
    const url = new URL(`${AMADEUS_BASE}/v1/analytics/itinerary-price-metrics`);
    url.searchParams.set("originIataCode", origin);
    url.searchParams.set("destinationIataCode", destination);
    url.searchParams.set("departureDate", getFutureDates(1)[0]);
    url.searchParams.set("currencyCode", "USD");

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.[0]?.priceMetrics?.find((p) => p.quartileRanking === "MEDIUM")?.amount || null;
  } catch {
    return null;
  }
}

// ─── Función principal: buscar todas las ofertas ─────────────────────────────
export async function findDeals() {
  const DESTINOS = JSON.parse(process.env.DESTINATIONS || "[]");
  const UMBRAL_DESCUENTO = parseFloat(process.env.DISCOUNT_THRESHOLD || "0.25"); // 25% debajo del promedio
  const PRECIO_MAX = parseFloat(process.env.MAX_PRICE_USD || "9999");
  const ORIGIN = process.env.ORIGIN_AIRPORT || "EZE";

  if (DESTINOS.length === 0) {
    console.log("⚠️  No hay destinos configurados en DESTINATIONS");
    return [];
  }

  const token = await getAmadeusToken();
  const dates = getFutureDates(3);
  const deals = [];

  for (const dest of DESTINOS) {
    let bestForDest = null;

    for (const date of dates) {
      try {
        const flight = await searchFlight(token, ORIGIN, dest.code, date);
        if (!flight) continue;
        if (!bestForDest || flight.price < bestForDest.price) {
          bestForDest = { ...flight, name: dest.name, emoji: dest.emoji };
        }
        await sleep(300); // evitar rate limit
      } catch (e) {
        console.error(`Error buscando ${dest.code} en ${date}:`, e.message);
      }
    }

    if (!bestForDest) continue;

    // Comparar con precio histórico si está disponible
    const avgPrice = await getFlightInsights(token, ORIGIN, dest.code);
    const umbral = avgPrice
      ? avgPrice * (1 - UMBRAL_DESCUENTO)
      : dest.maxPrice || PRECIO_MAX;

    if (bestForDest.price <= umbral) {
      const savings = avgPrice ? Math.round(((avgPrice - bestForDest.price) / avgPrice) * 100) : null;
      deals.push({ ...bestForDest, avgPrice, savings, umbral });
    }
  }

  return deals;
}

// ─── Enviar alerta a Telegram ─────────────────────────────────────────────────
export async function sendTelegramAlert(deals) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.log("⚠️  Telegram no configurado, mostrando por consola:");
    deals.forEach((d) => console.log(formatDeal(d)));
    return;
  }

  if (deals.length === 0) {
    // Silencioso si no hay ofertas
    console.log("✅ Sin ofertas nuevas esta vez.");
    return;
  }

  const header = `✈️ *${deals.length} OFERTA${deals.length > 1 ? "S" : ""} DETECTADA${deals.length > 1 ? "S" : ""}* desde EZE\n\n`;
  const body = deals.map(formatDeal).join("\n\n");
  const footer = `\n\n_Buscado: ${new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}_`;

  const text = header + body + footer;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    }),
  });
}

function formatDeal(d) {
  const stops = d.stops === 0 ? "✈️ Directo" : `🔄 ${d.stops} escala${d.stops > 1 ? "s" : ""}`;
  const duration = d.duration?.replace("PT", "").replace("H", "h ").replace("M", "min") || "";
  const savings = d.savings ? ` _(${d.savings}% más barato que lo normal)_` : "";
  const avgStr = d.avgPrice ? `\n   📊 Precio promedio: USD ${Math.round(d.avgPrice)}` : "";

  return (
    `${d.emoji || "🌍"} *${d.name}* (${d.destination})\n` +
    `   💵 *USD ${d.price.toFixed(0)}*${savings}\n` +
    `   📅 Fecha: ${d.date}\n` +
    `   ${stops} · ⏱ ${duration}\n` +
    `   🛫 Aerolínea: ${d.airline}` +
    avgStr
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
