# Publicar una versión nueva

1. Cambiá lo que haga falta en `app/`.
2. Escribí qué cambió en `build/notas.txt` (lo que se ve en la página de la versión en GitHub) y agregá la misma sección **arriba de todo** en `build/historial.txt`, con el título `Novedades de la X.Y.Z:`. La app muestra, de ese historial, solo las versiones que le faltan a cada persona.
3. Subí el número de `version` en `package.json`:
   - Cambios normales: de a uno en el último número (`2.0.0` → `2.0.1` → `2.0.2`…).
   - Cambio grande: el del medio (`2.0.x` → `2.1.0`).
   - Versión de prueba que no avisa a nadie: con guion (`2.0.1-beta.1`).

Al subir esos cambios a `main`, GitHub arma el instalador, lo publica en Releases y actualiza `latest.json` en la rama `actualizaciones`. Las apps instaladas muestran el aviso en la próxima apertura (o en menos de 6 horas si están abiertas).

Actualización obligatoria (opcional): poné el número mínimo en `build/version-minima.txt`; quien tenga una versión menor no puede posponer el aviso.
