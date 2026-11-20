const http = require('http');

// Register new user
const regData = JSON.stringify({email:'user@test.com',password:'password123',name:'Test User'});
const regReq = http.request('http://localhost:5001/api/auth/register', {method:'POST', headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(regData)}}, res => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('Register:', res.statusCode, body);
    // Try login
    const loginData = JSON.stringify({email:'user@test.com',password:'password123'});
    const loginReq = http.request('http://localhost:5001/api/auth/login', {method:'POST', headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(loginData)}}, res2 => {
      let body2 = '';
      res2.on('data', chunk => body2 += chunk);
      res2.on('end', () => console.log('Login:', res2.statusCode, body2));
    });
    loginReq.write(loginData);
    loginReq.end();
  });
});
regReq.write(regData);
regReq.end();