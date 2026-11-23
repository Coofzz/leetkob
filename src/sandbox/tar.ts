// A minimal ustar writer: the runner hands files to the container on stdin, so nothing is mounted.
export interface TarFile {
  name: string; // at most 100 bytes, no directories
  data: Buffer;
  mode?: number;
}

const BLOCK = 512;

function header(name: string, size: number, mode: number): Buffer {
  const h = Buffer.alloc(BLOCK);
  const put = (value: string, offset: number, length: number) => h.write(value, offset, length, 'ascii');
  const octal = (n: number, length: number) => n.toString(8).padStart(length - 1, '0') + '\0';
  put(name, 0, 100);
  put(octal(mode, 8), 100, 8);
  put(octal(0, 8), 108, 8); // uid
  put(octal(0, 8), 116, 8); // gid
  put(octal(size, 12), 124, 12);
  put(octal(0, 12), 136, 12); // mtime
  put('        ', 148, 8); // checksum is computed with this field as spaces
  put('0', 156, 1); // regular file
  put('ustar\0', 257, 6);
  put('00', 263, 2);
  let sum = 0;
  for (const byte of h) sum += byte;
  put(sum.toString(8).padStart(6, '0') + '\0 ', 148, 8);
  return h;
}

export function tar(files: TarFile[]): Buffer {
  const parts: Buffer[] = [];
  for (const f of files) {
    if (Buffer.byteLength(f.name) > 100 || f.name.includes('/')) throw new Error(`bad tar name: ${f.name}`);
    parts.push(header(f.name, f.data.length, f.mode ?? 0o644), f.data);
    const pad = (BLOCK - (f.data.length % BLOCK)) % BLOCK;
    parts.push(Buffer.alloc(pad));
  }
  parts.push(Buffer.alloc(BLOCK * 2)); // end of archive
  return Buffer.concat(parts);
}
