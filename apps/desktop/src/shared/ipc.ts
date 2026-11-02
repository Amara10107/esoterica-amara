/**
 * Contrato IPC entre el proceso principal (main) y la interfaz (renderer).
 * - SOLO tipos y listas de nombres: ningún código con dependencias de Node/Electron.
 * - El renderer NO tiene acceso a Node ni a SQLite: todo pasa por estos canales, y el
 *   proceso principal vuelve a validar sesión y permisos en CADA llamada (ocultar un botón
 *   en pantalla nunca es la seguridad).
 */
import type { AdvanceEntryKind, AdvanceFull, AdvanceMethod, CashBreakdown, CashMovementType, PaymentInput, PaymentMethod, Role, Sale, SaleAdjustment, SalesSummary, SaleType, TokenPurpose } from '@amara/shared';
import type { CatalogHit } from '@amara/database';
import type { AppSettings } from './settings.ts';

// ───────────── Sobre de respuesta (los errores conservan código y mensaje en español) ─────────────
export interface IpcOk<T> { ok: true; data: T }
export interface IpcFail { ok: false; code: string; error: string }
export type IpcEnvelope<T> = IpcOk<T> | IpcFail;

// ───────────── Tipos de datos ─────────────
export interface SessionUser {
  id: string;
  username: string;
  name: string;
  role: Role;
  branchIds: string[];
  /** true si el inicio de sesión fue contra la API (hay sesión en línea: altas de producto). */
  onlineLogin: boolean;
}

export interface DeviceState {
  activated: boolean;
  apiUrl: string;
  branch: { id: string; code: string; name: string } | null;
  terminal: { id: string; code: string } | null;
}

export interface ActivationOptions {
  branches: { id: string; code: string; name: string }[];
  terminals: { id: string; code: string; name: string; branchId: string }[];
}

export interface BranchRow { id: string; code: string; name: string; locations: string[] }

export interface VariantRow {
  variantId: string;
  label: string;
  barcode: string | null;
  internalCode: string;
  qrValue: string;
  priceCents: number;
  location: string | null;
  qty: number;
}

export interface SaleRow {
  id: string; folio: string; userId: string; userName: string; terminalId: string;
  createdAt: string; totalCents: number; status: 'completada' | 'cancelada'; syncState: string; origin: string;
  /** v2. 'limpia' = servicio de Limpias. */
  type?: SaleType;
}

/** v2. Empleado que puede figurar como vendedor de una venta (usuarios activos de la sucursal). */
export interface SellerRow { id: string; name: string; role: 'gerente' | 'vendedor' }

/**
 * v2. Boleto de autorización: lo entrega el proceso principal tras validar la contraseña de un administrador o un
 * token. La pantalla solo lo devuelve en la acción siguiente; nunca contiene la contraseña ni el código.
 */
export interface AuthTicket {
  ticket: string;
  via: 'token' | 'admin_password';
  /** Quién autorizó (administrador o quien emitió el token). */
  byName: string | null;
  tokenLabel: string | null;
  /** true = lo validó el servidor en línea; false = la caché local de este equipo. */
  online: boolean;
}

/** v2. Cómo se autoriza una acción sensible: el gerente confirma SU contraseña; el vendedor presenta un boleto. */
export interface SensitiveAuth { password?: string; ticket?: string }

/** v2. Línea de venta enviada al proceso principal (un 'extra' lleva el cargo y la nota). */
export interface SaleItemReq {
  variantId: string;
  qty: number;
  kind?: 'producto' | 'extra';
  unitPriceCents?: number;
  extraNote?: string;
  /** v2.1. Extra del catálogo (venta normal): el precio y el nombre salen de ahí. */
  extraId?: string;
}

/** v2. Documento imprimible con vista previa. */
export type DocRequest =
  | { kind: 'ticket'; saleId: string }
  | { kind: 'closure'; sessionId: string }
  /** v2.3. Ticket de un anticipo de limpia con QR. `entryId`: el abono que se imprime (por omisión, el estado completo). */
  | { kind: 'advance'; advanceId: string; entryId?: string }
  | {
      kind: 'permit';
      permit: {
        code: string; label: string; purposes: TokenPurpose[]; createdAt: string; expiresAt: string;
        branchId: string | null; forUserId: string | null; maxUses: number | null;
      };
    };

export interface DocPreview {
  title: string;
  paperMm: 58 | 80;
  /** Cada página es el HTML EXACTO que se manda a la impresora (ticket: copia cliente y copia tienda). */
  pages: { label: string; html: string }[];
}

export interface DocActionResult extends PrintResult {
  /** Solo 'pdf': ruta del archivo guardado, o null si se canceló el diálogo. */
  savedPath?: string | null;
}

/** v2. Token del servidor tal como lo lista GET /security/tokens (sin hash ni código). */
export interface TokenRowView {
  id: string; label: string; purposes: TokenPurpose[]; branchId: string | null; forUserId: string | null;
  createdBy: string; createdAt: string; expiresAt: string; revokedAt: string | null; maxUses: number | null; usedCount: number;
  status: string;
}

export interface SaleDetail {
  sale: Sale;
  printCount: number;
  lastPrintError: string | null;
  /** Cantidad ya devuelta por partida (saleItemId -> unidades). */
  returned: Record<string, number>;
  adjustments: { id: string; type: 'cancelacion' | 'devolucion'; createdAt: string; reason: string; amountCents: number }[];
}

export interface CashStatus {
  open: boolean;
  sessionId: string | null;
  openedAt: string | null;
  /** Solo el gerente recibe importes. */
  openingCents: number | null;
  /** v2. Quién abrió la caja. */
  openedByName: string | null;
}

export interface CashClosureResult {
  sessionId: string;
  expectedCents: number;
  countedCents: number;
  differenceCents: number;
  provisional: boolean;
  closedAt: string;
  /** v2. Quién autorizó el cierre. */
  authorizedByName: string | null;
  /** v2. true = el vendedor cerró a ciegas: los importes vienen en 0 y no se le muestran. */
  redacted: boolean;
}

export interface ClosureRow {
  id: string; openedAt: string; closedAt: string; openingCents: number; expectedCents: number;
  countedCents: number; differenceCents: number; provisional: number; reconciliation: string;
}

export interface QueueRow {
  seq: number; opId: string; type: string; status: string; attempts: number; lastError: string | null;
  receivedAt: string | null; localTs: string; origin: string;
}

export interface ConflictRow { id: string; opId: string | null; kind: string; detail: unknown; createdAt: string }

export interface BackupLogRow { id: string; at: string; kind: string; path: string | null; ok: number; sizeBytes: number | null; verified: number; error: string | null }

export interface PrinterInfo { name: string; displayName: string; isDefault: boolean }

export interface PrintResult {
  ok: boolean;
  /** Copias que SÍ se enviaron a la impresora antes del fallo (si lo hubo). */
  printedCopies: ('cliente' | 'tienda')[];
  error?: string;
}

export interface SyncState {
  activated: boolean;
  running: boolean;
  online: boolean;
  authError: boolean;
  lastRunAt: string | null;
  lastOkAt: string | null;
  lastError: string | null;
  pending: number;
  rejected: number;
  openConflicts: number;
}

export interface BackupResult {
  ok: boolean;
  at: string;
  kind: string;
  path?: string;
  verified: boolean;
  error?: string;
  secondary?: { configured: boolean; ok: boolean; path?: string; error?: string };
}

export interface BackupState {
  running: boolean;
  lastResult: BackupResult | null;
  /** Texto de aviso persistente (falló el respaldo, no hay espacio, el USB no está...). null = todo bien. */
  warning: string | null;
  lastOkAt: string | null;
}

export interface LanDevice { id: string; name: string; pairedAt: string; lastSeenAt: string | null }

export interface LanState {
  enabled: boolean;
  listening: boolean;
  port: number;
  error: string | null;
  pairing: { expiresAt: string; payloadText: string; host: string } | null;
  devices: LanDevice[];
  hostCandidates: string[];
}

export interface RemoteScan { code: string; deviceName: string; found: boolean }

export interface LabelItem { variantId: string; code: string; productName: string; label: string; priceCents: number; copies: number }
export interface LabelBatch { id: string; at: string; items: LabelItem[] }

export interface NewProductVariantInput {
  label: string; barcode?: string; costCents: number; priceCents: number; minStock: number;
  /** Existencia inicial en la sucursal elegida (obligatoria: 1 o más). */
  initialQty: number;
}
export interface NewProductInput {
  name: string; type: string; category: string; sku: string; brand?: string; description?: string;
  branchId: string; location?: string;
  /** v2.3. Una o varias variantes; cada una con su código de barras, costo, precio y existencia. */
  variants: NewProductVariantInput[];
}

/** v2.3.4. Agrega variantes nuevas (cada una con su código de barras) a un producto que ya existe. */
export interface AddVariantInput {
  productId: string; branchId: string; location?: string;
  variants: NewProductVariantInput[];
}

export interface AppInfo {
  version: string;
  dataDir: string;
  dbPath: string;
  platform: string;
  startupNotice: string | null;
}

export type CatalogHitView = CatalogHit;

// ───────────── Mapa de canales ─────────────
export interface IpcMap {
  'app:info': { req: undefined; res: AppInfo };
  'app:openFolder': { req: { which: 'data' | 'backup' | 'backup2' }; res: true };

  'device:get': { req: undefined; res: DeviceState };
  'activation:options': { req: { apiUrl: string; username: string; password: string }; res: ActivationOptions };
  'activation:activate': { req: { branchId: string; terminalId: string }; res: DeviceState };
  'activation:manual': {
    req: { apiUrl: string; token: string; branchId: string; branchCode: string; branchName: string; terminalId: string; terminalCode: string };
    res: DeviceState;
  };

  'auth:current': { req: undefined; res: SessionUser | null };
  'auth:login': { req: { username: string; password: string }; res: SessionUser };
  'auth:logout': { req: undefined; res: true };
  'auth:reauth': { req: { password: string }; res: true };

  'settings:get': { req: undefined; res: AppSettings };
  'settings:save': { req: Partial<AppSettings>; res: AppSettings };
  'settings:pickFolder': { req: { title: string }; res: string | null };
  'settings:testApi': { req: { url: string }; res: { ok: boolean; status: number | null; error?: string } };

  'print:printers': { req: undefined; res: PrinterInfo[] };
  'print:test': { req: { target: 'ticket' | 'label' }; res: PrintResult };
  'print:ticket': { req: { saleId: string; copies?: ('cliente' | 'tienda')[]; reprint?: boolean }; res: PrintResult };
  'print:labels': { req: { html: string; widthMm: number; heightMm: number }; res: PrintResult };

  'catalog:lookup': { req: { code: string }; res: CatalogHit[] };
  'catalog:search': { req: { text: string }; res: CatalogHit[] };
  'catalog:variants': { req: { productId: string; branchId: string }; res: VariantRow[] };
  'catalog:inventory': { req: { text: string; filter: 'todos' | 'agotados' | 'bajos'; branchId: string }; res: CatalogHit[] };
  'catalog:branches': { req: undefined; res: BranchRow[] };
  'catalog:checkCode': { req: { code: string }; res: { existsLocal: boolean; existsRemote: boolean | null } };
  'catalog:createProduct': { req: NewProductInput; res: { created: true } };
  'catalog:addVariant': { req: AddVariantInput; res: { added: number } };
  /** v2.2. Editar nombre/tipo/categoría/marca de un producto (necesita el servidor). Precios y costos se cambian en la web. */
  'catalog:updateProduct': { req: { productId: string; name: string; type: string; category: string; brand?: string }; res: { updated: true } };
  /** v2.2. Archivar o restaurar un producto (no se borra; el historial se conserva). */
  'catalog:archiveProduct': { req: { productId: string; archive: boolean; /** v2.4.4: true = Borrar (papelera; se restaura desde la web). */ remove?: boolean }; res: { done: true } };

  'sales:create': {
    req: {
      saleId: string; items: SaleItemReq[]; discountCents: number; payments: PaymentInput[];
      /** v2. Empleado que vendió (se valida contra los usuarios de la sucursal; NO se imprime). */
      sellerId: string;
      /** v2. 'limpia' = Limpias (el vendedor necesita `ticket` con propósito 'limpias'). */
      type?: SaleType;
      ticket?: string;
    };
    res: { sale: Sale; duplicate: boolean; warnings: string[] };
  };
  'sales:list': {
    req: { fromDay: string; toDay: string; folio?: string; status?: 'completada' | 'cancelada'; userId?: string; terminalId?: string };
    res: SaleRow[];
  };
  'sales:detail': { req: { id: string }; res: SaleDetail };
  'sales:cancel': { req: { saleId: string; reason: string; adjustmentId: string } & SensitiveAuth; res: SaleAdjustment };
  'sales:refund': {
    req: {
      saleId: string; reason: string; adjustmentId: string; method?: PaymentMethod;
      lines: { saleItemId: string; qty: number; restock: boolean }[];
    } & SensitiveAuth;
    res: SaleAdjustment;
  };

  'sellers:list': { req: undefined; res: SellerRow[] };
  'catalog:categories': { req: undefined; res: string[] };
  'security:verify': { req: { purpose: TokenPurpose; code?: string; adminPassword?: string }; res: AuthTicket };
  'extras:get': { req: undefined; res: { categories: string[] } };
  'extras:set': { req: { categories: string[] }; res: { categories: string[]; savedOnServer: boolean } };
  /** v2.1. Extras por tipo de producto: el catálogo configurado y los tipos que hay en el inventario local. */
  'extrasCatalog:get': { req: undefined; res: { items: import('@amara/shared').ExtraOption[]; types: string[] } };
  /** v2.2. Apariencia elegida por el administrador (se recibe al sincronizar). */
  'theme:get': { req: undefined; res: import('@amara/shared').ThemeSettings };
  'extrasCatalog:set': { req: { items: import('@amara/shared').ExtraOption[] }; res: { items: import('@amara/shared').ExtraOption[]; savedOnServer: boolean } };
  'tokens:list': { req: undefined; res: TokenRowView[] };
  'tokens:create': {
    req: {
      label: string; purposes: TokenPurpose[]; durationMinutes: number; branchId: string | null; maxUses: number | null;
      length: number; forUserId: string | null; password: string;
    };
    res: { id: string; code: string; expiresAt: string };
  };
  'tokens:revoke': { req: { id: string }; res: true };
  'print:preview': { req: DocRequest; res: DocPreview };
  'print:document': { req: { doc: DocRequest; action: 'print' | 'pdf' }; res: DocActionResult };
  'labels:savePdf': { req: { html: string; widthMm: number; heightMm: number }; res: { savedPath: string | null } };

  'inventory:permissions': {
    req: undefined;
    res: { canView: boolean; canEnter: boolean; canMove: boolean; canCreateProduct: boolean; grantExpiresAt: string | null };
  };
  'inventory:move': {
    req: { id: string; branchId: string; variantId: string; type: 'entrada' | 'salida' | 'ajuste' | 'conteo'; qty: number; reason: string; location?: string };
    res: { duplicate: boolean; delta: number; newQty: number };
  };

  'cash:status': { req: undefined; res: CashStatus };
  'cash:open': { req: { openingCents: number }; res: { sessionId: string } };
  /** v2.3. Retiro/gasto: el motivo es obligatorio y se pide autorización (gerente: sin contraseña extra; vendedor: admin o token). */
  'cash:movement': { req: { type: CashMovementType; amountCents: number; concept: string } & SensitiveAuth; res: true };
  /** v2.3. Anticipos de limpias. Cualquiera recibe uno; consultar, abonar y registrar usos es solo del gerente. */
  'advances:create': {
    req: { clientName: string; clientPhone?: string; concept?: string; amountCents: number; method?: AdvanceMethod; note?: string };
    res: { advance: AdvanceFull; cashRegistered: boolean };
  };
  'advances:list': { req: { text?: string; status?: 'abierto' | 'cerrado' | 'todos' }; res: AdvanceFull[] };
  'advances:addEntry': {
    req: { advanceId: string; kind: AdvanceEntryKind; amountCents?: number; method?: AdvanceMethod; note?: string };
    res: { advance: AdvanceFull; cashRegistered: boolean };
  };
  'cash:breakdown': { req: undefined; res: { sessionId: string; openedAt: string; openedByName: string | null; breakdown: CashBreakdown } | null };
  'cash:close': {
    req: { countedCents: number; denominations: Record<string, number>; notes: string } & SensitiveAuth;
    res: CashClosureResult;
  };
  'cash:closures': { req: undefined; res: ClosureRow[] };
  'cash:summaryToday': { req: undefined; res: { summary: SalesSummary; pendingOps: number; mayBeIncomplete: boolean } };

  'sync:state': { req: undefined; res: SyncState };
  'sync:now': { req: undefined; res: SyncState };
  'sync:queue': { req: { status?: string }; res: QueueRow[] };
  'sync:conflicts': { req: undefined; res: ConflictRow[] };

  'backup:state': { req: undefined; res: BackupState };
  'backup:now': { req: undefined; res: BackupResult };
  'backup:list': { req: undefined; res: BackupLogRow[] };

  'lan:state': { req: undefined; res: LanState };
  'lan:startPairing': { req: { host: string } & SensitiveAuth; res: LanState };
  'lan:cancelPairing': { req: undefined; res: LanState };
  'lan:revoke': { req: { deviceId: string }; res: LanState };
  'lan:setEnabled': { req: { enabled: boolean }; res: LanState };

  'labels:history': { req: undefined; res: LabelBatch[] };
  'labels:saveBatch': { req: { items: LabelItem[] }; res: LabelBatch[] };
}

export type IpcChannel = keyof IpcMap;

/** Lista de canales permitidos en el preload. TypeScript obliga a que esté completa. */
export const CHANNEL_NAMES: Record<IpcChannel, true> = {
  'app:info': true, 'app:openFolder': true,
  'device:get': true, 'activation:options': true, 'activation:activate': true, 'activation:manual': true,
  'auth:current': true, 'auth:login': true, 'auth:logout': true, 'auth:reauth': true,
  'settings:get': true, 'settings:save': true, 'settings:pickFolder': true, 'settings:testApi': true,
  'print:printers': true, 'print:test': true, 'print:ticket': true, 'print:labels': true,
  'catalog:lookup': true, 'catalog:search': true, 'catalog:variants': true, 'catalog:inventory': true,
  'catalog:branches': true, 'catalog:checkCode': true, 'catalog:createProduct': true, 'catalog:addVariant': true, 'catalog:updateProduct': true, 'catalog:archiveProduct': true,
  'sales:create': true, 'sales:list': true, 'sales:detail': true, 'sales:cancel': true, 'sales:refund': true,
  'inventory:permissions': true, 'inventory:move': true,
  'cash:status': true, 'cash:open': true, 'cash:movement': true, 'advances:create': true, 'advances:list': true, 'advances:addEntry': true, 'cash:breakdown': true, 'cash:close': true,
  'cash:closures': true, 'cash:summaryToday': true,
  'sync:state': true, 'sync:now': true, 'sync:queue': true, 'sync:conflicts': true,
  'backup:state': true, 'backup:now': true, 'backup:list': true,
  'lan:state': true, 'lan:startPairing': true, 'lan:cancelPairing': true, 'lan:revoke': true, 'lan:setEnabled': true,
  'labels:history': true, 'labels:saveBatch': true,
  'sellers:list': true, 'catalog:categories': true, 'security:verify': true, 'extras:get': true, 'extras:set': true, 'extrasCatalog:get': true, 'extrasCatalog:set': true, 'theme:get': true,
  'tokens:list': true, 'tokens:create': true, 'tokens:revoke': true,
  'print:preview': true, 'print:document': true, 'labels:savePdf': true,
};

// ───────────── Eventos main -> renderer ─────────────
export interface IpcEventMap {
  'evt:sync': SyncState;
  'evt:backup': BackupState;
  'evt:lan': LanState;
  'evt:scan': RemoteScan;
  'evt:notice': { level: 'info' | 'warn' | 'error'; text: string };
  /** El proceso principal cerró la sesión (p. ej. el usuario fue desactivado). */
  'evt:session-ended': { reason: string };
}
export type IpcEventName = keyof IpcEventMap;

export const EVENT_NAMES: Record<IpcEventName, true> = {
  'evt:sync': true, 'evt:backup': true, 'evt:lan': true, 'evt:scan': true, 'evt:notice': true, 'evt:session-ended': true,
};

/** Puente expuesto por el preload en `window.amara`. */
export interface AmaraBridge {
  invoke(channel: string, payload?: unknown): Promise<IpcEnvelope<unknown>>;
  on(event: string, cb: (data: unknown) => void): () => void;
}
