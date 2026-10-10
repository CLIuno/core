import type { Ctx, FileSpec, Generator, Patch } from "../types";
import type { Field, FieldType } from "../fields";
import { labelField } from "../fields";
import { oxfmt } from "./shared";

const TS: Record<FieldType, string> = {
    string: "string",
    text: "string",
    int: "number",
    number: "number",
    boolean: "boolean",
    date: "string",
    json: "Record<string, unknown>",
};

const COLORS = `const colors = {
  primary: '#2563eb',
  danger: '#dc2626',
  success: '#16a34a',
  text: '#111827',
  muted: '#6b7280',
  border: '#d1d5db',
  card: '#ffffff',
  bg: '#f3f4f6',
}`;

const ERR_MSG = `function errMsg(err: unknown): string {
  if (axios.isAxiosError(err)) return err.response?.data?.message || err.message
  return err instanceof Error ? err.message : 'Something went wrong'
}`;

function title(f: Field): string {
    return f.pascal.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

function label(f: Field): string {
    if (f.type === "json") return `${title(f)} (JSON)`;
    return f.nullable && f.type !== "boolean" ? `${title(f)} (optional)` : title(f);
}

/** Backends on SQLite serialize booleans as 0/1 — the model mirrors the template's `is_completed` type. */
function modelType(f: Field): string {
    const base = f.type === "boolean" ? "boolean | 0 | 1" : TS[f.type];
    return `${f.camel}${f.nullable ? "?" : ""}: ${base}${f.nullable ? " | null" : ""}`;
}

function iface(ctx: Ctx): string {
    const { names, fields } = ctx;
    return `interface ${names.pascal} {
  id: string | number
${fields.map((f) => `  ${modelType(f)}`).join("\n")}
  user?: { id: string | number; username?: string } | null
}`;
}

function inputType(fields: Field[], partial: boolean): string {
    return `{ ${fields
        .map(
            (f) =>
                `${f.camel}${partial || f.nullable ? "?" : ""}: ${TS[f.type]}${f.nullable ? " | null" : ""}`,
        )
        .join("; ")} }`;
}

function api(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const P = names.pascal;
    const route = names.plural.kebab;
    return {
        path: `src/apis/${names.kebab}-api.ts`,
        content: `import http from './http'

const ${names.camel}Api = {
  getAll${names.plural.pascal}: () => http.get('/${route}'),
  get${P}ById: (id: string) => http.get(\`/${route}/\${id}\`),
  create${P}: (data: ${inputType(fields, false)}) => http.post('/${route}', data),
  update${P}: (id: string, data: ${inputType(fields, true)}) =>
    http.patch(\`/${route}/\${id}\`, data),
  delete${P}: (id: string) => http.delete(\`/${route}/\${id}\`),
}

export default ${names.camel}Api
`,
    };
}

function stateLine(f: Field): string {
    const init = f.type === "boolean" ? "false" : "''";
    return `  const [${f.camel}, set${f.pascal}] = useState(${init})`;
}

function resetLine(f: Field): string {
    return `set${f.pascal}(${f.type === "boolean" ? "false" : "''"})`;
}

/** Expression sent to the API from the string/boolean form state. */
function payloadLine(f: Field): string {
    const c = f.camel;
    switch (f.type) {
        case "boolean":
            return `${c},`;
        case "int":
            return f.nullable
                ? `${c}: ${c}.trim() ? Number.parseInt(${c}, 10) : null,`
                : `${c}: Number.parseInt(${c}, 10) || 0,`;
        case "number":
            return f.nullable
                ? `${c}: ${c}.trim() ? Number(${c}) : null,`
                : `${c}: Number(${c}) || 0,`;
        case "json":
            return f.nullable
                ? `${c}: ${c}.trim() ? (JSON.parse(${c}) as Record<string, unknown>) : null,`
                : `${c}: ${c}.trim() ? (JSON.parse(${c}) as Record<string, unknown>) : {},`;
        default:
            return f.nullable ? `${c}: ${c}.trim() || null,` : `${c}: ${c}.trim(),`;
    }
}

/** Fill the form state from a loaded item. */
function loadLine(f: Field, source: string): string {
    const v = `${source}.${f.camel}`;
    if (f.type === "boolean") return `set${f.pascal}(${v} === true || ${v} === 1)`;
    if (f.type === "json") return `set${f.pascal}(${v} ? JSON.stringify(${v}) : '')`;
    if (f.type === "int" || f.type === "number") return `set${f.pascal}(String(${v} ?? ''))`;
    return `set${f.pascal}(${v} ?? '')`;
}

function display(f: Field, source: string): string {
    const v = `${source}.${f.camel}`;
    if (f.type === "boolean") return `{${v} === true || ${v} === 1 ? 'Yes' : 'No'}`;
    if (f.type === "json") return `{${v} ? JSON.stringify(${v}) : '—'}`;
    return f.nullable ? `{${v} ?? '—'}` : `{${v}}`;
}

function textInput(f: Field, placeholder: string): string[] {
    const multi = f.type === "text" || f.type === "json";
    const lines = [
        "<TextInput",
        `  style={${multi ? "[styles.input, styles.multiline]" : "styles.input"}}`,
        `  placeholder="${placeholder}"`,
        "  placeholderTextColor={colors.muted}",
        `  value={${f.camel}}`,
        `  onChangeText={set${f.pascal}}`,
    ];
    if (f.type === "int") lines.push('  keyboardType="numeric"');
    if (f.type === "number") lines.push('  keyboardType="decimal-pad"');
    if (multi) lines.push("  multiline");
    lines.push("/>");
    return lines;
}

function switchRow(f: Field): string[] {
    return [
        "<View style={styles.switchRow}>",
        `  <Text style={styles.switchLabel}>${title(f)}</Text>`,
        `  <Switch value={${f.camel}} onValueChange={set${f.pascal}} />`,
        "</View>",
    ];
}

function indent(lines: string[], n: number): string {
    const pad = " ".repeat(n);
    return lines
        .flatMap((l) => l.split("\n"))
        .map((l) => (l ? pad + l : l))
        .join("\n");
}

function rnImports(fields: Field[], extra: string[]): string {
    const names = new Set([
        "ActivityIndicator",
        "Alert",
        "Pressable",
        "StyleSheet",
        "Text",
        "View",
        ...extra,
    ]);
    if (fields.some((f) => f.type === "boolean")) names.add("Switch");
    if (fields.some((f) => f.type !== "boolean")) names.add("TextInput");
    return `import {\n${[...names]
        .sort()
        .map((n) => `  ${n},`)
        .join("\n")}\n} from 'react-native'`;
}

function extraStyles(fields: Field[]): string {
    const out: string[] = [];
    if (fields.some((f) => f.type === "text" || f.type === "json")) {
        out.push(`  multiline: {
    minHeight: 90,
    textAlignVertical: 'top',
  },`);
    }
    if (fields.some((f) => f.type === "boolean")) {
        out.push(`  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 8,
  },
  switchLabel: {
    fontSize: 15,
    color: colors.text,
  },`);
    }
    return out.length > 0 ? `\n${out.join("\n")}` : "";
}

function listScreen(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const P = names.pascal;
    const Pp = names.plural.pascal;
    const items = names.plural.camel;
    const lbl = labelField(fields);
    const others = fields.filter((f) => f !== lbl);
    const guard =
        lbl.type === "string" || lbl.type === "text"
            ? `    if (!${lbl.camel}.trim()) {
      Alert.alert('Error', 'Please enter a ${title(lbl).toLowerCase()}')
      return
    }
`
            : "";
    const form = fields.flatMap((f) =>
        f.type === "boolean" ? switchRow(f) : textInput(f, label(f)),
    );
    return {
        path: `src/app/(tabs)/${names.plural.kebab}.tsx`,
        content: `import { useCallback, useState } from 'react'
${rnImports(fields, ["FlatList", "RefreshControl"])}
import { useFocusEffect, useRouter } from 'expo-router'
import axios from 'axios'

import api from '@/apis'

${COLORS}

${iface(ctx)}

${ERR_MSG}

export default function ${Pp}Screen() {
  const router = useRouter()
  const [${items}, set${Pp}] = useState<${P}[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
${fields.map(stateLine).join("\n")}
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await api.${names.camel}.getAll${Pp}()
      set${Pp}(res.data.data.${items} ?? [])
    } catch (err) {
      Alert.alert('Error', errMsg(err))
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useFocusEffect(
    useCallback(() => {
      load()
    }, [load]),
  )

  const onRefresh = () => {
    setRefreshing(true)
    load()
  }

  const create${P} = async () => {
${guard}    setCreating(true)
    try {
      await api.${names.camel}.create${P}({
${indent(fields.map(payloadLine), 8)}
      })
${indent(fields.map(resetLine), 6)}
      await load()
    } catch (err) {
      Alert.alert('Error', errMsg(err))
    } finally {
      setCreating(false)
    }
  }

  const delete${P} = async (id: ${P}['id']) => {
    try {
      await api.${names.camel}.delete${P}(String(id))
      await load()
    } catch (err) {
      Alert.alert('Error', errMsg(err))
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  return (
    <View style={styles.screen}>
      <View style={styles.form}>
${indent(form, 8)}
        <Pressable style={styles.addButton} onPress={create${P}} disabled={creating}>
          {creating ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.addButtonText}>Add ${names.title.toLowerCase()}</Text>
          )}
        </Pressable>
      </View>

      <FlatList
        data={${items}}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <Text style={styles.empty}>No ${names.plural.title.toLowerCase()} yet. Add your first one!</Text>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => router.push(\`/${names.plural.kebab}/\${String(item.id)}\`)}
          >
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>${display(lbl, "item")}</Text>
${indent(
    others.map(
        (f) => `<Text style={styles.cardSubtitle}>
  ${title(f)}: ${display(f, "item")}
</Text>`,
    ),
    14,
)}${others.length > 0 ? "\n" : ""}              {!!item.user?.username && <Text style={styles.cardMeta}>@{item.user.username}</Text>}
            </View>
            <Pressable onPress={() => delete${P}(item.id)} hitSlop={8}>
              <Text style={styles.delete}>✕</Text>
            </Pressable>
          </Pressable>
        )}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  form: {
    padding: 16,
    paddingBottom: 8,
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    color: colors.text,
    marginBottom: 8,
  },${extraStyles(fields)}
  addButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
    paddingTop: 8,
  },
  empty: {
    textAlign: 'center',
    color: colors.muted,
    marginTop: 32,
    fontSize: 15,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  cardBody: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  cardSubtitle: {
    fontSize: 14,
    color: colors.muted,
    marginTop: 2,
  },
  cardMeta: {
    fontSize: 12,
    color: colors.muted,
    marginTop: 4,
  },
  delete: {
    color: colors.danger,
    fontSize: 18,
    paddingHorizontal: 6,
  },
})
`,
    };
}

function detailScreen(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const P = names.pascal;
    const item = names.camel;
    const idVar = `${item}Id`;
    const lbl = labelField(fields);
    const guard =
        lbl.type === "string" || lbl.type === "text"
            ? `    if (!${lbl.camel}.trim()) {
      Alert.alert('Error', '${title(lbl)} cannot be empty')
      return
    }
`
            : "";
    const form = fields.flatMap((f) =>
        f.type === "boolean"
            ? switchRow(f)
            : [`<Text style={styles.label}>${label(f)}</Text>`, ...textInput(f, title(f))],
    );
    return {
        path: `src/app/${names.plural.kebab}/[id].tsx`,
        content: `import { useCallback, useEffect, useState } from 'react'
${rnImports(fields, ["ScrollView"])}
import { useLocalSearchParams, useRouter } from 'expo-router'
import axios from 'axios'

import api from '@/apis'

${COLORS}

${iface(ctx)}

${ERR_MSG}

export default function ${P}DetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const ${idVar} = String(id)
  const router = useRouter()
  const [${item}, set${P}] = useState<${P} | null>(null)
  const [loading, setLoading] = useState(true)
${fields.map(stateLine).join("\n")}
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await api.${item}.get${P}ById(${idVar})
      const data: ${P} = res.data.data.${item}
      set${P}(data)
${indent(
    fields.map((f) => loadLine(f, "data")),
    6,
)}
    } catch (err) {
      Alert.alert('Error', errMsg(err))
    } finally {
      setLoading(false)
    }
  }, [${idVar}])

  useEffect(() => {
    load()
  }, [load])

  const save = async () => {
${guard}    setSaving(true)
    try {
      await api.${item}.update${P}(${idVar}, {
${indent(fields.map(payloadLine), 8)}
      })
      Alert.alert('Success', '${names.title} updated')
      await load()
    } catch (err) {
      Alert.alert('Error', errMsg(err))
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    try {
      await api.${item}.delete${P}(${idVar})
      router.back()
    } catch (err) {
      Alert.alert('Error', errMsg(err))
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    )
  }

  if (!${item}) {
    return (
      <View style={styles.center}>
        <Text style={styles.empty}>${names.title} not found</Text>
      </View>
    )
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
${indent(form, 6)}

      <Pressable style={styles.saveButton} onPress={save} disabled={saving}>
        {saving ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.saveButtonText}>Save changes</Text>
        )}
      </Pressable>

      {!!${item}.user?.username && <Text style={styles.meta}>@{${item}.user.username}</Text>}

      <Pressable style={styles.deleteButton} onPress={remove}>
        <Text style={styles.deleteText}>Delete ${names.title.toLowerCase()}</Text>
      </Pressable>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    color: colors.muted,
    fontSize: 15,
  },
  content: {
    padding: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.text,
    marginBottom: 16,
  },${extraStyles(fields)}
  saveButton: {
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  saveButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  meta: {
    color: colors.muted,
    fontSize: 13,
    marginTop: 12,
  },
  deleteButton: {
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 12,
  },
  deleteText: {
    color: colors.danger,
    fontSize: 15,
    fontWeight: '600',
  },
})
`,
    };
}

function store(ctx: Ctx): FileSpec {
    const { names } = ctx;
    const P = names.pascal;
    return {
        path: `src/stores/${names.kebab}.ts`,
        content: `import { create } from 'zustand'

import api from '../apis'

export ${iface(ctx)}

interface ${P}State {
  items: ${P}[]
  loading: boolean
  fetchAll: () => Promise<void>
  remove: (id: ${P}['id']) => Promise<void>
}

export const use${P}Store = create<${P}State>((set) => ({
  items: [],
  loading: false,

  fetchAll: async () => {
    set({ loading: true })
    try {
      const res = await api.${names.camel}.getAll${names.plural.pascal}()
      set({ items: res.data.data.${names.plural.camel} ?? [] })
    } finally {
      set({ loading: false })
    }
  },

  remove: async (id) => {
    await api.${names.camel}.delete${P}(String(id))
    set((state) => ({ items: state.items.filter((item) => String(item.id) !== String(id)) }))
  },
}))
`,
    };
}

function component(ctx: Ctx): FileSpec {
    const { names } = ctx;
    const P = names.pascal;
    return {
        path: `src/components/${P}.tsx`,
        content: `import { StyleSheet, Text, View } from 'react-native'

interface ${P}Props {
  title?: string
}

export default function ${P}({ title = '${names.title}' }: ${P}Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#111827',
  },
})
`,
    };
}

function apiPatches(ctx: Ctx): Patch[] {
    const { names } = ctx;
    return [
        {
            path: "src/apis/index.ts",
            anchor: /^import \w+ from '\.\/[\w-]+-api'$/m,
            where: "after",
            insert: `\nimport ${names.camel}Api from './${names.kebab}-api'`,
            skipIf: `./${names.kebab}-api`,
            describe: `import ${names.kebab}-api`,
        },
        {
            path: "src/apis/index.ts",
            anchor: /^  \w+: \w+Api,$/m,
            where: "after",
            insert: `\n  ${names.camel}: ${names.camel}Api,`,
            skipIf: `${names.camel}: ${names.camel}Api`,
            describe: `expose api.${names.camel}`,
        },
    ];
}

function routePatches(ctx: Ctx): Patch[] {
    const { names } = ctx;
    const kp = names.plural.kebab;
    return [
        {
            path: "src/app/(tabs)/_layout.tsx",
            anchor: /^\s*<\/Tabs>$/m,
            where: "before",
            insert: `      <Tabs.Screen
        name="${kp}"
        options={{
          title: '${names.plural.title}',
          tabBarIcon: ({ color, size }) => <TabIcon glyph="◆" color={color} size={size} />,
        }}
      />
`,
            skipIf: `name="${kp}"`,
            describe: `add the ${kp} tab`,
        },
        {
            path: "src/app/_layout.tsx",
            anchor: /^\s*<\/Stack>$/m,
            where: "before",
            insert: `      <Stack.Screen name="${kp}/[id]" options={{ title: '${names.title}' }} />\n`,
            skipIf: `name="${kp}/[id]"`,
            describe: `register the ${kp}/[id] stack screen`,
        },
    ];
}

function tabNote(ctx: Ctx): string {
    return `The ${ctx.names.plural.kebab} tab was added to src/app/(tabs)/_layout.tsx — change its glyph or order there (restart "expo start" to pick up the new routes).`;
}

export const reactnative: Generator = {
    id: "reactnative",
    label: "React Native",
    kind: "mobile",
    format: oxfmt,
    commands: {
        resource: {
            describe:
                "axios API module + tab list screen (inline create form, delete) + detail screen, registered in src/apis/index.ts and the expo-router layouts",
            files: (ctx) => [api(ctx), listScreen(ctx), detailScreen(ctx)],
            patches: (ctx) => [...apiPatches(ctx), ...routePatches(ctx)],
            notes: (ctx) => [tabNote(ctx)],
        },
        api: {
            describe: "axios API module in src/apis/ (+ registered in src/apis/index.ts)",
            files: (ctx) => [api(ctx)],
            patches: apiPatches,
        },
        page: {
            describe: "tab list screen + detail route under src/app/ (+ layout entries)",
            files: (ctx) => [listScreen(ctx), detailScreen(ctx)],
            patches: routePatches,
            notes: (ctx) => [tabNote(ctx)],
        },
        store: { describe: "zustand store in src/stores/", files: (ctx) => [store(ctx)] },
        component: {
            describe: "plain StyleSheet component stub in src/components/",
            files: (ctx) => [component(ctx)],
        },
    },
};
