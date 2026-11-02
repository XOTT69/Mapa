import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const parse=name=>JSON.parse(readFileSync(new URL('../public/'+name,import.meta.url),'utf8'));
test('all 25 oblast polygons are bundled',()=>{
 const regions=parse('ukraine-oblasts.geojson');
 assert.equal(regions.type,'FeatureCollection');
 assert.equal(regions.features.length,25);
 assert.ok(regions.features.every(x=>x.geometry.type==='MultiPolygon'&&x.properties.name));
});
test('136 raions have valid named parent oblasts',()=>{
 const oblasts=parse('ukraine-oblasts.geojson');
 const raions=parse('ukraine-raions.geojson');
 const parents=new Set(oblasts.features.map(x=>x.properties.name));
 assert.equal(raions.features.length,136);
 for(const r of raions.features){
  assert.ok(r.properties.name.endsWith(' район'),r.properties.name);
  assert.ok(parents.has(r.properties.oblast),r.properties.name);
  assert.equal(r.geometry.type,'MultiPolygon');
  for(const poly of r.geometry.coordinates)for(const ring of poly){
   assert.ok(ring.length>=4,r.properties.name);
   assert.deepEqual(ring[0],ring[ring.length-1]);
  }
 }
});
