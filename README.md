# StreamDonations

Todas las donaciones de **Ceneka, YouTube (Super Chats), Twitch (Bits) y Kick (KICKs)** en un solo panel, con lectura en voz alta, sonidos y alertas para **OBS**.

## Descargar

Bajá el instalador de la última versión en **[Releases](../../releases/latest)** (`StreamDonations-Setup-X.Y.Z.exe`).
Desde la versión 2 es un programa propio (hecho con [Tauri](https://tauri.app)): **ya no necesita Google Chrome**. Usa WebView2, que viene con Windows 10 y 11 (si falta, el instalador lo baja solo). La app avisa sola cuando hay una versión nueva.

> Si Windows muestra "Windows protegió su PC", tocá **Más información → Ejecutar de todas formas**. El aviso desaparece a medida que más gente instala la app.

## Funciones

- Feed unificado o dividido por plataforma, con filtros, búsqueda e historial.
- Montos mínimos para mostrar, para OBS y para leer en voz alta.
- Modo OBS: temas, fondo con imagen o GIF, tamaños ajustables, menú por plataforma.
- Links limpios contra el "doxxing accidental" y aviso antes de abrir links acortados.
- Filtro de palabras prohibidas y usuarios bloqueados (también desde el nombre de cada donador).
- Estilos con efectos (serpiente, neón, degradado, guiones…) para donaciones grandes y rangos, con íconos propios.
- Fondo transparente para OBS (recorte por color), exportar a Excel (.csv), atajos de teclado.
- Sincronización entre dos PCs para streams de dos personas.
- Interfaz en español e inglés.
- Copia completa de la configuración y del historial.

## Política de firma de código / Code signing policy

Free code signing provided by [SignPath.io](https://about.signpath.io), certificate by [SignPath Foundation](https://signpath.org).

- **Autor, revisor y aprobador / Committers, reviewers and approvers:** [Chatran666](https://github.com/Chatran666)
- Solo se firman instaladores armados por GitHub Actions desde este repositorio, a partir del código publicado acá. Cada firma la aprueba el autor a mano.
- Only installers built by GitHub Actions from this repository's source are signed. Every signing request is approved manually.

## Privacidad / Privacy

La app no tiene servidor propio ni junta datos de uso. Qué se conecta y para qué: **[PRIVACY.md](PRIVACY.md)**.
This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it — see [PRIVACY.md](PRIVACY.md) for each connection.

## Licencia

[MIT](LICENSE).

## Créditos

Íconos Font Awesome Free (CC BY 4.0) · Tipografías Plus Jakarta Sans y JetBrains Mono (SIL OFL 1.1) · Socket.IO (MIT).
Algunos efectos de borde están inspirados en [OverlayGO!](https://github.com/techconchris/OverlayGO) de TechConChris (MIT).

La voz opcional "Daniela" (se baja aparte, desde la app) usa [Piper](https://github.com/rhasspy/piper) (MIT, con eSpeak NG bajo GPL 3) y la voz [es_AR-daniela](https://huggingface.co/rhasspy/piper-voices/tree/main/es/es_AR/daniela) de piper-voices, entrenada por larcanio con el corpus [OpenSLR 61](https://www.openslr.org/61/) (CC BY-SA 4.0).
StreamElements, Streamlabs, Ceneka, YouTube, Twitch y Kick son marcas de sus respectivos dueños; este proyecto no está afiliado a ellos.
