# StreamDonations

Todas las donaciones de **Ceneka, YouTube (Super Chats), Twitch (Bits) y Kick (KICKs)** en un solo panel, con lectura en voz alta, sonidos y alertas para **OBS**.

## Descargar

Bajá el instalador de la última versión en **[Releases](../../releases/latest)** (`StreamDonations-Setup-X.Y.Z.exe`).
Necesita **Google Chrome** instalado. La app avisa sola cuando hay una versión nueva.

> Si Windows muestra "Windows protegió su PC", tocá **Más información → Ejecutar de todas formas**. El aviso desaparece a medida que más gente instala la app.

## Funciones

- Feed unificado o dividido por plataforma, con filtros, búsqueda e historial.
- Montos mínimos para mostrar, para OBS y para leer en voz alta.
- Modo OBS: temas, fondo con imagen o GIF, tamaños ajustables, menú por plataforma.
- Links limpios contra el "doxxing accidental" y aviso antes de abrir links acortados.
- Filtro de palabras prohibidas y usuarios bloqueados.
- Fondo transparente para OBS (recorte por color), exportar a Excel (.csv), atajos de teclado.
- Sincronización entre dos PCs para streams de dos personas.
- Interfaz en español e inglés.
- Copia completa de la configuración y del historial.

## Publicar una versión nueva (para el autor)

1. Cambiá lo que haga falta en `app/`.
2. Escribí qué cambió en `build/notas.txt`.
3. Subí el número de `version` en `package.json` (por ejemplo de `1.6.0` a `1.6.1`).

Al subir esos cambios a `main`, GitHub arma el instalador, lo publica en Releases y actualiza `latest.json` en la rama `actualizaciones`. Las apps instaladas muestran el aviso en la próxima apertura (o en menos de 6 horas si están abiertas).

Actualización obligatoria (opcional): poné el número mínimo en `build/version-minima.txt`; quien tenga una versión menor no puede posponer el aviso.

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
StreamElements, Streamlabs, Ceneka, YouTube, Twitch y Kick son marcas de sus respectivos dueños; este proyecto no está afiliado a ellos.
