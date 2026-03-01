// run.js — Entrypoint para Render Cron Job
import { findDeals, sendTelegramAlert } from "./lib/flightSearch.js";

console.log("🔍 Buscando ofertas...");
const deals = await findDeals();
console.log(`✅ ${deals.length} oferta(s) encontrada(s)`);
await sendTelegramAlert(deals);
console.log("📱 Alertas enviadas. Fin.");
process.exit(0);
