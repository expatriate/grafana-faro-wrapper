import { checkRenderInnerValue } from './checkRenderInnerValue';

test('passes only when every element is present and has text', () => {
  document.body.innerHTML = '<div class="tariff">Pro</div><div class="price"></div>';

  expect(checkRenderInnerValue(['.tariff'])).toBe(true);
  expect(checkRenderInnerValue('.tariff')).toBe(true);
  expect(checkRenderInnerValue(['.tariff', '.price'])).toBe(false);
  expect(checkRenderInnerValue(['.missing'])).toBe(false);
});

test('treats a template placeholder with only whitespace or a comment as empty', () => {
  document.body.innerHTML = '<div class="name">\n    </div><div class="price"><!-- --></div>';

  expect(checkRenderInnerValue('.name')).toBe(false);
  expect(checkRenderInnerValue('.price')).toBe(false);
});

test('does not count styles, scripts or invisible characters as text', () => {
  document.body.innerHTML = `
    <div class="style"><style>.a { color: red }</style></div>
    <div class="script"><script type="application/json">{"a":1}</script></div>
    <div class="zero-width">&#8203;&#65279;</div>
    <div class="text-with-style"><style>.a{}</style>Pro</div>`;

  expect(checkRenderInnerValue('.style')).toBe(false);
  expect(checkRenderInnerValue('.script')).toBe(false);
  expect(checkRenderInnerValue('.zero-width')).toBe(false);
  expect(checkRenderInnerValue('.text-with-style')).toBe(true);
});

function renderAs(element: Element, { text, rendered }: { text: string; rendered: boolean }) {
  Object.defineProperty(element, 'innerText', { value: text });
  element.getClientRects = () => (rendered ? [{}] : []) as unknown as DOMRectList;
}

test('relies on the text the browser renders, so hidden text does not count', () => {
  document.body.innerHTML = '<div class="price"><span style="display:none">9$</span></div>';
  renderAs(document.querySelector('.price')!, { text: '', rendered: true });

  expect(checkRenderInnerValue('.price')).toBe(false);
});

test('does not count a block that is hidden itself', () => {
  document.body.innerHTML = '<div class="price" hidden>9$</div>';
  renderAs(document.querySelector('.price')!, { text: '9$', rendered: false });

  expect(checkRenderInnerValue('.price')).toBe(false);
});

test('passes when any of the matching blocks shows text, as with desktop and mobile variants', () => {
  document.body.innerHTML = '<div class="price mobile"></div><div class="price desktop"></div>';
  const [mobile, desktop] = Array.from(document.querySelectorAll('.price'));
  renderAs(mobile, { text: '9$', rendered: false });
  renderAs(desktop, { text: '', rendered: true });
  expect(checkRenderInnerValue('.price')).toBe(false);

  document.body.innerHTML = '<div class="price mobile"></div><div class="price desktop"></div>';
  const [hiddenEmpty, visibleFilled] = Array.from(document.querySelectorAll('.price'));
  renderAs(hiddenEmpty, { text: '', rendered: false });
  renderAs(visibleFilled, { text: '9$', rendered: true });
  expect(checkRenderInnerValue('.price')).toBe(true);
});
