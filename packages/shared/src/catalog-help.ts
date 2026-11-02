/** Ayudas de los campos del alta de producto (iguales en web, PC y teléfono) y generador de SKU. */

export const FIELD_HELP = {
  name: 'Nombre: cómo le dices al producto en la tienda. Ej. «Vela de miel». Es lo que ve el cliente en el ticket.',
  type: 'Tipo: la familia grande del producto (velas, inciensos, imágenes). De aquí salen los «Extras por tipo» y los informes.',
  category: 'Categoría: un grupo más específico dentro del tipo (ej. velas → «para el amor»). Sirve para filtrar y buscar.',
  sku: 'SKU: la clave interna del PRODUCTO, solo para ti (inventario y reportes). No es el código de barras. Con el botón «Generar» se crea uno único automáticamente.',
  variant: 'Variante: cada presentación del mismo producto (tamaño, color, aroma). Cada variante tiene su propio precio, existencia y código de barras.',
  barcode: 'Código de barras: el que trae el empaque de ESA variante. Cada variante puede traer uno distinto aunque sea el mismo producto o proveedor. Si no tiene, el sistema le asigna un código interno para imprimir su etiqueta.',
  cost: 'Costo: lo que te costó a ti, como gerente (no es el precio al cliente). Con él se calcula lo que ganas.',
  price: 'Precio de venta: lo que paga el cliente.',
  minStock: 'Mínimo: cuando la existencia llega a esta cantidad, el sistema te avisa que hay que resurtir.',
  qty: 'Existencia inicial: cuántas piezas hay hoy en esta sucursal. Es obligatoria (1 o más).',
  location: 'Lugar: dónde está en la tienda (vitrina, bodega, estante).',
} as const;

/** Máximo de variantes que se piden de un jalón en el alta (se pueden agregar más después). */
export const MAX_VARIANTS_AT_CREATE = 12;

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O/1/I para que no se confunda al leer

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Las 3 letras con que empieza el SKU (del tipo; si no hay, del nombre). */
export function skuPrefix(type: string, name = ''): string {
  return (fold(type) || fold(name) || 'PRD').slice(0, 3).padEnd(3, 'X');
}

/** 5 caracteres al azar y legibles; se genera UNA vez por formulario para que el SKU no cambie con cada tecla. */
export function randomSkuTail(rand: () => number = Math.random): string {
  let tail = '';
  for (let i = 0; i < 5; i++) tail += ALPHABET[Math.floor(rand() * ALPHABET.length) % ALPHABET.length];
  return tail;
}

/** SKU automático: 3 letras del tipo (o del nombre) + guion + 5 caracteres al azar. Ej. VEL-7K3PQ. `rand` se inyecta en pruebas. */
export function generateSku(type: string, name = '', rand: () => number = Math.random): string {
  return `${skuPrefix(type, name)}-${randomSkuTail(rand)}`;
}

/** Nombre automático de una variante cuando no se escribe: «Única» si es la sola; si no, «Variante N». */
export function autoVariantLabel(index: number, total: number): string {
  return total <= 1 ? 'Única' : `Variante ${index + 1}`;
}
