'use strict';

document.getElementById('login').addEventListener('submit', async (e) => {
  e.preventDefault();
  const res = await Lk.api('POST', '/auth/login', {
    username: document.getElementById('username').value,
    password: document.getElementById('password').value,
  });
  if (!res.ok) return Lk.showError('message', res);
  sessionStorage.setItem('token', res.body.token);
  sessionStorage.setItem('user', JSON.stringify(res.body.user));
  location.href = res.body.user.role === 'student' ? '/student.html' : '/ta.html';
});
