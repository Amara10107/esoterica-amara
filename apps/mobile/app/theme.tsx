/**
 * Apariencia (SOLO administrador): claro, oscuro o personalizado con paletas. Al guardar se envía al servidor
 * (PUT /settings/theme) y la web, la PC y los teléfonos la reciben al sincronizar.
 *  - Claro: no cambia nada (cada app conserva su diseño).
 *  - Este teléfono la muestra al cerrar y volver a abrir la app (los estilos se crean al arrancar).
 */
import React, { useCallback, useState } from 'react';
import { DevSettings, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  DEFAULT_THEME, LIGHT_PALETTE, PALETTE_KEYS, PALETTE_LABELS, PALETTE_PRESETS, normalizeHex, resolvePalette, sanitizeTheme,
} from '@amara/shared';
import type { ThemeMode, ThemePalette, ThemeSettings } from '@amara/shared';
import { Banner, Button, Card, Chip, ChipRow, Field, H1, H2, Loading, Muted, Screen } from '../src/components/ui';
import { secureSet } from '../src/services/secure';
import { useApp } from '../src/state/AppContext';
import { THEME_CACHE_KEY, colors, radius, space } from '../src/theme';

const MODE_NAME: Record<ThemeMode, string> = { claro: 'Claro', oscuro: 'Oscuro', personalizado: 'Personalizado' };

export default function ThemeScreen() {
  const app = useApp();
  const { store, session, online, api } = app;
  const [theme, setTheme] = useState<ThemeSettings | null>(null);
  const [drafts, setDrafts] = useState<Partial<Record<keyof ThemePalette, string>>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'error' | 'warn'; text: string } | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    if (!store) return;
    let t: ThemeSettings = await store.getTheme();
    if (online && session?.token) {
      try {
        t = sanitizeTheme((await api.get<{ theme?: unknown }>('/settings/theme')).theme);
      } catch {
        setMsg({ kind: 'warn', text: 'No se pudo leer del servidor: se muestra la apariencia guardada en el teléfono.' });
      }
    }
    setTheme(t);
    setDrafts({});
  }, [store, online, session, api]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!session || !store) return <Loading />;
  if (!app.can('config.editar')) return <Screen><Banner kind="error" text="Solo el administrador puede cambiar la apariencia." /></Screen>;
  if (!theme) return <Loading />;

  const current: ThemeSettings = theme;
  // Paleta que se está viendo: la personalizada con lo que se va escribiendo.
  const shown: ThemePalette = { ...current.custom };
  for (const k of PALETTE_KEYS) {
    const d = drafts[k];
    const n = d !== undefined ? normalizeHex(d) : null;
    if (n) shown[k] = n;
  }
  const preview = current.mode === 'personalizado' ? shown : resolvePalette(current) ?? LIGHT_PALETTE;

  function setMode(mode: ThemeMode) {
    setTheme({ ...current, mode });
    setSaved(false);
  }

  function pickPreset(id: string) {
    const p = PALETTE_PRESETS.find((x) => x.id === id);
    if (!p) return;
    setTheme({ ...current, mode: 'personalizado', custom: { ...p.palette }, presetId: id });
    setDrafts({});
    setSaved(false);
  }

  async function save() {
    // Todos los colores escritos deben ser válidos.
    for (const k of PALETTE_KEYS) {
      const d = drafts[k];
      if (d !== undefined && !normalizeHex(d)) return setMsg({ kind: 'error', text: `"${PALETTE_LABELS[k]}": escribe un color como #D3AD64.` });
    }
    const toSave: ThemeSettings = { ...current, custom: shown };
    setBusy(true);
    setMsg(null);
    try {
      const res = await api.put<{ theme?: unknown }>('/settings/theme', toSave);
      const confirmed = sanitizeTheme(res.theme ?? toSave);
      await secureSet(THEME_CACHE_KEY, JSON.stringify(confirmed));
      setTheme(confirmed);
      setDrafts({});
      setSaved(true);
      setMsg({ kind: 'ok', text: 'Guardado. La web y la PC lo reciben en unos minutos. Este teléfono lo muestra al cerrar y volver a abrir la app.' });
      void app.syncNow('manual');
    } catch (e) {
      setMsg({ kind: 'error', text: e instanceof Error ? e.message : 'No se pudo guardar.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <H1>Apariencia</H1>
      <Muted>Elige cómo se ve el sistema. Al guardar cambia en la web, en la PC y en los teléfonos.</Muted>
      {msg ? <Banner kind={msg.kind} text={msg.text} /> : null}
      {!online ? <Banner kind="warn" text="Sin conexión: para guardar se necesita internet." /> : null}

      <Card>
        <H2>Tema</H2>
        <ChipRow>
          {(Object.keys(MODE_NAME) as ThemeMode[]).map((m) => (
            <Chip key={m} label={MODE_NAME[m]} selected={current.mode === m} onPress={() => setMode(m)} />
          ))}
        </ChipRow>
        <Muted>
          {current.mode === 'claro' ? 'Claro: el diseño de siempre (blanco, morado y dorado).' : current.mode === 'oscuro' ? 'Oscuro: fondo oscuro con acento dorado.' : 'Personalizado: elige una paleta o ajusta cada color.'}
        </Muted>
      </Card>

      <Card>
        <H2>Vista previa</H2>
        <View style={[styles.pvScreen, { backgroundColor: preview.bg, borderColor: preview.line }]}>
          <View style={[styles.pvCard, { backgroundColor: preview.card, borderColor: preview.line }]}>
            <Text style={[styles.pvTitle, { color: preview.text }]}>Esotérica Amara</Text>
            <Text style={{ color: preview.muted }}>Texto secundario de ejemplo</Text>
            <View style={[styles.pvTag, { backgroundColor: preview.accentSoft }]}>
              <Text style={{ color: preview.accent, fontWeight: '800' }}>Etiqueta dorada</Text>
            </View>
            <View style={[styles.pvBtn, { backgroundColor: preview.primary }]}>
              <Text style={styles.pvBtnText}>Botón principal</Text>
            </View>
          </View>
        </View>
      </Card>

      {current.mode === 'personalizado' ? (
        <>
          <Card>
            <H2>Paletas</H2>
            <Muted>Toca una para empezar con sus colores; luego puedes ajustar cada uno.</Muted>
            {PALETTE_PRESETS.map((p) => (
              <Chip key={p.id} label={p.name} selected={current.presetId === p.id} onPress={() => pickPreset(p.id)} />
            ))}
          </Card>

          <Card>
            <H2>Colores</H2>
            {PALETTE_KEYS.map((k) => {
              const text = drafts[k] ?? current.custom[k];
              const ok = normalizeHex(text) !== null;
              return (
                <View key={k} style={styles.colorRow}>
                  <View style={[styles.swatch, { backgroundColor: ok ? (normalizeHex(text) as string) : '#CCCCCC' }]} />
                  <Field
                    style={styles.colorField}
                    label={PALETTE_LABELS[k]}
                    value={text}
                    onChangeText={(t) => { setDrafts((d) => ({ ...d, [k]: t })); setSaved(false); }}
                    autoCapitalize="characters"
                    autoCorrect={false}
                    maxLength={7}
                    error={ok ? null : 'Usa el formato #RRGGBB'}
                  />
                </View>
              );
            })}
            <Button title="Volver a la paleta Morado y dorado" variant="secondary" onPress={() => pickPreset('morado-dorado')} />
          </Card>
        </>
      ) : null}

      <Button title="Guardar apariencia" onPress={() => void save()} loading={busy} disabled={!online} />
      {saved && __DEV__ && typeof DevSettings?.reload === 'function' ? (
        <Button title="Reiniciar la app ahora" variant="dark" onPress={() => DevSettings.reload()} />
      ) : null}
      <Button title="Restablecer a Claro" variant="secondary" onPress={() => { setTheme({ ...DEFAULT_THEME }); setDrafts({}); setSaved(false); }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  pvScreen: { borderWidth: 1, borderRadius: radius.md, padding: space.md },
  pvCard: { borderWidth: 1, borderRadius: radius.md, padding: space.md, gap: space.sm },
  pvTitle: { fontSize: 18, fontWeight: '800' },
  pvTag: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: space.md, paddingVertical: 4 },
  pvBtn: { borderRadius: radius.md, paddingVertical: space.md, alignItems: 'center' },
  pvBtnText: { color: '#FFFFFF', fontWeight: '800' },
  colorRow: { flexDirection: 'row', alignItems: 'flex-end', gap: space.md },
  colorField: { flex: 1 },
  swatch: { width: 44, height: 52, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, marginBottom: 2 },
});
