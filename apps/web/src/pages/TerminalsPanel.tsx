/**
 * Terminales (dentro de "Sucursales y ubicaciones"):
 *  1. "Nueva terminal" abre el modal "¿Para quién es esta terminal?" (PC o móvil, persona, sucursal y
 *     código sugerido automático).
 *  2. Al crearla se emite su token y se muestra un segundo modal con todos los datos (con Copiar).
 *  3. La lista se refresca sola: nunca hace falta recargar la página (F5).
 * Crear terminal no pide contraseña, pero emitir/revocar tokens sí (x-reauth, como exige la API).
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { formatMxDateTime } from '@amara/shared';
import { api, asList } from '../lib/api.ts';
import { errorMessage, useAsync } from '../lib/hooks.ts';
import {
  KIND_LABEL, buildCredentials, buildEditTerminalPayload, buildNewTerminalPayload, credentialsText, isTerminalRevoked, suggestTerminalCode, unwrapTerminal,
  type NewTerminalForm, type TerminalKind,
} from '../lib/terminals.ts';
import type { Terminal } from '../lib/types.ts';
import type { TerminalCredentials, TerminalRecord } from '../lib/types-v2.ts';
import { Alert, Badge, Card, CloseButton, ConfirmDialog, Empty, ErrorBox, Field, Modal, Spinner, TableWrap } from '../components/ui.tsx';
import { CopyButton } from '../components/CopyButton.tsx';
import { useBranches, useToast } from '../context.tsx';

export function TerminalsCard() {
  const { branches, branchName, branchCode } = useBranches();
  const { notify } = useToast();
  const terminals = useAsync((s) => api.get<unknown>('/admin/terminals', undefined, s).then((d) => asList<Terminal>(d)), []);
  const [creating, setCreating] = useState(false);
  const [creds, setCreds] = useState<TerminalCredentials | null>(null);
  const [viewing, setViewing] = useState(false); // true = solo consulta (sin token)
  const [credsBranchIds, setCredsBranchIds] = useState<string[] | null>(null);
  const [editing, setEditing] = useState<Terminal | null>(null);
  const [revoke, setRevoke] = useState<Terminal | null>(null);
  const [removing, setRemoving] = useState<Terminal | null>(null);
  const [busy, setBusy] = useState(false);
  const [issuingId, setIssuingId] = useState<string | null>(null);

  const existingCodes = (terminals.data ?? []).map((t) => t.code);

  const issueToken = async (t: Terminal) => {
    setIssuingId(t.id);
    try {
      // Acción sensible: la API exige x-reauth (pide la contraseña si hace falta).
      const r = await api.post<unknown>(`/admin/terminals/${t.id}/token`, {}, { reauth: true });
      const record: TerminalRecord = { id: t.id, code: t.code, name: t.name, kind: t.kind, branchId: t.branchId, assignedTo: t.assignedTo ?? null };
      const c = buildCredentials(record, r);
      if (!c.token) {
        notify('El servidor no devolvió el token. Inténtalo de nuevo.', 'error');
      } else {
        setViewing(false);
        setCredsBranchIds(t.branchIds ?? [t.branchId]);
        setCreds(c);
      }
      terminals.reload();
    } catch (e) {
      notify(errorMessage(e), 'error');
    } finally {
      setIssuingId(null);
    }
  };

  const doRevoke = async () => {
    if (!revoke) return;
    setBusy(true);
    try {
      await api.post(`/admin/terminals/${revoke.id}/revoke`, {}, { reauth: true });
      notify('Terminal desconectada: ya no puede sincronizar.');
      setRevoke(null);
      terminals.reload();
    } catch (e) {
      notify(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  const doRemove = async () => {
    if (!removing) return;
    setBusy(true);
    try {
      const r = await api.delete<{ archived?: boolean }>(`/admin/terminals/${removing.id}`, { reauth: true });
      notify(r?.archived ? 'Terminal eliminada. Tenía historial, así que se archivó (ya no aparece y quedó desconectada).' : 'Terminal eliminada.');
      setRemoving(null);
      terminals.reload();
    } catch (e) {
      notify(errorMessage(e), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Card
        title="Terminales"
        actions={
          <>
            <button type="button" className="btn btn-sm" onClick={terminals.reload} disabled={terminals.loading}>
              {terminals.loading ? 'Actualizando...' : 'Actualizar'}
            </button>
            <button type="button" className="btn btn-sm btn-primary" onClick={() => setCreating(true)} disabled={branches.length === 0}>
              Nueva terminal
            </button>
          </>
        }
      >
        {terminals.loading && !terminals.data && <Spinner />}
        {terminals.error && <ErrorBox error={terminals.error} onRetry={terminals.reload} />}
        {terminals.data &&
          (terminals.data.length === 0 ? (
            <Empty>No hay terminales. Usa "Nueva terminal" para vincular una PC o un teléfono.</Empty>
          ) : (
            <TableWrap>
              <table className="table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Nombre</th>
                    <th>Para</th>
                    <th>Sucursal</th>
                    <th>Tipo</th>
                    <th>Última sincronización</th>
                    <th>Estado</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {terminals.data.map((t) => (
                    <tr key={t.id}>
                      <td><strong>{t.code}</strong></td>
                      <td>{t.name}</td>
                      <td>{t.assignedTo || <span className="muted">-</span>}</td>
                      <td>{(t.branchIds?.length ? t.branchIds : [t.branchId]).map((b) => branchName(b)).join(' y ')}</td>
                      <td>{t.kind === 'movil' ? 'Móvil' : 'PC (escritorio)'}</td>
                      <td>{t.lastSyncAt ? formatMxDateTime(t.lastSyncAt) : <span className="muted">Nunca</span>}</td>
                      <td>{isTerminalRevoked(t) ? <Badge tone="danger">Token revocado</Badge> : <Badge tone="ok">Activa</Badge>}</td>
                      <td className="row-actions">
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => {
                            setViewing(true);
                            setCredsBranchIds(t.branchIds ?? [t.branchId]);
                            setCreds(buildCredentials({ id: t.id, code: t.code, name: t.name, kind: t.kind, branchId: t.branchId, assignedTo: t.assignedTo ?? null }, null));
                          }}
                        >
                          Ver
                        </button>
                        <button type="button" className="btn btn-sm" onClick={() => setEditing(t)}>Editar</button>
                        <button type="button" className="btn btn-sm" disabled={issuingId === t.id} onClick={() => issueToken(t)}>
                          {issuingId === t.id ? 'Emitiendo...' : 'Emitir token'}
                        </button>
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setRevoke(t)}>Desconectar</button>
                        <button type="button" className="btn btn-sm btn-ghost" onClick={() => setRemoving(t)}>Eliminar</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          ))}
      </Card>

      {creating && (
        <NewTerminalModal
          existingCodes={existingCodes}
          onClose={() => setCreating(false)}
          onCreated={(c, ids) => {
            setCreating(false);
            setViewing(false);
            setCredsBranchIds(ids);
            setCreds(c);
            // La lista se actualiza sola: no hace falta recargar la página.
            terminals.reload();
          }}
          onListChanged={terminals.reload}
        />
      )}
      {creds && (
        <CredentialsModal
          creds={creds}
          viewOnly={viewing}
          branchLabel={(credsBranchIds ?? [creds.branchId]).map((b) => branchName(b)).join(' y ')}
          branchCodeValue={branchCode(creds.branchId)}
          onClose={() => setCreds(null)}
        />
      )}
      {editing && <EditTerminalModal terminal={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); notify('Terminal actualizada.'); terminals.reload(); }} />}
      {removing && (
        <ConfirmDialog
          title="Eliminar terminal"
          message={`¿Eliminar la terminal ${removing.code} (${removing.name})? Quedará desconectada. Si nunca se usó se borra; si ya tiene ventas o cortes se archiva para no perder el historial. Pedirá tu contraseña.`}
          confirmLabel="Eliminar"
          danger
          busy={busy}
          onCancel={() => setRemoving(null)}
          onConfirm={doRemove}
        />
      )}
      {revoke && (
        <ConfirmDialog
          title="Desconectar terminal"
          message={`La terminal ${revoke.name} se desconecta ya: dejará de poder sincronizar hasta que emitas un token nuevo. Pedirá tu contraseña.`}
          confirmLabel="Desconectar"
          danger
          busy={busy}
          onCancel={() => setRevoke(null)}
          onConfirm={doRevoke}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------- Modal 1: ¿Para quién? */

function NewTerminalModal(props: {
  existingCodes: string[];
  onClose: () => void;
  onCreated: (c: TerminalCredentials, branchIds: string[]) => void;
  onListChanged: () => void;
}) {
  const { branches } = useBranches();
  const { notify } = useToast();
  const [form, setForm] = useState<NewTerminalForm>({
    kind: 'escritorio',
    person: '',
    branchId: '',
    branchIds: branches.length === 1 ? [branches[0]!.id] : [],
    code: suggestTerminalCode('escritorio', props.existingCodes),
  });
  const codeTouched = useRef(false);
  const [errors, setErrors] = useState<Partial<Record<keyof NewTerminalForm, string>>>({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);

  // El código sugerido sigue al tipo y a la lista mientras la persona no lo edite a mano.
  const codesKey = props.existingCodes.join(',');
  useEffect(() => {
    if (!codeTouched.current) setForm((f) => ({ ...f, code: suggestTerminalCode(f.kind, props.existingCodes) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.kind, codesKey]);

  const setKind = (kind: TerminalKind) => setForm((f) => ({ ...f, kind }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setServerError('');
    const r = buildNewTerminalPayload(form, props.existingCodes);
    setErrors(r.errors);
    if (!r.payload) return;
    setBusy(true);
    let created: TerminalRecord;
    try {
      const rec = unwrapTerminal(await api.post<unknown>('/admin/terminals', r.payload));
      props.onListChanged();
      if (!rec) throw new Error('El servidor creó la terminal pero no devolvió sus datos. Revisa la lista.');
      created = rec;
    } catch (err) {
      setServerError(errorMessage(err));
      setBusy(false);
      return;
    }

    // Segundo paso: emitir el token de activación. Si se cancela la contraseña, la terminal ya existe.
    let tokenResponse: unknown = null;
    try {
      tokenResponse = await api.post<unknown>(`/admin/terminals/${created.id}/token`, {}, { reauth: true });
    } catch (err) {
      notify(`La terminal se creó, pero no se emitió el token: ${errorMessage(err)} Usa "Emitir token" en la lista.`, 'error');
    }
    props.onCreated(buildCredentials({ ...created, assignedTo: created.assignedTo ?? r.payload.assignedTo }, tokenResponse, r.payload.assignedTo), r.payload.branchIds ?? [r.payload.branchId]);
  };

  const dirty = form.person.trim() !== '';

  return (
    <Modal
      title="¿Para quién es esta terminal?"
      size="sm"
      dirty={dirty && !busy}
      onClose={props.onClose}
      footer={
        <>
          <CloseButton label="Cancelar" disabled={busy} />
          <button type="submit" form="new-terminal-form" className="btn btn-primary" disabled={busy}>
            {busy ? 'Creando...' : 'Crear terminal'}
          </button>
        </>
      }
    >
      <form id="new-terminal-form" className="form" onSubmit={submit} noValidate>
        {serverError && <Alert tone="error">{serverError}</Alert>}
        <div className="field">
          <span className="field-label">Tipo de terminal</span>
          <div className="chips" role="radiogroup" aria-label="Tipo de terminal">
            {(['escritorio', 'movil'] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={form.kind === k}
                className={`chip ${form.kind === k ? 'chip-active' : ''}`}
                onClick={() => setKind(k)}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </div>
        <Field label="Nombre de la persona" required error={errors.person}>
          <input value={form.person} maxLength={40} autoFocus placeholder="Ej. Ana" onChange={(e) => setForm({ ...form, person: e.target.value })} />
        </Field>
        <Field label="Sucursales donde trabajará" required error={errors.branchId} hint="Marca una o las dos. La primera que marques es la principal.">
          <BranchChecks value={form.branchIds ?? []} onChange={(ids) => setForm({ ...form, branchIds: ids })} />
        </Field>
        <Field label="Código sugerido" hint="Se genera solo (P = PC, M = móvil). Puedes cambiarlo: 1 a 3 letras o números, único." error={errors.code}>
          <input
            value={form.code}
            maxLength={3}
            onChange={(e) => {
              codeTouched.current = true;
              setForm({ ...form, code: e.target.value.toUpperCase() });
            }}
          />
        </Field>
        <p className="muted small">Al crearla se emite su token de activación; pedirá tu contraseña.</p>
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------ Modal 2: datos generados */

function CredentialsModal(props: { creds: TerminalCredentials; branchLabel: string; branchCodeValue?: string; viewOnly?: boolean; onClose: () => void }) {
  const c = props.creds;
  const branchCodeValue = props.branchCodeValue ?? '';
  const rows: { label: string; value: string }[] = [
    { label: 'ID', value: c.id },
    { label: 'Código', value: c.code },
    { label: 'Nombre', value: c.name },
    { label: 'Tipo', value: c.kind === 'movil' ? 'Móvil' : 'PC (escritorio)' },
    { label: 'Sucursal', value: props.branchLabel || c.branchId },
    // Estas dos son justo lo que pide el formulario "Avanzado" del escritorio (Id/Código de sucursal):
    // la pantalla normal (usuario y contraseña) no las necesita, pero si hay que activar a mano, aquí están.
    { label: 'Id de la sucursal', value: c.branchId },
  ];
  if (branchCodeValue) rows.push({ label: 'Código de sucursal', value: branchCodeValue });
  if (c.assignedTo) rows.push({ label: 'Para', value: c.assignedTo });

  return (
    <Modal
      title={`Datos de la terminal ${c.code}`}
      size="md"
      onClose={props.onClose}
      footer={
        <>
          <CopyButton text={credentialsText(c, props.branchLabel, branchCodeValue)} label="Copiar todo" />
          <button type="button" className="btn btn-primary" onClick={props.onClose}>Listo</button>
        </>
      }
    >
      {props.viewOnly ? (
        <Alert tone="info" title="Solo consulta">
          Por seguridad el token de activación no se puede volver a mostrar (el servidor no lo guarda). Si hace falta, usa "Emitir token" para generar uno nuevo.
        </Alert>
      ) : c.token ? (
        <Alert tone="warn" title="Cópialo ahora">
          El token de activación solo se muestra una vez. Pégalo en la configuración de la terminal; no lo compartas por chat.
        </Alert>
      ) : (
        <Alert tone="warn" title="Falta el token">
          La terminal ya existe, pero no se emitió su token. Usa "Emitir token" en la lista de terminales.
        </Alert>
      )}
      <dl className="dl dl-copy">
        {rows.map((r) => (
          <div className="dl-row" key={r.label}>
            <dt>{r.label}</dt>
            <dd className="mono-wrap">{r.value}</dd>
            <CopyButton text={r.value} small />
          </div>
        ))}
      </dl>
      {c.token && (
        <div className="form">
          <span className="field-label">Token de activación</span>
          <textarea className="mono" readOnly rows={4} value={c.token} onFocus={(e) => e.currentTarget.select()} aria-label="Token de activación" />
          <div className="btn-row">
            <CopyButton text={c.token} label="Copiar token" />
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------- Sucursales (una o varias) */

function BranchChecks(props: { value: string[]; onChange: (ids: string[]) => void }) {
  const { branches } = useBranches();
  const toggle = (id: string) => props.onChange(props.value.includes(id) ? props.value.filter((x) => x !== id) : [...props.value, id]);
  return (
    <div className="chips" role="group" aria-label="Sucursales">
      {branches.map((b) => (
        <button key={b.id} type="button" role="checkbox" aria-checked={props.value.includes(b.id)} className={`chip ${props.value.includes(b.id) ? 'chip-active' : ''}`} onClick={() => toggle(b.id)}>
          {props.value.includes(b.id) ? '✓ ' : ''}{b.name}
        </button>
      ))}
      {branches.length > 1 && (
        <button type="button" className="chip" onClick={() => props.onChange(branches.map((b) => b.id))}>Las dos / todas</button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ Editar terminal */

function EditTerminalModal(props: { terminal: Terminal; onClose: () => void; onSaved: () => void }) {
  const t = props.terminal;
  const [person, setPerson] = useState(t.assignedTo ?? '');
  const [branchIds, setBranchIds] = useState<string[]>(t.branchIds?.length ? t.branchIds : [t.branchId]);
  const [errors, setErrors] = useState<{ person?: string; branchIds?: string }>({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setServerError('');
    const r = buildEditTerminalPayload(t.kind, { person, branchIds });
    setErrors(r.errors);
    if (!r.payload) return;
    setBusy(true);
    try {
      await api.patch(`/admin/terminals/${t.id}`, r.payload);
      props.onSaved();
    } catch (err) {
      setServerError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Editar terminal ${t.code}`}
      size="sm"
      onClose={props.onClose}
      footer={
        <>
          <CloseButton label="Cancelar" disabled={busy} />
          <button type="submit" form="edit-terminal-form" className="btn btn-primary" disabled={busy}>{busy ? 'Guardando...' : 'Guardar cambios'}</button>
        </>
      }
    >
      <form id="edit-terminal-form" className="form" onSubmit={submit} noValidate>
        {serverError && <Alert tone="error">{serverError}</Alert>}
        <Field label="Nombre de la persona" required error={errors.person}>
          <input value={person} maxLength={40} onChange={(e) => setPerson(e.target.value)} />
        </Field>
        <Field label="Sucursales donde trabajará" required error={errors.branchIds} hint="Una o las dos. Los cambios aplican la próxima vez que la terminal sincronice.">
          <BranchChecks value={branchIds} onChange={setBranchIds} />
        </Field>
      </form>
    </Modal>
  );
}
