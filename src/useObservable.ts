/**
 * Bind a DecodedObservable to Vue refs.
 *
 * Tombstones (value === null) are filtered here, not in the observable: the
 * decoded layer keeps them so non-Vue consumers can see deletions. `items`
 * only contains live entries.
 *
 * The subscription starts on mount and ends on unmount. When this component is
 * the last own consumer, the decoded observable unsubscribes its source, which
 * cancels the underlying stream.
 */

import { onBeforeUnmount, onMounted, ref, shallowRef, type Ref, type ShallowRef } from 'vue'
import {
  ObservablePromise,
  type DecodedConsumer,
  type DecodedEntry,
  type DecodedObservable,
  type DecodedOutput,
  type ObservableState,
} from '@daemonarium/rpc'

export interface UseObservableOptions {
  flush?: 'raf' | 'microtask' | 'sync'  // default 'raf'
}

export interface UseObservableResult<K, V> {
  items: ShallowRef<Array<{ key: K, value: V, ts: bigint }>>
  state: Ref<ObservableState>
  error: Ref<unknown>
  maxTs: Ref<bigint>
  ready: ObservablePromise
}

export function useObservable<K, V>(
  observable: DecodedObservable<K, V>,
  options?: UseObservableOptions,
): UseObservableResult<K, V> {
  const items = shallowRef<Array<{ key: K, value: V, ts: bigint }>>([])
  // Initialized empty: the observable is idle until the first consumer
  // subscribes on mount, so the real state is read inside the lifecycle.
  const state = ref<ObservableState>('idle' as ObservableState)
  const error = ref<unknown>(null)
  const maxTs = ref(0n)
  let dirty = false
  let scheduled = false
  let output: DecodedOutput<K, V> | null = null

  const flush = () => {
    scheduled = false
    if (!dirty) return
    dirty = false
    items.value = observable.getEntries()
      .filter((e): e is DecodedEntry<K, V> & { value: V } => e.value !== null)
    state.value = observable.state()
    error.value = observable.lastError()
    maxTs.value = observable.maxTs()
  }

  const schedule = () => {
    if (scheduled) return
    scheduled = true
    const mode = options?.flush ?? 'raf'
    if (mode === 'microtask') queueMicrotask(flush)
    else if (mode === 'sync') flush()
    else requestAnimationFrame(flush)
  }

  const consumer: DecodedConsumer<K, V> = {
    onChange: () => { dirty = true; schedule(); return ObservablePromise.resolved() },
    onReady: () => { dirty = true; schedule() },
    onReset: () => { dirty = true; schedule() },
    onError: (e) => { error.value = e; state.value = observable.state() },
    onClosed: () => { state.value = observable.state() },
    isAlive: () => true,
  }

  onMounted(() => {
    output = observable.subscribe(consumer)
    dirty = true
    flush()
  })

  onBeforeUnmount(() => {
    if (output) observable.unsubscribe(output)
    output = null
  })

  return { items, state, error, maxTs, ready: observable.readyPromise() }
}
