import type { Vec } from '../map/types.js';
import type { Agent } from './agents.js';

export type CalloutDrill = 'sighting' | 'cover' | 'multiple';

// Agent lab fixtures change only initial conditions. Movement, vision and combat
// still run normally. An eight-second ceasefire gives a human time to inspect playback.
export function setupCalloutDrill(roster: Agent[], drill: CalloutDrill): Agent[] {
  const stage = (id: string, [x,y]: Vec, watch: Vec) => {
    const agent = roster.find(a => a.id === id)!;
    Object.assign(agent, { x, y, previous: [x,y], path: [], watch, facing: Math.PI / 2, nextShot: 160 });
    return agent;
  };
  if (drill === 'cover') return [
    stage('brim', [625,375], [625,275]), stage('jett', [625,275], [625,215]),
  ];
  const agents = [stage('brim', [655,264], [655,140]), stage('jett', [655,140], [655,105])];
  if (drill === 'multiple') agents.push(stage('kj', [660,165], [660,105]), stage('chamber', [655,215], [655,165]));
  return agents;
}
