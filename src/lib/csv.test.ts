import {test} from "node:test";import assert from "node:assert/strict";import {parseCsv} from "./csv.ts";
test("CSV parser supports quoted commas and escaped quotes",()=>{assert.deepEqual(parseCsv('slug,name\na,"Club, A"\nb,"The ""Best"""'),[["slug","name"],["a","Club, A"],["b",'The "Best"']]);});
