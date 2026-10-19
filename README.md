# rpc-vue

A Vue 3 binding that turns a `DecodedObservable` from
[@daemonarium/rpc](https://github.com/daemonarium/rpc-ts) into refs.

The npm package is `@daemonarium/rpc-vue`. This repository is
`daemonarium/rpc-vue`.

## Install

```
npm i @daemonarium/rpc-vue vue @daemonarium/rpc
```

## One call

```ts
import { useObservable } from '@daemonarium/rpc-vue'

const { items, state, error, maxTs, ready } = useObservable(observable)
```

The subscription starts when the component mounts and stops when it
unmounts. `items` lists live entries only. A tombstone (`value === null`)
stays on the decoded observable and is left out of `items`.

## Flush

```ts
useObservable(observable, { flush: 'microtask' })
```

`flush` is `raf` (the default), `microtask`, or `sync`.

## Build and test

```
npm install
npm run build
npm test
```

## License

MIT. Conduct is in `CODE_OF_CONDUCT.md`.
