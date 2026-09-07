# If D: corrupts something (again)

`D:` is a mechanical SMR HDD (`ST1000LM049`) and the Windows event log shows real
`Ntfs` / `volmgr` **errors**, not just warnings. Files on it have been corrupted
twice in one day — once losing app icons, once filling `botocore`'s data files
with garbage (correct file size, random bytes). `chkdsk` fixed it and it came
back within hours.

**Deliberate strategy: treat this drive as disposable.** Everything that matters
lives on GitHub (`github.com/TEFILLAH/tefillah`). Every corruption so far hit
only REGENERABLE artifacts — never git-tracked source.

## Symptoms

`UnicodeDecodeError: 'utf-8' codec can't decode byte 0x9c`, `OSError [WinError
1392] file or directory is corrupted`, or a package that imports but whose data
files are unreadable. A file with the right size and garbage contents is
corruption, not a bug — check with `head -c 8 <file> | xxd`.

## Recovery, in order of cost

1. **Is the source itself hurt?** Almost certainly not, but confirm:
   ```bash
   git fsck && git status --short
   ```
   If the object store is damaged, delete the whole tree and re-clone. Nothing
   is lost that was committed and pushed.

2. **Python venv** (`backend/.venv`) — regenerable:
   ```bash
   cd backend && python -m venv .venv
   ./.venv/Scripts/python.exe -m pip install -r requirements.txt
   ```
   For a single corrupt package, replacing just its data is faster than pip
   (pip itself failed mid-corruption once). Download the wheel and unzip the
   damaged subtree over the top — that is how `botocore/data/` (1919 files) was
   repaired on 2026-09-07.

3. **node_modules** — regenerable: `npm ci` in `frontend/` or `tefillah-web/`.

## What is NOT recoverable from git

Anything uncommitted. Check `git status` and **commit or stash** before walking
away — on this drive that is the whole safety net. (The three files this section
used to name — `Header.tsx`, `Logo.tsx`, `styles/globals.css` — were committed
and pushed on 2026-09-07.)

Also not in git (by design): `backend/.env` (real production credentials) and
`_eb_build/` (gitignored; `deploy-backend.sh` regenerates its contents from
`backend/` on every run, so only `firebase-credentials.json` and
`.ebextensions/` are irreplaceable there — back those up separately).

## Don't be fooled by the deploy gate

`deploy-backend.sh` imports the built bundle under BOTH `DB_BACKEND=mongo` and
`=dynamo` before uploading. When local corruption broke `botocore`, that gate
correctly **refused to deploy**. A gate failure is not always a code problem —
check whether the local environment is intact first, but never bypass the gate.
