import { api } from '../src/main.js';

const result = api.selfCheck();
console.log(JSON.stringify(result));
if (!result || result.ok !== true) process.exit(1);
