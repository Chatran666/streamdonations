# Política de privacidad / Privacy policy

*Última actualización / Last updated: noviembre 2026*

## Español

StreamDonations es una app que corre en tu PC. **No tiene servidor propio, no crea cuentas y no junta estadísticas de uso.** Todo lo que guarda (configuración, tokens, historial de donaciones, imágenes y sonidos elegidos) queda **solo en tu PC**, dentro del perfil de Chrome que usa la app (`%LOCALAPPDATA%\StreamDonations\perfil`).

La app se conecta solo a estos servicios, y solo para lo que se indica:

| Servicio | Cuándo | Qué se envía |
|---|---|---|
| **StreamElements** (astro.streamelements.com, api.streamelements.com) | Si cargás un token de StreamElements | Tu token, para recibir tus donaciones en vivo y (si está activado "Recuperar las donaciones que llegaron con la app cerrada") pedir las que entraron mientras estaba cerrada. |
| **Streamlabs** (sockets.streamlabs.com) | Si cargás un token de Streamlabs | Tu token, para recibir tus donaciones en vivo. |
| **ntfy.sh** | Solo si activás "Sincronizar con otra PC" | El código de sincronización y los **códigos internos** de las donaciones marcadas como leídas o restauradas. **Nunca** nombres, montos, mensajes ni tokens. Se apaga con "Dejar de sincronizar". |
| **GitHub** (raw.githubusercontent.com, gist.githubusercontent.com, github.com) | Al abrir la app y cada algunas horas | Una consulta para saber si hay una versión nueva, y la descarga del instalador si tocás "Descargar". No se envían datos tuyos (GitHub ve tu dirección IP, como cualquier sitio). |
| **OBS Studio en tu misma PC** (127.0.0.1) | Solo si activás "Modo transparente real" | Las donaciones que se muestran en OBS, tu contraseña del servidor WebSocket de OBS. Nunca sale de tu PC. |
| **Google** (voces "Google …" de Chrome) | Solo si elegís una voz de Google para leer en voz alta | Chrome manda a Google el texto a leer (nombre, monto y mensaje de la donación). Las voces de Windows y las incluidas funcionan sin internet. |
| **Sitios de los links** | Solo si abrís un link de un mensaje | Se abre en el navegador, como cualquier link. |

Las fotos de perfil de los donadores se cargan desde las direcciones que manda StreamElements/Streamlabs.

**Cómo borrar todo:** Opciones → Restablecer → "Restablecer de fábrica", o desinstalar la app (borra la carpeta y el perfil).

Consultas: mrlasheras@gmail.com

## English

StreamDonations runs on your PC. **It has no server of its own, creates no accounts and collects no usage statistics.** Everything it stores (settings, tokens, donation history, chosen images and sounds) stays **only on your PC**, inside the Chrome profile the app uses (`%LOCALAPPDATA%\StreamDonations\perfil`).

The app only connects to these services, and only for the stated purpose:

| Service | When | What is sent |
|---|---|---|
| **StreamElements** | If you enter a StreamElements token | Your token, to receive your donations live and (if "Recover donations that arrived while the app was closed" is on) fetch the ones received while it was closed. |
| **Streamlabs** | If you enter a Streamlabs token | Your token, to receive your donations live. |
| **ntfy.sh** | Only if you turn on "Sync with another PC" | The sync code and the **internal IDs** of donations marked as read or restored. **Never** names, amounts, messages or tokens. |
| **GitHub** | When the app opens and every few hours | A request to check for a new version, and the installer download if you click "Download". No personal data is sent (GitHub sees your IP address, like any website). |
| **OBS Studio on your own PC** (127.0.0.1) | Only if you turn on "Real transparent mode" | The donations shown in OBS and your OBS WebSocket password. Never leaves your PC. |
| **Google** (Chrome "Google …" voices) | Only if you choose a Google voice for read-aloud | Chrome sends Google the text to be read (donor name, amount and message). Windows and built-in voices work offline. |
| **Link websites** | Only if you open a link from a message | It opens in the browser like any link. |

**To delete everything:** Settings → Reset → "Factory reset", or uninstall the app.

Contact: mrlasheras@gmail.com
