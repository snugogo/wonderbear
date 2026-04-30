import OSS from 'ali-oss';
import 'dotenv/config';

const client = new OSS({
  region: process.env.OSS_REGION,
  accessKeyId: process.env.OSS_ACCESS_KEY_ID,
  accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET,
  bucket: process.env.OSS_BUCKET,
  endpoint: process.env.OSS_ENDPOINT_ACCELERATE,
  secure: true,
});

const buf = Buffer.from('test audio bytes');
const key = `asr/test/${Date.now()}.txt`;
console.log('uploading...');
const result = await client.put(key, buf);
console.log('uploaded, oss-sdk url:', result.url);

const standardUrl = `https://${process.env.OSS_BUCKET}.${process.env.OSS_ENDPOINT_STANDARD}/${key}`;
console.log('standard url for DashScope:', standardUrl);

// 验证 DashScope 视角能拉到这个 URL
const resp = await fetch(standardUrl);
console.log('fetch status:', resp.status);

await client.delete(key);
console.log('cleaned up');
