import { expect } from 'chai'
import { defineComponent, h, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

import {
  Observable,
  ObservablePromise,
  ObservableState,
  decodeObservable,
  type BinaryEntry,
} from '@wa-os/ts-rpc'
import { useObservable } from '../src/index.js'

const enc = new TextEncoder()
const dec = new TextDecoder()

class ManualSource extends Observable<BinaryEntry> {
  starts = 0
  stops = 0

  protected override onStart(): void { this.starts++ }
  protected override onStop(): void { this.stops++ }

  push(k: string, v: string, ts: number): void {
    this.onItem({ key: enc.encode(k), value: enc.encode(v), ts: BigInt(ts) })
  }

  tombstone(k: string, ts: number): void {
    this.onItem({ key: enc.encode(k), value: new Uint8Array(), ts: BigInt(ts) })
  }

  done(): void { this.onDone() }
  reset(): void { this.onReset() }
  fail(m: string): void { this.onError(new Error(m)) }
}

function harness() {
  const src = new ManualSource()
  const obs = decodeObservable(src, (k) => dec.decode(k), (v) => dec.decode(v))
  const Comp = defineComponent({
    setup() {
      const bound = useObservable(obs, { flush: 'microtask' })
      return { bound }
    },
    render() { return h('div') },
  })
  return { src, obs, wrapper: mount(Comp) }
}

async function settle() {
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
}

describe('useObservable', () => {
  it('mount starts the source and shows live entries', async () => {
    const { src, wrapper } = harness()
    expect(src.starts).to.equal(1)
    src.push('a', 'A', 1)
    await settle()
    const items = wrapper.vm.bound.items.value
    expect(items).to.have.length(1)
    expect(items[0].key).to.equal('a')
    expect(items[0].value).to.equal('A')
    expect(wrapper.vm.bound.maxTs.value).to.equal(1n)
  })

  it('tombstones disappear from items but stay in the decoded observable', async () => {
    const { src, obs, wrapper } = harness()
    src.push('a', 'A', 1)
    src.tombstone('a', 2)
    await settle()
    expect(wrapper.vm.bound.items.value).to.have.length(0)
    expect(obs.getEntries()).to.have.length(1)
    expect(obs.getEntries()[0].value).to.equal(null)
  })

  it('a later live put brings the entry back', async () => {
    const { src, wrapper } = harness()
    src.push('a', 'A', 1)
    src.tombstone('a', 2)
    src.push('a', 'B', 3)
    await settle()
    const items = wrapper.vm.bound.items.value
    expect(items).to.have.length(1)
    expect(items[0].value).to.equal('B')
  })

  it('unmount stops the source exactly once', async () => {
    const { src, wrapper } = harness()
    src.push('a', 'A', 1)
    await settle()
    wrapper.unmount()
    expect(src.stops).to.equal(1)
    src.push('b', 'B', 2)
    expect(src.stops).to.equal(1)
  })

  it('two components share one source subscription', async () => {
    const src = new ManualSource()
    const obs = decodeObservable(src, (k) => dec.decode(k), (v) => dec.decode(v))
    const Comp = defineComponent({
      setup() { return { bound: useObservable(obs, { flush: 'microtask' }) } },
      render() { return h('div') },
    })
    const a = mount(Comp)
    const b = mount(Comp)
    expect(src.starts).to.equal(1)
    a.unmount()
    expect(src.stops).to.equal(0)
    b.unmount()
    expect(src.stops).to.equal(1)
  })

  it('mirrors state and error', async () => {
    const { src, wrapper } = harness()
    expect(wrapper.vm.bound.state.value).to.equal(ObservableState.loading)
    src.done()
    await settle()
    expect(wrapper.vm.bound.state.value).to.equal(ObservableState.ready)
    src.fail('boom')
    await settle()
    expect(wrapper.vm.bound.state.value).to.equal(ObservableState.error)
    expect(wrapper.vm.bound.error.value).to.be.instanceOf(Error)
  })

  it('reset drops the items', async () => {
    const { src, wrapper } = harness()
    src.push('a', 'A', 1)
    src.done()
    src.reset()
    await settle()
    expect(wrapper.vm.bound.items.value).to.have.length(0)
    expect(wrapper.vm.bound.state.value).to.equal(ObservableState.reloading)
  })

  it('ready promise resolves when the source is done', async () => {
    const { src, wrapper } = harness()
    let resolved = false
    wrapper.vm.bound.ready.onResolved(() => { resolved = true })
    expect(resolved).to.equal(false)
    src.done()
    expect(resolved).to.equal(true)
    expect(wrapper.vm.bound.ready.state).to.equal('resolved')
  })

  it('sync flush updates items before the next await', () => {
    const src = new ManualSource()
    const obs = decodeObservable(src, (k) => dec.decode(k), (v) => dec.decode(v))
    const Comp = defineComponent({
      setup() { return { bound: useObservable(obs, { flush: 'sync' }) } },
      render() { return h('div') },
    })
    const wrapper = mount(Comp)
    src.push('a', 'A', 1)
    expect(wrapper.vm.bound.items.value).to.have.length(1)
    src.tombstone('a', 2)
    expect(wrapper.vm.bound.items.value).to.have.length(0)
  })

  it('items present before mount are visible after mount', async () => {
    const src = new ManualSource()
    const obs = decodeObservable(src, (k) => dec.decode(k), (v) => dec.decode(v))
    const first = new (class {
      onChange(): ObservablePromise { return ObservablePromise.resolved() }
    })()
    const out = obs.subscribe(first)
    src.push('a', 'A', 1)
    obs.unsubscribe(out)

    const Comp = defineComponent({
      setup() { return { bound: useObservable(obs, { flush: 'microtask' }) } },
      render() { return h('div') },
    })
    const wrapper = mount(Comp)
    await settle()
    expect(wrapper.vm.bound.items.value.map((i) => i.key)).to.deep.equal(['a'])
  })
})
