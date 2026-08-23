import test from 'node:test';
import assert from 'node:assert/strict';
import { majorGenre, MAJOR_GENRES } from '../src/genres.js';

test('major genre wins over subgenre in the raw string', () => {
  assert.equal(majorGenre('Platforming, Metroidvania'), 'Platforming');
  assert.equal(majorGenre('Shooter, Run & Gun'), 'Shooter');
});

test('subgenres map onto their major genre', () => {
  assert.equal(majorGenre("Shoot 'Em Up"), 'Shooter');
  assert.equal(majorGenre('shoot-em-up'), 'Shooter');
  assert.equal(majorGenre('Roguelike'), 'Role-Playing Game');
  assert.equal(majorGenre('Action RPG'), 'Role-Playing Game');
  assert.equal(majorGenre('Metroidvania'), 'Action-Adventure');
  assert.equal(majorGenre('Fishing'), 'Simulation');
  assert.equal(majorGenre('Trivia'), 'Board and Card');
  assert.equal(majorGenre("Beat 'em Up"), 'Action');
});

test('RA\'s real vocabulary folds into the major genres', () => {
  assert.equal(majorGenre('2D Platforming'), 'Platforming');
  assert.equal(majorGenre('3D Platforming, Collect-a-thon'), 'Platforming');
  assert.equal(majorGenre('Turn-Based RPG'), 'Role-Playing Game');
  assert.equal(majorGenre('CRPG, Dungeon Crawl'), 'Role-Playing Game');
  assert.equal(majorGenre('2D Fighting'), 'Fighting');
  assert.equal(majorGenre('Platform Fighting'), 'Fighting');
  assert.equal(majorGenre('Sports - Football | Soccer'), 'Sports');
  assert.equal(majorGenre('Extreme Sports - Skateboarding'), 'Sports');
  assert.equal(majorGenre('Combat Flight Simulation'), 'Simulation');
  assert.equal(majorGenre('Point-and-Click Adventure'), 'Adventure');
  assert.equal(majorGenre('Falling Block Puzzle'), 'Puzzle');
  assert.equal(majorGenre('Vehicular Combat'), 'Racing');
  assert.equal(majorGenre('Tactical Shooter'), 'Shooter');
});

test('a compilation is classified by what it contains', () => {
  assert.equal(majorGenre('Compilation, Turn-Based RPG'), 'Role-Playing Game');
  assert.equal(majorGenre('Compilation'), 'Other');
});

test('unknown genres fall back to Other, empty ones to null', () => {
  assert.equal(majorGenre('Completely Made Up'), 'Other');
  assert.equal(majorGenre(''), null);
  assert.equal(majorGenre(null), null);
});

test('every result is one of the documented major genres', () => {
  for (const g of ['Action', 'Puzzle', 'Whatever', 'Rally, Racing']) {
    assert.ok(MAJOR_GENRES.includes(majorGenre(g)));
  }
});
