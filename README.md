# ✈️ Flight Deal Bot — Alertas de Vuelos Baratos desde Argentina

Bot gratuito que monitorea vuelos desde Buenos Aires (EZE) hacia destinos locales e
internacionales y te avisa por Telegram cuando aparece una oferta real.

**100% gratuito** usando: Amadeus API (free tier) + Vercel (cron jobs gratis) + Telegram Bot API (gratis).

---

## 📦 Estructura del proyecto

```
flight-bot/
├── api/
│   ├── cron.js          ← Vercel lo llama automáticamente cada 6hs
│   └── status.js        ← Endpoint para ver el estado del bot
├── lib/
│   └── flightSearch.js  ← Lógica de búsqueda y alertas
├── scripts/
│   └── test.js          ← Para testear localmente
├── .env.example         ← Plantilla de variables de entorno
├── vercel.json          ← Config del cron job
└── package.json
```

---

## 🚀 Setup paso a paso

### 1️⃣ Obtener credenciales de Amadeus (5 min)

1. Ir a **https://developers.amadeus.com** → Sign Up (gratis)
2. Crear una nueva aplicación
3. Copiar **Client ID** y **Client Secret**
4. El plan gratuito incluye:
   - 2.000 llamadas/mes en **producción**
   - Datos reales de vuelos ✅
   - Sin tarjeta de crédito ✅

> **Importante**: En `lib/flightSearch.js` hay una constante `AMADEUS_BASE`.
> Para desarrollo usá `https://test.api.amadeus.com`.
> Para producción (datos reales) cambiala a `https://api.amadeus.com`.

---

### 2️⃣ Crear el bot de Telegram (3 min)

1. Abrir Telegram y buscar **@BotFather**
2. Enviar `/newbot`
3. Seguir los pasos → te da un **token** tipo `123456789:ABCdef...`
4. Buscar tu nuevo bot y enviarle un mensaje (cualquier cosa)
5. Abrir en el navegador:
   ```
   https://api.telegram.org/bot<TU_TOKEN>/getUpdates
   ```
6. Buscar el campo `"id"` dentro de `"chat"` → ese es tu **Chat ID**

---

### 3️⃣ Configurar las variables de entorno

Copiar `.env.example` como `.env.local`:

```bash
cp .env.example .env.local
```

Editar `.env.local` con tus datos:

```env
AMADEUS_API_KEY=tu_client_id
AMADEUS_API_SECRET=tu_client_secret
TELEGRAM_BOT_TOKEN=123456789:ABCdef...
TELEGRAM_CHAT_ID=123456789
ORIGIN_AIRPORT=EZE
MAX_PRICE_USD=9999
DISCOUNT_THRESHOLD=0.20
CRON_SECRET=cualquier_clave_random
```

**Configurar destinos** en la variable `DESTINATIONS` (ya viene con ejemplos).
Podés agregar/quitar destinos con su código IATA y precio máximo en USD:

```json
[
  {"code":"MAD","name":"Madrid","emoji":"🇪🇸","maxPrice":650},
  {"code":"MIA","name":"Miami","emoji":"🇺🇸","maxPrice":450}
]
```

**Códigos IATA útiles desde Argentina:**

| Ciudad | Código | Precio promedio desde EZE |
|--------|--------|--------------------------|
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

---

### 4️⃣ Testear localmente

```bash
node scripts/test.js
```

Si todo está bien verás las ofertas en consola y recibirás un mensaje en Telegram.

---

### 5️⃣ Deploy en Vercel (gratuito)

#### Opción A: Desde GitHub (recomendada)

```bash
# 1. Crear repo en GitHub y subir el proyecto
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/tuusuario/flight-bot.git
git push -u origin main

# 2. Ir a vercel.com → New Project → importar tu repo
# 3. En "Environment Variables" cargar todas las del .env.example
# 4. Deploy!
```

#### Opción B: Desde la CLI

```bash
npm install -g vercel
vercel login
vercel --prod
# Cargar las env vars cuando te las pida o desde el dashboard
```

---

### 6️⃣ Cargar las variables en Vercel

En el dashboard de Vercel:
1. Settings → Environment Variables
2. Agregar cada variable del `.env.example`
3. Redeploy para que tomen efecto

---

## ⏰ ¿Cuándo corre el bot?

El `vercel.json` configura el cron para que corra **cada 6 horas**:

```json
{
  "crons": [{
    "path": "/api/cron",
    "schedule": "0 */6 * * *"
  }]
}
```

Podés cambiarlo. Ejemplos de schedules:
- Cada 6hs: `0 */6 * * *`
- Cada 12hs: `0 */12 * * *`
- Una vez por día a las 8am UTC-3: `0 11 * * *`

> **Límite del plan gratuito de Vercel**: 2 cron jobs, máximo 1 ejecución por día en el plan Hobby. Para más frecuencia, el plan Pro cuesta USD 20/mes.

---

## 📊 Endpoints disponibles

Una vez deployado:

| URL | Descripción |
|-----|-------------|
| `https://tu-app.vercel.app/api/status` | Estado del bot y configuración |
| `https://tu-app.vercel.app/api/status?search=1` | Búsqueda manual de prueba |
| `https://tu-app.vercel.app/api/cron?secret=TU_SECRET` | Disparar búsqueda manualmente |

---

## 💡 Tips para encontrar más ofertas

1. **Bajá el `DISCOUNT_THRESHOLD`** a `0.10` (10%) para recibir más alertas
2. **Configurá `maxPrice`** por destino en lugar de usar el threshold automático
3. **Agregá más destinos** — los vuelos a ciudades secundarias suelen tener más promociones
4. **Temporadas bajas**: mayo-junio y agosto-septiembre suelen tener mejores precios a Europa

---

## 🛑 Límites del plan gratuito de Amadeus

- 2.000 llamadas API/mes en producción
- Con ~18 destinos × 8 fechas = 144 llamadas por ejecución
- A 4 ejecuciones/día = 576 llamadas/día → te quedás sin cuota en ~3 días

**Solución recomendada**: Correr el bot **2 veces por día** (con el cron de Vercel) y reducir
los destinos a los 8-10 que más te interesen.

---

## 🐛 Troubleshooting

**"No se pudo obtener token de Amadeus"**
→ Verificar AMADEUS_API_KEY y AMADEUS_API_SECRET. Asegurate de estar usando el endpoint correcto (test vs prod).

**El bot corre pero no manda mensajes**
→ Verificar TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID. Asegurate de haberle mandado un mensaje al bot antes.

**No encuentra ofertas**
→ Probá bajando DISCOUNT_THRESHOLD a 0.05 o poniendo maxPrice manualmente más alto en cada destino del JSON.

**Error 429 (rate limit)**
→ Amadeus está limitando las llamadas. Reducí la cantidad de destinos o aumentá el `sleep()` en `flightSearch.js`.
