import 'fake-indexeddb/auto';
import { beforeEach } from 'vitest';
import { setIdGenerator } from '../../src/engine/rng';

// deterministic ids: the planner's tie-breaks depend on segment ids, so every test run is reproducible
beforeEach(() => {
  let n = 0;
  setIdGenerator((prefix) => `${prefix}-${(n++).toString(36).padStart(4, '0')}`);
});
