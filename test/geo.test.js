import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const read=path=>JSON.parse(readFileSync(new URL('../public/'+path,import.meta.url),'utf8'));
const oblasts=read('ukraine-oblasts.geojson');
const raions=read('ukraine-raions.geojson');
test('25 oblast polygons and 136 district polygons are bundled',()=>{
 assert.equal(oblasts.features.length,25);
 assert.equal(raions.features.length,136);
 assert.equal(oblasts.type,'FeatureCollection');
 assert.equal(raions.type,'FeatureCollection');
});
test('every district has a recognized parent oblast',()=>{
 const names=new Set(oblasts.features.map(x=>x.properties.name));
 for(const feature of raions.features){
  assert.ok(names.has(feature.properties.oblast),'Unknown parent for '+feature.properties.name);
  assert.ok(feature.properties.name.endsWith('район'),'Invalid district label');
 }
});
test('all geometry coordinates are within Ukrainian geographic bounds',()=>{
 for(const dataset of [oblasts,raions]){
  for(const feature of dataset.features){
   assert.equal(feature.geometry.type,'MultiPolygon');
   for(const polygon of feature.geometry.coordinates){
    for(const ring of polygon){
     assert.ok(ring.length>=4,'Invalid polygon '+feature.properties.name);
     for(const point of ring){
      assert.ok(Number.isFinite(point[0])&&point[0]>=20&&point[0]<=44,'Invalid longitude');
      assert.ok(Number.isFinite(point[1])&&point[1]>=43&&point[1]<=54,'Invalid latitude');
     }
    }
   }
  }
 }
});
test('PWA manifest and icon references exist',()=>{
 const manifest=read('manifest.webmanifest');
 assert.equal(manifest.display,'standalone');
 for(const icon of manifest.icons||[]){
  assert.ok(existsSync(new URL('../public/'+icon.src.replace(/^\//,''),import.meta.url)));
 }
});
test('app includes known core UI elements',()=>{
 const html=readFileSync(new URL('../public/index.html',import.meta.url),'utf8');
 for(const id of ['map','drawer','mode-oblast','mode-raion','details','notice-toggle','source-status','compact-events','notice-list','alert-list','region-list']){
  assert.ok(html.includes('id="'+id+'"'),'Missing HTML control '+id);
 }
});
