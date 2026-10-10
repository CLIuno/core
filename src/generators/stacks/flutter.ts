import type { Ctx, FileSpec, Generator, Patch } from "../types";
import type { Field, FieldType } from "../fields";
import { labelField } from "../fields";

/** Fields DSL → Dart (documented on the API client; screens keep the template's `Map<String, dynamic>` items). */
const DART: Record<FieldType, string> = {
    string: "String",
    text: "String",
    int: "int",
    number: "double",
    boolean: "bool",
    date: "String",
    json: "Map<String, dynamic>",
};

function dartType(f: Field): string {
    return `${DART[f.type]}${f.nullable ? "?" : ""}`;
}

function title(f: Field): string {
    return f.pascal.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

function label(f: Field): string {
    if (f.type === "json") return `${title(f)} (JSON)`;
    return f.nullable && f.type !== "boolean" ? `${title(f)} (optional)` : title(f);
}

function indent(lines: string[], n: number): string[] {
    const pad = " ".repeat(n);
    return lines.map((l) => (l ? pad + l : l));
}

function needsConvert(fields: Field[]): boolean {
    return fields.some((f) => f.type === "json");
}

/** Dart expression that turns the form state into the JSON value sent to the API. */
function dartValue(f: Field, prefix: string): string {
    const text = `${prefix}${f.camel}Ctrl.text.trim()`;
    switch (f.type) {
        case "boolean":
            return `${prefix}${f.camel}`;
        case "int":
            return f.nullable ? `int.tryParse(${text})` : `int.tryParse(${text}) ?? 0`;
        case "number":
            return f.nullable ? `double.tryParse(${text})` : `double.tryParse(${text}) ?? 0`;
        case "json":
            return f.nullable
                ? `${text}.isEmpty ? null : jsonDecode(${text})`
                : `${text}.isEmpty ? <String, dynamic>{} : jsonDecode(${text})`;
        default:
            return f.nullable ? `${text}.isEmpty ? null : ${text}` : text;
    }
}

/** Interpolation used when showing a field from an item map. */
function dartDisplay(f: Field): string {
    const v = `item['${f.camel}']`;
    if (f.type === "boolean") return `\${${v} == true || ${v} == 1 ? 'Yes' : 'No'}`;
    return `\${${v} ?? ''}`;
}

/** One form field; `prefix` is "" for dialog locals and "_" for State fields. */
function input(f: Field, prefix: string, setter: string, autofocus: boolean): string[] {
    if (f.type === "boolean") {
        return [
            "SwitchListTile(",
            `  title: const Text('${label(f)}'),`,
            `  value: ${prefix}${f.camel},`,
            `  onChanged: (v) => ${setter}(() => ${prefix}${f.camel} = v),`,
            "),",
        ];
    }
    const lines = ["TextField(", `  controller: ${prefix}${f.camel}Ctrl,`];
    if (autofocus) lines.push("  autofocus: true,");
    if (f.type === "text" || f.type === "json") lines.push("  maxLines: 3,");
    if (f.type === "int") lines.push("  keyboardType: TextInputType.number,");
    if (f.type === "number") {
        lines.push(
            "  keyboardType: const TextInputType.numberWithOptions(",
            "    decimal: true,",
            "  ),",
        );
    }
    lines.push(`  decoration: const InputDecoration(labelText: '${label(f)}'),`, "),");
    return lines;
}

function api(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const P = names.pascal;
    const route = names.plural.kebab;
    const payload = fields.map((f) => `${f.camel}: ${dartType(f)}`).join(", ");
    return {
        path: `lib/apis/${names.snake}_api.dart`,
        content: `import 'package:dio/dio.dart';

import 'http.dart';

/// \`/${route}\` — payload: {${payload}}.
class ${P}Api {
  Future<Response<dynamic>> get${names.plural.pascal}() => http.get('/${route}');

  Future<Response<dynamic>> get${P}ById(String id) =>
      http.get('/${route}/\${id}');

  Future<Response<dynamic>> create${P}(Map<String, dynamic> data) =>
      http.post('/${route}', data: data);

  Future<Response<dynamic>> update${P}(String id, Map<String, dynamic> data) =>
      http.patch('/${route}/\${id}', data: data);

  Future<Response<dynamic>> delete${P}(String id) =>
      http.delete('/${route}/\${id}');
}

final ${names.camel}Api = ${P}Api();
`,
    };
}

function createDialog(ctx: Ctx): string[] {
    const { names, fields } = ctx;
    const hasBool = fields.some((f) => f.type === "boolean");
    const inputs = fields.flatMap((f, i) => input(f, "", "setDialogState", i === 0));
    const alert = [
        "AlertDialog(",
        `  title: const Text('New ${names.title.toLowerCase()}'),`,
        "  content: Column(",
        "    mainAxisSize: MainAxisSize.min,",
        "    children: [",
        ...indent(inputs, 6),
        "    ],",
        "  ),",
        "  actions: [",
        "    TextButton(",
        "      onPressed: () => Navigator.pop(ctx, false),",
        "      child: const Text('Cancel'),",
        "    ),",
        "    FilledButton(",
        "      onPressed: () => Navigator.pop(ctx, true),",
        "      child: const Text('Add'),",
        "    ),",
        "  ],",
        "),",
    ];
    const builder = hasBool
        ? [
              "builder: (ctx) => StatefulBuilder(",
              `  builder: (ctx, setDialogState) => ${alert[0]}`,
              ...indent(alert.slice(1), 2),
              "),",
          ]
        : [`builder: (ctx) => ${alert[0]}`, ...alert.slice(1)];
    return [
        "final ok = await showDialog<bool>(",
        "  context: context,",
        ...indent(builder, 2),
        ");",
    ];
}

function listScreen(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const P = names.pascal;
    const Pp = names.plural.pascal;
    const items = `_${names.plural.camel}`;
    const lbl = labelField(fields);
    const others = fields.filter((f) => f !== lbl);
    const locals = fields.map((f) =>
        f.type === "boolean"
            ? `    var ${f.camel} = false;`
            : `    final ${f.camel}Ctrl = TextEditingController();`,
    );
    const guard =
        lbl.type === "string" || lbl.type === "text"
            ? `    if (ok != true || ${lbl.camel}Ctrl.text.trim().isEmpty) return;`
            : "    if (ok != true) return;";
    const payload = fields.map((f) => `        '${f.camel}': ${dartValue(f, "")},`);
    const subtitle = others.map((f) => `Text('${title(f)}: ${dartDisplay(f)}'),`);
    return {
        path: `lib/screens/${names.plural.snake}_screen.dart`,
        content: `${needsConvert(fields) ? "import 'dart:convert';\n\n" : ""}import 'package:flutter/material.dart';

import '../apis/http.dart';
import '../apis/${names.snake}_api.dart';
import '../widgets/app_drawer.dart';
import '${names.snake}_detail_screen.dart';

class ${Pp}Screen extends StatefulWidget {
  const ${Pp}Screen({super.key});

  @override
  State<${Pp}Screen> createState() => _${Pp}ScreenState();
}

class _${Pp}ScreenState extends State<${Pp}Screen> {
  List<Map<String, dynamic>> ${items} = [];
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    try {
      final res = await ${names.camel}Api.get${Pp}();
      final list = (res.data['data'] as Map)['${names.plural.camel}'] as List? ?? [];
      if (!mounted) return;
      setState(() {
        ${items} = list.map((e) => (e as Map).cast<String, dynamic>()).toList();
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      _snack(apiMessage(e));
    }
  }

  void _snack(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<void> _add${P}() async {
${locals.join("\n")}
${indent(createDialog(ctx), 4).join("\n")}
${guard}
    try {
      await ${names.camel}Api.create${P}({
${payload.join("\n")}
      });
      await _load();
    } catch (e) {
      if (mounted) _snack(apiMessage(e));
    }
  }

  Future<void> _delete(Map<String, dynamic> item) async {
    try {
      await ${names.camel}Api.delete${P}('\${item['id']}');
      await _load();
    } catch (e) {
      if (mounted) _snack(apiMessage(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('${names.plural.title}')),
      drawer: const AppDrawer(),
      floatingActionButton: FloatingActionButton(
        onPressed: _add${P},
        child: const Icon(Icons.add),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _load,
              child: ${items}.isEmpty
                  ? ListView(
                      children: const [
                        Padding(
                          padding: EdgeInsets.all(32),
                          child: Center(
                            child: Text('No ${names.plural.title.toLowerCase()} yet — add one!'),
                          ),
                        ),
                      ],
                    )
                  : ListView.builder(
                      itemCount: ${items}.length,
                      itemBuilder: (context, i) {
                        final item = ${items}[i];
                        final author =
                            ((item['user'] as Map?)?['username'] ?? '')
                                as String;
                        return ListTile(
                          title: Text('${dartDisplay(lbl)}'),
                          subtitle: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            mainAxisSize: MainAxisSize.min,
                            children: [
${indent(subtitle, 30).join("\n")}${subtitle.length > 0 ? "\n" : ""}                              if (author.isNotEmpty)
                                Text(
                                  '@$author',
                                  style: Theme.of(context).textTheme.bodySmall,
                                ),
                            ],
                          ),
                          trailing: IconButton(
                            icon: const Icon(Icons.delete_outline),
                            onPressed: () => _delete(item),
                          ),
                          onTap: () async {
                            await Navigator.push(
                              context,
                              MaterialPageRoute(
                                builder: (_) =>
                                    ${P}DetailScreen(id: '\${item['id']}'),
                              ),
                            );
                            await _load();
                          },
                        );
                      },
                    ),
            ),
    );
  }
}
`,
    };
}

function detailScreen(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const P = names.pascal;
    const textFields = fields.filter((f) => f.type !== "boolean");
    const boolFields = fields.filter((f) => f.type === "boolean");
    const state = [
        ...textFields.map((f) => `  final _${f.camel}Ctrl = TextEditingController();`),
        "  bool _loading = true;",
        ...boolFields.map((f) => `  bool _${f.camel} = false;`),
    ];
    const dispose = textFields.map((f) => `    _${f.camel}Ctrl.dispose();`);
    const load = fields.map((f) => {
        const v = `item['${f.camel}']`;
        if (f.type === "boolean") return `        _${f.camel} = ${v} == true || ${v} == 1;`;
        if (f.type === "json") {
            return `        _${f.camel}Ctrl.text = ${v} == null ? '' : jsonEncode(${v});`;
        }
        return `        _${f.camel}Ctrl.text = '\${${v} ?? ''}';`;
    });
    const payload = fields.map((f) => `        '${f.camel}': ${dartValue(f, "_")},`);
    const inputs = fields.flatMap((f, i) => [
        ...(i > 0 ? ["const SizedBox(height: 12),"] : []),
        ...input(f, "_", "setState", false),
    ]);
    return {
        path: `lib/screens/${names.snake}_detail_screen.dart`,
        content: `${needsConvert(fields) ? "import 'dart:convert';\n\n" : ""}import 'package:flutter/material.dart';

import '../apis/http.dart';
import '../apis/${names.snake}_api.dart';

class ${P}DetailScreen extends StatefulWidget {
  const ${P}DetailScreen({super.key, required this.id});

  final String id;

  @override
  State<${P}DetailScreen> createState() => _${P}DetailScreenState();
}

class _${P}DetailScreenState extends State<${P}DetailScreen> {
${state.join("\n")}

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
${dispose.join("\n")}${dispose.length > 0 ? "\n" : ""}    super.dispose();
  }

  Future<void> _load() async {
    try {
      final res = await ${names.camel}Api.get${P}ById(widget.id);
      final item = ((res.data['data'] as Map)['${names.camel}'] as Map)
          .cast<String, dynamic>();
      if (!mounted) return;
      setState(() {
${load.join("\n")}
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() => _loading = false);
      _snack(apiMessage(e));
    }
  }

  void _snack(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  Future<void> _save() async {
    try {
      await ${names.camel}Api.update${P}(widget.id, {
${payload.join("\n")}
      });
      if (!mounted) return;
      _snack('${names.title} saved');
    } catch (e) {
      if (mounted) _snack(apiMessage(e));
    }
  }

  Future<void> _delete() async {
    try {
      await ${names.camel}Api.delete${P}(widget.id);
      if (!mounted) return;
      Navigator.pop(context);
    } catch (e) {
      if (mounted) _snack(apiMessage(e));
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('${names.title}'),
        actions: [
          IconButton(
            icon: const Icon(Icons.delete_outline),
            onPressed: _delete,
          ),
        ],
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: const EdgeInsets.all(16),
              children: [
${indent(inputs, 16).join("\n")}
                const SizedBox(height: 8),
                FilledButton(onPressed: _save, child: const Text('Save')),
              ],
            ),
    );
  }
}
`,
    };
}

function store(ctx: Ctx): FileSpec {
    const { names } = ctx;
    const P = names.pascal;
    return {
        path: `lib/stores/${names.snake}_store.dart`,
        content: `import 'package:flutter/foundation.dart';

import '../apis/http.dart';
import '../apis/${names.snake}_api.dart';

/// App-wide ${names.title} list (same singleton ChangeNotifier shape as AuthStore).
class ${P}Store extends ChangeNotifier {
  ${P}Store._();

  static final ${P}Store instance = ${P}Store._();

  List<Map<String, dynamic>> items = [];
  bool loading = false;
  String? error;

  Future<void> fetchAll() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      final res = await ${names.camel}Api.get${names.plural.pascal}();
      final list = (res.data['data'] as Map)['${names.plural.camel}'] as List? ?? [];
      items = list.map((e) => (e as Map).cast<String, dynamic>()).toList();
    } catch (e) {
      error = apiMessage(e);
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  Future<void> remove(String id) async {
    await ${names.camel}Api.delete${P}(id);
    items = items.where((item) => '\${item['id']}' != id).toList();
    notifyListeners();
  }
}
`,
    };
}

function component(ctx: Ctx): FileSpec {
    const { names } = ctx;
    return {
        path: `lib/widgets/${names.snake}.dart`,
        content: `import 'package:flutter/material.dart';

/// ${names.title} — reusable widget stub, edit freely.
class ${names.pascal} extends StatelessWidget {
  const ${names.pascal}({super.key});

  @override
  Widget build(BuildContext context) {
    return const Card(
      child: Padding(
        padding: EdgeInsets.all(16),
        child: Text('${names.title}'),
      ),
    );
  }
}
`,
    };
}

function routePatches(ctx: Ctx): Patch[] {
    const { names } = ctx;
    const screen = `${names.plural.pascal}Screen`;
    const file = `screens/${names.plural.snake}_screen.dart`;
    return [
        {
            path: "lib/main.dart",
            anchor: /^import 'screens\/\w+\.dart';$/m,
            where: "after",
            insert: `\nimport '${file}';`,
            skipIf: file,
            describe: `import ${screen}`,
        },
        {
            path: "lib/main.dart",
            anchor: /^\s*'\/[\w-]+': \(_\) => const \w+\(\),$/m,
            where: "after",
            insert: `\n        '/${names.plural.kebab}': (_) => const ${screen}(),`,
            skipIf: `'/${names.plural.kebab}':`,
            describe: `register the /${names.plural.kebab} route`,
        },
    ];
}

function drawerNote(ctx: Ctx): string {
    const { names } = ctx;
    return `Add a drawer entry in lib/widgets/app_drawer.dart: _item(context, Icons.widgets_outlined, '${names.plural.title}', '/${names.plural.kebab}')`;
}

export const flutter: Generator = {
    id: "flutter",
    label: "Flutter",
    kind: "mobile",
    format: (files) => ({ bin: "dart", args: ["format", ...files], quiet: true }),
    commands: {
        resource: {
            describe:
                "Dio API client + list screen (create dialog, delete) + detail screen, route added to lib/main.dart",
            files: (ctx) => [api(ctx), listScreen(ctx), detailScreen(ctx)],
            patches: routePatches,
            notes: (ctx) => [drawerNote(ctx)],
        },
        api: {
            describe: "Dio API client class in lib/apis/ (import it directly — no registry)",
            files: (ctx) => [api(ctx)],
        },
        page: {
            describe: "list + detail screens in lib/screens/ (+ route in lib/main.dart)",
            files: (ctx) => [listScreen(ctx), detailScreen(ctx)],
            patches: routePatches,
            notes: (ctx) => [drawerNote(ctx)],
        },
        store: {
            describe: "singleton ChangeNotifier store in lib/stores/",
            files: (ctx) => [store(ctx)],
        },
        component: {
            describe: "StatelessWidget stub in lib/widgets/",
            files: (ctx) => [component(ctx)],
        },
    },
};
