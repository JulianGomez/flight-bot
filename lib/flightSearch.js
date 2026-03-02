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

// ─── Clasificación de destinos por tipo ──────────────────────────────────────
function getOriginsForDest(destCode) {
  const nacionales   = (process.env.DEST_NACIONALES   || "MDZ,BRC,IGR,CRD,USH,NQN,SLA,TUC,COR,ROS").split(",");
  const europa       = (process.env.DEST_EUROPA        || "MAD,LIS,BCN,CDG,FCO,AMS,PMI,LHR,FRA,MXP").split(",");
  const norteamerica = (process.env.DEST_NORTEAMERICA  || "MIA,JFK,LAX,ORD,DFW,ATL,CUN").split(",");

  const origNacionales   = (process.env.ORIG_NACIONALES   || "EZE,AEP").split(",");
  const origEuropa       = (process.env.ORIG_EUROPA        || "EZE,SCL,GRU").split(",");
  const origNorteamerica = (process.env.ORIG_NORTEAMERICA  || "EZE,SCL").split(",");
  const origLatam        = (process.env.ORIG_LATAM         || "EZE").split(",");

  if (nacionales.includes(destCode))   return origNacionales;
  if (europa.includes(destCode))       return origEuropa;
  if (norteamerica.includes(destCode)) return origNorteamerica;
  return origLatam;
}

// ─── Función principal: buscar todas las ofertas ─────────────────────────────
export async function findDeals() {
  const DESTINOS = JSON.parse(process.env.DESTINATIONS || "[]");
  const UMBRAL_DESCUENTO = parseFloat(process.env.DISCOUNT_THRESHOLD || "0.25");
  const PRECIO_MAX = parseFloat(process.env.MAX_PRICE_USD || "9999");

  if (DESTINOS.length === 0) {
    console.log("⚠️  No hay destinos configurados en DESTINATIONS");
    return [];
  }

  const token = await getAmadeusToken();
  const dates = getFutureDates(3);
  const deals = [];

  for (const dest of DESTINOS) {
    const origins = getOriginsForDest(dest.code);
    let bestGlobal = null; // el mejor vuelo entre todos los orígenes

    for (const origin of origins) {
      let bestForOrigin = null;

      for (const date of dates) {
        try {
          const flight = await searchFlight(token, origin, dest.code, date);
          if (!flight) continue;
          if (!bestForOrigin || flight.price < bestForOrigin.price) {
            bestForOrigin = { ...flight, name: dest.name, emoji: dest.emoji };
          }
          await sleep(300);
        } catch (e) {
          console.error(`Error buscando ${origin}→${dest.code} en ${date}:`, e.message);
        }
      }

      // Quedarse con el mejor precio entre todos los orígenes
      if (bestForOrigin && (!bestGlobal || bestForOrigin.price < bestGlobal.price)) {
        bestGlobal = bestForOrigin;
      }
    }

    if (!bestGlobal) continue;

    // Comparar con precio histórico desde EZE como referencia base
    const avgPrice = await getFlightInsights(token, "EZE", dest.code);
    const umbral = avgPrice
      ? avgPrice * (1 - UMBRAL_DESCUENTO)
      : dest.maxPrice || PRECIO_MAX;

    if (bestGlobal.price <= umbral) {
      const savings = avgPrice
        ? Math.round(((avgPrice - bestGlobal.price) / avgPrice) * 100)
        : null;
      deals.push({ ...bestGlobal, avgPrice, savings, umbral });
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

  const header = `✈️ *${deals.length} OFERTA${deals.length > 1 ? "S" : ""} DETECTADA${deals.length > 1 ? "S" : ""}* desde Argentina\n\n`;
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

  // Mostrar origen si no es EZE (ej: sale desde Santiago o San Pablo)
  const HUB_NAMES = { AEP: "Aeroparque", SCL: "Santiago 🇨🇱", GRU: "San Pablo 🇧🇷" };
  const origenStr = d.origin !== "EZE"
    ? `\n   🔀 *Sale desde ${HUB_NAMES[d.origin] || d.origin}* (más barato que desde EZE)`
    : "";

  return (
    `${d.emoji || "🌍"} *${d.name}* (${d.destination})\n` +
    `   💵 *USD ${d.price.toFixed(0)}*${savings}\n` +
    `   📅 Fecha: ${d.date}\n` +
    `   ${stops} · ⏱ ${duration}\n` +
    `   🛫 Aerolínea: ${d.airline}` +
    origenStr +
    avgStr
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}