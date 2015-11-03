/* @flow */
/**
 *  Copyright (c) 2015, Facebook, Inc.
 *  All rights reserved.
 *
 *  This source code is licensed under the BSD-style license found in the
 *  LICENSE file in the root directory of this source tree. An additional grant
 *  of patent rights can be found in the PATENTS file in the same directory.
 */

import { expect } from 'chai';
import { describe, it } from 'mocha';
import DataLoader from '../';

describe('Primary API', () => {

  it('builds a really really simple data loader', async () => {
    var identityLoader = new DataLoader(keys => Promise.resolve(keys));

    var promise1 = identityLoader.load(1);
    expect(promise1).to.be.instanceof(Promise);

    var value1 = await promise1;
    expect(value1).to.equal(1);
  });

  it('supports loading multiple keys in one call', async () => {
    var identityLoader = new DataLoader(keys => Promise.resolve(keys));

    var promiseAll = identityLoader.loadMany([ 1, 2 ]);
    expect(promiseAll).to.be.instanceof(Promise);

    var values = await promiseAll;
    expect(values).to.deep.equal([ 1, 2 ]);

    var promiseEmpty = identityLoader.loadMany([]);
    expect(promiseEmpty).to.be.instanceof(Promise);

    var empty = await promiseEmpty;
    expect(empty).to.deep.equal([]);
  });

  it('batches multiple requests', async () => {
    var loadCalls = [];
    var identityLoader = new DataLoader(keys => {
      loadCalls.push(keys);
      return Promise.resolve(keys);
    });

    var promise1 = identityLoader.load(1);
    var promise2 = identityLoader.load(2);

    var [ value1, value2 ] = await Promise.all([ promise1, promise2 ]);
    expect(value1).to.equal(1);
    expect(value2).to.equal(2);

    expect(loadCalls).to.deep.equal([ [ 1, 2 ] ]);
  });

  it('coalesces identical requests', async () => {
    var loadCalls = [];
    var identityLoader = new DataLoader(keys => {
      loadCalls.push(keys);
      return Promise.resolve(keys);
    });

    var promise1a = identityLoader.load(1);
    var promise1b = identityLoader.load(1);

    expect(promise1a).to.equal(promise1b);

    var [ value1a, value1b ] = await Promise.all([ promise1a, promise1b ]);
    expect(value1a).to.equal(1);
    expect(value1b).to.equal(1);

    expect(loadCalls).to.deep.equal([ [ 1 ] ]);
  });

  it('caches repeated requests', async () => {
    var loadCalls = [];
    var identityLoader = new DataLoader(keys => {
      loadCalls.push(keys);
      return Promise.resolve(keys);
    });

    var [ a, b ] = await Promise.all([
      identityLoader.load('A'),
      identityLoader.load('B')
    ]);

    expect(a).to.equal('A');
    expect(b).to.equal('B');

    expect(loadCalls).to.deep.equal([ [ 'A', 'B' ] ]);

    var [ a2, c ] = await Promise.all([
      identityLoader.load('A'),
      identityLoader.load('C')
    ]);

    expect(a2).to.equal('A');
    expect(c).to.equal('C');

    expect(loadCalls).to.deep.equal([ [ 'A', 'B' ], [ 'C' ] ]);

    var [ a3, b2, c2 ] = await Promise.all([
      identityLoader.load('A'),
      identityLoader.load('B'),
      identityLoader.load('C')
    ]);

    expect(a3).to.equal('A');
    expect(b2).to.equal('B');
    expect(c2).to.equal('C');

    expect(loadCalls).to.deep.equal([ [ 'A', 'B' ], [ 'C' ] ]);
  });

  it('clears single value in loader', async () => {
    var loadCalls = [];
    var identityLoader = new DataLoader(keys => {
      loadCalls.push(keys);
      return Promise.resolve(keys);
    });

    var [ a, b ] = await Promise.all([
      identityLoader.load('A'),
      identityLoader.load('B')
    ]);

    expect(a).to.equal('A');
    expect(b).to.equal('B');

    expect(loadCalls).to.deep.equal([ [ 'A', 'B' ] ]);

    identityLoader.clear('A');

    var [ a2, b2 ] = await Promise.all([
      identityLoader.load('A'),
      identityLoader.load('B')
    ]);

    expect(a2).to.equal('A');
    expect(b2).to.equal('B');

    expect(loadCalls).to.deep.equal([ [ 'A', 'B' ], [ 'A' ] ]);
  });

  it('clears all values in loader', async () => {
    var loadCalls = [];
    var identityLoader = new DataLoader(keys => {
      loadCalls.push(keys);
      return Promise.resolve(keys);
    });

    var [ a, b ] = await Promise.all([
      identityLoader.load('A'),
      identityLoader.load('B')
    ]);

    expect(a).to.equal('A');
    expect(b).to.equal('B');

    expect(loadCalls).to.deep.equal([ [ 'A', 'B' ] ]);

    identityLoader.clearAll();

    var [ a2, b2 ] = await Promise.all([
      identityLoader.load('A'),
      identityLoader.load('B')
    ]);

    expect(a2).to.equal('A');
    expect(b2).to.equal('B');

    expect(loadCalls).to.deep.equal([ [ 'A', 'B' ], [ 'A', 'B' ] ]);
  });

});

describe('Represents Errors', () => {

  it('Resolves to error to indicate failure', async () => {
    var loadCalls = [];
    var evenLoader = new DataLoader(keys => {
      loadCalls.push(keys);
      return Promise.resolve(
        keys.map(key => key % 2 === 0 ? key : new Error(`Odd: ${key}`))
      );
    });

    var caughtError;
    try {
      await evenLoader.load(1);
    } catch (error) {
      caughtError = error;
    }
    expect(caughtError).to.be.instanceof(Error);
    expect((caughtError: any).message).to.equal('Odd: 1');

    var value2 = await evenLoader.load(2);
    expect(value2).to.equal(2);

    expect(loadCalls).to.deep.equal([ [ 1 ], [ 2 ] ]);
  });

  it('Can represent failures and successes simultaneously', async () => {
    var loadCalls = [];
    var evenLoader = new DataLoader(keys => {
      loadCalls.push(keys);
      return Promise.resolve(
        keys.map(key => key % 2 === 0 ? key : new Error(`Odd: ${key}`))
      );
    });

    var promise1 = evenLoader.load(1);
    var promise2 = evenLoader.load(2);

    var caughtError;
    try {
      await promise1;
    } catch (error) {
      caughtError = error;
    }
    expect(caughtError).to.be.instanceof(Error);
    expect((caughtError: any).message).to.equal('Odd: 1');

    expect(await promise2).to.equal(2);

    expect(loadCalls).to.deep.equal([ [ 1, 2 ] ]);
  });

  it('Caches failed fetches', async () => {
    var loadCalls = [];
    var errorLoader = new DataLoader(keys => {
      loadCalls.push(keys);
      return Promise.resolve(
        keys.map(key => new Error(`Error: ${key}`))
      );
    });

    var caughtErrorA;
    try {
      await errorLoader.load(1);
    } catch (error) {
      caughtErrorA = error;
    }
    expect(caughtErrorA).to.be.instanceof(Error);
    expect((caughtErrorA: any).message).to.equal('Error: 1');

    var caughtErrorB;
    try {
      await errorLoader.load(1);
    } catch (error) {
      caughtErrorB = error;
    }
    expect(caughtErrorB).to.be.instanceof(Error);
    expect((caughtErrorB: any).message).to.equal('Error: 1');

    expect(loadCalls).to.deep.equal([ [ 1 ] ]);
  });

  it('Can clear values from cache after errors', async () => {
    var loadCalls = [];
    var errorLoader = new DataLoader(keys => {
      loadCalls.push(keys);
      return Promise.resolve(
        keys.map(key => new Error(`Error: ${key}`))
      );
    });

    var caughtErrorA;
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
    expect(caughtErrorA).to.be.instanceof(Error);
    expect((caughtErrorA: any).message).to.equal('Error: 1');

    var caughtErrorB;
    try {
      await errorLoader.load(1).catch(error => {
        // Again, only do this if you can determine the error is transient.
        errorLoader.clear(1);
        throw error;
      });
    } catch (error) {
      caughtErrorB = error;
    }
    expect(caughtErrorB).to.be.instanceof(Error);
    expect((caughtErrorB: any).message).to.equal('Error: 1');

    expect(loadCalls).to.deep.equal([ [ 1 ], [ 1 ] ]);
  });

  it('Propagates error to all loads', async () => {
    var loadCalls = [];
    var failLoader = new DataLoader(keys => {
      loadCalls.push(keys);
      return Promise.reject(new Error('I am a terrible loader'));
    });

    var promise1 = failLoader.load(1);
    var promise2 = failLoader.load(2);

    var caughtError1;
    try {
      await promise1;
    } catch (error) {
      caughtError1 = error;
    }
    expect(caughtError1).to.be.instanceof(Error);
    expect((caughtError1: any).message).to.equal('I am a terrible loader');

    var caughtError2;
    try {
      await promise2;
    } catch (error) {
      caughtError2 = error;
    }
    expect(caughtError2).to.equal(caughtError1);

    expect(loadCalls).to.deep.equal([ [ 1, 2 ] ]);
  });

});

describe('Accepts any kind of key', () => {

  it('Accepts objects as keys', async () => {
    var keyA = {};
    var keyB = {};

    var identityLoadCalls = [];
    var identityLoader = new DataLoader(keys => {
      identityLoadCalls.push(keys);
      return Promise.resolve(keys);
    });

    // Fetches as expected

    var [ valueA, valueB ] = await Promise.all([
      identityLoader.load(keyA),
      identityLoader.load(keyB),
    ]);

    expect(valueA).to.equal(keyA);
    expect(valueB).to.equal(keyB);

    expect(identityLoadCalls).to.have.length(1);
    expect(identityLoadCalls[0]).to.have.length(2);
    expect(identityLoadCalls[0][0]).to.equal(keyA);
    expect(identityLoadCalls[0][1]).to.equal(keyB);

    // Caching

    identityLoader.clear(keyA);

    var [ valueA2, valueB2 ] = await Promise.all([
      identityLoader.load(keyA),
      identityLoader.load(keyB),
    ]);

    expect(valueA2).to.equal(keyA);
    expect(valueB2).to.equal(keyB);

    expect(identityLoadCalls).to.have.length(2);
    expect(identityLoadCalls[1]).to.have.length(1);
    expect(identityLoadCalls[1][0]).to.equal(keyA);

  });

});

describe('Accepts object key in custom serializeKey function', () => {
  function serializeKey(key) {
    var result;
    if (typeof key === 'object' && key !== null) {
      result = Object.keys(key).sort().map(k => k + ':' + key[k]).join('-');
    } else {
      result = key;
    }
    return result;
  }

  it('Accepts objects with different order of keys', async () => {
    var keyA = { a: 123, b: 321 };
    var keyB = { b: 321, a: 123 };

    var identityLoadCalls = [];
    var identityLoader = new DataLoader(keys => {
      identityLoadCalls.push(keys);
      return Promise.resolve(keys);
    }, {serializeKey});

    // Fetches as expected

    var [ valueA, valueB ] = await Promise.all([
      identityLoader.load(keyA),
      identityLoader.load(keyB),
    ]);

    expect(valueA).to.equal(keyA);
    expect(valueB).to.equal(valueA);

    expect(identityLoadCalls).to.have.length(1);
    expect(identityLoadCalls[0]).to.have.length(1);
    expect(identityLoadCalls[0][0]).to.equal(keyA);
  });

});

describe('Accepts options', () => {

  // Note: mirrors 'batches multiple requests' above.
  it('May disable batching', async () => {
    var loadCalls = [];
    var identityLoader = new DataLoader(keys => {
      loadCalls.push(keys);
      return Promise.resolve(keys);
    }, { batch: false });

    var promise1 = identityLoader.load(1);
    var promise2 = identityLoader.load(2);

    var [ value1, value2 ] = await Promise.all([ promise1, promise2 ]);
    expect(value1).to.equal(1);
    expect(value2).to.equal(2);

    expect(loadCalls).to.deep.equal([ [ 1 ], [ 2 ] ]);
  });

  // Note: mirror's 'caches repeated requests' above.
  it('May disable caching', async () => {
    var loadCalls = [];
    var identityLoader = new DataLoader(keys => {
      loadCalls.push(keys);
      return Promise.resolve(keys);
    }, { cache: false });

    var [ a, b ] = await Promise.all([
      identityLoader.load('A'),
      identityLoader.load('B')
    ]);

    expect(a).to.equal('A');
    expect(b).to.equal('B');

    expect(loadCalls).to.deep.equal([ [ 'A', 'B' ] ]);

    var [ a2, c ] = await Promise.all([
      identityLoader.load('A'),
      identityLoader.load('C')
    ]);

    expect(a2).to.equal('A');
    expect(c).to.equal('C');

    expect(loadCalls).to.deep.equal([ [ 'A', 'B' ], [ 'A', 'C' ] ]);

    var [ a3, b2, c2 ] = await Promise.all([
      identityLoader.load('A'),
      identityLoader.load('B'),
      identityLoader.load('C')
    ]);

    expect(a3).to.equal('A');
    expect(b2).to.equal('B');
    expect(c2).to.equal('C');

    expect(loadCalls).to.deep.equal(
      [ [ 'A', 'B' ], [ 'A', 'C' ], [ 'A', 'B', 'C' ] ]
    );
  });

});

describe('It is resilient to job queue ordering', () => {

  it('batches loads occuring within promises', async () => {
    var loadCalls = [];
    var identityLoader = new DataLoader(keys => {
      loadCalls.push(keys);
      return Promise.resolve(keys);
    });

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

    expect(loadCalls).to.deep.equal([ [ 'A', 'B', 'C', 'D' ] ]);
  });

  it('can call a loader from a loader', async () => {
    var deepLoadCalls = [];
    var deepLoader = new DataLoader(keys => {
      deepLoadCalls.push(keys);
      return Promise.resolve(keys);
    });

    var aLoadCalls = [];
    var aLoader = new DataLoader(keys => {
      aLoadCalls.push(keys);
      return deepLoader.load(keys);
    });

    var bLoadCalls = [];
    var bLoader = new DataLoader(keys => {
      bLoadCalls.push(keys);
      return deepLoader.load(keys);
    });

    var [ a1, b1, a2, b2 ] = await Promise.all([
      aLoader.load('A1'),
      bLoader.load('B1'),
      aLoader.load('A2'),
      bLoader.load('B2')
    ]);

    expect(a1).to.equal('A1');
    expect(b1).to.equal('B1');
    expect(a2).to.equal('A2');
    expect(b2).to.equal('B2');

    expect(aLoadCalls).to.deep.equal([ [ 'A1', 'A2' ] ]);
    expect(bLoadCalls).to.deep.equal([ [ 'B1', 'B2' ] ]);
    expect(deepLoadCalls).to.deep.equal([ [ [ 'A1', 'A2' ], [ 'B1', 'B2' ] ] ]);
  });

});
