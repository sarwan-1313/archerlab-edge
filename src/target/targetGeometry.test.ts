import { describe, expect, it } from 'vitest';
import { createTargetResult, scoreTargetCoordinate, screenPointToTargetCoordinates, targetRadius } from './targetGeometry';
describe('target geometry', () => {
  it('normalizes center and edges', () => { const bounds = { left: 10, top: 20, width: 200, height: 200 }; expect(screenPointToTargetCoordinates(110,120,bounds)).toEqual({x:0,y:0}); expect(screenPointToTargetCoordinates(210,220,bounds)).toEqual({x:1,y:1}); });
  it('updates drag coordinates through repeated pointer conversion', () => { const bounds = {left:0,top:0,width:100,height:100}; expect(screenPointToTargetCoordinates(75,25,bounds)).toEqual({x:.5,y:-.5}); });
  it('scores rings, X and misses', () => { expect(scoreTargetCoordinate(0,0)).toMatchObject({score:10,isX:true}); expect(scoreTargetCoordinate(.15,0)).toMatchObject({score:9,isX:false}); expect(scoreTargetCoordinate(1.1,0).score).toBe(0); expect(targetRadius(.3,.4)).toBe(.5); });
  it('creates a manual target result without overwriting another score', () => { const result = createTargetResult(.15,0,123); expect(result).toMatchObject({score:9,isX:false,source:'manual-target',enteredAt:123}); });
});
