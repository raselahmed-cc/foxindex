// Deliberately the only two lines that run before the real entry point.
//
// esbuild (what tsx uses under the hood) hoists every `import` in a file
// above regular statements in its CJS output — unlike tsc, which preserves
// source order. main.ts tried loading .env as its first statement, textually
// before `import { AppModule } from './app.module'` — but that import still
// got hoisted above it, and AppModule's own `@Module({...})` decorator
// evaluates `ConfigModule.forRoot(...)` (and, via AuthModule -> AuthGuard,
// pulls in @foxindex/auth, which reads process.env at import time too) the
// moment app.module.ts is required, not when NestFactory.create() "starts"
// the app. So process.env.DATABASE_URL etc. were still undefined when that
// ran, even though main.ts's own dotenv call — a few lines "earlier" in
// source — genuinely had populated them by the time its own code ran.
//
// process.loadEnvFile() is a plain call on the global `process` object, not
// an import — there is nothing here for esbuild to hoist. require('./main')
// is an ordinary function call too, evaluated exactly where it's written, so
// nothing main.ts imports (however deep, however many things they read from
// process.env at their own import time) can run before this line does.
// Best-effort: CI and any real deploy target provide DATABASE_URL etc.
// directly in the process environment and have no .env file at all — that's
// fine, loadApiEnv()'s zod validation still fails loudly and clearly if
// nothing provided the required vars either way.
try {
  // require(), not import — an import here would be hoisted above this line
  // by the exact esbuild behavior this file exists to route around.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require('node:path') as typeof import('node:path');
  process.loadEnvFile(path.resolve(__dirname, '../../../.env'));
} catch {
  // no .env file here — rely on whatever already set process.env
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
require('./main');
