import test from 'node:test';
import assert from 'node:assert/strict';
import { projectScenarios } from '../lib/ai-mechanics/scenarios.js';
test('weighted scenarios combine correctly', () => { const result = projectScenarios(100,[{weight:0.75,factor:1.1},{weight:0.25,factor:0.7}]); assert.ok(Math.abs(result.estimate-100)<1e-10); assert.equal(result.advisoryOnly,true); });
test('invalid scenario weights are rejected', () => assert.equal(projectScenarios(100,[{weight:0.8,factor:1}]),null));
test('invalid baselines are rejected', () => assert.equal(projectScenarios(-5,[{weight:1,factor:1}]),null));
