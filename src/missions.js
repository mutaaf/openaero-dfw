// Mission catalogue. Approaches and takeoffs are defined by a real runway end (airports.js);
// tours keep explicit spawns. The <select> and mission loader are built from this table.
export const MISSIONS = [
  { key: 'kdfw_35c_final', label: 'KDFW RWY 35C (4 NM ILS Final)', kind: 'final', airport: 'KDFW', rwy: '35C', distNm: 4 },
  { key: 'kdfw_35c_flare', label: 'KDFW 35C Flare Challenge (1 NM)', kind: 'final', airport: 'KDFW', rwy: '35C', distNm: 1 },
  { key: 'kdfw_takeoff', label: 'KDFW RWY 35C (Takeoff Roll)', kind: 'takeoff', airport: 'KDFW', rwy: '35C' },
  { key: 'kdfw_17c_final', label: 'KDFW RWY 17C (South Flow 4 NM)', kind: 'final', airport: 'KDFW', rwy: '17C', distNm: 4 },
  { key: 'kdfw_36l_final', label: 'KDFW RWY 36L (West Side 6 NM)', kind: 'final', airport: 'KDFW', rwy: '36L', distNm: 6 },
  { key: 'kdfw_13r_final', label: 'KDFW RWY 13R (Diagonal 5 NM)', kind: 'final', airport: 'KDFW', rwy: '13R', distNm: 5 },
  { key: 'kdal_31r_final', label: 'KDAL Love Field 31R Final', kind: 'final', airport: 'KDAL', rwy: '31R', distNm: 4 },
  { key: 'kdal_13l_final', label: 'KDAL Love Field 13L (Over Downtown)', kind: 'final', airport: 'KDAL', rwy: '13L', distNm: 5 },
  { key: 'kads_16_final', label: 'KADS Addison 16 (Short Field)', kind: 'final', airport: 'KADS', rwy: '16', distNm: 3 },
  { key: 'kafw_34l_final', label: 'KAFW Alliance 34L', kind: 'final', airport: 'KAFW', rwy: '34L', distNm: 5 },
  { key: 'kftw_16_final', label: 'KFTW Meacham 16', kind: 'final', airport: 'KFTW', rwy: '16', distNm: 4 },
  { key: 'kgky_34_final', label: 'KGKY Arlington 34', kind: 'final', airport: 'KGKY', rwy: '34', distNm: 3 },
  { key: 'downtown_skyline', label: 'Downtown Dallas Skyline Tour', kind: 'tour', pos: [17600, 520, 13000], speedMps: 108, hdg: 0, throttle: 0.65 },
  { key: 'att_stadium', label: 'Arlington AT&T Stadium', kind: 'tour', pos: [-2400, 480, 12500], speedMps: 100, hdg: 0, throttle: 0.62 },
];

export const missionByKey = (key) => MISSIONS.find((m) => m.key === key) || MISSIONS[0];
