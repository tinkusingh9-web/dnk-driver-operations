const fs = require('fs');
let text = fs.readFileSync('src/types.ts', 'utf8');

const typesToUpdate = [
  'DriverMaster',
  'TripAssignment',
  'LoadingConfirmation',
  'Consignment',
  'PartyMaster',
  'RouteMaster',
  'VehicleMaster'
];

typesToUpdate.forEach(t => {
  const regex = new RegExp(`(export interface ${t} \\{[\\s\\S]*?\\n)(\\})`);
  text = text.replace(regex, (m, p1, p2) => {
    if (p1.includes('recordStatus?:')) return m;
    return p1 + "  recordStatus?: 'Active' | 'Inactive';\n" + p2;
  });
});

fs.writeFileSync('src/types.ts', text);
console.log('types.ts updated');
