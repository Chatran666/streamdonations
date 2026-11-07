# StreamDonations

Todas las donaciones de **Ceneka, YouTube (Super Chats), Twitch (Bits) y Kick (KICKs)** en un solo panel, con lectura en voz alta, sonidos y alertas para **OBS**.

## Descargar

Bajá el instalador de la última versión en **[Releases](../../releases/latest)** (`StreamDonations-Setup-X.Y.Z.exe`).
Necesita **Google Chrome** instalado. La app avisa sola cuando hay una versión nueva.

> Windows puede mostrar "Windows protegió su PC" porque el instalador no está firmado: tocá **Más información → Ejecutar de todas formas**.

## Funciones

- Feed unificado o dividido por plataforma, con filtros, búsqueda e historial.
- Montos mínimos para mostrar, para OBS y para leer en voz alta.
- Modo OBS: temas, fondo con imagen o GIF, tamaños ajustables, menú por plataforma.
- Links limpios contra el "doxxing accidental" y aviso antes de abrir links acortados.
- Copia completa de la configuración y del historial.

## Publicar una versión nueva (para el autor)

1. Cambiá lo que haga falta en `app/`.
2. Escribí qué cambió en `build/notas.txt`.
3. Subí el número de `version` en `package.json` (por ejemplo de `1.6.0` a `1.6.1`).

Al subir esos cambios a `main`, GitHub arma el instalador, lo publica en Releases y actualiza `latest.json` en la rama `actualizaciones`. Las apps instaladas muestran el aviso en la próxima apertura (o en menos de 6 horas si están abiertas).

Actualización obligatoria (opcional): poné el número mínimo en `build/version-minima.txt`; quien tenga una versión menor no puede posponer el aviso.

## Créditos

Íconos Font Awesome Free (CC BY 4.0) · Tipografías Plus Jakarta Sans y JetBrains Mono (SIL OFL 1.1) · Socket.IO (MIT).
StreamElements, Streamlabs, Ceneka, YouTube, Twitch y Kick son marcas de sus respectivos dueños; este proyecto no está afiliado a ellos.
