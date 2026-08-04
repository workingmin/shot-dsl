# Shot DSL prototype

Internal prototype for converting Storyboarder-style shot descriptions into a live wireframe preview.

## Run locally

Requirements: Node.js 22 or newer.

```bash
npm install
npm run dev
```

Open <http://127.0.0.1:4173>.

For a production-style local build:

```bash
npm run build
npm start
```

## Prototype scope

- textarea input with a 180 ms live-render debounce;
- historical Storyboarder STS phrase parsing;
- male, female, and box-model character rendering;
- shot size, composition, angle, lens, lighting, room, and pose parameters;
- deterministic defaults derived from the normalized input text;
- WebGL canvas preview and parsed-parameter inspection.

The historical code and assets are isolated under `prototype/upstream`. A future production implementation should replace that directory with an independent parser, scene AST, and renderer.
