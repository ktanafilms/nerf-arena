# Nerf Arena

App árbitro para partidas de Nerf a 2 jugadores, con un móvil cada uno. Es una web instalable (PWA): se abre en Safari o Chrome, sin cuentas ni tiendas.

## Cómo jugar

1. Abrid la web en los dos móviles.
2. Uno pulsa **Crear partida**. El otro escanea el QR con la cámara o escribe el código de 4 letras en **Unirse**.
3. Elegid el modo, pulsad **¡Listo!** los dos y empieza la cuenta atrás.
4. Durante la partida:
   - Voz: «[tu nombre], tocado / estado / pausa / seguir / anular».
   - Plan B táctil: **doble toque** = tocado, **mantener pulsado** = anular. El botón de pausa siempre está visible.
   - Desde la pausa se puede **terminar la partida** a medias (pide dos toques) y volver a elegir modo.
   - **Cascos como mando** (lobby › Cascos): 1 toque del botón de reproducir/pausar = tocado («mía» en Tiro al blanco), 2 toques = estado, 3 toques = anular. Los botones de volumen no los puede leer ninguna web; en muchos cascos Bluetooth, mantener + o − salta de pista y eso sí llega (2 o 3 toques).
5. Para instalarla como app:
   - **iPhone**: Safari › Compartir › Añadir a pantalla de inicio.
   - **Android**: Chrome › menú › Instalar app.

**Modo prueba**: «Probar en un solo móvil» crea un rival simulado (bot) con botones para que haga de segundo jugador.

## Formas de jugar y de conectarse

- **Dos móviles (lo normal):** la app intenta a la vez la conexión **directa** entre móviles (la más rápida) y un **respaldo por servidor** (mensajería pública MQTT). Si la wifi bloquea la directa, la partida va sola por el respaldo, también con datos móviles. El respaldo usa tres servidores a la vez, así que basta con que uno funcione; las órdenes que no llegan se reenvían solas. En el lobby, la etiqueta de conexión indica qué ruta se usa y qué hacer si falla.
- **Punto de acceso:** uno comparte internet y el otro se conecta a esa wifi. Es lo más fiable fuera de casa.
- **Un móvil para los dos:** un único móvil hace de árbitro y entiende los dos nombres. Cada jugador tiene sus botones en pantalla. **No necesita ninguna red:** tras abrir la web una vez con internet, queda guardada en el móvil y abre sin conexión.
- **Bluetooth / AirDrop:** no son posibles. Safari no deja a las webs usar Bluetooth, y AirDrop solo envía archivos.

## Modos

| Modo | En una frase | Órdenes |
|---|---|---|
| Duelo | Vidas para cada uno; gana quien deje al otro sin ninguna. | tocado |
| Juego de armas | Cada acierto te sube de nivel (6 niveles); gana quien acierta desde el 6. | tocado |
| Bomba | El portador se la quita de encima dándote; pierde quien la tenga al explotar. | tocado |
| Cazador y presa | La presa aguanta escondida (su móvil pita); luego se cambian los papeles. | tocado (la presa) |
| Buscar y destruir | El atacante esconde su móvil-bomba; el otro lo desactiva manteniendo 5 s. | tocado (quien desactiva) |
| Tiro al blanco | La app canta una lata; quien la tumbe antes dice «mía». | mía · bomba |

En todos: «estado», «pausa», «seguir» y «anular» (deshace tu última acción en 5 s, sin tocar lo que haya hecho el rival entretanto).

## Vídeo del HUD para montar

Al terminar una partida, **Vídeo del HUD** genera en el propio móvil un `.mov` con **fondo transparente**:

- Marcador de retransmisión con nombres, iconos y puntuación.
- Reloj de partida y rótulos de cada jugada (impactos, niveles, bomba pasada, rondas…).
- Cuenta atrás 3-2-1-¡YA! y tarjeta final con el ganador.
- Formatos: horizontal 1920×1080 o vertical 1080×1920, a 30 fps.
- Empieza 3 s antes del ¡YA!: el pitido de claqueta cae justo en el segundo 3.
- Códec PNG con canal alfa: se abre en Premiere, Final Cut, DaVinci Resolve y After Effects. Ponlo en una pista encima del vídeo de la cámara.
- En iPhone, guárdalo con «Guardar en Archivos» o pásalo por AirDrop. Si lo guardas en Fotos, se pierde la transparencia.

## Rivales y guerra diaria

Con una cuenta (nombre + código de acceso, sin contraseñas ni correos) se le declara la rivalidad a otro jugador. Cada día, a una hora al azar entre las 10:00 y las 21:00 (hora de España), os llega a los dos una notificación: **guerra hasta medianoche**. El primero que reciba un dardo paga el kebab.

- «Me ha dado» cuenta al momento. «Le he dado» lo tiene que confirmar el otro (si no contesta en 15 min, cuenta).
- La app lleva la cuenta de kebabs pendientes; el que cobra marca «Me ha pagado uno».
- Notificaciones: en Android, Chrome; en iPhone, solo con la app añadida a la pantalla de inicio (iOS 16.4 o posterior).
- El servidor está en `server/` (Cloudflare Workers + D1, plan gratuito). Para publicarlo: `cd server && npx wrangler login && npm run publish`.

## Vídeo de toda la sesión

En «Para el vídeo», si habéis hecho revanchas, se elige **Esta partida** o **Toda la sesión**: un solo `.mov` y un solo archivo de marcadores con todas las partidas.

- **Hora real:** cada partida cae a su hora y los descansos quedan transparentes. Casa con una grabación larga sin cortes.
- **Seguidas:** una detrás de otra, sin descansos. Cada partida conserva su ¡YA! para sincronizar.
- En el **Historial**, «Vídeo del día» junta todas las partidas de ese día.
- Tamaño orientativo: unos 13 MB por minuto de juego (los descansos no ocupan).

## Historial, marcadores y modo grabación

- **Historial:** cada partida terminada se guarda en el móvil (las 40 últimas). Desde ahí se puede sacar después el vídeo del HUD o los marcadores.
- **Marcadores:** XML para Premiere (Archivo › Importar), EDL para DaVinci (Marcadores › Importar EDL) y CSV. Cuentan desde el inicio del vídeo del HUD.
- **Modo grabación** (en el lobby): la partida solo muestra lo que aporta en vídeo, con el reloj grande.
- **Extras** de Duelo y Juego de armas: eventos sorpresa (recarga libre, ¡congelados!, dardo dorado) y racha UAV.
- **Voz del narrador:** se elige en «Probar voz».

## Sincronizar con vuestras cámaras

- En el **¡YA!** de cada partida, los dos móviles hacen a la vez un **destello blanco y un pitido fuerte** (la claqueta). En la edición, alinead el audio de las cámaras con ese pitido.
- Al terminar, **Copiar tiempos** copia la línea de tiempo. Los tiempos son reales desde el ¡YA!, con las pausas incluidas, para que casen con el vídeo.
- La esquina superior muestra **⏺ reloj de partida** con décimas, siempre visible en la grabación de pantalla.

## Desarrollo

```bash
npm install
npm run dev        # http://localhost:5173 (en el Mac)
npm run build      # genera dist/
npm run preview    # sirve dist/ (aquí sí se activa el modo sin conexión)
```

Para probar en los móviles sin publicar hace falta HTTPS por el micrófono. Lo más sencillo es publicar (ver abajo).

## Publicar gratis (GitHub Pages, con HTTPS)

`npm run deploy` compila y sube la web a la rama `gh-pages`, que GitHub publica en
`https://<usuario>.github.io/<repo>/`.

## Arquitectura

- **Svelte 5 + TypeScript + Vite**. La web es estática y no necesita servidor propio.
- **WebRTC entre los móviles (PeerJS)**. El broker público gratuito de PeerJS solo se usa para que los móviles se encuentren; después la conexión es directa.
  - El móvil que crea la sala hace de árbitro (`src/lib/engine/room.ts`). Valida las órdenes, descarta duplicados (pausa o seguir desde los dos móviles) y sincroniza los relojes con pings.
  - Fuera de casa, si los dos usáis datos móviles y no conectan, que uno comparta internet al otro (punto de acceso).
- **Voz**: Web Speech API (`src/lib/voice`). Solo cuenta tu nombre (o cómo lo transcribe tu móvil, aprendido en la prueba de voz) seguido de una orden. Lo que se oye mientras habla el narrador se descarta.
- **Sonidos**: todos sintetizados con Web Audio (`src/lib/audio/sfx.ts`), sin archivos.

## Voz sin Siri: reconocedor propio

Si el reconocimiento de voz del móvil no está disponible (en iPhone pasa si iOS no deja a Safari usarlo: error `service-not-allowed`), la app cambia sola a un **reconocedor propio que funciona dentro del móvil**:

- Motor: [vosk-browser](https://github.com/ccoreilly/vosk-browser) (Apache 2.0).
- Modelo: `vosk-model-small-es-0.42` de [Vosk / Alpha Cephei](https://alphacephei.com/vosk/models) (Apache 2.0), en `public/models/vosk-es.tar.gz`.
- Pesa 40 MB y se descarga una sola vez, con barra de progreso. Después funciona sin internet.
- El motor se puede cambiar a mano en **Probar voz › Motor**.

## Créditos

- Modelo 3D «NERF Retaliator» de ThimovanNimwegen ([Sketchfab](https://sketchfab.com/3d-models/nerf-retaliator-b119e1463d8f4031aaacd69b03ff5976)), CC BY 4.0. Texturas reducidas y convertidas a WebP.
- Modelo de voz en español de Vosk (Apache 2.0).
