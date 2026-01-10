const http = require('http');
const { app } = require('../index'); // Only import app

jest.setTimeout(5000); // Very short timeout

let server;
let baseUrl;

const httpGet = (path) => new Promise((resolve, reject) => {
  const req = http.get(`${baseUrl}${path}`, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      resolve({ status: res.statusCode, text: data });
    });
  });
  req.on('error', reject);
});

describe('Hyper Minimal Test Suite', () => {
  beforeAll((done) => {
    server = http.createServer(app);
    server.listen(0, () => {
      const address = server.address();
      baseUrl = `http://127.0.0.1:${address.port}`;
      done();
    });
  });

  afterAll((done) => {
    if (!server) return done();
    server.close(done);
  });

  describe('GET /ping', () => {
    it('should return 200 and pong', async () => {
      const response = await httpGet('/ping');
      expect(response.status).toBe(200);
      expect(response.text).toBe('pong');
    });
  });

  describe('GET /sessions (hyper-minimal)', () => {
    it('should return 200 and an empty array', async () => {
        const response = await httpGet('/sessions');
        expect(response.status).toBe(200);
        expect(JSON.parse(response.text)).toEqual([]);
      });
  });
});

// afterAll is not strictly necessary for this hyper-minimal test if it exits cleanly
// afterAll(done => {
//   done();
// });
