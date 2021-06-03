/**
 * Copyright (c) 2019-present, GraphQL Foundation
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type { Options } from '..';
const DataLoader = require('..');

function idLoader<K, C = K>(
  options?: Options<K, K, C>
): [ DataLoader<K, K, C>, Array<$ReadOnlyArray<K>> ] {
  const loadCalls = [];
  const identityLoader = new DataLoader(keys => {
    loadCalls.push(keys);
    return Promise.resolve(keys);
  }, options);
  return [ identityLoader, loadCalls ];
}

describe('Primary API', () => {

  it('builds a really really simple data loader', async () => {
    const identityLoader = new DataLoader<number, number>(async keys => keys);

    const promise1 = identityLoader.load(1);
    expect(promise1).toBeInstanceOf(Promise);

    const value1 = await promise1;
    expect(value1).toBe(1);
  });

  it('references the loader as "this" in the batch function', async () => {
    let that;
    const loader = new DataLoader<number, number>(async function (keys) {
      that = this;
      return keys;
    });

    // Trigger the batch function
    await loader.load(1);

    expect(that).toBe(loader);
  });

  it('references the loader as "this" in the cache key function', async () => {
    let that;
    const loader = new DataLoader<number, number>(async keys => keys, {
      cacheKeyFn(key) {
        that = this;
        return key;
      }
    });

    // Trigger the cache key function
    await loader.load(1);

    expect(that).toBe(loader);
  });

  it('supports loading multiple keys in one call', async () => {
    const identityLoader = new DataLoader<number, number>(async keys => keys);

    const promiseAll = identityLoader.loadMany([ 1, 2 ]);
    expect(promiseAll).toBeInstanceOf(Promise);

    const values = await promiseAll;
    expect(values).toEqual([ 1, 2 ]);

    const promiseEmpty = identityLoader.loadMany([]);
    expect(promiseEmpty).toBeInstanceOf(Promise);

    const empty = await promiseEmpty;
    expect(empty).toEqual([]);
  });

  it('supports loading multiple keys in one call with errors', async () => {
    const identityLoader = new DataLoader(keys =>
      Promise.resolve(
        keys.map(key => (key === 'bad' ? new Error('Bad Key') : key))
      )
    );

    const promiseAll = identityLoader.loadMany([ 'a', 'b', 'bad' ]);
    expect(promiseAll).toBeInstanceOf(Promise);

    const values = await promiseAll;
    expect(values).toEqual([ 'a', 'b', new Error('Bad Key') ]);
  });

  it('supports loading with resolved and rejected promises', async () => {
    const identityLoader = new DataLoader(keys =>
      Promise.resolve(
        keys.map(key => (key === 'bad' ?
          Promise.reject(new Error('Bad Key')) :
          Promise.resolve(key))
        )
      )
    );

    const promiseAll = identityLoader.loadMany([ 'a', 'b', 'bad' ]);
    expect(promiseAll).toBeInstanceOf(Promise);

    const values = await promiseAll;
    expect(values).toEqual([ 'a', 'b', new Error('Bad Key') ]);
  });

  it('batches multiple requests', async () => {
    const [ identityLoader, loadCalls ] = idLoader<number>();

    const promise1 = identityLoader.load(1);
    const promise2 = identityLoader.load(2);

    const [ value1, value2 ] = await Promise.all([ promise1, promise2 ]);
    expect(value1).toBe(1);
    expect(value2).toBe(2);

    expect(loadCalls).toEqual([ [ 1, 2 ] ]);
  });

  it('batches multiple requests with max batch sizes', async () => {
    const [ identityLoader, loadCalls ] = idLoader<number>({ maxBatchSize: 2 });

    const promise1 = identityLoader.load(1);
    const promise2 = identityLoader.load(2);
    const promise3 = identityLoader.load(3);

    const [ value1, value2, value3 ] =
      await Promise.all([ promise1, promise2, promise3 ]);
    expect(value1).toBe(1);
    expect(value2).toBe(2);
    expect(value3).toBe(3);

    expect(loadCalls).toEqual([ [ 1, 2 ], [ 3 ] ]);
  });

  it('batches cached requests', async () => {
    const loadCalls = [];
    let resolveBatch = () => {};
    const identityLoader = new DataLoader<number, number>(keys => {
      loadCalls.push(keys);
      return new Promise(resolve => {
        resolveBatch = () => resolve(keys);
      });
    });

    identityLoader.prime(1, 1);

    const promise1 = identityLoader.load(1);
    const promise2 = identityLoader.load(2);

    // Track when each resolves.
    let promise1Resolved = false;
    let promise2Resolved = false;
    promise1.then(() => { promise1Resolved = true; });
    promise2.then(() => { promise2Resolved = true; });

    // Move to next macro-task (tick)
    await new Promise(setImmediate);

    expect(promise1Resolved).toBe(false);
    expect(promise2Resolved).toBe(false);

    resolveBatch();
    // Move to next macro-task (tick)
    await new Promise(setImmediate);

    expect(promise1Resolved).toBe(true);
    expect(promise2Resolved).toBe(true);

    const [ value1, value2 ] = await Promise.all([ promise1, promise2 ]);
    expect(value1).toBe(1);
    expect(value2).toBe(2);

    expect(loadCalls).toEqual([ [ 2 ] ]);
  });

  it('max batch size respects cached results', async () => {
    const loadCalls = [];
    let resolveBatch = () => {};
    const identityLoader = new DataLoader<number, number>(keys => {
      loadCalls.push(keys);
      return new Promise(resolve => {
        resolveBatch = () => resolve(keys);
      });
    }, { maxBatchSize: 1 });

    identityLoader.prime(1, 1);

    const promise1 = identityLoader.load(1);
    const promise2 = identityLoader.load(2);

    // Track when each resolves.
    let promise1Resolved = false;
    let promise2Resolved = false;
    promise1.then(() => { promise1Resolved = true; });
    promise2.then(() => { promise2Resolved = true; });

    // Move to next macro-task (tick)
    await new Promise(setImmediate);

    // Promise 1 resolves first since max batch size is 1
    expect(promise1Resolved).toBe(true);
    expect(promise2Resolved).toBe(false);

    resolveBatch();
    // Move to next macro-task (tick)
    await new Promise(setImmediate);

    expect(promise1Resolved).toBe(true);
    expect(promise2Resolved).toBe(true);

    const [ value1, value2 ] = await Promise.all([ promise1, promise2 ]);
    expect(value1).toBe(1);
    expect(value2).toBe(2);

    expect(loadCalls).toEqual([ [ 2 ] ]);
  });

  it('coalesces identical requests', async () => {
    const [ identityLoader, loadCalls ] = idLoader<number>();

    const promise1a = identityLoader.load(1);
    const promise1b = identityLoader.load(1);

    const [ value1a, value1b ] = await Promise.all([ promise1a, promise1b ]);
    expect(value1a).toBe(1);
    expect(value1b).toBe(1);

    expect(loadCalls).toEqual([ [ 1 ] ]);
  });

  it('coalesces identical requests across sized batches', async () => {
    const [ identityLoader, loadCalls ] = idLoader<number>({ maxBatchSize: 2 });

    const promise1a = identityLoader.load(1);
    const promise2 = identityLoader.load(2);
    const promise1b = identityLoader.load(1);
    const promise3 = identityLoader.load(3);

    const [ value1a, value2, value1b, value3 ] =
      await Promise.all([ promise1a, promise2, promise1b, promise3 ]);
    expect(value1a).toBe(1);
    expect(value2).toBe(2);
    expect(value1b).toBe(1);
    expect(value3).toBe(3);

    expect(loadCalls).toEqual([ [ 1, 2 ], [ 3 ] ]);
  });

  it('caches repeated requests', async () => {
    const [ identityLoader, loadCalls ] = idLoader<string>();

    const [ a, b ] = await Promise.all([
      identityLoader.load('A'),
      identityLoader.load('B')
    ]);

    expect(a).toBe('A');
    expect(b).toBe('B');

    expect(loadCalls).toEqual([ [ 'A', 'B' ] ]);

    const [ a2, c ] = await Promise.all([
      identityLoader.load('A'),
      identityLoader.load('C')
    ]);

    expect(a2).toBe('A');
    expect(c).toBe('C');

    expect(loadCalls).toEqual([ [ 'A', 'B' ], [ 'C' ] ]);

    const [ a3, b2, c2 ] = await Promise.all([
      identityLoader.load('A'),
      identityLoader.load('B'),
      identityLoader.load('C')
    ]);

    expect(a3).toBe('A');
    expect(b2).toBe('B');
    expect(c2).toBe('C');

    expect(loadCalls).toEqual([ [ 'A', 'B' ], [ 'C' ] ]);
  });

  it('clears single value in loader', async () => {
    const [ identityLoader, loadCalls ] = idLoader<string>();

    const [ a, b ] = await Promise.all([
      identityLoader.load('A'),
      identityLoader.load('B')
    ]);

    expect(a).toBe('A');
    expect(b).toBe('B');

    expect(loadCalls).toEqual([ [ 'A', 'B' ] ]);

    identityLoader.clear('A');

    const [ a2, b2 ] = await Promise.all([
      identityLoader.load('A'),
      identityLoader.load('B')
    ]);

    expect(a2).toBe('A');
    expect(b2).toBe('B');

    expect(loadCalls).toEqual([ [ 'A', 'B' ], [ 'A' ] ]);
  });

  it('clears all values in loader', async () => {
    const [ identityLoader, loadCalls ] = idLoader<string>();

    const [ a, b ] = await Promise.all([
      identityLoader.load('A'),
      identityLoader.load('B')
    ]);

    expect(a).toBe('A');
    expect(b).toBe('B');

    expect(loadCalls).toEqual([ [ 'A', 'B' ] ]);

    identityLoader.clearAll();

    const [ a2, b2 ] = await Promise.all([
      identityLoader.load('A'),
      identityLoader.load('B')
    ]);

    expect(a2).toBe('A');
    expect(b2).toBe('B');

    expect(loadCalls).toEqual([ [ 'A', 'B' ], [ 'A', 'B' ] ]);
  });

  it('allows priming the cache', async () => {
    const [ identityLoader, loadCalls ] = idLoader<string>();

    identityLoader.prime('A', 'A');

    const [ a, b ] = await Promise.all([
      identityLoader.load('A'),
      identityLoader.load('B')
    ]);

    expect(a).toBe('A');
    expect(b).toBe('B');

    expect(loadCalls).toEqual([ [ 'B' ] ]);
  });

  it('does not prime keys that already exist', async () => {
    const [ identityLoader, loadCalls ] = idLoader<string>();

    identityLoader.prime('A', 'X');

    const a1 = await identityLoader.load('A');
    const b1 = await identityLoader.load('B');
    expect(a1).toBe('X');
    expect(b1).toBe('B');

    identityLoader.prime('A', 'Y');
    identityLoader.prime('B', 'Y');

    const a2 = await identityLoader.load('A');
    const b2 = await identityLoader.load('B');
    expect(a2).toBe('X');
    expect(b2).toBe('B');

    expect(loadCalls).toEqual([ [ 'B' ] ]);
  });

  it('allows forcefully priming the cache', async () => {
    const [ identityLoader, loadCalls ] = idLoader<string>();

    identityLoader.prime('A', 'X');

    const a1 = await identityLoader.load('A');
    const b1 = await identityLoader.load('B');
    expect(a1).toBe('X');
    expect(b1).toBe('B');

    identityLoader.clear('A').prime('A', 'Y');
    identityLoader.clear('B').prime('B', 'Y');

    const a2 = await identityLoader.load('A');
    const b2 = await identityLoader.load('B');
    expect(a2).toBe('Y');
    expect(b2).toBe('Y');

    expect(loadCalls).toEqual([ [ 'B' ] ]);
  });

});

describe('Represents Errors', () => {

  it('Resolves to error to indicate failure', async () => {
    const loadCalls = [];
    const evenLoader = new DataLoader(keys => {
      loadCalls.push(keys);
      return Promise.resolve(
        keys.map(key => key % 2 === 0 ? key : new Error(`Odd: ${key}`))
      );
    });

    let caughtError;
    try {
      await evenLoader.load(1);
    } catch (error) {
      caughtError = error;
    }
    expect(caughtError).toBeInstanceOf(Error);
    expect((caughtError: any).message).toBe('Odd: 1');

    const value2 = await evenLoader.load(2);
    expect(value2).toBe(2);

    expect(loadCalls).toEqual([ [ 1 ], [ 2 ] ]);
  });

  it('Can represent failures and successes simultaneously', async () => {
    const loadCalls = [];
    const evenLoader = new DataLoader(keys => {
      loadCalls.push(keys);
      return Promise.resolve(
        keys.map(key => key % 2 === 0 ? key : new Error(`Odd: ${key}`))
      );
    });

    const promise1 = evenLoader.load(1);
    const promise2 = evenLoader.load(2);

    let caughtError;
    try {
      await promise1;
    } catch (error) {
      caughtError = error;
    }
    expect(caughtError).toBeInstanceOf(Error);
    expect((caughtError: any).message).toBe('Odd: 1');

    expect(await promise2).toBe(2);

    expect(loadCalls).toEqual([ [ 1, 2 ] ]);
  });

  it('Caches failed fetches', async () => {
    const loadCalls = [];
    const errorLoader = new DataLoader(keys => {
      loadCalls.push(keys);
      return Promise.resolve(
        keys.map(key => new Error(`Error: ${key}`))
      );
    });

    let caughtErrorA;
    try {
      await errorLoader.load(1);
    } catch (error) {
      caughtErrorA = error;
    }
    expect(caughtErrorA).toBeInstanceOf(Error);
    expect((caughtErrorA: any).message).toBe('Error: 1');

    let caughtErrorB;
    try {
      await errorLoader.load(1);
    } catch (error) {
      caughtErrorB = error;
    }
    expect(caughtErrorB).toBeInstanceOf(Error);
    expect((caughtErrorB: any).message).toBe('Error: 1');

    expect(loadCalls).toEqual([ [ 1 ] ]);
  });

  it('Handles priming the cache with an error', async () => {
    const [ identityLoader, loadCalls ] = idLoader<number>();

    identityLoader.prime(1, new Error('Error: 1'));

    // Wait a bit.
    await new Promise(setImmediate);

    let caughtErrorA;
    try {
      await identityLoader.load(1);
    } catch (error) {
      caughtErrorA = error;
    }
    expect(caughtErrorA).toBeInstanceOf(Error);
    expect((caughtErrorA: any).message).toBe('Error: 1');

    expect(loadCalls).toEqual([]);
  });

  it('Can clear values from cache after errors', async () => {
    const loadCalls = [];
    const errorLoader = new DataLoader(keys => {
      loadCalls.push(keys);
      return Promise.resolve(
        keys.map(key => new Error(`Error: ${key}`))
      );
    });

    let caughtErrorA;
    try {
      await errorLoader.load(1).catch(error => {
        // Presumably determine if this error is transient, and only clear the
        // cache in that case.
        errorLoader.clear(1);
        throw error;
      });
    } catch (error) {
      caughtErrorA = error;
    }
    expect(caughtErrorA).toBeInstanceOf(Error);
    expect((caughtErrorA: any).message).toBe('Error: 1');

    let caughtErrorB;
    try {
      await errorLoader.load(1).catch(error => {
        // Again, only do this if you can determine the error is transient.
        errorLoader.clear(1);
        throw error;
      });
    } catch (error) {
      caughtErrorB = error;
    }
    expect(caughtErrorB).toBeInstanceOf(Error);
    expect((caughtErrorB: any).message).toBe('Error: 1');

    expect(loadCalls).toEqual([ [ 1 ], [ 1 ] ]);
  });

  it('Propagates error to all loads', async () => {
    const loadCalls = [];
    const failLoader = new DataLoader(keys => {
      loadCalls.push(keys);
      return Promise.reject(new Error('I am a terrible loader'));
    });

    const promise1 = failLoader.load(1);
    const promise2 = failLoader.load(2);

    let caughtErrorA;
    try {
      await promise1;
    } catch (error) {
      caughtErrorA = error;
    }
    expect(caughtErrorA).toBeInstanceOf(Error);
    expect((caughtErrorA: any).message).toBe('I am a terrible loader');

    let caughtErrorB;
    try {
      await promise2;
    } catch (error) {
      caughtErrorB = error;
    }
    expect(caughtErrorB).toBe(caughtErrorA);

    expect(loadCalls).toEqual([ [ 1, 2 ] ]);
  });

});

describe('Accepts any kind of key', () => {

  it('Accepts objects as keys', async () => {
    const [ identityLoader, loadCalls ] = idLoader<{}>();

    const keyA = {};
    const keyB = {};

    // Fetches as expected

    const [ valueA, valueB ] = await Promise.all([
      identityLoader.load(keyA),
      identityLoader.load(keyB),
    ]);

    expect(valueA).toBe(keyA);
    expect(valueB).toBe(keyB);

    expect(loadCalls).toHaveLength(1);
    expect(loadCalls[0]).toHaveLength(2);
    expect(loadCalls[0][0]).toBe(keyA);
    expect(loadCalls[0][1]).toBe(keyB);

    // Caching

    identityLoader.clear(keyA);

    const [ valueA2, valueB2 ] = await Promise.all([
      identityLoader.load(keyA),
      identityLoader.load(keyB),
    ]);

    expect(valueA2).toBe(keyA);
    expect(valueB2).toBe(keyB);

    expect(loadCalls).toHaveLength(2);
    expect(loadCalls[1]).toHaveLength(1);
    expect(loadCalls[1][0]).toBe(keyA);

  });

});

describe('Accepts options', () => {

  // Note: mirrors 'batches multiple requests' above.
  it('May disable batching', async () => {
    const [ identityLoader, loadCalls ] = idLoader<number>({ batch: false });

    const promise1 = identityLoader.load(1);
    const promise2 = identityLoader.load(2);

    const [ value1, value2 ] = await Promise.all([ promise1, promise2 ]);
    expect(value1).toBe(1);
    expect(value2).toBe(2);

    expect(loadCalls).toEqual([ [ 1 ], [ 2 ] ]);
  });

  // Note: mirror's 'caches repeated requests' above.
  it('May disable caching', async () => {
    const [ identityLoader, loadCalls ] = idLoader<string>({ cache: false });

    const [ a, b ] = await Promise.all([
      identityLoader.load('A'),
      identityLoader.load('B')
    ]);

    expect(a).toBe('A');
    expect(b).toBe('B');

    expect(loadCalls).toEqual([ [ 'A', 'B' ] ]);

    const [ a2, c ] = await Promise.all([
      identityLoader.load('A'),
      identityLoader.load('C')
    ]);

    expect(a2).toBe('A');
    expect(c).toBe('C');

    expect(loadCalls).toEqual([ [ 'A', 'B' ], [ 'A', 'C' ] ]);

    const [ a3, b2, c2 ] = await Promise.all([
      identityLoader.load('A'),
      identityLoader.load('B'),
      identityLoader.load('C')
    ]);

    expect(a3).toBe('A');
    expect(b2).toBe('B');
    expect(c2).toBe('C');

    expect(loadCalls).toEqual(
      [ [ 'A', 'B' ], [ 'A', 'C' ], [ 'A', 'B', 'C' ] ]
    );
  });

  it('Keys are repeated in batch when cache disabled', async () => {
    const [ identityLoader, loadCalls ] = idLoader<string>({ cache: false });

    const [ values1, values2, values3, values4 ] = await Promise.all([
      identityLoader.load('A'),
      identityLoader.load('C'),
      identityLoader.load('D'),
      identityLoader.loadMany([ 'C', 'D', 'A', 'A', 'B' ]),
    ]);

    expect(values1).toBe('A');
    expect(values2).toBe('C');
    expect(values3).toBe('D');
    expect(values4).toEqual([ 'C', 'D', 'A', 'A', 'B' ]);

    expect(loadCalls).toEqual([
      [ 'A', 'C', 'D', 'C', 'D', 'A', 'A', 'B' ]
    ]);
  });

  it('cacheMap may be set to null to disable cache', async () => {
    const [ identityLoader, loadCalls ] = idLoader<string>({ cacheMap: null });

    await identityLoader.load('A');
    await identityLoader.load('A');

    expect(loadCalls).toEqual([ [ 'A' ], [ 'A' ] ]);
  });

  it('Does not interact with a cache when cache is disabled', () => {
    const promiseX = Promise.resolve('X');
    const cacheMap = new Map([ [ 'X', promiseX ] ]);
    const [ identityLoader ] = idLoader<string>({ cache: false, cacheMap });

    identityLoader.prime('A', 'A');
    expect(cacheMap.get('A')).toBe(undefined);
    identityLoader.clear('X');
    expect(cacheMap.get('X')).toBe(promiseX);
    identityLoader.clearAll();
    expect(cacheMap.get('X')).toBe(promiseX);
  });

  it('Complex cache behavior via clearAll()', async () => {
    // This loader clears its cache as soon as a batch function is dispatched.
    const loadCalls = [];
    const identityLoader = new DataLoader<string, string>(keys => {
      identityLoader.clearAll();
      loadCalls.push(keys);
      return Promise.resolve(keys);
    });

    const values1 = await Promise.all([
      identityLoader.load('A'),
      identityLoader.load('B'),
      identityLoader.load('A'),
    ]);

    expect(values1).toEqual([ 'A', 'B', 'A' ]);

    const values2 = await Promise.all([
      identityLoader.load('A'),
      identityLoader.load('B'),
      identityLoader.load('A'),
    ]);

    expect(values2).toEqual([ 'A', 'B', 'A' ]);

    expect(loadCalls).toEqual([ [ 'A', 'B' ], [ 'A', 'B' ] ]);
  });

  describe('Accepts object key in custom cacheKey function', () => {
    function cacheKey(key: {[string]: any}): string {
      return Object.keys(key).sort().map(k => k + ':' + key[k]).join();
    }

    type Obj = { [string]: number };

    it('Accepts objects with a complex key', async () => {
      const identityLoadCalls = [];
      const identityLoader = new DataLoader<Obj, Obj, string>(keys => {
        identityLoadCalls.push(keys);
        return Promise.resolve(keys);
      }, { cacheKeyFn: cacheKey });

      const key1 = { id: 123 };
      const key2 = { id: 123 };

      const value1 = await identityLoader.load(key1);
      const value2 = await identityLoader.load(key2);

      expect(identityLoadCalls).toEqual([ [ key1 ] ]);
      expect(value1).toBe(key1);
      expect(value2).toBe(key1);
    });

    it('Clears objects with complex key', async () => {
      const identityLoadCalls = [];
      const identityLoader = new DataLoader<Obj, Obj, string>(keys => {
        identityLoadCalls.push(keys);
        return Promise.resolve(keys);
      }, { cacheKeyFn: cacheKey });

      const key1 = { id: 123 };
      const key2 = { id: 123 };

      const value1 = await identityLoader.load(key1);
      identityLoader.clear(key2); // clear equivalent object key
      const value2 = await identityLoader.load(key1);

      expect(identityLoadCalls).toEqual([ [ key1 ], [ key1 ] ]);
      expect(value1).toBe(key1);
      expect(value2).toBe(key1);
    });

    it('Accepts objects with different order of keys', async () => {
      const identityLoadCalls = [];
      const identityLoader = new DataLoader<Obj, Obj, string>(keys => {
        identityLoadCalls.push(keys);
        return Promise.resolve(keys);
      }, { cacheKeyFn: cacheKey });

      // Fetches as expected

      const keyA = { a: 123, b: 321 };
      const keyB = { b: 321, a: 123 };

      const [ valueA, valueB ] = await Promise.all([
        identityLoader.load(keyA),
        identityLoader.load(keyB),
      ]);

      expect(valueA).toBe(keyA);
      expect(valueB).toBe(valueA);

      expect(identityLoadCalls).toHaveLength(1);
      expect(identityLoadCalls[0]).toHaveLength(1);
      expect(identityLoadCalls[0][0]).toBe(keyA);
    });

    it('Allows priming the cache with an object key', async () => {
      const [ identityLoader, loadCalls ] =
        idLoader<Obj, string>({ cacheKeyFn: cacheKey });

      const key1 = { id: 123 };
      const key2 = { id: 123 };

      identityLoader.prime(key1, key1);

      const value1 = await identityLoader.load(key1);
      const value2 = await identityLoader.load(key2);

      expect(loadCalls).toEqual([]);
      expect(value1).toBe(key1);
      expect(value2).toBe(key1);
    });

  });

  describe('Accepts custom cacheMap instance', () => {

    class SimpleMap {
      stash: Object;

      constructor() {
        this.stash = {};
      }
      get(key) {
        return this.stash[key];
      }
      set(key, value) {
        this.stash[key] = value;
      }
      delete(key) {
        delete this.stash[key];
      }
      clear() {
        this.stash = {};
      }
    }

    it('Accepts a custom cache map implementation', async () => {
      const aCustomMap = new SimpleMap();
      const identityLoadCalls = [];
      const identityLoader = new DataLoader<string, string>(keys => {
        identityLoadCalls.push(keys);
        return Promise.resolve(keys);
      }, { cacheMap: aCustomMap });

      // Fetches as expected

      const [ valueA, valueB1 ] = await Promise.all([
        identityLoader.load('a'),
        identityLoader.load('b'),
      ]);

      expect(valueA).toBe('a');
      expect(valueB1).toBe('b');

      expect(identityLoadCalls).toEqual([ [ 'a', 'b' ] ]);
      expect(Object.keys(aCustomMap.stash)).toEqual([ 'a', 'b' ]);

      const [ valueC, valueB2 ] = await Promise.all([
        identityLoader.load('c'),
        identityLoader.load('b'),
      ]);

      expect(valueC).toBe('c');
      expect(valueB2).toBe('b');

      expect(identityLoadCalls).toEqual([ [ 'a', 'b' ], [ 'c' ] ]);
      expect(Object.keys(aCustomMap.stash)).toEqual([ 'a', 'b', 'c' ]);

      // Supports clear

      identityLoader.clear('b');
      const valueB3 = await identityLoader.load('b');

      expect(valueB3).toBe('b');
      expect(identityLoadCalls).toEqual(
        [ [ 'a', 'b' ], [ 'c' ], [ 'b' ] ]
      );
      expect(Object.keys(aCustomMap.stash)).toEqual([ 'a', 'c', 'b' ]);

      // Supports clear all

      identityLoader.clearAll();

      expect(Object.keys(aCustomMap.stash)).toEqual([]);
    });

  });

});

describe('It allows custom schedulers', () => {

  it('Supports manual dispatch', () => {
    function createScheduler() {
      let callbacks = [];
      return {
        schedule(callback) {
          callbacks.push(callback);
        },
        dispatch() {
          callbacks.forEach(callback => callback());
          callbacks = [];
        }
      };
    }

    const { schedule, dispatch } = createScheduler();
    const [ identityLoader, loadCalls ] = idLoader<string>({
      batchScheduleFn: schedule
    });

    identityLoader.load('A');
    identityLoader.load('B');
    dispatch();
    identityLoader.load('A');
    identityLoader.load('C');
    dispatch();
    // Note: never dispatched!
    identityLoader.load('D');

    expect(loadCalls).toEqual([ [ 'A', 'B' ], [ 'C' ] ]);
  });

  it('Custom batch scheduler is provided loader as this context', () => {
    let that;
    function batchScheduleFn(callback) {
      that = this;
      callback();
    }

    const [ identityLoader ] = idLoader<string>({ batchScheduleFn });

    identityLoader.load('A');
    expect(that).toBe(identityLoader);
  });

});

describe('It is resilient to job queue ordering', () => {

  it('batches loads occuring within promises', async () => {
    const [ identityLoader, loadCalls ] = idLoader<string>();

    await Promise.all([
      identityLoader.load('A'),
      Promise.resolve().then(() => Promise.resolve()).then(() => {
        identityLoader.load('B');
        Promise.resolve().then(() => Promise.resolve()).then(() => {
          identityLoader.load('C');
          Promise.resolve().then(() => Promise.resolve()).then(() => {
            identityLoader.load('D');
          });
        });
      })
    ]);

    expect(loadCalls).toEqual([ [ 'A', 'B', 'C', 'D' ] ]);
  });

  it('can call a loader from a loader', async () => {
    const deepLoadCalls = [];
    const deepLoader = new DataLoader<
      $ReadOnlyArray<string>,
      $ReadOnlyArray<string>
    >(keys => {
      deepLoadCalls.push(keys);
      return Promise.resolve(keys);
    });

    const aLoadCalls = [];
    const aLoader = new DataLoader<string, string>(keys => {
      aLoadCalls.push(keys);
      return deepLoader.load(keys);
    });

    const bLoadCalls = [];
    const bLoader = new DataLoader<string, string>(keys => {
      bLoadCalls.push(keys);
      return deepLoader.load(keys);
    });

    const [ a1, b1, a2, b2 ] = await Promise.all([
      aLoader.load('A1'),
      bLoader.load('B1'),
      aLoader.load('A2'),
      bLoader.load('B2')
    ]);

    expect(a1).toBe('A1');
    expect(b1).toBe('B1');
    expect(a2).toBe('A2');
    expect(b2).toBe('B2');

    expect(aLoadCalls).toEqual([ [ 'A1', 'A2' ] ]);
    expect(bLoadCalls).toEqual([ [ 'B1', 'B2' ] ]);
    expect(deepLoadCalls).toEqual([ [ [ 'A1', 'A2' ], [ 'B1', 'B2' ] ] ]);
  });

});
