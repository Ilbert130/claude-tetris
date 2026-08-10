---
name: clima
description: Obtiene el clima actual de una ciudad indicada como argumento (o detectándola por IP si no se da ninguna), usando APIs públicas gratuitas sin necesidad de API key. Úsalo cuando el usuario pida el clima, temperatura, pronóstico o condiciones actuales, ej. "/clima Madrid".
---

# Skill: Clima

Obtiene el clima actual usando dos APIs públicas gratuitas (sin API key):

1. **Geocodificación** — `open-meteo.com` (geocoding) si se da una ciudad como argumento, o **Geolocalización por IP** — `ip-api.com` si no se da ninguna
2. **Clima** — `open-meteo.com`

## Pasos

0. Revisar si el usuario pasó un argumento con el comando (ej. `/clima Madrid`, `/clima Ciudad de México`).

   - **Si se pasó una ciudad como argumento**, úsala directamente y ve al paso 1b (geocodificación), sin usar `ip-api.com`.
   - **Si no se pasó ningún argumento**, sigue con el paso 1a (geolocalización por IP).

1a. Detectar la ubicación aproximada del usuario a partir de su IP pública:

   ```
   GET http://ip-api.com/json/
   ```

   La respuesta incluye `lat`, `lon`, `city`, `regionName`, `country`.

   - Usa la herramienta `WebFetch` para esta petición (no `curl` vía Bash, ya que puede no estar disponible o bloqueado).
   - Si esta petición falla (sin red, IP no geolocalizable, bloqueo del servicio, etc.), informa al usuario que no se pudo detectar la ubicación automáticamente y pídele que vuelva a invocar el comando con una ciudad como argumento (ej. `/clima Bogotá`).

1b. Si el usuario dio una ciudad como argumento, pedir sus coordenadas a la API de geocodificación de Open-Meteo:

   ```
   GET https://geocoding-api.open-meteo.com/v1/search?name={ciudad}&count=1&language=es
   ```

   - Usa `WebFetch`.
   - Usa `latitude`/`longitude`/`name`/`admin1`/`country` del primer resultado.
   - Si no hay resultados, informa al usuario que no se encontró la ciudad y pídele que revise el nombre o pruebe con otro (ej. incluyendo el país).

2. Con `lat`/`lon` obtenidos (de 1a o 1b), pedir el clima actual a Open-Meteo:

   ```
   GET https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&timezone=auto
   ```

   - Usa `WebFetch` de nuevo.
   - El campo `current.weather_code` es un código WMO; tradúcelo a una descripción legible (ver tabla abajo).

3. Presentar al usuario un resumen breve y claro:

   - Ciudad/región detectada (de `ip-api.com`)
   - Condición actual (descripción del `weather_code`)
   - Temperatura y sensación térmica
   - Humedad, viento, precipitación si son relevantes

   No muestres el JSON crudo ni los detalles internos de las peticiones — solo el resumen.

## Tabla de códigos WMO (weather_code) más comunes

| Código | Descripción |
|---|---|
| 0 | Cielo despejado |
| 1, 2, 3 | Parcialmente nublado / nublado |
| 45, 48 | Niebla |
| 51, 53, 55 | Llovizna (ligera/moderada/densa) |
| 61, 63, 65 | Lluvia (ligera/moderada/fuerte) |
| 71, 73, 75 | Nieve (ligera/moderada/fuerte) |
| 80, 81, 82 | Chubascos (ligeros/moderados/violentos) |
| 95 | Tormenta eléctrica |
| 96, 99 | Tormenta con granizo |

## Notas

- Si el usuario menciona una ciudad explícitamente en su mensaje (aunque no la haya pasado como argumento del comando), trátala igual que un argumento: usa geocodificación (paso 1b), no `ip-api.com`.
- Ambas APIs son gratuitas y no requieren autenticación ni API key.
- Esta skill no tiene relación con el juego de Tetris del resto del repositorio; es una utilidad independiente disponible en este proyecto.
