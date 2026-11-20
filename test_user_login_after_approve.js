const http = require('http');

// Login as approved user
const loginData = JSON.stringify({email:'user@test.com',password:'password123'});
const loginReq = http.request('http://localhost:5001/api/auth/login', {method:'POST', headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(loginData)}}, res => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => console.log('User Login:', res.statusCode, body));
});
loginReq.write(loginData);
loginReq.end();