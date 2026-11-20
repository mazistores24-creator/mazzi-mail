const http = require('http');

// Login as admin first
const loginData = JSON.stringify({email:'admin@mazzi.mail',password:'admin123'});
const loginReq = http.request('http://localhost:5001/api/auth/login', {method:'POST', headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(loginData)}}, res => {
  let body = '';
  res.on('data', chunk => body += chunk);
  res.on('end', () => {
    console.log('Admin Login:', res.statusCode, body);
    const response = JSON.parse(body);
    const cookie = res.headers['set-cookie'];
    
    // Get users list
    const usersReq = http.request({hostname:'localhost', port:5001, path:'/api/admin/users', method:'GET', headers:{'Cookie': cookie}}, res2 => {
      let body2 = '';
      res2.on('data', chunk => body2 += chunk);
      res2.on('end', () => {
        console.log('Users:', res2.statusCode, body2);
        const users = JSON.parse(body2);
        const pendingUser = users.find(u => u.email === 'user@test.com');
        if (pendingUser) {
          // Approve user
          const approveReq = http.request({hostname:'localhost', port:5001, path:'/api/admin/users/' + pendingUser._id + '/approve', method:'POST', headers:{'Content-Type':'application/json','Cookie': cookie}}, res3 => {
            let body3 = '';
            res3.on('data', chunk => body3 += chunk);
            res3.on('end', () => console.log('Approve:', res3.statusCode, body3));
          });
          approveReq.end();
        }
      });
    });
    usersReq.end();
  });
});
loginReq.write(loginData);
loginReq.end();