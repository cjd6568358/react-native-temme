/**
 * Smoke test for lexbor native wrapper.
 * Verifies basic HTML parsing and CSS selector functionality.
 */
const { load } = require('../native/lexbor-native');

describe('lexbor smoke test', () => {
  test('basic HTML parsing and text extraction', () => {
    const $ = load('<div class="foo">hello</div>');
    try {
      const result = $('.foo');
      expect(result.length).toBe(1);
      expect(result.text()).toBe('hello');
    } finally {
      $.destroy();
    }
  });

  test('attribute extraction', () => {
    const $ = load('<div class="bar" data-id="123">content</div>');
    try {
      const result = $('div');
      expect(result.length).toBe(1);
      expect(result.attr('class')).toBe('bar');
      expect(result.attr('data-id')).toBe('123');
    } finally {
      $.destroy();
    }
  });

  test('nested selectors', () => {
    const $ = load('<div><span class="inner">world</span></div>');
    try {
      const result = $('.inner');
      expect(result.length).toBe(1);
      expect(result.text()).toBe('world');
    } finally {
      $.destroy();
    }
  });

  test('multiple elements', () => {
    const $ = load('<ul><li>one</li><li>two</li><li>three</li></ul>');
    try {
      const result = $('li');
      expect(result.length).toBe(3);
      expect(result.first().text()).toBe('one');
    } finally {
      $.destroy();
    }
  });

  test('no match returns empty list', () => {
    const $ = load('<div>hello</div>');
    try {
      const result = $('.nonexistent');
      expect(result.length).toBe(0);
      expect(result.text()).toBe('');
    } finally {
      $.destroy();
    }
  });

  test('complex HTML structure', () => {
    const $ = load(`
      <html>
        <head><title>Test Page</title></head>
        <body>
          <div id="content">
            <h1 class="title">Hello World</h1>
            <p class="description">This is a test</p>
          </div>
        </body>
      </html>
    `);
    try {
      expect($('h1.title').text()).toBe('Hello World');
      expect($('p.description').text()).toBe('This is a test');
    } finally {
      $.destroy();
    }
  });

  test('is() selector matching', () => {
    const $ = load('<div class="test">content</div>');
    try {
      const div = $('div');
      expect(div.is('.test')).toBe(true);
      expect(div.is('p')).toBe(false);
    } finally {
      $.destroy();
    }
  });

  test('html() serialization', () => {
    const $ = load('<div><b>bold</b></div>');
    try {
      const html = $('div').html();
      expect(html).toContain('<b>');
      expect(html).toContain('bold');
    } finally {
      $.destroy();
    }
  });
});
