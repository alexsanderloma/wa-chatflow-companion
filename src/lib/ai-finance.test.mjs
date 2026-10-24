import {test} from 'node:test';
import assert from 'node:assert/strict';
import {financeTotals} from './ai-finance.ts';
test('missing usage and costs remain visibly unknown',()=>assert.deepEqual(financeTotals([{input_tokens:null,output_tokens:null,estimated_credits:null,confirmed_credits:null,status:'error'}]),{input:0,output:0,unknown:1,estimated:0,confirmed:0,unpriced:1,unconfirmed:1,failures:1}));