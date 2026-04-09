# 3.5 Category-Theoretic Plugin Architecture

## Mathematical Principle

Plugins should form a **Kleisli category** where:
- Objects are context types
- Morphisms are plugins (Ctx₁ → Ctx₂)
- Composition is plugin composition
- Identity is the empty plugin

```typescript
// Plugin as a Kleisli arrow
type PluginK<From, To> = (ctx: From) => PluginResult<To>

// Plugin composition (Kleisli composition)
const composePlugins = <A, B, C>(
  f: PluginK<A, B>,
  g: PluginK<B, C>
): PluginK<A, C> => (ctx) => {
  const resultA = f(ctx)
  return {
    ...resultA,
    plugins: [...resultA.plugins, ...resultA.ctx | g | resultA.ctx],
  }
}
```

## Practical Implementation

```typescript
// Plugin as a functor (preserves structure)
interface Plugin<Ctx, ExtendedCtx> {
  name: string
  extend: (ctx: Ctx) => HKT<PluginM, ExtendedCtx>  // Functorial map
}

// Plugin monoid (combination)
const combinePlugins = <Ctx>(
  ...plugins: Plugin<Ctx, any>[]
): Plugin<Ctx, CombinedExtended> =>
  ({
    name: 'combined',
    extend: (ctx) => pipe(
      plugins,
      traverse((p) => p.extend(ctx)),  // Applicative traverse
      map((extended) => mergeAll(extended))
    )
  })

// Natural transformation between plugin types
type PluginNT<From extends PluginAny, To extends PluginAny> =
  <A>(p: From<A>) => To<p['extend'] extends (ctx: any) => infer R ? R : never>

// Plugin morphism (transform one plugin into another)
const pluginMapper = <From extends PluginAny, To extends PluginAny>(
  nt: PluginNT<From, To>
): ((plugin: From) => To) =>
  (plugin) => ({
    name: plugin.name,
    extend: (ctx) => nt(plugin.extend(ctx)),
  })
```

## Expected Benefits

| Benefit | Description |
|---------|-------------|
| **Composable plugins** | Combine plugins with known composition laws |
| **Type-safe extension** | Extended context type computed from plugin combination |
| **Plugin transformers** | Transform plugins (e.g., add logging to any plugin) |

## Killer Feature: Plugin Algebra

```typescript
// Plugin combinators as algebraic operations
const Plugin: {
  // Identity
  empty: Plugin<{}, {}>

  // Product (combine two plugins)
  product: <P1 extends PluginAny, P2 extends PluginAny>(
    p1: P1,
    p2: P2
  ) => Plugin<Ctx1 & Ctx2, Extended1 & Extended2>

  // Coproduct (alternative plugins)
  coproduct: <P1 extends PluginAny, P2 extends PluginAny>(
    p1: P1,
    p2: P2
  ) => Plugin<Ctx1 | Ctx2, Extended1 | Extended2>

  // Exponential (plugin configuration)
  config: <P extends PluginAny, Config>(
    configSchema: Schema<Config>,
    makePlugin: (config: Config) => P
  ) => Plugin<Ctx, Extended>
} = {
  // ... implementation
}

// Usage:
const authPlugin = Plugin.coproduct(
  { name: 'basic-auth', extend: (ctx) => ({ userId: null }) },
  { name: 'jwt-auth', extend: (ctx) => ({ token: null }) },
)

const fullPlugin = Plugin.product(
  authPlugin,
  Plugin.product(cachePlugin, loggerPlugin)
)
```
