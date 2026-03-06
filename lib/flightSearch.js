// lib/flightSearch.js
// Soporta: Amadeus (test/prod) y Travelpayouts
// Elegir proveedor con FLIGHT_PROVIDER=amadeus|travelpayouts en .env

// ══════════════════════════════════════════════════════
// AMADEUS
// ══════════════════════════════════════════════════════

const AMADEUS_BASE = "https://test.api.amadeus.com";

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

function getFutureDates(monthsAhead = 3) {
  const dates = [];
  const now = new Date();
  for (let i = 1; i <= monthsAhead * 4; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i * 7);
    if (d.getDay() === 5 || d.getDay() === 1) {
      dates.push(d.toISOString().split("T")[0]);
    }
  }
  return dates.slice(0, 8);
}

async function searchFlightAmadeus(token, origin, destination, date) {
  const url = new URL(`${AMADEUS_BASE}/v2/shopping/flight-offers`);
  url.searchParams.set("originLocationCode", origin);
  url.searchParams.set("destinationLocationCode", destination);
  url.searchParams.set("departureDate", date);
  url.searchParams.set("adults", "1");
  url.searchParams.set("currencyCode", "USD");
  url.searchParams.set("max", "3");
  url.searchParams.set("nonStop", "false");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    signal: controller.signal,
  }).catch(() => null);
  clearTimeout(timeout);

  if (!res || !res.ok) return null;
  const data = await res.json();
  if (!data.data || data.data.length === 0) return null;

  const best = data.data[0];
  const duration = best.itineraries[0].duration
    ?.replace("PT","").replace("H","h ").replace("M","min") || "";

  return {
    price: parseFloat(best.price.total),
    currency: "USD",
    airline: best.validatingAirlineCodes?.[0] || "N/A",
    stops: best.itineraries[0].segments.length - 1,
    duration,
    date,
    returnDate: null,
    origin,
    destination,
    bookingLink: null,
  };
}

async function findDealsAmadeus() {
  const token      = await getAmadeusToken();
  const DESTINOS   = JSON.parse(process.env.DESTINATIONS || "[]");
  const PRECIO_MAX = parseFloat(process.env.MAX_PRICE_USD || "9999");
  const dates      = getFutureDates(3);
  const deals      = [];

  for (const dest of DESTINOS) {
    const config  = getConfigForDest(dest.code);
    const origins = config.origs;
    let bestGlobal = null;

    for (const origin of origins) {
      let bestForOrigin = null;
      for (const date of dates) {
        try {
          const flight = await searchFlightAmadeus(token, origin, dest.code, date);
          if (!flight) continue;
          if (!bestForOrigin || flight.price < bestForOrigin.price) {
            bestForOrigin = { ...flight, name: dest.name, emoji: dest.emoji };
          }
          await sleep(300);
        } catch (e) {
          console.error(`[Amadeus] Error ${origin}→${dest.code} ${date}:`, e.message);
        }
      }
      if (bestForOrigin && (!bestGlobal || bestForOrigin.price < bestGlobal.price)) {
        bestGlobal = bestForOrigin;
      }
    }

    if (!bestGlobal) continue;
    const pasaFiltro = dest.maxPrice ? bestGlobal.price <= dest.maxPrice : bestGlobal.price <= PRECIO_MAX;
    if (pasaFiltro) {
      const savings = dest.maxPrice ? Math.round(((dest.maxPrice - bestGlobal.price) / dest.maxPrice) * 100) : null;
      deals.push({ ...bestGlobal, savings });
    }
  }

  return deals;
}

// ══════════════════════════════════════════════════════
// TRAVELPAYOUTS
// ══════════════════════════════════════════════════════

const TP_BASE = "https://api.travelpayouts.com";

const DEST_CONFIG = {
  nacionales:   { codes: ["MDZ","BRC","IGR","CRD","USH","NQN","SLA","TUC","COR","ROS"], origs: ["EZE","AEP"], meses: 12, dias: range(4,10)  },
  europa:       { codes: ["MAD","LIS","BCN","CDG","FCO","AMS","NRT"],                   origs: ["EZE","SCL","GRU"], meses: 12, dias: range(20,30) },
  norteamerica: { codes: ["MIA","JFK","LAX","ORD","DFW","ATL","CUN"],                   origs: ["EZE","SCL"], meses: 12, dias: range(14,21) },
  latam:        { codes: ["LIM","BOG","MEX"],                                            origs: ["EZE"], meses: 12, dias: range(7,14)  },
};

function range(from, to) {
  return Array.from({ length: to - from + 1 }, (_, i) => from + i);
}

function getConfigForDest(destCode) {
  for (const config of Object.values(DEST_CONFIG)) {
    if (config.codes.includes(destCode)) return config;
  }
  return DEST_CONFIG.latam;
}

function getFutureMonths(monthsAhead = 12) {
  const months = [];
  const now = new Date();
  for (let i = 1; i <= monthsAhead; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    months.push(`${d.getFullYear()}-${m}`);
  }
  return months;
}

function buildBookingLink(origin, destination, departureAt, returnAt, marker) {
  try {
    const dep = new Date(departureAt + "T12:00:00");
    const ret = new Date(returnAt + "T12:00:00");
    const depDay   = String(dep.getDate()).padStart(2, "0");
    const depMonth = String(dep.getMonth() + 1).padStart(2, "0");
    const retDay   = String(ret.getDate()).padStart(2, "0");
    const retMonth = String(ret.getMonth() + 1).padStart(2, "0");
    return `https://www.aviasales.com/search/${origin}${depDay}${depMonth}${destination}${retDay}${retMonth}${origin}1?marker=${marker}&origin_airports=0&destination_airports=1`;
  } catch { return null; }
}

async function searchFlightTP(token, marker, origin, destination, month, durations) {
  const url = new URL(`${TP_BASE}/v1/prices/cheap`);
  url.searchParams.set("origin", origin);
  url.searchParams.set("destination", destination);
  url.searchParams.set("depart_date", month);
  url.searchParams.set("currency", "usd");
  url.searchParams.set("token", token);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  const res = await fetch(url.toString(), {
    signal: controller.signal,
  }).catch(() => null);
  clearTimeout(timeout);

  if (!res || !res.ok) return null;
  const data = await res.json();
  if (!data.success || !data.data?.[destination]) return null;

  const options = Object.values(data.data[destination]);
  if (options.length === 0) return null;

  const best = options.reduce((a, b) => (a.price < b.price ? a : b));
  const departureDate = best.departure_at?.split("T")[0] || month + "-01";

  const tripDays = durations[Math.floor(durations.length / 2)];
  const returnDateObj = new Date(departureDate);
  returnDateObj.setDate(returnDateObj.getDate() + tripDays);
  const returnDate = returnDateObj.toISOString().split("T")[0];

  return {
    price: best.price,
    currency: "USD",
    airline: best.airline || "N/A",
    stops: best.transfers || 0,
    duration: `${durations[0]}-${durations[durations.length-1]} días`,
    date: departureDate,
    returnDate,
    origin,
    destination,
    bookingLink: buildBookingLink(origin, destination, departureDate, returnDate, marker),
  };
}

async function findDealsTP() {
  const token      = process.env.TRAVELPAYOUTS_TOKEN;
  const marker     = process.env.TRAVELPAYOUTS_MARKER || "";
  const DESTINOS   = JSON.parse(process.env.DESTINATIONS || "[]");
  const PRECIO_MAX = parseFloat(process.env.MAX_PRICE_USD || "9999");

  if (!token) throw new Error("Falta TRAVELPAYOUTS_TOKEN en las variables de entorno");

  const deals = [];

  for (const dest of DESTINOS) {
    const config    = getConfigForDest(dest.code);
    const origins   = config.origs;
    const months    = getFutureMonths(config.meses);
    const durations = config.dias;
    let bestGlobal  = null;

    for (const origin of origins) {
      let bestForOrigin = null;
      for (const month of months) {
        try {
          const flight = await searchFlightTP(token, marker, origin, dest.code, month, durations);
          if (!flight) continue;
          if (!bestForOrigin || flight.price < bestForOrigin.price) {
            bestForOrigin = { ...flight, name: dest.name, emoji: dest.emoji };
          }
          await sleep(200);
        } catch (e) {
          console.error(`[TP] Error ${origin}→${dest.code} ${month}:`, e.message);
        }
      }
      if (bestForOrigin && (!bestGlobal || bestForOrigin.price < bestGlobal.price)) {
        bestGlobal = bestForOrigin;
      }
    }

    if (!bestGlobal) continue;
    const pasaFiltro = dest.maxPrice ? bestGlobal.price <= dest.maxPrice : bestGlobal.price <= PRECIO_MAX;
    if (pasaFiltro) {
      const savings = dest.maxPrice ? Math.round(((dest.maxPrice - bestGlobal.price) / dest.maxPrice) * 100) : null;
      deals.push({ ...bestGlobal, savings });
    }
  }

  return deals;
}

// ══════════════════════════════════════════════════════
// COMPARTIDO — Orígenes, Telegram, Formato
// ══════════════════════════════════════════════════════

function getOriginsForDest(destCode) {
  return getConfigForDest(destCode).origs;
}

export async function findDeals() {
  const provider = (process.env.FLIGHT_PROVIDER || "travelpayouts").toLowerCase();
  console.log(`🔌 Proveedor: ${provider.toUpperCase()}`);
  if (provider === "travelpayouts") return findDealsTP();
  if (provider === "amadeus")       return findDealsAmadeus();
  throw new Error(`FLIGHT_PROVIDER inválido: "${provider}". Usar "amadeus" o "travelpayouts"`);
}

export async function sendTelegramAlert(deals) {
  const token  = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.log("⚠️  Telegram no configurado:");
    deals.forEach((d) => console.log(formatDeal(d)));
    return;
  }
  if (deals.length === 0) {
    console.log("✅ Sin ofertas nuevas esta vez.");
    return;
  }

  const provider = (process.env.FLIGHT_PROVIDER || "travelpayouts").toUpperCase();
  const header = `✈️ *${deals.length} OFERTA${deals.length > 1 ? "S" : ""} DETECTADA${deals.length > 1 ? "S" : ""}* desde Argentina\n_Fuente: ${provider}_\n\n`;
  const body   = deals.map(formatDeal).join("\n\n");
  const footer = `\n\n_Buscado: ${new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}_`;

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: header + body + footer,
      parse_mode: "Markdown",
      disable_web_page_preview: false,
    }),
  });
}

function formatDeal(d) {
  const stops     = d.stops === 0 ? "✈️ Directo" : `🔄 ${d.stops} escala${d.stops > 1 ? "s" : ""}`;
  const savings   = d.savings ? ` _(${d.savings}% bajo el precio máximo)_` : "";
  const HUB_NAMES = { AEP: "Aeroparque 🇦🇷", SCL: "Santiago 🇨🇱", GRU: "San Pablo 🇧🇷" };
  const origenStr = d.origin !== "EZE"
    ? `\n   🔀 *Sale desde ${HUB_NAMES[d.origin] || d.origin}*`
    : "";
  const durStr    = d.duration ? ` · 🗓 ${d.duration}` : "";
  const vueltaStr = d.returnDate ? `\n   🔙 Vuelta estimada: ${d.returnDate}` : "";
  const linkStr   = d.bookingLink ? `\n   🔗 [Comprar vuelo aquí](${d.bookingLink})` : "";

  return (
    `${d.emoji || "🌍"} *${d.name}* (${d.destination})\n` +
    `   💵 *USD ${d.price.toFixed(0)}* ida y vuelta${savings}\n` +
    `   📅 Salida: ${d.date}${vueltaStr}\n` +
    `   ${stops}${durStr}\n` +
    `   🛫 Aerolínea: ${d.airline}` +
    origenStr +
    linkStr
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}