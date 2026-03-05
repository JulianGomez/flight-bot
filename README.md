# ✈️ Flight Deal Bot — Alertas de Vuelos Baratos desde Argentina

Bot gratuito que monitorea vuelos desde Buenos Aires hacia destinos locales e internacionales y te avisa por Telegram cuando aparece una oferta real con link directo para comprar.

**100% gratuito** usando: Travelpayouts/Aviasales API + Render (cron jobs gratis) + Telegram Bot API (gratis).

---

## 📦 Estructura del proyecto

```
flight-bot/
├── api/
│   ├── cron.js          ← Endpoint HTTP (legacy Vercel)
│   └── status.js        ← Endpoint para ver el estado del bot
├── lib/
│   └── flightSearch.js  ← Lógica de búsqueda y alertas (multi-proveedor)
├── scripts/
│   ├── test.js          ← Para testear localmente
│   └── test-telegram.js ← Para testear solo Telegram
├── run.js               ← Entrypoint para Render Cron Job
├── .env.example         ← Plantilla de variables de entorno
├── vercel.json          ← Config legacy
└── package.json
```

---

## 🔌 Proveedores de vuelos soportados

| Proveedor | Estado | Límite | Links de compra |
|-----------|--------|--------|-----------------|
| **Travelpayouts / Aviasales** | ✅ Principal | 200 req/hora | ✅ Con marker de afiliado |
| **Amadeus** | 🔧 Dev/fallback | 2.000/mes (cierra jul 2026) | ❌ No incluye |

Elegís el proveedor con `FLIGHT_PROVIDER=travelpayouts` o `FLIGHT_PROVIDER=amadeus` en `.env.local`.

---

## 🧠 Lógica de orígenes inteligentes

El bot elige automáticamente desde qué aeropuerto buscar según el tipo de destino:

| Tipo | Destinos ejemplo | Orígenes que consulta |
|------|-----------------|----------------------|
| Nacional | MDZ, BRC, IGR, USH | EZE + AEP |
| Europa | MAD, LIS, CDG, FCO | EZE + SCL + GRU |
| EEUU/México | MIA, JFK, CUN | EZE + SCL |
| Latam | LIM, BOG, GRU | Solo EZE |

Si encuentra un vuelo más barato saliendo desde Santiago o San Pablo, lo indica en el mensaje de Telegram.

---

## 🚀 Setup paso a paso

### 1️⃣ Registrarte en Travelpayouts (5 min)

1. Ir a **app.travelpayouts.com** → Sign Up (gratis, sin tarjeta)
2. Ir a **Programs → Aviasales** → Click en **"Join program"**
3. Ir a tu **Perfil → API token** → copiar el token
4. Tu **Marker** (ID de afiliado) lo ves abajo a la izquierda del dashboard

> Los links que genera el bot incluyen tu marker automáticamente. Cada compra que haga alguien a través de esos links te genera comisiones (40% del ingreso de Aviasales, cookie de 30 días).

---

### 2️⃣ Crear el bot de Telegram (3 min)

1. Abrir Telegram → buscar **@BotFather**
2. Enviar `/newbot` → seguir los pasos → copiar el **token**
3. Mandarle un mensaje a tu nuevo bot
4. Abrir en el navegador (reemplazando con tu token):
   ```
   https://api.telegram.org/bot<TU_TOKEN>/getUpdates
   ```
5. Copiar el campo `"id"` dentro de `"chat"` → ese es tu **Chat ID**

---

### 3️⃣ Configurar las variables de entorno

Copiar `.env.example` como `.env.local`:

```bash
cp .env.example .env.local
```

Completar `.env.local` con tus datos:

```env
# Proveedor principal
FLIGHT_PROVIDER=travelpayouts

# Travelpayouts
TRAVELPAYOUTS_TOKEN=tu_token_aqui
TRAVELPAYOUTS_MARKER=tu_marker_aqui

# Amadeus (solo para desarrollo/fallback)
AMADEUS_API_KEY=tu_client_id
AMADEUS_API_SECRET=tu_client_secret

# Telegram
TELEGRAM_BOT_TOKEN=123456789:ABCdef...
TELEGRAM_CHAT_ID=123456789

# Configuración
MAX_PRICE_USD=9999
DISCOUNT_THRESHOLD=0.20
CRON_SECRET=cualquier_clave_random
```

**Destinos** en la variable `DESTINATIONS` (una sola línea, sin saltos):

```env
DESTINATIONS=[{"code":"MAD","name":"Madrid","emoji":"🇪🇸","maxPrice":650},{"code":"MIA","name":"Miami","emoji":"🇺🇸","maxPrice":450}]
```

**Códigos IATA útiles desde Argentina:**

| Ciudad | Código | Precio promedio |
|--------|--------|----------------|
| Madrid | MAD | ~USD 900-1100 |
| Lisboa | LIS | ~USD 900-1100 |
| Miami | MIA | ~USD 500-700 |
| Nueva York | JFK | ~USD 600-800 |
| París | CDG | ~USD 900-1200 |
| Lima | LIM | ~USD 200-350 |
| Santiago | SCL | ~USD 80-150 |
| San Pablo | GRU | ~USD 120-200 |
| Cancún | CUN | ~USD 400-600 |
| Mendoza | MDZ | ~USD 50-80 |
| Bariloche | BRC | ~USD 60-100 |
| Iguazú | IGR | ~USD 60-100 |

---

### 4️⃣ Testear localmente

```bash
# Test completo (búsqueda + Telegram)
node scripts/test.js

# Test solo Telegram (sin llamar a la API de vuelos)
node scripts/test-telegram.js
```

Si todo está bien verás las ofertas en consola y recibirás un mensaje en Telegram con links de compra incluidos.

---

### 5️⃣ Deploy en Render (recomendado, gratuito)

**Render** es la opción recomendada — soporta cron jobs nativos sin limitación de frecuencia en el free tier.

```bash
# 1. Subir el proyecto a GitHub
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/tuusuario/flight-bot.git
git push -u origin main
```

Luego en **render.com**:
1. Sign Up con tu cuenta de GitHub
2. New + → **Cron Job**
3. Conectar tu repo `flight-bot`
4. Configurar:
   - **Start Command**: `node run.js`
   - **Schedule**: `0 */6 * * *` (cada 6 horas)
   - **Instance Type**: Free
5. En **Environment Variables** cargar todas las variables del `.env.local`
6. Click en **"Create Cron Job"**

Desde ese momento el bot corre solo cada 6hs, sin necesidad de tener nada abierto en tu máquina.

---

### Hacer cambios y redesployar

Cada vez que pusheás a GitHub, Render redeploya automáticamente:

```bash
git add .
git commit -m "descripción del cambio"
git push
```

Para pausar el bot temporalmente: Render dashboard → tu cron job → **"Suspend"**.

---

## ⏰ Schedule del cron

Ejemplos de configuración:

| Schedule | Frecuencia |
|----------|-----------|
| `0 */6 * * *` | Cada 6 horas ✅ recomendado |
| `0 */12 * * *` | Cada 12 horas |
| `0 8,20 * * *` | A las 8am y 8pm UTC |

---

## 📱 Ejemplo de mensaje en Telegram

```
✈️ 3 OFERTAS DETECTADAS desde Argentina

🇪🇸 Lisboa (LIS)
   💵 USD 538 (17% bajo el precio máximo)
   📅 Salida: 2026-04
   ✈️ Directo
   🛫 Aerolínea: DT
   🔀 Sale desde San Pablo 🇧🇷
   🔗 Comprar vuelo aquí

🇺🇸 Miami (MIA)
   💵 USD 346 (23% bajo el precio máximo)
   📅 Salida: 2026-04
   ✈️ Directo
   🛫 Aerolínea: H2
   🔀 Sale desde Santiago 🇨🇱
   🔗 Comprar vuelo aquí

Buscado: 4/3/2026, 02:03:45
```

---

## 💡 Tips para encontrar más ofertas

1. Bajá `maxPrice` en cada destino para recibir alertas más frecuentes
2. Agregá más destinos — los vuelos a ciudades secundarias suelen tener mejores precios
3. Temporadas bajas: mayo-junio y agosto-septiembre tienen mejores precios a Europa
4. Si sale más barato desde SCL o GRU, el bot lo indica y el link ya apunta al vuelo correcto

---

## 🐛 Troubleshooting

**"Falta TRAVELPAYOUTS_TOKEN"**
→ Verificar que `TRAVELPAYOUTS_TOKEN` esté en `.env.local` y que hayas copiado el token correcto desde tu perfil de Travelpayouts.

**El bot corre pero no manda mensajes a Telegram**
→ Verificar `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID`. Asegurate de haberle mandado al menos un mensaje al bot antes de obtener el Chat ID.

**No encuentra ofertas**
→ Bajá `maxPrice` en los destinos del JSON o cambiá `DISCOUNT_THRESHOLD` a `0.05`.

**El JSON de DESTINATIONS da error**
→ Asegurate de que esté todo en una sola línea sin saltos en `.env.local`.

**"marker is not subscribed to campaign"**
→ Tenés que unirte primero al programa de Aviasales en Travelpayouts: app.travelpayouts.com/programs/100/about
