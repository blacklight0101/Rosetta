import { languagePackContract } from '../../../../contracts/language-pack.contract.js';
import { TestLanguagePack } from '../../../../support/test-language-pack.js';

languagePackContract('TestLanguagePack', () => Promise.resolve(new TestLanguagePack()), {
  path: 'a.tst',
  text: 'type Order\nfn total\nuses b.tst\n',
});
