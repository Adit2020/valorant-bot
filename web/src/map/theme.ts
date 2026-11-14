// One place for every color and size the map uses.

export const THEME = {
  panel: '#0B0B0D',
  floor: '#17191E',
  floorSite: '#1C1F25',
  wall: '#2C313A',
  cover: '#2A2F38',
  coverEdge: '#3B424E',
  label: '#646B77',
  labelStrong: '#8A919D',
  plantZoneLine: 'rgba(255,77,77,0.8)',
  plantZoneFill: 'rgba(255,77,77,0.06)',

  atk: '#2EC4B6',
  atkDark: '#0E3B37',
  def: '#EF476F',
  defDark: '#4A1623',
  brim: '#FF8A3D',
  dead: '#3A3F47',
  deadMark: '#6B7280',
  ink: '#0B0D10',
  tag: '#C9CED6',

  spike: '#FF4D4D',
  plantRing: '#2EC4B6',
  defuseRing: '#5AA9FF',

  smoke: [205, 209, 217] as const,
  fireHot: '#FFE08A',
  fireMid: '#FF7A2E',
  flash: '#FFFFFF',

  font: '600 {s}px Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
};

export const SIZES = {
  agentRadius: 11,
  smokeRadius: 46,
  mollyRadius: 36,
  labelSize: 10.5,
  tagSize: 9.5,
};

export function font(size: number, weight = 600): string {
  return THEME.font.replace('600', String(weight)).replace('{s}', String(size));
}
