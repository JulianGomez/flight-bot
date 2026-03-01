// api/status.js
// Página de estado del bot — visible en https://tu-app.vercel.app/api/status

import { findDeals } from "../lib/flightSearch.js";

export default async function handler(req, res) {
  // Para GET simple solo devuelve estado sin buscar
  if (req.method === "GET" && !req.query.search) {
    return res.status(200).json({
      status: "running",
      bot: "Flight Deal Alert Bot 🛫",
      origin: process.env.ORIGIN_AIRPORT || "EZE",
      destinations: JSON.parse(process.env.DESTINATIONS || "[]").map((d) => d.name),
      maxPrice: process.env.MAX_PRICE_USD || "9999",
      discountThreshold: `${(parseFloat(process.env.DISCOUNT_THRESHOLD || "0.25") * 100).toFixed(0)}%`,
      nextCheck: "Automático cada 6hs vía Vercel Cron",
      timestamp: new Date().toISOString(),
    });
  }

  // Si pasan ?search=1 hace una búsqueda real (para testear)
  if (req.query.search === "1") {
    try {
      const deals = await findDeals();
      return res.status(200).json({ deals, count: deals.length });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }
}
