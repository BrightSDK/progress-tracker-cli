# progress-tracker-cli

> CLI progress bar with ETA estimation and step-based tracking, powered by progress-tracker-core.

[![Lint](https://github.com/BrightSDK/progress-tracker-cli/actions/workflows/lint.yml/badge.svg)](https://github.com/BrightSDK/progress-tracker-cli/actions/workflows/lint.yml)
[![Test](https://github.com/BrightSDK/progress-tracker-cli/actions/workflows/test.yml/badge.svg)](https://github.com/BrightSDK/progress-tracker-cli/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org)

## Installation

```bash
npm install github:BrightSDK/progress-tracker-cli
```

## Usage

```js
const createProgressTracker = require('brd-ono-util-progress-tracker-cli');

const tracker = createProgressTracker({
  name: 'my-build',
  summary: { enabled: true },
});

tracker.start();

tracker.updateStep({ name: 'download', endPercentage: 40 });
await downloadFiles();

tracker.updateStep({ name: 'extract', endPercentage: 70 });
await extractArchive();

tracker.updateStep({ name: 'install', endPercentage: 100 });
await installDeps();

tracker.finish();
tracker.summary();
```

## Features

- Real-time progress bar with ETA display
- Step-based progress with automatic percentage interpolation
- History-based ETA that learns from previous runs
- Process timing summary
- Configurable update interval and format

## API

### `createProgressTracker(options)`

| Option           | Type           | Default                                         | Description                        |
| ---------------- | -------------- | ----------------------------------------------- | ---------------------------------- |
| `name`           | string         | `'app'`                                         | Name for persistent history        |
| `debug`          | boolean        | `false`                                         | Enable debug output                |
| `updateInterval` | number         | `100`                                           | Progress bar refresh interval (ms) |
| `format`         | string         | `'{bar} {percentage}% \| {etaDisplay}{status}'` | Bar format                         |
| `summary`        | object/boolean | `{ enabled: true }`                             | Summary configuration              |

### Methods

| Method                                 | Description               |
| -------------------------------------- | ------------------------- |
| `.start()`                             | Start the progress bar    |
| `.updateStep({ name, endPercentage })` | Advance to next step      |
| `.getProgress()`                       | Get current progress data |
| `.finish({ message })`                 | Complete at 100%          |
| `.summary()`                           | Print timing summary      |

## License

[MIT](LICENSE)
