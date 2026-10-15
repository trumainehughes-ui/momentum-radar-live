import test from 'node:test';
import assert from 'node:assert/strict';
import {authorizedManualReview} from '../api/manual-ai-review.js';
test('manual AI review rejects missing secret',()=>assert.equal(authorizedManualReview({headers:{authorization:'Bearer x'}},''),false));
test('manual AI review rejects missing authorization',()=>assert.equal(authorizedManualReview({headers:{}},'secret'),false));
test('manual AI review accepts exact server bearer token',()=>assert.equal(authorizedManualReview({headers:{authorization:'Bearer secret'}},'secret'),true));
test('manual AI review rejects altered token',()=>assert.equal(authorizedManualReview({headers:{authorization:'Bearer secret1'}},'secret'),false));
