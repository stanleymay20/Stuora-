// Importer unit tests. The rows below are a hand-written FIXTURE in the official
// GeoNames column layout (19 tab-separated columns); they are not the live dump.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChunks, buildRows, fold } from './build-import.mjs';

const row = (...c) => c.join('\t');
export const FIXTURE_DE = [
  row(2950159, 'Berlin', 'Berlin', 'Berlin,Berlijn,Berlín,Берлин', '52.52437', '13.41053', 'P', 'PPLC', 'DE', '', '16', '00', '11000', '11000000', '3426354', '', '74', 'Europe/Berlin', '2024-01-01'),
  row(2852458, 'Potsdam', 'Potsdam', 'Potsdam,Поцдам', '52.39886', '13.06566', 'P', 'PPLA', 'DE', '', '11', '00', '12054', '12054000', '182112', '', '35', 'Europe/Berlin', '2024-01-01'),
  row(2945024, 'Brandenburg an der Havel', 'Brandenburg an der Havel', 'Brandenburg,Brandenburg/Havel', '52.41667', '12.55', 'P', 'PPLA3', 'DE', '', '11', '00', '12051', '12051000', '72040', '', '33', 'Europe/Berlin', '2024-01-01'),
  row(2911522, 'Halberstadt', 'Halberstadt', '', '51.89562', '11.05622', 'P', 'PPLA3', 'DE', '', '14', '15085', '15085', '15085135', '40440', '', '120', 'Europe/Berlin', '2024-01-01'),
  row(2867714, 'München', 'Muenchen', 'Monaco di Baviera,Munich,Munchen,Muenchen,Мюнхен', '48.13743', '11.57549', 'P', 'PPLA', 'DE', '', '02', '091', '09162', '09162000', '1260391', '', '524', 'Europe/Berlin', '2024-01-01'),
  row(2925533, 'Frankfurt am Main', 'Frankfurt am Main', 'Francfort,Frankfurt,Frankfurt/Main', '50.11552', '8.68417', 'P', 'PPLA2', 'DE', '', '05', '064', '06412', '06412000', '650000', '', '100', 'Europe/Berlin', '2024-01-01'),
  row(2925535, 'Frankfurt (Oder)', 'Frankfurt (Oder)', 'Frankfurt,Frankfurt an der Oder,Frankfurt/Oder', '52.34714', '14.55062', 'P', 'PPLA3', 'DE', '', '11', '00', '12053', '12053000', '58537', '', '30', 'Europe/Berlin', '2024-01-01'),
  row(2864435, 'Neustadt', 'Neustadt', '', '50.1', '10.9', 'P', 'PPL', 'DE', '', '02', '094', '09473', '', '1200', '', '300', 'Europe/Berlin', '2024-01-01'),
  row(2864436, 'Neustadt', 'Neustadt', '', '49.4', '11.6', 'P', 'PPL', 'DE', '', '02', '093', '09373', '', '900', '', '400', 'Europe/Berlin', '2024-01-01'),
  row(6545310, 'Mitte', 'Mitte', '', '52.52', '13.4', 'P', 'PPLX', 'DE', '', '16', '00', '11000', '11000000', '0', '', '40', 'Europe/Berlin', '2024-01-01'),
  row(2950158, 'Berlin', 'Berlin', '', '52.5', '13.4', 'A', 'ADM1', 'DE', '', '16', '', '', '', '3426354', '', '74', 'Europe/Berlin', '2024-01-01'),
].join('\n');
export const FIXTURE_ADMIN1 = ['DE.16\tLand Berlin\tLand Berlin\t2950157', 'DE.11\tBrandenburg\tBrandenburg\t2945356',
  'DE.14\tSaxony-Anhalt\tSaxony-Anhalt\t2842565', 'DE.02\tBavaria\tBavaria\t2951839', 'DE.05\tHesse\tHesse\t2905330'].join('\n');
export const FIXTURE_ADMIN2 = ['DE.11.00\tBrandenburg\tBrandenburg\t1', 'DE.14.15085\tLandkreis Harz\tLandkreis Harz\t2',
  'DE.02.091\tUpper Bavaria\tUpper Bavaria\t3', 'DE.05.064\tRegierungsbezirk Darmstadt\tRegierungsbezirk Darmstadt\t4',
  'DE.02.094\tUpper Franconia\tUpper Franconia\t5', 'DE.02.093\tUpper Palatinate\tUpper Palatinate\t6'].join('\n');

test('fold handles umlauts both ways, ß, accents and punctuation', () => {
  assert.equal(fold('München'), 'munchen');
  assert.equal(fold('München', true), 'muenchen');
  assert.equal(fold('Gießen'), 'giessen');
  assert.equal(fold('Frankfurt (Oder)'), 'frankfurt oder');
  assert.equal(fold('  Halle   (Saale) '), 'halle saale');
  assert.equal(fold('Düsseldorf', true), 'duesseldorf');
});

test('keeps populated places only, with regions, alternates and both folds', () => {
  const { places, names } = buildRows(FIXTURE_DE, FIXTURE_ADMIN1, FIXTURE_ADMIN2);
  assert.deepEqual(places.map(p => p.name).sort(), ['Berlin', 'Brandenburg an der Havel', 'Frankfurt (Oder)', 'Frankfurt am Main',
    'Halberstadt', 'München', 'Neustadt', 'Neustadt', 'Potsdam']);
  const munich = places.find(p => p.id === 2867714);
  assert.equal(munich.admin1, 'Bavaria');
  assert.equal(munich.admin2, 'Upper Bavaria');
  const keys = names.filter(n => n.id === 2867714).map(n => n.key);
  for (const k of ['munchen', 'muenchen', 'munich', 'monaco di baviera']) assert.ok(keys.includes(k), k);
  assert.ok(!keys.some(k => /[^a-z0-9 ]/.test(k)), 'Cyrillic alternates dropped');
  assert.equal(names.find(n => n.id === 2867714 && n.key === 'munchen').primary, true);
  assert.equal(names.find(n => n.id === 2867714 && n.key === 'munich').primary, false);
});

test('chunks are deterministic and escape quotes', () => {
  const { places, names } = buildRows(FIXTURE_DE.replace('Halberstadt\tHalberstadt', "Halber'stadt\tHalberstadt"), FIXTURE_ADMIN1, FIXTURE_ADMIN2);
  const a = buildChunks('geonames-de-test0001', places, names), b = buildChunks('geonames-de-test0001', places, names);
  assert.deepEqual(a, b);
  assert.ok(a.join('').includes("'Halber''stadt'"));
});
