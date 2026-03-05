// scripts/test.js
// Testear el bot localmente antes de deployar
// Uso: node scripts/test.js

import { config } from "dotenv";
config({ path: ".env.local" });

import { findDeals, sendTelegramAlert } from "../lib/flightSearch.js";

async function main() {
  console.log("🚀 Iniciando test del bot...\n");
  console.log(`📍 Nacionales: ${process.env.ORIG_NACIONALES || "EZE,AEP"}`);
  console.log(`📍 Europa:     ${process.env.ORIG_EUROPA || "EZE,SCL,GRU"}`);
  console.log(`📍 EEUU/Méx:   ${process.env.ORIG_NORTEAMERICA || "EZE,SCL"}`);  
  console.log(`📍 Latam:      ${process.env.ORIG_LATAM || "EZE"}`);
  console.log("\n");
  console.log(`💰 Precio máx: USD ${process.env.MAX_PRICE_USD || "9999"}`);
  console.log(`📉 Descuento mín: ${(parseFloat(process.env.DISCOUNT_THRESHOLD || "0.25") * 100).toFixed(0)}%`);

  const destinos = JSON.parse(process.env.DESTINATIONS || "[]");
  console.log(`🌍 Destinos configurados: ${destinos.map((d) => d.name).join(", ")}\n`);

  try {
    console.log("⏳ Buscando ofertas...\n");
    const deals = await findDeals();

    if (deals.length === 0) {
      console.log("😴 No se encontraron ofertas que cumplan los criterios por ahora.");
      console.log("   Tip: Bajá DISCOUNT_THRESHOLD o subí MAX_PRICE_USD para ver más resultados.");
    } else {
      console.log(`🎉 Se encontraron ${deals.length} oferta(s)!\n`);
      deals.forEach((d) => {
        console.log(`  ${d.emoji || "✈️"} ${d.name}: USD ${d.price} (${d.date})${d.savings ? ` — ${d.savings}% off` : ""}`);
      });

      console.log("\n📱 Enviando alerta a Telegram...");
      await sendTelegramAlert(deals);
      console.log("✅ Mensaje enviado!");
    }
  } catch (err) {
    console.error("\n❌ Error:", err.message);
    if (err.message.includes("token")) {
      console.log("\n💡 Revisá tus credenciales de Amadeus en .env.local");
    }
  }
}

main();
