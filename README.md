# MockMate

Chrome extension for mocking REST & GraphQL APIs. Built with **Vite + Preact + TypeScript + SCSS Modules + Preact Signals**.

## Stack

| Tool            | Role                |
| --------------- | ------------------- |
| Vite            | Build tool          |
| Preact          | UI framework        |
| preact-iso      | Client-side routing |
| @preact/signals | State management    |
| TypeScript      | Type safety         |
| SCSS Modules    | Scoped styling      |
| Prettier        | Code formatting     |

## Development

```bash
npm install        # Vite dev server at localhost:5173
```

## Building the extension

```bash
npm run build:ext
```

This runs `vite build` then `scripts/build-ext.mjs`, producing `dist-ext/`.

## Installing in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select `dist-ext/`
