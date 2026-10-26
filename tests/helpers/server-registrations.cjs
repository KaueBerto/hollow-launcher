function registrations(servers) {
  const text = value => { const data=Buffer.from(value);const size=Buffer.alloc(2);size.writeUInt16BE(data.length);return Buffer.concat([size,data]); };
  const count=Buffer.alloc(4);count.writeInt32BE(servers.length);
  return Buffer.concat([Buffer.from([10,0,0,9]),text('servers'),Buffer.from([10]),count,...servers.map(s=>Buffer.concat([Buffer.from([8]),text('name'),text(s.name),Buffer.from([8]),text('ip'),text(s.ip),Buffer.from([0])])),Buffer.from([0])]);
}
module.exports={registrations};
