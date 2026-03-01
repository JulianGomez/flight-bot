// api/cron.js
// Este endpoint lo llama Vercel automáticamente según el schedule en vercel.json
// También podés llamarlo manualmente con GET /api/cron?secret=TU_SECRET

import { findDeals, sendTelegramAlert } from "../lib/flightSearch.js";

export default async function handler(req, res) {
  // Proteger el endpoint con un secret para evitar llamadas no autorizadas
  const { secret } = req.query;
  if (
    process.env.CRON_SECRET &&
    secret !== process.env.CRON_SECRET &&
    req.headers["authorization"] !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return res.status(401).json({ error: "No autorizado" });
  }

  try {
    console.log("🔍 Iniciando búsqueda de ofertas...");
    const deals = await findDeals();

    console.log(`🎯 Se encontraron ${deals.length} oferta(s)`);
    await sendTelegramAlert(deals);

    return res.status(200).json({
      ok: true,
      timestamp: new Date().toISOString(),
      dealsFound: deals.length,
      deals: deals.map((d) => ({
        destination: d.name,
        price: d.price,
        date: d.date,
        savings: d.savings,
      })),
    });
  } catch (error) {
    console.error("❌ Error en cron:", error);
    return res.status(500).json({ ok: false, error: error.message });
  }
}
