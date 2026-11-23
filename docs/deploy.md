# Deployment

LeeTKOB runs on one Ubuntu 24.04 VM with Docker. It must stay up until the PA#4 marks are out: another
team attacks it in PA#4. Decisions: `docs/decisions/pa3-architecture.md` §15.

```
 internet ──443──▶ Caddy (HTTPS) ──▶ 127.0.0.1:3000  leetkob-api   (user leetkob-api: no Docker, no key)
                                                         │  SQLite /var/lib/leetkob/leetkob.db (group leetkob)
                                      leetkob-worker  ◀──┘  (user leetkob-worker: docker group, the model key)
                                            │
                                            └─ docker run --network none --read-only … leetkob-judge   (per submission)
```

- The API and the worker are **systemd services on the host**, not containers, so no container is ever
  given the Docker socket. Judging containers get no mount, no network, no secret (`src/sandbox/runner.ts`).
- Only the worker's user is in the `docker` group, and only the worker's environment file holds the key.
  The API never calls the model and listens on 127.0.0.1 only; the firewall opens 22, 80 and 443.
- Being in the `docker` group is as strong as root on that machine. The worker is never reachable from the
  network and runs no code but ours; student code only ever runs inside the judging containers.

## 1. The VM

- Ubuntu 24.04, 1–2 vCPU, **2 GB RAM or more** (API + worker + g++ + a 256 MB container), ports 22, 80, 443.
- A domain pointing at its IP. Without one, use `<ip>.sslip.io` (for example `203.0.113.7.sslip.io`):
  it resolves to the IP and Caddy can get a certificate for it.

## 2. Install

On the VM:

```bash
curl -fsSLO https://raw.githubusercontent.com/Coofzz/leetkob/main/deploy/install.sh
less install.sh                                   # read it before running it as root
sudo bash install.sh <domain> main                # or a tag, e.g. pa3
```

The script prints a **warning** if `docker info` says "No swap limit support". Then `--memory-swap` is
ignored and a program can use swap beyond its memory limit (sandbox minimum #4). Fix it before going live:
add `swapaccount=1` (and on older kernels `cgroup_enable=memory`) to `GRUB_CMDLINE_LINUX` in
`/etc/default/grub`, run `sudo update-grub`, reboot, and check `docker info` again.

## 3. The model key

```bash
sudo nano /etc/leetkob/worker.env      # LLM_API_KEY=… and LLM_MODEL=…  (never commit this file)
sudo systemctl restart leetkob-worker
```

Without a key, set `MODEL_OFF=1` there instead: the hard rules still run and semantic constraints are
`unsure` in the TA's queue.

## 4. Accounts

Accounts and classes come from a JSON file (format: `docs/accounts.example.json`); labs are created by the
TAs through the site. Keep the file on the server, readable by root only:

```bash
sudo install -m 600 /dev/null /etc/leetkob/accounts.json
sudo nano /etc/leetkob/accounts.json
sudo cat /etc/leetkob/accounts.json | sudo -u leetkob-api \
  sh -c 'umask 007; cd /opt/leetkob && DATABASE_PATH=/var/lib/leetkob/leetkob.db node --import tsx scripts/accounts.ts /dev/stdin'
```

The test accounts listed in `PA3.md` are public: use them only for the test classes, never real data.

## 5. Check it

```bash
curl -s https://<domain>/health                          # {"ok":true}
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/health   # 200 on the VM
curl -s -m 5 http://<public ip>:3000/health || echo "3000 is closed from outside: good"
systemctl status leetkob-api leetkob-worker caddy
docker info | grep -i swap                               # no warning
sudo -u leetkob-worker docker ps                         # the worker may use Docker
sudo -u leetkob-api docker ps                            # the API may not: permission denied
```

Then, on the site: sign in as the TA, create a lab, sign in as a student, submit; the status goes
`queued` → `judging` → a verdict, and the TA's review queue shows the constraint verdicts. Submit the nine
attacks of `test/sandbox/attacks/` as a student: none may escape (CONNECTED, ROOT, LEAK… never appear),
and `docker ps -a` on the VM shows no leftover `job-` container.

You can also run the attack suite on the VM itself:
`cd /opt/leetkob && sudo -u leetkob-worker npm run test:sandbox`.

## Operations

| Task | Command |
|---|---|
| Logs | `journalctl -u leetkob-api -f`, `journalctl -u leetkob-worker -f` |
| Move to a commit or tag | `sudo bash /opt/leetkob/deploy/update.sh pa3` |
| Stop judging (submissions stay queued) | `sudo systemctl stop leetkob-worker` |
| Back up the database | `sudo sqlite3 /var/lib/leetkob/leetkob.db ".backup /root/leetkob-$(date +%F).db"` |
| Model call log on the server | `/var/lib/leetkob/calls.jsonl` (stays on the server; it holds de-identified code) |

Migrations run when a process opens the database; the API and the worker may start together, the second
waits for the first (`src/db.ts`, `test/unit/db.test.ts`).
