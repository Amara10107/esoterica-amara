# Cambios v2.1

- **Logo nuevo** (círculo dorado, fondo transparente) en web, escritorio, móvil, ícono de la app y ticket (versión en escala de grises para impresora térmica). Más pequeño en el inicio de la app, la web, el escritorio y en el ticket (14 mm en papel de 58 mm, 18 mm en 80 mm).
- **Terminales en una o dos sucursales**: `branchIds` en la terminal (`branchId` sigue siendo la principal). Web: formulario con casillas de sucursal, botones **Ver**, **Editar** y **Desconectar**. Móvil administrador: pantalla **Terminales** (Más → Gerencia). Una terminal solo sincroniza, vende y abre caja en las sucursales que tenga marcadas.
- **Teléfono como escáner**: el vendedor necesita un token con propósito `escaner` (o la contraseña de un administrador). El gerente no.
- **Desconectar** una terminal revoca su token: deja de sincronizar al instante (web y móvil administrador, pide contraseña).
- **Expo Go**: ya no se carga `expo-notifications` dentro de Expo Go (SDK 53+ ya no lo incluye y mostraba un error rojo). Las notificaciones locales siguen en la APK / build de desarrollo.
- **Colores**: la app móvil usa morado profundo + dorado (como la web).
- **Cambiar de sucursal** (móvil): indica si hay conexión y explica qué hacer si la terminal no está autorizada en esa sucursal.

---

## v2.1 — Extras por tipo, descuentos con token y administración en el móvil

### Extras por tipo
- Cada producto tiene un **Tipo** (vela, pulsera, imagen…). En Ajustes (web, PC y móvil del administrador) aparece **Extras por tipo**: todos los tipos del inventario, y por cada uno varios extras con nombre y precio fijo.
- El vendedor solo **elige** el extra al cobrar; no puede escribir ni cambiar el precio. Hoy no hay extras: se crean desde esa sección.
- API: `GET/PUT /settings/extras`, `GET /settings/product-types`. El catálogo viaja a las terminales en el pull (`settings.extraCatalog`).
- Limpias conserva su cargo de servicio libre.

### Descuentos
- Nuevo propósito de token: **`descuento`** (créalo en Tokens de seguridad).
- Venta normal: el administrador descuenta libremente. El vendedor puede descontar con la **contraseña de un administrador o un token `descuento`** (PC y móvil).
- **Limpias**: campo Descuento solo para el administrador (PC y móvil).
- El servidor revalida: sin autorización válida la venta se conserva pero queda un conflicto `autorizacion_invalida`.

### Móvil del administrador (en línea)
Panel administrativo ahora incluye: Cortes de caja, Terminales, Usuarios (activar/desactivar), Sucursales (activar/desactivar), Permisos temporales (ver/revocar), Auditoría, Sistema (sincronización, diagnóstico, respaldos) y Extras por tipo. Estas pantallas consultan el servidor, por eso piden conexión.
Quedan solo en la web: crear/editar usuarios y sucursales, alta de permisos temporales, catálogo completo, traslados, reportes detallados y resolución de conflictos.

---

## v2.2 — Ver contraseña, apertura de caja en el teléfono, apariencia, editar/archivar productos

- **Ver contraseña:** botón Ver/Ocultar en todos los campos de contraseña (web, PC y teléfono).
- **Teléfono · logo:** el logo de inicio y de carga es mucho más chico (76-80 px).
- **Teléfono · abrir caja:** solo para emergencias. El gerente confirma con su contraseña; el vendedor necesita la contraseña de un administrador o un token con propósito **`apertura_caja`** (nuevo). En la PC el vendedor sigue abriendo sin token. La autorización queda en la bitácora local (el servidor todavía no cuenta el uso del token de apertura).
- **Teléfono · vincular PC:** la cámara es más grande y sin el recuadro dorado.
- **Apariencia (administrador):** Panel administrativo → Apariencia. Claro (sin cambios), Oscuro o Personalizado (6 paletas + los 9 colores editables). Se guarda en el servidor (`GET/PUT /settings/theme`, lectura pública en `GET /public/theme`) y llega a la web (al abrir y cada 5 min), a la PC (cada minuto, vía sincronización) y al teléfono (al sincronizar; se ve al cerrar y abrir la app).
- **Editar / archivar productos:** web (Inventario), PC (Inventario → Editar) y teléfono del administrador (Inventario → producto → Editar o archivar). Archivar no borra: el historial se conserva. Precios y costos piden contraseña (web y teléfono); en la PC solo se edita nombre, tipo, categoría y marca. Nueva ruta `GET /catalog/products/:id`.

## v2.3

- **Vendedor en el teléfono:** ya no ve «Cambiar de sucursal» ni «Terminal»; solo el gerente los modifica.
- **Agregar producto (web, PC y teléfono):** selector «¿Cuántas variantes tiene?» (cada variante con su código de barras y escáner), costo aclarado («lo que te costó a ti, como gerente») y existencia inicial obligatoria (mínimo 1).
- **Archivar:** aviso que explica qué hace el botón (no borra nada; se restaura desde Inventario → Mostrar archivados).
- **Corte por periodo (solo gerente):** suma los cortes cerrados entre dos fechas (cuántos cortes, vendido, ganado), se guarda como foto inmutable (`period_cuts`) y se imprime. Web: «Corte por periodo»; teléfono: Administración → Corte por periodo.
- **Retiros y gastos de caja:** piden motivo (mín. 5 caracteres) y autorización (contraseña de gerente o token con propósito `retiro_caja`). Sin autorización válida el servidor aplica el movimiento pero lo marca como conflicto `autorizacion_invalida`.
- **Anticipos de limpias:** quién, cuánto y qué día; ticket con QR (`amara:anticipo:<código>`); el gerente busca por nombre/día/código, reabre, agrega abonos y registra el uso (p. ej. 5 velas). PC, teléfono y web.
- Migración SQLite v3 (`advances`, `advance_entries`); colecciones Atlas `advances`, `advance_entries`, `period_cuts` (se crean solas).
- Limitaciones: un abono hecho desde la web no entra a ningún cajón; sin caja abierta el anticipo se registra pero el efectivo no se cuenta; los tokens `escaner` y `apertura_caja` aún no se consumen en el servidor.

## v2.3.1 – v2.3.4

- **Teléfono – Cortes de caja:** corregido el error «from: Usa el formato AAAA-MM-DD» (mandaba fecha y hora; ahora manda solo el día de México).
- **Buscador** en el Panel administrativo y en «Más» (incluye Cortes de caja, Corte por periodo, Usuarios, etc.).
- **Teclado:** pantallas, hojas y ventanas se acortan al abrir el teclado y el campo con foco se desplaza a la vista.
- **Variantes:** el teléfono permite hasta 5 variantes de un jalón, cada una con su código de barras (con cámara). Nuevo servidor `POST /catalog/products/:id/variants` y «Agregar otra variante» en teléfono (Editar producto), web (Catálogo) y PC (Inventario: «+ Variante»).
- **«Agregar como variante»:** botón pequeño junto al código de barras al dar de alta (web, PC y teléfono) y botón en Catálogo/Inventario: eliges el producto, llenas todo y el código queda en la variante nueva.
- **Ayudas por campo** (nombre, tipo, categoría, SKU, variante, código de barras, costo, precio, mínimo, existencia, lugar) y **SKU automático** (botón «Generar SKU»; formato `VEL-7K3PQ`).
- **Teléfono – existencia:** botón «Editar existencia (contar y corregir)» y, al guardar, aviso con antes → después, quién lo hizo, motivo y hora.
- **Web – Auditoría:** botón «Auditar entradas y salidas» (por persona: quién agregó más; y detalle) y botón «Auditoría del sistema» (registro técnico, con aviso de que es para el desarrollador).

## v2.4.1

- **Web (apariencia oscura):** insignias, celdas de «Efectivo esperado/contado», alertas y filas ya se leen bien (antes salían en blanco). Archivo: `apps/web/src/styles-v2.css` (tu `styles.css` no se toca).
- **Auditoría / historial de movimientos:** ahora muestran el nombre del producto, la variante y la persona (antes salían los códigos). Cambio en el servidor (`GET /inventory/movements`).
- **Variantes:** el nombre es opcional y automático («Única» si es una sola; «Variante 1», «Variante 2»… si son varias). Ya no hay que escribir «Única».
- **SKU:** se llena solo con el tipo y un código al azar (se puede cambiar) y hay botón «Generar otro» (teléfono, web y PC).
- **Código de barras por variante:** «Nuevo código» (escribir o escanear) o «Sin código propio» (usa el código interno para la etiqueta). Dos variantes no pueden compartir el mismo código de barras.

## v2.4.2 — Contraste de colores en escritorio (modo oscuro)
- El aviso «Códigos no reconocidos» (y todos los avisos/chips: advertencia, ok, error, info) tenían fondo crema con texto claro. Ahora usan un tinte transparente sobre la tarjeta y el texto de la paleta, por lo que siempre se leen.
- Zonas que son siempre blancas (vista previa de ticket, etiquetas) fuerzan texto oscuro.
- Solo se tocó `styles-v2.css`; tu `styles.css` personalizado no cambia.

## v2.4.3 — Etiquetas: seguir agregando productos al mismo lote
- Botón «+ Agregar otro producto» dentro del lote (lleva el cursor a la búsqueda).
- Al elegir un producto de la búsqueda se avisa «Agregado» y el cursor se queda en la búsqueda para seguir agregando.
- Cada renglón tiene botones − y + para las copias (además de escribir el número).
- En la vista previa hay «+ Agregar más etiquetas»: cierra la vista previa y vuelve al mismo lote sin perderlo.

## v2.4.4 — Inventario web: sucursales vacías, Borrar e Historial de borrados
- **Inventario → «Todas las sucursales»:** ya no se llena de renglones en 0 de otra sucursal cuando el producto sí tiene existencia en una. Casilla «Mostrar sucursales sin existencia» para verlos (se ven siempre al filtrar una sucursal o «Agotados»).
- **Botón Borrar** (Inventario y Catálogo): manda el producto a la papelera. No se elimina de la base de datos: las ventas, tickets y movimientos antiguos conservan su nombre y las cajas siguen sincronizando bien.
- **Historial de borrados:** botón en Inventario y opción «Historial de borrados» en Catálogo → Estado. Ahí se ve lo borrado y se puede **Restaurar**.
- Corrección: Catálogo ahora distingue de verdad Activo/Archivado (el botón decía siempre «Archivar»).
- API: `POST /catalog/products/:id/delete` (permiso `productos.editar`, auditado como `producto.borrar`); `GET /catalog/products?status=borrado`.
- **Escritorio y móvil:** botón «Borrar producto» (con confirmación) en la ventana/pantalla de editar producto. Usa la misma papelera: se restaura desde la web (Inventario → Historial de borrados).

## v2.4.5 — Permisos temporales y Tokens: Borrar e Historial
- En **Permisos temporales** y **Tokens de seguridad** (web): botón **Borrar** en los que ya no sirven (vencidos, revocados o agotados) y botón **Historial (borrados)** para ver lo borrado y **Restaurar**.
- Los vigentes primero se **Revocan** (no se pueden borrar mientras sirvan).
- Borrar no elimina nada de la base: queda en el historial y en la auditoría (`permiso_temporal.borrar`, `token.borrar`).
- API: `POST /admin/grants/:id/hide` y `POST /security/tokens/:id/hide` (`{ hidden: true|false }`); `GET` acepta `?hidden=1` para el historial.

## v2.4.6 — Corrige la compilación de la API en Render
- El comando `build` de `apps/api` pasaba `--noExternal` como argumento de línea de comandos, pero `tsup` 8.x no acepta esa opción así (solo en un archivo de configuración). Esto hacía fallar el despliegue en Render con `CACError: Unknown option --noExternal`.
- Se agregó `apps/api/tsup.config.ts` con esa opción y se simplificó el script `build` a solo `tsup`. El resultado final (qué se empaqueta) es el mismo.
