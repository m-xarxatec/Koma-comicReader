import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fillTemplate } from '../../utils/html.js';

test('Seguridad: fillTemplate escapa los valores inyectados en el HTML', () => {
  const html = fillTemplate('<meta content="{{requestId}}"><code>{{requestId}}</code>', {
    requestId: '"><script>alert(1)</script>&\'',
  });
  assert.equal(
    html,
    '<meta content="&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;&amp;&#39;"><code>&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;&amp;&#39;</code>',
  );
});

test('Seguridad: fillTemplate solo sustituye las claves que recibe', () => {
  assert.equal(fillTemplate('{{a}} {{b}} {{a}}', { a: 'x' }), 'x {{b}} x');
  assert.equal(fillTemplate('{{constructor}} {{toString}}', {}), '{{constructor}} {{toString}}');
});
