# Publicar una versión nueva

1. Cambiá lo que haga falta en `app/`.
2. Escribí qué cambió en `build/notas.txt` (lo que se ve en la página de la versión en GitHub) y agregá la misma sección **arriba de todo** en `build/historial.txt`, con el título `Novedades de la X.Y.Z:`. La app muestra, de ese historial, solo las versiones que le faltan a cada persona.
3. Subí el número de `version` en `package.json` (por ejemplo de `1.6.0` a `1.6.1`).

Al subir esos cambios a `main`, GitHub arma el instalador, lo publica en Releases y actualiza `latest.json` en la rama `actualizaciones`. Las apps instaladas muestran el aviso en la próxima apertura (o en menos de 6 horas si están abiertas).

Actualización obligatoria (opcional): poné el número mínimo en `build/version-minima.txt`; quien tenga una versión menor no puede posponer el aviso.
