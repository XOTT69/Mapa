import test from 'node:test';
import assert from 'node:assert';
import { parseLine, parseMessage } from '../lib/threats.js';

test('позиція + ціль + кількість', () => {
  const e = parseLine('🛵 Група 3 шахедів на Сумщині курсом на Конотоп');
  assert.equal(e.count, 3);
  assert.equal(e.at.name, 'Суми');
  assert.equal(e.target.name, 'Конотоп');
  assert.equal(e.confidence, 'high');
  assert.ok(e.heading > 180 && e.heading < 360);
});

test('звідки і куди', () => {
  const e = parseLine('5 шахедів з Чауди на Одещину');
  assert.equal(e.count, 5);
  assert.equal(e.origin.name, 'Чауда');
  assert.equal(e.target.name, 'Одеса');
});

test('над + курс на', () => {
  const e = parseLine('БпЛА над Харківщиною, курс на Полтаву');
  assert.equal(e.at.name, 'Харків');
  assert.equal(e.target.name, 'Полтава');
});

test('повз + у напрямку', () => {
  const e = parseLine('Шахеди повз Кременчук у напрямку Дніпра');
  assert.equal(e.at.name, 'Кременчук');
  assert.equal(e.target.name, 'Дніпро');
});

test('компас', () => {
  const e = parseLine('2х БпЛА на Київ з півночі');
  assert.equal(e.target.name, 'Київ');
  assert.equal(e.count, 2);
  assert.ok(e.heading > 150 && e.heading < 210);
});

test('відбій і не про дрони ігноруються', () => {
  assert.equal(parseLine('Відбій тривоги в Харкові, шахеди'), null);
  assert.equal(parseLine('Погода у Києві сонячна'), null);
});

test('багаторядкове повідомлення', () => {
  const r = parseMessage('🛵 3х шахеди на Чернігівщині курсом на Ніжин\n🛵 2х шахеди на Сумщині курсом на Конотоп', { source: 'x', msgId: 1, ts: 1 });
  assert.equal(r.length, 2);
});

import { parseChannelHtml } from '../lib/threats.js';

test('пересланні повідомлення та сумнівні тексти ігноруються', () => {
  const wrap = (inner) => `<div class="tgme_widget_message_wrap"><div data-post="c/1"></div>${inner}<div class="tgme_widget_message_text">3 шахеди на Київ</div><time datetime="2026-11-02T10:00:00Z"></time></div>`;
  assert.equal(parseChannelHtml(wrap('<a class="tgme_widget_message_forwarded_from_name">x</a>'), 'c').length, 0);
  assert.equal(parseChannelHtml(wrap(''), 'c').length, 1);
  assert.equal(parseLine('Нібито 3 шахеди на Київ'), null);
  assert.equal(parseLine('Чи летять шахеди на Київ?'), null);
});
